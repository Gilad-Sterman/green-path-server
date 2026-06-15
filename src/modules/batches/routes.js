import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import * as batchesController from './controller.js';

const router = Router();

const managerOrAdmin = requireRole('manager', 'internal_admin');
const anyStaff       = requireRole('employee', 'manager', 'internal_admin');

// Read — all staff
router.get('/',               authenticate, anyStaff, batchesController.listBatches);
router.get('/generate-code', authenticate, anyStaff, batchesController.generateCode);
router.get('/sources',       authenticate, anyStaff, batchesController.getAvailableSources);
router.get('/:id',           authenticate, anyStaff, batchesController.getBatch);

// Write — all staff can create; management transitions are manager-only
router.post('/',               authenticate, anyStaff,       batchesController.createBatch);
router.patch('/:id/complete',  authenticate, managerOrAdmin, batchesController.completeBatch);
router.patch('/:id/cancel',    authenticate, managerOrAdmin, batchesController.cancelBatch);
router.patch('/:id/block',     authenticate, managerOrAdmin, batchesController.blockBatch);
router.patch('/:id/unblock',   authenticate, managerOrAdmin, batchesController.unblockBatch);
router.patch('/:id/fail',      authenticate, managerOrAdmin, batchesController.failBatch);
router.post('/:id/waste',      authenticate, managerOrAdmin, batchesController.addWaste);

export default router;
