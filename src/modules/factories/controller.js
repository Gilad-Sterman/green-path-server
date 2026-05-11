import { success, error } from '../../utils/response.js';
import * as factoriesService from './service.js';

// GET /api/factories
export const listFactories = async (req, res, next) => {
  try {
    const factories = await factoriesService.getFactories(req.query);
    return success(res, { factories, count: factories.length });
  } catch (err) {
    if (err.status) return error(res, 'factory-error', err.message, err.status);
    next(err);
  }
};

// POST /api/factories
export const createFactory = async (req, res, next) => {
  try {
    const result = await factoriesService.createFactory(req.body);
    return success(res, {
      factory:       result.factory,
      admin_user_id: result.admin_user_id,
      invite_sent:   result.invite_sent,
    }, {}, 201);
  } catch (err) {
    if (err.status) return error(res, 'factory-error', err.message, err.status);
    next(err);
  }
};

// GET /api/factories/:id
export const getFactory = async (req, res, next) => {
  try {
    const factory = await factoriesService.getFactory(req.user, req.params.id);
    return success(res, { factory });
  } catch (err) {
    if (err.status) return error(res, 'factory-error', err.message, err.status);
    next(err);
  }
};

// PATCH /api/factories/:id
export const updateFactory = async (req, res, next) => {
  try {
    const factory = await factoriesService.updateFactory(req.params.id, req.body);
    if (!factory) return error(res, 'no-changes', 'No valid fields provided to update.', 400);
    return success(res, { factory });
  } catch (err) {
    if (err.status) return error(res, 'factory-error', err.message, err.status);
    next(err);
  }
};
