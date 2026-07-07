import XLSX from 'xlsx';
import {
  listRetroIntakes,
  getRetroIntakeById,
  getRetroCertificationRecords,
  executeImportTransaction,
} from './queries.js';
import { linkDocumentsToEntity } from '../documents/queries.js';


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

const parseILDate = (raw) => {
  if (!raw && raw !== 0) return null;
  const str = String(raw).trim();

  // Excel serial date number (XLSX stores dates as integers, e.g. 45747 = 31/3/2025)
  if (/^\d{5}$/.test(str)) {
    const d = new Date(Math.round((parseInt(str, 10) - 25569) * 86400 * 1000));
    if (isNaN(d.getTime())) return null;
    return d.toISOString().split('T')[0];
  }

  // DD/MM/YYYY or D/M/YYYY or DD/MM/YY (text format used in CSV exports)
  const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  const iso  = `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return isNaN(new Date(iso).getTime()) ? null : iso;
};

const inferMaterialType = (desc) => {
  const s = String(desc || '').toUpperCase();
  if (/ABS|TPO|PS\b|PVC\b|EPS\b/.test(s)) return 'Other';
  if (/\bPET\b/.test(s))                   return 'PET';
  if (/PP\/PE|PE\/PP|MIX/.test(s))         return 'PP/PE';
  if (/HDPE|LDPE|LLDPE|MDPE/.test(s))      return 'PE';
  if (/CPP|HPP/.test(s))                   return 'PP';
  if (/\bPE\b/.test(s))                    return 'PE';
  if (/\bPP\b/.test(s))                    return 'PP';
  return 'Other';
};

export const parseHashavshevetCSV = (buffer) => {
  let workbook;
  try {
    // XLSX/XLS binary files start with PK (ZIP) or D0CF magic bytes; everything else is CSV text
    const isBinary = buffer.length >= 2 && (
      (buffer[0] === 0x50 && buffer[1] === 0x4B) ||   // PK — ZIP/XLSX
      (buffer[0] === 0xD0 && buffer[1] === 0xCF)       // D0CF — XLS
    );
    workbook = isBinary
      ? XLSX.read(buffer, { type: 'buffer', cellDates: false })
      : XLSX.read(buffer.toString('utf8'), { type: 'string', cellDates: false });
  } catch {
    throw badReq('Could not parse file. Please upload a valid XLSX or CSV file.');
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw badReq('הקובץ ריק.');

  const sheet = workbook.Sheets[sheetName];
  const rows  = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  if (rows.length < 2) throw badReq('הקובץ ריק או אינו מכיל נתונים.');

  const records   = [];
  const seenKeys  = new Set();
  const today     = new Date().toISOString().split('T')[0];
  let currentSupplier = null;
  let currentItem     = null;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const c   = (idx) => String(row[idx] ?? '').trim();
    const rowNum = i + 1;

    if (row.every(cell => String(cell ?? '').trim() === '')) continue;
    if (c(0))                                continue;
    if (c(1) === 'סוג אסמכתא')              continue;
    if (c(4) === 'טון')                      continue;
    if (/^\d+$/.test(c(1)) && !c(2))         continue;

    const docType = c(1);

    if (docType && !c(2) && !/^\d+$/.test(docType)) {
      currentSupplier = docType;
      currentItem     = null;
      continue;
    }

    if (!docType && c(2) && c(3)) {
      currentItem = {
        sku:           c(2),
        description:   c(3),
        pcr:           c(6).toUpperCase() === 'Y',
        material_type: inferMaterialType(c(3)),
      };
      continue;
    }

    if (docType !== 'חשבונית רכש' && docType !== 'זיכוי רכש') continue;
    if (!currentSupplier || !currentItem) continue;

    const errors        = [];
    const invoiceNumber = c(2);
    const rawDate       = c(3);
    const rawWeight     = c(4);

    const parsedDate = parseILDate(rawDate);
    if (!parsedDate) {
      errors.push({ field: 'date', message: `שורה ${rowNum}: תאריך לא תקין: "${rawDate}"` });
    } else if (parsedDate > today) {
      errors.push({ field: 'date', message: `שורה ${rowNum}: לא ניתן להזין תאריך עתידי.` });
    }

    if (!invoiceNumber) {
      errors.push({ field: 'invoice_number', message: `שורה ${rowNum}: חסר מספר חשבונית.` });
    }

    let weight = null;
    const weightNum = parseFloat(String(rawWeight).replace(/,/g, ''));
    if (isNaN(weightNum) || weightNum === 0) {
      errors.push({ field: 'weight', message: `שורה ${rowNum}: משקל לא תקין.` });
    } else {
      weight = parseFloat((weightNum * 1000).toFixed(4));
    }

    const material_classification = currentItem.pcr ? 'recycled' : 'virgin';
    const eligible_percent        = currentItem.pcr ? 100 : 0;

    let isDupInFile = false;
    if (errors.length === 0) {
      const dupKey = [
        parsedDate,
        (invoiceNumber || '').toLowerCase(),
        (currentSupplier || '').toLowerCase(),
        String(weight),
      ].join('|');
      if (seenKeys.has(dupKey)) {
        isDupInFile = true;
        errors.push({ field: 'duplicate', message: `שורה ${rowNum}: ייתכן שמדובר ברשומה כפולה.` });
      } else {
        seenKeys.add(dupKey);
      }
    }

    const status = errors.length > 0 ? (isDupInFile ? 'flagged' : 'rejected') : 'imported';

    records.push({
      record_type:             'inbound',
      date:                    parsedDate,
      material_type:           currentItem.material_type,
      material_classification,
      party_name:              currentSupplier,
      invoice_number:          invoiceNumber || null,
      delivery_note_number:    currentItem.sku || null,
      lab_test_reference:      null,
      weight,
      eligible_percent,
      calculated_credits:      0,
      status,
      errors,
      row_index:               rowNum,
    });
  }

  if (records.length === 0) throw badReq('לא נמצאו רשומות בקובץ. יש לוודא שהקובץ הוא דוח קניות תקין מחשבשבת.');

  const validRecords    = records.filter(r => r.status !== 'rejected');
  const rejectedRecords = records.filter(r => r.status === 'rejected');

  const validDates = validRecords.map(r => r.date).filter(Boolean).sort();
  const period_start = validDates[0] || null;
  const period_end   = validDates[validDates.length - 1] || null;

  const totalCredits = validRecords
    .filter(r => r.material_classification === 'recycled')
    .reduce((sum, r) => sum + (r.weight || 0), 0);

  return {
    records,
    validCount:    validRecords.length,
    rejectedCount: rejectedRecords.length,
    period_start,
    period_end,
    totalCredits,
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

export const previewFile = (fileBuffer) => {
  const { records, validCount, rejectedCount, totalCredits } = parseHashavshevetCSV(fileBuffer);

  const flaggedCount = records.filter(r => r.status === 'flagged').length;
  const allErrors    = records
    .filter(r => r.status === 'rejected' || r.status === 'flagged')
    .flatMap(r => r.errors);

  return { validCount, rejectedCount, flaggedCount, totalCredits, errors: allErrors };
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

  let invoice_doc_ids  = [];
  let lab_test_doc_ids = [];
  try { invoice_doc_ids  = JSON.parse(body.invoice_doc_ids  || '[]'); } catch { invoice_doc_ids  = []; }
  try { lab_test_doc_ids = JSON.parse(body.lab_test_doc_ids || '[]'); } catch { lab_test_doc_ids = []; }
  if (!invoice_doc_ids.length)  throw badReq('חשבונית חובה — יש להעלות לפחות קובץ חשבונית אחד לפני השלמת הייבוא.');
  if (!lab_test_doc_ids.length) throw badReq('בדיקת מעבדה חובה — יש להעלות לפחות קובץ בדיקת מעבדה אחד לפני השלמת הייבוא.');

  const { records, validCount, rejectedCount, period_start, period_end, totalCredits } =
    parseHashavshevetCSV(fileBuffer);

  if (validCount === 0) {
    const allErrors = records.flatMap(r => r.errors);
    throw Object.assign(new Error('No valid records found. All rows were rejected.'), {
      status: 400,
      code:   'no-valid-records',
      details: { validCount: 0, rejectedCount, errors: allErrors },
    });
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

  await linkDocumentsToEntity([...invoice_doc_ids, ...lab_test_doc_ids], 'retro_intake', batch.id, factory_id);

  const allErrors = records
    .filter(r => r.status === 'rejected' || r.status === 'flagged')
    .flatMap(r => r.errors);

  const flaggedCount = records.filter(r => r.status === 'flagged').length;

  return { batch, validCount, rejectedCount, flaggedCount, totalCredits, errors: allErrors };
};
