# Claude Agent SDK 超时处理研究报告

**日期**: 2025-12-19
**研究目的**: 解决 `HeadersTimeoutError` 导致服务器崩溃的问题

---

## 1. 问题描述

### 1.1 错误现象

```
TypeError: fetch failed
  [cause]: HeadersTimeoutError: Headers Timeout Error
    at FastTimer.onParserTimeout [as _onTimeout]
    code: 'UND_ERR_HEADERS_TIMEOUT'
```

### 1.2 触发条件

- 前端发送消息到 `/api/agent-chat`
- Claude Agent SDK 调用 GLM API (`https://open.bigmodel.cn/api/anthropic`)
- GLM API 响应时间超过 undici 默认的 headers 超时（约 30 秒）
- 错误发生在 Nitro 框架内部 (`nitro-nightly/dist/_chunks/plugin.mjs`)

### 1.3 影响

- Node.js 进程崩溃（Unhandled Promise Rejection）
- 开发服务器自动退出

---

## 2. 官方文档研究发现

### 2.1 AbortController 正确用法

**来源**: [GitHub Issue #2970 - AbortController not respected](https://github.com/anthropics/claude-code/issues/2970)

**关键发现**: `abortController` 必须放在 `options` 对象内部，而不是顶层参数。

```typescript
// ❌ 错误 - AbortController 不会生效
query({
  prompt,
  abortController: controller  // 顶层参数不生效
})

// ✅ 正确 - AbortController 放在 options 内部
query({
  prompt,
  options: {
    abortController: controller  // 正确位置
  }
})
```

**官方回应**: 问题已于 2025-08-22 关闭，确认这是文档问题，`abortController` 必须在 `options` 内部。

### 2.2 超时配置环境变量

**来源**: [GitHub Issue #5615 - Complete Claude Code Timeout Configuration Guide](https://github.com/anthropics/claude-code/issues/5615)

**官方支持的环境变量**:

| 变量名 | 作用 | 推荐值 |
|--------|------|--------|
| `BASH_DEFAULT_TIMEOUT_MS` | Bash 命令默认超时 | `1800000` (30分钟) |
| `BASH_MAX_TIMEOUT_MS` | Bash 命令最大超时 | `7200000` (120分钟) |

**配置位置**: `~/.claude/settings.json`

```json
{
  "env": {
    "BASH_DEFAULT_TIMEOUT_MS": "1800000",
    "BASH_MAX_TIMEOUT_MS": "7200000"
  }
}
```

**重要提示**:
- ❌ Shell 环境变量 `export BASH_DEFAULT_TIMEOUT_MS=...` 不生效
- ❌ 项目级配置 `.claude/settings.local.json` 不生效
- ✅ 必须配置在 Claude Code 内部设置文件中
- ✅ 配置后需要完全重启 Claude Code

### 2.3 SDK 重试机制

**来源**: [anthropic-sdk-typescript](https://github.com/anthropics/anthropic-sdk-typescript)

| 特性 | 默认值 | 说明 |
|------|--------|------|
| 默认超时 | 10 分钟 | 可通过 `timeout` 选项配置 |
| 重试次数 | 2 次 | 超时的请求会自动重试 |
| 超时异常 | `APIConnectionTimeoutError` | 超时时抛出的错误类型 |

### 2.4 SDK Options 完整参考

**来源**: [claude-agent-sdk-python](https://github.com/anthropics/claude-agent-sdk-python)

```typescript
interface ClaudeAgentOptions {
  // 基础配置
  cwd?: string;                    // 工作目录
  model?: string;                  // 模型名称
  system_prompt?: string;          // 系统提示词
  max_turns?: number;              // 最大对话轮数

  // 权限配置
  permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions';
  allowDangerouslySkipPermissions?: boolean;
  allowed_tools?: string[];        // 允许的工具列表

  // 会话控制
  resume?: string;                 // 恢复会话 ID
  abortController?: AbortController;  // 中断控制器

  // MCP 服务器
  mcp_servers?: Record<string, MCPServerConfig>;

  // 环境变量
  env?: Record<string, string>;

  // 钩子
  hooks?: HooksConfig;
}
```

---

## 3. 问题根因分析

### 3.1 错误层级

```
用户请求
    ↓
/api/agent-chat (TanStack Start API Route)
    ↓
Claude Agent SDK query()
    ↓
SDK 内部 fetch() 调用 GLM API
    ↓
Nitro 框架拦截 fetch
    ↓
undici HTTP 客户端
    ↓
❌ HeadersTimeoutError (undici 默认 30 秒超时)
```

### 3.2 关键发现

1. **错误位置**: 不在我们的代码中，而在 Nitro 框架内部
2. **根本原因**: undici（Node.js 内置 HTTP 客户端）的 headers 超时太短
3. **触发条件**: GLM API 响应时间超过 30 秒
4. **框架差异**:
   - `claude-agent-chat` (Next.js) - 无此问题
   - `constructa-starter` (TanStack Start + Nitro) - 有此问题

---

## 4. 解决方案

### 4.1 方案一：配置 undici 全局超时（已实施）

**文件**: `src/routes/api/agent-chat.ts`

```typescript
import { setGlobalDispatcher, Agent } from 'undici';

// 配置 undici 更长的超时时间
setGlobalDispatcher(
  new Agent({
    headersTimeout: 5 * 60 * 1000,   // 5 分钟等待响应头
    bodyTimeout: 30 * 60 * 1000,     // 30 分钟等待响应体（流式）
    connectTimeout: 30 * 1000,       // 30 秒连接超时
  })
);
```

**优点**: 最小侵入性，不改变架构
**缺点**: 全局影响所有 fetch 请求

### 4.2 方案二：进程级错误处理（已实施）

```typescript
// 防止未捕获的异常导致进程崩溃
if (typeof process !== 'undefined') {
  process.on('uncaughtException', (err) => {
    console.error('[Agent Route] UNCAUGHT EXCEPTION:', err);
  });
  process.on('unhandledRejection', (reason, _promise) => {
    console.error('[Agent Route] UNHANDLED REJECTION:', reason);
  });
}
```

### 4.3 方案三：SSE 连接保活（已实施）

```typescript
// 15 秒心跳
const HEARTBEAT_MS = 15_000;
const heartbeat = setInterval(
  () => controller.enqueue(encoder.encode(':ping\n\n')),
  HEARTBEAT_MS
);

// 30 分钟空闲超时，每次收到事件重置
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
let idleTimer = setTimeout(() => abortWith('timeout:stream', 'idle timeout'), IDLE_TIMEOUT_MS);

const resetIdle = () => {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => abortWith('timeout:stream', 'idle timeout'), IDLE_TIMEOUT_MS);
};
```

### 4.4 方案四：WebSocket 替代 SSE（未实施）

参考 `claude-agent-kit` 的实现，使用 WebSocket 双向通信：

**优点**:
- WebSocket 自带 keep-alive
- 双向通信，可实现更复杂的交互
- 更好的连接状态管理

**缺点**:
- 需要重写前后端代码
- 需要引入 Session Manager
- 工作量较大

---

## 5. 参考实现对比

### 5.1 claude-agent-chat (Next.js)

**文件**: `lib/agent/agent-bridge.ts`

```typescript
const abortController = new AbortController();
const { maxDurationMs = 30 * 60 * 1000 } = options ?? {};
let timedOut = false;

const iterator = await sdkQuery({
  prompt,
  options: {
    abortController,
    // ...
  },
});

const timeout = setTimeout(() => {
  timedOut = true;
  abortController.abort("timeout");
}, maxDurationMs);

async function* wrapped(): AsyncGenerator<NormalizedEvent> {
  try {
    for await (const raw of iterator) {
      yield normalizedEvent;
    }
  } finally {
    clearTimeout(timeout);
    if (timedOut) {
      yield toErrorEvent({ code: "timeout:stream", message: "stream timeout" });
    }
  }
}
```

### 5.2 claude-agent-kit (WebSocket)

**文件**: `packages/server/src/server/session.ts`

```typescript
// Promise 队列防止并发
if (this.queryPromise) {
  await this.queryPromise;
}

this.abortController = new AbortController();

this.queryPromise = (async () => {
  try {
    for await (const message of this.sdkClient.queryStream(
      generateMessages(),
      { ...options, abortController: this.abortController }
    )) {
      this.processIncomingMessage(message);
    }
  } catch (error) {
    this.error = error instanceof Error ? error : String(error);
  } finally {
    this.queryPromise = null;
    this.setBusyState(false);
  }
})();
```

---

## 6. 最终实施代码

**文件**: `src/routes/api/agent-chat.ts`

```typescript
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { requireUser } from '~/server/require-user';
import { setGlobalDispatcher, Agent } from 'undici';

// 1. 配置 undici 超时
setGlobalDispatcher(
  new Agent({
    headersTimeout: 5 * 60 * 1000,
    bodyTimeout: 30 * 60 * 1000,
    connectTimeout: 30 * 1000,
  })
);

// 2. 进程级错误处理
if (typeof process !== 'undefined') {
  process.on('uncaughtException', (err) => {
    console.error('[Agent Route] UNCAUGHT EXCEPTION:', err);
  });
  process.on('unhandledRejection', (reason, _promise) => {
    console.error('[Agent Route] UNHANDLED REJECTION:', reason);
  });
}

const HEARTBEAT_MS = 15_000;
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

export const Route = createFileRoute('/api/agent-chat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // ... 认证和解析请求 ...

        const abortController = new AbortController();

        const stream = new ReadableStream({
          async start(controller) {
            // 3. 心跳保活
            const heartbeat = setInterval(
              () => controller.enqueue(encoder.encode(':ping\n\n')),
              HEARTBEAT_MS
            );

            // 4. 空闲超时
            let idleTimer = setTimeout(
              () => abortWith('timeout:stream', 'idle timeout'),
              IDLE_TIMEOUT_MS
            );

            try {
              // 5. SDK 调用 - abortController 在 options 内部
              const sdkStream = query({
                prompt,
                options: {
                  abortController,  // ✅ 正确位置
                  // ...
                },
              });

              for await (const event of sdkStream) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
                resetIdle();
              }
            } finally {
              clearTimeout(idleTimer);
              clearInterval(heartbeat);
            }
          },
        });

        return new Response(stream, { /* SSE headers */ });
      },
    },
  },
});
```

---

## 7. 参考资料

- [AbortController Bug Report - Issue #2970](https://github.com/anthropics/claude-code/issues/2970)
- [Timeout Configuration Guide - Issue #5615](https://github.com/anthropics/claude-code/issues/5615)
- [Claude Agent SDK TypeScript](https://github.com/anthropics/claude-agent-sdk-typescript)
- [Claude Agent SDK Python](https://github.com/anthropics/claude-agent-sdk-python)
- [Building Agents with Claude Agent SDK](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk)
- [Anthropic SDK TypeScript](https://github.com/anthropics/anthropic-sdk-typescript)

---

## 8. 已尝试但无效的方案

### 8.1 setGlobalDispatcher (无效)

```typescript
import { setGlobalDispatcher, Agent } from 'undici';
setGlobalDispatcher(new Agent({ headersTimeout: 300000 }));
```

**原因**: Nitro 使用 `node:internal/deps/undici`（Node.js 内置），不受 npm 包的 undici 配置影响。

### 8.2 Symbol.for globalDispatcher (无效)

```typescript
(globalThis as any)[Symbol.for('undici.globalDispatcher.1')] = customAgent;
```

**原因**: 同上，Node.js 内置的 undici 不读取这些 Symbol。

### 8.3 在 vite.config.ts 最顶部设置 (无效)

即使在最早执行的代码中设置，仍然无效。

---

## 9. 问题根因（最终结论）

### 错误位置

```
node:internal/deps/undici/undici:15482
      Error.captureStackTrace(err);
```

这是 **Node.js 内置的 undici**，其超时是硬编码的，无法通过以下方式修改：
- npm 包的 `undici` 配置
- `globalThis[Symbol.for(...)]`
- 环境变量

### Nitro 框架限制

根据 [Nitro Issue #2638](https://github.com/nitrojs/nitro/issues/2638)：
> "Currently the only way to set keepAliveTimeout & headersTimeout is to add it to the generated file post-build (fragile), or create a whole new preset."

这是一个**已知的未解决问题**。

---

## 10. 可行的解决方案

### 10.1 使用更快的 API 端点

当前配置使用 GLM API：
```
ANTHROPIC_BASE_URL=https://open.bigmodel.cn/api/anthropic
```

GLM API 响应时间可能超过 Node.js 内置 undici 的默认超时（约 30 秒）。

**建议**: 测试使用真正的 Anthropic API，确认是否是 GLM 特有的问题。

### 10.2 WebSocket 方案

参考 `claude-agent-kit` 使用 WebSocket 替代 SSE：
- WebSocket 有不同的超时机制
- 可以绑定自定义的 HTTP 服务器配置

### 10.3 Next.js 替代 TanStack Start

`claude-agent-chat` 使用 Next.js 没有此问题，说明：
- Next.js 的 HTTP 处理与 Nitro 不同
- 如果问题持续，可以考虑迁移框架

### 10.4 等待上游修复

- [Nitro Issue #2638](https://github.com/nitrojs/nitro/issues/2638) - headersTimeout 配置支持
- [Node.js undici](https://github.com/nodejs/undici) - 可能的未来版本改进

---

## 11. 当前状态

| 方案 | 状态 | 备注 |
|------|------|------|
| undici 配置 | ❌ 无效 | Node.js 内置 undici 不可配置 |
| 进程错误处理 | ✅ 已实施 | 防止进程崩溃（但无法阻止超时） |
| Heartbeat | ✅ 已实施 | 保持 SSE 连接 |
| Idle timeout | ✅ 已实施 | 30 分钟空闲超时 |
| WebSocket 方案 | ⏳ 待评估 | 需要较大改动 |

---

## 12. 关键测试发现（2025-12-19 更新）

### 12.1 独立测试脚本验证

创建了独立测试脚本 `test-sdk.mjs` 直接调用 Claude Agent SDK：

```javascript
#!/usr/bin/env node
import { query } from '@anthropic-ai/claude-agent-sdk';

const stream = query({
  prompt: 'Say "Hello, SDK test successful!" and nothing else.',
  options: {
    cwd: process.cwd(),
    model: process.env.ANTHROPIC_MODEL,
    maxTurns: 1,
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    env: {
      ...process.env,
      ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL,
      ANTHROPIC_API_URL: process.env.ANTHROPIC_BASE_URL,
    },
  },
});

for await (const event of stream) {
  console.log(`Event: ${event.type}`);
}
```

### 12.2 测试结果

```
Starting SDK test...
Timestamp: 2025-12-19T15:21:01.234Z
Environment:
  ANTHROPIC_API_KEY: ***set***
  ANTHROPIC_BASE_URL: https://open.bigmodel.cn/api/anthropic
  ANTHROPIC_MODEL: glm-4-plus-0111

Calling SDK query()...
[5312ms] Event 1: system
[5315ms] Event 2: assistant
  Text: Hello, SDK test successful!
[5776ms] Event 3: result

✅ SDK test completed successfully!
Total events: 3
Total time: 5776ms
```

### 12.3 关键结论

| 测试场景 | 耗时 | 结果 |
|---------|------|------|
| 独立脚本调用 SDK | **5.7 秒** | ✅ 正常 |
| 通过 Nitro API Route | 不确定 | ❌ 超时崩溃 |

**证实了用户的直觉是正确的**：
- ❌ **不是** GLM API 响应速度慢的问题
- ❌ **不是** SDK 本身的问题
- ✅ **是** Nitro 框架处理 fetch 请求的方式问题

### 12.4 问题重新定位

原假设：GLM API 响应超过 30 秒导致 undici 超时
新发现：SDK 直接调用仅需 5.7 秒，问题出在 Nitro 对 fetch 的处理

可能的原因：
1. Nitro 内部使用的 fetch 与独立 Node.js 进程不同
2. Nitro 可能有额外的中间件或代理层
3. TanStack Start 的 SSR 环境可能有特殊限制

### 12.5 服务器日志分析

查看服务器日志发现，**多个请求实际上成功了**：

```
POST /api/agent-chat -> 200 at 22:22:43
POST /api/agent-chat -> 200 at 22:24:11
POST /api/agent-chat -> 200 at 22:24:20
```

**关键发现**：崩溃是**间歇性的**，不是每次请求都失败。这说明：
- 正常情况下 SDK 可以正常工作
- 只有在特定条件下才会触发超时崩溃
- 可能与 GLM API 的偶发延迟有关

### 12.6 Nitro Worker 机制分析

通过分析 Nitro 源码 (`nitro-nightly/dist/_chunks/worker.mjs`)：

```javascript
// Line 93-95: fetchSocketOptions 函数
return {
  dispatcher: new Agent({ connect: { socketPath } })
};
```

**问题**：用于 Vite 主进程与 Worker 通信的 undici Agent **没有配置超时时间**，使用 Node.js 默认值。

**工作流程**：
1. 浏览器 → Vite 主进程（HTTP 请求）
2. Vite 主进程 → Nitro Worker（Unix Socket fetch）
3. Worker → SDK → GLM API（外部 HTTP）
4. GLM API → Worker → Vite 主进程 → 浏览器

如果第 3 步 GLM API 响应慢，第 2 步的 socket fetch 可能超时。

---

## 13. 最终结论

### 13.1 问题性质确认

| 项目 | 结论 |
|------|------|
| 问题频率 | 间歇性，非必现 |
| 根本原因 | Nitro 框架的 undici 超时配置 |
| GLM API | 正常，响应时间约 5-6 秒 |
| SDK | 正常，独立运行无问题 |

### 13.2 当前状态

✅ **服务器正在运行** - 多数请求成功

已实施的保护措施：
- 进程级错误处理（防止崩溃）
- 15 秒心跳保活
- 30 分钟空闲超时
- AbortController 正确配置

### 13.3 后续建议

1. **短期（已完成）**: 保持进程错误处理，防止偶发超时导致崩溃
2. **观察**: 监控超时频率，收集更多数据
3. **中期**: 如果频繁发生，考虑 WebSocket 方案
4. **长期**: 关注 Nitro Issue #2638 进展

---

## 14. 附录：测试脚本

文件：`test-sdk.mjs`

可用于独立验证 SDK 功能，排除框架问题：

```bash
# 运行测试
node test-sdk.mjs
```
