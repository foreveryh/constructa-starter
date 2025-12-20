# Claude Agent SDK 迁移方案

## 概述

本文档描述如何将 Constructa Starter 的 AI 聊天功能从 Mastra + Vercel AI SDK 迁移到 **Claude Agent SDK + Assistant UI LocalRuntime**。

### 🎯 目标
- 移除 Mastra 框架和 AI SDK 依赖
- 集成 Claude Agent SDK 获得完整 Agentic 能力
- 使用 Assistant UI 的 LocalRuntime 保留优秀的前端体验
- 支持工具调用、思考过程、中断恢复等高级功能

### ✨ 优势对比

#### 相对于现有实现 (claude-agent-chat)
| 特性 | claude-agent-chat | 本方案 (constructa-starter) |
|------|------------------|----------------------------|
| **UI 框架** | 自定义 useAgentChat hook | Assistant UI (成熟的开源库) |
| **状态管理** | 手动管理 messages 数组 | LocalRuntime 内置状态管理 |
| **消息编辑** | 需自己实现 | 内置支持 (branches) |
| **重新生成** | 需自己实现 | 内置支持 |
| **附件处理** | 自定义实现 | 标准 AttachmentAdapter |
| **工具 UI** | 自定义组件 | 标准 ToolUI 系统 |
| **多线程** | 需额外实现 | 内置 ThreadList 支持 |
| **流式响应解析** | 手动 SSE 解析 | LocalRuntime 封装 |
| **类型安全** | 部分 TypeScript | 完整 TypeScript 支持 |
| **维护成本** | 高 (自定义逻辑多) | 低 (依赖成熟库) |

#### 相对于原 Mastra 实现
| 特性 | Mastra + AI SDK | 本方案 |
|------|----------------|--------|
| **LLM 支持** | 多模型但限制 SSE | Claude 专属优化 |
| **Agent 能力** | 基础工具调用 | 完整 Agentic (计划、步骤、子代理) |
| **思考过程** | 不支持 | 支持 `<thinking>` 块 |
| **权限管理** | 无 | 沙盒权限控制 |
| **会话恢复** | 依赖 AI SDK | SDK 原生 session resume |
| **工具批量执行** | 串行 | 并发执行优化 |
| **错误恢复** | 基础 | 完整中断恢复机制 |

---

## 架构设计

### 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                     前端 (React)                              │
├─────────────────────────────────────────────────────────────┤
│  AssistantRuntimeProvider (Assistant UI)                    │
│    ├─ LocalRuntime                                          │
│    │   ├─ ChatModelAdapter ← 连接后端 API                   │
│    │   ├─ AttachmentAdapter ← 文件上传                       │
│    │   └─ ToolUI 注册 ← 自定义工具可视化                      │
│    └─ UI Components                                         │
│        ├─ ThreadPrimitive (消息列表)                         │
│        ├─ ComposerPrimitive (输入框)                         │
│        ├─ MessagePrimitive (消息气泡)                        │
│        └─ ToolCallVisualizer (工具调用展示)                  │
└─────────────────────────────────────────────────────────────┘
                              ↕ HTTP
┌─────────────────────────────────────────────────────────────┐
│                  后端 API (TanStack Start)                   │
├─────────────────────────────────────────────────────────────┤
│  /api/agent-chat (Route Handler)                           │
│    ├─ 认证检查 (Better Auth)                                │
│    ├─ 会话管理 (PostgreSQL)                                 │
│    └─ SSE 流式响应                                          │
└─────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────┐
│              AgentBridge (适配层)                            │
├─────────────────────────────────────────────────────────────┤
│  ├─ Claude Agent SDK 封装                                   │
│  ├─ 事件归一化 (NormalizedEvent)                           │
│  ├─ 会话持久化                                              │
│  └─ 权限模式管理                                            │
└─────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────┐
│          Claude Agent SDK (@anthropic-ai/claude-agent-sdk)  │
├─────────────────────────────────────────────────────────────┤
│  ├─ query() - 主入口                                        │
│  ├─ 工具注册与执行                                           │
│  ├─ 沙盒环境 (srt)                                          │
│  └─ Session Resume                                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 实现步骤

