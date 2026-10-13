/**
 * facultyController.js
 *
 *   GET /api/faculty/profile  → getProfile
 *   PUT /api/faculty/profile  → updateProfile
 *
 * Rules:
 * - Faculty can only view/update their own profile.
 * - role and password cannot be changed here.
 * - Only whitelisted fields are accepted on update.
 */

const User = require('../models/User');

// Fields a faculty member is allowed to update on their own profile
const ALLOWED_UPDATE_FIELDS = ['name', 'department', 'designation', 'profilePicture'];

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get the authenticated faculty member's profile
// @route   GET /api/faculty/profile
// @access  Protected (faculty)
// ─────────────────────────────────────────────────────────────────────────────
const getProfile = async (req, res, next) => {
  try {
    // req.user is already attached by authMiddleware without password
    const user = await User.findById(req.user._id).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.status(200).json({ success: true, profile: user });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Update the authenticated faculty member's profile
// @route   PUT /api/faculty/profile
// @access  Protected (faculty)
// ─────────────────────────────────────────────────────────────────────────────
const updateProfile = async (req, res, next) => {
  try {
    // Build an update object from only whitelisted fields
    const updates = {};
    for (const field of ALLOWED_UPDATE_FIELDS) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: `No updatable fields provided. Allowed fields: ${ALLOWED_UPDATE_FIELDS.join(', ')}`,
      });
    }

    if (updates.name !== undefined) {
      if (typeof updates.name !== 'string' || !updates.name.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Name cannot be empty',
        });
      }
      updates.name = updates.name.trim();
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password');


    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      profile: user,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getProfile, updateProfile };
