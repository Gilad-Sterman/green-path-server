import pool from '../../db/client.js';

export const listShipments = async ({ factory_id, customer_id, status, date_from, date_to, limit = 50, offset = 0 }) => {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (factory_id  !== undefined) { conditions.push(`s.factory_id  = $${idx++}`); params.push(factory_id);  }
  if (customer_id !== undefined) { conditions.push(`s.customer_id = $${idx++}`); params.push(customer_id); }
  if (status      !== undefined) { conditions.push(`s.status      = $${idx++}`); params.push(status);      }
  if (date_from   !== undefined) { conditions.push(`s.shipment_date >= $${idx++}`); params.push(date_from); }
  if (date_to     !== undefined) { conditions.push(`s.shipment_date <= $${idx++}`); params.push(date_to);   }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT s.*, c.name AS customer_name
     FROM shipments s
     JOIN customers c ON c.id = s.customer_id
     ${where}
     ORDER BY s.shipment_date DESC, s.created_at DESC
     LIMIT $${idx++} OFFSET $${idx}`,
    [...params, limit, offset]
  );
  return rows;
};

export const getShipmentById = async (id) => {
  const { rows } = await pool.query(
    `SELECT s.*, c.name AS customer_name
     FROM shipments s
     JOIN customers c ON c.id = s.customer_id
     WHERE s.id = $1`,
    [id]
  );
  return rows[0] || null;
};

export const getShipmentWithItems = async (id) => {
  const { rows } = await pool.query(
    `SELECT s.*, c.name AS customer_name,
            COALESCE(
              JSON_AGG(
                JSON_BUILD_OBJECT(
                  'id',               si.id,
                  'batch_id',         si.batch_id,
                  'product_id',       si.product_id,
                  'weight_kg',        si.weight_kg,
                  'eligible_percent', si.eligible_percent,
                  'credit',           si.credit,
                  'product_name',     p.name,
                  'product_sku',      p.sku
                ) ORDER BY si.created_at
              ) FILTER (WHERE si.id IS NOT NULL),
              '[]'
            ) AS items
     FROM shipments s
     JOIN customers c ON c.id = s.customer_id
     LEFT JOIN shipment_items si ON si.shipment_id = s.id
     LEFT JOIN products p ON p.id = si.product_id
     WHERE s.id = $1
     GROUP BY s.id, c.name`,
    [id]
  );
  return rows[0] || null;
};

export const getShipmentByDeliveryNote = async (delivery_note_number) => {
  const { rows } = await pool.query(
    `SELECT * FROM shipments
     WHERE delivery_note_number = $1 AND status != 'cancelled'
     ORDER BY created_at DESC LIMIT 1`,
    [delivery_note_number]
  );
  return rows[0] || null;
};

export const updateShipmentById = async (id, fields) => {
  const setClauses = [];
  const params = [];
  let idx = 1;

  if (fields.status              !== undefined) { setClauses.push(`status              = $${idx++}`); params.push(fields.status);              }
  if (fields.notes               !== undefined) { setClauses.push(`notes               = $${idx++}`); params.push(fields.notes);               }
  if (fields.invoice_status      !== undefined) { setClauses.push(`invoice_status      = $${idx++}`); params.push(fields.invoice_status);      }
  if (fields.invoice_number      !== undefined) { setClauses.push(`invoice_number      = $${idx++}`); params.push(fields.invoice_number);      }
  if (fields.invoice_date        !== undefined) { setClauses.push(`invoice_date        = $${idx++}`); params.push(fields.invoice_date);        }
  if (fields.invoice_file_url    !== undefined) { setClauses.push(`invoice_file_url    = $${idx++}`); params.push(fields.invoice_file_url);    }
  if (fields.hashavshevet_synced_at !== undefined) { setClauses.push(`hashavshevet_synced_at = $${idx++}`); params.push(fields.hashavshevet_synced_at); }

  if (!setClauses.length) return null;

  params.push(id);
  const { rows } = await pool.query(
    `UPDATE shipments SET ${setClauses.join(', ')}, updated_at = now() WHERE id = $${idx} RETURNING *`,
    params
  );
  return rows[0] || null;
};

/**
 * Full transactional shipment creation:
 * 1. Insert shipment
 * 2. Insert shipment_items
 * 3. Update each batch's used_weight_kg
 * 4. Mass balance check (total credits + new ≤ total eligible input)
 * 5. Insert into credits_ledger
 * 6. Insert material_ledger_entry (output)
 * If mass balance exceeded: insert flag, rollback, throw error.
 */
export const createShipmentTransaction = async (shipmentData, items) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // eligible_output_kg = Σ(weight × eligible_percent / 100) — the correct credit formula
    const eligible_output_kg = parseFloat(
      items.reduce((sum, item) => sum + item.credit, 0).toFixed(2)
    );

    // Insert shipment — CTE so customer_name is returned immediately
    const { rows: [shipment] } = await client.query(
      `WITH ins AS (
         INSERT INTO shipments
           (factory_id, customer_id, shipment_date, destination_address,
            delivery_note_number, lab_test_number, eligible_output_kg, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *
       )
       SELECT ins.*, c.name AS customer_name
       FROM ins
       JOIN customers c ON c.id = ins.customer_id`,
      [
        shipmentData.factory_id, shipmentData.customer_id,
        shipmentData.shipment_date, shipmentData.destination_address,
        shipmentData.delivery_note_number || null, shipmentData.lab_test_number || null,
        eligible_output_kg, shipmentData.notes || null,
      ]
    );

    // Insert items with per-item credit snapshot, update batch used_weight_kg
    for (const item of items) {
      await client.query(
        `INSERT INTO shipment_items
           (shipment_id, batch_id, product_id, weight_kg, eligible_percent, credit)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [shipment.id, item.batch_id, item.product_id,
         item.weight_kg, item.eligible_percent, item.credit]
      );
      await client.query(
        `UPDATE batches SET used_weight_kg = used_weight_kg + $1, updated_at = now() WHERE id = $2`,
        [item.weight_kg, item.batch_id]
      );
    }

    // Mass balance check (inside transaction for consistency)
    const { rows: [inputRow] } = await client.query(
      `SELECT COALESCE(SUM(eligible_weight_kg), 0) AS total_input
       FROM raw_material_intakes WHERE factory_id = $1`,
      [shipmentData.factory_id]
    );
    const { rows: [outputRow] } = await client.query(
      `SELECT COALESCE(SUM(eligible_output_kg), 0) AS total_output
       FROM credits_ledger WHERE factory_id = $1`,
      [shipmentData.factory_id]
    );

    const totalInput  = parseFloat(inputRow.total_input);
    const totalOutput = parseFloat(outputRow.total_output);

    if (totalOutput + eligible_output_kg > totalInput) {
      const overage = (totalOutput + eligible_output_kg - totalInput).toFixed(2);
      throw Object.assign(
        new Error(
          `Mass balance exceeded. Shipment would exceed eligible input by ${overage} kg. ` +
          `Total eligible input: ${totalInput} kg, Total credits issued: ${totalOutput} kg, ` +
          `This shipment: ${eligible_output_kg} kg.`
        ),
        {
          status:         422,
          code:           'mass-balance-exceeded',
          _flagFactoryId: shipmentData.factory_id,
          _flagEntityId:  shipment.id,
        }
      );
    }

    // Auto-generate credit
    const { rows: [credit] } = await client.query(
      `INSERT INTO credits_ledger
         (factory_id, source_type, source_id, kind, retro, eligible_output_kg)
       VALUES ($1, 'operational_shipment', $2, 'operational', false, $3)
       RETURNING *`,
      [shipmentData.factory_id, shipment.id, eligible_output_kg]
    );

    // Material ledger — output movement
    await client.query(
      `INSERT INTO material_ledger_entries
         (factory_id, entity_type, entity_id, movement_type, material_type, eligible_weight_delta_kg)
       VALUES ($1, 'shipment', $2, 'output', $3, ROUND($4::numeric, 2))`,
      [shipmentData.factory_id, shipment.id, 'mixed', -eligible_output_kg]
    );

    await client.query('COMMIT');
    return { shipment, credit };
  } catch (err) {
    await client.query('ROLLBACK');
    if (err._flagFactoryId && err._flagEntityId) {
      try {
        await pool.query(
          `INSERT INTO flags (factory_id, entity_type, entity_id, reason, severity)
           VALUES ($1, 'shipment', $2, 'mass-balance-exceeded', 'critical')`,
          [err._flagFactoryId, err._flagEntityId]
        );
      } catch (_) {}
    }
    throw err;
  } finally {
    client.release();
  }
};
