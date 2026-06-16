import {
  listFlags, getFlagById, getFlagCountByStatus, getFlagCountByStatusPlatform,
  resolveFlagById, dismissFlagById, expireStaleFlags as expireQuery,
} from './queries.js';
import { linkDocumentsToEntity } from '../documents/queries.js';

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
  const { date_from, date_to } = query;
  const rows = factory_id
    ? await getFlagCountByStatus(factory_id)
    : await getFlagCountByStatusPlatform({ date_from, date_to });
  const summary = { open: 0, resolved: 0, dismissed: 0, expired: 0, total: 0 };
  rows.forEach((r) => { summary[r.status] = r.count; summary.total += r.count; });
  return summary;
};

export const resolveFlag = async (reqUser, id, body) => {
  const flag = await getFlagById(id);
  if (!flag) throw notFound();
  assertFactoryAccess(reqUser, flag);

  if (flag.status !== 'open') {
    throw badReq(`Flag is already ${flag.status} and cannot be resolved again.`);
  }

  const { resolution, resolution_note, document_id } = body;
  if (!resolution)                     throw badReq('resolution is required.');
  if (!RESOLUTIONS.includes(resolution)) {
    throw badReq(`resolution must be one of: ${RESOLUTIONS.join(', ')}`);
  }

  if (resolution === 'approved_exception' && !resolution_note?.trim()) {
    throw badReq('נדרש נימוק בעת אישור חריגה (approved_exception).');
  }
  if (resolution === 'corrected' && !document_id) {
    throw badReq('יש לצרף מסמך מעודכן בעת סימון כמתוקן (corrected).');
  }

  const resolved = await resolveFlagById(id, { resolution, resolution_note, resolved_by: reqUser.user_id });

  if (document_id) {
    await linkDocumentsToEntity([document_id], 'flag', flag.id, flag.factory_id);
  }

  return resolved;
};

export const expireFlags = async (reqUser) => {
  if (reqUser.role !== 'internal_admin') {
    throw Object.assign(new Error('Access denied.'), { status: 403 });
  }
  const count = await expireQuery();
  return { expired_count: count };
};

export const dismissFlag = async (reqUser, id, body) => {
  const flag = await getFlagById(id);
  if (!flag) throw notFound();
  assertFactoryAccess(reqUser, flag);

  if (flag.status !== 'open') {
    throw badReq(`Flag is already ${flag.status}.`);
  }

  return dismissFlagById(id, { resolution_note: body.resolution_note, resolved_by: reqUser.user_id });
};
