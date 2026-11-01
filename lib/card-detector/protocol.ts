import type { DetectedCard } from '../card-recognition.ts';
export type Provider = 'wasm' | 'webgpu';
export interface ScanRequest { id: string; width: number; height: number; rgba: ArrayBuffer; provider: Provider }
export type ScanResponse = { id: string; type: 'progress'; stage: 'loading' | 'reading' } |
  { id: string; type: 'result'; cards: DetectedCard[]; provider: Provider; elapsedMs: number } |
  { id: string; type: 'error'; code: 'ASSET' | 'RUNTIME' | 'NO_CARDS' };
