import pool from '../db/client.js';

/**
 * Fire-and-forget audit log writer.
 * Never throws — a logging failure must never break the main request.
 *
 * @param {object} entry
 * @param {string}  entry.action       e.g. 'intake.created', 'shipment.status_changed'
 * @param {string}  entry.entity_type  e.g. 'intake', 'shipment'
 * @param {string}  [entry.entity_id]
 * @param {string}  [entry.factory_id]
 * @param {string}  [entry.user_id]
 * @param {object}  [entry.old_value]
 * @param {object}  [entry.new_value]
 * @param {string}  [entry.ip_address]
 * @param {string}  [entry.user_agent]
 */
export const logAudit = ({ action, entity_type, entity_id, factory_id, user_id, old_value, new_value, ip_address, user_agent }) => {
  pool.query(
    `INSERT INTO audit_log
       (factory_id, user_id, action, entity_type, entity_id, old_value, new_value, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::inet, $9)`,
    [
      factory_id  || null,
      user_id     || null,
      action,
      entity_type,
      entity_id   || null,
      old_value   ? JSON.stringify(old_value) : null,
      new_value   ? JSON.stringify(new_value) : null,
      ip_address  || null,
      user_agent  || null,
    ]
  ).catch((err) => {
    console.error('[audit] Failed to write audit log:', err.message);
  });
};
