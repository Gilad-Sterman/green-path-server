import { GoogleGenerativeAI } from '@google/generative-ai';
import { DOCUMENT_SCHEMAS } from './documentSchemas.js';

// Lazy-init — one client instance reused across requests
let _client = null;
const getClient = () => {
  if (!_client) _client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return _client;
};

// ── Main export ───────────────────────────────────────────────────────────────
// rawText      — plain text string from Azure Read OCR
// documentType — must match a key in DOCUMENT_SCHEMAS (default: 'intake')
// Returns { fields, extras } in the same shape as the old regex extraction
export const extractFields = async (rawText, documentType = 'intake') => {
  const schema = DOCUMENT_SCHEMAS[documentType];
  if (!schema) {
    throw Object.assign(
      new Error(`Unknown document type: "${documentType}". ` +
                `Supported types: ${Object.keys(DOCUMENT_SCHEMAS).join(', ')}`),
      { status: 400, code: 'ocr-unknown-doc-type' }
    );
  }

  if (!process.env.GEMINI_API_KEY) {
    throw Object.assign(
      new Error('Gemini API key is not configured on this server.'),
      { status: 503, code: 'gemini-unavailable' }
    );
  }

  const model = getClient().getGenerativeModel({
    model:            process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    systemInstruction: schema.systemPrompt,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema:   schema.responseSchema,
      thinkingConfig:   { thinkingBudget: 0 },
    },
  });

  let parsed;
  try {
    const result   = await model.generateContent(rawText);
    const rawReply = result.response.text();

    console.log('── Gemini raw reply ─────────────────────────────');
    console.log(rawReply);
    console.log('─────────────────────────────────────────────────\n');

    parsed = JSON.parse(rawReply);
  } catch (err) {
    console.error('── Gemini extraction ERROR ──────────────────────');
    console.error('Message :', err.message);
    console.error('Status  :', err.status ?? err.statusCode ?? 'n/a');
    console.error('Details :', JSON.stringify(err.errorDetails ?? err.response?.data ?? {}, null, 2));
    console.error('─────────────────────────────────────────────────\n');
    throw Object.assign(
      new Error(`Gemini extraction failed: ${err.message}`),
      { status: 502, code: 'gemini-extraction-failed' }
    );
  }

  console.log('── Gemini parsed response ───────────────────────');
  console.log(JSON.stringify(parsed, null, 2));
  console.log('─────────────────────────────────────────────────\n');

  return {
    fields: schema.toFields(parsed),
    extras: schema.toExtras(parsed),
  };
};
