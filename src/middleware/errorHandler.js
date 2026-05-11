export const errorHandler = (err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    error: {
      code: err.code || 'internal-server-error',
      message: err.message || 'An unexpected error occurred',
      details: err.details || {},
      trace_id: req.id || null,
    },
  });
};
