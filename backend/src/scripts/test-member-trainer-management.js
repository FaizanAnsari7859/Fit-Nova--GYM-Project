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
const User = (await import('../models/user.model.js')).default;

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

  console.log('--- Setting up test fixtures for Member & Trainer Management ---');

  await User.deleteMany({
    $or: [
      { email: /@mgmt\.fitnova\.com$/ },
      { phone: /^998811/ },
    ],
  });

  // 1. Create Admin
  const admin = await User.create({
    fullName: 'Admin Manager',
    email: 'admin@mgmt.fitnova.com',
    password: 'Password123!',
    phone: '9988110001',
    gender: 'male',
    dateOfBirth: new Date('1985-01-01'),
    role: 'admin',
  });

  // 2. Create Trainer
  const trainer = await User.create({
    fullName: 'Trainer Tom',
    email: 'tom@mgmt.fitnova.com',
    password: 'Password123!',
    phone: '9988110002',
    gender: 'male',
    dateOfBirth: new Date('1990-03-03'),
    role: 'trainer',
    specialization: 'Bodybuilding & Fitness',
    experienceYears: 6,
    bio: 'Certified master trainer.',
  });

  // 3. Create Member
  const member = await User.create({
    fullName: 'Member Mary',
    email: 'mary@mgmt.fitnova.com',
    password: 'Password123!',
    phone: '9988110003',
    gender: 'female',
    dateOfBirth: new Date('1995-05-05'),
    role: 'member',
  });

  // Log in to get tokens
  const adminLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@mgmt.fitnova.com', password: 'Password123!' },
  });
  const adminToken = adminLogin.data.token;

  const trainerLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'tom@mgmt.fitnova.com', password: 'Password123!' },
  });
  const trainerToken = trainerLogin.data.token;

  const memberLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'mary@mgmt.fitnova.com', password: 'Password123!' },
  });
  const memberToken = memberLogin.data.token;

  console.log('✓ Fixtures initialized and tokens acquired.');

  // Test 1: Admin can list users with role and search filters
  console.log('Test 1: Admin can list users with filters');
  const res1 = await request('/api/users?role=trainer', { token: adminToken });
  assert(res1.status === 200, `Expected 200, got ${res1.status}`);
  assert(Array.isArray(res1.data.data), 'Expected data to be an array');
  const allTrainers = res1.data.data.every((u) => u.role === 'trainer');
  assert(allTrainers, 'Expected all returned users to have role trainer');

  const res1Search = await request('/api/users?search=Mary', { token: adminToken });
  assert(res1Search.status === 200, `Expected 200, got ${res1Search.status}`);
  assert(res1Search.data.data.some((u) => u.fullName === 'Member Mary'), 'Expected to find Member Mary');

  // Test 2: Admin can create a new member
  console.log('Test 2: Admin can create a new member');
  const newMemberPayload = {
    fullName: 'New Member John',
    email: 'newjohn@mgmt.fitnova.com',
    phone: '9988110010',
    gender: 'male',
    dateOfBirth: '1998-07-07',
    password: 'Password123!',
    confirmPassword: 'Password123!',
    role: 'member',
  };
  const res2 = await request('/api/users', {
    method: 'POST',
    token: adminToken,
    body: newMemberPayload,
  });
  assert(res2.status === 201, `Expected 201, got ${res2.status}`);
  assert(res2.data.data.fullName === 'New Member John', 'Created member name mismatch');
  assert(res2.data.data.role === 'member', 'Created member role mismatch');
  const createdMemberId = res2.data.data._id;

  // Test 3: Duplicate email on user creation returns 409 Conflict
  console.log('Test 3: Duplicate email validation on user creation');
  const res3 = await request('/api/users', {
    method: 'POST',
    token: adminToken,
    body: {
      fullName: 'Another John',
      email: 'newjohn@mgmt.fitnova.com', // duplicate email
      phone: '9988110099',
      gender: 'male',
      dateOfBirth: '1998-07-07',
      password: 'Password123!',
      confirmPassword: 'Password123!',
      role: 'member',
    },
  });
  assert(res3.status === 409, `Expected 409 for duplicate email, got ${res3.status}`);

  // Test 4: Duplicate phone on user creation returns 409 Conflict
  console.log('Test 4: Duplicate phone validation on user creation');
  const res4 = await request('/api/users', {
    method: 'POST',
    token: adminToken,
    body: {
      fullName: 'Phone Conflict',
      email: 'diffemail@mgmt.fitnova.com',
      phone: '9988110010', // duplicate phone
      gender: 'male',
      dateOfBirth: '1998-07-07',
      password: 'Password123!',
      confirmPassword: 'Password123!',
      role: 'member',
    },
  });
  assert(res4.status === 409, `Expected 409 for duplicate phone, got ${res4.status}`);

  // Test 5: Admin can create a new trainer with trainer-specific fields
  console.log('Test 5: Admin can create a trainer with specialization, experience, bio');
  const newTrainerPayload = {
    fullName: 'Trainer Sarah',
    email: 'sarah@mgmt.fitnova.com',
    phone: '9988110020',
    gender: 'female',
    dateOfBirth: '1992-04-12',
    password: 'Password123!',
    confirmPassword: 'Password123!',
    role: 'trainer',
    specialization: 'Yoga & Pilates',
    experienceYears: 5,
    bio: 'Experienced yoga and posture coach.',
  };
  const res5 = await request('/api/users', {
    method: 'POST',
    token: adminToken,
    body: newTrainerPayload,
  });
  assert(res5.status === 201, `Expected 201, got ${res5.status}`);
  assert(res5.data.data.role === 'trainer', 'Expected role trainer');
  assert(res5.data.data.specialization === 'Yoga & Pilates', 'Expected specialization saved');
  assert(res5.data.data.experienceYears === 5, 'Expected experienceYears saved');
  const createdTrainerId = res5.data.data._id;

  // Test 6: Admin can view user details by ID
  console.log('Test 6: Admin can view user details by ID');
  const res6 = await request(`/api/users/${createdMemberId}`, { token: adminToken });
  assert(res6.status === 200, `Expected 200, got ${res6.status}`);
  assert(res6.data.data.fullName === 'New Member John', 'Name mismatch on view');

  // Test 7: Admin can update member details and assign a trainer
  console.log('Test 7: Admin can update member and assign a trainer');
  const res7 = await request(`/api/users/${createdMemberId}`, {
    method: 'PATCH',
    token: adminToken,
    body: {
      fullName: 'John Updated',
      assignedTrainer: createdTrainerId,
    },
  });
  assert(res7.status === 200, `Expected 200, got ${res7.status}`);
  assert(res7.data.data.fullName === 'John Updated', 'Updated name mismatch');
  assert(String(res7.data.data.assignedTrainer) === String(createdTrainerId), 'Trainer assignment mismatch');

  // Test 8: Admin can update trainer details (specialization, bio, experience)
  console.log('Test 8: Admin can update trainer fields');
  const res8 = await request(`/api/users/${createdTrainerId}`, {
    method: 'PATCH',
    token: adminToken,
    body: {
      specialization: 'Advanced Vinyasa Yoga',
      experienceYears: 7,
      bio: 'Updated bio with 7+ years of experience.',
    },
  });
  assert(res8.status === 200, `Expected 200, got ${res8.status}`);
  assert(res8.data.data.specialization === 'Advanced Vinyasa Yoga', 'Updated specialization mismatch');
  assert(res8.data.data.experienceYears === 7, 'Updated experienceYears mismatch');

  // Test 9: Non-admin (Trainer) cannot create or update users (403 Forbidden)
  console.log('Test 9: Trainer cannot create or update users');
  const res9Create = await request('/api/users', {
    method: 'POST',
    token: trainerToken,
    body: newMemberPayload,
  });
  assert(res9Create.status === 403, `Expected 403 for trainer creating user, got ${res9Create.status}`);

  const res9Update = await request(`/api/users/${createdMemberId}`, {
    method: 'PATCH',
    token: trainerToken,
    body: { fullName: 'Hacked by Trainer' },
  });
  assert(res9Update.status === 403, `Expected 403 for trainer updating user, got ${res9Update.status}`);

  // Test 10: Non-admin (Member) cannot list or manage users (403 Forbidden)
  console.log('Test 10: Member cannot list or manage users');
  const res10List = await request('/api/users', { token: memberToken });
  assert(res10List.status === 403, `Expected 403 for member listing users, got ${res10List.status}`);

  const res10Delete = await request(`/api/users/${createdMemberId}`, {
    method: 'DELETE',
    token: memberToken,
  });
  assert(res10Delete.status === 403, `Expected 403 for member deleting user, got ${res10Delete.status}`);

  // Test 11: Unauthenticated request returns 401 Unauthorized
  console.log('Test 11: Unauthenticated access rejected with 401');
  const res11 = await request('/api/users');
  assert(res11.status === 401, `Expected 401, got ${res11.status}`);

  // Test 12: Admin cannot delete their own account (400 Bad Request)
  console.log('Test 12: Admin cannot delete own account');
  const res12 = await request(`/api/users/${admin._id}`, {
    method: 'DELETE',
    token: adminToken,
  });
  assert(res12.status === 400, `Expected 400, got ${res12.status}`);

  // Test 13: Admin can delete a member
  console.log('Test 13: Admin can delete a member');
  const res13 = await request(`/api/users/${createdMemberId}`, {
    method: 'DELETE',
    token: adminToken,
  });
  assert(res13.status === 200, `Expected 200, got ${res13.status}`);

  // Test 14: Pagination support on /api/users
  console.log('Test 14: Pagination support on /api/users');
  const res14 = await request('/api/users?page=1&limit=2', { token: adminToken });
  assert(res14.status === 200, `Expected 200, got ${res14.status}`);
  assert(res14.data.page === 1, `Expected page 1, got ${res14.data.page}`);
  assert(res14.data.limit === 2, `Expected limit 2, got ${res14.data.limit}`);
  assert(typeof res14.data.total === 'number', 'Expected total count');
  assert(Array.isArray(res14.data.data), 'Expected data array');
  assert(res14.data.data.length <= 2, 'Expected at most 2 items per page');

  // Test 15: Admin cannot alter or demote their own role
  console.log('Test 15: Admin cannot change their own role');
  const res15 = await request(`/api/users/${admin._id}`, {
    method: 'PATCH',
    token: adminToken,
    body: { role: 'member' },
  });
  assert(res15.status === 400, `Expected 400, got ${res15.status}`);
  assert(res15.data.message.includes('cannot change their own role'), 'Message mismatch on demoting own role');

  console.log('============================================');
  console.log('✓ ALL 15 MEMBER & TRAINER MANAGEMENT BACKEND TESTS PASSED!');
  console.log('============================================');
}

runTests()
  .catch((err) => {
    console.error('Test suite failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    if (server) {
      server.close();
    }
    await disconnectDB();
    if (memoryServer) {
      await memoryServer.stop();
    }
    process.exit(0);
  });

