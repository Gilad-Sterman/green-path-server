import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import * as shipmentsController from './controller.js';

const router = Router();

const managerOrAdmin = requireRole('manager', 'internal_admin');
const anyStaff       = requireRole('employee', 'manager', 'internal_admin');

// Read — all staff
router.get('/',    authenticate, anyStaff, shipmentsController.listShipments);
router.get('/:id', authenticate, anyStaff, shipmentsController.getShipment);

// Create — all staff can create; status transitions are manager-only
router.post('/', authenticate, anyStaff, shipmentsController.createShipment);

// Webhook — חשבשבת invoice callback (STUB — no auth yet, will add HMAC signature check)
// TODO: add signature verification middleware when real חשבשבת connection is configured
router.post('/webhooks/hashavshevet', shipmentsController.receiveHashavshevetInvoice);

// Status transitions — manager and internal_admin only
router.patch('/:id/status', authenticate, managerOrAdmin, shipmentsController.updateShipmentStatus);

export default router;
