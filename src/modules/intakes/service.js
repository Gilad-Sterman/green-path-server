import {
  listIntakes, getIntakeById, checkDuplicateDeliveryNote,
  insertIntake, updateIntakeById,
} from './queries.js';
import { logAudit } from '../../services/audit.js';

const MATERIAL_TYPES   = ['plastic', 'paper', 'metal', 'glass', 'textile', 'rubber', 'mixed', 'other'];
const MATERIAL_SOURCES = ['post_consumer', 'post_industrial', 'commercial', 'municipal', 'other'];
const MATERIAL_STATUSES = ['recycled', 'virgin', 'mixed'];

const notFound  = (msg = 'Intake not found.')  => Object.assign(new Error(msg), { status: 404 });
const badReq    = (msg)                         => Object.assign(new Error(msg), { status: 400 });
const conflict  = (msg)                         => Object.assign(new Error(msg), { status: 409 });

const resolveFactoryId = (reqUser, queryFactoryId) => {
  if (reqUser.role === 'internal_admin') return queryFactoryId || undefined;
  return reqUser.factory_id;
};

const assertFactoryAccess = (reqUser, intake) => {
  if (reqUser.role !== 'internal_admin' && intake.factory_id !== reqUser.factory_id) {
    throw notFound();
  }
};

export const getIntakes = async (reqUser, query) => {
  const { supplier_id, material_type, date_from, date_to, limit, offset, factory_id: qFactory } = query;

  return listIntakes({
    factory_id:   resolveFactoryId(reqUser, qFactory),
    supplier_id:  supplier_id   || undefined,
    material_type: material_type || undefined,
    date_from:    date_from     || undefined,
    date_to:      date_to       || undefined,
    limit:        Math.min(parseInt(limit) || 50, 200),
    offset:       parseInt(offset) || 0,
  });
};

export const getIntake = async (reqUser, id) => {
  const intake = await getIntakeById(id);
  if (!intake) throw notFound();
  assertFactoryAccess(reqUser, intake);
  return intake;
};

export const createIntake = async (reqUser, body, meta = {}) => {
  const {
    supplier_id, material_type, material_source, material_status,
    net_weight_kg, eligible_input_percent, intake_date, delivery_note_number,
    data_entry_profile, location_status, notes,
  } = body;

  // Required field validation
  if (!supplier_id)           throw badReq('supplier_id is required.');
  if (!material_type)         throw badReq('material_type is required.');
  if (!material_source)       throw badReq('material_source is required.');
  if (!material_status)       throw badReq('material_status is required.');
  if (!net_weight_kg)         throw badReq('net_weight_kg is required.');
  if (!intake_date)           throw badReq('intake_date is required.');
  if (!delivery_note_number?.trim()) throw badReq('delivery_note_number is required.');

  // Enum validation
  if (!MATERIAL_TYPES.includes(material_type)) {
    throw badReq(`material_type must be one of: ${MATERIAL_TYPES.join(', ')}`);
  }
  if (!MATERIAL_SOURCES.includes(material_source)) {
    throw badReq(`material_source must be one of: ${MATERIAL_SOURCES.join(', ')}`);
  }
  if (!MATERIAL_STATUSES.includes(material_status)) {
    throw badReq(`material_status must be one of: ${MATERIAL_STATUSES.join(', ')}`);
  }

  // Weight validation
  const weight = parseFloat(net_weight_kg);
  if (isNaN(weight) || weight <= 0) throw badReq('net_weight_kg must be a positive number.');

  const eligiblePct = eligible_input_percent !== undefined ? parseFloat(eligible_input_percent) : 100;
  if (isNaN(eligiblePct) || eligiblePct < 0 || eligiblePct > 100) {
    throw badReq('eligible_input_percent must be between 0 and 100.');
  }

  // Date must not be in the future
  const today = new Date().toISOString().split('T')[0];
  if (intake_date > today) throw badReq('intake_date cannot be in the future.');

  const factory_id = reqUser.role === 'internal_admin'
    ? (body.factory_id || (() => { throw badReq('factory_id is required for internal_admin.'); })())
    : reqUser.factory_id;

  // Duplicate delivery note check (per factory + supplier)
  const duplicate = await checkDuplicateDeliveryNote(factory_id, supplier_id, delivery_note_number.trim());
  if (duplicate) {
    throw conflict(
      `Delivery note "${delivery_note_number}" already exists for this supplier and factory. Possible duplicate intake.`
    );
  }

  const intake = await insertIntake({
    factory_id, supplier_id,
    material_type, material_source, material_status,
    net_weight_kg: weight,
    eligible_input_percent: eligiblePct,
    intake_date,
    delivery_note_number: delivery_note_number.trim(),
    data_entry_profile,
    location_status,
    notes,
    created_by: reqUser.user_id,
  });

  logAudit({
    action:      'intake.created',
    entity_type: 'intake',
    entity_id:   intake.id,
    factory_id:  intake.factory_id,
    user_id:     reqUser.user_id,
    new_value:   intake,
    ip_address:  meta.ip,
    user_agent:  meta.userAgent,
  });

  return intake;
};

export const updateIntake = async (reqUser, id, body, meta = {}) => {
  const intake = await getIntakeById(id);
  if (!intake) throw notFound();
  assertFactoryAccess(reqUser, intake);

  const allowed = {};

  if (body.material_type          !== undefined) {
    if (!MATERIAL_TYPES.includes(body.material_type)) throw badReq(`Invalid material_type.`);
    allowed.material_type = body.material_type;
  }
  if (body.material_source        !== undefined) {
    if (!MATERIAL_SOURCES.includes(body.material_source)) throw badReq('Invalid material_source.');
    allowed.material_source = body.material_source;
  }
  if (body.material_status        !== undefined) {
    if (!MATERIAL_STATUSES.includes(body.material_status)) throw badReq('Invalid material_status.');
    allowed.material_status = body.material_status;
  }
  if (body.net_weight_kg          !== undefined) {
    const w = parseFloat(body.net_weight_kg);
    if (isNaN(w) || w <= 0) throw badReq('net_weight_kg must be a positive number.');
    allowed.net_weight_kg = w;
  }
  if (body.eligible_input_percent !== undefined) {
    const p = parseFloat(body.eligible_input_percent);
    if (isNaN(p) || p < 0 || p > 100) throw badReq('eligible_input_percent must be between 0 and 100.');
    allowed.eligible_input_percent = p;
  }
  if (body.intake_date            !== undefined) {
    const today = new Date().toISOString().split('T')[0];
    if (body.intake_date > today) throw badReq('intake_date cannot be in the future.');
    allowed.intake_date = body.intake_date;
  }
  if (body.data_entry_profile     !== undefined) allowed.data_entry_profile  = body.data_entry_profile;
  if (body.location_status        !== undefined) allowed.location_status     = body.location_status;
  if (body.notes                  !== undefined) allowed.notes               = body.notes;

  const updated = await updateIntakeById(id, allowed);

  if (updated) {
    logAudit({
      action:      'intake.updated',
      entity_type: 'intake',
      entity_id:   id,
      factory_id:  intake.factory_id,
      user_id:     reqUser.user_id,
      old_value:   intake,
      new_value:   updated,
      ip_address:  meta.ip,
      user_agent:  meta.userAgent,
    });
  }

  return updated;
};
