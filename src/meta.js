// Persistent meta progression (HQ). Stored in localStorage.
import { SPECIMENS, MILESTONES } from './codex.js';
const KEY = 'deadzone_save_v1';
export const CHEST_MS = 6.5 * 3600 * 1000; // GDD: ~6-7 hours

export const RESEARCH = {
  scout: {
    id: 'scout', name: 'Scout Operative Protocol', cost: { bio: 12 }, auto: true,
    desc: 'Unlocks SCOUT: fast, fragile sample hunter with Phase Dash.',
  },
  fieldMk2: {
    id: 'fieldMk2', name: 'Field Emitter Mk II', cost: { bio: 6, tech: 8 },
    desc: 'Permanent +10% beacon field radius.',
  },
  nanites: {
    id: 'nanites', name: 'Medical Nanites', cost: { bio: 5, tech: 6 },
    desc: 'Permanent +25% health regeneration inside the field.',
  },
  region2: {
    id: 'region2', name: 'Survey: Overgrown Industrial Zone', cost: { bio: 16, mutagen: 3 },
    desc: 'Unlocks Region 2 (next build). New hazard: spore clouds.',
  },
};

export const ARMORY = {
  arLevel: { name: 'Assault Rifle', max: 5, cost: (lvl) => ({ credits: 90 + lvl * 60, tech: lvl >= 2 ? lvl * 2 : 0 }), desc: '+10% damage per level' },
  shotgun: { name: 'Breacher Shotgun', cost: () => ({ credits: 260, tech: 4 }), desc: 'Close-range burst. Strong vs rushers and brutes.' },
  sgLevel: { name: 'Breacher Shotgun', max: 5, cost: (lvl) => ({ credits: 110 + lvl * 70, tech: lvl * 2 }), desc: '+10% damage per level' },
  beaconHp: { name: 'Reinforced Core', max: 4, cost: (lvl) => ({ credits: 120 + lvl * 80, tech: 3 + lvl * 2 }), desc: '+15% beacon durability per level' },
  repairKit: { name: 'Extra Emergency Kit', max: 1, cost: () => ({ credits: 300, tech: 10 }), desc: '+1 emergency repair kit per mission' },
};

export const SKINS = {
  cyan: { name: 'Standard Issue', color: 0x4ee8ff, price: 0 },
  amber: { name: 'Solar Amber', color: 0xffb03a, price: 0, chest: true },
  violet: { name: 'Void Violet', color: 0xb36bff, price: 0, chest: true },
  spore: { name: 'Spore Green', color: 0x7aff5a, price: 0, codex: true },
};

export const CONTRACTS = [
  { id: 'bank8', text: 'Bank 8 Bio Samples in one mission', check: (r) => r.banked >= 8, reward: { credits: 150, tech: 3 } },
  { id: 'emp2', text: 'Interrupt a Disruptor before its EMP lands', check: (r) => r.empInterrupts >= 1, reward: { credits: 120, tech: 4 } },
  { id: 'beacon50', text: 'Extract with the beacon above 50% health', check: (r) => r.success && r.beaconPct >= 0.5, reward: { credits: 140, tech: 3 } },
  { id: 'rare', text: 'Open a gold supply crate and extract', check: (r) => r.success && r.rareCaches >= 1, reward: { credits: 160, tech: 2 } },
  { id: 'outside', text: 'Spend 60s outside the field and still extract', check: (r) => r.success && r.timeOutside >= 60, reward: { credits: 150, tech: 3 } },
];

