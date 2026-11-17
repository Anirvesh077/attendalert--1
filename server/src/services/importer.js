import { inTransaction } from '../db.js';
import { badRequest } from '../errors.js';
import { hashPassword } from '../auth.js';
import { config } from '../config.js';
import { CsvError, readTable, validateAttendance, validateRoster } from './csv.js';

function read(text, columns) {
  try {
    return readTable(text, columns);
  } catch (err) {
    if (err instanceof CsvError) throw badRequest(err.message);
    throw err;
  }
}

const report = (table, valid, errors, dryRun) => ({
  dryRun,
  totalRows: table.totalRows,
  accepted: valid.length,
  skipped: table.totalRows - valid.length,
  errors: errors.slice(0, 200),
  moreErrors: Math.max(0, errors.length - 200),
});

export function importRoster(db, text, { dryRun = false } = {}) {
  const table = read(text, ['roll_no', 'name', 'email']);
  const { valid, errors } = validateRoster(table);
  const result = report(table, valid, errors, dryRun);
  if (dryRun || valid.length === 0) return { ...result, created: 0, updated: 0 };

  // Hash outside the transaction: scrypt is slow and we don't want to hold the write lock for it.
  // everyone imported starts on the same default password, so one hash is enough
  const defaultHash = hashPassword(config.defaultStudentPassword);
  const prepared = valid.map((s) => ({ ...s, hash: defaultHash }));

  let created = 0;
  let updated = 0;
  inTransaction(db, () => {
    const find = db.prepare('SELECT id FROM students WHERE roll_no = ?');
    const insert = db.prepare('INSERT INTO students (roll_no, name, email, parent_email, password_hash) VALUES (?, ?, ?, ?, ?)');
    const update = db.prepare('UPDATE students SET name = ?, email = ?, parent_email = ? WHERE id = ?');
    for (const s of prepared) {
      const existing = find.get(s.rollNo);
      if (existing) {
        update.run(s.name, s.email, s.parentEmail, existing.id);
        updated += 1;
      } else {
        insert.run(s.rollNo, s.name, s.email, s.parentEmail, s.hash);
        created += 1;
      }
    }
  });
  return { ...result, created, updated };
}

export function importAttendance(db, text, { dryRun = false, facultyId = null } = {}) {
  const table = read(text, ['roll_no', 'subject_code', 'date', 'status']);
  const lookups = {
    students: new Map(db.prepare('SELECT id, roll_no FROM students').all().map((s) => [s.roll_no.toUpperCase(), s.id])),
    subjects: new Map(db.prepare('SELECT id, code FROM subjects').all().map((s) => [s.code.toUpperCase(), s.id])),
  };
  const { valid, errors } = validateAttendance(table, lookups);
  const result = report(table, valid, errors, dryRun);
  if (dryRun || valid.length === 0) return result;

  inTransaction(db, () => {
    db.exec('CREATE TEMP TABLE IF NOT EXISTS touched_sessions (id INTEGER PRIMARY KEY)');
    db.exec('DELETE FROM touched_sessions');

    const makeSession = db.prepare('INSERT INTO sessions (subject_id, held_on, marked_by) VALUES (?, ?, ?) ON CONFLICT (subject_id, held_on) DO NOTHING');
    const findSession = db.prepare('SELECT id FROM sessions WHERE subject_id = ? AND held_on = ?');
    const upsert = db.prepare(
      `INSERT INTO records (session_id, student_id, status) VALUES (?, ?, ?)
       ON CONFLICT (session_id, student_id) DO UPDATE SET status = excluded.status`,
    );
    const touch = db.prepare('INSERT OR IGNORE INTO touched_sessions (id) VALUES (?)');

    for (const row of valid) {
      makeSession.run(row.subjectId, row.date, facultyId);
      const session = findSession.get(row.subjectId, row.date);
      upsert.run(session.id, row.studentId, row.status);
      touch.run(session.id);
    }
    db.exec(
      `DELETE FROM exemptions WHERE record_id IN
         (SELECT id FROM records WHERE status <> 'A' AND session_id IN (SELECT id FROM touched_sessions))`,
    );
  });
  return result;
}
