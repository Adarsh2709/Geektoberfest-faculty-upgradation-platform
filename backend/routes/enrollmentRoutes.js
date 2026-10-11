/**
 * enrollmentRoutes.js
 *
 * IMPORTANT — route ordering matters here.
 * '/my-courses' must be registered BEFORE '/:id' otherwise Express
 * will treat the literal string "my-courses" as an :id parameter.
 *
 *   POST /api/enrollments/:courseId          → enrollInCourse   (protect)
 *   GET  /api/enrollments/my-courses         → getMyEnrollments (protect)
 *   GET  /api/enrollments/:id                → getEnrollmentById (protect)
 *   PUT  /api/enrollments/:id/progress       → updateProgress   (protect)
 */

const express = require('express');
const {
  enrollInCourse,
  getMyEnrollments,
  getEnrollmentById,
  updateProgress,
  getEnrollmentCertificate,
} = require('../controllers/enrollmentController');
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

// Enroll in a course — courseId as path param to keep semantics clear
router.post('/:courseId', protect, enrollInCourse);

// List enrollments — must come before /:id
router.get('/my-courses', protect, getMyEnrollments);

// Download certificate — specific sub-path on :id
router.get('/:id/certificate', protect, getEnrollmentCertificate);

// Single enrollment
router.get('/:id', protect, getEnrollmentById);

// Update progress
router.put('/:id/progress', protect, updateProgress);

module.exports = router;
