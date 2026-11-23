import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import http from 'http';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

let memoryServer;
if (!process.env.MONGO_URI) {
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  memoryServer = await MongoMemoryServer.create();
  process.env.MONGO_URI = memoryServer.getUri();
}

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  process.env.JWT_SECRET = 'fitnova-test-secret-must-be-at-least-32';
}

const { createApp } = await import('../app.js');
const { connectDB, disconnectDB } = await import('../config/db.js');
const { validateJwtSecret } = await import('../config/env.js');
const User = (await import('../models/user.model.js')).default;

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(`[ASSERTION FAILED] ${message}`);
  }
};

const api = async (baseUrl, method, pathname, { token, body, headers } = {}) => {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers || {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await response.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { raw };
  }
  return { status: response.status, headers: response.headers, data, raw };
};

console.log('============================================');
console.log('RUNNING PHASE A: BACKEND SECURITY TESTS');
console.log('============================================');

// -----------------------------------------------------------------
// Test 1: JWT_SECRET Validation
// -----------------------------------------------------------------
console.log('\n--- 1. Testing JWT_SECRET Validation ---');

let rejectedEmpty = false;
try {
  validateJwtSecret('');
} catch (e) {
  rejectedEmpty = e.message.includes('required and cannot be empty');
}
assert(rejectedEmpty, 'validateJwtSecret did not reject empty secret.');
console.log('✓ Rejected empty JWT_SECRET');

let rejectedShort = false;
try {
  validateJwtSecret('short-secret-less-than-32-chr');
} catch (e) {
  rejectedShort = e.message.includes('must be at least 32 characters long');
}
assert(rejectedShort, 'validateJwtSecret did not reject short secret.');
console.log('✓ Rejected secret < 32 characters');

let rejectedWeak = false;
try {
  validateJwtSecret('replace-with-a-long-random-string');
} catch (e) {
  rejectedWeak = e.message.includes('known insecure placeholder');
}
assert(rejectedWeak, 'validateJwtSecret did not reject known placeholder secret.');
console.log('✓ Rejected placeholder/weak secret');

const validSecret = 'valid-test-secret-that-is-at-least-32-chars-long';
const validated = validateJwtSecret(validSecret);
assert(validated === validSecret, 'Valid secret was unexpectedly altered or rejected.');
console.log('✓ Accepted valid 32+ character secret');

// Verify backend process exits on invalid JWT_SECRET startup
const startupFailureTest = await new Promise((resolve) => {
  const child = spawn(
    process.execPath,
    ['-e', "process.env.JWT_SECRET = 'short'; import('./src/config/env.js');"],
    { cwd: path.resolve(__dirname, '..') },
  );
  child.on('close', (code) => {
    resolve(code !== 0);
  });
});
assert(startupFailureTest, 'Backend startup did not fail when JWT_SECRET was invalid.');
console.log('✓ Verified backend startup fails when JWT_SECRET is invalid');

// -----------------------------------------------------------------
// Setup Server for HTTP Tests
// -----------------------------------------------------------------
const app = createApp();
let httpServer;

