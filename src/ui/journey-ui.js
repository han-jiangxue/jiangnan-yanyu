// The journey's interface: the title page with its 启程, chapter cards that ink themselves in with the place's poem
// and a seal, the scroll of the journey down the left edge, a dock of single characters for hour, weather, view and
// the rest, the paper between journeys, a photo mode, a share link and an about sheet. The address bar holds the
// place and, when set by hand, the hour, the weather and the view, so a copied link opens on the same moment.
// The structure (dock groups, chapter cards, photo stamp, URL sync) follows Sakura Fantasy's ui (c) 2026 Bill Chan, MIT.
import { CHAPTERS, OPENING, progressAt } from '../journey/route.js';
import { WEATHER_NAMES, DAY_START, dialHours } from '../env/environment.js';
import { typingIn } from './keys.js';

const $ = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
// characters that ink in one after another
const chars = (s, d0 = 0, step = 0.09) => [...s].map((c, i) => `<span class="ch" style="animation-delay:${(d0 + i * step).toFixed(2)}s">${c}</span>`).join('');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
const SHICHEN = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
export const shichen = (h) => SHICHEN[Math.floor(((h + 1) % 24) / 2)] + '时';
const WEATHER_GLYPH = { mist: '雾', drizzle: '细', rain: '雨', storm: '骤', after: '霁' };
const VIEWS = [['follow', '随', '跟随'], ['seat', '舱', '船舱'], ['cinema', '影', '电影']];

export class JourneyUI {
  constructor(app) {
    this.app = app;
    this.root = document.getElementById('ui');
    this.root.innerHTML = '';
    this.root.classList.add('journey', 'pre');
    this.lastUpdate = 0;
    this.urlAt = 0;
    this.urlKey = '';
    this.pending = null;
    this.veiled = false;
    this.userHidden = false; // hidden with H, as opposed to by photo mode
    this.buildTitle();
    this.buildChrome();
    this.bindIdle();
    // a button clicked with the mouse or a finger does not keep the focus (Space would press it again instead of
    // stopping the boat); one pressed from the keyboard keeps it, for the next key
    document.addEventListener('click', (e) => {
      if (e.detail > 0 && e.target.closest) { const b = e.target.closest('#ui button'); if (b) b.blur(); }
    });
  }

  // ------------------------------------------------------------ the title page (the loader, finished)
  buildTitle() {
    const L = document.getElementById('load');
    this.loader = L;
    const poem = $('div', 'opening-poem', OPENING.poem.map((l) => `<div class="line">${l}</div>`).join('') + `<div class="by">${OPENING.by}《${OPENING.from}》</div>`);
    this.go = $('button', 'go', '<span class="seal">启</span><span class="lbl">启程</span>');
    this.hint = $('div', 'go-hint', '点击或按回车，撑船入镇 · 有雨声');
    L.appendChild(poem);
    L.appendChild(this.go);
    L.appendChild(this.hint);
  }

  // straight into the town, for links that set the scene in the URL: the same hints and the waiting card as after 启程
  skip() {
    this.loader.classList.add('gone');
    this.root.classList.remove('pre');
    if (this.pending !== null) { const p = this.pending; this.pending = null; this.chapter(p); }
    this.showHints();
  }

