import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';

// ============================================================================
// Schema Definitions
// ============================================================================

/**
 * Brief Schema - 客户简报
 */
const briefSchema = z.object({
  client: z.string().describe('客户/品牌名称'),
  project: z.string().describe('项目名称'),
  objective: z
    .enum(['awareness', 'product_launch', 'crisis', 'event', 'partnership', 'funding', 'award'])
    .describe('PR 目标'),
  targetMedia: z.array(z.string()).describe('目标媒体类型'),
  targetAudience: z.string().describe('目标受众'),
  deadline: z.string().optional().describe('截止日期'),
  tone: z.enum(['formal', 'casual', 'excited', 'professional']).optional().describe('期望语气'),
});

/**
 * Facts Schema - 事实素材
 */
const factsSchema = z.object({
  keyFacts: z.array(z.string()).min(1).describe('核心事实点'),
  quotes: z.array(z.string()).optional().describe('可用引言'),
  data: z.array(z.string()).optional().describe('数据/数字'),
  background: z.string().optional().describe('背景信息'),
  attachments: z.array(z.string()).optional().describe('附件/参考资料链接'),
});

/**
 * Workflow Input Schema
 */
const workflowInputSchema = z.object({
  brief: briefSchema,
  facts: factsSchema,
  additionalNotes: z.string().optional().describe('补充说明'),
});

/**
 * Question Schema - AI 生成的澄清问题
 */
const questionSchema = z.object({
  id: z.string(),
  question: z.string(),
  importance: z.enum(['high', 'medium', 'low']),
  context: z.string().describe('为什么需要这个信息'),
});

/**
 * Analysis Result Schema - AI 分析结果
 */
const analysisResultSchema = z.object({
  strengths: z.array(z.string()).describe('素材优势'),
  gaps: z.array(z.string()).describe('信息缺口'),
  contradictions: z.array(z.string()).describe('矛盾点'),
  suggestedAngle: z.string().describe('建议的 PR 角度'),
  questions: z.array(questionSchema).describe('需要澄清的问题'),
  canProceedWithoutClarification: z.boolean().describe('是否可以不澄清直接继续'),
});

/**
 * PR Draft Schema - PR 稿件
 */
const prDraftSchema = z.object({
  title: z.string().describe('PR 标题'),
  subtitle: z.string().optional().describe('副标题'),
  lead: z.string().describe('导语'),
  body: z.string().describe('正文'),
  boilerplate: z.string().describe('样板段（公司介绍）'),
  keyMessages: z.array(z.string()).describe('核心要点'),
  suggestedMedia: z.array(z.string()).optional().describe('建议配图/素材'),
});

// ============================================================================
// Step 1: Analyze Brief
// ============================================================================

