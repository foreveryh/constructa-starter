/**
 * Claude Agent WebSocket Adapter
 *
 * Implements ChatModelAdapter for Assistant UI, using WebSocket instead of SSE
 * for more reliable real-time communication with Claude Agent SDK.
 *
 * Architecture:
 * - Persistent WebSocket connection to /ws/agent
 * - Automatic reconnection on disconnect
 * - Same event transformation as SSE adapter (SDK events -> Assistant UI format)
 */

import type { ChatModelAdapter, ChatModelRunOptions, ChatModelRunResult } from '@assistant-ui/react';

// SDK Message Types (matching what WebSocket server sends)
type SDKContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: unknown };

type SDKMessage = {
  type: 'system' | 'assistant' | 'user' | 'result' | 'error';
  subtype?: string;
  uuid?: string;
  session_id?: string;
  message?: {
    content: SDKContentBlock[];
  };
  result?: string;
  is_error?: boolean;
  error?: string;
};

// WebSocket message types (matching ws-server.ts)
type InboundMessage =
  | { type: 'chat'; content: string; sessionId?: string }
  | { type: 'resume'; sessionId: string }
  | { type: 'abort' }
  | { type: 'ping' };

type OutboundMessage =
  | { type: 'session_init'; sessionId: string }
  | { type: 'message'; event: SDKMessage }
  | { type: 'error'; code: string; message: string; retriable: boolean }
  | { type: 'done' }
  | { type: 'pong' };

// Assistant UI Part Types
type TextPart = {
  readonly type: 'text';
  readonly text: string;
};

type ReasoningPart = {
  readonly type: 'reasoning';
  readonly text: string;
};

type ToolCallPart = {
  readonly type: 'tool-call';
  readonly toolCallId: string;
  readonly toolName: string;
  readonly args: Record<string, unknown>;
  readonly argsText: string;
  readonly result?: unknown;
  readonly isError?: boolean;
};

type ContentPart = TextPart | ReasoningPart | ToolCallPart;

// WebSocket connection state
let ws: WebSocket | null = null;
let currentSessionId: string | undefined;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 1000;

// Message queue for handling responses
type MessageHandler = (msg: OutboundMessage) => void;
let messageHandler: MessageHandler | null = null;

export function getSessionId(): string | undefined {
  return currentSessionId;
}

export function setSessionId(id: string | undefined): void {
  currentSessionId = id;
}

export function clearSession(): void {
  currentSessionId = undefined;
}

/**
 * Get WebSocket URL
 * In development, connects to the same host on /ws/agent
 * In production, can be configured via VITE_WS_URL environment variable
 */