### Phase 1: 依赖调整

#### 1.1 移除旧依赖
```bash
cd constructa-starter
pnpm remove @mastra/core @ai-sdk/openai @assistant-ui/react-ai-sdk ai
```

#### 1.2 安装新依赖
```bash
# Claude Agent SDK (核心)
pnpm add @anthropic-ai/claude-agent-sdk

# Assistant UI (保留)
# @assistant-ui/react 已存在，无需重新安装

# 可选：如果需要自定义 AI SDK provider
pnpm add @ai-sdk/anthropic
```

#### 1.3 确认保留的依赖
```json
{
  "@assistant-ui/react": "^0.11.15",
  "@assistant-ui/react-markdown": "^0.11.0", 
  "@assistant-ui/styles": "^0.2.1"
}
```

---

### Phase 2: 后端 Agent Bridge

#### 2.1 创建 AgentBridge 适配层

**文件**: `src/lib/agent/agent-bridge.ts`

```typescript
import {
  query as sdkQuery,
  type Step,
  type ToolUse,
  type ToolOutput,
} from "@anthropic-ai/claude-agent-sdk";

// 统一事件类型
export type UiEventType =
  | "meta:init"          // 会话初始化
  | "text-delta"         // 文本流
  | "thinking"           // 思考过程
  | "tool-call-start"    // 工具调用开始
  | "tool-call-output"   // 工具输出
  | "tool-call-result"   // 工具结果
  | "assistant-plan"     // Agent 计划
  | "assistant-step"     // Agent 步骤
  | "result.success"     // 成功完成
  | "result.error";      // 错误

// 归一化事件结构
export interface NormalizedEvent<T = unknown> {
  type: UiEventType;
  payload: T;
  ts: number;
}

export interface SessionOptions {
  sessionId?: string;
  sdkSessionId?: string;      // SDK 内部 session_id (用于恢复)
  model?: string;
  cwd?: string;
  permissionMode?: "default" | "bypassPermissions";
  maxDurationMs?: number;
}

export interface AgentBridge {
  runSession(
    prompt: string,
    options?: SessionOptions
  ): Promise<AsyncIterable<NormalizedEvent>>;
  
  interrupt(sessionId: string): Promise<void>;
}

class DefaultAgentBridge implements AgentBridge {
  async runSession(
    prompt: string,
    options?: SessionOptions
  ): Promise<AsyncIterable<NormalizedEvent>> {
    const {
      maxDurationMs = 30 * 60 * 1000,
      model,
      cwd,
      permissionMode = "default",
      sdkSessionId,
      ...sdkOptions
    } = options ?? {};

    // 设置环境变量
    const env = {
      ...(process.env ?? {}),
      ...(model ? { ANTHROPIC_MODEL: model } : {}),
    };

    // 权限配置
    const permissionRules =
      permissionMode === "bypassPermissions"
        ? { allowDangerouslySkipPermissions: true }
        : undefined;

    // SDK 调用参数
    const queryArgs = {
      prompt,
      cwd: cwd ?? process.cwd(),
      env,
      ...(sdkSessionId ? { session_id: sdkSessionId } : {}),
      ...(permissionRules ?? {}),
      ...sdkOptions,
    };

    return this.normalizeStream(await sdkQuery(queryArgs));
  }

  private async *normalizeStream(
    stream: AsyncIterable<any>
  ): AsyncIterable<NormalizedEvent> {
    let sessionId: string | null = null;

    for await (const event of stream) {
      const ts = Date.now();

      // 提取 session_id (首次)
      if (!sessionId && event.session_id) {
        sessionId = event.session_id;
        yield {
          type: "meta:init",
          payload: { sessionId },
          ts,
        };
      }

      // 文本增量
      if (event.type === "assistant" && event.delta?.text) {
        yield {
          type: "text-delta",
          payload: { text: event.delta.text },
          ts,
        };
      }

      // 思考块
      if (event.type === "assistant" && event.delta?.thinking) {
        yield {
          type: "thinking",
          payload: { text: event.delta.thinking },
          ts,
        };
      }

      // 工具调用开始
      if (event.type === "tool_use" && event.subtype === "start") {
        yield {
          type: "tool-call-start",
          payload: {
            toolCallId: event.tool_use_id,
            name: event.name,
            input: event.input,
          },
          ts,
        };
      }

      // 工具执行输出
      if (event.type === "tool_execution" && event.output) {
        yield {
          type: "tool-call-output",
          payload: {
            toolCallId: event.tool_use_id,
            output: event.output,
          },
          ts,
        };
      }

      // 工具结果
      if (event.type === "tool_result") {
        yield {
          type: "tool-call-result",
          payload: {
            toolCallId: event.tool_use_id,
            result: event.result,
            isError: event.is_error,
          },
          ts,
        };
      }

      // 计划和步骤
      if (event.type === "plan") {
        yield {
          type: "assistant-plan",
          payload: { plan: event.plan },
          ts,
        };
      }

      if (event.type === "step") {
        yield {
          type: "assistant-step",
          payload: { title: event.title, stepId: event.step_id },
          ts,
        };
      }

      // 错误
      if (event.type === "error") {
        yield {
          type: "result.error",
          payload: {
            code: event.error_code ?? "unknown",
            message: event.message ?? "An error occurred",
          },
          ts,
        };
      }

      // 完成
      if (event.type === "result" && event.result) {
        yield {
          type: "result.success",
          payload: { result: event.result },
          ts,
        };
      }
    }
  }

  async interrupt(sessionId: string): Promise<void> {
    // SDK 暂不支持运行时中断，这里预留接口
    console.warn("Agent interrupt not yet implemented");
  }
}

export const agentBridge = new DefaultAgentBridge();
```

