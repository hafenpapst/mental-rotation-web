export type Point = { x: number; y: number };

export function centroid(pts: Point[]): Point {
  const s = pts.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: s.x / pts.length, y: s.y / pts.length };
}

export function rotate(pts: Point[], deg: number): Point[] {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const c = centroid(pts);
  return pts.map(p => {
    const x = p.x - c.x;
    const y = p.y - c.y;
    return { x: x * cos - y * sin + c.x, y: x * sin + y * cos + c.y };
  });
}

export function mirrorY(pts: Point[]): Point[] {
  const c = centroid(pts);
  return pts.map(p => ({ x: 2 * c.x - p.x, y: p.y }));
}

export function normalizeToCanvas(pts: Point[], target: number): Point[] {
  const minX = Math.min(...pts.map(p => p.x));
  const maxX = Math.max(...pts.map(p => p.x));
  const minY = Math.min(...pts.map(p => p.y));
  const maxY = Math.max(...pts.map(p => p.y));
  const w = maxX - minX;
  const h = maxY - minY;
  const scale = 0.8 * target / Math.max(w, h);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return pts.map(p => ({
    x: (p.x - cx) * scale + target / 2,
    y: (p.y - cy) * scale + target / 2,
  }));
}

export function toSvgPoints(pts: Point[]): string {
  return pts.map(p => `${p.x},${p.y}`).join(' ');
}

export function deepCopy<T>(x: T): T { 
  return JSON.parse(JSON.stringify(x)); 
}
