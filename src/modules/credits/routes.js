import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import * as creditsController from './controller.js';

const router = Router();

const managerOrAdmin = requireRole('manager', 'internal_admin');
const anyStaff       = requireRole('employee', 'manager', 'internal_admin');

// Summary must come before /:id to avoid being swallowed
router.get('/summary', authenticate, anyStaff,       creditsController.getCreditsSummary);
router.get('/',        authenticate, anyStaff,       creditsController.listCredits);

export default router;
