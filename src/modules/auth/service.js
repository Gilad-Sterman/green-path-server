import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import {
  insertOtp,
  cleanupOldOtps,
  findLatestPendingOtp,
  markOtpUsed,
  incrementOtpAttempts,
  findUserByPhone,
  updateUserLastLogin,
  insertRefreshToken,
  findRefreshTokenRecord,
  revokeRefreshToken,
} from './queries.js';

const OTP_EXPIRY_MINUTES = 10;
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_EXPIRY_DAYS = 7;
const REFRESH_EXPIRY_REMEMBER_ME_DAYS = 30;
const MAX_OTP_ATTEMPTS = 5;

const generateOtpCode = () => String(Math.floor(100000 + Math.random() * 900000));

const generateAccessToken = ({ id, factory_id, role, factory_status }) =>
  jwt.sign(
    { user_id: id, factory_id, role, factory_status: factory_status || null },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );

export const sendOtp = async (phone_number) => {
  if (!/^\+[1-9]\d{6,14}$/.test(phone_number)) {
    const err = new Error('Invalid phone number. Use international format, e.g. +972501234567');
    err.status = 400;
    throw err;
  }

  const user = await findUserByPhone(phone_number);
  if (!user) {
    const err = new Error('No active account found for this number. Contact your manager to get set up.');
    err.status = 404;
    throw err;
  }

  await cleanupOldOtps(phone_number);

  const bypassEnabled = process.env.OTP_BYPASS === 'true';

  const code = bypassEnabled ? '000000' : generateOtpCode();
  const expires_at = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
  await insertOtp(phone_number, code, expires_at);

  if (bypassEnabled) {
    console.log(`\n[OTP BYPASS] ${phone_number} → 000000\n`);
    return;
  }

  const devMode = process.env.NODE_ENV !== 'production' || !process.env.TWILIO_ACCOUNT_SID;

  if (devMode) {
    console.log(`\n🔑 [DEV OTP] ${phone_number} → ${code}  (valid ${OTP_EXPIRY_MINUTES}min)\n`);
  } else {
    const twilio = (await import('twilio')).default;
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({
      body: `Your GreenPath code is: ${code}. Valid for ${OTP_EXPIRY_MINUTES} minutes.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone_number,
    });
  }
};

export const verifyOtp = async (phone_number, code, remember_me = false) => {
  const user = await findUserByPhone(phone_number);
  if (!user) {
    const err = new Error('No active account found for this phone number.');
    err.status = 404;
    throw err;
  }

  const otp = await findLatestPendingOtp(phone_number);
  if (!otp) {
    const err = new Error('No valid OTP found. Please request a new code.');
    err.status = 401;
    throw err;
  }

  if (otp.attempts >= MAX_OTP_ATTEMPTS) {
    const err = new Error('Too many failed attempts. Please request a new OTP.');
    err.status = 429;
    throw err;
  }

  if (otp.code !== code) {
    await incrementOtpAttempts(otp.id);
    const err = new Error('Invalid OTP code.');
    err.status = 401;
    throw err;
  }

  await markOtpUsed(otp.id);
  await updateUserLastLogin(user.id);

  const accessToken = generateAccessToken(user);

  const expiryDays = remember_me ? REFRESH_EXPIRY_REMEMBER_ME_DAYS : REFRESH_EXPIRY_DAYS;
  const refreshToken = uuidv4();
  const refreshExpiry = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);
  await insertRefreshToken(user.id, refreshToken, refreshExpiry, remember_me);

  return {
    accessToken,
    refreshToken,
    refreshExpiry,
    user: {
      id: user.id,
      full_name: user.full_name,
      phone_number: user.phone_number,
      role: user.role,
      factory_id: user.factory_id,
      factory_name: user.factory_name,
      factory_status: user.factory_status || null,
    },
  };
};

export const refreshAccessToken = async (refreshToken) => {
  const record = await findRefreshTokenRecord(refreshToken);
  if (!record) {
    const err = new Error('Invalid or expired refresh token.');
    err.status = 401;
    throw err;
  }
  if (!record.is_active) {
    const err = new Error('Account is inactive.');
    err.status = 403;
    throw err;
  }

  const accessToken = generateAccessToken({
    id:             record.user_id,
    factory_id:     record.factory_id,
    role:           record.role,
    factory_status: record.factory_status || null,
  });

  // Rotate: revoke current token, issue a fresh one
  await revokeRefreshToken(refreshToken);
  const newToken    = uuidv4();
  const expiryDays  = record.remember_me ? REFRESH_EXPIRY_REMEMBER_ME_DAYS : REFRESH_EXPIRY_DAYS;
  const newExpiry   = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);
  await insertRefreshToken(record.user_id, newToken, newExpiry, record.remember_me ?? false);

  return { accessToken, refreshToken: newToken, refreshExpiry: newExpiry };
};

export const logout = async (refreshToken) => {
  if (refreshToken) await revokeRefreshToken(refreshToken);
};