function dayStr(offset = 0) {
  const d = new Date(Date.now() + offset * 86400000);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
function today() { return dayStr(0); }
export function contractFor(day) {
  let h = 0;
  for (const ch of day) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return CONTRACTS[h % CONTRACTS.length];
}
// 3-day login streak (repeats on day 3)
export const STREAK = [
  { day: 1, label: '+60 credits', reward: { credits: 60 } },
  { day: 2, label: '+120 credits · +3 tech', reward: { credits: 120, tech: 3 } },
  { day: 3, label: 'Free supply drop', reward: { chest: true } },
];

function fresh() {
  return {
    v: 1,
    missions: 0, successes: 0,
    res: { credits: 0, bio: 0, tech: 0, mutagen: 0 },
    research: { scout: 0, fieldMk2: false, nanites: false, region2: false },
    unlocked: { assault: true, scout: false },
    operative: 'assault',
    weapon: 'ar',
    armory: { arLevel: 1, shotgun: false, sgLevel: 1, beaconHp: 0, repairKit: 0 },
    chest: { readyAt: null, opened: 0 },
    skins: { owned: ['cyan'], active: 'cyan' },
    director: { skill: 1.0, styles: { turtle: 0, scavenger: 0, brawler: 0, guardian: 0 }, last: null, history: [] },
    contract: { day: null, id: null, done: false },
    settings: { muted: false, quality: 'high', lens: false },
    best: { time: null, banked: 0 },
    seenHQ: false,
    tutorialDone: false,
    codex: { counts: {}, discovered: [], zones: {}, milestones: [], perks: {} },
    streak: { last: null, days: 0, claimed: false },
  };
}

export class Meta {
  constructor() {
    this.data = fresh();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.data = deepMerge(fresh(), JSON.parse(raw));
    } catch (e) { /* storage blocked: play without persistence */ }
    this.ensureContract();
  }
  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* ignore */ }
  }
  reset() {
    this.data = fresh();
    this.ensureContract();
    this.save();
  }
  get firstRun() { return this.data.missions === 0; }

  ensureContract() {
    const d = this.data;
    const t = today();
    if (d.contract.day !== t) d.contract = { day: t, id: contractFor(t).id, done: false };
    // login streak: consecutive days keep counting, a gap resets to day 1
    const st = d.streak;
    if (st.last !== t) {
      st.days = st.last === dayStr(-1) ? st.days + 1 : 1;
      st.last = t;
      st.claimed = false;
      this.save();
    }
  }
  tomorrowContract() { return contractFor(dayStr(1)); }
  streakInfo() {
    const st = this.data.streak;
    const idx = ((Math.max(1, st.days) - 1) % 3);
    return { days: st.days, idx, today: STREAK[idx], tomorrow: STREAK[(idx + 1) % 3], claimable: !st.claimed };
  }
  claimStreak() {
    const st = this.data.streak;
    if (st.claimed) return null;
    const S = STREAK[(Math.max(1, st.days) - 1) % 3];
    st.claimed = true;
    if (S.reward.chest) this.data.chest.readyAt = Date.now() - 1000;
    else this.add(S.reward);
    this.save();
    return S;
  }
  codexCount() { return this.data.codex.discovered.length; }
  nextMilestone() { return MILESTONES.find((m) => !this.data.codex.milestones.includes(m.id)) || null; }
  contract() { return CONTRACTS.find((c) => c.id === this.data.contract.id) || CONTRACTS[0]; }

  canAfford(cost) {
    const r = this.data.res;
    return Object.entries(cost).every(([k, v]) => (r[k] || 0) >= v);
  }
  spend(cost) {
    if (!this.canAfford(cost)) return false;
    for (const [k, v] of Object.entries(cost)) this.data.res[k] -= v;
    this.save();
    return true;
  }
  add(res) {
    for (const [k, v] of Object.entries(res)) this.data.res[k] = (this.data.res[k] || 0) + v;
  }

  // Scout research is fed automatically by delivered Bio Samples (GDD 12: near-unlock).
  scoutRemaining() { return Math.max(0, RESEARCH.scout.cost.bio - this.data.research.scout); }

  // Delivered Bio Samples feed the active Scout research first. Returns true if Scout unlocked now.
  deliverBio(n) {
    const d = this.data;
    let bio = n, unlocked = false;
    if (!d.unlocked.scout) {
      const used = Math.min(this.scoutRemaining(), bio);
      d.research.scout += used;
      bio -= used;
      if (this.scoutRemaining() === 0) { d.unlocked.scout = true; unlocked = true; }
    }
    d.res.bio += bio;
    return unlocked;
  }

  // Apply the result of a mission. Returns a summary for the results screen.
  applyMission(r) {
    const d = this.data;
    d.missions++;
    if (r.success) d.successes++;
    const out = { scoutBefore: d.research.scout, scoutAfter: d.research.scout, scoutUnlocked: false, chestStarted: false, contractDone: false, contractReward: null, newSpecimens: [], newZones: [], milestones: [], codexBefore: d.codex.discovered.length };
    // specimen codex: scans upload the moment they're picked up, so they count even on failure
    const C = d.codex;
    for (const [id, n] of Object.entries(r.specimens || {})) {
      if (!n) continue;
      C.counts[id] = (C.counts[id] || 0) + n;
      if (!C.discovered.includes(id)) { C.discovered.push(id); out.newSpecimens.push(id); }
    }
    for (const z of r.nodes || []) if (!C.zones[z]) { C.zones[z] = true; out.newZones.push(z); }
    for (const M of MILESTONES) {
      if (C.discovered.length >= M.n && !C.milestones.includes(M.id)) {
        C.milestones.push(M.id);
        out.milestones.push(M);
        if (M.id === 'skin' && !d.skins.owned.includes('spore')) d.skins.owned.push('spore');
        if (M.id === 'kit') C.perks.kit = true;
        if (M.id === 'hunter') { C.perks.hunter = true; this.add({ mutagen: 3 }); }
      }
    }
    out.codexAfter = C.discovered.length;
    // resources
    this.add({ credits: r.credits, tech: r.tech, mutagen: r.mutagen });
    // bio: feed Scout research first, rest to stockpile
    out.scoutUnlocked = this.deliverBio(r.bioDelivered);
    out.scoutAfter = d.research.scout;
    // chest timer starts after a successful mission when no chest is pending
    if (r.success && d.chest.readyAt === null) {
      d.chest.readyAt = Date.now() + CHEST_MS;
      out.chestStarted = true;
    }
    // daily contract
    const c = this.contract();
    if (!d.contract.done && c.check(r)) {
      d.contract.done = true;
      this.add(c.reward);
      out.contractDone = true;
      out.contractReward = c.reward;
    }
    if (r.success) {
      if (!d.best.time || r.time < d.best.time) d.best.time = r.time;
      d.best.banked = Math.max(d.best.banked, r.banked);
    }
    this.save();
    return out;
  }

  chestState() {
    const c = this.data.chest;
    if (c.readyAt === null) return { state: 'none' };
    const left = c.readyAt - Date.now();
    return left <= 0 ? { state: 'ready' } : { state: 'waiting', left };
  }

  openChest() {
    const reward = { credits: 180 + Math.floor(Math.random() * 60), tech: 5 + Math.floor(Math.random() * 3), bio: 2 };
    let skin = null;
    const missing = Object.keys(SKINS).filter((k) => SKINS[k].chest && !this.data.skins.owned.includes(k));
    // First chest always contains a cosmetic so the reward feels special; later 30%.
    if (missing.length && (this.data.chest.opened === 0 || Math.random() < 0.3)) {
      skin = missing[0];
      this.data.skins.owned.push(skin);
    }
    this.add({ credits: reward.credits, tech: reward.tech });
    const scoutUnlocked = this.deliverBio(reward.bio);
    this.data.chest.opened++;
    this.data.chest.readyAt = null; // next chest starts after the next successful mission
    this.save();
    return { reward, skin, scoutUnlocked };
  }
}

function deepMerge(base, over) {
  if (typeof over !== 'object' || over === null || Array.isArray(over)) return over === undefined ? base : over;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const k of Object.keys(over)) {
    out[k] = (k in base && typeof base[k] === 'object' && base[k] !== null && !Array.isArray(base[k]))
      ? deepMerge(base[k], over[k]) : over[k];
  }
  return out;
}
