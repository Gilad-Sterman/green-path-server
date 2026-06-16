import XLSX from 'xlsx';
import {
  listRetroIntakes,
  getRetroIntakeById,
  getRetroCertificationRecords,
  executeImportTransaction,
} from './queries.js';

const RECORD_TYPES           = ['inbound', 'outbound'];
const MATERIAL_TYPES         = ['PE', 'PP', 'PET', 'Other'];
const MATERIAL_CLASSIFICATIONS = ['recycled', 'virgin'];
const REQUIRED_COLUMNS = [
  'record_type', 'date', 'material_type', 'material_classification',
  'party_name', 'invoice_number', 'delivery_note_number', 'weight',
];

const notFound = (msg = 'Retro intake not found.') => Object.assign(new Error(msg), { status: 404 });
const badReq   = (msg)                              => Object.assign(new Error(msg), { status: 400 });

const resolveFactoryId = (reqUser, bodyFactoryId) => {
  if (reqUser.role === 'internal_admin') {
    if (!bodyFactoryId) throw badReq('factory_id is required for internal_admin.');
    return bodyFactoryId;
  }
  return reqUser.factory_id;
};

const resolveFactoryIdOptional = (reqUser, queryFactoryId) => {
  if (reqUser.role === 'internal_admin') return queryFactoryId || null;
  return reqUser.factory_id;
};

const parseDate = (raw) => {
  if (raw === null || raw === undefined || raw === '') return null;
  let d;
  if (raw instanceof Date) {
    d = raw;
  } else {
    d = new Date(raw);
  }
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0];
};

