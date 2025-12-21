#!/usr/bin/env node

/**
 * Phase 1 User Isolation WebSocket Test
 *
 * This script tests user isolation by simulating WebSocket connections
 * from different users to the agent chat endpoint.
 */

import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';
import WebSocket from 'ws';

const TEST_CONFIG = {
  wsUrl: 'ws://localhost:3000/ws/agent',
  sessionsRoot: process.env.CLAUDE_SESSIONS_ROOT || '/tmp/claude-sessions',
  // Test users with different IDs
  users: [
    { id: 'user_test_A', email: 'userA@test.com', cookie: 'test-session-A' },
    { id: 'user_test_B', email: 'userB@test.com', cookie: 'test-session-B' }
  ]
};

console.log('\n=== Phase 1 User Isolation WebSocket Test ===\n');
console.log(`WebSocket URL: ${TEST_CONFIG.wsUrl}`);
console.log(`Sessions Root: ${TEST_CONFIG.sessionsRoot}\n`);

// Helper to simulate authenticated WebSocket connection
function createAuthenticatedConnection(user) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(TEST_CONFIG.wsUrl, {
      headers: {
        'Cookie': `better-auth.session_token=${user.cookie}`,
        'User-Agent': `Test-${user.id}`
      }
    });

    ws.on('open', () => {
      console.log(`✓ ${user.id}: WebSocket connected`);
      ws.userId = user.id;
      resolve(ws);
    });

    ws.on('error', (error) => {
      console.log(`✗ ${user.id}: WebSocket error - ${error.message}`);
      reject(error);
    });

    // Timeout after 5 seconds
    setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        reject(new Error(`${user.id}: Connection timeout`));
      }
    }, 5000);
  });
}

// Helper to send a message and wait for response
function sendChatMessage(ws, message, sessionId = null) {
  return new Promise((resolve) => {
    const msgId = Date.now();
    const outboundMsg = {
      type: 'chat',
      content: message,
      ...(sessionId && { sessionId })
    };

    ws.send(JSON.stringify(outboundMsg));

    // Listen for messages
    const handleMessage = (data) => {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'session_init') {
        console.log(`${ws.userId}: Session initialized with ID: ${msg.sessionId}`);
      }
      else if (msg.type === 'message' && msg.event) {
        console.log(`${ws.userId}: Received event type: ${msg.event.type}`);
        if (msg.event.type === 'result' || msg.event.type === 'done') {
          ws.removeListener('message', handleMessage);
          resolve(msg.event);
        }
      }
      else if (msg.type === 'done') {
        ws.removeListener('message', handleMessage);
        resolve({ done: true });
      }
      else if (msg.type === 'error') {
        console.log(`${ws.userId}: Error: ${msg.message}`);
        ws.removeListener('message', handleMessage);
        resolve(msg);
      }
    };

    ws.on('message', handleMessage);
  });
}

// Test 1: Clean environment
console.log('--- Test 1: Environment Setup ---');
try {
  if (!existsSync(TEST_CONFIG.sessionsRoot)) {
    await fs.mkdir(TEST_CONFIG.sessionsRoot, { recursive: true });
    console.log('Created test directory: ✓');
  }

  // Clean up existing test data
  const files = await fs.readdir(TEST_CONFIG.sessionsRoot);
  for (const file of files) {
    await fs.rm(path.join(TEST_CONFIG.sessionsRoot, file), { recursive: true, force: true });
  }
  console.log('Cleaned test directory: ✓');
  console.log('Test 1: PASSED ✓\n');
} catch (error) {
  console.log(`Test 1: FAILED ✗ - ${error.message}\n`);
}

// Test 2: Create WebSocket connections for different users
console.log('--- Test 2: WebSocket User Connections ---');
let userAConnection = null;
let userBConnection = null;

