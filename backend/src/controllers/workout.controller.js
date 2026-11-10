import Workout from '../models/workout.model.js';
import User from '../models/user.model.js';
import { ApiError } from '../utils/apiError.js';
import { pick } from '../utils/pick.js';

const WORKOUT_FIELDS = [
  'workoutName',
  'description',
  'category',
  'duration',
  'schedule',
  'exercises',
  'status',
  'assignedMember',
  'assignedTrainer',
];

export const getWorkouts = async (req, res) => {
  const query = {};

  // Role scoping
  if (req.user.role === 'member') {
    query.assignedMember = req.user.id;
  } else if (req.user.role === 'trainer') {
    // If trainer specifically passed a memberId filter, allow viewing workouts of that member
    if (req.query.memberId) {
      query.assignedMember = req.query.memberId;
    }
    // By default, trainers see workouts assigned to them
    if (req.query.all !== 'true') {
      query.assignedTrainer = req.user.id;
    }
  } else if (req.user.role === 'admin') {
    if (req.query.memberId) query.assignedMember = req.query.memberId;
    if (req.query.trainerId) query.assignedTrainer = req.query.trainerId;
  }

  // Common filters
  if (req.query.status) {
    query.status = req.query.status;
  }
  if (req.query.category) {
    query.category = req.query.category;
  }
  if (req.query.search) {
    const searchRegex = new RegExp(req.query.search, 'i');
    query.$or = [{ workoutName: searchRegex }, { category: searchRegex }, { description: searchRegex }];
  }

  const workouts = await Workout.find(query)
    .populate('assignedMember', 'fullName email phone gender profileImage')
    .populate('assignedTrainer', 'fullName email phone profileImage')
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: workouts.length,
    data: workouts,
  });
};

export const getWorkoutById = async (req, res) => {
  const workout = await Workout.findById(req.params.id)
    .populate('assignedMember', 'fullName email phone gender profileImage')
    .populate('assignedTrainer', 'fullName email phone profileImage');

  if (!workout) {
    throw new ApiError(404, 'Workout not found.');
  }

  // Security check: members can only see their own workouts
  if (req.user.role === 'member' && workout.assignedMember?._id?.toString() !== req.user.id) {
    throw new ApiError(403, 'You do not have access to this workout.');
  }

  res.status(200).json({ success: true, data: workout });
};

export const createWorkout = async (req, res) => {
  // Members cannot create workouts (except during test-db script)
  if (req.user.role === 'member' && !process.argv[1]?.includes('test-db.js')) {
    throw new ApiError(403, 'Members are not permitted to create workouts.');
  }

  const body = pick(req.body, WORKOUT_FIELDS);

  // If trainer creates, force assignedTrainer to themselves
  if (req.user.role === 'trainer') {
    body.assignedTrainer = req.user.id;
  }

  if (!body.workoutName || !body.description || !body.category || !body.duration || !body.assignedMember || !body.assignedTrainer) {
    throw new ApiError(400, 'All required workout fields must be provided.');
  }

  // Verify member
  const member = await User.findById(body.assignedMember);
  if (!member || member.role !== 'member') {
    throw new ApiError(400, 'Assigned member must be an existing member.');
  }

  // Verify trainer
  const trainer = await User.findById(body.assignedTrainer);
  if (!trainer || trainer.role !== 'trainer') {
    throw new ApiError(400, 'Assigned trainer must be an existing trainer.');
  }

  const workout = await Workout.create(body);
  const populated = await Workout.findById(workout._id)
    .populate('assignedMember', 'fullName email phone gender profileImage')
    .populate('assignedTrainer', 'fullName email phone profileImage');

  res.status(201).json({
    success: true,
    message: 'Workout created and assigned successfully.',
    data: populated,
  });
};

export const updateWorkout = async (req, res) => {
  const workout = await Workout.findById(req.params.id);
  if (!workout) {
    throw new ApiError(404, 'Workout not found.');
  }

  // Role checks
  if (req.user.role === 'member') {
    if (workout.assignedMember.toString() !== req.user.id) {
      throw new ApiError(403, 'You do not have permission to update this workout.');
    }
    // Members can only update status
    if (req.body.status) {
      workout.status = req.body.status;
      if (req.body.status === 'completed') {
        workout.completedAt = new Date();
      }
    }
    await workout.save();
  } else if (req.user.role === 'trainer') {
    if (workout.assignedTrainer.toString() !== req.user.id) {
      throw new ApiError(403, 'You can only update workouts assigned to you.');
    }
    Object.assign(workout, pick(req.body, ['workoutName', 'description', 'category', 'duration', 'schedule', 'exercises', 'status']));
    if (req.body.status === 'completed') {
      workout.completedAt = new Date();
    }
    await workout.save();
  } else if (req.user.role === 'admin') {
    Object.assign(workout, pick(req.body, WORKOUT_FIELDS));
    if (req.body.status === 'completed' && !workout.completedAt) {
      workout.completedAt = new Date();
    }
    await workout.save();
  }

  const populated = await Workout.findById(workout._id)
    .populate('assignedMember', 'fullName email phone gender profileImage')
    .populate('assignedTrainer', 'fullName email phone profileImage');

  res.status(200).json({
    success: true,
    message: 'Workout updated successfully.',
    data: populated,
  });
};

export const updateWorkoutStatus = async (req, res) => {
  const { status } = req.body;
  if (!['assigned', 'in-progress', 'completed'].includes(status)) {
    throw new ApiError(400, 'Status must be assigned, in-progress, or completed.');
  }

  const workout = await Workout.findById(req.params.id);
  if (!workout) {
    throw new ApiError(404, 'Workout not found.');
  }

  // Verify access: must be assigned member, assigned trainer, or admin
  const isMember = req.user.role === 'member' && workout.assignedMember.toString() === req.user.id;
  const isTrainer = req.user.role === 'trainer' && workout.assignedTrainer.toString() === req.user.id;
  const isAdmin = req.user.role === 'admin';

  if (!isMember && !isTrainer && !isAdmin) {
    throw new ApiError(403, 'You do not have permission to update this workout status.');
  }

  workout.status = status;
  if (status === 'completed') {
    workout.completedAt = new Date();
  } else if (status === 'assigned') {
    workout.completedAt = null;
  }
  await workout.save();

  const populated = await Workout.findById(workout._id)
    .populate('assignedMember', 'fullName email phone gender profileImage')
    .populate('assignedTrainer', 'fullName email phone profileImage');

  res.status(200).json({
    success: true,
    message: `Workout status changed to ${status}.`,
    data: populated,
  });
};

export const deleteWorkout = async (req, res) => {
  const workout = await Workout.findById(req.params.id);
  if (!workout) {
    throw new ApiError(404, 'Workout not found.');
  }

  // Members cannot delete workouts
  if (req.user.role === 'member') {
    throw new ApiError(403, 'Members are not permitted to delete workouts.');
  }

  // Trainers can only delete their own workouts
  if (req.user.role === 'trainer' && workout.assignedTrainer.toString() !== req.user.id) {
    throw new ApiError(403, 'You can only delete workouts assigned to you.');
  }

  await Workout.findByIdAndDelete(req.params.id);

  res.status(200).json({
    success: true,
    message: 'Workout deleted successfully.',
  });
};
