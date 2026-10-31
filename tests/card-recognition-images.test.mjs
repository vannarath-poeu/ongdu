import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createCanvas, Image } from '@napi-rs/canvas';
// Initialize Tesseract's Node adapter before installing the minimal canvas DOM.
import 'tesseract.js';
import { recognizeCardPhoto } from '../lib/card-recognition.ts';

const referencePhoto = process.env.ONGDU_FAN_REFERENCE_PHOTO ? resolve(process.env.ONGDU_FAN_REFERENCE_PHOTO) : null;
const cache = join(tmpdir(), 'ongdu-ocr-tests');
await mkdir(cache, { recursive: true });
// Tesseract caches traineddata in cwd on Node; keep generated files out of Git.
process.chdir(cache);
globalThis.document = { createElement: () => createCanvas(1, 1) };
globalThis.Image = Image;

function generatedHand(ranks, columns, font) {
  const rows = Math.ceil(ranks.length / columns);
  const image = createCanvas(columns * 290 + 30, rows * 390 + 30), ctx = image.getContext('2d');
  ctx.fillStyle = '#164038'; ctx.fillRect(0, 0, image.width, image.height);
  const symbols = ['♥', '♦', '♣', '♠'];
  for (const [i, rank] of ranks.entries()) {
    const x = 25 + i % columns * 290, y = 20 + Math.floor(i / columns) * 390;
    ctx.fillStyle = 'white'; ctx.fillRect(x, y, 240, 340);
    ctx.fillStyle = i % 4 < 2 ? '#c51626' : '#111111';
    ctx.font = `44px ${font}`; ctx.fillText(rank, x + 14, y + 52);
    ctx.font = `40px ${font}`; ctx.fillText(symbols[i % 4], x + 14, y + 98);
  }
  return image.toDataURL('image/png');
}

for (const font of ['serif', 'sans-serif']) {
  test(`reads nine upright cards including all suits (${font})`, { timeout: 120_000 }, async () => {
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '10', 'A'];
    const cards = await recognizeCardPhoto(generatedHand(ranks, 3, font), new AbortController().signal, () => {});
    assert.equal(cards.length, ranks.length);
    assert.deepEqual(cards.map(card => card.rank), ranks);
    assert.deepEqual(cards.map(card => card.suit), ranks.map((_, i) => ['hearts', 'diamonds', 'clubs', 'spades'][i % 4]));
    assert.ok(cards.every(card => card.region && card.region.x >= 0 && card.region.x + card.region.width <= 1));
  });
}

test('reads ten cards including face cards', { timeout: 120_000 }, async () => {
  const ranks = ['J', 'Q', 'K', 'A', '10', '9', '8', '7', '6', '5'];
  const cards = await recognizeCardPhoto(generatedHand(ranks, 5, 'serif'), new AbortController().signal, () => {});
  assert.deepEqual(cards.map(card => card.rank), ranks);
  assert.deepEqual(cards.map(card => card.suit), ranks.map((_, i) => ['hearts', 'diamonds', 'clubs', 'spades'][i % 4]));
});

test('cancels an active OCR job without returning stale cards', { timeout: 120_000 }, async () => {
  const controller = new AbortController();
  const source = generatedHand(['2', '3', '4', '5', '6', '7', '8', '10', 'A'], 3, 'serif');
  await assert.rejects(recognizeCardPhoto(source, controller.signal, message => {
    if (message.startsWith('Reading card')) setTimeout(() => controller.abort(), 0);
  }), { name: 'AbortError' });
});

test('recognizes all thirteen exposed corners in the supplied fan reference', { skip: !referencePhoto, timeout: 120_000 }, async () => {
  const source = `data:image/jpeg;base64,${(await readFile(referencePhoto)).toString('base64')}`;
  const cards = await recognizeCardPhoto(source, new AbortController().signal, () => {});
  const expected = ['2-spades', '3-clubs', '4-diamonds', '4-spades', '4-hearts', '5-clubs', '5-spades', '5-diamonds', '7-diamonds', '8-spades', '9-diamonds', '9-clubs', '9-spades'];
  assert.deepEqual(cards.map(card => `${card.rank}-${card.suit}`), expected);
});
