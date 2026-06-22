import {
  listShipments, getShipmentById, getShipmentWithItems,
  getShipmentByDeliveryNote, updateShipmentById, createShipmentTransaction,
} from './queries.js';
import { getBatchById } from '../batches/queries.js';
import { linkDocumentsToEntity, getDocumentsByIds } from '../documents/queries.js';
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
  const { customer_id, shipment_date, destination_address, notes, items,
          delivery_note_number, lab_test_number } = body;

  if (!customer_id)            throw badReq('customer_id is required.');
  if (!shipment_date)          throw badReq('shipment_date is required.');
  if (!destination_address?.trim()) throw badReq('destination_address is required.');
  if (!Array.isArray(items) || items.length === 0) {
    throw badReq('items must be a non-empty array of { batch_id, weight_kg }.');
  }
  if (items.length > 10) throw badReq('A shipment cannot contain more than 10 batch lines.');

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

    const eligiblePct = parseFloat(batch.eligible_percent || 0);
    const credit      = parseFloat((itemWeight * eligiblePct / 100).toFixed(2));
    resolvedItems.push({
      batch_id:         item.batch_id,
      product_id:       batch.product_id,
      weight_kg:        itemWeight,
      eligible_percent: eligiblePct,
      credit,
    });
  }

  const totalCredit = resolvedItems.reduce((s, it) => s + it.credit, 0);
  if (totalCredit <= 0) {
    throw badReq(
      'לא ניתן ליצור משלוח ללא זיכוי. בדוק שאחוז הזכאות של התוצ"ג גדול מ-0.'
    );
  }

  const result = await createShipmentTransaction(
    {
      factory_id,
      customer_id,
      shipment_date,
      destination_address:  destination_address.trim(),
      delivery_note_number: delivery_note_number || null,
      lab_test_number:      lab_test_number      || null,
      notes,
    },
    resolvedItems
  );

  const { document_ids } = body;
  if (!Array.isArray(document_ids) || document_ids.length === 0) {
    throw badReq('יש לצרף בדיקת מעבדה ותעודת משלוח לפני יצירת המשלוח.');
  }

  const uploadedDocs = await getDocumentsByIds(document_ids);
  const docTypes     = uploadedDocs.map((d) => d.document_type);
  if (!docTypes.includes('lab_test')) {
    throw badReq('מסמך בדיקת מעבדה חסר. יש לצרף בדיקת מעבדה לפני יצירת המשלוח.');
  }
  if (!docTypes.includes('delivery_note')) {
    throw badReq('תעודת משלוח חסרה. יש לצרף תעודת משלוח לפני יצירת המשלוח.');
  }

  await linkDocumentsToEntity(document_ids, 'shipment', result.shipment.id, factory_id);

  // Lab test mismatch detection — non-blocking flag
  try {
    const labPct = typeof body.lab_test_recycled_percent === 'number'
      ? body.lab_test_recycled_percent
      : null;
    if (labPct !== null) {
      const hasMismatch = resolvedItems.some(
        (item) => Math.abs(labPct - item.eligible_percent) > 5
      );
      if (hasMismatch) {
        await insertFlag({
          factory_id,
          entity_type: 'shipment',
          entity_id:   result.shipment.id,
          reason:      'lab_test_mismatch',
          severity:    'high',
        });
      }
    }
  } catch (_) { /* flag failure must never block shipment creation */ }

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

/**
 * STUB — חשבשבת webhook receiver.
 * Will be called when חשבשבת pushes an invoice back (or during polling).
 * Matches the shipment via delivery_note_number (the anchor), stores invoice data.
 * TODO: validate HMAC signature from חשבשבת when the real integration is wired.
 */
export const receiveHashavshevetInvoice = async (body) => {
  const { delivery_note_number, invoice_number, invoice_date, invoice_file_url } = body;

  if (!delivery_note_number) throw badReq('delivery_note_number is required.');
  if (!invoice_number)       throw badReq('invoice_number is required.');

  // Find matching shipment by delivery_note_number
  const shipment = await getShipmentByDeliveryNote(delivery_note_number);
  if (!shipment) {
    throw Object.assign(
      new Error(`No shipment found with delivery_note_number: ${delivery_note_number}`),
      { status: 404 }
    );
  }

  const updated = await updateShipmentById(shipment.id, {
    invoice_status:         'received',
    invoice_number,
    invoice_date:           invoice_date   || null,
    invoice_file_url:       invoice_file_url || null,
    hashavshevet_synced_at: new Date().toISOString(),
  });

  return updated;
};

export const updateManualInvoice = async (reqUser, id, body) => {
  const shipment = await getShipmentById(id);
  if (!shipment) throw notFound();
  assertFactoryAccess(reqUser, shipment);

  if (shipment.status === 'cancelled') throw badReq('לא ניתן להוסיף חשבונית למשלוח שבוטל.');
  if (shipment.invoice_status === 'received') throw badReq('חשבונית כבר התקבלה עבור משלוח זה.');

  const { invoice_number, invoice_date, invoice_document_id } = body;
  if (!invoice_number?.trim()) throw badReq('invoice_number is required.');

  const updated = await updateShipmentById(id, {
    invoice_status:        'received',
    invoice_number:        invoice_number.trim(),
    invoice_date:          invoice_date || null,
    upload_invoice_manual: true,
  });

  if (invoice_document_id) {
    await linkDocumentsToEntity([invoice_document_id], 'shipment', id, shipment.factory_id);
  }

  return updated;
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
