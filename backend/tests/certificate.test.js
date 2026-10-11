/**
 * certificate.test.js — Certificate Generation & Authorization Automated Tests
 *
 * Runs with Node.js built-in test runner:
 *   npm test (or node --test tests/*.test.js)
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const Enrollment = require('../models/Enrollment');
const { getEnrollmentCertificate } = require('../controllers/enrollmentController');
const { generateVerificationId, buildCertificatePdf } = require('../utils/certificate');

// Helper to create mock Express response
const createMockRes = () => {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value;
      return this;
    },
    send(data) {
      this.body = data;
      return this;
    },
  };
};

describe('Certificate Verification ID Tests', () => {
  it('should generate deterministic verification ID for the same inputs', () => {
    const input = {
      enrollmentId: '65f0123456789abcdef01234',
      facultyId: '65f0123456789abcdef01235',
      courseId: '65f0123456789abcdef01236',
      completionDate: new Date('2026-05-10T12:00:00Z'),
    };

    const id1 = generateVerificationId(input);
    const id2 = generateVerificationId(input);

    assert.equal(id1, id2, 'Verification ID must be deterministic for identical inputs');
    assert.match(
      id1,
      /^[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/,
      'Verification ID must match XXXX-XXXX-XXXX-XXXX pattern'
    );
  });

  it('should generate different verification IDs for different enrollments', () => {
    const baseDate = new Date('2026-05-10T12:00:00Z');
    const id1 = generateVerificationId({
      enrollmentId: '65f0123456789abcdef01234',
      facultyId: '65f0123456789abcdef01235',
      courseId: '65f0123456789abcdef01236',
      completionDate: baseDate,
    });
    const id2 = generateVerificationId({
      enrollmentId: '65f0123456789abcdef09999',
      facultyId: '65f0123456789abcdef01235',
      courseId: '65f0123456789abcdef01236',
      completionDate: baseDate,
    });

    assert.notEqual(id1, id2, 'Verification IDs must differ for different enrollment IDs');
  });
});

describe('Certificate PDF Generator Unit Tests', () => {
  it('should generate a valid PDF Buffer starting with %PDF magic bytes', async () => {
    const buffer = await buildCertificatePdf({
      facultyName: 'Dr. Ramesh Kumar',
      courseTitle: 'Advanced Pedagogy',
      provider: 'NPTEL',
      instructor: 'Prof. Ananya Sharma',
      credits: 4,
      completionDate: new Date('2026-05-10'),
      verificationId: 'ABCD-EF01-2345-6789',
    });

    assert.ok(Buffer.isBuffer(buffer), 'Output must be a Buffer');
    assert.ok(buffer.length > 500, 'Buffer should have content');
    assert.equal(
      buffer.subarray(0, 4).toString(),
      '%PDF',
      'Buffer must start with %PDF magic bytes'
    );
  });

  it('should handle optional and empty fields gracefully without throwing', async () => {
    const buffer = await buildCertificatePdf({
      facultyName: '',
      courseTitle: '',
      provider: '',
      instructor: '',
      credits: 0,
      completionDate: null,
      verificationId: '0000-1111-2222-3333',
    });

    assert.ok(Buffer.isBuffer(buffer), 'Output must be a Buffer even with empty fields');
    assert.equal(buffer.subarray(0, 4).toString(), '%PDF');
  });
});

describe('getEnrollmentCertificate Controller Endpoint Tests', () => {
  let originalFindById;

  beforeEach(() => {
    originalFindById = Enrollment.findById;
  });

  afterEach(() => {
    Enrollment.findById = originalFindById;
  });

  it('should return 404 when enrollment is not found', async () => {
    Enrollment.findById = () => ({
      populate() {
        return this;
      },
      then(resolve) {
        return Promise.resolve(null).then(resolve);
      },
    });

    const req = {
      params: { id: new mongoose.Types.ObjectId().toString() },
      user: { _id: new mongoose.Types.ObjectId() },
    };
    const res = createMockRes();

    await getEnrollmentCertificate(req, res, () => {});

    assert.equal(res.statusCode, 404);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, 'Enrollment not found');
  });

  it('should return 403 when enrollment belongs to another faculty user', async () => {
    const ownerId = new mongoose.Types.ObjectId();
    const otherUserId = new mongoose.Types.ObjectId();

    Enrollment.findById = () => ({
      populate() {
        return this;
      },
      then(resolve) {
        return Promise.resolve({
          _id: new mongoose.Types.ObjectId(),
          faculty: { _id: ownerId, name: 'Owner Faculty' },
          course: { _id: new mongoose.Types.ObjectId(), title: 'Test Course' },
          status: 'completed',
        }).then(resolve);
      },
    });

    const req = {
      params: { id: '65f0123456789abcdef01234' },
      user: { _id: otherUserId, name: 'Different Faculty' },
    };
    const res = createMockRes();

    await getEnrollmentCertificate(req, res, () => {});

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /Access denied/);
  });

  it('should return 400 when enrollment status is not completed', async () => {
    const userId = new mongoose.Types.ObjectId();

    Enrollment.findById = () => ({
      populate() {
        return this;
      },
      then(resolve) {
        return Promise.resolve({
          _id: new mongoose.Types.ObjectId(),
          faculty: { _id: userId, name: 'Enrolled Faculty' },
          course: { _id: new mongoose.Types.ObjectId(), title: 'Active Course' },
          status: 'in-progress',
        }).then(resolve);
      },
    });

    const req = {
      params: { id: '65f0123456789abcdef01234' },
      user: { _id: userId, name: 'Enrolled Faculty' },
    };
    const res = createMockRes();

    await getEnrollmentCertificate(req, res, () => {});

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /Certificate is only available for completed courses/);
  });

  it('should return 200 with PDF buffer and headers when enrollment is completed and owned by user', async () => {
    const userId = new mongoose.Types.ObjectId();
    const enrollmentId = new mongoose.Types.ObjectId();
    const courseId = new mongoose.Types.ObjectId();

    const mockEnrollment = {
      _id: enrollmentId,
      faculty: { _id: userId, name: 'Dr. Ramesh Kumar' },
      course: {
        _id: courseId,
        title: 'Advanced Pedagogy & Active Learning',
        provider: 'NPTEL',
        instructor: 'Prof. Ananya Sharma',
        credits: 4,
      },
      status: 'completed',
      completedAt: new Date('2026-05-15T10:00:00Z'),
    };

    Enrollment.findById = () => ({
      populate() {
        return this;
      },
      then(resolve) {
        return Promise.resolve(mockEnrollment).then(resolve);
      },
    });

    const req = {
      params: { id: enrollmentId.toString() },
      user: { _id: userId, name: 'Dr. Ramesh Kumar' },
    };
    const res = createMockRes();

    await getEnrollmentCertificate(req, res, () => {});

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'application/pdf');
    assert.ok(
      res.headers['content-disposition'].includes('attachment'),
      'Content-Disposition must include attachment'
    );
    assert.ok(
      res.headers['content-disposition'].includes('certificate-advanced-pedagogy-active-learning.pdf'),
      'Content-Disposition must contain sanitized filename'
    );
    assert.ok(res.headers['content-length'] > 0, 'Content-Length must be set');
    assert.ok(Buffer.isBuffer(res.body), 'Response body must be a Buffer');
    assert.equal(res.body.subarray(0, 4).toString(), '%PDF', 'Body must start with %PDF');
  });
});
