import crypto from 'crypto';
import mongoose from 'mongoose';
import Payment from '../models/payment.model.js';
import User from '../models/user.model.js';
import Membership from '../models/membership.model.js';
import Subscription from '../models/subscription.model.js';
import { ApiError } from '../utils/apiError.js';
import { pick } from '../utils/pick.js';
import { createOrRenewSubscription } from '../utils/membershipUtils.js';

const ALLOWED_STATUSES = ['pending', 'paid', 'failed'];

// Helper to build filter based on role and query params
const buildFilter = async (user, query) => {
  const filter = {};
  const requestedMember = query.member || query.memberId;

  // 1. Role-based base scoping
  if (user.role === 'member') {
    // Members can strictly only access their own payments
    filter.member = user.id;
  } else if (user.role === 'trainer') {
    // Trainers can only access payments for members assigned to them
    const assignedMembers = await User.find({ assignedTrainer: user.id, role: 'member' }).select('_id');
    const assignedMemberIds = assignedMembers.map((m) => m._id.toString());

    if (requestedMember) {
      if (!mongoose.Types.ObjectId.isValid(requestedMember)) {
        throw new ApiError(400, 'Invalid member ID format.');
      }
      if (assignedMemberIds.includes(requestedMember.toString())) {
        filter.member = requestedMember;
      } else {
        // Requested member is not assigned to this trainer -> ensure 0 records matched
        filter.member = new mongoose.Types.ObjectId();
      }
    } else {
      filter.member = { $in: assignedMembers.map((m) => m._id) };
    }
  } else if (user.role === 'admin') {
    // Admin can view all or filter by specific member
    if (requestedMember) {
      if (!mongoose.Types.ObjectId.isValid(requestedMember)) {
        throw new ApiError(400, 'Invalid member ID format.');
      }
      filter.member = requestedMember;
    }
  }

  // 2. Status filter
  const requestedStatus = query.status || query.paymentStatus;
  if (requestedStatus) {
    if (!ALLOWED_STATUSES.includes(requestedStatus)) {
      throw new ApiError(400, `Invalid payment status. Allowed: ${ALLOWED_STATUSES.join(', ')}`);
    }
    filter.paymentStatus = requestedStatus;
  }

  // 3. Date range filters
  if (query.startDate || query.endDate) {
    filter.paymentDate = {};
    if (query.startDate) {
      const start = new Date(query.startDate);
      if (isNaN(start.getTime())) {
        throw new ApiError(400, 'Invalid startDate format.');
      }
      filter.paymentDate.$gte = start;
    }
    if (query.endDate) {
      const end = new Date(query.endDate);
      if (isNaN(end.getTime())) {
        throw new ApiError(400, 'Invalid endDate format.');
      }
      filter.paymentDate.$lte = end;
    }
  }

  return filter;
};

// GET /payments – list with pagination & filters
export const listPayments = async (req, res) => {
  const { page = 1, limit = 10, ...query } = req.query;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));

  const filter = await buildFilter(req.user, query);

  const [payments, total] = await Promise.all([
    Payment.find(filter)
      .populate('member', 'fullName email phone')
      .populate('membership', 'planName price duration')
      .sort({ paymentDate: -1, createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Payment.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    page: pageNum,
    limit: limitNum,
    total,
    totalPages: Math.ceil(total / limitNum) || 1,
    count: payments.length,
    data: payments,
  });
};

// GET /payments/:id – single payment (enforces role check via filter)
export const getPayment = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    throw new ApiError(400, 'Invalid payment ID format.');
  }

  const filter = await buildFilter(req.user, {});
  const payment = await Payment.findOne({ _id: req.params.id, ...filter })
    .populate('member', 'fullName email phone')
    .populate('membership', 'planName price duration');

  if (!payment) {
    throw new ApiError(404, 'Payment not found or access denied.');
  }

  res.status(200).json({ success: true, data: payment });
};

