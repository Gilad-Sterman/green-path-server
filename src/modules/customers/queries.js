import pool from '../../db/client.js';

export const listCustomers = async ({ factory_id, is_active, search, limit = 50, offset = 0 }) => {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (factory_id !== undefined) { conditions.push(`c.factory_id = $${idx++}`); params.push(factory_id); }
  if (is_active  !== undefined) { conditions.push(`c.is_active  = $${idx++}`); params.push(is_active);  }
  if (search) {
    conditions.push(`(c.name ILIKE $${idx} OR c.contact_person ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT c.*, u.full_name AS creator_name
     FROM customers c
     LEFT JOIN users u ON u.id = c.created_by
     ${where}
     ORDER BY c.name ASC
     LIMIT $${idx++} OFFSET $${idx}`,
    [...params, limit, offset]
  );
  return rows;
};

export const getCustomerById = async (id) => {
  const { rows } = await pool.query(
    `SELECT c.*, u.full_name AS creator_name
     FROM customers c
     LEFT JOIN users u ON u.id = c.created_by
     WHERE c.id = $1`,
    [id]
  );
  return rows[0] || null;
};

export const insertCustomer = async ({ factory_id, name, is_active = true, created_by = null }) => {
  const { rows } = await pool.query(
    `WITH inserted AS (
       INSERT INTO customers (factory_id, name, is_active, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING *
     )
     SELECT i.*, u.full_name AS creator_name
     FROM inserted i
     LEFT JOIN users u ON u.id = i.created_by`,
    [factory_id, name, is_active, created_by]
  );
  return rows[0];
};

export const updateCustomerById = async (id, fields) => {
  const setClauses = [];
  const params = [];
  let idx = 1;

  if (fields.name           !== undefined) { setClauses.push(`name           = $${idx++}`); params.push(fields.name);           }
  if (fields.contact_person !== undefined) { setClauses.push(`contact_person = $${idx++}`); params.push(fields.contact_person); }
  if (fields.phone          !== undefined) { setClauses.push(`phone          = $${idx++}`); params.push(fields.phone);          }
  if (fields.email          !== undefined) { setClauses.push(`email          = $${idx++}`); params.push(fields.email);          }
  if (fields.is_active      !== undefined) { setClauses.push(`is_active      = $${idx++}`); params.push(fields.is_active);      }

  if (!setClauses.length) return null;

  params.push(id);
  const { rows } = await pool.query(
    `UPDATE customers
     SET ${setClauses.join(', ')}, updated_at = now()
     WHERE id = $${idx}
     RETURNING *`,
    params
  );
  return rows[0] || null;
};
