import { getFactoryById } from "../factories/queries.js";
import { insertGeofenceLog } from "./queries.js";

 
const EARTH_RADIUS_M = 6_371_000;
 
/**
 * Haversine formula — returns distance in metres between two lat/lng points.
 * Pure math, no external API calls.
 */
const haversineDistanceMeters = (lat1, lng1, lat2, lng2) => {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};
 
/**
 * Resolves a location_status string from the user's coordinates and the
 * factory's stored geofence. Writes a geofence_log row regardless of outcome.
 *
 * Returns 'unknown' (non-blocking) when:
 *   - lat/lng were not provided by the client
 *   - the factory has no geofence_center configured
 *   - the factory has no geofence_radius_meters configured
 *
 * @param {object} params
 * @param {string}      params.factory_id
 * @param {string|null} params.user_id
 * @param {string}      params.action       - audit label, e.g. 'intake.create'
 * @param {number|null} params.lat          - from client (may be null/undefined)
 * @param {number|null} params.lng          - from client (may be null/undefined)
 *
 * @returns {Promise<'in_factory'|'out_of_factory'|'unknown'>}
 */
export const checkAndLogGeofence = async ({ factory_id, user_id, action, lat, lng }) => {
  let location_status = 'unknown';
 
  try {
    // Coordinates must be present and numeric to attempt a check
    const hasCoords = lat != null && lng != null && !isNaN(lat) && !isNaN(lng);
 
    if (hasCoords) {
      const factory = await getFactoryById(factory_id);
      const center = factory?.geofence_center;       // { lat, lng }
      const radius = factory?.geofence_radius_meters;
 
      if (center?.lat != null && center?.lng != null && radius > 0) {
        const distanceM = haversineDistanceMeters(
          parseFloat(lat), parseFloat(lng),
          parseFloat(center.lat), parseFloat(center.lng)
        );
        location_status = distanceM <= radius ? 'in_factory' : 'out_of_factory';
      }
      // else: geofence not configured → stays 'unknown'
    }
    // else: no coords supplied → stays 'unknown'
 
    // Always write the log, even for 'unknown' — it's part of the audit trail
    insertGeofenceLog({
      factory_id,
      user_id:         user_id || null,
      action,
      lat:             hasCoords ? lat  : 0,
      lng:             hasCoords ? lng  : 0,
      location_status,
    }).catch(() => {
      // Log failure is non-blocking — never propagate to the caller
    });
  } catch {
    // Geofence check failure is non-blocking — intake must still succeed
    location_status = 'unknown';
  }
 
  return location_status;
};
 