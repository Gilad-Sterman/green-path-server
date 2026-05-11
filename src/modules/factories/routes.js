import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import * as factoriesController from './controller.js';

const router = Router();

// internal_admin only — full CRUD
router.get('/',    authenticate, requireRole('internal_admin'), factoriesController.listFactories);
router.post('/',   authenticate, requireRole('internal_admin'), factoriesController.createFactory);
router.patch('/:id', authenticate, requireRole('internal_admin'), factoriesController.updateFactory);

// Any authenticated user — but service layer restricts non-admins to their own factory
router.get('/:id', authenticate, factoriesController.getFactory);

export default router;
