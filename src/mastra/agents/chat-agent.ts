import { Agent } from '@mastra/core/agent';
import { getFileFromObjectStore } from '~/mastra/tools/get-file-from-object-store.tool';

export const chatAgent = new Agent({
  id: 'chat-agent',
  name: 'Chat Agent',
  instructions: [
    'You are a helpful AI assistant.',
    'When a prompt references files or code, use the get-file-from-object-store tool to retrieve the exact content before answering.',
    'Always mention the object key(s) you consulted, adapt verbosity to user directions, and escalate with follow-up questions when context is ambiguous.',
  ].join(' '),
  // Mastra v1 内置智谱 AI 支持，使用 zhipuai/ 前缀
  // 需要配置环境变量：ZHIPU_API_KEY
  model: 'zhipuai/glm-4.7',
  tools: {
    getFileFromObjectStore,
  },
});
