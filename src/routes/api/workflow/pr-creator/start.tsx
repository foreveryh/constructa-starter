/**
 * PR Creator Workflow - Start Endpoint
 *
 * POST /api/workflow/pr-creator/start
 * 启动 PR Creator 工作流
 *
 * 参考文档:
 * - https://mastra.ai/docs/v1/workflows/suspend-and-resume
 * - https://mastra.ai/docs/v1/workflows/human-in-the-loop
 */

import { json } from '@tanstack/react-start';
import { createFileRoute } from '@tanstack/react-router';
import { mastra } from '~/mastra';

export const Route = createFileRoute('/api/workflow/pr-creator/start')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        console.log('========================================');
        console.log('[api:pr-creator:start] Received request at', new Date().toISOString());
        console.log('========================================');

        try {
          const body = await request.json();
          console.log('[api:pr-creator:start] Request body keys:', Object.keys(body));

          // Check environment
          console.log('[api:pr-creator:start] Checking environment...');
          console.log('[api:pr-creator:start] ZHIPU_API_KEY set:', !!process.env.ZHIPU_API_KEY);
          console.log('[api:pr-creator:start] DATABASE_URL set:', !!process.env.DATABASE_URL);

          // Get the workflow
          console.log('[api:pr-creator:start] Getting workflow from mastra...');
          const workflow = mastra.getWorkflow('pr-creator');
          if (!workflow) {
            console.error('[api:pr-creator:start] ❌ Workflow not found!');
            return json({ error: 'Workflow not found' }, { status: 404 });
          }
          console.log('[api:pr-creator:start] ✓ Workflow found:', workflow.id);

          // Check agent
          console.log('[api:pr-creator:start] Checking agent availability...');
          const agent = mastra.getAgent('pr-writer-agent');
          console.log('[api:pr-creator:start] Agent found:', !!agent);
          if (agent) {
            console.log('[api:pr-creator:start] Agent model:', (agent as any).model);
          }

          // Create a new run
          console.log('[api:pr-creator:start] Creating run...');
          const run = await workflow.createRun();
          console.log('[api:pr-creator:start] ✓ Run created:', run.runId);

          // Start the workflow
          console.log('[api:pr-creator:start] Starting workflow execution...');
          console.log('[api:pr-creator:start] This may take a while if LLM is being called...');
          const startTime = Date.now();

          const result = await run.start({
            inputData: body,
          });

          console.log(`[api:pr-creator:start] ✓ Workflow completed in ${Date.now() - startTime}ms`);
          console.log('[api:pr-creator:start] Result status:', result.status);
          console.log('[api:pr-creator:start] Result keys:', Object.keys(result));

          // Check the status
          if (result.status === 'suspended') {
            const suspendedEntry = result.suspended?.[0];
            console.log('[api:pr-creator:start] Suspended steps:', result.suspended);
            console.log('[api:pr-creator:start] Suspended entry type:', typeof suspendedEntry, Array.isArray(suspendedEntry));

            // suspended 可能是字符串或数组（嵌套工作流路径）
            // 例如: "clarify-questions" 或 ["clarify-questions"]
            let stepId: string | undefined;
            if (typeof suspendedEntry === 'string') {
              stepId = suspendedEntry;
            } else if (Array.isArray(suspendedEntry) && suspendedEntry.length > 0) {
              // 对于嵌套路径，取最后一个元素作为 stepId
              stepId = suspendedEntry[suspendedEntry.length - 1];
            }

            console.log('[api:pr-creator:start] Resolved step ID:', stepId);

            // 获取 suspendPayload
            const suspendPayload = stepId ? result.steps?.[stepId]?.suspendPayload : null;

            console.log('[api:pr-creator:start] Suspend payload keys:', suspendPayload ? Object.keys(suspendPayload) : 'null');
            console.log('[api:pr-creator:start] Suspend payload:', JSON.stringify(suspendPayload, null, 2)?.substring(0, 500));

            return json({
              runId: run.runId,
              status: 'suspended',
              suspendedStep: stepId,
              suspendPayload: suspendPayload || null,
            });
          }

          if (result.status === 'success') {
            console.log('[api:pr-creator:start] Workflow succeeded');
            return json({
              runId: run.runId,
              status: 'success',
              result: result.result,
            });
          }

          if (result.status === 'failed') {
            console.error('[api:pr-creator:start] ❌ Workflow failed:', result.error);
            return json(
              {
                runId: run.runId,
                status: 'failed',
                error: result.error?.message || 'Workflow failed',
              },
              { status: 500 }
            );
          }

          console.log('[api:pr-creator:start] Unknown status:', result.status);
          return json({
            runId: run.runId,
            status: result.status,
          });
        } catch (error) {
          console.error('========================================');
          console.error('[api:pr-creator:start] ❌ CAUGHT ERROR:', error);
          console.error('========================================');
          const message = error instanceof Error ? error.message : 'Unexpected error';
          return json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
