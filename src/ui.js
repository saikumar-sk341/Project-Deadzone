import { CFG } from './config.js';
import { RESEARCH, ARMORY, SKINS, CHEST_MS } from './meta.js';
import { UPGRADES, CAT_INFO } from './upgrades.js';
import { el, fmtTime, fmtHMS } from './util.js';
import { sfx } from './audio.js';
import { STORY } from './story.js';
import { SPECIMENS, ZONES, MILESTONES, specIcon, mapSvg } from './codex.js';

const ICON = {
  credits: '<span class="ri credit"></span>', bio: '<span class="ri bio"></span>',
  tech: '<span class="ri tech"></span>', mutagen: '<span class="ri mut"></span>',
};
function costHtml(cost) {
  return Object.entries(cost).filter(([, v]) => v > 0).map(([k, v]) => `${ICON[k] || ''}${v}`).join(' ');
}
const GEAR = '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.5 7.5 0 0 0-1.7-1L15 3h-4l-.4 2.7a7.5 7.5 0 0 0-1.7 1l-2.5-1-2 3.5L6.5 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.5 7.5 0 0 0 1.7 1L11 21h4l.4-2.7a7.5 7.5 0 0 0 1.7-1l2.5 1 2-3.5zM13 15.5A3.5 3.5 0 1 1 13 8.5a3.5 3.5 0 0 1 0 7z"/></svg>';
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

export class UI {
  constructor(root, app) {
    this.app = app;
    this.root = root;
    this.screens = {};
    for (const id of ['title', 'story', 'hq', 'results', 'upgrade', 'pause', 'settings', 'modal']) {
      const s = el('div', 'screen hidden ' + id);
      s.id = 'screen-' + id;
      root.appendChild(s);
      this.screens[id] = s;
    }
    this.chestTimer = null;
  }

  hideAll() {
    for (const s of Object.values(this.screens)) s.classList.add('hidden');
    clearInterval(this.chestTimer);
  }
  show(id) { this.screens[id].classList.remove('hidden'); }
  hide(id) { this.screens[id].classList.add('hidden'); }

  // ---------------- TITLE ----------------
  title() {
    const m = this.app.meta;
    const s = this.screens.title;
    const first = m.firstRun;
    this.app.setMenuView('title');
    s.innerHTML = `
      <button class="icon-btn gear" id="t-settings" title="Settings">${GEAR}</button>
      <div class="title-wrap">
        <div class="logo"><span class="l1">PROJECT</span><span class="l2">DEADZONE</span></div>
        <div class="tagline">Defend your lifeline. Venture into the deadzone. Bring the samples home.</div>
        <button class="btn primary big" id="t-go">${first ? 'PLAY' : 'CONTINUE'}</button>
        <div class="pillars">
          <div><i class="pc cy"></i>Hold the field</div>
          <div><i class="pc gr"></i>Grab the samples</div>
          <div><i class="pc or"></i>Get out alive</div>
        </div>
        ${first ? '' : '<button class="link-btn" id="t-story">Watch the story</button>'}
      </div>
      <div class="title-foot dim">Prototype · best with sound · ~5 min missions</div>`;
    this.hideAll();
    this.show('title');
    s.querySelector('#t-go').onclick = () => {
      sfx.init(); sfx.ui();
      if (first) this.story(() => this.app.deploy({ operative: 'assault', weapon: 'ar' }));
      else this.hq();
    };
    const sb = s.querySelector('#t-story');
    if (sb) sb.onclick = () => { sfx.init(); sfx.ui(); this.story(() => this.title()); };
    s.querySelector('#t-settings').onclick = () => { sfx.init(); sfx.ui(); this.settings(() => this.title()); };
  }

  // ---------------- STORY (3 illustrated panels) ----------------
  story(done) {
    const s = this.screens.story;
    let i = 0;
    const render = () => {
      const P = STORY[i];
      s.innerHTML = `<div class="story-wrap">
        <div class="story-art">${P.svg}</div>
        <div class="story-cap">
          <div class="story-dots">${STORY.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
          <h2>${P.title}</h2><p>${P.text}</p>
          <div class="story-btns"><button class="btn ghost sm" id="st-skip">SKIP</button><button class="btn primary" id="st-next">${i < STORY.length - 1 ? 'NEXT' : 'DEPLOY'}</button></div>
        </div></div>`;
      s.querySelector('#st-next').onclick = (e) => { e.stopPropagation(); next(); };
      s.querySelector('#st-skip').onclick = (e) => { e.stopPropagation(); finish(); };
      s.querySelector('.story-art').onclick = () => next();
    };
    const finish = () => { this.hide('story'); done(); };
    const next = () => { sfx.ui(); i++; if (i >= STORY.length) finish(); else render(); };
    this.hideAll();
    this.show('story');
    render();
  }

