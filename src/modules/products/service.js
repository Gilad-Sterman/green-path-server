import { listProducts, getProductById, getProductBySku, insertProduct, updateProductById } from './queries.js';

const notFound  = (msg = 'Product not found.')    => Object.assign(new Error(msg), { status: 404 });
const badReq    = (msg)                            => Object.assign(new Error(msg), { status: 400 });
const conflict  = (msg)                            => Object.assign(new Error(msg), { status: 409 });

const VALID_MATERIAL_TYPES = ['PET', 'HDPE', 'PP', 'LDPE', 'PVC', 'PE', 'mixed', 'other', 'virgin'];

const computeEligiblePercent = (recipe) =>
  recipe.reduce((s, r) => s + (r.is_recycled ? parseFloat(r.percent) : 0), 0);

const validateRecipe = (recipe) => {
  if (!Array.isArray(recipe) || recipe.length === 0)
    throw badReq('material_recipe must contain at least one material.');
  if (recipe.length > 6)
    throw badReq('material_recipe cannot have more than 6 materials.');

  const types = [];
  for (const row of recipe) {
    if (!VALID_MATERIAL_TYPES.includes(row.material_type))
      throw badReq(`Invalid material_type: "${row.material_type}".`);
    const pct = parseFloat(row.percent);
    if (isNaN(pct) || pct <= 0 || pct > 99)
      throw badReq(`percent must be between 1 and 99 (got ${row.percent}).`);
    if (types.includes(row.material_type))
      throw badReq(`Duplicate material_type "${row.material_type}" in recipe.`);
    types.push(row.material_type);
  }

  const sum = recipe.reduce((s, r) => s + parseFloat(r.percent), 0);
  if (Math.abs(sum - 100) > 0.01)
    throw badReq(`Sum of material percentages must equal 100 (got ${sum.toFixed(2)}).`);
};

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
  const { name, description, required_lab_tests, material_recipe, is_active = true } = body;

  if (!name?.trim()) throw badReq('name is required.');
  if (required_lab_tests && !Array.isArray(required_lab_tests))
    throw badReq('required_lab_tests must be an array of strings.');

  validateRecipe(material_recipe);

  const factory_id = reqUser.role === 'internal_admin'
    ? (body.factory_id || (() => { throw badReq('factory_id is required for internal_admin.'); })())
    : reqUser.factory_id;

  // const existing = await getProductBySku(factory_id, sku.trim().toUpperCase());
  // if (existing) throw conflict(`A product with SKU "${sku}" already exists in this factory.`);


  return insertProduct({
    factory_id,
    name:             name.trim(),
    // sku:              sku.trim().toUpperCase(),
    description,
    required_lab_tests,
    material_recipe,
    eligible_percent: computeEligiblePercent(material_recipe),
    is_active,
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
  if (body.material_recipe    !== undefined) {
    validateRecipe(body.material_recipe);
    allowed.material_recipe  = body.material_recipe;
    allowed.eligible_percent = computeEligiblePercent(body.material_recipe);
  }

  if (body.is_active !== undefined) allowed.is_active = body.is_active;

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
