import { json } from '@tanstack/react-start';
import { createFileRoute } from '@tanstack/react-router';
import { handleChatStream } from '@mastra/ai-sdk';
import { createUIMessageStreamResponse } from 'ai';
import { mastra } from '~/mastra';

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();

          // Extract memory config from request body
          // Frontend can pass: { messages, memory: { thread, resource } }
          // Or legacy format: { messages, threadId }
          const { messages, memory, threadId, resourceId } = body;

          // Build params with memory configuration
          const params = {
            messages,
            // Support both new format (memory.thread) and legacy format (threadId)
            memory: memory || (threadId ? { thread: threadId, resource: resourceId || 'default-user' } : undefined),
          };

          const stream = await handleChatStream({
            mastra,
            agentId: 'chat-agent',
            params,
          });

          return createUIMessageStreamResponse({ stream });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unexpected error';
          console.error('POST /api/chat error', error);
          return json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
