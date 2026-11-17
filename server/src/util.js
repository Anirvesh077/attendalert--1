import { badRequest } from './errors.js';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const STATUSES = new Set(['P', 'A', 'L']);

// Local calendar date as YYYY-MM-DD (en-CA happens to format it that way).
export function todayISO() {
  return new Date().toLocaleDateString('en-CA');
}

export function isValidDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function positiveInt(value, label = 'id') {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw badRequest(`${label} must be a positive whole number`);
  return n;
}

export function normaliseStatus(raw) {
  const map = { p: 'P', present: 'P', a: 'A', absent: 'A', l: 'L', late: 'L' };
  return map[String(raw ?? '').trim().toLowerCase()] ?? null;
}
