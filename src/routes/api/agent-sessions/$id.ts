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
import { rm } from 'fs/promises';
import { join } from 'path';

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
        // Note: Only update updatedAt for non-title changes (e.g., favorite)
        // Title changes should not affect the conversation timestamp
        const updateData: Partial<{
          title: string;
          favorite: boolean;
          updatedAt: Date;
        }> = {};

        if (typeof body.title === 'string') {
          updateData.title = body.title;
        }
        if (typeof body.favorite === 'boolean') {
          updateData.favorite = body.favorite;
          updateData.updatedAt = new Date(); // Only update timestamp for favorite changes
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

        // 1. Query session to get claudeHomePath and sdkSessionId for file cleanup
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

        // 2. Delete database record
        await db
          .delete(agentSession)
          .where(and(
            eq(agentSession.id, id),
            eq(agentSession.userId, user.id)
          ));

        // 3. Clean up workspace and JSONL files
        try {
          const sessionPath = join(
            session.claudeHomePath,
            'sessions',
            session.sdkSessionId
          );
          await rm(sessionPath, { recursive: true, force: true });
          console.log('[Session Delete] Successfully cleaned up workspace:', sessionPath);
        } catch (error) {
          // Log error but don't fail the request - database record is already deleted
          console.error('[Session Delete] Failed to cleanup workspace files:', error);
          console.error('[Session Delete] Path:', join(session.claudeHomePath, 'sessions', session.sdkSessionId));
        }

        return Response.json({ success: true, deleted: session });
      },
    },
  },
});
