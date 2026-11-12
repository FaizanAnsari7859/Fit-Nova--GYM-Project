import { Router } from 'express';
import attendanceRoutes from './attendance.routes.js';
import authRoutes from './auth.routes.js';
import healthRoutes from './health.routes.js';
import membershipRoutes from './membership.routes.js';
import paymentRoutes from './payment.routes.js';
import userRoutes from './user.routes.js';
import trainerRoutes from './trainer.routes.js';
import workoutRoutes from './workout.routes.js';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/trainers', trainerRoutes);
router.use('/memberships', membershipRoutes);
router.use('/workouts', workoutRoutes);
router.use('/payments', paymentRoutes);
router.use('/attendance', attendanceRoutes);

export default router;
