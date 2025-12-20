#!/usr/bin/env tsx
/**
 * Agent Chat API 测试脚本
 *
 * 直接测试 Claude Agent SDK 集成逻辑，绕过 HTTP 层和认证。
 * 这模拟了 /api/agent-chat 的核心逻辑。
 */

import { config } from "dotenv";
config();

import { query } from "@anthropic-ai/claude-agent-sdk";

type TestCase = {
  name: string;
  prompt: string;
  description: string;
};

const testCases: TestCase[] = [
  {
    name: "基础问答",
    prompt: "What is 2 + 2? Answer briefly.",
    description: "测试简单问答，验证 SSE 事件流",
  },
  {
    name: "工具调用",
    prompt: "Read the file package.json and tell me the project name.",
    description: "测试工具调用（Read tool）",
  },
  {
    name: "多步骤任务",
    prompt: "List the files in the scripts directory.",
    description: "测试 Bash 工具调用",
  },
];

async function runTest(testCase: TestCase) {
  console.log("\n" + "=".repeat(80));
  console.log(`🧪 测试: ${testCase.name}`);
  console.log(`📝 描述: ${testCase.description}`);
  console.log(`💬 Prompt: "${testCase.prompt}"`);
  console.log("=".repeat(80));

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const baseURL = process.env.ANTHROPIC_BASE_URL;
  const model = process.env.ANTHROPIC_MODEL;

  if (!apiKey) {
    console.error("❌ ANTHROPIC_API_KEY 未设置");
    return { success: false, error: "API key missing" };
  }

  try {
    // 模拟 /api/agent-chat 的核心逻辑
    const sdkStream = query({
      prompt: testCase.prompt,
      options: {
        cwd: process.cwd(),
        model,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        ...(baseURL && {
          env: {
            ...process.env,
            ANTHROPIC_BASE_URL: baseURL,
            ANTHROPIC_API_URL: baseURL,
          },
        }),
      },
    });

    let eventCount = 0;
    let sessionId: string | undefined;
    let hasText = false;
    let hasToolUse = false;
    let hasToolResult = false;
    let finalResult: string | undefined;

    // 模拟 SSE 事件处理（与 ClaudeAgentAdapter 类似）
    for await (const event of sdkStream) {
      eventCount++;
      const type = (event as { type?: string }).type ?? "unknown";
      const subtype = (event as { subtype?: string }).subtype;

      console.log(`\n📨 事件 #${eventCount}: ${type}${subtype ? ` (${subtype})` : ""}`);

      switch (type) {
        case "system":
          if (subtype === "init") {
            sessionId = (event as { session_id?: string }).session_id;
            console.log(`  📋 session_id: ${sessionId}`);
          }
          break;

        case "assistant":
          const msg = (event as { message?: { content?: unknown[] } }).message;
          const content = (msg?.content ?? []) as Array<{
            type?: string;
            text?: string;
            id?: string;
            name?: string;
            input?: unknown;
          }>;

          for (const block of content) {
            switch (block.type) {
              case "text":
                hasText = true;
                const textPreview = (block.text ?? "").substring(0, 100);
                console.log(`  💬 Text: "${textPreview}${(block.text ?? "").length > 100 ? "..." : ""}"`);
                break;

              case "tool_use":
                hasToolUse = true;
                console.log(`  🔧 Tool: ${block.name} (${block.id})`);
                console.log(`     Input: ${JSON.stringify(block.input)?.substring(0, 100)}`);
                break;
            }
          }
          break;

        case "user":
          const userMsg = (event as { message?: { content?: unknown[] } }).message;
          const userContent = (userMsg?.content ?? []) as Array<{
            type?: string;
            tool_use_id?: string;
          }>;

          for (const block of userContent) {
            if (block.type === "tool_result") {
              hasToolResult = true;
              console.log(`  📋 Tool result for: ${block.tool_use_id}`);
            }
          }
          break;

        case "result":
          const res = event as { result?: string; is_error?: boolean; subtype?: string };
          finalResult = res.result;
          console.log(`  ✅ Subtype: ${res.subtype}`);
          console.log(`  📋 Is Error: ${res.is_error}`);
          if (res.result) {
            const resultPreview = res.result.substring(0, 150);
            console.log(`  📋 Result: "${resultPreview}${res.result.length > 150 ? "..." : ""}"`);
          }
          break;
      }

      // 限制事件数防止无限循环
      if (eventCount >= 50) {
        console.log("\n⚠️ 达到 50 个事件上限");
        break;
      }
    }

    console.log("\n" + "-".repeat(60));
    console.log("📊 测试结果:");
    console.log(`  总事件数: ${eventCount}`);
    console.log(`  Session ID: ${sessionId ?? "无"}`);
    console.log(`  包含文本: ${hasText ? "✅" : "❌"}`);
    console.log(`  包含工具调用: ${hasToolUse ? "✅" : "❌"}`);
    console.log(`  包含工具结果: ${hasToolResult ? "✅" : "❌"}`);
    console.log(`  最终结果: ${finalResult ? "✅" : "❌"}`);

    return {
      success: true,
      eventCount,
      sessionId,
      hasText,
      hasToolUse,
      hasToolResult,
      finalResult: !!finalResult,
    };
  } catch (error) {
    console.error("\n❌ 测试失败:", error);
    return { success: false, error: String(error) };
  }
}

async function main() {
  console.log("🔬 Agent Chat API 测试");
  console.log("环境配置:");
  console.log(`  ANTHROPIC_BASE_URL: ${process.env.ANTHROPIC_BASE_URL ?? "未设置"}`);
  console.log(`  ANTHROPIC_MODEL: ${process.env.ANTHROPIC_MODEL ?? "未设置"}`);
  console.log(`  CWD: ${process.cwd()}`);

  const testIndex = process.argv[2] ? parseInt(process.argv[2]) : undefined;

  const results: Array<{ name: string; result: Awaited<ReturnType<typeof runTest>> }> = [];

  if (testIndex !== undefined && testIndex >= 0 && testIndex < testCases.length) {
    // 运行指定测试
    const result = await runTest(testCases[testIndex]);
    results.push({ name: testCases[testIndex].name, result });
  } else if (process.argv[2] === "all") {
    // 运行所有测试
    for (const tc of testCases) {
      const result = await runTest(tc);
      results.push({ name: tc.name, result });
    }
  } else {
    // 显示可用测试
    console.log("\n可用测试:");
    testCases.forEach((tc, i) => {
      console.log(`  ${i}: ${tc.name} - ${tc.description}`);
    });
    console.log("\n用法:");
    console.log("  pnpm tsx scripts/test-agent-chat-api.ts [测试编号]");
    console.log("  pnpm tsx scripts/test-agent-chat-api.ts all  # 运行所有测试");
    console.log("\n默认运行测试 0（基础问答）...");
    const result = await runTest(testCases[0]);
    results.push({ name: testCases[0].name, result });
  }

  // 打印总结
  console.log("\n" + "=".repeat(80));
  console.log("📊 测试总结");
  console.log("=".repeat(80));
  for (const { name, result } of results) {
    const status = result.success ? "✅ 通过" : "❌ 失败";
    console.log(`  ${name}: ${status}`);
  }
}

main().catch(console.error);
