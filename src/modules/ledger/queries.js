import pool from '../../db/client.js';

export const getLedgerBalance = async (factory_id) => {
  const { rows } = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN movement_type = 'input'      THEN  eligible_weight_delta_kg ELSE 0 END), 0) AS total_input_kg,
       COALESCE(SUM(CASE WHEN movement_type = 'allocation' THEN -eligible_weight_delta_kg ELSE 0 END), 0) AS total_allocated_kg,
       COALESCE(SUM(CASE WHEN movement_type = 'release'    THEN  eligible_weight_delta_kg ELSE 0 END), 0) AS total_released_kg,
       COALESCE(SUM(CASE WHEN movement_type = 'output'     THEN -eligible_weight_delta_kg ELSE 0 END), 0) AS total_output_kg,
       COALESCE(SUM(eligible_weight_delta_kg), 0)                                                         AS net_balance_kg
     FROM material_ledger_entries
     WHERE factory_id = $1`,
    [factory_id]
  );

  const { rows: byMaterial } = await pool.query(
    `SELECT
       material_type,
       COALESCE(SUM(eligible_weight_delta_kg), 0) AS balance_kg
     FROM material_ledger_entries
     WHERE factory_id = $1
     GROUP BY material_type
     ORDER BY balance_kg DESC`,
    [factory_id]
  );

  return { ...rows[0], by_material: byMaterial };
};

export const getLedgerEntries = async ({ factory_id, movement_type, material_type, entity_type, limit = 50, offset = 0 }) => {
  const conditions = ['factory_id = $1'];
  const params = [factory_id];
  let idx = 2;

  if (movement_type) { conditions.push(`movement_type = $${idx++}`); params.push(movement_type); }
  if (material_type) { conditions.push(`material_type = $${idx++}`); params.push(material_type); }
  if (entity_type)   { conditions.push(`entity_type   = $${idx++}`); params.push(entity_type);   }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const { rows } = await pool.query(
    `SELECT * FROM material_ledger_entries
     ${where}
     ORDER BY created_at DESC
     LIMIT $${idx++} OFFSET $${idx}`,
    [...params, limit, offset]
  );
  return rows;
};
