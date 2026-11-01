// Run the production recognizer unchanged, using the same canvas adapter as its image tests.
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createCanvas, Image } from '@napi-rs/canvas';
// Initialize the Node worker adapter before installing the canvas DOM.
import 'tesseract.js';
import { recognizeCardPhoto } from '../../lib/card-recognition.ts';

const [imagePath, cachePath] = process.argv.slice(2);
if (!imagePath || !cachePath) throw new Error('Expected image path and local OCR cache directory');
const image = resolve(imagePath), cache = resolve(cachePath);
await stat(resolve(cache, 'eng.traineddata'));
// createWorker('eng') reads its default cache from cwd. No app source is modified.
process.chdir(cache);
globalThis.document = { createElement: () => createCanvas(1, 1) };
globalThis.Image = Image;
const started = performance.now();
const source = `data:image/${image.toLowerCase().endsWith('.png') ? 'png' : 'jpeg'};base64,${(await readFile(image)).toString('base64')}`;
try {
  const cards = await recognizeCardPhoto(source, new AbortController().signal, () => {});
  console.log(JSON.stringify({ status: 'ok', elapsed_ms: performance.now() - started,
    cards: cards.map(({ rank, suit, uncertain, region }) => ({ rank, suit, uncertain, region })) }));
} catch (error) {
  console.log(JSON.stringify({ status: 'scan-error', error: String(error.message ?? error),
    elapsed_ms: performance.now() - started, cards: [] }));
}
