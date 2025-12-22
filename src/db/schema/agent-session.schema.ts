/**
 * Agent Session Schema
 *
 * Stores metadata for Claude Agent SDK sessions.
 * The actual conversation content is stored in JSONL files managed by the SDK.
 * This table provides:
 * - User-to-session mapping for access control
 * - Session titles and favorites for UI
 * - Quick lookup without scanning filesystem
 */

import { pgTable, text, boolean, timestamp, uuid, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { user } from './auth.schema';
import { createdAt, updatedAt } from './_shared';

export const agentSession = pgTable('agent_session', {
  // Primary key - our internal ID
  id: uuid('id').primaryKey().defaultRandom(),

  // User association - foreign key to user table
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),

  // SDK session ID (our workspace session ID, used for directory paths)
  sdkSessionId: text('sdk_session_id').notNull(),

  // Real SDK session ID (the actual session ID from Claude Agent SDK for resume)
  realSdkSessionId: text('real_sdk_session_id'),

  // Session title (extracted from first user message or AI-generated)
  title: text('title'),

  // CLAUDE_HOME path for this user (to locate JSONL files)
  claudeHomePath: text('claude_home_path').notNull(),

  // Favorite flag for pinning sessions
  favorite: boolean('favorite').default(false).notNull(),

  // Last message timestamp (for sorting by activity)
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }),

  // Standard timestamps
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => ({
  // Index for user session queries
  userIdx: index('idx_agent_session_user').on(table.userId),

  // Index for sorting by update time
  updatedIdx: index('idx_agent_session_updated').on(table.updatedAt),

  // Unique constraint: same user cannot have duplicate SDK session IDs
  uniqueUserSession: uniqueIndex('idx_agent_session_user_sdk').on(table.userId, table.sdkSessionId),
}));

// Type exports for use in application code
export type AgentSession = typeof agentSession.$inferSelect;
export type NewAgentSession = typeof agentSession.$inferInsert;
