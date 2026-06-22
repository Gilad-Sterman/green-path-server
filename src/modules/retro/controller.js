import { success, error } from '../../utils/response.js';
import * as retroService from './service.js';

// GET /api/retro
export const listRetroIntakes = async (req, res, next) => {
  try {
    const batches = await retroService.listBatches(req.user, req.query);
    return success(res, { batches, count: batches.length });
  } catch (err) {
    if (err.status) return error(res, 'retro-error', err.message, err.status);
    next(err);
  }
};

// GET /api/retro/template
export const downloadTemplate = (req, res, next) => {
  try {
    const buffer = retroService.buildTemplate();
    res.setHeader('Content-Disposition', 'attachment; filename="retro_import_template.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(buffer);
  } catch (err) {
    next(err);
  }
};

// GET /api/retro/:id
export const getRetroIntake = async (req, res, next) => {
  try {
    const batch = await retroService.getBatch(req.user, req.params.id);
    return success(res, { batch });
  } catch (err) {
    if (err.status) return error(res, 'retro-error', err.message, err.status);
    next(err);
  }
};

// GET /api/retro/:id/records
export const getRetroRecords = async (req, res, next) => {
  try {
    const records = await retroService.getBatchRecords(req.user, req.params.id);
    return success(res, { records, count: records.length });
  } catch (err) {
    if (err.status) return error(res, 'retro-error', err.message, err.status);
    next(err);
  }
};

// GET /api/retro/:id/error-report
export const downloadErrorReport = async (req, res, next) => {
  try {
    const factory_id = req.user.role === 'internal_admin' ? null : req.user.factory_id;
    const buffer = await retroService.buildErrorReport(req.params.id, factory_id);
    res.setHeader('Content-Disposition', `attachment; filename="error_report_${req.params.id}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(buffer);
  } catch (err) {
    if (err.status) return error(res, 'retro-error', err.message, err.status);
    next(err);
  }
};

// POST /api/retro/preview
export const previewRetroIntake = async (req, res, next) => {
  try {
    if (!req.file) return error(res, 'missing-file', 'No file uploaded. Please attach an XLSX or CSV file.', 400);
    const result = retroService.previewFile(req.file.buffer);
    return success(res, result);
  } catch (err) {
    if (err.status) return error(res, err.code || 'retro-error', err.message, err.status, err.details || {});
    next(err);
  }
};

// POST /api/retro
export const importRetroIntake = async (req, res, next) => {
  try {
    if (!req.file) return error(res, 'missing-file', 'No file uploaded. Please attach an XLSX or CSV file.', 400);

    console.log('[retro] import started — file:', req.file.originalname, 'size:', req.file.size, 'user:', req.user.user_id);

    const result = await retroService.importFile(req.user, req.file.buffer, req.body);

    console.log('[retro] import complete — batch:', result.batch?.id,
      '| valid:', result.validCount,
      '| flagged:', result.flaggedCount,
      '| rejected:', result.rejectedCount,
      '| credits:', result.totalCredits,
      '| batchStatus:', result.batch?.status
    );

    return success(res, result, {}, 201);
  } catch (err) {
    console.error('[retro] import error —', err.code || err.message, err.details || '');
    if (err.status) return error(res, err.code || 'retro-error', err.message, err.status, err.details || {});
    next(err);
  }
};