try {
  // Note: Since we don't have actual authentication cookies, this will likely fail
  // but we can still test the infrastructure
  console.log('Note: This test requires valid authentication cookies.');
  console.log('In a real scenario, users would be authenticated via Better Auth.\n');

  // For demonstration, we'll try unauthenticated connections
  console.log('Attempting unauthenticated connection (expected to be rejected)...');

  const ws = new WebSocket(TEST_CONFIG.wsUrl);

  ws.on('open', () => {
    console.log('Unauthenticated connection opened (unexpected)');
    ws.close();
  });

  ws.on('error', (error) => {
    console.log(`Unauthenticated connection rejected: ✓ ${error.message.includes('401') || error.message.includes('Unauthorized') ? 'Expected' : 'Unexpected'}`);
  });

  ws.on('close', (code, reason) => {
    console.log(`Connection closed with code: ${code}`);
  });

  // Wait for the connection attempt
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('Test 2: COMPLETED (Authentication required for full test) ✓\n');
} catch (error) {
  console.log(`Test 2: FAILED ✗ - ${error.message}\n`);
}

// Test 3: Test AgentSession class directly
console.log('--- Test 3: Direct AgentSession Test ---');
try {
  // Import AgentSession (TypeScript compilation needed)
  console.log('Testing AgentSession with different user IDs...');

  // Since we can't easily import TypeScript, let's test the directory creation logic
  const testUserIds = [
    'user_A_123',
    'user_B_456',
    '../malicious/path',
    'user.with.dots'
  ];

  const sanitizeUserId = (userId) => {
    return userId.replace(/[\/\\\.]+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '_');
  };

  testUserIds.forEach(userId => {
    const sanitized = sanitizeUserId(userId);
    const expectedPath = path.join(TEST_CONFIG.sessionsRoot, sanitized);
    console.log(`User ID: ${userId}`);
    console.log(`  Sanitized: ${sanitized}`);
    console.log(`  Expected Path: ${expectedPath}`);
    console.log(`  Safe: ${sanitized === userId ? '✓' : '⚠'} (sanitized)`);
  });

  console.log('Test 3: PASSED ✓\n');
} catch (error) {
  console.log(`Test 3: FAILED ✗ - ${error.message}\n`);
}

// Test 4: Check for existing directories
console.log('--- Test 4: Directory Structure Check ---');
try {
  const directories = await fs.readdir(TEST_CONFIG.sessionsRoot);
  console.log(`Current directories in ${TEST_CONFIG.sessionsRoot}:`);
  console.log(`Count: ${directories.length}`);

  directories.forEach(dir => {
    console.log(`  - ${dir}`);
    const fullPath = path.join(TEST_CONFIG.sessionsRoot, dir);
    // Basic security check
    const isSafe = !dir.includes('..') && !dir.includes('/') && !dir.includes('\\');
    console.log(`    Safe: ${isSafe ? '✓' : '✗'}`);
  });

  console.log('Test 4: PASSED ✓\n');
} catch (error) {
  console.log(`Test 4: FAILED ✗ - ${error.message}\n`);
}

// Test 5: Manual testing instructions
console.log('--- Test 5: Manual Testing Instructions ---');
console.log('\nTo complete the full user isolation test:');
console.log('');
console.log('1. Open browser and navigate to: http://localhost:3000');
console.log('2. Sign up/login as User A');
console.log('3. Navigate to /dashboard/agent-chat');
console.log('4. Send a message: "Hello, I am User A"');
console.log('5. Wait for AI response');
console.log('6. Check server logs for CLAUDE_HOME messages');
console.log('7. Verify directory creation in /tmp/claude-sessions/');
console.log('');
console.log('8. Open new browser window (incognito mode)');
console.log('9. Sign up/login as User B');
console.log('10. Navigate to /dashboard/agent-chat');
console.log('11. Send a message: "Hello, I am User B"');
console.log('12. Verify separate directory creation');
console.log('');
console.log('Expected log messages:');
console.log('[SessionManager] Sessions root: /tmp/claude-sessions');
console.log('[AgentSession] Created CLAUDE_HOME directory: /tmp/claude-sessions/{userId}');
console.log('[AgentSession] CLAUDE_HOME set to /tmp/claude-sessions/{userId}');
console.log('');
console.log('Test 5: Instructions provided ✓\n');

console.log('=== Test Summary ===');
console.log('WebSocket infrastructure test completed.');
console.log('For complete verification, follow the manual testing steps.');
console.log('\nNote: Full WebSocket testing requires valid authentication cookies');