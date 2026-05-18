import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import * as flagsController from './controller.js';

const router = Router();

const managerOrAdmin = requireRole('manager', 'internal_admin');

// summary must come before /:id to avoid route shadowing
router.get('/summary', authenticate, managerOrAdmin, flagsController.getFlagsSummary);
router.get('/',        authenticate, managerOrAdmin, flagsController.listFlags);
router.get('/:id',     authenticate, managerOrAdmin, flagsController.getFlag);

// Resolve / dismiss — manager and internal_admin only
router.post('/:id/resolve', authenticate, managerOrAdmin, flagsController.resolveFlag);
router.post('/:id/dismiss', authenticate, managerOrAdmin, flagsController.dismissFlag);

export default router;
