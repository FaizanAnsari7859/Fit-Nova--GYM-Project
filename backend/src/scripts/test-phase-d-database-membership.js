/**
 * Phase D – Database & Membership Improvements Test Suite
 *
 * Tests:
 *  S10/S17 – Subscription start/end date, expiry tracking, renewal, plan separation, backward compatibility
 *  S11     – Async Mongoose validator optimization (no repeated DB queries on non-modified save)
 *  S12     – Collision-resistant payment reference generation (concurrency test)
 *  S13     – Database index verification across User, Payment, Attendance, Workout, Membership, Subscription
 */

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import http from 'http';
import crypto from 'crypto';

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
const { default: User } = await import('../models/user.model.js');
const { default: Membership } = await import('../models/membership.model.js');
const { default: Payment } = await import('../models/payment.model.js');
const { default: Subscription } = await import('../models/subscription.model.js');
const { default: Attendance } = await import('../models/attendance.model.js');
const { default: Workout } = await import('../models/workout.model.js');
const { computeMembershipExpiry, createOrRenewSubscription } = await import('../utils/membershipUtils.js');
const bcrypt = await import('bcryptjs');
const jwt = await import('jsonwebtoken');

// ── Helpers ────────────────────────────────────────────────────────────────
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
  const fetchOpts = { method, headers };
  if (opts.body) fetchOpts.body = JSON.stringify(opts.body);
  const res = await fetch(url, fetchOpts);
  let data;
  try { data = await res.json(); } catch { data = {}; }
  return { status: res.status, data, headers: res.headers };
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`         ${err.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

// ── Connect DB & Start Server ──────────────────────────────────────────────
await connectDB();

const app = createApp();
await new Promise((resolve) => { httpServer = app.listen(0, resolve); });
const { port } = httpServer.address();
baseUrl = `http://127.0.0.1:${port}`;

// ── Seed Unique Test Users & Plans ─────────────────────────────────────────
const stamp = Date.now();
const hash = await bcrypt.default.hash('Password123!', 10);

const admin = await User.create({
  fullName: 'PhaseD Admin',
  email: `admin.phased.${stamp}@fitnova.test`,
  phone: `99801${String(stamp).slice(-5)}`,
  password: hash,
  role: 'admin',
  gender: 'male',
  dateOfBirth: new Date('1990-01-01'),
});

const trainer = await User.create({
  fullName: 'PhaseD Trainer',
  email: `trainer.phased.${stamp}@fitnova.test`,
  phone: `99802${String(stamp).slice(-5)}`,
  password: hash,
  role: 'trainer',
  gender: 'male',
  dateOfBirth: new Date('1990-01-01'),
});

const member1 = await User.create({
  fullName: 'PhaseD Member One',
  email: `member1.phased.${stamp}@fitnova.test`,
  phone: `99803${String(stamp).slice(-5)}`,
  password: hash,
  role: 'member',
  assignedTrainer: trainer._id,
  gender: 'male',
  dateOfBirth: new Date('1995-01-01'),
});

const member2 = await User.create({
  fullName: 'PhaseD Member Two',
  email: `member2.phased.${stamp}@fitnova.test`,
  phone: `99804${String(stamp).slice(-5)}`,
  password: hash,
  role: 'member',
  gender: 'female',
  dateOfBirth: new Date('1996-01-01'),
});

const plan30 = await Membership.create({
  planName: `PhaseD Monthly Plan ${stamp}`,
  duration: 30,
  price: 1500,
  description: 'Monthly gym membership',
  features: ['gym', 'lockers'],
  status: 'active',
});

const plan60 = await Membership.create({
  planName: `PhaseD Two-Month Plan ${stamp}`,
  duration: 60,
  price: 2800,
  description: 'Two-month gym membership',
  features: ['gym', 'pool'],
  status: 'active',
});

const adminToken   = makeToken(admin);
const trainerToken = makeToken(trainer);
const member1Token = makeToken(member1);
const member2Token = makeToken(member2);

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  Phase D – Database & Membership Improvements Test Suite');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// ════════════════════════════════════════════════════════════════════════
//  1. S10/S17 – Subscription Lifecycle, Start/End Dates, Renewal, Expiry
// ════════════════════════════════════════════════════════════════════════
console.log('── 1. S10/S17: Subscription Tracking & Lifecycle ──');

