import mongoose from 'mongoose';

const subscriptionSchema = new mongoose.Schema(
  {
    member: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Member is required.'],
      index: true,
    },
    membershipPlan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Membership',
      required: [true, 'Membership plan is required.'],
      index: true,
    },
    payment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      default: null,
      index: true,
    },
    startDate: {
      type: Date,
      required: [true, 'Start date is required.'],
      default: Date.now,
    },
    endDate: {
      type: Date,
      required: [true, 'End date is required.'],
      index: true,
    },
    status: {
      type: String,
      enum: {
        values: ['active', 'expired', 'cancelled'],
        message: 'Status must be active, expired, or cancelled.',
      },
      default: 'active',
      index: true,
    },
    autoRenew: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

// Compound indexes for common queries, sorting and expiry lookups
subscriptionSchema.index({ member: 1, status: 1, endDate: -1 });
subscriptionSchema.index({ status: 1, endDate: 1 });
subscriptionSchema.index({ membershipPlan: 1, status: 1 });

const Subscription = mongoose.model('Subscription', subscriptionSchema);

export default Subscription;
