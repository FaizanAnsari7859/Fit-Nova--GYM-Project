import mongoose from 'mongoose';
import Attendance from '../models/attendance.model.js';
import User from '../models/user.model.js';
import { ApiError } from '../utils/apiError.js';
import { pick } from '../utils/pick.js';

const ALLOWED_STATUSES = ['present', 'absent', 'late'];

// Helper to build filter based on role and query params
const buildAttendanceFilter = async (user, query) => {
  const filter = {};
  const requestedMember = query.member || query.memberId;

  // 1. Role-based scoping
  if (user.role === 'member') {
    // Members can strictly only access their own attendance records
    filter.member = user.id;
  } else if (user.role === 'trainer') {
    // Trainers can only access attendance of members assigned to them
    const assignedMembers = await User.find({ assignedTrainer: user.id, role: 'member' }).select('_id');
    const assignedMemberIds = assignedMembers.map((m) => m._id.toString());

    if (requestedMember) {
      if (!mongoose.Types.ObjectId.isValid(requestedMember)) {
        throw new ApiError(400, 'Invalid member ID format.');
      }
      if (assignedMemberIds.includes(requestedMember.toString())) {
        filter.member = requestedMember;
      } else {
        // Requested member is not assigned to this trainer -> match zero records
        filter.member = new mongoose.Types.ObjectId();
      }
    } else {
      filter.member = { $in: assignedMembers.map((m) => m._id) };
    }
  } else if (user.role === 'admin') {
    // Admin can see all or filter by specific member
    if (requestedMember) {
      if (!mongoose.Types.ObjectId.isValid(requestedMember)) {
        throw new ApiError(400, 'Invalid member ID format.');
      }
      filter.member = requestedMember;
    }
  }

  // 2. Status filter
  if (query.status) {
    if (!ALLOWED_STATUSES.includes(query.status)) {
      throw new ApiError(400, `Invalid attendance status. Allowed: ${ALLOWED_STATUSES.join(', ')}`);
    }
    filter.status = query.status;
  }

  // 3. Exact single date filter
  if (query.date) {
    const singleDate = new Date(query.date);
    if (isNaN(singleDate.getTime())) {
      throw new ApiError(400, 'Invalid date format.');
    }
    const startOfDay = new Date(singleDate);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(singleDate);
    endOfDay.setUTCHours(23, 59, 59, 999);
    filter.attendanceDate = { $gte: startOfDay, $lte: endOfDay };
  } else if (query.startDate || query.endDate) {
    // Range date filters
    filter.attendanceDate = {};
    if (query.startDate) {
      const start = new Date(query.startDate);
      if (isNaN(start.getTime())) {
        throw new ApiError(400, 'Invalid startDate format.');
      }
      filter.attendanceDate.$gte = start;
    }
    if (query.endDate) {
      const end = new Date(query.endDate);
      if (isNaN(end.getTime())) {
        throw new ApiError(400, 'Invalid endDate format.');
      }
      filter.attendanceDate.$lte = end;
    }
  }

  return filter;
};

// GET /attendance – list with pagination & filters
export const listAttendance = async (req, res) => {
  const { page = 1, limit = 10, ...query } = req.query;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));

  const filter = await buildAttendanceFilter(req.user, query);

  const [records, total] = await Promise.all([
    Attendance.find(filter)
      .populate('member', 'fullName email phone profileImage assignedTrainer')
      .sort({ attendanceDate: -1, checkInTime: -1, createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Attendance.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    page: pageNum,
    limit: limitNum,
    total,
    totalPages: Math.ceil(total / limitNum) || 1,
    count: records.length,
    data: records,
  });
};

// GET /attendance/:id – single attendance record
export const getAttendance = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    throw new ApiError(400, 'Invalid attendance ID format.');
  }

  const filter = await buildAttendanceFilter(req.user, {});
  const record = await Attendance.findOne({ _id: req.params.id, ...filter })
    .populate('member', 'fullName email phone profileImage assignedTrainer');

  if (!record) {
    throw new ApiError(404, 'Attendance record not found or access denied.');
  }

  res.status(200).json({ success: true, data: record });
};

