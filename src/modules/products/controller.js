import { success, error } from '../../utils/response.js';
import * as productsService from './service.js';

// GET /api/products
export const listProducts = async (req, res, next) => {
  try {
    const products = await productsService.getProducts(req.user, req.query);
    return success(res, { products, count: products.length });
  } catch (err) {
    if (err.status) return error(res, 'product-error', err.message, err.status);
    next(err);
  }
};

// GET /api/products/:id
export const getProduct = async (req, res, next) => {
  try {
    const product = await productsService.getProduct(req.user, req.params.id);
    return success(res, { product });
  } catch (err) {
    if (err.status) return error(res, 'product-error', err.message, err.status);
    next(err);
  }
};

// POST /api/products
export const createProduct = async (req, res, next) => {
  try {
    const product = await productsService.createProduct(req.user, req.body);
    return success(res, { product }, {}, 201);
  } catch (err) {
    if (err.status) return error(res, 'product-error', err.message, err.status);
    next(err);
  }
};

// PATCH /api/products/:id
export const updateProduct = async (req, res, next) => {
  try {
    const product = await productsService.updateProduct(req.user, req.params.id, req.body);
    if (!product) return error(res, 'no-changes', 'No valid fields provided to update.', 400);
    return success(res, { product });
  } catch (err) {
    if (err.status) return error(res, 'product-error', err.message, err.status);
    next(err);
  }
};

// PATCH /api/products/:id/deactivate
export const deactivateProduct = async (req, res, next) => {
  try {
    const product = await productsService.deactivateProduct(req.user, req.params.id);
    return success(res, { product });
  } catch (err) {
    if (err.status) return error(res, 'product-error', err.message, err.status);
    next(err);
  }
};

// PATCH /api/products/:id/reactivate
export const reactivateProduct = async (req, res, next) => {
  try {
    const product = await productsService.reactivateProduct(req.user, req.params.id);
    return success(res, { product });
  } catch (err) {
    if (err.status) return error(res, 'product-error', err.message, err.status);
    next(err);
  }
};
