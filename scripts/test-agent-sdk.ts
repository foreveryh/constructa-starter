#!/usr/bin/env tsx
/**
 * Claude Agent SDK + GLM 4.6 测试脚本
 *
 * 用途：
 * 1. 验证 SDK 是否可以正常导入
 * 2. 验证 GLM 4.6 端点是否可以正常调用
 * 3. 验证事件流是否可以正常接收
 *
 * 运行方式：
 * pnpm tsx scripts/test-agent-sdk.ts
 */

// 加载 .env 文件
import { config } from "dotenv";
config();

import * as agentSdk from "@anthropic-ai/claude-agent-sdk";

async function testSDK() {
  console.log("🧪 开始测试 Claude Agent SDK + GLM 4.6...\n");

  // 1. 导入测试
  console.log("✅ 步骤 1: SDK 导入测试");
  const queryFn = (agentSdk as { queryStream?: unknown; query?: unknown })
    .queryStream ?? (agentSdk as { query?: unknown }).query;
  try {
    console.log("  - queryStream:", typeof (agentSdk as { queryStream?: unknown }).queryStream);
    console.log("  - query:", typeof (agentSdk as { query?: unknown }).query);
    if (typeof queryFn !== "function") {
      throw new Error("queryStream/query 均不可用");
    }
    console.log("  ✅ SDK 导入成功\n");
  } catch (error) {
    console.error("  ❌ SDK 导入失败:", error);
    process.exit(1);
  }

  // 2. 环境变量检查
  console.log("✅ 步骤 2: 环境变量检查");
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const baseURL = process.env.ANTHROPIC_BASE_URL;
  const model = process.env.ANTHROPIC_MODEL;

  if (!apiKey) {
    console.error("  ❌ ANTHROPIC_API_KEY 环境变量未设置");
    console.error("  💡 请在 .env 中添加: ANTHROPIC_API_KEY=your_api_key_here");
    process.exit(1);
  }
  console.log("  ✅ ANTHROPIC_API_KEY 已设置（长度:", apiKey.length, "）");
  console.log("  📍 ANTHROPIC_BASE_URL:", baseURL ?? "未设置（使用默认）");
  console.log("  📍 ANTHROPIC_MODEL:", model ?? "未设置（使用默认）\n");

  // 3. 基本调用测试
  console.log("✅ 步骤 3: 基本调用测试");
  try {
    const queryOptions: Record<string, unknown> = {
      prompt: "Hello! Please respond with exactly: 'GLM 4.6 test passed'",
      apiKey,
      cwd: process.cwd(),
    };

    if (model) {
      queryOptions.model = model;
    }
    if (baseURL) {
      queryOptions.baseURL = baseURL;
    }

    console.log("  📝 调用配置:", {
      prompt: queryOptions.prompt,
      baseURL: queryOptions.baseURL,
      model: queryOptions.model,
      cwd: queryOptions.cwd,
    });

    const stream = await (queryFn as (
      args: Record<string, unknown>,
    ) => AsyncIterable<unknown>)(queryOptions);

    console.log("  ✅ SDK 调用成功\n");

    // 4. 事件流测试
    console.log("✅ 步骤 4: 事件流测试");
    let eventCount = 0;
    let hasSystemInit = false;
    let hasAssistantText = false;
    let hasResult = false;
    let collectedText = "";

    // 超时监控（30秒）
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const resetTimeout = () => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        console.log("\n  ⚠️  事件流超时（30秒无新事件），停止等待");
        console.log(`  📊 已接收事件数: ${eventCount}`);
        if (eventCount === 0) {
          console.log("  ❌ 未接收到任何事件");
          process.exit(1);
        } else {
          console.log("  ✅ 已接收到事件，测试部分成功");
          process.exit(0);
        }
      }, 30000);
    };

    resetTimeout();

    try {
      for await (const event of stream) {
        resetTimeout();
        eventCount++;
        const evt = event as { type?: string; message?: { content?: { type?: string; text?: string }[] }; result?: string };
        const eventType = evt.type || "unknown";

        console.log(`  📨 事件 ${eventCount}: ${eventType}`);

        if (eventType.includes("system") || eventType.includes("init")) {
          hasSystemInit = true;
        } else if (eventType === "assistant") {
          hasAssistantText = true;
          // 提取文本内容
          const content = evt.message?.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === "text" && block.text) {
                collectedText += block.text;
                console.log(`  📝 文本: "${block.text.substring(0, 100)}${block.text.length > 100 ? "..." : ""}"`);
              }
            }
          }
        } else if (eventType.includes("result")) {
          hasResult = true;
          if (evt.result) {
            console.log(`  📝 结果: "${String(evt.result).substring(0, 100)}"`);
          }
          break;
        }

        if (eventCount >= 30) {
          console.log("  ⚠️  事件数量达到 30，停止接收");
          break;
        }
      }

      if (timeout) clearTimeout(timeout);
      console.log("\n  ✅ 事件流正常结束");
    } catch (error) {
      if (timeout) clearTimeout(timeout);
      console.error("\n  ❌ 事件流处理出错:", error);
      throw error;
    }

    console.log("\n  📊 事件统计:");
    console.log(`    - 总事件数: ${eventCount}`);
    console.log(`    - 包含 system/init: ${hasSystemInit ? "✅" : "❌"}`);
    console.log(`    - 包含 assistant: ${hasAssistantText ? "✅" : "❌"}`);
    console.log(`    - 包含 result: ${hasResult ? "✅" : "❌"}`);
    console.log(`    - 收集到的文本: "${collectedText.substring(0, 200)}${collectedText.length > 200 ? "..." : ""}"`);

    if (eventCount === 0) {
      throw new Error("未接收到任何事件");
    }

    console.log("\n🎉 测试通过！Claude Agent SDK + GLM 4.6 可以正常工作。\n");
  } catch (error) {
    console.error("  ❌ 测试失败:", error);
    if (error instanceof Error) {
      console.error("  📝 错误信息:", error.message);
    }
    process.exit(1);
  }
}

// 运行测试
testSDK().catch((error) => {
  console.error("❌ 测试失败:", error);
  process.exit(1);
});
