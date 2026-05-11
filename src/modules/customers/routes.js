import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import * as customersController from './controller.js';

const router = Router();

const managerOrAdmin = requireRole('manager', 'internal_admin');
const anyStaff       = requireRole('employee', 'manager', 'internal_admin');

router.get('/',    authenticate, anyStaff,       customersController.listCustomers);
router.get('/:id', authenticate, anyStaff,       customersController.getCustomer);
router.post('/',               authenticate, managerOrAdmin, customersController.createCustomer);
router.patch('/:id',           authenticate, managerOrAdmin, customersController.updateCustomer);
router.patch('/:id/deactivate', authenticate, managerOrAdmin, customersController.deactivateCustomer);
router.patch('/:id/reactivate', authenticate, managerOrAdmin, customersController.reactivateCustomer);

export default router;