**关键差异点**:
1. ✅ **简化的事件归一化** - 只处理核心事件类型，不过度抽象
2. ✅ **内置 session 恢复** - 直接支持 SDK 的 `session_id`
3. ✅ **权限模式管理** - 集成沙盒权限控制
4. ✅ **错误处理** - 统一的错误事件格式

---

### Phase 3: 后端 API 路由

**文件**: `src/routes/api/agent-chat.tsx`

```typescript
import { createFileRoute } from '@tanstack/react-router';
import { json } from '@tanstack/react-start';
import { z } from 'zod';
import { auth } from '~/server/auth.server';
import { agentBridge, type NormalizedEvent } from '~/lib/agent/agent-bridge';
import { 
  getChatById, 
  saveChat, 
  saveMessages,
  updateChatSdkSessionId 
} from '~/lib/db/queries';
import { generateUUID } from '~/lib/utils';

const MessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});

const ChatPayloadSchema = z.object({
  messages: z.array(MessageSchema).min(1),
  chatId: z.string().optional(),
  permissionMode: z.enum(['default', 'bypassPermissions']).optional(),
});

const encodeEvent = (event: NormalizedEvent, encoder: TextEncoder) =>
  encoder.encode(`data: ${JSON.stringify(event)}\n\n`);

export const Route = createFileRoute('/api/agent-chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const encoder = new TextEncoder();

        // 1. 认证检查
        const { headers } = request;
        const session = await auth.api.getSession({ headers });
        
        if (!session?.user) {
          return json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 2. 解析请求
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ error: 'Invalid JSON' }, { status: 400 });
        }

        const result = ChatPayloadSchema.safeParse(body);
        if (!result.success) {
          return json({ error: 'Invalid request', details: result.error }, { status: 400 });
        }

        const { messages, chatId, permissionMode = 'default' } = result.data;
        const prompt = messages[messages.length - 1]?.content ?? '';
        const userId = session.user.id;

        // 3. 会话管理
        const sessionId = chatId ?? generateUUID();
        let existingSdkSessionId: string | undefined;
        let storedPermissionMode: string | undefined;

        try {
          const existingChat = await getChatById({ id: sessionId });
          
          if (existingChat) {
            existingSdkSessionId = existingChat.sdkSessionId ?? undefined;
            storedPermissionMode = existingChat.permissionMode ?? undefined;

            // 权限模式冲突检查
            if (storedPermissionMode && storedPermissionMode !== permissionMode) {
              return json({
                error: 'Permission mode conflict',
                message: `This conversation uses "${storedPermissionMode}" mode. Cannot switch to "${permissionMode}". Start a new conversation.`,
              }, { status: 409 });
            }
          } else {
            // 创建新会话
            await saveChat({
              id: sessionId,
              userId,
              title: prompt.slice(0, 50),
              visibility: 'private',
              permissionMode,
            });
          }

          // 保存用户消息
          await saveMessages({
            messages: [{
              chatId: sessionId,
              id: generateUUID(),
              role: 'user',
              parts: [{ type: 'text', text: prompt }],
              attachments: [],
              createdAt: new Date(),
            }],
          });
        } catch (dbError) {
          console.error('Database error:', dbError);
        }

        // 4. 创建 SSE 流
        const stream = new ReadableStream({
          async start(controller) {
            const heartbeat = setInterval(
              () => controller.enqueue(encoder.encode(':ping\n\n')),
              15000
            );

            const abortHandler = () => {
              controller.enqueue(
                encodeEvent(
                  {
                    type: 'result.error',
                    payload: { code: 'aborted', message: 'Client aborted' },
                    ts: Date.now(),
                  },
                  encoder
                )
              );
              controller.close();
            };

            request.signal.addEventListener('abort', abortHandler);

            try {
              // 调用 Agent Bridge
              const iterable = await agentBridge.runSession(prompt, {
                sessionId,
                sdkSessionId: existingSdkSessionId,
                permissionMode,
                maxDurationMs: 30 * 60 * 1000,
              });

              // 收集数据用于持久化
              let assistantText = '';
              let capturedSdkSessionId: string | null = null;
              const toolCalls: any[] = [];

              // 流式传输事件
              for await (const event of iterable) {
                controller.enqueue(encodeEvent(event, encoder));

                // 收集数据
                if (event.type === 'meta:init') {
                  capturedSdkSessionId = (event.payload as any).sessionId;
                }
                if (event.type === 'text-delta') {
                  assistantText += (event.payload as any).text ?? '';
                }
                if (event.type === 'tool-call-result') {
                  toolCalls.push(event.payload);
                }
              }

              // 5. 持久化助手消息
              try {
                await saveMessages({
                  messages: [{
                    chatId: sessionId,
                    id: generateUUID(),
                    role: 'assistant',
                    parts: [
                      ...(assistantText ? [{ type: 'text' as const, text: assistantText }] : []),
                      ...toolCalls.map((tc) => ({
                        type: 'toolCallResult' as const,
                        data: tc,
                      })),
                    ],
                    attachments: [],
                    createdAt: new Date(),
                  }],
                });

                // 更新 SDK session ID (用于恢复)
                if (capturedSdkSessionId) {
                  await updateChatSdkSessionId({
                    chatId: sessionId,
                    sdkSessionId: capturedSdkSessionId,
                  });
                }
              } catch (dbError) {
                console.error('Failed to save assistant message:', dbError);
              }

              controller.close();
            } catch (error) {
              console.error('Agent error:', error);
              controller.enqueue(
                encodeEvent(
                  {
                    type: 'result.error',
                    payload: {
                      code: 'agent_error',
                      message: error instanceof Error ? error.message : 'Agent failed',
                    },
                    ts: Date.now(),
                  },
                  encoder
                )
              );
              controller.close();
            } finally {
              clearInterval(heartbeat);
              request.signal.removeEventListener('abort', abortHandler);
            }
          },
        });

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
        });
      },
    },
  },
});
```

