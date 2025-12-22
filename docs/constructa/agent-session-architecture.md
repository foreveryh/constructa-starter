# Agent 会话架构设计文档

> 本文档对比分析 Worker 进程隔离与内存会话管理两种架构方案，并记录我们的技术选型决策。

## 背景

在构建基于 Claude Agent SDK 的多租户聊天平台时，会话管理架构是核心设计决策之一。我们参考了 [claude-agent-kit](https://github.com/anthropics/claude-agent-kit) 的实现，并根据多租户需求进行了架构调整。

## 架构方案对比

### 方案 A：Worker 进程隔离（当前采用）

```
┌─────────────────────────────────────────────────────────────────┐
│                        Main Process                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ WS Handler  │  │ Auth Layer  │  │ Session DB  │              │
│  └──────┬──────┘  └─────────────┘  └─────────────┘              │
│         │                                                        │
│         │ spawn()                                                │
│         ▼                                                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  Worker A   │  │  Worker B   │  │  Worker C   │  ...         │
│  │  (User 1)   │  │  (User 2)   │  │  (User 3)   │              │
│  │             │  │             │  │             │              │
│  │ CLAUDE_HOME │  │ CLAUDE_HOME │  │ CLAUDE_HOME │              │
│  │ /user1/     │  │ /user2/     │  │ /user3/     │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

**实现要点：**
- 每个查询在独立的 Node.js 子进程中执行
- Worker 通过 stdin/stdout 与主进程通信
- 每个用户有独立的 `CLAUDE_HOME` 和 `cwd`
- 会话状态通过 JSONL 文件持久化
- Abort 通过 `process.kill()` 实现

**核心代码：**
```javascript
// ws-server.mjs
const worker = spawn('node', [WORKER_PATH], {
  env: {
    ...process.env,
    CLAUDE_HOME: getClaudeHome(userId),
    WORKER_CWD: getSessionWorkspace(userId, sessionId),
  },
  stdio: ['pipe', 'pipe', 'pipe'],
});
```

### 方案 B：内存会话管理（Claude-Agent-Kit）

```
┌─────────────────────────────────────────────────────────────────┐
│                      Single Process                              │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   SessionManager                         │    │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐            │    │
│  │  │ Session A │  │ Session B │  │ Session C │  ...       │    │
│  │  │ messages  │  │ messages  │  │ messages  │            │    │
│  │  │ options   │  │ options   │  │ options   │            │    │
│  │  └───────────┘  └───────────┘  └───────────┘            │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│  ┌───────────────────────────┼───────────────────────────┐      │
│  │ WebSocket Clients         │                           │      │
│  │  Client A ────────────────┼──── subscribe(Session A)  │      │
│  │  Client B ────────────────┼──── subscribe(Session B)  │      │
│  └───────────────────────────┴───────────────────────────┘      │
└─────────────────────────────────────────────────────────────────┘
```

**实现要点：**
- 所有会话在单进程内存中管理
- 使用订阅/取消订阅模式连接客户端和会话
- 无 abort 机制，查询运行到完成
- 会话状态保持在内存中

**核心代码：**
```typescript
// claude-agent-kit: websocket-handler.ts
const webSocketHandler = new WebSocketHandler(sdkClient, baseOptions);

webSocketServer.on('connection', (ws) => {
  void webSocketHandler.onOpen(ws);
  // Client subscribes to session, receives all messages
});
```

## 详细对比

### Worker 进程隔离

| 维度 | 优势 | 劣势 |
|------|------|------|
| **安全性** | 用户代码在独立进程执行，无法影响其他用户 | - |
| **故障隔离** | Worker 崩溃只影响单个会话 | - |
| **资源控制** | 可对单个 Worker 设置 CPU/内存限制 | 多进程总体内存占用较高 |
| **环境隔离** | 每个 Worker 独立的 `CLAUDE_HOME`、`cwd` | - |
| **可中断性** | 可随时 kill 进程中断长任务 | Kill 会丢失进程内临时状态 |
| **可扩展性** | 主进程无状态，易于水平扩展 | - |
| **性能** | - | 进程创建开销 ~50-100ms |
| **复杂性** | - | IPC 序列化/反序列化，调试困难 |

### 内存会话管理

| 维度 | 优势 | 劣势 |
|------|------|------|
| **性能** | 零进程创建开销，响应更快 | - |
| **内存效率** | 单进程共享运行时 | 长时间运行可能累积内存泄漏 |
| **状态管理** | 会话状态保持在内存，无需重新加载 | - |
| **架构简洁** | 单进程模型易于理解和调试 | - |
| **安全性** | - | 无用户隔离，存在安全风险 |
| **可靠性** | - | 进程崩溃影响所有用户 |
| **可中断性** | - | 无 abort 机制，长任务必须完成 |
| **可扩展性** | - | 单进程无法利用多核 CPU |

## 适用场景

### 推荐使用 Worker 进程隔离

- 多租户 SaaS 平台（用户间需要严格隔离）
- Agent 会执行用户代码或文件操作
- 需要能够中断长时间运行的任务
- 需要对单用户资源进行限制
- 高可用要求（故障不能影响其他用户）

### 推荐使用内存会话管理

- 单用户或可信用户环境
- 追求最低延迟和最高性能
- Agent 只做对话，不执行危险操作
- 开发/测试环境
- 资源受限的边缘设备

## 我们的选择

**选择方案 A：Worker 进程隔离**

理由：
1. **多租户安全**：作为 SaaS 平台，用户间的隔离是硬性要求
2. **Agent 执行代码**：Claude Agent SDK 会执行文件操作和代码，需要沙箱隔离
3. **任务可控**：用户需要能够中断长时间运行的任务
4. **故障隔离**：单个用户的问题不应影响其他用户

## 已知问题与优化方向

### 当前问题

1. **Abort 处理粗暴**：直接 kill 进程可能导致状态不一致
2. **进程开销**：每次查询创建新进程有启动延迟
3. **状态同步**：前端和后端的会话状态需要手动同步

### 优化方向

| 优化项 | 描述 | 优先级 |
|--------|------|--------|
| Worker 池化 | 预先创建 Worker 池，减少启动延迟 | 高 |
| 优雅中断 | 发送 abort 信号让 Worker 自行清理，而非直接 kill | 高 |
| 会话复用 | 同一会话的连续查询复用同一 Worker | 中 |
| 混合模式 | 轻量查询用内存，重量查询用 Worker | 低 |

### 优雅中断实现思路

```javascript
// 当前：粗暴 kill
case 'abort':
  if (ws.workerProcess) {
    ws.workerProcess.kill();  // 直接杀死
  }
  break;

// 优化：优雅中断
case 'abort':
  if (ws.workerProcess) {
    // 1. 发送中断信号给 Worker
    ws.workerProcess.send({ type: 'abort' });

    // 2. 设置超时，如果 Worker 未响应则强制 kill
    setTimeout(() => {
      if (ws.workerProcess) {
        ws.workerProcess.kill();
      }
    }, 5000);
  }
  break;
```

### Worker 池化实现思路

```javascript
class WorkerPool {
  constructor(size = 4) {
    this.workers = [];
    this.available = [];

    // 预创建 Worker
    for (let i = 0; i < size; i++) {
      const worker = this.createWorker();
      this.workers.push(worker);
      this.available.push(worker);
    }
  }

  async acquire(userId, sessionId) {
    // 获取可用 Worker 或等待
    if (this.available.length > 0) {
      const worker = this.available.pop();
      worker.configure(userId, sessionId);
      return worker;
    }

    // 等待 Worker 释放或创建新的
    return this.waitForWorker();
  }

  release(worker) {
    worker.reset();
    this.available.push(worker);
  }
}
```

## 参考资料

- [Claude Agent SDK 官方文档](https://docs.anthropic.com/en/docs/claude-code/sdk)
- [claude-agent-kit GitHub](https://github.com/anthropics/claude-agent-kit)
- [Node.js Child Processes](https://nodejs.org/api/child_process.html)

## 修订历史

| 日期 | 版本 | 修订内容 |
|------|------|----------|
| 2025-12-22 | v1.0 | 初稿，记录架构对比分析 |
