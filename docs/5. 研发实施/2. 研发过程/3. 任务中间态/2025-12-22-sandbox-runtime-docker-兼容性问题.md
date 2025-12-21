# Sandbox-Runtime Docker 兼容性问题研究报告

**状态**: [完成待回收]
**日期**: 2025-12-21
**执行者**: 后端工程师 E
**分支**: `feat/phase3-docker` (constructa-phase3)

---

## 1. 背景

在 Phase 3 Docker 容器化阶段，我们尝试集成 Anthropic 官方的 `@anthropic-ai/sandbox-runtime` 包，为 Claude Agent 提供 OS 级别的沙箱隔离。

### 1.1 目标

- 使用 bubblewrap (bwrap) 在 Linux 容器中实现进程隔离
- 限制 Agent 对敏感文件的访问（如 `/etc/shadow`, `.env` 等）
- 限制 Agent 对应用代码目录 `/app` 的写入
- 可选的网络域名限制

### 1.2 已完成的配置

```javascript
// ws-server.mjs 中的 sandbox 配置
const sandboxConfig = {
  network: {
    deniedDomains: [],
    allowLocalBinding: true,
    allowAllUnixSockets: true,  // 禁用 seccomp Unix socket 限制
  },
  filesystem: {
    denyRead: ['/etc/shadow', '/etc/passwd', '**/.env*', '**/credentials*', '**/secrets*'],
    allowWrite: [SESSIONS_ROOT, '/tmp'],
    denyWrite: ['.git/hooks', '.gitmodules', '.github/workflows', '/app'],
    allowGitConfig: false,
  },
  enableWeakerNestedSandbox: true,  // Docker 兼容模式
};
```

---

## 2. 遇到的问题

### 2.1 问题描述

当 `SANDBOX_ENABLED=true` 时，容器在处理第一条聊天消息后立即以 **exit code 129 (SIGHUP)** 崩溃。

### 2.2 日志表现

```
[WS Server] Running sandboxed worker for session xxx
[WS Server] Wrapped command:
bwrap --new-session --die-with-parent --ro-bind / / --bind /data/users ...
[Worker] Starting query
[Worker]   CLAUDE_HOME: /data/users/xxx
[WS Server] Session mapping: xxx -> yyy
# 容器随即崩溃，exit code 129
```

### 2.3 问题根因

**npm 包 `@anthropic-ai/sandbox-runtime@0.0.23` 中硬编码了 bwrap 参数：**

```javascript
// node_modules/@anthropic-ai/sandbox-runtime/dist/sandbox/linux-sandbox-utils.js
const bwrapArgs = ['--new-session', '--die-with-parent'];
```

`--die-with-parent` 参数使用 Linux 的 `prctl(PR_SET_PDEATHSIG)` 系统调用，当父进程死亡时自动杀死子进程。这在 Docker 容器的进程模型中会导致问题。

---

## 3. 调查过程

### 3.1 排除的问题

| 问题 | 状态 | 解决方案 |
|------|------|----------|
| 网络隔离阻断 API 调用 | ✅ 已解决 | 不提供 `allowedDomains` 时不使用 `--unshare-net` |
| seccomp 过滤器崩溃 | ✅ 已解决 | 使用 `allowAllUnixSockets: true` |
| Node.js 不使用 HTTP_PROXY | ✅ 已解决 | 禁用网络隔离后不需要代理 |
| Alpine 缺少 bash | ✅ 已解决 | Dockerfile 添加 `apk add bash` |
| Docker 缺少权限 | ✅ 已解决 | 添加 `cap_add: SYS_ADMIN` 和 `security_opt` |

### 3.2 未解决的问题

| 问题 | 状态 | 原因 |
|------|------|------|
| `--die-with-parent` 导致容器崩溃 | ❌ 未解决 | 硬编码在 npm 包中，无配置选项 |

### 3.3 相关 GitHub Issues

1. **[containers/bubblewrap#529](https://github.com/containers/bubblewrap/issues/529)**
   `--die-with-parent` 必须与 `--unshare-pid` 一起使用才能正确杀死子进程

2. **[containers/bubblewrap#633](https://github.com/containers/bubblewrap/issues/633)**
   Race condition: 如果父进程在子进程设置 `PR_SET_PDEATHSIG` 之前就死掉，清理不会正确工作

3. **[containers/bubblewrap#505](https://github.com/containers/bubblewrap/issues/505)**
   在非特权 Docker 容器中运行 bwrap 需要特殊配置

4. **[anthropics/claude-code#13747](https://github.com/anthropics/claude-code/issues/13747)**
   Claude Code 在 Docker 容器中执行 shell 命令后崩溃（与我们的问题非常相似）

---

## 4. 当前状态

### 4.1 代码变更

已提交到 `feat/phase3-docker` 分支的修改：

1. **Dockerfile**: 添加 `bash`, `bubblewrap`, `socat`, `ripgrep` 依赖
2. **docker-compose.yml**: 添加 `security_opt` 和 `cap_add: SYS_ADMIN`
3. **ws-server.mjs**: 完整的 sandbox-runtime 集成代码
4. **.env.docker**: `SANDBOX_ENABLED=false`（默认禁用）

### 4.2 环境变量配置

```bash
# 沙箱配置（默认禁用，待问题解决后启用）
SANDBOX_ENABLED=false
SANDBOX_ALLOWED_DOMAINS="*"  # 允许所有域名
```

### 4.3 功能状态

| 功能 | 状态 | 备注 |
|------|------|------|
| Per-User 隔离 (CLAUDE_HOME) | ✅ 正常 | 每个用户独立的 SDK 配置目录 |
| Per-Session 工作区 | ✅ 正常 | 每个会话独立的工作目录 |
| OS 级 Sandbox 隔离 | ❌ 禁用 | 等待上游修复或找到替代方案 |

---

## 5. 后续建议

### 5.1 短期方案

1. **保持 Sandbox 禁用**
   当前的 Per-User 和 Per-Session 隔离已经提供了基本的用户间隔离

2. **监控上游进展**
   关注 `@anthropic-ai/sandbox-runtime` 的更新，看是否会添加禁用 `--die-with-parent` 的配置选项

### 5.2 中期方案

1. **向 Anthropic 提交 Issue**
   请求添加配置选项来禁用 `--die-with-parent`，或提供 Docker 兼容模式

2. **Fork sandbox-runtime**
   如果上游不响应，可以 fork 并移除 `--die-with-parent` 参数

### 5.3 长期方案

1. **使用容器级隔离**
   考虑为每个用户/会话启动独立的 Docker 容器，而不是使用 bwrap

2. **使用 gVisor 或 Firecracker**
   更强大的容器沙箱技术，但需要更多基础设施支持

---

## 6. 相关文件

- `constructa-phase3/ws-server.mjs` - WebSocket 服务器，包含 sandbox 集成
- `constructa-phase3/Dockerfile` - 容器构建配置
- `constructa-phase3/docker-compose.yml` - Docker Compose 配置
- `constructa-phase3/.env.docker` - Docker 环境变量

---

## 7. 参考资料

- [Anthropic Sandbox Runtime README](https://github.com/anthropics/sandbox-runtime)
- [Bubblewrap 文档](https://github.com/containers/bubblewrap)
- [Claude Code Sandboxing 文档](https://docs.claude.com/en/docs/claude-code/sandboxing)
- [Beyond Permission Prompts: Making Claude Code More Secure](https://www.anthropic.com/engineering/claude-code-sandboxing)
