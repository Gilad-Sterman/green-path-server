import {
  listFactories,
  getFactoryById,
  getFactoryByCompanyId,
  createFactoryWithManager,
  updateFactoryById,
  suspendFactoryById,
  unsuspendFactoryById,
} from './queries.js';

const VALID_STATUSES = ['active', 'suspended', 'inactive'];

const notFound  = (msg = 'Factory not found.')       => Object.assign(new Error(msg), { status: 404 });
const badReq    = (msg)                              => Object.assign(new Error(msg), { status: 400 });
const conflict  = (msg = 'Resource already exists.') => Object.assign(new Error(msg), { status: 409 });
const forbidden = (msg = 'Access denied.')           => Object.assign(new Error(msg), { status: 403 });

export const getFactories = async (query) => {
  const { status, limit, offset } = query;
  if (status && !VALID_STATUSES.includes(status)) throw badReq(`status must be one of: ${VALID_STATUSES.join(', ')}`);
  return listFactories({
    status:  status || undefined,
    limit:   Math.min(parseInt(limit)  || 50, 200),
    offset:  parseInt(offset) || 0,
  });
};

export const getFactory = async (reqUser, id) => {
  const factory = await getFactoryById(id);
  if (!factory) throw notFound();
  // Non-admins can only view their own factory
  if (reqUser.role !== 'internal_admin' && factory.id !== reqUser.factory_id) throw forbidden();
  return factory;
};

export const createFactory = async (body) => {
  const { name, company_id_number, address, geofence_center, geofence_radius_meters, admin_user } = body;

  if (!name || !company_id_number || !address) {
    throw badReq('name, company_id_number, and address are required.');
  }
  if (!admin_user?.full_name || !admin_user?.phone_number) {
    throw badReq('admin_user.full_name and admin_user.phone_number are required.');
  }
  if (!admin_user?.email) {
    throw badReq('admin_user.email is required.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(admin_user.email)) {
    throw badReq('admin_user.email must be a valid email address.');
  }
  if (!/^\+[1-9]\d{6,14}$/.test(admin_user.phone_number)) {
    throw badReq('admin_user.phone_number must be in E.164 format (e.g. +972501234567)');
  }

  if (geofence_center) {
    if (typeof geofence_center.lat !== 'number' || typeof geofence_center.lng !== 'number') {
      throw badReq('geofence_center must be { lat: number, lng: number }');
    }
  }

  const existing = await getFactoryByCompanyId(company_id_number);
  if (existing) throw conflict('A factory with this company ID number already exists.');

  const { factory, manager } = await createFactoryWithManager(
    { name, company_id_number, address, geofence_center, geofence_radius_meters },
    { full_name: admin_user.full_name, phone_number: admin_user.phone_number, email: admin_user.email }
  );

  return { factory_id: factory.id, admin_user_id: manager.id, invite_sent: false, factory, manager };
};

export const suspendFactory = async (id, reason) => {
  const factory = await getFactoryById(id);
  if (!factory) throw notFound();
  if (factory.status !== 'active') throw badReq('Only active factories can be suspended.');
  if (!reason?.trim()) throw badReq('A suspension reason is required.');
  const updated = await suspendFactoryById(id, reason.trim());
  if (!updated) throw badReq('Factory could not be suspended.');
  return updated;
};

export const unsuspendFactory = async (id) => {
  const factory = await getFactoryById(id);
  if (!factory) throw notFound();
  if (factory.status !== 'suspended') throw badReq('Only suspended factories can be unsuspended.');
  const updated = await unsuspendFactoryById(id);
  if (!updated) throw badReq('Factory could not be unsuspended.');
  return updated;
};

export const updateFactory = async (id, body) => {
  const factory = await getFactoryById(id);
  if (!factory) throw notFound();

  const allowed = {};
  if (body.name                   !== undefined) allowed.name = body.name;
  if (body.address                !== undefined) allowed.address = body.address;
  if (body.company_id_number      !== undefined) allowed.company_id_number = body.company_id_number;
  if (body.geofence_center        !== undefined) allowed.geofence_center = body.geofence_center;
  if (body.geofence_radius_meters !== undefined) allowed.geofence_radius_meters = body.geofence_radius_meters;
  if (body.status                 !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) throw badReq(`status must be one of: ${VALID_STATUSES.join(', ')}`);
    allowed.status = body.status;
  }

  // Check company_id_number uniqueness if being changed
  if (allowed.company_id_number && allowed.company_id_number !== factory.company_id_number) {
    const existing = await getFactoryByCompanyId(allowed.company_id_number);
    if (existing) throw conflict('A factory with this company ID number already exists.');
  }

  return updateFactoryById(id, allowed);
};
