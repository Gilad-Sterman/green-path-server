import { success, error } from '../../utils/response.js';
import * as documentsService from './service.js';

// GET /api/documents
export const listDocuments = async (req, res, next) => {
  try {
    const documents = await documentsService.getDocuments(req.user, req.query);
    return success(res, { documents, count: documents.length });
  } catch (err) {
    if (err.status) return error(res, 'document-error', err.message, err.status);
    next(err);
  }
};

// GET /api/documents/:id
export const getDocument = async (req, res, next) => {
  try {
    const document = await documentsService.getDocument(req.user, req.params.id);
    return success(res, { document });
  } catch (err) {
    if (err.status) return error(res, 'document-error', err.message, err.status);
    next(err);
  }
};

// POST /api/documents
export const uploadDocument = async (req, res, next) => {
  try {
    const document = await documentsService.uploadDocument(req.user, req.body, req.file);
    return success(res, { document }, {}, 201);
  } catch (err) {
    if (err.status) return error(res, 'document-error', err.message, err.status);
    next(err);
  }
};

// PATCH /api/documents/:id/approve
export const approveDocument = async (req, res, next) => {
  try {
    const document = await documentsService.approveDocument(req.user, req.params.id, req.body);
    return success(res, { document });
  } catch (err) {
    if (err.status) return error(res, 'document-error', err.message, err.status);
    next(err);
  }
};

// PATCH /api/documents/:id/reject
export const rejectDocument = async (req, res, next) => {
  try {
    const document = await documentsService.rejectDocument(req.user, req.params.id, req.body);
    return success(res, { document });
  } catch (err) {
    if (err.status) return error(res, 'document-error', err.message, err.status);
    next(err);
  }
};
