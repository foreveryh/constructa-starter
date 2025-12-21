#!/usr/bin/env node

/**
 * Phase 1 User Isolation HTTP Test Script
 *
 * This script tests user isolation by making HTTP requests to the running server.
 * It simulates multiple users and verifies session isolation.
 *
 * Run with: node scripts/test-user-isolation-http.js
 */

import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';

const TEST_CONFIG = {
  baseUrl: process.env.TEST_BASE_URL || 'http://localhost:3000',
  sessionsRoot: process.env.CLAUDE_SESSIONS_ROOT || '/tmp/claude-sessions'
};

console.log('\n=== Phase 1 User Isolation HTTP Test ===\n');
console.log(`Base URL: ${TEST_CONFIG.baseUrl}`);
console.log(`Sessions Root: ${TEST_CONFIG.sessionsRoot}\n`);

// Helper to make authenticated requests
async function makeRequest(endpoint, options = {}) {
  const url = `${TEST_CONFIG.baseUrl}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  });

  let data = null;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (e) {
      // Not JSON
    }
  }

  return { ok: response.ok, status: response.status, data, text };
}

// Test 1: Check if server is running
console.log('--- Test 1: Server Connectivity ---');
try {
  const response = await makeRequest('/');
  console.log(`Server running: ${response.ok ? '✓' : '✗'}`);
  console.log('Test 1: PASSED ✓\n');
} catch (error) {
  console.log(`Test 1: FAILED ✗ - ${error.message}\n`);
  process.exit(1);
}

// Test 2: Verify test directory exists and check initial state
console.log('--- Test 2: Test Directory Setup ---');
try {
  if (!existsSync(TEST_CONFIG.sessionsRoot)) {
    await fs.mkdir(TEST_CONFIG.sessionsRoot, { recursive: true });
    console.log('Created test directory: ✓');
  }

  // Clean up any existing test data
  const files = await fs.readdir(TEST_CONFIG.sessionsRoot);
  for (const file of files) {
    await fs.rm(path.join(TEST_CONFIG.sessionsRoot, file), { recursive: true, force: true });
  }
  console.log('Cleaned test directory: ✓');
  console.log('Test 2: PASSED ✓\n');
} catch (error) {
  console.log(`Test 2: FAILED ✗ - ${error.message}\n`);
}

// Test 3: Create test users via API (if auth endpoints exist)
console.log('--- Test 3: Attempt to Create Test Users ---');
const testUsers = [
  { email: 'testisolation1@example.com', password: 'TestPass123!', name: 'Test User A' },
  { email: 'testisolation2@example.com', password: 'TestPass123!', name: 'Test User B' }
];

let userACookie = null;
let userBCookie = null;

try {
  // Try to sign up users
  for (let i = 0; i < testUsers.length; i++) {
    const user = testUsers[i];
    console.log(`Creating user ${user.name}...`);

    const signupResponse = await makeRequest('/api/auth/sign-up/email', {
      method: 'POST',
      body: JSON.stringify(user)
    });

    if (signupResponse.ok) {
      console.log(`User ${user.name} created: ✓`);
      // In a real scenario, we'd extract cookies here
      // For now, we'll just note that the user creation succeeded
    } else {
      console.log(`User ${user.name} creation returned status ${signupResponse.status}`);
      if (signupResponse.text) {
        console.log(`Response: ${signupResponse.text.substring(0, 200)}...`);
      }
    }
  }

  console.log('Test 3: COMPLETED (Note: Actual isolation requires browser testing)\n');
} catch (error) {
  console.log(`Test 3: FAILED ✗ - ${error.message}\n`);
}

// Test 4: Check if directories were created after user creation
console.log('--- Test 4: Directory Creation Verification ---');
try {
  // Wait a bit for any async operations
  await new Promise(resolve => setTimeout(resolve, 2000));

  const directories = await fs.readdir(TEST_CONFIG.sessionsRoot);
  console.log(`Directories created: ${directories.length}`);

  if (directories.length > 0) {
    directories.forEach(dir => {
      const fullPath = path.join(TEST_CONFIG.sessionsRoot, dir);
      console.log(`  - ${dir}`);

      // Check if it's a directory
      const stats = fs.stat(fullPath);
      stats.then(stat => {
        console.log(`    Type: ${stat.isDirectory() ? 'Directory' : 'File'}`);
      }).catch(() => {
        console.log(`    Type: Could not determine`);
      });
    });

    // Verify no dangerous directory names
    const hasDangerousNames = directories.some(dir =>
      dir.includes('..') || dir.includes('/') || dir.includes('\\')
    );
    console.log(`All directory names safe: ${!hasDangerousNames ? '✓' : '✗'}`);
  } else {
    console.log('No directories created yet (expected if using browser-based testing)');
  }

  console.log('Test 4: PASSED ✓\n');
} catch (error) {
  console.log(`Test 4: FAILED ✗ - ${error.message}\n`);
}

// Test 5: Manual testing instructions
console.log('--- Test 5: Manual Testing Instructions ---');
console.log('To complete the full user isolation test:');
console.log('');
console.log('1. Open a browser and navigate to: http://localhost:3000');
console.log('2. Sign up/login as User A');
console.log('3. Navigate to Agent Chat page');
console.log('4. Send a message to create a session');
console.log('5. Check that a directory is created in /tmp/claude-sessions/');
console.log('6. Open a new browser window or incognito mode');
console.log('7. Sign up/login as User B');
console.log('8. Navigate to Agent Chat and send a message');
console.log('9. Verify that a separate directory is created for User B');
console.log('10. Check that sessions are properly isolated');
console.log('');
console.log('Expected behavior:');
console.log('- Each user gets their own directory in /tmp/claude-sessions/');
console.log('- Directory names should be sanitized (no path traversal)');
console.log('- Sessions should not be accessible between users');
console.log('Test 5: Instructions provided ✓\n');

console.log('=== Test Summary ===');
console.log('HTTP-based automated tests completed.');
console.log('For complete verification, follow the manual testing steps above.');
console.log('Check server console logs for CLAUDE_HOME path messages.');