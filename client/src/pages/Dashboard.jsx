import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { ErrorNote, Loading, PageTitle, Stat, fmtPct, useLoad } from '../ui.jsx';

export default function Dashboard() {
  const { data, error, loading } = useLoad(() => api.dashboard(), []);
  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} />;

  const n = data.totals.critical;
  return (
    <>
      <PageTitle title="Dashboard" />

      {n > 0 ? (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800">
          <p className="font-semibold">
            {n} {n === 1 ? 'Student' : 'Students'} in Critical Shortage (&lt;65%)
          </p>
          <p className="text-sm">Open a name below to see exactly how many classes they need to attend to recover.</p>
        </div>
      ) : (
        <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 font-medium text-emerald-800">
          Nobody is in critical shortage right now.
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Students" value={data.totals.students} />
        <Stat label="Safe (75%+)" value={data.totals.safe} tone="text-emerald-600" />
        <Stat label="Warning (65-74%)" value={data.totals.warning} tone="text-amber-600" />
        <Stat label="Critical (<65%)" value={data.totals.critical} tone="text-red-600" />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="lg:col-span-3">
          <h2 className="mb-2 font-semibold">Critical students</h2>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr><th className="th">Student</th><th className="th">Worst subject</th><th className="th">Attendance</th><th className="th">Needs</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.critical.length === 0 && <tr><td className="td text-slate-500" colSpan={4}>All clear.</td></tr>}
                {data.critical.map((c) => (
                  <tr key={c.studentId} className="hover:bg-slate-50">
                    <td className="td">
                      <Link className="font-medium text-indigo-700 hover:underline" to={`/students/${c.studentId}`}>{c.name}</Link>
                      <div className="text-xs text-slate-500">{c.rollNo}</div>
                    </td>
                    <td className="td">{c.subject}</td>
                    <td className="td font-semibold text-red-600">{fmtPct(c.pct)}</td>
                    <td className="td">{c.needed} in a row</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="lg:col-span-2">
          <h2 className="mb-2 font-semibold">Average by subject</h2>
          <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
            {data.subjectAverages.map((s) => (
              <div key={s.subjectId}>
                <div className="flex justify-between text-sm">
                  <span>{s.name}</span>
                  <span className="tabular-nums text-slate-600">{fmtPct(s.avgPct)}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded bg-slate-200">
                  <div className={`h-full ${s.avgPct >= 75 ? 'bg-emerald-500' : s.avgPct >= 65 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${s.avgPct ?? 0}%` }} />
                </div>
                <p className="mt-0.5 text-xs text-slate-500">{s.critical} critical, {s.warning} warning</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
