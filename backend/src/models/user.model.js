import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, 'Full name is required.'],
      trim: true,
      minlength: [2, 'Full name must be at least 2 characters.'],
      maxlength: [80, 'Full name must be 80 characters or fewer.'],
    },
    email: {
      type: String,
      required: [true, 'Email is required.'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'A valid email address is required.'],
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required.'],
      unique: true,
      trim: true,
      set: (value) => String(value || '').replace(/\D/g, ''),
      validate: {
        validator: (value) => /^\d{10,15}$/.test(value),
        message: 'Phone number must contain 10 to 15 digits.',
      },
    },
    password: {
      type: String,
      required: [true, 'Password is required.'],
      minlength: [8, 'Password must be at least 8 characters.'],
      select: false,
    },
    gender: {
      type: String,
      required: [true, 'Gender is required.'],
      enum: {
        values: ['male', 'female', 'other'],
        message: 'Gender must be male, female, or other.',
      },
    },
    dateOfBirth: {
      type: Date,
      required: [true, 'Date of birth is required.'],
    },
    role: {
      type: String,
      required: [true, 'Role is required.'],
      enum: {
        values: ['admin', 'trainer', 'member'],
        message: 'Role must be admin, trainer, or member.',
      },
      index: true,
    },
    profileImage: {
      type: String,
      trim: true,
      default: '',
    },
    specialization: {
      type: String,
      trim: true,
      default: '',
      maxlength: [100, 'Specialization must be 100 characters or fewer.'],
    },
    experienceYears: {
      type: Number,
      default: 0,
      min: [0, 'Experience years cannot be negative.'],
    },
    bio: {
      type: String,
      trim: true,
      default: '',
      maxlength: [500, 'Bio must be 500 characters or fewer.'],
    },
    certifications: {
      type: [String],
      default: [],
    },
    assignedTrainer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: true },
  },
);

userSchema.pre('save', async function () {
  if (!this.isModified('password')) {
    return;
  }

  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.comparePassword = function (plainPassword) {
  return bcrypt.compare(plainPassword, this.password);
};

userSchema.set('toJSON', {
  transform: (_document, plain) => {
    delete plain.password;
    return plain;
  },
});

userSchema.set('toObject', {
  transform: (_document, plain) => {
    delete plain.password;
    return plain;
  },
});

const User = mongoose.model('User', userSchema);

export default User;
