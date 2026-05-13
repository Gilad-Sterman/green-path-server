import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import * as batchesController from './controller.js';

const router = Router();

const managerOrAdmin = requireRole('manager', 'internal_admin');
const anyStaff       = requireRole('employee', 'manager', 'internal_admin');

// Read — all staff
router.get('/',    authenticate, anyStaff, batchesController.listBatches);
router.get('/:id', authenticate, anyStaff, batchesController.getBatch);

// Write — manager and internal_admin only
router.post('/',               authenticate, managerOrAdmin, batchesController.createBatch);
router.patch('/:id/complete',  authenticate, managerOrAdmin, batchesController.completeBatch);
router.patch('/:id/cancel',    authenticate, managerOrAdmin, batchesController.cancelBatch);

export default router;
