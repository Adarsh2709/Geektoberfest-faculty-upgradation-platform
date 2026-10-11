/**
 * enrollmentController.js
 *
 *   POST /api/enrollments/:courseId     → enrollInCourse
 *   GET  /api/enrollments/my-courses    → getMyEnrollments
 *   GET  /api/enrollments/:id           → getEnrollmentById
 *   PUT  /api/enrollments/:id/progress  → updateProgress
 *
 * Rules:
 * - Duplicate enrollment rejected (409).
 * - Faculty can only access their own enrollments.
 * - Progress update accepts an array of completed module IDs.
 * - When all modules are completed → status = 'completed', credits awarded.
 */

const Enrollment = require('../models/Enrollment');
const Course = require('../models/Course');
const { awardCreditsAndCheckAchievements } = require('../utils/creditCalculator');
const { generateVerificationId, buildCertificatePdf } = require('../utils/certificate');

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Enroll the authenticated faculty in a course
// @route   POST /api/enrollments/:courseId
// @access  Protected (faculty)
// ─────────────────────────────────────────────────────────────────────────────
const enrollInCourse = async (req, res, next) => {
  try {
    const { courseId } = req.params;

    // 1. Verify course exists and is available
    const course = await Course.findById(courseId);
    if (!course || !course.isActive || !course.isPublished) {
      return res.status(404).json({ success: false, message: 'Course not found or not available' });
    }

    // 2. Prevent duplicate enrollment — the model has a unique index on (faculty, course)
    const existing = await Enrollment.findOne({
      faculty: req.user._id,
      course: courseId,
    });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'You are already enrolled in this course',
      });
    }

    // 3. Create enrollment
    const enrollment = await Enrollment.create({
      faculty: req.user._id,
      course: courseId,
      status: 'enrolled',
    });

    return res.status(201).json({
      success: true,
      message: `Successfully enrolled in "${course.title}"`,
      enrollment,
    });
  } catch (error) {
    // Catch the MongoDB duplicate key error as a fallback
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'You are already enrolled in this course',
      });
    }
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get all enrollments for the authenticated faculty
// @route   GET /api/enrollments/my-courses
// @access  Protected (faculty)
// ─────────────────────────────────────────────────────────────────────────────
const getMyEnrollments = async (req, res, next) => {
  try {
    const enrollments = await Enrollment.find({ faculty: req.user._id })
      .populate('course', 'title description category difficulty duration credits thumbnail instructor')
      .sort({ enrolledAt: -1 });

    return res.status(200).json({
      success: true,
      count: enrollments.length,
      enrollments,
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get a single enrollment by ID (faculty must own it)
// @route   GET /api/enrollments/:id
// @access  Protected (faculty)
// ─────────────────────────────────────────────────────────────────────────────
const getEnrollmentById = async (req, res, next) => {
  try {
    const enrollment = await Enrollment.findById(req.params.id).populate(
      'course',
      'title description category difficulty duration credits thumbnail modules instructor'
    );

    if (!enrollment) {
      return res.status(404).json({ success: false, message: 'Enrollment not found' });
    }

    // Ownership check — faculty can only view their own enrollment
    if (enrollment.faculty.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied — this enrollment does not belong to you',
      });
    }

    return res.status(200).json({ success: true, enrollment });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Update progress — accepts array of completed module IDs
// @route   PUT /api/enrollments/:id/progress
// @access  Protected (faculty)
//
// Body: { completedModules: ["moduleId1", "moduleId2", ...] }
//
// Progress % = completedModules.length / course.modules.length * 100
// If progress === 100 → status = 'completed', credits awarded automatically
// ─────────────────────────────────────────────────────────────────────────────
const updateProgress = async (req, res, next) => {
  try {
    const enrollment = await Enrollment.findById(req.params.id);

    if (!enrollment) {
      return res.status(404).json({ success: false, message: 'Enrollment not found' });
    }

    // Ownership check
    if (enrollment.faculty.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied — this enrollment does not belong to you',
      });
    }

    // Cannot update progress on a dropped or already-completed enrollment
    if (enrollment.status === 'dropped') {
      return res.status(400).json({
        success: false,
        message: 'Cannot update progress on a dropped enrollment',
      });
    }
    if (enrollment.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'This course is already completed',
      });
    }

    // Validate the completedModules array
    const { completedModules } = req.body;
    if (!Array.isArray(completedModules)) {
      return res.status(400).json({
        success: false,
        message: 'completedModules must be an array of module IDs',
      });
    }

    // Fetch the course to get total module count and validate module IDs
    const course = await Course.findById(enrollment.course).select('modules credits title');
    if (!course) {
      return res.status(404).json({ success: false, message: 'Associated course not found' });
    }

    const validModuleIds = course.modules.map((m) => m._id.toString());
    const filtered = completedModules.filter((id) => validModuleIds.includes(id.toString()));

    // Calculate new progress percentage
    const totalModules = course.modules.length;
    const newProgress = totalModules > 0
      ? Math.round((filtered.length / totalModules) * 100)
      : 0;

    // Update fields
    enrollment.completedModules = filtered;
    enrollment.progress = newProgress;

    // Determine status transition
    if (newProgress > 0 && enrollment.status === 'enrolled') {
      enrollment.status = 'in-progress';
    }

    let creditResult = null;

    // Auto-complete when all modules are done
    if (totalModules > 0 && filtered.length === totalModules) {
      enrollment.status = 'completed';
      enrollment.completedAt = new Date();

      // Award credits and check achievements
      creditResult = await awardCreditsAndCheckAchievements(
        req.user._id,
        enrollment,
        course
      );
    }

    await enrollment.save();

    return res.status(200).json({
      success: true,
      message: enrollment.status === 'completed'
        ? `🎉 Course completed! ${course.credits} credits awarded.`
        : 'Progress updated',
      enrollment,
      ...(creditResult && {
        creditsAwarded: creditResult.credit.creditsEarned,
        newAchievements: creditResult.newAchievements,
      }),
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Download course completion certificate PDF
// @route   GET /api/enrollments/:id/certificate
// @access  Protected (faculty)
// ─────────────────────────────────────────────────────────────────────────────
const getEnrollmentCertificate = async (req, res, next) => {
  try {
    const enrollment = await Enrollment.findById(req.params.id)
      .populate('course')
      .populate('faculty', 'name email department designation');

    if (!enrollment) {
      return res.status(404).json({ success: false, message: 'Enrollment not found' });
    }

    // Ownership check — faculty can only access their own certificate
    const facultyId = enrollment.faculty?._id ? enrollment.faculty._id.toString() : enrollment.faculty?.toString();
    if (facultyId !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied — this enrollment does not belong to you',
      });
    }

    // Status check — certificate only for completed courses
    if (enrollment.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Certificate is only available for completed courses',
      });
    }

    const course = enrollment.course || {};
    const facultyUser = enrollment.faculty || req.user || {};
    const completionDate = enrollment.completedAt || enrollment.updatedAt || new Date();

    const verificationId = generateVerificationId({
      enrollmentId: enrollment._id.toString(),
      facultyId: req.user._id.toString(),
      courseId: (course._id || enrollment.course)?.toString(),
      completionDate,
    });

    const pdfBuffer = await buildCertificatePdf({
      facultyName: facultyUser.name || req.user.name || 'Faculty Member',
      courseTitle: course.title || 'Course',
      provider: course.provider || '',
      instructor: course.instructor || '',
      credits: course.credits ?? 0,
      completionDate,
      verificationId,
    });

    const safeSlug = (course.title || 'course')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'course';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="certificate-${safeSlug}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    return res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  enrollInCourse,
  getMyEnrollments,
  getEnrollmentById,
  updateProgress,
  getEnrollmentCertificate,
};
