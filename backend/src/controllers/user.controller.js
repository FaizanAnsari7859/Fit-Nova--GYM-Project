import bcrypt from 'bcryptjs';
import Membership from '../models/membership.model.js';
import Payment from '../models/payment.model.js';
import User from '../models/user.model.js';
import Workout from '../models/workout.model.js';
import { ApiError } from '../utils/apiError.js';
import { pick } from '../utils/pick.js';
import { toPublicUser, validateRegistration } from '../utils/validators.js';

const UPDATABLE_FIELDS = ['fullName', 'email', 'phone', 'gender', 'dateOfBirth', 'role', 'profileImage'];

export const getMe = async (req, res) => {
  const user = await User.findById(req.user.id);

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
  const trainerId = req.user.id;

  const workouts = await Workout.find({ assignedTrainer: trainerId })
    .populate('assignedMember', 'fullName email phone gender profileImage')
    .sort({ createdAt: -1 });

  // Extract distinct assigned members
  const memberMap = new Map();
  workouts.forEach((w) => {
    if (w.assignedMember && w.assignedMember._id) {
      memberMap.set(w.assignedMember._id.toString(), w.assignedMember);
    }
  });

  const assignedMembers = Array.from(memberMap.values());

  res.status(200).json({
    success: true,
    data: {
      totalAssignedMembers: assignedMembers.length,
      totalWorkouts: workouts.length,
      assignedMembers,
      workouts,
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
