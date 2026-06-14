import pool from '../../db/client.js';

export const listBatches = async ({ factory_id, product_id, status, limit = 50, offset = 0 }) => {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (factory_id !== undefined) { conditions.push(`b.factory_id = $${idx++}`); params.push(factory_id); }
  if (product_id !== undefined) { conditions.push(`b.product_id = $${idx++}`); params.push(product_id); }
  if (status     !== undefined) { conditions.push(`b.status     = $${idx++}`); params.push(status);     }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT b.*, p.name AS product_name, p.eligible_percent
     FROM batches b
     JOIN products p ON p.id = b.product_id
     ${where}
     ORDER BY b.created_at DESC
     LIMIT $${idx++} OFFSET $${idx}`,
    [...params, limit, offset]
  );
  return rows;
};

export const getBatchById = async (id) => {
  const { rows } = await pool.query(
    `SELECT b.*, p.name AS product_name, p.eligible_percent
     FROM batches b
     JOIN products p ON p.id = b.product_id
     WHERE b.id = $1`,
    [id]
  );
  return rows[0] || null;
};

export const getBatchWithComponents = async (id) => {
  const { rows } = await pool.query(
    `SELECT b.*, p.name AS product_name, p.eligible_percent,
            (
              SELECT COALESCE(
                JSON_AGG(
                  JSON_BUILD_OBJECT(
                    'shipment_id', si.shipment_id,
                    'weight_kg',   si.weight_kg,
                    'credit',      si.credit,
                    'shipment_date', s.shipment_date,
                    'customer_name', cu.name,
                    'status',      s.status
                  ) ORDER BY s.shipment_date DESC
                ) FILTER (WHERE si.id IS NOT NULL),
                '[]'::json
              )
              FROM shipment_items si
              JOIN shipments s  ON s.id  = si.shipment_id AND s.status != 'cancelled'
              LEFT JOIN customers cu ON cu.id = s.customer_id
              WHERE si.batch_id = b.id
            ) AS usages,
            COALESCE(
              JSON_AGG(
                JSON_BUILD_OBJECT(
                  'id',                   bc.id,
                  'source_type',          bc.source_type,
                  'source_id',            bc.source_id,
                  'weight_kg',            bc.weight_kg,
                  'intake_date',          rmi.intake_date,
                  'delivery_note_number', rmi.delivery_note_number,
                  'material_type',        rmi.material_type,
                  'eligible_weight_kg',   rmi.eligible_weight_kg,
                  'supplier_name',        sup.name,
                  'source_batch_code',    src_b.batch_code,
                  'source_product_name',  src_p.name
                ) ORDER BY bc.created_at
              ) FILTER (WHERE bc.id IS NOT NULL),
              '[]'
            ) AS components
     FROM batches b
     JOIN products p ON p.id = b.product_id
     LEFT JOIN batch_components bc      ON bc.batch_id  = b.id
     LEFT JOIN raw_material_intakes rmi ON rmi.id       = bc.source_id AND bc.source_type = 'intake'
     LEFT JOIN suppliers sup            ON sup.id        = rmi.supplier_id
     LEFT JOIN batches src_b            ON src_b.id      = bc.source_id AND bc.source_type = 'batch'
     LEFT JOIN products src_p           ON src_p.id      = src_b.product_id
     WHERE b.id = $1
     GROUP BY b.id, p.name, p.eligible_percent`,
    [id]
  );
  return rows[0] || null;
};

// Returns the remaining eligible weight that can still be allocated from an intake.
// Excludes allocations from cancelled batches.
export const getIntakeRemainingEligible = async (intake_id) => {
  const { rows } = await pool.query(
    `SELECT
       rmi.eligible_weight_kg - COALESCE(
         (SELECT SUM(bc.weight_kg)
          FROM batch_components bc
          JOIN batches b ON b.id = bc.batch_id
          WHERE bc.source_id = rmi.id
            AND bc.source_type = 'intake'
            AND b.status != 'cancelled'),
       0) AS remaining_eligible_kg,
       rmi.factory_id,
       rmi.material_type
     FROM raw_material_intakes rmi
     WHERE rmi.id = $1`,
    [intake_id]
  );
  return rows[0] || null;
};

// Returns remaining available weight for a batch used as a source in another batch.
export const getBatchRemainingAvailable = async (batch_id) => {
  const { rows } = await pool.query(
    `SELECT b.remaining_weight_kg AS remaining_eligible_kg,
            b.factory_id, b.is_active, b.status
     FROM batches b WHERE b.id = $1`,
    [batch_id]
  );
  return rows[0] || null;
};

// Generates the next available batch code for a factory on a given date.
// Format: PR-{DDMMYYYY}-{XXX} — XXX is a zero-padded daily sequence per factory.
export const generateBatchCode = async (factory_id, date) => {
  const d = date ? new Date(date) : new Date();
  const dd       = String(d.getDate()).padStart(2, '0');
  const mm       = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy     = d.getFullYear();
  const datePart = `${dd}${mm}${yyyy}`;
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS cnt FROM batches
     WHERE factory_id = $1 AND TO_CHAR(batch_date, 'DDMMYYYY') = $2`,
    [factory_id, datePart]
  );
  const seq = String(parseInt(rows[0].cnt) + 1).padStart(3, '0');
  return `PR-${datePart}-${seq}`;
};

