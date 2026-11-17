import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { logger } from './logger.js';
import { HttpError, badRequest, notFound } from './errors.js';
import { requireRole, signToken, verifyPassword } from './auth.js';
import { positiveInt } from './util.js';
import { dashboardSummary, listAtRisk } from './services/alerts.js';
import { getSheet, saveAttendance } from './services/attendance.js';
import { studentCards } from './services/stats.js';
import { addIntervention, studentDetail } from './services/students.js';
import { approveExemption, certificatePath, revokeExemption } from './services/exemptions.js';
import { correlation } from './services/analytics.js';
import { importAttendance, importRoster } from './services/importer.js';

// async-safe wrapper: anything thrown or rejected goes to the error handler
const h = (fn) => (req, res, next) => {
  try {
    Promise.resolve(fn(req, res)).catch(next);
  } catch (err) {
    next(err);
  }
};

function requestLogger(log) {
  return (req, res, next) => {
    const started = process.hrtime.bigint();
    req.id = randomUUID();
    res.setHeader('X-Request-Id', req.id);
    res.on('finish', () => {
      const ms = Math.round(Number(process.hrtime.bigint() - started) / 1e6);
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
      log[level]({ reqId: req.id, method: req.method, url: req.originalUrl.split('?')[0], status: res.statusCode, ms }, 'request completed');
    });
    next();
  };
}

// Tiny in-memory throttle for the login form: 8 misses per 10 minutes per ip+account.
const misses = new Map();
function checkThrottle(key) {
  const entry = misses.get(key);
  if (entry && entry.resetAt > Date.now() && entry.count >= 8) {
    throw new HttpError(429, 'Too many failed sign-in attempts. Try again in a few minutes.');
  }
}
function noteMiss(key) {
  const now = Date.now();
  const entry = misses.get(key);
  if (!entry || entry.resetAt < now) misses.set(key, { count: 1, resetAt: now + 10 * 60 * 1000 });
  else entry.count += 1;
}

