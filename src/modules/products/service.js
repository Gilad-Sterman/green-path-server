import { listProducts, getProductById, getProductBySku, insertProduct, updateProductById } from './queries.js';

const notFound  = (msg = 'Product not found.')    => Object.assign(new Error(msg), { status: 404 });
const badReq    = (msg)                            => Object.assign(new Error(msg), { status: 400 });
const conflict  = (msg)                            => Object.assign(new Error(msg), { status: 409 });

const resolveFactoryId = (reqUser, queryFactoryId) => {
  if (reqUser.role === 'internal_admin') return queryFactoryId || undefined;
  return reqUser.factory_id;
};

const assertFactoryAccess = (reqUser, product) => {
  if (reqUser.role !== 'internal_admin' && product.factory_id !== reqUser.factory_id) {
    throw notFound();
  }
};

export const getProducts = async (reqUser, query) => {
  const { is_active, search, limit, offset, factory_id: qFactory } = query;

  return listProducts({
    factory_id: resolveFactoryId(reqUser, qFactory),
    is_active:  is_active === 'true' ? true : is_active === 'false' ? false : undefined,
    search:     search || undefined,
    limit:      Math.min(parseInt(limit) || 50, 200),
    offset:     parseInt(offset) || 0,
  });
};

export const getProduct = async (reqUser, id) => {
  const product = await getProductById(id);
  if (!product) throw notFound();
  assertFactoryAccess(reqUser, product);
  return product;
};

export const createProduct = async (reqUser, body) => {
  const { name, sku, description, required_lab_tests } = body;

  if (!name?.trim()) throw badReq('name is required.');
  if (!sku?.trim())  throw badReq('sku is required.');
  if (required_lab_tests && !Array.isArray(required_lab_tests)) {
    throw badReq('required_lab_tests must be an array of strings.');
  }

  const factory_id = reqUser.role === 'internal_admin'
    ? (body.factory_id || (() => { throw badReq('factory_id is required for internal_admin.'); })())
    : reqUser.factory_id;

  const existing = await getProductBySku(factory_id, sku.trim().toUpperCase());
  if (existing) throw conflict(`A product with SKU "${sku}" already exists in this factory.`);

  return insertProduct({
    factory_id,
    name: name.trim(),
    sku:  sku.trim().toUpperCase(),
    description,
    required_lab_tests,
  });
};

export const updateProduct = async (reqUser, id, body) => {
  const product = await getProductById(id);
  if (!product) throw notFound();
  assertFactoryAccess(reqUser, product);

  const allowed = {};
  if (body.name               !== undefined) allowed.name               = body.name;
  if (body.description        !== undefined) allowed.description        = body.description;
  if (body.required_lab_tests !== undefined) allowed.required_lab_tests = body.required_lab_tests;

  return updateProductById(id, allowed);
};

export const deactivateProduct = async (reqUser, id) => {
  const product = await getProductById(id);
  if (!product) throw notFound();
  assertFactoryAccess(reqUser, product);
  if (!product.is_active) throw badReq('Product is already inactive.');
  return updateProductById(id, { is_active: false });
};

export const reactivateProduct = async (reqUser, id) => {
  const product = await getProductById(id);
  if (!product) throw notFound();
  assertFactoryAccess(reqUser, product);
  if (product.is_active) throw badReq('Product is already active.');
  return updateProductById(id, { is_active: true });
};
