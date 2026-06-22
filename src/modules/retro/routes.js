import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import * as retroController from './controller.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const managerOrAdmin = requireRole('manager', 'internal_admin');

// Template download — no file required
router.get('/template', authenticate, managerOrAdmin, retroController.downloadTemplate);

// List import batches
router.get('/', authenticate, managerOrAdmin, retroController.listRetroIntakes);

// Get single batch detail
router.get('/:id', authenticate, managerOrAdmin, retroController.getRetroIntake);

// Get all records for a batch
router.get('/:id/records', authenticate, managerOrAdmin, retroController.getRetroRecords);

// Download error report for a batch
router.get('/:id/error-report', authenticate, managerOrAdmin, retroController.downloadErrorReport);

// Preview: parse + validate only — no DB writes
router.post('/preview', authenticate, managerOrAdmin, upload.single('file'), retroController.previewRetroIntake);

// Import: upload + validate + create batch (requires invoice_doc_id + lab_test_doc_id)
router.post('/', authenticate, managerOrAdmin, upload.single('file'), retroController.importRetroIntake);

export default router;
