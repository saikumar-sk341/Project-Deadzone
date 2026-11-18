// ============================================================
// PROJECT DEADZONE — tuning values
// Values follow the GDD's "tuning hypotheses" (sections 3 and 21).
// Anything that differs from the GDD is commented with WHY.
// ============================================================

export const CFG = {
  map: {
    half: 42,              // playable area is a square of +/- half metres
    spawnDist: 41,         // lane spawn points sit just inside the edge
  },

  player: {
    radius: 0.5,
    speed: 7.0,            // m/s
    accel: 26,             // how snappy movement responds (higher = tighter)
    hp: 100,
    dashDist: 5.5,
    dashTime: 0.18,
    dashCd: 2.2,
    dashIframes: 0.3,
    pickupRadius: 1.7,     // auto-collect radius for orbs / common caches
    magnetRadius: 6.5,     // orbs start flying to the player inside this
    carryCap: 4,           // bio samples carried before you must bank
    interactRadius: 2.4,
  },

  // The signature mechanic.
  field: {
    radius: 8.5,           // GDD: 7-9 m
    regenPct: 0.0175,      // GDD: 1.5-2.0 % max HP / s inside
    exitGrace: 1.25,       // GDD v0.2: 1.0-1.5 s before first drain tick
    reentryGrace: 0.75,    // GDD v0.2: 0.5-1.0 s before regen resumes
    drainPct: 0.0125,      // GDD: 1.0-1.5 % max HP / s outside...
    // DEVIATION: drain ramps the longer you stay out ("exposure"), capped.
    // Flat 1.25 %/s made long trips nearly free in testing maths
    // (a 15 s trip cost ~19 HP). The ramp keeps short trips cheap
    // (GDD rule: first excursion must be fair at baseline) and makes
    // greedy trips a real decision.
    drainRamp: 0.0015,     // +0.15 %/s for every second outside
    drainMaxPct: 0.045,
  },

  beacon: {
    hp: 360,
    radius: 1.5,           // physical body (collision)
    disruptTime: 7,        // seconds field is down after a landed EMP
    emergencyTime: 35,     // seconds to restore protection after destruction
    rebootHold: 3.0,       // hold-interact seconds to reboot with a kit
    rebootHpPct: 0.45,
    kits: 1,               // emergency repair kits per mission
    repairRate: 32,        // beacon HP / s while holding repair
    repairPerTech: 12,     // beacon HP restored per Tech Fragment spent
    contestedWindow: 1.6,  // seconds after a hit that the beacon reads CONTESTED
    criticalPct: 0.3,
  },

  extraction: {
    x: 4, z: -31,
    radius: 4.6,
    activateHold: 1.2,     // stand on the pad this long to activate
    countdown: 25,         // GDD v0.2: 20-30 s
    strikeAt: 3,           // last seconds: the dropship gunship starts clearing the area
  },

  quota: 6,                // Bio Samples to bank before extraction unlocks

  weapons: {
    ar: {
      id: 'ar', name: 'Assault Rifle', short: 'AR', color: 0xffd46b,
      dmg: 10, rate: 8, mag: 36, reload: 1.1, range: 17,
      spread: 0.04, pellets: 1, speed: 50, knock: 0.6,
    },
    shotgun: {
      id: 'shotgun', name: 'Breacher Shotgun', short: 'SG', color: 0xffa040,
      dmg: 8, rate: 1.6, mag: 8, reload: 1.5, range: 9.5,
      spread: 0.34, pellets: 7, speed: 40, knock: 2.6,
    },
    // loot-only weapons (found in supply crates, last for the mission)
    arc: {
      id: 'arc', name: 'Arc Caster', short: 'ARC', color: 0x7ad8ff, mode: 'arc', loot: true,
      dmg: 15, rate: 3.4, mag: 24, reload: 1.3, range: 13, chain: 3, chainRange: 5.5,
      spread: 0, pellets: 1, speed: 0, knock: 1.2,
    },
    minigun: {
      id: 'minigun', name: 'Minigun', short: 'MG', color: 0xff8a3a, loot: true,
      dmg: 6.5, rate: 18, spinUp: 0.55, mag: 150, reload: 2.0, range: 16,
      spread: 0.085, pellets: 1, speed: 52, knock: 0.35, moveMul: 0.85,
    },
  },

  loot: {
    grenade: { dmg: 95, radius: 3.8, flight: 0.55, maxRange: 13, max: 6 },
    amp: { dur: 15, mul: 2 },
    turret: { dur: 25, rate: 5, dmg: 9, range: 11.5 },
  },

  // XP from kills drives in-mission level-ups (each level = pick 1 of 3 upgrades)
  xp: { rusher: 1, spitter: 2, brute: 6, disruptor: 5, elite: 20, base: 7, step: 6 },

  operatives: {
    assault: {
      id: 'assault', name: 'ASSAULT', color: 0xe8b23a,
      hpMul: 1.0, speedMul: 1.0, pickupMul: 1.0, dmgMul: 1.12,
      skill: { id: 'overdrive', name: 'Combat Overdrive', cd: 18, dur: 6 },
      passive: '+12% weapon damage',
      blurb: 'Reliable wave-clearer. Overdrive boosts fire rate and speed.',
    },
    scout: {
      id: 'scout', name: 'SCOUT', color: 0x52e08a,
      hpMul: 0.85, speedMul: 1.18, pickupMul: 1.6, dmgMul: 1.0,
      skill: { id: 'phase', name: 'Phase Dash', cd: 9, dur: 0.9 },
      passive: '+18% speed, +60% pickup radius, -15% HP',
      blurb: 'High-risk collector. Phase Dash makes you untouchable for a moment.',
    },
  },

  enemies: {
    rusher:    { hp: 26,  speed: 5.0, radius: 0.48, dmg: 6,  atkRange: 1.15, atkCd: 0.9, beaconDmg: 6,  credits: 3, tech: 0.14, mass: 1 },
    spitter:   { hp: 34,  speed: 2.9, radius: 0.55, dmg: 7,  range: 11,     atkCd: 3.2, beaconDmg: 9,  credits: 4, tech: 0.22, mass: 1.2 },
    brute:     { hp: 180, speed: 2.3, radius: 1.1,  dmg: 24, atkRange: 2.6, atkCd: 2.4, beaconDmg: 32, credits: 12, tech: 0.9, mass: 5, slamRadius: 3.3, windup: 1.0 },
    disruptor: { hp: 64,  speed: 3.7, radius: 0.6,  dmg: 0,  chargeTime: 4.2, chargeDist: 12.5, credits: 10, tech: 1, mass: 1.5 },
    elite:     { hp: 620, speed: 3.2, radius: 1.45, dmg: 24, atkCd: 2.2, beaconDmg: 30, credits: 40, tech: 1, mass: 9, slamRadius: 4.0, windup: 0.85 },
  },
};

// Lane spawn points (world x,z). On screen: W = up-left, N = up-right,
// E = down-right, S = down-left (isometric camera looks along -x,-z).
export const LANES = {
  W: { x: -CFG.map.spawnDist, z: 0 },
  N: { x: 0, z: -CFG.map.spawnDist },
  E: { x: CFG.map.spawnDist, z: 0 },
  S: { x: 0, z: CFG.map.spawnDist },
  NW: { x: -30, z: -30 },
  NE: { x: 30, z: -30 },
  SE: { x: 30, z: 30 },
  SW: { x: -30, z: 30 },
};
