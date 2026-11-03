// Quality tiers. `?q=low` is for machines without a real GPU (and for the headless capture script): no MSAA,
// no shadow map, a smaller mirror and fewer raindrops. `?q=mobile` is what a phone or a small tablet gets when no
// tier is asked for: no MSAA (a dense screen hides the steps), a smaller shadow map, mirror and bloom, fewer drops,
// at most 1.5 device pixels per CSS pixel, and the governor on. `?scale=0.5` renders at a fraction of the canvas size.
const params = new URLSearchParams(location.search);
const asked = params.get('q');
const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const small = Math.min(screen.width, screen.height) < 900;
const name = asked === 'low' || asked === 'high' || asked === 'mobile' ? asked : coarse && small ? 'mobile' : 'high';

const TIERS = {
  high: { msaa: 4, shadows: true, shadowSize: 2048, reflScale: 0.5, bloomLevels: 6, rain: 16000, dprCap: 2, governor: true },
  mobile: { msaa: 0, shadows: true, shadowSize: 1024, reflScale: 0.35, bloomLevels: 4, rain: 8000, dprCap: 1.5, governor: true },
  low: { msaa: 0, shadows: false, shadowSize: 1024, reflScale: 0.35, bloomLevels: 4, rain: 6000, dprCap: 1, governor: false },
};

const scale = parseFloat(params.get('scale') || '1');
export const QUALITY = { name, ...TIERS[name], scale: Number.isFinite(scale) ? Math.min(1, Math.max(0.25, scale)) : 1 };
