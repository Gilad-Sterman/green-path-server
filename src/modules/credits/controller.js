import { success, error } from '../../utils/response.js';
import * as creditsService from './service.js';

// GET /api/credits
export const listCredits = async (req, res, next) => {
  try {
    const credits = await creditsService.getCredits(req.user, req.query);
    return success(res, { credits, count: credits.length });
  } catch (err) {
    if (err.status) return error(res, 'credits-error', err.message, err.status);
    next(err);
  }
};

// GET /api/credits/summary
export const getCreditsSummary = async (req, res, next) => {
  try {
    const summary = await creditsService.getCreditsSummary(req.user, req.query);
    return success(res, { summary });
  } catch (err) {
    if (err.status) return error(res, 'credits-error', err.message, err.status);
    next(err);
  }
};