  showHints() {
    this.hints.classList.add('on');
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => this.hints.classList.remove('on'), 9000);
  }

  async ready() {
    this.loader.classList.add('loaded');
    await wait(400);
    this.go.classList.add('on');
    await new Promise((res) => {
      const start = () => { window.removeEventListener('keydown', key); res(); };
      const key = (e) => { if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') { e.preventDefault(); start(); } };
      this.go.addEventListener('click', start, { once: true });
      window.addEventListener('keydown', key);
    });
    this.go.classList.remove('on');
    this.loader.classList.add('gone');
    await wait(1400);
    this.root.classList.remove('pre');
    if (this.pending !== null) { const p = this.pending; this.pending = null; this.chapter(p); }
    this.showHints();
  }

  // with a mouse, the chrome steps back after a few still seconds and returns on the slightest movement
  bindIdle() {
    let timer = 0;
    const canHover = window.matchMedia('(hover: hover)').matches;
    const wake = (e) => {
      this.root.classList.remove('idle');
      clearTimeout(timer);
      if (!canHover || (e.pointerType && e.pointerType !== 'mouse')) return;
      timer = setTimeout(() => this.root.classList.add('idle'), 4500);
    };
    window.addEventListener('pointermove', wake);
    window.addEventListener('keydown', wake);
  }

  // ------------------------------------------------------------ chapter cards
  chapter(idx) {
    if (this.root.classList.contains('pre') || this.veiled) { this.pending = idx; return; }
    const c = CHAPTERS[idx];
    if (!c) return;
    if (this.card) this.card.remove();
    clearTimeout(this.cardTimer);
    const card = $('div', 'chapter');
    const t0 = 0.3;
    card.innerHTML = `
      <div class="num">${chars('第' + NUM[idx] + '景', t0, 0.1)}</div>
      <div class="name">${chars(c.name, t0 + 0.4, 0.18)}</div>
      <div class="poem">${c.poem.map((l, i) => `<div class="line">${chars(l, t0 + 1.4 + i * 0.8, 0.07)}</div>`).join('')}</div>
      <div class="by"><span class="who">${chars(c.by, t0 + 1.6 + c.poem.length * 0.8, 0.12)}</span><span class="from">${chars('《' + c.from + '》', t0 + 1.9 + c.poem.length * 0.8, 0.06)}</span><span class="seal" style="animation-delay:${(t0 + 2.6 + c.poem.length * 0.8).toFixed(2)}s">${c.glyph}</span></div>`;
    this.root.appendChild(card);
    this.card = card;
    // a timer rather than the next animation frame: the card must ink in even while a heavy frame is still drawing
    setTimeout(() => card.classList.add('in'), 40);
    this.cardTimer = setTimeout(() => {
      card.classList.add('out');
      setTimeout(() => card.remove(), 2200);
    }, 13000);
  }

  // ------------------------------------------------------------ the paper between journeys, the veil for jumps
  async paper(on, text = '') {
    if (on) {
      this.veiled = true;
      this.paperText.innerHTML = text;
      this.paperEl.classList.add('on');
      if (this.card) this.card.classList.add('out');
      await wait(2200);
    } else {
      this.paperEl.classList.remove('on');
      await wait(1600);
      this.veiled = false;
      if (this.pending !== null) { const p = this.pending; this.pending = null; this.chapter(p); }
    }
  }

  // ------------------------------------------------------------ chrome: scroll, dock, hints, photo, about
  buildChrome() {
    const R = this.root;
    const app = this.app;
    R.appendChild($('div', 'scrim bottom chrome'));

    // the scroll of the journey
    const sc = $('div', 'scroll chrome');
    sc.innerHTML = `<div class="brand">江南烟雨</div><div class="rail"></div><div class="done"></div>`;
    this.railDone = sc.querySelector('.done');
    this.nodes = CHAPTERS.map((c, i) => {
      const n = $('button', 'node', `<span class="pip"></span><span class="g">${c.glyph}</span><span class="tip">${c.name}</span>`);
      n.setAttribute('aria-label', c.name);
      n.style.top = `${Math.max(0, progressAt(c.z0)) * 100}%`;
      n.addEventListener('click', () => app.jumpTo(i));
      sc.appendChild(n);
      return n;
    });
    this.boatDot = $('div', 'boat');
    sc.appendChild(this.boatDot);
    R.appendChild(sc);

    // the dock
    const d = $('div', 'dock chrome');
    const grp = (cat, cls = '') => {
      const g = $('div', 'grp ' + cls);
      if (cat) {
        const c = $('button', 'cat', cat);
        c.addEventListener('click', () => {
          const open = g.classList.contains('open');
          d.querySelectorAll('.grp.open').forEach((x) => x.classList.remove('open'));
          if (!open) g.classList.add('open');
        });
        g.appendChild(c);
      }
      const row = $('div', 'row');
      g.appendChild(row);
      d.appendChild(g);
      return row;
    };
    const btn = (row, glyph, tip, fn, cls = '') => {
      const b = $('button', 'b ' + cls, `${glyph}<span class="tip">${tip}</span>`);
      b.setAttribute('aria-label', tip);
      b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
      row.appendChild(b);
      return b;
    };
    const sep = () => d.appendChild($('div', 'sep'));

    const rt = grp('时');
    const time = $('div', 'time');
    this.slider = $('input');
    Object.assign(this.slider, { type: 'range', min: DAY_START, max: DAY_START + 24, step: 0.05 });
    this.slider.setAttribute('aria-label', '时辰');
    this.slider.addEventListener('input', () => { this.dragging = true; app.setHours(parseFloat(this.slider.value)); });
    // done with the slider: give the keys back to the boat
    const release = () => { this.dragging = false; this.slider.blur(); };
    this.slider.addEventListener('change', release);
    this.slider.addEventListener('pointerup', release);
    this.clock = $('div', 'clock', '<b></b><i></i>');
    time.appendChild(this.slider);
    time.appendChild(this.clock);
    rt.appendChild(time);
    this.autoTime = btn(rt, '自', '随行程', () => app.setAutoTime(!app.ctl.autoTime), 'auto');
    sep();
    const rw = grp('天');
    this.weatherBtns = Object.entries(WEATHER_NAMES).map(([k, n]) => [k, btn(rw, WEATHER_GLYPH[k], n, () => app.setWeather(k))]);
    this.autoWeather = btn(rw, '自', '随行程', () => app.setAutoWeather(!app.ctl.autoWeather), 'auto');
    sep();
    const rc = grp('视');
    this.viewBtns = VIEWS.map(([k, g, t]) => [k, btn(rc, g, t, () => app.director.setMode(k))]);
    sep();
    const ro = grp('', 'solo');
    this.sailBtn = btn(ro, '止', '停船', () => app.togglePause());
    this.soundBtn = btn(ro, '声', '静音', () => app.toggleSound());
    btn(ro, '写', '拍照', () => this.photo(true));
    btn(ro, '传', '分享此景', () => this.share());
    btn(ro, '记', '关于', () => this.about.classList.add('on'));
    R.appendChild(d);
    document.addEventListener('pointerdown', (e) => { if (!d.contains(e.target)) d.querySelectorAll('.grp.open').forEach((x) => x.classList.remove('open')); });

    this.hints = $('div', 'hints', '<span><kbd>W S</kbd>快慢</span><span><kbd>A D</kbd>掌舵</span><span><kbd>拖动</kbd>环顾</span><span><kbd>滚轮</kbd>远近</span><span><kbd>C</kbd>视角</span><span><kbd>空格</kbd>停船</span><span><kbd>P</kbd>拍照</span><span><kbd>M</kbd>声音</span><span><kbd>H</kbd>隐藏</span>');
    R.appendChild(this.hints);
    this.toastEl = $('div', 'toast');
    R.appendChild(this.toastEl);

    this.paperEl = $('div', 'paper');
    this.paperText = $('div', 'text');
    this.paperEl.appendChild(this.paperText);
    R.appendChild(this.paperEl);
    this.flash = $('div', 'flash');
    R.appendChild(this.flash);

    // photo mode
    this.photoEl = $('div', 'photo');
    this.photoEl.innerHTML = `<div class="frame"></div><div class="note">拖动取景 · 滚轮远近</div>
      <div class="bar"><button class="side" data-k="exit">回<i>返回</i></button><button class="shutter" aria-label="拍照">摄</button><button class="side" data-k="hold">止<i>停船</i></button></div>`;
    this.photoEl.querySelector('.shutter').addEventListener('click', () => this.shoot());
    this.photoEl.querySelector('[data-k=exit]').addEventListener('click', () => this.photo(false));
    this.holdBtn = this.photoEl.querySelector('[data-k=hold]');
    this.holdBtn.addEventListener('click', () => app.togglePause());
    R.appendChild(this.photoEl);

    // about
    this.about = $('div', 'about');
    this.about.innerHTML = `<div class="sheet"><button class="x" aria-label="关闭">✕</button>
      <h2>江南烟雨</h2>
      <p>撑一只乌篷船，在细雨里穿过一座江南水乡：烟雨入镇，廊棚市河，石桥烟柳，枕河人家。每一程换一个时辰、一种天气。</p>
      <p>three.js 实时渲染，房屋、桥、船、柳树、行人都由代码生成；雨声、滴水、橹声、雷声和钟声也是 Web Audio 实时合成的。实现思路参考 <a href="https://github.com/billpwchan/sakura-fantasy" target="_blank" rel="noopener">Sakura Fantasy</a>（MIT）；贴图与道具模型来自 <a href="https://polyhaven.com" target="_blank" rel="noopener">Poly Haven</a>（CC0）。诗句：杜牧、韦庄、陆游、志南、杜荀鹤。</p>
      <div class="keys"><b>W / S</b><span>快一些，慢一些</span><b>A / D</b><span>掌舵</span><b>拖动 · 滚轮</b><span>环顾，远近</span><b>C</b><span>跟随、船舱、电影</span><b>空格</b><span>停船或启程</span><b>P · H</b><span>拍照，隐藏界面</span><b>M</b><span>声音开关</span></div>
      <div class="seal">烟雨</div></div>`;
    this.about.addEventListener('click', (e) => { if (e.target === this.about || e.target.classList.contains('x')) this.about.classList.remove('on'); });
    R.appendChild(this.about);

    window.addEventListener('keydown', (e) => {
      if (typingIn(e) || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (this.root.classList.contains('pre')) return;
      if (e.code === 'KeyH' && !this.photoOn) {
        this.userHidden = !this.userHidden;
        this.root.classList.toggle('hidden', this.userHidden);
        if (this.userHidden) this.toast(['界面已隐藏', '按 H 重新显示']);
      }
      if (e.code === 'KeyP') this.photo(!this.photoOn);
      if (e.code === 'KeyM') this.toast(this.app.toggleSound() ? ['已静音', '按 M 再听雨'] : ['听雨', '按 M 静音']);
      if (e.code === 'Escape') {
        this.about.classList.remove('on');
        d.querySelectorAll('.grp.open').forEach((x) => x.classList.remove('open'));
        if (this.photoOn) this.photo(false);
      }
    });
  }

  photo(on) {
    this.photoOn = on;
    // leaving photo mode brings back only what was there before it: an interface hidden with H stays hidden
    this.root.classList.toggle('hidden', on || this.userHidden);
    this.photoEl.classList.toggle('on', on);
    const dir = this.app.director;
    if (on) {
      this.prevMode = dir.mode;
      dir.setMode('photo');
    } else {
      dir.setMode(this.prevMode && this.prevMode !== 'photo' ? this.prevMode : 'follow');
    }
  }

  async shoot() {
    this.photoEl.classList.remove('on');
    await new Promise((r) => requestAnimationFrame(r));
    const blob = await this.app.capture();
    this.flash.classList.remove('go');
    void this.flash.offsetWidth;
    this.flash.classList.add('go');
    // the frame comes back only if still in photo mode (Esc or P may have left it while the picture was taken)
    if (this.photoOn) this.photoEl.classList.add('on');
    if (!blob) return;
    const a = document.createElement('a');
    const d = new Date();
    const p2 = (v) => String(v).padStart(2, '0');
    a.href = URL.createObjectURL(blob);
    a.download = `jiangnan-yanyu-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  // a photograph carries a seal in its lower right, like a painting's chop
  stamp(src) {
    const W = src.width, H = src.height, c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    const k = Math.min(W, H) / 1080, m = Math.round(34 * k), s = Math.round(54 * k);
    const x = W - m - s, y = H - m - s;
    g.save();
    g.translate(x + s / 2, y + s / 2);
    g.rotate(-0.05);
    g.shadowColor = 'rgba(0, 0, 0, 0.3)'; g.shadowBlur = 8 * k; g.shadowOffsetY = 2 * k;
    g.fillStyle = '#b8322a';
    g.fillRect(-s / 2, -s / 2, s, s);
    g.shadowColor = 'transparent';
    g.fillStyle = '#f6eadb';
    g.font = `600 ${Math.round(21 * k)}px "Songti SC", "STSong", "Noto Serif CJK SC", "Noto Serif SC", serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('烟', -s * 0.2, -s * 0.2);
    g.fillText('雨', -s * 0.2, s * 0.22);
    g.fillText('江', s * 0.22, -s * 0.2);
    g.fillText('南', s * 0.22, s * 0.22);
    g.restore();
    return c;
  }

  // a link to this very moment: the share sheet on a phone, the clipboard elsewhere
  async share() {
    const url = this.app.shareUrl();
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try { await navigator.share({ title: document.title, url }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    let ok = false;
    try { await navigator.clipboard.writeText(url); ok = true; } catch {
      const t = Object.assign(document.createElement('textarea'), { value: url });
      Object.assign(t.style, { position: 'fixed', opacity: '0' });
      document.body.appendChild(t);
      t.select();
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      t.remove();
    }
    // when nothing could be copied, a box the link can be selected and copied from by hand
    if (ok) this.toast(['此地 · 此时 · 此景', '链接已复制']);
    else window.prompt('复制这个链接', url);
  }

  toast([a, b]) {
    const t = this.toastEl;
    t.innerHTML = `<b>${a}</b><i>${b}</i>`;
    t.classList.remove('on');
    void t.offsetWidth;
    t.classList.add('on');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('on'), 4200);
  }

  // The address bar follows the view: a change in the dock within a second, the drift down the canal every few
  // seconds. Never more than once a second (Safari refuses more than 100 history updates in 30 s), and a refusal
  // must not stop anything else.
  syncUrl(now) {
    const { director } = this.app;
    if (this.root.classList.contains('pre') || this.veiled || director.mode === 'photo') return;
    try {
      const url = this.app.shareUrl(true);
      const q = new URL(url).searchParams;
      const key = ['h', 'w', 'mode', 'j'].map((k) => q.get(k)).join('|');
      if (url === location.href || now - this.urlAt < (key === this.urlKey ? 3000 : 1000)) return;
      this.urlKey = key;
      this.urlAt = now;
      history.replaceState(history.state, '', url);
    } catch { /* not this time */ }
  }

  update(now) {
    if (now - this.lastUpdate < 120) return;
    this.lastUpdate = now;
    const { journey: j, env, ctl, director } = this.app;
    const f = Math.min(1, Math.max(0, j.progress));
    this.railDone.style.height = `${f * 100}%`;
    this.boatDot.style.top = `${f * 100}%`;
    this.nodes.forEach((n, i) => n.classList.toggle('past', i <= j.chapter));
    const h = env.hours;
    if (!this.dragging) this.slider.value = dialHours(h).toFixed(2);
    const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    this.clock.firstChild.textContent = shichen(h);
    this.clock.lastChild.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    this.weatherBtns.forEach(([k, b]) => b.classList.toggle('on', k === env.weather));
    this.autoTime.classList.toggle('on', ctl.autoTime);
    this.autoWeather.classList.toggle('on', ctl.autoWeather);
    this.viewBtns.forEach(([k, b]) => b.classList.toggle('on', k === director.mode));
    const moored = j.moored;
    this.sailBtn.firstChild.textContent = moored ? '行' : '止';
    this.sailBtn.querySelector('.tip').textContent = moored ? '启程' : '停船';
    this.sailBtn.setAttribute('aria-label', moored ? '启程' : '停船');
    this.sailBtn.classList.toggle('on', moored);
    this.holdBtn.firstChild.textContent = moored ? '行' : '止';
    this.holdBtn.querySelector('i').textContent = moored ? '启程' : '停船';
    // the sound button shows what is heard, its tip what a press would do
    const muted = this.app.sound.muted;
    this.soundBtn.firstChild.textContent = muted ? '静' : '声';
    this.soundBtn.querySelector('.tip').textContent = muted ? '听雨' : '静音';
    this.soundBtn.setAttribute('aria-label', muted ? '打开声音' : '静音');
    this.soundBtn.classList.toggle('on', muted);
    this.syncUrl(now);
  }
}
