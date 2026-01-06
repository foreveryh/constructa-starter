import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { readObjectText } from '../tools/storage';

/**
 * Step 1: 从 S3 获取文件内容
 */
const fetchFileStep = createStep({
  id: 'fetch-file',
  inputSchema: z.object({
    key: z.string().min(1).describe('S3 object key'),
  }),
  outputSchema: z.object({
    key: z.string(),
    content: z.string(),
    size: z.number(),
  }),
  execute: async ({ inputData }) => {
    const content = await readObjectText(inputData.key);
    return {
      key: inputData.key,
      content,
      size: content.length,
    };
  },
});

/**
 * Step 2: 分析文件基本信息
 */
const analyzeFileStep = createStep({
  id: 'analyze-file',
  inputSchema: z.object({
    key: z.string(),
    content: z.string(),
    size: z.number(),
  }),
  outputSchema: z.object({
    key: z.string(),
    size: z.number(),
    lineCount: z.number(),
    wordCount: z.number(),
    extension: z.string(),
  }),
  execute: async ({ inputData }) => {
    const { key, content, size } = inputData;
    const lines = content.split('\n');
    const words = content.split(/\s+/).filter(Boolean);
    const extension = key.split('.').pop() || '';

    return {
      key,
      size,
      lineCount: lines.length,
      wordCount: words.length,
      extension,
    };
  },
});

/**
 * File Summary Workflow
 * 获取文件并分析基本统计信息
 */
export const fileSummaryWorkflow = createWorkflow({
  id: 'file-summary',
  inputSchema: z.object({
    key: z.string().min(1).describe('S3 object key to analyze'),
  }),
  outputSchema: z.object({
    key: z.string(),
    size: z.number(),
    lineCount: z.number(),
    wordCount: z.number(),
    extension: z.string(),
  }),
})
  .then(fetchFileStep)
  .then(analyzeFileStep)
  .commit();
