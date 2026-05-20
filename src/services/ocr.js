import axios from 'axios';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Field aliases for Azure KV pair extraction (Hebrew + English) ────────────
const ALIASES = {
  delivery_note_number: [
    'תעודת משלוח', 'תעודה מספר', 'מספר תעודה', 'מס תעודה', 'ת.מ.',
    'delivery note', 'delivery note no', 'doc no', 'invoice no', 'invoice number',
  ],
  net_weight_kg: [
    'משקל נטו', 'משקל', 'ק"ג', 'ק״ג', 'weight', 'net weight', 'kg', 'kilogram',
  ],
  intake_date: [
    'תאריך', 'תאריך תעודה', 'תאריך משלוח', 'date', 'invoice date', 'delivery date',
  ],
  supplier_name: [
    'שם ספק', 'ספק', 'מוכר', 'שם מוכר', 'supplier', 'vendor', 'from', 'sold by',
  ],
};

// ── Keyword sets for line-based RTL-aware extraction ─────────────────────────
const LINE_KEYWORDS = {
  delivery_note_number: ['תעודת שקילה', 'מספר תעודה', 'תעודת משלוח', 'מס תעודה', 'ת.מ.', 'delivery note', 'invoice no', 'doc no'],
  net_weight_kg:        ['משקל נטו', 'נטו:', ' נטו ', 'נטו', 'net weight', 'weight'],
  intake_date:          ['תאריך', 'date', 'invoice date'],
  supplier_name:        ['שם ספק', 'ספק', 'לקוח', 'מוכר', 'supplier', 'vendor'],
};

const CONFIDENCE_AUTO  = 0.80;
const CONFIDENCE_WARN  = 0.50;

// ── Mock result for dev / testing ─────────────────────────────────────────────
const MOCK_FIELDS = {
  delivery_note_number: { value: 'DN-MOCK-2024-001', confidence: 0.95 },
  net_weight_kg:        { value: '1250',             confidence: 0.92 },
  intake_date:          { value: new Date().toISOString().split('T')[0], confidence: 0.88 },
  supplier_name:        { value: 'Demo Supplier Ltd.', confidence: 0.76 },
};

// ── Line-based extraction — handles both LTR and RTL layouts ─────────────────
// Azure often reverses value/label order in Hebrew (RTL) documents.
// Strategy: find the line containing the keyword, then extract the relevant
// token (date, number, or text) from anywhere on that line.
const stripLabelAndId = (line, keywords) => {
  let val = line;
  keywords.forEach((k) => { val = val.replace(new RegExp(k, 'iu'), ''); });
  val = val.replace(/[:\s]+/g, ' ').trim();
  val = val.replace(/^\d+\s*\/\s*/, '').replace(/\s*\/\s*\d+$/, '').trim();
  return val;
};

// Known field labels used as value-termination boundaries in merged lines
const FIELD_BOUNDARIES = [
  'תעודת שקילה', 'מספר תעודה', 'אישור מעבר', 'מס׳ רכב', 'מס רכב',
  'מוביל', 'לקוח', 'מוצא', 'חומר', 'ספק', 'שם ספק',
  'פרוייקט', 'אסמכתא', 'הערות', 'תאריך',
  'ברוטו', 'טרה', 'נטו', 'שעת', 'כניסה', 'יציאה',
  'date', 'supplier', 'client', 'carrier', 'material', 'weight', 'project',
];

