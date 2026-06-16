import {
  listBatches, getBatchById, getBatchWithComponents,
  getIntakeRemainingEligible, getBatchRemainingAvailable,
  generateBatchCode, isBatchCodeUnique, getBatchAncestorIds,
  getAvailableIntakeSources, getAvailableBatchSources,
  createBatchTransaction, updateBatchById, cancelBatchTransaction,
  setBlockedById, setFailedById, updateWasteById,
} from './queries.js';
import { getProductById } from '../products/queries.js';
import { linkDocumentsToEntity } from '../documents/queries.js';
import { logAudit } from '../../services/audit.js';

const notFound = (msg = 'Batch not found.')  => Object.assign(new Error(msg), { status: 404 });
const badReq   = (msg)                        => Object.assign(new Error(msg), { status: 400 });
const conflict = (msg)                        => Object.assign(new Error(msg), { status: 409 });

const BATCH_CODE_RE = /^[A-Za-z0-9\-]+$/

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

export const generateCode = async (reqUser, query) => {
  const factory_id = reqUser.role === 'internal_admin'
    ? (query.factory_id || (() => { throw badReq('factory_id is required.'); })())
    : reqUser.factory_id;
  const code = await generateBatchCode(factory_id, query.date || null);
  return { batch_code: code };
};

export const getAvailableSources = async (reqUser, query) => {
  const factory_id = reqUser.role === 'internal_admin'
    ? (query.factory_id || (() => { throw badReq('factory_id is required.'); })())
    : reqUser.factory_id;
  if (!query.product_id) throw badReq('product_id is required.');
  const [intakes, batches] = await Promise.all([
    getAvailableIntakeSources(factory_id, query.product_id),
    getAvailableBatchSources(factory_id),
  ]);
  return { intakes, batches };
};

