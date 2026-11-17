import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { ErrorNote, Loading, RiskBadge, SubjectTable, fmtPct, fmtWhen, readAsBase64, useLoad } from '../ui.jsx';

export default function StudentDetail() {
  const { id } = useParams();
  const { data, error, loading, reload } = useLoad(() => api.student(id), [id]);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState('');
  const [saving, setSaving] = useState(false);

  const [openRecord, setOpenRecord] = useState(null);
  const [leaveNote, setLeaveNote] = useState('');
  const [leaveFile, setLeaveFile] = useState(null);
  const [leaveError, setLeaveError] = useState('');
  const [leaveBusy, setLeaveBusy] = useState(false);

  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} />;

  const critical = data.subjects.filter((s) => s.tier === 'critical');

  async function logNote(e) {
    e.preventDefault();
    setSaving(true);
    setNoteError('');
    try {
      await api.logIntervention(id, note);
      setNote('');
      reload();
    } catch (err) {
      setNoteError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function approveLeave(recordId) {
    if (!leaveFile) {
      setLeaveError('Attach the medical certificate first');
      return;
    }
    setLeaveBusy(true);
    setLeaveError('');
    try {
      await api.addExemption({ recordId, note: leaveNote, fileName: leaveFile.name, fileData: await readAsBase64(leaveFile) });
      setOpenRecord(null);
      setLeaveNote('');
      setLeaveFile(null);
      reload();
    } catch (err) {
      setLeaveError(err.message);
    } finally {
      setLeaveBusy(false);
    }
  }

  async function revoke(recordId) {
    if (!window.confirm('Remove this medical exemption? The absence will count again.')) return;
    try {
      await api.removeExemption(recordId);
      reload();
    } catch (err) {
      alert(err.message);
    }
  }

  async function openCertificate(recordId) {
    try {
      const blob = await api.certificate(recordId);
      window.open(URL.createObjectURL(blob), '_blank');
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <>
      <Link to="/alerts" className="text-sm text-indigo-700 hover:underline">&larr; Back to at-risk list</Link>
      <div className="mb-4 mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{data.name}</h1>
        <RiskBadge tier={data.tier} />
        <span className="text-sm text-slate-500">{data.rollNo} | {data.email}</span>
        <span className="ml-auto text-sm">Overall <strong>{fmtPct(data.overall.pct)}</strong></span>
      </div>

      {critical.map((s) => (
        <div key={s.subjectId} className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800">
          <strong>{s.subject}</strong> is at {fmtPct(s.pct)} ({s.attended}/{s.held}). {data.name.split(' ')[0]} must attend the next{' '}
          <strong>{s.needed} consecutive classes</strong> without a single absence to get back to 75%.
        </div>
      ))}

      <SubjectTable subjects={data.subjects} />

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 font-semibold">Mentoring notes</h2>
          <form onSubmit={logNote} className="mb-3 rounded-lg border border-slate-200 bg-white p-3">
            <textarea className="input" rows={3} placeholder="What did you talk about? Any plan agreed?" value={note} onChange={(e) => setNote(e.target.value)} />
            {noteError && <p className="mt-1 text-sm text-red-600">{noteError}</p>}
            <button className="btn-primary mt-2" disabled={saving}>{saving ? 'Saving...' : 'Log Mentoring Intervention'}</button>
          </form>
          <ul className="space-y-2">
            {data.interventions.length === 0 && <li className="text-sm text-slate-500">No sessions logged yet.</li>}
            {data.interventions.map((i) => (
              <li key={i.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                <p className="whitespace-pre-wrap">{i.note}</p>
                <p className="mt-1 text-xs text-slate-500">{i.by ?? 'Faculty'} | {fmtWhen(i.createdAt)}</p>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="mb-2 font-semibold">Recent absences</h2>
          <div className="max-h-96 overflow-y-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="sticky top-0 bg-slate-50">
                <tr><th className="th">Date</th><th className="th">Subject</th><th className="th">Medical leave</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.absences.length === 0 && <tr><td className="td text-slate-500" colSpan={3}>No absences recorded.</td></tr>}
                {data.absences.map((a) => (
                  <tr key={a.recordId} className="align-top">
                    <td className="td whitespace-nowrap">{a.date}</td>
                    <td className="td">{a.code}</td>
                    <td className="td">
                      {a.exempted ? (
                        <div className="text-xs">
                          <span className="font-semibold text-emerald-700">Approved</span>
                          {a.note && <span className="text-slate-500"> - {a.note}</span>}
                          <div className="mt-1 flex gap-3">
                            {a.hasCertificate && <button className="text-indigo-700 hover:underline" onClick={() => openCertificate(a.recordId)}>View certificate</button>}
                            <button className="text-red-600 hover:underline" onClick={() => revoke(a.recordId)}>Remove</button>
                          </div>
                        </div>
                      ) : openRecord === a.recordId ? (
                        <div className="space-y-2">
                          <input className="input" placeholder="Reason (optional)" value={leaveNote} onChange={(e) => setLeaveNote(e.target.value)} />
                          <input type="file" accept=".pdf,.png,.jpg,.jpeg" className="text-xs" onChange={(e) => setLeaveFile(e.target.files[0] ?? null)} />
                          {leaveError && <p className="text-xs text-red-600">{leaveError}</p>}
                          <div className="flex gap-2">
                            <button className="btn-primary" disabled={leaveBusy} onClick={() => approveLeave(a.recordId)}>{leaveBusy ? 'Uploading...' : 'Approve'}</button>
                            <button className="btn-ghost" onClick={() => setOpenRecord(null)}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <button className="text-xs text-indigo-700 hover:underline" onClick={() => { setOpenRecord(a.recordId); setLeaveError(''); }}>
                          Add certificate
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
