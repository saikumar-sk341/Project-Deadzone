// Mission script for OUTPOST ZERO (GDD sections 19 and 22).
// Group fields: t = seconds after wave start, n = count (scaled by the AI
// Director), every = spawn interval, lane = spawn edge, beaconBias = chance
// each enemy targets the beacon instead of the player, minDiff = only spawn
// if the Director's difficulty is at least this value.

export const WAVES = [
  {
    name: 'ESTABLISH DEFENCE',
    groups: [
      { t: 1, type: 'rusher', n: 5, lane: 'W', every: 1.1 },
      { t: 8, type: 'rusher', n: 5, lane: 'N', every: 1.0 },
      { t: 15, type: 'rusher', n: 3, lane: 'W', every: 0.9, beaconBias: 1 },
    ],
    lull: { caches: ['C1'], dur: 16, tutorial: 'excursion' },
  },
  {
    name: 'PRESSURE',
    groups: [
      { t: 0, type: 'rusher', n: 6, lane: 'S', every: 0.9, beaconBias: 0.2 },
      { t: 4, type: 'spitter', n: 2, lane: 'N', every: 2 },
      { t: 10, type: 'rusher', n: 6, lane: 'E', every: 0.8, beaconBias: 0.25 },
      { t: 16, type: 'spitter', n: 2, lane: 'W', every: 2, beaconBias: 0.5 },
      { t: 22, type: 'rusher', n: 6, lane: 'N', every: 0.6 },
    ],
    lull: { caches: ['C2', 'C3'], dur: 15 },
  },
  {
    name: 'HEAVY CONTACT',
    groups: [
      { t: 0, type: 'brute', n: 1, lane: 'E', every: 0, beaconBias: 0.85, fixed: true },
      { t: 2, type: 'rusher', n: 6, lane: 'S', every: 0.8, beaconBias: 0.2 },
      { t: 8, type: 'spitter', n: 3, lane: 'W', every: 1.5, beaconBias: 0.35 },
      { t: 14, type: 'rusher', n: 8, lane: 'N', every: 0.6, beaconBias: 0.15 },
      { t: 22, type: 'rusher', n: 6, lane: 'E', every: 0.6 },
      { t: 26, type: 'brute', n: 1, lane: 'W', every: 0, beaconBias: 0.6, minDiff: 1.08, fixed: true },
    ],
    lull: { caches: ['C4', 'C5'], dur: 13 },
  },
  {
    name: 'BEACON DISRUPTION',
    groups: [
      { t: 0, type: 'disruptor', n: 1, lane: 'S', every: 0, fixed: true },
      { t: 2, type: 'rusher', n: 6, lane: 'N', every: 0.8, beaconBias: 0.2 },
      { t: 8, type: 'spitter', n: 2, lane: 'E', every: 1.6, beaconBias: 0.4 },
      { t: 14, type: 'rusher', n: 8, lane: 'W', every: 0.6, beaconBias: 0.2 },
      { t: 24, type: 'disruptor', n: 1, lane: 'NE', every: 0, minDiff: 1.12, fixed: true },
      { t: 26, type: 'rusher', n: 8, lane: 'S', every: 0.5 },
    ],
    lull: { caches: ['C6'], dur: 13 },
  },
  {
    name: 'ELITE SPECIMEN',
    groups: [
      { t: 0, type: 'elite', n: 1, lane: 'N', every: 0, fixed: true },
      { t: 4, type: 'rusher', n: 6, lane: 'W', every: 0.7, beaconBias: 0.2 },
      { t: 11, type: 'spitter', n: 2, lane: 'S', every: 1.4, beaconBias: 0.35 },
      { t: 18, type: 'rusher', n: 6, lane: 'E', every: 0.6 },
      { t: 26, type: 'brute', n: 1, lane: 'S', every: 0, beaconBias: 0.6, minDiff: 1.1, fixed: true },
      { t: 32, type: 'rusher', n: 7, lane: 'N', every: 0.5 },
    ],
  },
];

// Extraction defence: times are relative to countdown start. Everyone hunts the player.
export const EXTRACTION_GROUPS = [
  { t: 0, type: 'rusher', n: 5, lane: 'NW', every: 0.5 },
  { t: 4, type: 'rusher', n: 5, lane: 'NE', every: 0.5 },
  { t: 8, type: 'spitter', n: 2, lane: 'N', every: 1 },
  { t: 11, type: 'rusher', n: 7, lane: 'W', every: 0.4 },
  { t: 15, type: 'brute', n: 1, lane: 'NE', every: 0, fixed: true },
  { t: 18, type: 'rusher', n: 8, lane: 'N', every: 0.35 },
  { t: 21, type: 'rusher', n: 6, lane: 'E', every: 0.35 },
];

// Green caches hold Bio Samples (the objective). Gold supply crates hold LOOT
// (weapon, grenades, power-up) + 1 Bio Sample and are guarded.
// Everything sits 11-18 m from the beacon: visible from the field, a short
// deliberate trip out (GDD 21B: first trips must be fair at baseline).
export const CACHES = {
  C1: { x: 11, z: 3.5, bio: 1 },
  C2: { x: -4, z: -15.5, bio: 2 },
  C3: { x: -13, z: 11.5, crate: true, guards: 2 },
  C4: { x: 12, z: -10, bio: 1 },
  C5: { x: -15, z: -3, bio: 2 },
  C6: { x: 17, z: 4, crate: true, guards: 3 },
};

// Spots the AI Director may use for extra caches (lures / scanner / quota top-up).
export const BONUS_SPOTS = [
  { x: 6, z: 16 }, { x: -10, z: 16 }, { x: 18, z: -2 }, { x: -10, z: -17 },
  { x: 15, z: -14 }, { x: -20, z: -4 }, { x: 13, z: 14 }, { x: -6, z: 18 },
];
