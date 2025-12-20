#!/usr/bin/env tsx
/**
 * SDK 事件格式验证脚本
 *
 * 测试不同场景下 SDK 返回的事件格式：
 * 1. 简单问答
 * 2. 工具调用（读取文件）
 * 3. 思考过程
 */

import { config } from "dotenv";
config();

import { query } from "@anthropic-ai/claude-agent-sdk";

// 美化打印 JSON
const prettyPrint = (obj: unknown) => {
  console.log(JSON.stringify(obj, null, 2));
};

// 测试场景
type TestCase = {
  name: string;
  prompt: string;
  description: string;
};

const testCases: TestCase[] = [
  {
    name: "简单问答",
    prompt: "What is 2 + 2? Answer in one word.",
    description: "测试纯文本响应",
  },
  {
    name: "文件读取",
    prompt: "Read the file package.json and tell me the project name.",
    description: "测试工具调用（Read tool）",
  },
  {
    name: "目录列表",
    prompt: "List the files in the current directory using ls command.",
    description: "测试 Bash 工具调用",
  },
  {
    name: "复杂推理（触发thinking）",
    prompt: "Think step by step: If I have 3 apples and give away 1, then buy 5 more, how many do I have? Show your reasoning process.",
    description: "测试思考过程（thinking block）",
  },
  {
    name: "多步骤任务",
    prompt: "First read package.json to get the project name, then read README.md if it exists. Summarize both.",
    description: "测试多个工具调用序列",
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
    return;
  }

  try {
    const stream = query({
      prompt: testCase.prompt,
      options: {
        cwd: process.cwd(),
        model,
        ...(baseURL && {
          env: {
            ...process.env,
            ANTHROPIC_BASE_URL: baseURL,
            ANTHROPIC_API_URL: baseURL,
          },
        }),
        // 启用部分消息以获取更详细的流式事件
        // includePartialMessages: true,
      },
    });

    let eventIndex = 0;

    for await (const event of stream) {
      eventIndex++;
      console.log("\n" + "-".repeat(60));
      console.log(`📨 事件 #${eventIndex}`);
      console.log("-".repeat(60));

      // 打印事件类型
      const eventType = (event as { type?: string }).type ?? "unknown";
      const eventSubtype = (event as { subtype?: string }).subtype;
      console.log(`类型: ${eventType}${eventSubtype ? ` (subtype: ${eventSubtype})` : ""}`);

      // 打印 session_id
      const sessionId = (event as { session_id?: string }).session_id;
      if (sessionId) {
        console.log(`Session ID: ${sessionId}`);
      }

      // 打印 uuid
      const uuid = (event as { uuid?: string }).uuid;
      if (uuid) {
        console.log(`UUID: ${uuid}`);
      }

      // 根据事件类型打印详细内容
      switch (eventType) {
        case "system": {
          console.log("\n📋 System 事件详情:");
          const sys = event as {
            subtype?: string;
            tools?: string[];
            model?: string;
            permissionMode?: string;
            cwd?: string;
          };
          if (sys.tools) console.log(`  Tools: ${sys.tools.join(", ")}`);
          if (sys.model) console.log(`  Model: ${sys.model}`);
          if (sys.permissionMode) console.log(`  Permission Mode: ${sys.permissionMode}`);
          if (sys.cwd) console.log(`  CWD: ${sys.cwd}`);
          break;
        }

        case "assistant": {
          console.log("\n📋 Assistant 事件详情:");
          const msg = (event as { message?: { role?: string; content?: unknown[] } }).message;
          if (msg) {
            console.log(`  Role: ${msg.role}`);
            console.log(`  Content blocks: ${(msg.content ?? []).length}`);

            const content = msg.content as Array<{
              type?: string;
              text?: string;
              thinking?: string;
              id?: string;
              name?: string;
              input?: unknown;
              tool_use_id?: string;
              content?: unknown;
            }> ?? [];

            for (let i = 0; i < content.length; i++) {
              const block = content[i];
              console.log(`\n  [Block ${i}] type: ${block.type}`);

              switch (block.type) {
                case "text":
                  const textPreview = (block.text ?? "").substring(0, 200);
                  console.log(`    text: "${textPreview}${(block.text ?? "").length > 200 ? "..." : ""}"`);
                  console.log(`    text length: ${(block.text ?? "").length}`);
                  break;

                case "thinking":
                  const thinkingPreview = (block.thinking ?? "").substring(0, 200);
                  console.log(`    thinking: "${thinkingPreview}${(block.thinking ?? "").length > 200 ? "..." : ""}"`);
                  console.log(`    thinking length: ${(block.thinking ?? "").length}`);
                  break;

                case "tool_use":
                  console.log(`    id: ${block.id}`);
                  console.log(`    name: ${block.name}`);
                  console.log(`    input: ${JSON.stringify(block.input)?.substring(0, 200)}`);
                  break;

                case "tool_result":
                  console.log(`    tool_use_id: ${block.tool_use_id}`);
                  const resultStr = JSON.stringify(block.content);
                  console.log(`    content: ${resultStr?.substring(0, 200)}${(resultStr?.length ?? 0) > 200 ? "..." : ""}`);
                  break;

                default:
                  console.log(`    (未知类型) 完整内容:`);
                  prettyPrint(block);
              }
            }
          }
          break;
        }

        case "user": {
          console.log("\n📋 User 事件详情:");
          const msg = (event as { message?: { content?: unknown[] } }).message;
          if (msg?.content) {
            console.log(`  Content blocks: ${msg.content.length}`);
            // User 消息通常是工具结果
            for (let i = 0; i < msg.content.length; i++) {
              const block = msg.content[i] as { type?: string; tool_use_id?: string; content?: unknown };
              console.log(`  [Block ${i}] type: ${block.type}`);
              if (block.tool_use_id) {
                console.log(`    tool_use_id: ${block.tool_use_id}`);
              }
            }
          }
          break;
        }

        case "result": {
          console.log("\n📋 Result 事件详情:");
          const res = event as {
            subtype?: string;
            result?: string;
            is_error?: boolean;
            total_cost_usd?: number;
            duration_ms?: number;
            num_turns?: number;
            usage?: unknown;
          };
          console.log(`  Subtype: ${res.subtype}`);
          console.log(`  Is Error: ${res.is_error}`);
          if (res.result) {
            const resultPreview = res.result.substring(0, 200);
            console.log(`  Result: "${resultPreview}${res.result.length > 200 ? "..." : ""}"`);
          }
          if (res.total_cost_usd !== undefined) console.log(`  Cost: $${res.total_cost_usd}`);
          if (res.duration_ms !== undefined) console.log(`  Duration: ${res.duration_ms}ms`);
          if (res.num_turns !== undefined) console.log(`  Turns: ${res.num_turns}`);
          break;
        }

        default:
          console.log("\n📋 完整事件内容:");
          prettyPrint(event);
      }

      // 限制事件数量防止无限循环
      if (eventIndex >= 50) {
        console.log("\n⚠️ 达到 50 个事件上限，停止");
        break;
      }
    }

    console.log("\n" + "=".repeat(80));
    console.log(`✅ 测试完成，共收到 ${eventIndex} 个事件`);
    console.log("=".repeat(80));
  } catch (error) {
    console.error("\n❌ 测试失败:", error);
  }
}

async function main() {
  console.log("🔬 SDK 事件格式验证");
  console.log("环境配置:");
  console.log(`  ANTHROPIC_BASE_URL: ${process.env.ANTHROPIC_BASE_URL ?? "未设置"}`);
  console.log(`  ANTHROPIC_MODEL: ${process.env.ANTHROPIC_MODEL ?? "未设置"}`);
  console.log(`  CWD: ${process.cwd()}`);

  // 获取命令行参数选择测试
  const testIndex = process.argv[2] ? parseInt(process.argv[2]) : undefined;

  if (testIndex !== undefined && testIndex >= 0 && testIndex < testCases.length) {
    // 运行指定测试
    await runTest(testCases[testIndex]);
  } else {
    // 显示可用测试
    console.log("\n可用测试:");
    testCases.forEach((tc, i) => {
      console.log(`  ${i}: ${tc.name} - ${tc.description}`);
    });
    console.log("\n用法: pnpm tsx scripts/verify-sdk-events.ts [测试编号]");
    console.log("例如: pnpm tsx scripts/verify-sdk-events.ts 0");

    // 默认运行第一个测试
    console.log("\n默认运行测试 0（简单问答）...");
    await runTest(testCases[0]);
  }
}

main().catch(console.error);
