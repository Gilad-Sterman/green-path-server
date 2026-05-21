import { success, error } from '../../utils/response.js';
import * as intakesService from './service.js';

// GET /api/intakes
export const listIntakes = async (req, res, next) => {
  try {
    const intakes = await intakesService.getIntakes(req.user, req.query);
    return success(res, { intakes, count: intakes.length });
  } catch (err) {
    if (err.status) return error(res, 'intake-error', err.message, err.status);
    next(err);
  }
};

// GET /api/intakes/:id
export const getIntake = async (req, res, next) => {
  try {
    const intake = await intakesService.getIntake(req.user, req.params.id);
    return success(res, { intake });
  } catch (err) {
    if (err.status) return error(res, 'intake-error', err.message, err.status);
    next(err);
  }
};

// POST /api/intakes
export const createIntake = async (req, res, next) => {
  try {
    const intake = await intakesService.createIntake(req.user, req.body, { ip: req.ip, userAgent: req.headers['user-agent'] });
    return success(res, { intake }, {}, 201);
  } catch (err) {
    if (err.status) return error(res, 'intake-error', err.message, err.status);
    next(err);
  }
};

// PATCH /api/intakes/:id
export const updateIntake = async (req, res, next) => {
  try {
    const intake = await intakesService.updateIntake(req.user, req.params.id, req.body, { ip: req.ip, userAgent: req.headers['user-agent'] });
    if (!intake) return error(res, 'no-changes', 'No valid fields provided to update.', 400);
    return success(res, { intake });
  } catch (err) {
    if (err.status) return error(res, 'intake-error', err.message, err.status);
    next(err);
  }
};
