#!/usr/bin/env tsx
/**
 * Claude Agent SDK 高级功能支持测试
 *
 * 测试以下功能是否被 SDK 支持：
 * 1. 工具进度支持
 * 2. 错误详情
 * 3. Usage/Cost 信息
 * 4. 会话元数据
 */

import { config } from "dotenv";
config();

import { query } from "@anthropic-ai/claude-agent-sdk";
import { writeFileSync } from "fs";

// 美化打印 JSON
const prettyPrint = (obj: unknown, maxDepth = 10) => {
  return JSON.stringify(obj, null, 2);
};

// 测试结果存储
interface TestResult {
  feature: string;
  supported: boolean;
  details: unknown;
  notes: string[];
}

const results: TestResult[] = [];

// 测试 1: Usage/Cost 信息
async function testUsageAndCost() {
  console.log("\n" + "=".repeat(80));
  console.log("🧪 测试 1: Usage/Cost 信息");
  console.log("=".repeat(80));

  const testResult: TestResult = {
    feature: "Usage/Cost 信息",
    supported: false,
    details: {},
    notes: [],
  };

  try {
    const stream = query({
      prompt: "What is 2 + 2? Answer briefly.",
      options: {
        cwd: process.cwd(),
        model: process.env.ANTHROPIC_MODEL,
      },
    });

    let resultEvent: any = null;
    let assistantMessages: any[] = [];

    for await (const event of stream) {
      const eventType = (event as any).type;

      if (eventType === "assistant") {
        assistantMessages.push(event);

        // 检查 assistant 消息的 usage 字段
        const usage = (event as any).usage;
        if (usage) {
          console.log("\n✅ Assistant 消息包含 usage 字段:");
          console.log(prettyPrint(usage));
          testResult.notes.push("Assistant 消息包含 usage 字段");
        }
      }

      if (eventType === "result") {
        resultEvent = event;
      }
    }

    if (resultEvent) {
      console.log("\n📋 Result 事件内容:");
      console.log(prettyPrint(resultEvent));

      // 检查 result 事件的所有可能字段
      const fields = [
        "usage",
        "total_cost_usd",
        "duration_ms",
        "num_turns",
        "input_tokens",
        "output_tokens",
        "cache_read_input_tokens",
        "cache_creation_input_tokens",
      ];

      const foundFields: Record<string, any> = {};

      for (const field of fields) {
        if (field in resultEvent && (resultEvent as any)[field] !== undefined) {
          foundFields[field] = (resultEvent as any)[field];
          console.log(`  ✅ ${field}: ${prettyPrint((resultEvent as any)[field])}`);
        } else {
          console.log(`  ❌ ${field}: 不存在`);
        }
      }

      testResult.details = {
        resultEvent,
        foundFields,
        assistantMessageUsage: assistantMessages
          .filter((m) => (m as any).usage)
          .map((m) => (m as any).usage),
      };

      // 判断是否支持
      if (foundFields.usage || foundFields.total_cost_usd) {
        testResult.supported = true;
        testResult.notes.push("Result 事件包含 usage 或 total_cost_usd 字段");
      }
    } else {
      testResult.notes.push("未收到 result 事件");
    }
  } catch (error) {
    testResult.notes.push(`测试失败: ${error}`);
    console.error("\n❌ 测试失败:", error);
  }

  results.push(testResult);
  console.log(
    `\n${testResult.supported ? "✅ 支持" : "❌ 不支持"} - ${testResult.feature}`
  );
}

