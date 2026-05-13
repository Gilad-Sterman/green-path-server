import { listCredits, getCreditsSummaryByFactory } from './queries.js';

const badReq = (msg) => Object.assign(new Error(msg), { status: 400 });

const resolveFactoryId = (reqUser, queryFactoryId) => {
  if (reqUser.role === 'internal_admin') return queryFactoryId || undefined;
  return reqUser.factory_id;
};

export const getCredits = async (reqUser, query) => {
  const { kind, source_type, limit, offset, factory_id: qFactory } = query;

  return listCredits({
    factory_id:  resolveFactoryId(reqUser, qFactory),
    kind:        kind        || undefined,
    source_type: source_type || undefined,
    limit:       Math.min(parseInt(limit) || 50, 200),
    offset:      parseInt(offset) || 0,
  });
};

export const getCreditsSummary = async (reqUser, query) => {
  const factory_id = resolveFactoryId(reqUser, query.factory_id);
  if (!factory_id) throw badReq('factory_id is required.');
  return getCreditsSummaryByFactory(factory_id);
};