// Returns true if the batch_code is unique for the factory.
export const isBatchCodeUnique = async (factory_id, batch_code) => {
  const { rows } = await pool.query(
    `SELECT 1 FROM batches WHERE factory_id = $1 AND batch_code = $2 LIMIT 1`,
    [factory_id, batch_code]
  );
  return rows.length === 0;
};

// Traverses the full ancestor chain of a batch (via batch sources only).
// Used by the DFS loop prevention check in service.js.
export const getBatchAncestorIds = async (batch_id) => {
  const { rows } = await pool.query(
    `WITH RECURSIVE ancestors AS (
       SELECT bc.source_id AS ancestor_id
       FROM batch_components bc
       WHERE bc.batch_id = $1 AND bc.source_type = 'batch'
       UNION
       SELECT bc.source_id
       FROM batch_components bc
       JOIN ancestors a ON bc.batch_id = a.ancestor_id
       WHERE bc.source_type = 'batch'
     )
     SELECT ancestor_id FROM ancestors`,
    [batch_id]
  );
  return rows.map((r) => r.ancestor_id);
};

// Returns available intake sources for a factory filtered by the product's material_recipe.
export const getAvailableIntakeSources = async (factory_id, product_id) => {
  const { rows } = await pool.query(
    `SELECT * FROM (
       SELECT
         rmi.id                     AS source_id,
         rmi.delivery_note_number   AS label,
         rmi.material_type,
         rmi.intake_date            AS date,
         sup.name                   AS supplier_name,
         rmi.eligible_weight_kg - COALESCE(
           (SELECT SUM(bc.weight_kg)
            FROM batch_components bc
            JOIN batches b2 ON b2.id = bc.batch_id
            WHERE bc.source_id = rmi.id
              AND bc.source_type = 'intake'
              AND b2.status != 'cancelled'),
         0) AS remaining_kg
       FROM raw_material_intakes rmi
       JOIN suppliers sup ON sup.id = rmi.supplier_id
       WHERE rmi.factory_id = $1
         AND (
           NOT EXISTS (
             SELECT 1 FROM products p2
             WHERE p2.id = $2
               AND p2.material_recipe IS NOT NULL
               AND jsonb_array_length(p2.material_recipe) > 0
           )
           OR rmi.material_type IN (
             SELECT elem->>'material_type'
             FROM products p, jsonb_array_elements(p.material_recipe) elem
             WHERE p.id = $2
           )
         )
         AND rmi.eligible_weight_kg > 0
     ) sub
     WHERE sub.remaining_kg > 0
     ORDER BY sub.date DESC`,
    [factory_id, product_id]
  );
  return rows;
};

// Returns available batch sources for a factory (active, has remaining weight).
export const getAvailableBatchSources = async (factory_id) => {
  const { rows } = await pool.query(
    `SELECT b.id AS source_id, b.batch_code AS label, b.batch_date AS date,
            b.remaining_weight_kg AS remaining_kg,
            p.name AS product_name
     FROM batches b
     JOIN products p ON p.id = b.product_id
     WHERE b.factory_id = $1
       AND b.remaining_weight_kg > 0
       AND b.is_active = true
       AND b.status NOT IN ('cancelled', 'failed')
     ORDER BY b.batch_date DESC`,
    [factory_id]
  );
  return rows;
};

