import { api } from '../api.js';
import { ErrorNote, Loading, PageTitle, fmtWhen, useLoad } from '../ui.jsx';

export default function EmailLog() {
  const { data, error, loading } = useLoad(() => api.emails(), []);
  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} />;

  return (
    <>
      <PageTitle title="Simulated email alerts" />
      <p className="mb-3 text-sm text-slate-600">
        Nothing is actually sent. When a save pushes a student into Critical, the student and parent emails that would have gone out are recorded here.
      </p>
      <div className="space-y-2">
        {data.length === 0 && <p className="text-sm text-slate-500">No alerts yet. Mark someone absent until they cross below 65% and one will show up.</p>}
        {data.map((m) => (
          <details key={m.id} className="rounded-lg border border-slate-200 bg-white p-3">
            <summary className="cursor-pointer text-sm">
              <span className={`mr-2 rounded px-1.5 py-0.5 text-xs font-medium ${m.kind === 'parent' ? 'bg-violet-100 text-violet-800' : 'bg-sky-100 text-sky-800'}`}>{m.kind}</span>
              <strong>{m.studentName}</strong> <span className="text-slate-500">to {m.toEmail} | {fmtWhen(m.createdAt)}</span>
            </summary>
            <p className="mt-2 text-sm font-medium">{m.subject}</p>
            <pre className="mt-1 whitespace-pre-wrap font-sans text-sm text-slate-700">{m.body}</pre>
          </details>
        ))}
      </div>
    </>
  );
}
