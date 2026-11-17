import './setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, readToken, signToken, verifyPassword } from '../src/auth.js';

test('passwords verify only when correct', () => {
  const stored = hashPassword('hunter2');
  assert.equal(verifyPassword('hunter2', stored), true);
  assert.equal(verifyPassword('hunter3', stored), false);
  assert.equal(verifyPassword('x', 'garbage'), false);
});

test('tokens round-trip and reject tampering or expiry', () => {
  const token = signToken({ role: 'faculty', id: 1 }, 's3cret');
  assert.equal(readToken(token, 's3cret').role, 'faculty');
  assert.equal(readToken(token, 'other-secret'), null);
  assert.equal(readToken(token.slice(0, -2) + 'xx', 's3cret'), null);
  assert.equal(readToken(signToken({ role: 'student', id: 2 }, 's3cret', -10), 's3cret'), null);
  assert.equal(readToken('nonsense', 's3cret'), null);
});
