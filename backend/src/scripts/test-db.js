import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

let memoryServer;

if (!process.env.MONGO_URI) {
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  memoryServer = await MongoMemoryServer.create();
  process.env.MONGO_URI = memoryServer.getUri();
  console.log('MONGO_URI is not set. Database tests are using a temporary local MongoDB instance.');
}

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  process.env.JWT_SECRET = 'fitnova-test-secret-must-be-at-least-32';
}

const { createApp } = await import('../app.js');
const { connectDB, disconnectDB } = await import('../config/db.js');
const Attendance = (await import('../models/attendance.model.js')).default;
const Membership = (await import('../models/membership.model.js')).default;
const Payment = (await import('../models/payment.model.js')).default;
const User = (await import('../models/user.model.js')).default;
const Workout = (await import('../models/workout.model.js')).default;

const stamp = Date.now();
const memberEmail = `member.${stamp}@fitnova.test`;
const trainerEmail = `trainer.${stamp}@fitnova.test`;
const memberPhone = `90000${String(stamp).slice(-5)}`;
const trainerPhone = `80000${String(stamp).slice(-5)}`;
const password = 'MemberPass123';

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
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
  const data = raw ? JSON.parse(raw) : {};
  return { status: response.status, data, raw };
};

const registrationBody = (overrides) => ({
  fullName: 'Asha Rao',
  email: memberEmail,
  phone: memberPhone,
  password,
  confirmPassword: password,
  gender: 'female',
  dateOfBirth: '2000-04-12',
  role: 'member',
  ...overrides,
});

const server = createApp();
let httpServer;
const createdIds = {
  users: [],
  memberships: [],
  workouts: [],
  payments: [],
  attendance: [],
};

