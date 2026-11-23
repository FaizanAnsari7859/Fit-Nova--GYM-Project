import Attendance from '../models/attendance.model.js';
import Membership from '../models/membership.model.js';
import Payment from '../models/payment.model.js';
import Subscription from '../models/subscription.model.js';
import User from '../models/user.model.js';
import Workout from '../models/workout.model.js';
import { computeMembershipExpiry } from '../utils/membershipUtils.js';

export const getReports = async (req, res) => {
  const { type = 'all', startDate, endDate, status } = req.query;

  // Build date filter if provided
  const dateFilter = {};
  if (startDate) {
    const s = new Date(startDate);
    if (!isNaN(s.getTime())) {
      dateFilter.$gte = s;
    }
  }
  if (endDate) {
    const e = new Date(endDate);
    if (!isNaN(e.getTime())) {
      e.setHours(23, 59, 59, 999);
      dateFilter.$lte = e;
    }
  }
  const hasDateFilter = Object.keys(dateFilter).length > 0;

  // 1. Overall System Counts
  const [totalMembers, totalTrainers, totalWorkouts] = await Promise.all([
    User.countDocuments({ role: 'member' }),
    User.countDocuments({ role: 'trainer' }),
    Workout.countDocuments(),
  ]);

  // 2. Membership report
  const [allPlans, allPaidPayments, allSubscriptions] = await Promise.all([
    Membership.find().lean(),
    Payment.find({ paymentStatus: 'paid' })
      .populate('membership')
      .populate('subscription')
      .sort({ paymentDate: -1, createdAt: -1 })
      .lean(),
    Subscription.find()
      .populate('membershipPlan')
      .sort({ endDate: -1 })
      .lean(),
  ]);

  const planSubscribers = {};
  const planRevenue = {};
  for (const p of allPaidPayments) {
    const planId = p.membership?._id?.toString();
    if (planId) {
      planSubscribers[planId] = (planSubscribers[planId] || 0) + 1;
      planRevenue[planId] = (planRevenue[planId] || 0) + (p.amount || 0);
    }
  }

  // Calculate latest valid paid payment or subscription per member to accurately determine subscription status
  const memberLatestPayment = new Map();
  for (const p of allPaidPayments) {
    const mId = p.member?.toString();
    if (!mId) continue;
    const info = computeMembershipExpiry(p, p.subscription);
    if (!info) continue;

    const existing = memberLatestPayment.get(mId);
    if (!existing || info.expiryDate.getTime() > existing.info.expiryDate.getTime()) {
      memberLatestPayment.set(mId, { payment: p, info });
    }
  }

  // Factor in dedicated Subscription records
  for (const s of allSubscriptions) {
    const mId = s.member?.toString();
    if (!mId) continue;
    const info = computeMembershipExpiry(null, s);
    if (!info) continue;

    const existing = memberLatestPayment.get(mId);
    if (!existing || info.expiryDate.getTime() > existing.info.expiryDate.getTime()) {
      memberLatestPayment.set(mId, { subscription: s, info });
    }
  }

  let activeSubscriptions = 0;
  let expiredSubscriptions = 0;

  for (const { info } of memberLatestPayment.values()) {
    if (info.isActive) {
      activeSubscriptions++;
    } else {
      expiredSubscriptions++;
    }
  }

  const membershipReport = {
    totalPlans: allPlans.length,
    activePlans: allPlans.filter((p) => p.status === 'active').length,
    inactivePlans: allPlans.filter((p) => p.status === 'inactive').length,
    activeSubscriptions,
    expiredSubscriptions,
    plans: allPlans.map((plan) => ({
      _id: plan._id,
      planName: plan.planName,
      price: plan.price,
      duration: plan.duration,
      status: plan.status,
      subscribersCount: planSubscribers[plan._id.toString()] || 0,
      totalRevenue: planRevenue[plan._id.toString()] || 0,
    })),
  };

  // 3. Payment report
  const paymentQuery = {};
  if (hasDateFilter) paymentQuery.paymentDate = dateFilter;
  if (status && ['paid', 'pending', 'failed'].includes(status)) {
    paymentQuery.paymentStatus = status;
  }

  const payments = await Payment.find(paymentQuery)
    .populate('member', 'fullName email phone')
    .populate('membership', 'planName price')
    .sort({ paymentDate: -1 })
    .lean();

  let paidRevenue = 0;
  let pendingAmount = 0;
  let failedAmount = 0;
  let paidCount = 0;
  let pendingCount = 0;
  let failedCount = 0;

  for (const p of payments) {
    if (p.paymentStatus === 'paid') {
      paidRevenue += p.amount;
      paidCount++;
    } else if (p.paymentStatus === 'pending') {
      pendingAmount += p.amount;
      pendingCount++;
    } else if (p.paymentStatus === 'failed') {
      failedAmount += p.amount;
      failedCount++;
    }
  }

  const paymentReport = {
    totalRevenue: paidRevenue,
    pendingAmount,
    failedAmount,
    totalCount: payments.length,
    paidCount,
    pendingCount,
    failedCount,
    payments,
  };

  // 4. Attendance report
  const attendanceQuery = {};
  if (hasDateFilter) attendanceQuery.attendanceDate = dateFilter;
  if (status && ['present', 'absent', 'late'].includes(status)) {
    attendanceQuery.status = status;
  }

  const attendanceRecords = await Attendance.find(attendanceQuery)
    .populate('member', 'fullName email phone')
    .sort({ checkInTime: -1 })
    .lean();

  let presentCount = 0;
  let lateCount = 0;
  let absentCount = 0;
  const uniqueMemberSet = new Set();

  for (const a of attendanceRecords) {
    if (a.status === 'present') presentCount++;
    else if (a.status === 'late') lateCount++;
    else if (a.status === 'absent') absentCount++;
    if (a.member?._id) uniqueMemberSet.add(a.member._id.toString());
  }

  const attendanceReport = {
    totalRecords: attendanceRecords.length,
    presentCount,
    lateCount,
    absentCount,
    uniqueMembersAttended: uniqueMemberSet.size,
    records: attendanceRecords,
  };

  // 5. Registration report
  const registrationQuery = {};
  if (hasDateFilter) registrationQuery.createdAt = dateFilter;
  if (status && ['member', 'trainer', 'admin'].includes(status)) {
    registrationQuery.role = status;
  }

  const registrations = await User.find(registrationQuery)
    .select('_id fullName email phone role gender createdAt')
    .sort({ createdAt: -1 })
    .lean();

  const registrationReport = {
    totalRegistrations: registrations.length,
    membersCount: registrations.filter((u) => u.role === 'member').length,
    trainersCount: registrations.filter((u) => u.role === 'trainer').length,
    registrations,
  };

  // Combined Summary
  const summary = {
    totalMembers,
    totalTrainers,
    activeMemberships: membershipReport.activeSubscriptions,
    expiredMemberships: membershipReport.expiredSubscriptions,
    totalPlans: membershipReport.totalPlans,
    activePlans: membershipReport.activePlans,
    inactivePlans: membershipReport.inactivePlans,
    totalRevenue: paymentReport.totalRevenue,
    pendingRevenue: paymentReport.pendingAmount,
    totalCheckIns: attendanceReport.totalRecords,
    totalWorkouts,
  };

  res.status(200).json({
    success: true,
    data: {
      type,
      summary,
      membershipReport: ['all', 'membership'].includes(type) ? membershipReport : undefined,
      paymentReport: ['all', 'payments'].includes(type) ? paymentReport : undefined,
      attendanceReport: ['all', 'attendance'].includes(type) ? attendanceReport : undefined,
      registrationReport: ['all', 'registrations'].includes(type) ? registrationReport : undefined,
    },
  });
};

