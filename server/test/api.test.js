import './setup.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { seedDatabase } from '../src/seed.js';
import { createApp } from '../src/app.js';

let server;
let base;

before(async () => {
  const db = openDb(':memory:');
  seedDatabase(db);
  const app = createApp({ db });
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(() => {
  server.closeAllConnections?.();
  server.close();
});

async function call(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

const login = async (role, identifier, password) => (await call('/auth/login', { method: 'POST', body: { role, identifier, password } })).data;

test('protected routes need a token', async () => {
  assert.equal((await call('/dashboard')).status, 401);
});

test('wrong password is rejected', async () => {
  const r = await call('/auth/login', { method: 'POST', body: { role: 'faculty', identifier: 'anita.rao@college.edu', password: 'nope' } });
  assert.equal(r.status, 401);
});

test('mentor sees the dashboard banner numbers', async () => {
  const { token } = await login('faculty', 'anita.rao@college.edu', 'mentor123');
  const r = await call('/dashboard', { token });
  assert.equal(r.status, 200);
  assert.equal(r.data.totals.critical, 5);
});

test('students cannot open mentor pages but can see their own summary', async () => {
  const { token, user } = await login('student', '22CS007', 'student123');
  assert.equal(user.name, 'Rahul Verma');
  assert.equal((await call('/dashboard', { token })).status, 403);
  assert.equal((await call('/students/1', { token })).status, 403);

  const me = await call('/student/me', { token });
  assert.equal(me.status, 200);
  assert.equal(me.data.name, 'Rahul Verma');
  assert.equal('interventions' in me.data, false);
});

test('mentor can log an intervention', async () => {
  const { token } = await login('faculty', 'anita.rao@college.edu', 'mentor123');
  const r = await call('/students/7/interventions', { method: 'POST', token, body: { note: 'Talked through the Data Structures plan.' } });
  assert.equal(r.status, 201);
  assert.equal(r.data.interventions.length, 1);
});

test('unknown api routes give a JSON 404', async () => {
  const r = await call('/nope');
  assert.equal(r.status, 404);
});
