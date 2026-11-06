import mongoose from 'mongoose';
import env from './env.js';
import Attendance from '../models/attendance.model.js';
import Membership from '../models/membership.model.js';
import Payment from '../models/payment.model.js';
import User from '../models/user.model.js';
import Workout from '../models/workout.model.js';

const redact = (message) =>
  String(message || 'Database connection failed.').replace(
    /mongodb(?:\+srv)?:\/\/[^\s]+/gi,
    'mongodb://[redacted]',
  );

export const connectDB = async () => {
  if (!env.mongoUri) {
    throw new Error(
      'MONGO_URI is missing. Add your MongoDB Atlas connection string to backend/.env.',
    );
  }

  mongoose.set('strictQuery', true);

  try {
    await mongoose.connect(env.mongoUri, {
      serverSelectionTimeoutMS: 10000,
    });
    await Promise.all([
      User.init(),
      Membership.init(),
      Workout.init(),
      Payment.init(),
      Attendance.init(),
    ]);
    console.log('MongoDB connected.');
  } catch (error) {
    throw new Error(redact(error.message));
  }
};

export const disconnectDB = async () => {
  await mongoose.disconnect();
};