try {
  await connectDB();
  await new Promise((resolve) => {
    httpServer = server.listen(0, resolve);
  });

  const { port } = httpServer.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  const health = await api(baseUrl, 'GET', '/api/health');
  assert(health.status === 200 && health.data.database === 'connected', 'Health check did not report a database connection.');

  const registered = await api(baseUrl, 'POST', '/api/auth/register', {
    body: registrationBody(),
  });
  assert(registered.status === 201, `Registration failed: ${registered.raw}`);
  assert(registered.data.data.role === 'member', 'Registered user role was not member.');
  assert(!registered.raw.includes(password), 'Registration response included the plain password.');
  assert(!registered.data.data.password, 'Registration response included a password hash.');
  createdIds.users.push(registered.data.data._id);

  const duplicateEmail = await api(baseUrl, 'POST', '/api/auth/register', {
    body: registrationBody({ phone: '9111122222', email: memberEmail }),
  });
  assert(duplicateEmail.status === 409, `Duplicate email was not rejected: ${duplicateEmail.raw}`);
  assert(duplicateEmail.data.message.includes('Email'), 'Duplicate email message was unclear.');

  const duplicatePhone = await api(baseUrl, 'POST', '/api/auth/register', {
    body: registrationBody({ email: `other.${stamp}@fitnova.test`, phone: memberPhone }),
  });
  assert(duplicatePhone.status === 409, `Duplicate phone was not rejected: ${duplicatePhone.raw}`);
  assert(duplicatePhone.data.message.includes('Phone'), 'Duplicate phone message was unclear.');

  const adminAttempt = await api(baseUrl, 'POST', '/api/auth/register', {
    body: registrationBody({
      email: `admin.${stamp}@fitnova.test`,
      phone: '9333344444',
      role: 'admin',
    }),
  });
  assert(adminAttempt.status === 403, `Public admin registration was not blocked: ${adminAttempt.raw}`);

  const trainer = await api(baseUrl, 'POST', '/api/auth/register', {
    body: registrationBody({
      fullName: 'Rohan Iyer',
      email: trainerEmail,
      phone: trainerPhone,
      role: 'trainer',
    }),
  });
  assert(trainer.status === 201, `Trainer registration failed: ${trainer.raw}`);
  createdIds.users.push(trainer.data.data._id);

  const loggedIn = await api(baseUrl, 'POST', '/api/auth/login', {
    body: { email: memberEmail, password },
  });
  assert(loggedIn.status === 200, `Login failed: ${loggedIn.raw}`);
  assert(loggedIn.data.data.role === 'member', 'Login did not return the member role.');
  assert(!loggedIn.raw.includes(password) && !loggedIn.data.data.password, 'Login response exposed password data.');
  const token = loggedIn.data.token;
  // Log in the trainer to obtain a token for trainer-restricted actions
  const trainerLogin = await api(baseUrl, 'POST', '/api/auth/login', { body: { email: trainerEmail, password } });
  assert(trainerLogin.status === 200, `Trainer login failed: ${trainerLogin.raw}`);
  const trainerToken = trainerLogin.data.token;

  const badLogin = await api(baseUrl, 'POST', '/api/auth/login', {
    body: { email: memberEmail, password: 'wrong-password' },
  });
  assert(badLogin.status === 401, 'Wrong password was accepted.');

  const updated = await api(baseUrl, 'PATCH', '/api/users/me', {
    token,
    body: { fullName: 'Asha R. Rao' },
  });
  assert(updated.status === 200 && updated.data.data.fullName === 'Asha R. Rao', `Profile update failed: ${updated.raw}`);

  const membership = await api(baseUrl, 'POST', '/api/memberships', {
    token,
    body: {
      planName: 'Nova Monthly',
      duration: 30,
      price: 1499,
      features: ['Gym floor', 'Group classes'],
      status: 'active',
    },
  });
  assert(membership.status === 201, `Membership insert failed: ${membership.raw}`);
  createdIds.memberships.push(membership.data.data._id);

  const membershipPrice = await api(baseUrl, 'PATCH', `/api/memberships/${membership.data.data._id}`, {
    token,
    body: { price: 1599 },
  });
  assert(membershipPrice.status === 200 && membershipPrice.data.data.price === 1599, `Membership update failed: ${membershipPrice.raw}`);

  const memberships = await api(baseUrl, 'GET', '/api/memberships', { token });
  assert(memberships.status === 200 && memberships.data.data.some((item) => item._id === membership.data.data._id), 'Membership retrieval failed.');

  const workout = await api(baseUrl, 'POST', '/api/workouts', {
    token: trainerToken,
    body: {
      workoutName: 'Strength A',
      description: 'Full body strength session.',
      category: 'Strength',
      duration: 45,
      assignedMember: registered.data.data._id,
      assignedTrainer: trainer.data.data._id,
    },
  });
  assert(workout.status === 201, `Workout insert failed: ${workout.raw}`);
  createdIds.workouts.push(workout.data.data._id);

  const payment = await api(baseUrl, 'POST', '/api/payments', {
    token,
    body: {
      member: registered.data.data._id,
      membership: membership.data.data._id,
      amount: 1599,
      paymentStatus: 'paid',
      transactionReference: `txn-${stamp}`,
      paymentDate: new Date().toISOString(),
    },
  });
  assert(payment.status === 201, `Payment insert failed: ${payment.raw}`);
  createdIds.payments.push(payment.data.data._id);

  const checkIn = new Date();
  const attendance = await api(baseUrl, 'POST', '/api/attendance', {
    token,
    body: {
      member: registered.data.data._id,
      checkInTime: checkIn.toISOString(),
      checkOutTime: new Date(checkIn.getTime() + 60 * 60 * 1000).toISOString(),
      attendanceDate: checkIn.toISOString(),
      status: 'present',
    },
  });
  assert(attendance.status === 201, `Attendance insert failed: ${attendance.raw}`);
  createdIds.attendance.push(attendance.data.data._id);

  const removed = await api(baseUrl, 'DELETE', `/api/attendance/${attendance.data.data._id}`, { token });
  assert(removed.status === 200, `Attendance delete failed: ${removed.raw}`);

  const missing = await api(baseUrl, 'GET', `/api/attendance/${attendance.data.data._id}`, { token });
  assert(missing.status === 404, 'Deleted attendance record was still returned.');

  console.log('Database tests passed.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (!memoryServer) {
    await Attendance.deleteMany({ _id: { $in: createdIds.attendance } });
    await Payment.deleteMany({ _id: { $in: createdIds.payments } });
    await Workout.deleteMany({ _id: { $in: createdIds.workouts } });
    await Membership.deleteMany({ _id: { $in: createdIds.memberships } });
    await User.deleteMany({ _id: { $in: createdIds.users } });
  }

  if (httpServer) {
    await new Promise((resolve) => httpServer.close(resolve));
  }

  await disconnectDB();

  if (memoryServer) {
    await memoryServer.stop();
  }
}
