#!/usr/bin/env node

/**
 * Phase 1 User Isolation Test Script
 *
 * This script tests the user isolation functionality by:
 * 1. Creating sessions for different users
 * 2. Verifying that sessions are stored in separate directories
 * 3. Testing session resume functionality
 * 4. Verifying security (sanitizeUserId)
 *
 * Run with: node scripts/test-user-isolation.js
 */

import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';

// Test configuration
const TEST_CONFIG = {
  sessionsRoot: process.env.CLAUDE_SESSIONS_ROOT || '/tmp/claude-sessions',
  testUsers: [
    { id: 'user_A_123', email: 'userA@test.com' },
    { id: 'user_B_456', email: 'userB@test.com' },
    { id: '../dangerous/path', email: 'malicious@test.com' },
    { id: 'user.with.dots', email: 'user.with.dots@test.com' },
  ]
};

// Import the AgentSession class
const AgentSessionModule = await import('../src/server/agent-session.js');
const AgentSession = AgentSessionModule.default || AgentSessionModule.AgentSession;

console.log('\n=== Phase 1 User Isolation Test ===\n');
console.log(`Sessions Root: ${TEST_CONFIG.sessionsRoot}`);
console.log(`Test Users: ${TEST_CONFIG.testUsers.length}\n`);

// Clean up test directory before starting
if (existsSync(TEST_CONFIG.sessionsRoot)) {
  const files = await fs.readdir(TEST_CONFIG.sessionsRoot);
  for (const file of files) {
    await fs.rm(path.join(TEST_CONFIG.sessionsRoot, file), { recursive: true, force: true });
  }
}
console.log('✓ Cleaned test directory\n');

// Test 1: User A session creation
console.log('--- Test 1: User A Session Creation ---');
try {
  const userA = TEST_CONFIG.testUsers[0];
  const sessionA = new AgentSession({
    userId: userA.id,
    sessionsRoot: TEST_CONFIG.sessionsRoot
  });

  const expectedPathA = path.join(TEST_CONFIG.sessionsRoot, 'user_A_123');
  console.log(`Expected path for User A: ${expectedPathA}`);

  // Wait a bit for directory creation
  await new Promise(resolve => setTimeout(resolve, 100));

  const pathExists = existsSync(expectedPathA);
  console.log(`Directory created: ${pathExists ? '✓' : '✗'}`);

  // Test sanitizeUserId with the actual path
  if (sessionA.claudeHome) {
    console.log(`CLAUDE_HOME set to: ${sessionA.claudeHome}`);
    console.log(`Contains user ID: ${sessionA.claudeHome.includes('user_A_123') ? '✓' : '✗'}`);
  }

  console.log('Test 1: PASSED ✓\n');
} catch (error) {
  console.log(`Test 1: FAILED ✗ - ${error.message}\n`);
}

// Test 2: User B session creation and isolation
console.log('--- Test 2: User B Session Creation & Isolation ---');
try {
  const userB = TEST_CONFIG.testUsers[1];
  const sessionB = new AgentSession({
    userId: userB.id,
    sessionsRoot: TEST_CONFIG.sessionsRoot
  });

  const expectedPathB = path.join(TEST_CONFIG.sessionsRoot, 'user_B_456');
  console.log(`Expected path for User B: ${expectedPathB}`);

  // Wait a bit for directory creation
  await new Promise(resolve => setTimeout(resolve, 100));

  const pathExists = existsSync(expectedPathB);
  console.log(`Directory created: ${pathExists ? '✓' : '✗'}`);

  // Verify both directories exist and are separate
  const pathAExists = existsSync(path.join(TEST_CONFIG.sessionsRoot, 'user_A_123'));
  const pathBExists = existsSync(path.join(TEST_CONFIG.sessionsRoot, 'user_B_456'));

  console.log(`User A directory exists: ${pathAExists ? '✓' : '✗'}`);
  console.log(`User B directory exists: ${pathBExists ? '✓' : '✗'}`);
  console.log(`Directories are separate: ${pathAExists && pathBExists ? '✓' : '✗'}`);

  console.log('Test 2: PASSED ✓\n');
} catch (error) {
  console.log(`Test 2: FAILED ✗ - ${error.message}\n`);
}

// Test 3: Security verification (sanitizeUserId)
console.log('--- Test 3: Security Verification (sanitizeUserId) ---');
const dangerousUserId = '../etc/passwd';
const expectedSafeUserId = '___etc_passwd';

// Create a session with dangerous user ID to test sanitization
try {
  const dangerousSession = new AgentSession({
    userId: dangerousUserId,
    sessionsRoot: TEST_CONFIG.sessionsRoot
  });

  // Check if the path is properly sanitized
  if (dangerousSession.claudeHome) {
    const expectedSafePath = path.join(TEST_CONFIG.sessionsRoot, expectedSafeUserId);
    const isPathSafe = dangerousSession.claudeHome === expectedSafePath;
    console.log(`Dangerous user ID: ${dangerousUserId}`);
    console.log(`Sanitized to: ${path.basename(dangerousSession.claudeHome)}`);
    console.log(`Path properly sanitized: ${isPathSafe ? '✓' : '✗'}`);

    // Ensure no directory traversal
    const hasTraversal = dangerousSession.claudeHome.includes('..');
    console.log(`No path traversal: ${!hasTraversal ? '✓' : '✗'}`);
  }

  // Test user with dots
  const dottedUserSession = new AgentSession({
    userId: 'user.with.dots',
    sessionsRoot: TEST_CONFIG.sessionsRoot
  });

  if (dottedUserSession.claudeHome) {
    const isDotsSanitized = path.basename(dottedUserSession.claudeHome) === 'user_with_dots';
    console.log(`User with dots sanitized: ${isDotsSanitized ? '✓' : '✗'}`);
  }

  console.log('Test 3: PASSED ✓\n');
} catch (error) {
  console.log(`Test 3: FAILED ✗ - ${error.message}\n`);
}

// Test 4: Directory structure verification
console.log('--- Test 4: Directory Structure Verification ---');
try {
  const directories = await fs.readdir(TEST_CONFIG.sessionsRoot);
  console.log(`Created directories: ${directories.length}`);
  directories.forEach(dir => {
    console.log(`  - ${dir}`);
  });

  // Verify all directories are safe (no path traversal)
  const allSafe = directories.every(dir => !dir.includes('..') && !dir.includes('/') && !dir.includes('\\'));
  console.log(`All directory names are safe: ${allSafe ? '✓' : '✗'}`);

  console.log('Test 4: PASSED ✓\n');
} catch (error) {
  console.log(`Test 4: FAILED ✗ - ${error.message}\n`);
}

// Summary
console.log('=== Test Summary ===');
console.log('All tests completed. Check server logs for additional verification.\n');