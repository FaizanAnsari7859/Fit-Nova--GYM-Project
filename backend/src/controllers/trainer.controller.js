import mongoose from 'mongoose';
import User from '../models/user.model.js';
import { ApiError } from '../utils/apiError.js';
import { toPublicUser } from '../utils/validators.js';

export const getPublicTrainers = async (_req, res) => {
  const trainers = await User.find({ role: 'trainer' })
    .select('fullName specialization experienceYears bio certifications profileImage createdAt')
    .sort({ experienceYears: -1, createdAt: -1 });

  res.status(200).json({
    success: true,
    count: trainers.length,
    data: trainers,
  });
};

export const assignMemberToTrainer = async (req, res) => {
  const { memberId, trainerId } = req.body;

  if (!memberId || !trainerId) {
    throw new ApiError(400, 'Both memberId and trainerId are required.');
  }

  if (
    !mongoose.Types.ObjectId.isValid(memberId) ||
    !mongoose.Types.ObjectId.isValid(trainerId)
  ) {
    throw new ApiError(400, 'Invalid memberId or trainerId format.');
  }

  const member = await User.findById(memberId);
  if (!member || member.role !== 'member') {
    throw new ApiError(400, 'A valid member must be selected.');
  }

  const trainer = await User.findById(trainerId);
  if (!trainer || trainer.role !== 'trainer') {
    throw new ApiError(400, 'A valid trainer must be selected.');
  }

  if (
    member.assignedTrainer &&
    member.assignedTrainer.toString() === trainerId
  ) {
    throw new ApiError(400, 'This trainer is already assigned to this member.');
  }

  member.assignedTrainer = trainer._id;
  await member.save();

  const populated = await User.findById(member._id)
    .populate('assignedTrainer', 'fullName specialization profileImage experienceYears')
    .select('-password');

  res.status(200).json({
    success: true,
    message: `Trainer "${trainer.fullName}" assigned to member "${member.fullName}".`,
    data: toPublicUser(populated),
  });
};
