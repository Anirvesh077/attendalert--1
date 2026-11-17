import { badRequest } from '../errors.js';
import { getStats, studentCards } from './stats.js';

export function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return null;
  return Math.round((sxy / Math.sqrt(sxx * syy)) * 100) / 100;
}

export function correlation(db, subjectId) {
  const subject = db.prepare('SELECT id, code, name FROM subjects WHERE id = ?').get(subjectId);
  if (!subject) throw badRequest('Unknown subject');

  const names = new Map(studentCards(db).map((c) => [c.id, c]));
  const marks = new Map(db.prepare('SELECT student_id, midterm FROM marks WHERE subject_id = ?').all(subjectId).map((m) => [m.student_id, m.midterm]));

  const points = getStats(db, { subjectId })
    .filter((s) => s.pct !== null && marks.has(s.studentId))
    .map((s) => ({
      studentId: s.studentId,
      name: names.get(s.studentId).name,
      attendance: s.pct,
      marks: marks.get(s.studentId),
      tier: s.tier,
    }));

  return {
    subject,
    maxMarks: 50,
    points,
    r: pearson(points.map((p) => p.attendance), points.map((p) => p.marks)),
  };
}
