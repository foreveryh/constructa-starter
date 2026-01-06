# 混合开发环境快速开始

## 5 分钟集成到新项目

### 步骤 1：安装依赖

```bash
npm install citty
```

### 步骤 2：复制 CLI 文件

```bash
# 创建 cli 目录
mkdir -p cli

# 复制 CLI 模板
cp docs/templates/cli-template.ts cli/index.ts
```

### 步骤 3：更新 package.json

```json
{
  "scripts": {
    "dev": "vite dev",
    "ex0": "node cli/index.ts"
  }
}
```

### 步骤 4：配置 docker-compose.yml

```yaml
services:
  db:
    image: pgvector/pgvector:0.8.0-pg17
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: devdb
    volumes:
      - dev-data:/var/lib/postgresql/data
    ports:
      - '5432:5432'
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres']
      interval: 5s
      retries: 20

volumes:
  dev-data:
```

### 步骤 5：配置 .env

```bash
# 数据库
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/devdb"
```

### 步骤 6：启动

```bash
# 首次运行
pnpm ex0 init

# 启动应用
pnpm dev
```

---

## 常用命令

```bash
# 初始化开发环境
pnpm ex0 init

# 查看服务状态
pnpm ex0 status

# 查看日志
pnpm ex0 logs
pnpm ex0 logs db
pnpm ex0 logs -f  # 持续跟踪

# 重启基础设施
pnpm ex0 reload

# 停止所有服务
pnpm ex0 stop

# 清理 Docker 资源
pnpm ex0 clean --yes
```

---

## 服务清单

根据项目需求，在 docker-compose.yml 中添加需要的服务：

| 服务 | 镜像 | 用途 | 端口 |
|------|------|------|------|
| PostgreSQL | `pgvector/pgvector:0.8.0-pg17` | 数据库 + 向量搜索 | 5432 |
| Redis | `redis:7-alpine` | 缓存、队列 | 6379 |
| MinIO | `quay.io/minio/minio:latest` | S3 兼容存储 | 9000, 9001 |
| MeiliSearch | `getmeili/meilisearch:latest` | 全文搜索 | 7700 |
| MongoDB | `mongo:latest` | NoSQL 数据库 | 27017 |

---

## 环境变量配置

### .env（本地开发）

```bash
# 使用 localhost
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/devdb"
REDIS_URL="redis://localhost:6379"
S3_ENDPOINT="http://localhost:9000"
MEILI_HOST="http://localhost:7700"
```

### .env.docker（生产部署）

```bash
# 使用容器名
DATABASE_URL="postgresql://postgres:postgres@db:5432/proddb"
REDIS_URL="redis://redis:6379"
S3_ENDPOINT="http://minio:9000"
MEILI_HOST="http://meilisearch:7700"
```

---

## 生产部署

```bash
# Docker 完整部署
docker compose --env-file .env --env-file .env.docker --profile selfhost up -d --build
```

---

## 故障排查

### 数据库连接失败

```bash
# 检查服务状态
pnpm ex0 status

# 查看数据库日志
pnpm ex0 logs db

# 重启服务
pnpm ex0 reload
```

### 端口被占用

```bash
# 检查端口占用
lsof -i :5432

# 停止占用进程
kill -9 <PID>
```

### 完全重置

```bash
# 停止并删除所有数据
pnpm ex0 stop
docker volume rm $(docker compose ls -q)

# 重新初始化
pnpm ex0 init
```

---

## 扩展 CLI

如需添加自定义命令，编辑 `cli/index.ts`：

```typescript
const customCommand = defineCommand({
  meta: { name: 'custom', description: '自定义命令' },
  async run() {
    // 你的逻辑
  }
})

// 添加到 subCommands
const main = defineCommand({
  subCommands: {
    // ... 其他命令
    custom: customCommand,
  }
})
```
