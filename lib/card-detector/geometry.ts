export interface Box { x: number; y: number; width: number; height: number }
export function letterboxGeometry(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 16_000_000) throw new Error('Photo dimensions exceed the bounded decode contract.');
  const scale = Math.min(640 / width, 640 / height);
  const resizedWidth = Math.max(1, Math.round(width * scale));
  const resizedHeight = Math.max(1, Math.round(height * scale));
  return { width, height, resizedWidth, resizedHeight, left: Math.floor((640 - resizedWidth) / 2), top: Math.floor((640 - resizedHeight) / 2) };
}

export function inverseBox(box: Box, geometry: ReturnType<typeof letterboxGeometry>): Box | null {
  if (![box.x, box.y, box.width, box.height].every(Number.isFinite) || box.width <= 0 || box.height <= 0) return null;
  const sx = geometry.width / geometry.resizedWidth, sy = geometry.height / geometry.resizedHeight;
  const x = Math.max(0, Math.min(geometry.width, (box.x - geometry.left) * sx));
  const y = Math.max(0, Math.min(geometry.height, (box.y - geometry.top) * sy));
  const right = Math.max(0, Math.min(geometry.width, (box.x + box.width - geometry.left) * sx));
  const bottom = Math.max(0, Math.min(geometry.height, (box.y + box.height - geometry.top) * sy));
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
}
