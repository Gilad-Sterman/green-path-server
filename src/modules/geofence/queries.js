import pool from '../../db/client.js';
 
/**
 * Persists a geofence check result.
 * Called by the geofence service on every action that requires location tracking.
 *
 * @param {object} params
 * @param {string} params.factory_id
 * @param {string|null} params.user_id
 * @param {string} params.action        - e.g. 'intake.create'
 * @param {number} params.lat
 * @param {number} params.lng
 * @param {'in_factory'|'out_of_factory'|'unknown'} params.location_status
 * @returns {Promise<object>} - the inserted row
 */
export const insertGeofenceLog = async ({ factory_id, user_id, action, lat, lng, location_status }) => {
  const { rows } = await pool.query(
    `INSERT INTO geofence_logs (factory_id, user_id, action, lat, lng, location_status)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [factory_id, user_id || null, action, lat, lng, location_status]
  );
  return rows[0];
};