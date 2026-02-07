import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../utils/auth.js';

export const requireAuth = (req, res, next) => {
  try {
    // Get the token from the Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'You need to be logged in.' });
    }

    // Verify the token
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    // Add user info to request
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid session. Please log in again.' });
  }
};