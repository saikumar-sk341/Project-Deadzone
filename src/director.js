import { clamp, weightedPick } from './util.js';
import { UPGRADES } from './upgrades.js';

// ============================================================
// AI DIRECTOR
// A real-time adaptive system (in the tradition of Left 4 Dead's
// director) that watches HOW the player uses the beacon and reshapes
// the mission around it. It does three jobs:
//   1. PACING   - tracks an "intensity" signal and inserts breathers.
//   2. PROFILING- classifies play style from behaviour, not stats screens:
//                 TURTLE (never leaves), SCAVENGER (long loot runs),
//                 BRAWLER (fights outside), GUARDIAN (protects beacon).
//   3. RESPONSE - counters or rewards that style so the core decision
//                 (stay safe vs venture out) never goes stale.
// Every decision is logged with its reason and surfaced as
// OVERWATCH radio chatter, plus a post-mission report.
// The profile persists between runs (skill + style memory).
// ============================================================

const STYLE_NAMES = {
  turtle: 'TURTLE', scavenger: 'SCAVENGER', brawler: 'BRAWLER', guardian: 'GUARDIAN', unknown: 'READING...',
};

export class Director {
  constructor(game, profile) {
    this.g = game;
    this.skill = clamp(profile.skill || 1, 0.8, 1.3);
    this.diff = this.skill;           // global pressure multiplier
    this.intensity = 0;               // 0-100 perceived stress
    this.mode = 'build';              // build | peak | relax
    this.modeT = 0;
    this.memory = profile;            // persistent profile from previous runs
    this.obs = {
      inside: 0, outside: 0, nearBeacon: 0, outsideFight: 0,
      excursions: 0, longest: 0, maxDist: 0,
      dmgTaken: 0, dmgOutside: 0, beaconDmg: 0, beaconDmgAway: 0,
      kills: 0, killsOutside: 0, lowHpEvents: 0,
    };
    this.style = { turtle: 0, scavenger: 0, brawler: 0, guardian: 0 };
    this.profile = 'unknown';
    this.log = [];
    this.cd = {};                     // per-decision cooldowns (mission time)
    this.thinkT = 6;
    this.interceptReady = false;
    this.mercyLevel = 0;
    this.history = [];                // intensity samples for the lens graph
    this.histT = 0;
    this.pending = { extraSpitters: 0, earlyDisruptor: false, beaconBiasAdd: 0, lure: false };
    this.waveClear = [];              // seconds taken to clear each wave
    this.hpSamples = [];
  }

  // -------------- events from the game --------------
  onPlayerDamaged(amt, src) {
    if (src === 'environment') { this.intensity += amt * 0.6; return; }
    this.obs.dmgTaken += amt;
    const p = this.g.player;
    if (p.hp / p.maxHp < 0.35) this.thinkT = Math.min(this.thinkT, 0.25); // react fast when the player is in trouble
    if (!this.g.isInField()) this.obs.dmgOutside += amt;
    this.intensity += amt * 1.4;
  }
  onBeaconDamaged(amt) {
    this.obs.beaconDmg += amt;
    const p = this.g.player, b = this.g.beacon;
    if (Math.hypot(p.x - b.x, p.z - b.z) > b.radius + 4) this.obs.beaconDmgAway += amt;
    this.intensity += amt * 0.25;
  }
  onKill() {
    this.obs.kills++;
    if (!this.g.isInField()) this.obs.killsOutside++;
    this.intensity = Math.max(0, this.intensity - 0.6);
  }
  onExcursion(duration, maxDist) {
    if (duration < 2.5) return;
    this.obs.excursions++;
    this.obs.longest = Math.max(this.obs.longest, duration);
    this.obs.maxDist = Math.max(this.obs.maxDist, maxDist);
  }
  onWaveCleared(idx, seconds) { this.waveClear[idx] = seconds; }

