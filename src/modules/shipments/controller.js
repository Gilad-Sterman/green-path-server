import { success, error } from '../../utils/response.js';
import * as shipmentsService from './service.js';

// GET /api/shipments
export const listShipments = async (req, res, next) => {
  try {
    const shipments = await shipmentsService.getShipments(req.user, req.query);
    return success(res, { shipments, count: shipments.length });
  } catch (err) {
    if (err.status) return error(res, 'shipment-error', err.message, err.status);
    next(err);
  }
};

// GET /api/shipments/:id
export const getShipment = async (req, res, next) => {
  try {
    const shipment = await shipmentsService.getShipment(req.user, req.params.id);
    return success(res, { shipment });
  } catch (err) {
    if (err.status) return error(res, 'shipment-error', err.message, err.status);
    next(err);
  }
};

// POST /api/shipments
export const createShipment = async (req, res, next) => {
  try {
    const result = await shipmentsService.createShipment(req.user, req.body, { ip: req.ip, userAgent: req.headers['user-agent'] });
    return success(res, result, {}, 201);
  } catch (err) {
    if (err.status) return error(res, err.code || 'shipment-error', err.message, err.status);
    next(err);
  }
};

// PATCH /api/shipments/:id/status
export const updateShipmentStatus = async (req, res, next) => {
  try {
    const shipment = await shipmentsService.updateShipmentStatus(req.user, req.params.id, req.body, { ip: req.ip, userAgent: req.headers['user-agent'] });
    if (!shipment) return error(res, 'no-changes', 'No valid fields to update.', 400);
    return success(res, { shipment });
  } catch (err) {
    if (err.status) return error(res, 'shipment-error', err.message, err.status);
    next(err);
  }
};
