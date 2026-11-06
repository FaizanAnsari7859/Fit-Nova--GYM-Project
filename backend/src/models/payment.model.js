import mongoose from 'mongoose';
import Membership from './membership.model.js';
import User from './user.model.js';

const paymentSchema = new mongoose.Schema(
  {
    member: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Member is required.'],
      index: true,
      validate: {
        validator: async (id) => {
          const user = await User.findById(id).select('role');
          return user?.role === 'member';
        },
        message: 'Member must be an existing member.',
      },
    },
    membership: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Membership',
      required: [true, 'Membership is required.'],
      index: true,
      validate: {
        validator: async (id) => Boolean(await Membership.exists({ _id: id })),
        message: 'Membership plan was not found.',
      },
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required.'],
      min: [0, 'Amount cannot be negative.'],
    },
    paymentStatus: {
      type: String,
      enum: {
        values: ['pending', 'paid', 'failed'],
        message: 'Payment status must be pending, paid, or failed.',
      },
      default: 'pending',
      index: true,
    },
    transactionReference: {
      type: String,
      required: [true, 'Transaction reference is required.'],
      unique: true,
      trim: true,
      maxlength: [80, 'Transaction reference must be 80 characters or fewer.'],
    },
    paymentDate: {
      type: Date,
      required: [true, 'Payment date is required.'],
    },
  },
  { timestamps: true },
);

const Payment = mongoose.model('Payment', paymentSchema);

export default Payment;
