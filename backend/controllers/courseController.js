/**
 * courseController.js
 *
 *   GET    /api/courses        → getCourses       (faculty: published only; admin: all)
 *   GET    /api/courses/:id    → getCourseById
 *   POST   /api/courses        → createCourse     (admin only)
 *   PUT    /api/courses/:id    → updateCourse     (admin only)
 *   DELETE /api/courses/:id    → deleteCourse     (admin only — soft delete via isActive)
 */

const Course = require('../models/Course');

// ─────────────────────────────────────────────────────────────────────────────
// @desc    List courses — faculty sees published+active only; admin sees all
// @route   GET /api/courses
// @access  Protected
// Query params: category, difficulty, search (title/description text match)
// ─────────────────────────────────────────────────────────────────────────────
const getCourses = async (req, res, next) => {
  try {
    const { category, difficulty, search } = req.query;

    // Base filter
    const filter = {};

    // Faculty can only see published, active courses
    if (req.user.role !== 'admin') {
      filter.isPublished = true;
      filter.isActive = true;
    }

    if (category) filter.category = { $regex: category, $options: 'i' };
    if (difficulty) filter.difficulty = difficulty;
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { instructor: { $regex: search, $options: 'i' } },
      ];
    }

    const pageNum = Math.max(1, parseInt(req.query.page, 10) || 1);
    const hasPagination = req.query.page !== undefined || req.query.limit !== undefined;
    const limitNum = hasPagination
      ? Math.max(1, parseInt(req.query.limit, 10) || 9)
      : 0;

    const total = await Course.countDocuments(filter);
    const totalPages = limitNum > 0 ? Math.ceil(total / limitNum) || 1 : 1;

    let query = Course.find(filter)
      .select('-modules') // modules fetched only on single-course detail
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    if (limitNum > 0) {
      query = query.skip((pageNum - 1) * limitNum).limit(limitNum);
    }

    const courses = await query;

    return res.status(200).json({
      success: true,
      count: courses.length,
      total,
      totalPages,
      currentPage: pageNum,
      courses,
    });
  } catch (error) {
    next(error);
  }
};


// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get a single course with its full module list
// @route   GET /api/courses/:id
// @access  Protected
// ─────────────────────────────────────────────────────────────────────────────
const getCourseById = async (req, res, next) => {
  try {
    const course = await Course.findById(req.params.id).populate('createdBy', 'name email');

    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    // Faculty cannot see inactive/unpublished courses
    if (req.user.role !== 'admin' && (!course.isActive || !course.isPublished)) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    return res.status(200).json({ success: true, course });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Create a new course (admin only)
// @route   POST /api/courses
// @access  Protected + Admin
// ─────────────────────────────────────────────────────────────────────────────
const createCourse = async (req, res, next) => {
  try {
    const {
      title, description, category, instructor, provider,
      difficulty, duration, credits, tags, thumbnail,
      externalUrl, modules, isPublished,
    } = req.body;

    if (!title) {
      return res.status(400).json({ success: false, message: 'Course title is required' });
    }

    const course = await Course.create({
      title,
      description,
      category,
      instructor,
      provider,
      difficulty,
      duration,
      credits,
      tags,
      thumbnail,
      externalUrl,
      modules: modules || [],
      isPublished: isPublished || false,
      createdBy: req.user._id,
    });

    return res.status(201).json({
      success: true,
      message: 'Course created successfully',
      course,
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Update a course (admin only)
// @route   PUT /api/courses/:id
// @access  Protected + Admin
// ─────────────────────────────────────────────────────────────────────────────
const updateCourse = async (req, res, next) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    // Whitelist updatable fields — createdBy is never overwritten
    const UPDATABLE = [
      'title', 'description', 'category', 'instructor', 'provider',
      'difficulty', 'duration', 'credits', 'tags', 'thumbnail',
      'externalUrl', 'modules', 'isPublished', 'isActive',
    ];

    const updates = {};
    for (const field of UPDATABLE) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    const updated = await Course.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    return res.status(200).json({
      success: true,
      message: 'Course updated successfully',
      course: updated,
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Soft-delete a course (sets isActive = false; admin only)
// @route   DELETE /api/courses/:id
// @access  Protected + Admin
// ─────────────────────────────────────────────────────────────────────────────
const deleteCourse = async (req, res, next) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    course.isActive = false;
    await course.save();

    return res.status(200).json({
      success: true,
      message: 'Course deactivated successfully',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getCourses, getCourseById, createCourse, updateCourse, deleteCourse };
