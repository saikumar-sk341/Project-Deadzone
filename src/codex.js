// ============================================================
// SPECIMEN CODEX + OUTPOST ZERO ZONES (D1 / long-term retention)
// 8 specimen types to discover. 4 come from survey nodes hidden in each
// outer zone, 4 from specific enemies. Discovering them fills the codex,
// surveys the map, and unlocks milestone rewards.
// ============================================================
import { LAYOUT } from './world.js';
import { CFG } from './config.js';

export const ZONES = [
  { id: 'north', name: 'North Yard', node: { x: -15, z: -30 }, label: { x: -2, z: -39 } },
  { id: 'east', name: 'East Containers', node: { x: 27, z: -3 }, label: { x: 39, z: 2 } },
  { id: 'south', name: 'Crystal Field', node: { x: 0, z: 27 }, label: { x: 2, z: 39 } },
  { id: 'west', name: 'West Labs', node: { x: -30, z: 4 }, label: { x: -39, z: -2 } },
];

export function zoneOf(x, z) {
  if (Math.hypot(x, z) < 12) return 'center';
  if (z <= -Math.abs(x)) return 'north';
  if (x >= Math.abs(z)) return 'east';
  if (z >= Math.abs(x)) return 'south';
  return 'west';
}

export const SPECIMENS = [
  { id: 'lichen', name: 'Rust Lichen', zone: 'north', color: '#ff8a4a', src: 'Survey node · North Yard', lore: 'Eats steel. Explains why nothing in the yard still has paint.' },
  { id: 'leech', name: 'Coolant Leech', zone: 'east', color: '#4ad8ff', src: 'Survey node · East Containers', lore: 'Nests in reactor coolant. Cold to the touch, warm to the hive.' },
  { id: 'shard', name: 'Crystal Shard', zone: 'south', color: '#ff3a6a', src: 'Survey node · Crystal Field', lore: 'The red crystals are growing. Something is feeding them.' },
  { id: 'egg', name: 'Hive Egg', zone: 'west', color: '#c86bff', src: 'Survey node · West Labs', lore: 'Recovered from the old labs. It moved during transport.' },
  { id: 'gland', name: 'Spitter Gland', color: '#9dff4a', src: 'Rare drop · Spitter', lore: 'A pressurised acid sac. Do not squeeze.' },
  { id: 'plate', name: 'Brute Plate', color: '#ffb43a', src: 'Drop · Brute', lore: 'Bone armour thicker than the outpost walls.' },
  { id: 'core', name: 'Disruptor Core', color: '#b36bff', src: 'Kill a Disruptor mid-charge', lore: 'Still holds an EMP charge. Insulated gloves only.' },
  { id: 'heart', name: 'Elite Heart', color: '#ff5a2a', src: 'Drop · Elite specimen', lore: 'Still beating. The lab wants it very badly.' },
];
export const SPEC = Object.fromEntries(SPECIMENS.map((s) => [s.id, s]));
export const ZONE_SPEC = Object.fromEntries(SPECIMENS.filter((s) => s.zone).map((s) => [s.zone, s.id]));

export const MILESTONES = [
  { n: 3, id: 'skin', label: 'Spore Green beacon skin' },
  { n: 5, id: 'kit', label: 'Field Kit: +2 grenades every mission' },
  { n: 8, id: 'hunter', label: 'Hive Hunter title + 3 Mutagen Cores' },
];

// Small specimen icon (a glowing pod) in the specimen's colour
let ICON_ID = 0;
export function specIcon(color, unknown = false) {
  const gid = 'sg' + (ICON_ID++); // unique gradient id (duplicate ids inside hidden SVGs break rendering)
  if (unknown) {
    return `<svg viewBox="0 0 40 40"><path d="M20 4 C30 10 32 22 28 30 C25 36 15 36 12 30 C8 22 10 10 20 4 Z" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.25)" stroke-width="2" stroke-dasharray="3 3"/><text x="20" y="26" text-anchor="middle" font-size="14" font-weight="700" fill="rgba(255,255,255,0.35)" font-family="sans-serif">?</text></svg>`;
  }
  return `<svg viewBox="0 0 40 40"><defs><radialGradient id="${gid}" cx="0.4" cy="0.35" r="0.7"><stop offset="0" stop-color="#fff" stop-opacity="0.9"/><stop offset="0.35" stop-color="${color}"/><stop offset="1" stop-color="${color}" stop-opacity="0.35"/></radialGradient></defs>
    <path d="M20 4 C30 10 32 22 28 30 C25 36 15 36 12 30 C8 22 10 10 20 4 Z" fill="url(#${gid})" stroke="${color}" stroke-width="1.5"/>
    <path d="M16 14 C18 18 18 24 16 28 M24 14 C22 18 22 24 24 28" stroke="rgba(0,0,0,0.25)" stroke-width="1.5" fill="none"/></svg>`;
}

// ---------- Outpost Zero map (top-down, rotated 45° to match the in-game camera) ----------
const R2 = Math.SQRT1_2;
const toMap = (x, z) => [(x - z) * R2, (x + z) * R2];