export const createBatchTransaction = async (batchData, sources) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [batch] } = await client.query(
      `INSERT INTO batches
         (factory_id, product_id, output_weight_kg, batch_code, batch_date,
          original_batch_code, was_code_edited, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        batchData.factory_id, batchData.product_id, batchData.output_weight_kg,
        batchData.batch_code, batchData.batch_date || null,
        batchData.original_batch_code, batchData.was_code_edited || false,
        batchData.notes || null,
      ]
    );

    for (const src of sources) {
      await client.query(
        `INSERT INTO batch_components (batch_id, source_type, source_id, weight_kg)
         VALUES ($1, $2, $3, $4)`,
        [batch.id, src.source_type, src.source_id, src.weight_kg]
      );

      if (src.source_type === 'intake') {
        await client.query(
          `INSERT INTO material_ledger_entries
             (factory_id, entity_type, entity_id, movement_type, material_type, eligible_weight_delta_kg)
           VALUES ($1, 'batch', $2, 'allocation', $3, $4)`,
          [batchData.factory_id, batch.id, src.material_type, -src.weight_kg]
        );
      } else {
        // Batch source: deduct directly from source batch's used_weight_kg
        await client.query(
          `UPDATE batches SET used_weight_kg = used_weight_kg + $1, updated_at = now()
           WHERE id = $2`,
          [src.weight_kg, src.source_id]
        );
      }
    }

    await client.query('COMMIT');
    return batch;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const updateBatchById = async (id, fields) => {
  const setClauses = [];
  const params = [];
  let idx = 1;

  if (fields.status    !== undefined) { setClauses.push(`status    = $${idx++}`); params.push(fields.status);    }
  if (fields.notes     !== undefined) { setClauses.push(`notes     = $${idx++}`); params.push(fields.notes);     }
  if (fields.is_active !== undefined) { setClauses.push(`is_active = $${idx++}`); params.push(fields.is_active); }

  if (!setClauses.length) return null;

  params.push(id);
  const { rows } = await pool.query(
    `UPDATE batches SET ${setClauses.join(', ')}, updated_at = now() WHERE id = $${idx} RETURNING *`,
    params
  );
  return rows[0] || null;
};

export const setBlockedById = async (id, is_active) => {
  const { rows } = await pool.query(
    `UPDATE batches SET is_active = $1, updated_at = now() WHERE id = $2 RETURNING *`,
    [is_active, id]
  );
  return rows[0] || null;
};

export const setFailedById = async (id) => {
  const { rows } = await pool.query(
    `UPDATE batches SET status = 'failed', updated_at = now() WHERE id = $1 RETURNING *`,
    [id]
  );
  return rows[0] || null;
};

export const cancelBatchTransaction = async (id, factory_id) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: components } = await client.query(
      `SELECT bc.source_type, bc.source_id, bc.weight_kg, rmi.material_type
       FROM batch_components bc
       LEFT JOIN raw_material_intakes rmi
         ON rmi.id = bc.source_id AND bc.source_type = 'intake'
       WHERE bc.batch_id = $1`,
      [id]
    );

    await client.query(
      `UPDATE batches SET status = 'cancelled', updated_at = now() WHERE id = $1`,
      [id]
    );

    for (const comp of components) {
      if (comp.source_type === 'intake') {
        await client.query(
          `INSERT INTO material_ledger_entries
             (factory_id, entity_type, entity_id, movement_type, material_type, eligible_weight_delta_kg)
           VALUES ($1, 'batch', $2, 'release', $3, $4)`,
          [factory_id, id, comp.material_type, +comp.weight_kg]
        );
      } else {
        // Reverse the allocation on the source batch
        await client.query(
          `UPDATE batches
           SET used_weight_kg = GREATEST(0, used_weight_kg - $1), updated_at = now()
           WHERE id = $2`,
          [comp.weight_kg, comp.source_id]
        );
      }
    }

    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
