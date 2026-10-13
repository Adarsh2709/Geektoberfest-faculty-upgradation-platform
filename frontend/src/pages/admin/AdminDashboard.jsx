/**
 * AdminDashboard.jsx
 *
 * Administrator Analytics Dashboard & Institutional Metrics.
 * Displays:
 *  - High-level metric cards: Faculty, Courses, Enrollments, Total Credits
 *  - Department-wise Credit Distribution (horizontal proportional progress bars)
 *  - Category Engagement Breakdown (horizontal proportional progress bars)
 */

import { useState, useEffect } from 'react';
import AppLayout from '../../components/common/AppLayout';
import { getAdminStats } from '../../api/adminApi';

// ── Metrics Card Component ───────────────────────────────────────────────────
function MetricCard({ title, mainValue, subStats, accentColor, icon }) {
  return (
    <div
      className="glass-card p-6 flex flex-col justify-between"
      style={{ borderLeft: `4px solid ${accentColor}` }}
    >
      <div className="flex items-center justify-between mb-3">
        <p
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {title}
        </p>
        {icon && (
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: `${accentColor}20`, color: accentColor }}
          >
            {icon}
          </div>
        )}
      </div>
      <div>
        <h3 className="text-3xl font-extrabold mb-1" style={{ color: accentColor }}>
          {mainValue}
        </h3>
        <div
          className="flex flex-wrap items-center gap-1.5 text-xs"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {subStats}
        </div>
      </div>
    </div>
  );
}

