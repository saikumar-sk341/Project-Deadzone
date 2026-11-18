import * as THREE from 'three';
import { CFG } from './config.js';
import { makeEnemy, makeBar, bakeStatic } from './models.js';
import { clamp, dist, yawOf, angleLerp, rand } from './util.js';
import { sfx } from './audio.js';

// ---------- model templates (geometry shared, body material per enemy) ----------
const TEMPLATES = {};
let BAR_T = null, BAR_ELITE = null;

function tag(r) {
  r.inner.userData.role = 'inner';
  r.legs.forEach((l) => (l.userData.role = 'leg'));
  for (const [k, v] of Object.entries(r.extra)) if (v && v.isObject3D) v.userData.role = k;
}

function instantiate(type) {
  if (!TEMPLATES[type]) {
    const r = makeEnemy(type);
    tag(r);
    // merge the non-animated parts of the body (keeps per-enemy draw calls low)
    bakeStatic(r.inner, (o) => o.parent === r.inner && !o.userData.role);
    TEMPLATES[type] = r;
  }
  const T = TEMPLATES[type];
  const group = T.group.clone(true);
  const bodyMat = T.bodyMat.clone();
  const sacMat = T.extra.sacMat ? T.extra.sacMat.clone() : null;
  const out = { group, bodyMat, legs: [], extra: {}, barY: T.barY };
  group.traverse((o) => {
    if (o.isMesh && o.material === T.bodyMat) o.material = bodyMat;
    if (sacMat && o.isMesh && o.material === T.extra.sacMat) o.material = sacMat;
    const role = o.userData.role;
    if (role === 'leg') out.legs.push(o);
    else if (role === 'inner') out.inner = o;
    else if (role) out.extra[role] = o;
  });
  if (sacMat) out.extra.sacMat = sacMat;
  return out;
}

function barFor(type) {
  if (!BAR_T) { BAR_T = makeBar(1.1, 0xff4a4a); BAR_ELITE = makeBar(2.6, 0xff7a1a, 0.2); }
  const bar = (type === 'elite' ? BAR_ELITE : BAR_T).clone(true);
  bar.userData.fill = bar.children[1]; // userData is JSON-copied by clone(), so re-link the mesh
  return bar;
}

let NEXT_ID = 1;

export function createEnemy(g, type, x, z, opts = {}) {
  const cfg = CFG.enemies[type];
  const m = instantiate(type);
  const hpMul = opts.hpMul || 1;
  const e = {
    id: NEXT_ID++, type, cfg, x, z, vx: 0, vz: 0, kx: 0, kz: 0,
    r: cfg.radius, hp: cfg.hp * hpMul, maxHp: cfg.hp * hpMul,
    speed: cfg.speed * rand(0.92, 1.08),
    face: yawOf(-x, -z), state: opts.dummy ? 'dummy' : opts.dormant ? 'dormant' : 'move', t: 0, dummy: !!opts.dummy,
    atkCd: rand(0.3, 1.0), flash: 0, dead: false,
    wave: opts.wave !== false, guard: !!opts.dormant, guardX: x, guardZ: z,
    beaconBias: opts.beaconBias || 0,
    target: 'player', side: Math.random() < 0.5 ? 1 : -1, walk: Math.random() * 6,
    model: m, telegraph: null, beam: null, anchor: null, chargeT: 0, summoned: 0,
    dashHit: false, dashDX: 0, dashDZ: 0, stunT: 0, spawnT: 0.35,
  };
  e.target = Math.random() < e.beaconBias ? 'beacon' : 'player';
  m.group.position.set(x, 0, z);
  m.group.rotation.y = e.face;
  m.group.scale.setScalar(0.01);
  g.root.add(m.group);
  const bar = barFor(type);
  bar.position.y = m.barY;
  bar.visible = false;
  m.group.add(bar);
  e.bar = bar;
  return e;
}

export function removeEnemyVisuals(g, e) {
  g.root.remove(e.model.group);
  e.model.bodyMat.dispose();
  if (e.model.extra.sacMat) e.model.extra.sacMat.dispose();
  if (e.telegraph) { g.fx.removeDecal(e.telegraph); e.telegraph = null; }
  if (e.beam) { g.root.remove(e.beam); e.beam.geometry.dispose(); e.beam.material.dispose(); e.beam = null; }
}

// ---------------- AI ----------------
const _dir = { x: 0, z: 0 };

