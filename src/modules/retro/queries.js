import pool from '../../db/client.js';

// Query list of batches for a factory
export const listRetroIntakes = async ({ factory_id, limit = 50, offset = 0 }) => {
  const { rows } = await pool.query(
    `SELECT ri.*, u.full_name AS submitted_by_name,
            COALESCE(COUNT(rc.id), 0)::integer AS total_records,
            COALESCE(COUNT(rc.id) FILTER (WHERE rc.status IN ('imported', 'flagged')), 0)::integer AS valid_records,
            COALESCE(COUNT(rc.id) FILTER (WHERE rc.status = 'rejected'), 0)::integer AS rejected_records,
            COALESCE(SUM(rc.calculated_credits) FILTER (WHERE rc.status IN ('imported', 'flagged') AND rc.record_type = 'outbound'), 0)::numeric AS total_calculated_credits
     FROM public.retro_intakes ri
     LEFT JOIN public.users u ON u.id = ri.submitted_by
     LEFT JOIN public.retro_certification_records rc ON rc.import_batch_id = ri.id
     WHERE ri.factory_id = $1
     GROUP BY ri.id, u.full_name
     ORDER BY ri.created_at DESC
     LIMIT $2 OFFSET $3`,
    [factory_id, limit, offset]
  );
  return rows;
};

// Query single batch detail with counts
export const getRetroIntakeById = async (id, factory_id) => {
  const params = [id];
  const factoryClause = factory_id ? 'AND ri.factory_id = $2' : '';
  if (factory_id) params.push(factory_id);
  const { rows } = await pool.query(
    `SELECT ri.*, u.full_name AS submitted_by_name,
            COALESCE(COUNT(rc.id), 0)::integer AS total_records,
            COALESCE(COUNT(rc.id) FILTER (WHERE rc.status IN ('imported', 'flagged')), 0)::integer AS valid_records,
            COALESCE(COUNT(rc.id) FILTER (WHERE rc.status = 'rejected'), 0)::integer AS rejected_records,
            COALESCE(SUM(rc.calculated_credits) FILTER (WHERE rc.status IN ('imported', 'flagged') AND rc.record_type = 'outbound'), 0)::numeric AS total_calculated_credits,
            COALESCE(SUM(rc.weight) FILTER (WHERE rc.status IN ('imported', 'flagged') AND rc.record_type = 'inbound'), 0)::numeric AS total_eligible_input_weight
     FROM public.retro_intakes ri
     LEFT JOIN public.users u ON u.id = ri.submitted_by
     LEFT JOIN public.retro_certification_records rc ON rc.import_batch_id = ri.id
     WHERE ri.id = $1 ${factoryClause}
     GROUP BY ri.id, u.full_name`,
    params
  );
  return rows[0] || null;
};

// Query individual records within a batch
export const getRetroCertificationRecords = async (import_batch_id, factory_id) => {
  const params = [import_batch_id];
  const factoryClause = factory_id ? 'AND factory_id = $2' : '';
  if (factory_id) params.push(factory_id);
  const { rows } = await pool.query(
    `SELECT * FROM public.retro_certification_records
     WHERE import_batch_id = $1 ${factoryClause}
     ORDER BY row_index ASC, id ASC`,
    params
  );
  return rows;
};

// Check for duplicate in the database (soft check)
export const checkDuplicateRecord = async (client, {
  factory_id,
  record_type,
  date,
  invoice_number,
  delivery_note_number,
  party_name,
  weight,
}) => {
  const db = client || pool;
  const { rows } = await db.query(
    `SELECT id, import_batch_id FROM public.retro_certification_records
     WHERE factory_id = $1
       AND record_type = $2
       AND date = $3
       AND LOWER(TRIM(invoice_number)) = LOWER(TRIM($4))
       AND LOWER(TRIM(delivery_note_number)) = LOWER(TRIM($5))
       AND LOWER(TRIM(party_name)) = LOWER(TRIM($6))
       AND weight = $7
       AND status IN ('imported', 'flagged')
     LIMIT 1`,
    [factory_id, record_type, date, invoice_number, delivery_note_number, party_name, weight]
  );
  return rows[0] || null;
};

// Database transaction wrapper for writing a new batch
export const executeImportTransaction = async (factory_id, submitted_by, batchData, records, creditAmount) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Create retro_intake container
    const { rows: [batch] } = await client.query(
      `INSERT INTO public.retro_intakes
         (factory_id, submitted_by, period_start, period_end, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        factory_id,
        submitted_by,
        batchData.period_start || new Date(),
        batchData.period_end || new Date(),
        'processing',
        batchData.notes || null,
      ]
    );

    let validCount = 0;
    let rejectedCount = 0;

    // 2. Insert certification records one by one to properly handle potential errors and row bindings
    for (const record of records) {
      // Check for soft duplicate warning if it hasn't failed other validation
      let recordStatus = record.status;
      let recordErrors = record.errors || [];

      if (recordStatus === 'imported') {
        const duplicate = await checkDuplicateRecord(client, {
          factory_id,
          record_type: record.record_type,
          date: record.date,
          invoice_number: record.invoice_number,
          delivery_note_number: record.delivery_note_number,
          party_name: record.party_name,
          weight: record.weight,
        });

        if (duplicate) {
          recordStatus = 'flagged';
          recordErrors.push({
            field: 'duplicate',
            message: `חשד לכפילות: ייתכן שמדובר ברשומה כפולה (קיימת כבר רשומה זהה באצווה ${duplicate.import_batch_id})`,
          });
        }
      }

      if (recordStatus === 'rejected') {
        rejectedCount++;
      } else {
        validCount++;
      }

      await client.query(
        `INSERT INTO public.retro_certification_records
           (factory_id, import_batch_id, record_type, date, material_type,
            material_classification, party_name, invoice_number, delivery_note_number,
            lab_test_reference, weight, eligible_percent, calculated_credits, status, errors, row_index)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [
          factory_id,
          batch.id,
          record.record_type || null,
          record.date || null,
          record.material_type || null,
          record.material_classification || null,
          record.party_name || null,
          record.invoice_number || null,
          record.delivery_note_number || null,
          record.lab_test_reference || null,
          record.weight || null,
          record.eligible_percent || null,
          record.calculated_credits || 0,
          recordStatus,
          JSON.stringify(recordErrors),
          record.row_index,
        ]
      );
    }

    // 3. Insert into credits_ledger if there are outbound credits
    if (creditAmount > 0) {
      await client.query(
        `INSERT INTO public.credits_ledger
           (factory_id, source_type, source_id, kind, retro, eligible_output_kg)
         VALUES ($1, 'retroactive', $2, 'retroactive', true, $3)`,
        [factory_id, batch.id, creditAmount]
      );
    }

    // 4. Update the batch status
    let finalStatus = 'completed';
    if (validCount > 0 && rejectedCount > 0) {
      finalStatus = 'completed_with_errors';
    } else if (validCount === 0) {
      finalStatus = 'failed';
    }

    const { rows: [updatedBatch] } = await client.query(
      `UPDATE public.retro_intakes
       SET status = $1, period_start = $2, period_end = $3,
           documents_count = $5, updated_at = now()
       WHERE id = $4
       RETURNING *`,
      [finalStatus, batchData.period_start, batchData.period_end, batch.id, validCount + rejectedCount]
    );

    await client.query('COMMIT');
    return updatedBatch;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
