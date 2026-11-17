import './setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { classesCanSkip, classesNeeded, summarise, tierFor, worstTier } from '../src/calc.js';

test('tier boundaries are exact', () => {
  assert.equal(tierFor(12, 16), 'safe'); // exactly 75%
  assert.equal(tierFor(11, 16), 'warning'); // 68.75%
  assert.equal(tierFor(13, 20), 'warning'); // exactly 65%
  assert.equal(tierFor(10, 16), 'critical'); // 62.5%
  assert.equal(tierFor(0, 0), 'none');
});

test('classesNeeded matches the closed-form formula from the brief', () => {
  for (let held = 1; held <= 60; held++) {
    for (let attended = 0; attended <= held; attended++) {
      const formula = Math.max(0, Math.ceil((0.75 * held - attended) / 0.25));
      assert.equal(classesNeeded(attended, held), formula, `${attended}/${held}`);
    }
  }
});

test('attending exactly the needed classes lands on 75%, one fewer does not', () => {
  const needed = classesNeeded(10, 16);
  assert.equal(needed, 8);
  assert.equal(tierFor(10 + needed, 16 + needed), 'safe');
  assert.notEqual(tierFor(10 + needed - 1, 16 + needed - 1), 'safe');
});

test('classesCanSkip never drops a safe student below 75%', () => {
  for (let held = 4; held <= 40; held++) {
    for (let attended = 0; attended <= held; attended++) {
      if (tierFor(attended, held) !== 'safe') continue;
      const skip = classesCanSkip(attended, held);
      assert.equal(tierFor(attended, held + skip), 'safe');
      assert.notEqual(tierFor(attended, held + skip + 1), 'safe');
    }
  }
});

test('summarise and worstTier', () => {
  const s = summarise(10, 16);
  assert.equal(s.pct, 62.5);
  assert.equal(s.tier, 'critical');
  assert.equal(s.needed, 8);
  assert.equal(summarise(0, 0).pct, null);
  assert.equal(worstTier(['safe', 'none', 'warning']), 'warning');
  assert.equal(worstTier(['none']), 'none');
});
