import { validateModelManifest, type ModelManifest, type CardClass } from './contract.ts';
import { inverseBox, letterboxGeometry, type Box } from './geometry.ts';

export const RUNTIME_VERSION = '1.23.2';
export const MODEL_MANIFEST_URL = '/models/card-recognition/yolo26n-epoch4-d7f58ee5-single-deck-v1/manifest.json';
export type Mode = 'raw' | 'nms-free';
export interface Yolo26Manifest extends ModelManifest {
  architecture: 'yolo26n';
  experimental: true;
  output: { name: string; shape: number[]; dtype: 'float32'; mode: Mode };
}
export interface Detection { classId: number; confidence: number; box: Box }

export function validateYolo26Manifest(value: unknown): Yolo26Manifest {
  if (!value || typeof value !== 'object') throw new Error('Missing YOLO26 manifest.');
  const candidate = value as Partial<Yolo26Manifest>;
  const mode = candidate.output?.mode;
  if (mode !== 'raw' && mode !== 'nms-free') throw new Error('Unsupported YOLO26 head.');
  const m = validateModelManifest(value, { runtime: RUNTIME_VERSION, decoder: `yolo26-${mode}-v1`, annotationTarget: 'corner-index', rules: 'single-deck-identities-v1' });
  if (candidate.architecture !== 'yolo26n' || candidate.experimental !== true ||
      candidate.output?.dtype !== 'float32' || typeof candidate.output.name !== 'string' || !candidate.output.name ||
      JSON.stringify(candidate.output.shape) !== JSON.stringify(mode === 'raw' ? [1,56,8400] : [1,300,6])) {
    throw new Error('Incompatible YOLO26 output contract.');
  }
  return m as Yolo26Manifest;
}

// Deterministic RGB letterbox in the worker, with a main-thread fallback requiring no OffscreenCanvas.
export function prepareTensor(rgba: Uint8ClampedArray, width: number, height: number): Float32Array {
  const g = letterboxGeometry(width, height);
  if (rgba.length !== width * height * 4) throw new Error('Malformed image pixels.');
  const output = new Float32Array(3 * 640 * 640).fill(114 / 255);
  for (let y = 0; y < g.resizedHeight; y++) {
    const sy = Math.max(0, (y + 0.5) * height / g.resizedHeight - 0.5);
    const y0 = Math.floor(sy), y1 = Math.min(height - 1, y0 + 1), fy = sy - y0;
    for (let x = 0; x < g.resizedWidth; x++) {
      const sx = Math.max(0, (x + 0.5) * width / g.resizedWidth - 0.5);
      const x0 = Math.floor(sx), x1 = Math.min(width - 1, x0 + 1), fx = sx - x0;
      for (let c = 0; c < 3; c++) {
        const top = rgba[(y0 * width + x0) * 4 + c] * (1 - fx) + rgba[(y0 * width + x1) * 4 + c] * fx;
        const bottom = rgba[(y1 * width + x0) * 4 + c] * (1 - fx) + rgba[(y1 * width + x1) * 4 + c] * fx;
        output[c * 640 * 640 + (y + g.top) * 640 + x + g.left] = Math.round(top * (1 - fy) + bottom * fy) / 255;
      }
    }
  }
  return output;
}

function overlap(a: Box, b: Box): number {
  const intersection = Math.max(0, Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)) * Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
  return intersection / (a.width*a.height+b.width*b.height-intersection);
}

export function mergeSingleDeckDetections(detections: readonly Detection[], classes: readonly CardClass[], trustedThreshold: number): (Detection & { uncertain: boolean })[] {
  // Ongdu has one copy of each ordinary identity. Opposite corners share a card
  // even when they are far apart; retain the strongest corner for its preview.
  const key = (detection: Detection) => `${classes[detection.classId].rank}/${classes[detection.classId].suit}`;
  const strongest = new Map<string, Detection>();
  const conflicts = new Set<string>();
  for (let i = 0; i < detections.length; i++) {
    const detection = detections[i], identity = key(detection);
    const previous = strongest.get(identity);
    if (!previous || detection.confidence > previous.confidence) strongest.set(identity, detection);
    for (let j = i + 1; j < detections.length; j++) {
      const other = detections[j], otherIdentity = key(other);
      if (identity !== otherIdentity && overlap(detection.box, other.box) > 0.5) {
        conflicts.add(identity); conflicts.add(otherIdentity);
      }
    }
  }
  return [...strongest.entries()]
    .sort(([, a], [, b]) => b.confidence - a.confidence)
    .map(([identity, detection]) => ({ ...detection, uncertain: detection.confidence < trustedThreshold || conflicts.has(identity) }));
}

export function decodeYolo26(data: Float32Array, shape: readonly number[], manifest: Yolo26Manifest, width: number, height: number): Detection[] {
  if (JSON.stringify(shape) !== JSON.stringify(manifest.output.shape) || data.length !== shape.reduce((a,b)=>a*b,1)) throw new Error('Unexpected model output layout.');
  for (const value of data) if (!Number.isFinite(value)) throw new Error('Non-finite model output.');
  const candidates: Detection[] = [];
  const threshold = manifest.postprocess.candidateThreshold;
  const raw = manifest.output.mode === 'raw';
  const count = raw ? 8400 : 300;
  for (let i = 0; i < count; i++) {
    let classId = 0, confidence = 0;
    let box: Box;
    if (raw) {
      for (let c = 0; c < 52; c++) {
        const score = data[(4+c)*count+i];
        if (score < 0 || score > 1) throw new Error('Invalid class score.');
        if (score > confidence) { confidence = score; classId = c; }
      }
      const w=data[2*count+i], h=data[3*count+i];
      box = {x:data[i]-w/2,y:data[count+i]-h/2,width:w,height:h};
    } else {
      confidence=data[i*6+4]; classId=data[i*6+5];
      if (confidence<0 || confidence>1 || !Number.isInteger(classId) || classId<0 || classId>=52) throw new Error('Invalid detection.');
      box={x:data[i*6],y:data[i*6+1],width:data[i*6+2]-data[i*6],height:data[i*6+3]-data[i*6+1]};
    }
    if (confidence >= threshold && box.width>0 && box.height>0) candidates.push({classId,confidence,box});
  }
  candidates.sort((a,b)=>b.confidence-a.confidence);
  const kept: Detection[]=[];
  for (const candidate of candidates) {
    // One-to-one outputs must never get a second NMS pass. Spatially distinct corners remain reviewable.
    if (raw && kept.some(other=>other.classId===candidate.classId && overlap(other.box,candidate.box)>0.7)) continue;
    kept.push(candidate);
    if (kept.length===manifest.postprocess.rawCandidateLimit) break;
  }
  const geometry=letterboxGeometry(width,height);
  return kept.flatMap(detection=>{
    const box=inverseBox(detection.box,geometry);
    return box ? [{...detection,box}] : [];
  });
}
