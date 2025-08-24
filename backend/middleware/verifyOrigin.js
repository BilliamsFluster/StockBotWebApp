export const verifyOrigin = (req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigin = process.env.FRONTEND_URL;

  if (!origin || origin === allowedOrigin) {
    return next();
  }

  return res.status(403).json({ message: 'Forbidden origin' });
};

