import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState('faculty');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={user.role === 'student' ? '/me' : '/'} replace />;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const u = await login(role, identifier.trim(), password);
      navigate(u.role === 'student' ? '/me' : '/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const tab = (value, label) => (
    <button
      type="button"
      onClick={() => { setRole(value); setError(''); }}
      className={`flex-1 rounded-md py-1.5 text-sm font-medium ${role === value ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="mx-auto mt-16 max-w-sm px-4">
      <h1 className="text-center text-2xl font-bold text-indigo-700">AttendAlert</h1>
      <p className="mb-6 text-center text-sm text-slate-500">Catch attendance shortages before hall tickets get held.</p>

      <form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {tab('faculty', 'Mentor / Faculty')}
          {tab('student', 'Student')}
        </div>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">{role === 'faculty' ? 'Email' : 'Roll number'}</span>
          <input className="input" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoFocus required />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Password</span>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Signing in...' : 'Sign in'}</button>
      </form>

      <div className="mt-4 rounded-lg bg-indigo-50 p-3 text-xs text-slate-600">
        <p className="font-semibold text-slate-700">Demo accounts</p>
        <p>Mentor: anita.rao@college.edu / mentor123</p>
        <p>Student (Rahul Verma): 22CS007 / student123</p>
      </div>
    </div>
  );
}
