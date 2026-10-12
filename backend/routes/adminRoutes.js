/**
 * adminRoutes.js
 *
 * Mounts administrative endpoints under /api/admin.
 * All routes are guarded by protect + authorise('admin').
 *
 *   GET /api/admin/stats  → getAdminStats
 */

const express = require('express');
const { getAdminStats } = require('../controllers/adminController');
const { protect } = require('../middlewares/authMiddleware');
const { authorise } = require('../middlewares/roleMiddleware');

const router = express.Router();

router.get('/stats', protect, authorise('admin'), getAdminStats);

module.exports = router;
