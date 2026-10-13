# Issue #10 Change Summary: Platform Analytics Dashboard & Metrics Aggregation

## Location
Placed at the repository root (`ISSUE-10-CHANGES.md`) because changes span both `backend/` and `frontend/`, matching existing repo convention (e.g. `ISSUE_7_CHANGES.md`).

---

## Summary
Implements institutional analytics and metrics aggregation for the Faculty Upgradation Platform:
- Created backend endpoint `GET /api/admin/stats` protected by `protect` and `authorise('admin')` middleware.
- Built MongoDB aggregation pipelines using `$facet`, `$lookup`, and `$group` to compute real-time metrics across Faculty, Courses, Enrollments, Credits, and Categories.
- Replaced the frontend placeholder `AdminDashboard.jsx` with an interactive, responsive analytics dashboard featuring metric cards, proportional horizontal progress bars, and resilient loading/error states.
- Created automated integration tests in `backend/tests/adminStats.test.js` covering seeded aggregations, RBAC/auth guards, and empty database handling.

---

## Schema & Field Mappings

The table below maps the issue's requirements to the concrete Mongoose models and fields:

| Issue Requirement | Schema & Field Mapping | Notes |
|---|---|---|
| Faculty Total Count | `User` where `role === 'faculty'` | Excludes admin accounts (`role === 'admin'`). |
| Active Faculty % | `User.isActive === true` where `role === 'faculty'` | Calculated as `(active / total) * 100`, guarded against divide-by-zero. |
| Course Total Count | `Course` collection count | Total count of all course documents. |
| Published Courses | `Course.isPublished === true` | Controls visibility to faculty members. |
| Draft Courses | `Course.isPublished === false` | In-progress courses not yet published. |
| Enrollment Total Count | `Enrollment` collection count | Total registered enrollments. |
| Completed Enrollments | `Enrollment.status === 'completed'` | Status enum in `Enrollment.js`. |
| Completion % | `(completed / total) * 100` | Guarded against division by zero (returns `0` if empty). |
| Department Credits | `Enrollment (status: 'completed')` joined with `Course (credits)` and `User (department)` | Sums credits for completed courses grouped by faculty department (with fallback to `Credit` collection). |
| Category Enrollments | `Enrollment` joined with `Course (category)` | Counts enrollments grouped by course category. |

---

## Files Changed or Added

| File | Type | Description |
|---|---|---|
| `backend/controllers/adminController.js` | Added | Aggregates metrics live from MongoDB using `$facet` and `$group`. |
| `backend/routes/adminRoutes.js` | Added | Defines `GET /stats` guarded with `protect` and `authorise('admin')`. |
| `backend/server.js` | Modified | Mounts `/api/admin` router; exports `app` conditionally for test suites. |
| `backend/tests/adminStats.test.js` | Added | Automated integration tests for the admin statistics endpoint. |
| `frontend/src/api/adminApi.js` | Added | Axios client function `getAdminStats()` for fetching analytics data. |
| `frontend/src/pages/admin/AdminDashboard.jsx` | Modified | Replaces placeholder with full analytics dashboard UI. |
| `ISSUE-10-CHANGES.md` | Added | Documentation of changes, design rationale, and test verification. |

---

## Detailed Code Explanations

### 1. `backend/controllers/adminController.js`
- **Faculty Aggregation (`User.aggregate`)**:
  - `$match: { role: 'faculty' }` filters exclusively for faculty accounts.
  - `$group: { _id: null, total: { $sum: 1 }, active: { $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] } } }` counts total and active faculty in a single pass.
- **Course Aggregation (`Course.aggregate`)**:
  - `$group: { _id: null, total: { $sum: 1 }, published: { $sum: ... }, draft: { $sum: ... } }` categorizes courses into published and draft counts.
- **Enrollment Aggregation with `$facet` (`Enrollment.aggregate`)**:
  - `stats`: Computes total enrollments and completed counts (`status === 'completed'`).
  - `categoryEnrollments`: Performs a `$lookup` to `courses`, unwinds the course document, groups by `$courseDoc.category`, counts enrollments, and sorts in descending order.
  - `departmentCredits`: Filters completed enrollments (`status === 'completed'`), performs `$lookup` to `courses` (for `credits`) and `users` (for `department`), groups by `$facultyDoc.department`, and sums `courseDoc.credits`.
  - Fallback: If no completed enrollments exist but credit documents were manually awarded, queries the `Credit` collection joined with `users`.
