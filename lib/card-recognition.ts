import type { Card, Rank, Suit } from './types.ts';
import { recognizeCardCorners } from './card-corner-recognition.ts';

export interface CardRegion { x: number; y: number; width: number; height: number }
export interface DetectedCard {
  rank: Rank | 'WILD' | '';
  suit: Suit | '';
  preview: string;
  uncertain: boolean;
  included?: boolean;
  /** Bounds in normalized photo coordinates, used for review overlays. */
  region?: CardRegion;
}

export const SCAN_RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

// Find separate, light card faces against a darker table. Restrict this first
// version to upright cards so we never silently read a rotated corner as a card.
export function findCardRegions(pixels: Uint8ClampedArray, width: number, height: number): CardRegion[] {
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const light = (i: number) => {
    const p = i * 4;
    return Math.min(pixels[p], pixels[p + 1], pixels[p + 2]) > 145;
  };
  const regions: CardRegion[] = [];
  for (let start = 0; start < visited.length; start++) {
    if (visited[start] || !light(start)) continue;
    let head = 0, tail = 1;
    queue[0] = start;
    visited[start] = 1;
    let left = width, right = 0, top = height, bottom = 0;
    while (head < tail) {
      const i = queue[head++], x = i % width, y = Math.floor(i / width);
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
      for (const next of [x > 0 ? i - 1 : -1, x + 1 < width ? i + 1 : -1, i - width, i + width]) {
        if (next < 0 || next >= visited.length || visited[next] || !light(next)) continue;
        visited[next] = 1;
        queue[tail++] = next;
      }
    }
    const w = right - left + 1, h = bottom - top + 1;
    if (w >= 30 && h >= 45 && w / h > 0.4 && w / h < 0.88 &&
        w * h > width * height * 0.008 && w * h < width * height * 0.8 && tail / (w * h) > 0.55) {
      regions.push({ x: left, y: top, width: w, height: h });
    }
  }
  // Group approximate rows before sorting left to right.
  regions.sort((a, b) => a.y - b.y);
  const rows: CardRegion[][] = [];
  for (const region of regions) {
    const row = rows.find(items => Math.abs(items[0].y - region.y) < Math.min(items[0].height, region.height) * 0.35);
    if (row) row.push(region); else rows.push([region]);
  }
  return rows.flatMap(row => row.sort((a, b) => a.x - b.x));
}

export function validateDetectedCards(cards: Pick<DetectedCard, 'rank' | 'suit'>[]): string | null {
  if (cards.length !== 9 && cards.length !== 10) return 'Review exactly 9 or 10 cards before using this hand.';
  const seen = new Set<string>();
  let wilds = 0;
  for (const card of cards) {
    if (card.rank === 'WILD') {
      if (++wilds > 3) return 'Maximum 3 wildcards allowed.';
      continue;
    }
    if (!card.rank || !SCAN_RANKS.includes(card.rank) || !['hearts', 'diamonds', 'clubs', 'spades'].includes(card.suit)) {
      return 'Choose a rank and suit for every card.';
    }
    const key = `${card.rank}-${card.suit}`;
    if (seen.has(key)) return `Duplicate card: ${card.rank} of ${card.suit}. Correct or remove it.`;
    seen.add(key);
  }
  return null;
}

export function detectedCardsToHand(cards: DetectedCard[]): Card[] {
  const error = validateDetectedCards(cards);
  if (error) throw new Error(error);
  return cards.map((card, index) => ({
    id: `scan-${crypto.randomUUID()}-${index}`,
    rank: card.rank as Rank | 'WILD',
    suit: card.rank === 'WILD' ? 'wild' : card.suit as Suit,
    isWild: card.rank === 'WILD',
  }));
}

function canvas(width: number, height: number) {
  const result = document.createElement('canvas');
  result.width = width; result.height = height;
  return result;
}

// Normalize the ink bounding box to compare suit silhouettes independently of size.
function silhouette(image: HTMLCanvasElement): number[] | null {
  const ctx = image.getContext('2d')!;
  const { data } = ctx.getImageData(0, 0, image.width, image.height);
  let left = image.width, right = -1, top = image.height, bottom = -1;
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    const i = (y * image.width + x) * 4;
    if (Math.min(data[i], data[i + 1], data[i + 2]) < 130) {
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) return null;
  const normalized = canvas(24, 32), nctx = normalized.getContext('2d')!;
  nctx.fillStyle = 'white'; nctx.fillRect(0, 0, 24, 32);
  nctx.drawImage(image, left, top, right - left + 1, bottom - top + 1, 0, 0, 24, 32);
  const pixels = nctx.getImageData(0, 0, 24, 32).data;
  return Array.from({ length: 768 }, (_, i) => Math.min(pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2]) < 150 ? 1 : 0);
}