  // -------------- per-frame --------------
  update(dt) {
    const g = this.g, p = g.player, b = g.beacon;
    const inField = g.isInField();
    const dB = Math.hypot(p.x - b.x, p.z - b.z);
    const active = g.phase === 'wave' || g.phase === 'lull' || g.phase === 'collect';
    if (active) {
      if (inField) this.obs.inside += dt; else this.obs.outside += dt;
      if (dB < b.radius * 0.7) this.obs.nearBeacon += dt;
      if (!inField && g.enemiesNear(p.x, p.z, 7) > 0) this.obs.outsideFight += dt;
    }
    // intensity: rises with nearby threats and low health, decays over time
    const near = g.enemiesNear(p.x, p.z, 8);
    this.intensity += near * 0.9 * dt;
    if (p.hp / p.maxHp < 0.35) this.intensity += 6 * dt;
    this.intensity -= (near === 0 ? 9 : 4) * dt;
    this.intensity = clamp(this.intensity, 0, 100);

    // pacing state machine (only during combat waves)
    this.modeT += dt;
    if (g.phase === 'wave') {
      if (this.mode === 'build' && this.intensity > 72) this.setMode('peak');
      else if (this.mode === 'peak' && this.modeT > 3) this.setMode('relax');
      else if (this.mode === 'relax' && (this.intensity < 32 || this.modeT > 7)) this.setMode('build');
    } else if (this.mode !== 'build') this.setMode('build');

    this.histT -= dt;
    if (this.histT <= 0) {
      this.histT = 0.5;
      this.history.push(this.intensity);
      if (this.history.length > 120) this.history.shift();
      this.hpSamples.push(p.hp / p.maxHp);
      if (this.hpSamples.length > 60) this.hpSamples.shift();
    }
    if (p.hp / p.maxHp < 0.25 && !this._low) { this._low = true; this.obs.lowHpEvents++; }
    if (p.hp / p.maxHp > 0.5) this._low = false;

    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT = 2.5;
      this.classify();
      this.adapt();
    }
  }

  setMode(m) {
    if (m === 'relax' && this.mode !== 'relax') this.decide('relax', 'Pacing', 'Intensity peaked. Held spawns for a breather.', false);
    this.mode = m; this.modeT = 0;
  }

  // Spawner asks: may I spawn right now?
  spawnAllowed() { return this.mode !== 'relax'; }
  countMul() { return this.diff; }
  hpMul() { return 0.9 + (this.diff - 1) * 0.7; }
  healthDropChance() { return 0.035 + this.mercyLevel * 0.08; }

  // -------------- profiling --------------
  classify() {
    const o = this.obs;
    const total = o.inside + o.outside;
    if (total < 60) return; // need data first
    const outFrac = o.outside / total;
    const s = this.style;
    // TURTLE: almost never outside, and at most one trip
    s.turtle = clamp((0.1 - outFrac) / 0.08, 0, 1) * (o.excursions <= 1 ? 1 : 0.4) * clamp(total / 90, 0, 1);
    // SCAVENGER: real share of time outside, many and long trips
    s.scavenger = clamp((outFrac - 0.08) / 0.17, 0, 1) * 0.55 + clamp(o.excursions / 5, 0, 1) * 0.3 + clamp(o.longest / 14, 0, 1) * 0.15;
    // BRAWLER: when outside, is fighting rather than looting
    s.brawler = clamp(o.outsideFight / Math.max(1, o.outside) / 0.6, 0, 1) * clamp(o.killsOutside / 25, 0, 1);
    // GUARDIAN: hugs the beacon itself and keeps it safe
    s.guardian = clamp(o.nearBeacon / Math.max(1, total) / 0.6, 0, 1) * (1 - s.turtle * 0.5) * (o.beaconDmgAway < 60 ? 1 : 0.5) * (outFrac < 0.2 ? 1 : 0.6);
    let best = 'unknown', bv = 0.35;
    for (const k of Object.keys(s)) if (s[k] > bv) { bv = s[k]; best = k; }
    if (best !== this.profile) {
      const prev = this.profile;
      this.profile = best;
      if (best !== 'unknown') {
        this.decide('profile', 'Profile', `Play style read as ${STYLE_NAMES[best]}` + (prev !== 'unknown' ? ` (was ${STYLE_NAMES[prev]}).` : '.'), false);
      }
    }
  }

  // -------------- responses --------------
  adapt() {
    const g = this.g, p = g.player, o = this.obs, t = g.time;
    // each response has a cooldown and a per-mission cap so radio chatter never spams
    this.uses = this.uses || {};
    const ready = (k, cd, max = 99) => {
      if (this.cd[k] > t || (this.uses[k] || 0) >= max) return false;
      this.cd[k] = t + cd;
      this.uses[k] = (this.uses[k] || 0) + 1;
      return true;
    };

    // MERCY: player is struggling -> ease off, drop health
    const avgHp = this.hpSamples.length ? this.hpSamples.reduce((a, b) => a + b, 0) / this.hpSamples.length : 1;
    if ((p.hp / p.maxHp < 0.35 && this.intensity > 50) || (o.lowHpEvents >= 2 && avgHp < 0.5)) {
      if (ready('mercy', 35, 3)) {
        this.mercyLevel = Math.min(2, this.mercyLevel + 1);
        this.diff = clamp(this.diff - 0.08, 0.72, 1.45);
        this.setMode('relax');
        g.dropHealthNear(p.x, p.z, 2);
        this.decide('mercy', 'Mercy', `Player in trouble: pressure lowered to x${this.diff.toFixed(2)}, med-packs dropped.`, true, 'Hive pulling back · med-packs dropped');
      }
    } else if (avgHp > 0.85 && o.dmgTaken < g.time * 0.5 && g.time > 70 && g.phase === 'wave' && g.waveIdx < 4) {
      // DOMINATING: raise the stakes (never during the elite wave)
      if (this.diff < 1.3 && ready('dominate', 50, 4)) {
        this.diff = clamp(this.diff + 0.05, 0.72, 1.3);
        this.mercyLevel = Math.max(0, this.mercyLevel - 1);
        this.decide('dominate', 'Escalate', `Clearing faster than projected: pressure raised to x${this.diff.toFixed(2)}.`, true, 'Hive escalating');
      }
    }

    // TURTLE: hasn't left the field -> tempt AND pressure
    if (this.profile === 'turtle') {
      if (ready('turtle', 60, 2)) {
        this.pending.extraSpitters += 1;
        this.pending.lure = true;
        this.decide('turtle', 'Counter: Turtle', 'Player stays inside the field: next wave adds ranged siege, and a loot crate surfaces outside as a lure.', true, 'Siege incoming · loot crate outside');
        if (g.phase === 'lull' || g.phase === 'collect') { g.spawnLureCache(); this.pending.lure = false; }
      }
    }
    // SCAVENGER: long trips -> intercept the route home, reward greed
    if (this.profile === 'scavenger') {
      if (!this.interceptReady && ready('scav', 50, 3)) {
        this.interceptReady = true;
        this.decide('scavenger', 'Counter: Scavenger', 'Player makes long loot runs: ambushes armed on the route back to the beacon.', true, 'Hive watching your route home');
      }
    }
    // BEACON NEGLECT: beacon losing health while player is away
    if (o.beaconDmgAway > 70 && ready('neglect', 70, 2)) {
      this.pending.beaconBiasAdd = Math.min(0.25, this.pending.beaconBiasAdd + 0.12);
      this.pending.earlyDisruptor = true;
      this.decide('neglect', 'Counter: Neglect', `Beacon took ${Math.round(o.beaconDmgAway)} damage while the player was away: more enemies target it, Disruptor sent early.`, true, 'Hive targeting your beacon');
    }
    // GUARDIAN: hugging the beacon -> flank pressure on the player
    if (this.profile === 'guardian' && ready('guardian', 80, 2)) {
      this.pending.extraSpitters += 1;
      this.decide('guardian', 'Counter: Guardian', 'Player hugs the beacon: spitters will harass from beyond the field edge.', true, 'Spitters flanking the field');
    }
  }

  // Interceptors: called by the game while the player is outside during a wave
  tryIntercept() {
    const g = this.g, p = g.player, b = g.beacon;
    if (!this.interceptReady || g.phase !== 'wave') return;
    const dB = Math.hypot(p.x - b.x, p.z - b.z);
    if (p.outsideT < 4 || dB < b.radius + 6) return;
    this.interceptReady = false;
    const mx = (p.x + b.x) / 2, mz = (p.z + b.z) / 2;
    g.spawnAmbush(mx, mz, Math.round(3 * this.diff));
    this.decide('intercept', 'Ambush', 'Interceptors spawned between the player and the beacon.', true, 'Ambush on your route!');
    this.cd.scav = g.time + 40;
  }

  // Modify a wave right before it starts
  waveExtras(idx) {
    const extras = [];
    if (this.pending.extraSpitters > 0) {
      extras.push({ t: 5, type: 'spitter', n: this.pending.extraSpitters, lane: 'E', every: 1.2, beaconBias: 0, fixed: true, siege: true });
      this.pending.extraSpitters = 0;
    }
    if (this.pending.earlyDisruptor && idx >= 2) {
      extras.push({ t: 10, type: 'disruptor', n: 1, lane: 'W', every: 0, fixed: true });
      this.pending.earlyDisruptor = false;
    }
    return extras;
  }
  beaconBiasAdd() { return this.pending.beaconBiasAdd; }

  onLullStart() {
    if (this.pending.lure) { this.g.spawnLureCache(); this.pending.lure = false; }
  }
  lullDuration(base) {
    let d = base;
    if (this.mercyLevel > 0) d += 6 * this.mercyLevel;
    if (this.diff > 1.15) d -= 4;
    return d;
  }

  // Weight upgrade offers toward the current style (one card per category)
  pickUpgrades(taken) {
    const cats = ['beacon', 'weapon', 'excursion'];
    const out = [];
    for (const c of cats) {
      const pool = UPGRADES.filter((u) => u.cat === c && u.id !== 'rations' && (taken[u.id] || 0) < u.max);
      if (!pool.length) { out.push(UPGRADES.find((u) => u.id === 'rations')); continue; }
      out.push(weightedPick(pool, (u) => 1 + (u.tags.includes(this.profile) ? 1.5 : 0)));
    }
    return out;
  }

  decide(kind, title, text, comm, short) {
    const entry = { t: this.g.time, kind, title, text };
    this.log.push(entry);
    if (comm) this.g.comm(short || text, 'director');
  }

  intro() {
    const last = this.memory.last;
    if (!last) { this.decide('intro', 'Calibrating', 'No profile yet: reading play style.', false); return; }
    const lines = {
      turtle: 'Hive remembers you hide in the field',
      scavenger: 'Hive remembers your loot runs',
      brawler: 'Hive remembers you fight in the open',
      guardian: 'Hive remembers you guard the beacon',
    };
    this.decide('intro', 'Memory', `Profile loaded (${last}), starting pressure x${this.diff.toFixed(2)}.`, true, lines[last] || 'Hive remembers you');
  }

  styleName() { return STYLE_NAMES[this.profile]; }

  // Persist what we learned for the next run
  persist(success) {
    const m = this.memory;
    let target = this.diff;
    if (!success) target -= 0.1;
    else if (this.g.player.hp / this.g.player.maxHp > 0.6) target += 0.04;
    m.skill = clamp((m.skill || 1) * 0.55 + target * 0.45, 0.8, 1.3);
    for (const k of Object.keys(this.style)) m.styles[k] = (m.styles[k] || 0) * 0.5 + this.style[k] * 0.5;
    m.last = this.profile === 'unknown' ? m.last : this.profile;
    m.history = [...(m.history || []), { profile: this.profile, diff: +this.diff.toFixed(2), success }].slice(-10);
    return m;
  }
}
