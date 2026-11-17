import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { ErrorNote, Loading, PageTitle, RiskBadge, fmtPct, useLoad } from '../ui.jsx';

export default function Students() {
  const { data, error, loading } = useLoad(() => api.students(), []);
  const [q, setQ] = useState('');
  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} />;

  const rows = data.filter((s) => {
    const needle = q.trim().toLowerCase();
    return !needle || s.name.toLowerCase().includes(needle) || s.rollNo.toLowerCase().includes(needle);
  });

  return (
    <>
      <PageTitle title="All students">
        <input className="input max-w-xs" placeholder="Search name or roll number" value={q} onChange={(e) => setQ(e.target.value)} />
      </PageTitle>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr><th className="th">Roll no</th><th className="th">Name</th><th className="th">Overall</th><th className="th">Worst subject</th><th className="th">Status</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="td text-slate-500">{s.rollNo}</td>
                <td className="td"><Link className="font-medium text-indigo-700 hover:underline" to={`/students/${s.id}`}>{s.name}</Link></td>
                <td className="td tabular-nums">{fmtPct(s.overall.pct)}</td>
                <td className="td">{s.worstSubject ? `${s.worstSubject.subject} (${fmtPct(s.worstSubject.pct)})` : '-'}</td>
                <td className="td"><RiskBadge tier={s.tier} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
