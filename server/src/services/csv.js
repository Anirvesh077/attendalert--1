import { EMAIL_RE, isValidDate, normaliseStatus, todayISO } from '../util.js';

export class CsvError extends Error {}

export const MAX_ROWS = 5000;

// Small hand-rolled parser. It copes with quoted fields, doubled quotes,
// commas and newlines inside quotes, CRLF line endings and a leading BOM.
export function parseCsv(input) {
  const text = String(input ?? '').replace(/^\uFEFF/, '');
  const rows = [];
  let cells = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let startLine = 1;

  const endField = () => {
    cells.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    const blank = cells.length === 1 && cells[0].trim() === '';
    if (!blank) rows.push({ line: startLine, cells: cells.map((c) => c.trim()) });
    cells = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        if (ch === '\n') line++;
        field += ch;
      }
    } else if (ch === '"' && field === '') {
      quoted = true;
    } else if (ch === ',') {
      endField();
    } else if (ch === '\r') {
      // ignore, the \n that follows ends the row
    } else if (ch === '\n') {
      endRow();
      line++;
      startLine = line;
    } else {
      field += ch;
    }
  }
  if (quoted) throw new CsvError(`A quoted value starting near line ${startLine} never closes`);
  if (field !== '' || cells.length > 0) endRow();
  return rows;
}

const ALIASES = {
  rollno: 'roll_no', roll: 'roll_no', roll_number: 'roll_no', reg_no: 'roll_no', regno: 'roll_no',
  student_name: 'name', email_id: 'email', mail: 'email', parent: 'parent_email', parent_email_id: 'parent_email',
  subject: 'subject_code', code: 'subject_code', day: 'date', attendance: 'status',
};

function normaliseHeader(h) {
  const key = String(h).toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return ALIASES[key] ?? key;
}

// Turns raw text into { records, errors, totalRows }. Things that make the whole file
// unusable (empty, binary, missing columns, too big) throw. Bad individual rows are
// collected in errors so the rest of the file can still be used.
export function readTable(text, requiredColumns) {
  if (typeof text !== 'string' || text.trim() === '') throw new CsvError('The file is empty');
  if (text.includes('\u0000')) throw new CsvError('This looks like a binary file, not a CSV');

  const rows = parseCsv(text);
  if (rows.length === 0) throw new CsvError('The file is empty');

  const header = rows[0].cells.map(normaliseHeader);
  const missing = requiredColumns.filter((c) => !header.includes(c));
  if (missing.length) {
    throw new CsvError(`Missing column(s): ${missing.join(', ')}. The header row I found was: ${header.join(', ')}`);
  }
  if (rows.length - 1 > MAX_ROWS) throw new CsvError(`Too many rows (limit is ${MAX_ROWS} per upload)`);

  const records = [];
  const errors = [];
  for (const row of rows.slice(1)) {
    if (row.cells.length !== header.length) {
      errors.push({ line: row.line, message: `Expected ${header.length} columns but found ${row.cells.length}` });
      continue;
    }
    const values = {};
    header.forEach((h, i) => {
      values[h] = row.cells[i];
    });
    records.push({ line: row.line, values });
  }
  return { records, errors, totalRows: rows.length - 1 };
}

export function validateRoster(table) {
  const problems = [...table.errors];
  const valid = [];
  const seen = new Set();

  for (const { line, values: v } of table.records) {
    const rollNo = (v.roll_no ?? '').toUpperCase();
    const fail = (message) => problems.push({ line, message });

    if (!/^[A-Z0-9-]{3,20}$/.test(rollNo)) fail(`"${v.roll_no}" is not a valid roll number (3-20 letters, digits or dashes)`);
    else if (seen.has(rollNo)) fail(`Roll number ${rollNo} appears more than once in this file`);
    else if (!v.name || v.name.length > 100) fail('Name is missing or longer than 100 characters');
    else if (!EMAIL_RE.test(v.email ?? '')) fail(`"${v.email}" is not a valid email address`);
    else if (v.parent_email && !EMAIL_RE.test(v.parent_email)) fail(`"${v.parent_email}" is not a valid parent email address`);
    else {
      seen.add(rollNo);
      valid.push({ line, rollNo, name: v.name, email: v.email, parentEmail: v.parent_email || null });
    }
  }
  return { valid, errors: problems.sort((a, b) => a.line - b.line) };
}

// lookups = { students: Map(rollNo -> id), subjects: Map(code -> id) }
export function validateAttendance(table, lookups) {
  const problems = [...table.errors];
  const valid = [];
  const seen = new Set();
  const today = todayISO();

  for (const { line, values: v } of table.records) {
    const rollNo = (v.roll_no ?? '').toUpperCase();
    const code = (v.subject_code ?? '').toUpperCase();
    const status = normaliseStatus(v.status);
    const fail = (message) => problems.push({ line, message });

    if (!lookups.students.has(rollNo)) fail(`Unknown roll number "${v.roll_no}"`);
    else if (!lookups.subjects.has(code)) fail(`Unknown subject code "${v.subject_code}"`);
    else if (!isValidDate(v.date)) fail(`"${v.date}" is not a valid date (use YYYY-MM-DD)`);
    else if (v.date > today) fail(`${v.date} is in the future`);
    else if (!status) fail(`"${v.status}" is not a status I understand (use P, A, L, present, absent or late)`);
    else if (seen.has(`${rollNo}|${code}|${v.date}`)) fail(`${rollNo} already has a ${code} entry for ${v.date} in this file`);
    else {
      seen.add(`${rollNo}|${code}|${v.date}`);
      valid.push({
        line,
        studentId: lookups.students.get(rollNo),
        subjectId: lookups.subjects.get(code),
        date: v.date,
        status,
      });
    }
  }
  return { valid, errors: problems.sort((a, b) => a.line - b.line) };
}
