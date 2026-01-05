/**
 * Knowledge Base Schema
 *
 * A knowledge base is a named collection of documents that can be reused across sessions.
 * Users can create multiple KBs to organize documents by topic, project, or purpose.
 */

import { pgTable, text, timestamp, uuid, index } from 'drizzle-orm/pg-core';
import { createdAt, updatedAt } from './_shared';

export const knowledgeBases = pgTable('knowledge_bases', {
  // Primary key
  id: uuid('id').primaryKey().defaultRandom(),

  // Owner of this KB
  userId: text('user_id').notNull(),

  // KB metadata
  name: text('name').notNull(),
  description: text('description'),

  // Standard timestamps
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => ({
  // Index for finding all KBs owned by a user
  userIdx: index('idx_knowledge_bases_user').on(table.userId),
}));

// Type exports for use in application code
export type KnowledgeBase = typeof knowledgeBases.$inferSelect;
export type NewKnowledgeBase = typeof knowledgeBases.$inferInsert;
