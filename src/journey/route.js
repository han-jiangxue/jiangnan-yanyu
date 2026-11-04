// The voyage down the canal: where it starts and ends, the chapters along it with their poems for each season, how far
// the boat may stray from its line, and the seasons, hours and weathers the journeys go through one after another.
import { canalX, canalSlope, canalW, BRIDGE_Z } from '../world/layout.js';
import { lerp, smoothstep } from '../lib/math.js';
import { SLABS } from '../world/slabbridge.js';

export const START_Z = 74;
export const END_Z = -252;

// A chapter begins where the boat crosses z0 (going toward -z). Its poem is the season's (spring's for a season that
// has none of its own).
export const CHAPTERS = [
  {
    id: 'entry', name: '烟雨入镇', glyph: '入', z0: 74,
    poems: {
      spring: { lines: ['春水碧于天', '画船听雨眠'], by: '韦庄', from: '菩萨蛮' },
      summer: { lines: ['黄梅时节家家雨', '青草池塘处处蛙', '有约不来过夜半', '闲敲棋子落灯花'], by: '赵师秀', from: '约客' },
      autumn: { lines: ['秋阴不散霜飞晚', '留得枯荷听雨声'], by: '李商隐', from: '宿骆氏亭寄怀崔雍崔衮' },
      winter: { lines: ['天与云与山与水', '上下一白'], by: '张岱', from: '湖心亭看雪' },
    },
  },
  {
    id: 'corridor', name: '廊棚市河', glyph: '廊', z0: 4,
    poems: {
      spring: { lines: ['小楼一夜听春雨', '深巷明朝卖杏花'], by: '陆游', from: '临安春雨初霁' },
      summer: { lines: ['一川烟草', '满城风絮', '梅子黄时雨'], by: '贺铸', from: '青玉案' },
      autumn: { lines: ['梧桐更兼细雨', '到黄昏、点点滴滴'], by: '李清照', from: '声声慢' },
      winter: { lines: ['绿蚁新醅酒', '红泥小火炉', '晚来天欲雪', '能饮一杯无'], by: '白居易', from: '问刘十九' },
    },
  },
  {
    id: 'bridge', name: '石桥烟柳', glyph: '桥', z0: -70,
    poems: {
      spring: { lines: ['沾衣欲湿杏花雨', '吹面不寒杨柳风'], by: '志南', from: '绝句' },
      summer: { lines: ['黑云翻墨未遮山', '白雨跳珠乱入船', '卷地风来忽吹散', '望湖楼下水如天'], by: '苏轼', from: '六月二十七日望湖楼醉书' },
      autumn: { lines: ['月落乌啼霜满天', '江枫渔火对愁眠', '姑苏城外寒山寺', '夜半钟声到客船'], by: '张继', from: '枫桥夜泊' },
      winter: { lines: ['江上晚来堪画处', '渔人披得一蓑归'], by: '郑谷', from: '雪中偶题' },
    },
  },
  {
    id: 'homes', name: '枕河人家', glyph: '河', z0: -116,
    poems: {
      spring: { lines: ['君到姑苏见', '人家尽枕河', '古宫闲地少', '水港小桥多'], by: '杜荀鹤', from: '送人游吴' },
      summer: { lines: ['过雨荷花满院香', '沉李浮瓜冰雪凉'], by: '李重元', from: '忆王孙·夏词' },
      autumn: { lines: ['君问归期未有期', '巴山夜雨涨秋池', '何当共剪西窗烛', '却话巴山夜雨时'], by: '李商隐', from: '夜雨寄北' },
      winter: { lines: ['已讶衾枕冷', '复见窗户明', '夜深知雪重', '时闻折竹声'], by: '白居易', from: '夜雪' },
    },
  },
];
export const poemOf = (chapter, season) => chapter.poems[season] || chapter.poems.spring;

// the title page's poem, for the season of the first journey
export const OPENINGS = {
  spring: { lines: ['南朝四百八十寺', '多少楼台烟雨中'], by: '杜牧', from: '江南春' },
  summer: { lines: ['接天莲叶无穷碧', '映日荷花别样红'], by: '杨万里', from: '晓出净慈寺送林子方' },
  autumn: { lines: ['青山隐隐水迢迢', '秋尽江南草未凋'], by: '杜牧', from: '寄扬州韩绰判官' },
  winter: { lines: ['孤舟蓑笠翁', '独钓寒江雪'], by: '柳宗元', from: '江雪' },
};
export const openingOf = (season) => OPENINGS[season] || OPENINGS.spring;

// Each journey a different season, hour and weather, the four seasons in turn, two journeys each; the clock drifts on
// a little as the boat goes. Spring's are drizzle in the morning and mist at first light; summer's a thunder shower in
// the afternoon (白雨跳珠乱入船) and an evening after the rain, the fireflies over the lotus and the frogs loud;
// autumn's a clearing evening, the low sun gold on the water and the leaves afloat as the lanterns come on, and
// midnight in the mist with frost on the roofs, the crickets and the temple bell (夜半钟声到客船); winter's snow in
// the morning and a heavy fall at dusk.
export const LOOPS = [
  { s: 'spring', h: 8.2, w: 'drizzle' },
  { s: 'summer', h: 14.0, w: 'storm' },
  { s: 'autumn', h: 17.6, w: 'after' },
  { s: 'winter', h: 9.6, w: 'snow' },
  { s: 'spring', h: 6.3, w: 'mist' },
  { s: 'summer', h: 19.8, w: 'after' },
  { s: 'autumn', h: 23.6, w: 'mist' },
  { s: 'winter', h: 16.6, w: 'blizzard' },
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
