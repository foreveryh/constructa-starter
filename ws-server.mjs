#!/usr/bin/env node
/**
 * WebSocket Server for Claude Agent Chat
 *
 * This is a standalone WebSocket server that runs alongside the main Nitro server.
 * For production use with Docker, run this as a sidecar or use the combined startup script.
 *
 * Environment variables:
 * - WS_PORT: WebSocket server port (default: 3001)
 * - APP_URL: Main application URL for auth (default: http://localhost:5000)
 * - CLAUDE_SESSIONS_ROOT: Root directory for user sessions (default: /data/users)
 */

import http from 'node:http';
import crypto from 'node:crypto';
import { mkdir, readFile, readdir, access, symlink, unlink, lstat } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';

// Get directory of current module
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = path.join(__dirname, 'ws-query-worker.mjs');

// Configuration
const WS_PORT = parseInt(process.env.WS_PORT || '3001', 10);
const APP_URL = process.env.APP_URL || 'http://localhost:5000';
const SESSIONS_ROOT = process.env.CLAUDE_SESSIONS_ROOT || '/data/users';

const config = {
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.ANTHROPIC_BASE_URL,
  model: process.env.ANTHROPIC_MODEL,
  cwd: process.cwd(),
};

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  console.error('[WS Server] UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[WS Server] UNHANDLED REJECTION:', reason);
});

const HEARTBEAT_INTERVAL_MS = 30 * 1000;

// Track initialized directories
const initializedDirs = new Set();

// Map workspace sessionId to SDK sessionId for resume
// Structure: { workspaceSessionId: sdkSessionId }
const sessionMapping = new Map();

/**
 * Persist session to database via API
 * @param {string} cookie - User's auth cookie
 * @param {string} workspaceSessionId - Our workspace session ID (used as sdkSessionId in DB)
 * @param {string} realSdkSessionId - The actual SDK's session ID
 * @param {string} claudeHomePath - Path to CLAUDE_HOME
 * @param {string} [title] - Optional session title (extracted from first user message)
 */
