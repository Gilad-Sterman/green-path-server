import { listCustomers, getCustomerById, insertCustomer, updateCustomerById } from './queries.js';

const notFound = (msg = 'Customer not found.') => Object.assign(new Error(msg), { status: 404 });
const badReq   = (msg)                         => Object.assign(new Error(msg), { status: 400 });

const resolveFactoryId = (reqUser, queryFactoryId) => {
  if (reqUser.role === 'internal_admin') return queryFactoryId || undefined;
  return reqUser.factory_id;
};

const assertFactoryAccess = (reqUser, customer) => {
  if (reqUser.role !== 'internal_admin' && customer.factory_id !== reqUser.factory_id) {
    throw notFound();
  }
};

export const getCustomers = async (reqUser, query) => {
  const { is_active, search, limit, offset, factory_id: qFactory } = query;
  return listCustomers({
    factory_id: resolveFactoryId(reqUser, qFactory),
    is_active:  is_active === 'true' ? true : is_active === 'false' ? false : undefined,
    search:     search || undefined,
    limit:      Math.min(parseInt(limit) || 50, 200),
    offset:     parseInt(offset) || 0,
  });
};

export const getCustomer = async (reqUser, id) => {
  const customer = await getCustomerById(id);
  if (!customer) throw notFound();
  assertFactoryAccess(reqUser, customer);
  return customer;
};

export const createCustomer = async (reqUser, body) => {
  const { name } = body;
  if (!name?.trim()) throw badReq('name is required.');

  const factory_id = reqUser.role === 'internal_admin'
    ? (body.factory_id || (() => { throw badReq('factory_id is required for internal_admin.'); })())
    : reqUser.factory_id;

  return insertCustomer({ factory_id, name: name.trim(), is_active: body.is_active !== false, created_by: reqUser.user_id });
};

export const updateCustomer = async (reqUser, id, body) => {
  const customer = await getCustomerById(id);
  if (!customer) throw notFound();
  assertFactoryAccess(reqUser, customer);

  const allowed = {};
  if (body.name      !== undefined) allowed.name      = body.name;
  if (body.is_active !== undefined) allowed.is_active = body.is_active;

  return updateCustomerById(id, allowed);
};

export const deactivateCustomer = async (reqUser, id) => {
  const customer = await getCustomerById(id);
  if (!customer) throw notFound();
  assertFactoryAccess(reqUser, customer);
  if (!customer.is_active) throw badReq('Customer is already inactive.');
  return updateCustomerById(id, { is_active: false });
};

export const reactivateCustomer = async (reqUser, id) => {
  const customer = await getCustomerById(id);
  if (!customer) throw notFound();
  assertFactoryAccess(reqUser, customer);
  if (customer.is_active) throw badReq('Customer is already active.');
  return updateCustomerById(id, { is_active: true });
};
