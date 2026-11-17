import { inTransaction } from '../db.js';
import { badRequest, notFound } from '../errors.js';
import { STATUSES, isValidDate, todayISO } from '../util.js';
import { getStats } from './stats.js';
import { composeEmails } from './alerts.js';

function requireSubject(db, subjectId) {
  const subject = db.prepare('SELECT id, code, name FROM subjects WHERE id = ?').get(subjectId);
  if (!subject) throw notFound('Subject not found');
  return subject;
}

// Everyone defaults to Present, so a teacher with 60+ students only taps the absentees.
export function getSheet(db, subjectId, date) {
  requireSubject(db, subjectId);
  if (!isValidDate(date)) throw badRequest('date must look like YYYY-MM-DD');
  const session = db.prepare('SELECT id FROM sessions WHERE subject_id = ? AND held_on = ?').get(subjectId, date);
  const roster = db
    .prepare(
      `SELECT st.id AS studentId, st.roll_no AS rollNo, st.name, COALESCE(r.status, 'P') AS status
       FROM students st
       LEFT JOIN records r ON r.student_id = st.id AND r.session_id = ?
       ORDER BY st.roll_no`,
    )
    .all(session?.id ?? null);
  return { alreadyMarked: Boolean(session), roster };
}

export function saveAttendance(db, { subjectId, date, records, facultyId }) {
  const subject = requireSubject(db, subjectId);
  if (!isValidDate(date)) throw badRequest('date must look like YYYY-MM-DD');
  if (date > todayISO()) throw badRequest('You cannot mark attendance for a future date');
  if (!Array.isArray(records) || records.length === 0) throw badRequest('records must be a non-empty list');

  const known = new Set(db.prepare('SELECT id FROM students').all().map((r) => r.id));
  const seen = new Set();
  const clean = records.map((r, i) => {
    const studentId = Number(r?.studentId);
    const status = String(r?.status ?? '').toUpperCase();
    if (!known.has(studentId)) throw badRequest(`Row ${i + 1}: unknown student`);
    if (!STATUSES.has(status)) throw badRequest(`Row ${i + 1}: status must be P, A or L`);
    if (seen.has(studentId)) throw badRequest(`Row ${i + 1}: student listed twice`);
    seen.add(studentId);
    return { studentId, status };
  });

  return inTransaction(db, () => {
    const before = new Map(getStats(db, { subjectId }).map((s) => [s.studentId, s.tier]));

    db.prepare(
      `INSERT INTO sessions (subject_id, held_on, marked_by) VALUES (?, ?, ?)
       ON CONFLICT (subject_id, held_on) DO UPDATE SET marked_by = excluded.marked_by`,
    ).run(subjectId, date, facultyId ?? null);
    const session = db.prepare('SELECT id FROM sessions WHERE subject_id = ? AND held_on = ?').get(subjectId, date);

    const upsert = db.prepare(
      `INSERT INTO records (session_id, student_id, status) VALUES (?, ?, ?)
       ON CONFLICT (session_id, student_id) DO UPDATE SET status = excluded.status`,
    );
    for (const r of clean) upsert.run(session.id, r.studentId, r.status);

    // If someone was flipped from Absent to Present the old exemption means nothing now.
    db.prepare(
      `DELETE FROM exemptions WHERE record_id IN
         (SELECT id FROM records WHERE session_id = ? AND status <> 'A')`,
    ).run(session.id);

    const newlyCritical = [];
    const addEmail = db.prepare('INSERT INTO email_log (student_id, to_email, kind, subject, body) VALUES (?, ?, ?, ?, ?)');
    const getStudent = db.prepare('SELECT id, name, email, parent_email FROM students WHERE id = ?');
    let emails = 0;

    for (const stat of getStats(db, { subjectId })) {
      if (stat.tier !== 'critical' || before.get(stat.studentId) === 'critical') continue;
      const student = getStudent.get(stat.studentId);
      for (const mail of composeEmails(student, stat)) {
        addEmail.run(student.id, mail.to, mail.kind, mail.subject, mail.body);
        emails += 1;
      }
      newlyCritical.push({ studentId: student.id, name: student.name, subject: subject.name, pct: stat.pct, needed: stat.needed });
    }

    return { sessionId: session.id, saved: clean.length, newlyCritical, emailsQueued: emails };
  });
}
