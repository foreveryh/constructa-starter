# Docker Compose 使用指南

本指南介绍如何使用 Docker Compose 在本地运行完整的应用栈。

---

## 目录

- [快速开始](#快速开始)
- [服务说明](#服务说明)
- [Profiles 说明](#profiles-说明)
- [环境配置](#环境配置)
- [常用命令](#常用命令)
- [数据持久化](#数据持久化)
- [故障排查](#故障排查)

---

## 快速开始

### 1. 首次启动

```bash
# 启动所有服务（包括数据库、迁移、应用）
docker compose --env-file .env --env-file .env.docker --profile selfhost up -d --build
```

这会自动：
- 启动 PostgreSQL、Redis、Meilisearch、MinIO
- 运行 Drizzle 数据库迁移
- 初始化 Mastra Memory 表
- 启动主应用和后台 Worker

### 2. 访问应用

| 服务 | 地址 | 说明 |
|------|------|------|
| 主应用 | http://localhost:5050 | Web 界面 |
| WebSocket | ws://localhost:3051/ws/agent | Claude Agent |
| MinIO 控制台 | http://localhost:9001 | 文件管理 |

---

## 服务说明

### 核心服务（默认启动）

| 服务 | 容器名 | 端口 | 说明 |
|------|--------|------|------|
| `db` | ex0-db | 5432 | PostgreSQL + pgvector |
| `redis` | ex0-redis | 6379 | BullMQ 队列 |
| `meilisearch` | ex0-meili | 7700 | 全文搜索 |
| `minio` | ex0-minio | 9000/9001 | S3 兼容存储 |
| `provision-minio` | - | - | MinIO 桶初始化（一次性） |
| `migrate` | - | - | Drizzle 迁移（一次性） |
| `init-mastra` | - | - | Mastra Memory 初始化（一次性） |

### 应用服务（需要 profile）

| 服务 | Profile | 端口 | 说明 |
|------|---------|------|------|
| `app` | `selfhost`, `prod` | 5050 | 主应用 |
| `worker` | `dev`, `selfhost`, `prod` | - | 后台任务 |
| `mailhog` | `dev` | 8025 | 邮件测试（仅开发） |

---

## Profiles 说明

### `selfhost` - 完整本地开发

```bash
docker compose --env-file .env --env-file .env.docker --profile selfhost up -d
```

**启动服务**：所有核心服务 + `app` + `worker`

**用途**：本地完整测试，包括后台任务处理

---

### `dev` - 开发模式

```bash
docker compose --env-file .env --env-file .env.docker --profile dev up -d
```

**启动服务**：核心服务 + `worker` + `mailhog`

**用途**：配合 `pnpm dev` 使用，Docker 只运行基础设施

**注意**：`app` 容器不启动，需要本地运行 `pnpm dev`

---

### `prod` - 生产模式

```bash
docker compose --env-file .env --env-file .env.docker --profile prod up -d
```

**启动服务**：核心服务 + `app` + `worker`

**用途**：生产环境部署

---

### `tunnel` - Cloudflare Tunnel（可选）

```bash
docker compose --profile tunnel up -d cloudflared
```

**用途**：通过 Cloudflare 暴露本地服务到公网（需配置 `CLOUDFLARED_TUNNEL_TOKEN`）

---

## 环境配置

### `.env` - 基础配置

```bash
# 复制示例配置
cp .env.example .env
```

**关键配置项**：

```env
# 数据库
POSTGRES_USER="user"
POSTGRES_PASSWORD="password"
POSTGRES_DB="ex0"
DATABASE_URL="postgresql://user:password@localhost:5432/ex0"

# MinIO/S3
MINIO_ROOT_USER="minioadmin"
MINIO_ROOT_PASSWORD="minioadmin"
MINIO_BUCKET="constructa-files"

# Meilisearch
MEILI_MASTER_KEY="changeme-master-key"

# 认证
BETTER_AUTH_SECRET="your-secret-key-here"
```

### `.env.docker` - Docker 覆盖配置

此文件覆盖 `.env` 中的网络配置，将 `localhost` 替换为容器名：

| 配置项 | `.env` 值 | `.env.docker` 值 |
|--------|-----------|------------------|
| DATABASE_URL | `localhost:5432` | `db:5432` |
| REDIS_URL | `localhost:6379` | `redis:6379` |
| MEILI_HOST | `localhost:7700` | `meilisearch:7700` |
| S3_ENDPOINT | `localhost:9000` | `minio:9000` |
| BETTER_AUTH_URL | `http://localhost:3000` | `http://localhost:5050` |

---

## 常用命令

### 启动服务

```bash
# 完整启动（推荐）
docker compose --env-file .env --env-file .env.docker --profile selfhost up -d --build

# 仅启动基础设施（配合 pnpm dev）
docker compose --env-file .env --env-file .env.docker --profile dev up -d

# 查看服务状态
docker compose ps

# 查看服务日志
docker compose logs -f app
docker compose logs -f worker
docker compose logs -f db
```

### 停止服务

```bash
# 停止所有服务
docker compose down

# 停止并删除数据卷（⚠️ 会清空所有数据）
docker compose down -v
```

### 重新构建

```bash
# 重新构建并启动
docker compose --env-file .env --env-file .env.docker --profile selfhost up -d --build

# 重新构建特定服务
docker compose build app
docker compose up -d --no-deps app
```

### 执行命令

```bash
# 进入应用容器
docker compose exec app sh

# 进入数据库
docker compose exec db psql -U postgres -d ex0

# 手动运行迁移
docker compose exec migrate pnpm run db:migrate

# 手动初始化 Mastra Memory
docker compose exec init-mastra pnpm run mastra:init
```

---

## 数据持久化

### Volumes

| Volume | 说明 |
|--------|------|
| `ex0-data` | PostgreSQL 数据 |
| `ex0-minio-data` | MinIO 文件存储 |
| `ex0-redis-data` | Redis 持久化 |
| `ex0-meili-data` | Meilisearch 索引 |
| `claude-sessions` | Claude Agent 会话数据 |

### 备份与恢复

```bash
# 备份数据库
docker compose exec db pg_dump -U postgres ex0 > backup.sql

# 恢复数据库
cat backup.sql | docker compose exec -T db psql -U postgres ex0

# 备份 MinIO 数据
docker compose exec minio mc mirror /data ./minio-backup
```

---

## 启动顺序

服务按以下顺序自动启动（Docker Compose 依赖管理）：

```
1. db → 健康 ✓
2. minio → 健康 ✓
3. redis → 健康 ✓
4. meilisearch → 健康 ✓
5. provision-minio → 完成 ✓ (一次性)
6. migrate → 完成 ✓ (一次性)
   └─ 运行 Drizzle 迁移
7. init-mastra → 完成 ✓ (一次性)
   └─ 初始化 Mastra Memory 表
8. worker → 启动 ✓
9. app → 启动 ✓
```

**关键依赖**：
- `migrate` 等待 `db` 健康
- `init-mastra` 等待 `migrate` 完成
- `app` / `worker` 等待 `init-mastra` 完成

---

## 故障排查

### 服务无法启动

```bash
# 查看详细日志
docker compose logs app
docker compose logs migrate
docker compose logs init-mastra

# 检查服务健康状态
docker compose ps
```

### 数据库连接失败

**问题**：`Error: connect ECONNREFUSED`

**解决**：
```bash
# 检查 db 是否健康
docker compose ps db

# 查看 db 日志
docker compose logs db

# 重启 db
docker compose restart db
```

### 迁移失败

**问题**：`migrate` 服务失败

**解决**：
```bash
# 查看迁移日志
docker compose logs migrate

# 手动重新运行迁移
docker compose restart migrate

# 或者进入容器手动执行
docker compose exec migrate sh
pnpm run db:migrate
```

### Mastra Memory 初始化失败

**问题**：`init-mastra` 服务失败

**解决**：
```bash
# 查看日志
docker compose logs init-mastra

# 如果是"表已存在"错误，可以忽略
# 如果是其他错误，手动重新初始化
docker compose restart init-mastra
```

### 端口冲突

**问题**：端口已被占用

**解决**：
```bash
# 查看占用端口的进程
lsof -i :5432  # PostgreSQL
lsof -i :5050  # App
lsof -i :9000  # MinIO

# 修改 docker-compose.yml 中的端口映射
# 例如：ports: - '5433:5432'
```

### 完全重置

```bash
# 停止并删除所有容器和数据卷
docker compose down -v

# 重新启动
docker compose --env-file .env --env-file .env.docker --profile selfhost up -d --build
```

---

## 开发工作流

### 典型开发流程

```bash
# 1. 启动基础设施（首次或配置变更时）
docker compose --env-file .env --env-file .env.docker --profile dev up -d

# 2. 等待迁移完成
docker compose logs -f migrate

# 3. 启动开发服务器（另一个终端）
pnpm dev

# 4. 开发过程中...
# 代码修改自动热重载

# 5. 查看后台 Worker 日志
docker compose logs -f worker
```

### 完整测试流程

```bash
# 启动完整栈
docker compose --env-file .env --env-file .env.docker --profile selfhost up -d --build

# 测试应用
open http://localhost:5050

# 查看所有日志
docker compose logs -f

# 停止
docker compose down
```

---

## 与 CI/CD 集成

Docker Compose 配置与生产部署（Dokku/Helm）使用相同的环境变量，便于保持一致性。

详见：[docs/constructa/cicd.md](./cicd.md)
