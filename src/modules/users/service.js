import { getUserById, getUserByPhone, listUsers, insertUser, updateUserById, deleteUserById } from './queries.js';

const VALID_ROLES = ['employee', 'manager', 'internal_admin'];

const notFound  = (msg = 'User not found.')         => Object.assign(new Error(msg), { status: 404 });
const forbidden = (msg = 'Access denied.')           => Object.assign(new Error(msg), { status: 403 });
const badReq    = (msg)                              => Object.assign(new Error(msg), { status: 400 });
const conflict  = (msg = 'Resource already exists.') => Object.assign(new Error(msg), { status: 409 });

export const getMe = async (user_id) => {
  const user = await getUserById(user_id);
  if (!user) throw notFound();
  return user;
};

export const getUsers = async (reqUser, query) => {
  const { role, is_active, factory_id: qFactoryId, limit, offset } = query;

  let factory_id;
  if (reqUser.role === 'manager') {
    factory_id = reqUser.factory_id;
  } else {
    factory_id = qFactoryId || undefined;
  }

  const isActiveFilter =
    is_active === 'true'  ? true  :
    is_active === 'false' ? false : undefined;

  return listUsers({
    factory_id,
    role:      role || undefined,
    is_active: isActiveFilter,
    limit:     Math.min(parseInt(limit)  || 50, 200),
    offset:    parseInt(offset) || 0,
  });
};

export const createUser = async (reqUser, body) => {
  let { phone_number, full_name, role, factory_id } = body;

  if (!phone_number || !full_name || !role) throw badReq('phone_number, full_name, and role are required.');
  if (!VALID_ROLES.includes(role)) throw badReq(`role must be one of: ${VALID_ROLES.join(', ')}`);
  if (!/^\+[1-9]\d{6,14}$/.test(phone_number)) throw badReq('phone_number must be E.164 format (e.g. +972501234567)');

  if (reqUser.role === 'manager') {
    if (role !== 'employee') throw forbidden('Managers can only create employee accounts.');
    factory_id = reqUser.factory_id;
  }

  if (role !== 'internal_admin' && !factory_id) {
    throw badReq('factory_id is required for employee and manager roles.');
  }

  const existing = await getUserByPhone(phone_number);
  if (existing) throw conflict('A user with this phone number already exists.');

  return insertUser({ phone_number, full_name, role, factory_id: factory_id || null });
};

export const updateUser = async (reqUser, id, body) => {
  const target = await getUserById(id);
  if (!target) throw notFound();

  if (reqUser.role === 'manager') {
    if (target.factory_id !== reqUser.factory_id) throw notFound();
    if (target.role !== 'employee') throw forbidden('Managers can only modify employee accounts.');
    delete body.role;
  }

  const allowed = {};
  if (body.full_name  !== undefined) allowed.full_name  = body.full_name;
  if (body.is_active  !== undefined) allowed.is_active  = Boolean(body.is_active);
  if (body.role       !== undefined && reqUser.role === 'internal_admin') allowed.role = body.role;

  if (allowed.role && !VALID_ROLES.includes(allowed.role)) throw badReq(`role must be one of: ${VALID_ROLES.join(', ')}`);

  return updateUserById(id, allowed);
};

export const deactivateUser = async (reqUser, id) => {
  if (id === reqUser.user_id) throw forbidden('You cannot deactivate your own account.');
  return updateUser(reqUser, id, { is_active: false });
};

export const reactivateUser = async (reqUser, id) => {
  return updateUser(reqUser, id, { is_active: true });
};

export const deleteUser = async (reqUser, id) => {
  if (id === reqUser.user_id) throw forbidden('Cannot delete your own account.');
  const target = await getUserById(id);
  if (!target) throw notFound();
  if (reqUser.role === 'manager') {
    if (target.factory_id !== reqUser.factory_id) throw notFound();
    if (target.role !== 'employee') throw forbidden('Managers can only delete employee accounts.');
  }
  await deleteUserById(id);
};
