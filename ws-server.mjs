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
import { mkdir } from 'node:fs/promises';
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

// Track initialized CLAUDE_HOME directories
const initializedHomes = new Set();

/**
 * Sanitize userId to prevent path traversal attacks
 */
function sanitizeUserId(userId) {
  return userId.replace(/[\/\\\.]+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Get user-specific CLAUDE_HOME path
 */
function getClaudeHome(userId) {
  const safeUserId = sanitizeUserId(userId);
  return path.join(SESSIONS_ROOT, safeUserId);
}

/**
 * Ensure CLAUDE_HOME directory exists
 */
async function ensureClaudeHomeExists(claudeHome) {
  if (initializedHomes.has(claudeHome)) {
    return;
  }

  try {
    await mkdir(claudeHome, { recursive: true });
    initializedHomes.add(claudeHome);
    console.log(`[WS Server] Created CLAUDE_HOME: ${claudeHome}`);
  } catch (error) {
    console.error(`[WS Server] Failed to create CLAUDE_HOME:`, error);
    throw error;
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
 * Handle chat message using child process for user isolation
 */
async function handleChat(ws, prompt, resumeSessionId) {
  // Kill any existing worker for this connection
  if (ws.workerProcess) {
    ws.workerProcess.kill();
    ws.workerProcess = null;
  }

  try {
    // Get user-specific CLAUDE_HOME
    const claudeHome = getClaudeHome(ws.userId);
    await ensureClaudeHomeExists(claudeHome);
    console.log(`[WS Server] User ${ws.userId} CLAUDE_HOME: ${claudeHome}`);

    // Build environment for worker process
    const workerEnv = { ...process.env };
    // Set both CLAUDE_HOME and HOME - SDK might use either
    workerEnv.CLAUDE_HOME = claudeHome;
    workerEnv.HOME = claudeHome;  // Override HOME so os.homedir() returns user dir
    workerEnv.WORKER_CWD = config.cwd;
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
    const request = JSON.stringify({ prompt, sessionId: resumeSessionId });
    worker.stdin.write(request);
    worker.stdin.end();

    // Read responses line by line
    const rl = createInterface({ input: worker.stdout });

    rl.on('line', (line) => {
      try {
        const msg = JSON.parse(line);

        if (msg.type === 'event') {
          const event = msg.event;
          if (event.type === 'system' && event.subtype === 'init' && event.session_id) {
            ws.sessionId = event.session_id;
            sendMessage(ws, { type: 'session_init', sessionId: event.session_id });
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

    // Log worker stderr
    worker.stderr.on('data', (data) => {
      console.log(`[Worker ${ws.userId}]`, data.toString().trim());
    });

    // Handle worker exit
    worker.on('close', (code) => {
      if (code !== 0) {
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

    case 'abort':
      ws.abortController?.abort('user_interrupt');
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
