/**
 * Session Title Extraction Service
 *
 * Extracts session title from JSONL conversation files.
 * The title is derived from the first user message in the conversation.
 */

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

interface JsonlUserMessage {
  type: 'user';
  message?: {
    content?: Array<{ type: string; text?: string }>;
  };
}

interface JsonlRecord {
  type: string;
  message?: {
    content?: Array<{ type: string; text?: string }>;
  };
}

/**
 * Extract session title from JSONL file
 *
 * @param claudeHomePath - User's CLAUDE_HOME directory
 * @param sdkSessionId - SDK session ID (JSONL filename without extension)
 * @returns Extracted title or null if not found
 */
export async function extractSessionTitle(
  claudeHomePath: string,
  sdkSessionId: string
): Promise<string | null> {
  try {
    // JSONL files are stored in: {CLAUDE_HOME}/.claude/projects/{cwd-hash}/{session-id}.jsonl
    const projectsDir = path.join(claudeHomePath, '.claude', 'projects');

    let dirs: string[];
    try {
      dirs = await readdir(projectsDir);
    } catch {
      console.log(`[SessionTitle] Projects directory not found: ${projectsDir}`);
      return null;
    }

    // Search through all project directories for the session file
    for (const dir of dirs) {
      const jsonlPath = path.join(projectsDir, dir, `${sdkSessionId}.jsonl`);

      try {
        const content = await readFile(jsonlPath, 'utf-8');
        const lines = content.split('\n').filter(Boolean);

        // Find the first user message
        for (const line of lines) {
          try {
            const record: JsonlRecord = JSON.parse(line);

            if (record.type === 'user' && record.message?.content) {
              const textContent = record.message.content.find(
                (c) => c.type === 'text' && c.text
              );

              if (textContent?.text) {
                // Truncate to 50 characters and trim whitespace
                const title = textContent.text.slice(0, 50).trim();
                return title || null;
              }
            }
          } catch {
            // Skip malformed JSON lines
            continue;
          }
        }
      } catch {
        // File doesn't exist in this directory, try next
        continue;
      }
    }

    return null;
  } catch (error) {
    console.error('[SessionTitle] Error extracting title:', error);
    return null;
  }
}

/**
 * Generate a fallback title based on session creation time
 */
export function generateFallbackTitle(createdAt: Date): string {
  return `Session ${createdAt.toLocaleDateString()} ${createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}