// POST /payments – only admin can create manual payment records
export const createPayment = async (req, res) => {
  if (req.user.role !== 'admin') {
    throw new ApiError(403, 'Only admins can create payments.');
  }

  const {
    member,
    membership,
    amount,
    paymentStatus = 'pending',
    transactionReference,
    paymentDate,
    receiptUrl = '',
  } = req.body;

  // Basic validation
  if (!member || !membership || amount === undefined || !paymentDate) {
    throw new ApiError(400, 'member, membership, amount, and paymentDate are required.');
  }

  if (!mongoose.Types.ObjectId.isValid(member)) {
    throw new ApiError(400, 'Invalid member ID format.');
  }

  if (!mongoose.Types.ObjectId.isValid(membership)) {
    throw new ApiError(400, 'Invalid membership ID format.');
  }

  // Verify member exists and is a member
  const memberDoc = await User.findById(member);
  if (!memberDoc || memberDoc.role !== 'member') {
    throw new ApiError(400, 'Selected user must be an existing member.');
  }

  // Verify membership exists
  const membershipDoc = await Membership.findById(membership);
  if (!membershipDoc) {
    throw new ApiError(400, 'Selected membership plan was not found.');
  }

  // Ensure amount is a non-negative number
  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount < 0) {
    throw new ApiError(400, 'Amount must be a non-negative number.');
  }

  if (!ALLOWED_STATUSES.includes(paymentStatus)) {
    throw new ApiError(400, `Invalid payment status. Allowed: ${ALLOWED_STATUSES.join(', ')}`);
  }

  // S12: Collision-resistant reference generation using crypto.randomUUID()
  const txnRef = transactionReference?.trim() || `TXN-${crypto.randomUUID()}`;

  const parsedDate = new Date(paymentDate);
  if (isNaN(parsedDate.getTime())) {
    throw new ApiError(400, 'Invalid paymentDate format.');
  }

  const payment = await Payment.create({
    member,
    membership,
    amount: numAmount,
    paymentStatus,
    transactionReference: txnRef,
    receiptUrl: String(receiptUrl || '').trim(),
    paymentDate: parsedDate,
  });

  // Auto-generate receipt URL for paid payments if not custom provided
  if (payment.paymentStatus === 'paid' && !payment.receiptUrl) {
    payment.receiptUrl = `/api/payments/${payment._id}/receipt/download`;
    await payment.save();
  }

  // S10/S17: Create or renew individual member subscription upon paid status
  if (payment.paymentStatus === 'paid') {
    const subscription = await createOrRenewSubscription({
      memberId: member,
      planId: membership,
      paymentId: payment._id,
      paymentDate: parsedDate,
      durationDays: membershipDoc.duration,
    });
    payment.subscription = subscription._id;
  }

  const populated = await Payment.findById(payment._id)
    .populate('member', 'fullName email phone')
    .populate('membership', 'planName price duration')
    .populate('subscription');

  res.status(201).json({ success: true, data: populated });
};

// PATCH /payments/:id – status updates (admin can update any; trainer only status for assigned members; member none)
export const updatePayment = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    throw new ApiError(400, 'Invalid payment ID format.');
  }

  if (req.user.role === 'member') {
    throw new ApiError(403, 'Members are not authorized to update payments.');
  }

  // Load payment with role-based filter to enforce ownership/assignment
  const baseFilter = await buildFilter(req.user, {});
  const payment = await Payment.findOne({ _id: req.params.id, ...baseFilter });
  if (!payment) {
    throw new ApiError(404, 'Payment not found or access denied.');
  }

  const allowedFields = ['paymentStatus', 'amount', 'paymentDate', 'transactionReference', 'receiptUrl'];
  const updates = pick(req.body, allowedFields);

  // Trainer cannot modify fields other than paymentStatus
  if (req.user.role === 'trainer') {
    const updateKeys = Object.keys(updates);
    if (updateKeys.some((k) => k !== 'paymentStatus')) {
      throw new ApiError(403, 'Trainers may only update payment status for assigned members.');
    }
  }

  // Validate status transition if provided
  if (updates.paymentStatus) {
    if (!ALLOWED_STATUSES.includes(updates.paymentStatus)) {
      throw new ApiError(400, `Invalid payment status. Allowed: ${ALLOWED_STATUSES.join(', ')}`);
    }
  }

  if (updates.amount !== undefined) {
    const numAmount = Number(updates.amount);
    if (isNaN(numAmount) || numAmount < 0) {
      throw new ApiError(400, 'Amount must be a non-negative number.');
    }
    updates.amount = numAmount;
  }

  if (updates.paymentDate !== undefined) {
    const parsedDate = new Date(updates.paymentDate);
    if (isNaN(parsedDate.getTime())) {
      throw new ApiError(400, 'Invalid paymentDate format.');
    }
    updates.paymentDate = parsedDate;
  }

  const prevStatus = payment.paymentStatus;
  if (updates.paymentStatus === 'paid' && !payment.receiptUrl && !updates.receiptUrl) {
    updates.receiptUrl = `/api/payments/${payment._id}/receipt/download`;
  }
  Object.assign(payment, updates);
  await payment.save();

  // S10/S17: Update subscription status if paymentStatus transitioned
  if (updates.paymentStatus === 'paid' && prevStatus !== 'paid') {
    const membershipDoc = await Membership.findById(payment.membership);
    const subscription = await createOrRenewSubscription({
      memberId: payment.member,
      planId: payment.membership,
      paymentId: payment._id,
      paymentDate: payment.paymentDate,
      durationDays: membershipDoc?.duration || 30,
    });
    payment.subscription = subscription._id;
  } else if (updates.paymentStatus === 'failed' && payment.subscription) {
    await Subscription.findByIdAndUpdate(payment.subscription, { status: 'cancelled' });
  }

  const populated = await Payment.findById(payment._id)
    .populate('member', 'fullName email phone')
    .populate('membership', 'planName price duration')
    .populate('subscription');

  res.status(200).json({ success: true, data: populated });
};

