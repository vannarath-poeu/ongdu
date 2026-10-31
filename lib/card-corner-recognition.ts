import type { Rank, Suit } from './types.ts';
import type { CardRegion, DetectedCard } from './card-recognition.ts';

export interface InkComponent extends CardRegion {
  pixels: number[];
  red: boolean;
}
export interface CornerCandidate {
  rank: InkComponent;
  suit: InkComponent;
  angle: number;
  priority: number;
}

// Separate printed ink from its local background, rather than requiring an
// entire white card face. The integral image keeps local thresholding linear.
export function findInkComponents(data: Uint8ClampedArray, width: number, height: number): InkComponent[] {
  const gray = new Float32Array(width * height);
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      const i = y * width + x, p = i * 4;
      gray[i] = data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114;
      row += gray[i];
      integral[(y + 1) * (width + 1) + x + 1] = integral[y * (width + 1) + x + 1] + row;
    }
  }
  const radius = Math.max(7, Math.round(Math.max(width, height) / 55));
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x, p = i * 4;
    const left = Math.max(0, x - radius), right = Math.min(width, x + radius + 1);
    const top = Math.max(0, y - radius), bottom = Math.min(height, y + radius + 1);
    const sum = integral[bottom * (width + 1) + right] - integral[top * (width + 1) + right]
      - integral[bottom * (width + 1) + left] + integral[top * (width + 1) + left];
    const mean = sum / ((right - left) * (bottom - top));
    const red = data[p] - data[p + 1] > 35 && data[p] > data[p + 1] * 1.45 && data[p] > data[p + 2] * 1.3;
    mask[i] = (gray[i] < Math.min(150, mean - 22) || red) ? 1 : 0;
  }
  const seen = new Uint8Array(width * height), queue = new Int32Array(width * height);
  const components: InkComponent[] = [];
  const minSize = Math.max(4, Math.min(width, height) * 0.008);
  const maxSize = Math.max(width, height) * 0.1;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    let head = 0, tail = 1, left = width, right = 0, top = height, bottom = 0, redPixels = 0;
    seen[start] = 1; queue[0] = start;
    while (head < tail) {
      const i = queue[head++], x = i % width, y = Math.floor(i / width), p = i * 4;
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
      if (data[p] - data[p + 1] > 35 && data[p] > data[p + 1] * 1.45) redPixels++;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, next = ny * width + nx;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height || seen[next] || !mask[next]) continue;
        seen[next] = 1; queue[tail++] = next;
      }
    }
    const w = right - left + 1, h = bottom - top + 1;
    if (w < minSize || h < minSize || w > maxSize || h > maxSize || tail < 10 || w / h > 2.5 || h / w > 4) continue;
    components.push({ x: left, y: top, width: w, height: h, red: redPixels / tail > 0.5, pixels: Array.from(queue.subarray(0, tail)) });
  }
  return components;
}

export function pairCornerSymbols(components: InkComponent[]): CornerCandidate[] {
  const pairs: CornerCandidate[] = [];
  for (const rank of components) {
    const rankSize = Math.max(rank.width, rank.height);
    // Solid pips and clutter are poor rank candidates.
    const fill = rank.pixels.length / (rank.width * rank.height);
    if (fill < 0.12 || fill > 0.66 || rank.height < 8) continue;
    for (const suit of components) {
      if (rank === suit || rank.red !== suit.red) continue;
      const suitSize = Math.max(suit.width, suit.height);
      if (suitSize > rankSize * 0.94 || suitSize < rankSize * 0.36) continue;
      const dx = suit.x + suit.width / 2 - rank.x - rank.width / 2;
      const dy = suit.y + suit.height / 2 - rank.y - rank.height / 2;
      const distance = Math.hypot(dx, dy), angle = Math.atan2(dx, dy);
      if (dy < rankSize * 0.2 || Math.abs(angle) > Math.PI * 0.42 || distance < rankSize * 0.65 || distance > rankSize * 1.9) continue;
      pairs.push({ rank, suit, angle, priority: Math.abs(distance / rankSize - 1.1) + Math.abs(suitSize / rankSize - 0.65) });
    }
  }
  return pairs.sort((a, b) => a.priority - b.priority).slice(0, 100);
}

