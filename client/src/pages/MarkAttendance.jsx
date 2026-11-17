import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { ErrorNote, Loading, PageTitle, fmtPct, todayISO, useLoad } from '../ui.jsx';

const OPTIONS = [
  ['P', 'Present', 'bg-emerald-600 text-white'],
  ['A', 'Absent', 'bg-red-600 text-white'],
  ['L', 'Late', 'bg-amber-500 text-white'],
];

export default function MarkAttendance() {
  const subjects = useLoad(() => api.subjects(), []);
  const [subjectId, setSubjectId] = useState('');
  const [date, setDate] = useState(todayISO());
  const [rows, setRows] = useState([]);
  const [alreadyMarked, setAlreadyMarked] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (!subjectId && subjects.data?.length) setSubjectId(String(subjects.data[0].id));
  }, [subjects.data, subjectId]);

  useEffect(() => {
    if (!subjectId || !date) return undefined;
    let live = true;
    setResult(null);
    setSaveError('');
    setLoadError('');
    api.sheet(subjectId, date)
      .then((s) => {
        if (!live) return;
        setRows(s.roster);
        setAlreadyMarked(s.alreadyMarked);
      })
      .catch((err) => live && setLoadError(err.message));
    return () => {
      live = false;
    };
  }, [subjectId, date]);

  const setStatus = (studentId, status) =>
    setRows((current) => current.map((r) => (r.studentId === studentId ? { ...r, status } : r)));

  const count = (s) => rows.filter((r) => r.status === s).length;

  async function save() {
    setBusy(true);
    setSaveError('');
    setResult(null);
    try {
      const out = await api.saveAttendance({
        subjectId: Number(subjectId),
        date,
        records: rows.map((r) => ({ studentId: r.studentId, status: r.status })),
      });
      setResult(out);
      setAlreadyMarked(true);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (subjects.loading) return <Loading />;
  if (subjects.error) return <ErrorNote message={subjects.error} />;

  return (
    <>
      <PageTitle title="Mark attendance" />

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">Subject</span>
          <select className="input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            {subjects.data.map((s) => <option key={s.id} value={s.id}>{s.code} - {s.name}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">Class date</span>
          <input className="input" type="date" max={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <button className="btn-ghost" onClick={() => setRows((cur) => cur.map((r) => ({ ...r, status: 'P' })))}>
          Mark all present
        </button>
        <div className="ml-auto text-sm text-slate-600">
          {count('P')} present, {count('A')} absent, {count('L')} late
        </div>
      </div>

      {alreadyMarked && !result && (
        <p className="mb-3 rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-800">
          This class was already marked. Saving again will overwrite it.
        </p>
      )}
      {loadError && <ErrorNote message={loadError} />}

      <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="sticky top-0 bg-slate-50">
            <tr><th className="th">Roll no</th><th className="th">Name</th><th className="th">Status</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.studentId} className={r.status === 'A' ? 'bg-red-50' : ''}>
                <td className="td text-slate-500">{r.rollNo}</td>
                <td className="td font-medium">{r.name}</td>
                <td className="td">
                  <div className="inline-flex overflow-hidden rounded-md border border-slate-300">
                    {OPTIONS.map(([code, label, active]) => (
                      <button
                        key={code}
                        type="button"
                        onClick={() => setStatus(r.studentId, code)}
                        className={`px-3 py-1 text-xs font-medium ${r.status === code ? active : 'bg-white text-slate-600 hover:bg-slate-100'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button className="btn-primary" onClick={save} disabled={busy || rows.length === 0}>
          {busy ? 'Saving...' : 'Save attendance'}
        </button>
        {saveError && <span className="text-sm text-red-600">{saveError}</span>}
      </div>

      {result && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <p className="font-medium text-emerald-700">Saved {result.saved} records.</p>
          {result.newlyCritical.length > 0 && (
            <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-3 text-red-800">
              <p className="font-semibold">Critical shortage alert</p>
              <ul className="mt-1 list-disc pl-5">
                {result.newlyCritical.map((c) => (
                  <li key={c.studentId}>
                    {c.name} just dropped to {fmtPct(c.pct)} in {c.subject} and needs {c.needed} classes in a row.
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs">{result.emailsQueued} simulated emails were added to the Email log.</p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
