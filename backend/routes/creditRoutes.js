/**
 * creditRoutes.js
 *
 *   GET /api/credits/my-credits  → getMyCredits (protect)
 */

const express = require('express');
const { getMyCredits, adjustCredits, getAllCreditsAdmin } = require('../controllers/creditController');
const { protect } = require('../middlewares/authMiddleware');
const { authorise } = require('../middlewares/roleMiddleware');

const router = express.Router();

router.get('/my-credits', protect, getMyCredits);
router.post('/admin/adjust', protect, authorise('admin'), adjustCredits);
router.get('/admin/all', protect, authorise('admin'), getAllCreditsAdmin);

module.exports = router;