// ── Horizontal Progress Bar Chart ────────────────────────────────────────────
function HorizontalBarChart({
  title,
  data,
  labelKey,
  valueKey,
  valueSuffix = '',
  emptyMessage = 'No data yet',
  barColor = 'var(--color-primary-light)',
}) {
  const maxValue =
    data && data.length > 0
      ? Math.max(...data.map((item) => Number(item[valueKey]) || 0), 1)
      : 1;

  return (
    <div className="glass-card p-6 flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>
          {title}
        </h2>
        {data && data.length > 0 && (
          <span
            className="text-xs font-medium px-2 py-0.5 rounded-full"
            style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-muted)' }}
          >
            {data.length} {data.length === 1 ? 'item' : 'items'}
          </span>
        )}
      </div>

      {!data || data.length === 0 ? (
        <div
          className="flex-1 flex items-center justify-center py-12 text-sm"
          style={{ color: 'var(--color-text-muted)' }}
        >
          <p>{emptyMessage}</p>
        </div>
      ) : (
        <div className="space-y-4 flex-1">
          {data.map((item, index) => {
            const label = item[labelKey] || 'Unassigned';
            const value = Number(item[valueKey]) || 0;
            const percentage = Math.min(Math.round((value / maxValue) * 100), 100);

            return (
              <div key={index} className="space-y-1.5">
                <div className="flex justify-between items-center text-xs font-medium">
                  <span
                    className="truncate max-w-[70%]"
                    style={{ color: 'var(--color-text)' }}
                    title={label}
                  >
                    {label}
                  </span>
                  <span
                    className="shrink-0 font-semibold"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {value.toLocaleString()} {valueSuffix}
                  </span>
                </div>
                <div
                  className="w-full h-2.5 rounded-full overflow-hidden"
                  style={{ background: 'var(--color-surface-2)' }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{
                      width: `${percentage}%`,
                      background: barColor,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Admin Dashboard Main Page ────────────────────────────────────────────────
function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchStats = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getAdminStats();
      const payload = res.data?.data || res.data || {};
      setStats(payload);
    } catch {
      setError('Failed to load institutional analytics. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        const res = await getAdminStats();
        if (isMounted) {
          setStats(res.data?.data || res.data || {});
        }
      } catch {
        if (isMounted) {
          setError('Failed to load institutional analytics. Please try again.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };
    load();
    return () => {
      isMounted = false;
    };
  }, []);

  const faculty = stats?.faculty || { total: 0, active: 0, activePercentage: 0 };
  const courses = stats?.courses || { total: 0, published: 0, draft: 0 };
  const enrollments = stats?.enrollments || { total: 0, completed: 0, completionPercentage: 0 };
  const departmentCredits = stats?.departmentCredits || [];
  const categoryEnrollments = stats?.categoryEnrollments || [];

  const totalCredits = departmentCredits.reduce(
    (sum, d) => sum + (Number(d.credits) || 0),
    0
  );

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto space-y-6 animate-fadeIn">
        {/* ── Page Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>
              Platform Analytics Dashboard
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
              Institutional metrics, enrollment progress, and credit distribution overview.
            </p>
          </div>
          <button
            onClick={fetchStats}
            disabled={loading}
            className="btn-secondary self-start sm:self-auto text-xs"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Refresh
          </button>
        </div>

        {/* ── Error Banner ── */}
        {error && (
          <div
            className="p-4 rounded-lg text-sm flex items-center justify-between"
            style={{
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              color: '#fca5a5',
            }}
          >
            <span>{error}</span>
            <button
              onClick={fetchStats}
              className="text-xs font-semibold underline hover:opacity-80"
            >
              Retry
            </button>
          </div>
        )}

        {/* ── Loading Spinner ── */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <svg
              className="w-10 h-10 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              style={{ color: 'var(--color-primary-light)' }}
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
          </div>
        ) : (
          <>
            {/* ── Metric Cards Grid ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Faculty Card */}
              <MetricCard
                title="Faculty"
                mainValue={faculty.total.toLocaleString()}
                subStats={
                  <span>
                    <strong style={{ color: 'var(--color-accent)' }}>
                      {faculty.activePercentage}%
                    </strong>{' '}
                    active ({faculty.active} active)
                  </span>
                }
                accentColor="var(--color-accent)"
                icon={
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                    />
                  </svg>
                }
              />

              {/* Courses Card */}
              <MetricCard
                title="Courses"
                mainValue={courses.total.toLocaleString()}
                subStats={
                  <span>
                    <strong>{courses.published}</strong> published ·{' '}
                    <strong>{courses.draft}</strong> draft
                  </span>
                }
                accentColor="var(--color-primary-light)"
                icon={
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                    />
                  </svg>
                }
              />

              {/* Enrollments Card */}
              <MetricCard
                title="Enrollments"
                mainValue={enrollments.total.toLocaleString()}
                subStats={
                  <span>
                    <strong style={{ color: 'var(--color-warning)' }}>
                      {enrollments.completionPercentage}%
                    </strong>{' '}
                    completed ({enrollments.completed} finished)
                  </span>
                }
                accentColor="var(--color-warning)"
                icon={
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                    />
                  </svg>
                }
              />

              {/* Total Credits Card */}
              <MetricCard
                title="Total Credits"
                mainValue={totalCredits.toLocaleString()}
                subStats={
                  <span>
                    Awarded across {departmentCredits.length}{' '}
                    {departmentCredits.length === 1 ? 'dept' : 'depts'}
                  </span>
                }
                accentColor="var(--color-success)"
                icon={
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                }
              />
            </div>

            {/* ── Two-Column Visual Breakdown ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Department-wise Credit Distribution */}
              <HorizontalBarChart
                title="Department Credit Distribution"
                data={departmentCredits}
                labelKey="department"
                valueKey="credits"
                valueSuffix="credits"
                emptyMessage="No department credits awarded yet"
                barColor="linear-gradient(90deg, var(--color-primary), var(--color-accent))"
              />

              {/* Category-wise Enrollment Breakdown */}
              <HorizontalBarChart
                title="Category Engagement Breakdown"
                data={categoryEnrollments}
                labelKey="category"
                valueKey="enrollments"
                valueSuffix="enrollments"
                emptyMessage="No course enrollments by category yet"
                barColor="linear-gradient(90deg, var(--color-primary-light), var(--color-primary))"
              />
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}

export default AdminDashboard;
