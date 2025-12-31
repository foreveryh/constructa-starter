#!/usr/bin/env node
/**
 * Query Worker for Claude Agent SDK
 *
 * This worker runs in a separate process with its own CLAUDE_HOME environment.
 * Communication happens via stdin/stdout using JSON messages.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';

// Read configuration from environment
const config = {
  model: process.env.ANTHROPIC_MODEL,
  cwd: process.env.WORKER_CWD || process.cwd(),
};

// Track if we're being terminated
let isTerminating = false;

// Handle graceful shutdown signals
process.on('SIGTERM', () => {
  console.error('[Worker] Received SIGTERM, shutting down gracefully');
  isTerminating = true;
  // Give a brief moment for cleanup, then exit
  setTimeout(() => {
    process.exit(0);
  }, 100);
});

process.on('SIGINT', () => {
  console.error('[Worker] Received SIGINT, shutting down');
  isTerminating = true;
  process.exit(0);
});

// Read query request from stdin
let inputData = '';

process.stdin.on('data', (chunk) => {
  inputData += chunk;
});

process.stdin.on('end', async () => {
  try {
    const request = JSON.parse(inputData);
    const { prompt, sdkResumeId } = request;

    console.error(`[Worker] Starting query`);
    console.error(`[Worker]   CLAUDE_HOME: ${process.env.CLAUDE_HOME}`);
    console.error(`[Worker]   CWD (Workspace): ${config.cwd}`);
    if (sdkResumeId) {
      console.error(`[Worker]   SDK Resume ID: ${sdkResumeId}`);
    }

    const stream = query({
      prompt,
      options: {
        cwd: config.cwd,
        model: config.model,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        // Enable skills loading from project (.claude/skills in cwd) and user (~/.claude/skills)
        settingSources: ['project', 'user'],
        // Use claude_code preset to get all default tools (which includes Skill tool)
        tools: { type: 'preset', preset: 'claude_code' },
        ...(sdkResumeId && { resume: sdkResumeId }),
      },
    });

    for await (const event of stream) {
      // Check if we're being terminated
      if (isTerminating) {
        console.error('[Worker] Terminating, stopping event processing');
        break;
      }
      // Send each event as a JSON line
      process.stdout.write(JSON.stringify({ type: 'event', event }) + '\n');
    }

    // Signal completion (only if not terminating)
    if (!isTerminating) {
      process.stdout.write(JSON.stringify({ type: 'done' }) + '\n');
    }
    process.exit(0);
  } catch (error) {
    console.error('[Worker] Error:', error);
    process.stdout.write(JSON.stringify({
      type: 'error',
      message: error instanceof Error ? error.message : String(error)
    }) + '\n');
    process.exit(1);
  }
});
