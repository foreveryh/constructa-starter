# Session 删除功能 - 完整实现

**日期**: 2026-01-02
**实施方案**: 方案 2（完整实现）
**状态**: ✅ 已完成，等待用户测试
**难度**: ⭐⭐⭐ 中等

---

## 🎯 功能概述

为 Claude Agent Chat 添加完整的 Session 删除功能，包括：
1. 前端删除按钮和确认对话框
2. 后端 DELETE API（已存在）
3. 自动清理 workspace 文件系统
4. 删除当前 session 时自动切换

---

## 📝 修改内容

### 1. 后端 API 增强（文件系统清理）

**文件**: `src/routes/api/agent-sessions/$id.ts`

**修改内容**:
- 添加 `fs/promises` 的 `rm` 函数和 `path` 的 `join` 函数导入
- DELETE handler 增强：在删除数据库记录后，自动清理 workspace 文件

**修改前**:
```typescript
// 只删除数据库记录
const [deleted] = await db
  .delete(agentSession)
  .where(and(
    eq(agentSession.id, id),
    eq(agentSession.userId, user.id)
  ))
  .returning();
```

**修改后**:
```typescript
// 1. 先查询 session 获取 claudeHomePath 和 sdkSessionId
const [session] = await db
  .select()
  .from(agentSession)
  .where(and(
    eq(agentSession.id, id),
    eq(agentSession.userId, user.id)
  ));

if (!session) {
  return new Response(
    JSON.stringify({ error: 'Session not found' }),
    { status: 404 }
  );
}

// 2. 删除数据库记录
await db
  .delete(agentSession)
  .where(and(
    eq(agentSession.id, id),
    eq(agentSession.userId, user.id)
  ));

// 3. 清理 workspace 和 JSONL 文件
try {
  const sessionPath = join(
    session.claudeHomePath,
    'sessions',
    session.sdkSessionId
  );
  await rm(sessionPath, { recursive: true, force: true });
  console.log('[Session Delete] Successfully cleaned up workspace:', sessionPath);
} catch (error) {
  // 记录错误但不失败 - 数据库记录已删除
  console.error('[Session Delete] Failed to cleanup workspace files:', error);
}
```

**关键设计**:
- ✅ 文件删除失败不影响删除操作成功
- ✅ 先删除数据库，再清理文件（确保数据一致性）
- ✅ 使用 `force: true` 避免文件不存在时报错

---

### 2. SessionItem 组件（删除按钮）

**文件**: `src/components/claude-chat/session-item.tsx`

**修改内容**:
1. 导入 `Trash2` 图标
2. 添加 `onDelete` prop 到 interface
3. 添加 `isDeleting` 状态
4. 实现 `handleDelete` 函数（带确认对话框）
5. 在 hover 时显示删除按钮（在编辑按钮旁边）

**新增代码片段**:

**导入**:
```typescript
import { Star, MessageSquare, Pencil, Check, X, Trash2 } from 'lucide-react';
```

**Interface**:
```typescript
interface SessionItemProps {
  session: SessionItemData;
  isActive: boolean;
  onClick: () => void;
  onUpdateTitle?: (id: string, title: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;  // ← 新增
}
```

**删除处理函数**:
```typescript
const handleDelete = async (e: React.MouseEvent) => {
  e.stopPropagation();

  // 确认删除
  const confirmed = window.confirm(
    `Delete "${displayTitle}"?\n\nThis will permanently delete the conversation and all its files.`
  );

  if (!confirmed || !onDelete) return;

  setIsDeleting(true);
  try {
    await onDelete(session.id);
  } catch (error) {
    console.error('Failed to delete session:', error);
    alert('Failed to delete conversation. Please try again.');
    setIsDeleting(false);
  }
};
```

**UI 渲染**:
```tsx
{isHovered && (onUpdateTitle || onDelete) && (
  <div className="flex gap-0.5 items-center">
    {onUpdateTitle && (
      <button
        type="button"
        onClick={handleStartEdit}
        className="p-0.5 hover:bg-[#00000010] dark:hover:bg-[#ffffff10] rounded opacity-60 hover:opacity-100"
        title="Edit title"
      >
        <Pencil className="h-3 w-3 text-[#6b6a68] dark:text-[#9a9893]" />
      </button>
    )}
    {onDelete && (
      <button
        type="button"
        onClick={handleDelete}
        disabled={isDeleting}
        className={cn(
          "p-0.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded opacity-60 hover:opacity-100",
          isDeleting && "opacity-40 cursor-not-allowed"
        )}
        title="Delete conversation"
      >
        <Trash2 className={cn(
          "h-3 w-3",
          isDeleting ? "text-gray-400" : "text-red-500"
        )} />
      </button>
    )}
  </div>
)}
```

