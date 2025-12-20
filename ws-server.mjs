#!/usr/bin/env node
/**
 * WebSocket Server for Claude Agent Chat
 *
 * This is a standalone WebSocket server that runs alongside the main Nitro server.
 * For production use with Docker, run this as a sidecar or use the combined startup script.
 *
 * Environment variables:
 * - WS_PORT: WebSocket server port (default: 3001)
 * - APP_URL: Main application URL for auth (default: http://localhost:3000)
 */

import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { query } from '@anthropic-ai/claude-agent-sdk';

// Configuration
const WS_PORT = parseInt(process.env.WS_PORT || '3001', 10);
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

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
 * Handle chat message
 */
async function handleChat(ws, prompt, resumeSessionId) {
  ws.abortController?.abort();
  ws.abortController = new AbortController();

  try {
    const customEnv = { ...process.env };
    if (config.apiKey) customEnv.ANTHROPIC_API_KEY = config.apiKey;
    if (config.baseURL) {
      customEnv.ANTHROPIC_BASE_URL = config.baseURL;
      customEnv.ANTHROPIC_API_URL = config.baseURL;
    }
    if (config.model) customEnv.ANTHROPIC_MODEL = config.model;

    const stream = query({
      prompt,
      options: {
        cwd: config.cwd,
        model: config.model,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        abortController: ws.abortController,
        ...(resumeSessionId && { resume: resumeSessionId }),
        env: customEnv,
      },
    });

    for await (const event of stream) {
      if (event.type === 'system' && event.subtype === 'init' && event.session_id) {
        ws.sessionId = event.session_id;
        sendMessage(ws, { type: 'session_init', sessionId: event.session_id });
      }
      sendMessage(ws, { type: 'message', event });
    }

    sendMessage(ws, { type: 'done' });
  } catch (error) {
    console.error('[WS Server] Chat error:', error);
    const isAborted = ws.abortController?.signal.aborted;
    sendMessage(ws, {
      type: 'error',
      code: isAborted ? 'aborted' : 'server_error',
      message: error instanceof Error ? error.message : String(error),
      retriable: !isAborted,
    });
  }
}

/**
 * Handle incoming WebSocket message
 */
async function handleMessage(ws, msg) {
  const message = JSON.parse(msg);

  switch (message.type) {
    case 'chat':
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
  // Authenticate
  const user = await authenticateRequest(request);
  if (!user) {
    ws.close(4001, 'Unauthorized');
    return;
  }

  ws.userId = user.id;
  ws.isAlive = true;
  console.log(`[WS Server] Client connected: ${ws.userId}`);

  ws.on('message', async (data) => {
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
    console.log(`[WS Server] Client disconnected: ${ws.userId}`);
    ws.abortController?.abort();
  });

  ws.on('error', (error) => {
    console.error(`[WS Server] Error for ${ws.userId}:`, error);
  });
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
});