export const parseAndValidateFile = (buffer) => {
  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  } catch {
    throw badReq('Could not parse file. Please upload a valid XLSX or CSV file.');
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw badReq('File is empty. Please upload a file with data.');

  const sheet = workbook.Sheets[sheetName];
  const rows  = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  if (rows.length < 2) throw badReq('File is empty or contains no data rows.');

  const headers = rows[0].map(h => String(h).toLowerCase().trim().replace(/\s+/g, '_'));

  const missingCols = REQUIRED_COLUMNS.filter(col => !headers.includes(col));
  if (missingCols.length > 0) {
    throw badReq(`File is missing required columns: ${missingCols.join(', ')}`);
  }

  const dataRows = rows.slice(1);
  const records   = [];
  const seenKeys  = new Set();
  const today     = new Date().toISOString().split('T')[0];

  for (let i = 0; i < dataRows.length; i++) {
    const row    = dataRows[i];
    const rowNum = i + 2;

    if (row.every(cell => cell === '' || cell === null || cell === undefined)) continue;

    const get = (col) => {
      const idx = headers.indexOf(col);
      return idx >= 0 ? row[idx] : undefined;
    };

    const errors = [];

    const record_type            = String(get('record_type') ?? '').trim().toLowerCase();
    const material_type          = String(get('material_type') ?? '').trim();
    const material_classification = String(get('material_classification') ?? '').trim().toLowerCase();
    const party_name             = String(get('party_name') ?? '').trim();
    const invoice_number         = String(get('invoice_number') ?? '').trim();
    const delivery_note_number   = String(get('delivery_note_number') ?? '').trim();
    const lab_test_reference     = String(get('lab_test_reference') ?? '').trim() || null;
    const rawWeight              = get('weight');
    const rawDate                = get('date');
    const rawEligPct             = get('product_eligible_percent');

    if (!RECORD_TYPES.includes(record_type)) {
      errors.push({ field: 'record_type', message: `שורה ${rowNum}: סוג רשומה לא תקין. יש לבחור inbound או outbound.` });
    }
    if (!MATERIAL_TYPES.includes(material_type)) {
      errors.push({ field: 'material_type', message: `שורה ${rowNum}: סוג חומר לא תקין. יש לבחור מתוך: ${MATERIAL_TYPES.join(', ')}.` });
    }
    if (!MATERIAL_CLASSIFICATIONS.includes(material_classification)) {
      errors.push({ field: 'material_classification', message: `שורה ${rowNum}: סיווג חומר לא תקין. יש להזין recycled או virgin.` });
    }
    if (!party_name)           errors.push({ field: 'party_name',           message: `שורה ${rowNum}: חסר שם ספק/לקוח.` });
    if (!invoice_number)       errors.push({ field: 'invoice_number',       message: `שורה ${rowNum}: חסר מספר חשבונית.` });
    if (!delivery_note_number) errors.push({ field: 'delivery_note_number', message: `שורה ${rowNum}: חסר מספר תעודת משלוח.` });

    let weight = null;
    if (rawWeight === '' || rawWeight === null || rawWeight === undefined) {
      errors.push({ field: 'weight', message: `שורה ${rowNum}: חסר משקל.` });
    } else {
      weight = parseFloat(rawWeight);
      if (isNaN(weight) || weight <= 0) {
        errors.push({ field: 'weight', message: `שורה ${rowNum}: משקל חייב להיות מספר גדול מ-0.` });
        weight = null;
      }
    }

    let parsedDate = null;
    if (rawDate === '' || rawDate === null || rawDate === undefined) {
      errors.push({ field: 'date', message: `שורה ${rowNum}: חסר תאריך.` });
    } else {
      parsedDate = parseDate(rawDate);
      if (!parsedDate) {
        errors.push({ field: 'date', message: `שורה ${rowNum}: תאריך לא תקין.` });
      } else if (parsedDate > today) {
        errors.push({ field: 'date', message: `שורה ${rowNum}: לא ניתן להזין תאריך עתידי.` });
        parsedDate = null;
      }
    }

    let eligiblePercent    = null;
    let calculated_credits = 0;

    if (record_type === 'outbound') {
      if (rawEligPct === '' || rawEligPct === null || rawEligPct === undefined) {
        errors.push({ field: 'product_eligible_percent', message: `שורה ${rowNum}: יש להזין אחוז זכאות לתוצ"ג.` });
      } else {
        eligiblePercent = parseFloat(rawEligPct);
        if (isNaN(eligiblePercent) || eligiblePercent < 0 || eligiblePercent > 100) {
          errors.push({ field: 'product_eligible_percent', message: `שורה ${rowNum}: אחוז זכאות חייב להיות בין 0 ל-100.` });
          eligiblePercent = null;
        }
      }
    } else if (record_type === 'inbound') {
      eligiblePercent = material_classification === 'recycled' ? 100 : 0;
    }

    let isDupInFile = false;
    if (errors.length === 0) {
      const dupKey = [
        record_type,
        parsedDate,
        (invoice_number || '').toLowerCase(),
        (delivery_note_number || '').toLowerCase(),
        (party_name || '').toLowerCase(),
        String(weight ?? 0),
      ].join('|');
      if (seenKeys.has(dupKey)) {
        isDupInFile = true;
        errors.push({ field: 'duplicate', message: `שורה ${rowNum}: ייתכן שמדובר ברשומה כפולה (הופיעה כבר בקובץ זה).` });
      } else {
        seenKeys.add(dupKey);
      }
    }

    const status = errors.length > 0 ? (isDupInFile ? 'flagged' : 'rejected') : 'imported';

    if (status === 'imported' && record_type === 'outbound' && eligiblePercent !== null && weight !== null) {
      calculated_credits = parseFloat((weight * (eligiblePercent / 100)).toFixed(4));
    }

    records.push({
      record_type:            RECORD_TYPES.includes(record_type) ? record_type : null,
      date:                   parsedDate,
      material_type:          MATERIAL_TYPES.includes(material_type) ? material_type : null,
      material_classification: MATERIAL_CLASSIFICATIONS.includes(material_classification) ? material_classification : null,
      party_name:             party_name || null,
      invoice_number:         invoice_number || null,
      delivery_note_number:   delivery_note_number || null,
      lab_test_reference,
      weight,
      eligible_percent:       eligiblePercent,
      calculated_credits,
      status,
      errors,
      row_index: rowNum,
    });
  }

  if (records.length === 0) throw badReq('הקובץ ריק. יש להעלות קובץ עם נתונים.');

  const validRecords    = records.filter(r => r.status !== 'rejected');
  const rejectedRecords = records.filter(r => r.status === 'rejected');

  const validDates = validRecords.map(r => r.date).filter(Boolean).sort();
  const period_start = validDates[0] || null;
  const period_end   = validDates[validDates.length - 1] || null;

  const totalCredits = validRecords
    .filter(r => r.record_type === 'outbound')
    .reduce((sum, r) => sum + (r.calculated_credits || 0), 0);

  const validInboundWeight  = validRecords
    .filter(r => r.record_type === 'inbound')
    .reduce((s, r) => s + (r.weight || 0), 0);
  const validOutboundWeight = validRecords
    .filter(r => r.record_type === 'outbound')
    .reduce((s, r) => s + (r.weight || 0), 0);

  return {
    records,
    validCount:    validRecords.length,
    rejectedCount: rejectedRecords.length,
    period_start,
    period_end,
    totalCredits,
    validInboundWeight,
    validOutboundWeight,
  };
};

