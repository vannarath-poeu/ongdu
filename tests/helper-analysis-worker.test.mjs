import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { Worker } from 'node:worker_threads';
import ts from 'typescript';

// Exercise the real browser worker handler in a Node worker, with only the
// transport adapted. Transpile into temp so existing library imports stay intact.
const directory = await mkdtemp(join(tmpdir(), 'ongdu-helper-worker-'));
for (const name of ['types', 'game-logic', 'expected-value', 'helper-analysis.worker']) {
  const source = await readFile(new URL(`../lib/${name}.ts`, import.meta.url), 'utf8');
  let { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  outputText = outputText.replace(/require\("\.\/([^".]+(?:\.worker)?)"\)/g, 'require("./$1.cjs")');
  await writeFile(join(directory, `${name}.cjs`), outputText);
}
await writeFile(join(directory, 'transport.cjs'), `
const { parentPort } = require('node:worker_threads');
global.self = { postMessage: response => parentPort.postMessage(response) };
require('./helper-analysis.worker.cjs');
parentPort.on('message', data => self.onmessage({ data }));
`);
const require = createRequire(import.meta.url);
const { validateArrangement } = require(join(directory, 'game-logic.cjs'));
after(() => rm(directory, { recursive: true, force: true }));

function hand(count) {
  return ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J'].slice(0, count).map((rank, i) => ({
    id: `test-${i}`, rank, suit: ['hearts', 'diamonds', 'clubs', 'spades'][i % 4], isWild: false,
  }));
}
function request(worker, data) {
  return new Promise((resolve, reject) => {
    worker.once('message', resolve); worker.once('error', reject); worker.postMessage(data);
  });
}

for (const count of [9, 10]) {
  test(`${count}-card analysis returns valid arrangements with matching request IDs`, { timeout: 120_000 }, async () => {
    const worker = new Worker(join(directory, 'transport.cjs'));
    try {
      const cards = hand(count);
      const response = await request(worker, { id: count, cards, opponents: 1 });
      assert.equal(response.id, count);
      assert.equal(response.error, undefined);
      assert.ok(response.results.length > 0 && response.results.length <= 4);
      for (const result of response.results) {
        assert.ok(validateArrangement(result.arrangement));
        const used = ['top', 'middle', 'bottom'].flatMap(layer => result.arrangement[layer].cards);
        assert.equal(new Set(used.map(card => card.id)).size, 9);
        assert.ok(used.every(card => cards.some(original => original.id === card.id)));
        if (count === 10) {
          assert.ok(result.discardedCard);
          assert.ok(!used.some(card => card.id === result.discardedCard.id));
        }
      }
    } finally { await worker.terminate(); }
  });
}

test('invalid input produces a recoverable response, and the worker can accept a retry', { timeout: 120_000 }, async () => {
  const worker = new Worker(join(directory, 'transport.cjs'));
  try {
    const invalid = await request(worker, { id: 20, cards: hand(8), opponents: 1 });
    assert.equal(invalid.id, 20);
    assert.match(invalid.error, /9 or 10/);
    const retry = await request(worker, { id: 21, cards: hand(9), opponents: 1 });
    assert.equal(retry.id, 21);
    assert.ok(retry.results.length);
  } finally { await worker.terminate(); }
});

test('a running search can be terminated without waiting for its result', { timeout: 10_000 }, async () => {
  const worker = new Worker(join(directory, 'transport.cjs'));
  await new Promise(resolve => worker.once('online', resolve));
  worker.postMessage({ id: 30, cards: hand(10), opponents: 5 });
  await new Promise(resolve => setTimeout(resolve, 20));
  await worker.terminate();
  assert.equal(worker.threadId, -1);
});
