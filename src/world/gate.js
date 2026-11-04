// The town's gate (牌坊) across the lane at the start of the journey: two stone pillars with drum stones at their
// feet, two beams and a carved plaque between them, a small tiled roof with swept-up ends. It faces along the lane,
// which runs along the canal, so a boat coming into town sees it square on.
// Local frame: origin on the bank's edge at lane level, x along the bank, +z out over the water.
import * as THREE from 'three';
import { Kit } from './kit.js';
import { slope, snowLip } from './house.js';
import { patch } from '../core/shared.js';
import { bankX, bankNormal, BANK_Y, GATE } from './layout.js';

function plaqueTexture(text) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = '#3b3f40';
  g.fillRect(0, 0, 512, 160);
  g.strokeStyle = '#8c8f86';
  g.lineWidth = 6;
  g.strokeRect(10, 10, 492, 140);
  g.fillStyle = '#d9d4c3';
  g.font = '600 92px "Songti SC", "STSong", "Noto Serif CJK SC", "Noto Serif SC", serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 84);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function createGate(mats) {
  const kit = new Kit();
  const n = bankNormal(GATE.z, GATE.side);
  kit.at(bankX(GATE.z, GATE.side), BANK_Y, GATE.z, Math.atan2(-n.x, -n.z));
  const za = -0.72, zb = -2.98; // the pillars, either side of the lane
  const H = 4.0;
  for (const z of [za, zb]) {
    kit.boxY('slab', 0, z, 0.34, 0.34, 0, H, { uvScale: 0.5 });
    kit.boxY('slab', 0, z, 0.5, 0.5, 0, 0.18, { uvScale: 0.5 });
    // drum stones (抱鼓石) clasping the foot of each pillar, front and back
    for (const sx of [-1, 1]) {
      kit.box('slab', sx * 0.32, 0.28, z, 0.3, 0.56, 0.2, { uvScale: 0.5 });
      kit.cyl('slab', sx * 0.36, 0.6, z, 0.22, 0.22, 0.16, { rx: Math.PI / 2, sides: 16, uvScale: 0.5 });
    }
  }
  const zc = (za + zb) / 2, span = Math.abs(zb - za);
  kit.box('slab', 0, 2.95, zc, 0.3, 0.3, span + 0.5, { uvScale: 0.5 });
  kit.box('slab', 0, 3.72, zc, 0.32, 0.26, span + 0.9, { uvScale: 0.5 });
  // the plaque, carved on both faces
  const pw = span * 0.62, ph = 0.5, py = 3.34;
  for (const sx of [-1, 1]) {
    const x = sx * 0.13;
    const a = [x, py - ph / 2, zc + (sx > 0 ? pw / 2 : -pw / 2)], b = [x, py - ph / 2, zc - (sx > 0 ? pw / 2 : -pw / 2)];
    const c = [x, py + ph / 2, zc - (sx > 0 ? pw / 2 : -pw / 2)], d = [x, py + ph / 2, zc + (sx > 0 ? pw / 2 : -pw / 2)];
    kit.quad('plaque', a, b, c, d, { uv: [0, 0, 1, 0, 1, 1, 0, 1], keepUv: true, rawUv: true });
  }
  kit.box('slab', 0, py, zc - pw / 2 - 0.06, 0.24, ph + 0.08, 0.1, { uvScale: 0.5 });
  kit.box('slab', 0, py, zc + pw / 2 + 0.06, 0.24, ph + 0.08, 0.1, { uvScale: 0.5 });
  // the roof over it all: two short slopes down toward the lane either way, a ridge with swept-up ends
  const z0 = za + 0.62, z1 = zb - 0.62, yr = H + 0.5, ye = H + 0.08, xe = 0.62;
  for (const sx of [-1, 1]) {
    slope(kit, 'tile', [0, yr, z0], [0, yr, z1], [sx * xe, ye, z0], [sx * xe, ye, z1], { span: [-1, -1], spanRaw: true });
    slope(kit, 'timber', [0, yr - 0.08, z0], [0, yr - 0.08, z1], [sx * xe, ye - 0.08, z0], [sx * xe, ye - 0.08, z1], { down: true, col: [0.36, 0.25, 0.19] });
  }
  kit.box('timber', 0, H - 0.02, zc, 0.5, 0.18, span + 1.1, { col: [0.36, 0.25, 0.19] });
  kit.box('ridge', 0, yr + 0.08, zc, 0.18, 0.2, Math.abs(z1 - z0) + 0.1);
  // snow along both eaves and the ridge, drawn with the corridor's tile ends
  const out = { lips: [] };
  for (const sx of [-1, 1]) snowLip(kit, out, sx * xe, ye + 0.02, zc, Math.abs(z1 - z0), 'z', sx, Math.atan2(yr - ye, xe), { depth: 0.25, thick: 0.06 });
  snowLip(kit, out, 0, yr + 0.18, zc, Math.abs(z1 - z0) + 0.1, 'z', 1, 0, { depth: 0.18, thick: 0.05, over: 0.09 });
  for (const [z, s] of [[z0, 1], [z1, -1]]) kit.box('ridge', 0, yr + 0.3, z + s * 0.12, 0.12, 0.09, 0.5, { rx: -s * 0.7 });
  const plaque = patch(new THREE.MeshStandardMaterial({ map: plaqueTexture(GATE.text), roughness: 0.8, vertexColors: true }), { key: 'plaque', wet: 0.6, gloss: 0.5 });
  const group = kit.build({ ...mats, plaque }, 'gate');
  group.userData.lips = out.lips;
  return group;
}