const PROBE_ANGLES = [0.6, 1.0, 1.4, 1.8, 2.3];
function steer(g, e, tx, tz, speedMul = 1) {
  let dx = tx - e.x, dz = tz - e.z;
  const d = Math.hypot(dx, dz) || 1;
  dx /= d; dz /= d;
  e.wantMove = true;
  // committed detour after getting stuck: walk mostly sideways for a moment
  if (e.detourT > 0) {
    const px = -dz * e.side, pz = dx * e.side;
    dx = px * 0.9 + dx * 0.1; dz = pz * 0.9 + dz * 0.1;
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
  }
  // obstacle probe: if the path ahead is blocked, rotate (preferred side first, then the other)
  const probe = e.r + 1.2;
  const W = g.world;
  if (W.pointBlocked(e.x + dx * probe, e.z + dz * probe, e.r * 0.6)) {
    let found = false;
    for (const sideMul of [1, -1]) {
      for (const ang of PROBE_ANGLES) {
        const a = ang * e.side * sideMul;
        const rx = dx * Math.cos(a) - dz * Math.sin(a);
        const rz = dx * Math.sin(a) + dz * Math.cos(a);
        if (!W.pointBlocked(e.x + rx * probe, e.z + rz * probe, e.r * 0.6)) {
          dx = rx; dz = rz; found = true;
          if (sideMul < 0) e.side = -e.side; // keep going the way that worked
          break;
        }
      }
      if (found) break;
    }
  }
  _dir.x = dx; _dir.z = dz;
  const sp = e.speed * speedMul;
  e.vx = dx * sp; e.vz = dz * sp;
  return d;
}

// Stuck detection: if an enemy keeps trying to move but makes no progress,
// flip its avoidance side and commit to a sideways detour; as a last resort
// relocate it to a free spot a few metres toward its target (never on screen
// for long, and it guarantees waves can always be cleared).
function unstick(g, e, dt) {
  e.checkT = (e.checkT ?? 1) - dt;
  if (e.checkT > 0) return;
  e.checkT = 1;
  const moved = Math.hypot(e.x - (e.lastX ?? e.x + 9), e.z - (e.lastZ ?? e.z));
  if (e.wantMove && moved < 0.45 && e.state === 'move') {
    e.stuckN = (e.stuckN || 0) + 1;
    e.side = -e.side;
    e.detourT = 0.9 + e.stuckN * 0.3;
    if (e.stuckN >= 4) {
      const T = targetPos(g, e);
      const dx = T.x - e.x, dz = T.z - e.z, d = Math.hypot(dx, dz) || 1;
      for (let k = 3; k <= 9; k += 2) {
        for (const a of [0, 0.6, -0.6, 1.2, -1.2]) {
          const rx = dx / d * Math.cos(a) - dz / d * Math.sin(a), rz = dx / d * Math.sin(a) + dz / d * Math.cos(a);
          const nx = e.x + rx * k, nz = e.z + rz * k;
          if (!g.world.pointBlocked(nx, nz, e.r + 0.2)) { e.x = nx; e.z = nz; e.stuckN = 0; e.detourT = 0; k = 99; break; }
        }
      }
    }
  } else if (moved > 1) e.stuckN = 0;
  e.lastX = e.x; e.lastZ = e.z;
}

function faceTo(e, tx, tz, dt, rate = 10) {
  e.face = angleLerp(e.face, yawOf(tx - e.x, tz - e.z), Math.min(1, rate * dt));
}

function targetPos(g, e) {
  const b = g.beacon;
  if (e.target === 'beacon' && !b.destroyed) return { x: b.x, z: b.z, r: CFG.beacon.radius, kind: 'beacon' };
  return { x: g.player.x, z: g.player.z, r: g.player.r, kind: 'player' };
}

function retarget(g, e) {
  const p = g.player, b = g.beacon;
  if (e.target === 'beacon') {
    if (b.destroyed) e.target = 'player';
    else if (dist(e.x, e.z, p.x, p.z) < 4.5) e.target = 'player'; // aggro on the player if they come close
  }
}

