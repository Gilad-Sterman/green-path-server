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
    `SELECT b.*, p.name AS product_name, p.sku AS product_sku
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
    `SELECT b.*, p.name AS product_name, p.sku AS product_sku
     FROM batches b
     JOIN products p ON p.id = b.product_id
     WHERE b.id = $1`,
    [id]
  );
  return rows[0] || null;
};

export const getBatchWithComponents = async (id) => {
  const { rows } = await pool.query(
    `SELECT b.*, p.name AS product_name, p.sku AS product_sku,
            COALESCE(
              JSON_AGG(
                JSON_BUILD_OBJECT(
                  'id',                     bc.id,
                  'intake_id',              bc.intake_id,
                  'weight_kg',              bc.weight_kg,
                  'intake_date',            rmi.intake_date,
                  'delivery_note_number',   rmi.delivery_note_number,
                  'material_type',          rmi.material_type,
                  'eligible_weight_kg',     rmi.eligible_weight_kg,
                  'supplier_name',          s.name
                ) ORDER BY bc.created_at
              ) FILTER (WHERE bc.id IS NOT NULL),
              '[]'
            ) AS components
     FROM batches b
     JOIN products p ON p.id = b.product_id
     LEFT JOIN batch_components bc  ON bc.batch_id  = b.id
     LEFT JOIN raw_material_intakes rmi ON rmi.id = bc.intake_id
     LEFT JOIN suppliers s ON s.id = rmi.supplier_id
     WHERE b.id = $1
     GROUP BY b.id, p.name, p.sku`,
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
          WHERE bc.intake_id = rmi.id AND b.status != 'cancelled'),
       0) AS remaining_eligible_kg,
       rmi.factory_id,
       rmi.material_type
     FROM raw_material_intakes rmi
     WHERE rmi.id = $1`,
    [intake_id]
  );
  return rows[0] || null;
};

export const createBatchTransaction = async (batchData, components) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [batch] } = await client.query(
      `INSERT INTO batches (factory_id, product_id, output_weight_kg, notes)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [batchData.factory_id, batchData.product_id, batchData.output_weight_kg, batchData.notes || null]
    );

    for (const comp of components) {
      await client.query(
        `INSERT INTO batch_components (batch_id, intake_id, weight_kg) VALUES ($1, $2, $3)`,
        [batch.id, comp.intake_id, comp.weight_kg]
      );
      await client.query(
        `INSERT INTO material_ledger_entries
           (factory_id, entity_type, entity_id, movement_type, material_type, eligible_weight_delta_kg)
         VALUES ($1, 'batch', $2, 'allocation', $3, $4)`,
        [batchData.factory_id, batch.id, comp.material_type, -comp.weight_kg]
      );
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

  if (fields.status !== undefined) { setClauses.push(`status = $${idx++}`); params.push(fields.status); }
  if (fields.notes  !== undefined) { setClauses.push(`notes  = $${idx++}`); params.push(fields.notes);  }

  if (!setClauses.length) return null;

  params.push(id);
  const { rows } = await pool.query(
    `UPDATE batches SET ${setClauses.join(', ')}, updated_at = now() WHERE id = $${idx} RETURNING *`,
    params
  );
  return rows[0] || null;
};

export const cancelBatchTransaction = async (id, factory_id) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: components } = await client.query(
      `SELECT bc.intake_id, bc.weight_kg, rmi.material_type
       FROM batch_components bc
       JOIN raw_material_intakes rmi ON rmi.id = bc.intake_id
       WHERE bc.batch_id = $1`,
      [id]
    );

    await client.query(
      `UPDATE batches SET status = 'cancelled', updated_at = now() WHERE id = $1`,
      [id]
    );

    for (const comp of components) {
      await client.query(
        `INSERT INTO material_ledger_entries
           (factory_id, entity_type, entity_id, movement_type, material_type, eligible_weight_delta_kg)
         VALUES ($1, 'batch', $2, 'release', $3, $4)`,
        [factory_id, id, comp.material_type, +comp.weight_kg]
      );
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