async function persistSession(cookie, workspaceSessionId, realSdkSessionId, claudeHomePath, title) {
  try {
    const response = await fetch(`${APP_URL}/api/agent-sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie,
      },
      body: JSON.stringify({
        sdkSessionId: workspaceSessionId,
        claudeHomePath,
        realSdkSessionId,
        // Use first user message as title (truncated to 50 chars)
        ...(title && { title }),
      }),
    });

    if (!response.ok) {
      console.error('[WS Server] Failed to persist session:', response.status, await response.text());
      return;
    }

    const result = await response.json();
    console.log(`[WS Server] Session persisted: ${result.id} (created: ${result.created})`);
  } catch (error) {
    console.error('[WS Server] Error persisting session:', error);
  }
}

/**
 * Load session data from database
 * Returns full session info including realSdkSessionId and claudeHomePath
 */
async function loadSessionFromDb(cookie, workspaceSessionId) {
  try {
    const response = await fetch(`${APP_URL}/api/agent-sessions/by-sdk-id/${workspaceSessionId}`, {
      headers: { cookie },
    });

    if (!response.ok) {
      console.log(`[WS Server] Session not found in DB: ${workspaceSessionId}`);
      return null;
    }

    const data = await response.json();
    console.log(`[WS Server] Loaded session from DB: realSdkSessionId=${data.realSdkSessionId}, claudeHomePath=${data.claudeHomePath}`);
    return data;
  } catch (error) {
    console.error('[WS Server] Error loading session from DB:', error);
    return null;
  }
}

/**
 * Locate session JSONL file across project directories
 * JSONL files are stored at: CLAUDE_HOME/.claude/projects/{project}/{sessionId}.jsonl
 */
async function locateSessionFile(claudeHome, sessionId) {
  const projectsRoot = path.join(claudeHome, '.claude', 'projects');

  try {
    await access(projectsRoot);
  } catch {
    console.log(`[WS Server] Projects root not found: ${projectsRoot}`);
    return null;
  }

  try {
    const entries = await readdir(projectsRoot, { withFileTypes: true });
    const projectDirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => path.join(projectsRoot, e.name));

    for (const projectDir of projectDirs) {
      const sessionPath = path.join(projectDir, `${sessionId}.jsonl`);
      try {
        await access(sessionPath);
        return sessionPath;
      } catch {
        // Continue to next project directory
      }
    }
  } catch (error) {
    console.error('[WS Server] Error scanning project directories:', error);
  }

  return null;
}

/**
 * Parse JSONL content into SDK messages
 * Normalizes sessionId to session_id and filters invalid entries
 */
function parseJsonlContent(content) {
  if (!content) return [];

  const lines = content.split(/\r?\n/);
  const messages = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    try {
      const parsed = JSON.parse(trimmed);

      // Skip summary type messages
      if (parsed.type?.toLowerCase() === 'summary') continue;

      // Must have message field
      if (!parsed.message) continue;

      // Normalize sessionId to session_id
      const normalized = { ...parsed };
      if ('sessionId' in normalized) {
        normalized.session_id = normalized.sessionId;
        delete normalized.sessionId;
      }

      messages.push(normalized);
    } catch {
      // Skip malformed JSON lines
      continue;
    }
  }

  return messages;
}

/**
 * Load messages for a session from JSONL file
 * @param {string} claudeHome - Path to CLAUDE_HOME for this user
 * @param {string} sessionId - SDK session ID to load messages for
 * @returns {Promise<Array>} Array of SDK messages
 */
async function loadMessages(claudeHome, sessionId) {
  if (!sessionId) {
    return [];
  }

  const filePath = await locateSessionFile(claudeHome, sessionId);
  if (!filePath) {
    console.log(`[WS Server] Session file not found for: ${sessionId}`);
    return [];
  }

  try {
    console.log(`[WS Server] Loading messages from: ${filePath}`);
    const content = await readFile(filePath, 'utf8');
    const messages = parseJsonlContent(content);
    console.log(`[WS Server] Loaded ${messages.length} messages for session: ${sessionId}`);
    return messages;
  } catch (error) {
    console.error(`[WS Server] Failed to read session file: ${filePath}`, error);
    return [];
  }
}

/**
 * Generate a unique session ID
 */
function generateSessionId() {
  return crypto.randomUUID();
}

/**
 * Sanitize userId/sessionId to prevent path traversal attacks
 */
function sanitizeId(id) {
  return id.replace(/[\/\\\.]+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Get user-specific CLAUDE_HOME path
 */
function getClaudeHome(userId) {
  const safeUserId = sanitizeId(userId);
  return path.join(SESSIONS_ROOT, safeUserId);
}

/**
 * Get session-specific workspace path
 * Structure: /data/users/{userId}/sessions/{sessionId}/workspace/
 */
function getSessionWorkspace(userId, sessionId) {
  const safeUserId = sanitizeId(userId);
  const safeSessionId = sanitizeId(sessionId);
  return path.join(SESSIONS_ROOT, safeUserId, 'sessions', safeSessionId, 'workspace');
}

/**
 * Ensure directory exists
 */
async function ensureDirExists(dirPath) {
  if (initializedDirs.has(dirPath)) {
    return;
  }

  try {
    await mkdir(dirPath, { recursive: true });
    initializedDirs.add(dirPath);
    console.log(`[WS Server] Created directory: ${dirPath}`);
  } catch (error) {
    console.error(`[WS Server] Failed to create directory:`, error);
    throw error;
  }
}

/**
 * Ensure .claude symlink exists in workspace pointing to user's .claude directory
 * This allows SDK to find skills/settings in the user's directory while working in session workspace
 */
async function ensureClaudeSymlink(workspacePath, claudeHome) {
  const symlinkPath = path.join(workspacePath, '.claude');
  const targetPath = path.join(claudeHome, '.claude');

  try {
    // Check if symlink already exists
    const stats = await lstat(symlinkPath);

    if (stats.isSymbolicLink()) {
      // Symlink exists, verify it points to correct target
      console.log(`[WS Server] .claude symlink already exists in workspace`);
      return;
    } else {
      // Path exists but is not a symlink, remove it
      console.log(`[WS Server] .claude exists but is not a symlink, removing...`);
      await unlink(symlinkPath);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(`[WS Server] Error checking .claude symlink:`, error);
      throw error;
    }
    // ENOENT is expected if symlink doesn't exist yet
  }

  // Create the symlink
  try {
    await symlink(targetPath, symlinkPath, 'dir');
    console.log(`[WS Server] Created .claude symlink: ${symlinkPath} -> ${targetPath}`);
  } catch (error) {
    console.error(`[WS Server] Failed to create .claude symlink:`, error);
    throw error;
  }
}

/**
 * Verify that skills are accessible through the .claude symlink
 * This health check ensures SDK can actually load skills from the workspace
 */
async function verifySkillsAccess(workspacePath) {
  const skillsPath = path.join(workspacePath, '.claude', 'skills');

  try {
    // Check if skills directory is accessible
    await access(skillsPath);

    // Try to read skills directory
    const skillDirs = await readdir(skillsPath, { withFileTypes: true });
    const skills = skillDirs.filter(entry => entry.isDirectory()).map(entry => entry.name);

    if (skills.length > 0) {
      console.log(`[WS Server] ✓ Skills accessible: ${skills.length} skills found [${skills.join(', ')}]`);
    } else {
      console.log(`[WS Server] ⚠ Skills directory accessible but empty`);
    }

    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn(`[WS Server] ⚠ Skills directory not found: ${skillsPath}`);
    } else {
      console.error(`[WS Server] ✗ Skills not accessible:`, error.message);
    }
    return false;
  }
}

/**
 * Authenticate request using session cookie
 */
async function authenticateRequest(request) {
  try {
    const cookie = request.headers.cookie || '';
    const response = await fetch(`${APP_URL}/api/auth/get-session`, {
      headers: { cookie },
    });

    if (!response.ok) return null;

    const data = await response.json();
    console.log('[WS Server] Auth response:', JSON.stringify({ userId: data?.user?.id, email: data?.user?.email }));
    if (!data?.user?.id) return null;

    return { id: data.user.id };
  } catch (error) {
    console.error('[WS Server] Auth error:', error);
    return null;
  }
}

/**
 * Send message to WebSocket
 */
function sendMessage(ws, msg) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

/**
 * Handle chat message using child process for user and session isolation
 */
async function handleChat(ws, prompt, resumeSessionId) {
  // Kill any existing worker for this connection
  if (ws.workerProcess) {
    ws.workerProcess.kill();
    ws.workerProcess = null;
  }

  try {
    // Get or generate workspace session ID
    const workspaceSessionId = resumeSessionId || generateSessionId();

    // Look up SDK session ID for resume (if this is a continuation)
    const sdkResumeId = resumeSessionId ? sessionMapping.get(resumeSessionId) : null;

    // Get user-specific CLAUDE_HOME (for SDK session storage)
    const claudeHome = getClaudeHome(ws.userId);
    await ensureDirExists(claudeHome);

    // Get session-specific workspace (for Agent file operations)
    const workspacePath = getSessionWorkspace(ws.userId, workspaceSessionId);
    await ensureDirExists(workspacePath);

    // Create .claude symlink in workspace pointing to user's .claude directory
    // This allows SDK to find skills/settings while working in session workspace
    await ensureClaudeSymlink(workspacePath, claudeHome);

    // Verify skills are accessible through the symlink
    await verifySkillsAccess(workspacePath);

    console.log(`[WS Server] User ${ws.userId} Session ${workspaceSessionId}`);
    console.log(`[WS Server]   CLAUDE_HOME: ${claudeHome}`);
    console.log(`[WS Server]   Workspace: ${workspacePath}`);
    if (sdkResumeId) {
      console.log(`[WS Server]   SDK Resume ID: ${sdkResumeId}`);
    }

    // Build environment for worker process
    const workerEnv = { ...process.env };
    // Set both CLAUDE_HOME and HOME - SDK might use either
    workerEnv.CLAUDE_HOME = claudeHome;
    workerEnv.HOME = claudeHome;  // Override HOME so os.homedir() returns user dir
    workerEnv.WORKER_CWD = workspacePath;  // Per-Session workspace
    if (config.apiKey) workerEnv.ANTHROPIC_API_KEY = config.apiKey;
    if (config.baseURL) {
      workerEnv.ANTHROPIC_BASE_URL = config.baseURL;
      workerEnv.ANTHROPIC_API_URL = config.baseURL;
    }
    if (config.model) workerEnv.ANTHROPIC_MODEL = config.model;

    // Spawn worker process with user-specific CLAUDE_HOME
    const worker = spawn('node', [WORKER_PATH], {
      env: workerEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    ws.workerProcess = worker;

    // Send query request to worker
    // Pass sdkResumeId for SDK conversation resume
    const request = JSON.stringify({ prompt, sdkResumeId });
    worker.stdin.write(request);
    worker.stdin.end();

    // Track our workspace session ID and first prompt (for title generation)
    ws.workspaceSessionId = workspaceSessionId;
    // Only set sessionTitle for new sessions (not resume)
    const sessionTitle = resumeSessionId ? null : prompt.slice(0, 50).trim();

    // Read responses line by line
    const rl = createInterface({ input: worker.stdout });

    // Handle readline errors (e.g., when worker is killed abruptly)
    rl.on('error', (error) => {
      console.log('[WS Server] Readline error (expected on abort):', error.message);
    });

    rl.on('close', () => {
      // Readline closed, worker output ended
    });

    rl.on('line', (line) => {
      try {
        const msg = JSON.parse(line);

        if (msg.type === 'event') {
          const event = msg.event;
          if (event.type === 'system' && event.subtype === 'init' && event.session_id) {
            // Store SDK's session_id for future resume
            ws.sdkSessionId = event.session_id;
            // Store mapping: workspaceSessionId -> sdkSessionId
            sessionMapping.set(ws.workspaceSessionId, event.session_id);
            console.log(`[WS Server] Session mapping: ${ws.workspaceSessionId} -> ${event.session_id}`);

            // Persist session to database (use workspaceSessionId as the identifier)
            // Pass sessionTitle only for new sessions (extracted from first user message)
            persistSession(ws.cookie, ws.workspaceSessionId, event.session_id, claudeHome, sessionTitle);

            // Send our workspace sessionId to client (they'll use this for resume)
            sendMessage(ws, {
              type: 'session_init',
              sessionId: ws.workspaceSessionId,
              sdkSessionId: event.session_id,
              userId: ws.userId,  // Include userId for Skills isolation
            });
          }
          sendMessage(ws, { type: 'message', event });
        } else if (msg.type === 'done') {
          sendMessage(ws, { type: 'done' });
        } else if (msg.type === 'error') {
          sendMessage(ws, {
            type: 'error',
            code: 'worker_error',
            message: msg.message,
            retriable: true,
          });
        }
      } catch (parseError) {
        console.error('[WS Server] Worker output parse error:', parseError);
      }
    });

    // Handle stdout errors (e.g., when worker is killed)
    worker.stdout.on('error', (error) => {
      console.log('[WS Server] Worker stdout error (expected on abort):', error.message);
    });

    // Log worker stderr
    worker.stderr.on('data', (data) => {
      console.log(`[Worker ${ws.userId}]`, data.toString().trim());
    });

    worker.stderr.on('error', (error) => {
      console.log('[WS Server] Worker stderr error:', error.message);
    });

    // Handle worker exit
    worker.on('close', (code, signal) => {
      if (signal) {
        // Killed by signal (e.g., abort) - this is expected
        console.log(`[WS Server] Worker killed by signal ${signal}`);
      } else if (code !== 0 && code !== null) {
        console.error(`[WS Server] Worker exited with code ${code}`);
      }
      ws.workerProcess = null;
    });

    worker.on('error', (error) => {
      console.error('[WS Server] Worker error:', error);
      sendMessage(ws, {
        type: 'error',
        code: 'worker_spawn_error',
        message: error.message,
        retriable: true,
      });
    });

  } catch (error) {
    console.error('[WS Server] Chat error:', error);
    sendMessage(ws, {
      type: 'error',
      code: 'server_error',
      message: error instanceof Error ? error.message : String(error),
      retriable: true,
    });
  }
}

/**
 * Handle incoming WebSocket message
 */
async function handleMessage(ws, msg) {
  console.log(`[WS Server] Received message from ${ws.userId}:`, msg.toString().substring(0, 200));
  const message = JSON.parse(msg);
  console.log(`[WS Server] Parsed message type: ${message.type}`);

  switch (message.type) {
    case 'chat':
      console.log(`[WS Server] Processing chat from ${ws.userId}, content length: ${message.content?.length || 0}`);
      if (!message.content) {
        sendMessage(ws, {
          type: 'error',
          code: 'invalid_message',
          message: 'Missing content',
          retriable: false,
        });
        return;
      }
      await handleChat(ws, message.content, message.sessionId);
      break;

    case 'resume':
      // Resume a previous session
      if (!message.sessionId) {
        sendMessage(ws, {
          type: 'error',
          code: 'invalid_message',
          message: 'Missing sessionId for resume',
          retriable: false,
        });
        return;
      }
      // Store the workspace session ID for future chats
      ws.workspaceSessionId = message.sessionId;

      // Load session data from database (includes realSdkSessionId and claudeHomePath)
      let sessionData = null;
      let resumeSdkSessionId = sessionMapping.get(message.sessionId);

      if (ws.cookie) {
        sessionData = await loadSessionFromDb(ws.cookie, message.sessionId);
        if (sessionData) {
          if (sessionData.realSdkSessionId) {
            resumeSdkSessionId = sessionData.realSdkSessionId;
            // Cache it in memory for future use
            sessionMapping.set(message.sessionId, resumeSdkSessionId);
          }
        }
      }

      console.log(`[WS Server] Resuming session: ${message.sessionId} -> SDK: ${resumeSdkSessionId || 'not found'}`);

      // Send confirmation back to client
      sendMessage(ws, {
        type: 'session_init',
        sessionId: message.sessionId,
        sdkSessionId: resumeSdkSessionId || null,
        userId: ws.userId,  // Include userId for Skills isolation
      });

      // Load and send historical messages if we have session data
      if (resumeSdkSessionId && sessionData?.claudeHomePath) {
        const messages = await loadMessages(sessionData.claudeHomePath, resumeSdkSessionId);
        if (messages.length > 0) {
          console.log(`[WS Server] Sending ${messages.length} historical messages to client`);
          sendMessage(ws, {
            type: 'messages_loaded',
            messages,
          });
        }
      }
      break;

    case 'abort':
      ws.abortController?.abort('user_interrupt');
      // Gracefully terminate worker process if running
      if (ws.workerProcess) {
        const worker = ws.workerProcess;
        console.log('[WS Server] Aborting worker process');

        // Send SIGTERM first (graceful shutdown)
        worker.kill('SIGTERM');

        // Set up a timeout to force kill if worker doesn't exit
        const forceKillTimeout = setTimeout(() => {
          if (ws.workerProcess === worker) {
            console.log('[WS Server] Force killing unresponsive worker');
            worker.kill('SIGKILL');
          }
        }, 2000);

        // Clear the timeout when worker exits
        worker.once('close', () => {
          clearTimeout(forceKillTimeout);
          // Notify client that abort completed
          sendMessage(ws, { type: 'aborted' });
        });
      } else {
        // No worker to abort, just acknowledge
        sendMessage(ws, { type: 'aborted' });
      }
      break;

    case 'ping':
      sendMessage(ws, { type: 'pong' });
      break;

    default:
      sendMessage(ws, {
        type: 'error',
        code: 'unknown_message_type',
        message: `Unknown message type: ${message.type}`,
        retriable: false,
      });
  }
}

// Create HTTP server for WebSocket
const httpServer = http.createServer((req, res) => {
  // Health check endpoint
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  res.writeHead(426, { 'Content-Type': 'text/plain' });
  res.end('WebSocket connection required');
});

// Create WebSocket server
const wss = new WebSocketServer({ server: httpServer, path: '/ws/agent' });

wss.on('connection', async (ws, request) => {
  // Queue messages until auth completes (fixes race condition)
  const messageQueue = [];
  let isAuthenticated = false;

  // Set up message listener IMMEDIATELY to capture early messages
  ws.on('message', async (data) => {
    if (!isAuthenticated) {
      // Queue message until auth completes
      console.log('[WS Server] Queuing message (auth pending)');
      messageQueue.push(data);
      return;
    }

    try {
      await handleMessage(ws, data.toString());
    } catch (error) {
      console.error('[WS Server] Message error:', error);
      sendMessage(ws, {
        type: 'error',
        code: 'invalid_message',
        message: error instanceof Error ? error.message : 'Invalid message',
        retriable: false,
      });
    }
  });

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('close', () => {
    console.log(`[WS Server] Client disconnected: ${ws.userId || 'unknown'}`);
    ws.abortController?.abort();
    // Kill worker process if running
    if (ws.workerProcess) {
      ws.workerProcess.kill();
      ws.workerProcess = null;
    }
  });

  ws.on('error', (error) => {
    console.error(`[WS Server] Error for ${ws.userId || 'unknown'}:`, error);
  });

  // Authenticate
  const user = await authenticateRequest(request);
  if (!user) {
    ws.close(4001, 'Unauthorized');
    return;
  }

  ws.userId = user.id;
  ws.cookie = request.headers.cookie || '';  // Store cookie for API calls
  ws.isAlive = true;
  isAuthenticated = true;
  console.log(`[WS Server] Client connected: ${ws.userId}`);

  // Process any queued messages
  if (messageQueue.length > 0) {
    console.log(`[WS Server] Processing ${messageQueue.length} queued message(s)`);
    for (const data of messageQueue) {
      try {
        await handleMessage(ws, data.toString());
      } catch (error) {
        console.error('[WS Server] Message error:', error);
        sendMessage(ws, {
          type: 'error',
          code: 'invalid_message',
          message: error instanceof Error ? error.message : 'Invalid message',
          retriable: false,
        });
      }
    }
  }
});

// Heartbeat
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, HEARTBEAT_INTERVAL_MS);

wss.on('close', () => {
  clearInterval(heartbeat);
});

// Start server
httpServer.listen(WS_PORT, () => {
  console.log(`[WS Server] WebSocket server running on port ${WS_PORT}`);
  console.log(`[WS Server] Authenticating against ${APP_URL}`);
  console.log(`[WS Server] Sessions root: ${SESSIONS_ROOT}`);
});
