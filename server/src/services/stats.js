import { summarise, worstTier } from '../calc.js';

// One query gives attended / absent / exempted per student per subject.
// Medical-leave absences are left out of "held", so an approved exemption
// quietly shrinks the denominator and the percentage recalculates on its own.
const STATS_SQL = `
SELECT st.id AS student_id, sub.id AS subject_id, sub.code AS code, sub.name AS subject,
  COALESCE(SUM(CASE WHEN r.status IN ('P', 'L') THEN 1 ELSE 0 END), 0) AS attended,
  COALESCE(SUM(CASE WHEN r.status = 'A' AND e.id IS NULL THEN 1 ELSE 0 END), 0) AS absent,
  COALESCE(SUM(CASE WHEN r.status = 'A' AND e.id IS NOT NULL THEN 1 ELSE 0 END), 0) AS exempted
FROM students st
CROSS JOIN subjects sub
LEFT JOIN sessions s ON s.subject_id = sub.id
LEFT JOIN records r ON r.session_id = s.id AND r.student_id = st.id
LEFT JOIN exemptions e ON e.record_id = r.id
WHERE (? IS NULL OR st.id = ?) AND (? IS NULL OR sub.id = ?)
GROUP BY st.id, sub.id
ORDER BY st.id, sub.id
`;

export function getStats(db, { studentId = null, subjectId = null } = {}) {
  const rows = db.prepare(STATS_SQL).all(studentId, studentId, subjectId, subjectId);
  return rows.map((r) => ({
    studentId: r.student_id,
    subjectId: r.subject_id,
    code: r.code,
    subject: r.subject,
    exempted: r.exempted,
    ...summarise(r.attended, r.attended + r.absent),
  }));
}

export function studentCards(db, studentId = null) {
  const students = db
    .prepare('SELECT id, roll_no, name, email, parent_email FROM students WHERE (? IS NULL OR id = ?) ORDER BY roll_no')
    .all(studentId, studentId);

  const bySubject = new Map();
  for (const row of getStats(db, { studentId })) {
    if (!bySubject.has(row.studentId)) bySubject.set(row.studentId, []);
    bySubject.get(row.studentId).push(row);
  }

  return students.map((s) => {
    const subjects = bySubject.get(s.id) ?? [];
    const attended = subjects.reduce((n, x) => n + x.attended, 0);
    const held = subjects.reduce((n, x) => n + x.held, 0);
    const worstSubject = subjects.filter((x) => x.held > 0).sort((a, b) => a.pct - b.pct)[0] ?? null;
    return {
      id: s.id,
      rollNo: s.roll_no,
      name: s.name,
      email: s.email,
      parentEmail: s.parent_email,
      subjects,
      overall: summarise(attended, held),
      tier: worstTier(subjects.map((x) => x.tier)),
      worstSubject,
    };
  });
}
