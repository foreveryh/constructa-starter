#!/usr/bin/env tsx
/**
 * SDK 模式测试
 *
 * 测试不同的 SDK 配置：
 * 1. maxThinkingTokens - 启用 thinking
 * 2. permissionMode: 'plan' - 规划模式
 * 3. permissionMode: 'default' vs 'acceptEdits' vs 'bypassPermissions'
 */

import { config } from "dotenv";
config();

import { query } from "@anthropic-ai/claude-agent-sdk";

type TestMode = {
  name: string;
  prompt: string;
  options: Record<string, unknown>;
  description: string;
};

const testModes: TestMode[] = [
  {
    name: "Thinking 模式",
    prompt: "Solve this step by step: What is 15 * 17? Think carefully before answering.",
    options: {
      maxThinkingTokens: 1024,  // 启用 thinking
    },
    description: "测试 maxThinkingTokens 是否产生 thinking block",
  },
  {
    name: "Plan 模式",
    prompt: "Create a plan to add a new user registration feature to this project.",
    options: {
      permissionMode: "plan",  // 规划模式，不执行
    },
    description: "测试 permissionMode: plan 的事件格式",
  },
  {
    name: "Default 模式 + 工具",
    prompt: "What files are in the src directory? Use ls command.",
    options: {
      permissionMode: "default",
    },
    description: "测试 default 模式下的工具调用（需要权限确认）",
  },
  {
    name: "BypassPermissions 模式",
    prompt: "List files in current directory using ls command.",
    options: {
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,  // 必须同时设置
    },
    description: "测试 bypassPermissions 模式（自动执行，无需确认）",
  },
];

async function runModeTest(mode: TestMode) {
  console.log("\n" + "=".repeat(80));
  console.log(`🧪 测试: ${mode.name}`);
  console.log(`📝 描述: ${mode.description}`);
  console.log(`💬 Prompt: "${mode.prompt}"`);
  console.log(`⚙️  Options:`, JSON.stringify(mode.options, null, 2));
  console.log("=".repeat(80));

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const baseURL = process.env.ANTHROPIC_BASE_URL;
  const model = process.env.ANTHROPIC_MODEL;

  if (!apiKey) {
    console.error("❌ ANTHROPIC_API_KEY 未设置");
    return;
  }

  try {
    const stream = query({
      prompt: mode.prompt,
      options: {
        cwd: process.cwd(),
        model,
        ...mode.options,
        ...(baseURL && {
          env: {
            ...process.env,
            ANTHROPIC_BASE_URL: baseURL,
            ANTHROPIC_API_URL: baseURL,
          },
        }),
      },
    });

    let eventIndex = 0;
    let hasThinking = false;
    let hasPlan = false;
    let hasToolUse = false;

    for await (const event of stream) {
      eventIndex++;
      const type = (event as { type?: string }).type ?? "unknown";
      const subtype = (event as { subtype?: string }).subtype;

      console.log(`\n📨 事件 #${eventIndex}: ${type}${subtype ? ` (${subtype})` : ""}`);

      // 检查 system 事件中的 permissionMode
      if (type === "system" && subtype === "init") {
        const pm = (event as { permissionMode?: string }).permissionMode;
        console.log(`  📋 permissionMode: ${pm}`);
      }

      // 检查 assistant 事件
      if (type === "assistant") {
        const msg = (event as { message?: { content?: unknown[] } }).message;
        const content = (msg?.content ?? []) as Array<{
          type?: string;
          text?: string;
          thinking?: string;
          name?: string;
          id?: string;
        }>;

        console.log(`  📋 Content blocks: ${content.length}`);

        for (let i = 0; i < content.length; i++) {
          const block = content[i];
          console.log(`    [${i}] type: ${block.type}`);

          switch (block.type) {
            case "text":
              const textPreview = (block.text ?? "").substring(0, 150);
              console.log(`        text: "${textPreview}${(block.text ?? "").length > 150 ? "..." : ""}"`);
              break;

            case "thinking":
              hasThinking = true;
              const thinkingPreview = (block.thinking ?? "").substring(0, 150);
              console.log(`        🧠 THINKING FOUND!`);
              console.log(`        thinking: "${thinkingPreview}${(block.thinking ?? "").length > 150 ? "..." : ""}"`);
              console.log(`        thinking length: ${(block.thinking ?? "").length}`);
              break;

            case "tool_use":
              hasToolUse = true;
              console.log(`        🔧 Tool: ${block.name} (${block.id})`);
              break;

            default:
              console.log(`        (其他类型)`);
          }
        }
      }

      // 检查 user 事件（工具结果）
      if (type === "user") {
        const msg = (event as { message?: { content?: unknown[] } }).message;
        const content = (msg?.content ?? []) as Array<{ type?: string; tool_use_id?: string }>;
        for (const block of content) {
          if (block.type === "tool_result") {
            console.log(`  📋 Tool result for: ${block.tool_use_id}`);
          }
        }
      }

      // 检查 result 事件
      if (type === "result") {
        const res = event as { result?: string; is_error?: boolean; subtype?: string };
        console.log(`  📋 Subtype: ${res.subtype}`);
        console.log(`  📋 Is Error: ${res.is_error}`);
        if (res.result) {
          const resultPreview = res.result.substring(0, 200);
          console.log(`  📋 Result: "${resultPreview}${res.result.length > 200 ? "..." : ""}"`);
        }
      }

      // 限制事件数
      if (eventIndex >= 30) {
        console.log("\n⚠️ 达到 30 个事件上限");
        break;
      }
    }

    console.log("\n" + "-".repeat(60));
    console.log("📊 测试结果:");
    console.log(`  总事件数: ${eventIndex}`);
    console.log(`  包含 thinking: ${hasThinking ? "✅ 是" : "❌ 否"}`);
    console.log(`  包含 tool_use: ${hasToolUse ? "✅ 是" : "❌ 否"}`);

  } catch (error) {
    console.error("\n❌ 测试失败:", error);
  }
}

async function main() {
  console.log("🔬 SDK 模式测试");
  console.log("环境配置:");
  console.log(`  ANTHROPIC_BASE_URL: ${process.env.ANTHROPIC_BASE_URL ?? "未设置"}`);
  console.log(`  ANTHROPIC_MODEL: ${process.env.ANTHROPIC_MODEL ?? "未设置"}`);

  const testIndex = process.argv[2] ? parseInt(process.argv[2]) : undefined;

  if (testIndex !== undefined && testIndex >= 0 && testIndex < testModes.length) {
    await runModeTest(testModes[testIndex]);
  } else {
    console.log("\n可用测试:");
    testModes.forEach((m, i) => {
      console.log(`  ${i}: ${m.name} - ${m.description}`);
    });
    console.log("\n用法: pnpm tsx scripts/verify-modes.ts [测试编号]");
    console.log("\n默认运行测试 0（Thinking 模式）...");
    await runModeTest(testModes[0]);
  }
}

main().catch(console.error);
