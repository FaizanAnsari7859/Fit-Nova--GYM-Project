import Membership from '../models/membership.model.js';
import { createCrudController } from '../controllers/crud.controller.js';
import { createResourceRouter } from './resource.routes.js';

const controller = createCrudController(Membership, [
  'planName',
  'duration',
  'price',
  'features',
  'status',
]);

export default createResourceRouter(controller);