export function mapSvg({ trail = [], points = [], surveyed = {}, visited = {}, death = null, mode = 'run' } = {}) {
  const H = CFG.map.half;
  const zoneTri = {
    north: [[0, 0], [-H, -H], [H, -H]], east: [[0, 0], [H, -H], [H, H]],
    south: [[0, 0], [H, H], [-H, H]], west: [[0, 0], [-H, H], [-H, -H]],
  };
  const zoneCol = { north: '#ff8a4a', east: '#4ad8ff', south: '#ff3a6a', west: '#c86bff' };
  let zones = '';
  for (const Z of ZONES) {
    const lit = mode === 'run' ? visited[Z.id] : surveyed[Z.id];
    const pts = zoneTri[Z.id].map((p) => p.join(',')).join(' ');
    zones += `<polygon points="${pts}" fill="${zoneCol[Z.id]}" fill-opacity="${lit ? 0.16 : 0.03}" stroke="${zoneCol[Z.id]}" stroke-opacity="${lit ? 0.5 : 0.12}" stroke-width="0.4"/>`;
    if (mode === 'codex' && !surveyed[Z.id]) zones += `<polygon points="${pts}" fill="url(#fog)" opacity="0.9"/>`;
  }
  let props = '';
  for (const b of LAYOUT.boxes) props += `<rect x="${b.x - b.w / 2}" y="${b.z - b.d / 2}" width="${b.w}" height="${b.d}" fill="#3a3f4c" rx="0.3"/>`;
  for (const c of LAYOUT.circles) props += `<circle cx="${c.x}" cy="${c.z}" r="${c.r}" fill="#2e2a36"/>`;
  for (const [x, z] of LAYOUT.crystals) props += `<circle cx="${x}" cy="${z}" r="1.2" fill="#ff2f55" opacity="0.45"/>`;
  const trailPts = trail.map(([x, z]) => `${x.toFixed(1)},${z.toFixed(1)}`).join(' ');
  const trailSvg = trail.length > 1 ? `<polyline points="${trailPts}" fill="none" stroke="#ffffff" stroke-opacity="0.45" stroke-width="0.7" stroke-linejoin="round" stroke-dasharray="1.6 1.2"/>` : '';
  // world-space markers
  const pad = CFG.extraction;
  let marks = `<circle cx="0" cy="0" r="${CFG.field.radius}" fill="#4ee8ff" fill-opacity="0.12" stroke="#4ee8ff" stroke-width="0.6"/>`;
  marks += `<circle cx="${pad.x}" cy="${pad.z}" r="${pad.radius}" fill="#ffa040" fill-opacity="0.12" stroke="#ffa040" stroke-width="0.6"/>`;
  // labels and icons are drawn unrotated (so they stay upright)
  let icons = '';
  const ic = (x, z, inner) => { const [u, v] = toMap(x, z); icons += `<g transform="translate(${u.toFixed(1)},${v.toFixed(1)})">${inner}</g>`; };
  ic(0, 0, '<path d="M0 -3.2 L2.6 -1.6 L2.2 2 L0 3.4 L-2.2 2 L-2.6 -1.6 Z" fill="#4ee8ff"/>');
  ic(pad.x, pad.z, '<path d="M0 -3 L2.6 -1.5 L2.6 1.5 L0 3 L-2.6 1.5 L-2.6 -1.5 Z" fill="none" stroke="#ffa040" stroke-width="0.9"/>');
  for (const p of points) {
    const col = p.kind === 'crate' ? '#ffb43a' : p.kind === 'node' ? (p.color || '#5affc8') : p.kind === 'specimen' ? '#c86bff' : '#6dff5a';
    const shape = p.kind === 'node'
      ? `<rect x="-1.9" y="-1.9" width="3.8" height="3.8" transform="rotate(45)" fill="${p.done ? col : 'none'}" stroke="${col}" stroke-width="0.8"/>`
      : `<circle r="1.9" fill="${p.done ? col : 'none'}" stroke="${col}" stroke-width="0.8"/>`;
    const tick = p.done ? '<path d="M-0.9 0 L-0.2 0.8 L1 -0.8" stroke="#08130a" stroke-width="0.7" fill="none"/>' : '';
    ic(p.x, p.z, shape + tick);
  }
  if (death) ic(death[0], death[1], '<path d="M-1.6 -1.6 L1.6 1.6 M1.6 -1.6 L-1.6 1.6" stroke="#ff4a4a" stroke-width="1"/>');
  for (const Z of ZONES) {
    const [u, v] = toMap(Z.label.x, Z.label.z);
    const lit = mode === 'run' ? visited[Z.id] : surveyed[Z.id];
    const txt = mode === 'codex' && !surveyed[Z.id] ? 'UNSURVEYED' : Z.name.toUpperCase();
    icons += `<text x="${u.toFixed(1)}" y="${v.toFixed(1)}" text-anchor="middle" font-size="2.8" letter-spacing="0.3" font-family="Rajdhani, Arial Narrow, sans-serif" font-weight="700" fill="${zoneCol[Z.id]}" fill-opacity="${lit ? 0.95 : 0.4}">${txt}</text>`;
  }
  const L = H * Math.SQRT2 + 3;
  return `<svg class="omap" viewBox="${-L} ${-L} ${2 * L} ${2 * L}" xmlns="http://www.w3.org/2000/svg">
    <defs><pattern id="fog" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill="#0c0a12"/><path d="M0 4 L4 0" stroke="#1d1a26" stroke-width="0.6"/></pattern></defs>
    <g transform="rotate(45)">
      <rect x="${-H}" y="${-H}" width="${2 * H}" height="${2 * H}" fill="#16131d" stroke="#ff3355" stroke-opacity="0.35" stroke-width="0.6"/>
      ${zones}${props}${marks}${trailSvg}
    </g>
    ${icons}
  </svg>`;
}
