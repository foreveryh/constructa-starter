/**
 * AgentSession - Manages a single Claude Agent SDK session
 *
 * Responsibilities:
 * - Wraps Claude Agent SDK query() calls
 * - Manages AbortController for interruption
 * - Tracks session state (busy, error)
 * - Broadcasts SDK events to connected WebSocket clients
 */

import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { WebSocket } from 'ws';

// Outbound message types sent to WebSocket clients
export type OutboundMessage =
  | { type: 'session_init'; sessionId: string }
  | { type: 'message'; event: SDKMessage }
  | { type: 'error'; code: string; message: string; retriable: boolean }
  | { type: 'done' }
  | { type: 'pong' };

export interface AgentSessionConfig {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  cwd?: string;
}

export class AgentSession {
  public sessionId: string | null = null;
  public lastActivity: number = Date.now();
  public error: Error | string | undefined;

  private config: AgentSessionConfig;
  private abortController: AbortController | undefined;
  private isBusy: boolean = false;
  private clients: Set<WebSocket> = new Set();

  constructor(config: AgentSessionConfig = {}) {
    this.config = config;
  }

  /**
   * Subscribe a WebSocket client to receive events
   */
  subscribe(ws: WebSocket): void {
    this.clients.add(ws);
    console.log(`[AgentSession] Client subscribed (total: ${this.clients.size})`);

    // Send current session state if we have a session
    if (this.sessionId) {
      this.send(ws, { type: 'session_init', sessionId: this.sessionId });
    }
  }

  /**
   * Unsubscribe a WebSocket client
   */
  unsubscribe(ws: WebSocket): void {
    this.clients.delete(ws);
    console.log(`[AgentSession] Client unsubscribed (remaining: ${this.clients.size})`);
  }

  /**
   * Check if session has any connected clients
   */
  hasClients(): boolean {
    return this.clients.size > 0;
  }

  /**
   * Broadcast message to all connected clients
   */
  private broadcast(message: OutboundMessage): void {
    const data = JSON.stringify(message);
    for (const ws of this.clients) {
      if (ws.readyState === ws.OPEN) {
        ws.send(data);
      }
    }
  }

  /**
   * Send message to a specific client
   */
  private send(ws: WebSocket, message: OutboundMessage): void {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Interrupt the current query
   */
  interrupt(): void {
    if (this.abortController) {
      this.abortController.abort('user_interrupt');
      this.abortController = undefined;
    }
    this.isBusy = false;
  }

  /**
   * Check if session is currently processing a query
   */
  get busy(): boolean {
    return this.isBusy;
  }

  /**
   * Process a chat message from the user
   */
  async chat(prompt: string, resumeSessionId?: string): Promise<void> {
    if (this.isBusy) {
      this.broadcast({
        type: 'error',
        code: 'busy',
        message: 'Session is busy processing another request',
        retriable: true,
      });
      return;
    }

    this.isBusy = true;
    this.error = undefined;
    this.abortController = new AbortController();
    this.lastActivity = Date.now();

    try {
      // Build environment variables for custom API endpoint
      const customEnv: Record<string, string | undefined> = { ...process.env };

      if (this.config.apiKey) {
        customEnv.ANTHROPIC_API_KEY = this.config.apiKey;
      }
      if (this.config.baseURL) {
        customEnv.ANTHROPIC_BASE_URL = this.config.baseURL;
        customEnv.ANTHROPIC_API_URL = this.config.baseURL;
      }
      if (this.config.model) {
        customEnv.ANTHROPIC_MODEL = this.config.model;
      }

      // Call Claude Agent SDK
      const stream = query({
        prompt,
        options: {
          cwd: this.config.cwd || process.cwd(),
          model: this.config.model,
          permissionMode: 'bypassPermissions',
          allowDangerouslySkipPermissions: true,
          abortController: this.abortController,
          // Resume from existing session if provided
          ...(resumeSessionId && { resume: resumeSessionId }),
          env: customEnv,
        },
      });

      // Stream SDK events to all connected clients
      for await (const event of stream) {
        this.lastActivity = Date.now();

        // Extract session_id from system:init event
        if (event.type === 'system' && event.subtype === 'init' && event.session_id) {
          this.sessionId = event.session_id;
          this.broadcast({ type: 'session_init', sessionId: event.session_id });
        }

        // Broadcast the raw SDK event
        this.broadcast({ type: 'message', event });
      }

      // Signal completion
      this.broadcast({ type: 'done' });
    } catch (error) {
      console.error('[AgentSession] Query error:', error);
      this.error = error instanceof Error ? error : String(error);

      const isAborted = this.abortController?.signal.aborted;
      this.broadcast({
        type: 'error',
        code: isAborted ? 'aborted' : 'server_error',
        message: error instanceof Error ? error.message : String(error),
        retriable: !isAborted,
      });
    } finally {
      this.isBusy = false;
      this.abortController = undefined;
    }
  }
}
