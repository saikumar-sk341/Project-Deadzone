import { CFG } from './config.js';
import { el, fmtTime, clamp, dist } from './util.js';

// ---------- tiny inline icons ----------
const SVG = {
  wave: '<svg viewBox="0 0 24 24"><path d="M4 20 L14 10 M10 4 L20 14 M14 4 L20 4 L20 10 M4 14 L10 20 L4 20 Z" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  sample: '<svg viewBox="0 0 24 24"><rect x="8" y="3" width="8" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><rect x="9.5" y="10" width="5" height="9" rx="1.5" fill="currentColor"/><rect x="7" y="2" width="10" height="3" rx="1" fill="currentColor"/></svg>',
  pad: '<svg viewBox="0 0 24 24"><path d="M12 3 L20 7.5 L20 16.5 L12 21 L4 16.5 L4 7.5 Z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 8 V16 M15 8 V16 M9 12 H15" stroke="currentColor" stroke-width="2.2"/></svg>',
  beacon: '<svg viewBox="0 0 24 24"><path d="M12 2 L20 6 L19 15 L12 22 L5 15 L4 6 Z" fill="currentColor"/></svg>',
  train: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="currentColor"/><path d="M12 1 V5 M12 19 V23 M1 12 H5 M19 12 H23" stroke="currentColor" stroke-width="2"/></svg>',
  nade: '<svg viewBox="0 0 24 24"><circle cx="11" cy="14" r="7" fill="currentColor"/><rect x="9" y="4" width="5" height="4" rx="1" fill="currentColor"/><path d="M14 5 Q19 2 20 7" stroke="currentColor" stroke-width="2" fill="none"/></svg>',
  amp: '<svg viewBox="0 0 24 24"><path d="M13 2 L5 13 H11 L10 22 L19 10 H13 Z" fill="currentColor"/></svg>',
  turret: '<svg viewBox="0 0 24 24"><rect x="7" y="6" width="10" height="7" rx="2" fill="currentColor"/><rect x="15" y="8" width="7" height="3" fill="currentColor"/><path d="M12 13 L6 22 M12 13 L18 22 M12 13 V22" stroke="currentColor" stroke-width="2"/></svg>',
  ar: '<svg viewBox="0 0 48 24"><path d="M2 10 H30 L34 8 H46 V12 H34 L32 14 H22 L20 20 H15 L17 14 H8 L6 16 H2 Z" fill="currentColor"/></svg>',
  shotgun: '<svg viewBox="0 0 48 24"><path d="M2 9 H44 V13 H22 L18 19 H12 L15 13 H8 L5 16 H2 Z" fill="currentColor"/><rect x="24" y="13" width="10" height="3" fill="currentColor"/></svg>',
  arc: '<svg viewBox="0 0 48 24"><path d="M2 9 H26 L30 6 H38 V15 H30 L26 13 H16 L14 19 H9 L11 13 H2 Z" fill="currentColor"/><path d="M38 10 L42 7 L41 11 L46 9" stroke="currentColor" stroke-width="1.8" fill="none"/></svg>',
  minigun: '<svg viewBox="0 0 48 24"><rect x="18" y="7" width="28" height="2.4" fill="currentColor"/><rect x="18" y="11" width="28" height="2.4" fill="currentColor"/><rect x="18" y="15" width="28" height="2.4" fill="currentColor"/><path d="M2 8 H20 V18 H12 L10 22 H5 L7 18 H2 Z" fill="currentColor"/></svg>',
  mouseL: '<svg viewBox="0 0 40 56"><rect x="3" y="3" width="34" height="50" rx="17" fill="none" stroke="currentColor" stroke-width="3"/><path d="M20 3 V22" stroke="currentColor" stroke-width="3"/><path d="M5 22 V20 A15 15 0 0 1 20 5 V22 Z" fill="#ffb03a"/></svg>',
  mouseR: '<svg viewBox="0 0 40 56"><rect x="3" y="3" width="34" height="50" rx="17" fill="none" stroke="currentColor" stroke-width="3"/><path d="M20 3 V22" stroke="currentColor" stroke-width="3"/><path d="M35 22 V20 A15 15 0 0 0 20 5 V22 Z" fill="#ffb03a"/></svg>',
  stick: '<svg viewBox="0 0 56 56"><circle cx="28" cy="28" r="24" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="36" cy="22" r="10" fill="currentColor"/></svg>',
  auto: '<svg viewBox="0 0 56 56"><circle cx="28" cy="28" r="18" fill="none" stroke="#ffb03a" stroke-width="3"/><path d="M28 4 V16 M28 40 V52 M4 28 H16 M40 28 H52" stroke="currentColor" stroke-width="3"/></svg>',
  out: '<svg viewBox="0 0 64 56"><ellipse cx="24" cy="30" rx="20" ry="16" fill="rgba(78,232,255,0.25)" stroke="#4ee8ff" stroke-width="3"/><path d="M30 30 H58 M50 22 L58 30 L50 38" stroke="#ff7a4a" stroke-width="4" fill="none" stroke-linecap="round"/></svg>',
  in: '<svg viewBox="0 0 64 56"><ellipse cx="24" cy="30" rx="20" ry="16" fill="rgba(78,232,255,0.25)" stroke="#4ee8ff" stroke-width="3"/><path d="M60 30 H26 M34 22 L26 30 L34 38" stroke="#6dff5a" stroke-width="4" fill="none" stroke-linecap="round"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M4 12 L10 18 L20 6" stroke="currentColor" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};
export const ICONS = SVG;

// DOM HUD laid out per GDD section 14, rebuilt around ONE clear objective.
export class HUD {
  constructor(root, world, input) {
    this.world = world;
    this.input = input;
    this.root = root;
    this.cache = new Map();
    this._sp = { x: 0, y: 0 };
    this.lens = false;

    const h = el('div', 'hud hidden');
    h.id = 'hud';
    h.innerHTML = `
      <div class="vignette" id="vig-out"></div>
      <div class="vignette" id="vig-hurt"></div>
      <div class="vignette" id="vig-amp"></div>
      <div class="hud-tl panel">
        <div class="portrait" id="h-portrait"><span id="h-portrait-i">A</span></div>
        <div class="tl-main">
          <div class="op-row"><span id="h-opname">ASSAULT</span><span class="lvl" id="h-lvl">LV 1</span></div>
          <div class="bar hp"><div class="fill" id="h-hpfill"></div><div class="ghost" id="h-hpghost"></div><span id="h-hptext">100/100</span></div>
          <div class="buffs"><div class="buff amp hidden" id="h-amp"><i>${SVG.amp}</i><span id="h-ampt">15</span></div></div>
          <div class="outside hidden" id="h-outside"></div>
        </div>
      </div>
      <div class="hud-tc">
        <div class="objective panel" id="h-obj">
          <div class="obj-ico" id="h-objico"></div>
          <div class="obj-main">
            <div class="obj-title" id="h-objtitle"></div>
            <div class="obj-sub" id="h-objsub"></div>
            <div class="obj-prog"><i id="h-objprog"></i></div>
          </div>
        </div>
        <div class="samples panel" id="h-samples">
          <span class="s-ico">${SVG.sample}</span>
          <div class="pips" id="h-pips"></div>
          <span class="s-txt" id="h-stxt">0/6</span>
        </div>
      </div>
      <div class="hud-tr">
        <div class="panel beacon-panel" id="h-beaconpanel">
          <div class="bp-head"><span class="ico shield"></span><span class="lbl">BEACON</span><span class="val" id="h-bpct">100%</span></div>
          <div class="bar beacon"><div class="fill" id="h-bfill"></div></div>
          <div class="bp-state" id="h-bstate">ACTIVE</div>
        </div>
        <div class="res-row"><span class="res credit" id="h-credits" title="Credits">0</span><span class="res tech" id="h-tech" title="Tech (repairs the beacon)">0</span></div>
      </div>
      <div id="alert" class="hidden"></div>
      <div id="callout" class="hidden"><i></i><span></span></div>
      <div id="announce" class="hidden"></div>
      <div id="banner" class="hidden"><div class="b1"></div><div class="b2"></div></div>
      <div id="combo" class="hidden"><b id="combo-n">0</b><span>COMBO</span><div class="ct"><i id="combo-t"></i></div></div>
      <div id="loot" class="hidden"><div class="loot-ico" id="loot-ico"></div><div class="loot-tag">LOOT</div><div class="loot-name" id="loot-name"></div><div class="loot-desc" id="loot-desc"></div></div>
      <div id="tcard" class="hidden"></div>
      <div id="prompt" class="hidden"><span class="key">E</span><span class="ptxt"></span><div class="pbar"><i></i></div></div>
      <div id="actionbar">
        <div id="xpbar"><span id="xp-lv">LV 1</span><div class="xp-track"><i id="xp-fill"></i></div></div>
        <div class="loadout">
          <div class="slot weapon" id="h-weapon"><i class="wico" id="h-wico"></i><b id="h-ammo">36</b><div class="reload" id="h-reload"></div></div>
          <div class="slot nade" id="h-nade"><i>${SVG.nade}</i><b id="h-nades">0</b><em>RMB</em></div>
          <div class="slot cd" id="h-dash"><span>DASH</span><em>SPACE</em></div>
          <div class="slot cd" id="h-skill"><span id="h-skillname">SKILL</span><em>Q</em></div>
        </div>
      </div>
      <div id="lens" class="panel hidden">
        <div class="lens-title">AI DIRECTOR <span>live</span></div>
        <canvas id="lens-graph" width="240" height="56"></canvas>
        <div class="lens-row"><span>Intensity</span><b id="l-int">0</b></div>
        <div class="lens-row"><span>Pacing</span><b id="l-mode">BUILD</b></div>
        <div class="lens-row"><span>Pressure</span><b id="l-diff">x1.00</b></div>
        <div class="lens-row"><span>Profile</span><b id="l-prof">-</b></div>
        <div class="lens-styles" id="l-styles"></div>
        <div class="lens-last" id="l-last"></div>
      </div>
      <div id="world-labels">
        <div class="wl beacon-wl" id="wl-beacon"><div class="wl-t"><span class="ico shield sm"></span>BEACON <b id="wl-bpct">100%</b></div><div class="bar sm"><div class="fill" id="wl-bfill"></div></div></div>
        <div class="wl player-wl" id="wl-player"><div class="bar sm hpw"><div class="fill" id="wl-pfill"></div></div><div class="rl hidden" id="wl-reload"><i></i></div><div class="drain hidden" id="wl-drain"></div></div>
      </div>
      <div id="indicators"></div>
      <div id="flylayer"></div>
      <div id="reticle"><i></i><i></i><i></i><i></i></div>
      <div id="touch-ui">
        <div id="joy-zone"></div>
        <div id="joy-base"><div id="joy-knob"></div></div>
        <button class="tbtn dash" id="t-dash">DASH</button>
        <button class="tbtn skill" id="t-skill">SKILL</button>
        <button class="tbtn grenade" id="t-nade"><span class="ti">${SVG.nade}</span><b id="t-nadecount">0</b></button>
        <button class="tbtn interact hidden" id="t-interact">USE</button>
        <button class="tbtn ready hidden" id="t-ready">READY</button>
        <button class="tbtn pause" id="t-pause">II</button>
      </div>
    `;
    root.appendChild(h);
    this.el = h;
    this.$ = (id) => h.querySelector('#' + id);
    this.indicators = this.$('indicators');
    this.indPool = [];
    this.lanePings = [];
    this.calloutQ = [];
    this.calloutT = 0;
    this.skipReq = false;

    input.bindTouch(this.$('joy-zone'), this.$('joy-base'), this.$('joy-knob'), {
      grenade: this.$('t-nade'), dash: this.$('t-dash'), skill: this.$('t-skill'),
      interact: this.$('t-interact'), ready: this.$('t-ready'), pause: this.$('t-pause'),
    });
    this.alertEl = this.$('alert');
    this.calloutEl = this.$('callout');
    this.bannerEl = this.$('banner');
    this.announceEl = this.$('announce');
    this.promptEl = this.$('prompt');
    this.lensEl = this.$('lens');
    this.lensG = this.$('lens-graph').getContext('2d');
    this.reticle = this.$('reticle');
    this.hpGhost = 1;
    this.lensT = 0;
  }

  set(id, prop, val) {
    const k = id + '|' + prop;
    if (this.cache.get(k) === val) return;
    this.cache.set(k, val);
    const e = this.$(id);
    if (!e) return;
    if (prop === 'text') e.textContent = val;
    else if (prop === 'html') e.innerHTML = val;
    else if (prop === 'width') e.style.width = val;
    else if (prop === 'class') e.className = val;
    else if (prop === 'hidden') e.classList.toggle('hidden', val);
    else if (prop === 'opacity') e.style.opacity = val;
    else if (prop === 'cd') e.style.setProperty('--cd', val);
  }

  show(on) {
    this.el.classList.toggle('hidden', !on);
    document.body.classList.toggle('in-mission', on);
  }

  startMission(g) {
    this.show(true);
    this.cache.clear();
    this.calloutQ = [];
    this.calloutEl.classList.add('hidden');
    this.bannerEl.classList.add('hidden');
    this.alertEl.classList.add('hidden');
    this.announceEl.classList.add('hidden');
    this.$('loot').classList.add('hidden');
    this.$('combo').classList.add('hidden');
    this.$('flylayer').innerHTML = '';
    for (const i of this.indPool) i.el.style.display = 'none';
    const op = g.op;
    const col = '#' + op.color.toString(16).padStart(6, '0');
    this.$('h-portrait').style.setProperty('--op', col);
    this.$('h-portrait-i').textContent = op.name[0];
    this.set('h-opname', 'text', op.name);
    this.set('h-skillname', 'text', op.skill.id === 'phase' ? 'PHASE' : 'OVERDRIVE');
    this.$('h-skill').title = op.skill.name;
    this.$('t-skill').textContent = op.skill.id === 'phase' ? 'PHASE' : 'OVER\nDRIVE';
    this.weaponChanged(g.player.weapon);
    this.setLens(g.meta.data.settings.lens);
    this.lastBanked = 0;
  }

  setLens(on) {
    this.lens = on;
    this.lensEl.classList.toggle('hidden', !on);
  }

  weaponChanged(W) {
    this.$('h-wico').innerHTML = SVG[W.id] || SVG.ar;
    this.$('h-weapon').style.setProperty('--wc', '#' + W.color.toString(16).padStart(6, '0'));
    const s = this.$('h-weapon');
    s.classList.remove('pop'); void s.offsetWidth; s.classList.add('pop');
  }

  // ---------- one-line callouts (queued, one at a time) ----------
  callout(text, kind = 'hq') {
    if (this.calloutQ.some((c) => c.text === text) || this.curCallout === text) return;
    if (kind === 'alert') this.calloutQ.unshift({ text, kind });
    else this.calloutQ.push({ text, kind });
    if (this.calloutQ.length > 3) this.calloutQ.length = 3;
  }
  // kept for compatibility
  comm(text, kind) { this.callout(text, kind); }

  updateCallout(dt) {
    this.calloutT -= dt;
    if (this.calloutT > 0) return;
    if (this.curCallout) { this.calloutEl.classList.add('hidden'); this.curCallout = null; this.calloutT = 0.25; return; }
    const c = this.calloutQ.shift();
    if (!c) return;
    this.curCallout = c.text;
    this.calloutEl.className = 'callout-' + c.kind;
    this.calloutEl.querySelector('span').textContent = c.text;
    this.calloutEl.querySelector('i').innerHTML = c.kind === 'director' ? '◆' : c.kind === 'alert' ? '!' : c.kind === 'loot' ? '★' : c.kind === 'tip' ? 'i' : '›';
    void this.calloutEl.offsetWidth;
    this.calloutEl.classList.add('show');
    this.calloutT = 2.8;
  }

  announce(text, color = 'orange') {
    const e = this.announceEl;
    e.textContent = text;
    e.className = 'ann-' + color;
    void e.offsetWidth;
    e.classList.add('pop');
    clearTimeout(this._annT);
    this._annT = setTimeout(() => e.classList.add('hidden'), 1300);
  }

  banner(a, b = '', dur = 2.0) {
    const e = this.bannerEl;
    e.querySelector('.b1').textContent = a;
    e.querySelector('.b2').textContent = b;
    e.classList.remove('hidden');
    e.classList.remove('pop'); void e.offsetWidth; e.classList.add('pop');
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => e.classList.add('hidden'), dur * 1000);
  }

  hurt() {
    const v = this.$('vig-hurt');
    v.classList.remove('flash'); void v.offsetWidth; v.classList.add('flash');
  }

  laneWarn(x, z) { this.lanePings.push({ x, z, t: 3 }); }

  levelUp(lv) {
    this.announce(`LEVEL ${lv}`, 'teal');
    const b = this.$('xpbar');
    b.classList.remove('lvl'); void b.offsetWidth; b.classList.add('lvl');
  }

  comboEnd(n, bonus) {
    const c = this.$('combo');
    if (bonus > 0) {
      this.$('combo-n').textContent = '+' + bonus;
      c.querySelector('span').textContent = 'CREDITS';
      c.classList.add('cash');
      setTimeout(() => c.classList.add('hidden'), 1100);
    } else c.classList.add('hidden');
  }

  lootReveal(icon, name, desc, tag = 'LOOT') {
    const L = this.$('loot');
    this.$('loot-ico').innerHTML = icon && icon.startsWith('<svg') ? icon : (SVG[icon] || SVG.amp);
    L.querySelector('.loot-tag').textContent = tag;
    L.classList.toggle('spec', tag !== 'LOOT');
    this.$('loot-name').textContent = name;
    this.$('loot-desc').textContent = desc || '';
    L.classList.remove('hidden', 'pop'); void L.offsetWidth; L.classList.add('pop');
    clearTimeout(this._lootT);
    this._lootT = setTimeout(() => L.classList.add('hidden'), 2400);
  }

  // A sample flies from where it was picked up into the objective pips
  flySample(sx, sy, n) {
    const pips = this.$('h-pips');
    const r = pips.getBoundingClientRect();
    for (let i = 0; i < n; i++) {
      const f = el('div', 'fly-sample', SVG.sample);
      f.style.transform = `translate(${sx}px, ${sy}px) scale(1.4)`;
      this.$('flylayer').appendChild(f);
      setTimeout(() => {
        f.style.transform = `translate(${r.left + r.width / 2}px, ${r.top + r.height / 2}px) scale(0.6)`;
        f.style.opacity = '0.2';
      }, 30 + i * 120);
      setTimeout(() => { f.remove(); this.pulse('h-samples'); }, 650 + i * 120);
    }
  }

  banked() { this.pulse('h-samples', 'bank'); }

  pulse(id, cls = 'pulse') {
    const e = this.$(id);
    e.classList.remove(cls); void e.offsetWidth; e.classList.add(cls);
  }

  // ---------- tutorial card ----------
  tutorialCard(info) {
    const c = this.$('tcard');
    if (!info) { c.classList.add('hidden'); return; }
    const S = info.step, v = info.touch ? S.touch : S.desk;
    const dots = Array.from({ length: info.total }, (_, i) => `<i class="${i < info.index ? 'd' : i === info.index ? 'c' : ''}"></i>`).join('');
    let vis = '';
    if (v.keys) vis = `<div class="kcs">${v.keys.map((k) => `<span class="kc ${k.length > 1 ? 'wide' : ''}">${k}</span>`).join('')}</div>`;
    else {
      const map = { mouse: 'mouseL', rmouse: 'mouseR', stick: 'stick', auto: 'auto', out: 'out', in: 'in' };
      if (map[v.icon]) vis = `<div class="tic">${SVG[map[v.icon]]}</div>`;
      else if (v.icon === 'btn-dash') vis = '<div class="tbtn-demo">DASH</div>';
      else if (v.icon === 'btn-nade') vis = `<div class="tbtn-demo">${SVG.nade}</div>`;
    }
    c.innerHTML = `<div class="tdots">${dots}</div><div class="trow">${vis}<div class="ttxt"><b>${S.title}</b><span>${v.sub}</span></div><div class="tcheck">${SVG.check}</div></div><button class="tskip" id="tskip">SKIP TRAINING${info.touch ? '' : ' (ENTER)'}</button>`;
    c.classList.remove('hidden', 'done', 'pop'); void c.offsetWidth; c.classList.add('pop');
    c.querySelector('#tskip').onclick = (e) => { e.stopPropagation(); this.skipReq = true; };
  }
  tutorialDone() { this.$('tcard').classList.add('done'); }
  consumeSkip() { const s = this.skipReq; this.skipReq = false; return s; }

  // ---------------------------------------------------------
  update(g, dt) {
    const p = g.player, b = g.beacon;
    this.el.classList.toggle('paused', !!g.paused);
    this.updateCallout(dt);
    // ---- top left ----
    const hpPct = clamp(p.hp / p.maxHp, 0, 1);
    this.set('h-hpfill', 'width', (hpPct * 100).toFixed(1) + '%');
    this.hpGhost = Math.max(hpPct, this.hpGhost - dt * 0.35);
    this.set('h-hpghost', 'width', (this.hpGhost * 100).toFixed(1) + '%');
    this.set('h-hptext', 'text', `${Math.ceil(p.hp)} / ${p.maxHp}`);
    this.set('h-hpfill', 'class', 'fill' + (hpPct < 0.3 ? ' low' : ''));
    this.set('h-lvl', 'text', `LV ${g.level}`);
    const W = p.weapon;
    this.set('h-ammo', 'text', p.reloadT > 0 ? '···' : `${p.ammo}`);
    this.set('h-weapon', 'class', 'slot weapon' + (p.reloadT > 0 ? ' reloading' : p.ammo <= W.mag * 0.25 ? ' low' : ''));
    this.set('h-reload', 'width', p.reloadT > 0 ? ((1 - p.reloadT / W.reload) * 100).toFixed(0) + '%' : '0%');
    this.set('h-nades', 'text', String(g.loot.grenades));
    this.set('h-nade', 'class', 'slot nade' + (g.loot.grenades > 0 ? ' has' : ''));
    this.set('t-nadecount', 'text', String(g.loot.grenades));
    this.set('t-nade', 'class', 'tbtn grenade' + (g.loot.grenades > 0 ? '' : ' empty'));
    const dashMax = CFG.player.dashCd * (g.opId === 'scout' ? 0.8 : 1);
    this.set('h-dash', 'cd', (p.dashCd / dashMax).toFixed(2));
    this.set('h-dash', 'class', 'slot cd' + (p.dashCd <= 0 ? ' ready' : ''));
    this.set('h-skill', 'cd', (p.skillCd / g.op.skill.cd).toFixed(2));
    this.set('h-skill', 'class', 'slot cd' + (p.skillT > 0 ? ' active' : p.skillCd <= 0 ? ' ready' : ''));
    this.$('t-dash').style.setProperty('--cd', (p.dashCd / dashMax).toFixed(2));
    this.$('t-skill').style.setProperty('--cd', (p.skillCd / g.op.skill.cd).toFixed(2));
    this.set('h-amp', 'hidden', !(g.loot.ampT > 0));
    if (g.loot.ampT > 0) this.set('h-ampt', 'text', Math.ceil(g.loot.ampT) + 's');
    this.set('vig-amp', 'opacity', g.loot.ampT > 0 ? '1' : '0');

    // outside warning
    const inField = g.isInField();
    const fieldOn = g.fieldOn();
    const out = !inField && !g.padSafe() && b.deployed && !p.dead && g.phase !== 'extracted';
    let outTxt = '';
    if (out) {
      const toSafe = Math.max(0, dist(p.x, p.z, b.x, b.z) - b.radius);
      if (p.drainRate > 0) outTxt = `<b>TOXIC</b> −${p.drainRate.toFixed(1)}/s` + (fieldOn ? ` · ${toSafe.toFixed(0)}m to field` : ' · FIELD DOWN');
      else outTxt = `<b>OUTSIDE</b> drain in ${Math.max(0, CFG.field.exitGrace - p.outsideT).toFixed(1)}s`;
    }
    this.set('h-outside', 'html', outTxt);
    this.set('h-outside', 'class', 'outside' + (out ? '' : ' hidden') + (p.drainRate > p.maxHp * 0.03 ? ' severe' : ''));
    this.set('vig-out', 'opacity', (out ? clamp(0.35 + (p.drainRate / (p.maxHp * 0.045)) * 0.65, 0.35, 1) : 0).toFixed(2));

    // ---- objective ----
    const o = g.objective();
    this.set('h-objtitle', 'text', o.title);
    this.set('h-objsub', 'text', o.sub);
    this.set('h-objico', 'html', SVG[o.icon] || '');
    this.set('h-obj', 'class', 'objective panel ob-' + o.icon + (o.alert ? ' alert' : ''));
    if (this.cache.get('objt') !== o.title) { this.cache.set('objt', o.title); this.pulse('h-obj', 'newobj'); }
    let prog = o.prog;
    if (o.timer !== undefined) prog = 1 - clamp(o.timer / 16, 0, 1);
    if (g.phase === 'extracting') prog = 1 - clamp(g.ext.countdown / CFG.extraction.countdown, 0, 1);
    this.set('h-objprog', 'width', prog !== undefined ? (prog * 100).toFixed(0) + '%' : '0%');

    // sample pips: banked (solid) + carried (hollow, pulsing)
    const Q = CFG.quota;
    const banked = b.bankedBio, carried = p.carriedBio;
    const key = `${banked}|${carried}`;
    if (this.cache.get('pips') !== key) {
      this.cache.set('pips', key);
      let html = '';
      const n = Math.max(Q, banked + carried);
      for (let i = 0; i < n; i++) html += `<i class="${i < banked ? 'b' : i < banked + carried ? 'c' : ''}${i >= Q ? ' extra' : ''}"></i>`;
      this.$('h-pips').innerHTML = html;
    }
    this.set('h-stxt', 'html', `<b>${banked}</b>/${Q}` + (carried ? ` <em>+${carried} carried</em>` : ''));
    this.set('h-samples', 'class', 'samples panel' + (banked >= Q ? ' done' : '') + (carried ? ' carrying' : ''));

    // ---- top right: beacon ----
    const bp = clamp(b.hp / b.maxHp, 0, 1);
    this.set('h-bpct', 'text', Math.round(bp * 100) + '%');
    this.set('h-bfill', 'width', (bp * 100).toFixed(1) + '%');
    const stLabel = {
      deploying: 'DEPLOYING', active: 'ACTIVE', contested: 'UNDER ATTACK', critical: 'CRITICAL',
      disrupted: `FIELD DOWN ${Math.ceil(b.disruptT)}s`, destroyed: `DESTROYED · ${Math.ceil(b.emergencyT)}s`, rebooting: 'REBOOTING',
    }[b.state];
    this.set('h-bstate', 'text', stLabel);
    this.set('h-beaconpanel', 'class', 'panel beacon-panel st-' + b.state);
    this.set('h-credits', 'text', String(g.run.credits));
    this.set('h-tech', 'text', String(g.run.tech));

    // ---- alert (most important persistent state) ----
    let alert = '';
    let charging = null;
    for (const e of g.enemies) if (e.type === 'disruptor' && e.state === 'charge' && !e.dead) charging = e;
    if (b.destroyed && !g.over && g.phase !== 'failing') alert = `BEACON DOWN · ${b.kits > 0 ? 'REBOOT IT' : 'START GENERATOR'} · ${Math.ceil(b.emergencyT)}s`;
    else if (charging) alert = `EMP ${Math.round(charging.chargeT * 100)}% · KILL THE DISRUPTOR`;
    else if (b.disruptT > 0) alert = `FIELD DOWN · ${Math.ceil(b.disruptT)}s`;
    else if (b.state === 'critical' && g.phase !== 'extracted' && g.phase !== 'tutorial') alert = 'BEACON CRITICAL';
    this.set('alert', 'text', alert);
    this.set('alert', 'hidden', !alert);

    // ---- combo ----
    const c = g.combo;
    if (c.n >= 3 && c.t > 0) {
      const ce = this.$('combo');
      if (ce.classList.contains('hidden') || ce.classList.contains('cash')) { ce.classList.remove('hidden', 'cash'); ce.querySelector('span').textContent = 'COMBO'; }
      if (this.cache.get('combo') !== c.n) { this.cache.set('combo', c.n); this.$('combo-n').textContent = 'x' + c.n; this.pulse('combo', 'bump'); }
      this.$('combo-t').style.width = (c.t / 3 * 100).toFixed(0) + '%';
    }

    // ---- XP bar ----
    this.set('xp-fill', 'width', (clamp(g.xp / g.xpNext, 0, 1) * 100).toFixed(1) + '%');
    this.set('xp-lv', 'text', `LV ${g.level}`);

    // ---- interaction prompt ----
    const it = g.interact;
    if (it) {
      this.promptEl.querySelector('.key').textContent = this.input.touchMode ? 'USE' : 'E';
      this.set('prompt', 'hidden', false);
      this.promptEl.querySelector('.ptxt').textContent = 'HOLD · ' + it.text;
      const pr = it.kind === 'repair' ? clamp(it.progress || b.hp / b.maxHp, 0, 1) : clamp((it.progress || 0) / it.hold, 0, 1);
      this.promptEl.querySelector('.pbar i').style.width = (pr * 100).toFixed(0) + '%';
      this.promptEl.classList.toggle('disabled', !!it.noTech);
    } else this.set('prompt', 'hidden', true);
    this.set('t-interact', 'hidden', !it);
    this.set('t-ready', 'hidden', g.phase !== 'lull');

    // ---- world labels ----
    this.world.toScreen(b.x, b.model.group.position.y + 3.6, b.z, this._sp);
    this.$('wl-beacon').style.transform = `translate(${this._sp.x.toFixed(1)}px, ${this._sp.y.toFixed(1)}px) translate(-50%,-100%)`;
    this.set('wl-bpct', 'text', b.destroyed ? 'OFFLINE' : Math.round(bp * 100) + '%');
    this.set('wl-bfill', 'width', (bp * 100).toFixed(1) + '%');
    const bNeeds = !['active', 'deploying'].includes(b.state) || bp < 0.6;
    this.set('wl-beacon', 'class', 'wl beacon-wl st-' + b.state + (bNeeds ? '' : ' quiet'));
    const wp = this.$('wl-player');
    const showP = !p.dead && g.phase !== 'extracted' && (hpPct < 0.999 || p.drainRate > 0 || p.reloadT > 0);
    wp.style.display = showP ? 'block' : 'none';
    if (showP) {
      this.world.toScreen(p.x, 2.2, p.z, this._sp);
      wp.style.transform = `translate(${this._sp.x.toFixed(1)}px, ${this._sp.y.toFixed(1)}px) translate(-50%,-100%)`;
      this.set('wl-pfill', 'width', (hpPct * 100).toFixed(1) + '%');
      this.set('wl-pfill', 'class', 'fill' + (hpPct < 0.3 ? ' low' : ''));
      this.set('wl-drain', 'hidden', !(p.drainRate > 0));
      if (p.drainRate > 0) this.set('wl-drain', 'text', `−${p.drainRate.toFixed(1)}/s`);
      this.set('wl-reload', 'hidden', !(p.reloadT > 0));
      if (p.reloadT > 0) wp.querySelector('.rl i').style.width = ((1 - p.reloadT / W.reload) * 100).toFixed(0) + '%';
    }

    // ---- reticle (desktop) ----
    if (!this.input.touchMode) {
      this.reticle.style.transform = `translate(${this.input.mouse.x}px, ${this.input.mouse.y}px)`;
      const spread = 8 + (W.spread || 0.02) * 120 + (p.firing ? 6 : 0) + p.recoil * 4;
      this.reticle.style.setProperty('--s', spread.toFixed(1) + 'px');
      this.reticle.style.setProperty('--rc', '#' + W.color.toString(16).padStart(6, '0'));
    }

    this.updateIndicators(g, dt, charging);

    if (this.lens) {
      this.lensT -= dt;
      if (this.lensT <= 0) { this.lensT = 0.2; this.drawLens(g); }
    }
  }

  indicator(i) {
    if (!this.indPool[i]) {
      const e = el('div', 'ind', '<div class="arr"></div><span></span>');
      this.indicators.appendChild(e);
      this.indPool[i] = { el: e, span: e.querySelector('span'), arr: e.querySelector('.arr') };
    }
    return this.indPool[i];
  }

  updateIndicators(g, dt, charging) {
    const p = g.player, b = g.beacon;
    const targets = [];
    const surveyed = g.meta.data.codex.zones;
    for (const c of g.caches) {
      if (c.collected) continue;
      if (c.node) { if (!surveyed[c.node] && g.phase !== 'tutorial') targets.push({ x: c.x, z: c.z, cls: 'node', label: 'NODE' }); continue; }
      targets.push({ x: c.x, z: c.z, cls: c.crate ? 'loot' : c.specimen ? 'rare' : 'bio', label: c.crate ? 'LOOT' : c.specimen ? 'SPECIMEN' : 'SAMPLE' });
    }
    targets.push({ x: b.x, z: b.z, cls: b.destroyed ? 'alert' : 'beacon', label: 'BEACON' });
    if (['extract', 'extracting'].includes(g.phase)) targets.push({ x: CFG.extraction.x, z: CFG.extraction.z, cls: 'ext', label: 'PAD' });
    if (g.generator) targets.push({ x: g.generator.x, z: g.generator.z, cls: 'alert', label: 'GENERATOR' });
    if (charging) targets.push({ x: charging.x, z: charging.z, cls: 'emp', label: 'EMP' });
    for (const e of g.enemies) {
      if (e.dead) continue;
      if (e.type === 'elite') targets.push({ x: e.x, z: e.z, cls: 'alert', label: 'ELITE' });
      else if (e.hunt) targets.push({ x: e.x, z: e.z, cls: 'alert', label: 'HOSTILE' });
    }
    for (let k = this.lanePings.length - 1; k >= 0; k--) {
      const lp = this.lanePings[k];
      lp.t -= dt;
      if (lp.t <= 0) { this.lanePings.splice(k, 1); continue; }
      targets.push({ x: lp.x, z: lp.z, cls: 'lane', label: '!' });
    }
    const W = innerWidth, H = innerHeight;
    const L = 60, R = W - 60, T = 150, B = H - 70;
    let n = 0;
    for (const t of targets) {
      this.world.toScreen(t.x, 0.5, t.z, this._sp);
      const sx = this._sp.x, sy = this._sp.y;
      if (sx > 20 && sx < W - 20 && sy > 20 && sy < H - 20) continue;
      const cx = (L + R) / 2, cy = (T + B) / 2;
      const dx = sx - cx, dy = sy - cy;
      const sc = Math.min((R - cx) / Math.abs(dx || 1e-3), (B - cy) / Math.abs(dy || 1e-3));
      const ix = cx + dx * sc, iy = cy + dy * sc;
      const ind = this.indicator(n++);
      ind.el.style.display = 'flex';
      ind.el.className = 'ind ' + t.cls;
      ind.el.style.transform = `translate(${ix.toFixed(0)}px, ${iy.toFixed(0)}px) translate(-50%,-50%)`;
      ind.arr.style.transform = `rotate(${Math.atan2(dy, dx)}rad) translateX(${t.cls === 'lane' ? 18 : 30}px)`;
      ind.span.textContent = t.cls === 'lane' ? '!' : `${t.label} ${Math.round(dist(p.x, p.z, t.x, t.z))}m`;
    }
    for (let i = n; i < this.indPool.length; i++) this.indPool[i].el.style.display = 'none';
  }

  drawLens(g) {
    const d = g.director;
    const c = this.lensG, w = 240, h = 56;
    c.clearRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,0.05)';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(255,90,90,0.35)';
    c.beginPath(); c.moveTo(0, h - 0.72 * h); c.lineTo(w, h - 0.72 * h); c.stroke();
    const hs = d.history;
    c.strokeStyle = '#4ee8ff'; c.lineWidth = 2;
    c.beginPath();
    for (let i = 0; i < hs.length; i++) {
      const x = w - (hs.length - 1 - i) * 2;
      const y = h - (hs[i] / 100) * (h - 4) - 2;
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.stroke();
    this.set('l-int', 'text', Math.round(d.intensity).toString());
    this.set('l-mode', 'text', d.mode.toUpperCase());
    this.set('l-diff', 'text', 'x' + d.diff.toFixed(2));
    this.set('l-prof', 'text', d.styleName());
    const s = d.style;
    this.set('l-styles', 'html', Object.keys(s).map((k) => `<div class="ls"><span>${k}</span><i style="width:${Math.round(s[k] * 100)}%"></i></div>`).join(''));
    const last = d.log[d.log.length - 1];
    this.set('l-last', 'html', last ? `<b>${fmtTime(last.t)} ${last.title}</b><br>${last.text}` : 'Observing...');
  }
}
