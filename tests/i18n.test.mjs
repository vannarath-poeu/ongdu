import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

// Compile only the pure modules with the project's existing TypeScript dependency.
// This avoids adding a test runtime and supports the domain enum on Node versions
// whose built-in TypeScript support only strips types.
const temporary = mkdtempSync(join(tmpdir(), 'ongdu-i18n-'));
after(() => rmSync(temporary, { recursive: true, force: true }));
for (const file of ['lib/types.ts', 'lib/game-logic.ts', 'lib/i18n/messages.ts', 'lib/i18n/message.ts', 'lib/i18n/core.ts', 'lib/i18n/errors.ts']) {
  const output = join(temporary, file.replace(/\.ts$/, '.js'));
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, rewriteRelativeImportExtensions: true },
  }).outputText);
}
const require = createRequire(import.meta.url);
const { en, km } = require(join(temporary, 'lib/i18n/messages.js'));
const { translate, msg, formatMessage, formatHand, formatCard, formatPlayer, formatNumber } = require(join(temporary, 'lib/i18n/core.js'));
const { errorMessages, UIError } = require(join(temporary, 'lib/i18n/errors.js'));
const { HandType } = require(join(temporary, 'lib/types.js'));
const { evaluateHand, createDeck, checkBonuses } = require(join(temporary, 'lib/game-logic.js'));
const card = (rank, suit = 'hearts') => ({ id: `${rank}-${suit}`, rank, suit, isWild: rank === 'WILD' });
const wild = { id: 'wild-1', rank: 'WILD', suit: 'wild', isWild: true };

test('every English message has Khmer text and exactly matching placeholders', () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(km).sort());
  const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
  for (const key of Object.keys(en)) {
    if (key !== 'cardName') assert.match(km[key], /[\u1780-\u17ff]/, key);
    assert.deepEqual(placeholders(en[key]), placeholders(km[key]), key);
  }
});

test('complete sentence parameters survive a language change without changing stored messages', () => {
  const value = msg('foundCards', { count: 12 });
  const original = structuredClone(value);
  assert.match(formatMessage('en', value), /12 cards/);
  assert.match(formatMessage('km', value), /12/);
  assert.notEqual(formatMessage('en', value), formatMessage('km', value));
  assert.deepEqual(value, original);
  // Replacement values are data, including characters used in string replacements.
  assert.match(translate('km', 'invalidFormat', { token: '$&<script>' }), /\$&<script>/);
});

test('hand descriptions use evaluation data, including every hand category', () => {
  const cases = [
    [card('7'), card('7', 'clubs'), card('7', 'spades')],
    [card('J'), card('Q'), card('K')],
    [card('J'), card('Q', 'diamonds'), card('K', 'spades')],
    [card('8'), card('8', 'clubs'), wild],
    [card('J'), card('J', 'diamonds'), card('K', 'spades')],
    [card('2'), card('3'), card('4')],
    [card('2'), card('3', 'clubs'), wild],
  ];
  const types = new Set();
  for (const cards of cases) {
    const evaluation = evaluateHand(cards);
    types.add(evaluation.type);
    const original = structuredClone(evaluation);
    const copy = { ...evaluation, description: 'This text must never be parsed or displayed' };
    assert.match(formatHand('km', copy, cards), /[\u1780-\u17ff]/);
    assert.doesNotMatch(formatHand('en', copy, cards), /must never/);
    assert.deepEqual(evaluation, original);
  }
  assert.equal(types.size, 6);
  assert.equal(formatHand('en', { type: HandType.SUM_MODULO, value: 0 }, []), 'Invalid hand');
  const cards = cases[5];
  assert.match(formatHand('en', evaluateHand(cards), cards), /same suit/);
  assert.match(formatHand('km', evaluateHand(cases[6]), cases[6]), /បៀជំនួស/);
});

test('card notation stays recognizable while spoken names and built-in player names switch', () => {
  assert.equal(formatCard('en', card('J')), 'J of hearts');
  assert.match(formatCard('km', card('J')), /J/);
  assert.equal(formatCard('en', wild), 'Wildcard');
  const human = { id: 'human', name: 'You', isHuman: true };
  const opponent = { id: 'ai-0', name: 'Dragon', isHuman: false };
  assert.equal(formatPlayer('en', opponent), 'Dragon');
  assert.notEqual(formatPlayer('km', opponent), opponent.name);
  assert.equal(formatPlayer('en', human), 'You');
  assert.equal(formatPlayer('km', { id: 'external', name: 'Custom name', isHuman: false }), 'Custom name');
  assert.equal(human.name, 'You');
});

test('all expected errors have localized messages and stable worker-safe codes', () => {
  for (const [code, descriptor] of Object.entries(errorMessages)) {
    assert.match(formatMessage('km', descriptor), /[\u1780-\u17ff]/);
    assert.doesNotMatch(formatMessage('en', descriptor), /\{\w+\}/);
    const wire = structuredClone({ errorCode: new UIError(code).code });
    assert.equal(wire.errorCode, code);
  }
});

test('numbers use Latin digits and translating never mutates cards or rules results', () => {
  for (const locale of ['km', 'en']) {
    assert.match(formatNumber(locale, 1234), /1.*234/);
    assert.doesNotMatch(formatNumber(locale, 1234.5, 1), /[០-៩]/);
  }
  const deck = createDeck();
  assert.equal(deck.length, 55);
  const cards = deck.slice(0, 3);
  const original = structuredClone(cards);
  const evaluation = evaluateHand(cards);
  formatHand('km', evaluation, cards);
  formatHand('en', evaluation, cards);
  assert.deepEqual(cards, original);
  assert.deepEqual(evaluateHand(cards), evaluation);
  assert.equal(checkBonuses({ arrangement: null }).specialHandId, null);
});