export function updateEnemy(g, e, dt) {
  e.t += dt;
  e.atkCd -= dt;
  if (e.flash > 0) e.flash -= dt;
  if (e.spawnT > 0) e.spawnT -= dt;
  if (e.detourT > 0) e.detourT -= dt;
  e.vx = 0; e.vz = 0;
  e.wantMove = false;
  const p = g.player;

  if (e.dummy) { e.face += dt * 0.6; }
  else if (e.stunT > 0) { e.stunT -= dt; }
  else switch (e.type) {
    case 'rusher': rusher(g, e, dt); break;
    case 'spitter': spitter(g, e, dt); break;
    case 'brute': brute(g, e, dt); break;
    case 'disruptor': disruptor(g, e, dt); break;
    case 'elite': elite(g, e, dt); break;
  }

  // knockback impulse
  e.x += (e.vx + e.kx) * dt;
  e.z += (e.vz + e.kz) * dt;
  const kd = Math.exp(-8 * dt);
  e.kx *= kd; e.kz *= kd;

  // keep out of the beacon body & player body
  const b = g.beacon;
  {
    const dx = e.x - b.x, dz = e.z - b.z;
    const rr = e.r + CFG.beacon.radius;
    const d2 = dx * dx + dz * dz;
    if (d2 < rr * rr) { const d = Math.sqrt(d2) || 0.01; e.x = b.x + dx / d * rr; e.z = b.z + dz / d * rr; }
  }
  if (!p.dead) {
    const dx = e.x - p.x, dz = e.z - p.z;
    const rr = e.r + p.r * 0.9;
    const d2 = dx * dx + dz * dz;
    if (d2 < rr * rr) { const d = Math.sqrt(d2) || 0.01; e.x = p.x + dx / d * rr; e.z = p.z + dz / d * rr; }
  }
  g.world.resolve(e, e.r);
  unstick(g, e, dt);

  // visuals
  const m = e.model;
  m.group.position.set(e.x, 0, e.z);
  m.group.rotation.y = e.face;
  const s = e.spawnT > 0 ? 1 - e.spawnT / 0.35 : 1;
  if (e.spawnT > -0.1) m.group.scale.setScalar(Math.max(0.01, s));
  const moving = Math.hypot(e.vx, e.vz) > 0.2;
  if (moving) e.walk += dt * (e.type === 'rusher' ? 18 : e.type === 'spitter' ? 10 : 6);
  animate(e, dt, moving);
  if (e.flash > 0) { m.bodyMat.emissive.setRGB(1, 1, 1); m.bodyMat.emissiveIntensity = 1.4; }
  else if (e.type === 'disruptor') { m.bodyMat.emissive.setHex(0x7a3bff); m.bodyMat.emissiveIntensity = 0.9 + (e.state === 'charge' ? e.chargeT * 2 : 0); }
  else { m.bodyMat.emissive.setRGB(0, 0, 0); m.bodyMat.emissiveIntensity = 1; }
  const showBar = e.hp < e.maxHp || e.type === 'elite' || e.type === 'brute' || e.type === 'disruptor';
  e.bar.visible = showBar && e.spawnT <= 0;
  if (e.bar.visible) {
    e.bar.quaternion.copy(g.world.camera.quaternion);
    // undo parent yaw so the bar stays camera-aligned
    e.bar.quaternion.premultiply(_q.setFromAxisAngle(_up, -e.face));
    e.bar.userData.fill.scale.x = Math.max(0.001, e.hp / e.maxHp);
  }
}
const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

function animate(e, dt, moving) {
  const m = e.model;
  const w = e.walk;
  if (e.type === 'rusher' || e.type === 'spitter') {
    m.legs.forEach((l, i) => { l.position.y = moving ? Math.max(0, Math.sin(w + i * Math.PI)) * 0.12 : 0; l.rotation.y = moving ? Math.sin(w + i * Math.PI) * 0.12 : 0; });
    if (m.inner) m.inner.position.y = moving ? Math.abs(Math.sin(w)) * 0.06 : 0;
    if (e.type === 'rusher' && m.inner) m.inner.rotation.x = e.state === 'windup' ? -0.35 : e.state === 'lunge' ? 0.25 : 0;
    if (e.type === 'spitter' && m.extra.sac) {
      const k = e.state === 'windup' ? 1 + e.t / 0.55 * 0.5 : 1;
      m.extra.sac.scale.setScalar(k);
      if (m.extra.sacMat) m.extra.sacMat.emissiveIntensity = e.state === 'windup' ? 1.6 + e.t * 6 : 1.6;
    }
  } else if (e.type === 'brute' || e.type === 'elite') {
    m.legs.forEach((l, i) => { l.rotation.x = moving ? Math.sin(w + i * Math.PI) * 0.5 : 0; });
    const wind = e.state === 'windup' ? Math.min(1, e.t / e.cfg.windup) : 0;
    const armRot = e.state === 'windup' ? -2.4 * wind : e.state === 'recover' ? Math.max(0, 0.6 - e.t) : (moving ? Math.sin(w) * 0.3 : 0);
    if (m.extra.armL) { m.extra.armL.rotation.x = armRot; m.extra.armR.rotation.x = e.state === 'windup' || e.state === 'recover' ? armRot : -armRot; }
    if (m.inner) m.inner.rotation.x = e.state === 'cwindup' ? 0.25 : e.state === 'dash' ? 0.35 : 0;
  } else if (e.type === 'disruptor') {
    if (m.extra.hover) m.extra.hover.position.y = 1.4 + Math.sin(e.t * 3) * 0.15;
    if (m.extra.ring) m.extra.ring.rotation.z += dt * (e.state === 'charge' ? 12 : 2);
  }
}

