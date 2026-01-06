import { createFileRoute } from '@tanstack/react-router';
import { eq } from 'drizzle-orm';

import { db } from '~/db/client';
import { mastra } from '~/mastra';
import { mastraThread } from '~/db/schema';
import { AGENTS } from '~/db/schema/_shared';

export const Route = createFileRoute('/api/threads/$threadId')({
  server: {
    handlers: {
      // GET /api/threads/:threadId - Get thread details and messages
      GET: async ({ request, params }) => {
        try {
          const { threadId } = params;
          const cookie = request.headers.get('cookie') || '';

          // Authenticate user
          const authResponse = await fetch(`${process.env.BETTER_AUTH_URL}/api/auth/get-session`, {
            headers: { cookie },
          });

          if (!authResponse.ok) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
              status: 401,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          const data = await authResponse.json();
          const userId = data?.user?.id;

          if (!userId) {
            return new Response(JSON.stringify({ error: 'User not found' }), {
              status: 401,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          // Get thread from database
          const [thread] = await db
            .select()
            .from(mastraThread)
            .where(eq(mastraThread.threadId, threadId))
            .limit(1);

          if (!thread) {
            return new Response(JSON.stringify({ error: 'Thread not found' }), {
              status: 404,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          // Verify ownership
          if (thread.userId !== userId) {
            return new Response(JSON.stringify({ error: 'Forbidden' }), {
              status: 403,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          // Get messages from Mastra Memory
          const storage = mastra.getStorage();
          const memoryStore = await storage.getStore('memory');

          const result = await memoryStore?.listMessages({
            threadId: thread.threadId,
            page: 0,
            perPage: 100,
          });

          // Return messages directly (Mastra format is compatible)
          const messages = result?.messages ?? [];

          // Enrich thread with agent info
          const enrichedThread = {
            ...thread,
            agent: AGENTS[thread.agentId as keyof typeof AGENTS],
          };

          return new Response(
            JSON.stringify({
              thread: enrichedThread,
              messages,
              total: result?.total || 0,
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        } catch (error) {
          console.error('[API /api/threads/:threadId] Error:', error);
          return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      },
    },
  },
});
