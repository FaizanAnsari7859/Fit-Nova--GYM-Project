import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
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
const User = (await import('../models/user.model.js')).default;
const Membership = (await import('../models/membership.model.js')).default;
const Payment = (await import('../models/payment.model.js')).default;

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(`[ASSERTION FAILED] ${message}`);
  }
};

let server;
let baseUrl;

function request(urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, baseUrl);
    const reqOptions = {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        ...(options.headers || {}),
      },
    };

    const req = http.request(url, reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        let json;
        try {
          json = JSON.parse(data);
        } catch {
          json = data;
        }
        resolve({ status: res.statusCode, data: json });
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runTests() {
  await connectDB();
  const app = createApp();

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const { port } = server.address();
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  console.log('--- Setting up test fixtures for Trainer Assignments ---');

  // Clear existing test collections
  await Promise.all([
    User.deleteMany({ email: /@testassign\.fitnova\.com$/ }),
    Membership.deleteMany({ planName: /Test Assign/ }),
    Payment.deleteMany({ transactionReference: /TXN-ASSIGN-/ }),
  ]);

  // 1. Create Admin
  const admin = await User.create({
    fullName: 'Admin Assign',
    email: 'admin@testassign.fitnova.com',
    password: 'Password123!',
    phone: '9999400001',
    gender: 'male',
    dateOfBirth: new Date('1985-01-01'),
    role: 'admin',
  });

  // 2. Create Trainer A (with assigned members)
  const trainerA = await User.create({
    fullName: 'Trainer Alice',
    email: 'alice.trainer@testassign.fitnova.com',
    password: 'Password123!',
    phone: '9999400002',
    gender: 'female',
    dateOfBirth: new Date('1990-02-02'),
    role: 'trainer',
    specialization: 'HIIT & Weight Loss',
  });

  // 3. Create Trainer B (ZERO assigned members)
  const trainerB = await User.create({
    fullName: 'Trainer Bob',
    email: 'bob.trainer@testassign.fitnova.com',
    password: 'Password123!',
    phone: '9999400003',
    gender: 'male',
    dateOfBirth: new Date('1988-03-03'),
    role: 'trainer',
    specialization: 'Strength Training',
  });

  // 4. Create Member 1 (Assigned to Trainer A)
  const member1 = await User.create({
    fullName: 'Member Charlie',
    email: 'charlie@testassign.fitnova.com',
    password: 'Password123!',
    phone: '9999400004',
    gender: 'male',
    dateOfBirth: new Date('1995-04-04'),
    role: 'member',
    assignedTrainer: trainerA._id,
  });

  // 5. Create Member 2 (Assigned to Trainer A)
  const member2 = await User.create({
    fullName: 'Member Diana',
    email: 'diana@testassign.fitnova.com',
    password: 'Password123!',
    phone: '9999400005',
    gender: 'female',
    dateOfBirth: new Date('1997-05-05'),
    role: 'member',
    assignedTrainer: trainerA._id,
  });

  // 6. Create Member 3 (Unassigned - assignedTrainer is null)
  const member3 = await User.create({
    fullName: 'Member Evan',
    email: 'evan@testassign.fitnova.com',
    password: 'Password123!',
    phone: '9999400006',
    gender: 'male',
    dateOfBirth: new Date('1998-06-06'),
    role: 'member',
    assignedTrainer: null,
  });

  // 7. Create Member 4 (Invalid assignedTrainer - points to non-existent ID)
  const fakeId = new mongoose.Types.ObjectId();
  const member4 = await User.create({
    fullName: 'Member Fiona',
    email: 'fiona@testassign.fitnova.com',
    password: 'Password123!',
    phone: '9999400007',
    gender: 'female',
    dateOfBirth: new Date('1999-07-07'),
    role: 'member',
    assignedTrainer: fakeId,
  });

  // Create active Membership plan and payment for member1
  const plan = await Membership.create({
    planName: 'Test Assign Plan',
    duration: 30,
    price: 100,
    status: 'active',
  });

  await Payment.create({
    member: member1._id,
    membership: plan._id,
    amount: 100,
    paymentStatus: 'paid',
    transactionReference: `TXN-ASSIGN-${Date.now()}`,
    paymentDate: new Date(),
  });

  // Acquire auth tokens
  const adminLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@testassign.fitnova.com', password: 'Password123!' },
  });
  const adminToken = adminLogin.data.token;

  const trainerLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'alice.trainer@testassign.fitnova.com', password: 'Password123!' },
  });
  const trainerToken = trainerLogin.data.token;

  const memberLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'charlie@testassign.fitnova.com', password: 'Password123!' },
  });
  const memberToken = memberLogin.data.token;

  console.log('✓ Fixtures initialized and tokens acquired.');

  // Test 1: Admin can retrieve trainer-wise assignments
  console.log('Test 1: Admin can retrieve trainer-wise assignments');
  {
    const res = await request('/api/users/admin/trainer-assignments', { token: adminToken });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.success === true, 'Response success should be true');
    const d = res.data.data;
    assert(d.totalTrainers >= 2, `Should report at least 2 trainers, got ${d.totalTrainers}`);
    assert(d.totalAssignedMembers >= 2, `Should report at least 2 assigned members, got ${d.totalAssignedMembers}`);
    assert(d.totalUnassignedMembers >= 2, `Should report at least 2 unassigned members, got ${d.totalUnassignedMembers}`);
  }

  // Test 2: Alias endpoint /api/trainers/assignments also works for Admin
  console.log('Test 2: Alias endpoint /api/trainers/assignments works for Admin');
  {
    const res = await request('/api/trainers/assignments', { token: adminToken });
    assert(res.status === 200, `Expected 200 on alias, got ${res.status}`);
    assert(res.data.success === true, 'Alias response success should be true');
  }

  // Test 3: Correct assigned-member counts and member names under Trainer A
  console.log('Test 3: Correct assigned-member counts and names under Trainer A');
  {
    const res = await request('/api/users/admin/trainer-assignments', { token: adminToken });
    const trainers = res.data.data.trainers;
    const tA = trainers.find((t) => t._id.toString() === trainerA._id.toString());
    assert(tA, 'Trainer A should exist in assignments overview');
    assert(tA.assignedMembersCount === 2, `Trainer A should have 2 assigned members, got ${tA.assignedMembersCount}`);
    assert(Array.isArray(tA.assignedMembers), 'assignedMembers should be an array');
    assert(tA.assignedMembers.length === 2, 'assignedMembers array length should be 2');

    const names = tA.assignedMembers.map((m) => m.fullName);
    assert(names.includes('Member Charlie'), 'Member Charlie should be in Trainer A list');
    assert(names.includes('Member Diana'), 'Member Diana should be in Trainer A list');

    // Verify membershipStatus
    const charlie = tA.assignedMembers.find((m) => m.fullName === 'Member Charlie');
    assert(charlie.membershipStatus === 'active', 'Member Charlie should have active membership');
  }

  // Test 4: Trainer with zero assigned members (Trainer B) is handled correctly
  console.log('Test 4: Trainer with zero assigned members (Trainer B)');
  {
    const res = await request('/api/users/admin/trainer-assignments', { token: adminToken });
    const trainers = res.data.data.trainers;
    const tB = trainers.find((t) => t._id.toString() === trainerB._id.toString());
    assert(tB, 'Trainer B should exist in assignments overview');
    assert(tB.assignedMembersCount === 0, `Trainer B should have 0 assigned members, got ${tB.assignedMembersCount}`);
    assert(Array.isArray(tB.assignedMembers) && tB.assignedMembers.length === 0, 'assignedMembers should be empty array');
  }

  // Test 5: Unassigned members and invalid assignedTrainer references are categorized safely
  console.log('Test 5: Unassigned members and invalid assignedTrainer references');
  {
    const res = await request('/api/users/admin/trainer-assignments', { token: adminToken });
    const unassigned = res.data.data.unassignedMembers;
    assert(Array.isArray(unassigned), 'unassignedMembers should be an array');
    
    // Member 3 (null assignedTrainer)
    const m3 = unassigned.find((m) => m.fullName === 'Member Evan');
    assert(m3, 'Member Evan (null assignedTrainer) should be in unassigned list');

    // Member 4 (non-existent trainer ObjectId)
    const m4 = unassigned.find((m) => m.fullName === 'Member Fiona');
    assert(m4, 'Member Fiona (invalid assignedTrainer) should safely fall back to unassigned list');
  }

  // Test 6: Trainer access denied (403)
  console.log('Test 6: Trainer access denied (403)');
  {
    const res = await request('/api/users/admin/trainer-assignments', { token: trainerToken });
    assert(res.status === 403, `Trainer should be rejected with 403, got ${res.status}`);

    const resAlias = await request('/api/trainers/assignments', { token: trainerToken });
    assert(resAlias.status === 403, `Trainer should be rejected with 403 on alias, got ${resAlias.status}`);
  }

  // Test 7: Member access denied (403)
  console.log('Test 7: Member access denied (403)');
  {
    const res = await request('/api/users/admin/trainer-assignments', { token: memberToken });
    assert(res.status === 403, `Member should be rejected with 403, got ${res.status}`);

    const resAlias = await request('/api/trainers/assignments', { token: memberToken });
    assert(resAlias.status === 403, `Member should be rejected with 403 on alias, got ${resAlias.status}`);
  }

  // Test 8: Unauthenticated access rejected (401)
  console.log('Test 8: Unauthenticated access rejected (401)');
  {
    const res = await request('/api/users/admin/trainer-assignments');
    assert(res.status === 401, `Unauthenticated should be rejected with 401, got ${res.status}`);
  }

  // Cleanup
  await Promise.all([
    User.deleteMany({ email: /@testassign\.fitnova\.com$/ }),
    Membership.deleteMany({ planName: /Test Assign/ }),
    Payment.deleteMany({ transactionReference: /TXN-ASSIGN-/ }),
  ]);

  server.close();
  await disconnectDB();
  if (memoryServer) {
    await memoryServer.stop();
  }

  console.log('============================================');
  console.log('✓ ALL 8 TRAINER ASSIGNMENT BACKEND TESTS PASSED!');
  console.log('============================================');
}

runTests().catch(async (err) => {
  console.error('Test failed:', err);
  if (server) server.close();
  await disconnectDB();
  if (memoryServer) {
    await memoryServer.stop();
  }
  process.exit(1);
});

