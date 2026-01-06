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

---

## TanStack Start 核心规则（来自 .ruler/AGENTS.md）

### 数据加载规则
1. **Fetch on navigation**：在 route loaders 中获取数据（SSR + streaming）
2. **Server work**：通过 TanStack Start server functions 在服务端完成
3. **URL as state**：将页面/UI 状态保持在 URL 中（typed search params）
4. **Effects for external only**：useEffect 只用于真实的外部副作用（DOM、订阅、分析）
5. **数据分层**：
   - Server-synced domain data → TanStack DB collections
   - Ephemeral UI/session → zustand 或 localStorage
   - Derived views → render 时计算或 live queries

### 服务端函数（Server Functions）最佳实践
- RPC 风格，仅服务端可访问
- 定义：`createServerFn(opts?).handler(async ctx => { ... })`
- 可返回：primitives/JSON/Response
- 支持：redirect/notFound/error
- 在 route lifecycles 中自动处理 redirects/notFounds

### 项目约束
- ✅ 使用 pnpm
- ✅ 所有路由文件必须是 TypeScript React (`.tsx`)
- ✅ 使用 alias imports：`~` 解析为 `./src` 根目录
- ❌ **禁止**更新 `.env`（应更新 `.env.example`）
- ❌ **禁止**使用 `pnpm run dev` 或 `npm run dev` 启动
- ❌ **禁止**创建本地 pnpm store

### Hydration + Suspense 规则
- 同步更新导致 suspend → fallback 替换 SSR 内容
- 解决：用 `startTransition` 包装同步更新（直接 import）
- hydration 期间避免：`useTransition` 的 `isPending`、`useSyncExternalStore` mutation

---

## Docker 修改规则（强制执行）

### 核心文件修改前的强制检查

**在对 Dockerfile、docker-compose.yml、启动脚本等核心文件做任何修改前，必须：**

#### 1. 对比原始脚手架
```bash
# 在参考目录验证原始行为
cd /Users/peng/Dev/Projects/ClaudeAgentChat/references/useful_frameworks/starter
pnpm run build
# 检查输出结构
ls -la .output/
```

#### 2. 确认问题根源
- 问题是否是本地修改导致的？
- 原始脚手架是否有同样问题？
- 如果原始版本正常，找出差异在哪里

#### 3. 最小修改原则
- 优先修复配置，而不是添加新文件
- 优先调整参数，而不是重写逻辑
- 优先复用现有能力（Nitro、Vite），而不是自己实现

#### 4. 禁止的操作
- ❌ 在没对比原始版本前修改 Dockerfile
- ❌ 在没验证 index.mjs 能力前创建包装脚本
- ❌ 在没检查 Nitro 文档前自己实现功能

### 框架能力优先
TanStack Start + Nitro 已提供的能力，**不要重新实现**：
- ✅ 静态资源服务（Nitro 自动处理 `/assets/**`）
- ✅ SSR 渲染
- ✅ 路由处理
- ✅ 中间件

### 具体案例的"正确路径"

**错误路径示例**（实际发生过的）：
```
看到 .output 不存在 → 修改 Dockerfile 复制 dist → 创建 run-server.mjs → ...
```

**正确路径**：
```
1. 对比原始脚手架
   cd /Users/peng/Dev/Projects/ClaudeAgentChat/references/useful_frameworks/starter
   pnpm run build
   ls -la .output/  # 发现存在

2. 检查当前版本为什么不同
   git diff vite.config.ts  # 检查配置差异
   pnpm list @tanstack/react-start  # 检查版本

3. 如果版本一致，检查是否是缓存问题
   rm -rf .output dist
   pnpm run build

4. 只有确认原始脚手架也有同样问题时，才考虑修改 Dockerfile
```

### 新文件的门槛
创建新的核心文件（如启动脚本、包装器）前必须证明：
- 现有方案无法解决
- 没有框架内置功能可用
- 已查阅相关文档
- 已在原始脚手架验证
