/**
 * security.test.js — Security Headers, Rate Limiting & CORS Automated Tests
 *
 * Runs with Node.js built-in test runner:
 *   npm test (or node --test tests/*.test.js)
 */

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const app = require('../server');
const User = require('../models/User');

describe('Security Headers, Rate Limiting & CORS Tests', () => {
  let server;
  let baseUrl;
  let originalFindOne;

  before(async () => {
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  beforeEach(async () => {
    originalFindOne = User.findOne;
    User.findOne = () => ({
      select() {
        return Promise.resolve(null);
      },
    });

    if (app.loginLimiter) {
      await app.loginLimiter.resetKey('127.0.0.1');
      await app.loginLimiter.resetKey('::1');
      await app.loginLimiter.resetKey('::ffff:127.0.0.1');
    }
    if (app.apiLimiter) {
      await app.apiLimiter.resetKey('127.0.0.1');
      await app.apiLimiter.resetKey('::1');
      await app.apiLimiter.resetKey('::ffff:127.0.0.1');
    }
  });

  afterEach(async () => {
    User.findOne = originalFindOne;

    if (app.loginLimiter) {
      await app.loginLimiter.resetKey('127.0.0.1');
      await app.loginLimiter.resetKey('::1');
      await app.loginLimiter.resetKey('::ffff:127.0.0.1');
    }
    if (app.apiLimiter) {
      await app.apiLimiter.resetKey('127.0.0.1');
      await app.apiLimiter.resetKey('::1');
      await app.apiLimiter.resetKey('::ffff:127.0.0.1');
    }
  });

  it('should enforce login rate limit returning 429 on the 6th failed attempt', async () => {
    for (let i = 1; i <= 5; i++) {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'a@b.com', password: 'wrong' }),
      });
      assert.notEqual(res.status, 429, `Request ${i} should not be 429`);
    }

    const sixthRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.com', password: 'wrong' }),
    });

    assert.equal(sixthRes.status, 429, '6th request should return HTTP 429');
    const data = await sixthRes.json();
    assert.equal(data.success, false);
    assert.match(data.message, /Too many login attempts/);
  });

  it('should include Helmet security response headers (nosniff and DENY)', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
  });

  it('should include standard RateLimit headers on /api routes', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.headers.get('ratelimit-limit'), '100');
    assert.equal(res.headers.get('x-ratelimit-limit'), null);
  });

  it('should reject unauthorized cross-origin requests in production mode', async () => {
    const originalEnv = process.env.NODE_ENV;
    const originalClientUrl = process.env.CLIENT_URL;

    try {
      process.env.NODE_ENV = 'production';
      process.env.CLIENT_URL = 'https://client.example.com';

      const resEvil = await fetch(`${baseUrl}/api/health`, {
        headers: { Origin: 'https://evil.example' },
      });
      assert.equal(
        resEvil.headers.get('access-control-allow-origin'),
        null,
        'Evil origin must not receive Access-Control-Allow-Origin header'
      );

      const resAllowed = await fetch(`${baseUrl}/api/health`, {
        headers: { Origin: 'https://client.example.com' },
      });
      assert.equal(
        resAllowed.headers.get('access-control-allow-origin'),
        'https://client.example.com',
        'Authorized origin must receive Access-Control-Allow-Origin header'
      );
    } finally {
      process.env.NODE_ENV = originalEnv;
      process.env.CLIENT_URL = originalClientUrl;
    }
  });
});
