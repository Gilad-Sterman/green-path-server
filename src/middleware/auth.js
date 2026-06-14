import jwt from 'jsonwebtoken';

export const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: { code: 'auth-missing-token', message: 'No token provided' } });
  }
  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    if (payload.factory_status === 'suspended' && payload.role !== 'internal_admin') {
      return res.status(403).json({ success: false, error: { code: 'factory-suspended', message: 'המפעל הושעה. פנה למנהל המערכת.' } });
    }
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: { code: 'auth-invalid-token', message: 'Invalid or expired token' } });
  }
};
