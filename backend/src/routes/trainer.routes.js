import { Router } from 'express';
import {
  assignMemberToTrainer,
  getPublicTrainers,
} from '../controllers/trainer.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// Publicly accessible trainers listing
router.get('/', asyncHandler(getPublicTrainers));

// Admin-only member-trainer assignment
router.post(
  '/assign-member',
  requireAuth,
  requireRole('admin'),
  asyncHandler(assignMemberToTrainer),
);

export default router;
