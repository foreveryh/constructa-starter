/**
 * Workspace Files API
 *
 * GET /api/workspace/:sessionId/files - List all files in workspace
 */

import { createFileRoute } from '@tanstack/react-router';
import { eq, and } from 'drizzle-orm';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { db } from '~/db/db-config';
import { agentSession } from '~/db/schema';
import { requireUser } from '~/server/require-user';

/**
 * Recursively list all files in a directory
 */
async function listFilesRecursive(dirPath: string, basePath: string = ''): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const relativePath = path.join(basePath, entry.name);
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // Recursively list subdirectory
        const subFiles = await listFilesRecursive(fullPath, relativePath);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        files.push(relativePath);
      }
    }
  } catch (error) {
    // Directory might not exist yet
    console.error(`[Workspace API] Error reading directory ${dirPath}:`, error);
  }

  return files;
}

export const Route = createFileRoute('/api/workspace/$sessionId/files')({
  server: {
    handlers: {
      // GET /api/workspace/:sessionId/files - List workspace files
      GET: async ({ request, params }) => {
        const user = await requireUser(request);
        const { sessionId } = params;

        // Find session in database
        const [session] = await db
          .select()
          .from(agentSession)
          .where(and(
            eq(agentSession.id, sessionId),
            eq(agentSession.userId, user.id)
          ));

        if (!session) {
          return new Response(
            JSON.stringify({ error: 'Session not found' }),
            { status: 404, headers: { 'content-type': 'application/json' } }
          );
        }

        // Get workspace directory
        // Path structure: {claudeHomePath}/sessions/{sdkSessionId}/workspace/
        const workspacePath = path.join(
          session.claudeHomePath,
          'sessions',
          session.sdkSessionId,
          'workspace'
        );

        // List all files in workspace
        const files = await listFilesRecursive(workspacePath);

        return Response.json({
          sessionId: session.id,
          sdkSessionId: session.sdkSessionId,
          workspacePath,
          files,
        });
      },
    },
  },
});
