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
          const params = await request.json();

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