**UI 特性**:
- ✅ Hover 时显示（opacity-60 → opacity-100）
- ✅ 红色垃圾桶图标（区别于编辑）
- ✅ Hover 背景变为淡红色
- ✅ 删除中禁用按钮（防止重复点击）
- ✅ 删除中图标变灰

---

### 3. SessionList 组件（删除处理）

**文件**: `src/components/claude-chat/session-list.tsx`

**修改内容**:
1. 添加 `handleDelete` 函数
2. 处理删除逻辑（调用 API，刷新列表）
3. 如果删除的是当前 session，自动创建新 session
4. 将 `onDelete` 传递给 SessionItem

**新增删除处理函数**:
```typescript
// Handle session deletion
const handleDelete = async (id: string) => {
  try {
    // 找到被删除的 session
    const sessionToDelete = sessions.find((s) => s.id === id);
    const isCurrentSession = sessionToDelete?.sdkSessionId === currentSessionId;

    const res = await fetch(`/api/agent-sessions/${id}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      throw new Error('Failed to delete session');
    }

    // 刷新列表
    queryClient.invalidateQueries({ queryKey: ['agent-sessions'] });

    // 如果删除的是当前 session，创建新 session
    if (isCurrentSession) {
      onNewSession();
    }
  } catch (error) {
    console.error('Failed to delete session:', error);
    throw error; // 重新抛出让 SessionItem 处理错误
  }
};
```

**传递给 SessionItem**:
```tsx
<SessionItem
  key={session.id}
  session={session}
  isActive={session.sdkSessionId === currentSessionId}
  onClick={() => onSelectSession(session.sdkSessionId)}
  onUpdateTitle={handleUpdateTitle}
  onDelete={handleDelete}  // ← 新增
/>
```

**关键逻辑**:
- ✅ 删除前检测是否为当前 session
- ✅ 删除成功后刷新列表（React Query invalidate）
- ✅ 当前 session 被删除时，自动创建新 session（避免空白界面）
- ✅ 错误抛回给 SessionItem 显示给用户

---

## 🧪 测试步骤

### 前置条件

**硬刷新浏览器**（清除缓存）:
```
Chrome/Edge: Ctrl+Shift+R (Windows) / Cmd+Shift+R (Mac)
Firefox: Ctrl+F5 (Windows) / Cmd+Shift+R (Mac)
```

### 测试用例 1：删除非当前 Session

**步骤**:
1. 访问 http://localhost:5050
2. 创建 2-3 个 session（发送不同消息）
3. 切换到 Session A
4. Hover Session B 的列表项
5. 点击红色垃圾桶图标

**预期结果**:
- ✅ 显示确认对话框："Delete "Session B"? This will permanently delete..."
- ✅ 点击确认后，Session B 从列表中消失
- ✅ 仍然停留在 Session A（当前 session 不变）
- ✅ Session 计数减少 1

**验证文件清理**:
```bash
# 查找被删除 session 的 workspace 目录
docker exec ex0-app find /data/users -type d -name "workspace"
```

应该看不到被删除 session 的 workspace 目录。

---

### 测试用例 2：删除当前 Session

**步骤**:
1. 创建 Session C（发送消息："Test session C"）
2. 确保当前在 Session C（高亮显示）
3. Hover Session C 的列表项
4. 点击删除按钮

**预期结果**:
- ✅ 显示确认对话框
- ✅ 点击确认后，Session C 从列表中消失
- ✅ 自动创建新 session（空白对话）
- ✅ 新 session 成为当前 session

---

### 测试用例 3：删除包含文件的 Session

**步骤**:
1. 创建 Session D
2. 发送消息："创建一个简单的 HTML 页面，显示 'Hello World'"
3. 等待文件创建完成（Workspace 中显示 `index.html`）
4. 删除 Session D

**预期结果**:
- ✅ Session 删除成功
- ✅ Workspace 文件（`index.html`）被清理
- ✅ JSONL 日志文件被清理

**验证文件清理**:
```bash
# 检查被删除 session 的完整目录
docker exec ex0-app ls -la /data/users/.../sessions/SESSION_ID/