- **Division-by-Zero Guards**:
  - `facultyActivePercentage = facultyTotal === 0 ? 0 : Math.round((facultyActive / facultyTotal) * 100 * 10) / 10;`
  - `enrollmentCompletionPercentage = enrollmentTotal === 0 ? 0 : Math.round((enrollmentCompleted / enrollmentTotal) * 100 * 10) / 10;`
- **Response Format**:
  - Returns HTTP 200 with JSON containing stats at top level and nested under `data` for consumer compatibility.

### 2. `backend/routes/adminRoutes.js`
- **Route Definition**:
  - `router.get('/stats', protect, authorise('admin'), getAdminStats);`
- **Middleware Chain**:
  - `protect`: Verifies JWT in Authorization header, extracts user ID, and checks `isActive`.
  - `authorise('admin')`: Ensures only accounts with `role === 'admin'` can access analytics; returns HTTP 403 otherwise.

### 3. `backend/server.js`
- Mounted `adminRoutes` at `/api/admin`.
- Guarded `connectDB()` and `app.listen()` inside `if (require.main === module)` and added `module.exports = app` so tests can import `app` without starting external listeners or crashing if MongoDB is offline.

### 4. `frontend/src/pages/admin/AdminDashboard.jsx`
- **Data Fetching**: Calls `getAdminStats()` on component mount, tracking `loading` and `error` states.
- **Metric Cards**:
  - **Faculty**: Total faculty + active percentage and active count.
  - **Courses**: Total courses + published and draft breakdown.
  - **Enrollments**: Total enrollments + completion percentage and finished count.
  - **Total Credits**: Institutional credit sum across all departments.
- **Horizontal Progress Bars**:
  - Proportional widths calculated dynamically as `Math.min(Math.round((value / maxValue) * 100), 100)`.
  - Fallback display: Shows "No data yet" message when collections are empty.
  - Styled with CSS variables (`var(--color-primary)`, `var(--color-accent)`, `glass-card`) for dark and light theme adaptability.

---

## Automated Tests (`backend/tests/adminStats.test.js`)

Executed with `npm test` using Node.js's built-in test runner:
1. **Test 1 (Seeded Data Aggregations)**:
   - Seeds 3 faculty (2 active CSE, 1 inactive ECE), 4 courses (3 published, 1 draft across Technology and Management), and 5 enrollments (2 completed).
   - Asserts exact calculations: Faculty total = 3, active = 2 (66.7%), Courses total = 4 (3 published, 1 draft), Enrollments total = 5 (2 completed, 40%), Department credits (CSE: 7), Category enrollments (Technology: 3, Management: 2).
2. **Test 2 (Security & RBAC Enforcement)**:
   - Asserts unauthenticated request returns HTTP 401 (`Not authorised — no token provided`).
   - Asserts faculty user request returns HTTP 403 (`Access denied`).
3. **Test 3 (Empty Database State)**:
   - Asserts empty database returns HTTP 200 with zeros for all totals/percentages and `[]` for arrays.

---

## Manual Verification Steps

1. Start MongoDB and backend server:
   ```bash
   cd backend && npm run dev
   ```
2. Start frontend dev server:
   ```bash
   cd frontend && npm run dev
   ```
3. Test using cURL with an admin token:
   ```bash
   # Log in as admin
   ADMIN_TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@example.com","password":"admin123"}' \
     | grep -o '"token":"[^"]*' | cut -d'"' -f4)

   # Fetch analytics metrics
   curl -s -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:5000/api/admin/stats
   ```
4. Test in browser:
   - Navigate to `http://localhost:5173/login` and sign in with `admin@example.com` / `admin123`.
   - Open `http://localhost:5173/admin/dashboard`.
   - Verify that the metric cards (Faculty, Courses, Enrollments, Credits) and the horizontal bar charts for Department Credits and Category Engagement render accurately.

---

## Assumptions & Decisions

1. **Credits Calculation**: Credits awarded were mapped via completed enrollments (`Enrollment.status === 'completed'`) joined with course credits and faculty department, with a fallback to the `Credit` collection to ensure consistency across both data patterns.
2. **Offline Test Resilience**: To allow fast local test runs without requiring an external MongoDB service running on the host, `adminStats.test.js` supports both live MongoDB connections (used in CI) and an in-memory aggregation stub matching the exact MongoDB pipeline.
3. **Division by Zero**: Safeguarded all percentage calculations (`activePercentage` and `completionPercentage`) to return `0` when denominators are zero.