// 测试 2: 会话元数据
async function testSessionMetadata() {
  console.log("\n" + "=".repeat(80));
  console.log("🧪 测试 2: 会话元数据（system.init 事件）");
  console.log("=".repeat(80));

  const testResult: TestResult = {
    feature: "会话元数据",
    supported: false,
    details: {},
    notes: [],
  };

  try {
    const stream = query({
      prompt: "Hello",
      options: {
        cwd: process.cwd(),
        model: process.env.ANTHROPIC_MODEL,
        allowedTools: ["Read", "Glob", "Bash"],
      },
    });

    let systemInitEvent: any = null;

    for await (const event of stream) {
      const eventType = (event as any).type;
      const eventSubtype = (event as any).subtype;

      if (eventType === "system" && eventSubtype === "init") {
        systemInitEvent = event;
        break; // 只需要第一个 system.init 事件
      }
    }

    if (systemInitEvent) {
      console.log("\n📋 system.init 事件内容:");
      console.log(prettyPrint(systemInitEvent));

      // 检查所有元数据字段
      const metadataFields = [
        "session_id",
        "model",
        "tools",
        "mcp_servers",
        "permissionMode",
        "cwd",
        "apiKeySource",
        "slash_commands",
        "output_style",
      ];

      const foundFields: Record<string, any> = {};

      for (const field of metadataFields) {
        if (
          field in systemInitEvent &&
          (systemInitEvent as any)[field] !== undefined
        ) {
          foundFields[field] = (systemInitEvent as any)[field];
          const value = (systemInitEvent as any)[field];
          const preview =
            typeof value === "string"
              ? value.substring(0, 100)
              : Array.isArray(value)
                ? `Array(${value.length})`
                : typeof value === "object"
                  ? "Object"
                  : value;
          console.log(`  ✅ ${field}: ${preview}`);
        } else {
          console.log(`  ❌ ${field}: 不存在`);
        }
      }

      testResult.details = {
        systemInitEvent,
        foundFields,
      };

      // 判断是否支持
      if (
        foundFields.session_id &&
        (foundFields.model || foundFields.tools)
      ) {
        testResult.supported = true;
        testResult.notes.push("system.init 事件包含必要的元数据");
      }
    } else {
      testResult.notes.push("未收到 system.init 事件");
    }
  } catch (error) {
    testResult.notes.push(`测试失败: ${error}`);
    console.error("\n❌ 测试失败:", error);
  }

  results.push(testResult);
  console.log(
    `\n${testResult.supported ? "✅ 支持" : "❌ 不支持"} - ${testResult.feature}`
  );
}

// 测试 3: 错误详情
async function testErrorDetails() {
  console.log("\n" + "=".repeat(80));
  console.log("🧪 测试 3: 错误详情");
  console.log("=".repeat(80));

  const testResult: TestResult = {
    feature: "错误详情",
    supported: false,
    details: {},
    notes: [],
  };

  try {
    // 尝试触发错误：读取不存在的文件
    const stream = query({
      prompt: "Read the file /nonexistent/file.txt",
      options: {
        cwd: process.cwd(),
        model: process.env.ANTHROPIC_MODEL,
        allowedTools: ["Read"],
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
      },
    });

    let errorEvents: any[] = [];
    let resultEvent: any = null;

    for await (const event of stream) {
      const eventType = (event as any).type;

      // 检查 error 事件
      if (eventType === "error") {
        errorEvents.push(event);
        console.log("\n📋 发现 error 事件:");
        console.log(prettyPrint(event));
      }

      // 检查 result 事件的 error
      if (eventType === "result") {
        resultEvent = event;
        if ((event as any).is_error) {
          console.log("\n📋 发现 result 事件（错误类型）:");
          console.log(prettyPrint(event));
        }
      }
    }

    // 分析错误结构
    if (errorEvents.length > 0 || resultEvent?.is_error) {
      testResult.supported = true;

      const errorDetails: any = {};

      if (errorEvents.length > 0) {
        errorDetails.errorEvents = errorEvents;
        testResult.notes.push(`收到 ${errorEvents.length} 个 error 事件`);

        // 分析错误事件的字段
        const sampleError = errorEvents[0];
        const errorFields = Object.keys(sampleError);
        console.log(`\n✅ error 事件字段: ${errorFields.join(", ")}`);
        testResult.notes.push(`error 事件字段: ${errorFields.join(", ")}`);
      }

      if (resultEvent?.is_error) {
        errorDetails.resultError = resultEvent;
        testResult.notes.push("result 事件包含错误信息");

        // 检查错误相关字段
        const errorFields = [
          "is_error",
          "error_code",
          "error_message",
          "error_type",
          "retriable",
          "result",
        ];
        const foundFields: string[] = [];
        for (const field of errorFields) {
          if (
            field in resultEvent &&
            (resultEvent as any)[field] !== undefined
          ) {
            foundFields.push(field);
            console.log(
              `  ✅ ${field}: ${prettyPrint((resultEvent as any)[field])}`
            );
          }
        }
        testResult.notes.push(
          `result 错误字段: ${foundFields.join(", ")}`
        );
      }

      testResult.details = errorDetails;
    } else {
      testResult.notes.push(
        "测试未触发错误（可能是正常处理了不存在的文件）"
      );
    }
  } catch (error: any) {
    // 捕获异常也是一种错误处理方式
    console.log("\n📋 捕获到异常:");
    console.log(prettyPrint(error));
    testResult.supported = true;
    testResult.notes.push("SDK 通过异常机制报告错误");
    testResult.details = { exception: error.message || String(error) };
  }

  results.push(testResult);
  console.log(
    `\n${testResult.supported ? "✅ 支持" : "❌ 不支持"} - ${testResult.feature}`
  );
}

