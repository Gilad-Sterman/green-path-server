import pool from '../../db/client.js';

export const listSuppliers = async ({ factory_id, is_active, search, limit = 50, offset = 0 }) => {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (factory_id !== undefined) { conditions.push(`s.factory_id = $${idx++}`); params.push(factory_id); }
  if (is_active  !== undefined) { conditions.push(`s.is_active  = $${idx++}`); params.push(is_active);  }
  if (search) {
    conditions.push(`(s.name ILIKE $${idx} OR s.contact_person ILIKE $${idx} OR s.erp_id ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT s.*, u.full_name AS creator_name
     FROM suppliers s
     LEFT JOIN users u ON u.id = s.created_by
     ${where}
     ORDER BY s.name ASC
     LIMIT $${idx++} OFFSET $${idx}`,
    [...params, limit, offset]
  );
  return rows;
};

export const getSupplierById = async (id) => {
  const { rows } = await pool.query(
    `SELECT s.*, u.full_name AS creator_name
     FROM suppliers s
     LEFT JOIN users u ON u.id = s.created_by
     WHERE s.id = $1`,
    [id]
  );
  return rows[0] || null;
};

export const insertSupplier = async ({ factory_id, name, allowed_material_types, is_active = true, created_by = null }) => {
  const { rows } = await pool.query(
    `WITH inserted AS (
       INSERT INTO suppliers (factory_id, name, allowed_material_types, is_active, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *
     )
     SELECT i.*, u.full_name AS creator_name
     FROM inserted i
     LEFT JOIN users u ON u.id = i.created_by`,
    [factory_id, name, allowed_material_types || [], is_active, created_by]
  );
  return rows[0];
};

export const updateSupplierById = async (id, fields) => {
  const setClauses = [];
  const params = [];
  let idx = 1;

  if (fields.name                    !== undefined) { setClauses.push(`name                    = $${idx++}`); params.push(fields.name);                    }
  if (fields.contact_person          !== undefined) { setClauses.push(`contact_person          = $${idx++}`); params.push(fields.contact_person);          }
  if (fields.phone                   !== undefined) { setClauses.push(`phone                   = $${idx++}`); params.push(fields.phone);                   }
  if (fields.email                   !== undefined) { setClauses.push(`email                   = $${idx++}`); params.push(fields.email);                   }
  if (fields.allowed_material_types  !== undefined) { setClauses.push(`allowed_material_types  = $${idx++}`); params.push(fields.allowed_material_types);  }
  if (fields.allowed_material_sources !== undefined) { setClauses.push(`allowed_material_sources = $${idx++}`); params.push(fields.allowed_material_sources); }
  if (fields.erp_id                  !== undefined) { setClauses.push(`erp_id                  = $${idx++}`); params.push(fields.erp_id);                  }
  if (fields.is_active               !== undefined) { setClauses.push(`is_active               = $${idx++}`); params.push(fields.is_active);               }

  if (!setClauses.length) return null;

  params.push(id);
  const { rows } = await pool.query(
    `UPDATE suppliers
     SET ${setClauses.join(', ')}, updated_at = now()
     WHERE id = $${idx}
     RETURNING *`,
    params
  );
  return rows[0] || null;
};
