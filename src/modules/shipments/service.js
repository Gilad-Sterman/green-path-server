import {
  listShipments, getShipmentById, getShipmentWithItems,
  updateShipmentById, createShipmentTransaction,
} from './queries.js';
import { getBatchById } from '../batches/queries.js';
import { linkDocumentsToEntity } from '../documents/queries.js';
import { insertFlag } from '../flags/queries.js';
import { logAudit } from '../../services/audit.js';

const STATUSES = ['created', 'shipped', 'delivered', 'cancelled'];
const STATUS_TRANSITIONS = { created: ['shipped', 'cancelled'], shipped: ['delivered', 'cancelled'], delivered: [], cancelled: [] };

const notFound = (msg = 'Shipment not found.') => Object.assign(new Error(msg), { status: 404 });
const badReq   = (msg)                          => Object.assign(new Error(msg), { status: 400 });

const resolveFactoryId = (reqUser, queryFactoryId) => {
  if (reqUser.role === 'internal_admin') return queryFactoryId || undefined;
  return reqUser.factory_id;
};

const assertFactoryAccess = (reqUser, shipment) => {
  if (reqUser.role !== 'internal_admin' && shipment.factory_id !== reqUser.factory_id) {
    throw notFound();
  }
};

export const getShipments = async (reqUser, query) => {
  const { customer_id, status, date_from, date_to, limit, offset, factory_id: qFactory } = query;

  return listShipments({
    factory_id:  resolveFactoryId(reqUser, qFactory),
    customer_id: customer_id || undefined,
    status:      status      || undefined,
    date_from:   date_from   || undefined,
    date_to:     date_to     || undefined,
    limit:       Math.min(parseInt(limit) || 50, 200),
    offset:      parseInt(offset) || 0,
  });
};

export const getShipment = async (reqUser, id) => {
  const shipment = await getShipmentWithItems(id);
  if (!shipment) throw notFound();
  assertFactoryAccess(reqUser, shipment);
  return shipment;
};

export const createShipment = async (reqUser, body, meta = {}) => {
  const { customer_id, shipment_date, destination_address, notes, items } = body;

  if (!customer_id)            throw badReq('customer_id is required.');
  if (!shipment_date)          throw badReq('shipment_date is required.');
  if (!destination_address?.trim()) throw badReq('destination_address is required.');
  if (!Array.isArray(items) || items.length === 0) {
    throw badReq('items must be a non-empty array of { batch_id, weight_kg }.');
  }

  const factory_id = reqUser.role === 'internal_admin'
    ? (body.factory_id || (() => { throw badReq('factory_id is required for internal_admin.'); })())
    : reqUser.factory_id;

  // Validate each item
  const resolvedItems = [];
  for (const [i, item] of items.entries()) {
    if (!item.batch_id) throw badReq(`Item at index ${i}: batch_id is required.`);

    const itemWeight = parseFloat(item.weight_kg);
    if (isNaN(itemWeight) || itemWeight <= 0) {
      throw badReq(`Item at index ${i}: weight_kg must be a positive number.`);
    }

    const batch = await getBatchById(item.batch_id);
    if (!batch) throw badReq(`Item at index ${i}: batch not found.`);
    if (batch.factory_id !== factory_id) throw badReq(`Item at index ${i}: batch does not belong to this factory.`);
    if (batch.status === 'cancelled') throw badReq(`Item at index ${i}: batch is cancelled.`);

    const remaining = parseFloat(batch.remaining_weight_kg);
    if (itemWeight > remaining) {
      throw badReq(
        `Item at index ${i}: requested ${itemWeight} kg exceeds batch remaining weight of ${remaining} kg.`
      );
    }

    resolvedItems.push({ batch_id: item.batch_id, weight_kg: itemWeight });
  }

  const result = await createShipmentTransaction(
    { factory_id, customer_id, shipment_date, destination_address: destination_address.trim(), notes },
    resolvedItems
  );

  const { document_ids } = body;
  if (Array.isArray(document_ids) && document_ids.length > 0) {
    await linkDocumentsToEntity(document_ids, 'shipment', result.shipment.id, factory_id);
  } else {
    insertFlag({
      factory_id,
      entity_type: 'shipment',
      entity_id:   result.shipment.id,
      reason:      'missing-document',
      severity:    'medium',
    }).catch(() => {});
  }

  logAudit({
    action:      'shipment.created',
    entity_type: 'shipment',
    entity_id:   result.shipment.id,
    factory_id:  result.shipment.factory_id,
    user_id:     reqUser.user_id,
    new_value:   result.shipment,
    ip_address:  meta.ip,
    user_agent:  meta.userAgent,
  });

  return result;
};

export const updateShipmentStatus = async (reqUser, id, body, meta = {}) => {
  const shipment = await getShipmentById(id);
  if (!shipment) throw notFound();
  assertFactoryAccess(reqUser, shipment);

  const { status } = body;
  if (!status) throw badReq('status is required.');
  if (!STATUSES.includes(status)) throw badReq(`status must be one of: ${STATUSES.join(', ')}`);

  const allowed = STATUS_TRANSITIONS[shipment.status] || [];
  if (!allowed.includes(status)) {
    throw badReq(`Cannot transition shipment from "${shipment.status}" to "${status}".`);
  }

  const updated = await updateShipmentById(id, { status });

  if (updated) {
    logAudit({
      action:      'shipment.status_changed',
      entity_type: 'shipment',
      entity_id:   id,
      factory_id:  shipment.factory_id,
      user_id:     reqUser.user_id,
      old_value:   { status: shipment.status },
      new_value:   { status },
      ip_address:  meta.ip,
      user_agent:  meta.userAgent,
    });
  }

  return updated;
};
