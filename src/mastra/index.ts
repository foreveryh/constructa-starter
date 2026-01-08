import { Mastra } from '@mastra/core';
import { PostgresStore } from '@mastra/pg';
import { chatAgent } from '~/mastra/agents/chat-agent';
import { prWriterAgent } from '~/mastra/agents/pr-writer-agent';
import { fileSummaryWorkflow, prCreatorWorkflow } from '~/mastra/workflows';

// Silence Mastra's telemetry warning in non-mastra-server environments.
const globalScope = globalThis as Record<string, unknown>;
if (!globalScope['___MASTRA_TELEMETRY___']) {
  globalScope['___MASTRA_TELEMETRY___'] = true;
}

/**
 * Lazy-initialize storage to avoid ESM/CJS interop issues during SSR bundling.
 * Same pattern as chat-agent.ts memory initialization.
 */
let _storage: PostgresStore | undefined;

function getStorage(): PostgresStore {
  if (!_storage) {
    _storage = new PostgresStore({
      id: 'mastra-workflow-storage',
      connectionString: process.env.DATABASE_URL!,
    });
  }
  return _storage;
}

export const mastra = new Mastra({
  agents: {
    'chat-agent': chatAgent,
    'pr-writer-agent': prWriterAgent,
  },
  workflows: {
    'file-summary': fileSummaryWorkflow,
    'pr-creator': prCreatorWorkflow,
  },
  // Storage for workflow snapshots (enables suspend/resume)
  storage: getStorage(),
});
