# Phase 3 Docker 容器化 - Volume 持久化完成报告

**[完成待回收]**

> **任务编号**：Phase3-F-001
> **执行者**：后端工程师 F
> **完成时间**：2025-12-20 23:00
> **状态**：已完成

---

## 1. 任务概述

实现 Docker 容器化环境下的会话数据持久化，包括：
- Dockerfile 添加 bubblewrap 和会话目录
- docker-compose.yml 配置 Volume 挂载
- 环境变量配置
- 健康检查端点

---

## 2. 修改/新增文件清单

### 2.1 修改文件

| 文件路径 | 修改说明 |
|---------|---------|
| `Dockerfile` | 添加 bubblewrap、会话目录、环境变量 |
| `docker-compose.yml` | 添加 Claude Agent 配置和 Volume |
| `.env.example` | 添加 ANTHROPIC_API_KEY 和 SANDBOX_ENABLED |

### 2.2 新增文件

| 文件路径 | 说明 |
|---------|------|
| `src/routes/api/health.ts` | 健康检查端点 |

---

## 3. 具体修改内容

### 3.1 Dockerfile 修改

**添加 bubblewrap**：
```dockerfile
RUN apk add --no-cache libc6-compat ca-certificates bubblewrap
```

**创建会话目录**：
```dockerfile
RUN mkdir -p /data/users && chown -R nodejs:nodejs /data/users
```

**添加环境变量**：
```dockerfile
ENV CLAUDE_SESSIONS_ROOT=/data/users
```

### 3.2 docker-compose.yml 修改

**app 服务新增环境变量**：
```yaml
environment:
  ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:?}
  CLAUDE_SESSIONS_ROOT: /data/users
  SANDBOX_ENABLED: ${SANDBOX_ENABLED:-false}
```

**app 服务新增 Volume**：
```yaml
volumes:
  - claude-sessions:/data/users
```

**顶层 volumes 声明**：
```yaml
volumes:
  claude-sessions:  # Claude Agent session storage
```

### 3.3 .env.example 修改

新增配置项：
```bash
ANTHROPIC_API_KEY="sk-ant-api03-xxxxx"
SANDBOX_ENABLED="false"
```

### 3.4 健康检查端点

`GET /api/health` 返回：
```json
{
  "status": "healthy",
  "timestamp": "2025-12-20T23:00:00.000Z",
  "checks": {
    "sessionsVolume": { "status": "ok" }
  }
}
```

---

## 4. 构建验证

```bash
pnpm build
# 结果：✓ built in 14.22s
```

构建成功，无错误。

---

## 5. Docker 测试命令

### 5.1 构建镜像

```bash
docker build -t claude-agent-chat:test .
```

### 5.2 运行容器

```bash
docker run -d \
  --name claude-test \
  -p 5000:5000 \
  -p 3001:3001 \
  -v claude-sessions-test:/data/users \
  -e ANTHROPIC_API_KEY=your-key \
  -e DATABASE_URL=your-db-url \
  claude-agent-chat:test
```

### 5.3 验证命令

```bash
# 检查 bubblewrap 安装
docker exec claude-test which bwrap

# 检查目录权限
docker exec claude-test ls -la /data/users

# 检查健康状态
curl http://localhost:5000/api/health
```

---

## 6. 验收清单

- [x] Dockerfile 添加 bubblewrap
- [x] Dockerfile 创建 /data/users 目录
- [x] Dockerfile 设置 CLAUDE_SESSIONS_ROOT 环境变量
- [x] docker-compose.yml 添加 claude-sessions Volume
- [x] docker-compose.yml 添加 Claude Agent 环境变量
- [x] .env.example 添加必要配置
- [x] 健康检查端点实现
- [x] 构建验证通过

---

## 7. 目录结构说明

### 7.1 容器内目录

```
/data/users/                  # CLAUDE_SESSIONS_ROOT
├── {user-id-1}/.claude/      # 用户 1 的会话
│   └── projects/{hash}/
│       └── {session}.jsonl
└── {user-id-2}/.claude/      # 用户 2 的会话
    └── projects/{hash}/
        └── {session}.jsonl
```

### 7.2 Volume 映射

```
Docker Volume: claude-sessions
         ↓
Container: /data/users
         ↓
Host: /var/lib/docker/volumes/claude-sessions/_data
```

---

## 8. 注意事项

### 8.1 文件权限

- 容器内运行用户：`nodejs:1001`
- Volume 目录已设置 `chown nodejs:nodejs`

### 8.2 Sandbox 模式

- `SANDBOX_ENABLED=false` 默认禁用
- 启用需要 Linux 环境 + 适当的容器权限
- 可能需要 `--cap-add=SYS_ADMIN` 或 privileged 模式

### 8.3 与其他 Phase 的关系

| Phase | 状态 | 说明 |
|-------|------|------|
| Phase 1 | ✅ | 用户隔离 (CLAUDE_HOME) |
| Phase 2 | ✅ | 数据库持久化 |
| Phase 3 | ✅ | Docker Volume 持久化 |

---

## 9. 遇到的问题

### 9.1 WebSocket 连接失败（已修复）

**问题描述**：
Docker 容器启动后，前端加载正常，但 WebSocket 连接失败：
```
WebSocket connection to 'ws://localhost:5050/ws/agent' failed
```

**根因分析**：
- Docker 中 WebSocket 作为 sidecar 运行在端口 3001（映射到 3051）
- 主应用运行在端口 5000（映射到 5050）
- 前端 WebSocket 适配器默认使用 `window.location.host` 构造 URL
- 导致前端尝试连接到错误的端口

**修复方案**：
1. 在 `Dockerfile` 添加 `VITE_WS_URL` 构建参数
2. 在 `docker-compose.yml` 配置默认值 `ws://localhost:3051/ws/agent`
3. 前端适配器已支持 `VITE_WS_URL` 环境变量

**修改的文件**：
- `Dockerfile` - 添加 `ARG VITE_WS_URL` 和 `ENV VITE_WS_URL`
- `docker-compose.yml` - 在 `x-app-build` 添加 build args
- `.env.example` - 添加 `VITE_WS_URL` 说明

---

## 10. 参考资料

- Alpine bubblewrap 包：`apk add bubblewrap`
- Docker Volumes 官方文档
- 项目现有 Dockerfile 结构
