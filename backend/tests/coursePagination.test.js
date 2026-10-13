/**
 * coursePagination.test.js — Tests for Course Pagination (GET /api/courses?page=X&limit=Y)
 *
 * Runs with Node.js built-in test runner:
 *   node --test tests/*.test.js
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const app = require('../server');
const User = require('../models/User');
const Course = require('../models/Course');

describe('Course Pagination Endpoint Tests (GET /api/courses)', () => {
  let server;
  let baseUrl;
  const JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_for_tests';
  process.env.JWT_SECRET = JWT_SECRET;

  const facultyUserId = new mongoose.Types.ObjectId();
  const facultyToken = jwt.sign({ id: facultyUserId.toString() }, JWT_SECRET);

  let originalUserFindById;
  let originalCourseFind;
  let originalCourseCountDocuments;

  const mockCourses = Array.from({ length: 8 }, (_, i) => ({
    _id: new mongoose.Types.ObjectId(),
    title: `Course ${i + 1}`,
    description: `Description ${i + 1}`,
    category: 'Computer Science',
    difficulty: 'beginner',
    isPublished: true,
    isActive: true,
    createdBy: { _id: new mongoose.Types.ObjectId(), name: 'Admin', email: 'admin@example.com' },
  }));

  before(async () => {
    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    originalUserFindById = User.findById;
    originalCourseFind = Course.find;
    originalCourseCountDocuments = Course.countDocuments;

    User.findById = function () {
      return {
        select: () =>
          Promise.resolve({
            _id: facultyUserId,
            name: 'Faculty User',
            role: 'faculty',
            isActive: true,
          }),
      };
    };
  });

  after(async () => {
    User.findById = originalUserFindById;
    Course.find = originalCourseFind;
    Course.countDocuments = originalCourseCountDocuments;
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('returns paginated response with total, totalPages, and currentPage', async () => {
    Course.countDocuments = () => Promise.resolve(mockCourses.length);

    Course.find = function () {
      let skipCount = 0;
      let limitCount = mockCourses.length;

      const chain = {
        select: () => chain,
        populate: () => chain,
        sort: () => chain,
        skip: (n) => {
          skipCount = n;
          return chain;
        },
        limit: (n) => {
          limitCount = n;
          return chain;
        },
        then: (resolve) => {
          resolve(mockCourses.slice(skipCount, skipCount + limitCount));
        },
      };
      return chain;
    };

    const res = await fetch(`${baseUrl}/api/courses?page=1&limit=3`, {
      headers: { Authorization: `Bearer ${facultyToken}` },
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.count, 3);
    assert.equal(body.total, 8);
    assert.equal(body.totalPages, 3);
    assert.equal(body.currentPage, 1);
    assert.equal(body.courses.length, 3);
    assert.equal(body.courses[0].title, 'Course 1');
  });

  it('fetches page 2 correctly with proper offset', async () => {
    Course.countDocuments = () => Promise.resolve(mockCourses.length);

    Course.find = function () {
      let skipCount = 0;
      let limitCount = mockCourses.length;

      const chain = {
        select: () => chain,
        populate: () => chain,
        sort: () => chain,
        skip: (n) => {
          skipCount = n;
          return chain;
        },
        limit: (n) => {
          limitCount = n;
          return chain;
        },
        then: (resolve) => {
          resolve(mockCourses.slice(skipCount, skipCount + limitCount));
        },
      };
      return chain;
    };

    const res = await fetch(`${baseUrl}/api/courses?page=2&limit=3`, {
      headers: { Authorization: `Bearer ${facultyToken}` },
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.count, 3);
    assert.equal(body.currentPage, 2);
    assert.equal(body.courses[0].title, 'Course 4');
  });

  it('returns empty array when requested page exceeds totalPages', async () => {
    Course.countDocuments = () => Promise.resolve(mockCourses.length);

    Course.find = function () {
      let skipCount = 0;
      let limitCount = mockCourses.length;

      const chain = {
        select: () => chain,
        populate: () => chain,
        sort: () => chain,
        skip: (n) => {
          skipCount = n;
          return chain;
        },
        limit: (n) => {
          limitCount = n;
          return chain;
        },
        then: (resolve) => {
          resolve(mockCourses.slice(skipCount, skipCount + limitCount));
        },
      };
      return chain;
    };

    const res = await fetch(`${baseUrl}/api/courses?page=99&limit=3`, {
      headers: { Authorization: `Bearer ${facultyToken}` },
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.count, 0);
    assert.equal(body.currentPage, 99);
    assert.equal(body.courses.length, 0);
  });
});