const analyzeBriefStep = createStep({
  id: 'analyze-brief',
  description: '分析 Brief 和 Facts，识别缺失信息并生成澄清问题',
  inputSchema: workflowInputSchema,
  outputSchema: z.object({
    analysis: analysisResultSchema,
    originalInput: workflowInputSchema,
  }),
  execute: async ({ inputData, mastra }) => {
    console.log('[pr-creator:analyze-brief] Starting analysis...');
    console.log('[pr-creator:analyze-brief] Input:', JSON.stringify(inputData, null, 2));

    const agent = mastra?.getAgent('pr-writer-agent');
    if (!agent) {
      console.error('[pr-creator:analyze-brief] Agent not found!');
      throw new Error('PR Writer Agent not found');
    }
    console.log('[pr-creator:analyze-brief] Agent found, preparing prompt...');

    const prompt = `请分析以下 PR Brief 和 Facts，识别信息缺口并提出澄清问题。

## Brief
- 客户: ${inputData.brief.client}
- 项目: ${inputData.brief.project}
- 目标: ${inputData.brief.objective}
- 目标媒体: ${inputData.brief.targetMedia.join(', ')}
- 目标受众: ${inputData.brief.targetAudience}
${inputData.brief.tone ? `- 语气: ${inputData.brief.tone}` : ''}
${inputData.brief.deadline ? `- 截止日期: ${inputData.brief.deadline}` : ''}

## Facts
### 核心事实
${inputData.facts.keyFacts.map((f, i) => `${i + 1}. ${f}`).join('\n')}

${inputData.facts.quotes?.length ? `### 可用引言\n${inputData.facts.quotes.map((q) => `- "${q}"`).join('\n')}` : ''}
${inputData.facts.data?.length ? `### 数据\n${inputData.facts.data.map((d) => `- ${d}`).join('\n')}` : ''}
${inputData.facts.background ? `### 背景\n${inputData.facts.background}` : ''}

${inputData.additionalNotes ? `## 补充说明\n${inputData.additionalNotes}` : ''}

请严格按以下 JSON 格式输出分析结果（只输出 JSON，不要其他内容）：
{
  "strengths": ["素材优势1", "素材优势2"],
  "gaps": ["信息缺口1", "信息缺口2"],
  "contradictions": [],
  "suggestedAngle": "建议的 PR 角度",
  "questions": [
    {
      "id": "q1",
      "question": "问题内容",
      "importance": "high",
      "context": "为什么需要这个信息"
    }
  ],
  "canProceedWithoutClarification": false
}

注意：
- questions 数组中每个问题的 importance 只能是 "high"、"medium" 或 "low"
- 如果没有高优先级问题，canProceedWithoutClarification 可以为 true`;

    // Use structuredOutput with jsonPromptInjection for GLM compatibility
    let analysis: z.infer<typeof analysisResultSchema>;

    console.log('[pr-creator:analyze-brief] Calling agent.generate() with structuredOutput...');
    const startTime = Date.now();

    try {
      const response = await agent.generate(prompt, {
        structuredOutput: {
          schema: analysisResultSchema,
          jsonPromptInjection: true, // GLM doesn't support native response_format
          errorStrategy: 'fallback',
          fallbackValue: {
            strengths: ['已提供基本项目信息'],
            gaps: ['需要更多细节来优化稿件'],
            contradictions: [],
            suggestedAngle: `${inputData.brief.client} ${inputData.brief.project}`,
            questions: [
              {
                id: 'q1',
                question: '您希望这篇稿件传达的核心信息是什么？',
                importance: 'high' as const,
                context: '明确核心信息有助于撰写更精准的稿件',
              },
            ],
            canProceedWithoutClarification: true,
          },
        },
      });

      console.log(`[pr-creator:analyze-brief] Agent responded in ${Date.now() - startTime}ms`);
      console.log('[pr-creator:analyze-brief] Response object:', response.object ? 'present' : 'undefined');
      console.log('[pr-creator:analyze-brief] Response text length:', response.text?.length || 0);

      analysis = response.object!;
      console.log('[pr-creator:analyze-brief] Got structured output successfully');
    } catch (error) {
      console.error('[pr-creator:analyze-brief] Error:', error);
      // Fallback
      console.log('[pr-creator:analyze-brief] Using fallback response');
      analysis = {
        strengths: ['已提供基本项目信息'],
        gaps: ['需要更多细节来优化稿件'],
        contradictions: [],
        suggestedAngle: `${inputData.brief.client} ${inputData.brief.project}`,
        questions: [
          {
            id: 'q1',
            question: '您希望这篇稿件传达的核心信息是什么？',
            importance: 'high' as const,
            context: '明确核心信息有助于撰写更精准的稿件',
          },
        ],
        canProceedWithoutClarification: true,
      };
    }

    console.log('[pr-creator:analyze-brief] Returning analysis result');
    return {
      analysis,
      originalInput: inputData,
    };
  },
});

// ============================================================================
// Step 2: Clarify Questions (Suspend/Resume)
// ============================================================================

const clarifyQuestionsStep = createStep({
  id: 'clarify-questions',
  description: '等待用户回答澄清问题',
  inputSchema: z.object({
    analysis: analysisResultSchema,
    originalInput: workflowInputSchema,
  }),
  outputSchema: z.object({
    analysis: analysisResultSchema,
    originalInput: workflowInputSchema,
    clarifications: z.record(z.string(), z.string()).describe('问题ID -> 用户回答'),
  }),
  suspendSchema: z.object({
    message: z.string(),
    questions: z.array(questionSchema),
    analysis: analysisResultSchema,
    originalInput: workflowInputSchema,
    canSkip: z.boolean(),
  }),
  resumeSchema: z.object({
    answers: z.record(z.string(), z.string()).describe('问题ID -> 用户回答'),
    skipClarification: z.boolean().optional().describe('跳过澄清直接生成'),
  }),
  // 参考文档: https://mastra.ai/docs/v1/workflows/suspend-and-resume#accessing-suspend-data-with-suspenddata
  execute: async ({ inputData, resumeData, suspend, suspendData }) => {
    // 如果用户已回答或选择跳过
    if (resumeData) {
      // 使用 suspendData 恢复暂停时保存的上下文
      // suspendData 包含调用 suspend() 时传入的数据
      const savedAnalysis = suspendData?.analysis || inputData.analysis;
      const savedOriginalInput = suspendData?.originalInput || inputData.originalInput;

      return {
        analysis: savedAnalysis,
        originalInput: savedOriginalInput,
        clarifications: resumeData.skipClarification ? {} : resumeData.answers,
      };
    }

    // 如果可以不澄清直接继续，且没有高优先级问题
    const highPriorityQuestions = inputData.analysis.questions.filter(
      (q) => q.importance === 'high'
    );

    if (inputData.analysis.canProceedWithoutClarification && highPriorityQuestions.length === 0) {
      return {
        analysis: inputData.analysis,
        originalInput: inputData.originalInput,
        clarifications: {},
      };
    }

    // 暂停等待用户澄清
    // suspend() 的参数会保存到 suspendPayload，resume 后可通过 suspendData 访问
    return await suspend({
      message: '请回答以下问题以帮助我们生成更好的 PR 稿件',
      questions: inputData.analysis.questions,
      analysis: inputData.analysis,
      originalInput: inputData.originalInput,
      canSkip: inputData.analysis.canProceedWithoutClarification,
    });
  },
});

// ============================================================================
// Step 3: Generate Draft (Streaming)
// ============================================================================

const generateDraftStep = createStep({
  id: 'generate-draft',
  description: '基于完整信息生成 PR 稿件',
  inputSchema: z.object({
    analysis: analysisResultSchema,
    originalInput: workflowInputSchema,
    clarifications: z.record(z.string(), z.string()),
  }),
  outputSchema: z.object({
    draft: prDraftSchema,
    originalInput: workflowInputSchema,
  }),
  execute: async ({ inputData, mastra, writer }) => {
    const agent = mastra?.getAgent('pr-writer-agent');
    if (!agent) {
      throw new Error('PR Writer Agent not found');
    }

    // 构建澄清信息
    const clarificationText =
      Object.keys(inputData.clarifications).length > 0
        ? `\n## 补充澄清\n${Object.entries(inputData.clarifications)
            .map(([qId, answer]) => {
              const question = inputData.analysis.questions.find((q) => q.id === qId);
              return `Q: ${question?.question || qId}\nA: ${answer}`;
            })
            .join('\n\n')}`
        : '';

    const prompt = `请根据以下信息撰写一篇专业的 PR 稿件。

## Brief
- 客户: ${inputData.originalInput.brief.client}
- 项目: ${inputData.originalInput.brief.project}
- 目标: ${inputData.originalInput.brief.objective}
- 目标媒体: ${inputData.originalInput.brief.targetMedia.join(', ')}
- 目标受众: ${inputData.originalInput.brief.targetAudience}
${inputData.originalInput.brief.tone ? `- 语气: ${inputData.originalInput.brief.tone}` : ''}

## Facts
### 核心事实
${inputData.originalInput.facts.keyFacts.map((f, i) => `${i + 1}. ${f}`).join('\n')}

${inputData.originalInput.facts.quotes?.length ? `### 可用引言\n${inputData.originalInput.facts.quotes.map((q) => `- "${q}"`).join('\n')}` : ''}
${inputData.originalInput.facts.data?.length ? `### 数据\n${inputData.originalInput.facts.data.map((d) => `- ${d}`).join('\n')}` : ''}
${inputData.originalInput.facts.background ? `### 背景\n${inputData.originalInput.facts.background}` : ''}

## 分析建议
- 建议角度: ${inputData.analysis.suggestedAngle}
- 素材优势: ${inputData.analysis.strengths.join(', ')}
${clarificationText}

请严格按以下 JSON 格式输出 PR 稿件（只输出 JSON，不要其他内容）：
{
  "title": "标题（15-25字，突出新闻点）",
  "subtitle": "副标题（可选，可以为空字符串）",
  "lead": "导语（100字以内，概括5W1H）",
  "body": "正文（遵循倒金字塔结构，多段落用\\n\\n分隔）",
  "boilerplate": "样板段（公司介绍）",
  "keyMessages": ["核心要点1", "核心要点2", "核心要点3"],
  "suggestedMedia": ["建议配图1", "建议配图2"]
}`;

    // 进度通知
    await writer?.custom({
      type: 'progress',
      data: {
        status: 'in-progress',
        message: '正在生成 PR 稿件...',
        stage: 'generate-draft',
      },
    });

    // Use structuredOutput with jsonPromptInjection for GLM compatibility
    let draft: z.infer<typeof prDraftSchema>;

    console.log('[pr-creator:generate-draft] Calling agent.generate() with structuredOutput...');
    const genStartTime = Date.now();

    try {
      const response = await agent.generate(prompt, {
        structuredOutput: {
          schema: prDraftSchema,
          jsonPromptInjection: true, // GLM doesn't support native response_format
          errorStrategy: 'fallback',
          fallbackValue: {
            title: `${inputData.originalInput.brief.client} ${inputData.originalInput.brief.project}`,
            lead: `${inputData.originalInput.brief.client}宣布${inputData.originalInput.brief.project}。`,
            body: inputData.originalInput.facts.keyFacts.join('\n\n'),
            boilerplate: `关于 ${inputData.originalInput.brief.client}`,
            keyMessages: inputData.originalInput.facts.keyFacts.slice(0, 3),
          },
        },
      });

      console.log(`[pr-creator:generate-draft] Agent responded in ${Date.now() - genStartTime}ms`);
      console.log('[pr-creator:generate-draft] Response object:', response.object ? 'present' : 'undefined');

      draft = response.object!;
      console.log('[pr-creator:generate-draft] Got structured output successfully');
    } catch (error) {
      console.error('[pr-creator:generate-draft] Error:', error);
      // Fallback
      console.log('[pr-creator:generate-draft] Using fallback draft');
      draft = {
        title: `${inputData.originalInput.brief.client} ${inputData.originalInput.brief.project}`,
        lead: `${inputData.originalInput.brief.client}宣布${inputData.originalInput.brief.project}。`,
        body: inputData.originalInput.facts.keyFacts.join('\n\n'),
        boilerplate: `关于 ${inputData.originalInput.brief.client}`,
        keyMessages: inputData.originalInput.facts.keyFacts.slice(0, 3),
      };
    }

    await writer?.custom({
      type: 'progress',
      data: {
        status: 'done',
        message: 'PR 稿件生成完成',
        stage: 'generate-draft',
      },
    });

    return {
      draft,
      originalInput: inputData.originalInput,
    };
  },
});

// ============================================================================
// Step 4: Human Review (Optional Suspend/Resume)
// ============================================================================

const humanReviewStep = createStep({
  id: 'human-review',
  description: '人工审核稿件',
  inputSchema: z.object({
    draft: prDraftSchema,
    originalInput: workflowInputSchema,
  }),
  outputSchema: z.object({
    draft: prDraftSchema,
    approved: z.boolean(),
    feedback: z.string().optional(),
  }),
  suspendSchema: z.object({
    message: z.string(),
    draft: prDraftSchema,
  }),
  resumeSchema: z.object({
    approved: z.boolean(),
    feedback: z.string().optional().describe('修改意见（如果不通过）'),
  }),
  // 参考文档: https://mastra.ai/docs/v1/workflows/human-in-the-loop
  execute: async ({ inputData, resumeData, suspend, suspendData }) => {
    if (resumeData) {
      // 使用 suspendData 恢复暂停时保存的上下文
      const savedDraft = suspendData?.draft || inputData.draft;

      return {
        draft: savedDraft,
        approved: resumeData.approved,
        feedback: resumeData.feedback,
      };
    }

    // 暂停等待人工审核
    return await suspend({
      message: '请审核 PR 稿件',
      draft: inputData.draft,
    });
  },
});

// ============================================================================
// Step 5: Finalize
// ============================================================================

const finalizeStep = createStep({
  id: 'finalize',
  description: '输出最终版本',
  inputSchema: z.object({
    draft: prDraftSchema,
    approved: z.boolean(),
    feedback: z.string().optional(),
  }),
  outputSchema: z.object({
    status: z.enum(['approved', 'needs_revision']),
    draft: prDraftSchema,
    feedback: z.string().optional(),
    fullText: z.string().describe('完整稿件文本'),
  }),
  execute: async ({ inputData }) => {
    const { draft, approved, feedback } = inputData;

    // 组装完整稿件文本
    const fullText = `# ${draft.title}
${draft.subtitle ? `## ${draft.subtitle}\n` : ''}
${draft.lead}

${draft.body}

---

**关于 ${draft.boilerplate.split('是')[0] || '公司'}**

${draft.boilerplate}

---

**核心要点：**
${draft.keyMessages.map((m) => `- ${m}`).join('\n')}
`;

    return {
      status: approved ? 'approved' : 'needs_revision',
      draft,
      feedback,
      fullText,
    };
  },
});

// ============================================================================
// Workflow Assembly
// ============================================================================

export const prCreatorWorkflow = createWorkflow({
  id: 'pr-creator',
  description: 'PR 稿件创作工作流：Brief/Facts 输入 → AI 分析提问 → 用户澄清 → 生成稿件 → 审批',
  inputSchema: workflowInputSchema,
  outputSchema: z.object({
    status: z.enum(['approved', 'needs_revision']),
    draft: prDraftSchema,
    feedback: z.string().optional(),
    fullText: z.string(),
  }),
})
  .then(analyzeBriefStep)
  .then(clarifyQuestionsStep)
  .then(generateDraftStep)
  .then(humanReviewStep)
  .then(finalizeStep)
  .commit();
