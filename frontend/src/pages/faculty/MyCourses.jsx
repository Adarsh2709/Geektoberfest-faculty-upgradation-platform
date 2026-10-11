/**
 * MyCourses.jsx
 *
 * Lists the faculty's enrollments (GET /api/enrollments/my-courses).
 * "Open" loads the enrollment detail (GET /api/enrollments/:id) which includes
 * course modules, and lets the user mark modules complete via
 * PUT /api/enrollments/:id/progress. The backend computes progress/status/credits.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import AppLayout from '../../components/common/AppLayout';
import { getMyEnrollments, getEnrollmentById, updateProgress, downloadCertificate } from '../../api/enrollmentApi';

const STATUS_COLOR = {
  enrolled: 'var(--color-accent)',
  'in-progress': 'var(--color-warning)',
  completed: 'var(--color-success)',
  dropped: 'var(--color-error)',
};

function Spinner() {
  return (
    <div className="flex items-center justify-center py-24">
      <svg className="w-8 h-8 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" style={{ color: 'var(--color-primary-light)' }}>
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
      </svg>
    </div>
  );
}

function Banner({ type, children }) {
  const ok = type === 'success';
  return (
    <div
      className="mb-5 p-4 rounded-lg text-sm"
      style={{
        background: ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
        border: `1px solid ${ok ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
        color: ok ? '#86efac' : '#fca5a5',
      }}
    >
      {children}
    </div>
  );
}

function ProgressBar({ value, color }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 rounded-full" style={{ background: 'var(--color-surface-2)' }}>
        <div className="h-2 rounded-full transition-all duration-500" style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="text-xs font-semibold shrink-0" style={{ color: 'var(--color-text-muted)' }}>{value}%</span>
    </div>
  );
}

function MyCourses() {
  const [enrollments, setEnrollments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Currently opened enrollment (full detail with modules)
  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getMyEnrollments()
      .then((res) => { if (!cancelled) setEnrollments(res.data.enrollments || []); })
      .catch(() => { if (!cancelled) setError('Failed to load your courses. Please refresh.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Merge updated enrollment fields into the list so the cards stay in sync
  const syncList = (updated) => {
    setEnrollments((prev) =>
      prev.map((e) =>
        e._id === updated._id
          ? { ...e, status: updated.status, progress: updated.progress, completedModules: updated.completedModules, completedAt: updated.completedAt }
          : e
      )
    );
  };

  const handleOpen = async (id) => {
    if (openId === id) {
      setOpenId(null);
      setDetail(null);
      return;
    }
    setError('');
    setMessage('');
    setOpenId(id);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await getEnrollmentById(id);
      setDetail(res.data.enrollment);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load course progress.');
      setOpenId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const toggleModule = async (moduleId) => {
    if (!detail || saving || detail.status === 'completed') return;
    const current = (detail.completedModules || []).map(String);
    const next = current.includes(moduleId)
      ? current.filter((m) => m !== moduleId)
      : [...current, moduleId];

    setError('');
    setMessage('');
    setSaving(true);
    try {
      const res = await updateProgress(detail._id, next);
      const updated = res.data.enrollment;
      // Keep populated course (modules) from the existing detail
      setDetail((prev) => ({ ...prev, ...updated, course: prev.course }));
      syncList(updated);
      setMessage(res.data.message || 'Progress updated');
      if (res.data.newAchievements?.length) {
        setMessage(`${res.data.message} New achievement unlocked!`);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update progress.');
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadCertificate = async (enrollmentId, courseTitle) => {
    setError('');
    setMessage('');
    setDownloadingId(enrollmentId);
    try {
      const res = await downloadCertificate(enrollmentId);

      let filename = 'certificate.pdf';
      const disposition = res.headers?.['content-disposition'] || res.headers?.['Content-Disposition'];
      if (disposition) {
        const match = disposition.match(/filename=["']?([^"';]+)["']?/i);
        if (match?.[1]) {
          filename = match[1].trim();
        }
      } else if (courseTitle) {
        const safeSlug = courseTitle
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '') || 'course';
        filename = `certificate-${safeSlug}.pdf`;
      }

      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      let errorMsg = 'Failed to generate certificate. Please try again.';
      if (err.response?.data) {
        try {
          if (err.response.data instanceof Blob) {
            const text = await err.response.data.text();
            const parsed = JSON.parse(text);
            if (parsed?.message) {
              errorMsg = parsed.message;
            }
          } else if (typeof err.response.data === 'object' && err.response.data.message) {
            errorMsg = err.response.data.message;
          }
        } catch {
          // Fall back to default errorMsg
        }
      }
      setError(errorMsg);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto animate-fadeIn">
        <div className="mb-6">
          <h1 className="text-2xl font-bold gradient-text">My Courses</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Track your progress and mark modules as completed
          </p>
        </div>

        {error && <Banner type="error">{error}</Banner>}
        {message && <Banner type="success">{message}</Banner>}

        {loading ? (
          <Spinner />
        ) : enrollments.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <p className="text-5xl mb-4">📚</p>
            <p className="font-semibold" style={{ color: 'var(--color-text)' }}>You haven't enrolled in any courses yet</p>
            <Link to="/courses" className="btn-primary mt-4 text-sm">Browse Courses</Link>
          </div>
        ) : (
          <div className="space-y-4">
            {enrollments.map((enr) => {
              const color = STATUS_COLOR[enr.status] || 'var(--color-text-muted)';
              const isOpen = openId === enr._id;
              const course = enr.course;
              return (
                <div key={enr._id} className="glass-card p-5" style={{ borderLeft: `3px solid ${color}` }}>
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold" style={{ color: 'var(--color-text)' }}>
                        {course?.title || 'Course unavailable'}
                      </h2>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                        {course?.category}{course?.credits > 0 ? ` · ${course.credits} credits` : ''} · Enrolled {new Date(enr.enrolledAt).toLocaleDateString()}
                      </p>
                    </div>
                    <span
                      className="text-xs font-semibold px-2.5 py-1 rounded-full capitalize"
                      style={{ background: `${color}20`, color }}
                    >
                      {enr.status}
                    </span>
                  </div>

                  <ProgressBar value={enr.progress} color={color} />

                  <div className="flex flex-wrap gap-3 mt-4">
                    <button className="btn-primary text-xs" onClick={() => handleOpen(enr._id)}>
                      {isOpen ? 'Close' : enr.status === 'completed' ? 'View Modules' : 'Open Course'}
                    </button>
                    {course?._id && (
                      <Link to={`/courses/${course._id}`} className="btn-secondary text-xs" style={{ textDecoration: 'none' }}>
                        Course Details
                      </Link>
                    )}
                    {enr.status === 'completed' && (
                      <button
                        className="btn-secondary text-xs focus:ring-2 focus:ring-cyan-400 focus:outline-none"
                        onClick={() => handleDownloadCertificate(enr._id, course?.title)}
                        disabled={downloadingId === enr._id}
                        aria-label={`Download certificate for ${course?.title || 'course'}`}
                      >
                        {downloadingId === enr._id ? 'Generating…' : 'Download Certificate 📜'}
                      </button>
                    )}
                  </div>

                  {isOpen && (
                    <div className="mt-5 pt-5" style={{ borderTop: '1px solid var(--color-border)' }}>
                      {detailLoading || !detail ? (
                        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading modules…</p>
                      ) : !detail.course?.modules?.length ? (
                        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>This course has no modules.</p>
                      ) : (
                        <div className="space-y-2">
                          {detail.status === 'completed' && (
                            <p className="text-sm mb-2" style={{ color: 'var(--color-success)' }}>
                              🎉 Course completed — credits have been awarded.
                            </p>
                          )}
                          {[...detail.course.modules]
                            .sort((a, b) => a.order - b.order)
                            .map((mod) => {
                              const done = (detail.completedModules || []).map(String).includes(String(mod._id));
                              const locked = detail.status === 'completed';
                              return (
                                <label
                                  key={mod._id}
                                  className="flex items-start gap-3 p-3 rounded-lg"
                                  style={{
                                    background: done ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.03)',
                                    border: '1px solid var(--color-border)',
                                    cursor: locked || saving ? 'default' : 'pointer',
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={done}
                                    disabled={locked || saving}
                                    onChange={() => toggleModule(String(mod._id))}
                                    className="mt-1"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium" style={{ color: 'var(--color-text)', textDecoration: done ? 'line-through' : 'none' }}>
                                      {mod.title}
                                    </p>
                                    {mod.description && (
                                      <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{mod.description}</p>
                                    )}
                                    {mod.duration > 0 && (
                                      <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{mod.duration} min</p>
                                    )}
                                  </div>
                                  {mod.resourceUrl && (
                                    <a
                                      href={mod.resourceUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="text-xs shrink-0"
                                      style={{ color: 'var(--color-accent)', textDecoration: 'none' }}
                                    >
                                      Resource ↗
                                    </a>
                                  )}
                                </label>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

export default MyCourses;
