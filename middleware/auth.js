// This file checks that a request has a valid login token before letting it
// reach a protected route. The token is sent by the frontend in the
// "Authorization" header, in the form: Bearer <token>

const jwt = require('jsonwebtoken');

// Middleware that only lets the request through if it has a valid ADMIN token
function requireAdmin(req, res, next) {
  // Read the Authorization header from the incoming request
  const authHeader = req.headers.authorization;

  // If there is no header, or it doesn't start with "Bearer ", reject the request
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Please log in as admin first' });
  }

  // Pull just the token part out of "Bearer <token>"
  const token = authHeader.split(' ')[1];

  try {
    // Verify the token is genuine and not expired, using our secret key
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Make sure this token was issued for an admin, not a student
    if (decoded.role !== 'admin') {
      return res.status(401).json({ message: 'Please log in as admin first' });
    }

    // Attach the admin's id to the request so later route handlers can use it
    req.adminId = decoded.id;

    // Let the request continue to the actual route handler
    next();
  } catch (err) {
    // The token was missing, invalid, or expired
    res.status(401).json({ message: 'Your session has expired. Please log in again.' });
  }
}

// Middleware that only lets the request through if it has a valid STUDENT token
function requireStudent(req, res, next) {
  // Read the Authorization header from the incoming request
  const authHeader = req.headers.authorization;

  // If there is no header, or it doesn't start with "Bearer ", reject the request
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Please log in first' });
  }

  // Pull just the token part out of "Bearer <token>"
  const token = authHeader.split(' ')[1];

  try {
    // Verify the token is genuine and not expired, using our secret key
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Make sure this token was issued for a student, not an admin
    if (decoded.role !== 'student') {
      return res.status(401).json({ message: 'Please log in first' });
    }

    // Attach the student's id to the request so later route handlers can use it
    req.studentId = decoded.id;

    // Let the request continue to the actual route handler
    next();
  } catch (err) {
    // The token was missing, invalid, or expired
    res.status(401).json({ message: 'Your session has expired. Please log in again.' });
  }
}

module.exports = { requireAdmin, requireStudent };
