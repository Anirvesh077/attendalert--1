import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ErrorNote, Loading, RiskBadge, SubjectTable, fmtPct, useLoad } from '../ui.jsx';

export default function StudentPortal() {
  const { user, logout } = useAuth();
  const { data, error, loading } = useLoad(() => api.me(), []);

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <span className="text-lg font-bold text-indigo-700">AttendAlert</span>
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <span>{user.name}</span>
            <button className="btn-ghost" onClick={logout}>Sign out</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6">
        {loading && <Loading />}
        {error && <ErrorNote message={error} />}
        {data && (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-semibold">My attendance</h1>
              <RiskBadge tier={data.tier} />
              <span className="ml-auto text-sm">Overall <strong>{fmtPct(data.overall.pct)}</strong></span>
            </div>

            {data.subjects.filter((s) => s.tier === 'critical' || s.tier === 'warning').map((s) => (
              <div
                key={s.subjectId}
                className={`mb-3 rounded-lg border px-4 py-3 text-sm ${s.tier === 'critical' ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}
              >
                <strong>{s.subject}:</strong> {fmtPct(s.pct)}.{' '}
                {s.tier === 'critical' ? 'This is below the critical 65% mark. ' : 'You are below the 75% needed for the exam. '}
                Attend the next <strong>{s.needed}</strong> classes in a row to get back on track, and talk to your mentor.
              </div>
            ))}

            <SubjectTable subjects={data.subjects} />

            <h2 className="mb-2 mt-6 font-semibold">My recent absences</h2>
            <div className="rounded-lg border border-slate-200 bg-white">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50"><tr><th className="th">Date</th><th className="th">Subject</th><th className="th">Medical leave</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {data.absences.length === 0 && <tr><td className="td text-slate-500" colSpan={3}>No absences. Nice.</td></tr>}
                  {data.absences.map((a) => (
                    <tr key={a.recordId}>
                      <td className="td">{a.date}</td>
                      <td className="td">{a.subject}</td>
                      <td className="td">{a.exempted ? <span className="text-emerald-700">Approved</span> : <span className="text-slate-400">-</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-slate-500">Only you and your mentors can see this page. Medical leave is added by your mentor once a certificate is submitted.</p>
          </>
        )}
      </main>
    </div>
  );
}
