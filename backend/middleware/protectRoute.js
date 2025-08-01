import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const JWT_SECRET = process.env.JWT_SECRET || 'yoursecretkey';

export const protectRoute = async (req, res, next) => {
  // Read token from cookies (requires cookie-parser middleware)
  const token = req.cookies?.token;
  
  if (!token) {
    
    return res.status(401).json({ message: 'No token, authorization denied' });
  }
  

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Attach user to request
    req.user = await User.findById(decoded.id).select('-password');
    
    if (!req.user) {
      return res.status(401).json({ message: 'User not found' });
    }

    next();
  } catch (err) {
    return res.status(401).json({ message: 'Token is not valid' });
  }
};
