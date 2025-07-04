// middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Assuming you use User model for verification

exports.protect = async (req, res, next) => {
  let token;

  console.log('Backend Auth Middleware: Incoming Headers:', req.headers); // Log all headers
  console.log('Backend Auth Middleware: Authorization Header:', req.headers.authorization); // Log specific header

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];
      console.log('Backend Auth Middleware: Extracted Token:', token ? 'Token extracted' : 'Token extraction failed'); // Log extracted token

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('Backend Auth Middleware: Decoded Token:', decoded); // Log decoded payload

      req.user = await User.findById(decoded.id).select('-password');
      req.email = decoded.email; // Assuming email is in token payload
      console.log('Backend Auth Middleware: User attached to request:', req.user.email);

      next();
    } catch (err) {
      console.error('Backend Auth Middleware: Token verification failed:', err.message); // Log specific error from JWT verification
      return res.status(401).json({ message: 'Not authorized, token invalid' }); // More specific error message
    }
  }

  if (!token) {
    console.log('Backend Auth Middleware: No token found after header check.'); // Log if token is still missing
    return res.status(401).json({ message: 'No token found' });
  }
};

exports.requireAdmin = (req, res, next) => {
  console.log("Backend Auth Middleware: req.user in requireAdmin:", req.user);
  if (req.user && req.user.role === 'admin') {
    return next();
  } else {
    return res.status(403).json({ message: 'Admin access required' });
  }
};