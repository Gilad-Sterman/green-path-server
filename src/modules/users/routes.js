import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import * as usersController from './controller.js';

const router = Router();

// Current user — any authenticated role
router.get('/me', authenticate, usersController.getMe);

// User management — manager and internal_admin only
router.get('/',                   authenticate, requireRole('manager', 'internal_admin'), usersController.listUsers);
router.post('/',                  authenticate, requireRole('manager', 'internal_admin'), usersController.createUser);
router.get('/:id',                authenticate, requireRole('manager', 'internal_admin'), usersController.getUser);
router.patch('/:id',              authenticate, requireRole('manager', 'internal_admin'), usersController.updateUser);
router.patch('/:id/deactivate',   authenticate, requireRole('manager', 'internal_admin'), usersController.deactivateUser);
router.patch('/:id/reactivate',   authenticate, requireRole('manager', 'internal_admin'), usersController.reactivateUser);

export default router;
