import mongoose from 'mongoose';
import User from './user.model.js';

const exerciseSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      default: '',
    },
    sets: {
      type: Number,
      default: 3,
      min: 1,
    },
    reps: {
      type: Number,
      default: 10,
      min: 1,
    },
    weight: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { _id: false },
);

const workoutSchema = new mongoose.Schema(
  {
    workoutName: {
      type: String,
      required: [true, 'Workout name is required.'],
      trim: true,
      maxlength: [80, 'Workout name must be 80 characters or fewer.'],
    },
    description: {
      type: String,
      required: [true, 'Description is required.'],
      trim: true,
      maxlength: [1000, 'Description must be 1000 characters or fewer.'],
    },
    category: {
      type: String,
      required: [true, 'Category is required.'],
      trim: true,
      maxlength: [60, 'Category must be 60 characters or fewer.'],
      index: true,
    },
    duration: {
      type: Number,
      required: [true, 'Duration is required.'],
      min: [1, 'Duration must be at least 1 minute.'],
    },
    schedule: {
      type: String,
      trim: true,
      default: '',
      maxlength: [100, 'Schedule must be 100 characters or fewer.'],
    },
    exercises: {
      type: [exerciseSchema],
      default: [],
    },
    status: {
      type: String,
      enum: {
        values: ['assigned', 'in-progress', 'completed'],
        message: 'Status must be assigned, in-progress, or completed.',
      },
      default: 'assigned',
      index: true,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    assignedMember: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Assigned member is required.'],
      index: true,
      validate: {
        validator: async (id) => {
          const user = await User.findById(id).select('role');
          return user?.role === 'member';
        },
        message: 'Assigned member must be an existing member.',
      },
    },
    assignedTrainer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Assigned trainer is required.'],
      index: true,
      validate: {
        validator: async (id) => {
          const user = await User.findById(id).select('role');
          return user?.role === 'trainer';
        },
        message: 'Assigned trainer must be an existing trainer.',
      },
    },
  },
  { timestamps: true },
);

const Workout = mongoose.model('Workout', workoutSchema);

export default Workout;