const extractAfterKw = (text, keyword) => {
  const lower    = text.toLowerCase();
  const kwLower  = keyword.toLowerCase();
  const idx      = lower.indexOf(kwLower);
  if (idx === -1) return null;

  // Grab text after the keyword, strip leading colon/whitespace/quotes
  let after      = text.slice(idx + keyword.length).replace(/^[\s:׳״'"]+/, '');
  const afterLow = after.toLowerCase();

  // Cut at first boundary keyword that follows
  let cutAt = after.length;
  for (const bk of FIELD_BOUNDARIES) {
    if (bk.toLowerCase() === kwLower) continue;
    const bkIdx = afterLow.indexOf(bk.toLowerCase());
    if (bkIdx > 0 && bkIdx < cutAt) cutAt = bkIdx;
  }

  return after.slice(0, cutAt).trim() || null;
};

const mapFromContent = (content = '') => {
  const result = {};
  const extras = {};
  const lines  = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // ── document header: first line with no colon/label → supplier fallback ───
  let headerCandidate = null;
  for (const line of lines) {
    if (!/[:\u05F4\u05F3]/.test(line) && line.length >= 5) {
      headerCandidate = line;
      break;
    }
  }

  // ── Line-based loop: delivery_note_number, net_weight_kg, intake_date ──────
  for (const line of lines) {
    const lower = line.toLowerCase();

    // delivery_note_number
    if (!result.delivery_note_number) {
      const hit = LINE_KEYWORDS.delivery_note_number.some((k) => lower.includes(k.toLowerCase()));
      if (hit) {
        const m = line.match(/([A-Za-z\d][\w\-\/]*\d[\w\-\/]*)/u)
               || line.match(/(\d[\w\-\/]{2,})/u);
        if (m) result.delivery_note_number = { value: m[1].trim(), confidence: 0.82, fill: 'auto' };
      }
    }

    // net_weight_kg — adjacent-to-נטו pattern handles merged lines
    if (!result.net_weight_kg && lower.includes('נטו')) {
      const adj = line.match(/נטו\s*[:\s]+(\d[\d,\.]*)/)
               || line.match(/(\d[\d,.]*)\s*(?:ק["״׳]ג)?\s*:?\s*נטו/u);
      if (adj) {
        result.net_weight_kg = { value: adj[1].trim(), confidence: 0.82, fill: 'auto' };
      } else if (!lower.includes('טרה') && !lower.includes('ברוטו')) {
        const m = line.match(/(\d[\d,\.]*)/);
        if (m) result.net_weight_kg = { value: m[1].trim(), confidence: 0.82, fill: 'auto' };
      }
    }

    // intake_date
    if (!result.intake_date) {
      const hit = LINE_KEYWORDS.intake_date.some((k) => lower.includes(k.toLowerCase()));
      if (hit) {
        const m = line.match(/(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/);
        if (m) result.intake_date = { value: m[1].trim(), confidence: 0.82, fill: 'auto' };
      }
    }
  }

  // ── Boundary-aware text extraction for text fields ─────────────────────────
  // extractAfterKw cuts the value at the next known field label, handling
  // the case where Azure merges multiple fields onto one long line.
  const fullText = lines.join('\n');

  // supplier_name
  if (!result.supplier_name) {
    for (const kw of LINE_KEYWORDS.supplier_name) {
      const raw = extractAfterKw(fullText, kw);
      if (raw) {
        const val = raw.replace(/^\d+\s*\/\s*/, '').replace(/\s*\/\s*\d+$/, '').trim();
        if (val.length >= 2) {
          result.supplier_name = { value: val, confidence: 0.80, fill: 'auto' };
          break;
        }
      }
    }
  }

  // extras: client_name
  const clientRaw = extractAfterKw(fullText, 'לקוח');
  if (clientRaw) {
    const val = clientRaw.replace(/^\d+\s*\/\s*/, '').replace(/\s*\/\s*\d+$/, '').trim();
    if (val.length >= 2) extras.client_name = val;
  }

  // extras: carrier_name
  const carrierRaw = extractAfterKw(fullText, 'מוביל');
  if (carrierRaw) {
    const val = carrierRaw.replace(/^\d+\s*\/\s*/, '').replace(/\s*\/\s*\d+$/, '').trim();
    if (val.length >= 2) extras.carrier_name = val;
  }

  // extras: material_hint
  const materialRaw = extractAfterKw(fullText, 'חומר');
  if (materialRaw) {
    const val = materialRaw.replace(/^\d+\s*[-–]\s*/, '').trim();
    if (val.length >= 2) extras.material_hint = val;
  }

  // supplier fallback: issuing org from document header
  if (!result.supplier_name && headerCandidate) {
    result.supplier_name = { value: headerCandidate, confidence: 0.65, fill: 'warn' };
  }

  // date fallback: any DD/MM/YYYY anywhere in the document
  if (!result.intake_date) {
    const m = content.match(/(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/);
    if (m) result.intake_date = { value: m[1].trim(), confidence: 0.70, fill: 'warn' };
  }

  return { fields: result, extras };
};

// ── Map Azure key-value pairs to our field schema ─────────────────────────────
const mapFields = (keyValuePairs = []) => {
  const result = {};

  for (const [field, aliases] of Object.entries(ALIASES)) {
    for (const kv of keyValuePairs) {
      if (!kv.key?.content || !kv.value?.content) continue;
      const keyText = kv.key.content.toLowerCase().trim();
      const matched = aliases.some((a) => keyText.includes(a.toLowerCase()));
      if (!matched) continue;

      const confidence = Math.round(
        Math.min(kv.key.confidence ?? 0, kv.value.confidence ?? 0) * 100
      ) / 100;

      if (!result[field] || confidence > result[field].confidence) {
        result[field] = { value: kv.value.content.trim(), confidence };
      }
    }
  }

  // Annotate each field with fill behaviour based on confidence
  for (const field of Object.keys(result)) {
    const { confidence } = result[field];
    result[field].fill = confidence >= CONFIDENCE_AUTO
      ? 'auto'
      : confidence >= CONFIDENCE_WARN
        ? 'warn'
        : 'skip';
  }

  return result;
};

// ── Main export ───────────────────────────────────────────────────────────────
export const analyzeDocument = async (fileBuffer, mimeType) => {
  if (process.env.OCR_MOCK === 'true') {
    await sleep(1500);
    return {
      fields: MOCK_FIELDS,
      extras: { client_name: 'Mock Client Ltd.', carrier_name: 'Mock Carrier', material_hint: 'פלסטיק' },
      raw_payload: null,
    };
  }

  const endpoint = (process.env.AZURE_OCR_ENDPOINT || '').replace(/\/+$/, '');
  const key      = process.env.AZURE_OCR_KEY;

  if (!endpoint || !key) {
    throw Object.assign(
      new Error('OCR service is not configured on this server.'),
      { status: 503, code: 'ocr-unavailable' }
    );
  }

  const analyzeUrl =
    `${endpoint}/formrecognizer/documentModels/prebuilt-document:analyze?api-version=2023-07-31`;

  const submitRes = await axios.post(analyzeUrl, fileBuffer, {
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': mimeType,
    },
    maxBodyLength:   Infinity,
    maxContentLength: Infinity,
  });

  const operationUrl = submitRes.headers['operation-location'];
  if (!operationUrl) {
    throw Object.assign(new Error('No operation URL returned by Azure.'), { status: 502 });
  }

  // Poll with progressive back-off — up to ~25 s total
  for (let i = 0; i < 10; i++) {
    await sleep(2000 + i * 500);

    const { data } = await axios.get(operationUrl, {
      headers: { 'Ocp-Apim-Subscription-Key': key },
    });

    if (data.status === 'succeeded') {
      const kvPairs = data.analyzeResult?.keyValuePairs || [];
      const content = data.analyzeResult?.content || '';

      console.log('\n── OCR raw content (first 800 chars) ───────────');
      console.log(content.slice(0, 800));
      console.log('── OCR raw key-value pairs ─────────────────────');
      if (kvPairs.length === 0) {
        console.log('  (none — using regex text extraction instead)');
      } else {
        kvPairs.forEach((kv, idx) => {
          console.log(`  [${idx}] key="${kv.key?.content}"  value="${kv.value?.content}"  conf=${kv.key?.confidence?.toFixed(2)}`);
        });
      }

      const fromKV                    = mapFields(kvPairs);
      const { fields: fromText, extras } = mapFromContent(content);
      // KV pairs take precedence (Azure-level confidence) over regex
      const fields                       = { ...fromText, ...fromKV };

      console.log('── Mapped fields ────────────────────────────────');
      console.log(JSON.stringify(fields, null, 2));
      console.log('── Extras ───────────────────────────────────────');
      console.log(JSON.stringify(extras, null, 2));
      console.log('─────────────────────────────────────────────────\n');

      return { fields, extras, raw_payload: data.analyzeResult };
    }

    if (data.status === 'failed') {
      throw Object.assign(
        new Error('Azure OCR processing failed.'),
        { status: 422, code: 'ocr-failed' }
      );
    }
  }

  throw Object.assign(
    new Error('OCR timed out. Please fill the form manually.'),
    { status: 408, code: 'ocr-timeout' }
  );
};