function buildRouter({ db, log }) {
  const r = express.Router();
  const faculty = requireRole('faculty', config.secret);
  const student = requireRole('student', config.secret);

  r.get('/health', (_req, res) => res.json({ ok: true }));

  r.post('/auth/login', h((req, res) => {
    const { role, identifier, password } = req.body ?? {};
    if (!['faculty', 'student'].includes(role) || !identifier || !password) {
      throw badRequest('Role, identifier and password are required');
    }
    const key = `${req.ip}|${String(identifier).toLowerCase()}`;
    checkThrottle(key);

    const row = role === 'faculty'
      ? db.prepare('SELECT id, name, password_hash FROM faculty WHERE email = ? COLLATE NOCASE').get(String(identifier).trim())
      : db.prepare('SELECT id, name, roll_no, password_hash FROM students WHERE roll_no = ? COLLATE NOCASE').get(String(identifier).trim());

    if (!row || !verifyPassword(String(password), row.password_hash)) {
      noteMiss(key);
      log.warn({ role, reqId: req.id }, 'failed sign-in');
      throw new HttpError(401, 'Those details did not match');
    }
    misses.delete(key);
    const token = signToken({ role, id: row.id }, config.secret);
    res.json({ token, user: { role, id: row.id, name: row.name, rollNo: row.roll_no ?? null } });
  }));

  // ---- faculty ----
  r.get('/subjects', faculty, h((_req, res) => {
    res.json(db.prepare('SELECT id, code, name FROM subjects ORDER BY code').all());
  }));

  r.get('/dashboard', faculty, h((_req, res) => res.json(dashboardSummary(db))));
  r.get('/students', faculty, h((_req, res) => res.json(studentCards(db))));

  r.get('/students/:id', faculty, h((req, res) => {
    res.json(studentDetail(db, positiveInt(req.params.id), { withNotes: true }));
  }));

  r.post('/students/:id/interventions', faculty, h((req, res) => {
    addIntervention(db, { studentId: positiveInt(req.params.id), facultyId: req.user.id, note: req.body?.note });
    log.info({ studentId: Number(req.params.id), facultyId: req.user.id }, 'mentoring intervention logged');
    res.status(201).json(studentDetail(db, positiveInt(req.params.id), { withNotes: true }));
  }));

  r.get('/alerts', faculty, h((req, res) => {
    const tier = String(req.query.tier ?? 'all');
    if (!['all', 'warning', 'critical'].includes(tier)) throw badRequest('tier must be all, warning or critical');
    const subjectId = req.query.subjectId ? positiveInt(req.query.subjectId, 'subjectId') : null;
    res.json(listAtRisk(db, { tier, subjectId }));
  }));

  r.get('/attendance/sheet', faculty, h((req, res) => {
    res.json(getSheet(db, positiveInt(req.query.subjectId, 'subjectId'), String(req.query.date ?? '')));
  }));

  r.put('/attendance', faculty, h((req, res) => {
    const subjectId = positiveInt(req.body?.subjectId, 'subjectId');
    const date = String(req.body?.date ?? '');
    const result = saveAttendance(db, { subjectId, date, records: req.body?.records, facultyId: req.user.id });
    log.info({ subjectId, date, saved: result.saved, newlyCritical: result.newlyCritical.length, emails: result.emailsQueued }, 'attendance saved');
    res.json(result);
  }));

  r.post('/exemptions', faculty, h((req, res) => {
    const { recordId, note, fileName, fileData } = req.body ?? {};
    approveExemption(db, { recordId: positiveInt(recordId, 'recordId'), note, fileName, fileData, facultyId: req.user.id, certDir: config.certDir });
    log.info({ recordId, facultyId: req.user.id }, 'medical exemption approved');
    res.status(201).json({ ok: true });
  }));

  r.delete('/exemptions/:recordId', faculty, h((req, res) => {
    revokeExemption(db, positiveInt(req.params.recordId, 'recordId'));
    res.json({ ok: true });
  }));

  r.get('/exemptions/:recordId/certificate', faculty, h((req, res, next) => {
    const { filePath, fileName } = certificatePath(db, positiveInt(req.params.recordId, 'recordId'));
    res.download(filePath, fileName, (err) => err && next(err));
  }));

  r.get('/analytics/correlation', faculty, h((req, res) => {
    res.json(correlation(db, positiveInt(req.query.subjectId, 'subjectId')));
  }));

  r.post('/import/roster', faculty, h((req, res) => {
    const result = importRoster(db, req.body?.csv, { dryRun: Boolean(req.body?.dryRun) });
    log.info({ dryRun: result.dryRun, accepted: result.accepted, skipped: result.skipped }, 'roster import');
    res.json(result);
  }));

  r.post('/import/attendance', faculty, h((req, res) => {
    const result = importAttendance(db, req.body?.csv, { dryRun: Boolean(req.body?.dryRun), facultyId: req.user.id });
    log.info({ dryRun: result.dryRun, accepted: result.accepted, skipped: result.skipped }, 'attendance import');
    res.json(result);
  }));

  r.get('/emails', faculty, h((_req, res) => {
    res.json(db.prepare(
      `SELECT e.id, e.kind, e.to_email AS toEmail, e.subject, e.body, e.created_at AS createdAt, st.name AS studentName
       FROM email_log e JOIN students st ON st.id = e.student_id ORDER BY e.id DESC LIMIT 200`,
    ).all());
  }));

  // ---- student self-service: always the signed-in student's own id, never one from the URL ----
  r.get('/student/me', student, h((req, res) => {
    res.json(studentDetail(db, req.user.id, { withNotes: false }));
  }));

  return r;
}

export function createApp({ db, log = logger }) {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.use(express.json({ limit: '6mb' }));
  app.use(requestLogger(log));
  app.use('/api', buildRouter({ db, log }));
  app.use('/api', (_req, _res, next) => next(notFound('No such endpoint')));

  const indexHtml = path.join(config.clientDist, 'index.html');
  if (fs.existsSync(indexHtml)) {
    app.use(express.static(config.clientDist));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(indexHtml));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    const status = err.status ?? err.statusCode ?? 500;
    if (status >= 500) {
      log.error({ err, reqId: req.id }, 'unhandled error');
      return res.status(500).json({ error: 'Something went wrong on our side' });
    }
    const message = err.type === 'entity.too.large' ? 'That upload is too large' : err.type === 'entity.parse.failed' ? 'Request body was not valid JSON' : err.message;
    res.status(status).json({ error: message, details: err.details });
  });

  return app;
}

