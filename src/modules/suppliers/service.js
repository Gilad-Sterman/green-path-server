import { listSuppliers, getSupplierById, insertSupplier, updateSupplierById } from './queries.js';

const notFound = (msg = 'Supplier not found.') => Object.assign(new Error(msg), { status: 404 });
const badReq   = (msg)                         => Object.assign(new Error(msg), { status: 400 });
const forbidden = (msg = 'Access denied.')     => Object.assign(new Error(msg), { status: 403 });

// Resolve the factory_id to scope queries.
// internal_admin can query any factory via ?factory_id=; others are pinned to their own.
const resolveFactoryId = (reqUser, queryFactoryId) => {
  if (reqUser.role === 'internal_admin') return queryFactoryId || undefined;
  return reqUser.factory_id;
};

// Ensure a found record belongs to the requesting user's factory (non-admins).
const assertFactoryAccess = (reqUser, supplier) => {
  if (reqUser.role !== 'internal_admin' && supplier.factory_id !== reqUser.factory_id) {
    throw notFound(); // mask as 404 so IDs from other factories aren't leaked
  }
};

export const getSuppliers = async (reqUser, query) => {
  const { is_active, search, limit, offset, factory_id: qFactory } = query;

  return listSuppliers({
    factory_id: resolveFactoryId(reqUser, qFactory),
    is_active:  is_active === 'true' ? true : is_active === 'false' ? false : undefined,
    search:     search   || undefined,
    limit:      Math.min(parseInt(limit) || 50, 200),
    offset:     parseInt(offset) || 0,
  });
};

export const getSupplier = async (reqUser, id) => {
  const supplier = await getSupplierById(id);
  if (!supplier) throw notFound();
  assertFactoryAccess(reqUser, supplier);
  return supplier;
};

export const createSupplier = async (reqUser, body) => {
  const {
    name, contact_person, phone, email,
    allowed_material_types, allowed_material_sources, erp_id,
  } = body;

  if (!name?.trim()) throw badReq('name is required.');
  if (allowed_material_types && !Array.isArray(allowed_material_types)) {
    throw badReq('allowed_material_types must be an array of strings.');
  }
  if (allowed_material_sources && !Array.isArray(allowed_material_sources)) {
    throw badReq('allowed_material_sources must be an array of strings.');
  }

  const factory_id = reqUser.role === 'internal_admin'
    ? (body.factory_id || (() => { throw badReq('factory_id is required for internal_admin.'); })())
    : reqUser.factory_id;

  return insertSupplier({
    factory_id, name: name.trim(), contact_person, phone, email,
    allowed_material_types, allowed_material_sources, erp_id,
  });
};

export const updateSupplier = async (reqUser, id, body) => {
  const supplier = await getSupplierById(id);
  if (!supplier) throw notFound();
  assertFactoryAccess(reqUser, supplier);

  const allowed = {};
  if (body.name                    !== undefined) allowed.name                    = body.name;
  if (body.contact_person          !== undefined) allowed.contact_person          = body.contact_person;
  if (body.phone                   !== undefined) allowed.phone                   = body.phone;
  if (body.email                   !== undefined) allowed.email                   = body.email;
  if (body.allowed_material_types  !== undefined) allowed.allowed_material_types  = body.allowed_material_types;
  if (body.allowed_material_sources !== undefined) allowed.allowed_material_sources = body.allowed_material_sources;
  if (body.erp_id                  !== undefined) allowed.erp_id                  = body.erp_id;

  return updateSupplierById(id, allowed);
};

export const deactivateSupplier = async (reqUser, id) => {
  const supplier = await getSupplierById(id);
  if (!supplier) throw notFound();
  assertFactoryAccess(reqUser, supplier);
  if (!supplier.is_active) throw badReq('Supplier is already inactive.');
  return updateSupplierById(id, { is_active: false });
};

export const reactivateSupplier = async (reqUser, id) => {
  const supplier = await getSupplierById(id);
  if (!supplier) throw notFound();
  assertFactoryAccess(reqUser, supplier);
  if (supplier.is_active) throw badReq('Supplier is already active.');
  return updateSupplierById(id, { is_active: true });
};
