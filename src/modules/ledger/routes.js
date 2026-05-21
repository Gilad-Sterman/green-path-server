import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import * as ledgerController from './controller.js';

const router = Router();

const managerOrAdmin = requireRole('manager', 'internal_admin');

router.get('/balance', authenticate, managerOrAdmin, ledgerController.getBalance);
router.get('/entries', authenticate, managerOrAdmin, ledgerController.getEntries);

export default router;
