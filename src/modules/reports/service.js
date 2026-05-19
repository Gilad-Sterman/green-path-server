import {
  getReportSummary, getReportMonthly, getReportIntakesByType,
  getReportCreditsForExport, getReportFactorySummaries,
} from './queries.js';

const forbidden = (msg = 'Forbidden') => Object.assign(new Error(msg), { status: 403 });

const resolveFactoryId = (reqUser, queryFactoryId) => {
  if (reqUser.role === 'internal_admin') return queryFactoryId || undefined;
  return reqUser.factory_id;
};

export const getSummary = (reqUser, query) => {
  const { from, to, factory_id: qFactory } = query;
  return getReportSummary({ factory_id: resolveFactoryId(reqUser, qFactory), from, to });
};

export const getMonthly = (reqUser, query) => {
  const { from, to, factory_id: qFactory } = query;
  return getReportMonthly({ factory_id: resolveFactoryId(reqUser, qFactory), from, to });
};

export const getByType = (reqUser, query) => {
  const { from, to, factory_id: qFactory } = query;
  return getReportIntakesByType({ factory_id: resolveFactoryId(reqUser, qFactory), from, to });
};

export const getCreditsExport = (reqUser, query) => {
  const { from, to, factory_id: qFactory } = query;
  return getReportCreditsForExport({ factory_id: resolveFactoryId(reqUser, qFactory), from, to });
};

export const getFactorySummaries = (reqUser, query) => {
  if (reqUser.role !== 'internal_admin') throw forbidden();
  const { from, to } = query;
  return getReportFactorySummaries({ from, to });
};