// 测试 4: 工具进度支持
async function testToolProgress() {
  console.log("\n" + "=".repeat(80));
  console.log("🧪 测试 4: 工具进度支持");
  console.log("=".repeat(80));

  const testResult: TestResult = {
    feature: "工具进度支持",
    supported: false,
    details: {},
    notes: [],
  };

  try {
    // 使用一个长时间运行的命令来测试进度
    const stream = query({
      prompt: "Run 'sleep 2 && echo done' using Bash.",
      options: {
        cwd: process.cwd(),
        model: process.env.ANTHROPIC_MODEL,
        allowedTools: ["Bash"],
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
      },
    });

    const allEvents: any[] = [];
    let foundProgressEvent = false;

    for await (const event of stream) {
      allEvents.push(event);

      const eventType = (event as any).type;

      // 检查是否有 tool_progress 事件
      if (
        eventType === "tool_progress" ||
        eventType === "progress" ||
        (event as any).progress !== undefined
      ) {
        foundProgressEvent = true;
        console.log("\n✅ 发现进度事件:");
        console.log(prettyPrint(event));
        testResult.notes.push("发现 tool_progress 事件");
      }

      // 检查 StreamEvent 类型
      if ((event as any).parent_tool_use_id) {
        testResult.notes.push("发现 parent_tool_use_id 字段（可能与进度相关）");
      }
    }

    // 记录所有事件类型
    const eventTypes = Array.from(
      new Set(allEvents.map((e) => (e as any).type))
    );
    console.log(`\n📊 收到的事件类型: ${eventTypes.join(", ")}`);
    testResult.notes.push(`事件类型: ${eventTypes.join(", ")}`);

    testResult.details = {
      eventTypes,
      totalEvents: allEvents.length,
      foundProgress: foundProgressEvent,
    };

    if (foundProgressEvent) {
      testResult.supported = true;
    } else {
      testResult.notes.push("未发现 tool_progress 事件");
      testResult.notes.push(
        "SDK 可能不支持工具进度，或使用其他机制（如 StreamEvent）"
      );
    }
  } catch (error) {
    testResult.notes.push(`测试失败: ${error}`);
    console.error("\n❌ 测试失败:", error);
  }

  results.push(testResult);
  console.log(
    `\n${testResult.supported ? "✅ 支持" : "❌ 不支持"} - ${testResult.feature}`
  );
}

// 主函数
async function main() {
  console.log("🔬 Claude Agent SDK 高级功能支持测试");
  console.log("SDK 版本: @anthropic-ai/claude-agent-sdk");
  console.log("环境配置:");
  console.log(`  ANTHROPIC_BASE_URL: ${process.env.ANTHROPIC_BASE_URL ?? "未设置"}`);
  console.log(`  ANTHROPIC_MODEL: ${process.env.ANTHROPIC_MODEL ?? "未设置"}`);
  console.log(`  CWD: ${process.cwd()}`);

  // 运行所有测试
  await testUsageAndCost();
  await testSessionMetadata();
  await testErrorDetails();
  await testToolProgress();

  // 生成总结报告
  console.log("\n" + "=".repeat(80));
  console.log("📊 测试总结");
  console.log("=".repeat(80));

  for (const result of results) {
    const status = result.supported ? "✅ 支持" : "❌ 不支持";
    console.log(`\n${status} - ${result.feature}`);
    if (result.notes.length > 0) {
      console.log("  备注:");
      result.notes.forEach((note) => console.log(`    - ${note}`));
    }
  }

  // 保存详细结果到文件
  const reportPath = "./test-advanced-features-results.json";
  writeFileSync(reportPath, prettyPrint(results));
  console.log(`\n📄 详细结果已保存到: ${reportPath}`);

  console.log("\n" + "=".repeat(80));
  console.log("✅ 所有测试完成");
  console.log("=".repeat(80));
}

main().catch(console.error);
