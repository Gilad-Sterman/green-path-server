import { success, error } from '../../utils/response.js';
import * as customersService from './service.js';

export const listCustomers = async (req, res, next) => {
  try {
    const customers = await customersService.getCustomers(req.user, req.query);
    return success(res, { customers, count: customers.length });
  } catch (err) {
    if (err.status) return error(res, 'customer-error', err.message, err.status);
    next(err);
  }
};

export const createCustomer = async (req, res, next) => {
  try {
    const customer = await customersService.createCustomer(req.user, req.body);
    return success(res, { customer }, {}, 201);
  } catch (err) {
    if (err.status) return error(res, 'customer-error', err.message, err.status);
    next(err);
  }
};

export const getCustomer = async (req, res, next) => {
  try {
    const customer = await customersService.getCustomer(req.user, req.params.id);
    return success(res, { customer });
  } catch (err) {
    if (err.status) return error(res, 'customer-error', err.message, err.status);
    next(err);
  }
};

export const updateCustomer = async (req, res, next) => {
  try {
    const customer = await customersService.updateCustomer(req.user, req.params.id, req.body);
    if (!customer) return error(res, 'no-changes', 'No valid fields provided to update.', 400);
    return success(res, { customer });
  } catch (err) {
    if (err.status) return error(res, 'customer-error', err.message, err.status);
    next(err);
  }
};

export const deactivateCustomer = async (req, res, next) => {
  try {
    const customer = await customersService.deactivateCustomer(req.user, req.params.id);
    return success(res, { customer });
  } catch (err) {
    if (err.status) return error(res, 'customer-error', err.message, err.status);
    next(err);
  }
};

export const reactivateCustomer = async (req, res, next) => {
  try {
    const customer = await customersService.reactivateCustomer(req.user, req.params.id);
    return success(res, { customer });
  } catch (err) {
    if (err.status) return error(res, 'customer-error', err.message, err.status);
    next(err);
  }
};
