import {
  listBatches, getBatchById, getBatchWithComponents,
  getIntakeRemainingEligible, createBatchTransaction,
  updateBatchById, cancelBatchTransaction,
  setBlockedById, setFailedById,
} from './queries.js';
import { getProductById } from '../products/queries.js';

const notFound = (msg = 'Batch not found.')  => Object.assign(new Error(msg), { status: 404 });
const badReq   = (msg)                        => Object.assign(new Error(msg), { status: 400 });

const resolveFactoryId = (reqUser, queryFactoryId) => {
  if (reqUser.role === 'internal_admin') return queryFactoryId || undefined;
  return reqUser.factory_id;
};

const assertFactoryAccess = (reqUser, batch) => {
  if (reqUser.role !== 'internal_admin' && batch.factory_id !== reqUser.factory_id) {
    throw notFound();
  }
};

export const getBatches = async (reqUser, query) => {
  const { product_id, status, limit, offset, factory_id: qFactory } = query;

  return listBatches({
    factory_id: resolveFactoryId(reqUser, qFactory),
    product_id: product_id || undefined,
    status:     status     || undefined,
    limit:      Math.min(parseInt(limit) || 50, 200),
    offset:     parseInt(offset) || 0,
  });
};

export const getBatch = async (reqUser, id) => {
  const batch = await getBatchWithComponents(id);
  if (!batch) throw notFound();
  assertFactoryAccess(reqUser, batch);
  return batch;
};

export const createBatch = async (reqUser, body) => {
  const { product_id, output_weight_kg, notes, components } = body;

  if (!product_id)                            throw badReq('product_id is required.');
  if (!output_weight_kg)                      throw badReq('output_weight_kg is required.');
  if (!Array.isArray(components) || components.length === 0) {
    throw badReq('components must be a non-empty array of { intake_id, weight_kg }.');
  }

  const weight = parseFloat(output_weight_kg);
  if (isNaN(weight) || weight <= 0) throw badReq('output_weight_kg must be a positive number.');

  const factory_id = reqUser.role === 'internal_admin'
    ? (body.factory_id || (() => { throw badReq('factory_id is required for internal_admin.'); })())
    : reqUser.factory_id;

  // Validate product belongs to factory
  const product = await getProductById(product_id);
  if (!product || product.factory_id !== factory_id) throw badReq('Product not found in this factory.');
  if (!product.is_active) throw badReq('Cannot create a batch with an inactive product.');

  // Validate each component and check remaining eligible weight
  const resolvedComponents = [];
  for (const [i, comp] of components.entries()) {
    if (!comp.intake_id) throw badReq(`Component at index ${i}: intake_id is required.`);

    const compWeight = parseFloat(comp.weight_kg);
    if (isNaN(compWeight) || compWeight <= 0) {
      throw badReq(`Component at index ${i}: weight_kg must be a positive number.`);
    }

    const intakeInfo = await getIntakeRemainingEligible(comp.intake_id);
    if (!intakeInfo) throw badReq(`Component at index ${i}: intake not found.`);
    if (intakeInfo.factory_id !== factory_id) {
      throw badReq(`Component at index ${i}: intake does not belong to this factory.`);
    }

    const remaining = parseFloat(intakeInfo.remaining_eligible_kg);
    if (compWeight > remaining) {
      throw badReq(
        `Component at index ${i}: requested ${compWeight} kg exceeds remaining eligible weight of ${remaining} kg for this intake.`
      );
    }

    resolvedComponents.push({
      intake_id:     comp.intake_id,
      weight_kg:     compWeight,
      material_type: intakeInfo.material_type,
    });
  }

  const batch = await createBatchTransaction({ factory_id, product_id, output_weight_kg: weight, notes }, resolvedComponents);
  return getBatchById(batch.id);
};

export const completeBatch = async (reqUser, id) => {
  const batch = await getBatchById(id);
  if (!batch) throw notFound();
  assertFactoryAccess(reqUser, batch);
  if (batch.status === 'completed') throw badReq('Batch is already completed.');
  if (batch.status === 'cancelled') throw badReq('Cannot complete a cancelled batch.');
  return updateBatchById(id, { status: 'completed' });
};

export const cancelBatch = async (reqUser, id) => {
  const batch = await getBatchById(id);
  if (!batch) throw notFound();
  assertFactoryAccess(reqUser, batch);
  if (batch.status === 'cancelled') throw badReq('Batch is already cancelled.');
  if (parseFloat(batch.used_weight_kg) > 0) {
    throw badReq('Cannot cancel a batch that has already been partially or fully shipped.');
  }
  await cancelBatchTransaction(id, batch.factory_id);
  return getBatchById(id);
};

export const blockBatch = async (reqUser, id) => {
  const batch = await getBatchById(id);
  if (!batch) throw notFound();
  assertFactoryAccess(reqUser, batch);
  if (batch.is_active === false) throw badReq('Batch is already blocked.');
  if (batch.status !== 'in_progress') throw badReq('Only in-progress batches can be blocked.');
  return setBlockedById(id, false);
};

export const unblockBatch = async (reqUser, id) => {
  const batch = await getBatchById(id);
  if (!batch) throw notFound();
  assertFactoryAccess(reqUser, batch);
  if (batch.is_active !== false) throw badReq('Batch is not blocked.');
  return setBlockedById(id, true);
};

export const failBatch = async (reqUser, id) => {
  const batch = await getBatchById(id);
  if (!batch) throw notFound();
  assertFactoryAccess(reqUser, batch);
  if (batch.status === 'failed')    throw badReq('Batch is already marked as failed.');
  if (batch.status === 'cancelled') throw badReq('Cannot fail a cancelled batch.');
  return setFailedById(id);
};
