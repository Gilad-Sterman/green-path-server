// ── Document Schemas Registry ─────────────────────────────────────────────────
// To support a new document type, add an entry here.
// Nothing else in the codebase needs to change.
//
// Each entry has:
//   systemPrompt   — instructions sent to Gemini as system context
//   responseSchema — JSON Schema defining the structured output shape
//   toFields()     — maps Gemini's parsed JSON → internal { value, confidence, fill }
//   toExtras()     — maps Gemini's parsed JSON → extras panel object

const confidenceFill = (c) => (c >= 0.85 ? 'auto' : c >= 0.55 ? 'warn' : 'skip');

const toField = (value, confidence = 0.90) => ({
  value:      String(value).trim(),
  confidence,
  fill:       confidenceFill(confidence),
});

// ── intake ─────────────────────────────────────────────────────────────────────
// Weighbridge certificates (תעודות שקילה) and delivery notes (תעודות משלוח)

const intakeResponseSchema = {
  type: 'object',
  properties: {
    delivery_note_number: {
      type:        'string',
      nullable:    true,
      description: 'Certificate or document serial number',
    },
    net_weight_kg: {
      type:        'string',
      nullable:    true,
      description: 'Net weight in kg (נטו only) as a plain number string without units',
    },
    intake_date: {
      type:        'string',
      nullable:    true,
      description: 'Document date in DD/MM/YYYY format',
    },
    supplier_name: {
      type:        'string',
      nullable:    true,
      description: 'Name of the sending / issuing organization',
    },
    supplier_source: {
      type:        'string',
      nullable:    true,
      description: '"explicit" if a ספק/supplier label was found, "header_inferred" if taken from the document header',
    },
    client_name: {
      type:        'string',
      nullable:    true,
      description: 'Receiving client (לקוח)',
    },
    carrier_name: {
      type:        'string',
      nullable:    true,
      description: 'Transport / hauler name (מוביל)',
    },
    material_hint: {
      type:        'string',
      nullable:    true,
      description: 'Material type description (חומר, סוג חומר)',
    },
  },
};

const intakeSystemPrompt = `You are an expert OCR data extractor for Hebrew and English weighbridge certificates \
(תעודות שקילה) and delivery notes (תעודות משלוח) from Israeli recycling facilities.

Extract the following fields from the provided OCR text:

• delivery_note_number  — The certificate or document serial number.
  Look for: תעודת שקילה מס׳, מספר תעודה, מס' תעודה, ת.מ., doc no, invoice no, delivery note no.

• net_weight_kg  — The NET weight in kg. This is ALWAYS labeled נטו.
  IMPORTANT: Do NOT return ברוטו (gross weight) or טרה (tare weight).
  When three weights appear on one line (ברוטו / טרה / נטו), extract ONLY the number adjacent to נטו.
  Return as a plain number string with no units, commas, or spaces (e.g. "19720" not "19,720 ק\"ג").

• intake_date  — The document date. Return in DD/MM/YYYY format.
  If the year is 2 digits, infer the full 4-digit year.

• supplier_name  — The name of the sending / issuing organization.
  Look for an explicit ספק or שם ספק label first.
  If no such label exists, use the prominent organization name from the document header (usually the first line).
  Set supplier_source accordingly.

• supplier_source  — "explicit" if you found a ספק/supplier label; "header_inferred" if you used the header.

• client_name   — Receiving client (לקוח).
• carrier_name  — Transport or hauler (מוביל, נהג).
• material_hint — Material type description (חומר, סוג חומר).

General rules:
- Return null for any field you cannot confidently identify.
- Strip measurement units from numeric values.
- Strip leading / trailing punctuation and whitespace from all values.
- Text may be RTL Hebrew — labels and values may appear in reversed order on the same line.`;

// ── Schema entry ──────────────────────────────────────────────────────────────
export const DOCUMENT_SCHEMAS = {
  intake: {
    systemPrompt:   intakeSystemPrompt,
    responseSchema: intakeResponseSchema,

    toFields: (parsed) => {
      const fields = {};

      if (parsed.delivery_note_number?.trim())
        fields.delivery_note_number = toField(parsed.delivery_note_number);

      if (parsed.net_weight_kg?.trim())
        fields.net_weight_kg = toField(parsed.net_weight_kg);

      if (parsed.intake_date?.trim())
        fields.intake_date = toField(parsed.intake_date);

      if (parsed.supplier_name?.trim()) {
        const inferred = parsed.supplier_source === 'header_inferred';
        fields.supplier_name = toField(parsed.supplier_name, inferred ? 0.70 : 0.90);
      }

      return fields;
    },

    toExtras: (parsed) => {
      const extras = {};
      if (parsed.client_name?.trim())   extras.client_name   = parsed.client_name.trim();
      if (parsed.carrier_name?.trim())  extras.carrier_name  = parsed.carrier_name.trim();
      if (parsed.material_hint?.trim()) extras.material_hint = parsed.material_hint.trim();
      return extras;
    },
  },

  // ── Future document types ──────────────────────────────────────────────────
  // shipment: { systemPrompt, responseSchema, toFields, toExtras },
  // retro:    { systemPrompt, responseSchema, toFields, toExtras },
};
