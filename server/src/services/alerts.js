import { getStats, studentCards } from './stats.js';

const round1 = (n) => Math.round(n * 10) / 10;
export const fmt = (n) => (n == null ? 'n/a' : `${round1(n)}%`);

export function dashboardSummary(db) {
  const cards = studentCards(db);
  const totals = { students: cards.length, safe: 0, warning: 0, critical: 0 };
  for (const c of cards) if (c.tier in totals) totals[c.tier] += 1;

  const critical = cards
    .filter((c) => c.tier === 'critical')
    .map((c) => ({
      studentId: c.id,
      rollNo: c.rollNo,
      name: c.name,
      subject: c.worstSubject.subject,
      pct: c.worstSubject.pct,
      needed: c.worstSubject.needed,
    }))
    .sort((a, b) => a.pct - b.pct);

  const bySubject = new Map();
  for (const row of getStats(db)) {
    if (!bySubject.has(row.subjectId)) {
      bySubject.set(row.subjectId, { subjectId: row.subjectId, code: row.code, name: row.subject, pcts: [], warning: 0, critical: 0 });
    }
    const entry = bySubject.get(row.subjectId);
    if (row.pct !== null) entry.pcts.push(row.pct);
    if (row.tier === 'warning') entry.warning += 1;
    if (row.tier === 'critical') entry.critical += 1;
  }
  const subjectAverages = [...bySubject.values()].map(({ pcts, ...rest }) => ({
    ...rest,
    avgPct: pcts.length ? round1(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null,
  }));

  return { totals, critical, subjectAverages };
}

// The mentor notification hub: every student/subject pair that isn't safe.
export function listAtRisk(db, { tier = 'all', subjectId = null } = {}) {
  const students = new Map(studentCards(db).map((c) => [c.id, c]));
  const lastSeen = new Map(
    db.prepare('SELECT student_id, MAX(created_at) AS last FROM interventions GROUP BY student_id').all()
      .map((r) => [r.student_id, r.last]),
  );

  return getStats(db, { subjectId })
    .filter((row) => row.tier === 'critical' || row.tier === 'warning')
    .filter((row) => tier === 'all' || row.tier === tier)
    .map((row) => {
      const s = students.get(row.studentId);
      return {
        studentId: row.studentId,
        rollNo: s.rollNo,
        name: s.name,
        subjectId: row.subjectId,
        subject: row.subject,
        pct: row.pct,
        tier: row.tier,
        needed: row.needed,
        attended: row.attended,
        held: row.held,
        lastIntervention: lastSeen.get(row.studentId) ?? null,
      };
    })
    .sort((a, b) => a.pct - b.pct);
}

// Simulated e-mails: we never send anything, we just write it to email_log
// so the demo can show what would have gone out.
export function composeEmails(student, stat) {
  const subject = `Attendance alert: ${stat.subject} is below the critical mark`;
  const middle =
    `${stat.subject} attendance is now ${fmt(stat.pct)} (${stat.attended} of ${stat.held} classes). ` +
    `That is under the 65% critical line, and the university needs 75% to sit the semester exam.\n\n` +
    `To get back above 75% the next ${stat.needed} classes in a row would all have to be attended. ` +
    `A short chat with the mentor this week would be the best next step.\n\n` +
    `Regards,\nAttendAlert, on behalf of the mentoring team`;

  const out = [{ to: student.email, kind: 'student', subject, body: `Dear ${student.name},\n\nYour ${middle}` }];
  if (student.parent_email) {
    out.push({
      to: student.parent_email,
      kind: 'parent',
      subject,
      body: `Dear Parent/Guardian of ${student.name},\n\nThe ${middle}`,
    });
  }
  return out;
}
