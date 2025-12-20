#!/usr/bin/env node
/**
 * Simple test script to verify Claude Agent SDK works correctly
 */

import { query } from '@anthropic-ai/claude-agent-sdk';

console.log('Starting SDK test...');
console.log('Timestamp:', new Date().toISOString());
console.log('Environment:');
console.log('  ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? '***set***' : 'NOT SET');
console.log('  ANTHROPIC_BASE_URL:', process.env.ANTHROPIC_BASE_URL || 'NOT SET');
console.log('  ANTHROPIC_MODEL:', process.env.ANTHROPIC_MODEL || 'NOT SET');

const startTime = Date.now();

try {
  console.log('\nCalling SDK query()...');

  const stream = query({
    prompt: 'Say "Hello, SDK test successful!" and nothing else.',
    options: {
      cwd: process.cwd(),
      model: process.env.ANTHROPIC_MODEL,
      maxTurns: 1,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      env: {
        ...process.env,
        ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL,
        ANTHROPIC_API_URL: process.env.ANTHROPIC_BASE_URL,
      },
    },
  });

  let eventCount = 0;
  for await (const event of stream) {
    eventCount++;
    const elapsed = Date.now() - startTime;
    console.log(`[${elapsed}ms] Event ${eventCount}: ${event.type}`);

    if (event.type === 'assistant' && event.message?.content) {
      for (const block of event.message.content) {
        if (block.type === 'text') {
          console.log('  Text:', block.text);
        }
      }
    }
  }

  console.log('\n✅ SDK test completed successfully!');
  console.log(`Total events: ${eventCount}`);
  console.log(`Total time: ${Date.now() - startTime}ms`);

} catch (error) {
  console.error('\n❌ SDK test failed!');
  console.error('Error:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}
