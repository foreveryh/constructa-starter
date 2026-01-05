/**
 * Session Document Schema
 *
 * Links documents from the global document library to specific agent sessions.
 * When a user adds a document to a session's knowledge base:
 * 1. A record is created in this table
 * 2. The file is downloaded from S3 to workspace/knowledge-base/
 * 3. Claude Agent SDK can search/read the file using grep/read tools
 */

import { pgTable, text, timestamp, uuid, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { agentSession } from './agent-session.schema';
import { files } from './file.schema';
import { createdAt, updatedAt } from './_shared';

export const sessionDocument = pgTable('session_document', {
  // Primary key
  id: uuid('id').primaryKey().defaultRandom(),

  // Session reference - cascade delete when session is deleted
  sessionId: uuid('session_id')
    .notNull()
    .references(() => agentSession.id, { onDelete: 'cascade' }),

  // File reference - cascade delete when file is deleted from documents library
  fileId: text('file_id')
    .notNull()
    .references(() => files.id, { onDelete: 'cascade' }),

  // File path in workspace (relative to workspace root)
  // e.g., "knowledge-base/API文档.md"
  filePath: text('file_path').notNull(),

  // When the file was downloaded to workspace
  syncedAt: timestamp('synced_at', { withTimezone: true }).notNull(),

  // Optional: store file version/hash for update detection
  // fileVersion: text('file_version'),

  // Standard timestamps
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => ({
  // Index for finding all documents in a session
  sessionIdx: index('idx_session_document_session').on(table.sessionId),

  // Index for finding all sessions using a document
  fileIdx: index('idx_session_document_file').on(table.fileId),

  // Unique constraint: same file cannot be added twice to the same session
  uniqueSessionFile: uniqueIndex('idx_session_document_unique').on(table.sessionId, table.fileId),
}));

// Type exports for use in application code
export type SessionDocument = typeof sessionDocument.$inferSelect;
export type NewSessionDocument = typeof sessionDocument.$inferInsert;
