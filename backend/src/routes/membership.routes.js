import { Router } from 'express';
import {
  assignMembership,
  createMembership,
  deleteMembership,
  getMembershipById,
  getMemberships,
  getMemberSubscriptions,
  getSubscriptions,
  updateMembership,
} from '../controllers/membership.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// All membership endpoints require authentication
router.use(requireAuth);

// Subscriptions tracking (must precede /:id)
router.get('/subscriptions', requireRole('admin'), asyncHandler(getSubscriptions));
router.get('/subscriptions/member/:memberId', requireRole('admin', 'trainer'), asyncHandler(getMemberSubscriptions));

// Anyone logged in can view plans
router.get('/', asyncHandler(getMemberships));
router.get('/:id', asyncHandler(getMembershipById));

// Admin only actions
router.post('/', requireRole('admin'), asyncHandler(createMembership));
router.patch('/:id', requireRole('admin'), asyncHandler(updateMembership));
router.delete('/:id', requireRole('admin'), asyncHandler(deleteMembership));
router.post('/:id/assign', requireRole('admin'), asyncHandler(assignMembership));

export default router;
