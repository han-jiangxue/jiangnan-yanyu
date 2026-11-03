// Textures drawn in code: the lattice patterns of Jiangnan windows (an atlas of four), plain white on transparent,
// tinted by the material.
import * as THREE from 'three';
import { rng } from '../lib/math.js';

// atlas cells: 0 square grid (方格), 1 nested steps (步步锦), 2 cracked ice (冰裂纹), 3 key fret (回纹)
export const LATTICE_CELLS = 4;

export function latticeAtlas(size = 1024) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const cell = size / 2;
  g.clearRect(0, 0, size, size);
  g.strokeStyle = '#fff';
  g.fillStyle = '#fff';
  g.lineCap = 'square';
  const bar = cell * 0.016;
  const frame = cell * 0.05;

  const inCell = (ci, draw) => {
    const ox = (ci % 2) * cell, oy = Math.floor(ci / 2) * cell;
    g.save();
    g.translate(ox, oy);
    g.beginPath();
    g.rect(0, 0, cell, cell);
    g.clip();
    draw();
    // the frame every pattern sits in
    g.lineWidth = frame;
    g.strokeRect(frame / 2, frame / 2, cell - frame, cell - frame);
    g.restore();
  };
  const line = (x0, y0, x1, y1, w = bar) => {
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
  };

  // 0: square grid
  inCell(0, () => {
    const n = 8;
    for (let i = 1; i < n; i++) {
      const p = (i / n) * cell;
      line(p, 0, p, cell);
      line(0, p, cell, p);
    }
  });

  // 1: nested steps: rectangles inside rectangles, tied by short struts
  inCell(1, () => {
    const R = rng(11);
    const rects = [0.17, 0.31, 0.43];
    for (const k of rects) g.lineWidth = bar, g.strokeRect(cell * k, cell * k * 0.9, cell * (1 - 2 * k), cell * (1 - 1.8 * k));
    const tie = (a, b) => {
      for (let i = 0; i < 2; i++) {
        const t = 0.3 + 0.4 * R.next();
        const x = cell * (a + (1 - 2 * a) * t);
        line(x, cell * a * 0.9, x, cell * b * 0.9);
        line(x, cell * (1 - a * 0.9), x, cell * (1 - b * 0.9));
        const y = cell * (a + (1 - 2 * a) * (0.3 + 0.4 * R.next()));
        line(cell * a, y, cell * b, y);
        line(cell * (1 - a), y, cell * (1 - b), y);
      }
    };
    tie(0.0, 0.17);
    tie(0.17, 0.31);
    tie(0.31, 0.43);
  });

  // 2: cracked ice: a polygon split again and again along random chords
  inCell(2, () => {
    const R = rng(29);
    let polys = [[[0, 0], [cell, 0], [cell, cell], [0, cell]]];
    const area = (p) => { let a = 0; for (let i = 0; i < p.length; i++) { const [x0, y0] = p[i], [x1, y1] = p[(i + 1) % p.length]; a += x0 * y1 - x1 * y0; } return Math.abs(a) / 2; };
    const split = (p) => {
      // a chord between two points on two different edges
      const n = p.length;
      const e0 = Math.floor(R.next() * n);
      let e1 = (e0 + 1 + Math.floor(R.next() * (n - 1))) % n;
      if (e1 === e0) e1 = (e0 + 1) % n;
      const pt = (e, t) => [p[e][0] + (p[(e + 1) % n][0] - p[e][0]) * t, p[e][1] + (p[(e + 1) % n][1] - p[e][1]) * t];
      const a = pt(e0, 0.25 + 0.5 * R.next()), b = pt(e1, 0.25 + 0.5 * R.next());
      line(a[0], a[1], b[0], b[1]);
      const A = [a], B = [b];
      for (let i = (e0 + 1) % n; ; i = (i + 1) % n) { A.push(p[i]); if (i === e1) break; }
      A.push(b);
      for (let i = (e1 + 1) % n; ; i = (i + 1) % n) { B.push(p[i]); if (i === e0) break; }
      B.push(a);
      return [A, B];
    };
    for (let k = 0; k < 34; k++) {
      polys.sort((a, b) => area(b) - area(a));
      const p = polys.shift();
      polys.push(...split(p));
    }
  });

  // 3: key fret: a square spiral repeated on a grid
  inCell(3, () => {
    const n = 4, s = cell / n;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = i * s, y = j * s;
      g.lineWidth = bar;
      g.beginPath();
      g.moveTo(x + s * 0.15, y + s * 0.15);
      g.lineTo(x + s * 0.85, y + s * 0.15);
      g.lineTo(x + s * 0.85, y + s * 0.85);
      g.lineTo(x + s * 0.32, y + s * 0.85);
      g.lineTo(x + s * 0.32, y + s * 0.35);
      g.lineTo(x + s * 0.66, y + s * 0.35);
      g.lineTo(x + s * 0.66, y + s * 0.66);
      g.stroke();
      // ties to the neighbours, so the frets hold together as one lattice
      line(x, y + s * 0.5, x + s * 0.15, y + s * 0.5);
      line(x + s * 0.5, y, x + s * 0.5, y + s * 0.15);
    }
  });

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// uv rectangle of an atlas cell, as quad uvs (bottom-left, bottom-right, top-right, top-left)
export function latticeUv(ci) {
  const u0 = (ci % 2) * 0.5, v1 = 1 - Math.floor(ci / 2) * 0.5, v0 = v1 - 0.5;
  const e = 0.004;
  return [u0 + e, v0 + e, u0 + 0.5 - e, v0 + e, u0 + 0.5 - e, v1 - e, u0 + e, v1 - e];
}
