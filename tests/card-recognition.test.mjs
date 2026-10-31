import assert from 'node:assert/strict';
import test from 'node:test';
import { detectedCardsToHand, findCardRegions, recognizeCardPhoto, validateDetectedCards } from '../lib/card-recognition.ts';
import { findInkComponents, pairCornerSymbols } from '../lib/card-corner-recognition.ts';

const validHand = () => ['2', '3', '4', '5', '6', '7', '8', '9', '10'].map(rank => ({ rank, suit: 'hearts', preview: '', uncertain: false }));

test('accepts nine or ten reviewed cards and creates unique domain IDs', () => {
  const cards = validHand();
  assert.equal(validateDetectedCards(cards), null);
  cards.push({ rank: 'A', suit: 'spades', preview: '', uncertain: false });
  const hand = detectedCardsToHand(cards);
  assert.equal(hand.length, 10);
  assert.equal(new Set(hand.map(card => card.id)).size, 10);
  assert.ok(hand.every(card => !card.isWild));
});

test('rejects wrong counts, missing values, duplicates and too many wildcards', () => {
  assert.match(validateDetectedCards(validHand().slice(0, 8)), /exactly 9 or 10/);
  const cards = validHand();
  cards[0].rank = '';
  assert.match(validateDetectedCards(cards), /rank and suit/);
  cards[0] = { ...cards[1] };
  assert.match(validateDetectedCards(cards), /Duplicate/);
  for (let i = 0; i < 4; i++) cards[i] = { ...cards[i], rank: 'WILD', suit: '' };
  assert.match(validateDetectedCards(cards), /Maximum 3/);
  assert.throws(() => detectedCardsToHand(cards), /Maximum 3/);
});

test('wildcards receive the game wildcard suit without requiring a printed suit', () => {
  const cards = validHand();
  for (let i = 0; i < 3; i++) cards[i] = { ...cards[i], rank: 'WILD', suit: '' };
  const hand = detectedCardsToHand(cards);
  assert.ok(hand.slice(0, 3).every(card => card.isWild && card.suit === 'wild' && card.rank === 'WILD'));
});

test('isolates separated card faces and sorts by row then column', () => {
  const width = 360, height = 360;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const expected = [];
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
    const box = { x: 15 + col * 115, y: 10 + row * 115, width: 65, height: 100 };
    expected.push(box);
    for (let y = box.y; y < box.y + box.height; y++) for (let x = box.x; x < box.x + box.width; x++) {
      pixels.fill(255, (y * width + x) * 4, (y * width + x) * 4 + 4);
    }
  }
  // Small white glare and landscape clutter must not become extra cards.
  pixels.fill(255, 0, 16);
  assert.deepEqual(findCardRegions(pixels, width, height), expected);
});

test('does not invent cards on blank dark or light backgrounds', () => {
  assert.deepEqual(findCardRegions(new Uint8ClampedArray(100 * 100 * 4), 100, 100), []);
  assert.deepEqual(findCardRegions(new Uint8ClampedArray(100 * 100 * 4).fill(255), 100, 100), []);
});

test('a cancelled scan rejects before decoding the photo or starting OCR', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(recognizeCardPhoto('unused', controller.signal, () => {}), { name: 'AbortError' });
});

test('corner pairing supports rotation without requiring a separate card face', () => {
  const rank = { x: 20, y: 20, width: 20, height: 30, red: false, pixels: Array(240).fill(0) };
  const suit = { x: 38, y: 52, width: 14, height: 16, red: false, pixels: Array(140).fill(0) };
  const otherColor = { ...suit, red: true };
  const pairs = pairCornerSymbols([rank, suit, otherColor]);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].rank, rank);
  assert.equal(pairs[0].suit, suit);
  assert.ok(pairs[0].angle > 0 && pairs[0].angle < Math.PI / 2);
});

test('local ink segmentation works on a gray background without dark card edges', () => {
  const w = 160, h = 160, pixels = new Uint8ClampedArray(w * h * 4).fill(190);
  const mark = (x, y, width, height, color) => {
    for (let yy = y; yy < y + height; yy++) for (let xx = x; xx < x + width; xx++) pixels.set([...color, 255], (yy * w + xx) * 4);
  };
  mark(30, 40, 5, 12, [15, 15, 15]);
  mark(90, 70, 6, 10, [190, 20, 40]);
  const components = findInkComponents(pixels, w, h);
  assert.equal(components.length, 2);
  assert.deepEqual(components.map(({ x, y, red }) => ({ x, y, red })), [{ x: 30, y: 40, red: false }, { x: 90, y: 70, red: true }]);
});

test('more than ten detections must be reduced to a legal helper hand', () => {
  const cards = validHand();
  cards.push(...['J', 'Q', 'K', 'A'].map(rank => ({ rank, suit: 'spades', preview: '', uncertain: false })));
  assert.match(validateDetectedCards(cards), /exactly 9 or 10/);
  assert.equal(validateDetectedCards(cards.slice(0, 10)), null);
});
