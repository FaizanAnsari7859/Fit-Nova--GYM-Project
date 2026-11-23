import { Router } from 'express';
import { getReports } from '../controllers/report.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.use(requireAuth);
router.get('/', requireRole('admin'), asyncHandler(getReports));

export default router;