export const buildTemplate = () => {
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Data template with example rows ─────────────────────────────
  const headers = [
    'record_type', 'date', 'material_type', 'material_classification',
    'party_name', 'invoice_number', 'delivery_note_number', 'weight',
    'product_eligible_percent', 'lab_test_reference', 'notes',
  ];
  const examples = [
    ['outbound', '2023-06-15', 'PET', 'recycled', 'לקוח לדוגמה', 'INV-2023-001', 'DN-2023-001', 500, 80, 'LAB-2023-001', 'דוגמה - יציאה עם קרדיטים'],
    ['inbound',  '2023-06-20', 'PET', 'recycled', 'ספק לדוגמה',  'INV-2023-002', 'DN-2023-002', 300, '',  '',             'דוגמה - כניסה (ללא קרדיטים)'],
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, ...examples]);
  ws['!cols'] = headers.map(() => ({ wch: 26 }));
  XLSX.utils.book_append_sheet(wb, ws, 'נתונים');

  // ── Sheet 2: Hebrew instructions ─────────────────────────────────────────
  const guide = [
    ['עמודה', 'שם עברי', 'תיאור', 'נדרש', 'ערכים מקובלים'],
    ['record_type',             'סוג רשומה',         'האם זה חומר שנכנס למפעל או יצא ממנו',                        'כן',      'inbound (כניסה) | outbound (יציאה)'],
    ['date',                   'תאריך',              'תאריך החשבונית. לא ניתן להזין תאריך עתידי',                  'כן',      'YYYY-MM-DD  (לדוג׳: 2023-06-15)'],
    ['material_type',          'סוג חומר',           'סוג הפלסטיק',                                                'כן',      'PET | HDPE | PP | LDPE | PS | PVC | other'],
    ['material_classification', 'סיווג חומר',        'האם החומר ממוחזר, בתולי, או מעורב',                          'כן',      'recycled | virgin | mixed'],
    ['party_name',             'ספק / לקוח',         'שם הספק (כניסה) או שם הלקוח (יציאה)',                        'כן',      'טקסט חופשי'],
    ['invoice_number',         'מספר חשבונית',       'מספר חשבונית המס',                                            'כן',      'טקסט חופשי'],
    ['delivery_note_number',   'תעודת משלוח',        'מספר תעודת המשלוח',                                           'כן',      'טקסט חופשי'],
    ['weight',                 'משקל (ק"ג)',          'משקל החומר בקילוגרמים. חייב להיות מספר חיובי',               'כן',      'מספר חיובי (לדוג׳: 500)'],
    ['product_eligible_percent', 'אחוז זכאות לקרדיט', 'אחוז מהמשקל הזכאי לקרדיט. חובה עבור יציאה בלבד',          'רק ליציאה', '0 עד 100 (לדוג׳: 80)'],
    ['lab_test_reference',     'אסמכתא בדיקת מעבדה', 'מזהה בדיקת מעבדה אם קיים',                                  'לא',      'טקסט חופשי'],
    ['notes',                  'הערות',              'הערות חופשיות',                                               'לא',      'טקסט חופשי'],
    [],
    ['חישוב קרדיטים:', '', 'קרדיטים = משקל × (אחוז זכאות ÷ 100)  |  רשומות כניסה (inbound) אינן מייצרות קרדיטים'],
    ['כפילויות:',      '', 'רשומה שמופיעה פעמיים באותו קובץ תסומן כחשד לכפילות ותיקלט בסטטוס "מסומן" ללא קרדיטים נוספים'],
  ];
  const wsGuide = XLSX.utils.aoa_to_sheet(guide);
  wsGuide['!cols'] = [{ wch: 26 }, { wch: 22 }, { wch: 55 }, { wch: 14 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(wb, wsGuide, 'הוראות');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
};

export const buildErrorReport = async (batchId, factoryId) => {
  const batch = await getRetroIntakeById(batchId, factoryId);
  if (!batch) throw notFound();

  const allRecords = await getRetroCertificationRecords(batchId, factoryId);
  const rejected   = allRecords.filter(r => r.status === 'rejected');

  const headerRow = [
    'row_index', 'record_type', 'date', 'material_type', 'material_classification',
    'party_name', 'invoice_number', 'delivery_note_number', 'weight',
    'eligible_percent', 'status', 'errors',
  ];
  const dataRows = rejected.map(r => [
    r.row_index,
    r.record_type,
    r.date,
    r.material_type,
    r.material_classification,
    r.party_name,
    r.invoice_number,
    r.delivery_note_number,
    r.weight,
    r.eligible_percent,
    r.status,
    Array.isArray(r.errors) ? r.errors.map(e => e.message).join('; ') : '',
  ]);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
  XLSX.utils.book_append_sheet(wb, ws, 'Error Report');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
};

export const listBatches = async (reqUser, query) => {
  const factory_id = resolveFactoryId(reqUser, query.factory_id);
  return listRetroIntakes({
    factory_id,
    limit:  Math.min(parseInt(query.limit)  || 50, 200),
    offset: parseInt(query.offset) || 0,
  });
};

export const getBatch = async (reqUser, id) => {
  const factory_id = resolveFactoryIdOptional(reqUser, null);
  const batch = await getRetroIntakeById(id, factory_id);
  if (!batch) throw notFound();
  return batch;
};

export const getBatchRecords = async (reqUser, id) => {
  const factory_id = resolveFactoryIdOptional(reqUser, null);
  const batch = await getRetroIntakeById(id, factory_id);
  if (!batch) throw notFound();
  return getRetroCertificationRecords(id, factory_id);
};

export const importFile = async (reqUser, fileBuffer, body) => {
  const factory_id = resolveFactoryId(reqUser, body.factory_id);

  const { records, validCount, rejectedCount, period_start, period_end, totalCredits,
          validInboundWeight, validOutboundWeight } =
    parseAndValidateFile(fileBuffer);

  if (validCount === 0) {
    const allErrors = records.flatMap(r => r.errors);
    throw Object.assign(new Error('No valid records found. All rows were rejected.'), {
      status: 400,
      code:   'no-valid-records',
      details: { validCount: 0, rejectedCount, errors: allErrors },
    });
  }

  if (validOutboundWeight > validInboundWeight) {
    throw Object.assign(
      new Error('Mass balance violation: outbound exceeds inbound.'),
      {
        status: 400,
        code:   'mass-balance-exceeded',
        details: {
          inbound_kg:  validInboundWeight,
          outbound_kg: validOutboundWeight,
          deficit_kg:  parseFloat((validOutboundWeight - validInboundWeight).toFixed(4)),
          message_he:  `חריגת מאזן מסה: יציאות (${validOutboundWeight.toFixed(2)} ק"ג) עולות על כניסות (${validInboundWeight.toFixed(2)} ק"ג). יש לתקן את הקובץ לפני הייבוא.`,
        },
      }
    );
  }

  const batchData = {
    period_start: body.period_start || period_start,
    period_end:   body.period_end   || period_end,
    notes:        body.notes        || null,
  };

  const batch = await executeImportTransaction(
    factory_id,
    reqUser.user_id,
    batchData,
    records,
    totalCredits,
  );

  const allErrors = records
    .filter(r => r.status === 'rejected' || r.status === 'flagged')
    .flatMap(r => r.errors);

  const flaggedCount = records.filter(r => r.status === 'flagged').length;

  return { batch, validCount, rejectedCount, flaggedCount, totalCredits, errors: allErrors };
};