**关键差异点**:
1. ✅ **完整的数据库集成** - 会话和消息持久化
2. ✅ **权限模式锁定** - 一旦选择就不能更改
3. ✅ **SDK session 恢复** - 保存 `sdkSessionId` 用于恢复对话
4. ✅ **结构化消息存储** - 工具调用和文本分别存储

---

### Phase 4: 前端 LocalRuntime 集成

**文件**: `src/routes/dashboard/chat/route.tsx`

```typescript
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useLocalRuntime,
  useAssistantState,
} from '@assistant-ui/react';
import type { PropsWithChildren } from 'react';
import { useState, useCallback } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Bot, Loader2, Send } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { buttonVariants } from '~/components/ui/button';
import { cn } from '~/lib/utils';
import { ScopedAssistantStyles } from '~/components/chat-assistant-styles';
import { listDocuments } from '~/server/function/documents.server';
import { toast } from 'sonner';

type ChatLoaderData = {
  files: Awaited<ReturnType<typeof listDocuments>>;
};

export const Route = createFileRoute('/dashboard/chat')({
  loader: async () => {
    const files = await listDocuments();
    return { files } satisfies ChatLoaderData;
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { files } = Route.useLoaderData() as ChatLoaderData;

  return (
    <div className="container mx-auto h-full px-4">
      <div className="flex h-full flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Claude Agent Chat</h1>
          <p className="text-muted-foreground">
            AI assistant powered by Claude Agent SDK with tool calling and thinking.
          </p>
        </div>

        <Card className="flex flex-1 flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              Agent Chat
            </CardTitle>
            <CardDescription>
              Conversations with Claude Agent SDK - supports tools, thinking, and more.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-4">
            <AssistantChatSurface files={files} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AssistantChatSurface({ files }: { files: ChatLoaderData['files'] }) {
  const [permissionMode, setPermissionMode] = useState<'default' | 'bypassPermissions'>('default');

  // 使用 LocalRuntime 连接自定义后端
  const runtime = useLocalRuntime({
    adapters: {
      // 自定义 ChatModel 适配器
      chatModel: async ({ messages, abortSignal }) => {
        const response = await fetch('/api/agent-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: messages.map((msg) => ({
              role: msg.role,
              content: msg.content
                .filter((part) => part.type === 'text')
                .map((part) => part.text)
                .join(''),
            })),
            permissionMode,
          }),
          signal: abortSignal,
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message ?? 'Request failed');
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          throw new Error('No reader available');
        }

        // 返回 AsyncGenerator
        return {
          async *[Symbol.asyncIterator]() {
            let buffer = '';

            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                  if (!line.trim() || !line.startsWith('data:')) continue;

                  const json = line.replace(/^data:\s*/, '');
                  if (!json) continue;

                  try {
                    const event = JSON.parse(json);

                    // 映射到 Assistant UI 的事件格式
                    if (event.type === 'text-delta') {
                      yield {
                        type: 'text-delta' as const,
                        textDelta: event.payload.text,
                      };
                    } else if (event.type === 'thinking') {
                      // 思考过程可以显示为工具调用或特殊标记
                      yield {
                        type: 'tool-call-delta' as const,
                        toolCallType: 'function',
                        toolCallId: 'thinking',
                        toolName: 'thinking',
                        argsTextDelta: event.payload.text,
                      };
                    } else if (event.type === 'tool-call-start') {
                      yield {
                        type: 'tool-call' as const,
                        toolCallType: 'function',
                        toolCallId: event.payload.toolCallId,
                        toolName: event.payload.name,
                        args: event.payload.input,
                      };
                    } else if (event.type === 'tool-call-result') {
                      yield {
                        type: 'tool-result' as const,
                        toolCallId: event.payload.toolCallId,
                        result: event.payload.result,
                      };
                    } else if (event.type === 'result.error') {
                      toast.error(event.payload.message);
                      throw new Error(event.payload.message);
                    }
                  } catch (parseError) {
                    console.error('Parse error:', parseError);
                  }
                }
              }
            } finally {
              reader.releaseLock();
            }
          },
        };
      },
    },
  });

  const scopeClass = 'assistant-chat-theme';

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ScopedAssistantStyles scopeClass={scopeClass} />
      <div className={cn('flex flex-1 flex-col gap-4 aui-root', scopeClass)}>
        {/* 权限模式选择器 */}
        <PermissionModeSelector 
          value={permissionMode} 
          onChange={setPermissionMode} 
        />

        {/* 可用文件列表 */}
        <AvailableFiles files={files} />

        <ThreadPrimitive.Root className="flex flex-1 flex-col">
          <ThreadPrimitive.Viewport autoScroll className="flex-1 space-y-4 overflow-y-auto pr-1">
            <ThreadPrimitive.Empty>
              <div className="flex h-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                <p>Ask Claude Agent about your codebase.</p>
                <p className="text-xs">
                  Supports tool calling, thinking process, and file access.
                </p>
              </div>
            </ThreadPrimitive.Empty>

            <ThreadPrimitive.Messages components={{ Message: ChatMessage }} />
          </ThreadPrimitive.Viewport>
        </ThreadPrimitive.Root>

        <ComposerPrimitive.Root className="flex items-end gap-2 rounded-lg border bg-background p-3 shadow-sm">
          <ComposerPrimitive.Input
            placeholder="Type your question…"
            className="max-h-40 flex-1 resize-none bg-transparent text-sm leading-6 text-foreground placeholder:text-muted-foreground focus-visible:outline-none"
          />
          <ComposerPrimitive.Send
            className={cn(buttonVariants({ variant: 'default', size: 'icon' }))}
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </ComposerPrimitive.Send>
        </ComposerPrimitive.Root>
      </div>
    </AssistantRuntimeProvider>
  );
}

function PermissionModeSelector({
  value,
  onChange,
}: {
  value: 'default' | 'bypassPermissions';
  onChange: (value: 'default' | 'bypassPermissions') => void;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground">Sandbox Mode:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as any)}
        className="rounded border bg-background px-2 py-1"
      >
        <option value="default">Restricted (Safe)</option>
        <option value="bypassPermissions">Bypass (Dangerous)</option>
      </select>
    </div>
  );
}

function ChatMessage() {
  const role = useAssistantState((state) => state.message.role);
  const isRunning = useAssistantState((state) => state.message.status?.type === 'running');

  return (
    <MessagePrimitive.Root
      className={cn(
        'max-w-[75%] rounded-lg px-4 py-2 text-sm shadow-sm',
        role === 'user'
          ? 'ml-auto bg-primary text-primary-foreground'
          : 'mr-auto bg-muted text-foreground'
      )}
    >
      <MessagePrimitive.Parts
        components={{
          ToolGroup: ToolCallGroup,
        }}
      />
      {isRunning && (
        <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Thinking…</span>
        </div>
      )}
    </MessagePrimitive.Root>
  );
}

function ToolCallGroup({
  startIndex,
  endIndex,
  children,
}: PropsWithChildren<{ startIndex: number; endIndex: number }>) {
  return (
    <div className="mt-2 space-y-2 rounded-md border border-dashed bg-muted/30 p-2 text-xs">
      <div className="font-medium">Tool Execution</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function AvailableFiles({ files }: { files: ChatLoaderData['files'] }) {
  // ... (保持不变)
}
```

