import { getLedgerBalance, getLedgerEntries } from './queries.js';

export const getBalance = async (reqUser, query) => {
  const factory_id = reqUser.role === 'internal_admin'
    ? query.factory_id
    : reqUser.factory_id;

  if (!factory_id) {
    throw Object.assign(new Error('factory_id is required.'), { status: 400 });
  }

  return getLedgerBalance(factory_id);
};

export const getEntries = async (reqUser, query) => {
  const { movement_type, material_type, entity_type, limit, offset, factory_id: qFactory } = query;

  const factory_id = reqUser.role === 'internal_admin'
    ? qFactory
    : reqUser.factory_id;

  if (!factory_id) {
    throw Object.assign(new Error('factory_id is required.'), { status: 400 });
  }

  return getLedgerEntries({
    factory_id,
    movement_type: movement_type || undefined,
    material_type: material_type || undefined,
    entity_type:   entity_type   || undefined,
    limit:  Math.min(parseInt(limit)  || 50, 200),
    offset: parseInt(offset) || 0,
  });
};
