/**
 * Credit Model
 *
 * Each document represents a credit-earning event for a faculty member.
 * Keeping credits as separate documents (rather than a field on User)
 * allows full credit history, auditing, and admin-issued adjustments.
 */

const mongoose = require('mongoose');

const creditSchema = new mongoose.Schema(
  {
    faculty: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Faculty reference is required'],
    },
    // The enrollment that triggered this credit award (null for manual admin awards)
    enrollment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Enrollment',
      default: null,
    },
    // The course associated with this credit (for display purposes)
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      default: null,
    },
    creditsEarned: {
      type: Number,
      required: [true, 'Credits earned value is required'],
    },
    type: {
      type: String,
      enum: ['auto_course', 'admin_bonus', 'admin_adjustment'],
      default: 'auto_course',
    },
    issuedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reason: {
      type: String,
      trim: true,
      default: '',
    },
    // Human-readable note explaining why credits were awarded
    note: {
      type: String,
      trim: true,
      default: '',
    },
    awardedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Credit', creditSchema);
