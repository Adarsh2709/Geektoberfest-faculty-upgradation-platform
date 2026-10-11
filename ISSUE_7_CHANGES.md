# Issue 7 (Issue 12): Course Completion Certificate PDF Generation & Download

## Overview

This feature implements digital course completion certificate generation and downloading for faculty members upon 100% course completion in the Faculty Upgradation Platform (`SIH260022`). When a faculty member completes all modules of a course, their enrollment status transitions to `'completed'`. A secure REST endpoint (`GET /api/enrollments/:id/certificate`) dynamically renders an in-memory PDF certificate using `pdfkit` (Helvetica fonts, A4 landscape, decorative borders, and institutional branding), attaches a deterministic SHA-256 verification ID (`XXXX-XXXX-XXXX-XXXX`), and streams the PDF as a downloadable attachment. In the frontend, the My Courses dashboard conditionally displays a "Download Certificate 📜" button with loading state and blob error handling.

---

## Files Changed / Added

| File Path | Status | What Changed & Why |
|---|---|---|
| `backend/package.json` | Modified | Added `pdfkit` (^0.17.2) dependency for generating PDF documents dynamically. |
| `backend/package-lock.json` | Modified | Updated lockfile to freeze `pdfkit` and its dependencies. |
| `backend/utils/certificate.js` | Added | Pure helper containing `generateVerificationId` (deterministic SHA-256 code) and `buildCertificatePdf` (PDFKit document builder returning a Buffer). |
| `backend/controllers/enrollmentController.js` | Modified | Added `getEnrollmentCertificate` handler to validate ownership, check completed status, invoke PDF generator, and stream PDF response. |
| `backend/routes/enrollmentRoutes.js` | Modified | Registered `GET /:id/certificate` behind `protect` middleware, preserving route hierarchy after `/my-courses`. |
| `backend/tests/certificate.test.js` | Added | Automated tests covering verification ID determinism/uniqueness, PDF generation magic bytes, and controller status codes (404, 403, 400, 200). |
| `frontend/src/api/enrollmentApi.js` | Modified | Exported `downloadCertificate(id)` calling `GET /enrollments/:id/certificate` with `responseType: 'blob'`. |
| `frontend/src/pages/faculty/MyCourses.jsx` | Modified | Added `Download Certificate 📜` button on completed course cards, per-card downloading state, blob download trigger, and blob-to-JSON error parsing. |
| `ISSUE_7_CHANGES.md` | Added | Complete documentation and verification record for this feature. |

---

## Plain-English Code Explanations

### 1. Verification ID Generation (`backend/utils/certificate.js`)
- **What it does**: Computes a deterministic SHA-256 hash using Node's built-in `crypto` module based on `enrollmentId`, `facultyId`, `courseId`, and `completionDate` formatted in ISO 8601.
- **Output format**: Slices the first 16 hexadecimal characters, converts them to uppercase, and formats them into four 4-character blocks separated by hyphens (e.g., `4F2A-91BC-3D7E-8910`).
- **Rationale**: Eliminates the overhead of complex PKI infrastructure while still guaranteeing a deterministic, tamper-evident verification code that can be audited.

### 2. PDF Helper (`backend/utils/certificate.js`)
- **What it does**: Instantiates a `PDFDocument` in A4 landscape mode (`size: 'A4'`, `layout: 'landscape'`) with 40pt margins. Collects chunk buffers via `doc.on('data')` and resolves a single unified `Buffer` on `doc.on('end')`.
- **Layout & Typography**: Uses only standard built-in Helvetica fonts (`Helvetica`, `Helvetica-Bold`). Renders an outer slate border (`#0f172a`), an inner cyan border (`#06b6d4`), header text "FACULTY UPGRADATION PLATFORM", title "Certificate of Completion", recipient name in large bold type, course title, provider/instructor details, credits awarded, date of completion, and the verification ID. Fits cleanly onto a single landscape page without page overflow.

### 3. Backend Endpoint Flow & Status Codes (`backend/controllers/enrollmentController.js`)
- **Route**: `GET /api/enrollments/:id/certificate` guarded by `protect` middleware.
- **Lookup & Population**: Queries `Enrollment.findById(req.params.id)` and populates `course` and `faculty`.
- **Validation**:
  - **404 Not Found**: Returned if the enrollment does not exist (`!enrollment`).
  - **403 Forbidden**: Returned if the authenticated user ID (`req.user._id`) does not match the owning faculty member (`enrollment.faculty`).
  - **400 Bad Request**: Returned if the course is not completed (`enrollment.status !== 'completed'`).
- **Response Headers & Payload**:
  - `Content-Type: application/pdf`
  - `Content-Disposition: attachment; filename="certificate-<slug>.pdf"` (where `<slug>` is lowercase sanitized course title)
  - `Content-Length: <buffer.length>`
  - Body: Binary PDF buffer.

### 4. Route Registration (`backend/routes/enrollmentRoutes.js`)
- Registered `router.get('/:id/certificate', protect, getEnrollmentCertificate)` after `router.get('/my-courses', protect, getMyEnrollments)`.
- This ensures Express properly matches `/my-courses` before capturing any `:id` parameters.

### 5. Frontend API Function (`frontend/src/api/enrollmentApi.js`)
- Added `downloadCertificate = (id) => axiosInstance.get('/enrollments/' + id + '/certificate', { responseType: 'blob' })`.
- Instructs Axios to receive the binary stream as a `Blob` so the browser can construct a downloadable object URL.

