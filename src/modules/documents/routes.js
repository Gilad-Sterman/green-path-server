import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import * as documentsController from './controller.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });

const managerOrAdmin = requireRole('manager', 'internal_admin');
const anyStaff       = requireRole('employee', 'manager', 'internal_admin');

// Read
router.get('/',    authenticate, anyStaff, documentsController.listDocuments);
router.get('/:id', authenticate, anyStaff, documentsController.getDocument);

// Analyze only — run OCR and return fields without saving a document record
router.post('/analyze', authenticate, anyStaff, upload.single('file'), documentsController.analyzeDocument);

// Upload — all staff can upload (employees upload delivery notes in the field)
router.post('/', authenticate, anyStaff, upload.single('file'), documentsController.uploadDocument);

// Review — manager and internal_admin only
router.patch('/:id/approve', authenticate, managerOrAdmin, documentsController.approveDocument);
router.patch('/:id/reject',  authenticate, managerOrAdmin, documentsController.rejectDocument);

export default router;