// DELETE /payments/:id – admin only
export const deletePayment = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    throw new ApiError(400, 'Invalid payment ID format.');
  }

  if (req.user.role !== 'admin') {
    throw new ApiError(403, 'Only admins can delete payments.');
  }

  const payment = await Payment.findByIdAndDelete(req.params.id);
  if (!payment) {
    throw new ApiError(404, 'Payment not found.');
  }

  res.status(200).json({ success: true, message: 'Payment deleted.' });
};

// GET /payments/:id/receipt – returns structured receipt details or 404
export const getReceipt = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    throw new ApiError(400, 'Invalid payment ID format.');
  }

  const filter = await buildFilter(req.user, {});
  const payment = await Payment.findOne({ _id: req.params.id, ...filter })
    .populate('member', 'fullName email phone')
    .populate('membership', 'planName price duration');

  if (!payment) {
    throw new ApiError(404, 'Payment not found or access denied.');
  }

  // If payment has an explicit receiptUrl document, return it (preserves existing records & tests)
  // Otherwise, only generate dynamic receipt for successful paid transactions
  if (!payment.receiptUrl && payment.paymentStatus !== 'paid') {
    throw new ApiError(404, 'Receipt not available for this payment.');
  }

  // Handle old payment records that do not have receipt documents
  const receiptUrl = payment.receiptUrl || `/api/payments/${payment._id}/receipt/download`;

  res.status(200).json({
    success: true,
    data: {
      receiptUrl,
      transactionReference: payment.transactionReference,
      amount: payment.amount,
      paymentDate: payment.paymentDate,
      paymentStatus: payment.paymentStatus,
      member: {
        _id: payment.member?._id,
        fullName: payment.member?.fullName || 'Valued Member',
        email: payment.member?.email || '',
        phone: payment.member?.phone || '',
      },
      membership: {
        _id: payment.membership?._id,
        planName: payment.membership?.planName || 'Gym Membership Plan',
        price: payment.membership?.price || payment.amount,
        duration: payment.membership?.duration,
      },
    },
  });
};