// ---- Rusher: fast melee ----
function rusher(g, e, dt) {
  if (e.state === 'dormant') return dormant(g, e, dt);
  retarget(g, e);
  const T = targetPos(g, e);
  const d = dist(e.x, e.z, T.x, T.z);
  const reach = e.r + T.r + e.cfg.atkRange;
  if (e.state === 'move') {
    if (d > reach * 0.85) steer(g, e, T.x, T.z);
    faceTo(e, T.x, T.z, dt);
    if (d <= reach && e.atkCd <= 0) { e.state = 'windup'; e.t = 0; }
  } else if (e.state === 'windup') {
    faceTo(e, T.x, T.z, dt, 14);
    if (e.t > 0.24) {
      e.state = 'lunge'; e.t = 0;
      if (d <= reach + 0.5) {
        if (T.kind === 'player') g.damagePlayer(e.cfg.dmg, 'rusher', e.x, e.z);
        else g.damageBeacon(e.cfg.beaconDmg, e);
      }
    }
  } else if (e.state === 'lunge') {
    if (e.t > 0.2) { e.state = 'move'; e.atkCd = e.cfg.atkCd; }
  }
}

function dormant(g, e, dt) {
  const p = g.player;
  e.face += dt * 0.4;
  if (dist(e.x, e.z, p.x, p.z) < 9 || e.hp < e.maxHp) {
    e.state = 'move'; e.target = 'player';
    g.fx.text(e.x, 2, e.z, '!', 'ft-alert', 0.8);
  }
}

// ---- Spitter: ranged, keeps distance ----
function spitter(g, e, dt) {
  if (e.state === 'dormant') return dormant(g, e, dt);
  retarget(g, e);
  const T = targetPos(g, e);
  const d = dist(e.x, e.z, T.x, T.z);
  const range = e.hunt ? 5 : e.cfg.range;
  if (e.state === 'move') {
    if (d > range) steer(g, e, T.x, T.z);
    else if (d < range * 0.55) { steer(g, e, e.x - (T.x - e.x), e.z - (T.z - e.z), 0.8); }
    else {
      // strafe around target
      const px = -(T.z - e.z) / d * e.side, pz = (T.x - e.x) / d * e.side;
      steer(g, e, e.x + px * 3, e.z + pz * 3, 0.45);
      if (Math.random() < dt * 0.3) e.side *= -1;
    }
    faceTo(e, T.x, T.z, dt);
    if (d <= Math.max(range, 8) + 1.5 && e.atkCd <= 0 && e.spawnT <= 0) { e.state = 'windup'; e.t = 0; }
  } else if (e.state === 'windup') {
    faceTo(e, T.x, T.z, dt, 12);
    if (e.t > 0.55) {
      let tx = T.x, tz = T.z;
      if (T.kind === 'player') { tx += g.player.vx * 0.35; tz += g.player.vz * 0.35; }
      g.fireGlob(e, tx, tz);
      sfx.spit();
      e.state = 'move'; e.t = 0; e.atkCd = e.cfg.atkCd * rand(0.85, 1.2);
    }
  }
}

// ---- Brute: slow tank, telegraphed slam, wrecks the beacon ----
function brute(g, e, dt) {
  retarget(g, e);
  const T = targetPos(g, e);
  const d = dist(e.x, e.z, T.x, T.z);
  const reach = e.r + T.r + e.cfg.atkRange;
  if (e.state === 'move') {
    if (d > reach * 0.8) steer(g, e, T.x, T.z);
    faceTo(e, T.x, T.z, dt, 5);
    if (d <= reach && e.atkCd <= 0) startSlam(g, e);
  } else if (e.state === 'windup') {
    if (e.t >= e.cfg.windup) doSlam(g, e);
  } else if (e.state === 'recover') {
    if (e.t > 0.6) { e.state = 'move'; e.atkCd = e.cfg.atkCd; }
  }
}

