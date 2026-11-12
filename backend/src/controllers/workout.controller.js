// workout.controller.js – Handles Workout CRUD and related updates
import Workout from '../models/workout.model.js';
import User from '../models/user.model.js';
import { ApiError } from '../utils/apiError.js';
import { pick } from '../utils/pick.js';

// Fields allowed for creation / update (including Phase‑8.3 extensions)
const WORKOUT_FIELDS = [
  'workoutName',
  'description',
  'category',
  'duration',
  'schedule',
  'exercises', // [{ name, sets, reps, weight, restInterval, completed? }]
  'status',
  'assignedMember',
  'assignedTrainer',
  // Phase‑8.3 additional fields
  'trainerNotes',
  'memberFeedback',
];

/** --------------------------------------------------------------
 * GET /api/workouts – list workouts visible to the requester
 */
export const getWorkouts = async (req, res) => {
  const query = {};

  // Role‑based scoping
  if (req.user.role === 'member') {
    query.assignedMember = req.user.id;
  } else if (req.user.role === 'trainer') {
    // Trainer can view own workouts or filter by a specific member
    if (req.query.memberId) {
      query.assignedMember = req.query.memberId;
    } else if (req.query.all !== 'true') {
      query.assignedTrainer = req.user.id;
    }
  } else if (req.user.role === 'admin') {
    if (req.query.memberId) query.assignedMember = req.query.memberId;
    if (req.query.trainerId) query.assignedTrainer = req.query.trainerId;
  }

  // Additional optional filters
  if (req.query.status) query.status = req.query.status;
  if (req.query.category) query.category = req.query.category;
  if (req.query.search) {
    const regex = new RegExp(req.query.search, 'i');
    query.$or = [
      { workoutName: regex },
      { category: regex },
      { description: regex },
    ];
  }

  const workouts = await Workout.find(query)
    .populate('assignedMember', 'fullName email phone gender profileImage')
    .populate('assignedTrainer', 'fullName email phone profileImage')
    .sort({ createdAt: -1 });

  res.status(200).json({ success: true, count: workouts.length, data: workouts });
};

/** --------------------------------------------------------------
 * GET /api/workouts/:id – fetch single workout (access‑controlled)
 */
export const getWorkoutById = async (req, res) => {
  const workout = await Workout.findById(req.params.id)
    .populate('assignedMember', 'fullName email phone gender profileImage')
    .populate('assignedTrainer', 'fullName email phone profileImage');

  if (!workout) throw new ApiError(404, 'Workout not found');

  // Members may only view their own workouts
  if (req.user.role === 'member' && workout.assignedMember?.toString() !== req.user.id) {
    throw new ApiError(403, 'You do not have access to this workout');
  }

  res.status(200).json({ success: true, data: workout });
};

/** --------------------------------------------------------------
 * POST /api/workouts – create a new workout (trainers & admin only)
 */
export const createWorkout = async (req, res) => {
  if (req.user.role === 'member') {
    throw new ApiError(403, 'Members are not permitted to create workouts');
  }

  const body = pick(req.body, WORKOUT_FIELDS);

  // Auto‑assign trainer when a trainer creates the workout
  if (req.user.role === 'trainer') body.assignedTrainer = req.user.id;

  // Validate required fields
  const required = ['workoutName', 'description', 'category', 'duration', 'assignedMember', 'assignedTrainer'];
  for (const f of required) {
    if (!body[f]) throw new ApiError(400, `Missing required field: ${f}`);
  }

  // Verify member exists and has correct role
  const member = await User.findById(body.assignedMember);
  if (!member || member.role !== 'member') {
    throw new ApiError(400, 'assignedMember must be an existing member');
  }

  // Verify trainer exists and has correct role (admin may provide a trainer id)
  const trainer = await User.findById(body.assignedTrainer);
  if (!trainer || trainer.role !== 'trainer') {
    throw new ApiError(400, 'assignedTrainer must be an existing trainer');
  }

  const workout = await Workout.create(body);
  const populated = await Workout.findById(workout._id)
    .populate('assignedMember', 'fullName email phone gender profileImage')
    .populate('assignedTrainer', 'fullName email phone profileImage');

  res.status(201).json({ success: true, message: 'Workout created', data: populated });
};

/** --------------------------------------------------------------
 * PATCH /api/workouts/:id – generic workout update (role‑aware)
 */
