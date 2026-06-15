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
  const { name, allowed_material_types } = body;

  if (!name?.trim()) throw badReq('name is required.');
  if (!Array.isArray(allowed_material_types) || allowed_material_types.length === 0) {
    throw badReq('At least one allowed_material_type is required.');
  }

  const factory_id = reqUser.role === 'internal_admin'
    ? (body.factory_id || (() => { throw badReq('factory_id is required for internal_admin.'); })())
    : reqUser.factory_id;

  return insertSupplier({ factory_id, name: name.trim(), allowed_material_types, is_active: body.is_active !== false });
};

export const updateSupplier = async (reqUser, id, body) => {
  const supplier = await getSupplierById(id);
  if (!supplier) throw notFound();
  assertFactoryAccess(reqUser, supplier);

  const allowed = {};
  if (body.name                   !== undefined) allowed.name                   = body.name;
  if (body.is_active              !== undefined) allowed.is_active              = body.is_active;
  if (body.allowed_material_types !== undefined) {
    if (!Array.isArray(body.allowed_material_types) || body.allowed_material_types.length === 0) {
      throw badReq('At least one allowed_material_type is required.');
    }
    allowed.allowed_material_types = body.allowed_material_types;
  }

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
