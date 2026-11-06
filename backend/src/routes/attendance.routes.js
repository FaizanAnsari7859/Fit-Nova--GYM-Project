import Attendance from '../models/attendance.model.js';
import { createCrudController } from '../controllers/crud.controller.js';
import { createResourceRouter } from './resource.routes.js';

const controller = createCrudController(Attendance, [
  'member',
  'checkInTime',
  'checkOutTime',
  'attendanceDate',
  'status',
]);

export default createResourceRouter(controller);
