import { Agent } from '@mastra/core/agent';
import type { MastraMemory } from '@mastra/core/memory';
import { getFileFromObjectStore } from '~/mastra/tools/get-file-from-object-store.tool';

/**
 * Lazy-initialize memory to avoid "Cannot access 'pg' before initialization" error.
 *
 * Root cause: PostgresStore depends on 'pg' (CommonJS package). During Vite/Nitro SSR
 * bundling, ESM/CJS interop creates getter proxies for CommonJS exports. When module
 * top-level code executes `new PostgresStore()`, the 'pg' getter may not be ready yet,
 * triggering a Temporal Dead Zone (TDZ) error.
 *
 * Solution: Use dynamic import() to defer module loading until runtime, ensuring all
 * dependencies are fully initialized before instantiation.
 *
 * @see https://mastra.ai/docs/v1/memory/storage - Official storage configuration docs
 */
let _memory: MastraMemory | undefined;

async function createMemory(): Promise<MastraMemory> {
  if (!_memory) {
    // Dynamic imports ensure pg is fully loaded before PostgresStore instantiation
    const { Memory } = await import('@mastra/memory');
    const { PostgresStore } = await import('@mastra/pg');

    _memory = new Memory({
      // Agent-level storage for dedicated data boundaries
      // See: https://mastra.ai/docs/v1/memory/storage#agent-level-storage
      storage: new PostgresStore({
        id: 'chat-agent-storage',
        connectionString: process.env.DATABASE_URL!,
      }),
      options: {
        // Enable message history (last N messages in context)
        lastMessages: 20,
        // Auto-generate thread titles from first user message
        // Note: generateTitle moved to top-level options in Mastra v1
        generateTitle: true,
      },
    });
  }
  return _memory;
}

export const chatAgent = new Agent({
  id: 'chat-agent',
  name: 'Chat Agent',
  instructions: [
    'You are a helpful AI assistant.',
    'When a prompt references files or code, use the get-file-from-object-store tool to retrieve the exact content before answering.',
    'Always mention the object key(s) you consulted, adapt verbosity to user directions, and escalate with follow-up questions when context is ambiguous.',
  ].join(' '),
  // Mastra v1 uses model router with provider/model format
  // Requires ZHIPU_API_KEY environment variable
  model: 'zhipuai/glm-4.7',
  tools: {
    getFileFromObjectStore,
  },
  // DynamicArgument<MastraMemory> - Mastra calls this function when memory is needed
  memory: async () => createMemory(),
});
