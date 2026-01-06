# Documents、Knowledge Base 与 Session 集成架构文档

## 目录

- [1. 系统概述](#1-系统概述)
- [2. 核心概念](#2-核心概念)
- [3. 架构设计](#3-架构设计)
- [4. 数据流详解](#4-数据流详解)
- [5. 使用指南](#5-使用指南)
- [6. API 接口](#6-api-接口)
- [7. 技术实现细节](#7-技术实现细节)
- [8. 最佳实践](#8-最佳实践)

---

## 1. 系统概述

本系统提供三层文档管理架构：

1. **Documents（文档库）** - 全局文档存储和管理
2. **Knowledge Base（知识库）** - 文档分组和组织
3. **Session Workspace（会话工作区）** - Session 级别的文档隔离和 Claude SDK 集成

### 设计目标

- ✅ **全局共享** - Documents 可被多个 KB 和 Session 复用
- ✅ **灵活组织** - KB 提供主题/项目维度的文档分组
- ✅ **会话隔离** - 每个 Session 有独立的文档副本
- ✅ **SDK 集成** - Claude Agent SDK 可直接访问 Session 文档

---

## 2. 核心概念

### 2.1 Documents（文档库）

**定义**：用户上传的所有文档的全局库。

**特点**：
- 文档存储在 S3（或兼容存储）
- 数据库记录文档元数据
- 支持多种文件类型（PDF、MD、TXT、DOCX 等）
- 可被多个 KB 和 Session 引用（不会重复存储）

**使用场景**：
- 上传 API 文档、技术规范、参考资料
- 作为文档的单一真实来源（Single Source of Truth）
- 跨项目/会话复用文档

### 2.2 Knowledge Base（知识库）

**定义**：文档的逻辑分组，用于组织相关文档。

**特点**：
- 一个 KB 包含多个 Documents（多对多关系）
- 一个 Document 可以属于多个 KB
- KB 有名称和描述
- 不存储文档内容，只存储关联关系

**使用场景**：
- 按主题分组：「Python 开发」、「前端技术栈」
- 按项目分组：「项目 A 文档」、「客户 B 资料」
- 快速批量添加文档到 Session

### 2.3 Session Workspace（会话工作区）

**定义**：每个 Agent Session 的独立文档工作区。

**特点**：
- 每个 Session 有独立的文件系统目录
- 文档从 S3 下载到本地工作区
- Claude Agent SDK 只能访问当前 Session 的工作区
- Session 间完全隔离

**使用场景**：
- 为特定对话添加相关文档
- Claude 使用 grep/cat 工具读取文档
- 多用户、多会话并发使用，互不干扰

---

## 3. 架构设计

### 3.1 系统架构图

```
┌─────────────────────────────────────────────────────────────┐
│                     用户上传文档                             │
└───────────────────────┬─────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│  Documents (文档库 - 全局层)                                 │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ S3 Storage (原始文件)                                   │ │
│  │ ├── user_123/2025-01-03-uuid-API文档.pdf               │ │
│  │ └── user_123/2025-01-03-uuid-最佳实践.md               │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ PostgreSQL (元数据)                                     │ │
│  │ ├── files: 文件信息 (S3 key, 大小, MIME)               │ │
│  │ └── documents: 文档元数据 (标题, 内容摘要)             │ │
│  └────────────────────────────────────────────────────────┘ │
└───────────────────────┬─────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│  Knowledge Bases (知识库 - 组织层)                          │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ KB 1: "Python 开发"                                     │ │
│  │ ├── API文档.pdf ────────┐                              │ │
│  │ └── 最佳实践.md         │                              │ │
│  │                         │                              │ │
│  │ KB 2: "前端技术栈"      │                              │ │
│  │ ├── React指南.md        │                              │ │
│  │ └── 最佳实践.md ────────┤ (同一文档可属于多个 KB)     │ │
│  └────────────────────────┴──────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ PostgreSQL                                              │ │
│  │ ├── knowledge_bases: KB 元数据                         │ │
│  │ └── kb_documents: KB ↔ Documents 关联                 │ │
│  └────────────────────────────────────────────────────────┘ │
└───────────────────────┬─────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│  Session Workspaces (会话工作区 - 隔离层)                   │
│                                                             │
│  Session A (user_123, session_abc)                         │
│  /workspace/claude-home/user_123/sessions/session_abc/     │
│  └── workspace/knowledge-base/                             │
│      ├── [Python开发]API文档.pdf    ← 从 S3 下载的副本    │
│      └── [Python开发]最佳实践.md                           │
│                                                             │
│  Session B (user_123, session_xyz)                         │
│  /workspace/claude-home/user_123/sessions/session_xyz/     │
│  └── workspace/knowledge-base/                             │
│      └── [前端技术栈]React指南.md   ← 独立的文档集合      │
│                                                             │
│  Session C (user_456, session_def)                         │
│  /workspace/claude-home/user_456/sessions/session_def/     │
│  └── workspace/knowledge-base/                             │
│      └── ...                         ← 其他用户的 Session │
│                                                             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ PostgreSQL                                              │ │
│  │ └── session_document: Session ↔ Files 关联            │ │
│  └────────────────────────────────────────────────────────┘ │
└───────────────────────┬─────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│  Claude Agent SDK                                           │
│  ├── CLAUDE_HOME=/workspace/claude-home/user_123/          │
│  ├── Session ID: session_abc                               │
│  └── 自动访问: workspace/knowledge-base/ 中的所有文件      │
│                                                             │
│  用户: "请根据 API 文档写代码"                              │
│  Claude: [使用 grep/cat 工具]                               │
│         → 读取 [Python开发]API文档.pdf                     │
│         → 生成代码                                          │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 数据库 ER 图

```
┌─────────────────────┐
│ users               │
│ ─────────────────── │
│ id (PK)             │
│ email               │
│ name                │
└──────────┬──────────┘
           │
           │ 1:N
           │
┌──────────▼──────────┐         ┌─────────────────────┐
│ files               │         │ documents           │
│ ─────────────────── │ 1:1     │ ─────────────────── │
│ id (PK)             ├─────────┤ id (PK)             │
│ key (S3)            │         │ fileId (FK)         │
│ name                │         │ title               │
│ size                │         │ content (extracted) │
│ mimeType            │         │ userId (FK)         │
│ clientId (FK→users) │         └──────────┬──────────┘
└──────────┬──────────┘                    │
           │                               │
           │                               │
           │                               │
           │ N:M                           │
           │ ┌─────────────────────┐       │
           └─┤ kb_documents        │       │
             │ ─────────────────── │       │
             │ id (PK)             │       │
           ┌─┤ kbId (FK)           │       │
           │ │ fileId (FK)         ├───────┘
           │ │ createdAt           │
           │ └─────────────────────┘
           │
           │ N:1
           │
┌──────────▼──────────┐
│ knowledge_bases     │
│ ─────────────────── │
│ id (PK)             │
│ userId (FK→users)   │
│ name                │
│ description         │
│ createdAt           │
│ updatedAt           │
└─────────────────────┘


┌─────────────────────┐         ┌─────────────────────┐
│ agent_session       │         │ session_document    │
│ ─────────────────── │ 1:N     │ ─────────────────── │
│ id (PK)             ├─────────┤ id (PK)             │
│ userId (FK→users)   │         │ sessionId (FK)      │
│ sdkSessionId        │         │ fileId (FK→files)   │
│ realSdkSessionId    │         │ filePath            │
│ claudeHomePath      │         │ syncedAt            │
│ title               │         └─────────────────────┘
│ favorite            │
│ createdAt           │
└─────────────────────┘
```

### 3.3 文件系统结构

```
/workspace/
└── claude-home/
    ├── user_123/                          ← 用户隔离
    │   └── sessions/
    │       ├── session_abc/               ← Session 隔离
    │       │   ├── workspace/
    │       │   │   └── knowledge-base/    ← Claude SDK 访问
    │       │   │       ├── [Python开发]API文档.pdf
    │       │   │       └── [Python开发]最佳实践.md
    │       │   └── .claude/               ← SDK 元数据
    │       │       └── projects/
    │       │           └── default/
    │       │               └── session_abc.jsonl
    │       └── session_xyz/
    │           └── workspace/
    │               └── knowledge-base/
    │                   └── [前端技术栈]React指南.md
    └── user_456/
        └── sessions/
            └── session_def/
                └── workspace/
                    └── knowledge-base/
                        └── ...
```

---

## 4. 数据流详解

### 4.1 文档上传流程

```
┌─────────┐  1. 上传文件   ┌──────────────┐
│ 用户    │ ────────────→  │ Documents UI │
└─────────┘                └───────┬──────┘
                                   │
                                   │ 2. POST /initDocumentUpload
                                   ▼
                           ┌───────────────┐
                           │ API Server    │
                           └───────┬───────┘
                                   │
                ┌──────────────────┼──────────────────┐
                │                  │                  │
                │ 3. 插入 files    │ 4. 插入 documents│
                ▼                  ▼                  │
        ┌───────────────┐  ┌───────────────┐         │
        │ PostgreSQL    │  │ PostgreSQL    │         │
        │ files 表      │  │ documents 表  │         │
        └───────────────┘  └───────────────┘         │
                                   │                  │
                                   │ 5. 上传到 S3     │
                                   ▼                  │
                           ┌───────────────┐         │
                           │ S3 Storage    │         │
                           │ (原始文件)    │         │
                           └───────────────┘         │
                                   │                  │
                                   │ 6. 返回成功      │
                                   ▼                  │
                           ┌───────────────┐         │
                           │ 用户          │ ←───────┘
                           └───────────────┘
```

**关键点**：
- `files` 表：存储 S3 键、文件名、大小、MIME 类型
- `documents` 表：存储标题、内容摘要（提取的文本）
- S3：存储原始二进制文件
- 文件 ID 作为全局唯一标识符

### 4.2 创建 Knowledge Base 流程

```
┌─────────┐  1. 创建 KB     ┌──────────────┐
│ 用户    │ ────────────→   │ Documents UI │
└─────────┘                 └───────┬──────┘
    │                               │
    │                               │ 2. POST /createKnowledgeBase
    │                               ▼
    │                       ┌───────────────┐
    │                       │ API Server    │
    │                       └───────┬───────┘
    │                               │
    │                               │ 3. 插入 knowledge_bases
    │                               ▼
    │                       ┌───────────────┐
    │                       │ PostgreSQL    │
    │                       │ KB 元数据     │
    │                       └───────┬───────┘
    │                               │
    │                               │ 4. 返回 KB ID
    │                               ▼
    │  5. 添加文档到 KB    ┌───────────────┐
    └──────────────────→   │ Documents UI  │
                           └───────┬───────┘
                                   │
                                   │ 6. POST /addKbDocuments
                                   ▼
                           ┌───────────────┐
                           │ API Server    │
                           └───────┬───────┘
                                   │
        ┌──────────────────────────┼─────────────────┐
        │ 7. 验证文件所有权        │                 │
        │                          │                 │
        ▼                          │                 ▼
┌───────────────┐                  │         ┌───────────────┐
│ PostgreSQL    │                  │         │ PostgreSQL    │
│ files 表      │ ←────────────────┘         │ kb_documents  │
└───────────────┘    8. 查询文件信息         │ (关联表)     │
                                             └───────────────┘
                                                     │
                                                     │ 9. 返回成功
                                                     ▼
                                             ┌───────────────┐
                                             │ 用户          │
                                             └───────────────┘
```

**关键点**：
- KB 只存储元数据，不复制文档
- `kb_documents` 是关联表（多对多）
- 添加文档时验证用户所有权
- 支持批量添加（传递 `fileIds` 数组）

### 4.3 添加 KB 到 Session 流程

```
┌─────────┐  1. 点击"添加 KB"  ┌────────────────┐
│ 用户    │ ─────────────────→ │ Claude Chat UI │
└─────────┘                    └────────┬───────┘
                                        │
                                        │ 2. 打开 KB 选择对话框
                                        │    (列出所有 KB)
                                        ▼
                               ┌────────────────┐
                               │ KB List        │
                               │ ─────────────  │
                               │ □ Python 开发  │
                               │ □ 前端技术栈   │
                               └────────┬───────┘
                                        │
                                        │ 3. 选择 KB
                                        │
    4. POST /workspace/:sessionId/      │
       knowledge-bases                  │
       { kbId: "kb_123" }               │
                ┌───────────────────────┘
                │
                ▼
        ┌───────────────┐
        │ API Server    │
        └───────┬───────┘
                │
                │ 5. 查询 KB 详情和文档列表
                ▼
        ┌───────────────────────────────────────┐
        │ PostgreSQL                            │
        │ ─────────────────────────────────     │
        │ SELECT * FROM knowledge_bases         │
        │ WHERE id = 'kb_123'                   │
        │                                       │
        │ SELECT files.*                        │
        │ FROM kb_documents                     │
        │ JOIN files ON kb_documents.fileId...  │
        │ WHERE kbId = 'kb_123'                 │
        └───────────────┬───────────────────────┘
                        │
                        │ 6. 对每个文档:
                        │    a. 从 S3 下载
                        │    b. 写入 workspace
                        │    c. 创建 session_document
                        │
        ┌───────────────▼───────────────────────┐
        │ For each file in KB:                  │
        │                                       │
        │  a) Download from S3                  │
        │     ┌─────────────────┐               │
        │     │ S3 Storage      │               │
        │     │ getFileByteArray│               │
        │     └────────┬────────┘               │
        │              │                        │
        │              ▼                        │
        │  b) Write to workspace                │
        │     /workspace/claude-home/user_123/  │
        │     sessions/session_abc/             │
        │     workspace/knowledge-base/         │
        │     [Python开发]API文档.pdf ←─ 文件名│
        │                       ↑               │
        │                       └── KB 名称前缀 │
        │              │                        │
        │              ▼                        │
        │  c) Insert session_document           │
        │     ┌─────────────────┐               │
        │     │ PostgreSQL      │               │
        │     │ session_document│               │
        │     └─────────────────┘               │
        └───────────────┬───────────────────────┘
                        │
                        │ 7. 返回结果
                        ▼
                ┌───────────────┐
                │ Response      │
                │ ───────────── │
                │ success: true │
                │ kbName: "..." │
                │ total: 2      │
                │ addedDocs: [  │
                │   {...},      │
                │   {...}       │
                │ ]             │
                └───────┬───────┘
                        │
                        │ 8. 刷新文档列表
                        ▼
                ┌───────────────┐
                │ Claude Chat UI│
                │ 显示新文档    │
                └───────────────┘
```

**关键点**：
- API 一次性处理 KB 中所有文档
- 文件名格式：`[KB名称]原文件名.ext`
- 每个文档从 S3 下载到 Session 的 workspace
- 创建 `session_document` 记录跟踪关联
- 去重：已添加的文档会被跳过

### 4.4 Claude SDK 访问文档流程

```
┌─────────┐  1. 发送消息           ┌────────────────┐
│ 用户    │ "请根据 API 文档写代码" │ Claude Chat UI │
└─────────┘ ─────────────────────→ └────────┬───────┘
                                            │
                                            │ 2. WebSocket 消息
                                            │    { type: 'chat',
                                            │      content: '...',
                                            │      sessionId: '...' }
                                            ▼
                                    ┌───────────────┐
                                    │ WS Server     │
                                    └───────┬───────┘
                                            │
                                            │ 3. 启动 Worker
                                            ▼
                                    ┌───────────────┐
                                    │ Worker Process│
                                    └───────┬───────┘
                                            │
                                            │ 4. 设置环境变量
                                            │    CLAUDE_HOME=
                                            │    /workspace/claude-home/user_123/
                                            ▼
                                    ┌───────────────┐
                                    │ Claude SDK    │
                                    │ query(...)    │
                                    └───────┬───────┘
                                            │
                         ┌──────────────────┴──────────────────┐
                         │                                     │
                         │ 5. SDK 自动定位 workspace:          │
                         │    {CLAUDE_HOME}/sessions/          │
                         │    {sessionId}/workspace/           │
                         │                                     │
                         ▼                                     │
                ┌────────────────┐                            │
                │ File System    │                            │
                │ ──────────────│                            │
                │ knowledge-base/│                            │
                │ ├─ [Python开发]│                            │
                │ │  API文档.pdf │ ←─ Claude 使用 grep/cat   │
                │ └─ ...         │    工具读取这些文件        │
                └────────┬───────┘                            │
                         │                                     │
                         └──────────────────┬──────────────────┘
                                            │
                                            │ 6. 生成响应
                                            ▼
                                    ┌───────────────┐
                                    │ Claude API    │
                                    │ (Anthropic)   │
                                    └───────┬───────┘
                                            │
                                            │ 7. 流式返回
                                            ▼
                                    ┌───────────────┐
                                    │ WS Server     │
                                    │ (事件流)      │
                                    └───────┬───────┘
                                            │
                                            │ 8. WebSocket 推送
                                            ▼
                                    ┌───────────────┐
                                    │ Claude Chat UI│
                                    │ 显示 Claude   │
                                    │ 的响应        │
                                    └───────────────┘
```

**关键点**：
- SDK 通过 `CLAUDE_HOME` 环境变量自动定位文件
- 文档在 `workspace/knowledge-base/` 目录
- Claude 使用 `grep`、`cat`、`read` 等工具访问文件
- 文件内容通过工具调用传递给 Claude API
- 不占用消息上下文 token（大文件友好）

---

## 5. 使用指南

### 5.1 上传文档到文档库

**步骤**：
1. 访问 `/agents/documents` 页面
2. 点击右上角"Upload Files"按钮
3. 选择文件上传（支持 PDF、MD、TXT、DOCX 等）
4. 文件自动上传到 S3 并记录到数据库

**结果**：
- 文件出现在"All Files"列表中
- 可在任何 KB 和 Session 中使用

### 5.2 创建 Knowledge Base

**步骤**：
1. 在 `/agents/documents` 页面侧边栏
2. 点击"Knowledge Base"区域的 ➕ 按钮
3. 填写 KB 名称和描述（可选）
4. 点击"Create"创建

**结果**：
- KB 出现在侧边栏列表
- 可以添加文档到此 KB

### 5.3 添加文档到 KB

**步骤**：
1. 点击侧边栏中的 KB 名称
2. 右侧显示该 KB 的文档列表
3. 点击"Add Documents"按钮
4. 从文档选择器中选择文件
5. 确认添加

**结果**：
- 文档出现在 KB 的文档列表
- 文件名前缀显示为 `[KB名称]文件名`

### 5.4 在 Session 中添加单个文档

**步骤**：
1. 在 Claude Chat 页面
2. 点击侧边栏"Knowledge Base"标签
3. 点击"添加文档"按钮
4. 从文档选择器中选择文件
5. 确认添加

**结果**：
- 文档下载到当前 Session 的 workspace
- 出现在 Session 的文档列表
- Claude 可以访问该文档

### 5.5 在 Session 中添加整个 KB

**步骤**：
1. 在 Claude Chat 页面
2. 点击侧边栏"Knowledge Base"标签
3. 点击"添加 KB"按钮
4. 选择要添加的 KB
5. 系统自动添加所有文档

**结果**：
- KB 中所有文档一次性添加到 Session
- 文件名带有 `[KB名称]` 前缀
- 成功提示显示添加的文档数量

### 5.6 使用文档进行对话

**步骤**：
1. 确保文档已添加到当前 Session
2. 在聊天框中输入问题，提到文档内容
   - 例如："请根据 API 文档帮我写一个登录接口"
   - 例如："总结一下最佳实践文档的要点"
3. Claude 会自动使用 grep/cat 工具读取相关文档
4. 基于文档内容生成回复

**提示**：
- 可以明确指出文档名称
- 也可以描述需要的信息，Claude 会自动搜索
- 支持跨文档引用和综合分析

---

## 6. API 接口

### 6.1 Documents API

#### 上传文档
```http
POST /initDocumentUpload

Request Body:
{
  "originalName": "API文档.pdf",
  "mimeType": "application/pdf",
  "size": 102400,
  "title": "API 接口文档",
  "content": "..." // 可选，提取的文本
}

Response:
{
  "id": "file_abc123",
  "key": "uploads/user_123/2025-01-03-uuid-API文档.pdf",
  "uploadUrl": "https://s3.../presigned-url"
}
```

#### 列出文档
```http
GET /api/documents

Response:
{
  "files": [
    {
      "id": "file_abc123",
      "name": "API文档.pdf",
      "size": 102400,
      "mimeType": "application/pdf",
      "createdAt": "2025-01-03T10:00:00Z"
    }
  ]
}
```

### 6.2 Knowledge Base API

#### 创建 KB
```http
POST /api/server-functions/createKnowledgeBase

Request Body:
{
  "data": {
    "name": "Python 开发",
    "description": "Python 相关技术文档"
  }
}

Response:
{
  "id": "kb_123",
  "name": "Python 开发",
  "description": "Python 相关技术文档",
  "documentCount": 0,
  "createdAt": "2025-01-03T10:00:00Z"
}
```

#### 列出 KB
```http
GET /api/server-functions/listKnowledgeBases

Response:
[
  {
    "id": "kb_123",
    "name": "Python 开发",
    "description": "...",
    "documentCount": 5,
    "createdAt": "2025-01-03T10:00:00Z"
  }
]
```

#### 添加文档到 KB
```http
POST /api/server-functions/addKbDocuments

Request Body:
{
  "data": {
    "kbId": "kb_123",
    "fileIds": ["file_abc123", "file_def456"]
  }
}

Response:
{
  "added": 2,
  "errors": []
}
```

### 6.3 Session Workspace API

#### 添加文档到 Session
```http
POST /api/workspace/:sessionId/documents

Request Body:
{
  "fileIds": ["file_abc123", "file_def456"]
}

Response:
{
  "success": true,
  "sessionId": "session_abc",
  "addedDocuments": [
    {
      "id": "session_doc_1",
      "fileId": "file_abc123",
      "fileName": "API文档.pdf",
      "filePath": "knowledge-base/API文档.pdf"
    }
  ],
  "total": 2
}
```

#### 添加 KB 到 Session
```http
POST /api/workspace/:sessionId/knowledge-bases

Request Body:
{
  "kbId": "kb_123"
}

Response:
{
  "success": true,
  "sessionId": "session_abc",
  "kbId": "kb_123",
  "kbName": "Python 开发",
  "addedDocuments": [
    {
      "id": "session_doc_1",
      "fileId": "file_abc123",
      "fileName": "API文档.pdf",
      "workspaceFileName": "[Python开发]API文档.pdf",
      "filePath": "knowledge-base/[Python开发]API文档.pdf"
    }
  ],
  "total": 2
}
```

#### 列出 Session 文档
```http
GET /api/workspace/:sessionId/documents

Response:
{
  "sessionId": "session_abc",
  "documents": [
    {
      "id": "session_doc_1",
      "fileId": "file_abc123",
      "fileName": "API文档.pdf",
      "filePath": "knowledge-base/[Python开发]API文档.pdf",
      "syncedAt": "2025-01-03T10:00:00Z"
    }
  ],
  "total": 1
}
```

---

## 7. 技术实现细节

### 7.1 文件命名规范

#### 全局文档（S3）
```
格式: {prefix}/{userId}/{timestamp}-{uuid}-{originalName}
示例: uploads/user_123/2025-01-03-uuid123-API文档.pdf
```

#### KB 文档（workspace）
```
格式: [KB名称]原文件名.ext
示例: [Python开发]API文档.pdf
目的: 标识文档来源，避免文件名冲突
```

#### 单个文档（workspace）
```
格式: 原文件名.ext (经过 sanitize)
示例: API文档.pdf
目的: 保持原始文件名，方便识别
```

### 7.2 文件 Sanitize 规则

```typescript
function sanitizeFilename(filename: string): string {
  return path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
}
```

**处理逻辑**：
- 保留：字母、数字、`.`、`_`、`-`
- 替换为 `_`：空格、中文、特殊字符
- 使用 `path.basename()` 防止路径遍历攻击

**示例**：
```
"../../../etc/passwd"     → "passwd"
"API 文档 (v2).pdf"       → "API__v2_.pdf"
"文件名.txt"              → "_____.txt"
```

### 7.3 Session 隔离机制

#### 目录结构
```
/workspace/claude-home/
└── {userId}/                  ← 用户隔离
    └── sessions/
        └── {sdkSessionId}/    ← Session 隔离
            ├── workspace/     ← Claude SDK 工作区
            │   └── knowledge-base/
            └── .claude/       ← SDK 元数据
```

#### 环境变量设置
```javascript
// ws-server.mjs
const env = {
  CLAUDE_HOME: session.claudeHomePath,  // /workspace/claude-home/user_123/
  ...customEnv
};

// Claude SDK 自动查找:
// {CLAUDE_HOME}/sessions/{sdkSessionId}/workspace/
```

#### 权限控制
```typescript
// API 层验证
const [session] = await db
  .select()
  .from(agentSession)
  .where(and(
    eq(agentSession.sdkSessionId, sessionId),
    eq(agentSession.userId, user.id)  // ← 确保只能访问自己的 Session
  ));
```

### 7.4 去重逻辑

#### KB 文档去重
```typescript
// kb_documents 表有唯一索引
uniqueIndex('idx_kb_documents_unique').on(
  table.kbId,
  table.fileId
)

// 添加时检查
const [existing] = await db
  .select()
  .from(kbDocuments)
  .where(and(
    eq(kbDocuments.kbId, data.kbId),
    eq(kbDocuments.fileId, fileId)
  ));

if (existing) {
  errors.push({ fileId, error: 'Already in knowledge base' });
  continue;
}
```

#### Session 文档去重
```typescript
// session_document 表检查
const [existing] = await db
  .select()
  .from(sessionDocument)
  .where(and(
    eq(sessionDocument.sessionId, session.id),
    eq(sessionDocument.fileId, fileId)
  ));

if (existing) {
  errors.push({ fileId, error: 'Already added to session' });
  continue;
}
```

### 7.5 错误处理

#### 批量操作错误处理
```typescript
const addedDocuments = [];
const errors = [];

for (const fileId of data.fileIds) {
  try {
    // 处理单个文件
    // ...
    addedDocuments.push(result);
  } catch (error) {
    errors.push({
      fileId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

return {
  added: addedDocuments.length,
  errors: errors.length > 0 ? errors : undefined,
};
```

**优点**：
- 部分成功不影响整体
- 清晰报告每个文件的状态
- 前端可以重试失败的文件

---

## 8. 最佳实践

### 8.1 文档组织

#### ✅ 推荐做法

**按主题创建 KB**：
```
KB: "Python 开发"
├── Python 基础语法.md
├── Django 框架指南.pdf
└── API 设计最佳实践.md

KB: "前端技术栈"
├── React 官方文档.md
├── TypeScript 手册.pdf
└── CSS 布局技巧.md
```

**共享通用文档**：
```
Document: "API 设计最佳实践.md"
├── 属于 KB "Python 开发"
├── 属于 KB "Java 开发"
└── 属于 KB "前端技术栈"
```

**Session 按需添加**：
```
Session A: Python Web 开发
└── 添加 KB "Python 开发"

Session B: 前端项目
└── 添加 KB "前端技术栈"
```

#### ❌ 避免的做法

**不要创建过大的 KB**：
```
❌ KB: "所有文档"（包含 100+ 文档）
   └── 难以管理，Session 加载慢
```

**不要重复上传相同文档**：
```
❌ API文档-v1.pdf
   API文档-v2.pdf
   API文档-最终版.pdf

✅ API文档.pdf（更新时覆盖）
```

### 8.2 命名规范

#### KB 命名
```
✅ "Python 开发"
✅ "客户 A 项目文档"
✅ "2025 Q1 技术规范"

❌ "kb1"
❌ "文档"
❌ "Python相关的一些开发文档和资料汇总"
```

#### 文档标题
```
✅ "Django REST Framework 快速入门"
✅ "API 接口设计规范 v2.0"

❌ "文档.pdf"
❌ "新建文件夹 (2)/最终版-修改后.docx"
```

### 8.3 性能优化

#### 文档大小控制
```
推荐: < 5 MB 每个文档
可接受: 5-20 MB
避免: > 20 MB (考虑拆分或压缩)
```

#### Session 文档数量
```
推荐: < 10 个文档每 Session
可接受: 10-30 个
避免: > 30 个 (影响 Claude 搜索效率)
```

#### 文本提取
```
PDF/DOCX → 提取为 Markdown 或 TXT
优点:
- Claude 更容易解析
- 节省 token
- 提升搜索准确度
```

### 8.4 安全考虑

#### 用户隔离
```
✅ 每个用户只能访问自己的文档
✅ Session 间完全隔离
✅ API 层强制验证所有权
```

#### 文件验证
```
✅ 验证 MIME 类型
✅ Sanitize 文件名
✅ 限制文件大小
✅ 扫描恶意内容（TODO）
```

#### 权限控制
```
Documents: 用户只能访问自己上传的文档
KB: 用户只能访问自己创建的 KB
Session: 用户只能访问自己的 Session
```

### 8.5 故障排查

#### 文档未出现在 Session

**检查清单**：
1. 确认文档已成功上传到 Documents
2. 确认文档已添加到 KB（如果通过 KB 添加）
3. 检查 Session ID 是否正确
4. 查看浏览器控制台是否有 API 错误
5. 验证 workspace 目录权限

**调试命令**：
```bash
# 检查文件是否在 workspace
ls -la /workspace/claude-home/{userId}/sessions/{sessionId}/workspace/knowledge-base/

# 检查数据库记录
psql -c "SELECT * FROM session_document WHERE sessionId = '{sessionId}';"
```

#### Claude 无法访问文档

**可能原因**：
1. 文件格式不支持（PDF 未提取文本）
2. 文件路径错误
3. CLAUDE_HOME 环境变量未设置
4. Session ID 不匹配

**解决方法**：
1. 确认文件在 `workspace/knowledge-base/` 目录
2. 检查 WebSocket 日志中的 `CLAUDE_HOME` 值
3. 重新同步文档（点击刷新按钮）
4. 查看 Claude 的工具调用日志

---

## 附录

### A. 相关文件清单

#### 后端 API
- `src/routes/api/workspace/$sessionId.documents.ts` - Session 文档管理
- `src/routes/api/workspace/$sessionId.knowledge-bases.ts` - Session KB 集成
- `src/server/function/documents.server.ts` - 文档上传/管理
- `src/server/function/knowledge-bases.server.ts` - KB CRUD

#### 前端组件
- `src/routes/agents/documents/route.tsx` - Documents 页面（含 KB 管理）
- `src/components/claude-chat/knowledge-base-panel.tsx` - Session KB 面板
- `src/components/claude-chat/document-selector-modal.tsx` - 文档选择器

#### 数据库 Schema
- `src/db/schema/file.schema.ts` - 文件表
- `src/db/schema/document.schema.ts` - 文档表
- `src/db/schema/knowledge-base.schema.ts` - KB 表
- `src/db/schema/kb-document.schema.ts` - KB-文档关联表
- `src/db/schema/session-document.schema.ts` - Session-文档关联表

#### WebSocket 服务器
- `ws-server.mjs` - WebSocket 主服务器
- `ws-query-worker.mjs` - Worker 进程（执行 Claude SDK）

### B. 数据库迁移

创建 KB 相关表的迁移已在以下提交中完成：
- 创建 `knowledge_bases` 表
- 创建 `kb_documents` 表
- 添加必要的索引和外键约束

### C. 未来改进方向

1. **文本提取** - 自动提取 PDF/DOCX 文本为 Markdown
2. **文档预览** - 在 UI 中预览文档内容
3. **版本控制** - 支持文档版本管理
4. **全文搜索** - 基于内容搜索文档
5. **智能推荐** - 根据对话内容推荐相关文档
6. **批量操作** - 批量上传、批量添加到 KB
7. **权限共享** - 支持团队间共享 KB
8. **使用统计** - 跟踪文档使用频率

---

**文档版本**: 1.0
**最后更新**: 2025-01-03
**维护者**: Claude Agent Chat 开发团队
