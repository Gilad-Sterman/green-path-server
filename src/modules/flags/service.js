import {
  listFlags, getFlagById, getFlagCountByStatus, getFlagCountByStatusPlatform,
  resolveFlagById, dismissFlagById,
} from './queries.js';

const RESOLUTIONS = ['approved_exception', 'corrected'];

const notFound = (msg = 'Flag not found.')  => Object.assign(new Error(msg), { status: 404 });
const badReq   = (msg)                       => Object.assign(new Error(msg), { status: 400 });

const resolveFactoryId = (reqUser, queryFactoryId) => {
  if (reqUser.role === 'internal_admin') return queryFactoryId || undefined;
  return reqUser.factory_id;
};

const assertFactoryAccess = (reqUser, flag) => {
  if (reqUser.role !== 'internal_admin' && flag.factory_id !== reqUser.factory_id) {
    throw notFound();
  }
};

export const getFlags = async (reqUser, query) => {
  const { status, severity, entity_type, limit, offset, factory_id: qFactory } = query;

  return listFlags({
    factory_id:  resolveFactoryId(reqUser, qFactory),
    status:      status      || undefined,
    severity:    severity    || undefined,
    entity_type: entity_type || undefined,
    limit:       Math.min(parseInt(limit) || 50, 200),
    offset:      parseInt(offset) || 0,
  });
};

export const getFlag = async (reqUser, id) => {
  const flag = await getFlagById(id);
  if (!flag) throw notFound();
  assertFactoryAccess(reqUser, flag);
  return flag;
};

export const getFlagsSummary = async (reqUser, query) => {
  const factory_id = resolveFactoryId(reqUser, query.factory_id);
  const rows = factory_id
    ? await getFlagCountByStatus(factory_id)
    : await getFlagCountByStatusPlatform();
  const summary = { open: 0, resolved: 0, dismissed: 0 };
  rows.forEach((r) => { summary[r.status] = r.count; });
  return summary;
};

export const resolveFlag = async (reqUser, id, body) => {
  const flag = await getFlagById(id);
  if (!flag) throw notFound();
  assertFactoryAccess(reqUser, flag);

  if (flag.status !== 'open') {
    throw badReq(`Flag is already ${flag.status} and cannot be resolved again.`);
  }

  const { resolution, resolution_note } = body;
  if (!resolution)                     throw badReq('resolution is required.');
  if (!RESOLUTIONS.includes(resolution)) {
    throw badReq(`resolution must be one of: ${RESOLUTIONS.join(', ')}`);
  }

  return resolveFlagById(id, { resolution, resolution_note, resolved_by: reqUser.id });
};

export const dismissFlag = async (reqUser, id, body) => {
  const flag = await getFlagById(id);
  if (!flag) throw notFound();
  assertFactoryAccess(reqUser, flag);

  if (flag.status !== 'open') {
    throw badReq(`Flag is already ${flag.status}.`);
  }

  return dismissFlagById(id, { resolution_note: body.resolution_note, resolved_by: reqUser.id });
};
