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
        ...(sdkResumeId && { resume: sdkResumeId }),
      },
    });

    for await (const event of stream) {
      // Send each event as a JSON line
      process.stdout.write(JSON.stringify({ type: 'event', event }) + '\n');
    }

    // Signal completion
    process.stdout.write(JSON.stringify({ type: 'done' }) + '\n');
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
