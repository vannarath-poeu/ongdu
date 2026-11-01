import type { Rank, Suit } from '../types.ts';

export interface CardClass { id: number; label: string; rank: Rank; suit: Suit }
export interface ModelManifest {
  schemaVersion: 1;
  modelVersion: string;
  runtimeCompatibility: string;
  preprocessVersion: 'letterbox-rgb-v1';
  decoderVersion: string;
  annotationTarget: 'corner-index' | 'card-face';
  classes: CardClass[];
  input: { name: string; shape: [1, 3, 640, 640]; dtype: 'float32'; color: 'RGB'; scale: number; padding: 114; rounding: 'round-half-up' };
  assets: { url: string; bytes: number; sha256: string; providers: ('webgpu' | 'wasm')[] }[];
  postprocess: { candidateThreshold: number; trustedThreshold: number; rawCandidateLimit: number; reviewLimit: number; rulesVersion: string };
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a model contract object.');
  return value as Record<string, unknown>;
}
function requireValue(condition: unknown, field: string): asserts condition {
  if (!condition) throw new Error(`Incompatible card model: ${field}.`);
}
function text(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && value.length <= 200; }

export function validateCardClasses(value: unknown): CardClass[] {
  requireValue(Array.isArray(value) && value.length === 52, '52 fixed classes required');
  const identities = new Set<string>();
  return value.map((entry: unknown, id: number) => {
    const item = object(entry);
    requireValue(item.id === id && text(item.label), 'contiguous class IDs and labels');
    requireValue(typeof item.rank === 'string' && ['2','3','4','5','6','7','8','9','10','J','Q','K','A'].includes(String(item.rank)), 'ordinary rank');
    requireValue(typeof item.suit === 'string' && ['clubs','diamonds','hearts','spades'].includes(String(item.suit)), 'ordinary suit');
    const key = `${item.rank}/${item.suit}`;
    requireValue(!identities.has(key), 'duplicate class identity');
    identities.add(key);
    return { id, label: item.label, rank: item.rank as Rank, suit: item.suit as Suit };
  });
}

// Adapters must explicitly opt into their verified export and physical-instance policy.
// There is deliberately no default decoder before Gate B establishes the actual graph.
export function validateModelManifest(value: unknown, supported: {
  runtime: string; decoder: string; annotationTarget: ModelManifest['annotationTarget']; rules: string;
}): ModelManifest {
  const m = object(value);
  requireValue(m.schemaVersion === 1, 'schema version');
  requireValue(text(m.modelVersion) && /^[a-zA-Z0-9._-]+$/.test(m.modelVersion), 'immutable model version');
  requireValue(m.runtimeCompatibility === supported.runtime, 'runtime version');
  requireValue(m.decoderVersion === supported.decoder && text(m.decoderVersion), 'decoder version');
  requireValue(m.annotationTarget === supported.annotationTarget, 'annotation policy');
  requireValue(m.preprocessVersion === 'letterbox-rgb-v1', 'preprocessing version');
  const classes = validateCardClasses(m.classes);
  const input = object(m.input);
  requireValue(text(input.name) && JSON.stringify(input.shape) === '[1,3,640,640]' && input.dtype === 'float32' && input.color === 'RGB' && input.scale === 1 / 255 && input.padding === 114 && input.rounding === 'round-half-up', 'input contract');
  requireValue(Array.isArray(m.assets) && m.assets.length === 1, 'one FP32 baseline asset');
  const assets = m.assets.map((entry: unknown) => {
    const asset = object(entry);
    requireValue(typeof asset.url === 'string' && asset.url.startsWith(`/models/card-recognition/${m.modelVersion}/`) && !asset.url.includes('..') && /^[/a-zA-Z0-9._-]+$/.test(asset.url), 'same-origin versioned asset URL');
    requireValue(Number.isSafeInteger(asset.bytes) && Number(asset.bytes) > 0 && Number(asset.bytes) <= 32 * 1024 * 1024, 'asset size');
    requireValue(typeof asset.sha256 === 'string' && /^[a-f0-9]{64}$/.test(asset.sha256), 'asset SHA-256');
    requireValue(Array.isArray(asset.providers) && asset.providers.includes('wasm') && asset.providers.every(p => p === 'wasm' || p === 'webgpu') && new Set(asset.providers).size === asset.providers.length, 'execution providers');
    return asset as unknown as ModelManifest['assets'][number];
  });
  const post = object(m.postprocess);
  requireValue(typeof post.candidateThreshold === 'number' && typeof post.trustedThreshold === 'number' && post.candidateThreshold > 0 && post.trustedThreshold <= 1 && post.candidateThreshold <= post.trustedThreshold, 'thresholds');
  requireValue(Number.isInteger(post.rawCandidateLimit) && Number(post.rawCandidateLimit) >= 110 && Number(post.rawCandidateLimit) <= 2000 && Number.isInteger(post.reviewLimit) && Number(post.reviewLimit) > 0 && Number(post.reviewLimit) <= 55, 'candidate safety caps');
  requireValue(post.rulesVersion === supported.rules && text(post.rulesVersion), 'physical-instance rules');
  return { ...m, classes, assets } as unknown as ModelManifest;
}

export async function verifyModelBytes(bytes: ArrayBuffer, asset: ModelManifest['assets'][number]): Promise<void> {
  requireValue(bytes.byteLength === asset.bytes, 'download byte length');
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  requireValue(hex === asset.sha256, 'download SHA-256');
}
