# Constructa Starter

<div align="center">
  <h2>Claude 智能体聊天应用</h2>
  <p>由 Claude Agent SDK + Skills Store + 智谱 AI GLM-4.7 驱动</p>
</div>

> 🚀 **Claude 桌面级智能体聊天** - 基于 Claude Agent SDK 和智谱 AI GLM-4.7 构建的全功能 AI 智能体界面，支持 Skills Store、Artifacts、知识库和会话管理，采用 WebSocket 实时通信。

## ✨ 功能特性

### 核心功能
- 🤖 **Claude Agent Chat** - 完整的 Claude Desktop 复刻，集成 Claude Agent SDK
- 🛠️ **Skills Store** - 启用/禁用自定义技能以扩展智能体能力
- 📦 **Artifacts 系统** - 支持 HTML、Markdown、React 和 SVG 工件
- 📚 **知识库** - 上传和管理文档，实现上下文感知对话
- 💾 **会话管理** - 创建、恢复和切换多个聊天会话
- 📊 **使用统计** - 追踪 token 使用和成本信息
- 🌐 **WebSocket** - 实时双向通信，处理复杂状态管理
- 🔧 **工具可视化** - 实时查看工具调用、参数和结果

### 附加功能
- 💬 **Mastra AI Chat** - 使用 Mastra Agent Framework + SSE 的简单聊天界面
- 🔐 **身份认证** - Better Auth 支持邮箱/密码、OAuth（GitHub、Google）
- 💾 **数据库** - PostgreSQL + Docker、Drizzle ORM、数据迁移
- 🎨 **精美 UI** - shadcn/ui 组件、Tailwind CSS v4、暗色模式

## 🚀 快速开始