// GET /attendance/member/:memberId – attendance for a specific member
export const getMemberAttendance = async (req, res) => {
  const { memberId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(memberId)) {
    throw new ApiError(400, 'Invalid member ID format.');
  }

  if (req.user.role === 'member' && req.user.id !== memberId) {
    throw new ApiError(403, 'Members can only view their own attendance records.');
  }

  if (req.user.role === 'trainer') {
    const memberDoc = await User.findById(memberId);
    if (!memberDoc || memberDoc.assignedTrainer?.toString() !== req.user.id) {
      throw new ApiError(403, 'You can only view attendance for members assigned to you.');
    }
  }

  req.query.member = memberId;
  return listAttendance(req, res);
};

// POST /attendance – Record Check-In
export const recordCheckIn = async (req, res) => {
  if (req.user.role === 'member') {
    throw new ApiError(403, 'Members are not authorized to record attendance.');
  }

  const memberId = req.body.member || req.body.memberId;
  if (!memberId) {
    throw new ApiError(400, 'Member ID is required.');
  }

  if (!mongoose.Types.ObjectId.isValid(memberId)) {
    throw new ApiError(400, 'Invalid member ID format.');
  }

  const memberDoc = await User.findById(memberId);
  if (!memberDoc || memberDoc.role !== 'member') {
    throw new ApiError(400, 'Selected user must be an existing member.');
  }

  // Trainer authorization check
  if (req.user.role === 'trainer') {
    if (!memberDoc.assignedTrainer || memberDoc.assignedTrainer.toString() !== req.user.id) {
      throw new ApiError(403, 'Trainers can only record attendance for members assigned to them.');
    }
  }

  const checkInDate = req.body.checkInTime ? new Date(req.body.checkInTime) : new Date();
  if (isNaN(checkInDate.getTime())) {
    throw new ApiError(400, 'Invalid check-in time format.');
  }

  const attendanceDate = req.body.attendanceDate ? new Date(req.body.attendanceDate) : new Date(checkInDate);
  if (isNaN(attendanceDate.getTime())) {
    throw new ApiError(400, 'Invalid attendance date format.');
  }

  let checkOutDate = null;
  if (req.body.checkOutTime) {
    checkOutDate = new Date(req.body.checkOutTime);
    if (isNaN(checkOutDate.getTime())) {
      throw new ApiError(400, 'Invalid check-out time format.');
    }
    if (checkOutDate < checkInDate) {
      throw new ApiError(400, 'Check-out time must be after check-in time.');
    }
  }

  const status = req.body.status || 'present';
  if (!ALLOWED_STATUSES.includes(status)) {
    throw new ApiError(400, `Invalid attendance status. Allowed: ${ALLOWED_STATUSES.join(', ')}`);
  }

  // Validation: Prevent duplicate open check-in (where checkOutTime is null)
  if (!checkOutDate) {
    const existingActive = await Attendance.findOne({
      member: memberId,
      checkOutTime: null,
    });

    if (existingActive) {
      throw new ApiError(400, 'Member is already checked in and has not checked out yet.');
    }
  }

  let record;
  try {
    record = await Attendance.create({
      member: memberId,
      checkInTime: checkInDate,
      checkOutTime: checkOutDate,
      attendanceDate,
      status,
    });
  } catch (err) {
    if (err?.code === 11000) {
      throw new ApiError(400, 'Member is already checked in and has not checked out yet.');
    }
    throw err;
  }

  const populated = await Attendance.findById(record._id)
    .populate('member', 'fullName email phone profileImage assignedTrainer');

  res.status(201).json({
    success: true,
    message: 'Check-in recorded successfully.',
    data: populated,
  });
};

