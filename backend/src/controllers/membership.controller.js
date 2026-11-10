import Membership from '../models/membership.model.js';
import Payment from '../models/payment.model.js';
import User from '../models/user.model.js';
import { ApiError } from '../utils/apiError.js';
import { pick } from '../utils/pick.js';

const PLAN_FIELDS = ['planName', 'description', 'duration', 'price', 'features', 'status'];

export const getMemberships = async (req, res) => {
  const filter = {};
  if (req.query.status) {
    filter.status = req.query.status;
  }

  const plans = await Membership.find(filter).sort({ price: 1, createdAt: -1 });
  res.status(200).json({ success: true, count: plans.length, data: plans });
};

export const getMembershipById = async (req, res) => {
  const plan = await Membership.findById(req.params.id);
  if (!plan) {
    throw new ApiError(404, 'Membership plan not found.');
  }

  res.status(200).json({ success: true, data: plan });
};

export const createMembership = async (req, res) => {
  const body = pick(req.body, PLAN_FIELDS);
  if (!body.planName || body.duration === undefined || body.price === undefined) {
    throw new ApiError(400, 'Plan name, duration, and price are required.');
  }

  const plan = await Membership.create(body);
  res.status(201).json({
    success: true,
    message: 'Membership plan created successfully.',
    data: plan,
  });
};

export const updateMembership = async (req, res) => {
  const plan = await Membership.findById(req.params.id);
  if (!plan) {
    throw new ApiError(404, 'Membership plan not found.');
  }

  Object.assign(plan, pick(req.body, PLAN_FIELDS));
  await plan.save();

  res.status(200).json({
    success: true,
    message: 'Membership plan updated successfully.',
    data: plan,
  });
};

export const deleteMembership = async (req, res) => {
  const plan = await Membership.findByIdAndDelete(req.params.id);
  if (!plan) {
    throw new ApiError(404, 'Membership plan not found.');
  }

  res.status(200).json({
    success: true,
    message: 'Membership plan deleted successfully.',
  });
};

export const assignMembership = async (req, res) => {
  const { memberId, amount, paymentStatus } = req.body;
  const plan = await Membership.findById(req.params.id);
  if (!plan) {
    throw new ApiError(404, 'Membership plan not found.');
  }

  const member = await User.findById(memberId);
  if (!member || member.role !== 'member') {
    throw new ApiError(400, 'A valid member must be selected.');
  }

  const transactionRef = `TXN-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

  const payment = await Payment.create({
    member: member._id,
    membership: plan._id,
    amount: amount !== undefined ? Number(amount) : plan.price,
    paymentStatus: paymentStatus || 'paid',
    transactionReference: transactionRef,
    paymentDate: new Date(),
  });

  const populated = await Payment.findById(payment._id)
    .populate('member', 'fullName email phone')
    .populate('membership');

  res.status(201).json({
    success: true,
    message: `Membership plan "${plan.planName}" assigned to ${member.fullName}.`,
    data: populated,
  });
};

