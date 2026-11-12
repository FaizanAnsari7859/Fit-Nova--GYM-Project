import mongoose from 'mongoose';
import User from './src/models/user.model.js';
import Workout from './src/models/workout.model.js';
import dotenv from 'dotenv';

dotenv.config();

const BASE_URL = 'http://localhost:5000/api';

async function runTests() {
  console.log('Connecting to database directly to set up test fixtures...');
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/fitnova');

  const timestamp = Date.now();
  const trainerAEmail = `trainerA_${timestamp}@fitnova.test`;
  const trainerBEmail = `trainerB_${timestamp}@fitnova.test`;
  const memberEmail = `member_${timestamp}@fitnova.test`;
  const testPassword = 'Password@123';

  // 1. Create Trainer A
  const trainerA = await User.create({
    fullName: `Coach Alpha ${timestamp}`,
    email: trainerAEmail,
    password: testPassword,
    phone: `91${String(timestamp).slice(-8)}`,
    gender: 'male',
    dateOfBirth: new Date('1988-03-21'),
    role: 'trainer',
    specialization: 'CrossFit & Conditioning',
    experienceYears: 5,
    isActive: true,
  });

  // 2. Create Trainer B (for data isolation testing)
  const trainerB = await User.create({
    fullName: `Coach Beta ${timestamp}`,
    email: trainerBEmail,
    password: testPassword,
    phone: `92${String(timestamp).slice(-8)}`,
    gender: 'female',
    dateOfBirth: new Date('1992-07-14'),
    role: 'trainer',
    specialization: 'Yoga & Pilates',
    experienceYears: 4,
    isActive: true,
  });

  // 3. Create Member
  const member = await User.create({
    fullName: `Athlete One ${timestamp}`,
    email: memberEmail,
    password: testPassword,
    phone: `93${String(timestamp).slice(-8)}`,
    gender: 'male',
    dateOfBirth: new Date('1996-11-05'),
    role: 'member',
    isActive: true,
  });

  console.log('✓ Created test fixtures (Trainer A, Trainer B, Member)');

  try {
    // Admin login
    const adminLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: process.env.ADMIN_EMAIL,
        password: process.env.ADMIN_PASSWORD,
      }),
    });
    const adminLoginData = await adminLoginRes.json();
    const adminToken = adminLoginData.token;

    // Trainer A login
    const trainerALoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: trainerAEmail, password: testPassword }),
    });
    const trainerALoginData = await trainerALoginRes.json();
    const trainerAToken = trainerALoginData.token;

    // Trainer B login
    const trainerBLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: trainerBEmail, password: testPassword }),
    });
    const trainerBLoginData = await trainerBLoginRes.json();
    const trainerBToken = trainerBLoginData.token;

    // Member login
    const memberLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: memberEmail, password: testPassword }),
    });
    const memberLoginData = await memberLoginRes.json();
    const memberToken = memberLoginData.token;

    console.log('✓ All 4 accounts authenticated successfully');

    // Test 1: Admin assigns Member to Trainer A
    console.log('\n--- Test 1: Admin assigns Member to Trainer A ---');
    const assignRes = await fetch(`${BASE_URL}/trainers/assign-member`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        memberId: member._id.toString(),
        trainerId: trainerA._id.toString(),
      }),
    });
    if (!assignRes.ok) {
      throw new Error(`Admin assign-member failed with status ${assignRes.status}`);
    }
    console.log('✓ Member successfully assigned to Trainer A');

    // Test 2: Quick Workout Assignment by Trainer A via POST /api/workouts
    console.log('\n--- Test 2: Quick Workout Assignment by Trainer A ---');
    const createWorkout1 = await fetch(`${BASE_URL}/workouts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${trainerAToken}`,
      },
      body: JSON.stringify({
        workoutName: 'Phase 8.2 Push Routine',
        description: 'Bench press, dumbbell overhead press, and dips.',
        category: 'Strength',
        duration: 50,
        schedule: 'Mon, Thu - 7:00 AM',
        assignedMember: member._id.toString(),
        assignedTrainer: trainerA._id.toString(),
        exercises: [
          { name: 'Bench Press', sets: 4, reps: 8, weight: '70 kg' },
          { name: 'Overhead Press', sets: 3, reps: 10, weight: '40 kg' },
        ],
      }),
    });
    const workout1Data = await createWorkout1.json();
    if (!createWorkout1.ok || !workout1Data.data?._id) {
      throw new Error(`Failed to create workout 1: ${JSON.stringify(workout1Data)}`);
    }
    console.log('✓ Trainer A assigned workout 1 (status: assigned)');

    // Create a 2nd workout for member directly with status completed
    const workout2 = await Workout.create({
      workoutName: 'Phase 8.2 HIIT Cardio Session',
      description: 'Interval sprints and battle ropes.',
      category: 'HIIT',
      duration: 30,
      schedule: 'Tue, Fri - 8:00 AM',
      status: 'completed',
      completedAt: new Date(),
      assignedMember: member._id,
      assignedTrainer: trainerA._id,
      exercises: [{ name: 'Sprints', sets: 5, reps: 1, weight: 'Bodyweight' }],
    });
    console.log('✓ Created workout 2 (status: completed)');

    // Test 3: Trainer A Overview Statistics and Calculations
    console.log('\n--- Test 3: Trainer A Overview Statistics ---');
    const overviewRes = await fetch(`${BASE_URL}/users/trainer/overview`, {
      headers: { Authorization: `Bearer ${trainerAToken}` },
    });
    const overviewData = await overviewRes.json();
    if (!overviewRes.ok || !overviewData.success) {
      throw new Error(`Failed to get trainer overview: ${JSON.stringify(overviewData)}`);
    }

    const { data } = overviewData;
    console.log('Received Overview Data:', JSON.stringify(data.statistics));

    if (data.totalAssignedMembers !== 1) {
      throw new Error(`Expected totalAssignedMembers === 1, got ${data.totalAssignedMembers}`);
    }
    if (data.totalWorkouts !== 2) {
      throw new Error(`Expected totalWorkouts === 2, got ${data.totalWorkouts}`);
    }
    if (data.activeWorkoutRoutines !== 1) {
      throw new Error(`Expected activeWorkoutRoutines === 1, got ${data.activeWorkoutRoutines}`);
    }
    if (data.completedWorkoutSessions !== 1) {
      throw new Error(`Expected completedWorkoutSessions === 1, got ${data.completedWorkoutSessions}`);
    }
    if (data.overallCompletionRate !== 50) {
      throw new Error(`Expected overallCompletionRate === 50%, got ${data.overallCompletionRate}`);
    }
    console.log('✓ All 4 statistics verified with exact real database data');

    // Test 4: Assigned Members Section Data & Metrics
    console.log('\n--- Test 4: Assigned Members Section Data ---');
    if (!Array.isArray(data.assignedMembers) || data.assignedMembers.length !== 1) {
      throw new Error(`Expected 1 assigned member, got ${data.assignedMembers?.length}`);
    }
    const mData = data.assignedMembers[0];
    if (mData.fullName !== member.fullName) {
      throw new Error(`Member name mismatch: ${mData.fullName} vs ${member.fullName}`);
    }
    if (mData.assignedWorkoutsCount !== 2) {
      throw new Error(`Expected assignedWorkoutsCount === 2, got ${mData.assignedWorkoutsCount}`);
    }
    if (mData.completedWorkoutsCount !== 1) {
      throw new Error(`Expected completedWorkoutsCount === 1, got ${mData.completedWorkoutsCount}`);
    }
    if (mData.activeWorkoutsCount !== 1) {
      throw new Error(`Expected activeWorkoutsCount === 1, got ${mData.activeWorkoutsCount}`);
    }
    if (mData.completionRate !== 50) {
      throw new Error(`Expected completionRate === 50%, got ${mData.completionRate}`);
    }
    console.log('✓ Assigned member breakdown verified (2 assigned, 1 completed, 1 active, 50% rate)');

    // Test 5: Real Recent Activity Feed
    console.log('\n--- Test 5: Recent Coaching Activity Feed ---');
    if (!Array.isArray(data.recentActivities) || data.recentActivities.length === 0) {
      throw new Error('Expected non-empty recentActivities array');
    }
    console.log(`✓ Received ${data.recentActivities.length} real activity items:`);
    data.recentActivities.forEach((act) => {
      console.log(`   - [${act.type}] ${act.title}: ${act.description}`);
    });

    // Test 6: Trainer Data Isolation (Trainer B sees 0 of Trainer A's members/workouts)
    console.log('\n--- Test 6: Trainer Data Isolation ---');
    const trainerBRes = await fetch(`${BASE_URL}/users/trainer/overview`, {
      headers: { Authorization: `Bearer ${trainerBToken}` },
    });
    const trainerBData = await trainerBRes.json();
    if (trainerBData.data.totalAssignedMembers !== 0 || trainerBData.data.totalWorkouts !== 0) {
      throw new Error(`Data isolation failed! Trainer B saw: ${JSON.stringify(trainerBData.data)}`);
    }
    console.log('✓ Trainer data isolation confirmed: Trainer B sees 0 members and 0 workouts');

    // Test 7: Admin Permissions
    console.log('\n--- Test 7: Admin Access to Trainer Overview ---');
    const adminOverviewRes = await fetch(
      `${BASE_URL}/users/trainer/overview?trainerId=${trainerA._id.toString()}`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    const adminOverviewData = await adminOverviewRes.json();
    if (!adminOverviewRes.ok || adminOverviewData.data.totalAssignedMembers !== 1) {
      throw new Error(`Admin failed to view Trainer A overview: ${JSON.stringify(adminOverviewData)}`);
    }
    console.log('✓ Admin successfully accessed Trainer A overview with ?trainerId');

    // Test 8: Member Forbidden from accessing trainer overview
    console.log('\n--- Test 8: Member Blocked from Trainer Overview ---');
    const memberForbiddenRes = await fetch(`${BASE_URL}/users/trainer/overview`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    if (memberForbiddenRes.status !== 403) {
      throw new Error(`Expected 403 Forbidden for member, got ${memberForbiddenRes.status}`);
    }
    console.log('✓ Member correctly forbidden (403) from trainer overview');

    // Test 9: Invalid Workout Assignment validation
    console.log('\n--- Test 9: Workout Assignment to Invalid User Rejected ---');
    const invalidWorkoutRes = await fetch(`${BASE_URL}/workouts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${trainerAToken}`,
      },
      body: JSON.stringify({
        workoutName: 'Invalid Workout',
        description: 'Should fail',
        category: 'Strength',
        duration: 30,
        assignedMember: trainerB._id.toString(), // Trainer B is a trainer, NOT a member!
      }),
    });
    if (invalidWorkoutRes.status !== 400) {
      throw new Error(`Expected 400 Bad Request when assigning to non-member, got ${invalidWorkoutRes.status}`);
    }
    console.log('✓ Workout assignment to non-member correctly rejected with 400 Bad Request');

    console.log('\n=========================================');
    console.log('ALL PHASE 8.2 BACKEND TESTS PASSED (9/9)!');
    console.log('=========================================');
  } finally {
    console.log('\nCleaning up test fixtures...');
    await Workout.deleteMany({ assignedTrainer: { $in: [trainerA._id, trainerB._id] } });
    await User.deleteMany({ _id: { $in: [trainerA._id, trainerB._id, member._id] } });
    await mongoose.disconnect();
    console.log('✓ Test fixtures cleaned up and DB disconnected.');
  }
}

runTests().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