function startSlam(g, e) {
  e.state = 'windup'; e.t = 0;
  const fx = Math.sin(e.face), fz = Math.cos(e.face);
  e.slamX = e.x + fx * (e.r + 0.9);
  e.slamZ = e.z + fz * (e.r + 0.9);
  e.telegraph = g.fx.circleTelegraph(e.slamX, e.slamZ, e.cfg.slamRadius, e.cfg.windup, 0xff4a2a);
}

function doSlam(g, e) {
  e.state = 'recover'; e.t = 0;
  e.telegraph = null;
  const R = e.cfg.slamRadius;
  const p = g.player, b = g.beacon;
  if (dist(p.x, p.z, e.slamX, e.slamZ) < R + p.r) {
    const dx = p.x - e.slamX, dz = p.z - e.slamZ, d = Math.hypot(dx, dz) || 1;
    g.damagePlayer(e.cfg.dmg, e.type, e.slamX, e.slamZ, (dx / d) * 9, (dz / d) * 9);
  }
  if (!b.destroyed && dist(b.x, b.z, e.slamX, e.slamZ) < R + CFG.beacon.radius) g.damageBeacon(e.cfg.beaconDmg, e);
  g.fx.shockwave(e.slamX, e.slamZ, R, 0xff6a2a, 0.45);
  g.fx.burst(e.slamX, 0.3, e.slamZ, 22, 0x8a7a70, { speed: 7, size: 0.22, life: 0.6, up: 5 });
  g.world.addShake(e.type === 'elite' ? 0.6 : 0.4);
  sfx.slam();
}

// ---- Disruptor: telegraphed EMP that collapses the field ----
function disruptor(g, e, dt) {
  const b = g.beacon;
  if (!e.anchor) {
    // anchor point on the side the disruptor came from
    const a = Math.atan2(e.z - b.z, e.x - b.x) + (e.anchorShift || 0);
    const R = e.cfg.chargeDist;
    e.anchor = { x: b.x + Math.cos(a) * R, z: b.z + Math.sin(a) * R };
    if (g.world.pointBlocked(e.anchor.x, e.anchor.z, 1)) e.anchor = { x: b.x + Math.cos(a + 0.5) * R, z: b.z + Math.sin(a + 0.5) * R };
  }
  if (e.state === 'move') {
    const d = dist(e.x, e.z, e.anchor.x, e.anchor.z);
    if (d > 0.8) steer(g, e, e.anchor.x, e.anchor.z);
    faceTo(e, b.x, b.z, dt);
    if (d <= 1.2 && g.fieldOn() && e.atkCd <= 0) startCharge(g, e);
  } else if (e.state === 'charge') {
    if (!g.fieldOn()) { endCharge(g, e); e.state = 'move'; e.atkCd = 3; return; }
    e.chargeT = Math.min(1, e.t / e.cfg.chargeTime);
    faceTo(e, b.x, b.z, dt);
    updateBeam(g, e);
    sfx.charge(e.chargeT);
    if (e.t >= e.cfg.chargeTime) {
      endCharge(g, e);
      g.empHit(e);
      e.state = 'move'; e.atkCd = 14; e.anchor = null; e.anchorShift = (e.anchorShift || 0) + 1.1;
    }
  }
}