# 应该报错: No such file or directory (证明已清理)
```

---

### 测试用例 4：删除中状态

**步骤**:
1. 删除一个 session
2. 在确认对话框出现后，观察按钮状态

**预期结果**:
- ✅ 点击删除后，按钮变为禁用状态
- ✅ 垃圾桶图标变为灰色
- ✅ 不能重复点击（cursor-not-allowed）

---

### 测试用例 5：取消删除

**步骤**:
1. Hover session
2. 点击删除按钮
3. 在确认对话框中点击"取消"

**预期结果**:
- ✅ Session 保持不变（未删除）
- ✅ 列表无变化

---

### 测试用例 6：权限验证

**步骤**:
1. 登录用户 A，创建 Session
2. 尝试删除（应成功）
3. 登出，登录用户 B
4. 尝试删除用户 A 的 Session（不可见，无法测试）

**预期结果**:
- ✅ 后端验证用户权限（`eq(agentSession.userId, user.id)`）
- ✅ 只能删除自己的 session

---

## 📊 技术亮点

### 1. 用户体验优化

**确认对话框**:
- 明确提示删除内容（session 标题）
- 警告永久删除（不可恢复）

**视觉反馈**:
- Hover 显示删除按钮（不干扰正常使用）
- 红色图标和背景（危险操作警示）
- 删除中禁用（防止重复操作）

**自动切换**:
- 删除当前 session 时自动创建新 session
- 避免空白界面（更好的用户体验）

### 2. 数据一致性

**删除顺序**:
```
1. 查询 session（获取文件路径）
2. 删除数据库记录（数据一致性优先）
3. 清理文件系统（失败不影响删除成功）
```

**错误处理**:
- 文件清理失败仅记录日志
- 数据库删除成功即返回成功响应
- 前端错误显示友好提示

### 3. 安全性

**权限验证**:
```typescript
eq(agentSession.userId, user.id)  // 只能删除自己的 session
```

**确认机制**:
- 前端确认对话框（防止误删）
- 后端权限验证（防止越权）

---

## 🔧 Docker 构建

**构建命令**:
```bash
docker compose --env-file .env --env-file .env.docker --profile selfhost up -d --build app
```

**构建结果**:
- ✅ 构建成功（71.5s）
- ✅ 容器运行中（Up 4 seconds）
- ✅ 端口映射正常：
  - Frontend: http://localhost:5050
  - Backend: http://localhost:3051

**容器状态**:
```
CONTAINER ID   IMAGE                    STATUS         PORTS
d376439df5a3   constructa-starter-app   Up 4 seconds   0.0.0.0:5050->5000/tcp, 0.0.0.0:3051->3001/tcp
```

---

## ✅ 完成检查清单

- ✅ 后端 DELETE API 增强（文件系统清理）
- ✅ SessionItem 组件（删除按钮 + 确认对话框）
- ✅ SessionList 组件（删除处理函数）
- ✅ 自动切换逻辑（删除当前 session）
- ✅ Docker 容器重新构建
- ✅ 权限验证（用户隔离）
- ✅ 错误处理（友好提示）
- ⏳ 用户测试验证

---

## 🎯 测试清单

请按以下顺序测试所有功能：

- [ ] **测试 1**: 删除非当前 Session
- [ ] **测试 2**: 删除当前 Session（自动切换）
- [ ] **测试 3**: 删除包含文件的 Session（验证文件清理）
- [ ] **测试 4**: 删除中状态（按钮禁用）
- [ ] **测试 5**: 取消删除（保持不变）
- [ ] **测试 6**: 验证 workspace 文件清理

---

## 📚 相关文件

### 修改的文件
1. `src/routes/api/agent-sessions/$id.ts` - 后端 API（文件清理）
2. `src/components/claude-chat/session-item.tsx` - 删除按钮 UI
3. `src/components/claude-chat/session-list.tsx` - 删除处理逻辑

### 数据库 Schema
- `src/db/schema/agent-session.schema.ts` - Session 表定义（未修改）

### 相关文档
- [Session 删除功能评估](../3. 任务中间态/01-02-Session删除功能评估.md)
- [Per-Session Sandbox 设计](../../1. 实施计划/2025-12-20-Per-Session-Sandbox设计文档.md)

---

## 📊 实施对比

| 指标 | 实施前 | 实施后 | 改善 |
|------|--------|--------|------|
| **删除功能** | 无前端 UI | 完整实现 | 🟢 完全实现 |
| **文件清理** | 不清理 | 自动清理 | 🟢 无遗留数据 |
| **用户体验** | 无法删除 | 确认对话框 + 自动切换 | 🟢 友好易用 |
| **数据一致性** | N/A | 数据库优先 + 文件清理 | 🟢 安全可靠 |
| **权限验证** | 已有 | 已有（保持） | 🟢 安全 |

---

## 🚀 下一步

**立即测试**:
1. 硬刷新浏览器（Ctrl+Shift+R / Cmd+Shift+R）
2. 按照测试清单逐项验证
3. 反馈测试结果

**可选增强**（未来）:
- 添加批量删除功能
- 添加软删除（回收站）
- 添加删除动画（淡出效果）
- 改进确认对话框（使用 Dialog 组件代替 window.confirm）

---

**实施完成时间**: 2026-01-02 23:00 CET
**实施人员**: Claude (Assistant - 总指挥 A)
**验证状态**: ⏳ 等待用户测试确认

**测试 URL**: http://localhost:5050
