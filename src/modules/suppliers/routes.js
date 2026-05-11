import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import * as suppliersController from './controller.js';

const router = Router();

const managerOrAdmin = requireRole('manager', 'internal_admin');
const anyStaff       = requireRole('employee', 'manager', 'internal_admin');

// Read — all authenticated staff (employees need supplier list when creating intakes)
router.get('/',    authenticate, anyStaff, suppliersController.listSuppliers);
router.get('/:id', authenticate, anyStaff, suppliersController.getSupplier);

// Write — manager and internal_admin only
router.post('/',                   authenticate, managerOrAdmin, suppliersController.createSupplier);
router.patch('/:id',               authenticate, managerOrAdmin, suppliersController.updateSupplier);
router.patch('/:id/deactivate',    authenticate, managerOrAdmin, suppliersController.deactivateSupplier);
router.patch('/:id/reactivate',    authenticate, managerOrAdmin, suppliersController.reactivateSupplier);

export default router;
