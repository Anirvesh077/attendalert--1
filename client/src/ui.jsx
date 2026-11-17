import { useEffect, useState } from 'react';

export const TIER = {
  safe: { label: 'Safe', badge: 'bg-emerald-100 text-emerald-800 ring-emerald-200', bar: 'bg-emerald-500', dot: '#059669' },
  warning: { label: 'Warning', badge: 'bg-amber-100 text-amber-800 ring-amber-200', bar: 'bg-amber-500', dot: '#d97706' },
  critical: { label: 'Critical', badge: 'bg-red-100 text-red-800 ring-red-200', bar: 'bg-red-500', dot: '#dc2626' },
  none: { label: 'No data', badge: 'bg-slate-100 text-slate-600 ring-slate-200', bar: 'bg-slate-300', dot: '#94a3b8' },
};

export function RiskBadge({ tier }) {
  const t = TIER[tier] ?? TIER.none;
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${t.badge}`}>{t.label}</span>;
}

export const fmtPct = (v) => (v == null ? '-' : `${v.toFixed(1)}%`);

export function fmtWhen(sqliteUtc) {
  if (!sqliteUtc) return '';
  const d = new Date(sqliteUtc.replace(' ', 'T') + 'Z');
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export const todayISO = () => new Date().toLocaleDateString('en-CA');

export function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('Could not read that file'));
    reader.readAsDataURL(file);
  });
}

export function readAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read that file'));
    reader.readAsText(file);
  });
}

// Small data-loading hook. Call reload() after a mutation.
export function useLoad(fn, deps) {
  const [state, setState] = useState({ data: null, error: '', loading: true });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true, error: '' }));
    fn()
      .then((data) => live && setState({ data, error: '', loading: false }))
      .catch((err) => live && setState({ data: null, error: err.message, loading: false }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { ...state, reload: () => setTick((t) => t + 1) };
}

export const Loading = () => <p className="py-10 text-center text-sm text-slate-500">Loading...</p>;

export const ErrorNote = ({ message }) => (
  <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>
);

export function PageTitle({ title, children }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
      <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
      {children}
    </div>
  );
}

export function Stat({ label, value, tone = 'text-slate-900' }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone}`}>{value}</p>
    </div>
  );
}

// Per-subject table used by both the mentor's student page and the student portal.
export function SubjectTable({ subjects }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr>
            <th className="th">Subject</th>
            <th className="th">Attended / Held</th>
            <th className="th w-48">Attendance</th>
            <th className="th">Status</th>
            <th className="th">What it takes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {subjects.map((s) => (
            <tr key={s.subjectId}>
              <td className="td font-medium">{s.subject}</td>
              <td className="td">
                {s.attended} / {s.held}
                {s.exempted > 0 && <span className="ml-1 text-xs text-slate-500">({s.exempted} medical)</span>}
              </td>
              <td className="td">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-28 overflow-hidden rounded bg-slate-200">
                    <div className={`h-full ${TIER[s.tier].bar}`} style={{ width: `${Math.min(100, s.pct ?? 0)}%` }} />
                  </div>
                  <span className="tabular-nums">{fmtPct(s.pct)}</span>
                </div>
              </td>
              <td className="td"><RiskBadge tier={s.tier} /></td>
              <td className="td text-slate-600">
                {s.tier === 'none' && 'No classes held yet'}
                {s.tier === 'safe' && (s.canSkip > 0 ? `Can miss ${s.canSkip} more and stay at 75%` : 'Right on the line, do not miss the next class')}
                {(s.tier === 'warning' || s.tier === 'critical') && (
                  <span className="font-medium text-slate-800">Attend the next {s.needed} classes in a row</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
