import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_LENGTH_OPTIONS, getStartingCash } from '../lib/game-setup.ts';

test('bankroll presets grow with duration and table size', () => {
  for (let players = 2; players <= 6; players++) {
    let previous = 0;
    for (const { value } of GAME_LENGTH_OPTIONS) {
      const cash = getStartingCash(players, value);
      assert.ok(Number.isInteger(cash) && cash > previous);
      if (players > 2) assert.ok(cash > getStartingCash(players - 1, value));
      previous = cash;
    }
  }
  assert.equal(getStartingCash(4, 'standard'), 60);
});

test('rejects table sizes outside the game rules', () => {
  for (const players of [0, 1, 7, 2.5, NaN, Infinity]) {
    assert.throws(() => getStartingCash(players, 'standard'), /2 and 6/);
  }
});
