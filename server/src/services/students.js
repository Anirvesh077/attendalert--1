import { badRequest, notFound } from '../errors.js';
import { studentCards } from './stats.js';

// withNotes is true only for faculty. Students never see mentoring notes.
export function studentDetail(db, studentId, { withNotes = false } = {}) {
  const [card] = studentCards(db, studentId);
  if (!card) throw notFound('Student not found');

  const absences = db
    .prepare(
      `SELECT r.id AS recordId, s.held_on AS date, sub.code, sub.name AS subject,
              e.id AS exemptionId, e.note, e.file_name AS fileName
       FROM records r
       JOIN sessions s ON s.id = r.session_id
       JOIN subjects sub ON sub.id = s.subject_id
       LEFT JOIN exemptions e ON e.record_id = r.id
       WHERE r.student_id = ? AND r.status = 'A'
       ORDER BY s.held_on DESC, sub.code
       LIMIT 60`,
    )
    .all(studentId)
    .map((a) => ({
      recordId: a.recordId,
      date: a.date,
      code: a.code,
      subject: a.subject,
      exempted: a.exemptionId !== null,
      hasCertificate: a.fileName !== null,
      note: a.note,
    }));

  const detail = { ...card, absences };
  if (withNotes) {
    detail.interventions = db
      .prepare(
        `SELECT i.id, i.note, i.created_at AS createdAt, f.name AS by
         FROM interventions i LEFT JOIN faculty f ON f.id = i.faculty_id
         WHERE i.student_id = ? ORDER BY i.id DESC`,
      )
      .all(studentId);
  }
  return detail;
}

export function addIntervention(db, { studentId, facultyId, note }) {
  const text = String(note ?? '').trim();
  if (text.length < 3) throw badRequest('Please write a few words about the session');
  if (text.length > 2000) throw badRequest('Notes are limited to 2000 characters');
  if (!db.prepare('SELECT 1 FROM students WHERE id = ?').get(studentId)) throw notFound('Student not found');
  db.prepare('INSERT INTO interventions (student_id, faculty_id, note) VALUES (?, ?, ?)').run(studentId, facultyId ?? null, text);
}
