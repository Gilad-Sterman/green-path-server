import axios from 'axios';
import { extractFields } from './geminiExtractor.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Mock result for dev / testing ─────────────────────────────────────────────
const MOCK_FIELDS = {
  delivery_note_number: { value: 'DN-MOCK-2024-001', confidence: 0.90, fill: 'auto' },
  net_weight_kg:        { value: '1250',             confidence: 0.90, fill: 'auto' },
  intake_date:          { value: new Date().toLocaleDateString('he-IL'), confidence: 0.90, fill: 'auto' },
  supplier_name:        { value: 'Demo Supplier Ltd.', confidence: 0.70, fill: 'warn' },
};

// ── Main export ───────────────────────────────────────────────────────────────
// documentType must match a key in documentSchemas.js (default: 'intake')
export const analyzeDocument = async (fileBuffer, mimeType, documentType = 'intake') => {
  if (process.env.OCR_MOCK === 'true') {
    await sleep(1500);
    return {
      fields:      MOCK_FIELDS,
      extras:      { client_name: 'Mock Client Ltd.', carrier_name: 'Mock Carrier', material_hint: 'פלסטיק' },
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

  // ── 1. Submit to Azure Read (text extraction only) ────────────────────────
  const analyzeUrl =
    `${endpoint}/formrecognizer/documentModels/prebuilt-read:analyze?api-version=2023-07-31`;

  const submitRes = await axios.post(analyzeUrl, fileBuffer, {
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type':              mimeType,
    },
    maxBodyLength:    Infinity,
    maxContentLength: Infinity,
  });

  const operationUrl = submitRes.headers['operation-location'];
  if (!operationUrl) {
    throw Object.assign(new Error('No operation URL returned by Azure.'), { status: 502 });
  }

  // ── 2. Poll for result ────────────────────────────────────────────────────
  // Delays (ms): 800, 600, 800, 1000, 1200, 1500, 2000, 2000, 2000, 2000
  // First check at ~800 ms (typical for a 1-page doc); backs off for larger files.
  const POLL_DELAYS = [800, 600, 800, 1000, 1200, 1500, 2000, 2000, 2000, 2000];
  let rawText    = '';
  let rawPayload = null;

  for (let i = 0; i < POLL_DELAYS.length; i++) {
    await sleep(POLL_DELAYS[i]);

    const { data } = await axios.get(operationUrl, {
      headers: { 'Ocp-Apim-Subscription-Key': key },
    });

    if (data.status === 'succeeded') {
      rawText    = data.analyzeResult?.content || '';
      rawPayload = data.analyzeResult;

      console.log('\n── Azure OCR raw text (first 800 chars) ─────────');
      console.log(rawText.slice(0, 800));
      console.log('─────────────────────────────────────────────────\n');
      break;
    }

    if (data.status === 'failed') {
      throw Object.assign(
        new Error('Azure OCR processing failed.'),
        { status: 422, code: 'ocr-failed' }
      );
    }
  }

  if (!rawText) {
    throw Object.assign(
      new Error('OCR timed out. Please fill the form manually.'),
      { status: 408, code: 'ocr-timeout' }
    );
  }

  // ── 3. AI extraction via Gemini ───────────────────────────────────────────
  const { fields, extras } = await extractFields(rawText, documentType);

  console.log('── Final fields ──────────────────────────────────');
  console.log(JSON.stringify(fields, null, 2));
  console.log('── Extras ────────────────────────────────────────');
  console.log(JSON.stringify(extras, null, 2));
  console.log('─────────────────────────────────────────────────\n');

  return { fields, extras, raw_payload: rawPayload };
};
