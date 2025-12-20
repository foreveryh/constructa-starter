#!/usr/bin/env tsx
/**
 * 连续对话测试
 *
 * 测试 SDK 的 resume 功能，验证多轮对话的事件格式
 */

import { config } from "dotenv";
config();

import { query } from "@anthropic-ai/claude-agent-sdk";

async function testMultiTurn() {
  console.log("🔬 连续对话测试");
  console.log("=".repeat(80));

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const baseURL = process.env.ANTHROPIC_BASE_URL;
  const model = process.env.ANTHROPIC_MODEL;

  if (!apiKey) {
    console.error("❌ ANTHROPIC_API_KEY 未设置");
    return;
  }

  let sessionId: string | undefined;

  // 第一轮对话
  console.log("\n📝 第一轮: 'My name is Alice. Remember it.'");
  console.log("-".repeat(60));

  const stream1 = query({
    prompt: "My name is Alice. Remember it.",
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
    },
  });

  let eventCount1 = 0;
  for await (const event of stream1) {
    eventCount1++;
    const type = (event as { type?: string }).type;
    const subtype = (event as { subtype?: string }).subtype;
    const sid = (event as { session_id?: string }).session_id;

    if (type === "system" && subtype === "init" && sid) {
      sessionId = sid;
      console.log(`📍 获取到 session_id: ${sessionId}`);
    }

    if (type === "assistant") {
      const msg = (event as { message?: { content?: Array<{ type?: string; text?: string }> } }).message;
      const text = msg?.content?.find(b => b.type === "text")?.text;
      if (text) {
        console.log(`💬 Assistant: "${text.substring(0, 100)}${text.length > 100 ? "..." : ""}"`);
      }
    }

    if (type === "result") {
      console.log(`✅ 第一轮完成，共 ${eventCount1} 个事件`);
    }
  }

  if (!sessionId) {
    console.error("❌ 未获取到 session_id，无法继续");
    return;
  }

  // 等待一下确保会话保存
  await new Promise(resolve => setTimeout(resolve, 1000));

  // 第二轮对话 - 使用 resume
  console.log("\n" + "=".repeat(80));
  console.log("\n📝 第二轮 (resume): 'What is my name?'");
  console.log("-".repeat(60));

  const stream2 = query({
    prompt: "What is my name?",
    options: {
      cwd: process.cwd(),
      model,
      resume: sessionId,  // 关键：使用 resume 恢复会话
      ...(baseURL && {
        env: {
          ...process.env,
          ANTHROPIC_BASE_URL: baseURL,
          ANTHROPIC_API_URL: baseURL,
        },
      }),
    },
  });

  let eventCount2 = 0;
  let newSessionId: string | undefined;

  for await (const event of stream2) {
    eventCount2++;
    const type = (event as { type?: string }).type;
    const subtype = (event as { subtype?: string }).subtype;
    const sid = (event as { session_id?: string }).session_id;

    console.log(`📨 事件 ${eventCount2}: ${type}${subtype ? ` (${subtype})` : ""}`);

    if (type === "system" && subtype === "init" && sid) {
      newSessionId = sid;
      console.log(`📍 Session ID: ${sid}`);
      console.log(`📍 是否相同: ${sid === sessionId ? "✅ 相同" : "❌ 不同"}`);
    }

    if (type === "assistant") {
      const msg = (event as { message?: { content?: Array<{ type?: string; text?: string }> } }).message;
      const content = msg?.content ?? [];

      for (const block of content) {
        if (block.type === "text" && block.text) {
          console.log(`💬 Assistant: "${block.text}"`);
        }
      }
    }

    if (type === "result") {
      const res = event as { result?: string; is_error?: boolean };
      console.log(`✅ 第二轮完成`);
      console.log(`📋 Result: "${res.result}"`);
      console.log(`📋 Is Error: ${res.is_error}`);
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log("📊 测试总结:");
  console.log(`  第一轮事件数: ${eventCount1}`);
  console.log(`  第二轮事件数: ${eventCount2}`);
  console.log(`  原始 session_id: ${sessionId}`);
  console.log(`  恢复后 session_id: ${newSessionId}`);
  console.log(`  会话是否保持: ${sessionId === newSessionId ? "✅ 是" : "❌ 否（新会话）"}`);
}

testMultiTurn().catch(console.error);
