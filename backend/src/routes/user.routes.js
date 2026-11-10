import { Router } from 'express';
import {
  createUser,
  deleteUser,
  getAdminStats,
  getMe,
  getMemberOverview,
  getTrainerOverview,
  getUserById,
  getUsers,
  updateMe,
  updateUser,
} from '../controllers/user.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// Current user profile (any role)
router.get('/me', asyncHandler(getMe));
router.patch('/me', asyncHandler(updateMe));

// Dashboards & overview endpoints
router.get('/admin/stats', requireRole('admin'), asyncHandler(getAdminStats));
router.get('/trainer/overview', requireRole('trainer', 'admin'), asyncHandler(getTrainerOverview));
router.get('/member/overview', requireRole('member'), asyncHandler(getMemberOverview));

// User management (admin only)
router.get('/', requireRole('admin'), asyncHandler(getUsers));
router.post('/', requireRole('admin'), asyncHandler(createUser));
router.get('/:id', requireRole('admin', 'trainer'), asyncHandler(getUserById));
router.patch('/:id', requireRole('admin'), asyncHandler(updateUser));
router.delete('/:id', requireRole('admin'), asyncHandler(deleteUser));

export default router;
