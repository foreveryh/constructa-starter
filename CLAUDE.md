# Constructa Starter - 开发规则

## 项目状态

这是 Claude Agent Chat 的主项目仓库，基于 [constructa-starter](https://github.com/instructa/constructa-starter) fork 而来。

**GitHub 仓库**: https://github.com/foreveryh/constructa-starter

**已完成的功能 (Phase 1-4)**:
- Phase 1: WebSocket 服务器 + Claude Agent SDK 集成
- Phase 2: 用户隔离（Child Process + Docker 容器化）
- Phase 3: Per-Session Sandbox（每会话独立配置目录）
- Phase 4: 前端集成（Session 列表、Resume、标题管理）

## 开发目录规则

**正确的开发目录**: `/Users/peng/Dev/Projects/ClaudeAgentChat/constructa-starter/`

**禁止在以下目录开发**:
- `/Users/peng/Dev/Projects/ClaudeAgentChat/` (父目录，仅用于文档和参考)
- `/Users/peng/Dev/Projects/ClaudeAgentChat/claude-agent-chat/` (原始参考代码)
- 任何 `constructa-phase*` 目录（临时开发目录，已清理）

## 项目结构

```
constructa-starter/
├── src/
│   ├── components/claude-chat/   # Claude Chat UI 组件
│   ├── lib/                      # 工具库和适配器
│   ├── routes/                   # TanStack Router 路由
│   ├── server/                   # 服务端逻辑
│   └── db/                       # 数据库 schema
├── ws-server.mjs                 # WebSocket 服务器入口
├── ws-query-worker.mjs           # Worker 进程
├── docker-compose.yml            # Docker 部署配置
└── Dockerfile                    # 容器镜像定义
```

## 技术栈

- **前端**: TanStack Start + React + Assistant UI
- **后端**: WebSocket Server + Claude Agent SDK
- **数据库**: PostgreSQL + Drizzle ORM
- **认证**: Better Auth
- **部署**: Docker Compose

## 开发命令

```bash
# 启动开发服务器
pnpm dev

# 启动 WebSocket 服务器
node ws-server.mjs

# Docker 部署
docker-compose up -d
```

## Git 工作流

- 主分支: `main`
- 远程仓库: `origin` → https://github.com/foreveryh/constructa-starter
- 直接在 `main` 分支开发，或创建 feature 分支后合并

## Mastra AI SDK 集成注意事项

### 版本信息
- `@mastra/core`: `1.0.0-beta.19` (v1 Beta 版本，API 有重大变化)
- `@mastra/ai-sdk`: `1.0.0-beta.12` (用于 AI SDK UI 集成)
- `ai`: Vercel AI SDK 核心包
- `@ai-sdk/react`: Vercel AI SDK React 集成

### API 变化 (关键！)

Mastra v1 Beta 的 Agent API 发生了重大变化：

| 旧 API (AI SDK v4/v1) | 新 API (AI SDK v5/v2) | 说明 |
|---------------------|---------------------|------|
| `stream()` | `streamLegacy()` | 仅支持 v1 模型 |
| `generate()` | `generateLegacy()` | 仅支持 v1 模型 |
| ~~`streamVNext()`~~ | `stream()` | 现在 `stream()` 就是新 API |
| ~~`generateVNext()`~~ | `generate()` | 现在 `generate()` 就是新 API |

### 正确的集成方式

**后端 API 路由** (`/src/routes/api/chat.tsx`):
```typescript
import { handleChatStream } from '@mastra/ai-sdk';
import { createUIMessageStreamResponse } from 'ai';
import { mastra } from '~/mastra';

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json();
        const stream = await handleChatStream({
          mastra,
          agentId: 'codebase-agent',
          params: { messages: body.messages },
        });
        return createUIMessageStreamResponse({ stream });
      },
    },
  },
});
```

**前端组件** (`/src/components/ai-sdk-chat.tsx`):
```typescript
import { useChat } from '@ai-sdk/react';

const { messages, sendMessage, status, regenerate } = useChat({
  api: '/api/chat',
});
```

### 常见错误和陷阱

❌ **错误方式** - 直接使用 Agent 的流式方法：
```typescript
// 这些方法不存在或返回类型不对
agent.stream().toResponse()
stream.toTextStreamResponse()
agent.streamVNext()
stream.aisdk.v5.toTextStreamResponse()
```

✅ **正确方式** - 使用 `@mastra/ai-sdk` 的工具函数：
```typescript
import { handleChatStream } from '@mastra/ai-sdk';
import { createUIMessageStreamResponse } from 'ai';

const stream = await handleChatStream({
  mastra,
  agentId: 'your-agent-id',
  params: { messages },
});
return createUIMessageStreamResponse({ stream });
```

### 官方文档参考

集成 AI SDK UI 时，**必须先查阅官方文档**：
- [Using AI SDK UI](https://mastra.ai/guides/v1/build-your-ui/ai-sdk-ui)
- [Migration: VNext to Standard APIs](https://mastra.ai/guides/v1/migrations/vnext-to-standard-apis)
- [Agent Upgrade Guide](https://mastra.ai/guides/v1/migrations/upgrade-to-v1/agent)

### 流式响应格式

API 返回的 Server-Sent Events (SSE) 格式：
- `{"type":"start","messageId":"..."}` - 消息开始
- `{"type":"reasoning-start","id":"..."}` - 推理开始
- `{"type":"text-delta","id":"...","delta":"..."}` - 文本增量
- `{"type":"tool-input-start",...}` - 工具调用开始
- `{"type":"finish"}` - 完成

### GLM-4.7 模型配置

使用 Zhipu AI GLM-4.7 模型时的配置：

**Agent 定义** (`/src/mastra/agents/codebase-agent.ts`):
```typescript
import { Agent } from '@mastra/core/agent';

export const codebaseAgent = new Agent({
  id: 'codebase-agent',
  name: 'codebase-agent',
  instructions: '...',
  model: 'zhipuai/glm-4.7',  // 使用 Mastra 的 model gateway
  tools: { /* ... */ },
});
```

**环境变量** (`.env`):
```bash
# Zhipu AI API Key (Mastra Gateway 使用)
ZHIPU_API_KEY=your_api_key_here

# 或使用 OpenAI 兼容格式
OPENAI_API_KEY=your_api_key_here
OPENAI_BASE_URL=https://open.bigmodel.cn/api/paas/v4
```
