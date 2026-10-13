/**
 * adminStats.test.js — Admin Analytics Dashboard & Metrics Aggregation Tests
 *
 * Runs with Node.js built-in test runner:
 *   npm test (or node --test tests/*.test.js)
 */

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const app = require('../server');
const User = require('../models/User');
const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const Credit = require('../models/Credit');

describe('Admin Analytics Dashboard Endpoint Tests (GET /api/admin/stats)', () => {
  let server;
  let baseUrl;
  const JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_for_tests';
  process.env.JWT_SECRET = JWT_SECRET;

  const adminId = new mongoose.Types.ObjectId();
  const facultyUserId = new mongoose.Types.ObjectId();

  const adminToken = jwt.sign({ id: adminId.toString() }, JWT_SECRET);
  const facultyToken = jwt.sign({ id: facultyUserId.toString() }, JWT_SECRET);

  let isLiveDb = false;

  // In-memory data store for testing without live DB
  const store = {
    users: [],
    courses: [],
    enrollments: [],
    credits: [],
  };

  let originalUserFindById;
  let originalUserAggregate;
  let originalCourseAggregate;
  let originalEnrollmentAggregate;
  let originalCreditAggregate;

  before(async () => {
    // Check if live MongoDB connection is available
    if (process.env.MONGO_URI) {
      try {
        await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 1000 });
        isLiveDb = mongoose.connection.readyState === 1;
      } catch {
        isLiveDb = false;
      }
    }

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (isLiveDb) {
      await mongoose.disconnect();
    }
  });

  beforeEach(() => {
    store.users = [];
    store.courses = [];
    store.enrollments = [];
    store.credits = [];

    originalUserFindById = User.findById;
    originalUserAggregate = User.aggregate;
    originalCourseAggregate = Course.aggregate;
    originalEnrollmentAggregate = Enrollment.aggregate;
    originalCreditAggregate = Credit.aggregate;

    // Stub User.findById for authentication middleware
    User.findById = (id) => {
      const idStr = id ? id.toString() : '';
      let foundUser;
      if (idStr === adminId.toString()) {
        foundUser = { _id: adminId, role: 'admin', isActive: true, name: 'Admin User' };
      } else if (idStr === facultyUserId.toString()) {
        foundUser = { _id: facultyUserId, role: 'faculty', isActive: true, name: 'Faculty User' };
      } else {
        foundUser = store.users.find((u) => u._id.toString() === idStr);
      }
      return {
        select() {
          return Promise.resolve(foundUser || null);
        },
      };
    };

    // If no live DB, wire in-memory aggregation stubs
    if (!isLiveDb) {
      User.aggregate = async () => {
        const facultyUsers = store.users.filter((u) => u.role === 'faculty');
        const total = facultyUsers.length;
        const active = facultyUsers.filter((u) => u.isActive !== false).length;
        return total > 0 ? [{ total, active }] : [];
      };

      Course.aggregate = async () => {
        const total = store.courses.length;
        const published = store.courses.filter((c) => c.isPublished === true).length;
        const draft = store.courses.filter((c) => c.isPublished !== true).length;
        return total > 0 ? [{ total, published, draft }] : [];
      };

      Enrollment.aggregate = async () => {
        const total = store.enrollments.length;
        const completedList = store.enrollments.filter((e) => e.status === 'completed');
        const stats = total > 0 ? [{ total, completed: completedList.length }] : [];

        // Category breakdown
        const categoryMap = new Map();
        for (const e of store.enrollments) {
          const course = store.courses.find((c) => c._id.toString() === e.course.toString());
          const cat = (course && course.category) || 'General';
          categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1);
        }
        const categoryEnrollments = Array.from(categoryMap.entries())
          .map(([category, enrollments]) => ({ category, enrollments }))
          .sort((a, b) => b.enrollments - a.enrollments);

        // Department credits
        const deptMap = new Map();
        for (const e of completedList) {
          const course = store.courses.find((c) => c._id.toString() === e.course.toString());
          const faculty = store.users.find((u) => u._id.toString() === e.faculty.toString());
          const dept = (faculty && faculty.department) || 'Unassigned';
          const credits = (course && course.credits) || 0;
          deptMap.set(dept, (deptMap.get(dept) || 0) + credits);
        }
        const departmentCredits = Array.from(deptMap.entries())
          .map(([department, credits]) => ({ department, credits }))
          .sort((a, b) => b.credits - a.credits);

        return [
          {
            stats,
            categoryEnrollments,
            departmentCredits,
          },
        ];
      };

      Credit.aggregate = async () => [];
    }
  });

  afterEach(async () => {
    User.findById = originalUserFindById;
    User.aggregate = originalUserAggregate;
    Course.aggregate = originalCourseAggregate;
    Enrollment.aggregate = originalEnrollmentAggregate;
    Credit.aggregate = originalCreditAggregate;

    if (isLiveDb) {
      await User.deleteMany({});
      await Course.deleteMany({});
      await Enrollment.deleteMany({});
      await Credit.deleteMany({});
    }
  });

  it('Test 1: should return accurate metrics and aggregates for seeded data', async () => {
    // 1. Seed 3 faculty: 2 active (CSE), 1 inactive (ECE)
    const f1Id = new mongoose.Types.ObjectId();
    const f2Id = new mongoose.Types.ObjectId();
    const f3Id = new mongoose.Types.ObjectId();

    const facultyList = [
      { _id: f1Id, role: 'faculty', department: 'Computer Science', isActive: true },
      { _id: f2Id, role: 'faculty', department: 'Computer Science', isActive: true },
      { _id: f3Id, role: 'faculty', department: 'Electronics', isActive: false },
    ];

    // 2. Seed 4 courses: 3 published, 1 draft across 2 categories
    const c1Id = new mongoose.Types.ObjectId();
    const c2Id = new mongoose.Types.ObjectId();
    const c3Id = new mongoose.Types.ObjectId();
    const c4Id = new mongoose.Types.ObjectId();

    const courseList = [
      { _id: c1Id, title: 'AI Intro', category: 'Technology', credits: 4, isPublished: true },
      { _id: c2Id, title: 'Cloud DevOps', category: 'Technology', credits: 3, isPublished: true },
      { _id: c3Id, title: 'Leadership', category: 'Management', credits: 2, isPublished: true },
      { _id: c4Id, title: 'Draft Strategy', category: 'Management', credits: 5, isPublished: false },
    ];

    // 3. Seed 5 enrollments: 2 completed
    const enrollmentList = [
      { _id: new mongoose.Types.ObjectId(), faculty: f1Id, course: c1Id, status: 'completed' }, // +4 CSE, Tech
      { _id: new mongoose.Types.ObjectId(), faculty: f2Id, course: c2Id, status: 'completed' }, // +3 CSE, Tech
      { _id: new mongoose.Types.ObjectId(), faculty: f1Id, course: c3Id, status: 'in-progress' }, // Mgmt
      { _id: new mongoose.Types.ObjectId(), faculty: f3Id, course: c1Id, status: 'enrolled' }, // Tech
      { _id: new mongoose.Types.ObjectId(), faculty: f2Id, course: c4Id, status: 'enrolled' }, // Mgmt
    ];

    if (isLiveDb) {
      await User.create([
        { _id: adminId, role: 'admin', isActive: true, email: 'admin@test.com', password: 'password', name: 'Admin' },
        ...facultyList.map((f, i) => ({ ...f, email: `f${i}@test.com`, password: 'password', name: `Faculty ${i}` })),
      ]);
      await Course.create(courseList);
      await Enrollment.create(enrollmentList);
    } else {
      store.users.push(...facultyList);
      store.courses.push(...courseList);
      store.enrollments.push(...enrollmentList);
    }

    const res = await fetch(`${baseUrl}/api/admin/stats`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });

    assert.equal(res.status, 200, 'Should return HTTP 200 OK');
    const data = await res.json();
    assert.equal(data.success, true);

    const stats = data.data || data;

    // Faculty asserts: 3 total, 2 active => 66.7%
    assert.equal(stats.faculty.total, 3, 'Total faculty count should be 3');
    assert.equal(stats.faculty.active, 2, 'Active faculty count should be 2');
    assert.equal(stats.faculty.activePercentage, 66.7, 'Active faculty percentage should be 66.7%');

    // Courses asserts: 4 total, 3 published, 1 draft
    assert.equal(stats.courses.total, 4, 'Total courses count should be 4');
    assert.equal(stats.courses.published, 3, 'Published courses count should be 3');
    assert.equal(stats.courses.draft, 1, 'Draft courses count should be 1');

    // Enrollments asserts: 5 total, 2 completed => 40%
    assert.equal(stats.enrollments.total, 5, 'Total enrollments should be 5');
    assert.equal(stats.enrollments.completed, 2, 'Completed enrollments should be 2');
    assert.equal(stats.enrollments.completionPercentage, 40, 'Completion percentage should be 40%');

    // Department credits: Computer Science has 4 + 3 = 7 credits
    assert.ok(Array.isArray(stats.departmentCredits), 'departmentCredits should be an array');
    const cseDept = stats.departmentCredits.find((d) => d.department === 'Computer Science');
    assert.ok(cseDept, 'Computer Science department should be present in credits');
    assert.equal(cseDept.credits, 7, 'Computer Science should have 7 credits');

    // Category enrollments: Technology: 3, Management: 2
    assert.ok(Array.isArray(stats.categoryEnrollments), 'categoryEnrollments should be an array');
    const techCategory = stats.categoryEnrollments.find((c) => c.category === 'Technology');
    const mgmtCategory = stats.categoryEnrollments.find((c) => c.category === 'Management');
    assert.ok(techCategory, 'Technology category should be present');
    assert.equal(techCategory.enrollments, 3, 'Technology category should have 3 enrollments');
    assert.ok(mgmtCategory, 'Management category should be present');
    assert.equal(mgmtCategory.enrollments, 2, 'Management category should have 2 enrollments');
  });

  it('Test 2: should return 401 for unauthenticated request and 403 for non-admin user', async () => {
    // 1. Unauthenticated request (no token)
    const unauthRes = await fetch(`${baseUrl}/api/admin/stats`);
    assert.equal(unauthRes.status, 401, 'Unauthenticated request must return 401');
    const unauthData = await unauthRes.json();
    assert.equal(unauthData.success, false);

    // 2. Non-admin request (role=faculty)
    const nonAdminRes = await fetch(`${baseUrl}/api/admin/stats`, {
      headers: {
        Authorization: `Bearer ${facultyToken}`,
      },
    });
    assert.equal(nonAdminRes.status, 403, 'Non-admin request must return 403');
    const nonAdminData = await nonAdminRes.json();
    assert.equal(nonAdminData.success, false);
    assert.match(nonAdminData.message, /Access denied/);
  });

  it('Test 3: should return zeros and empty arrays with status 200 for empty database', async () => {
    // Database is empty (no faculty, courses, enrollments)
    const res = await fetch(`${baseUrl}/api/admin/stats`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });

    assert.equal(res.status, 200, 'Should return HTTP 200 for empty database');
    const data = await res.json();
    assert.equal(data.success, true);

    const stats = data.data || data;

    assert.equal(stats.faculty.total, 0);
    assert.equal(stats.faculty.activePercentage, 0);
    assert.equal(stats.courses.total, 0);
    assert.equal(stats.courses.published, 0);
    assert.equal(stats.courses.draft, 0);
    assert.equal(stats.enrollments.total, 0);
    assert.equal(stats.enrollments.completed, 0);
    assert.equal(stats.enrollments.completionPercentage, 0);
    assert.deepEqual(stats.departmentCredits, []);
    assert.deepEqual(stats.categoryEnrollments, []);
  });
});
