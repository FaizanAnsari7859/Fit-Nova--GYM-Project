import mongoose from 'mongoose';

const membershipSchema = new mongoose.Schema(
  {
    planName: {
      type: String,
      required: [true, 'Plan name is required.'],
      trim: true,
      maxlength: [80, 'Plan name must be 80 characters or fewer.'],
    },
    description: {
      type: String,
      trim: true,
      default: '',
      maxlength: [500, 'Description must be 500 characters or fewer.'],
    },
    duration: {
      type: Number,
      required: [true, 'Duration is required.'],
      min: [1, 'Duration must be at least 1 day.'],
    },
    price: {
      type: Number,
      required: [true, 'Price is required.'],
      min: [0, 'Price cannot be negative.'],
    },
    features: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: {
        values: ['active', 'inactive'],
        message: 'Status must be active or inactive.',
      },
      default: 'active',
      index: true,
    },
  },
  { timestamps: true },
);

const Membership = mongoose.model('Membership', membershipSchema);

export default Membership;
