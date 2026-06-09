import pool from '../../db/client.js';

export const getUserById = async (id) => {
  const { rows } = await pool.query(
    `SELECT u.id, u.created_at, u.updated_at, u.factory_id, u.phone_number,
            u.full_name, u.role, u.is_active, u.last_login_at,
            f.name AS factory_name
     FROM users u
     LEFT JOIN factories f ON f.id = u.factory_id
     WHERE u.id = $1`,
    [id]
  );
  return rows[0] || null;
};

export const getUserByPhone = async (phone_number) => {
  const { rows } = await pool.query(
    `SELECT id FROM users WHERE phone_number = $1`,
    [phone_number]
  );
  return rows[0] || null;
};

export const listUsers = async ({ factory_id, role, is_active, limit = 50, offset = 0 }) => {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (factory_id !== undefined) {
    conditions.push(`u.factory_id = $${idx++}`);
    params.push(factory_id);
  }
  if (role !== undefined) {
    conditions.push(`u.role = $${idx++}`);
    params.push(role);
  }
  if (is_active !== undefined) {
    conditions.push(`u.is_active = $${idx++}`);
    params.push(is_active);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT u.id, u.created_at, u.factory_id, u.phone_number, u.full_name,
            u.role, u.is_active, u.last_login_at,
            f.name AS factory_name
     FROM users u
     LEFT JOIN factories f ON f.id = u.factory_id
     ${where}
     ORDER BY u.created_at DESC
     LIMIT $${idx++} OFFSET $${idx}`,
    [...params, limit, offset]
  );
  return rows;
};

export const insertUser = async ({ phone_number, full_name, role, factory_id }) => {
  const { rows } = await pool.query(
    `INSERT INTO users (phone_number, full_name, role, factory_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id, created_at, factory_id, phone_number, full_name, role, is_active`,
    [phone_number, full_name, role, factory_id || null]
  );
  return rows[0];
};

export const countActiveManagers = async (factory_id) => {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::integer AS cnt
     FROM users
     WHERE factory_id = $1 AND role = 'manager' AND is_active = true`,
    [factory_id]
  );
  return rows[0].cnt;
};

export const deleteUserById = async (id) => {
  await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [id]);
  await pool.query('DELETE FROM users WHERE id = $1', [id]);
};

export const updateUserById = async (id, fields) => {
  const setClauses = [];
  const params = [];
  let idx = 1;

  if (fields.full_name  !== undefined) { setClauses.push(`full_name  = $${idx++}`); params.push(fields.full_name);  }
  if (fields.role       !== undefined) { setClauses.push(`role       = $${idx++}`); params.push(fields.role);       }
  if (fields.is_active  !== undefined) { setClauses.push(`is_active  = $${idx++}`); params.push(fields.is_active);  }

  if (!setClauses.length) return null;

  params.push(id);
  const { rows } = await pool.query(
    `UPDATE users
     SET ${setClauses.join(', ')}, updated_at = now()
     WHERE id = $${idx}
     RETURNING id, updated_at, factory_id, phone_number, full_name, role, is_active`,
    params
  );
  return rows[0] || null;
};
