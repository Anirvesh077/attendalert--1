import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { openDb, inTransaction } from './db.js';
import { hashPassword } from './auth.js';
import { config } from './config.js';

const SUBJECTS = [
  ['CS201', 'Data Structures'],
  ['CS202', 'Database Management Systems'],
  ['CS203', 'Operating Systems'],
  ['CS204', 'Computer Networks'],
  ['MA201', 'Engineering Mathematics III'],
];

const NAMES = [
  'Aarav Sharma', 'Ananya Iyer', 'Vikram Reddy', 'Priya Nair', 'Karthik Subramanian',
  'Sneha Patil', 'Rahul Verma', 'Meera Joshi', 'Arjun Mehta', 'Divya Kulkarni',
  'Rohan Gupta', 'Fatima Sheikh', 'Siddharth Rao', 'Kavya Menon', 'Aditya Singh',
  'Nisha Pillai', 'Harsh Agarwal', 'Lakshmi Narayanan', 'Pranav Desai', 'Ishita Banerjee',
  'Manoj Kumar', 'Tanvi Shah', 'Yash Chauhan', 'Pooja Bhat', 'Imran Qureshi',
  'Shreya Ghosh', 'Nikhil Jain', 'Deepika Yadav', 'Gautam Naidu', 'Riya Thomas',
];

// "studentIndex:subjectIndex" -> classes attended out of 16.
// Hand-picked so the demo has something to show: five students in critical shortage
// (Rahul in Data Structures is 10/16 = 62.5%, he needs 8 in a row), a handful of
// warnings, and a few sitting exactly on 75% (12/16).
const FORCED = {
  '6:0': 10, '3:1': 9, '11:2': 10, '17:3': 8, '24:0': 10,
  '2:4': 11, '8:0': 11, '13:2': 11, '19:1': 11, '21:3': 11, '27:2': 11, '29:4': 11, '14:1': 11,
  '1:2': 12, '9:0': 12, '16:4': 12, '22:3': 12,
};
const USUAL = [16, 15, 15, 15, 14, 14, 14, 13, 13, 12];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const iso = (d) => d.toLocaleDateString('en-CA');

// The last 20 weekdays up to yesterday: exactly four of each weekday.
function recentWeekdays(count) {
  const days = [];
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - 1);
  while (days.length < count) {
    if (d.getDay() !== 0 && d.getDay() !== 6) days.unshift({ date: iso(d), weekday: d.getDay() });
    d.setDate(d.getDate() - 1);
  }
  return days;
}

export function seedDatabase(db) {
  const already = db.prepare('SELECT COUNT(*) AS n FROM students').get().n;
  if (already > 0) return false;

  const rand = mulberry32(2024);
  const days = recentWeekdays(20);
  // hash up front, outside the write transaction
  const facultyRows = [
    ['Dr. Anita Rao', 'anita.rao@college.edu', hashPassword('mentor123')],
    ['Prof. Suresh Kumar', 'suresh.kumar@college.edu', hashPassword('faculty123')],
  ];
  const studentHash = hashPassword(config.defaultStudentPassword);

  inTransaction(db, () => {
    const addFaculty = db.prepare('INSERT INTO faculty (name, email, password_hash) VALUES (?, ?, ?)');
    facultyRows.forEach((f) => addFaculty.run(...f));

    const addSubject = db.prepare('INSERT INTO subjects (code, name) VALUES (?, ?)');
    SUBJECTS.forEach((s) => addSubject.run(...s));

    const addStudent = db.prepare('INSERT INTO students (roll_no, name, email, parent_email, password_hash) VALUES (?, ?, ?, ?, ?)');
    NAMES.forEach((name, i) => {
      const roll = `22CS${String(i + 1).padStart(3, '0')}`;
      addStudent.run(roll, name, `${roll.toLowerCase()}@student.college.edu`, `parent.${roll.toLowerCase()}@example.com`, studentHash);
    });

    const addSession = db.prepare('INSERT INTO sessions (subject_id, held_on, marked_by) VALUES (?, ?, 1)');
    const addRecord = db.prepare('INSERT INTO records (session_id, student_id, status) VALUES (?, ?, ?)');
    const addMark = db.prepare('INSERT INTO marks (student_id, subject_id, midterm) VALUES (?, ?, ?)');

    SUBJECTS.forEach((_, si) => {
      // every subject skips one weekday, which leaves 16 sessions each over four weeks
      const held = days.filter((d) => d.weekday !== si + 1);
      const sessionIds = held.map((d) => Number(addSession.run(si + 1, d.date).lastInsertRowid));

      NAMES.forEach((_, sti) => {
        const attended = FORCED[`${sti}:${si}`] ?? USUAL[Math.floor(rand() * USUAL.length)];

        // pick which sessions were missed
        const order = sessionIds.map((_, i) => i);
        for (let i = order.length - 1; i > 0; i--) {
          const j = Math.floor(rand() * (i + 1));
          [order[i], order[j]] = [order[j], order[i]];
        }
        const missed = new Set(order.slice(0, sessionIds.length - attended));

        sessionIds.forEach((sid, i) => {
          let status = 'A';
          if (!missed.has(i)) status = rand() < 0.1 ? 'L' : 'P';
          addRecord.run(sid, sti + 1, status);
        });

        const ratio = attended / sessionIds.length;
        const marks = Math.round(Math.min(50, Math.max(4, 10 + 32 * ratio + (rand() - 0.5) * 10)) * 2) / 2;
        addMark.run(sti + 1, si + 1, marks);
      });
    });
  });
  return true;
}

// `npm run seed:reset` wipes the database and starts again from the demo data.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  if (process.argv.includes('--reset')) {
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(config.dbPath + suffix, { force: true });
    fs.rmSync(config.certDir, { recursive: true, force: true });
  }
  const db = openDb(config.dbPath);
  console.log(seedDatabase(db) ? 'Demo data created.' : 'Database already has students, nothing to do. Use --reset to start over.');
  db.close();
}
