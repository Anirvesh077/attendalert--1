const TOKEN_KEY = 'attendalert.token';

export const tokenStore = {
  get() {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set(value) {
    try { localStorage.setItem(TOKEN_KEY, value); } catch { /* private mode, ignore */ }
  },
  clear() {
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  },
};

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function send(path, { method = 'GET', body } = {}) {
  const headers = {};
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError('Cannot reach the server. Is the API running?', 0);
  }

  if (res.status === 401 && path !== '/auth/login') {
    tokenStore.clear();
    localStorage.removeItem('attendalert.user');
    window.location.assign('/login');
  }
  return res;
}

async function request(path, options) {
  const res = await send(path, options);
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.error || `Request failed (${res.status})`, res.status);
  return data;
}

const qs = (params) => new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null)).toString();

export const api = {
  login: (body) => request('/auth/login', { method: 'POST', body }),
  subjects: () => request('/subjects'),
  dashboard: () => request('/dashboard'),
  students: () => request('/students'),
  student: (id) => request(`/students/${id}`),
  logIntervention: (id, note) => request(`/students/${id}/interventions`, { method: 'POST', body: { note } }),
  alerts: (params) => request(`/alerts?${qs(params)}`),
  sheet: (subjectId, date) => request(`/attendance/sheet?${qs({ subjectId, date })}`),
  saveAttendance: (body) => request('/attendance', { method: 'PUT', body }),
  addExemption: (body) => request('/exemptions', { method: 'POST', body }),
  removeExemption: (recordId) => request(`/exemptions/${recordId}`, { method: 'DELETE' }),
  correlation: (subjectId) => request(`/analytics/correlation?${qs({ subjectId })}`),
  importRoster: (csv, dryRun) => request('/import/roster', { method: 'POST', body: { csv, dryRun } }),
  importAttendance: (csv, dryRun) => request('/import/attendance', { method: 'POST', body: { csv, dryRun } }),
  emails: () => request('/emails'),
  me: () => request('/student/me'),
  async certificate(recordId) {
    const res = await send(`/exemptions/${recordId}/certificate`);
    if (!res.ok) throw new ApiError('Certificate not available', res.status);
    return res.blob();
  },
};
