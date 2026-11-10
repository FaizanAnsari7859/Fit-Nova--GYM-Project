import { Router } from 'express';
import {
  createWorkout,
  deleteWorkout,
  getWorkoutById,
  getWorkouts,
  updateWorkout,
  updateWorkoutStatus,
} from '../controllers/workout.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// All workout endpoints require authentication
router.use(requireAuth);

router.get('/', asyncHandler(getWorkouts));
router.get('/:id', asyncHandler(getWorkoutById));
router.post('/', requireRole('admin', 'trainer'), asyncHandler(createWorkout));
router.patch('/:id', asyncHandler(updateWorkout));
router.patch('/:id/status', asyncHandler(updateWorkoutStatus));
router.delete('/:id', requireRole('admin', 'trainer'), asyncHandler(deleteWorkout));

export default router;
