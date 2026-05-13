import pool from '../../db/client.js';

export const listCredits = async ({ factory_id, kind, source_type, limit = 50, offset = 0 }) => {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (factory_id  !== undefined) { conditions.push(`cl.factory_id  = $${idx++}`); params.push(factory_id);  }
  if (kind        !== undefined) { conditions.push(`cl.kind        = $${idx++}`); params.push(kind);        }
  if (source_type !== undefined) { conditions.push(`cl.source_type = $${idx++}`); params.push(source_type); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT cl.*
     FROM credits_ledger cl
     ${where}
     ORDER BY cl.created_at DESC
     LIMIT $${idx++} OFFSET $${idx}`,
    [...params, limit, offset]
  );
  return rows;
};

export const getCreditsSummaryByFactory = async (factory_id) => {
  const { rows } = await pool.query(
    `SELECT
       COALESCE(SUM(eligible_output_kg), 0)                                         AS total_credits_kg,
       COALESCE(SUM(eligible_output_kg) FILTER (WHERE kind = 'operational'),  0)    AS operational_kg,
       COALESCE(SUM(eligible_output_kg) FILTER (WHERE kind = 'retroactive'),  0)    AS retroactive_kg,
       COUNT(*)                                                                      AS total_count,
       (SELECT COALESCE(SUM(eligible_weight_kg), 0)
        FROM raw_material_intakes WHERE factory_id = $1)                            AS total_eligible_input_kg
     FROM credits_ledger
     WHERE factory_id = $1`,
    [factory_id]
  );
  const row = rows[0];
  return {
    ...row,
    remaining_balance_kg: parseFloat(row.total_eligible_input_kg) - parseFloat(row.total_credits_kg),
  };
};