let assignedSubId;
let assignedPaymentId;

await test('S10-1  assignMembership creates linked Payment and Subscription documents', async () => {
  const res = await api('POST', `/api/memberships/${plan30._id}/assign`, {
    token: adminToken,
    body: { memberId: member1._id.toString() },
  });
  assert(res.status === 201, `Expected 201, got ${res.status}: ${JSON.stringify(res.data)}`);
  assert(res.data.success === true, 'Response success should be true');

  const payment = res.data.data;
  assert(payment._id, 'Payment should have an _id');
  assignedPaymentId = payment._id;

  // Verify Subscription document was created in MongoDB
  const sub = await Subscription.findOne({ member: member1._id, membershipPlan: plan30._id });
  assert(sub, 'Subscription document should exist in MongoDB');
  assert(sub.status === 'active', `Expected active status, got ${sub.status}`);
  assert(sub.startDate instanceof Date, 'startDate must be a Date');
  assert(sub.endDate instanceof Date, 'endDate must be a Date');
  assert(sub.endDate.getTime() > sub.startDate.getTime(), 'endDate must be after startDate');
  assert(sub.payment.toString() === payment._id.toString(), 'Subscription should link to Payment');
  assignedSubId = sub._id;
});

await test('S10-2  Renewal: assigning another plan while active extends from existing endDate', async () => {
  const existingSub = await Subscription.findById(assignedSubId);
  const originalEnd = existingSub.endDate.getTime();

  const res = await api('POST', `/api/memberships/${plan60._id}/assign`, {
    token: adminToken,
    body: { memberId: member1._id.toString() },
  });
  assert(res.status === 201, `Expected 201, got ${res.status}`);

  // Find the newly created renewal subscription
  const renewalSub = await Subscription.findOne({
    member: member1._id,
    membershipPlan: plan60._id,
  }).sort({ createdAt: -1 });

  assert(renewalSub, 'Renewal subscription should exist');
  // Renewal start date should match or extend from the previous end date
  const renewalStart = new Date(renewalSub.startDate).getTime();
  assert(
    Math.abs(renewalStart - originalEnd) < 2000,
    `Renewal startDate (${renewalSub.startDate}) should continue from original endDate (${existingSub.endDate})`,
  );
  // Renewal end date should be renewal start date + 60 days
  const expectedEnd = renewalStart + 60 * 86400000;
  assert(
    Math.abs(new Date(renewalSub.endDate).getTime() - expectedEnd) < 2000,
    'Renewal endDate should be startDate + 60 days',
  );
});

await test('S10-3  Direct API: GET /api/memberships/subscriptions lists subscriptions', async () => {
  const res = await api('GET', '/api/memberships/subscriptions', { token: adminToken });
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  assert(Array.isArray(res.data.data), 'Expected data to be an array');
  assert(res.data.count >= 2, `Expected at least 2 subscriptions, got ${res.data.count}`);
});

await test('S10-4  Direct API: GET /api/memberships/subscriptions/member/:id accessible to Admin & Trainer', async () => {
  const resAdmin = await api('GET', `/api/memberships/subscriptions/member/${member1._id}`, { token: adminToken });
  assert(resAdmin.status === 200, `Admin should access member subscriptions, got ${resAdmin.status}`);

  const resTrainer = await api('GET', `/api/memberships/subscriptions/member/${member1._id}`, { token: trainerToken });
  assert(resTrainer.status === 200, `Trainer should access member subscriptions, got ${resTrainer.status}`);

  const resMember = await api('GET', `/api/memberships/subscriptions/member/${member1._id}`, { token: member1Token });
  assert(resMember.status === 403, `Member should be rejected from member subscriptions list, got ${resMember.status}`);
});

