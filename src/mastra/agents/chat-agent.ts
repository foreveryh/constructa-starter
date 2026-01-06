import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';
import { getFileFromObjectStore } from '~/mastra/tools/get-file-from-object-store.tool';

export const chatAgent = new Agent({
  name: 'chat-agent',
  instructions: [
    'You are a helpful AI assistant.',
    'When a prompt references files or code, use the get-file-from-object-store tool to retrieve the exact content before answering.',
    'Always mention the object key(s) you consulted, adapt verbosity to user directions, and escalate with follow-up questions when context is ambiguous.',
  ].join(' '),
  // 使用 @ai-sdk/openai 通过 OPENAI_BASE_URL 兼容层访问智谱 AI GLM-4.7
  // 需要配置环境变量：OPENAI_API_KEY + OPENAI_BASE_URL=https://open.bigmodel.cn/api/paas/v4
  model: openai('glm-4.7'),
  tools: {
    getFileFromObjectStore,
  },
});