// GET /payments/:id/receipt/download – returns printable/downloadable HTML receipt
export const downloadReceipt = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    throw new ApiError(400, 'Invalid payment ID format.');
  }

  const filter = await buildFilter(req.user, {});
  const payment = await Payment.findOne({ _id: req.params.id, ...filter })
    .populate('member', 'fullName email phone')
    .populate('membership', 'planName price duration');

  if (!payment) {
    throw new ApiError(404, 'Payment not found or access denied.');
  }

  if (payment.paymentStatus !== 'paid') {
    throw new ApiError(404, 'Receipt not available for unpaid or failed payments.');
  }

  const formattedDate = new Date(payment.paymentDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const memberName = payment.member?.fullName || 'Valued Member';
  const memberEmail = payment.member?.email || '';
  const memberPhone = payment.member?.phone || '';
  const planName = payment.membership?.planName || 'Gym Membership Plan';
  const planDuration = payment.membership?.duration ? `${payment.membership.duration} Days Access` : 'Active Term';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Receipt - ${payment.transactionReference}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: #f4f6f8;
      color: #1a1a1a;
      padding: 32px 16px;
      display: flex;
      justify-content: center;
    }
    .receipt-container {
      background: #ffffff;
      max-width: 680px;
      width: 100%;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.08);
      border: 1px solid #e1e4e8;
      overflow: hidden;
    }
    .receipt-header {
      background: #0f172a;
      color: #ffffff;
      padding: 32px 40px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .brand-title {
      font-size: 26px;
      font-weight: 800;
      letter-spacing: 1px;
      color: #ff8533;
    }
    .brand-sub {
      font-size: 13px;
      color: #94a3b8;
      margin-top: 4px;
    }
    .badge-paid {
      background: #22c55e;
      color: #ffffff;
      font-size: 13px;
      font-weight: 700;
      padding: 6px 14px;
      border-radius: 9999px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .receipt-body {
      padding: 36px 40px;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      padding-bottom: 24px;
      border-bottom: 1px solid #e2e8f0;
      margin-bottom: 24px;
    }
    .meta-block h4 {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: #64748b;
      margin-bottom: 6px;
    }
    .meta-block p {
      font-size: 15px;
      color: #1e293b;
      font-weight: 600;
    }
    .meta-block small {
      font-size: 13px;
      color: #64748b;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    .items-table th {
      background: #f8fafc;
      text-align: left;
      padding: 12px 16px;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #475569;
      border-bottom: 2px solid #e2e8f0;
    }
    .items-table td {
      padding: 16px;
      font-size: 14px;
      border-bottom: 1px solid #e2e8f0;
      color: #334155;
    }
    .items-table .text-right { text-align: right; }
    .total-section {
      display: flex;
      justify-content: flex-end;
      margin-top: 16px;
      padding-top: 16px;
    }
    .total-box {
      width: 260px;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      font-size: 14px;
      color: #64748b;
    }
    .total-row.grand-total {
      border-top: 2px solid #0f172a;
      color: #0f172a;
      font-size: 18px;
      font-weight: 800;
      padding-top: 12px;
    }
    .receipt-footer {
      background: #f8fafc;
      border-top: 1px solid #e2e8f0;
      padding: 24px 40px;
      text-align: center;
      font-size: 12px;
      color: #64748b;
    }
    .actions-bar {
      margin-top: 24px;
      display: flex;
      gap: 12px;
      justify-content: center;
    }
    .btn {
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      border: 1px solid transparent;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .btn-print {
      background: #0f172a;
      color: #ffffff;
    }
    .btn-print:hover { background: #1e293b; }
    .btn-download {
      background: #ff8533;
      color: #ffffff;
    }
    .btn-download:hover { background: #e06c20; }
    @media print {
      body { background: #ffffff; padding: 0; }
      .receipt-container { box-shadow: none; border: none; max-width: 100%; }
      .actions-bar { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="receipt-container">
    <div class="receipt-header">
      <div>
        <div class="brand-title">FITNOVA</div>
        <div class="brand-sub">Premium Health & Fitness Club</div>
      </div>
      <div>
        <span class="badge-paid">✓ PAID</span>
      </div>
    </div>

    <div class="receipt-body">
      <div class="meta-grid">
        <div class="meta-block">
          <h4>Transaction Reference</h4>
          <p>${payment.transactionReference}</p>
          <small>Issued: ${formattedDate}</small>
        </div>
        <div class="meta-block">
          <h4>Billed To (Member)</h4>
          <p>${memberName}</p>
          ${memberEmail ? `<small>${memberEmail}</small><br>` : ''}
          ${memberPhone ? `<small>Tel: ${memberPhone}</small>` : ''}
        </div>
      </div>

      <table class="items-table">
        <thead>
          <tr>
            <th>Description</th>
            <th>Duration</th>
            <th class="text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <strong>${planName}</strong><br>
              <small style="color: #64748b;">Full gym access & facilities</small>
            </td>
            <td>${planDuration}</td>
            <td class="text-right" style="font-weight: 600;">₹${payment.amount.toLocaleString('en-IN')}</td>
          </tr>
        </tbody>
      </table>

      <div class="total-section">
        <div class="total-box">
          <div class="total-row">
            <span>Subtotal</span>
            <span>₹${payment.amount.toLocaleString('en-IN')}</span>
          </div>
          <div class="total-row">
            <span>Taxes & Fees</span>
            <span>₹0.00</span>
          </div>
          <div class="total-row grand-total">
            <span>Total Paid</span>
            <span>₹${payment.amount.toLocaleString('en-IN')}</span>
          </div>
        </div>
      </div>

      <div class="actions-bar">
        <button type="button" class="btn btn-print" onclick="window.print()">🖨️ Print Receipt</button>
        <a href="?download=true" class="btn btn-download">⬇️ Download File</a>
      </div>
    </div>

    <div class="receipt-footer">
      <p>Thank you for choosing FitNova! For membership inquiries, contact support@fitnova.com.</p>
      <p style="margin-top: 4px;">FitNova Fitness Club · 123 Fitness Boulevard · Tax Invoice & Official Receipt</p>
    </div>
  </div>
</body>
</html>`;

  if (req.query.download === 'true') {
    res.setHeader('Content-Disposition', `attachment; filename="receipt-${payment.transactionReference}.html"`);
  } else {
    res.setHeader('Content-Disposition', 'inline');
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(html);
};
