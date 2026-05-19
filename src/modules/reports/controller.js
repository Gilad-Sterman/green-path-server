import * as service from './service.js';

const toCsv = (rows) => {
  if (!rows.length) return 'No data';
  const headers = Object.keys(rows[0]).join(',');
  const body = rows.map((r) =>
    Object.values(r).map((v) => {
      if (v == null) return '';
      const s = String(v);
      return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')
  );
  return [headers, ...body].join('\n');
};

export const getSummary = async (req, res, next) => {
  try {
    const data = await service.getSummary(req.user, req.query);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const getMonthly = async (req, res, next) => {
  try {
    const data = await service.getMonthly(req.user, req.query);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const getByType = async (req, res, next) => {
  try {
    const data = await service.getByType(req.user, req.query);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

export const getCreditsExport = async (req, res, next) => {
  try {
    const rows = await service.getCreditsExport(req.user, req.query);
    const csv = toCsv(rows);
    const filename = `greenpath-credits-${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) { next(err); }
};

export const getFactorySummaries = async (req, res, next) => {
  try {
    const data = await service.getFactorySummaries(req.user, req.query);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};
