/**
 * Phase E – Password Security Test Suite (S18)
 *
 * Tests:
 *  1. Password change with correct currentPassword + newPassword → 200
 *  2. Password change with wrong currentPassword → 400
 *  3. Password change without currentPassword → 400
 *  4. newPassword alone (no currentPassword) → 400
 *  5. Can login with new password after successful change
 *  6. Cannot login with old password after change
 *  7. req.body.password alone no longer changes the password (security gap removed)
 */

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import http from 'http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

let memoryServer;
if (!process.env.MONGO_URI) {
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  memoryServer = await MongoMemoryServer.create();
  process.env.MONGO_URI = memoryServer.getUri();
}

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  process.env.JWT_SECRET = 'fitnova-test-secret-must-be-at-least-32-chars';
}

process.env.NODE_ENV = 'test';

const { createApp } = await import('../app.js');
const { connectDB, disconnectDB } = await import('../config/db.js');
const { default: User } = await import('../models/user.model.js');
const jwt = await import('jsonwebtoken');

// ── Helpers ─────────────────────────────────────────────────────────────────
let baseUrl;
let httpServer;
let passed = 0;
let failed = 0;

function makeToken(user) {
  return jwt.default.sign(
    { sub: user._id.toString(), role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' },
  );
}

async function api(method, path, opts = {}) {
  const url = `${baseUrl}${path}`;
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;
  const res = await fetch(url, {
    method,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data;
  try { data = await res.json(); } catch { data = {}; }
  return { status: res.status, data };
}

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ PASS: ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}`);
    failed++;
  }
}

// ── Setup ────────────────────────────────────────────────────────────────────
await connectDB();

const UNIQUE = Date.now();

// Clean up any leftover test users
await User.deleteMany({ email: /test-phase-e-pw/ });

// Create a member for password change tests
const member = await User.create({
  fullName: 'PwTest Member',
  email: `test-phase-e-pw-${UNIQUE}@example.com`,
  phone: String(UNIQUE).slice(-10),
  password: 'OldPass1234',
  gender: 'male',
  dateOfBirth: new Date('1995-01-01'),
  role: 'member',
});

const memberToken = makeToken(member);

const app = createApp({ ...process.env, nodeEnv: 'test' });
httpServer = http.createServer(app);
await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
const port = httpServer.address().port;
baseUrl = `http://127.0.0.1:${port}/api`;

// ── Tests ────────────────────────────────────────────────────────────────────
console.log('\n=== Phase E – Password Security Tests ===\n');

// Test 1: Correct currentPassword + newPassword → 200
console.log('Test 1: Correct currentPassword + newPassword → 200');
{
  const r = await api('PATCH', '/users/me', {
    token: memberToken,
    body: { currentPassword: 'OldPass1234', newPassword: 'NewPass5678' },
  });
  assert(r.status === 200, `Status 200 on correct password change (got ${r.status})`);
  assert(r.data.success === true, 'Response success is true');
}

// Test 2: Try to login with new password
console.log('\nTest 2: Can login with new password after change');
{
  const r = await api('POST', '/auth/login', {
    body: { email: member.email, password: 'NewPass5678' },
  });
  assert(r.status === 200, `Login with new password succeeds (got ${r.status})`);
  assert(typeof r.data.token === 'string', 'Returns a token');
}

// Test 3: Old password no longer works
console.log('\nTest 3: Old password rejected after change');
{
  const r = await api('POST', '/auth/login', {
    body: { email: member.email, password: 'OldPass1234' },
  });
  assert(r.status === 401 || r.status === 400, `Old password rejected (got ${r.status})`);
}

// Test 4: Wrong currentPassword → 400
console.log('\nTest 4: Wrong currentPassword → 400');
{
  const r = await api('PATCH', '/users/me', {
    token: memberToken,
    body: { currentPassword: 'WrongPassword', newPassword: 'AnotherPass9' },
  });
  assert(r.status === 400, `Wrong currentPassword returns 400 (got ${r.status})`);
  assert(
    r.data.message?.toLowerCase().includes('incorrect') ||
    r.data.message?.toLowerCase().includes('password'),
    `Error message mentions password (got: ${r.data.message})`,
  );
}

// Test 5: newPassword without currentPassword → 400
console.log('\nTest 5: newPassword without currentPassword → 400');
{
  const r = await api('PATCH', '/users/me', {
    token: memberToken,
    body: { newPassword: 'NoCurrentPwd99' },
  });
  assert(r.status === 400, `Missing currentPassword returns 400 (got ${r.status})`);
}

// Test 6: req.body.password alone should NOT change password (gap removed)
console.log('\nTest 6: req.body.password alone is ignored (security gap removed)');
{
  // Get current user to know current password state
  const rBefore = await api('GET', '/users/me', { token: memberToken });
  // Attempt to change password via old `password` field (should be ignored)
  const r = await api('PATCH', '/users/me', {
    token: memberToken,
    body: { password: 'BypassAttempt99' },
  });
  // Should succeed (200) but NOT change the password
  assert(r.status === 200, `Request succeeds (200) even with stray 'password' field (got ${r.status})`);
  // Verify new password was NOT applied – old 'NewPass5678' should still work
  const loginR = await api('POST', '/auth/login', {
    body: { email: member.email, password: 'NewPass5678' },
  });
  assert(loginR.status === 200, `Original password still works after bypass attempt (got ${loginR.status})`);
  const bypassLoginR = await api('POST', '/auth/login', {
    body: { email: member.email, password: 'BypassAttempt99' },
  });
  assert(
    bypassLoginR.status === 401 || bypassLoginR.status === 400,
    `Bypass password does NOT work (got ${bypassLoginR.status})`,
  );
}

// Test 7: Unauthenticated PATCH /users/me → 401
console.log('\nTest 7: Unauthenticated PATCH /users/me → 401');
{
  const r = await api('PATCH', '/users/me', {
    body: { currentPassword: 'x', newPassword: 'y12345678' },
  });
  assert(r.status === 401, `Unauthenticated request returns 401 (got ${r.status})`);
}

// ── Cleanup ──────────────────────────────────────────────────────────────────
await User.deleteMany({ email: /test-phase-e-pw/ });

httpServer.close();
await disconnectDB();
if (memoryServer) await memoryServer.stop();

console.log('\n─────────────────────────────────────────');
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('❌ Some password security tests FAILED.');
  process.exit(1);
} else {
  console.log('✅ All password security tests PASSED.');
}
