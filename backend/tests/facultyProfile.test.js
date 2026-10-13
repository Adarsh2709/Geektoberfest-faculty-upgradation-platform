/**
 * facultyProfile.test.js — Tests for Faculty Profile Endpoints (GET/PUT /api/faculty/profile)
 *
 * Runs with Node.js built-in test runner:
 *   node --test tests/*.test.js
 */

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const app = require('../server');
const User = require('../models/User');

describe('Faculty Profile Endpoint Tests (GET/PUT /api/faculty/profile)', () => {
  let server;
  let baseUrl;
  const JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_for_tests';
  process.env.JWT_SECRET = JWT_SECRET;

  const facultyUserId = new mongoose.Types.ObjectId();
  const facultyToken = jwt.sign({ id: facultyUserId.toString() }, JWT_SECRET);

  let originalUserFindById;
  let originalUserFindByIdAndUpdate;

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
    originalUserFindByIdAndUpdate = User.findByIdAndUpdate;
  });

  after(async () => {
    User.findById = originalUserFindById;
    User.findByIdAndUpdate = originalUserFindByIdAndUpdate;
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('rejects unauthenticated GET /api/faculty/profile with 401', async () => {
    const res = await fetch(`${baseUrl}/api/faculty/profile`);
    assert.equal(res.status, 401);
  });

  it('rejects unauthenticated PUT /api/faculty/profile with 401', async () => {
    const res = await fetch(`${baseUrl}/api/faculty/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Dr. Jane' }),
    });
    assert.equal(res.status, 401);
  });

  it('returns faculty profile for authenticated user', async () => {
    User.findById = function (id) {
      return {
        select: () =>
          Promise.resolve({
            _id: facultyUserId,
            name: 'Dr. Alan Turing',
            email: 'alan@example.com',
            role: 'faculty',
            department: 'Computer Science',
            designation: 'Professor',
            isActive: true,
          }),
      };
    };

    const res = await fetch(`${baseUrl}/api/faculty/profile`, {
      headers: { Authorization: `Bearer ${facultyToken}` },
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.profile.name, 'Dr. Alan Turing');
    assert.equal(body.profile.department, 'Computer Science');
  });

  it('successfully updates whitelisted fields and returns updated user', async () => {
    let capturedUpdates = null;

    User.findById = function (id) {
      return {
        select: () =>
          Promise.resolve({
            _id: facultyUserId,
            name: 'Dr. Alan Turing',
            email: 'alan@example.com',
            role: 'faculty',
            isActive: true,
          }),
      };
    };

    User.findByIdAndUpdate = function (id, update, options) {
      capturedUpdates = update.$set;
      return {
        select: () =>
          Promise.resolve({
            _id: facultyUserId,
            name: update.$set.name,
            department: update.$set.department,
            designation: update.$set.designation,
            email: 'alan@example.com',
            role: 'faculty',
            isActive: true,
          }),
      };
    };

    const res = await fetch(`${baseUrl}/api/faculty/profile`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${facultyToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Dr. Alan M. Turing',
        department: 'Mathematics & Computing',
        designation: 'Distinguished Professor',
        role: 'admin', // Should be ignored / discarded
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.profile.name, 'Dr. Alan M. Turing');
    assert.equal(capturedUpdates.name, 'Dr. Alan M. Turing');
    assert.equal(capturedUpdates.department, 'Mathematics & Computing');
    assert.equal(capturedUpdates.role, undefined); // role is NOT whitelisted
  });

  it('rejects empty name update with 400', async () => {
    User.findById = function () {
      return {
        select: () => Promise.resolve({ _id: facultyUserId, role: 'faculty', isActive: true }),
      };
    };

    const res = await fetch(`${baseUrl}/api/faculty/profile`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${facultyToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: '   ' }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.match(body.message, /Name cannot be empty/i);
  });

  it('rejects update when no whitelisted fields are sent with 400', async () => {
    User.findById = function () {
      return {
        select: () => Promise.resolve({ _id: facultyUserId, role: 'faculty', isActive: true }),
      };
    };

    const res = await fetch(`${baseUrl}/api/faculty/profile`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${facultyToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: 'newemail@example.com' }), // non-whitelisted
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.match(body.message, /No updatable fields provided/i);
  });

});