**关键差异点**:
1. ✅ **LocalRuntime 而非 useAgentChat** - 使用成熟的库而非自定义 hook
2. ✅ **内置状态管理** - 不需要手动管理 messages 数组
3. ✅ **AsyncGenerator 接口** - 清晰的流处理模式
4. ✅ **工具调用可视化** - 使用 Assistant UI 的 ToolGroup 组件
5. ✅ **权限模式 UI** - 集成沙盒控制

---

### Phase 5: 数据库 Schema 更新

**文件**: `src/db/schema/chat.schema.ts` (更新)

```typescript
// 添加新字段到 chats 表
export const chats = pgTable('chats', {
  // ... 现有字段
  
  // 新增：SDK 的 session_id (用于恢复)
  sdkSessionId: text('sdk_session_id'),
  
  // 新增：权限模式
  permissionMode: text('permission_mode')
    .$type<'default' | 'bypassPermissions'>()
    .default('default'),
});
```

迁移 SQL:
```sql
ALTER TABLE chats ADD COLUMN sdk_session_id TEXT;
ALTER TABLE chats ADD COLUMN permission_mode TEXT DEFAULT 'default';
```

---

## 核心优势总结

### 1. **更强大的 Agent 能力**
- ✅ 完整的 Claude Agent SDK 功能
- ✅ 思考过程可视化 (`<thinking>` 块)
- ✅ 计划和步骤追踪
- ✅ 子代理支持
- ✅ 沙盒环境执行

