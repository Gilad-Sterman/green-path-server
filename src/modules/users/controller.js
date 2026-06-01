import { success, error } from '../../utils/response.js';
import * as usersService from './service.js';

// POST /api/users/me/deactivate
export const deactivateSelf = async (req, res, next) => {
  try {
    await usersService.deactivateSelf(req.user.user_id);
    res.clearCookie('refreshToken', { httpOnly: true, sameSite: 'lax', path: '/' });
    return success(res, null);
  } catch (err) {
    next(err);
  }
};

// GET /api/users/me
export const getMe = async (req, res, next) => {
  try {
    const user = await usersService.getMe(req.user.user_id);
    return success(res, { user });
  } catch (err) {
    if (err.status) return error(res, 'user-error', err.message, err.status);
    next(err);
  }
};

// GET /api/users
export const listUsers = async (req, res, next) => {
  try {
    const users = await usersService.getUsers(req.user, req.query);
    return success(res, { users, count: users.length });
  } catch (err) {
    next(err);
  }
};

// POST /api/users
export const createUser = async (req, res, next) => {
  try {
    const user = await usersService.createUser(req.user, req.body);
    return success(res, { user }, {}, 201);
  } catch (err) {
    if (err.status) return error(res, 'user-error', err.message, err.status);
    next(err);
  }
};

// GET /api/users/:id
export const getUser = async (req, res, next) => {
  try {
    const user = await usersService.getMe(req.params.id);
    return success(res, { user });
  } catch (err) {
    if (err.status) return error(res, 'user-error', err.message, err.status);
    next(err);
  }
};

// PATCH /api/users/:id
export const updateUser = async (req, res, next) => {
  try {
    const user = await usersService.updateUser(req.user, req.params.id, req.body);
    if (!user) return error(res, 'no-changes', 'No valid fields provided to update.', 400);
    return success(res, { user });
  } catch (err) {
    if (err.status) return error(res, 'user-error', err.message, err.status);
    next(err);
  }
};

// PATCH /api/users/:id/deactivate
export const deactivateUser = async (req, res, next) => {
  try {
    const user = await usersService.deactivateUser(req.user, req.params.id);
    return success(res, { user });
  } catch (err) {
    if (err.status) return error(res, 'user-error', err.message, err.status);
    next(err);
  }
};

// PATCH /api/users/:id/reactivate
export const reactivateUser = async (req, res, next) => {
  try {
    const user = await usersService.reactivateUser(req.user, req.params.id);
    return success(res, { user });
  } catch (err) {
    if (err.status) return error(res, 'user-error', err.message, err.status);
    next(err);
  }
};

// DELETE /api/users/:id
export const deleteUser = async (req, res, next) => {
  try {
    await usersService.deleteUser(req.user, req.params.id);
    return success(res, { deleted: true });
  } catch (err) {
    if (err.status) return error(res, 'user-error', err.message, err.status);
    next(err);
  }
};
