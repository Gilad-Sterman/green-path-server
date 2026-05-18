import { success, error } from '../../utils/response.js';
import * as flagsService from './service.js';

// GET /api/flags
export const listFlags = async (req, res, next) => {
  try {
    const flags = await flagsService.getFlags(req.user, req.query);
    return success(res, { flags, count: flags.length });
  } catch (err) {
    if (err.status) return error(res, 'flag-error', err.message, err.status);
    next(err);
  }
};

// GET /api/flags/summary
export const getFlagsSummary = async (req, res, next) => {
  try {
    const summary = await flagsService.getFlagsSummary(req.user, req.query);
    return success(res, { summary });
  } catch (err) {
    if (err.status) return error(res, 'flag-error', err.message, err.status);
    next(err);
  }
};

// GET /api/flags/:id
export const getFlag = async (req, res, next) => {
  try {
    const flag = await flagsService.getFlag(req.user, req.params.id);
    return success(res, { flag });
  } catch (err) {
    if (err.status) return error(res, 'flag-error', err.message, err.status);
    next(err);
  }
};

// POST /api/flags/:id/resolve
export const resolveFlag = async (req, res, next) => {
  try {
    const flag = await flagsService.resolveFlag(req.user, req.params.id, req.body);
    return success(res, { flag });
  } catch (err) {
    if (err.status) return error(res, 'flag-error', err.message, err.status);
    next(err);
  }
};

// POST /api/flags/:id/dismiss
export const dismissFlag = async (req, res, next) => {
  try {
    const flag = await flagsService.dismissFlag(req.user, req.params.id, req.body);
    return success(res, { flag });
  } catch (err) {
    if (err.status) return error(res, 'flag-error', err.message, err.status);
    next(err);
  }
};
