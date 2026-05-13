import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import * as productsController from './controller.js';

const router = Router();

const managerOrAdmin = requireRole('manager', 'internal_admin');
const anyStaff       = requireRole('employee', 'manager', 'internal_admin');

// Read — all staff (employees need product list when creating batches)
router.get('/',    authenticate, anyStaff, productsController.listProducts);
router.get('/:id', authenticate, anyStaff, productsController.getProduct);

// Write — manager and internal_admin only
router.post('/',                  authenticate, managerOrAdmin, productsController.createProduct);
router.patch('/:id',              authenticate, managerOrAdmin, productsController.updateProduct);
router.patch('/:id/deactivate',   authenticate, managerOrAdmin, productsController.deactivateProduct);
router.patch('/:id/reactivate',   authenticate, managerOrAdmin, productsController.reactivateProduct);

export default router;
