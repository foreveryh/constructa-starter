/**
 * Agent Session Lookup by SDK Session ID
 *
 * GET /api/agent-sessions/by-sdk-id/:sdkId - Get session by sdkSessionId
 */

import { createFileRoute } from '@tanstack/react-router';
import { eq, and } from 'drizzle-orm';
import { db } from '~/db/db-config';
import { agentSession } from '~/db/schema';
import { requireUser } from '~/server/require-user';

export const Route = createFileRoute('/api/agent-sessions/by-sdk-id/$sdkId')({
  server: {
    handlers: {
      // GET /api/agent-sessions/by-sdk-id/:sdkId - Get session by SDK session ID
      GET: async ({ request, params }) => {
        const user = await requireUser(request);
        const { sdkId } = params;

        const [session] = await db
          .select()
          .from(agentSession)
          .where(and(
            eq(agentSession.sdkSessionId, sdkId),
            eq(agentSession.userId, user.id)
          ));

        if (!session) {
          return new Response(
            JSON.stringify({ error: 'Session not found' }),
            { status: 404, headers: { 'content-type': 'application/json' } }
          );
        }

        return Response.json(session);
      },
    },
  },
});
