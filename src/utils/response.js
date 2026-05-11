export const success = (res, data = {}, meta = {}, status = 200) => {
  return res.status(status).json({ success: true, data, meta });
};

export const error = (res, code, message, status = 400, details = {}) => {
  return res.status(status).json({
    success: false,
    error: { code, message, details },
  });
};
