#!/usr/bin/env node
/**
 * Test script to verify Claude Agent SDK Artifacts event support
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import path from 'path';
import fs from 'fs/promises';

const testUserId = 'saRIpMMJrzT1JQ4zc7aBGpqumpB2WPnZ';
const sessionId = 'artifact-test';
const workspacePath = path.join('/data/users', testUserId, 'sessions', sessionId, 'workspace');
const claudeHome = path.join('/data/users', testUserId);

// Ensure workspace exists with .claude symlink
await fs.mkdir(workspacePath, { recursive: true });
const symlinkPath = path.join(workspacePath, '.claude');
const targetPath = path.join(claudeHome, '.claude');

try {
  await fs.unlink(symlinkPath);
} catch {}

await fs.symlink(targetPath, symlinkPath, 'dir');

process.env.CLAUDE_HOME = claudeHome;
process.env.HOME = claudeHome;

console.log('🔍 Testing SDK Artifacts Event Support');
console.log('='.repeat(80));
console.log('Workspace:', workspacePath);
console.log('');

const events = [];
let hasArtifacts = false;

try {
  const stream = query({
    prompt: 'Use the artifacts-builder skill to create a simple HTML page with a blue header that says "Hello World"',
    options: {
      cwd: workspacePath,
      model: process.env.ANTHROPIC_MODEL,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      settingSources: ['project'],
      tools: { type: 'preset', preset: 'claude_code' },
      maxTurns: 10,
    },
  });

  console.log('📡 Listening for SDK events...\n');

  for await (const event of stream) {
    events.push(JSON.parse(JSON.stringify(event)));

    console.log(`[${event.type}]`, event.subtype || '');

    if (event.type === 'artifact-create' || event.type === 'artifact-update') {
      console.log('  ✅ FOUND ARTIFACT EVENT!');
      console.log('  Event:', JSON.stringify(event, null, 2));
      hasArtifacts = true;
    }

    if (event.type === 'assistant' && event.message?.content) {
      console.log(`  Content blocks: ${event.message.content.length}`);

      for (const block of event.message.content) {
        console.log(`    - Block type: ${block.type}`);

        if (block.type === 'document') {
          console.log('      ✅ FOUND DOCUMENT BLOCK!');
          console.log('      Document:', JSON.stringify(block, null, 2));
          hasArtifacts = true;
        }

        if (block.type === 'artifact-create' || block.type === 'artifact-update') {
          console.log('      ✅ FOUND ARTIFACT CONTENT BLOCK!');
          console.log('      Artifact:', JSON.stringify(block, null, 2));
          hasArtifacts = true;
        }

        if (block.type === 'text' && block.text) {
          const preview = block.text.substring(0, 100).replace(/\n/g, ' ');
          console.log(`      Text: ${preview}...`);
        }

        if (block.type === 'tool_use') {
          console.log(`      Tool: ${block.name}`);
        }
      }
    }

    if (event.type === 'system' && event.subtype === 'init') {
      console.log('  Skills:', event.skills || []);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log(`Total events: ${events.length}`);
  console.log(`Artifacts found: ${hasArtifacts ? 'YES ✅' : 'NO ❌'}`);

  const outputPath = '/tmp/artifact-events.json';
  await fs.writeFile(outputPath, JSON.stringify(events, null, 2));
  console.log(`Full event log: ${outputPath}`);

} catch (error) {
  console.error('\n❌ Error:', error);
  process.exit(1);
}
