/**
 * adminController.js
 *
 * Handles administrator dashboard metrics aggregation:
 *
 *   GET /api/admin/stats  → getAdminStats
 *
 * Computes institutional metrics:
 *  1. Faculty counts and active percentage
 *  2. Course counts (total, published, draft)
 *  3. Enrollment counts and completion percentage
 *  4. Department-wise credits distribution
 *  5. Category-wise enrollment breakdown
 */

const User = require('../models/User');
const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const Credit = require('../models/Credit');

const getAdminStats = async (req, res, next) => {
  try {
    // 1. Faculty Stats: total faculty and active count
    const facultyFacetPromise = User.aggregate([
      { $match: { role: 'faculty' } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] } },
        },
      },
    ]);

    // 2. Course Stats: total courses, published vs draft
    const courseFacetPromise = Course.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          published: { $sum: { $cond: [{ $eq: ['$isPublished', true] }, 1, 0] } },
          draft: { $sum: { $cond: [{ $eq: ['$isPublished', false] }, 1, 0] } },
        },
      },
    ]);

    // 3. Enrollment Stats, Category Breakdown & Department Credits ($facet)
    const enrollmentFacetPromise = Enrollment.aggregate([
      {
        $facet: {
          stats: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
              },
            },
          ],
          categoryEnrollments: [
            {
              $lookup: {
                from: 'courses',
                localField: 'course',
                foreignField: '_id',
                as: 'courseDoc',
              },
            },
            { $unwind: '$courseDoc' },
            {
              $group: {
                _id: { $ifNull: ['$courseDoc.category', 'General'] },
                enrollments: { $sum: 1 },
              },
            },
            { $sort: { enrollments: -1 } },
            {
              $project: {
                _id: 0,
                category: '$_id',
                enrollments: 1,
              },
            },
          ],
          departmentCredits: [
            { $match: { status: 'completed' } },
            {
              $lookup: {
                from: 'courses',
                localField: 'course',
                foreignField: '_id',
                as: 'courseDoc',
              },
            },
            { $unwind: '$courseDoc' },
            {
              $lookup: {
                from: 'users',
                localField: 'faculty',
                foreignField: '_id',
                as: 'facultyDoc',
              },
            },
            { $unwind: '$facultyDoc' },
            {
              $group: {
                _id: { $ifNull: ['$facultyDoc.department', 'Unassigned'] },
                credits: { $sum: { $ifNull: ['$courseDoc.credits', 0] } },
              },
            },
            { $sort: { credits: -1 } },
            {
              $project: {
                _id: 0,
                department: '$_id',
                credits: 1,
              },
            },
          ],
        },
      },
    ]);

    const [facultyRes, courseRes, enrollmentRes] = await Promise.all([
      facultyFacetPromise,
      courseFacetPromise,
      enrollmentFacetPromise,
    ]);

    // Faculty counts & percentage
    const facultyData = facultyRes[0] || { total: 0, active: 0 };
    const facultyTotal = facultyData.total || 0;
    const facultyActive = facultyData.active || 0;
    const facultyActivePercentage =
      facultyTotal === 0 ? 0 : Math.round((facultyActive / facultyTotal) * 100 * 10) / 10;

    // Course counts
    const courseData = courseRes[0] || { total: 0, published: 0, draft: 0 };
    const courseTotal = courseData.total || 0;
    const coursePublished = courseData.published || 0;
    const courseDraft = courseData.draft || 0;

    // Enrollment counts & completion percentage
    const enrollmentData = enrollmentRes[0] || {
      stats: [],
      categoryEnrollments: [],
      departmentCredits: [],
    };
    const enrollStats = (enrollmentData.stats && enrollmentData.stats[0]) || {
      total: 0,
      completed: 0,
    };
    const enrollmentTotal = enrollStats.total || 0;
    const enrollmentCompleted = enrollStats.completed || 0;
    const enrollmentCompletionPercentage =
      enrollmentTotal === 0 ? 0 : Math.round((enrollmentCompleted / enrollmentTotal) * 100 * 10) / 10;

    let departmentCredits = enrollmentData.departmentCredits || [];

    // Fallback: if departmentCredits from completed enrollments is empty, check Credit collection
    if (departmentCredits.length === 0) {
      const creditDocs = await Credit.aggregate([
        {
          $lookup: {
            from: 'users',
            localField: 'faculty',
            foreignField: '_id',
            as: 'facultyDoc',
          },
        },
        { $unwind: '$facultyDoc' },
        {
          $group: {
            _id: { $ifNull: ['$facultyDoc.department', 'Unassigned'] },
            credits: { $sum: { $ifNull: ['$creditsEarned', 0] } },
          },
        },
        { $sort: { credits: -1 } },
        {
          $project: {
            _id: 0,
            department: '$_id',
            credits: 1,
          },
        },
      ]);
      if (creditDocs.length > 0) {
        departmentCredits = creditDocs;
      }
    }

    const categoryEnrollments = enrollmentData.categoryEnrollments || [];

    const stats = {
      faculty: {
        total: facultyTotal,
        totalCount: facultyTotal,
        active: facultyActive,
        activeCount: facultyActive,
        activePercentage: facultyActivePercentage,
      },
      courses: {
        total: courseTotal,
        totalCount: courseTotal,
        published: coursePublished,
        publishedCount: coursePublished,
        draft: courseDraft,
        draftCount: courseDraft,
      },
      enrollments: {
        total: enrollmentTotal,
        totalCount: enrollmentTotal,
        completed: enrollmentCompleted,
        completedCount: enrollmentCompleted,
        completionPercentage: enrollmentCompletionPercentage,
      },
      departmentCredits,
      categoryEnrollments,
    };

    return res.status(200).json({
      success: true,
      ...stats,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getAdminStats };