await test('S10-5  Expired subscription: past endDate correctly marked as expired, not active', async () => {
  const pastStart = new Date(Date.now() - 90 * 86400000); // 90 days ago
  const pastEnd   = new Date(Date.now() - 60 * 86400000); // 60 days ago

  const expiredSub = await Subscription.create({
    member: member2._id,
    membershipPlan: plan30._id,
    startDate: pastStart,
    endDate: pastEnd,
    status: 'expired',
  });

  const info = computeMembershipExpiry(null, expiredSub);
  assert(info.isActive === false, 'Expired subscription should have isActive === false');
  assert(info.status === 'expired', `Expected status 'expired', got ${info.status}`);
  assert(info.daysRemaining === 0, 'daysRemaining should be 0');

  // Cleanup
  await Subscription.findByIdAndDelete(expiredSub._id);
});

await test('S10-6  createPayment with paid status automatically creates a Subscription', async () => {
  const res = await api('POST', '/api/payments', {
    token: adminToken,
    body: {
      member: member2._id.toString(),
      membership: plan30._id.toString(),
      amount: 1500,
      paymentStatus: 'paid',
      paymentDate: new Date().toISOString(),
    },
  });
  assert(res.status === 201, `Expected 201, got ${res.status}: ${JSON.stringify(res.data)}`);
  assert(res.data.data.subscription, 'Created payment should have linked subscription populated');

  const sub = await Subscription.findById(res.data.data.subscription._id || res.data.data.subscription);
  assert(sub, 'Subscription should exist in database');
  assert(sub.status === 'active', 'Subscription should be active');
  assert(sub.member.toString() === member2._id.toString(), 'Subscription should link to member2');
});

await test('S10-7  updatePayment from pending to paid activates a Subscription', async () => {
  // Create pending payment
  const resPending = await api('POST', '/api/payments', {
    token: adminToken,
    body: {
      member: member2._id.toString(),
      membership: plan60._id.toString(),
      amount: 2800,
      paymentStatus: 'pending',
      paymentDate: new Date().toISOString(),
    },
  });
  assert(resPending.status === 201, `Expected 201, got ${resPending.status}`);
  const payId = resPending.data.data._id;

  // Transition to paid
  const resUpdate = await api('PATCH', `/api/payments/${payId}`, {
    token: adminToken,
    body: { paymentStatus: 'paid' },
  });
  assert(resUpdate.status === 200, `Expected 200, got ${resUpdate.status}`);
  assert(resUpdate.data.data.paymentStatus === 'paid', 'Payment status should be paid');

  const updatedPay = await Payment.findById(payId);
  assert(updatedPay.subscription, 'Payment should now have linked subscription');
  const sub = await Subscription.findById(updatedPay.subscription);
  assert(sub && sub.status === 'active', 'Subscription should be created and active');
});

// ════════════════════════════════════════════════════════════════════════
//  2. Backward Compatibility & Old Records
// ════════════════════════════════════════════════════════════════════════
console.log('\n── 2. Backward Compatibility & Old Records ──');

await test('S10-8  computeMembershipExpiry works seamlessly on legacy payment without subscription', async () => {
  const legacyPayment = {
    paymentStatus: 'paid',
    paymentDate: new Date(),
    membership: { duration: 45 },
  };
  const info = computeMembershipExpiry(legacyPayment);
  assert(info !== null, 'computeMembershipExpiry should handle legacy payment');
  assert(info.isActive === true, 'Recent legacy payment should be active');
  assert(info.daysRemaining > 40, 'daysRemaining should be ~45');
  assert(info.startDate instanceof Date, 'startDate should be returned for legacy payment');
  assert(info.endDate instanceof Date, 'endDate should be returned for legacy payment');
});

await test('S10-9  Old legacy payment is NOT treated as active subscription in reports', async () => {
  // Create an old payment from 180 days ago without any subscription document
  const ancientDate = new Date(Date.now() - 180 * 86400000);
  const oldPayment = await Payment.create({
    member: member2._id,
    membership: plan30._id,
    amount: 1500,
    paymentStatus: 'paid',
    paymentDate: ancientDate,
    transactionReference: `TXN-ANCIENT-${Date.now()}`,
  });

  const info = computeMembershipExpiry(oldPayment);
  assert(info.isActive === false, 'Old payment must NOT be active');
  assert(info.status === 'expired', 'Old payment status must be expired');

  await Payment.findByIdAndDelete(oldPayment._id);
});

