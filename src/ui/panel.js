// The review panel: shots, season, hour, weather, and what the frame costs. The journey's own interface (chapter
// cards, the dock) comes with the journey.
import { WEATHER_NAMES, SEASON_NAMES, SEASONS_READY, DAY_START, dialHours } from '../env/environment.js';

const SHOT_NAMES = [['alley', '水巷'], ['bridge', '拱桥'], ['pier', '河埠头'], ['corridor', '廊棚'], ['lane', '廊下'], ['street', '沿街'], ['willows', '柳岸'], ['glide', '漫游'], ['free', '自由']];
// the twelve double-hours, by the hour they start
const SHICHEN = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const shichen = (h) => SHICHEN[Math.floor(((h + 1) % 24) / 2)] + '时';

export class Panel {
  constructor(app) {
    this.app = app;
    const ui = document.getElementById('ui');
    ui.innerHTML = `
      <div class="title"><div class="t">江南烟雨</div><div class="s">评审 · 机位、季节、时辰与天气</div></div>
      <div class="panel">
        <div class="row"><div class="lab">镜头</div><div class="chips" data-k="shot">${SHOT_NAMES.map(([k, n]) => `<button data-v="${k}">${n}</button>`).join('')}</div></div>
        <div class="row"><div class="lab">季节</div><div class="chips" data-k="season">${SEASONS_READY.map((k) => `<button data-v="${k}">${SEASON_NAMES[k]}</button>`).join('')}</div></div>
        <div class="row"><div class="lab">时辰 <b data-k="hourLabel"></b></div><input type="range" min="${DAY_START}" max="${DAY_START + 24}" step="0.1" data-k="hour" /></div>
        <div class="row"><div class="lab">天气</div><div class="chips" data-k="weather">${Object.entries(WEATHER_NAMES).map(([k, n]) => `<button data-v="${k}">${n}</button>`).join('')}</div></div>
        <div class="foot"><span data-k="perf">—</span><span>拖动环顾 · 滚轮缩放 · H 隐藏 · M 声音</span></div>
      </div>`;
    this.el = (k) => ui.querySelector(`[data-k="${k}"]`);
    this.el('shot').addEventListener('click', (e) => {
      const v = e.target.closest('button')?.dataset.v;
      if (v) app.setShot(v);
    });
    this.el('weather').addEventListener('click', (e) => {
      const v = e.target.closest('button')?.dataset.v;
      if (v) app.setWeather(v);
    });
    this.el('season').addEventListener('click', (e) => {
      const v = e.target.closest('button')?.dataset.v;
      if (v) app.setSeason(v);
    });
    const hour = this.el('hour');
    hour.addEventListener('input', () => app.setHours(parseFloat(hour.value)));
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyH') document.body.classList.toggle('hidden-ui');
      if (e.code === 'KeyM' && !e.repeat) app.toggleSound();
    });
    this.sync();
  }

  sync() {
    const { app } = this;
    for (const b of this.el('shot').children) b.classList.toggle('on', b.dataset.v === app.rig.name || (app.rig.mode === 'free' && b.dataset.v === 'free'));
    for (const b of this.el('weather').children) b.classList.toggle('on', b.dataset.v === app.env.weather);
    for (const b of this.el('season').children) b.classList.toggle('on', b.dataset.v === app.env.season);
    const h = app.env.hoursTarget;
    const hour = this.el('hour');
    if (document.activeElement !== hour) hour.value = String(dialHours(h));
    const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
    this.el('hourLabel').textContent = `${shichen(h)} · ${String(hh).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`;
  }

  perf(fps, scale, w, h) {
    this.el('perf').textContent = `${fps.toFixed(0)} fps · ${w}×${h}${scale < 0.99 ? ` (${Math.round(scale * 100)}%)` : ''}`;
  }
}
