import bcrypt from 'bcryptjs';
import Membership from '../models/membership.model.js';
import Payment from '../models/payment.model.js';
import User from '../models/user.model.js';
import Workout from '../models/workout.model.js';
import { ApiError } from '../utils/apiError.js';
import { pick } from '../utils/pick.js';
import { toPublicUser, validateRegistration } from '../utils/validators.js';

const UPDATABLE_FIELDS = [
  'fullName',
  'email',
  'phone',
  'gender',
  'dateOfBirth',
  'role',
  'profileImage',
  'specialization',
  'experienceYears',
  'bio',
  'certifications',
  'assignedTrainer',
];

export const getMe = async (req, res) => {
  const user = await User.findById(req.user.id).populate('assignedTrainer', 'fullName specialization profileImage');

  if (!user) {
    throw new ApiError(404, 'User not found.');
  }

  res.status(200).json({ success: true, data: toPublicUser(user) });
};

export const updateMe = async (req, res) => {
  const user = await User.findById(req.user.id).select('+password');

  if (!user) {
    throw new ApiError(404, 'User not found.');
  }

  const allowedSelfFields = ['fullName', 'email', 'phone', 'gender', 'dateOfBirth', 'profileImage'];
  Object.assign(user, pick(req.body, allowedSelfFields));

  // Trainer professional fields
  const trainerFields = ['specialization', 'experienceYears', 'bio', 'certifications'];
  const hasTrainerFields = trainerFields.some((f) => req.body[f] !== undefined);

  if (hasTrainerFields) {
    if (user.role !== 'trainer') {
      throw new ApiError(403, 'Only trainers are permitted to update trainer profile fields.');
    }

    if (req.body.specialization !== undefined) {
      user.specialization = String(req.body.specialization || '').trim();
    }

    if (req.body.experienceYears !== undefined) {
      const exp = Number(req.body.experienceYears);
      if (Number.isNaN(exp) || exp < 0) {
        throw new ApiError(400, 'Experience years must be a number greater than or equal to 0.');
      }
      user.experienceYears = exp;
    }

    if (req.body.bio !== undefined) {
      const bioStr = String(req.body.bio || '').trim();
      if (bioStr.length > 500) {
        throw new ApiError(400, 'Bio must be 500 characters or fewer.');
      }
      user.bio = bioStr;
    }

    if (req.body.certifications !== undefined) {
      let certs = req.body.certifications;
      if (typeof certs === 'string') {
        certs = certs.split(',').map((c) => c.trim()).filter(Boolean);
      }
      if (!Array.isArray(certs) || certs.some((c) => typeof c !== 'string')) {
        throw new ApiError(400, 'Certifications must be an array of strings.');
      }
      user.certifications = certs.map((c) => c.trim()).filter(Boolean);
    }
  }

  if (req.body.currentPassword && req.body.newPassword) {
    const isMatch = await bcrypt.compare(req.body.currentPassword, user.password);
    if (!isMatch) {
      throw new ApiError(400, 'Current password is incorrect.');
    }
    if (String(req.body.newPassword).length < 8) {
      throw new ApiError(400, 'New password must be at least 8 characters.');
    }
    user.password = req.body.newPassword;
  } else if (req.body.password) {
    if (String(req.body.password).length < 8) {
      throw new ApiError(400, 'Password must be at least 8 characters.');
    }
    user.password = req.body.password;
  }

  await user.save();

  res.status(200).json({
    success: true,
    message: 'Profile updated.',
    data: toPublicUser(user),
  });
};

export const getUsers = async (req, res) => {
  const filter = {};

  if (req.query.role) {
    filter.role = req.query.role;
  }

  if (req.query.gender) {
    filter.gender = req.query.gender;
  }

  if (req.query.search) {
    const searchRegex = new RegExp(req.query.search.trim(), 'i');
    filter.$or = [
      { fullName: searchRegex },
      { email: searchRegex },
      { phone: searchRegex },
    ];
  }

  const users = await User.find(filter).sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: users.length,
    data: users.map(toPublicUser),
  });
};

export const getUserById = async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    throw new ApiError(404, 'User not found.');
  }

  res.status(200).json({ success: true, data: toPublicUser(user) });
};

