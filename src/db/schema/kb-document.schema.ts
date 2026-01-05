/**
 * KB Document Schema
 *
 * Many-to-many relationship between knowledge bases and documents.
 * A KB can have multiple documents, and a document can belong to multiple KBs.
 */

import { pgTable, text, uuid, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { knowledgeBases } from './knowledge-base.schema';
import { files } from './file.schema';
import { createdAt } from './_shared';

export const kbDocuments = pgTable('kb_documents', {
  // Primary key
  id: uuid('id').primaryKey().defaultRandom(),

  // KB reference - cascade delete when KB is deleted
  kbId: uuid('kb_id')
    .notNull()
    .references(() => knowledgeBases.id, { onDelete: 'cascade' }),

  // File reference - cascade delete when file is deleted
  fileId: text('file_id')
    .notNull()
    .references(() => files.id, { onDelete: 'cascade' }),

  // Timestamp
  createdAt: createdAt(),
}, (table) => ({
  // Index for finding all documents in a KB
  kbIdx: index('idx_kb_documents_kb').on(table.kbId),

  // Index for finding all KBs containing a document
  fileIdx: index('idx_kb_documents_file').on(table.fileId),

  // Unique constraint: same file cannot be added twice to the same KB
  uniqueKbFile: uniqueIndex('idx_kb_documents_unique').on(table.kbId, table.fileId),
}));

// Type exports for use in application code
export type KbDocument = typeof kbDocuments.$inferSelect;
export type NewKbDocument = typeof kbDocuments.$inferInsert;
