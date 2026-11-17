import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { ErrorNote, Loading, PageTitle, TIER, useLoad } from '../ui.jsx';

const W = 640;
const H = 380;
const PAD = { left: 48, right: 16, top: 16, bottom: 44 };

function describe(r) {
  if (r == null) return 'Not enough data to work out a correlation.';
  const strength = Math.abs(r) >= 0.7 ? 'strong' : Math.abs(r) >= 0.4 ? 'moderate' : 'weak';
  return `Correlation r = ${r} (${strength} ${r >= 0 ? 'positive' : 'negative'}): ${r >= 0 ? 'students who attend more tend to score higher.' : 'attendance and marks move in opposite directions.'}`;
}

export default function Insights() {
  const subjects = useLoad(() => api.subjects(), []);
  const [subjectId, setSubjectId] = useState('');

  useEffect(() => {
    if (!subjectId && subjects.data?.length) setSubjectId(String(subjects.data[0].id));
  }, [subjects.data, subjectId]);

  const chart = useLoad(() => (subjectId ? api.correlation(subjectId) : Promise.resolve(null)), [subjectId]);

  if (subjects.loading) return <Loading />;
  if (subjects.error) return <ErrorNote message={subjects.error} />;

  const x = (pct) => PAD.left + (pct / 100) * (W - PAD.left - PAD.right);
  const y = (m, max) => H - PAD.bottom - (m / max) * (H - PAD.top - PAD.bottom);

  return (
    <>
      <PageTitle title="Attendance vs midterm marks">
        <select className="input max-w-xs" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
          {subjects.data.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </PageTitle>

      {chart.loading && <Loading />}
      {chart.error && <ErrorNote message={chart.error} />}
      {chart.data && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="mb-2 text-sm text-slate-600">{describe(chart.data.r)}</p>
          <div className="overflow-x-auto">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-3xl" role="img" aria-label="Scatter plot of attendance against midterm marks">
              {[0, 25, 50, 75, 100].map((t) => (
                <g key={`x${t}`}>
                  <line x1={x(t)} x2={x(t)} y1={PAD.top} y2={H - PAD.bottom} stroke="#e2e8f0" />
                  <text x={x(t)} y={H - PAD.bottom + 16} textAnchor="middle" fontSize="11" fill="#64748b">{t}%</text>
                </g>
              ))}
              {[0, 10, 20, 30, 40, 50].map((t) => (
                <g key={`y${t}`}>
                  <line x1={PAD.left} x2={W - PAD.right} y1={y(t, chart.data.maxMarks)} y2={y(t, chart.data.maxMarks)} stroke="#e2e8f0" />
                  <text x={PAD.left - 8} y={y(t, chart.data.maxMarks) + 4} textAnchor="end" fontSize="11" fill="#64748b">{t}</text>
                </g>
              ))}
              <line x1={x(75)} x2={x(75)} y1={PAD.top} y2={H - PAD.bottom} stroke="#dc2626" strokeDasharray="4 4" />
              <text x={x(75) + 4} y={PAD.top + 10} fontSize="10" fill="#dc2626">75% threshold</text>
              <text x={(W + PAD.left) / 2} y={H - 6} textAnchor="middle" fontSize="12" fill="#475569">Attendance in this subject</text>
              <text transform={`translate(12 ${H / 2}) rotate(-90)`} textAnchor="middle" fontSize="12" fill="#475569">Midterm marks (out of {chart.data.maxMarks})</text>
              {chart.data.points.map((p) => (
                <circle key={p.studentId} cx={x(p.attendance)} cy={y(p.marks, chart.data.maxMarks)} r="5" fill={TIER[p.tier].dot} fillOpacity="0.8" stroke="white">
                  <title>{`${p.name}: ${p.attendance}% attendance, ${p.marks}/${chart.data.maxMarks}`}</title>
                </circle>
              ))}
            </svg>
          </div>
          <div className="mt-2 flex gap-4 text-xs text-slate-600">
            {['safe', 'warning', 'critical'].map((t) => (
              <span key={t} className="inline-flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: TIER[t].dot }} /> {TIER[t].label}
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
