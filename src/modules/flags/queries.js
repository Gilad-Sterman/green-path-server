import pool from '../../db/client.js';

export const listFlags = async ({ factory_id, status, severity, entity_type, limit = 50, offset = 0 }) => {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (factory_id  !== undefined) { conditions.push(`f.factory_id  = $${idx++}`); params.push(factory_id);  }
  if (status      !== undefined) { conditions.push(`f.status      = $${idx++}`); params.push(status);      }
  if (severity    !== undefined) { conditions.push(`f.severity    = $${idx++}`); params.push(severity);    }
  if (entity_type !== undefined) { conditions.push(`f.entity_type = $${idx++}`); params.push(entity_type); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT f.*,
            u.full_name AS resolved_by_name,
            CASE WHEN f.entity_type = 'intake' THEN (
              SELECT eu.full_name FROM raw_material_intakes rmi
              LEFT JOIN users eu ON eu.id = rmi.created_by
              WHERE rmi.id = f.entity_id LIMIT 1
            ) END AS entity_creator_name,
            CASE WHEN f.entity_type = 'intake' THEN (
              SELECT sup.name FROM raw_material_intakes rmi
              LEFT JOIN suppliers sup ON sup.id = rmi.supplier_id
              WHERE rmi.id = f.entity_id LIMIT 1
            ) END AS entity_supplier_name
     FROM flags f
     LEFT JOIN users u ON u.id = f.resolved_by
     ${where}
     ORDER BY
       CASE f.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
       f.created_at DESC
     LIMIT $${idx++} OFFSET $${idx}`,
    [...params, limit, offset]
  );
  return rows;
};

export const getFlagById = async (id) => {
  const { rows } = await pool.query(
    `SELECT f.*,
            u.full_name AS resolved_by_name,
            CASE WHEN f.entity_type = 'intake' THEN (
              SELECT eu.full_name FROM raw_material_intakes rmi
              LEFT JOIN users eu ON eu.id = rmi.created_by
              WHERE rmi.id = f.entity_id LIMIT 1
            ) END AS entity_creator_name,
            CASE WHEN f.entity_type = 'intake' THEN (
              SELECT sup.name FROM raw_material_intakes rmi
              LEFT JOIN suppliers sup ON sup.id = rmi.supplier_id
              WHERE rmi.id = f.entity_id LIMIT 1
            ) END AS entity_supplier_name
     FROM flags f
     LEFT JOIN users u ON u.id = f.resolved_by
     WHERE f.id = $1`,
    [id]
  );
  return rows[0] || null;
};

export const getFlagCountByStatus = async (factory_id) => {
  const { rows } = await pool.query(
    `SELECT status, COUNT(*)::int AS count
     FROM flags
     WHERE factory_id = $1
     GROUP BY status`,
    [factory_id]
  );
  return rows;
};

export const getFlagCountByStatusPlatform = async ({ date_from, date_to } = {}) => {
  const { rows } = await pool.query(
    `SELECT status, COUNT(*)::int AS count
     FROM flags
     WHERE ($1::timestamptz IS NULL OR created_at >= $1)
       AND ($2::timestamptz IS NULL OR created_at <= $2)
     GROUP BY status`,
    [date_from || null, date_to || null]
  );
  return rows;
};

export const resolveFlagById = async (id, { resolution, resolution_note, resolved_by }) => {
  const { rows } = await pool.query(
    `UPDATE flags
     SET status          = 'resolved',
         resolution      = $1,
         resolution_note = $2,
         resolved_by     = $3,
         resolved_at     = now(),
         updated_at      = now()
     WHERE id = $4
     RETURNING *`,
    [resolution, resolution_note || null, resolved_by, id]
  );
  return rows[0] || null;
};

export const dismissFlagById = async (id, { resolution_note, resolved_by }) => {
  const { rows } = await pool.query(
    `UPDATE flags
     SET status          = 'dismissed',
         resolution      = 'dismissed',
         resolution_note = $1,
         resolved_by     = $2,
         resolved_at     = now(),
         updated_at      = now()
     WHERE id = $3
     RETURNING *`,
    [resolution_note || null, resolved_by, id]
  );
  return rows[0] || null;
};

export const expireStaleFlags = async () => {
  const { rows } = await pool.query(
    `UPDATE flags
     SET status     = 'expired',
         updated_at = now()
     WHERE status   = 'open'
       AND created_at < now() - INTERVAL '72 hours'
     RETURNING id`
  );
  return rows.length;
};

export const insertFlag = async ({ factory_id, entity_type, entity_id, reason, severity = 'medium' }) => {
  const { rows } = await pool.query(
    `INSERT INTO flags (factory_id, entity_type, entity_id, reason, severity)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [factory_id, entity_type, entity_id || null, reason, severity]
  );
  return rows[0];
};
