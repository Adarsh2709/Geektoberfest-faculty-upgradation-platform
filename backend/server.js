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
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  })
);

// Parse incoming JSON request bodies
app.use(express.json());

// Parse URL-encoded form data
app.use(express.urlencoded({ extended: false }));

// ─── API Routes ───────────────────────────────────────────────────────────
// Routes are added here as each phase is implemented.
// Format: app.use('/api/<resource>', require('./routes/<resource>Routes'));

app.use('/api/health',       healthRoutes);      // Phase 1 — foundation
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
