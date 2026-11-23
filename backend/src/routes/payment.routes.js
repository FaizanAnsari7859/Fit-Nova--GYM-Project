import { Router } from 'express';
import {
  listPayments,
  getPayment,
  createPayment,
  updatePayment,
  deletePayment,
  getReceipt,
  downloadReceipt,
} from '../controllers/payment.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// All payment routes require valid JWT authentication
router.use(requireAuth);

// Accessible to admin, trainer (assigned only), member (own only)
router.get('/', asyncHandler(listPayments));
router.get('/:id/receipt/download', asyncHandler(downloadReceipt));
router.get('/:id/receipt', asyncHandler(getReceipt));
router.get('/:id', asyncHandler(getPayment));

// Admin only creation
router.post('/', requireRole('admin'), asyncHandler(createPayment));

// Updates: admin can update any, trainer can update status of assigned members, member blocked (enforced in controller)
router.patch('/:id', asyncHandler(updatePayment));

// Admin only deletion
router.delete('/:id', requireRole('admin'), asyncHandler(deletePayment));

export default router;
