/**
 * PR Creator Workflow Page
 *
 * 多步骤的 PR 稿件创作流程：
 * 1. 输入 Brief 和 Facts
 * 2. AI 分析并提出澄清问题
 * 3. 用户回答问题
 * 4. AI 生成稿件
 * 5. 审批/修改
 * 6. 最终输出
 */

import { createFileRoute, Link } from '@tanstack/react-router';
import { AuthLoading, RedirectToSignIn, SignedIn } from '@daveyplate/better-auth-ui';
import { useState, useCallback } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Send,
  FileText,
  MessageSquare,
  CheckCircle,
  Loader2,
  AlertCircle,
  Copy,
  Download,
  RotateCcw,
} from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Textarea } from '~/components/ui/textarea';
import { Badge } from '~/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { Alert, AlertDescription } from '~/components/ui/alert';
import { Separator } from '~/components/ui/separator';
import { cn } from '~/lib/utils';

export const Route = createFileRoute('/agents/ai-workflow/pr-creator')({
  component: RouteComponent,
});

// ============================================================================
// Types
// ============================================================================

type WorkflowStep = 'input' | 'analyzing' | 'clarify' | 'generating' | 'review' | 'done';

interface BriefData {
  client: string;
  project: string;
  objective: string;
  targetMedia: string[];
  targetAudience: string;
  tone: string;
}

interface FactsData {
  keyFacts: string[];
  quotes: string[];
  data: string[];
  background: string;
}

interface Question {
  id: string;
  question: string;
  importance: 'high' | 'medium' | 'low';
  context: string;
}

interface AnalysisResult {
  strengths: string[];
  gaps: string[];
  suggestedAngle: string;
  questions: Question[];
  canProceedWithoutClarification: boolean;
}

interface PRDraft {
  title: string;
  subtitle?: string;
  lead: string;
  body: string;
  boilerplate: string;
  keyMessages: string[];
}

// ============================================================================
// Main Component
// ============================================================================

function RouteComponent() {
  return (
    <div className="container mx-auto h-full px-4 py-6">
      <AuthLoading>
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          正在检查登录状态…
        </div>
      </AuthLoading>

      <RedirectToSignIn />

      <SignedIn>
        <PRCreatorWorkflow />
      </SignedIn>
    </div>
  );
}

