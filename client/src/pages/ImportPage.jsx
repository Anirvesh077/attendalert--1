import { useState } from 'react';
import { api } from '../api.js';
import { PageTitle, readAsText } from '../ui.jsx';

const SAMPLES = {
  roster: 'roll_no,name,email,parent_email\n22CS031,Sample Student,22cs031@student.college.edu,parent.22cs031@example.com\n',
  attendance: 'roll_no,subject_code,date,status\n22CS001,CS201,2024-09-02,P\n22CS002,CS201,2024-09-02,A\n22CS003,CS201,2024-09-02,L\n',
};

function ImportCard({ title, hint, kind }) {
  const [file, setFile] = useState(null);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(dryRun) {
    if (!file) {
      setError('Choose a CSV file first');
      return;
    }
    setBusy(true);
    setError('');
    setReport(null);
    try {
      const csv = await readAsText(file);
      const call = kind === 'roster' ? api.importRoster : api.importAttendance;
      setReport(await call(csv, dryRun));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function downloadSample() {
    const url = URL.createObjectURL(new Blob([SAMPLES[kind]], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `sample-${kind}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="font-semibold">{title}</h2>
      <p className="mb-3 mt-1 text-sm text-slate-600">{hint}</p>
      <input type="file" accept=".csv,text/csv" className="mb-3 block text-sm" onChange={(e) => { setFile(e.target.files[0] ?? null); setReport(null); setError(''); }} />
      <div className="flex flex-wrap gap-2">
        <button className="btn-ghost" disabled={busy} onClick={() => run(true)}>Check file first</button>
        <button className="btn-primary" disabled={busy} onClick={() => run(false)}>Import valid rows</button>
        <button className="btn-ghost" onClick={downloadSample}>Sample file</button>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {report && (
        <div className="mt-3 text-sm">
          <p className="font-medium">
            {report.dryRun ? 'Check complete (nothing saved): ' : 'Import finished: '}
            {report.accepted} of {report.totalRows} rows {report.dryRun ? 'look fine' : 'imported'}, {report.skipped} skipped.
            {report.created !== undefined && !report.dryRun && ` ${report.created} new, ${report.updated} updated.`}
          </p>
          {report.errors.length > 0 && (
            <div className="mt-2 max-h-60 overflow-y-auto rounded-md border border-amber-200 bg-amber-50">
              <table className="min-w-full text-xs">
                <thead><tr><th className="th">Line</th><th className="th">Problem</th></tr></thead>
                <tbody>
                  {report.errors.map((e, i) => (
                    <tr key={i}><td className="px-3 py-1 tabular-nums">{e.line}</td><td className="px-3 py-1">{e.message}</td></tr>
                  ))}
                </tbody>
              </table>
              {report.moreErrors > 0 && <p className="px-3 py-1 text-xs text-slate-500">...and {report.moreErrors} more.</p>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default function ImportPage() {
  return (
    <>
      <PageTitle title="Import CSV" />
      <div className="grid gap-6 lg:grid-cols-2">
        <ImportCard
          kind="roster"
          title="Class roster"
          hint="Columns: roll_no, name, email, parent_email (optional). Existing roll numbers are updated; new ones get the default password student123."
        />
        <ImportCard
          kind="attendance"
          title="Attendance log / biometric dump"
          hint="Columns: roll_no, subject_code, date (YYYY-MM-DD), status (P, A, L or present/absent/late). Rows that already exist are overwritten."
        />
      </div>
    </>
  );
}
