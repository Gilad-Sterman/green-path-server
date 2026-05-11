import { success, error } from '../../utils/response.js';
import * as suppliersService from './service.js';

// GET /api/suppliers
export const listSuppliers = async (req, res, next) => {
  try {
    const suppliers = await suppliersService.getSuppliers(req.user, req.query);
    return success(res, { suppliers, count: suppliers.length });
  } catch (err) {
    if (err.status) return error(res, 'supplier-error', err.message, err.status);
    next(err);
  }
};

// POST /api/suppliers
export const createSupplier = async (req, res, next) => {
  try {
    const supplier = await suppliersService.createSupplier(req.user, req.body);
    return success(res, { supplier }, {}, 201);
  } catch (err) {
    if (err.status) return error(res, 'supplier-error', err.message, err.status);
    next(err);
  }
};

// GET /api/suppliers/:id
export const getSupplier = async (req, res, next) => {
  try {
    const supplier = await suppliersService.getSupplier(req.user, req.params.id);
    return success(res, { supplier });
  } catch (err) {
    if (err.status) return error(res, 'supplier-error', err.message, err.status);
    next(err);
  }
};

// PATCH /api/suppliers/:id
export const updateSupplier = async (req, res, next) => {
  try {
    const supplier = await suppliersService.updateSupplier(req.user, req.params.id, req.body);
    if (!supplier) return error(res, 'no-changes', 'No valid fields provided to update.', 400);
    return success(res, { supplier });
  } catch (err) {
    if (err.status) return error(res, 'supplier-error', err.message, err.status);
    next(err);
  }
};

// PATCH /api/suppliers/:id/deactivate
export const deactivateSupplier = async (req, res, next) => {
  try {
    const supplier = await suppliersService.deactivateSupplier(req.user, req.params.id);
    return success(res, { supplier });
  } catch (err) {
    if (err.status) return error(res, 'supplier-error', err.message, err.status);
    next(err);
  }
};

// PATCH /api/suppliers/:id/reactivate
export const reactivateSupplier = async (req, res, next) => {
  try {
    const supplier = await suppliersService.reactivateSupplier(req.user, req.params.id);
    return success(res, { supplier });
  } catch (err) {
    if (err.status) return error(res, 'supplier-error', err.message, err.status);
    next(err);
  }
};