### 前置要求
- 下载安装 **[Node.js](https://nodejs.org/en)** 22.12+
- 下载安装 **[Docker](https://www.docker.com/)** Desktop
- **pnpm**（推荐的包管理器）
- **智谱 AI API Key** - 从 [https://open.bigmodel.cn/](https://open.bigmodel.cn/) 获取

### 安装

```bash
# 克隆仓库
git clone https://github.com/foreveryh/constructa-starter.git
cd constructa-starter

# 安装依赖
pnpm install

# 创建环境变量文件
cp .env.example .env

# 在 .env 中添加你的智谱 AI API Key
# Claude Chat（主功能）:
# ANTHROPIC_API_KEY="your-zhipuai-api-key"
# ANTHROPIC_BASE_URL="https://open.bigmodel.cn/api/paas/v4"
# ANTHROPIC_MODEL="glm-4.7"
#
# Mastra AI Chat（辅助功能）:
# ZHIPUAI_API_KEY="your-zhipuai-api-key"

# 启动开发服务器
pnpm dev
```

打开 `http://localhost:3000/agents/claude-chat` 访问主界面。

**注意**：Claude Chat 使用**智谱 AI GLM-4.7**，通过其 OpenAI 兼容 API 调用。Claude Agent SDK 通过设置 `ANTHROPIC_BASE_URL` 和 `ANTHROPIC_MODEL` 连接到智谱 AI。

## 架构设计

本项目包含**两个独立的聊天系统**：

### 1. Claude Chat（主功能）`/agents/claude-chat`

**后端**：
- WebSocket 服务器（`ws-server.mjs`）- 实时双向通信
- Claude Agent SDK 集成，提供完整的智能体能力
- Worker 进程隔离，实现用户沙箱化

**前端**（`src/routes/agents/claude-chat/route.tsx`）：
- Assistant UI 组件，Claude 风格设计
- Skills Store 动态扩展能力
- Artifacts 面板（HTML、Markdown、React、SVG）
- 会话列表（恢复/创建/切换）
- 知识库面板（文档上下文）
- 使用统计卡片

**特性**：
- 基于 WebSocket 的实时流式响应
- 技能管理（每用户独立启用/禁用）
- 工件检测和渲染
- 会话持久化和历史记录
- 工具调用可视化

### 2. Mastra AI Chat（辅助功能）`/agents/ai-chat`

**后端**（`src/routes/api/chat.tsx`）：
- 使用 `@mastra/ai-sdk` 的 `handleChatStream`
- 通过 `createUIMessageStreamResponse` 返回 SSE 流
- Agent：`assistant-agent`，支持文件读取

**前端**（`src/components/ai-sdk-chat.tsx`）：
- 使用 `@ai-sdk/react` 的 `useChat` hook
- AI Elements：PromptInput、Actions、Suggestions、Sources、Reasoning

**特性**：
- 基于 SSE 的流式响应
- 简洁的聊天界面
- S3/MinIO 文件读取

## 技术栈

### Claude Chat（主系统）
- **[Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk)** - 智能体编排
- **[智谱 AI GLM-4.7](https://open.bigmodel.cn/)** - 通过 OpenAI 兼容 API 提供的 LLM
- **[Assistant UI](https://assistant-ui.com)** - AI 聊天 React 组件
- **[WebSocket](https://github.com/websockets/ws)** - 实时通信
- **[TanStack Start](https://tanstack.com/start)** - 全栈 React 框架
- **[Zustand](https://zustand-demo.pmnd.rs)** - 状态管理

### Mastra Chat（辅助系统）
- **[Mastra](https://mastra.ai)** - AI Agent Framework (v1.0.0-beta.19)
- **[智谱 AI GLM-4.7](https://open.bigmodel.cn/)** - 通过 Mastra 模型网关调用
- **[Vercel AI SDK](https://sdk.vercel.ai)** - `@ai-sdk/react` 的 `useChat` hook

### 共享组件
- **[TanStack Router](https://tanstack.com/router)** - 类型安全的文件路由
- **[shadcn/ui](https://ui.shadcn.com/)** - 精美组件库
- **[Tailwind CSS v4](https://tailwindcss.com/)** - 现代实用优先 CSS
- **[TypeScript](https://typescriptlang.org/)** - 完整类型安全
- **[Better Auth](https://better-auth.com/)** - 身份认证
- **[Drizzle ORM](https://orm.drizzle.team/)** - PostgreSQL ORM

## 📁 项目结构

```
constructa-starter/
├── src/
│   ├── components/
│   │   ├── claude-chat/       # Claude Chat UI 组件
│   │   │   ├── artifacts-panel.tsx
│   │   │   ├── session-list.tsx
│   │   │   ├── skills-manager-panel.tsx
│   │   │   ├── knowledge-base-panel.tsx
│   │   │   └── ...
│   │   ├── ai-elements/       # Vercel AI SDK UI 组件（Mastra）
│   │   └── ui/                # shadcn/ui 组件
│   ├── lib/
│   │   ├── claude-agent-ws-adapter.ts  # WebSocket 适配器
│   │   ├── skills-store.ts            # Skills 状态管理
│   │   └── stores/                    # 各种 Zustand stores
│   ├── routes/
│   │   ├── agents/
│   │   │   ├── claude-chat/  # Claude Chat 路由（主系统）
│   │   │   └── ai-chat/      # Mastra AI Chat 路由（辅助系统）
│   │   └── api/
│   │       ├── chat.tsx       # Mastra chat API（SSE）
│   │       └── skills/       # Skills API 端点
│   └── db/                    # 数据库 schema
├── ws-server.mjs              # WebSocket 服务器（Claude Chat）
├── ws-query-worker.mjs        # Worker 进程
└── CLAUDE.md                  # 开发笔记
```

## 🔌 路由说明

| 路由 | 描述 | 类型 |
|-------|-------------|------|
| `/agents/claude-chat` | **主系统** - Claude Agent Chat 全功能界面 | WebSocket |
| `/agents/ai-chat` | 辅助系统 - Mastra 简易聊天 | SSE |
| `/agents/skills` | Skills Store 管理页面 | - |
| `/api/chat` | Mastra chat API 端点 | POST, SSE |
| `/api/skills/*` | Skills API 端点 | REST |

## 🔧 配置说明

### 环境变量

```bash
# 数据库
DATABASE_URL="postgresql://username:password@localhost:5432/constructa"

# Claude Agent Chat（主功能）- 使用智谱 AI GLM-4.7
# Claude Agent SDK 通过 OpenAI 兼容 API 连接到智谱 AI
ANTHROPIC_API_KEY="your-zhipuai-api-key"
ANTHROPIC_BASE_URL="https://open.bigmodel.cn/api/paas/v4"
ANTHROPIC_MODEL="glm-4.7"

# Mastra AI Chat（辅助功能）- 同样使用智谱 AI GLM-4.7
ZHIPUAI_API_KEY="your-zhipuai-api-key"

# Better Auth
BETTER_AUTH_SECRET="your-secret-key-here"
BETTER_AUTH_URL="http://localhost:3000"

# OAuth 提供商（可选）
GITHUB_CLIENT_ID="your-github-client-id"
GITHUB_CLIENT_SECRET="your-github-client-secret"
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
```

### 模型配置

两个聊天系统均使用**智谱 AI GLM-4.7**：

**Claude Chat**：
- 使用 Claude Agent SDK，通过 `ANTHROPIC_BASE_URL` 指向智谱 AI
- OpenAI 兼容 API 格式：`https://open.bigmodel.cn/api/paas/v4`
- 模型：`glm-4.7`

**Mastra AI Chat**：
- 使用 Mastra Agent Framework 内置的智谱 AI 集成
- 模型网关自动路由到 `zhipuai/glm-4.7`

## Skills Store

Skills Store 允许用户通过启用/禁用自定义技能来扩展 Claude Agent 的能力：

- **可用技能**：浏览和发现可用技能
- **用户技能**：每用户独立启用/禁用技能
- **动态加载**：技能动态加载到智能体中
- **API 端点**：
  - `GET /api/skills/store` - 列出可用技能
  - `GET /api/skills/user/:id` - 获取用户启用的技能
  - `POST /api/skills/user/:id/enable/:skill` - 启用技能
  - `DELETE /api/skills/user/:id/disable/:skill` - 禁用技能

## 📄 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件。

## 贡献

欢迎贡献！详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 相关链接

- **GitHub**: https://github.com/foreveryh/constructa-starter
- **Claude Agent SDK**: https://github.com/anthropics/claude-agent-kit
- **Mastra 文档**: https://mastra.ai
- **Assistant UI**: https://assistant-ui.com
- **智谱 AI**: https://open.bigmodel.cn/

## 参考项目

本项目基于：
- [constructa-starter](https://github.com/instructa/constructa-starter) by instructa.ai
- [claude-agent-kit](https://github.com/anthropics/claude-agent-kit) - 参考实现
- [ui-dojo](https://github.com/mastrajs/ui-dojo) - Mastra + Vercel AI SDK 参考
