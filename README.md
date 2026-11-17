# AttendAlert

A mentor-facing attendance tracker with an early-warning system, built for the PresentSir "AttendAlert Hack".

Most colleges only add up attendance at the end of the term, so mentors find out about a 62% student when the hall ticket is already being held. AttendAlert keeps a running percentage for every student in every subject, colour-codes the risk, and tells the mentor exactly how many classes in a row a student has to attend to get back to 75%.

## What it does

**Must-have**
- Mark Present / Absent / Late for a subject and date. Everyone starts as Present, so you only tap the absentees. "Mark all present" resets the sheet.
- Live percentage per student and per subject against the 75% rule.
- Risk tiers: Safe (75% and above), Warning (65-74%), Critical (below 65%).
- Recovery estimator: `classes needed = ceil((0.75 * held - attended) / 0.25)`, which simplifies to `3 * held - 4 * attended`. Safe students see how many classes they can still miss.
- Mentor notification hub: filterable at-risk list (tier, subject, search) with CSV export and the date of the last mentoring session.
- Student portal: students sign in with their roll number and only ever see their own data. Mentor notes are never sent to the student API.
- "Log Mentoring Intervention" notes on each student.

**Stretch**
- Simulated parent/student emails the moment a save pushes someone into Critical (stored in an email log, nothing is really sent).
- Medical leave: upload a certificate (PDF/PNG/JPG, checked by file signature, max 2 MB) and the absence stops counting, percentages recalculate.
- Attendance vs midterm marks scatter plot per subject, with the correlation coefficient.
- CSV importers for rosters and attendance/biometric dumps, with a dry-run check, line-numbered error reports and partial import of the valid rows.

## Tech

| Part | Choice |
| --- | --- |
| Frontend | React 18, React Router 6, Tailwind CSS 3, Vite |
| Backend | Node.js + Express |
| Database | SQLite through Node's built-in `node:sqlite` (no native build step) |
| Logging | Pino, one JSON line per event |
| Tests | `node:test`, 29 tests |
| CI | GitHub Actions (tests on Node 22 and 24, plus a client build) |

**You need Node 22.13 or newer** (Node 24 LTS is fine). `node:sqlite` ships with Node, so there is nothing to compile.

## Run it

```bash
npm run setup      # installs root, server and client dependencies
npm run dev        # API on :4000, web app on :5173
```

Open http://localhost:5173. The first start creates `server/data/attendalert.db` and loads demo data: 30 students, 5 subjects, 20 weekdays of history.

| Who | Login | Password |
| --- | --- | --- |
| Mentor | anita.rao@college.edu | mentor123 |
| Other faculty | suresh.kumar@college.edu | faculty123 |
| Student (Rahul Verma) | 22CS007 | student123 |

Every student logs in with their roll number (22CS001 to 22CS030) and `student123`.

Single-server mode (what you would deploy):

```bash
npm run build      # builds the React app into client/dist
npm start          # Express serves the API and the built app on :4000
```

Other commands: `npm test`, `npm run seed:reset` (wipe the database and reload demo data).

Environment variables (all optional): `PORT`, `DB_PATH`, `CERT_DIR`, `LOG_LEVEL`, `SESSION_SECRET` (set this in production), `NODE_ENV`.

## Demo script

1. Sign in as the mentor. The banner says **5 Students in Critical Shortage (<65%)**.
2. Click **Rahul Verma**. Data Structures is 62.5% (10 of 16) and he must attend the **next 8 consecutive classes**.
3. Type a note and press **Log Mentoring Intervention**.
4. Go to **Mark attendance**, pick Data Structures and today's date, mark Arjun Mehta absent and save. He drops from 68.8% to 64.7%, a critical alert appears and two simulated emails land in the **Email log**.
5. Open Rahul's page, add a medical certificate to one of his Data Structures absences, and watch the numbers recalculate (he now needs 5, not 8).
6. Sign out and sign in as `22CS007` to see the restricted student view.
7. Try **Import CSV** with `samples/attendance-with-mistakes.csv` to see the validation report.

## How the numbers work

- A student's attendance in a subject is `(Present + Late) / classes held`. Late counts as attended.
- Absences with an approved medical certificate are removed from `classes held`.
- Tier checks use integer maths (`attended * 100 >= 75 * held`) so 12 of 16 is exactly 75% and safe.
- A student's overall tier is their worst subject.

## Design notes

- **SQLite, not a JSON file.** Schema in `server/src/db.js`: faculty, subjects, students, sessions, records, exemptions, interventions, marks, email_log, with foreign keys and CHECK/UNIQUE constraints.
- **Transactions.** Saving a sheet, importing a CSV and loading seed data each run inside `BEGIN IMMEDIATE ... COMMIT`, so a failure rolls everything back and two writers cannot interleave. WAL mode and a busy timeout are on.
- **Logging.** Pino with a request id on every request, levels by status code, no query strings or tokens logged. Set `LOG_LEVEL=debug` or `silent`.
- **CSV validation.** Quoted fields, BOM, CRLF, header aliases, binary/empty/oversized file rejection, per-row errors with line numbers, duplicate detection, bad dates and statuses, dry run mode.
- **Auth.** scrypt password hashes, HMAC-signed expiring tokens, role checks on every route, login throttling.
- **CI.** `.github/workflows/ci.yml` runs the tests and builds the client on every push and pull request.

## Project layout

```
server/src
  app.js            routes, request logging, error handling
  calc.js           percentage, tier and recovery maths (pure functions)
  db.js             schema, connection, transaction helper
  seed.js           demo data
  services/         stats, attendance, alerts, students, exemptions, csv, importer, analytics
server/test         unit and API tests
client/src
  pages/            one file per screen
  ui.jsx, api.js    shared components and fetch wrapper
samples/            CSV files to try the importers
```

## Known limits

- Emails are simulated on purpose.
- Student passwords are a shared default for the demo. A real rollout would add forced password change.
- Attendance CSV imports do not trigger alert emails; only marking attendance in the app does.
