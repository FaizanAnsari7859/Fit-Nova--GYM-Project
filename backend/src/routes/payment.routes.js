import Payment from '../models/payment.model.js';
import { createCrudController } from '../controllers/crud.controller.js';
import { createResourceRouter } from './resource.routes.js';

const controller = createCrudController(Payment, [
  'member',
  'membership',
  'amount',
  'paymentStatus',
  'transactionReference',
  'paymentDate',
]);

export default createResourceRouter(controller);
