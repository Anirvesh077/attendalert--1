import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import FacultyLayout from './pages/FacultyLayout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import MarkAttendance from './pages/MarkAttendance.jsx';
import Alerts from './pages/Alerts.jsx';
import Students from './pages/Students.jsx';
import StudentDetail from './pages/StudentDetail.jsx';
import Insights from './pages/Insights.jsx';
import ImportPage from './pages/ImportPage.jsx';
import EmailLog from './pages/EmailLog.jsx';
import StudentPortal from './pages/StudentPortal.jsx';

function Guard({ role, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={user.role === 'student' ? '/me' : '/'} replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Guard role="faculty"><FacultyLayout /></Guard>}>
        <Route index element={<Dashboard />} />
        <Route path="mark" element={<MarkAttendance />} />
        <Route path="alerts" element={<Alerts />} />
        <Route path="students" element={<Students />} />
        <Route path="students/:id" element={<StudentDetail />} />
        <Route path="insights" element={<Insights />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="emails" element={<EmailLog />} />
      </Route>
      <Route path="/me" element={<Guard role="student"><StudentPortal /></Guard>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