### 2. **更好的 UI 体验**
- ✅ 成熟的 Assistant UI 组件库
- ✅ 内置消息编辑、重新生成
- ✅ 分支对话 (branches)
- ✅ 工具调用可视化
- ✅ 加载状态和错误处理

### 3. **更低的维护成本**
- ✅ 减少自定义代码
- ✅ 依赖成熟的开源库
- ✅ TypeScript 完整支持
- ✅ 标准化的适配器模式

### 4. **更强的可扩展性**
- ✅ 可添加 AttachmentAdapter
- ✅ 可添加自定义 ToolUI
- ✅ 支持多线程 (ThreadList)
- ✅ 可集成 Assistant Cloud

---

## 实施检查清单

- [ ] Phase 1: 依赖调整完成
- [ ] Phase 2: AgentBridge 实现并测试
- [ ] Phase 3: API 路由实现并测试
- [ ] Phase 4: 前端 LocalRuntime 集成
- [ ] Phase 5: 数据库 Schema 更新和迁移
- [ ] 测试: 基础对话功能
- [ ] 测试: 工具调用功能
- [ ] 测试: 思考过程显示
- [ ] 测试: 会话恢复功能
- [ ] 测试: 权限模式切换
- [ ] 文档: 更新 README
- [ ] 文档: 更新 mastra.md