function readSuit(image: HTMLCanvasElement): { suit: Suit | ''; uncertain: boolean; confidence: number } {
  const target = silhouette(image);
  if (!target) return { suit: '', uncertain: true, confidence: 0 };
  const pixels = image.getContext('2d')!.getImageData(0, 0, image.width, image.height).data;
  let red = 0, ink = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) < 130) {
      ink++;
      if (pixels[i] > pixels[i + 1] * 1.4 && pixels[i] > pixels[i + 2] * 1.3) red++;
    }
  }
  const symbols: [Suit, string][] = red / ink > 0.4
    ? [['hearts', '♥'], ['diamonds', '♦']]
    : [['clubs', '♣'], ['spades', '♠']];
  // A spade widens from a pointed tip; a club has a rounded top lobe and neck.
  // This distinguishes small, blurred black symbols whose template overlaps
  // can otherwise be nearly identical after size normalization.
  const rowWidth = (y: number) => target.slice(y * 24, (y + 1) * 24).reduce((sum, value) => sum + value, 0);
  const growth = (rowWidth(7) + rowWidth(8) + rowWidth(9) - rowWidth(3) - rowWidth(4) - rowWidth(5)) / 3;
  const blackShape: Suit | null = growth > 3 ? 'spades' : growth < 1.8 ? 'clubs' : null;
  const scores = symbols.map(([suit, symbol]) => {
    let score = 0;
    for (const font of ['serif', 'sans-serif', 'Arial']) for (const size of [32, 40, 56, 72]) {
      const template = canvas(100, 100), ctx = template.getContext('2d')!;
      ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 100, 100);
      ctx.fillStyle = 'black'; ctx.font = `${size}px ${font}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(symbol, 50, 50);
      const mask = silhouette(template);
      if (!mask) continue;
      let overlap = 0, total = 0;
      target.forEach((value, i) => { overlap += value * mask[i]; total += value + mask[i]; });
      score = Math.max(score, 2 * overlap / total);
    }
    if (red / ink <= 0.4 && blackShape && suit !== blackShape) score -= 0.12;
    return { suit, score };
  }).sort((a, b) => b.score - a.score);
  return { suit: scores[0].score >= 0.65 ? scores[0].suit : '', uncertain: scores[0].score < 0.8 || scores[0].score - scores[1].score < 0.08, confidence: scores[0].score };
}

function crop(source: HTMLCanvasElement, region: CardRegion) {
  const result = canvas(Math.max(1, Math.round(region.width)), Math.max(1, Math.round(region.height)));
  result.getContext('2d')!.drawImage(source, region.x, region.y, region.width, region.height, 0, 0, result.width, result.height);
  return result;
}

// The upper-left index contains a rank followed by a suit, separated by blank rows.
function cornerSymbols(card: HTMLCanvasElement): HTMLCanvasElement[] {
  const corner = crop(card, { x: card.width * 0.035, y: card.height * 0.025, width: card.width * 0.25, height: card.height * 0.39 });
  const pixels = corner.getContext('2d')!.getImageData(0, 0, corner.width, corner.height).data;
  const bands: { top: number; bottom: number }[] = [];
  for (let y = 0; y < corner.height; y++) {
    let ink = 0;
    for (let x = 0; x < corner.width; x++) {
      const i = (y * corner.width + x) * 4;
      if (Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) < 130) ink++;
    }
    if (ink === 0) continue;
    const last = bands.at(-1);
    if (last && y - last.bottom <= 3) last.bottom = y;
    else bands.push({ top: y, bottom: y });
  }
  return bands.filter(band => band.bottom - band.top >= 3).slice(0, 2).map(band =>
    crop(corner, { x: 0, y: band.top, width: corner.width, height: band.bottom - band.top + 1 }));
}

export async function recognizeCardPhoto(source: string, signal: AbortSignal, progress: (message: string) => void): Promise<DetectedCard[]> {
  signal.throwIfAborted();
  const image = new Image();
  image.src = source;
  await image.decode();
  signal.throwIfAborted();
  const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
  const photo = canvas(Math.round(image.width * scale), Math.round(image.height * scale));
  const ctx = photo.getContext('2d')!;
  ctx.drawImage(image, 0, 0, photo.width, photo.height);
  progress('Finding card faces…');
  // Let the progress label paint before the bounded pixel pass.
  await new Promise(resolve => setTimeout(resolve, 0));
  signal.throwIfAborted();
  const regions = findCardRegions(ctx.getImageData(0, 0, photo.width, photo.height).data, photo.width, photo.height);
  progress('Loading local OCR…');
  const { createWorker, PSM } = await import('tesseract.js');
  signal.throwIfAborted();
  const worker = await createWorker('eng');
  if (signal.aborted) {
    await worker.terminate();
    signal.throwIfAborted();
  }
  let rejectCancellation: (reason: unknown) => void;
  const cancellation = new Promise<never>((_, reject) => { rejectCancellation = reject; });
  const abort = () => {
    void worker.terminate().catch(() => {});
    rejectCancellation(signal.reason);
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    signal.throwIfAborted();
    await Promise.race([
      worker.setParameters({ tessedit_char_whitelist: '2345678910JQKA', tessedit_pageseg_mode: PSM.SINGLE_LINE }),
      cancellation,
    ]);
    const readRank = async (rankImage: HTMLCanvasElement): Promise<{ rank: Rank | ''; confidence: number }> => {
      signal.throwIfAborted();
      const input = canvas(160, 200), ictx = input.getContext('2d')!;
      ictx.fillStyle = 'white'; ictx.fillRect(0, 0, 160, 200);
      const ratio = Math.min(120 / rankImage.width, 160 / rankImage.height);
      const w = rankImage.width * ratio, h = rankImage.height * ratio;
      ictx.drawImage(rankImage, (160 - w) / 2, (200 - h) / 2, w, h);
      const source = input.toDataURL('image/png');
      let { data } = await Promise.race([worker.recognize(source), cancellation]);
      // OCR segmentation modes handle isolated printed digits differently.
      // Retry weak readings without changing the image or guessing a rank.
      if (data.confidence < 80 || !SCAN_RANKS.includes(data.text.trim() as Rank)) {
        await Promise.race([worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_WORD }), cancellation]);
        const retry = await Promise.race([worker.recognize(source), cancellation]);
        const retryRank = retry.data.text.trim().replace(/\s/g, '');
        if (SCAN_RANKS.includes(retryRank as Rank) && retry.data.confidence > data.confidence) data = retry.data;
        await Promise.race([worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE }), cancellation]);
      }
      const text = data.text.trim().replace(/\s/g, '');
      return { rank: SCAN_RANKS.includes(text as Rank) ? text as Rank : '', confidence: data.confidence };
    };
    if (regions.length < 9 || regions.length > 55) {
      progress('Looking for exposed rank and suit corners…');
      const corners = await recognizeCardCorners(photo, readRank, readSuit, signal, progress);
      if (corners.length) return corners;
    }
    if (!regions.length || regions.length > 55) throw new Error('No readable card corners found. Try a closer, sharper photo with each rank and suit visible, or enter the cards manually.');
    const results: DetectedCard[] = [];
    for (const [index, region] of regions.entries()) {
      signal.throwIfAborted();
      progress(`Reading card ${index + 1} of ${regions.length}…`);
      const card = crop(photo, region);
      const [rankImage, suitImage] = cornerSymbols(card);
      let rank: Rank | '' = '';
      let confidence = 0;
      if (rankImage) {
        const result = await readRank(rankImage);
        rank = result.rank;
        confidence = result.confidence;
      }
      const suit = suitImage ? readSuit(suitImage) : { suit: '' as const, uncertain: true };
      results.push({ rank, suit: suit.suit, preview: card.toDataURL('image/jpeg', 0.8), uncertain: !rank || confidence < 75 || suit.uncertain,
        region: { x: region.x / photo.width, y: region.y / photo.height, width: region.width / photo.width, height: region.height / photo.height } });
    }
    return results;
  } finally {
    signal.removeEventListener('abort', abort);
    if (!signal.aborted) await worker.terminate();
  }
}
