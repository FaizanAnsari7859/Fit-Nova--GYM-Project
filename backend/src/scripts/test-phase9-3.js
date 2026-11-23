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
const Attendance = (await import('../models/attendance.model.js')).default;

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

  console.log('--- Setting up test fixtures for Phase 9.3 ---');

  // Clear existing collections used for clean test run
  await Promise.all([
    User.deleteMany({ email: /@test93\.fitnova\.com$/ }),
    Membership.deleteMany({ planName: /Test 9\.3/ }),
    Payment.deleteMany({ transactionReference: /TXN-93-/ }),
    Attendance.deleteMany({}),
  ]);

  // Create Users
  const admin = await User.create({
    fullName: 'Admin 93',
    email: 'admin@test93.fitnova.com',
    password: 'Password123!',
    phone: '9999300001',
    gender: 'male',
    dateOfBirth: new Date('1985-01-01'),
    role: 'admin',
  });

  const trainer = await User.create({
    fullName: 'Trainer 93',
    email: 'trainer@test93.fitnova.com',
    password: 'Password123!',
    phone: '9999300002',
    gender: 'male',
    dateOfBirth: new Date('1990-01-01'),
    role: 'trainer',
  });

  const member = await User.create({
    fullName: 'Member 93',
    email: 'member@test93.fitnova.com',
    password: 'Password123!',
    phone: '9999300003',
    gender: 'female',
    dateOfBirth: new Date('1995-05-15'),
    role: 'member',
    assignedTrainer: trainer._id,
  });

  // Create Membership Plan
  const plan = await Membership.create({
    planName: 'Test 9.3 Gold Plan',
    duration: 30,
    price: 150,
    status: 'active',
  });

  // Create Payment
  const payment = await Payment.create({
    member: member._id,
    membership: plan._id,
    amount: 150,
    paymentStatus: 'paid',
    transactionReference: `TXN-93-${Date.now()}`,
    paymentDate: new Date(),
  });

  // Create Attendance record
  const attendance = await Attendance.create({
    member: member._id,
    checkInTime: new Date(),
    attendanceDate: new Date(),
    status: 'present',
  });

  // Login tokens
  const adminLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@test93.fitnova.com', password: 'Password123!' },
  });
  const adminToken = adminLogin.data.token;

  const trainerLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'trainer@test93.fitnova.com', password: 'Password123!' },
  });
  const trainerToken = trainerLogin.data.token;

  const memberLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'member@test93.fitnova.com', password: 'Password123!' },
  });
  const memberToken = memberLogin.data.token;

  console.log('✓ Test fixtures ready.');

  // Test 1: Admin Stats returns all Phase 9.3 metrics
  console.log('Test 1: Admin Stats returns all required metrics');
  {
    const res = await request('/api/users/admin/stats', { token: adminToken });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const d = res.data.data;
    assert(d.totalMembers >= 1, 'Should have totalMembers');
    assert(d.totalTrainers >= 1, 'Should have totalTrainers');
    assert(typeof d.activeMemberships === 'number', 'Should have activeMemberships');
    assert(typeof d.expiredMemberships === 'number', 'Should have expiredMemberships');
    assert(typeof d.totalPayments === 'number', 'Should have totalPayments');
    assert(d.totalRevenue >= 150, 'Should have totalRevenue >= 150');
    assert(typeof d.pendingPayments === 'number', 'Should have pendingPayments');
    assert(typeof d.todayAttendance === 'number', 'Should have todayAttendance');
    assert(Array.isArray(d.recentMembers), 'Should have recentMembers');
    assert(Array.isArray(d.recentPayments), 'Should have recentPayments');
    assert(Array.isArray(d.recentAttendance), 'Should have recentAttendance');
  }

  // Test 2: Admin stats access control
  console.log('Test 2: Admin stats access control');
  {
    const unauth = await request('/api/users/admin/stats');
    assert(unauth.status === 401, 'Unauthenticated should be 401');

    const trainerAccess = await request('/api/users/admin/stats', { token: trainerToken });
    assert(trainerAccess.status === 403, 'Trainer should be 403');

    const memberAccess = await request('/api/users/admin/stats', { token: memberToken });
    assert(memberAccess.status === 403, 'Member should be 403');
  }

  // Test 3: Trainer overview includes assigned members, workout stats, attendance
  console.log('Test 3: Trainer overview includes assigned members and attendance summary');
  {
    const res = await request('/api/users/trainer/overview', { token: trainerToken });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const d = res.data.data;
    assert(d.totalAssignedMembers >= 1, 'Should have totalAssignedMembers');
    assert(Array.isArray(d.assignedMembers), 'Should have assignedMembers');
    const assignedM = d.assignedMembers.find((m) => m._id.toString() === member._id.toString());
    assert(assignedM, 'Assigned member should be in trainer roster');
    assert(typeof assignedM.attendanceCount === 'number', 'Should have member attendance count');
    assert(typeof d.todayAttendanceCount === 'number', 'Should have todayAttendanceCount');
    assert(Array.isArray(d.recentActivities), 'Should have recentActivities');
  }

  // Test 4: Member cannot access trainer overview
  console.log('Test 4: Member cannot access trainer overview');
  {
    const res = await request('/api/users/trainer/overview', { token: memberToken });
    assert(res.status === 403, 'Member should get 403');
  }

  // Test 5: Member overview includes membership status, expiry, payment summary, attendance summary
  console.log('Test 5: Member overview includes membership status, expiry, payment and attendance summaries');
  {
    const res = await request('/api/users/member/overview', { token: memberToken });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const d = res.data.data;
    assert(d.membershipStatus === 'active', 'Membership status should be active');
    assert(d.membershipExpiry, 'Should have membershipExpiry');
    assert(typeof d.daysRemaining === 'number', 'Should have daysRemaining');
    assert(d.paymentSummary && typeof d.paymentSummary.totalPaid === 'number', 'Should have paymentSummary');
    assert(d.attendanceSummary && typeof d.attendanceSummary.totalAttendance === 'number', 'Should have attendanceSummary');
    assert(d.workoutSummary && typeof d.workoutSummary.totalWorkouts === 'number', 'Should have workoutSummary');
  }

  // Test 6: Trainer cannot access member overview
  console.log('Test 6: Trainer cannot access member overview');
  {
    const res = await request('/api/users/member/overview', { token: trainerToken });
    assert(res.status === 403, 'Trainer should get 403');
  }

  // Test 7: Reports endpoint access control
  console.log('Test 7: Reports endpoint access control (Admin only)');
  {
    const unauth = await request('/api/reports');
    assert(unauth.status === 401, 'Unauthenticated should get 401');

    const trainerAccess = await request('/api/reports', { token: trainerToken });
    assert(trainerAccess.status === 403, 'Trainer should get 403');

    const memberAccess = await request('/api/reports', { token: memberToken });
    assert(memberAccess.status === 403, 'Member should get 403');
  }

  // Test 8: Admin can access full reports
  console.log('Test 8: Admin can access full reports');
  {
    const res = await request('/api/reports', { token: adminToken });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const d = res.data.data;
    assert(d.summary, 'Should have summary in report');
    assert(d.membershipReport, 'Should have membershipReport');
    assert(d.paymentReport, 'Should have paymentReport');
    assert(d.attendanceReport, 'Should have attendanceReport');
    assert(d.registrationReport, 'Should have registrationReport');
  }

  // Test 9: Reports type filtering
  console.log('Test 9: Reports type filtering');
  {
    const res = await request('/api/reports?type=membership', { token: adminToken });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.data.membershipReport, 'Should return membershipReport');
    assert(res.data.data.paymentReport === undefined, 'Should not return paymentReport');

    const resPay = await request('/api/reports?type=payments', { token: adminToken });
    assert(resPay.status === 200, `Expected 200, got ${resPay.status}`);
    assert(resPay.data.data.paymentReport, 'Should return paymentReport');
    assert(resPay.data.data.membershipReport === undefined, 'Should not return membershipReport');
  }

  // Test 10: Reports date filtering
  console.log('Test 10: Reports date filtering');
  {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const past = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
    const res = await request(`/api/reports?startDate=${past}&endDate=${tomorrow}`, { token: adminToken });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.data.paymentReport.totalCount >= 1, 'Should include created payment in range');
  }

  // Cleanup
  await Promise.all([
    User.deleteMany({ email: /@test93\.fitnova\.com$/ }),
    Membership.deleteMany({ planName: /Test 9\.3/ }),
    Payment.deleteMany({ transactionReference: /TXN-93-/ }),
    Attendance.deleteMany({ _id: attendance._id }),
  ]);

  server.close();
  await disconnectDB();
  if (memoryServer) {
    await memoryServer.stop();
  }

  console.log('============================================');
  console.log('✓ ALL 10 DEDICATED PHASE 9.3 BACKEND TESTS PASSED!');
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
