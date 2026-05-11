import { success, error } from '../../utils/response.js';
import * as authService from './service.js';

const REFRESH_COOKIE = 'refreshToken';

const refreshCookieOptions = (expires) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/',
  ...(expires && { expires }),
});

// POST /api/auth/send-otp
// Body: { phone_number }
export const sendOtp = async (req, res, next) => {
  try {
    const { phone_number } = req.body;

    if (!phone_number) {
      return error(res, 'validation-error', 'phone_number is required');
    }
    if (!/^\+[1-9]\d{6,14}$/.test(phone_number)) {
      return error(res, 'validation-error', 'phone_number must be E.164 format (e.g. +972501234567)');
    }

    await authService.sendOtp(phone_number);
    return success(res, null, {});
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/verify-otp
// Body: { phone_number, code, remember_me? }
export const verifyOtp = async (req, res, next) => {
  try {
    const { phone_number, code, remember_me } = req.body;

    if (!phone_number || !code) {
      return error(res, 'validation-error', 'phone_number and code are required');
    }

    const result = await authService.verifyOtp(phone_number, String(code), remember_me);

    res.cookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions(result.refreshExpiry));

    return success(res, { accessToken: result.accessToken, user: result.user });
  } catch (err) {
    if (err.status) return error(res, 'auth-error', err.message, err.status);
    next(err);
  }
};

// POST /api/auth/refresh
// Cookie: refreshToken
export const refresh = async (req, res, next) => {
  try {
    const refreshToken = req.cookies[REFRESH_COOKIE];
    if (!refreshToken) {
      return error(res, 'auth-error', 'No refresh token provided', 401);
    }

    const result = await authService.refreshAccessToken(refreshToken);
    res.cookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions(result.refreshExpiry));
    return success(res, { accessToken: result.accessToken });
  } catch (err) {
    if (err.status) return error(res, 'auth-error', err.message, err.status);
    next(err);
  }
};

// POST /api/auth/logout
// Cookie: refreshToken
export const logout = async (req, res, next) => {
  try {
    const refreshToken = req.cookies[REFRESH_COOKIE];
    await authService.logout(refreshToken);
    res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
    return success(res, null, {});
  } catch (err) {
    next(err);
  }
};
