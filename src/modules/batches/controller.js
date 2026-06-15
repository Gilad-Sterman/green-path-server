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

// GET /api/batches/generate-code
export const generateCode = async (req, res, next) => {
  try {
    const result = await batchesService.generateCode(req.user, req.query);
    return success(res, result);
  } catch (err) {
    if (err.status) return error(res, 'batch-error', err.message, err.status);
    next(err);
  }
};

// GET /api/batches/sources
export const getAvailableSources = async (req, res, next) => {
  try {
    const result = await batchesService.getAvailableSources(req.user, req.query);
    return success(res, result);
  } catch (err) {
    if (err.status) return error(res, 'batch-error', err.message, err.status);
    next(err);
  }
};

// POST /api/batches
export const createBatch = async (req, res, next) => {
  try {
    const batch = await batchesService.createBatch(req.user, req.body, { ip: req.ip });
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

// PATCH /api/batches/:id/block
export const blockBatch = async (req, res, next) => {
  try {
    const batch = await batchesService.blockBatch(req.user, req.params.id, req.body.reason);
    return success(res, { batch });
  } catch (err) {
    if (err.status) return error(res, 'batch-error', err.message, err.status);
    next(err);
  }
};

// POST /api/batches/:id/waste
export const addWaste = async (req, res, next) => {
  try {
    const batch = await batchesService.addWaste(req.user, req.params.id, req.body.waste_kg);
    return success(res, { batch });
  } catch (err) {
    if (err.status) return error(res, 'batch-error', err.message, err.status);
    next(err);
  }
};

// PATCH /api/batches/:id/unblock
export const unblockBatch = async (req, res, next) => {
  try {
    const batch = await batchesService.unblockBatch(req.user, req.params.id);
    return success(res, { batch });
  } catch (err) {
    if (err.status) return error(res, 'batch-error', err.message, err.status);
    next(err);
  }
};

// PATCH /api/batches/:id/fail
export const failBatch = async (req, res, next) => {
  try {
    const batch = await batchesService.failBatch(req.user, req.params.id);
    return success(res, { batch });
  } catch (err) {
    if (err.status) return error(res, 'batch-error', err.message, err.status);
    next(err);
  }
};