---

## 故障排查

### 常见问题

1. **srt 未找到**
   ```bash
   # 确保 srt 在 PATH 中
   which srt
   
   # 如果没有，安装:
   npx @anthropic-ai/cli install
   ```

2. **权限模式冲突**
   - 错误: `Permission mode conflict`
   - 解决: 在新会话中选择权限模式

3. **SSE 连接中断**
   - 检查 maxDurationMs 设置
   - 检查 heartbeat 配置
   - 查看服务器日志

4. **工具调用不显示**
   - 检查事件映射逻辑
   - 确认 ToolCallGroup 组件正确注册

---

## 下一步

1. **实施本方案** - 按 Phase 顺序执行
2. **添加工具** - 集成文件读取工具 (类似 Mastra 的 getFileFromObjectStore)
3. **优化 UI** - 自定义思考过程的显示样式
4. **性能优化** - 考虑流式响应的缓冲策略
5. **测试覆盖** - 添加单元测试和集成测试

---

## 参考资料

- [Claude Agent SDK 文档](https://github.com/anthropics/anthropic-quickstarts/tree/main/agent-sdk)
- [Assistant UI 文档](https://www.assistant-ui.com/)
- [LocalRuntime API](https://www.assistant-ui.com/docs/runtimes/custom/local)
- [TanStack Start 文档](https://tanstack.com/start/latest)
