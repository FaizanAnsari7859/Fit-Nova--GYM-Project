import { Router } from 'express';
import {
  listAttendance,
  getAttendance,
  getMemberAttendance,
  recordCheckIn,
  recordCheckOut,
  updateAttendance,
  deleteAttendance,
} from '../controllers/attendance.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// All attendance endpoints require authentication
router.use(requireAuth);

// Accessible to admin, trainer (assigned members), and member (own records)
router.get('/', asyncHandler(listAttendance));
router.get('/member/:memberId', asyncHandler(getMemberAttendance));
router.get('/:id', asyncHandler(getAttendance));

// Record check-in (Admin or Trainer for assigned members; role validated in controller)
router.post('/', asyncHandler(recordCheckIn));

// Record check-out (Admin or Trainer for assigned members)
router.patch('/:id/checkout', asyncHandler(recordCheckOut));
router.post('/:id/checkout', asyncHandler(recordCheckOut));

// General update
router.patch('/:id', asyncHandler(updateAttendance));

// Admin only deletion
router.delete('/:id', requireRole('admin'), asyncHandler(deleteAttendance));

export default router;
