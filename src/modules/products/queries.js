import pool from '../../db/client.js';

export const listProducts = async ({ factory_id, is_active, search, limit = 50, offset = 0 }) => {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (factory_id !== undefined) { conditions.push(`factory_id = $${idx++}`); params.push(factory_id); }
  if (is_active  !== undefined) { conditions.push(`is_active  = $${idx++}`); params.push(is_active);  }
  if (search) {
    conditions.push(`(name ILIKE $${idx} OR sku ILIKE $${idx} OR description ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT * FROM products
     ${where}
     ORDER BY name ASC
     LIMIT $${idx++} OFFSET $${idx}`,
    [...params, limit, offset]
  );
  return rows;
};

export const getProductById = async (id) => {
  const { rows } = await pool.query(
    `SELECT * FROM products WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
};

export const getProductBySku = async (factory_id, sku) => {
  const { rows } = await pool.query(
    `SELECT id FROM products WHERE factory_id = $1 AND sku = $2`,
    [factory_id, sku]
  );
  return rows[0] || null;
};

export const insertProduct = async ({ factory_id, name, sku, description, required_lab_tests, material_recipe, eligible_percent }) => {
  const { rows } = await pool.query(
    `INSERT INTO products (factory_id, name, sku, description, required_lab_tests, material_recipe, eligible_percent)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [factory_id, name, sku, description || null, required_lab_tests || [], JSON.stringify(material_recipe || []), eligible_percent ?? 0]
  );
  return rows[0];
};

export const updateProductById = async (id, fields) => {
  const setClauses = [];
  const params = [];
  let idx = 1;

  if (fields.name               !== undefined) { setClauses.push(`name               = $${idx++}`); params.push(fields.name);                                    }
  if (fields.description        !== undefined) { setClauses.push(`description        = $${idx++}`); params.push(fields.description);                           }
  if (fields.required_lab_tests !== undefined) { setClauses.push(`required_lab_tests = $${idx++}`); params.push(fields.required_lab_tests);                    }
  if (fields.material_recipe    !== undefined) { setClauses.push(`material_recipe    = $${idx++}`); params.push(JSON.stringify(fields.material_recipe));       }
  if (fields.eligible_percent   !== undefined) { setClauses.push(`eligible_percent   = $${idx++}`); params.push(fields.eligible_percent);                      }
  if (fields.is_active          !== undefined) { setClauses.push(`is_active          = $${idx++}`); params.push(fields.is_active);                             }

  if (!setClauses.length) return null;

  params.push(id);
  const { rows } = await pool.query(
    `UPDATE products
     SET ${setClauses.join(', ')}, updated_at = now()
     WHERE id = $${idx}
     RETURNING *`,
    params
  );
  return rows[0] || null;
};