export const updateWorkout = async (req, res) => {
  const workout = await Workout.findById(req.params.id);
  if (!workout) throw new ApiError(404, 'Workout not found');

  // Role‑based access control
  if (req.user.role === 'member') {
    if (workout.assignedMember?.toString() !== req.user.id) {
      throw new ApiError(403, 'You cannot modify this workout');
    }
    // Members may only change status
    if (req.body.status) workout.status = req.body.status;
  } else if (req.user.role === 'trainer') {
    if (workout.assignedTrainer?.toString() !== req.user.id) {
      throw new ApiError(403, 'You can only update workouts assigned to you');
    }
    const updatable = ['workoutName', 'description', 'category', 'duration', 'schedule', 'exercises', 'status'];
    Object.assign(workout, pick(req.body, updatable));
  } else if (req.user.role === 'admin') {
    Object.assign(workout, pick(req.body, WORKOUT_FIELDS));
  } else {
    throw new ApiError(403, 'Unauthorized');
  }

  if (workout.status === 'completed' && !workout.completedAt) {
    workout.completedAt = new Date();
  }

  await workout.save();

  const populated = await Workout.findById(workout._id)
    .populate('assignedMember', 'fullName email phone gender profileImage')
    .populate('assignedTrainer', 'fullName email phone profileImage');

  res.status(200).json({ success: true, message: 'Workout updated', data: populated });
};

/** --------------------------------------------------------------
 * PATCH /api/workouts/:id/exercises/:exerciseIdx – toggle exercise completion
 */
export const updateExerciseProgress = async (req, res) => {
  const { id } = req.params; // workout id
  const { exerciseIdx } = req.params; // index from route
  const { completed } = req.body;

  if (typeof completed !== 'boolean') {
    throw new ApiError(400, 'completed flag must be boolean');
  }

  const workout = await Workout.findById(id);
  if (!workout) throw new ApiError(404, 'Workout not found');

  // Permission check
  const isMember = req.user.role === 'member' && workout.assignedMember?.toString() === req.user.id;
  const isTrainer = req.user.role === 'trainer' && workout.assignedTrainer?.toString() === req.user.id;
  const isAdmin = req.user.role === 'admin';
  if (!isMember && !isTrainer && !isAdmin) {
    throw new ApiError(403, 'You do not have permission to modify this exercise');
  }

  const idx = parseInt(exerciseIdx, 10);
  if (Number.isNaN(idx) || idx < 0 || idx >= (workout.exercises?.length || 0)) {
    throw new ApiError(400, 'Invalid exercise index');
  }

  // Only members may toggle the completed flag
  if (isMember) {
    workout.exercises[idx].completed = completed;
    await workout.save();
  }

  const populated = await Workout.findById(id)
    .populate('assignedMember', 'fullName email phone gender profileImage')
    .populate('assignedTrainer', 'fullName email phone profileImage');

  res.status(200).json({ success: true, data: populated });
};

/** --------------------------------------------------------------
 * PATCH /api/workouts/:id/status – explicit status change
 */
export const updateWorkoutStatus = async (req, res) => {
  const { status } = req.body;
  const allowed = ['assigned', 'in-progress', 'completed'];
  if (!allowed.includes(status)) {
    throw new ApiError(400, 'Status must be assigned, in-progress, or completed');
  }

  const workout = await Workout.findById(req.params.id);
  if (!workout) throw new ApiError(404, 'Workout not found');

  const isMember = req.user.role === 'member' && workout.assignedMember?.toString() === req.user.id;
  const isTrainer = req.user.role === 'trainer' && workout.assignedTrainer?.toString() === req.user.id;
  const isAdmin = req.user.role === 'admin';
  if (!isMember && !isTrainer && !isAdmin) {
    throw new ApiError(403, 'You do not have permission to update this workout status');
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
    message: `Workout status changed to ${status}`,
    data: populated,
  });
};

/** --------------------------------------------------------------
 * DELETE /api/workouts/:id – remove a workout (trainer for own, admin any)
 */
export const deleteWorkout = async (req, res) => {
  const workout = await Workout.findById(req.params.id);
  if (!workout) throw new ApiError(404, 'Workout not found');

  if (req.user.role === 'member') {
    throw new ApiError(403, 'Members cannot delete workouts');
  }

  if (req.user.role === 'trainer' && workout.assignedTrainer?.toString() !== req.user.id) {
    throw new ApiError(403, 'Trainers can only delete their own workouts');
  }

  await Workout.findByIdAndDelete(req.params.id);
  res.status(200).json({ success: true, message: 'Workout deleted successfully' });
};
