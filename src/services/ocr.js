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
  delivery_note_number: ['מספר תעודה', 'תעודת משלוח', 'מס תעודה', 'ת.מ.', 'delivery note', 'invoice no', 'doc no'],
  net_weight_kg:        ['משקל נטו', 'משקל', 'net weight', 'weight'],
  intake_date:          ['תאריך', 'date', 'invoice date'],
  supplier_name:        ['שם ספק', 'ספק', 'מוכר', 'supplier', 'vendor'],
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
const mapFromContent = (content = '') => {
  const result = {};
  const lines  = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    const lower = line.toLowerCase();

    // ── delivery_note_number ───────────────────────────────────────────────
    if (!result.delivery_note_number) {
      const hit = LINE_KEYWORDS.delivery_note_number.some((k) => lower.includes(k.toLowerCase()));
      if (hit) {
        // grab first alphanumeric token with a digit that isn't purely numeric
        const m = line.match(/([A-Za-z\d][\w\-\/]*\d[\w\-\/]*)/u)
               || line.match(/(\d[\w\-\/]{2,})/u);
        if (m) result.delivery_note_number = { value: m[1].trim(), confidence: 0.82, fill: 'auto' };
      }
    }

    // ── net_weight_kg ─────────────────────────────────────────────────────
    if (!result.net_weight_kg) {
      const hit = LINE_KEYWORDS.net_weight_kg.some((k) => lower.includes(k.toLowerCase()));
      if (hit) {
        const m = line.match(/([\d,\.]+)/);
        if (m) result.net_weight_kg = { value: m[1].trim(), confidence: 0.82, fill: 'auto' };
      }
    }

    // ── intake_date ───────────────────────────────────────────────────────
    if (!result.intake_date) {
      const hit = LINE_KEYWORDS.intake_date.some((k) => lower.includes(k.toLowerCase()));
      if (hit) {
        const m = line.match(/(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/);
        if (m) result.intake_date = { value: m[1].trim(), confidence: 0.82, fill: 'auto' };
      }
    }

    // ── supplier_name ─────────────────────────────────────────────────────
    if (!result.supplier_name) {
      const hit = LINE_KEYWORDS.supplier_name.some((k) => lower.includes(k.toLowerCase()));
      if (hit) {
        // Strip ALL keyword tokens and the colon, keep remaining text
        let val = line;
        LINE_KEYWORDS.supplier_name.forEach((k) => {
          val = val.replace(new RegExp(k, 'iu'), '');
        });
        val = val.replace(/[:\s]+/g, ' ').trim();
        if (val.length >= 2) result.supplier_name = { value: val, confidence: 0.80, fill: 'auto' };
      }
    }
  }

  // ── date fallback: any DD/MM/YYYY in whole document if not yet found ──────
  if (!result.intake_date) {
    const m = content.match(/(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/);
    if (m) result.intake_date = { value: m[1].trim(), confidence: 0.70, fill: 'warn' };
  }

  return result;
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
    return { fields: MOCK_FIELDS, raw_payload: null };
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

      console.log('\n── OCR raw content (first 400 chars) ───────────');
      console.log(content.slice(0, 400));
      console.log('── OCR raw key-value pairs ─────────────────────');
      if (kvPairs.length === 0) {
        console.log('  (none — using regex text extraction instead)');
      } else {
        kvPairs.forEach((kv, idx) => {
          console.log(`  [${idx}] key="${kv.key?.content}"  value="${kv.value?.content}"  conf=${kv.key?.confidence?.toFixed(2)}`);
        });
      }

      const fromKV   = mapFields(kvPairs);
      const fromText = mapFromContent(content);
      // KV pairs take precedence (Azure-level confidence) over regex
      const fields   = { ...fromText, ...fromKV };

      console.log('── Mapped fields ────────────────────────────────');
      console.log(JSON.stringify(fields, null, 2));
      console.log('─────────────────────────────────────────────────\n');

      return { fields, raw_payload: data.analyzeResult };
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
