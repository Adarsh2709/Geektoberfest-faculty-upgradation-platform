import React, { useState, useEffect } from 'react';

function CreditManagement() {
  const [credits, setCredits] = useState([]);
  const [facultyList, setFacultyList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [selectedFaculty, setSelectedFaculty] = useState('');
  const [creditAmount, setCreditAmount] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchCredits = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const res = await fetch('/api/credits/admin/all', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setCredits(data.credits || []);
      } else {
        setError(data.message || 'Failed to load credits');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchFaculty = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/faculty', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setFacultyList(data.faculty || []);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchCredits();
    fetchFaculty();
  }, []);

  const handleAdjust = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setSubmitting(true);

    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/credits/admin/adjust', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          facultyId: selectedFaculty,
          creditsEarned: Number(creditAmount),
          reason,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSuccessMsg(`Successfully recorded adjustment: ${creditAmount} credits.`);
        setShowModal(false);
        setSelectedFaculty('');
        setCreditAmount('');
        setReason('');
        fetchCredits();
      } else {
        setError(data.message || 'Failed to adjust credits');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Institutional Credit Audit Log</h1>
          <p className="text-sm text-gray-500">
            Immutable ledger of all automated course completions and administrative manual credit adjustments.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium text-sm transition"
        >
          + Issue Adjustment / Bonus
        </button>
      </div>

      {successMsg && (
        <div className="p-3 bg-green-50 text-green-700 rounded-lg text-sm border border-green-200">
          {successMsg}
        </div>
      )}
      {error && (
        <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm border border-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500 text-sm">Loading credit audit log…</div>
      ) : (
        <div className="bg-white shadow rounded-lg overflow-hidden border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Date</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Faculty Member</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Type</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Credits</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Reason / Course</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Issued By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {credits.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-8 text-gray-400">
                    No credit transactions recorded yet.
                  </td>
                </tr>
              ) : (
                credits.map((c) => (
                  <tr key={c._id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {new Date(c.awardedAt || c.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {c.faculty?.name || 'Unknown Faculty'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${
                          c.type === 'admin_bonus'
                            ? 'bg-purple-100 text-purple-800'
                            : c.type === 'admin_adjustment'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-green-100 text-green-800'
                        }`}
                      >
                        {c.type === 'admin_bonus'
                          ? 'Bonus'
                          : c.type === 'admin_adjustment'
                          ? 'Adjustment'
                          : 'Auto Course'}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-bold">
                      <span className={c.creditsEarned < 0 ? 'text-red-600' : 'text-green-600'}>
                        {c.creditsEarned > 0 ? `+${c.creditsEarned}` : c.creditsEarned}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {c.reason || c.note || c.course?.title || 'Course Completion'}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {c.issuedBy?.name || 'System Automated'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-900">Issue Credit Adjustment</h2>
            <form onSubmit={handleAdjust} className="space-y-4 text-sm">
              <div>
                <label className="block font-medium text-gray-700 mb-1">Faculty Member</label>
                <select
                  required
                  value={selectedFaculty}
                  onChange={(e) => setSelectedFaculty(e.target.value)}
                  className="w-full border rounded-lg p-2"
                >
                  <option value="">Select faculty member...</option>
                  {facultyList.map((f) => (
                    <option key={f._id} value={f._id}>
                      {f.name} ({f.department || f.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-medium text-gray-700 mb-1">
                  Credit Value (Use negative for deduction)
                </label>
                <input
                  type="number"
                  step="0.5"
                  required
                  placeholder="e.g. 2 or -1"
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(e.target.value)}
                  className="w-full border rounded-lg p-2"
                />
              </div>

              <div>
                <label className="block font-medium text-gray-700 mb-1">Justification / Reason</label>
                <textarea
                  required
                  rows="3"
                  placeholder="e.g. Workshop Speaker, External Publication, or Revocation"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full border rounded-lg p-2"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border rounded-lg text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
                >
                  {submitting ? 'Recording…' : 'Record Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default CreditManagement;
