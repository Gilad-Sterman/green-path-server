import { success, error } from '../../utils/response.js';
import * as batchesService from './service.js';

// GET /api/batches
export const listBatches = async (req, res, next) => {
  try {
    const batches = await batchesService.getBatches(req.user, req.query);
    return success(res, { batches, count: batches.length });
  } catch (err) {
    if (err.status) return error(res, 'batch-error', err.message, err.status);
    next(err);
  }
};

// GET /api/batches/:id
export const getBatch = async (req, res, next) => {
  try {
    const batch = await batchesService.getBatch(req.user, req.params.id);
    return success(res, { batch });
  } catch (err) {
    if (err.status) return error(res, 'batch-error', err.message, err.status);
    next(err);
  }
};

// POST /api/batches
export const createBatch = async (req, res, next) => {
  try {
    const batch = await batchesService.createBatch(req.user, req.body);
    return success(res, { batch }, {}, 201);
  } catch (err) {
    if (err.status) return error(res, 'batch-error', err.message, err.status);
    next(err);
  }
};

// PATCH /api/batches/:id/complete
export const completeBatch = async (req, res, next) => {
  try {
    const batch = await batchesService.completeBatch(req.user, req.params.id);
    return success(res, { batch });
  } catch (err) {
    if (err.status) return error(res, 'batch-error', err.message, err.status);
    next(err);
  }
};

// PATCH /api/batches/:id/cancel
export const cancelBatch = async (req, res, next) => {
  try {
    const batch = await batchesService.cancelBatch(req.user, req.params.id);
    return success(res, { batch });
  } catch (err) {
    if (err.status) return error(res, 'batch-error', err.message, err.status);
    next(err);
  }
};