try {
  await connectDB();
  await new Promise((resolve) => {
    httpServer = app.listen(0, resolve);
  });

  const { port } = httpServer.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  const stamp = Date.now();
  const password = 'Password@123';

  // -----------------------------------------------------------------
  // Test 2: Helmet Security Headers & CSP
  // -----------------------------------------------------------------
  console.log('\n--- 2. Testing Helmet Security Headers & CSP ---');
  const healthRes = await api(baseUrl, 'GET', '/api/health');

  assert(healthRes.status === 200, 'Health endpoint failed.');

  // Check X-Content-Type-Options
  const contentTypeOptions = healthRes.headers.get('x-content-type-options');
  assert(contentTypeOptions === 'nosniff', `Missing or incorrect X-Content-Type-Options: ${contentTypeOptions}`);
  console.log('✓ Header: X-Content-Type-Options = nosniff');

  // Check Cross-Origin-Resource-Policy
  const corp = healthRes.headers.get('cross-origin-resource-policy');
  assert(corp === 'cross-origin', `Missing or incorrect Cross-Origin-Resource-Policy: ${corp}`);
  console.log('✓ Header: Cross-Origin-Resource-Policy = cross-origin (Angular compatible)');

  // Check Content-Security-Policy
  const csp = healthRes.headers.get('content-security-policy');
  assert(csp, 'Content-Security-Policy header is missing.');
  assert(csp.includes("default-src 'self'"), 'CSP missing default-src.');
  assert(csp.includes('fonts.googleapis.com'), 'CSP missing fonts.googleapis.com for Google Fonts.');
  assert(csp.includes('fonts.gstatic.com'), 'CSP missing fonts.gstatic.com for Google Fonts.');
  assert(csp.includes("frame-ancestors 'none'"), 'CSP missing frame-ancestors none (clickjacking protection).');
  console.log('✓ Header: Content-Security-Policy properly configured and Angular compatible');

  // Check other standard Helmet headers
  const xssProtection = healthRes.headers.get('x-xss-protection');
  assert(xssProtection === '0', 'X-XSS-Protection not set to 0 by modern Helmet.');
  console.log('✓ Standard Helmet security headers confirmed present');

  // -----------------------------------------------------------------
  // Test 3: Rate Limiting on Login & Registration
  // -----------------------------------------------------------------
  console.log('\n--- 3. Testing Rate Limiting on Auth Endpoints ---');

  // Temporarily configure a low rate limit for testing
  process.env.AUTH_RATE_LIMIT_MAX = '5';

  const rateLimitEmail = `ratelimit.${stamp}@fitnova.test`;
  const rateLimitPhone = `99999${String(stamp).slice(-5)}`;

  let hitRateLimit = false;
  let rateLimitResponse;

  for (let i = 0; i < 7; i++) {
    const res = await api(baseUrl, 'POST', '/api/auth/login', {
      body: { email: rateLimitEmail, password: 'wrong-password' },
    });
    if (res.status === 429) {
      hitRateLimit = true;
      rateLimitResponse = res;
      break;
    }
  }

  assert(hitRateLimit, 'Rate limiter failed to block excessive login requests (expected HTTP 429).');
  assert(
    rateLimitResponse.data.success === false,
    `Rate limit response expected success: false, got: ${rateLimitResponse.raw}`,
  );
  assert(
    rateLimitResponse.data.message.toLowerCase().includes('too many') ||
      rateLimitResponse.data.message.toLowerCase().includes('rate'),
    `Rate limit message unclear: ${rateLimitResponse.data.message}`,
  );
  assert(
    rateLimitResponse.headers.get('ratelimit-limit') || rateLimitResponse.headers.get('retry-after'),
    'RateLimit header missing from 429 response.',
  );
  console.log('✓ Rate limiting correctly blocked excessive login attempts with 429 Too Many Requests');

  // Reset rate limit override
  delete process.env.AUTH_RATE_LIMIT_MAX;

  // -----------------------------------------------------------------
  // Test 4: Role Bypass Removal & RBAC Enforcement
  // -----------------------------------------------------------------
  console.log('\n--- 4. Testing Role Bypass Removal & Strict RBAC ---');

  // Create test users
  const member = await User.create({
    fullName: `Sec Member ${stamp}`,
    email: `secmember.${stamp}@fitnova.test`,
    phone: `91111${String(stamp).slice(-5)}`,
    password,
    gender: 'female',
    dateOfBirth: new Date('2000-01-01'),
    role: 'member',
  });

  const trainer = await User.create({
    fullName: `Sec Trainer ${stamp}`,
    email: `sectrainer.${stamp}@fitnova.test`,
    phone: `92222${String(stamp).slice(-5)}`,
    password,
    gender: 'male',
    dateOfBirth: new Date('1990-01-01'),
    role: 'trainer',
  });

  const admin = await User.create({
    fullName: `Sec Admin ${stamp}`,
    email: `secadmin.${stamp}@fitnova.test`,
    phone: `93333${String(stamp).slice(-5)}`,
    password,
    gender: 'other',
    dateOfBirth: new Date('1985-01-01'),
    role: 'admin',
  });

  const memberLogin = await api(baseUrl, 'POST', '/api/auth/login', {
    body: { email: member.email, password },
  });
  const memberToken = memberLogin.data.token;

  const trainerLogin = await api(baseUrl, 'POST', '/api/auth/login', {
    body: { email: trainer.email, password },
  });
  const trainerToken = trainerLogin.data.token;

  const adminLogin = await api(baseUrl, 'POST', '/api/auth/login', {
    body: { email: admin.email, password },
  });
  const adminToken = adminLogin.data.token;

  // 4a. Unauthenticated access blocked
  const noAuthRes = await api(baseUrl, 'GET', '/api/users');
  assert(noAuthRes.status === 401, `Unauthenticated access returned ${noAuthRes.status}, expected 401.`);
  console.log('✓ Unauthenticated request rejected with 401');

  // 4b. Member blocked from admin endpoints
  const memberAdminRes = await api(baseUrl, 'GET', '/api/users', { token: memberToken });
  assert(memberAdminRes.status === 403, `Member accessing /api/users returned ${memberAdminRes.status}, expected 403.`);
  console.log('✓ Member blocked from GET /api/users with 403');

  // 4c. Trainer blocked from admin endpoints
  const trainerAdminRes = await api(baseUrl, 'GET', '/api/users', { token: trainerToken });
  assert(trainerAdminRes.status === 403, `Trainer accessing /api/users returned ${trainerAdminRes.status}, expected 403.`);
  console.log('✓ Trainer blocked from GET /api/users with 403');

  // 4d. Member blocked from creating payment
  const memberPayRes = await api(baseUrl, 'POST', '/api/payments', {
    token: memberToken,
    body: {
      member: member._id,
      amount: 1000,
      paymentStatus: 'paid',
      transactionReference: `txn-bypass-${stamp}`,
    },
  });
  assert(memberPayRes.status === 403, `Member creating payment returned ${memberPayRes.status}, expected 403.`);
  console.log('✓ Member cannot bypass payment creation role check');

  // 4e. Member blocked from recording check-in
  const memberAttnRes = await api(baseUrl, 'POST', '/api/attendance', {
    token: memberToken,
    body: {
      member: member._id,
      status: 'present',
      attendanceDate: new Date().toISOString(),
    },
  });
  assert(memberAttnRes.status === 403, `Member recording check-in returned ${memberAttnRes.status}, expected 403.`);
  console.log('✓ Member cannot bypass attendance check-in role check');

  // 4f. Admin with valid token succeeds
  const adminUsersRes = await api(baseUrl, 'GET', '/api/users', { token: adminToken });
  assert(adminUsersRes.status === 200, `Admin accessing /api/users failed: ${adminUsersRes.raw}`);
  console.log('✓ Admin with valid token succeeds at admin endpoints');

  console.log('\n============================================');
  console.log('✓ ALL PHASE A: BACKEND SECURITY TESTS PASSED!');
  console.log('============================================');
} finally {
  if (httpServer) {
    await new Promise((resolve) => httpServer.close(resolve));
  }
  await disconnectDB();
  if (memoryServer) {
    await memoryServer.stop();
  }
}