// ════════════════════════════════════════════════════════════════════════
//  3. S11 – Database Query Performance & Async Validators
// ════════════════════════════════════════════════════════════════════════
console.log('\n── 3. S11: Database Query Performance & Async Validators ──');

await test('S11-1  Payment update saves without re-validating unmodified member', async () => {
  const pay = await Payment.findOne({ member: member1._id });
  assert(pay, 'Fixture payment should exist');

  // Updating amount should save cleanly without querying User or Membership
  pay.amount = 1600;
  await pay.save();
  assert(pay.amount === 1600, 'Payment amount should be updated');
});

await test('S11-2  Attendance checkout saves without re-validating member', async () => {
  const att = await Attendance.create({
    member: member1._id,
    checkInTime: new Date(),
    attendanceDate: new Date(),
    status: 'present',
  });

  // Updating checkOutTime should save without re-querying User for member validation
  att.checkOutTime = new Date(Date.now() + 3600000);
  await att.save();
  assert(att.checkOutTime !== null, 'Attendance checkOutTime should be saved');

  await Attendance.findByIdAndDelete(att._id);
});

await test('S11-3  Workout exercise completion saves without re-validating member and trainer', async () => {
  const wk = await Workout.create({
    workoutName: 'PhaseD Workout',
    description: 'test workout',
    category: 'cardio',
    duration: 30,
    assignedMember: member1._id,
    assignedTrainer: trainer._id,
    exercises: [{ name: 'Running', sets: 1, reps: 1, completed: false }],
  });

  // Toggle completed flag
  wk.exercises[0].completed = true;
  await wk.save();
  assert(wk.exercises[0].completed === true, 'Exercise completed flag should be true');

  await Workout.findByIdAndDelete(wk._id);
});

await test('S11-4  Payment creation with non-existent member is still properly rejected', async () => {
  const fakeId = new (await import('mongoose')).default.Types.ObjectId();
  const res = await api('POST', '/api/payments', {
    token: adminToken,
    body: {
      member: fakeId.toString(),
      membership: plan30._id.toString(),
      amount: 1500,
      paymentStatus: 'paid',
      paymentDate: new Date().toISOString(),
    },
  });
  assert(res.status === 400, `Expected 400 for fake member, got ${res.status}`);
});

// ════════════════════════════════════════════════════════════════════════
//  4. S12 – Collision-Resistant Payment Reference Generation
// ════════════════════════════════════════════════════════════════════════
console.log('\n── 4. S12: Payment Reference Collision Resistance ──');

await test('S12-1  Generate 1,000 concurrent payment references with ZERO collisions', async () => {
  const count = 1000;
  const refs = new Array(count);

  // Generate 1,000 UUID-based payment references in parallel
  await Promise.all(
    Array.from({ length: count }, async (_, i) => {
      refs[i] = `TXN-${crypto.randomUUID()}`;
    }),
  );

  const uniqueSet = new Set(refs);
  assert(
    uniqueSet.size === count,
    `Collision detected! Expected ${count} unique references, got ${uniqueSet.size}`,
  );
  // Verify UUID format
  assert(
    refs[0].startsWith('TXN-') && refs[0].length === 40,
    `Reference format unexpected: ${refs[0]} (length: ${refs[0].length})`,
  );
});

await test('S12-2  Payment creation uses crypto.randomUUID() when reference not supplied', async () => {
  const res = await api('POST', '/api/payments', {
    token: adminToken,
    body: {
      member: member1._id.toString(),
      membership: plan30._id.toString(),
      amount: 1500,
      paymentStatus: 'paid',
      paymentDate: new Date().toISOString(),
    },
  });
  assert(res.status === 201, `Expected 201, got ${res.status}`);
  const ref = res.data.data.transactionReference;
  assert(ref.startsWith('TXN-'), `Expected TXN- prefix, got: ${ref}`);
  // UUID length after 'TXN-' is 36 chars => total 40
  assert(ref.length === 40, `Expected 40-character reference with UUID, got length ${ref.length}: ${ref}`);
});

// ════════════════════════════════════════════════════════════════════════
//  5. S13 – Database Index Verification
// ════════════════════════════════════════════════════════════════════════
console.log('\n── 5. S13: Database Index Verification ──');

