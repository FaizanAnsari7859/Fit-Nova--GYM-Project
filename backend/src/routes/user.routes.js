import { Router } from 'express';
import { getMe, updateMe } from '../controllers/user.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.use(requireAuth);
router.get('/me', asyncHandler(getMe));
router.patch('/me', asyncHandler(updateMe));

export default router;
