import pool from '../../db/client.js';

export const listIntakes = async ({
  factory_id, supplier_id, material_type, date_from, date_to,
  limit = 50, offset = 0,
}) => {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (factory_id   !== undefined) { conditions.push(`rmi.factory_id   = $${idx++}`); params.push(factory_id);   }
  if (supplier_id  !== undefined) { conditions.push(`rmi.supplier_id  = $${idx++}`); params.push(supplier_id);  }
  if (material_type !== undefined) { conditions.push(`rmi.material_type = $${idx++}`); params.push(material_type); }
  if (date_from    !== undefined) { conditions.push(`rmi.intake_date  >= $${idx++}`); params.push(date_from);    }
  if (date_to      !== undefined) { conditions.push(`rmi.intake_date  <= $${idx++}`); params.push(date_to);      }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT rmi.*, s.name AS supplier_name,
            u.full_name AS created_by_name
     FROM raw_material_intakes rmi
     JOIN suppliers s ON s.id = rmi.supplier_id
     LEFT JOIN users u ON u.id = rmi.created_by
     ${where}
     ORDER BY rmi.intake_date DESC, rmi.created_at DESC
     LIMIT $${idx++} OFFSET $${idx}`,
    [...params, limit, offset]
  );
  return rows;
};

export const getIntakeById = async (id) => {
  const { rows } = await pool.query(
    `SELECT rmi.*, s.name AS supplier_name,
            u.full_name AS created_by_name
     FROM raw_material_intakes rmi
     JOIN suppliers s ON s.id = rmi.supplier_id
     LEFT JOIN users u ON u.id = rmi.created_by
     WHERE rmi.id = $1`,
    [id]
  );
  return rows[0] || null;
};

export const checkDuplicateDeliveryNote = async (factory_id, supplier_id, delivery_note_number) => {
  const { rows } = await pool.query(
    `SELECT id FROM raw_material_intakes
     WHERE factory_id = $1 AND supplier_id = $2 AND delivery_note_number = $3`,
    [factory_id, supplier_id, delivery_note_number]
  );
  return rows[0] || null;
};

export const insertIntake = async ({
  factory_id, supplier_id, material_type, material_source, material_status,
  net_weight_kg, eligible_input_percent, intake_date, delivery_note_number,
  data_entry_profile, location_status, notes, created_by,
}) => {
  const { rows } = await pool.query(
    `WITH ins AS (
       INSERT INTO raw_material_intakes
         (factory_id, supplier_id, material_type, material_source, material_status,
          net_weight_kg, eligible_input_percent, intake_date, delivery_note_number,
          data_entry_profile, location_status, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *
     )
     SELECT ins.*, s.name AS supplier_name, u.full_name AS created_by_name
     FROM ins
     JOIN suppliers s ON s.id = ins.supplier_id
     LEFT JOIN users u ON u.id = ins.created_by`,
    [
      factory_id, supplier_id, material_type, material_source, material_status,
      net_weight_kg, eligible_input_percent ?? 100, intake_date, delivery_note_number,
      data_entry_profile || null, location_status || null, notes || null,
      created_by || null,
    ]
  );
  return rows[0];
};

export const updateIntakeById = async (id, fields) => {
  const setClauses = [];
  const params = [];
  let idx = 1;

  if (fields.material_type         !== undefined) { setClauses.push(`material_type         = $${idx++}`); params.push(fields.material_type);         }
  if (fields.material_source       !== undefined) { setClauses.push(`material_source       = $${idx++}`); params.push(fields.material_source);       }
  if (fields.material_status       !== undefined) { setClauses.push(`material_status       = $${idx++}`); params.push(fields.material_status);       }
  if (fields.net_weight_kg         !== undefined) { setClauses.push(`net_weight_kg         = $${idx++}`); params.push(fields.net_weight_kg);         }
  if (fields.eligible_input_percent !== undefined) { setClauses.push(`eligible_input_percent = $${idx++}`); params.push(fields.eligible_input_percent); }
  if (fields.intake_date           !== undefined) { setClauses.push(`intake_date           = $${idx++}`); params.push(fields.intake_date);           }
  if (fields.data_entry_profile    !== undefined) { setClauses.push(`data_entry_profile    = $${idx++}`); params.push(fields.data_entry_profile);    }
  if (fields.location_status       !== undefined) { setClauses.push(`location_status       = $${idx++}`); params.push(fields.location_status);       }
  if (fields.notes                 !== undefined) { setClauses.push(`notes                 = $${idx++}`); params.push(fields.notes);                 }

  if (!setClauses.length) return null;

  params.push(id);
  const { rows } = await pool.query(
    `WITH upd AS (
       UPDATE raw_material_intakes
       SET ${setClauses.join(', ')}, updated_at = now()
       WHERE id = $${idx}
       RETURNING *
     )
     SELECT upd.*, s.name AS supplier_name
     FROM upd
     JOIN suppliers s ON s.id = upd.supplier_id`,
    params
  );
  return rows[0] || null;
};
