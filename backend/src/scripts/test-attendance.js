import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

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
const Attendance = (await import('../models/attendance.model.js')).default;

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(`[ASSERTION FAILED] ${message}`);
  }
};

const api = async (baseUrl, method, pathname, { token, body } = {}) => {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
  return { status: response.status, data, raw };
};

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

  console.log('--- Setting up test fixtures for Attendance ---');

  // 1. Admin
  const admin = await User.create({
    fullName: `Admin Attn ${stamp}`,
    email: `admin.attn.${stamp}@fitnova.test`,
    phone: `91000${String(stamp).slice(-5)}`,
    password,
    gender: 'other',
    dateOfBirth: new Date('1990-01-01'),
    role: 'admin',
  });

  // 2. Trainer Alpha
  const trainerAlpha = await User.create({
    fullName: `Trainer Alpha ${stamp}`,
    email: `trainer.alpha.${stamp}@fitnova.test`,
    phone: `92000${String(stamp).slice(-5)}`,
    password,
    gender: 'male',
    dateOfBirth: new Date('1992-02-02'),
    role: 'trainer',
  });

  // 3. Trainer Beta
  const trainerBeta = await User.create({
    fullName: `Trainer Beta ${stamp}`,
    email: `trainer.beta.${stamp}@fitnova.test`,
    phone: `93000${String(stamp).slice(-5)}`,
    password,
    gender: 'female',
    dateOfBirth: new Date('1993-03-03'),
    role: 'trainer',
  });

  // 4. Member 1 (assigned to Trainer Alpha)
  const member1 = await User.create({
    fullName: `Member Alpha ${stamp}`,
    email: `member.alpha.${stamp}@fitnova.test`,
    phone: `94000${String(stamp).slice(-5)}`,
    password,
    gender: 'female',
    dateOfBirth: new Date('1998-04-04'),
    role: 'member',
    assignedTrainer: trainerAlpha._id,
  });

  // 5. Member 2 (assigned to Trainer Beta)
  const member2 = await User.create({
    fullName: `Member Beta ${stamp}`,
    email: `member.beta.${stamp}@fitnova.test`,
    phone: `95000${String(stamp).slice(-5)}`,
    password,
    gender: 'male',
    dateOfBirth: new Date('1999-05-05'),
    role: 'member',
    assignedTrainer: trainerBeta._id,
  });

  // Log in
  const adminLogin = await api(baseUrl, 'POST', '/api/auth/login', {
    body: { email: admin.email, password },
  });
  const adminToken = adminLogin.data.token;

  const trainerAlphaLogin = await api(baseUrl, 'POST', '/api/auth/login', {
    body: { email: trainerAlpha.email, password },
  });
  const trainerAlphaToken = trainerAlphaLogin.data.token;

  const member1Login = await api(baseUrl, 'POST', '/api/auth/login', {
    body: { email: member1.email, password },
  });
  const member1Token = member1Login.data.token;

  const member2Login = await api(baseUrl, 'POST', '/api/auth/login', {
    body: { email: member2.email, password },
  });
  const member2Token = member2Login.data.token;

  console.log('✓ All users created & logged in.');

  // TEST 1: Unauthenticated access
  console.log('Test 1: Unauthenticated access rejected');
  const unauth = await api(baseUrl, 'GET', '/api/attendance');
  assert(unauth.status === 401, `Expected 401 unauthenticated, got ${unauth.status}`);

  // TEST 2: Member cannot record check-in
  console.log('Test 2: Member cannot record check-in');
  const memberCheckIn = await api(baseUrl, 'POST', '/api/attendance', {
    token: member1Token,
    body: { member: member1._id },
  });
  assert(memberCheckIn.status === 403, `Member check-in should be 403, got ${memberCheckIn.status}`);

  // TEST 3: Trainer Alpha cannot record check-in for Member 2 (assigned to Trainer Beta)
  console.log('Test 3: Trainer cannot check-in unassigned member');
  const trainerUnassignedCheckIn = await api(baseUrl, 'POST', '/api/attendance', {
    token: trainerAlphaToken,
    body: { member: member2._id },
  });
  assert(trainerUnassignedCheckIn.status === 403, `Trainer check-in for unassigned member should be 403, got ${trainerUnassignedCheckIn.status}`);

  // TEST 4: Trainer Alpha can record check-in for Member 1 (assigned)
  console.log('Test 4: Trainer can check-in assigned member');
  const checkInTime1 = new Date();
  const trainerAlphaCheckIn = await api(baseUrl, 'POST', '/api/attendance', {
    token: trainerAlphaToken,
    body: {
      member: member1._id,
      checkInTime: checkInTime1.toISOString(),
      attendanceDate: checkInTime1.toISOString(),
      status: 'present',
    },
  });
  assert(trainerAlphaCheckIn.status === 201, `Trainer check-in failed: ${trainerAlphaCheckIn.raw}`);
  const record1 = trainerAlphaCheckIn.data.data;
  assert(record1.member._id === member1._id.toString(), 'Member ID mismatch in record1');
  assert(record1.checkOutTime === null, 'Open check-in should have null checkOutTime');

  // TEST 5: Duplicate check-in validation (Member 1 already has an open check-in)
  console.log('Test 5: Duplicate check-in prevention');
  const duplicateCheckIn = await api(baseUrl, 'POST', '/api/attendance', {
    token: trainerAlphaToken,
    body: { member: member1._id },
  });
  assert(duplicateCheckIn.status === 400, `Duplicate check-in should be rejected with 400, got ${duplicateCheckIn.status}`);

  // TEST 6: Admin records check-in and check-out for Member 2
  console.log('Test 6: Admin records check-in for Member 2');
  const pastCheckIn = new Date(Date.now() - 3600 * 1000);
  const adminCheckIn = await api(baseUrl, 'POST', '/api/attendance', {
    token: adminToken,
    body: {
      member: member2._id,
      checkInTime: pastCheckIn.toISOString(),
      attendanceDate: pastCheckIn.toISOString(),
      status: 'present',
    },
  });
  assert(adminCheckIn.status === 201, `Admin check-in failed: ${adminCheckIn.raw}`);
  const record2 = adminCheckIn.data.data;

  // TEST 7: Invalid check-out time validation (checkOutTime < checkInTime)
  console.log('Test 7: Check-out time before check-in time rejected');
  const badCheckOut = await api(baseUrl, 'PATCH', `/api/attendance/${record2._id}/checkout`, {
    token: adminToken,
    body: { checkOutTime: new Date(pastCheckIn.getTime() - 10000).toISOString() },
  });
  assert(badCheckOut.status === 400, `Bad check-out time should return 400, got ${badCheckOut.status}`);

  // TEST 8: Trainer Alpha cannot check out Member 2 (assigned to Trainer Beta)
  console.log('Test 8: Trainer cannot check out unassigned member');
  const trainerUnassignedCheckOut = await api(baseUrl, 'PATCH', `/api/attendance/${record2._id}/checkout`, {
    token: trainerAlphaToken,
  });
  assert(trainerUnassignedCheckOut.status === 403, `Trainer check-out for unassigned member should be 403, got ${trainerUnassignedCheckOut.status}`);

  // TEST 9: Trainer Alpha can check out Member 1 (assigned)
  console.log('Test 9: Trainer checks out assigned member');
  const validCheckOutTime = new Date(Date.now() + 1000);
  const trainerAlphaCheckOut = await api(baseUrl, 'PATCH', `/api/attendance/${record1._id}/checkout`, {
    token: trainerAlphaToken,
    body: { checkOutTime: validCheckOutTime.toISOString() },
  });
  assert(trainerAlphaCheckOut.status === 200, `Trainer check-out failed: ${trainerAlphaCheckOut.raw}`);
  assert(trainerAlphaCheckOut.data.data.checkOutTime !== null, 'checkOutTime should now be set');

  // TEST 10: Cannot check-out twice
  console.log('Test 10: Cannot check out twice');
  const doubleCheckOut = await api(baseUrl, 'PATCH', `/api/attendance/${record1._id}/checkout`, {
    token: trainerAlphaToken,
  });
  assert(doubleCheckOut.status === 400, `Second check-out should return 400, got ${doubleCheckOut.status}`);

  // TEST 11: Member isolation
  console.log('Test 11: Member isolation on attendance list & history');
  const member1List = await api(baseUrl, 'GET', '/api/attendance', { token: member1Token });
  assert(member1List.status === 200, `Member 1 list failed: ${member1List.raw}`);
  const member1Ids = member1List.data.data.map((r) => r._id);
  assert(member1Ids.includes(record1._id), 'Member 1 should see own record1');
  assert(!member1Ids.includes(record2._id), 'Member 1 must NOT see record2 for Member 2');

  const member1DirectFetchOther = await api(baseUrl, 'GET', `/api/attendance/${record2._id}`, { token: member1Token });
  assert(member1DirectFetchOther.status === 404, `Member 1 fetching Member 2 record should get 404, got ${member1DirectFetchOther.status}`);

  // TEST 12: Trainer isolation on attendance list
  console.log('Test 12: Trainer isolation on attendance list');
  const trainerAlphaList = await api(baseUrl, 'GET', '/api/attendance', { token: trainerAlphaToken });
  assert(trainerAlphaList.status === 200, `Trainer Alpha list failed: ${trainerAlphaList.raw}`);
  const trainerAlphaIds = trainerAlphaList.data.data.map((r) => r._id);
  assert(trainerAlphaIds.includes(record1._id), 'Trainer Alpha should see assigned Member 1 record');
  assert(!trainerAlphaIds.includes(record2._id), 'Trainer Alpha must NOT see unassigned Member 2 record');

  // TEST 13: Filters (member and date)
  console.log('Test 13: Filters (member and date)');
  const filterByMember = await api(baseUrl, 'GET', `/api/attendance?member=${member1._id}`, { token: adminToken });
  assert(filterByMember.status === 200 && filterByMember.data.data.every((r) => r.member._id === member1._id.toString()), 'Filter by member failed');

  const filterByDate = await api(baseUrl, 'GET', `/api/attendance?date=${checkInTime1.toISOString().split('T')[0]}`, { token: adminToken });
  assert(filterByDate.status === 200, `Filter by date failed: ${filterByDate.raw}`);

  // TEST 14: Member cannot delete, Admin can delete
  console.log('Test 14: Deletion restrictions');
  const memberDelete = await api(baseUrl, 'DELETE', `/api/attendance/${record2._id}`, { token: member1Token });
  assert(memberDelete.status === 403, `Member delete should be 403, got ${memberDelete.status}`);

  // --- NEW FOCUSED SECURITY AND DATA-INTEGRITY TESTS ---

  // TEST 15: General Update (PATCH /api/attendance/:id) - Member authorization
  console.log('Test 15: Member cannot update attendance record via PATCH');
  const memberPatchRes = await api(baseUrl, 'PATCH', `/api/attendance/${record1._id}`, {
    token: member1Token,
    body: { status: 'absent' },
  });
  assert(memberPatchRes.status === 403, `Member patch should be 403, got ${memberPatchRes.status}`);

  // TEST 16: General Update - Trainer cannot update unassigned member's attendance
  console.log('Test 16: Trainer cannot update unassigned member attendance');
  const trainerPatchUnassigned = await api(baseUrl, 'PATCH', `/api/attendance/${record2._id}`, {
    token: trainerAlphaToken,
    body: { status: 'late' },
  });
  assert(trainerPatchUnassigned.status === 403, `Trainer patch on unassigned member should be 403, got ${trainerPatchUnassigned.status}`);

  // TEST 17: General Update - Member reference tampering prevention
  console.log('Test 17: Trainer/Admin cannot modify the member reference via PATCH');
  const tamperMemberRes = await api(baseUrl, 'PATCH', `/api/attendance/${record1._id}`, {
    token: trainerAlphaToken,
    body: { member: member2._id, status: 'late' },
  });
  assert(tamperMemberRes.status === 200, `Trainer valid patch failed: ${tamperMemberRes.raw}`);
  assert(tamperMemberRes.data.data.member._id === member1._id.toString(), 'Member reference must NOT be changed');
  assert(tamperMemberRes.data.data.status === 'late', 'Status should be updated to late');

  // TEST 18: General Update - Validation (checkOutTime < checkInTime rejected in general PATCH)
  console.log('Test 18: Invalid check-out time in general PATCH is rejected');
  const invalidDatePatch = await api(baseUrl, 'PATCH', `/api/attendance/${record1._id}`, {
    token: adminToken,
    body: {
      checkInTime: new Date('2026-05-10T12:00:00.000Z').toISOString(),
      checkOutTime: new Date('2026-05-10T11:00:00.000Z').toISOString(),
    },
  });
  assert(invalidDatePatch.status === 400, `Invalid checkOutTime < checkInTime should return 400, got ${invalidDatePatch.status}`);

  // TEST 19: Route Order - /api/attendance/member/:memberId does not collide with /:id
  console.log('Test 19: Route order (/member/:memberId matched correctly before /:id)');
  const routeOrderRes = await api(baseUrl, 'GET', `/api/attendance/member/${member1._id}`, { token: adminToken });
  assert(routeOrderRes.status === 200, `GET /member/:memberId failed: ${routeOrderRes.raw}`);
  assert(Array.isArray(routeOrderRes.data.data), 'Expected array response from /member/:memberId');

  // TEST 20: Member History Authorization
  console.log('Test 20: Member history authorization matrix');
  // 20a. Member can view own history
  const ownHistory = await api(baseUrl, 'GET', `/api/attendance/member/${member1._id}`, { token: member1Token });
  assert(ownHistory.status === 200, `Member viewing own history failed: ${ownHistory.raw}`);

  // 20b. Member cannot view another member's history
  const otherMemberHistory = await api(baseUrl, 'GET', `/api/attendance/member/${member2._id}`, { token: member1Token });
  assert(otherMemberHistory.status === 403, `Member viewing other history should be 403, got ${otherMemberHistory.status}`);

  // 20c. Trainer can view assigned member's history
  const trainerAssignedHistory = await api(baseUrl, 'GET', `/api/attendance/member/${member1._id}`, { token: trainerAlphaToken });
  assert(trainerAssignedHistory.status === 200, `Trainer viewing assigned member history failed: ${trainerAssignedHistory.raw}`);

  // 20d. Trainer cannot view unassigned member's history
  const trainerUnassignedHistory = await api(baseUrl, 'GET', `/api/attendance/member/${member2._id}`, { token: trainerAlphaToken });
  assert(trainerUnassignedHistory.status === 403, `Trainer viewing unassigned member history should be 403, got ${trainerUnassignedHistory.status}`);

  // 20e. Admin can view any member's history
  const adminHistory = await api(baseUrl, 'GET', `/api/attendance/member/${member2._id}`, { token: adminToken });
  assert(adminHistory.status === 200, `Admin viewing member history failed: ${adminHistory.raw}`);

  // TEST 21: Database-level partial index protection (simultaneous duplicate active check-ins)
  console.log('Test 21: Database-level partial unique index prevents simultaneous active check-ins');
  // Member 2 is checked in without checkout:
  const newActiveCheckIn = await api(baseUrl, 'POST', '/api/attendance', {
    token: adminToken,
    body: {
      member: member1._id,
      checkInTime: new Date().toISOString(),
    },
  });
  assert(newActiveCheckIn.status === 201, `New check-in for Member 1 failed: ${newActiveCheckIn.raw}`);

  // Direct model insertion bypassing controller check to test MongoDB index constraint:
  let directDuplicateFailed = false;
  try {
    await Attendance.create({
      member: member1._id,
      checkInTime: new Date(),
      attendanceDate: new Date(),
      status: 'present',
      checkOutTime: null,
    });
  } catch (err) {
    if (err?.code === 11000) {
      directDuplicateFailed = true;
    }
  }
  assert(directDuplicateFailed, 'MongoDB partial unique index must reject concurrent duplicate active check-in');

  // TEST 22: Input validation (invalid ObjectId & invalid status)
  console.log('Test 22: Input validation (invalid ObjectId and invalid status)');
  const badIdRes = await api(baseUrl, 'GET', '/api/attendance/invalid-id-123', { token: adminToken });
  assert(badIdRes.status === 400, `Malformed ObjectId should return 400, got ${badIdRes.status}`);

  const badMemberIdRes = await api(baseUrl, 'GET', '/api/attendance/member/invalid-id-123', { token: adminToken });
  assert(badMemberIdRes.status === 400, `Malformed memberId should return 400, got ${badMemberIdRes.status}`);

  const badStatusRes = await api(baseUrl, 'POST', '/api/attendance', {
    token: adminToken,
    body: { member: member2._id, status: 'unknown_status' },
  });
  assert(badStatusRes.status === 400, `Invalid status should return 400, got ${badStatusRes.status}`);

  // Finally clean up record2 via admin delete
  const adminDelete = await api(baseUrl, 'DELETE', `/api/attendance/${record2._id}`, { token: adminToken });
  assert(adminDelete.status === 200, `Admin delete failed: ${adminDelete.raw}`);

  console.log('============================================');
  console.log('✓ ALL 22 FOCUSED ATTENDANCE BACKEND TESTS PASSED!');
  console.log('============================================');
} catch (error) {
  console.error('[TEST FAILURE]:', error.message);
  process.exitCode = 1;
} finally {
  if (httpServer) {
    await new Promise((resolve) => httpServer.close(resolve));
  }
  await disconnectDB();
  if (memoryServer) {
    await memoryServer.stop();
  }
}
