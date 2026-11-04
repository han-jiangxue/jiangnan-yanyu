// The voyage down the canal: where it starts and ends, the chapters along it with their poems, how far the boat may
// stray from its line, and the hours and weathers the journeys go through one after another.
import { canalX, canalSlope, canalW, BRIDGE_Z } from '../world/layout.js';
import { lerp, smoothstep } from '../lib/math.js';
import { SLABS } from '../world/slabbridge.js';

export const START_Z = 74;
export const END_Z = -252;

// a chapter begins where the boat crosses z0 (going toward -z)
export const CHAPTERS = [
  { id: 'entry', name: '烟雨入镇', glyph: '入', z0: 74, poem: ['春水碧于天', '画船听雨眠'], by: '韦庄', from: '菩萨蛮' },
  { id: 'corridor', name: '廊棚市河', glyph: '廊', z0: 4, poem: ['小楼一夜听春雨', '深巷明朝卖杏花'], by: '陆游', from: '临安春雨初霁' },
  { id: 'bridge', name: '石桥烟柳', glyph: '桥', z0: -70, poem: ['沾衣欲湿杏花雨', '吹面不寒杨柳风'], by: '志南', from: '绝句' },
  { id: 'homes', name: '枕河人家', glyph: '河', z0: -116, poem: ['君到姑苏见', '人家尽枕河', '古宫闲地少', '水港小桥多'], by: '杜荀鹤', from: '送人游吴' },
];

export const OPENING = { title: '江南烟雨', poem: ['南朝四百八十寺', '多少楼台烟雨中'], by: '杜牧', from: '江南春' };

// each journey a different hour and weather; the clock drifts on a little as the boat goes. The last goes out at
// midnight after the rain: most of the windows going dark one by one, the drips still falling, the moon over the
// pagoda, and its temple bell (夜半钟声到客船)
export const LOOPS = [
  { h: 8.2, w: 'drizzle' },
  { h: 6.3, w: 'mist' },
  { h: 14.6, w: 'after' },
  { h: 17.5, w: 'rain' },
  { h: 19.7, w: 'drizzle' },
  { h: 23.1, w: 'after' },
];

export const chapterAt = (z) => {
  let idx = 0;
  for (let i = 0; i < CHAPTERS.length; i++) if (z <= CHAPTERS[i].z0) idx = i;
  return idx;
};

// the boat keeps to the right of the way (heading -z, the right is -x), clear of the boats coming up
export const LANE = -0.9;

// How far it may stray from its lane, as [left, right] offsets: the banks, the high middle of the arch bridge, and the
// middle span of each slab bridge (which is centred on the canal, not on the lane); each narrows gradually over the
// metres before it, so that the boat is eased in rather than pushed.
export function latBounds(z) {
  const hw = canalW(z) / 2;
  const lim = Math.max(0.4, hw - 1.25);
  let lo = -lim, hi = lim;
  const ka = 1 - smoothstep(7, 20, Math.abs(z - BRIDGE_Z));
  lo = lerp(lo, Math.max(lo, -1.3), ka);
  hi = lerp(hi, Math.min(hi, 1.3), ka);
  for (const b of SLABS) {
    const k = 1 - smoothstep(4, 16, Math.abs(z - b.z));
    if (k <= 0) continue;
    const c = b.x - (canalX(z) + LANE), m = b.half - 0.95; // the span's middle from the lane; half the beam and a margin
    lo = lerp(lo, Math.max(lo, c - m), k);
    hi = lerp(hi, Math.min(hi, c + m), k);
  }
  return [lo, hi];
}

export const routeX = (z, lat) => canalX(z) + LANE + lat;
// the heading of a boat going down the canal (rotation about y for its +z)
export const routeHeading = (z) => Math.atan2(-canalSlope(z), -1);
export const progressAt = (z) => (START_Z - z) / (START_Z - END_Z);
export const zAtProgress = (f) => START_Z - f * (START_Z - END_Z);