// PATCH /attendance/:id/checkout – Record Check-Out
export const recordCheckOut = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    throw new ApiError(400, 'Invalid attendance ID format.');
  }

  if (req.user.role === 'member') {
    throw new ApiError(403, 'Members are not authorized to modify attendance.');
  }

  const record = await Attendance.findById(req.params.id);
  if (!record) {
    throw new ApiError(404, 'Attendance record not found.');
  }

  // Trainer check
  if (req.user.role === 'trainer') {
    const memberDoc = await User.findById(record.member);
    if (!memberDoc || memberDoc.assignedTrainer?.toString() !== req.user.id) {
      throw new ApiError(403, 'Trainers can only check out members assigned to them.');
    }
  }

  // Validation: Prevent check-out if already checked out
  if (record.checkOutTime) {
    throw new ApiError(400, 'Member has already checked out for this attendance record.');
  }

  const checkOutDate = req.body.checkOutTime ? new Date(req.body.checkOutTime) : new Date();
  if (isNaN(checkOutDate.getTime())) {
    throw new ApiError(400, 'Invalid check-out time format.');
  }

  if (checkOutDate < record.checkInTime) {
    throw new ApiError(400, 'Check-out time must be after check-in time.');
  }

  record.checkOutTime = checkOutDate;
  await record.save();

  const populated = await Attendance.findById(record._id)
    .populate('member', 'fullName email phone profileImage assignedTrainer');

  res.status(200).json({
    success: true,
    message: 'Check-out recorded successfully.',
    data: populated,
  });
};

// PATCH /attendance/:id – Update attendance record (Admin or Trainer for assigned)
export const updateAttendance = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    throw new ApiError(400, 'Invalid attendance ID format.');
  }

  if (req.user.role === 'member') {
    throw new ApiError(403, 'Members are not authorized to update attendance.');
  }

  const record = await Attendance.findById(req.params.id);
  if (!record) {
    throw new ApiError(404, 'Attendance record not found.');
  }

  if (req.user.role === 'trainer') {
    const memberDoc = await User.findById(record.member);
    if (!memberDoc || memberDoc.assignedTrainer?.toString() !== req.user.id) {
      throw new ApiError(403, 'Trainers can only update attendance for assigned members.');
    }
  }

  const allowedFields = ['status', 'checkInTime', 'checkOutTime', 'attendanceDate'];
  const updates = pick(req.body, allowedFields);

  if (updates.status && !ALLOWED_STATUSES.includes(updates.status)) {
    throw new ApiError(400, `Invalid attendance status. Allowed: ${ALLOWED_STATUSES.join(', ')}`);
  }

  if (updates.checkInTime) {
    const d = new Date(updates.checkInTime);
    if (isNaN(d.getTime())) {
      throw new ApiError(400, 'Invalid check-in time format.');
    }
    updates.checkInTime = d;
  }

  if (updates.checkOutTime) {
    const d = new Date(updates.checkOutTime);
    if (isNaN(d.getTime())) {
      throw new ApiError(400, 'Invalid check-out time format.');
    }
    updates.checkOutTime = d;
  }

  if (updates.attendanceDate) {
    const d = new Date(updates.attendanceDate);
    if (isNaN(d.getTime())) {
      throw new ApiError(400, 'Invalid attendance date format.');
    }
    updates.attendanceDate = d;
  }

  const effectiveCheckIn = updates.checkInTime || record.checkInTime;
  const effectiveCheckOut = updates.checkOutTime !== undefined ? updates.checkOutTime : record.checkOutTime;

  if (effectiveCheckOut && effectiveCheckIn && effectiveCheckOut < effectiveCheckIn) {
    throw new ApiError(400, 'Check-out time must be after check-in time.');
  }

  Object.assign(record, updates);
  try {
    await record.save();
  } catch (err) {
    if (err?.code === 11000) {
      throw new ApiError(400, 'Member is already checked in and has not checked out yet.');
    }
    throw err;
  }

  const populated = await Attendance.findById(record._id)
    .populate('member', 'fullName email phone profileImage assignedTrainer');

  res.status(200).json({
    success: true,
    message: 'Attendance record updated successfully.',
    data: populated,
  });
};

// DELETE /attendance/:id – Admin only
export const deleteAttendance = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    throw new ApiError(400, 'Invalid attendance ID format.');
  }

  if (req.user.role !== 'admin') {
    throw new ApiError(403, 'Only admins can delete attendance records.');
  }

  const record = await Attendance.findByIdAndDelete(req.params.id);
  if (!record) {
    throw new ApiError(404, 'Attendance record not found.');
  }

  res.status(200).json({ success: true, message: 'Attendance record deleted.' });
};

