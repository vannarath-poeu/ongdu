import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { validateCardClasses, validateModelManifest, verifyModelBytes } from '../lib/card-detector/contract.ts';
import { letterboxGeometry, inverseBox } from '../lib/card-detector/geometry.ts';
const classes = JSON.parse(readFileSync(new URL('../models/card-recognition/classes.json', import.meta.url)));
const supported = { runtime: 'fixture-runtime', decoder: 'fixture-raw', annotationTarget: 'card-face', rules: 'fixture-rules' };
const fixture = () => ({ schemaVersion: 1, modelVersion: 'fixture-v1', runtimeCompatibility: supported.runtime, preprocessVersion: 'letterbox-rgb-v1', decoderVersion: supported.decoder, annotationTarget: supported.annotationTarget, classes: structuredClone(classes), input: { name: 'images', shape: [1,3,640,640], dtype: 'float32', color: 'RGB', scale: 1/255, padding: 114, rounding: 'round-half-up' }, assets: [{ url: '/models/card-recognition/fixture-v1/detector.onnx', bytes: 1, sha256: '0'.repeat(64), providers: ['webgpu','wasm'] }], postprocess: { candidateThreshold: .2, trustedThreshold: .8, rawCandidateLimit: 300, reviewLimit: 55, rulesVersion: supported.rules } });
test('verified class order covers all 52 identities without sorting', () => {
  assert.equal(validateCardClasses(classes)[0].label, '10C');
  assert.equal(validateCardClasses(classes)[39].label, 'AS');
  const reordered = structuredClone(classes).reverse().map((c,id) => ({...c,id}));
  const manifest = fixture(); manifest.classes = reordered;
  assert.equal(validateModelManifest(manifest,supported).classes[0].label, classes.at(-1).label);
});
test('rejects partial, duplicate, joker and unsupported class maps', () => {
  assert.throws(() => validateCardClasses(classes.slice(1)));
  for (const patch of [{id:4}, {rank:'WILD'}, {suit:'wild'}, {rank:classes[1].rank,suit:classes[1].suit}]) {
    const changed = structuredClone(classes); Object.assign(changed[0],patch);
    assert.throws(() => validateCardClasses(changed));
  }
});
test('rejects incompatible replacements, unbounded allocations and mixed-version assets', () => {
  assert.equal(validateModelManifest(fixture(),supported).modelVersion,'fixture-v1');
  for (const patch of [{schemaVersion:2}, {decoderVersion:'unknown'}, {runtimeCompatibility:'other'}, {annotationTarget:'corner-index'}, {preprocessVersion:'other'}]) assert.throws(() => validateModelManifest({...fixture(),...patch},supported));
  for (const url of ['https://example.org/model.onnx','//example.org/model.onnx','/models/card-recognition/old/detector.onnx','/models/card-recognition/fixture-v1/../other']) {
    const m=fixture(); m.assets[0].url=url; assert.throws(() => validateModelManifest(m,supported));
  }
  const m=fixture(); m.postprocess.rawCandidateLimit=100000; assert.throws(() => validateModelManifest(m,supported));
});
test('detects corrupt and partial model downloads before session creation', async () => {
  const bytes=new Uint8Array([7]).buffer;
  const hash=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
  await verifyModelBytes(bytes,{...fixture().assets[0],sha256:hash});
  await assert.rejects(verifyModelBytes(bytes,fixture().assets[0]));
  await assert.rejects(verifyModelBytes(new ArrayBuffer(0),fixture().assets[0]));
});
test('letterbox inverse uses rounded dimensions, clips padding and rejects malformed boxes', () => {
  for (const [width,height] of [[1200,800],[333,999],[1,640]]) {
    const g=letterboxGeometry(width,height);
    assert.deepEqual(inverseBox({x:g.left,y:g.top,width:g.resizedWidth,height:g.resizedHeight},g),{x:0,y:0,width,height});
    assert.equal(inverseBox({x:NaN,y:0,width:1,height:1},g),null);
  }
  assert.throws(()=>letterboxGeometry(10000,10000));
  assert.throws(()=>letterboxGeometry(0,1));
});
