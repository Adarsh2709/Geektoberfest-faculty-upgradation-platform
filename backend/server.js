/**
 * server.js — Application Entry Point
 *
 * Bootstraps the Express application:
 *  1. Load environment variables
 *  2. Connect to MongoDB
 *  3. Register global middleware
 *  4. Mount API routes
 *  5. Global error handler
 *  6. Start HTTP server
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const hpp = require('hpp');
const connectDB = require('./config/db');
const errorHandler = require('./middlewares/errorHandler');
const healthRoutes      = require('./routes/healthRoutes');
const authRoutes        = require('./routes/authRoutes');
const facultyRoutes     = require('./routes/facultyRoutes');
const courseRoutes      = require('./routes/courseRoutes');
const enrollmentRoutes  = require('./routes/enrollmentRoutes');
const creditRoutes      = require('./routes/creditRoutes');
const achievementRoutes = require('./routes/achievementRoutes');
const adminRoutes       = require('./routes/adminRoutes');


// ─── App Setup ────────────────────────────────────────────────────────────
const app = express();

// ─── Global Middleware ────────────────────────────────────────────────────
app.use(
  helmet({
    frameguard: { action: 'deny' },
  })
);

app.use(
  cors({
    origin: (origin, callback) => {
      if (process.env.NODE_ENV === 'production') {
        if (!origin || origin === process.env.CLIENT_URL) {
          return callback(null, true);
        }
        return callback(null, false);
      }
      return callback(null, process.env.CLIENT_URL || 'http://localhost:5173');
    },
    credentials: true,
  })
);

// Parse incoming JSON request bodies
app.use(express.json());

// Parse URL-encoded form data
app.use(express.urlencoded({ extended: false }));

// Prevent HTTP parameter pollution
app.use(hpp());

// General rate limiter: max 100 requests per 1-minute window per IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', apiLimiter);

// Login rate limiter: strict limit of 5 failed attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    message: 'Too many login attempts, please try again after 15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.loginLimiter = loginLimiter;
app.apiLimiter = apiLimiter;

// ─── API Routes ───────────────────────────────────────────────────────────
// Routes are added here as each phase is implemented.
// Format: app.use('/api/<resource>', require('./routes/<resource>Routes'));

app.use('/api/health',       healthRoutes);      // Phase 1 — foundation
app.use('/api/auth/login',   loginLimiter);      // Login rate limiter
app.use('/api/auth',         authRoutes);        // Phase 2 — authentication
app.use('/api/faculty',      facultyRoutes);     // Phase 4 — faculty profile
app.use('/api/courses',      courseRoutes);      // Phase 4 — course catalogue
app.use('/api/enrollments',  enrollmentRoutes);  // Phase 4 — enrollment & progress
app.use('/api/credits',      creditRoutes);      // Phase 4 — credit history
app.use('/api/achievements', achievementRoutes); // Phase 4 — achievements
app.use('/api/admin',        adminRoutes);       // Phase 6 — admin analytics & management

// ─── 404 Handler (unmatched routes) ──────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// ─── Global Error Handler ─────────────────────────────────────────────────
// Must be last middleware — receives errors forwarded via next(err)
app.use(errorHandler);

// ─── Start Server ─────────────────────────────────────────────────────────
if (require.main === module) {
  connectDB();
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚀  Server running on http://localhost:${PORT}`);
    console.log(`📋  Health check: http://localhost:${PORT}/api/health`);
    console.log(`🌍  Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

module.exports = app;