  // ---------------- HQ (home screen) ----------------
  hq(flash, tab) {
    const app = this.app, m = app.meta, d = m.data;
    m.ensureContract();
    if (tab) this.hqTab = tab;
    this.hqTab = this.hqTab || 'play';
    app.setMenuView('hq');
    const s = this.screens.hq;
    const r = d.res;
    const A = d.armory;
    const chest = m.chestState();
    const contract = m.contract();

    // what is actionable (drives the dots on the tabs)
    const armoryCosts = [
      A.arLevel < ARMORY.arLevel.max && ARMORY.arLevel.cost(A.arLevel),
      A.shotgun ? A.sgLevel < ARMORY.sgLevel.max && ARMORY.sgLevel.cost(A.sgLevel) : ARMORY.shotgun.cost(),
      A.beaconHp < ARMORY.beaconHp.max && ARMORY.beaconHp.cost(A.beaconHp),
      A.repairKit < 1 && ARMORY.repairKit.cost(),
    ].filter(Boolean);
    const badge = {
      research: ['fieldMk2', 'nanites', 'region2'].some((k) => d.research[k] !== true && m.canAfford(RESEARCH[k].cost)),
      armory: armoryCosts.some((c) => m.canAfford(c)),
      rewards: chest.state === 'ready' || m.streakInfo().claimable,
    };
    // one-time arrival notifications (once per session each)
    this.notified = this.notified || {};
    if (!flash) {
      if (m.streakInfo().claimable && !this.notified.streak && d.missions > 0) { this.notified.streak = true; flash = `Day ${d.streak.days} streak reward is waiting in Rewards`; }
      else if (chest.state === 'ready' && !this.notified.chest) { this.notified.chest = true; flash = 'Your supply drop has arrived. Open it in Rewards'; }
    }
    const pill = (k, label) => `<div class="rpill ${k}" title="${label}">${ICON[k]}<b>${r[k]}</b><span>${label}</span></div>`;
    const tabs = [['play', 'MISSION'], ['research', 'RESEARCH'], ['armory', 'ARMORY'], ['codex', 'CODEX'], ['rewards', 'REWARDS']];
    const op = CFG.operatives[d.operative] || CFG.operatives.assault;

    s.innerHTML = `
      <div class="hq2">
        <header class="hq-bar">
          <div class="hq-brand"><b>DEADZONE</b><span>HQ</span></div>
          <div class="hq-pills">${pill('credits', 'Credits')}${pill('bio', 'Bio Samples')}${pill('tech', 'Tech')}${pill('mutagen', 'Mutagen')}</div>
          <button class="icon-btn" id="hq-settings" title="Settings">${GEAR}</button>
        </header>
        <main class="hq-body">
          <section class="hq-panel">
            <nav class="hq-tabs">${tabs.map(([k, l]) => `<button class="hq-tab ${this.hqTab === k ? 'on' : ''}" data-tab="${k}">${l}${badge[k] ? '<i class="dot"></i>' : ''}</button>`).join('')}</nav>
            ${flash ? `<div class="hq-flash">${flash}</div>` : ''}
            <div class="hq-content">${this.hqTabHtml(this.hqTab, chest, contract)}</div>
          </section>
          <aside class="hq-hero">
            <div class="hero-tag">REGION 1 · RESEARCH OUTPOST</div>
            <div class="hero-name">OUTPOST ZERO</div>
            <div class="hero-obj"><span><i class="pc gr"></i>Bank 6 Bio Samples</span><span><i class="pc cy"></i>Keep the beacon alive</span><span><i class="pc or"></i>Extract</span></div>
            <div class="hero-loadout"><span style="--op:#${op.color.toString(16).padStart(6, '0')}">${op.name}</span><span>${CFG.weapons[d.weapon].name}</span></div>
            <button class="btn primary big deploy" id="hq-deploy">DEPLOY</button>
          </aside>
        </main>
      </div>`;
    this.hideAll();
    this.show('hq');
    d.seenHQ = true;
    m.save();
    const re = (msg) => this.hq(msg);

    s.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { sfx.ui(); this.hq(null, b.dataset.tab); });
    s.querySelector('#hq-settings').onclick = () => { sfx.ui(); this.settings(() => this.hq()); };
    s.querySelector('#hq-deploy').onclick = () => { sfx.init(); sfx.ui(); app.deploy({ operative: d.operative, weapon: d.weapon }); };
    s.querySelectorAll('[data-op]').forEach((b) => b.onclick = () => {
      const id = b.dataset.op;
      if (!d.unlocked[id]) { sfx.denied(); this.hq(null, 'research'); return; }
      d.operative = id; m.save(); sfx.ui(); re();
    });
    s.querySelectorAll('[data-wp]').forEach((b) => b.onclick = () => {
      const id = b.dataset.wp;
      if (id === 'shotgun' && !A.shotgun) { sfx.denied(); this.hq(null, 'armory'); return; }
      d.weapon = id; m.save(); sfx.ui(); re();
    });
    s.querySelectorAll('[data-research]').forEach((b) => b.onclick = () => {
      const k = b.dataset.research;
      if (m.spend(RESEARCH[k].cost)) { d.research[k] = true; m.save(); sfx.upgrade(); re(`Research complete · ${RESEARCH[k].name}`); }
      else sfx.denied();
    });
    s.querySelectorAll('[data-armory]').forEach((b) => b.onclick = () => {
      const k = b.dataset.armory;
      const cost = k === 'arLevel' ? ARMORY.arLevel.cost(A.arLevel) : k === 'sgLevel' ? ARMORY.sgLevel.cost(A.sgLevel)
        : k === 'shotgun' ? ARMORY.shotgun.cost() : k === 'beaconHp' ? ARMORY.beaconHp.cost(A.beaconHp) : ARMORY.repairKit.cost();
      if (!m.spend(cost)) { sfx.denied(); return; }
      if (k === 'arLevel') A.arLevel++;
      else if (k === 'sgLevel') A.sgLevel++;
      else if (k === 'shotgun') { A.shotgun = true; d.weapon = 'shotgun'; }
      else if (k === 'beaconHp') A.beaconHp++;
      else A.repairKit = 1;
      m.save(); sfx.upgrade(); re('Upgrade installed');
    });
    s.querySelectorAll('[data-skin]').forEach((b) => b.onclick = () => { d.skins.active = b.dataset.skin; m.save(); sfx.ui(); app.updateMenuSkin(); re(); });
    const openChest = () => {
      const out = m.openChest();
      sfx.success();
      let msg = `Supply drop opened · +${out.reward.credits} credits · +${out.reward.tech} tech · +${out.reward.bio} bio`;
      if (out.skin) msg += ` · new beacon skin: ${SKINS[out.skin].name}`;
      if (out.scoutUnlocked) msg += ' · SCOUT UNLOCKED';
      re(msg);
    };
    const sc = s.querySelector('#streak-claim');
    if (sc) sc.onclick = () => {
      const S = m.claimStreak();
      if (!S) return;
      sfx.success();
      re(S.reward.chest ? `Day ${d.streak.days} reward: a free supply drop is ready` : `Day ${d.streak.days} reward claimed: ${S.label}`);
    };
    const co = s.querySelector('#chest-open');
    if (co) co.onclick = openChest;
    const ad = s.querySelector('#chest-ad');
    if (ad) ad.onclick = () => this.fakeAd(openChest);
    if (chest.state === 'waiting') {
      this.chestTimer = setInterval(() => {
        const st = m.chestState();
        const e = s.querySelector('#chest-left');
        if (st.state === 'ready') { clearInterval(this.chestTimer); re(); }
        else if (e) e.textContent = fmtHMS(st.left);
      }, 1000);
    }
  }

  hqTabHtml(tab, chest, contract) {
    const m = this.app.meta, d = m.data, A = d.armory;
    const row = (title, sub, right, cls = '') => `<div class="hrow ${cls}"><div class="hrow-t"><b>${title}</b><span>${sub}</span></div>${right}</div>`;
    const buy = (attr, cost) => `<button class="btn sm buy ${m.canAfford(cost) ? '' : 'disabled'}" ${attr}>${costHtml(cost)}</button>`;
    const done = (t) => `<em class="ok">${t}</em>`;
    const scoutPct = Math.round((d.research.scout / RESEARCH.scout.cost.bio) * 100);
    if (tab === 'play') {
      const opCard = (id) => {
        const o = CFG.operatives[id];
        const unlocked = d.unlocked[id];
        const col = '#' + o.color.toString(16).padStart(6, '0');
        return `<button class="pick-card ${d.operative === id ? 'sel' : ''} ${unlocked ? '' : 'locked'}" data-op="${id}" style="--op:${col}">
          <div class="pick-ic">${o.name[0]}</div>
          <b>${o.name}</b>
          <span>${unlocked ? esc(o.passive) : `${m.scoutRemaining()} Bio Samples to unlock`}</span>
          ${unlocked ? '' : `<div class="mini-bar"><i style="width:${scoutPct}%"></i></div>`}
        </button>`;
      };
      const wpCard = (id) => {
        const w = CFG.weapons[id];
        const owned = id === 'ar' || A.shotgun;
        const lvl = id === 'ar' ? A.arLevel : A.sgLevel;
        return `<button class="wpick ${d.weapon === id ? 'sel' : ''} ${owned ? '' : 'locked'}" data-wp="${id}"><b>${w.name}</b><span>${owned ? 'Level ' + lvl : 'Unlock in Armory'}</span></button>`;
      };
      return `
        <h4>OPERATIVE</h4><div class="pick-row">${opCard('assault')}${opCard('scout')}</div>
        <h4>WEAPON</h4><div class="pick-row">${wpCard('ar')}${wpCard('shotgun')}</div>
        <h4>TODAY</h4>
        ${row('Daily contract', esc(contract.text), d.contract.done ? done('DONE') : `<span class="reward">${costHtml(contract.reward)}</span>`, d.contract.done ? 'is-done' : '')}
        ${row('Next region', 'Overgrown Industrial Zone · needs a Lab survey', `<em class="lock">LOCKED</em>`, 'is-locked')}`;
    }
    if (tab === 'research') {
      const scoutDone = d.unlocked.scout;
      const item = (k) => {
        const R = RESEARCH[k];
        return row(R.name, R.desc, d.research[k] === true ? done('DONE') : buy(`data-research="${k}"`, R.cost), d.research[k] === true ? 'is-done' : '');
      };
      return `
        <div class="feature ${scoutDone ? 'is-done' : ''}">
          <div class="feat-head"><b>UNLOCK SCOUT</b><span>${scoutDone ? 'COMPLETE' : `${d.research.scout} / ${RESEARCH.scout.cost.bio}`}</span></div>
          <div class="big-bar"><i style="width:${scoutDone ? 100 : scoutPct}%"></i></div>
          <p>${scoutDone ? 'Scout is ready. Pick it on the Mission tab.' : `Bio Samples you bring home feed this automatically. <b>${m.scoutRemaining()} more to go.</b>`}</p>
        </div>
        <h4>PROJECTS</h4>${item('fieldMk2')}${item('nanites')}${item('region2')}`;
    }
    if (tab === 'armory') {
      const lvlRow = (key, name, lvl, max, sub, cost) => row(`${name} <small>LV ${lvl}${lvl >= max ? '' : ' → ' + (lvl + 1)}</small>`, sub, lvl >= max ? done('MAX') : buy(`data-armory="${key}"`, cost), lvl >= max ? 'is-done' : '');
      return `
        <h4>WEAPONS</h4>
        ${lvlRow('arLevel', 'Assault Rifle', A.arLevel, ARMORY.arLevel.max, '+10% damage per level', ARMORY.arLevel.cost(A.arLevel))}
        ${A.shotgun ? lvlRow('sgLevel', 'Breacher Shotgun', A.sgLevel, ARMORY.sgLevel.max, '+10% damage per level', ARMORY.sgLevel.cost(A.sgLevel))
          : row('Breacher Shotgun', 'Close-range burst weapon', buy('data-armory="shotgun"', ARMORY.shotgun.cost()))}
        <h4>BEACON</h4>
        ${lvlRow('beaconHp', 'Reinforced Core', A.beaconHp, ARMORY.beaconHp.max, '+15% beacon durability', ARMORY.beaconHp.cost(A.beaconHp))}
        ${row('Emergency Kit', '+1 beacon reboot per mission', A.repairKit >= 1 ? done('OWNED') : buy('data-armory="repairKit"', ARMORY.repairKit.cost()), A.repairKit >= 1 ? 'is-done' : '')}
        <h4>BEACON SKIN</h4>
        <div class="skins">${Object.keys(SKINS).map((k) => {
          const owned = d.skins.owned.includes(k);
          const c = '#' + SKINS[k].color.toString(16).padStart(6, '0');
          return owned ? `<button class="skin ${d.skins.active === k ? 'sel' : ''}" data-skin="${k}" style="--c:${c}"><i></i>${SKINS[k].name}</button>`
            : `<div class="skin locked" style="--c:${c}"><i></i>From supply drops</div>`;
        }).join('')}</div>`;
    }
    if (tab === 'codex') {
      const C = d.codex;
      const grid = SPECIMENS.map((S) => {
        const known = C.discovered.includes(S.id);
        return `<div class="spec ${known ? 'known' : 'unknown'}" style="--c:${S.color}"><div class="spec-ico">${specIcon(S.color, !known)}</div>
          <b>${known ? S.name : '???'}</b><span>${known ? `${C.counts[S.id] || 0} collected · ${S.lore}` : S.src}</span></div>`;
      }).join('');
      const nextM = m.nextMilestone();
      const surveyedN = ZONES.filter((Z) => C.zones[Z.id]).length;
      return `
        <div class="codex-head"><div><b>${C.discovered.length} / ${SPECIMENS.length}</b><span>specimens discovered</span></div><div><b>${surveyedN} / ${ZONES.length}</b><span>zones surveyed</span></div></div>
        <div class="ms-wrap"><div class="ms-track"><i style="width:${(C.discovered.length / 8) * 100}%"></i>${MILESTONES.map((M) => `<div class="ms ${C.milestones.includes(M.id) ? 'done' : ''}" style="left:${(M.n / 8) * 100}%"><i></i><span>${M.n}</span></div>`).join('')}</div>
          <div class="ms-next">${nextM ? `${nextM.n - C.discovered.length} more to unlock <b>${nextM.label}</b>` : 'Codex complete · <b>Hive Hunter</b>'}</div></div>
        <h4>OUTPOST ZERO</h4>
        <div class="codex-map">${mapSvg({ surveyed: C.zones, mode: 'codex', points: ZONES.map((Z) => ({ x: Z.node.x, z: Z.node.z, kind: 'node', done: !!C.zones[Z.id], color: SPECIMENS.find((S) => S.zone === Z.id).color })) })}</div>
        <h4>SPECIMENS</h4>
        <div class="spec-grid compact">${grid}</div>`;
    }
    // rewards
    let chestHtml;
    if (chest.state === 'none') chestHtml = '<p class="dim">Extract from a mission to start the next supply drop.</p>';
    else if (chest.state === 'waiting') chestHtml = `<p>Arrives in <b id="chest-left">${fmtHMS(chest.left)}</b></p><button class="btn ghost sm" id="chest-ad">OPEN NOW · WATCH AD <em>(simulated)</em></button>`;
    else chestHtml = '<p class="ready">Ready to open!</p><button class="btn primary" id="chest-open">OPEN SUPPLY DROP</button>';
    const dir = d.director;
    const st = m.streakInfo();
    const streakHtml = `<div class="streak-card">
        <div class="streak-pips big">${[0, 1, 2].map((k) => `<i class="${k < st.idx || (k === st.idx && !st.claimable) ? 'on' : k === st.idx ? 'now' : ''}">${k + 1}</i>`).join('')}</div>
        <div class="streak-t"><b>Day ${st.days} login streak</b><span>${st.claimable ? `Today: ${st.today.label}` : `Tomorrow: ${st.tomorrow.label}`}</span></div>
        ${st.claimable ? '<button class="btn primary sm" id="streak-claim">CLAIM</button>' : '<em class="ok">CLAIMED</em>'}</div>`;
    return `
      ${streakHtml}
      <div class="feature chest-feature ${chest.state}"><div class="crate-ic"></div><div><b>SUPPLY DROP</b>${chestHtml}</div></div>
      <h4>DAILY CONTRACT</h4>
      ${row(esc(contract.text), d.contract.done ? 'Completed today' : 'Complete it on any mission', d.contract.done ? done('DONE') : `<span class="reward">${costHtml(contract.reward)}</span>`, d.contract.done ? 'is-done' : '')}
      <h4>AI DIRECTOR MEMORY</h4>
      <div class="stat-row"><div><span>Your style</span><b>${dir.last ? dir.last.toUpperCase() : '—'}</b></div><div><span>Start pressure</span><b>x${(dir.skill || 1).toFixed(2)}</b></div><div><span>Missions</span><b>${d.missions}</b></div></div>`;
  }

  // ---------------- SETTINGS ----------------
  settings(back) {
    const app = this.app, m = app.meta, d = m.data, st = d.settings;
    const s = this.screens.settings;
    const inMission = app.state === 'mission';
    const tog = (id, on, a = 'ON', b = 'OFF') => `<button class="toggle ${on ? 'on' : ''}" id="${id}"><i></i><span>${on ? a : b}</span></button>`;
    const render = () => {
      s.innerHTML = `<div class="set-box panel">
        <div class="set-head"><h2>SETTINGS</h2><button class="icon-btn" id="set-close" title="Close">✕</button></div>
        <div class="set-group">
          <div class="set-row"><span>Sound</span>${tog('set-sound', !st.muted)}</div>
          <div class="set-row"><span>Graphics</span>${tog('set-gfx', st.quality !== 'low', 'HIGH', 'LOW')}</div>
          <div class="set-row"><span>AI Director lens <small>live view of the adaptive AI · key I</small></span>${tog('set-lens', !!st.lens)}</div>
        </div>
        <div class="set-group">
          <div class="set-row"><span>Story intro</span><button class="btn sm" id="set-story" ${inMission ? 'disabled' : ''}>WATCH</button></div>
          <div class="set-row"><span>Training <small>plays at the start of your next mission</small></span>${tog('set-train', !d.tutorialDone, 'NEXT RUN', 'OFF')}</div>
        </div>
        <details class="set-group rv">
          <summary>Reviewer tools <small>for evaluating the prototype</small></summary>
          <div class="set-row"><span>Make the supply drop ready now</span><button class="btn sm" id="rv-chest">GO</button></div>
          <div class="set-row"><span>Grant +500 credits, +15 tech, +5 mutagen</span><button class="btn sm" id="rv-res">GO</button></div>
        </details>
        <div class="set-group danger">
          <div class="set-row"><span>Reset progress <small>deletes credits, research, unlocks and AI memory</small></span><button class="btn sm danger" id="set-reset">RESET</button></div>
        </div>
      </div>`;
      const q = (id) => s.querySelector('#' + id);
      q('set-close').onclick = close;
      q('set-sound').onclick = () => { sfx.init(); app.setMuted(!st.muted); sfx.ui(); render(); };
      q('set-gfx').onclick = () => { st.quality = st.quality === 'low' ? 'high' : 'low'; app.applySettings(); m.save(); sfx.ui(); render(); };
      q('set-lens').onclick = () => { app.toggleLens(); sfx.ui(); render(); };
      q('set-story').onclick = () => { this.hide('settings'); this.story(() => back()); };
      q('set-train').onclick = () => { d.tutorialDone = !d.tutorialDone; m.save(); sfx.ui(); render(); };
      q('rv-chest').onclick = () => { d.chest.readyAt = Date.now() - 1000; m.save(); sfx.upgrade(); flashBtn('rv-chest'); };
      q('rv-res').onclick = () => { m.add({ credits: 500, tech: 15, mutagen: 5 }); m.save(); sfx.upgrade(); flashBtn('rv-res'); };
      q('set-reset').onclick = confirmReset;
      s.onclick = (e) => { if (e.target === s) close(); };
    };
    const flashBtn = (id) => { const b = s.querySelector('#' + id); b.textContent = 'DONE ✓'; b.disabled = true; };
    const close = () => { this.hide('settings'); sfx.ui(); if (!inMission) back(); };
    const confirmReset = () => {
      s.querySelector('.set-box').innerHTML = `
        <div class="set-head"><h2>RESET PROGRESS?</h2></div>
        <p class="reset-warn">This permanently deletes your credits, samples, research, unlocks, skins and the AI Director's memory. The story and training will play again.</p>
        <div class="reset-btns"><button class="btn ghost" id="rs-no">CANCEL</button><button class="btn danger" id="rs-yes">YES, RESET</button></div>`;
      s.querySelector('#rs-no').onclick = render;
      s.querySelector('#rs-yes').onclick = () => {
        if (app.state === 'mission') { app.game.over = true; app.game.dispose(); app.toMenu(); this.pause(false); }
        m.reset();
        app.applySettings();
        this.hide('settings');
        this.title();
      };
    };
    render();
    this.show('settings');
  }

  fakeAd(done) {
    const s = this.screens.modal;
    let t = 5;
    s.innerHTML = `<div class="modal-box"><div class="ad-fake">REWARDED AD<br><span>(simulated for the prototype)</span><b id="ad-t">${t}</b></div></div>`;
    this.show('modal');
    const iv = setInterval(() => {
      t--;
      const e = s.querySelector('#ad-t');
      if (e) e.textContent = t;
      if (t <= 0) { clearInterval(iv); this.hide('modal'); done(); }
    }, 1000);
  }

  // ---------------- UPGRADE PICK ----------------
  upgrade(cards, cb, level) {
    const s = this.screens.upgrade;
    s.innerHTML = `<div class="up-wrap"><div class="up-title"><em>LEVEL ${level || ''}</em>PICK ONE</div>
      <div class="up-cards">${cards.map((u, i) => {
        const c = CAT_INFO[u.cat];
        return `<button class="up-card" data-id="${u.id}" style="--c:${c.color}; --i:${i}"><div class="up-cat">${c.label}</div><div class="up-name">${u.name}</div><div class="up-desc">${u.desc}</div><div class="up-key">${i + 1}</div></button>`;
      }).join('')}</div></div>`;
    this.show('upgrade');
    let done = false;
    const pick = (id) => {
      if (done) return;
      done = true;
      removeEventListener('keydown', onKey);
      this.hide('upgrade');
      cb(id);
    };
    const onKey = (e) => {
      const n = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
      if (n >= 0 && cards[n]) pick(cards[n].id);
    };
    addEventListener('keydown', onKey);
    s.querySelectorAll('.up-card').forEach((b) => b.onclick = () => pick(b.dataset.id));
  }

  // ---------------- PAUSE ----------------
  pause(on) {
    const s = this.screens.pause;
    if (!on) { this.hide('pause'); this.hide('settings'); return; }
    s.innerHTML = `<div class="pause-box panel">
      <h2>PAUSED</h2>
      <button class="btn primary wide" id="p-resume">RESUME</button>
      <button class="btn wide" id="p-settings">SETTINGS</button>
      <button class="btn wide" id="p-restart">RESTART MISSION</button>
      <button class="btn ghost wide" id="p-abandon">QUIT TO HQ <small>(no rewards)</small></button>
      <div class="controls-list">
        <div><span class="kc">WASD</span>Move</div><div><span class="kc">LMB</span>Shoot</div>
        <div><span class="kc">SPACE</span>Dash</div><div><span class="kc">RMB</span>Grenade</div>
        <div><span class="kc">Q</span>Skill</div><div><span class="kc">E</span>Repair beacon</div>
        <div><span class="kc">G</span>Next wave</div><div><span class="kc">I</span>AI lens</div>
      </div>
    </div>`;
    this.show('pause');
    s.querySelector('#p-resume').onclick = () => this.app.togglePause(false);
    s.querySelector('#p-settings').onclick = () => this.settings(() => {});
    s.querySelector('#p-restart').onclick = () => this.app.restart();
    s.querySelector('#p-abandon').onclick = () => this.app.abandon();
  }

  // ---------------- RESULTS: one beat at a time (GDD 12 sequence) ----------------
  results(r, mo) {
    const app = this.app, m = app.meta, d = m.data;
    app.setMenuView('results');
    const s = this.screens.results;
    const A = d.armory;
    const scoutReq = RESEARCH.scout.cost.bio;
    const chest = m.chestState();
    const contract = m.contract();
    const streak = m.streakInfo();
    const C = d.codex;
    const reasonTxt = { extracted: 'Extracted with the payload', death: 'Operative killed', toxic: 'Lost to the toxic air', beacon: 'Beacon protection lost' }[r.reason] || '';
    const zonesExplored = ['center', 'north', 'east', 'south', 'west'].filter((z) => r.visited && r.visited[z]).length;
    const runSpecs = Object.entries(r.specimens || {}).filter(([, n]) => n > 0);

    // one immediate action (GDD 12 step 5)
    let action = null;
    const arCost = ARMORY.arLevel.cost(A.arLevel), bcCost = ARMORY.beaconHp.cost(A.beaconHp);
    if (A.arLevel < ARMORY.arLevel.max && m.canAfford(arCost)) action = { key: 'arLevel', label: `Upgrade Assault Rifle to Lv ${A.arLevel + 1}`, cost: arCost };
    else if (!A.shotgun && m.canAfford(ARMORY.shotgun.cost())) action = { key: 'shotgun', label: 'Unlock the Breacher Shotgun', cost: ARMORY.shotgun.cost() };
    else if (A.beaconHp < ARMORY.beaconHp.max && m.canAfford(bcCost)) action = { key: 'beaconHp', label: 'Reinforce the beacon core', cost: bcCost };

    const tile = (label, val, cls = '') => `<div class="tile ${cls}"><b data-count="${typeof val === 'number' ? val : ''}">${val}</b><span>${label}</span></div>`;
    const beats = [];

    // 1 · SUMMARY + MAP
    beats.push({
      id: 'summary',
      html: `<div class="beat-head ${r.success ? 'ok' : 'bad'}"><span class="kicker">OUTPOST ZERO</span><h1>${r.success ? 'MISSION COMPLETE' : 'MISSION FAILED'}</h1><p>${reasonTxt} · ${fmtTime(r.time)}</p></div>
        <div class="sum-grid">
          <div class="sum-map">${mapSvg({ trail: r.trail, points: r.points, visited: r.visited, death: r.death, mode: 'run' })}
            <div class="map-legend"><span><i class="lg route"></i>Your route</span><span><i class="lg dot g"></i>Opened</span><span><i class="lg ring"></i>Missed</span><span><i class="lg dia"></i>Survey node</span></div>
          </div>
          <div class="sum-tiles">
            ${tile('Samples secured', r.bioDelivered, r.bioDelivered > 0 ? 'green big' : 'big')}
            ${tile('Areas visited', `${zonesExplored}/5`)}
            ${tile('Kills', r.kills)}
            ${tile('Best combo', `x${r.bestCombo || 0}`)}
            ${tile('Specimens found', Object.values(r.specimens || {}).reduce((a, b) => a + b, 0))}
          </div>
        </div>`,
    });

    // 2 · RESEARCH LAB
    const scoutDoneBefore = mo.scoutBefore >= scoutReq;
    beats.push({
      id: 'lab',
      html: `<div class="beat-title"><span class="kicker">RESEARCH LAB</span><h2>${r.bioDelivered > 0 ? 'SAMPLES DELIVERED' : 'NO SAMPLES DELIVERED'}</h2></div>
        <div class="lab-hero"><div class="lab-ico">${specIcon('#6dff5a')}</div><div class="lab-num"><b data-count="${r.bioDelivered}">0</b><span>Bio Samples${r.lost ? ` · <em class="red">${r.lost} lost</em>` : ''}</span></div></div>
        <div class="earn"><span>${ICON.credits}+${r.credits}</span><span>${ICON.tech}+${r.tech}</span>${r.mutagen ? `<span>${ICON.mutagen}+${r.mutagen}</span>` : ''}</div>
        ${scoutDoneBefore ? `<div class="lab-card"><div class="rs-head"><b>Research stockpile</b><span>${d.res.bio} Bio</span></div><p class="dim">Spend them on projects in the Research tab.</p></div>`
          : `<div class="lab-card ${mo.scoutUnlocked ? 'win' : ''}"><div class="rs-head"><b>${mo.scoutUnlocked ? 'SCOUT UNLOCKED!' : 'Unlocking: Scout'}</b><span id="rs-count">${mo.scoutBefore} / ${scoutReq}</span></div>
            <div class="big-bar"><i id="rs-bar" style="width:${Math.round(mo.scoutBefore / scoutReq * 100)}%"></i></div>
            <p>${mo.scoutUnlocked ? 'Fast, fragile, built for long sample runs. Pick it next mission.' : `<b>${scoutReq - mo.scoutAfter} more</b> to unlock the Scout operative.`}</p></div>`}`,
      onShow: (st) => setTimeout(() => {
        const bar = st.querySelector('#rs-bar'), cnt = st.querySelector('#rs-count');
        if (bar) bar.style.width = Math.round(mo.scoutAfter / scoutReq * 100) + '%';
        if (cnt) cnt.textContent = `${mo.scoutAfter} / ${scoutReq}`;
        if (mo.scoutAfter > mo.scoutBefore) sfx.bank();
        if (mo.scoutUnlocked) setTimeout(() => sfx.success(), 900);
      }, 450),
    });

    // 3 · SPECIMEN LOG (codex)
    const newSet = new Set(mo.newSpecimens);
    const grid = SPECIMENS.map((S, i) => {
      const known = C.discovered.includes(S.id);
      const got = (r.specimens || {})[S.id] || 0;
      return `<div class="spec ${known ? 'known' : 'unknown'} ${newSet.has(S.id) ? 'new' : ''}" style="--c:${S.color}; --i:${i}">
        ${newSet.has(S.id) ? '<em class="badge">NEW</em>' : got ? `<em class="badge plus">+${got}</em>` : ''}
        <div class="spec-ico">${specIcon(S.color, !known)}</div>
        <b>${known ? S.name : '???'}</b><span>${known ? (newSet.has(S.id) ? S.lore : `${C.counts[S.id] || 0} collected`) : S.src}</span></div>`;
    }).join('');
    const nextM = m.nextMilestone();
    const msHtml = MILESTONES.map((M) => `<div class="ms ${C.milestones.includes(M.id) ? 'done' : ''}" style="left:${(M.n / 8) * 100}%"><i></i><span>${M.n}</span></div>`).join('');
    beats.push({
      id: 'codex',
      html: `<div class="beat-title"><span class="kicker">SPECIMEN LOG</span><h2>${mo.newSpecimens.length ? `${mo.newSpecimens.length} NEW DISCOVER${mo.newSpecimens.length > 1 ? 'IES' : 'Y'}` : runSpecs.length ? 'SPECIMENS SCANNED' : 'NOTHING NEW THIS TIME'}</h2>
        <p class="sub">${mo.codexAfter} of ${SPECIMENS.length} specimens discovered${mo.newZones.length ? ` · surveyed: ${mo.newZones.map((z) => ZONES.find((Z) => Z.id === z).name).join(', ')}` : ''}</p></div>
        <div class="spec-grid">${grid}</div>
        <div class="ms-wrap"><div class="ms-track"><i style="width:${(mo.codexAfter / 8) * 100}%"></i>${msHtml}</div>
          ${mo.milestones.length ? mo.milestones.map((M) => `<div class="ms-unlock">★ Unlocked: <b>${M.label}</b></div>`).join('') : nextM ? `<div class="ms-next">${nextM.n - mo.codexAfter} more to unlock <b>${nextM.label}</b></div>` : '<div class="ms-next">Codex complete. Hive Hunter.</div>'}</div>`,
      onShow: () => { if (mo.newSpecimens.length || mo.milestones.length) sfx.success(); },
    });

    // 4 · REWARDS
    const chestCard = chest.state === 'waiting'
      ? `<div class="rw-card"><div class="crate-ic"></div><b>Supply drop</b><p>${mo.chestStarted ? 'Inbound! ' : ''}Ready in <strong>${fmtHMS(chest.left)}</strong></p></div>`
      : chest.state === 'ready' ? '<div class="rw-card hot"><div class="crate-ic"></div><b>Supply drop</b><p><strong>Ready to open</strong> in HQ</p></div>'
        : '<div class="rw-card dim-card"><div class="crate-ic"></div><b>Supply drop</b><p>Extract to start the next one</p></div>';
    const contractCard = `<div class="rw-card ${mo.contractDone ? 'hot' : d.contract.done ? 'done' : ''}"><div class="rw-ico">◎</div><b>Daily contract</b><p>${esc(contract.text)}</p><p>${mo.contractDone ? `<strong class="gr">COMPLETE · ${costHtml(contract.reward)}</strong>` : d.contract.done ? '<strong class="gr">Done today</strong>' : `Reward ${costHtml(contract.reward)}`}</p></div>`;
    const streakCard = `<div class="rw-card ${streak.claimable ? 'hot' : ''}"><div class="streak-pips">${[0, 1, 2].map((k) => `<i class="${k < streak.idx || (k === streak.idx && !streak.claimable) ? 'on' : k === streak.idx ? 'now' : ''}">${k + 1}</i>`).join('')}</div><b>Day ${streak.days} streak</b><p>${streak.claimable ? `Claim <strong>${streak.today.label}</strong> in HQ` : `Tomorrow: <strong>${streak.tomorrow.label}</strong>`}</p></div>`;
    beats.push({
      id: 'rewards',
      html: `<div class="beat-title"><span class="kicker">REWARDS</span><h2>${r.success ? 'NICE WORK, OPERATIVE' : 'REGROUP AND GO AGAIN'}</h2></div>
        <div class="rw-row">${chestCard}${contractCard}${streakCard}</div>`,
    });

    // 5 · COME BACK FOR + CTA
    const items = [];
    if (!d.unlocked.scout) items.push({ c: '#52e08a', t: `Unlock the Scout`, s: `${m.scoutRemaining()} more Bio Samples` });
    if (nextM) items.push({ c: '#5affc8', t: nextM.label, s: `${nextM.n - mo.codexAfter} more specimen${nextM.n - mo.codexAfter === 1 ? '' : 's'} to discover` });
    const unsurveyed = ZONES.filter((Z) => !C.zones[Z.id]).length;
    if (unsurveyed) items.push({ c: '#c86bff', t: `${unsurveyed} zone${unsurveyed > 1 ? 's' : ''} still unsurveyed`, s: 'Find their survey nodes for new specimens' });
    if (chest.state !== 'none') items.push({ c: '#ffb43a', t: 'Supply drop', s: chest.state === 'ready' ? 'Ready to open now' : `Ready in ${fmtHMS(chest.left)}` });
    items.push({ c: '#4ee8ff', t: 'Tomorrow', s: `${streak.tomorrow.label} · new contract: ${m.tomorrowContract().text}` });
    const ctaLabel = mo.scoutUnlocked ? 'DEPLOY AS SCOUT' : 'DEPLOY AGAIN';
    beats.push({
      id: 'next',
      html: `<div class="beat-title"><span class="kicker">NEXT UP</span><h2>COME BACK FOR</h2></div>
        <div class="next-list">${items.slice(0, 5).map((it, i) => `<div class="next-item" style="--c:${it.c}; --i:${i}"><i></i><div><b>${it.t}</b><span>${esc(it.s)}</span></div></div>`).join('')}</div>
        ${action ? `<button class="act-card" id="r-action"><span>UPGRADE AVAILABLE</span><b>${action.label}</b><em>${costHtml(action.cost)}</em></button>` : ''}`,
      final: true,
    });

    // ---- shell + navigation ----
    s.innerHTML = `<div class="rs2">
      <div class="rs-top"><div class="rs-dots">${beats.map((_, i) => `<i data-i="${i}"></i>`).join('')}</div><button class="link-btn" id="rs-skip">Skip</button></div>
      <div class="rs-stage" id="rs-stage"></div>
      <div class="rs-foot" id="rs-foot"></div>
    </div>`;
    this.hideAll();
    this.show('results');
    const stage = s.querySelector('#rs-stage'), foot = s.querySelector('#rs-foot');
    let cur = -1;
    const countUp = (root) => root.querySelectorAll('[data-count]').forEach((el2) => {
      const target = +el2.dataset.count;
      if (!el2.dataset.count || !isFinite(target)) return;
      const t0 = performance.now();
      const step = (t) => { const k = Math.min(1, (t - t0) / 700); el2.textContent = Math.round(target * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
    const go = (i) => {
      cur = Math.max(0, Math.min(beats.length - 1, i));
      const B = beats[cur];
      stage.innerHTML = `<div class="beat beat-${B.id}">${B.html}</div>`;
      s.querySelectorAll('.rs-dots i').forEach((dot, k) => dot.className = k < cur ? 'done' : k === cur ? 'on' : '');
      s.querySelector('#rs-skip').style.visibility = B.final ? 'hidden' : 'visible';
      if (B.final) {
        foot.innerHTML = `<button class="btn ghost" id="r-hq">GO TO HQ</button><button class="btn primary big" id="r-again">${ctaLabel}</button>`;
        foot.querySelector('#r-hq').onclick = () => { sfx.ui(); cleanup(); this.hq(); };
        foot.querySelector('#r-again').onclick = () => { sfx.ui(); cleanup(); if (mo.scoutUnlocked) d.operative = 'scout'; m.save(); app.deploy({ operative: d.operative, weapon: d.weapon }); };
        const act = stage.querySelector('#r-action');
        if (act) act.onclick = () => {
          if (!m.spend(action.cost)) { sfx.denied(); return; }
          if (action.key === 'arLevel') A.arLevel++; else if (action.key === 'beaconHp') A.beaconHp++; else A.shotgun = true;
          m.save(); sfx.upgrade();
          act.classList.add('done'); act.innerHTML = `<span>INSTALLED</span><b>${action.label} ✓</b>`; act.disabled = true;
        };
      } else {
        foot.innerHTML = `<button class="btn primary big" id="rs-next">CONTINUE</button><span class="hint-key">SPACE</span>`;
        foot.querySelector('#rs-next').onclick = () => { sfx.ui(); go(cur + 1); };
      }
      countUp(stage);
      if (B.onShow) B.onShow(stage);
    };
    const onKey = (e) => {
      if (this.screens.results.classList.contains('hidden')) { cleanup(); return; }
      if ((e.code === 'Space' || e.code === 'Enter') && !beats[cur].final) { e.preventDefault(); sfx.ui(); go(cur + 1); }
    };
    const cleanup = () => removeEventListener('keydown', onKey);
    addEventListener('keydown', onKey);
    s.querySelector('#rs-skip').onclick = () => { sfx.ui(); go(beats.length - 1); };
    go(0);
  }
}