export const createUser = async (req, res) => {
  const { errors, value } = validateRegistration(req.body);

  // If created by an admin, allow setting admin role explicitly if passed
  if (req.body.role === 'admin' && req.user?.role === 'admin') {
    const adminErrorIndex = errors.findIndex((e) => e.includes('Admin accounts cannot be created'));
    if (adminErrorIndex !== -1) {
      errors.splice(adminErrorIndex, 1);
      value.role = 'admin';
    }
  }

  if (errors.length) {
    throw new ApiError(400, errors[0], errors);
  }

  const user = await User.create(value);

  res.status(201).json({
    success: true,
    message: 'User created successfully.',
    data: toPublicUser(user),
  });
};

export const updateUser = async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    throw new ApiError(404, 'User not found.');
  }

  Object.assign(user, pick(req.body, UPDATABLE_FIELDS));

  if (req.body.password) {
    if (String(req.body.password).length < 8) {
      throw new ApiError(400, 'Password must be at least 8 characters.');
    }
    user.password = req.body.password;
  }

  await user.save();

  res.status(200).json({
    success: true,
    message: 'User updated successfully.',
    data: toPublicUser(user),
  });
};

export const deleteUser = async (req, res) => {
  if (req.user.id === req.params.id) {
    throw new ApiError(400, 'You cannot delete your own account.');
  }

  const user = await User.findByIdAndDelete(req.params.id);

  if (!user) {
    throw new ApiError(404, 'User not found.');
  }

  res.status(200).json({
    success: true,
    message: 'User deleted successfully.',
  });
};

export const getAdminStats = async (req, res) => {
  const [
    totalMembers,
    totalTrainers,
    activeMemberships,
    totalPayments,
    paymentsAgg,
    recentMembers,
  ] = await Promise.all([
    User.countDocuments({ role: 'member' }),
    User.countDocuments({ role: 'trainer' }),
    Membership.countDocuments({ status: 'active' }),
    Payment.countDocuments(),
    Payment.aggregate([{ $group: { _id: null, totalRevenue: { $sum: '$amount' } } }]),
    User.find({ role: 'member' }).sort({ createdAt: -1 }).limit(5),
  ]);

  const totalRevenue = paymentsAgg[0]?.totalRevenue || 0;

  res.status(200).json({
    success: true,
    data: {
      totalMembers,
      totalTrainers,
      activeMemberships,
      totalPayments,
      totalRevenue,
      recentMembers: recentMembers.map(toPublicUser),
    },
  });
};

