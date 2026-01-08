/**
 * PR Creator Workflow - Resume Endpoint
 *
 * POST /api/workflow/pr-creator/resume
 * 恢复暂停的 PR Creator 工作流
 *
 * 参考文档:
 * - https://mastra.ai/docs/v1/workflows/suspend-and-resume
 * - https://mastra.ai/docs/v1/workflows/human-in-the-loop
 */

import { json } from '@tanstack/react-start';
import { createFileRoute } from '@tanstack/react-router';
import { mastra } from '~/mastra';

export const Route = createFileRoute('/api/workflow/pr-creator/resume')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const { runId, step, resumeData } = body;
          console.log('[api:pr-creator:resume] Request:', { runId, step, resumeData });

          if (!runId) {
            return json({ error: 'runId is required' }, { status: 400 });
          }

          // Get the workflow
          const workflow = mastra.getWorkflow('pr-creator');
          if (!workflow) {
            return json({ error: 'Workflow not found' }, { status: 404 });
          }

          // 恢复已有 run：传入 runId 参数
          // 参见: https://mastra.ai/docs/v1/workflows/snapshots
          const run = await workflow.createRun({ runId });

          // step 参数可以直接传字符串，不需要包装成 { stepId: step }
          // 如果只有一个 step 被暂停，可以省略 step 参数
          const result = await run.resume({
            step: step || undefined,
            resumeData,
          });
          console.log('[api:pr-creator:resume] Result status:', result.status);

          // Check the status
          if (result.status === 'suspended') {
            // result.suspended 是一个数组，每个元素是 step ID（或嵌套工作流的路径数组）
            // 例如: ["clarify-questions"] 或 [["nested", "step"]]
            const suspendedEntry = result.suspended?.[0];

            // suspended 可能是字符串或数组（嵌套工作流路径）
            let stepId: string | undefined;
            if (typeof suspendedEntry === 'string') {
              stepId = suspendedEntry;
            } else if (Array.isArray(suspendedEntry) && suspendedEntry.length > 0) {
              // 对于嵌套路径，取最后一个元素作为 stepId
              stepId = suspendedEntry[suspendedEntry.length - 1];
            }

            // 通过 result.steps[stepId].suspendPayload 访问暂停时传递的数据
            const suspendPayload = stepId ? result.steps?.[stepId]?.suspendPayload : null;

            console.log('[api:pr-creator:resume] Suspended at step:', stepId);

            return json({
              runId: run.runId,
              status: 'suspended',
              suspendedStep: stepId,
              suspendPayload: suspendPayload || null,
            });
          }

          if (result.status === 'success') {
            return json({
              runId: run.runId,
              status: 'success',
              result: result.result,
            });
          }

          if (result.status === 'failed') {
            return json(
              {
                runId: run.runId,
                status: 'failed',
                error: result.error?.message || 'Workflow failed',
              },
              { status: 500 }
            );
          }

          return json({
            runId: run.runId,
            status: result.status,
          });
        } catch (error) {
          console.error('POST /api/workflow/pr-creator/resume error:', error);
          const message = error instanceof Error ? error.message : 'Unexpected error';
          return json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