function canvas(width: number, height: number) {
  const result = document.createElement('canvas');
  result.width = width; result.height = height;
  return result;
}

function uprightGlyph(component: InkComponent, angle: number, sourceWidth: number): HTMLCanvasElement {
  const raw = canvas(component.width, component.height), ctx = raw.getContext('2d')!;
  ctx.fillStyle = 'white'; ctx.fillRect(0, 0, raw.width, raw.height);
  ctx.fillStyle = component.red ? '#bb1624' : 'black';
  for (const pixel of component.pixels) ctx.fillRect(pixel % sourceWidth - component.x, Math.floor(pixel / sourceWidth) - component.y, 1, 1);
  const size = Math.ceil(Math.hypot(raw.width, raw.height) + 6);
  const result = canvas(size, size), rctx = result.getContext('2d')!;
  rctx.fillStyle = 'white'; rctx.fillRect(0, 0, size, size);
  rctx.translate(size / 2, size / 2); rctx.rotate(angle);
  rctx.drawImage(raw, -raw.width / 2, -raw.height / 2);
  return result;
}

type RankReader = (image: HTMLCanvasElement) => Promise<{ rank: Rank | ''; confidence: number }>;
type SuitReader = (image: HTMLCanvasElement) => { suit: Suit | ''; uncertain: boolean; confidence: number };

export async function recognizeCardCorners(photo: HTMLCanvasElement, readRank: RankReader, readSuit: SuitReader, signal: AbortSignal, progress: (message: string) => void): Promise<DetectedCard[]> {
  const data = photo.getContext('2d')!.getImageData(0, 0, photo.width, photo.height).data;
  const pairs = pairCornerSymbols(findInkComponents(data, photo.width, photo.height));
  const detections: { card: DetectedCard; pair: CornerCandidate; score: number }[] = [];
  for (const [index, pair] of pairs.entries()) {
    signal.throwIfAborted();
    progress(`Reading exposed corners ${index + 1} of ${pairs.length}…`);
    const suit = readSuit(uprightGlyph(pair.suit, pair.angle, photo.width));
    if (!suit.suit || suit.confidence < 0.76) continue;
    const rank = await readRank(uprightGlyph(pair.rank, pair.angle, photo.width));
    if (!rank.rank || rank.confidence < 35) continue;
    const size = Math.max(pair.rank.width, pair.rank.height);
    const preview = canvas(Math.ceil(size * 2.5), Math.ceil(size * 3.5));
    const ctx = preview.getContext('2d')!;
    ctx.fillStyle = 'white'; ctx.fillRect(0, 0, preview.width, preview.height);
    ctx.translate(preview.width / 2, size); ctx.rotate(pair.angle);
    ctx.drawImage(photo, -pair.rank.x - pair.rank.width / 2, -pair.rank.y - pair.rank.height / 2);
    const left = Math.min(pair.rank.x, pair.suit.x), top = Math.min(pair.rank.y, pair.suit.y);
    const right = Math.max(pair.rank.x + pair.rank.width, pair.suit.x + pair.suit.width);
    const bottom = Math.max(pair.rank.y + pair.rank.height, pair.suit.y + pair.suit.height);
    detections.push({ pair, score: rank.confidence / 100 + suit.confidence - pair.priority * 0.1,
      card: { rank: rank.rank, suit: suit.suit, preview: preview.toDataURL('image/jpeg', 0.85), uncertain: rank.confidence < 80 || suit.uncertain,
        region: { x: left / photo.width, y: top / photo.height, width: (right - left) / photo.width, height: (bottom - top) / photo.height } } });
  }
  // One symbol may be paired with several neighbours. Keep only the strongest
  // interpretation, and don't count a corner's suit again as another card rank.
  detections.sort((a, b) => b.score - a.score);
  const used = new Set<InkComponent>();
  const selected = detections.filter(item => {
    if (used.has(item.pair.rank) || used.has(item.pair.suit)) return false;
    used.add(item.pair.rank); used.add(item.pair.suit);
    return true;
  });
  return selected.sort((a, b) => a.pair.rank.x - b.pair.rank.x).slice(0, 55).map(item => item.card);
}