export const createBatch = async (reqUser, body, meta = {}) => {
  const {
    product_id, batch_code: submitted_code, batch_date, notes,
    sources, document_ids, for_consolidation = false,
  } = body;

  if (!product_id) throw badReq('product_id is required.');
  if (!Array.isArray(sources) || sources.length === 0) {
    throw badReq('sources must be a non-empty array of { source_type, source_id, weight_kg }.');
  }
  if (sources.length > 6) throw badReq('Maximum 6 source materials per batch.');

  const factory_id = reqUser.role === 'internal_admin'
    ? (body.factory_id || (() => { throw badReq('factory_id is required for internal_admin.'); })())
    : reqUser.factory_id;

  // Validate product
  const product = await getProductById(product_id);
  if (!product || product.factory_id !== factory_id) throw badReq('Product not found in this factory.');
  if (!product.is_active) throw badReq('Cannot create a batch with an inactive product.');

  // Validate batch_date (no future dates)
  if (batch_date && new Date(batch_date) > new Date()) {
    throw badReq('Batch date cannot be in the future.');
  }

  // Generate or validate batch_code
  const auto_code       = await generateBatchCode(factory_id, batch_date || null);
  const final_code      = submitted_code ? submitted_code.trim() : auto_code;
  const was_code_edited = submitted_code ? (submitted_code.trim() !== auto_code) : false;

  if (!final_code)                     throw badReq('batch_code cannot be empty.');
  if (!BATCH_CODE_RE.test(final_code)) throw badReq('batch_code may only contain letters, numbers, and hyphens.');
  const isUnique = await isBatchCodeUnique(factory_id, final_code);
  if (!isUnique) throw conflict('batch_code already exists in this factory. Choose a unique code.');

  // Validate each source and resolve remaining weight
  const resolvedSources = [];
  for (const [i, src] of sources.entries()) {
    if (!src.source_type || !['intake', 'batch'].includes(src.source_type)) {
      throw badReq(`Source ${i}: source_type must be 'intake' or 'batch'.`);
    }
    if (!src.source_id) throw badReq(`Source ${i}: source_id is required.`);

    const srcWeight = parseFloat(src.weight_kg);
    if (isNaN(srcWeight) || srcWeight <= 0) {
      throw badReq(`Source ${i}: weight_kg must be a positive number.`);
    }

    if (src.source_type === 'intake') {
      const info = await getIntakeRemainingEligible(src.source_id);
      if (!info)                            throw badReq(`Source ${i}: intake not found.`);
      if (info.factory_id !== factory_id)   throw badReq(`Source ${i}: intake does not belong to this factory.`);
      if (srcWeight > parseFloat(info.remaining_eligible_kg)) {
        throw badReq(`Source ${i}: requested ${srcWeight} kg exceeds remaining ${info.remaining_eligible_kg} kg.`);
      }
      resolvedSources.push({ source_type: 'intake', source_id: src.source_id, weight_kg: srcWeight, material_type: info.material_type });
    } else {
      const info = await getBatchRemainingAvailable(src.source_id);
      if (!info)                                         throw badReq(`Source ${i}: source batch not found.`);
      if (info.factory_id !== factory_id)                throw badReq(`Source ${i}: source batch does not belong to this factory.`);
      if (!info.is_active)                               throw badReq(`Source ${i}: source batch is blocked.`);
      if (['cancelled', 'failed'].includes(info.status)) throw badReq(`Source ${i}: source batch is ${info.status}.`);
      if (srcWeight > parseFloat(info.remaining_eligible_kg)) {
        throw badReq(`Source ${i}: requested ${srcWeight} kg exceeds remaining ${info.remaining_eligible_kg} kg.`);
      }
      resolvedSources.push({ source_type: 'batch', source_id: src.source_id, weight_kg: srcWeight });
    }
  }

  // output_weight_kg is always the sum of all source weights (PRD requirement)
  const output_weight_kg = parseFloat(
    resolvedSources.reduce((s, r) => s + r.weight_kg, 0).toFixed(4)
  );

  // Loop prevention: for batch sources, check that no source is an ancestor of another
  const batchSourceIds = resolvedSources.filter((s) => s.source_type === 'batch').map((s) => s.source_id);
  if (batchSourceIds.length > 1) {
    const ancestorSets = await Promise.all(batchSourceIds.map((id) => getBatchAncestorIds(id)));
    for (let i = 0; i < batchSourceIds.length; i++) {
      for (let j = 0; j < batchSourceIds.length; j++) {
        if (i !== j && ancestorSets[i].includes(batchSourceIds[j])) {
          throw badReq(
            'Circular reference detected: one source batch is an ancestor of another. This would create a loop in the material traceability chain.'
          );
        }
      }
    }
  }

  const batch = await createBatchTransaction(
    { factory_id, product_id, output_weight_kg, batch_code: final_code, batch_date: batch_date || null, original_batch_code: auto_code, was_code_edited, notes, created_by: reqUser.user_id, for_consolidation },
    resolvedSources
  );

  if (Array.isArray(document_ids) && document_ids.length > 0) {
    await linkDocumentsToEntity(document_ids, 'batch', batch.id, factory_id);
  }

  logAudit({
    action:      'batch.created',
    entity_type: 'batch',
    entity_id:   batch.id,
    factory_id,
    user_id:     reqUser.user_id,
    new_value:   { batch_code: final_code, original_batch_code: auto_code, was_code_edited, output_weight_kg, sources: resolvedSources.length },
    ip_address:  meta.ip || null,
  });

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

export const blockBatch = async (reqUser, id, reason) => {
  const batch = await getBatchById(id);
  if (!batch) throw notFound();
  assertFactoryAccess(reqUser, batch);
  if (batch.is_active === false) throw badReq('Batch is already blocked.');
  if (batch.status !== 'in_progress') throw badReq('Only in-progress batches can be blocked.');
  if (!reason?.trim()) throw badReq('A block reason is required.');
  return setBlockedById(id, false, reason.trim());
};

export const unblockBatch = async (reqUser, id) => {
  const batch = await getBatchById(id);
  if (!batch) throw notFound();
  assertFactoryAccess(reqUser, batch);
  if (batch.is_active !== false) throw badReq('Batch is not blocked.');
  return setBlockedById(id, true);
};

export const addWaste = async (reqUser, id, waste_kg) => {
  const batch = await getBatchById(id);
  if (!batch) throw notFound();
  assertFactoryAccess(reqUser, batch);
  if (batch.status !== 'in_progress') throw badReq('Can only update waste for in-progress batches.');
  if (batch.is_active === false) throw badReq('Cannot update waste for a blocked batch.');
  const wasteAmount = parseFloat(waste_kg);
  if (isNaN(wasteAmount) || wasteAmount <= 0) throw badReq('waste_kg must be a positive number.');
  if (wasteAmount > parseFloat(batch.remaining_weight_kg)) {
    throw badReq(`Waste amount exceeds remaining weight of ${batch.remaining_weight_kg} kg.`);
  }
  const updated = await updateWasteById(id, wasteAmount);
  logAudit({
    action:      'batch.waste_added',
    entity_type: 'batch',
    entity_id:   id,
    factory_id:  batch.factory_id,
    user_id:     reqUser.user_id,
    new_value:   { waste_kg: wasteAmount },
  });
  return updated;
};

export const failBatch = async (reqUser, id) => {
  const batch = await getBatchById(id);
  if (!batch) throw notFound();
  assertFactoryAccess(reqUser, batch);
  if (batch.status === 'failed')    throw badReq('Batch is already marked as failed.');
  if (batch.status === 'cancelled') throw badReq('Cannot fail a cancelled batch.');
  return setFailedById(id);
};
