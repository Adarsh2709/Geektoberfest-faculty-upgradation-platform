/**
 * creditController.js
 *
 *   GET /api/credits/my-credits  → getMyCredits
 *
 * Rules:
 * - Faculty can only view their own credit history.
 * - Response includes a running total for the dashboard.
 * - Credits are awarded automatically by creditCalculator.js on course completion.
 *   Faculty cannot manually create credits via API.
 */

const Credit = require('../models/Credit');
const User = require('../models/User');

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get credit history + total for the authenticated faculty
// @route   GET /api/credits/my-credits
// @access  Protected (faculty)
// ─────────────────────────────────────────────────────────────────────────────
const getMyCredits = async (req, res, next) => {
  try {
    const credits = await Credit.find({ faculty: req.user._id })
      .populate('course', 'title category thumbnail')
      .populate('issuedBy', 'name email')
      .sort({ awardedAt: -1 });

    // Calculate running total
    const totalCredits = credits.reduce((sum, c) => sum + c.creditsEarned, 0);

    return res.status(200).json({
      success: true,
      totalCredits,
      count: credits.length,
      credits,
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Admin manually awards or adjusts faculty credits
// @route   POST /api/credits/admin/adjust
// @access  Protected (admin)
// ─────────────────────────────────────────────────────────────────────────────
const adjustCredits = async (req, res, next) => {
  try {
    const { facultyId, creditsEarned, reason, type } = req.body;

    if (!facultyId) {
      return res.status(400).json({ success: false, message: 'facultyId is required' });
    }

    const numCredits = Number(creditsEarned);
    if (isNaN(numCredits) || numCredits === 0) {
      return res.status(400).json({ success: false, message: 'creditsEarned must be a non-zero number' });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: 'Reason for credit adjustment is required' });
    }

    const facultyUser = await User.findById(facultyId);
    if (!facultyUser) {
      return res.status(404).json({ success: false, message: 'Faculty member not found' });
    }

    const creditType = type || (numCredits > 0 ? 'admin_bonus' : 'admin_adjustment');

    const credit = await Credit.create({
      faculty: facultyId,
      creditsEarned: numCredits,
      type: creditType,
      issuedBy: req.user._id,
      reason: reason.trim(),
      note: reason.trim(),
    });

    // Compute updated total for this faculty member
    const allCredits = await Credit.find({ faculty: facultyId });
    const totalCredits = allCredits.reduce((sum, c) => sum + c.creditsEarned, 0);

    return res.status(201).json({
      success: true,
      message: 'Credit adjustment successfully recorded',
      credit,
      totalCredits,
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Admin view full credit ledger across all faculty
// @route   GET /api/credits/admin/all
// @access  Protected (admin)
// ─────────────────────────────────────────────────────────────────────────────
const getAllCreditsAdmin = async (req, res, next) => {
  try {
    const credits = await Credit.find()
      .populate('faculty', 'name email department')
      .populate('course', 'title category')
      .populate('issuedBy', 'name email')
      .sort({ awardedAt: -1 });

    return res.status(200).json({
      success: true,
      count: credits.length,
      credits,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getMyCredits, adjustCredits, getAllCreditsAdmin };

