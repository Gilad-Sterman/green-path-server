import pool from '../../db/client.js';

export const createFactoryWithManager = async (factoryData, managerData, created_by = null) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { name, company_id_number, address, geofence_center, geofence_radius_meters } = factoryData;
    const { rows: factoryRows } = await client.query(
      `INSERT INTO factories (name, company_id_number, address, geofence_center, geofence_radius_meters, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [name, company_id_number, address, geofence_center || null, geofence_radius_meters || null, created_by]
    );
    const factory = factoryRows[0];

    const { full_name, phone_number, email } = managerData;
    const { rows: userRows } = await client.query(
      `INSERT INTO users (phone_number, full_name, role, factory_id, email)
       VALUES ($1, $2, 'manager', $3, $4)
       RETURNING id, created_at, factory_id, phone_number, full_name, role, is_active, email`,
      [phone_number, full_name, factory.id, email || null]
    );
    const manager = userRows[0];

    await client.query('COMMIT');
    return { factory, manager };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export const listFactories = async ({ status, limit = 50, offset = 0 }) => {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (status) { conditions.push(`f.status = $${idx++}`); params.push(status); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT
       f.*,
       COUNT(u.id) FILTER (WHERE u.is_active = true AND u.role = 'employee') AS employee_count,
       COUNT(u.id) FILTER (WHERE u.is_active = true AND u.role = 'manager')  AS manager_count,
       COUNT(u.id) FILTER (WHERE u.is_active = true)                         AS active_user_count,
       (
         SELECT full_name FROM users
         WHERE factory_id = f.id AND role = 'manager'
         ORDER BY created_at ASC LIMIT 1
       ) AS contact_name,
       (
         SELECT COUNT(*) FROM flags
         WHERE factory_id = f.id AND status = 'open'
       ) AS open_flags_count,
       COALESCE((
         SELECT SUM(eligible_output_kg) FROM credits_ledger
         WHERE factory_id = f.id
       ), 0) AS total_credits_kg,
       GREATEST(
         (SELECT MAX(created_at) FROM raw_material_intakes WHERE factory_id = f.id),
         (SELECT MAX(created_at) FROM batches            WHERE factory_id = f.id),
         (SELECT MAX(created_at) FROM shipments          WHERE factory_id = f.id)
       ) AS last_activity
     FROM factories f
     LEFT JOIN users u ON u.factory_id = f.id
     ${where}
     GROUP BY f.id
     ORDER BY f.created_at DESC
     LIMIT $${idx++} OFFSET $${idx}`,
    [...params, limit, offset]
  );
  return rows;
};

export const getFactoryById = async (id) => {
  const { rows } = await pool.query(
    `SELECT f.*,
            COUNT(u.id) FILTER (WHERE u.is_active = true) AS active_user_count,
            creator.full_name AS creator_name
     FROM factories f
     LEFT JOIN users u       ON u.factory_id = f.id
     LEFT JOIN users creator ON creator.id   = f.created_by
     WHERE f.id = $1
     GROUP BY f.id, creator.full_name`,
    [id]
  );
  return rows[0] || null;
};

export const getFactoryByCompanyId = async (company_id_number) => {
  const { rows } = await pool.query(
    `SELECT id FROM factories WHERE company_id_number = $1`,
    [company_id_number]
  );
  return rows[0] || null;
};

export const insertFactory = async ({ name, company_id_number, address, geofence_center, geofence_radius_meters }) => {
  const { rows } = await pool.query(
    `INSERT INTO factories (name, company_id_number, address, geofence_center, geofence_radius_meters)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [name, company_id_number, address, geofence_center || null, geofence_radius_meters || null]
  );
  return rows[0];
};

export const suspendFactoryById = async (id, reason) => {
  const { rows } = await pool.query(
    `UPDATE factories
     SET status = 'suspended', updated_at = now()
     WHERE id = $1 AND status = 'active'
     RETURNING *`,
    [id]
  );
  return rows[0] || null;
};

export const unsuspendFactoryById = async (id) => {
  const { rows } = await pool.query(
    `UPDATE factories
     SET status = 'active', updated_at = now()
     WHERE id = $1 AND status = 'suspended'
     RETURNING *`,
    [id]
  );
  return rows[0] || null;
};

export const updateFactoryById = async (id, fields) => {
  const setClauses = [];
  const params = [];
  let idx = 1;

  if (fields.name                  !== undefined) { setClauses.push(`name                  = $${idx++}`); params.push(fields.name); }
  if (fields.address               !== undefined) { setClauses.push(`address               = $${idx++}`); params.push(fields.address); }
  if (fields.company_id_number     !== undefined) { setClauses.push(`company_id_number     = $${idx++}`); params.push(fields.company_id_number); }
  if (fields.geofence_center       !== undefined) { setClauses.push(`geofence_center       = $${idx++}`); params.push(fields.geofence_center); }
  if (fields.geofence_radius_meters !== undefined) { setClauses.push(`geofence_radius_meters = $${idx++}`); params.push(fields.geofence_radius_meters); }
  if (fields.status                !== undefined) { setClauses.push(`status                = $${idx++}`); params.push(fields.status); }

  if (!setClauses.length) return null;

  params.push(id);
  const { rows } = await pool.query(
    `UPDATE factories
     SET ${setClauses.join(', ')}, updated_at = now()
     WHERE id = $${idx}
     RETURNING *`,
    params
  );
  return rows[0] || null;
};
