import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import * as intakesController from './controller.js';

const router = Router();

const managerOrAdmin = requireRole('manager', 'internal_admin');
const anyStaff       = requireRole('employee', 'manager', 'internal_admin');

// Read — all staff (employees need to see intakes)
router.get('/',    authenticate, anyStaff, intakesController.listIntakes);
router.get('/:id', authenticate, anyStaff, intakesController.getIntake);

// Create — all staff (employees create intakes in the field)
router.post('/', authenticate, anyStaff, intakesController.createIntake);

// Update — manager and internal_admin only (corrections after review)
router.patch('/:id', authenticate, managerOrAdmin, intakesController.updateIntake);

// Internal weighing — manager and internal_admin only
router.post('/:id/weighings', authenticate, managerOrAdmin, intakesController.addWeighing);
router.get('/:id/weighings',  authenticate, managerOrAdmin, intakesController.listWeighings);

export default router;
