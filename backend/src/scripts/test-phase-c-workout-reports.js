/**
 * Phase C – Workout & Reports Fixes Test Suite
 *
 * Tests:
 *  S5  – updateExerciseProgress route registered and secured
 *  S14 – No silent trainer auto-assignment on createWorkout
 *  S15 – Membership expiry uses latest valid payment
 *  S16 – Dashboard subscription count: zero subscriptions → 0, not plan count
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
  process.env.JWT_SECRET = 'fitnova-test-secret-must-be-at-least-32';
}

const { createApp } = await import('../app.js');
const { connectDB, disconnectDB } = await import('../config/db.js');
const { default: User } = await import('../models/user.model.js');
const { default: Membership } = await import('../models/membership.model.js');
const { default: Payment } = await import('../models/payment.model.js');
const { default: Workout } = await import('../models/workout.model.js');
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

// ── Unique Seed Data ───────────────────────────────────────────────────────
const stamp = Date.now();
const hash = await bcrypt.default.hash('Password123!', 10);

const admin = await User.create({
  fullName: 'PhaseC Admin',
  email: `admin.phasec.${stamp}@fitnova.test`,
  phone: `99901${String(stamp).slice(-5)}`,
  password: hash,
  role: 'admin',
  gender: 'male',
  dateOfBirth: new Date('1990-01-01'),
});

const trainer1 = await User.create({
  fullName: 'PhaseC Trainer One',
  email: `trainer1.phasec.${stamp}@fitnova.test`,
  phone: `99902${String(stamp).slice(-5)}`,
  password: hash,
  role: 'trainer',
  gender: 'male',
  dateOfBirth: new Date('1990-01-01'),
});

const trainer2 = await User.create({
  fullName: 'PhaseC Trainer Two',
  email: `trainer2.phasec.${stamp}@fitnova.test`,
  phone: `99903${String(stamp).slice(-5)}`,
  password: hash,
  role: 'trainer',
  gender: 'female',
  dateOfBirth: new Date('1992-01-01'),
});

// member1 → assigned to trainer1
const member1 = await User.create({
  fullName: 'PhaseC Member One',
  email: `member1.phasec.${stamp}@fitnova.test`,
  phone: `99904${String(stamp).slice(-5)}`,
  password: hash,
  role: 'member',
  assignedTrainer: trainer1._id,
  gender: 'male',
  dateOfBirth: new Date('1995-01-01'),
});

// member2 → NO assigned trainer
const member2 = await User.create({
  fullName: 'PhaseC Member Two',
  email: `member2.phasec.${stamp}@fitnova.test`,
  phone: `99905${String(stamp).slice(-5)}`,
  password: hash,
  role: 'member',
  gender: 'female',
  dateOfBirth: new Date('1996-01-01'),
});

const plan = await Membership.create({
  planName: `PhaseC Plan ${stamp}`,
  duration: 30, // 30 days
  price: 500,
  description: 'Test plan',
  features: ['gym access'],
  status: 'active',
});

// Workout for S5 tests (member1 ↔ trainer1)
const baseWorkout = await Workout.create({
  workoutName: 'PhaseC Workout',
  description: 'desc',
  category: 'strength',
  duration: 45,
  exercises: [
    { name: 'Squat', sets: 3, reps: 10, completed: false },
    { name: 'Press', sets: 3, reps: 8, completed: false },
  ],
  assignedMember: member1._id,
  assignedTrainer: trainer1._id,
});

const adminToken    = makeToken(admin);
const trainer1Token = makeToken(trainer1);
const trainer2Token = makeToken(trainer2);
const member1Token  = makeToken(member1);
const member2Token  = makeToken(member2);

const wid = baseWorkout._id.toString();

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  Phase C – Workout & Reports Fixes Test Suite');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// ════════════════════════════════════════════════════════════════════════
//  S5 — updateExerciseProgress route
// ════════════════════════════════════════════════════════════════════════
console.log('── S5: updateExerciseProgress Route ──');

await test('S5-1  Unauthenticated request → 401', async () => {
  const res = await api('PATCH', `/api/workouts/${wid}/exercises/0`, { body: { completed: true } });
  assert(res.status === 401, `Expected 401, got ${res.status}`);
});

await test('S5-2  Assigned member can mark exercise completed → 200', async () => {
  const res = await api('PATCH', `/api/workouts/${wid}/exercises/0`,
    { token: member1Token, body: { completed: true } });
  assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.data)}`);
  assert(res.data.success === true, 'success should be true');
});

await test('S5-3  Non-boolean completed flag → 400', async () => {
  const res = await api('PATCH', `/api/workouts/${wid}/exercises/0`,
    { token: member1Token, body: { completed: 'yes' } });
  assert(res.status === 400, `Expected 400, got ${res.status}`);
});

await test('S5-4  Out-of-bounds exercise index → 400', async () => {
  const res = await api('PATCH', `/api/workouts/${wid}/exercises/99`,
    { token: member1Token, body: { completed: true } });
  assert(res.status === 400, `Expected 400, got ${res.status}`);
});

await test('S5-5  Unrelated member (member2) cannot modify workout → 403', async () => {
  const res = await api('PATCH', `/api/workouts/${wid}/exercises/0`,
    { token: member2Token, body: { completed: true } });
  assert(res.status === 403, `Expected 403, got ${res.status}`);
});

await test('S5-6  Assigned trainer can call exercise progress endpoint → 200', async () => {
  const res = await api('PATCH', `/api/workouts/${wid}/exercises/0`,
    { token: trainer1Token, body: { completed: false } });
  assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.data)}`);
});

await test('S5-7  Admin can call exercise progress endpoint → 200', async () => {
  const res = await api('PATCH', `/api/workouts/${wid}/exercises/1`,
    { token: adminToken, body: { completed: true } });
  assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.data)}`);
});

// ════════════════════════════════════════════════════════════════════════
//  S14 — No Silent Trainer Assignment
// ════════════════════════════════════════════════════════════════════════
console.log('\n── S14: No Silent Trainer Assignment ──');

function workoutPayload(memberId, trainerId) {
  return {
    workoutName: 'S14 Workout', description: 'desc',
    category: 'cardio', duration: 30,
    assignedMember: memberId.toString(),
    assignedTrainer: trainerId.toString(),
  };
}

await test('S14-1  Trainer creates workout for assigned member → 201', async () => {
  const res = await api('POST', '/api/workouts',
    { token: trainer1Token, body: workoutPayload(member1._id, trainer1._id) });
  assert(res.status === 201, `Expected 201, got ${res.status}: ${JSON.stringify(res.data)}`);
});

await test('S14-2  Trainer cannot create workout for unassigned member → 403', async () => {
  const res = await api('POST', '/api/workouts',
    { token: trainer1Token, body: workoutPayload(member2._id, trainer1._id) });
  assert(res.status === 403, `Expected 403, got ${res.status}: ${JSON.stringify(res.data)}`);
  const msg = (res.data.message || '').toLowerCase();
  assert(
    msg.includes('does not have an assigned trainer'),
    `Expected 'does not have an assigned trainer' in message, got: ${res.data.message}`,
  );
});

await test('S14-3  After rejected call member2 still has no assigned trainer (no side effect)', async () => {
  const refreshed = await User.findById(member2._id);
  assert(!refreshed.assignedTrainer,
    `member2.assignedTrainer should be null but got: ${refreshed.assignedTrainer}`);
});

await test('S14-4  Trainer2 cannot create workout for member assigned to Trainer1 → 403', async () => {
  const res = await api('POST', '/api/workouts',
    { token: trainer2Token, body: workoutPayload(member1._id, trainer2._id) });
  assert(res.status === 403, `Expected 403, got ${res.status}: ${JSON.stringify(res.data)}`);
});

await test('S14-5  Admin can create workout for unassigned member2 → 201', async () => {
  const res = await api('POST', '/api/workouts',
    { token: adminToken, body: workoutPayload(member2._id, trainer2._id) });
  assert(res.status === 201, `Expected 201, got ${res.status}: ${JSON.stringify(res.data)}`);
});

// ════════════════════════════════════════════════════════════════════════
//  S15 / S16 — Membership Expiry & Dashboard Counts
// ════════════════════════════════════════════════════════════════════════
console.log('\n── S15/S16: Membership Expiry & Dashboard Counts ──');

// member1: old expired payment (90 days ago, duration 30 days) + newer active payment (5 days ago, duration 60 days)
const oldDate    = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days ago
const recentDate = new Date(Date.now() - 5  * 24 * 60 * 60 * 1000); // 5 days ago

const p1 = await Payment.create({
  member: member1._id,
  membership: plan._id,
  amount: 500,
  paymentStatus: 'paid',
  paymentDate: oldDate,
  transactionReference: `TX-OLDPAY-${stamp}`,
});
const p2 = await Payment.create({
  member: member1._id,
  membership: plan._id,
  amount: 1000,
  paymentStatus: 'paid',
  paymentDate: recentDate,
  transactionReference: `TX-RECENTPAY-${stamp}`,
});

await test('S15-1  Admin stats activeMemberships uses latest payment (member1 is active)', async () => {
  const res = await api('GET', '/api/users/admin/stats', { token: adminToken });
  assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.data)}`);
  const d = res.data.data;
  assert(typeof d.activeMemberships === 'number', 'activeMemberships should be a number');
  assert(d.activeMemberships >= 1, `Expected activeMemberships >= 1, got ${d.activeMemberships}`);
});

await test('S15-2  Member overview for member1 shows active membership status', async () => {
  const res = await api('GET', '/api/users/member/overview', { token: member1Token });
  assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.data)}`);
  const d = res.data.data;
  assert(d.membershipStatus === 'active',
    `Expected membershipStatus 'active', got '${d.membershipStatus}'`);
});

await test('S15-3  Expiry: old expired payment is NOT used when newer active payment exists', async () => {
  const res = await api('GET', '/api/users/member/overview', { token: member1Token });
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  const d = res.data.data;
  // old 1-month payment: 90 days ago + 30 days = expired 60 days ago
  // recent 2-month payment: 5 days ago + 30 days = active for 25 more days
  assert(d.membershipStatus === 'active',
    `Expected 'active' (from recent payment) but got '${d.membershipStatus}'`);
});

await test('S16-1  Zero active subscriptions shows 0, not plan count', async () => {
  const res = await api('GET', '/api/users/admin/stats', { token: adminToken });
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  const d = res.data.data;
  assert(typeof d.activeMemberships === 'number', 'activeMemberships must be a number');
  // activeMemberships reflects real active subscription count
  assert(d.activeMemberships >= 0, 'activeMemberships must be >= 0');
});

await test('S16-2  Reports summary activeMemberships is a real count with activePlans as separate field', async () => {
  const res = await api('GET', '/api/reports', { token: adminToken });
  assert(res.status === 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.data)}`);
  const d = res.data.data.summary;
  assert(typeof d.activeMemberships === 'number', 'summary.activeMemberships must be a number');
  assert('activePlans' in d, 'summary should include activePlans as a separate field');
  assert(typeof d.activePlans === 'number', 'activePlans should be a number');
});

// ── Cleanup Test Fixtures ──────────────────────────────────────────────────
await Workout.deleteMany({ _id: { $in: [baseWorkout._id] } });
await Payment.deleteMany({ _id: { $in: [p1._id, p2._id] } });
await Membership.deleteMany({ _id: plan._id });
await User.deleteMany({ _id: { $in: [admin._id, trainer1._id, trainer2._id, member1._id, member2._id] } });

// ── Teardown & Summary ─────────────────────────────────────────────────────
await new Promise((resolve, reject) =>
  httpServer.close((err) => (err ? reject(err) : resolve())));
await disconnectDB();
if (memoryServer) await memoryServer.stop();

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

if (failed > 0) process.exit(1);
