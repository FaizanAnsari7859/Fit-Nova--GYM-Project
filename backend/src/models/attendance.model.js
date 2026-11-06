import mongoose from 'mongoose';
import User from './user.model.js';

const attendanceSchema = new mongoose.Schema(
  {
    member: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Member is required.'],
      validate: {
        validator: async (id) => {
          const user = await User.findById(id).select('role');
          return user?.role === 'member';
        },
        message: 'Member must be an existing member.',
      },
    },
    checkInTime: {
      type: Date,
      required: [true, 'Check-in time is required.'],
    },
    checkOutTime: {
      type: Date,
      default: null,
      validate: {
        validator(value) {
          if (!value || !this.checkInTime) {
            return true;
          }

          return value >= this.checkInTime;
        },
        message: 'Check-out time must be after check-in time.',
      },
    },
    attendanceDate: {
      type: Date,
      required: [true, 'Attendance date is required.'],
    },
    status: {
      type: String,
      enum: {
        values: ['present', 'absent', 'late'],
        message: 'Status must be present, absent, or late.',
      },
      default: 'present',
    },
  },
  { timestamps: true },
);

attendanceSchema.index({ member: 1, attendanceDate: 1 });

const Attendance = mongoose.model('Attendance', attendanceSchema);

export default Attendance;
