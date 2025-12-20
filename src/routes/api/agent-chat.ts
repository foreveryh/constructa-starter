/**
 * Agent Chat API Route
 *
 * Backend API that directly calls Claude Agent SDK and streams events to the frontend.
 * This replaces the Mastra-based /api/chat for Agent mode.
 *
 * Architecture:
 * - Authentication: Better Auth via requireUser()
 * - SDK: @anthropic-ai/claude-agent-sdk query()
 * - Response: SSE stream of raw SDK events (no transformation)
 * - Timeout: 30-minute idle timeout with reset per event
 * - Heartbeat: 15-second pings to keep connection alive
 */

import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { requireUser } from '~/server/require-user';

// Process-level error handlers to prevent crashes from unhandled rejections
if (typeof process !== 'undefined') {
  process.on('uncaughtException', (err) => {
    console.error('[Agent Route] UNCAUGHT EXCEPTION:', err);
  });
  process.on('unhandledRejection', (reason, _promise) => {
    console.error('[Agent Route] UNHANDLED REJECTION:', reason);
  });
}

const AgentChatPayloadSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  sessionId: z.string().optional(),
});

// Configuration
const HEARTBEAT_MS = 15_000; // 15 seconds
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export const Route = createFileRoute('/api/agent-chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // 1. Authentication
        const user = await requireUser(request);

        // 2. Parse request body
        let payload: z.infer<typeof AgentChatPayloadSchema>;
        try {
          const body = await request.json();
          payload = AgentChatPayloadSchema.parse(body);
        } catch (error) {
          if (error instanceof z.ZodError) {
            return new Response(
              JSON.stringify({ error: 'Invalid request body', details: error.issues }),
              { status: 400, headers: { 'Content-Type': 'application/json' } }
            );
          }
          throw error;
        }

        const { prompt, sessionId } = payload;

        // 3. Get environment variables
        const apiKey = process.env.ANTHROPIC_API_KEY;
        const baseURL = process.env.ANTHROPIC_BASE_URL;
        const model = process.env.ANTHROPIC_MODEL;

        if (!apiKey) {
          return new Response(
            JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          );
        }

        // 4. Create AbortController for timeout management
        const abortController = new AbortController();

        // 5. Create SSE stream
        const encoder = new TextEncoder();

        const encodeEvent = (event: { type: string; [key: string]: unknown }) =>
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`);

        const stream = new ReadableStream({
          async start(controller) {
            // 6. Set up heartbeat to keep connection alive
            const heartbeat = setInterval(
              () => controller.enqueue(encoder.encode(':ping\n\n')),
              HEARTBEAT_MS
            );

            // 7. Set up idle timeout with reset capability
            let idleTimer: ReturnType<typeof setTimeout> | null = setTimeout(
              () => abortWith('timeout:stream', 'idle timeout'),
              IDLE_TIMEOUT_MS
            );

            const resetIdle = () => {
              if (idleTimer) clearTimeout(idleTimer);
              idleTimer = setTimeout(
                () => abortWith('timeout:stream', 'idle timeout'),
                IDLE_TIMEOUT_MS
              );
            };

            const abortWith = (code: string, message: string) => {
              controller.enqueue(
                encodeEvent({
                  type: 'error',
                  error: message,
                  code,
                  retriable: code.startsWith('timeout'),
                })
              );
              abortController.abort(code);
              controller.close();
            };

            // 8. Handle client disconnect
            const abortHandler = () => abortWith('aborted:client', 'client aborted');
            request.signal.addEventListener('abort', abortHandler);

            try {
              // 9. Call Claude Agent SDK with AbortController
              const sdkStream = query({
                prompt,
                options: {
                  cwd: process.cwd(),
                  model,
                  permissionMode: 'bypassPermissions',
                  allowDangerouslySkipPermissions: true,
                  abortController,
                  // Resume from existing session if provided
                  ...(sessionId && { resume: sessionId }),
                  // Pass environment variables for custom base URL
                  ...(baseURL && {
                    env: {
                      ...process.env,
                      ANTHROPIC_BASE_URL: baseURL,
                      ANTHROPIC_API_URL: baseURL,
                    },
                  }),
                },
              });

              // 10. Stream SDK events as SSE
              for await (const event of sdkStream) {
                const data = `data: ${JSON.stringify(event)}\n\n`;
                controller.enqueue(encoder.encode(data));
                resetIdle(); // Reset idle timer on each event
              }

              // 11. Send done signal
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
            } catch (error) {
              console.error('Agent chat error:', error);
              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
              const isAborted = abortController.signal.aborted;

              controller.enqueue(
                encodeEvent({
                  type: 'error',
                  error: errorMessage,
                  code: isAborted ? 'aborted' : 'server:error',
                })
              );
              controller.close();
            } finally {
              // 12. Always cleanup resources
              if (idleTimer) clearTimeout(idleTimer);
              clearInterval(heartbeat);
              request.signal.removeEventListener('abort', abortHandler);
            }
          },
        });

        // 13. Return SSE response
        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
          },
        });
      },
    },
  },
});
