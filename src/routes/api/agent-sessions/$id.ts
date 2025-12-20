/**
 * Agent Session Detail API
 *
 * GET    /api/agent-sessions/:id - Get session details
 * PATCH  /api/agent-sessions/:id - Update session (title, favorite)
 * DELETE /api/agent-sessions/:id - Delete session
 */

import { createFileRoute } from '@tanstack/react-router';
import { eq, and } from 'drizzle-orm';
import { db } from '~/db/db-config';
import { agentSession } from '~/db/schema';
import { requireUser } from '~/server/require-user';

export const Route = createFileRoute('/api/agent-sessions/$id')({
  server: {
    handlers: {
      // GET /api/agent-sessions/:id - Get session details
      GET: async ({ request, params }) => {
        const user = await requireUser(request);
        const { id } = params;

        const [session] = await db
          .select()
          .from(agentSession)
          .where(and(
            eq(agentSession.id, id),
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

      // PATCH /api/agent-sessions/:id - Update session
      PATCH: async ({ request, params }) => {
        const user = await requireUser(request);
        const { id } = params;
        const body = await request.json();

        // Build update object with only provided fields
        const updateData: Partial<{
          title: string;
          favorite: boolean;
          updatedAt: Date;
        }> = {
          updatedAt: new Date(),
        };

        if (typeof body.title === 'string') {
          updateData.title = body.title;
        }
        if (typeof body.favorite === 'boolean') {
          updateData.favorite = body.favorite;
        }

        const [updated] = await db
          .update(agentSession)
          .set(updateData)
          .where(and(
            eq(agentSession.id, id),
            eq(agentSession.userId, user.id)
          ))
          .returning();

        if (!updated) {
          return new Response(
            JSON.stringify({ error: 'Session not found' }),
            { status: 404, headers: { 'content-type': 'application/json' } }
          );
        }

        return Response.json(updated);
      },

      // DELETE /api/agent-sessions/:id - Delete session
      DELETE: async ({ request, params }) => {
        const user = await requireUser(request);
        const { id } = params;

        const [deleted] = await db
          .delete(agentSession)
          .where(and(
            eq(agentSession.id, id),
            eq(agentSession.userId, user.id)
          ))
          .returning();

        if (!deleted) {
          return new Response(
            JSON.stringify({ error: 'Session not found' }),
            { status: 404, headers: { 'content-type': 'application/json' } }
          );
        }

        return Response.json({ success: true, deleted });
      },
    },
  },
});
