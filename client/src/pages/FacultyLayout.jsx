import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

const links = [
  ['/', 'Dashboard', true],
  ['/mark', 'Mark attendance'],
  ['/alerts', 'At-risk list'],
  ['/students', 'Students'],
  ['/insights', 'Insights'],
  ['/import', 'Import CSV'],
  ['/emails', 'Email log'],
];

export default function FacultyLayout() {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <span className="text-lg font-bold text-indigo-700">AttendAlert</span>
          <nav className="flex flex-wrap gap-1">
            {links.map(([to, label, end]) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 text-sm ${isActive ? 'bg-indigo-50 font-medium text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <span>{user.name}</span>
            <button className="btn-ghost" onClick={logout}>Sign out</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