function startCharge(g, e) {
  e.state = 'charge'; e.t = 0; e.chargeT = 0;
  const geo = new THREE.CylinderGeometry(0.07, 0.07, 1, 6, 1, true);
  geo.translate(0, 0.5, 0);
  geo.rotateX(Math.PI / 2);
  const mt = new THREE.MeshBasicMaterial({ color: 0xc86bff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  e.beam = new THREE.Mesh(geo, mt);
  g.root.add(e.beam);
  g.onDisruptorCharge(e);
}

function updateBeam(g, e) {
  const b = g.beacon;
  const sx = e.x, sz = e.z, sy = 1.9, tx = b.x, tz = b.z, ty = 2.5;
  const len = Math.hypot(tx - sx, ty - sy, tz - sz);
  e.beam.position.set(sx, sy, sz);
  e.beam.lookAt(tx, ty, tz);
  const w = 1 + e.chargeT * 3 + Math.sin(e.t * 40) * 0.6 * e.chargeT;
  e.beam.scale.set(w, w, len);
  e.beam.material.opacity = 0.25 + e.chargeT * 0.6 + Math.sin(e.t * 30) * 0.15;
}

export function endCharge(g, e) {
  if (e.beam) { g.root.remove(e.beam); e.beam.geometry.dispose(); e.beam.material.dispose(); e.beam = null; }
  e.chargeT = 0;
}

// ---- Elite: charges, slams, summons ----
function elite(g, e, dt) {
  const p = g.player;
  retarget(g, e);
  const T = targetPos(g, e);
  const d = dist(e.x, e.z, T.x, T.z);
  // summons at 66% / 33%
  const frac = e.hp / e.maxHp;
  if ((e.summoned === 0 && frac < 0.66) || (e.summoned === 1 && frac < 0.33)) {
    e.summoned++;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      g.spawnEnemy('rusher', e.x + Math.cos(a) * 2.5, e.z + Math.sin(a) * 2.5, { wave: true });
    }
    g.fx.shockwave(e.x, e.z, 5, 0xff4a1a, 0.6);
    g.comm('Elite is calling the swarm!', 'alert');
    sfx.alarm();
  }
  if (e.state === 'move') {
    if (d > e.r + T.r + 1.6) steer(g, e, T.x, T.z);
    faceTo(e, T.x, T.z, dt, 4);
    if (e.atkCd <= 0) {
      if (d < e.r + T.r + 2.4) startSlam(g, e);
      else if (d < 15 && T.kind === 'player' && !p.dead) {
        e.state = 'cwindup'; e.t = 0;
        const dx = T.x - e.x, dz = T.z - e.z, dd = Math.hypot(dx, dz) || 1;
        e.dashDX = dx / dd; e.dashDZ = dz / dd;
        e.face = yawOf(e.dashDX, e.dashDZ);
        e.telegraph = g.fx.lineTelegraph(e.x, e.z, e.dashDX, e.dashDZ, 15, 2.6, 0.9, 0xff3a1a);
      }
    }
  } else if (e.state === 'cwindup') {
    if (e.t >= 0.9) { e.state = 'dash'; e.t = 0; e.dashHit = false; e.telegraph = null; sfx.dash(); }
  } else if (e.state === 'dash') {
    e.vx = e.dashDX * 18; e.vz = e.dashDZ * 18;
    if (!e.dashHit && !p.dead && dist(e.x, e.z, p.x, p.z) < e.r + p.r + 0.2) {
      e.dashHit = true;
      g.damagePlayer(e.cfg.dmg, 'elite', e.x, e.z, e.dashDX * 12, e.dashDZ * 12);
    }
    const b = g.beacon;
    if (!e.beaconHit && !b.destroyed && dist(e.x, e.z, b.x, b.z) < e.r + CFG.beacon.radius + 0.3) {
      e.beaconHit = true;
      g.damageBeacon(e.cfg.beaconDmg, e);
    }
    const blocked = g.world.pointBlocked(e.x + e.dashDX * (e.r + 0.3), e.z + e.dashDZ * (e.r + 0.3));
    if (e.t > 0.75 || blocked) {
      e.state = 'recover'; e.t = 0; e.beaconHit = false;
      if (blocked) { e.stunT = 0.9; g.world.addShake(0.4); g.fx.burst(e.x, 1, e.z, 16, 0xffaa55, { speed: 6 }); g.fx.text(e.x, 3.5, e.z, 'STUNNED', 'ft-crit', 1); }
    }
  } else if (e.state === 'windup') {
    if (e.t >= e.cfg.windup) doSlam(g, e);
  } else if (e.state === 'recover') {
    if (e.t > 0.7) { e.state = 'move'; e.atkCd = e.cfg.atkCd; }
  }
}

export function separate(enemies, dt) {
  const n = enemies.length;
  for (let i = 0; i < n; i++) {
    const a = enemies[i];
    if (a.state === 'dash') continue;
    for (let j = i + 1; j < n; j++) {
      const b = enemies[j];
      const dx = b.x - a.x, dz = b.z - a.z;
      const rr = a.r + b.r;
      if (Math.abs(dx) > rr || Math.abs(dz) > rr) continue;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = (rr - d) * 0.5;
        const nx = dx / d, nz = dz / d;
        const ma = a.cfg.mass, mb = b.cfg.mass, tot = ma + mb;
        a.x -= nx * push * (mb / tot) * 2; a.z -= nz * push * (mb / tot) * 2;
        b.x += nx * push * (ma / tot) * 2; b.z += nz * push * (ma / tot) * 2;
      }
    }
  }
}
