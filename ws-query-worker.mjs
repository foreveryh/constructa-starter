#!/usr/bin/env node
/**
 * Query Worker for Claude Agent SDK
 *
 * This worker runs in a separate process with its own CLAUDE_HOME environment.
 * Communication happens via stdin/stdout using JSON messages.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

// Read configuration from environment
const config = {
  model: process.env.ANTHROPIC_MODEL,
  cwd: process.env.WORKER_CWD || process.cwd(),
};

// Define Artifact Schema for Structured Outputs
// This schema guides Claude to provide metadata for artifacts (HTML, SVG, React, Markdown)
const ArtifactFileSchema = z.object({
  path: z.string().describe('File path (e.g., "App.jsx", "styles.css")'),
  content: z.string().describe('Complete file content'),
  language: z
    .enum(['html', 'css', 'javascript', 'typescript', 'jsx', 'tsx', 'svg', 'markdown', 'json'])
    .describe('Programming language or file type'),
});

const ArtifactMetadataSchema = z.object({
  title: z.string().describe('Descriptive title for the artifact (e.g., "Pomodoro Timer")'),
  description: z
    .string()
    .optional()
    .describe('Detailed description of what the artifact does and how it works'),
  type: z
    .enum(['html', 'svg', 'markdown', 'react'])
    .describe('Type of artifact: html, svg, markdown, or react component'),
  files: z
    .array(ArtifactFileSchema)
    .min(1)
    .describe('Array of files that make up this artifact'),
});

// Convert Zod schema to JSON Schema for SDK
const artifactJsonSchema = zodToJsonSchema(ArtifactMetadataSchema, {
  name: 'ArtifactMetadata',
  $refStrategy: 'root', // Use 'root' for better compatibility
});

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

    console.error(`[Worker] ======================================`);
    console.error(`[Worker] Starting query`);
    console.error(`[Worker]   CLAUDE_HOME: ${process.env.CLAUDE_HOME}`);
    console.error(`[Worker]   CWD (Workspace): ${config.cwd}`);
    console.error(`[Worker]   Model: ${config.model || 'default'}`);
    console.error(`[Worker]   Prompt length: ${prompt.length} chars`);
    if (sdkResumeId) {
      console.error(`[Worker]   SDK Resume ID: ${sdkResumeId}`);
    }

    // Temporarily disable Structured Outputs for debugging
    const useStructuredOutputs = process.env.ENABLE_STRUCTURED_OUTPUTS === 'true';

    console.error(`[Worker] Structured Outputs: ${useStructuredOutputs ? 'enabled' : 'disabled'}`);
    console.error(`[Worker] ======================================`);

    console.error('[Worker] Creating query stream...');

    // System message to guide Claude to use relative paths for file operations
    const systemMessage = `You are working in a workspace directory at: ${config.cwd}

When creating, writing, or editing files:
- ALWAYS use relative paths (e.g., "index.html", "styles.css", "src/App.jsx")
- NEVER use absolute paths like "/tmp/file.html" or "/home/user/file.html"
- Files will be created relative to the current working directory
- The workspace is isolated for this conversation session

Example good file paths:
- "index.html" (creates in workspace root)
- "src/components/Header.tsx" (creates in subdirectory)
- "styles/main.css" (creates in subdirectory)

Example bad file paths:
- "/tmp/index.html" (DON'T use /tmp)
- "/home/user/index.html" (DON'T use absolute paths)
- "../outside/file.html" (DON'T go outside workspace)`;

    const stream = query({
      prompt,
      options: {
        cwd: config.cwd,
        model: config.model,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        // Enable skills loading from project (.claude/skills in cwd)
        // Note: We use symlink to share user's skills across sessions, so only 'project' is needed
        settingSources: ['project'],
        // Use claude_code preset to get all default tools (which includes Skill tool)
        tools: { type: 'preset', preset: 'claude_code' },
        // Add system message to guide file path behavior
        systemMessage,
        // Enable Structured Outputs for artifact metadata (optional, controlled by env var)
        // IMPORTANT: Use 'outputFormat' parameter (not 'structuredOutput')
        ...(useStructuredOutputs && {
          outputFormat: {
            type: 'json_schema',
            schema: artifactJsonSchema,
          },
        }),
        ...(sdkResumeId && { resume: sdkResumeId }),
      },
    });

    console.error('[Worker] Query stream created, starting event iteration...');
    let eventCount = 0;

    for await (const event of stream) {
      eventCount++;
      console.error(`[Worker] Event #${eventCount}: ${event.type}${event.subtype ? '.' + event.subtype : ''}`);

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
    console.error('[Worker] Error stack:', error instanceof Error ? error.stack : 'N/A');
    process.stdout.write(JSON.stringify({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }) + '\n');
    process.exit(1);
  }
});
