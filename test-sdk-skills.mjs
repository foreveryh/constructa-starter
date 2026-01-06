#!/usr/bin/env node
import { query } from '@anthropic-ai/claude-agent-sdk';
import path from 'path';

const testUserId = 'saRIpMMJrzT1JQ4zc7aBGpqumpB2WPnZ';
const sessionId = '7b33badf-c233-4b1f-916f-02268c1abc22';
const workspacePath = path.join('/data/users', testUserId, 'sessions', sessionId, 'workspace');
const claudeHome = path.join('/data/users', testUserId);

process.env.CLAUDE_HOME = claudeHome;
process.env.HOME = claudeHome;

console.log('Testing SDK skills loading...');
console.log('CLAUDE_HOME:', process.env.CLAUDE_HOME);
console.log('CWD:', workspacePath);
console.log('');

try {
  const stream = query({
    prompt: 'Just say hello',
    options: {
      cwd: workspacePath,
      model: process.env.ANTHROPIC_MODEL,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      settingSources: ['project', 'user'],
      maxTurns: 1,
    },
  });

  for await (const event of stream) {
    if (event.type === 'system' && event.subtype === 'init') {
      console.log('📋 System Init Event:');
      console.log('  Session ID:', event.session_id);
      console.log('  Model:', event.model);
      console.log('  Skills:', event.skills || []);
      console.log('  Skills count:', (event.skills || []).length);
      console.log('  MCP Servers:', event.mcp_servers || []);
      console.log('');
      
      if ((event.skills || []).length === 0) {
        console.log('❌ NO SKILLS LOADED!');
      } else {
        console.log('✅ Skills loaded successfully!');
      }
      break;
    }
  }
} catch (error) {
  console.error('Error:', error);
}
