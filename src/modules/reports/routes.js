import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import * as controller from './controller.js';

const router = Router();
const managerOrAdmin = requireRole('manager', 'internal_admin');
const adminOnly      = requireRole('internal_admin');

router.get('/summary',          authenticate, managerOrAdmin, controller.getSummary);
router.get('/monthly',          authenticate, managerOrAdmin, controller.getMonthly);
router.get('/by-type',          authenticate, managerOrAdmin, controller.getByType);
router.get('/credits/export',   authenticate, managerOrAdmin, controller.getCreditsExport);
router.get('/admin/factories',  authenticate, adminOnly,      controller.getFactorySummaries);

export default router;
