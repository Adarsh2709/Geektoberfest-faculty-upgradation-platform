/**
 * creditAdjustment.test.js — Tests for Admin Credit Adjustments and Ledger
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
const Credit = require('../models/Credit');

describe('Admin Credit Manual Adjustment Tests (POST /api/credits/admin/adjust)', () => {
  let server;
  let baseUrl;
  const JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_for_tests';
  process.env.JWT_SECRET = JWT_SECRET;

  const adminId = new mongoose.Types.ObjectId();
  const facultyUserId = new mongoose.Types.ObjectId();
  const studentUserId = new mongoose.Types.ObjectId();

  const adminToken = jwt.sign({ id: adminId.toString() }, JWT_SECRET);
  const facultyToken = jwt.sign({ id: facultyUserId.toString() }, JWT_SECRET);
  const studentToken = jwt.sign({ id: studentUserId.toString() }, JWT_SECRET);

  let creditsStore = [];

  let originalUserFindById;
  let originalUserFind;
  let originalCreditCreate;
  let originalCreditFind;

  before(async () => {
    // Start local HTTP server
    await new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    originalUserFindById = User.findById;
    originalUserFind = User.find;
    originalCreditCreate = Credit.create;
    originalCreditFind = Credit.find;

    // Stub User.findById for auth & faculty validation
    User.findById = function (id) {
      const idStr = id?.toString();
      const createObj = (userDoc) => ({
        ...userDoc,
        select: () => Promise.resolve(userDoc),
      });

      if (idStr === adminId.toString()) {
        return createObj({
          _id: adminId,
          name: 'Admin User',
          email: 'admin@test.edu',
          role: 'admin',
          isActive: true,
        });
      }
      if (idStr === facultyUserId.toString()) {
        return createObj({
          _id: facultyUserId,
          name: 'Faculty Member',
          email: 'faculty@test.edu',
          role: 'faculty',
          isActive: true,
        });
      }
      if (idStr === studentUserId.toString()) {
        return createObj({
          _id: studentUserId,
          name: 'Student User',
          email: 'student@test.edu',
          role: 'student',
          isActive: true,
        });
      }
      return { select: () => Promise.resolve(null) };
    };

    // Stub User.find
    User.find = function (query) {
      const facultyList = [
        {
          _id: facultyUserId,
          name: 'Faculty Member',
          email: 'faculty@test.edu',
          department: 'Computer Science',
          designation: 'Professor',
          role: 'faculty',
        },
      ];
      return {
        select: () => ({
          sort: () => Promise.resolve(facultyList),
        }),
      };
    };

    // Stub Credit.create
    Credit.create = async function (data) {
      const doc = {
        _id: new mongoose.Types.ObjectId(),
        ...data,
        awardedAt: new Date(),
      };
      creditsStore.push(doc);
      return doc;
    };

    // Stub Credit.find
    Credit.find = function (query) {
      const results = query?.faculty
        ? creditsStore.filter((c) => c.faculty.toString() === query.faculty.toString())
        : [...creditsStore];
      return Promise.resolve(results);
    };
  });

  after(async () => {
    User.findById = originalUserFindById;
    User.find = originalUserFind;
    Credit.create = originalCreditCreate;
    Credit.find = originalCreditFind;
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    creditsStore = [];
  });

  const request = async (method, path, body, token) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;

    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, body: json };
  };

  it('rejects unauthenticated requests with 401', async () => {
    const res = await request('POST', '/api/credits/admin/adjust', {
      facultyId: facultyUserId.toString(),
      creditsEarned: 2,
      reason: 'Workshop',
    });
    assert.equal(res.status, 401);
  });

  it('rejects non-admin users with 403', async () => {
    const res = await request(
      'POST',
      '/api/credits/admin/adjust',
      { facultyId: facultyUserId.toString(), creditsEarned: 2, reason: 'Workshop' },
      facultyToken
    );
    assert.equal(res.status, 403);
  });

  it('admin successfully awards bonus credits (positive value)', async () => {
    const res = await request(
      'POST',
      '/api/credits/admin/adjust',
      {
        facultyId: facultyUserId.toString(),
        creditsEarned: 3,
        reason: 'Keynote Speaker at AI Summit',
      },
      adminToken
    );

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.credit.creditsEarned, 3);
    assert.equal(res.body.credit.type, 'admin_bonus');
    assert.equal(res.body.credit.reason, 'Keynote Speaker at AI Summit');
    assert.equal(res.body.totalCredits, 3);
  });

  it('admin successfully records deduction adjustment (negative value)', async () => {
    // Seed initial credits
    creditsStore.push({
      _id: new mongoose.Types.ObjectId(),
      faculty: facultyUserId,
      creditsEarned: 5,
    });

    const res = await request(
      'POST',
      '/api/credits/admin/adjust',
      {
        facultyId: facultyUserId.toString(),
        creditsEarned: -2,
        reason: 'Revocation of duplicate credit entry',
      },
      adminToken
    );

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.credit.creditsEarned, -2);
    assert.equal(res.body.credit.type, 'admin_adjustment');
    assert.equal(res.body.totalCredits, 3);
  });

  it('rejects missing facultyId or empty reason with 400', async () => {
    const res1 = await request(
      'POST',
      '/api/credits/admin/adjust',
      { creditsEarned: 2, reason: 'Valid Reason' },
      adminToken
    );
    assert.equal(res1.status, 400);

    const res2 = await request(
      'POST',
      '/api/credits/admin/adjust',
      { facultyId: facultyUserId.toString(), creditsEarned: 2, reason: '   ' },
      adminToken
    );
    assert.equal(res2.status, 400);
  });

  it('rejects adjustment if target user does not have faculty role with 400', async () => {
    const res = await request(
      'POST',
      '/api/credits/admin/adjust',
      {
        facultyId: studentUserId.toString(),
        creditsEarned: 5,
        reason: 'Attempt on student',
      },
      adminToken
    );
    assert.equal(res.status, 400);
    assert.match(res.body.message, /faculty role/i);
  });

  it('derives credit type server-side and ignores client-supplied type', async () => {
    const res = await request(
      'POST',
      '/api/credits/admin/adjust',
      {
        facultyId: facultyUserId.toString(),
        creditsEarned: 4,
        type: 'auto_course',
        reason: 'Attempting to spoof auto_course type',
      },
      adminToken
    );
    assert.equal(res.status, 201);
    assert.equal(res.body.credit.type, 'admin_bonus');
  });

  it('allows admin to fetch faculty list (GET /api/faculty)', async () => {
    const res = await request('GET', '/api/faculty', null, adminToken);
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.faculty));
    assert.equal(res.body.faculty[0].name, 'Faculty Member');
  });

  it('rejects non-admin from fetching faculty list (GET /api/faculty) with 403', async () => {
    const res = await request('GET', '/api/faculty', null, facultyToken);
    assert.equal(res.status, 403);
  });
});
