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
const Workout = (await import('../models/workout.model.js')).default;

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

  console.log('--- Setting up test fixtures for Workout Assignment ---');

  await User.deleteMany({ email: /@wktest\.fitnova\.com$/ });
  await Workout.deleteMany({ workoutName: /WkTest/ });

  // 1. Create Trainer 1
  const trainer1 = await User.create({
    fullName: 'Trainer Alpha',
    email: 'alpha@wktest.fitnova.com',
    password: 'Password123!',
    phone: '9977110001',
    gender: 'male',
    dateOfBirth: new Date('1990-01-01'),
    role: 'trainer',
  });

  // 2. Create Trainer 2
  const trainer2 = await User.create({
    fullName: 'Trainer Beta',
    email: 'beta@wktest.fitnova.com',
    password: 'Password123!',
    phone: '9977110002',
    gender: 'female',
    dateOfBirth: new Date('1992-02-02'),
    role: 'trainer',
  });

  // 3. Create Member assigned to Trainer 1
  const member1 = await User.create({
    fullName: 'Member AlphaClient',
    email: 'client1@wktest.fitnova.com',
    password: 'Password123!',
    phone: '9977110003',
    gender: 'male',
    dateOfBirth: new Date('1995-03-03'),
    role: 'member',
    assignedTrainer: trainer1._id,
  });

  // Log in
  const loginT1 = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'alpha@wktest.fitnova.com', password: 'Password123!' },
  });
  const tokenT1 = loginT1.data.token;

  const loginT2 = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'beta@wktest.fitnova.com', password: 'Password123!' },
  });
  const tokenT2 = loginT2.data.token;

  const loginM1 = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'client1@wktest.fitnova.com', password: 'Password123!' },
  });
  const tokenM1 = loginM1.data.token;

  console.log('✓ Fixtures initialized and tokens acquired.');

  // Test 1: Trainer 1 can successfully assign a workout routine to assigned member
  console.log('Test 1: Trainer 1 assigns workout to their assigned member');
  const res1 = await request('/api/workouts', {
    method: 'POST',
    token: tokenT1,
    body: {
      workoutName: 'WkTest Hypertrophy Push',
      description: 'Focus on chest and triceps with progressive overload.',
      category: 'Strength',
      duration: 60,
      schedule: 'Mon, Wed, Fri - 8:00 AM',
      assignedMember: member1._id.toString(),
      exercises: [
        { name: 'Barbell Bench Press', sets: 4, reps: 8, weight: '70 kg' },
        { name: 'Incline Dumbbell Press', sets: 3, reps: 10, weight: '24 kg' },
        { name: 'Tricep Pushdown', sets: 3, reps: 12, weight: '30 kg' },
      ],
    },
  });
  assert(res1.status === 201, `Expected 201, got ${res1.status}: ${JSON.stringify(res1.data)}`);
  assert(res1.data.data.workoutName === 'WkTest Hypertrophy Push', 'Workout name mismatch');
  assert(res1.data.data.exercises.length === 3, 'Exercise count mismatch');
  const createdWorkoutId = res1.data.data._id;

  // Test 2: Verify MongoDB persistence
  console.log('Test 2: Verify workout saved in MongoDB with correct fields');
  const dbWorkout = await Workout.findById(createdWorkoutId);
  assert(dbWorkout !== null, 'Workout not found in MongoDB');
  assert(dbWorkout.assignedMember.toString() === member1._id.toString(), 'Member ID in DB mismatch');
  assert(dbWorkout.assignedTrainer.toString() === trainer1._id.toString(), 'Trainer ID in DB mismatch');
  assert(dbWorkout.status === 'assigned', `Status mismatch: ${dbWorkout.status}`);

  // Test 3: Member receives assigned workout in their workout list
  console.log('Test 3: Member retrieves their assigned workout');
  const res3 = await request('/api/workouts', { token: tokenM1 });
  assert(res3.status === 200, `Expected 200, got ${res3.status}`);
  const memberWorkouts = res3.data.data;
  const found = memberWorkouts.find((w) => w._id === createdWorkoutId);
  assert(found !== undefined, 'Assigned workout not found in member workout list');
  assert(found.workoutName === 'WkTest Hypertrophy Push', 'Workout name mismatch in member view');

  // Test 4: Trainer 2 CANNOT assign workout to Trainer 1\'s member (403 Forbidden)
  console.log('Test 4: Trainer 2 cannot assign workout to Trainer 1 member');
  const res4 = await request('/api/workouts', {
    method: 'POST',
    token: tokenT2,
    body: {
      workoutName: 'WkTest Unauthorized Routine',
      description: 'Attempt by unauthorized trainer.',
      category: 'Cardio',
      duration: 30,
      assignedMember: member1._id.toString(),
      exercises: [{ name: 'Treadmill', sets: 1, reps: 1, weight: '' }],
    },
  });
  assert(res4.status === 403, `Expected 403 for unauthorized trainer, got ${res4.status}`);

  // Test 5: Validation - Missing required fields returns 400
  console.log('Test 5: Missing required fields returns 400');
  const res5 = await request('/api/workouts', {
    method: 'POST',
    token: tokenT1,
    body: {
      workoutName: '', // empty name
      assignedMember: member1._id.toString(),
    },
  });
  assert(res5.status === 400, `Expected 400, got ${res5.status}`);

  console.log('============================================');
  console.log('✓ ALL 5 WORKOUT ASSIGNMENT BACKEND TESTS PASSED!');
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
