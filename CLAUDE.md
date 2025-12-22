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