export const getTrainerOverview = async (req, res) => {
  const trainerId =
    req.user.role === 'admin' && req.query.trainerId
      ? req.query.trainerId
      : req.user.id;

  // 1. Fetch directly assigned members from User collection
  const assignedMembersFromUser = await User.find({
    role: 'member',
    assignedTrainer: trainerId,
    isActive: { $ne: false },
  }).select('_id fullName email phone gender profileImage createdAt updatedAt');

  // 2. Fetch all workouts assigned by this trainer
  const workouts = await Workout.find({ assignedTrainer: trainerId })
    .populate('assignedMember', '_id fullName email phone gender profileImage')
    .sort({ createdAt: -1 });

  // 3. Build a distinct map of all members associated with this trainer
  const memberMap = new Map();

  for (const m of assignedMembersFromUser) {
    memberMap.set(m._id.toString(), {
      _id: m._id,
      fullName: m.fullName,
      email: m.email,
      phone: m.phone || '',
      gender: m.gender || '',
      profileImage: m.profileImage || '',
      assignedDate: m.updatedAt || m.createdAt,
      assignedWorkoutsCount: 0,
      completedWorkoutsCount: 0,
      activeWorkoutsCount: 0,
      completionRate: 0,
    });
  }

  let activeWorkoutRoutines = 0;
  let completedWorkoutSessions = 0;

  for (const w of workouts) {
    if (w.status === 'completed') {
      completedWorkoutSessions++;
    } else {
      activeWorkoutRoutines++;
    }

    if (w.assignedMember && w.assignedMember._id) {
      const mId = w.assignedMember._id.toString();
      if (!memberMap.has(mId)) {
        memberMap.set(mId, {
          _id: w.assignedMember._id,
          fullName: w.assignedMember.fullName,
          email: w.assignedMember.email,
          phone: w.assignedMember.phone || '',
          gender: w.assignedMember.gender || '',
          profileImage: w.assignedMember.profileImage || '',
          assignedDate: w.createdAt,
          assignedWorkoutsCount: 0,
          completedWorkoutsCount: 0,
          activeWorkoutsCount: 0,
          completionRate: 0,
        });
      }

      const m = memberMap.get(mId);
      m.assignedWorkoutsCount++;
      if (w.status === 'completed') {
        m.completedWorkoutsCount++;
      } else {
        m.activeWorkoutsCount++;
      }
    }
  }

  // Calculate per-member completion percentage
  const assignedMembers = Array.from(memberMap.values()).map((m) => {
    m.completionRate =
      m.assignedWorkoutsCount > 0
        ? Math.round((m.completedWorkoutsCount / m.assignedWorkoutsCount) * 100)
        : 0;
    return m;
  });

  const totalWorkouts = workouts.length;
  const overallCompletionRate =
    totalWorkouts > 0
      ? Math.round((completedWorkoutSessions / totalWorkouts) * 100)
      : 0;

  // 4. Build recent activities feed from real database records
  const activities = [];

  // Member assignment activities
  for (const m of assignedMembersFromUser.slice(0, 5)) {
    activities.push({
      id: `assign_${m._id}`,
      type: 'member_assigned',
      title: 'New Member Assigned',
      description: `${m.fullName} was assigned to your coaching roster.`,
      timestamp: m.updatedAt || m.createdAt,
      metadata: { memberId: m._id, memberName: m.fullName },
    });
  }

  // Workout assignment activities
  for (const w of workouts.slice(0, 5)) {
    activities.push({
      id: `workout_${w._id}`,
      type: 'workout_assigned',
      title: 'Workout Routine Assigned',
      description: `Assigned "${w.workoutName}" (${w.category}, ${w.duration} min) to ${w.assignedMember?.fullName || 'Member'}.`,
      timestamp: w.createdAt,
      metadata: { workoutId: w._id, memberName: w.assignedMember?.fullName },
    });
  }

  // Completed workout activities
  const completedWorkouts = workouts
    .filter((w) => w.status === 'completed' && w.completedAt)
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))
    .slice(0, 5);

  for (const cw of completedWorkouts) {
    activities.push({
      id: `complete_${cw._id}`,
      type: 'workout_completed',
      title: 'Workout Completed',
      description: `${cw.assignedMember?.fullName || 'Member'} finished "${cw.workoutName}".`,
      timestamp: cw.completedAt,
      metadata: { workoutId: cw._id, memberName: cw.assignedMember?.fullName },
    });
  }

  activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const recentActivities = activities.slice(0, 10);

  res.status(200).json({
    success: true,
    data: {
      totalAssignedMembers: assignedMembers.length,
      totalWorkouts,
      activeWorkoutRoutines,
      completedWorkoutSessions,
      overallCompletionRate,
      statistics: {
        totalAssignedMembers: assignedMembers.length,
        activeWorkoutRoutines,
        completedWorkoutSessions,
        overallCompletionRate,
        totalWorkouts,
      },
      assignedMembers,
      workouts,
      recentActivities,
    },
  });
};

export const getMemberOverview = async (req, res) => {
  const memberId = req.user.id;

  const [workouts, payments] = await Promise.all([
    Workout.find({ assignedMember: memberId })
      .populate('assignedTrainer', 'fullName email phone profileImage')
      .sort({ createdAt: -1 }),
    Payment.find({ member: memberId })
      .populate('membership')
      .sort({ paymentDate: -1 }),
  ]);

  const activePayment = payments.find((p) => p.paymentStatus === 'paid');
  const activePlan = activePayment?.membership || null;

  res.status(200).json({
    success: true,
    data: {
      totalWorkouts: workouts.length,
      activePlan,
      workouts,
      payments,
    },
  });
};
