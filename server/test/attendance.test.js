import './setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../src/db.js';
import { seedDatabase } from '../src/seed.js';
import { dashboardSummary, listAtRisk } from '../src/services/alerts.js';
import { getSheet, saveAttendance } from '../src/services/attendance.js';
import { studentDetail } from '../src/services/students.js';
import { approveExemption } from '../src/services/exemptions.js';
import { importAttendance, importRoster } from '../src/services/importer.js';
import { correlation } from '../src/services/analytics.js';
import { todayISO } from '../src/util.js';

function freshDb() {
  const db = openDb(':memory:');
  seedDatabase(db);
  return db;
}

const rahulId = (db) => db.prepare("SELECT id FROM students WHERE name = 'Rahul Verma'").get().id;

test('demo data matches the brief: five critical students, Rahul needs 8 in a row', () => {
  const db = freshDb();
  const dash = dashboardSummary(db);
  assert.equal(dash.totals.students, 30);
  assert.equal(dash.totals.critical, 5);
  const rahul = dash.critical.find((c) => c.name === 'Rahul Verma');
  assert.equal(rahul.subject, 'Data Structures');
  assert.equal(rahul.pct, 62.5);
  assert.equal(rahul.needed, 8);
});

test('marking a new absence triggers a critical alert and simulated emails', () => {
  const db = freshDb();
  // Pick a student who is currently Warning in Data Structures (Arjun Mehta, 11/16)
  const arjun = db.prepare("SELECT id FROM students WHERE name = 'Arjun Mehta'").get().id;
  const ds = db.prepare("SELECT id FROM subjects WHERE code = 'CS201'").get().id;

  const sheet = getSheet(db, ds, todayISO());
  assert.equal(sheet.alreadyMarked, false);
  assert.ok(sheet.roster.every((r) => r.status === 'P'));

  const records = sheet.roster.map((r) => ({ studentId: r.studentId, status: r.studentId === arjun ? 'A' : 'P' }));
  const result = saveAttendance(db, { subjectId: ds, date: todayISO(), records, facultyId: 1 });

  assert.equal(result.saved, 30);
  const hit = result.newlyCritical.find((c) => c.studentId === arjun);
  assert.ok(hit, 'Arjun should have dropped into critical');
  assert.equal(result.emailsQueued, 2); // student + parent
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM email_log').get().n, 2);

  // saving the same sheet again must not spam more emails
  const again = saveAttendance(db, { subjectId: ds, date: todayISO(), records, facultyId: 1 });
  assert.equal(again.emailsQueued, 0);
});

test('a bad row rolls the whole save back', () => {
  const db = freshDb();
  const ds = db.prepare("SELECT id FROM subjects WHERE code = 'CS201'").get().id;
  const before = db.prepare('SELECT COUNT(*) AS n FROM records').get().n;
  assert.throws(() => saveAttendance(db, { subjectId: ds, date: todayISO(), records: [{ studentId: 1, status: 'P' }, { studentId: 9999, status: 'P' }], facultyId: 1 }), /unknown student/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM records').get().n, before);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 80);
});

test('future dates and bad statuses are refused', () => {
  const db = freshDb();
  assert.throws(() => saveAttendance(db, { subjectId: 1, date: '2999-01-01', records: [{ studentId: 1, status: 'P' }] }), /future/);
  assert.throws(() => saveAttendance(db, { subjectId: 1, date: todayISO(), records: [{ studentId: 1, status: 'X' }] }), /status/);
});

test('medical exemption removes the absence from the calculation', () => {
  const db = freshDb();
  const id = rahulId(db);
  const certDir = fs.mkdtempSync(path.join(os.tmpdir(), 'certs-'));
  const absence = studentDetail(db, id).absences.find((a) => a.code === 'CS201');

  const pdf = Buffer.from('%PDF-1.4 fake certificate').toString('base64');
  approveExemption(db, { recordId: absence.recordId, note: 'Viral fever', fileName: 'cert.pdf', fileData: pdf, facultyId: 1, certDir });

  const ds = studentDetail(db, id).subjects.find((s) => s.code === 'CS201');
  assert.equal(ds.held, 15);
  assert.equal(ds.attended, 10);
  assert.equal(ds.exempted, 1);
  assert.equal(ds.needed, 5); // 3*15 - 4*10

  assert.throws(() => approveExemption(db, { recordId: absence.recordId, note: '', fileName: 'x.exe', fileData: pdf, certDir }), /PDF, PNG or JPG/);
  assert.throws(() => approveExemption(db, { recordId: absence.recordId, note: '', fileName: 'x.pdf', fileData: Buffer.from('not a pdf').toString('base64'), certDir }), /does not look like/);
  fs.rmSync(certDir, { recursive: true, force: true });
});

test('student view hides mentor notes', () => {
  const db = freshDb();
  assert.equal('interventions' in studentDetail(db, 1, { withNotes: false }), false);
  assert.equal(Array.isArray(studentDetail(db, 1, { withNotes: true }).interventions), true);
});

test('at-risk list filters by tier and is sorted worst first', () => {
  const db = freshDb();
  const crit = listAtRisk(db, { tier: 'critical' });
  assert.equal(crit.length, 5);
  assert.ok(crit.every((r) => r.tier === 'critical'));
  const all = listAtRisk(db);
  for (let i = 1; i < all.length; i++) assert.ok(all[i - 1].pct <= all[i].pct);
});

test('roster import: dry run writes nothing, real run creates and updates', () => {
  const db = freshDb();
  const csv = 'roll_no,name,email,parent_email\n22CS031,New Student,new@x.com,p@x.com\n22CS001,Aarav S Sharma,aarav@x.com,\nbroken line';
  const dry = importRoster(db, csv, { dryRun: true });
  assert.equal(dry.accepted, 2);
  assert.equal(dry.errors.length, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM students').get().n, 30);

  const real = importRoster(db, csv);
  assert.equal(real.created, 1);
  assert.equal(real.updated, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM students').get().n, 31);
  assert.equal(db.prepare("SELECT name FROM students WHERE roll_no = '22CS001'").get().name, 'Aarav S Sharma');
});

test('attendance import applies good rows and reports bad ones', () => {
  const db = freshDb();
  const csv = ['roll_no,subject_code,date,status', `22CS001,CS201,${todayISO()},A`, `22CS002,CS201,${todayISO()},P`, '22CS777,CS201,2024-01-01,P'].join('\n');
  const result = importAttendance(db, csv);
  assert.equal(result.accepted, 2);
  assert.equal(result.errors.length, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 81);
});

test('correlation returns one point per student with a sensible r', () => {
  const db = freshDb();
  const out = correlation(db, 1);
  assert.equal(out.points.length, 30);
  assert.ok(out.r > 0.5, `expected a clear positive correlation, got ${out.r}`);
});
