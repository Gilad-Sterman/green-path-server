import pool from '../../db/client.js';

export const listDocuments = async ({
  factory_id, uploader_id, document_type, status, ocr_status,
  related_entity_type, related_entity_id,
  limit = 50, offset = 0,
}) => {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (factory_id          !== undefined) { conditions.push(`factory_id          = $${idx++}`); params.push(factory_id);          }
  if (uploader_id         !== undefined) { conditions.push(`uploader_id         = $${idx++}`); params.push(uploader_id);         }
  if (document_type       !== undefined) { conditions.push(`document_type       = $${idx++}`); params.push(document_type);       }
  if (status              !== undefined) { conditions.push(`status              = $${idx++}`); params.push(status);              }
  if (ocr_status          !== undefined) { conditions.push(`ocr_status          = $${idx++}`); params.push(ocr_status);          }
  if (related_entity_type !== undefined) { conditions.push(`related_entity_type = $${idx++}`); params.push(related_entity_type); }
  if (related_entity_id   !== undefined) { conditions.push(`related_entity_id   = $${idx++}`); params.push(related_entity_id);   }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT d.*, u.full_name AS uploader_name
     FROM documents d
     JOIN users u ON u.id = d.uploader_id
     ${where}
     ORDER BY d.uploaded_at DESC
     LIMIT $${idx++} OFFSET $${idx}`,
    [...params, limit, offset]
  );
  return rows;
};

export const getDocumentById = async (id) => {
  const { rows } = await pool.query(
    `SELECT d.*, u.full_name AS uploader_name
     FROM documents d
     JOIN users u ON u.id = d.uploader_id
     WHERE d.id = $1`,
    [id]
  );
  return rows[0] || null;
};

export const insertDocument = async ({
  factory_id, uploader_id, document_type, file_url, file_name,
  related_entity_type, related_entity_id, capture_method, location_status,
}) => {
  const { rows } = await pool.query(
    `INSERT INTO documents
       (factory_id, uploader_id, document_type, file_url, file_name,
        related_entity_type, related_entity_id, capture_method, location_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      factory_id, uploader_id, document_type, file_url, file_name || null,
      related_entity_type || null, related_entity_id || null,
      capture_method || null, location_status || null,
    ]
  );
  return rows[0];
};

export const linkDocumentsToEntity = async (ids, entity_type, entity_id, factory_id) => {
  if (!ids?.length) return;
  await pool.query(
    `UPDATE documents
     SET related_entity_type = $1, related_entity_id = $2, updated_at = now()
     WHERE id = ANY($3::uuid[]) AND factory_id = $4`,
    [entity_type, entity_id, ids, factory_id]
  );
};

export const updateDocumentById = async (id, fields) => {
  const setClauses = [];
  const params = [];
  let idx = 1;

  if (fields.status           !== undefined) { setClauses.push(`status           = $${idx++}`); params.push(fields.status);           }
  if (fields.ocr_status       !== undefined) { setClauses.push(`ocr_status       = $${idx++}`); params.push(fields.ocr_status);       }
  if (fields.raw_ocr_payload  !== undefined) { setClauses.push(`raw_ocr_payload  = $${idx++}`); params.push(fields.raw_ocr_payload);  }
  if (fields.review_note      !== undefined) { setClauses.push(`review_note      = $${idx++}`); params.push(fields.review_note);      }

  if (!setClauses.length) return null;

  params.push(id);
  const { rows } = await pool.query(
    `UPDATE documents
     SET ${setClauses.join(', ')}, updated_at = now()
     WHERE id = $${idx}
     RETURNING *`,
    params
  );
  return rows[0] || null;
};
