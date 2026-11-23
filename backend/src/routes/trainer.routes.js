import { Router } from 'express';
import {
  assignMemberToTrainer,
  getPublicTrainers,
} from '../controllers/trainer.controller.js';
import { getTrainerAssignmentsOverview } from '../controllers/user.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// Publicly accessible trainers listing
router.get('/', asyncHandler(getPublicTrainers));

// Admin-only trainer assignments overview
router.get(
  '/assignments',
  requireAuth,
  requireRole('admin'),
  asyncHandler(getTrainerAssignmentsOverview),
);

// Admin-only member-trainer assignment
router.post(
  '/assign-member',
  requireAuth,
  requireRole('admin'),
  asyncHandler(assignMemberToTrainer),
);

export default router;
