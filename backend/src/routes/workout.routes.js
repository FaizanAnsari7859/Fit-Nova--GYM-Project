import Workout from '../models/workout.model.js';
import { createCrudController } from '../controllers/crud.controller.js';
import { createResourceRouter } from './resource.routes.js';

const controller = createCrudController(Workout, [
  'workoutName',
  'description',
  'category',
  'duration',
  'assignedMember',
  'assignedTrainer',
]);

export default createResourceRouter(controller);