function PRCreatorWorkflow() {
  // Workflow state
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('input');
  const [runId, setRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Data state
  const [brief, setBrief] = useState<BriefData>({
    client: '',
    project: '',
    objective: 'product_launch',
    targetMedia: [],
    targetAudience: '',
    tone: 'professional',
  });
  const [facts, setFacts] = useState<FactsData>({
    keyFacts: [''],
    quotes: [''],
    data: [''],
    background: '',
  });
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<PRDraft | null>(null);
  const [fullText, setFullText] = useState<string>('');

  // Start workflow
  const handleStartWorkflow = useCallback(async () => {
    console.log('[pr-creator:frontend] Starting workflow...');
    setCurrentStep('analyzing');
    setError(null);

    try {
      const requestBody = {
        brief,
        facts: {
          ...facts,
          keyFacts: facts.keyFacts.filter((f) => f.trim()),
          quotes: facts.quotes.filter((q) => q.trim()),
          data: facts.data.filter((d) => d.trim()),
        },
        additionalNotes,
      };
      console.log('[pr-creator:frontend] Request body:', requestBody);

      const startTime = Date.now();
      console.log('[pr-creator:frontend] Calling /api/workflow/pr-creator/start...');

      const response = await fetch('/api/workflow/pr-creator/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      console.log(`[pr-creator:frontend] Response received in ${Date.now() - startTime}ms`);
      console.log('[pr-creator:frontend] Response status:', response.status);

      const result = await response.json();
      console.log('[pr-creator:frontend] Response data:', result);

      if (!response.ok) {
        throw new Error(result.error || '启动工作流失败');
      }

      setRunId(result.runId);

      // 注意：API 返回 suspendPayload，不是 suspendedData
      if (result.status === 'suspended' && result.suspendPayload) {
        console.log('[pr-creator:frontend] Workflow suspended, parsing suspendPayload...');
        // Workflow suspended for clarification
        setAnalysis({
          strengths: result.suspendPayload.analysis?.strengths || [],
          gaps: result.suspendPayload.analysis?.gaps || [],
          suggestedAngle: result.suspendPayload.analysis?.suggestedAngle || '',
          questions: result.suspendPayload.questions || [],
          canProceedWithoutClarification: result.suspendPayload.canSkip || false,
        });
        setCurrentStep('clarify');
      } else if (result.status === 'success') {
        console.log('[pr-creator:frontend] Workflow succeeded directly');
        // Direct to draft (no clarification needed)
        setDraft(result.result?.draft);
        setFullText(result.result?.fullText || '');
        setCurrentStep('review');
      } else {
        console.log('[pr-creator:frontend] Unexpected status:', result.status);
      }
    } catch (err) {
      console.error('[pr-creator:frontend] Error:', err);
      setError(err instanceof Error ? err.message : '发生未知错误');
      setCurrentStep('input');
    }
  }, [brief, facts, additionalNotes]);

  // Resume workflow with answers
  const handleSubmitAnswers = useCallback(async () => {
    if (!runId) return;

    setCurrentStep('generating');
    setError(null);

    try {
      const response = await fetch('/api/workflow/pr-creator/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runId,
          step: 'clarify-questions',
          resumeData: { answers, skipClarification: false },
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || '继续工作流失败');
      }

      if (result.status === 'suspended' && result.suspendedStep === 'human-review') {
        // Workflow suspended for review
        // 注意：API 返回 suspendPayload，不是 suspendedData
        setDraft(result.suspendPayload?.draft);
        setCurrentStep('review');
      } else if (result.status === 'success') {
        setDraft(result.result?.draft);
        setFullText(result.result?.fullText || '');
        setCurrentStep('done');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '发生未知错误');
      setCurrentStep('clarify');
    }
  }, [runId, answers]);

  // Skip clarification
  const handleSkipClarification = useCallback(async () => {
    if (!runId) return;

    setCurrentStep('generating');
    setError(null);

    try {
      const response = await fetch('/api/workflow/pr-creator/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runId,
          step: 'clarify-questions',
          resumeData: { answers: {}, skipClarification: true },
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || '继续工作流失败');
      }

      if (result.status === 'suspended' && result.suspendedStep === 'human-review') {
        setDraft(result.suspendedData?.draft);
        setCurrentStep('review');
      } else if (result.status === 'success') {
        setDraft(result.result?.draft);
        setFullText(result.result?.fullText || '');
        setCurrentStep('done');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '发生未知错误');
      setCurrentStep('clarify');
    }
  }, [runId]);

  // Approve draft
  const handleApproveDraft = useCallback(async () => {
    if (!runId) return;

    setError(null);

    try {
      const response = await fetch('/api/workflow/pr-creator/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runId,
          step: 'human-review',
          resumeData: { approved: true },
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || '审批失败');
      }

      setFullText(result.result?.fullText || '');
      setCurrentStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : '发生未知错误');
    }
  }, [runId]);

  // Reset workflow
  const handleReset = useCallback(() => {
    setCurrentStep('input');
    setRunId(null);
    setError(null);
    setBrief({
      client: '',
      project: '',
      objective: 'product_launch',
      targetMedia: [],
      targetAudience: '',
      tone: 'professional',
    });
    setFacts({
      keyFacts: [''],
      quotes: [''],
      data: [''],
      background: '',
    });
    setAdditionalNotes('');
    setAnalysis(null);
    setAnswers({});
    setDraft(null);
    setFullText('');
  }, []);

  return (
    <div className="flex h-full flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/agents/ai-workflow" search={{ workflow: undefined }}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">PR Creator</h1>
          <p className="text-sm text-muted-foreground">智能 PR 稿件创作工作流</p>
        </div>
      </div>

      {/* Progress indicator */}
      <StepIndicator currentStep={currentStep} />

      {/* Error alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Step content */}
      <div className="flex-1 overflow-auto">
        {currentStep === 'input' && (
          <InputStep
            brief={brief}
            setBrief={setBrief}
            facts={facts}
            setFacts={setFacts}
            additionalNotes={additionalNotes}
            setAdditionalNotes={setAdditionalNotes}
            onSubmit={handleStartWorkflow}
          />
        )}

        {currentStep === 'analyzing' && <LoadingStep message="AI 正在分析您的 Brief 和 Facts…" />}

        {currentStep === 'clarify' && analysis && (
          <ClarifyStep
            analysis={analysis}
            answers={answers}
            setAnswers={setAnswers}
            onSubmit={handleSubmitAnswers}
            onSkip={handleSkipClarification}
          />
        )}

        {currentStep === 'generating' && <LoadingStep message="AI 正在生成 PR 稿件…" />}

        {currentStep === 'review' && draft && (
          <ReviewStep draft={draft} onApprove={handleApproveDraft} onReset={handleReset} />
        )}

        {currentStep === 'done' && draft && (
          <DoneStep draft={draft} fullText={fullText} onReset={handleReset} />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Step Components
// ============================================================================

function StepIndicator({ currentStep }: { currentStep: WorkflowStep }) {
  const steps = [
    { id: 'input', label: '输入素材', icon: FileText },
    { id: 'clarify', label: '澄清确认', icon: MessageSquare },
    { id: 'review', label: '审核稿件', icon: CheckCircle },
  ];

  const getStepStatus = (stepId: string) => {
    const order = ['input', 'analyzing', 'clarify', 'generating', 'review', 'done'];
    const currentIndex = order.indexOf(currentStep);

    if (currentStep === 'done') return 'completed';
    if (stepId === 'input' && currentIndex > 0) return 'completed';
    if (stepId === 'clarify' && (currentIndex >= order.indexOf('generating'))) return 'completed';
    // 'review' step 在 'done' 时完成，但 'done' 已在上面处理
    if (stepId === 'review' && currentIndex >= order.indexOf('done')) return 'completed';

    if (stepId === 'input' && currentIndex === 0) return 'current';
    if (stepId === 'clarify' && (currentStep === 'analyzing' || currentStep === 'clarify')) return 'current';
    if (stepId === 'review' && (currentStep === 'generating' || currentStep === 'review')) return 'current';

    return 'pending';
  };

  return (
    <div className="flex items-center justify-center gap-2">
      {steps.map((step, index) => {
        const status = getStepStatus(step.id);
        const Icon = step.icon;

        return (
          <div key={step.id} className="flex items-center">
            <div
              className={cn(
                'flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors',
                status === 'current' && 'bg-primary text-primary-foreground',
                status === 'completed' && 'bg-green-100 text-green-700',
                status === 'pending' && 'bg-muted text-muted-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {step.label}
            </div>
            {index < steps.length - 1 && (
              <ArrowRight className="mx-2 h-4 w-4 text-muted-foreground" />
            )}
          </div>
        );
      })}
    </div>
  );
}

function LoadingStep({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-muted-foreground">{message}</p>
    </div>
  );
}

// ============================================================================
// Input Step
// ============================================================================

interface InputStepProps {
  brief: BriefData;
  setBrief: React.Dispatch<React.SetStateAction<BriefData>>;
  facts: FactsData;
  setFacts: React.Dispatch<React.SetStateAction<FactsData>>;
  additionalNotes: string;
  setAdditionalNotes: (value: string) => void;
  onSubmit: () => void;
}

function InputStep({
  brief,
  setBrief,
  facts,
  setFacts,
  additionalNotes,
  setAdditionalNotes,
  onSubmit,
}: InputStepProps) {
  const isValid =
    brief.client.trim() &&
    brief.project.trim() &&
    brief.targetAudience.trim() &&
    facts.keyFacts.some((f) => f.trim());

  const addArrayItem = (field: keyof FactsData) => {
    if (Array.isArray(facts[field])) {
      setFacts({ ...facts, [field]: [...(facts[field] as string[]), ''] });
    }
  };

  const updateArrayItem = (field: keyof FactsData, index: number, value: string) => {
    if (Array.isArray(facts[field])) {
      const newArray = [...(facts[field] as string[])];
      newArray[index] = value;
      setFacts({ ...facts, [field]: newArray });
    }
  };

  const removeArrayItem = (field: keyof FactsData, index: number) => {
    if (Array.isArray(facts[field])) {
      const newArray = (facts[field] as string[]).filter((_, i) => i !== index);
      setFacts({ ...facts, [field]: newArray.length ? newArray : [''] });
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Brief Section */}
      <Card>
        <CardHeader>
          <CardTitle>Brief 简报</CardTitle>
          <CardDescription>项目基本信息和目标</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="client">客户/品牌名称 *</Label>
              <Input
                id="client"
                value={brief.client}
                onChange={(e) => setBrief({ ...brief, client: e.target.value })}
                placeholder="例如：TechCorp"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project">项目名称 *</Label>
              <Input
                id="project"
                value={brief.project}
                onChange={(e) => setBrief({ ...brief, project: e.target.value })}
                placeholder="例如：新品发布会"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="objective">PR 目标</Label>
              <Select
                value={brief.objective}
                onValueChange={(value) => setBrief({ ...brief, objective: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="product_launch">产品发布</SelectItem>
                  <SelectItem value="awareness">品牌曝光</SelectItem>
                  <SelectItem value="event">活动报道</SelectItem>
                  <SelectItem value="partnership">合作官宣</SelectItem>
                  <SelectItem value="funding">融资消息</SelectItem>
                  <SelectItem value="award">获奖荣誉</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tone">语气风格</Label>
              <Select
                value={brief.tone}
                onValueChange={(value) => setBrief({ ...brief, tone: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="professional">专业严谨</SelectItem>
                  <SelectItem value="formal">正式官方</SelectItem>
                  <SelectItem value="casual">轻松亲切</SelectItem>
                  <SelectItem value="excited">热情激昂</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="targetAudience">目标受众 *</Label>
            <Input
              id="targetAudience"
              value={brief.targetAudience}
              onChange={(e) => setBrief({ ...brief, targetAudience: e.target.value })}
              placeholder="例如：科技爱好者、企业决策者、投资人"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="targetMedia">目标媒体（用逗号分隔）</Label>
            <Input
              id="targetMedia"
              value={brief.targetMedia.join(', ')}
              onChange={(e) =>
                setBrief({
                  ...brief,
                  targetMedia: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                })
              }
              placeholder="例如：科技媒体, 财经媒体, 大众媒体"
            />
          </div>
        </CardContent>
      </Card>

      {/* Facts Section */}
      <Card>
        <CardHeader>
          <CardTitle>Facts 事实素材</CardTitle>
          <CardDescription>提供稿件所需的事实和数据</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Key Facts */}
          <div className="space-y-2">
            <Label>核心事实 *</Label>
            {facts.keyFacts.map((fact, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  value={fact}
                  onChange={(e) => updateArrayItem('keyFacts', index, e.target.value)}
                  placeholder={`事实 ${index + 1}`}
                />
                {facts.keyFacts.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeArrayItem('keyFacts', index)}
                  >
                    ×
                  </Button>
                )}
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => addArrayItem('keyFacts')}>
              + 添加事实
            </Button>
          </div>

          {/* Quotes */}
          <div className="space-y-2">
            <Label>可用引言</Label>
            {facts.quotes.map((quote, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  value={quote}
                  onChange={(e) => updateArrayItem('quotes', index, e.target.value)}
                  placeholder={`引言 ${index + 1}（含说话人）`}
                />
                {facts.quotes.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeArrayItem('quotes', index)}
                  >
                    ×
                  </Button>
                )}
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => addArrayItem('quotes')}>
              + 添加引言
            </Button>
          </div>

          {/* Data */}
          <div className="space-y-2">
            <Label>数据/数字</Label>
            {facts.data.map((d, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  value={d}
                  onChange={(e) => updateArrayItem('data', index, e.target.value)}
                  placeholder={`数据 ${index + 1}`}
                />
                {facts.data.length > 1 && (
                  <Button variant="ghost" size="icon" onClick={() => removeArrayItem('data', index)}>
                    ×
                  </Button>
                )}
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => addArrayItem('data')}>
              + 添加数据
            </Button>
          </div>

          {/* Background */}
          <div className="space-y-2">
            <Label htmlFor="background">背景信息</Label>
            <Textarea
              id="background"
              value={facts.background}
              onChange={(e) => setFacts({ ...facts, background: e.target.value })}
              placeholder="公司/产品/行业背景..."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Additional Notes */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>补充说明</CardTitle>
          <CardDescription>任何其他需要注意的事项</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={additionalNotes}
            onChange={(e) => setAdditionalNotes(e.target.value)}
            placeholder="例如：需要突出环保理念、避免提及竞品名称..."
            rows={3}
          />
        </CardContent>
      </Card>

      {/* Submit Button */}
      <div className="lg:col-span-2 flex justify-end">
        <Button size="lg" onClick={onSubmit} disabled={!isValid}>
          开始分析
          <Send className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Clarify Step
// ============================================================================

interface ClarifyStepProps {
  analysis: AnalysisResult;
  answers: Record<string, string>;
  setAnswers: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onSubmit: () => void;
  onSkip: () => void;
}

function ClarifyStep({ analysis, answers, setAnswers, onSubmit, onSkip }: ClarifyStepProps) {
  const allAnswered = analysis.questions.every((q) => answers[q.id]?.trim());

  return (
    <div className="space-y-6">
      {/* Analysis Summary */}
      <Card>
        <CardHeader>
          <CardTitle>AI 分析结果</CardTitle>
          <CardDescription>基于您提供的 Brief 和 Facts</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-medium text-green-700 mb-2">✓ 素材优势</h4>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
              {analysis.strengths.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>

          {analysis.gaps.length > 0 && (
            <div>
              <h4 className="font-medium text-amber-700 mb-2">⚠ 信息缺口</h4>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                {analysis.gaps.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h4 className="font-medium mb-2">💡 建议角度</h4>
            <p className="text-sm text-muted-foreground">{analysis.suggestedAngle}</p>
          </div>
        </CardContent>
      </Card>

      {/* Questions */}
      {analysis.questions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>澄清问题</CardTitle>
            <CardDescription>请回答以下问题，帮助我们生成更好的稿件</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {analysis.questions.map((q, index) => (
              <div key={q.id} className="space-y-2">
                <div className="flex items-start gap-2">
                  <span className="font-medium">Q{index + 1}.</span>
                  <div className="flex-1">
                    <p className="font-medium">{q.question}</p>
                    <p className="text-sm text-muted-foreground mt-1">{q.context}</p>
                  </div>
                  <Badge
                    variant={
                      q.importance === 'high'
                        ? 'destructive'
                        : q.importance === 'medium'
                          ? 'secondary'
                          : 'outline'
                    }
                  >
                    {q.importance === 'high' ? '重要' : q.importance === 'medium' ? '建议' : '可选'}
                  </Badge>
                </div>
                <Textarea
                  value={answers[q.id] || ''}
                  onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                  placeholder="请输入您的回答..."
                  rows={2}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-4">
        {analysis.canProceedWithoutClarification && (
          <Button variant="outline" onClick={onSkip}>
            跳过，直接生成
          </Button>
        )}
        <Button onClick={onSubmit} disabled={!allAnswered && !analysis.canProceedWithoutClarification}>
          提交回答，生成稿件
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Review Step
// ============================================================================

interface ReviewStepProps {
  draft: PRDraft;
  onApprove: () => void;
  onReset: () => void;
}

function ReviewStep({ draft, onApprove, onReset }: ReviewStepProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>稿件预览</CardTitle>
          <CardDescription>请审核 AI 生成的 PR 稿件</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Title */}
          <div>
            <h2 className="text-2xl font-bold">{draft.title}</h2>
            {draft.subtitle && <p className="text-lg text-muted-foreground mt-1">{draft.subtitle}</p>}
          </div>

          <Separator />

          {/* Lead */}
          <div>
            <Badge variant="outline" className="mb-2">
              导语
            </Badge>
            <p className="text-lg leading-relaxed">{draft.lead}</p>
          </div>

          <Separator />

          {/* Body */}
          <div>
            <Badge variant="outline" className="mb-2">
              正文
            </Badge>
            <div className="prose prose-sm max-w-none">
              {draft.body.split('\n\n').map((para, i) => (
                <p key={i} className="leading-relaxed">
                  {para}
                </p>
              ))}
            </div>
          </div>

          <Separator />

          {/* Boilerplate */}
          <div>
            <Badge variant="outline" className="mb-2">
              关于
            </Badge>
            <p className="text-sm text-muted-foreground">{draft.boilerplate}</p>
          </div>

          <Separator />

          {/* Key Messages */}
          <div>
            <Badge variant="outline" className="mb-2">
              核心要点
            </Badge>
            <ul className="list-disc list-inside space-y-1">
              {draft.keyMessages.map((msg, i) => (
                <li key={i} className="text-sm">
                  {msg}
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-4">
        <Button variant="outline" onClick={onReset}>
          <RotateCcw className="mr-2 h-4 w-4" />
          重新开始
        </Button>
        <Button onClick={onApprove}>
          <CheckCircle className="mr-2 h-4 w-4" />
          确认通过
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Done Step
// ============================================================================

interface DoneStepProps {
  draft: PRDraft;
  fullText: string;
  onReset: () => void;
}

function DoneStep({ draft, fullText, onReset }: DoneStepProps) {
  const handleCopy = () => {
    navigator.clipboard.writeText(fullText);
  };

  const handleDownload = () => {
    const blob = new Blob([fullText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${draft.title}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <Alert className="bg-green-50 border-green-200">
        <CheckCircle className="h-4 w-4 text-green-600" />
        <AlertDescription className="text-green-800">
          PR 稿件已生成完成！您可以复制或下载稿件。
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>{draft.title}</CardTitle>
              {draft.subtitle && (
                <CardDescription className="mt-1">{draft.subtitle}</CardDescription>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleCopy}>
                <Copy className="mr-2 h-4 w-4" />
                复制
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download className="mr-2 h-4 w-4" />
                下载
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">{fullText}</pre>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button variant="outline" onClick={onReset}>
          <RotateCcw className="mr-2 h-4 w-4" />
          创建新稿件
        </Button>
      </div>
    </div>
  );
}
