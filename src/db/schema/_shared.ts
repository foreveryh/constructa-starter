import { timestamp, pgEnum, text } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

export const createdAt = () => timestamptz('created_at').notNull().defaultNow();
export const updatedAt = () => timestamptz('updated_at').notNull().defaultNow().$onUpdate(() => sql`CURRENT_TIMESTAMP`);
export const accessedAt = () => timestamptz('accessed_at').notNull().defaultNow();

export const timestamps = {
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  accessedAt: accessedAt(),
};

// Agent ID enum for Mastra agents
export const agentIdEnum = pgEnum('agent_id', [
  'assistant-agent',
  'translator-agent',
]);

// Helper to get agent info
export const AGENTS = {
  'assistant-agent': {
    id: 'assistant-agent',
    name: '通用助手',
    icon: '💬',
    description: 'AI 助手，可以回答问题、帮助分析',
  },
  'translator-agent': {
    id: 'translator-agent',
    name: '语言炼金师',
    icon: '🎭',
    description: '追求翻译的最高境界，灵魂的重生',
  },
} as const;