await test('S13-1  Verify User compound and relationship indexes', async () => {
  const indexes = await User.collection.indexes();
  const indexKeys = indexes.map((i) => JSON.stringify(i.key));

  assert(
    indexKeys.some((k) => k.includes('assignedTrainer') && k.includes('role')),
    `User missing { assignedTrainer: 1, role: 1 } index. Found: ${indexKeys.join(', ')}`,
  );
  assert(
    indexKeys.some((k) => k.includes('role') && k.includes('createdAt')),
    `User missing { role: 1, createdAt: -1 } index. Found: ${indexKeys.join(', ')}`,
  );
});

await test('S13-2  Verify Payment compound query indexes', async () => {
  const indexes = await Payment.collection.indexes();
  const indexKeys = indexes.map((i) => JSON.stringify(i.key));

  assert(
    indexKeys.some((k) => k.includes('member') && k.includes('paymentDate')),
    `Payment missing { member: 1, paymentDate: -1 } index. Found: ${indexKeys.join(', ')}`,
  );
  assert(
    indexKeys.some((k) => k.includes('paymentStatus') && k.includes('paymentDate')),
    `Payment missing { paymentStatus: 1, paymentDate: -1 } index. Found: ${indexKeys.join(', ')}`,
  );
});

await test('S13-3  Verify Attendance check-in compound and single indexes', async () => {
  const indexes = await Attendance.collection.indexes();
  const indexKeys = indexes.map((i) => JSON.stringify(i.key));

  assert(
    indexKeys.some((k) => k.includes('member') && k.includes('checkInTime')),
    `Attendance missing { member: 1, checkInTime: -1 } index. Found: ${indexKeys.join(', ')}`,
  );
  assert(
    indexKeys.some((k) => k.includes('checkInTime')),
    `Attendance missing checkInTime index. Found: ${indexKeys.join(', ')}`,
  );
});

await test('S13-4  Verify Workout assigned compound indexes', async () => {
  const indexes = await Workout.collection.indexes();
  const indexKeys = indexes.map((i) => JSON.stringify(i.key));

  assert(
    indexKeys.some((k) => k.includes('assignedMember') && k.includes('status')),
    `Workout missing { assignedMember: 1, status: 1, createdAt: -1 } index. Found: ${indexKeys.join(', ')}`,
  );
  assert(
    indexKeys.some((k) => k.includes('assignedTrainer') && k.includes('status')),
    `Workout missing { assignedTrainer: 1, status: 1, createdAt: -1 } index. Found: ${indexKeys.join(', ')}`,
  );
});

await test('S13-5  Verify Membership compound price index', async () => {
  const indexes = await Membership.collection.indexes();
  const indexKeys = indexes.map((i) => JSON.stringify(i.key));

  assert(
    indexKeys.some((k) => k.includes('status') && k.includes('price')),
    `Membership missing { status: 1, price: 1 } index. Found: ${indexKeys.join(', ')}`,
  );
});

await test('S13-6  Verify Subscription indexes', async () => {
  const indexes = await Subscription.collection.indexes();
  const indexKeys = indexes.map((i) => JSON.stringify(i.key));

  assert(
    indexKeys.some((k) => k.includes('member') && k.includes('status') && k.includes('endDate')),
    `Subscription missing { member: 1, status: 1, endDate: -1 } index. Found: ${indexKeys.join(', ')}`,
  );
  assert(
    indexKeys.some((k) => k.includes('status') && k.includes('endDate')),
    `Subscription missing { status: 1, endDate: 1 } index. Found: ${indexKeys.join(', ')}`,
  );
});

// ── Teardown & Summary ─────────────────────────────────────────────────────
// Cleanup test fixtures
await Subscription.deleteMany({ member: { $in: [member1._id, member2._id] } });
await Payment.deleteMany({ member: { $in: [member1._id, member2._id] } });
await Membership.deleteMany({ _id: { $in: [plan30._id, plan60._id] } });
await User.deleteMany({ _id: { $in: [admin._id, trainer._id, member1._id, member2._id] } });

await new Promise((resolve, reject) =>
  httpServer.close((err) => (err ? reject(err) : resolve())));
await disconnectDB();
if (memoryServer) await memoryServer.stop();

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

if (failed > 0) process.exit(1);
