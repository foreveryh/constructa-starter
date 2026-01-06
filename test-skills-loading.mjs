#!/usr/bin/env node
/**
 * Test script to verify Claude Agent SDK skills loading
 */
import { query } from '@anthropic-ai/claude-agent-sdk';
import path from 'path';

// Simulate the worker environment
const testUserId = 'saRIpMMJrzT1JQ4zc7aBGpqumpB2WPnZ';
const claudeHome = path.join(process.cwd(), 'user-data', testUserId);

// Set environment variables
process.env.CLAUDE_HOME = claudeHome;
process.env.HOME = claudeHome;

console.log('Testing Claude Agent SDK Skills Loading');
console.log('='.repeat(60));
console.log('CLAUDE_HOME:', claudeHome);
console.log('Skills directory:', path.join(claudeHome, '.claude', 'skills'));
console.log('='.repeat(60));
console.log('');

// Test query with a simple prompt
try {
  const stream = query({
    prompt: 'List all available skills. Just list their names.',
    options: {
      cwd: process.cwd(),
      model: process.env.ANTHROPIC_MODEL,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
    },
  });

  console.log('Starting query stream...\n');

  for await (const event of stream) {
    if (event.type === 'system' && event.subtype === 'init') {
      console.log('\n📋 System Init Event:');
      console.log('  Session ID:', event.session_id);
      console.log('  Model:', event.model);
      console.log('  Skills:', event.skills || []);
      console.log('  MCP Servers:', event.mcp_servers || []);
      console.log('  CWD:', event.cwd);
      console.log('');
    }

    if (event.type === 'assistant' && event.message?.content) {
      const textBlocks = event.message.content.filter(b => b.type === 'text');
      for (const block of textBlocks) {
        process.stdout.write(block.text);
      }
    }
  }

  console.log('\n\n✅ Test completed successfully');
} catch (error) {
  console.error('\n❌ Error:', error);
  process.exit(1);
}
