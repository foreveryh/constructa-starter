/**
 * Documents API
 *
 * GET /api/documents - List all documents for the current user
 */

import { createFileRoute } from '@tanstack/react-router';
import { db } from '~/db/db-config';
import { files } from '~/db/schema/file.schema';
import { auth } from '~/server/auth.server';
import { eq, desc } from 'drizzle-orm';

export const Route = createFileRoute('/api/documents')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          // Authenticate user
          const session = await auth.api.getSession({ headers: request.headers });

          if (!session?.user) {
            return new Response(
              JSON.stringify({ error: 'Unauthorized' }),
              {
                status: 401,
                headers: { 'content-type': 'application/json' },
              }
            );
          }

          const user = session.user;

          // Query all files for this user
          const fileRows = await db
            .select()
            .from(files)
            .where(eq(files.clientId, user.id))
            .orderBy(desc(files.createdAt));

          // Transform to the format expected by DocumentSelectorModal
          const documents = fileRows.map((file) => ({
            id: file.id,
            title: file.name || 'Untitled',
            filename: file.name || 'unknown',
            size: file.size || 0,
            fileType: file.mimeType || file.fileType || 'unknown',
            createdAt: file.createdAt?.toISOString() || new Date().toISOString(),
          }));

          return new Response(JSON.stringify(documents), {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          });
        } catch (error) {
          console.error('[GET /api/documents] Error:', error);

          return new Response(
            JSON.stringify({ error: 'Failed to fetch documents' }),
            {
              status: 500,
              headers: { 'content-type': 'application/json' },
            }
          );
        }
      },
    },
  },
});
