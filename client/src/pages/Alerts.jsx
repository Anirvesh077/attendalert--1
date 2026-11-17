import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { ErrorNote, Loading, PageTitle, RiskBadge, fmtPct, fmtWhen, useLoad } from '../ui.jsx';

export default function Alerts() {
  const [tier, setTier] = useState('all');
  const [subjectId, setSubjectId] = useState('');
  const [search, setSearch] = useState('');
  const subjects = useLoad(() => api.subjects(), []);
  const alerts = useLoad(() => api.alerts({ tier, subjectId }), [tier, subjectId]);

  const rows = (alerts.data ?? []).filter((r) => {
    const q = search.trim().toLowerCase();
    return !q || r.name.toLowerCase().includes(q) || r.rollNo.toLowerCase().includes(q);
  });

  function exportCsv() {
    const lines = [['roll_no', 'name', 'subject', 'attendance_pct', 'status', 'classes_needed']];
    rows.forEach((r) => lines.push([r.rollNo, r.name, r.subject, r.pct, r.tier, r.needed]));
    const text = lines.map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'at-risk-students.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageTitle title="At-risk students">
        <button className="btn-ghost" onClick={exportCsv} disabled={rows.length === 0}>Export list (CSV)</button>
      </PageTitle>

      <div className="mb-4 flex flex-wrap gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">Risk tier</span>
          <select className="input" value={tier} onChange={(e) => setTier(e.target.value)}>
            <option value="all">Warning and critical</option>
            <option value="critical">Critical only</option>
            <option value="warning">Warning only</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">Subject</span>
          <select className="input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">All subjects</option>
            {(subjects.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="flex-1 text-sm">
          <span className="mb-1 block text-slate-600">Search</span>
          <input className="input" placeholder="Name or roll number" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>

      {alerts.loading && <Loading />}
      {alerts.error && <ErrorNote message={alerts.error} />}
      {alerts.data && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Student</th><th className="th">Subject</th><th className="th">Attendance</th>
                <th className="th">Status</th><th className="th">Needs to attend</th><th className="th">Last mentoring</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 && <tr><td className="td text-slate-500" colSpan={6}>Nobody matches those filters.</td></tr>}
              {rows.map((r) => (
                <tr key={`${r.studentId}-${r.subjectId}`} className="hover:bg-slate-50">
                  <td className="td">
                    <Link className="font-medium text-indigo-700 hover:underline" to={`/students/${r.studentId}`}>{r.name}</Link>
                    <div className="text-xs text-slate-500">{r.rollNo}</div>
                  </td>
                  <td className="td">{r.subject}</td>
                  <td className="td tabular-nums">{fmtPct(r.pct)} <span className="text-xs text-slate-500">({r.attended}/{r.held})</span></td>
                  <td className="td"><RiskBadge tier={r.tier} /></td>
                  <td className="td">{r.needed} in a row</td>
                  <td className="td text-slate-500">{r.lastIntervention ? fmtWhen(r.lastIntervention) : 'Not yet'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