function getWebSocketUrl(): string {
  // Check for explicit WebSocket URL (e.g., for sidecar deployment)
  // @ts-expect-error - Vite injects this at build time
  const configuredUrl = import.meta.env?.VITE_WS_URL;
  if (configuredUrl) {
    return configuredUrl;
  }

  // Default: same host, /ws/agent path
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws/agent`;
}

/**
 * Get or create WebSocket connection
 */
function getWebSocket(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      resolve(ws);
      return;
    }

    if (ws && ws.readyState === WebSocket.CONNECTING) {
      ws.addEventListener('open', () => resolve(ws!), { once: true });
      ws.addEventListener('error', reject, { once: true });
      return;
    }

    // Create new connection
    const url = getWebSocketUrl();

    console.log('[WS Adapter] Connecting to', url);
    ws = new WebSocket(url);

    ws.onopen = () => {
      console.log('[WS Adapter] Connected');
      reconnectAttempts = 0;
      resolve(ws!);
    };

    ws.onerror = (event) => {
      console.error('[WS Adapter] Connection error:', event);
      reject(new Error('WebSocket connection failed'));
    };

    ws.onclose = (event) => {
      console.log('[WS Adapter] Disconnected:', event.code, event.reason);
      ws = null;

      // Auto-reconnect if not intentionally closed
      if (event.code !== 1000 && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        console.log(`[WS Adapter] Reconnecting (attempt ${reconnectAttempts})...`);
        setTimeout(() => {
          getWebSocket().catch(() => {});
        }, RECONNECT_DELAY_MS * reconnectAttempts);
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as OutboundMessage;

        // Handle session init
        if (msg.type === 'session_init') {
          currentSessionId = msg.sessionId;
          console.log('[WS Adapter] Session initialized:', msg.sessionId);
        }

        // Forward to current handler
        if (messageHandler) {
          messageHandler(msg);
        }
      } catch (error) {
        console.error('[WS Adapter] Message parse error:', error);
      }
    };
  });
}

/**
 * Send message via WebSocket
 */
async function send(message: InboundMessage): Promise<void> {
  const socket = await getWebSocket();
  socket.send(JSON.stringify(message));
}

/**
 * Abort current operation
 */
export async function abort(): Promise<void> {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'abort' }));
  }
}

/**
 * Close WebSocket connection
 */
export function disconnect(): void {
  if (ws) {
    ws.close(1000, 'User disconnect');
    ws = null;
  }
}

/**
 * Claude Agent WebSocket Adapter for Assistant UI
 */
export const ClaudeAgentWSAdapter: ChatModelAdapter = {
  async *run({ messages, abortSignal }: ChatModelRunOptions) {
    console.log('[WS Adapter] run() called with', messages.length, 'messages');

    // 1. Extract the latest user message
    const lastMessage = messages.at(-1);
    if (!lastMessage || lastMessage.role !== 'user') {
      throw new Error('No user message to process');
    }

    const textParts = lastMessage.content.filter(
      (part): part is { type: 'text'; text: string } => part.type === 'text'
    );
    const prompt = textParts.map((p) => p.text).join('\n');

    if (!prompt.trim()) {
      throw new Error('Empty prompt');
    }

    // 2. Set up abort handler
    const abortHandler = () => {
      abort();
    };
    abortSignal?.addEventListener('abort', abortHandler);

    // 3. Create message queue for async iteration
    const messageQueue: OutboundMessage[] = [];
    let resolveNext: (() => void) | null = null;
    let isComplete = false;
    let error: Error | null = null;

    messageHandler = (msg: OutboundMessage) => {
      messageQueue.push(msg);
      if (resolveNext) {
        resolveNext();
        resolveNext = null;
      }
    };

    // 4. Send chat message
    try {
      console.log('[WS Adapter] Sending chat message:', { type: 'chat', content: prompt.substring(0, 50), sessionId: currentSessionId });
      await send({
        type: 'chat',
        content: prompt,
        sessionId: currentSessionId,
      });
      console.log('[WS Adapter] Message sent successfully');
    } catch (connectError) {
      console.error('[WS Adapter] Failed to send message:', connectError);
      throw new Error('Failed to connect to WebSocket server');
    }

    // 5. Process messages
    const content: ContentPart[] = [];
    const toolCalls = new Map<string, ToolCallPart>();

    try {
      while (!isComplete && !error) {
        // Wait for next message
        if (messageQueue.length === 0) {
          await new Promise<void>((resolve) => {
            resolveNext = resolve;
          });
        }

        const msg = messageQueue.shift();
        if (!msg) continue;

        switch (msg.type) {
          case 'session_init':
            currentSessionId = msg.sessionId;
            break;

          case 'message':
            const event = msg.event;

            switch (event.type) {
              case 'system':
                if (event.subtype === 'init' && event.session_id) {
                  currentSessionId = event.session_id;
                }
                break;

              case 'assistant':
                if (event.message?.content) {
                  for (const block of event.message.content) {
                    switch (block.type) {
                      case 'text':
                        if (block.text) {
                          let existingText = content.find(
                            (p): p is TextPart => p.type === 'text'
                          );
                          if (existingText) {
                            const index = content.indexOf(existingText);
                            content[index] = { type: 'text', text: block.text };
                          } else {
                            content.push({ type: 'text', text: block.text });
                          }
                        }
                        break;

                      case 'thinking':
                        if (block.thinking) {
                          content.push({
                            type: 'reasoning',
                            text: block.thinking,
                          });
                        }
                        break;

                      case 'tool_use':
                        if (block.id && block.name) {
                          const toolPart: ToolCallPart = {
                            type: 'tool-call',
                            toolCallId: block.id,
                            toolName: block.name,
                            args: (block.input as Record<string, unknown>) ?? {},
                            argsText: JSON.stringify(block.input ?? {}),
                          };
                          toolCalls.set(block.id, toolPart);
                          content.push(toolPart);
                        }
                        break;
                    }
                  }

                  yield {
                    content: [...content] as ChatModelRunResult['content'],
                    status: { type: 'running' },
                  } satisfies ChatModelRunResult;
                }
                break;

              case 'user':
                if (event.message?.content) {
                  for (const block of event.message.content) {
                    if (block.type === 'tool_result' && block.tool_use_id) {
                      const toolPart = toolCalls.get(block.tool_use_id);
                      if (toolPart) {
                        const updatedPart: ToolCallPart = {
                          ...toolPart,
                          result: block.content,
                          isError: false,
                        };
                        toolCalls.set(block.tool_use_id, updatedPart);

                        const index = content.findIndex(
                          (p) =>
                            p.type === 'tool-call' &&
                            p.toolCallId === block.tool_use_id
                        );
                        if (index !== -1) {
                          content[index] = updatedPart;
                        }
                      }
                    }
                  }

                  yield {
                    content: [...content] as ChatModelRunResult['content'],
                    status: { type: 'running' },
                  } satisfies ChatModelRunResult;
                }
                break;

              case 'result':
                if (event.is_error || event.subtype?.startsWith('error')) {
                  error = new Error(event.result || 'Agent execution failed');
                }
                break;

              case 'error':
                error = new Error(event.error || 'Unknown error');
                break;
            }
            break;

          case 'error':
            error = new Error(msg.message || 'Unknown error');
            break;

          case 'done':
            isComplete = true;
            break;
        }
      }

      if (error) {
        throw error;
      }
    } finally {
      abortSignal?.removeEventListener('abort', abortHandler);
      messageHandler = null;
    }

    // 6. Yield final result
    yield {
      content: (content.length > 0 ? content : [{ type: 'text', text: '' }]) as ChatModelRunResult['content'],
      status: { type: 'complete', reason: 'stop' },
    } satisfies ChatModelRunResult;
  },
};

export default ClaudeAgentWSAdapter;
