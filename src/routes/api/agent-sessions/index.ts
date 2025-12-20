/**
 * Agent Sessions List API
 *
 * GET /api/agent-sessions - List all sessions for current user
 */

import { createFileRoute } from '@tanstack/react-router';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '~/db/db-config';
import { agentSession } from '~/db/schema';
import { requireUser } from '~/server/require-user';

export const Route = createFileRoute('/api/agent-sessions/')({
  validateSearch: (s) => ({
    page: Math.max(1, Number(s.page ?? 1)),
    limit: Math.max(1, Math.min(100, Number(s.limit ?? 20))),
  }),
  server: {
    handlers: {
      // GET /api/agent-sessions - List sessions
      GET: async ({ request, search }) => {
        const user = await requireUser(request);
        const { page, limit } = search as { page: number; limit: number };
        const offset = (page - 1) * limit;

        // Fetch sessions ordered by favorite first, then by updated_at
        const sessions = await db
          .select()
          .from(agentSession)
          .where(eq(agentSession.userId, user.id))
          .orderBy(
            desc(agentSession.favorite),
            desc(agentSession.updatedAt)
          )
          .limit(limit)
          .offset(offset);

        // Get total count for pagination
        const [countResult] = await db
          .select({ count: sql<number>`count(*)` })
          .from(agentSession)
          .where(eq(agentSession.userId, user.id));

        const total = Number(countResult?.count ?? 0);

        return Response.json({
          sessions,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        });
      },
    },
  },
});
