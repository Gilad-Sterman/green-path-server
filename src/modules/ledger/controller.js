import { success, error } from '../../utils/response.js';
import * as ledgerService from './service.js';

// GET /api/ledger/balance
export const getBalance = async (req, res, next) => {
  try {
    const balance = await ledgerService.getBalance(req.user, req.query);
    return success(res, { balance });
  } catch (err) {
    if (err.status) return error(res, 'ledger-error', err.message, err.status);
    next(err);
  }
};

// GET /api/ledger/entries
export const getEntries = async (req, res, next) => {
  try {
    const entries = await ledgerService.getEntries(req.user, req.query);
    return success(res, { entries, count: entries.length });
  } catch (err) {
    if (err.status) return error(res, 'ledger-error', err.message, err.status);
    next(err);
  }
};
