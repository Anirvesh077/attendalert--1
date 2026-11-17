import './setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, readTable, validateAttendance, validateRoster, CsvError } from '../src/services/csv.js';

test('parser handles quotes, CRLF, BOM and blank lines', () => {
  const rows = parseCsv('\uFEFFa,b\r\n"x, y","say ""hi"""\r\n\r\n1,2');
  assert.deepEqual(rows.map((r) => r.cells), [['a', 'b'], ['x, y', 'say "hi"'], ['1', '2']]);
});

test('unterminated quote is rejected', () => {
  assert.throws(() => parseCsv('a,b\n"oops,1'), CsvError);
});

test('readTable rejects empty, binary and header-less files', () => {
  assert.throws(() => readTable('   ', ['roll_no']), /empty/);
  assert.throws(() => readTable('a,b\u0000\n', ['a']), /binary/);
  assert.throws(() => readTable('name,email\nA,a@x.com', ['roll_no']), /Missing column/);
});

test('header aliases are understood', () => {
  const t = readTable('Roll No,Student Name,Email ID\n22CS001,Asha,asha@x.com', ['roll_no', 'name', 'email']);
  assert.equal(t.records[0].values.name, 'Asha');
});

test('roster validation reports line numbers and keeps good rows', () => {
  const t = readTable(
    ['roll_no,name,email,parent_email', '22CS001,Asha,asha@x.com,', '22CS001,Dup,dup@x.com,', '??,Bad,bad@x.com,', '22CS002,Ben,not-an-email,', '22CS003,Cy', '22CS004,Di,di@x.com,p@x.com'].join('\n'),
    ['roll_no', 'name', 'email'],
  );
  const { valid, errors } = validateRoster(t);
  assert.deepEqual(valid.map((v) => v.rollNo), ['22CS001', '22CS004']);
  assert.deepEqual(errors.map((e) => e.line), [3, 4, 5, 6]);
});

test('attendance validation catches unknown ids, bad dates, bad status, duplicates', () => {
  const lookups = { students: new Map([['22CS001', 1]]), subjects: new Map([['CS201', 1]]) };
  const t = readTable(
    ['roll_no,subject_code,date,status', '22CS001,CS201,2024-01-10,present', '22CS001,CS201,2024-01-10,A', '22CS999,CS201,2024-01-11,P', '22CS001,XX,2024-01-11,P', '22CS001,CS201,2024-02-30,P', '22CS001,CS201,2999-01-01,P', '22CS001,CS201,2024-01-12,maybe'].join('\n'),
    ['roll_no', 'subject_code', 'date', 'status'],
  );
  const { valid, errors } = validateAttendance(t, lookups);
  assert.equal(valid.length, 1);
  assert.equal(valid[0].status, 'P');
  assert.equal(errors.length, 6);
});
