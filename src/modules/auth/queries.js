import pool from '../../db/client.js';

export const insertOtp = async (phone_number, code, expires_at) => {
  const { rows } = await pool.query(
    `INSERT INTO otp_codes (phone_number, code, expires_at)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [phone_number, code, expires_at]
  );
  return rows[0];
};

export const cleanupOldOtps = async (phone_number) => {
  await pool.query(
    `DELETE FROM otp_codes
     WHERE phone_number = $1 AND (used = true OR expires_at < now())`,
    [phone_number]
  );
};

// Finds the latest pending OTP without checking the code — code is verified in the service layer
export const findLatestPendingOtp = async (phone_number) => {
  const { rows } = await pool.query(
    `SELECT * FROM otp_codes
     WHERE phone_number = $1
       AND used = false
       AND expires_at > now()
     ORDER BY created_at DESC
     LIMIT 1`,
    [phone_number]
  );
  return rows[0] || null;
};

export const markOtpUsed = async (id) => {
  await pool.query(`UPDATE otp_codes SET used = true WHERE id = $1`, [id]);
};

export const incrementOtpAttempts = async (id) => {
  await pool.query(
    `UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1`,
    [id]
  );
};

export const findUserByPhone = async (phone_number) => {
  const { rows } = await pool.query(
    `SELECT u.*, f.name AS factory_name
     FROM users u
     LEFT JOIN factories f ON f.id = u.factory_id
     WHERE u.phone_number = $1 AND u.is_active = true`,
    [phone_number]
  );
  return rows[0] || null;
};

export const updateUserLastLogin = async (user_id) => {
  await pool.query(
    `UPDATE users SET last_login_at = now() WHERE id = $1`,
    [user_id]
  );
};

export const insertRefreshToken = async (user_id, token, expires_at, remember_me) => {
  const { rows } = await pool.query(
    `INSERT INTO refresh_tokens (user_id, token, expires_at, remember_me)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [user_id, token, expires_at, remember_me]
  );
  return rows[0];
};

// Returns the token record joined with the user's key fields for building a new access token
export const findRefreshTokenRecord = async (token) => {
  const { rows } = await pool.query(
    `SELECT rt.*, u.id AS user_id, u.factory_id, u.role, u.full_name,
            u.phone_number, u.is_active
     FROM refresh_tokens rt
     JOIN users u ON u.id = rt.user_id
     WHERE rt.token = $1
       AND rt.revoked = false
       AND rt.expires_at > now()`,
    [token]
  );
  return rows[0] || null;
};

export const revokeRefreshToken = async (token) => {
  await pool.query(
    `UPDATE refresh_tokens SET revoked = true WHERE token = $1`,
    [token]
  );
};
