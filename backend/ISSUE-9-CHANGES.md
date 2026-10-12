# Issue #9 Change Summary: API Rate Limiting, Helmet Security Headers & CORS Lockdown

## Summary
Implements security hardening for the backend REST API:
- Added `helmet` to supply essential security headers (`X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY`).
- Added `express-rate-limit` for both general API routes (max 100 requests/minute) and strict authentication protection on `/api/auth/login` (max 5 failed attempts/15 minutes, returning HTTP 429).
- Locked down CORS in `production` mode to strictly allow `process.env.CLIENT_URL` while preserving development fallback and non-browser cURL/server requests.
- Added `hpp` middleware after body parsers to mitigate HTTP parameter pollution.
- Guarded `connectDB()` and `app.listen()` behind `require.main === module` and exported `app` for clean testing.
- Added automated integration tests verifying security headers, login rate limiting, and CORS enforcement.

---

## Files Changed or Added

| File | Type | Description |
|---|---|---|
| `backend/package.json` | Modified | Added `helmet`, `express-rate-limit`, and `hpp` dependencies. |
| `backend/package-lock.json` | Modified | Updated dependency tree for newly installed packages. |
| `backend/server.js` | Modified | Mounted Helmet, locked-down CORS, HPP, general and login rate limiters, exported app. |
| `backend/tests/security.test.js` | Added | Automated integration tests for headers, rate limiting, and CORS. |
| `backend/ISSUE-9-CHANGES.md` | Added | This documentation. |

---

## Detailed Code Changes in `backend/server.js`

### 1. Helmet Security Headers
```javascript
app.use(
  helmet({
    frameguard: { action: 'deny' },
  })
);
```
- **Explanation**: Attaches secure HTTP response headers to protect against common web vulnerabilities.
- **Why `frameguard: { action: 'deny' }`**: Helmet defaults to `SAMEORIGIN` for `X-Frame-Options`. Setting `action: 'deny'` enforces `X-Frame-Options: DENY` across all endpoints to prevent clickjacking in iframes, while retaining `X-Content-Type-Options: nosniff` and other secure defaults.

### 2. CORS Lockdown
```javascript
app.use(
  cors({
    origin: (origin, callback) => {
      if (process.env.NODE_ENV === 'production') {
        if (!origin || origin === process.env.CLIENT_URL) {
          return callback(null, true);
        }
        return callback(null, false);
      }
      return callback(null, process.env.CLIENT_URL || 'http://localhost:5173');
    },
    credentials: true,
  })
);
```
- **Explanation**: In production (`NODE_ENV === 'production'`), requests bearing an unauthorized cross-origin `Origin` header are rejected (omitting `Access-Control-Allow-Origin`). Only requests matching `process.env.CLIENT_URL` or requests without an `Origin` header (such as server-to-server or cURL calls) are accepted.
- **Non-production**: Retains the existing development fallback (`process.env.CLIENT_URL || 'http://localhost:5173'`).

### 3. HTTP Parameter Pollution (HPP) Prevention
```javascript
// Prevent HTTP parameter pollution
app.use(hpp());
```
- **Explanation**: Mounted immediately following `express.json()` and `express.urlencoded()`.
- **Why**: Sanitizes query strings and request bodies by ensuring duplicated parameters are not parsed as arrays when singular values are expected, preventing parameter injection attacks.

### 4. General API Rate Limiting
```javascript
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', apiLimiter);
```
- **Explanation**: Applies a ceiling of 100 requests per 1-minute window per IP across all `/api` endpoints.
- **Why**: Protects the API against general abuse and denial-of-service traffic. Emits standard IETF `RateLimit-*` headers (`standardHeaders: true`) and disables deprecated `X-RateLimit-*` headers (`legacyHeaders: false`).

### 5. Strict Login Rate Limiting
```javascript
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    message: 'Too many login attempts, please try again after 15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/auth/login', loginLimiter);
```
- **Explanation**: Applied as route-level middleware before `/api/auth` router for `/api/auth/login`. Restricts clients to 5 attempts per 15-minute window per IP.
- **Why `skipSuccessfulRequests: true`**: Ensures valid logins do not penalize users, while failed login attempts increment the counter to block brute-force attacks.
- **Response Format**: Returns HTTP 429 with `{ success: false, message: 'Too many login attempts, please try again after 15 minutes' }`, matching the project's standardized error format.

### 6. App Export & Conditional Listener
```javascript
if (require.main === module) {
  connectDB();
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚀  Server running on http://localhost:${PORT}`);
    console.log(`📋  Health check: http://localhost:${PORT}/api/health`);
    console.log(`🌍  Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

module.exports = app;
```
- **Explanation**: When executed directly (`node server.js`), connects to MongoDB and binds the HTTP port. When required by test suites, exports `app` without attempting database connection or port listening.

---

## Dependencies Added

| Package | Version | Purpose |
|---|---|---|
| `helmet` | `^8.3.0` | Sets secure HTTP headers (`nosniff`, `DENY`, etc.) |
| `express-rate-limit` | `^8.7.1` | General and authentication rate limiting |
| `hpp` | `^0.2.3` | Protects against HTTP parameter pollution |

---

## Automated Tests (`backend/tests/security.test.js`)

Executed with Node's built-in test runner (`npm test`):
1. **Login Rate Limiter**: Sends 6 rapid POST requests with invalid credentials to `/api/auth/login`. Asserts first 5 return 401 and the 6th returns HTTP 429 with `{ success: false, message: ... }`.
2. **Helmet Security Headers**: Asserts `GET /api/health` returns `x-content-type-options: nosniff` and `x-frame-options: DENY`.
3. **RateLimit Headers**: Asserts `GET /api/health` returns standard `ratelimit-limit: 100` and no legacy `x-ratelimit-limit`.
4. **CORS Lockdown**: Asserts that in production mode, requests with `Origin: https://evil.example` do not receive an `Access-Control-Allow-Origin` header, while `Origin: https://client.example.com` receives the allowed header.

---

## Manual Verification Steps

1. Start the server:
   ```bash
   cd backend
   npm run dev
   ```

2. Test security response headers:
   ```bash
   curl -I http://localhost:5000/api/health
   ```
   *Expected*: Contains `x-content-type-options: nosniff`, `x-frame-options: DENY`, `ratelimit-limit: 100`.

3. Test login rate limiting (run 6 times):
   ```bash
   for i in {1..6}; do
     curl -i -X POST http://localhost:5000/api/auth/login \
       -H "Content-Type: application/json" \
       -d '{"email":"a@b.com","password":"wrong"}'
   done
   ```
   *Expected*: Requests 1–5 return HTTP 401; request 6 returns HTTP 429 with:
   ```json
   {"success":false,"message":"Too many login attempts, please try again after 15 minutes"}
   ```

---

## Key Decisions & Assumptions

1. **Proxy Trust (`trust proxy`)**:
   - The repository currently lacks deployment configurations (e.g. Render, Vercel, Docker, Nginx) that mandate reverse proxy headers. Enabling `trust proxy` without an upstream proxy allows IP spoofing via `X-Forwarded-For`. Therefore, `app.set("trust proxy", 1)` was omitted.
2. **Requests Without Origin Header**:
   - Server-to-server calls and CLI tools (cURL, mobile apps, Postman) do not send an `Origin` header. CORS middleware passes them through without setting CORS headers, preserving API accessibility.
3. **Test Architecture**:
   - Tests run in Node's native test runner (`node:test`) on an ephemeral in-process HTTP server (`http.createServer(app).listen(0)`). Mongoose's `User.findOne` is stubbed so tests run fully offline without MongoDB dependencies or state leaks.