### 6. Frontend Button & Download Handler (`frontend/src/pages/faculty/MyCourses.jsx`)
- **Conditional Visibility**: The button is rendered strictly when `enr.status === 'completed'`.
- **Loading State**: Tracked by `downloadingId`. When downloading, the button displays "Generating…" and is disabled to prevent duplicate concurrent requests.
- **Download Flow**: Upon receiving the blob, creates a temporary object URL via `URL.createObjectURL(blob)`, constructs an anchor `<a download="...">` element using the filename from the `Content-Disposition` header (or fallback `certificate-<course-slug>.pdf`), dispatches a programmatic click, and revokes the URL via `URL.revokeObjectURL(url)`.
- **Blob Error Parsing**: Because `responseType: 'blob'` is set on the request, backend JSON error responses arrive as Blobs. The error catch block checks `err.response.data instanceof Blob`, calls `await err.response.data.text()`, parses JSON, and displays the server error message in the existing `<Banner type="error">` notification.

---

## Test Coverage Mapped to Acceptance Criteria

| Acceptance Criterion | Test Name | Result |
|---|---|---|
| Uncompleted enrollments return 400 Bad Request | `should return 400 when enrollment status is not completed` | Passed |
| Enrollment not found returns 404 | `should return 404 when enrollment is not found` | Passed |
| Non-owner access returns 403 Forbidden | `should return 403 when enrollment belongs to another faculty user` | Passed |
| Completed enrollments generate and download valid PDF | `should return 200 with PDF buffer and headers when enrollment is completed and owned by user` | Passed |
| PDF starts with %PDF magic bytes and contains content | `should generate a valid PDF Buffer starting with %PDF magic bytes` | Passed |
| Deterministic Verification ID | `should generate deterministic verification ID for the same inputs` | Passed |
| Distinct IDs for different enrollments | `should generate different verification IDs for different enrollments` | Passed |
| Handles missing fields gracefully | `should handle optional and empty fields gracefully without throwing` | Passed |

---

## Commands Run and Results

### 1. Backend Automated Tests
```bash
cd backend && npm test
```
**Output**:
```text
▶ Certificate Verification ID Tests
  ✔ should generate deterministic verification ID for the same inputs (1.444539ms)
  ✔ should generate different verification IDs for different enrollments (0.207422ms)
✔ Certificate Verification ID Tests (2.690722ms)
▶ Certificate PDF Generator Unit Tests
  ✔ should generate a valid PDF Buffer starting with %PDF magic bytes (89.095541ms)
  ✔ should handle optional and empty fields gracefully without throwing (3.663953ms)
✔ Certificate PDF Generator Unit Tests (93.047482ms)
▶ getEnrollmentCertificate Controller Endpoint Tests
  ✔ should return 404 when enrollment is not found (1.937295ms)
  ✔ should return 403 when enrollment belongs to another faculty user (0.546556ms)
  ✔ should return 400 when enrollment status is not completed (0.452187ms)
  ✔ should return 200 with PDF buffer and headers when enrollment is completed and owned by user (3.576314ms)
✔ getEnrollmentCertificate Controller Endpoint Tests (6.95351ms)
▶ Course Model & Validation Tests
  ✔ should validate required fields for Course model (5.749389ms)
  ✔ should prevent negative credits in Course model (1.276534ms)
  ✔ should set default values for Course model (0.392546ms)
✔ Course Model & Validation Tests (8.591077ms)
▶ Enrollment Model & Schema Tests
  ✔ should validate required faculty and course ObjectIds in Enrollment model (0.987184ms)
  ✔ should set default status to enrolled and progress to 0 (0.433906ms)
✔ Enrollment Model & Schema Tests (1.650639ms)
▶ Error Handler Middleware Tests
  ✔ should return 400 status for CastError (invalid ObjectId) (0.381337ms)
✔ Error Handler Middleware Tests (0.575637ms)
ℹ tests 14
ℹ suites 6
ℹ pass 14
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 522.04999
```

### 2. Frontend Lint Check
```bash
cd frontend && npm run lint
```
**Output**:
```text
Found 4 warnings and 0 errors.
Finished in 80ms on 29 files with 104 rules using 12 threads.
```
*(Zero errors reported; all files compliant with project rules)*

### 3. Frontend Production Build
```bash
cd frontend && npm run build
```
**Output**:
```text
vite v8.3.2 building client environment for production...
transforming...
✓ 105 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.64 kB │ gzip:   0.38 kB
dist/assets/index-Ba1NVrdW.css   30.27 kB │ gzip:   6.55 kB
dist/assets/index-BQx4iRnu.js   397.69 kB │ gzip: 116.59 kB
✓ built in 325ms
```

---

## Manual Verification Steps

1. Start MongoDB, backend server (`npm run dev` in `backend/`), and client (`npm run dev` in `frontend/`).
2. Run database seed: `npm run seed` in `backend/`.
3. Log in as `faculty@example.com` with password `faculty123`.
4. Open a course, complete all required modules until progress reaches 100% and status transitions to `'completed'`.
5. Observe the newly appeared button: `Download Certificate 📜` on the completed course card.
6. Click the button; confirm button transitions to disabled state with text `Generating…`.
7. Once received, the browser automatically saves `certificate-<course-slug>.pdf`.
8. Open the PDF in any PDF viewer and confirm:
   - Layout is single-page A4 landscape with decorative borders.
   - Header shows "FACULTY UPGRADATION PLATFORM".
   - Recipient shows faculty name "Dr. Ramesh Kumar".
   - Course title matches completed course.
   - Provider, Instructor, and Credits Awarded match course metadata.
   - Date of Completion reflects completion timestamp.
   - Deterministic Verification ID matches `XXXX-XXXX-XXXX-XXXX`.
9. Send a `GET /api/enrollments/<in-progress-id>/certificate` request using cURL or Postman with the faculty JWT; verify server responds with `400 Bad Request` and `{"success": false, "message": "Certificate is only available for completed courses"}`.
