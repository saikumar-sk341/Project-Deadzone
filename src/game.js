import * as THREE from 'three';
import { CFG, LANES } from './config.js';
import { WAVES, EXTRACTION_GROUPS, CACHES, BONUS_SPOTS } from './waves.js';
import { Director } from './director.js';
import { createEnemy, updateEnemy, removeEnemyVisuals, separate, endCharge } from './enemies.js';
import {
  makePlayer, makeBeacon, makeField, makeCache, makeLootCrate, makeOrb, makeExtractionPad,
  makeDropship, makeGenerator, makeTurret, makeGrenade, makeSurveyNode, makeSpecOrb,
} from './models.js';
import { ZONES, ZONE_SPEC, SPEC, zoneOf, specIcon } from './codex.js';
import { sfx } from './audio.js';
import { clamp, dist, yawOf, rand, angleLerp, damp, weightedPick } from './util.js';
import { SKINS } from './meta.js';

const SQ2 = Math.SQRT1_2;
const MAX_BULLETS = 400;
const MAX_GLOBS = 120;

const ORB_T = {};
function orbModel(kind, spec) {
  const key = spec ? 'spec:' + spec : kind;
  if (!ORB_T[key]) ORB_T[key] = spec ? makeSpecOrb(SPEC[spec].color) : makeOrb(kind);
  return ORB_T[key].clone(true);
}

// Interactive controls tutorial (first mission). Each step waits for the action.
const TUTORIAL = [
  { id: 'move', title: 'MOVE', desk: { keys: ['W', 'A', 'S', 'D'], sub: 'Move around' }, touch: { icon: 'stick', sub: 'Drag the left side of the screen' } },
  { id: 'shoot', title: 'SHOOT', desk: { icon: 'mouse', sub: 'Aim with the mouse · hold left click' }, touch: { icon: 'auto', sub: 'Walk toward enemies · you fire automatically' } },
  { id: 'dash', title: 'DASH', desk: { keys: ['SPACE'], sub: 'Dodge through danger' }, touch: { icon: 'btn-dash', sub: 'Tap DASH' } },
  { id: 'grenade', title: 'GRENADE', desk: { icon: 'rmouse', sub: 'Right-click to throw at the group' }, touch: { icon: 'btn-nade', sub: 'Tap GRENADE' } },
  { id: 'out', title: 'LEAVE THE FIELD', desk: { icon: 'out', sub: 'Outside, the toxic air drains your health' }, touch: { icon: 'out', sub: 'Outside, the toxic air drains your health' } },
  { id: 'in', title: 'GET BACK INSIDE', desk: { icon: 'in', sub: 'Inside the field you heal' }, touch: { icon: 'in', sub: 'Inside the field you heal' } },
];

export class Game {
  constructor(app) {
    this.app = app;
    this.world = app.world;
    this.fx = app.fx;
    this.hud = app.hud;
    this.input = app.input;
    this.meta = app.meta;
    this.root = null;
    this._v = new THREE.Vector3();
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3(1, 1, 1);
    this.timeScale = 1;
  }

  // =========================================================
  // SETUP
  // =========================================================
  start(opts = {}) {
    const md = this.meta.data;
    md.tutorials = md.tutorials || {};
    this.tut = md.tutorials;
    this.opId = opts.operative || 'assault';
    this.op = CFG.operatives[this.opId];
    this.weaponId = opts.weapon || 'ar';
    if (this.root) this.dispose();
    this.root = new THREE.Group();
    this.world.scene.add(this.root);
    this.fx.clear();

    this.time = 0;
    this.phase = 'deploy';
    this.phaseT = 0;
    this.waveIdx = -1;
    this.waveT = 0;
    this.groups = [];
    this.lullT = 0;
    this.paused = false;
    this.over = false;
    this.collectT = 0;
    this.failReason = null;
    this.interact = null;
    this.slowT = 0;
    this.slowScale = 1;
    this.mods = {
      dmgMul: 1, rateMul: 1, pierce: 0, ricochet: 0, volatile: false, critChance: 0.06,
      radiusMul: 1, regenMul: 1, pulse: false, autorepair: false,
      exitShield: false, speedOutMul: 1, drainMul: 1, sampleHeal: 0, carryBonus: 0, pickupMul: 1, revive: false,
    };
    this.taken = {};
    this.stats = {
      kills: 0, bioPicked: 0, timeOutside: 0, empInterrupts: 0, empLanded: 0, rareCaches: 0,
      beaconDestroyed: 0, dmgTaken: 0, upgrades: [], excursions: 0, longestExcursion: 0, dmgBy: {},
      bestCombo: 0, loot: [], grenadesThrown: 0,
    };
    this.run = { credits: 0, tech: 0, techSpent: 0 };
    this.enemies = [];
    this.bullets = [];
    this.globs = [];
    this.orbs = [];
    this.caches = [];
    this.grenades = [];
    this.turrets = [];
    this.usedSpots = new Set();
    this.generator = null;
    this.lootCount = 0;
    this.loot = { grenades: 1, ampT: 0 };
    this.xp = 0; this.level = 1; this.xpNext = CFG.xp.base; this.pendingLevels = 0; this.levelDelay = 0;
    this.combo = { n: 0, t: 0, tier: 0 };
    this.lastBeaconWarn = -99;
    this.tutorialMode = !md.tutorialDone;
    this.tstep = -1;
    // codex / map tracking for the results screen
    this.stats.specimens = {};
    this.nodesFound = [];
    this.trail = [];
    this.trailT = 0;
    this.visited = { center: true };
    this.known = new Set(md.codex.discovered);
    if (md.codex.perks.kit) this.loot.grenades += 2;

    // permanent HQ bonuses
    const A = md.armory;
    this.weaponLvlMul = 1 + ((this.weaponId === 'shotgun' ? A.sgLevel : A.arLevel) - 1) * 0.1;
    this.metaRadiusMul = md.research.fieldMk2 ? 1.1 : 1;
    this.metaRegenMul = md.research.nanites ? 1.25 : 1;

    // ---- player ----
    const pm = makePlayer(this.op.color);
    this.root.add(pm.group);
    const w = CFG.weapons[this.weaponId];
    const maxHp = Math.round(CFG.player.hp * this.op.hpMul);
    this.player = {
      x: 2.6, z: -2.2, vx: 0, vz: 0, kx: 0, kz: 0, r: CFG.player.radius,
      hp: maxHp, maxHp, face: yawOf(1, -1), aimX: 6, aimZ: -6,
      dashT: 0, dashCd: 0, dashDX: 0, dashDZ: 0, dashSpeed: 0, iframes: 0,
      skillCd: 2, skillT: 0, fireCd: 0, weapon: w, ammo: w.mag, reloadT: 0, spin: 0, firing: false,
      carriedBio: 0, carriedMut: 0, outsideT: 0, insideT: 5, exitShieldT: 0,
      dead: false, reviveUsed: false, model: pm, walk: 0, hurtT: 0, recoil: 0,
      wasIn: true, exStart: 0, exMax: 0, drainRate: 0, fullWarnT: 0, moved: 0, dashed: false,
    };

    // ---- beacon ----
    const bm = makeBeacon();
    const field = makeField();
    const skin = SKINS[md.skins.active] || SKINS.cyan;
    this.fieldColor = new THREE.Color(skin.color);
    field.uniforms.uColor.value.copy(this.fieldColor);
    field.ringMat.color.copy(this.fieldColor).lerp(new THREE.Color(0xffffff), 0.3);
    this.root.add(bm.group, field.group);
    const bHp = Math.round(CFG.beacon.hp * (1 + A.beaconHp * 0.15));
    this.beacon = {
      x: 0, z: 0, hp: bHp, maxHp: bHp, baseRadius: CFG.field.radius * this.metaRadiusMul, radius: 0,
      disruptT: 0, destroyed: false, emergencyT: 0, rebootT: 0, lastHitT: -99, kits: CFG.beacon.kits + (A.repairKit || 0),
      pulseCd: 0, bankedBio: 0, bankedMut: 0, deployT: 0, deployed: false, model: bm, field, bankT: 0,
      repairCredit: 0, state: 'active', wasOn: false,
    };
    bm.group.position.set(0, 14, 0);

    // ---- extraction ----
    const pad = makeExtractionPad();
    pad.group.position.set(CFG.extraction.x, 0, CFG.extraction.z);
    this.root.add(pad.group);
    this.ext = { state: 'locked', holdT: 0, countdown: CFG.extraction.countdown, t: 0, groups: [], pad, ship: null, liftT: 0, lastProg: -1, strike: null };

    // ---- instanced projectiles ----
    const bg = new THREE.BoxGeometry(0.11, 0.11, 1.2);
    this.bulletMesh = new THREE.InstancedMesh(bg, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), MAX_BULLETS);
    this.bulletMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_BULLETS * 3), 3);
    this.bulletMesh.frustumCulled = false;
    this.bulletMesh.count = 0;
    const gg = new THREE.SphereGeometry(0.2, 8, 6);
    this.globMesh = new THREE.InstancedMesh(gg, new THREE.MeshBasicMaterial({ color: 0x8aee3a }), MAX_GLOBS);
    this.globMesh.frustumCulled = false;
    this.globMesh.count = 0;
    this.root.add(this.bulletMesh, this.globMesh);
    this._c = new THREE.Color();

    // return-to-safety cue (ground strip)
    const cueGeo = new THREE.PlaneGeometry(0.22, 1);
    cueGeo.rotateX(-Math.PI / 2);
    cueGeo.translate(0, 0, 0.5);
    this.cue = new THREE.Mesh(cueGeo, new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false }));
    this.cue.position.y = 0.06;
    this.cue.visible = false;
    this.root.add(this.cue);

    this.director = new Director(this, md.director);

    // survey nodes: one per outer zone, guarded, optional (they hold the zone specimens)
    for (const Z of ZONES) {
      this.spawnCache({ x: Z.node.x, z: Z.node.z, node: Z.id, guards: 2 }, 'node-' + Z.id);
    }

    this.world.follow(this.player.x, this.player.z, 0, true);
    this.world.setZoom(1);
    this.hud.startMission(this);
    this.input.reset();
    sfx.engine();
  }

  dispose() {
    for (const e of this.enemies) removeEnemyVisuals(this, e);
    this.enemies = [];
    if (this.root) this.world.scene.remove(this.root);
    this.root = null;
    this.fx.clear();
    this.hud.tutorialCard(null);
  }

  // =========================================================
  // HELPERS used by enemies / director / hud
  // =========================================================
  fieldOn() { const b = this.beacon; return b.deployed && !b.destroyed && b.disruptT <= 0; }
  isInField() {
    const p = this.player, b = this.beacon;
    return this.fieldOn() && b.radius > 0.5 && dist(p.x, p.z, b.x, b.z) < b.radius;
  }
  onPad() {
    const p = this.player;
    return dist(p.x, p.z, CFG.extraction.x, CFG.extraction.z) < CFG.extraction.radius;
  }
  padSafe() { return (this.phase === 'extracting' || this.phase === 'extracted') && this.onPad(); }
  enemiesNear(x, z, r) {
    let n = 0;
    const r2 = r * r;
    for (const e of this.enemies) if (!e.dead && e.state !== 'dormant' && !e.dummy && (e.x - x) ** 2 + (e.z - z) ** 2 < r2) n++;
    return n;
  }
  carryCap() { return CFG.player.carryCap + this.mods.carryBonus; }
  comm(text, kind = 'hq') { this.hud.callout(text, kind); }
  hint(key, text, kind = 'tip') {
    if (this.tut[key]) return;
    this.tut[key] = true;
    this.hud.callout(text, kind);
  }
  // brief slow-motion for big moments (kills, loot, air strike)
  slowmo(dur, scale) {
    this.slowScale = this.slowT > 0 ? Math.min(this.slowScale, scale) : scale;
    this.slowT = Math.max(this.slowT, dur);
  }

  // What the player should be doing right now (drives the objective tracker)
  objective() {
    const b = this.beacon, E = this.ext;
    const alive = this.enemies.filter((e) => !e.dead && e.wave).length;
    switch (this.phase) {
      case 'deploy': return { title: 'BEACON DEPLOYING', sub: 'Stand by', icon: 'beacon' };
      case 'tutorial': return { title: 'TRAINING', sub: `Step ${Math.min(this.tstep + 1, TUTORIAL.length)} of ${TUTORIAL.length}`, icon: 'train', prog: Math.max(0, this.tstep) / TUTORIAL.length };
      case 'wave': return { title: 'HOLD THE FIELD', sub: `Wave ${this.waveIdx + 1} of ${WAVES.length} · ${alive} hostile${alive === 1 ? '' : 's'} left`, icon: 'wave', prog: this.waveProgress() };
      case 'lull': return { title: this.caches.some((c) => !c.collected && !c.node) ? 'GRAB THE SAMPLES' : 'GET READY', sub: `Next wave in ${Math.ceil(this.lullT)}s`, icon: 'sample', timer: this.lullT };
      case 'collect': return { title: `BANK ${Math.max(0, CFG.quota - b.bankedBio)} MORE SAMPLES`, sub: 'Then the dropship can come', icon: 'sample' };
      case 'extract': return { title: 'GO TO THE LANDING PAD', sub: 'Stand on it to call the dropship', icon: 'pad' };
      case 'extracting': return { title: E.paused ? 'GET BACK ON THE PAD' : 'HOLD THE PAD', sub: `Dropship in ${Math.ceil(Math.max(0, E.countdown))}s`, icon: 'pad', alert: E.paused };
      case 'extracted': return { title: 'EXTRACTED', sub: '', icon: 'pad' };
      default: return { title: '', sub: '', icon: '' };
    }
  }
  waveProgress() {
    const tot = this.groups.reduce((a, g) => a + g.total, 0) || 1;
    const spawned = this.groups.reduce((a, g) => a + g.spawned, 0);
    const alive = this.enemies.filter((e) => !e.dead && e.wave).length;
    return clamp((spawned - alive) / tot, 0, 1);
  }

  // =========================================================
  // MAIN UPDATE
  // =========================================================
  update(dtReal) {
    if (!this.root) return;
    let dt = Math.min(dtReal, 1 / 30) * this.timeScale;
    if (this.paused) { this.hud.update(this, 0); return; }
    if (this.slowT > 0) {
      this.slowT -= dt;
      dt *= this.slowScale;
      if (this.slowT <= 0) this.slowScale = 1;
    }
    this.time += dt;
    this.phaseT += dt;

    this.updateBeacon(dt);
    this.updatePlayer(dt);
    this.updateFlow(dt);

    for (const e of this.enemies) if (!e.dead) updateEnemy(this, e, dt);
    separate(this.enemies, dt);
    let j = 0;
    for (const e of this.enemies) {
      if (e.dead) { removeEnemyVisuals(this, e); continue; }
      this.enemies[j++] = e;
    }
    this.enemies.length = j;

    this.updateBullets(dt);
    this.updateGlobs(dt);
    this.updateGrenades(dt);
    this.updateTurrets(dt);
    this.updateOrbs(dt);
    this.updateCaches(dt);
    this.updateInteract(dt);
    this.updateBanking(dt);
    this.updateRewards(dt);
    this.trailT -= dt;
    if (this.trailT <= 0 && !this.player.dead) {
      this.trailT = 1.2;
      const p = this.player;
      if (this.trail.length < 500) this.trail.push([+p.x.toFixed(1), +p.z.toFixed(1)]);
      this.visited[zoneOf(p.x, p.z)] = true;
    }
    if (!this.over && this.phase !== 'deploy' && this.phase !== 'tutorial') this.director.update(dt);
    if (this.phase === 'wave' && !this.isInField()) this.director.tryIntercept();

    this.updateCamera(dt);
    this.updateVisuals(dt);
    this.fx.update(dt);
    const inF = this.isInField();
    sfx.update(dt, inF, this.fieldOn(), this.player.drainRate > 0 ? clamp(this.player.drainRate / (this.player.maxHp * 0.045), 0.2, 1) : 0);
    this.hud.update(this, dt);
  }

  // combo decay + pending level-ups
  updateRewards(dt) {
    const c = this.combo;
    if (c.t > 0) {
      c.t -= dt;
      if (c.t <= 0) {
        if (c.n >= 8) {
          const bonus = Math.floor(c.n / 2);
          this.run.credits += bonus;
          this.hud.comboEnd(c.n, bonus);
        } else this.hud.comboEnd(c.n, 0);
        c.n = 0; c.tier = 0;
      }
    }
    this.loot.ampT = Math.max(0, this.loot.ampT - dt);
    this.levelDelay -= dt;
    const canOffer = ['wave', 'lull', 'collect', 'extract', 'extracting'].includes(this.phase) && !this.over && !this.player.dead;
    if (this.pendingLevels > 0 && canOffer && this.levelDelay <= 0 && !this.ext.strike) {
      this.pendingLevels--;
      this.offerUpgrade();
    }
  }

  // =========================================================
  // PLAYER
  // =========================================================
  updatePlayer(dt) {
    const p = this.player, inp = this.input, b = this.beacon, M = this.mods;
    if (p.dead) return;
    const controllable = this.phase !== 'extracted';
    p.iframes = Math.max(0, p.iframes - dt);
    p.hurtT = Math.max(0, p.hurtT - dt);
    p.exitShieldT = Math.max(0, p.exitShieldT - dt);
    p.dashCd = Math.max(0, p.dashCd - dt);
    p.skillCd = Math.max(0, p.skillCd - dt);
    if (p.skillT > 0) p.skillT -= dt;
    const overdrive = this.op.skill.id === 'overdrive' && p.skillT > 0;
    const W = p.weapon;

    const inField = this.isInField();
    // ---- movement ----
    const mv = controllable ? inp.move() : { x: 0, y: 0 };
    const mx = mv.x * SQ2 - mv.y * SQ2;
    const mz = -mv.x * SQ2 - mv.y * SQ2;
    let speed = CFG.player.speed * this.op.speedMul * (overdrive ? 1.25 : 1) * (inField ? 1 : M.speedOutMul);
    if (p.firing && W.moveMul) speed *= W.moveMul;
    if (p.dashT > 0) {
      p.dashT -= dt;
      p.vx = p.dashDX * p.dashSpeed; p.vz = p.dashDZ * p.dashSpeed;
      this.fx.burst(p.x, 0.8, p.z, 1, this.op.color, { speed: 0.5, size: 0.28, life: 0.25, gravity: 0, up: 0.2 });
    } else {
      p.vx = damp(p.vx, mx * speed, CFG.player.accel, dt);
      p.vz = damp(p.vz, mz * speed, CFG.player.accel, dt);
    }
    const ox = p.x, oz = p.z;
    p.x += (p.vx + p.kx) * dt;
    p.z += (p.vz + p.kz) * dt;
    const kd = Math.exp(-9 * dt);
    p.kx *= kd; p.kz *= kd;
    this.world.resolve(p, p.r);
    const dxb = p.x - b.x, dzb = p.z - b.z, rr = p.r + CFG.beacon.radius;
    if (dxb * dxb + dzb * dzb < rr * rr) { const d = Math.hypot(dxb, dzb) || 0.01; p.x = b.x + dxb / d * rr; p.z = b.z + dzb / d * rr; }
    p.moved += Math.hypot(p.x - ox, p.z - oz);
    const moving = Math.hypot(p.vx, p.vz) > 0.5;
    if (moving) {
      const prevStep = Math.floor(p.walk / Math.PI);
      p.walk += dt * 12;
      if (Math.floor(p.walk / Math.PI) !== prevStep) this.fx.burst(p.x, 0.1, p.z, 2, 0x8a8090, { speed: 1, size: 0.12, life: 0.35, gravity: 2, up: 1 });
    }

    // ---- aim ----
    let target = null;
    if (!inp.touchMode) {
      const v = this.world.screenToGround(inp.mouse.x, inp.mouse.y, this._v);
      if (v) { p.aimX = v.x; p.aimZ = v.z; }
    } else {
      target = this.autoAim();
      if (target) { p.aimX = target.x; p.aimZ = target.z; }
      else if (Math.hypot(mx, mz) > 0.1) { p.aimX = p.x + mx * 5; p.aimZ = p.z + mz * 5; }
    }
    const ax = p.aimX - p.x, az = p.aimZ - p.z;
    if (Math.hypot(ax, az) > 0.3) p.face = angleLerp(p.face, yawOf(ax, az), Math.min(1, 28 * dt));

    if (!controllable) return;

    // ---- dash ----
    if ((inp.pressed('Space') || inp.pressed('ShiftLeft')) && p.dashCd <= 0) {
      let dx = mx, dz = mz;
      if (Math.hypot(dx, dz) < 0.1) { dx = Math.sin(p.face); dz = Math.cos(p.face); }
      const d = Math.hypot(dx, dz);
      p.dashDX = dx / d; p.dashDZ = dz / d;
      p.dashT = CFG.player.dashTime;
      p.dashSpeed = CFG.player.dashDist / CFG.player.dashTime;
      p.dashCd = CFG.player.dashCd * (this.opId === 'scout' ? 0.8 : 1);
      p.iframes = Math.max(p.iframes, CFG.player.dashIframes);
      p.dashed = true;
      this.fx.shockwave(p.x, p.z, 1.6, this.op.color, 0.25);
      sfx.dash();
    }
    if (inp.pressed('KeyQ') && p.skillCd <= 0) this.useSkill(mx, mz);
    if ((inp.pressed('MouseRight') || inp.pressed('KeyF')) && this.loot.grenades > 0) this.throwGrenade(target);
    if (inp.pressed('KeyR') && p.ammo < W.mag && p.reloadT <= 0) this.startReload();

    // ---- weapon ----
    if (p.reloadT > 0) {
      p.reloadT -= dt;
      if (p.reloadT <= 0) { p.ammo = W.mag; sfx.reload(); }
    }
    p.fireCd -= dt;
    p.recoil = Math.max(0, p.recoil - dt * 6);
    // touch: auto-fire whenever a target is in range
    const wantFire = inp.touchMode ? !!(target && dist(p.x, p.z, target.x, target.z) < W.range + 1) : inp.firing();
    p.firing = wantFire && p.reloadT <= 0;
    if (W.spinUp) p.spin = wantFire ? Math.min(1, p.spin + dt / W.spinUp) : Math.max(0, p.spin - dt * 1.5);
    if (wantFire && p.reloadT <= 0 && p.fireCd <= 0) {
      if (p.ammo <= 0) this.startReload();
      else this.fire(overdrive);
    }
  }

  autoAim() {
    const p = this.player;
    const R = p.weapon.range + 3;
    let best = null, bs = Infinity;
    for (const e of this.enemies) {
      if (e.dead || e.spawnT > 0) continue;
      const d = dist(p.x, p.z, e.x, e.z);
      if (d > R) continue;
      let score = d;
      if (e.type === 'disruptor' && e.state === 'charge') score -= 8;
      if (e.state === 'dormant') score += 6;
      if (score < bs) { bs = score; best = e; }
    }
    return best;
  }

  startReload() {
    const p = this.player;
    if (p.reloadT > 0) return;
    p.reloadT = p.weapon.reload;
    sfx.reload();
  }

  weaponDamage() {
    const W = this.player.weapon;
    const lvl = W.loot ? 1 : this.weaponLvlMul;
    return W.dmg * lvl * this.op.dmgMul * this.mods.dmgMul * (this.loot.ampT > 0 ? CFG.loot.amp.mul : 1);
  }

  fire(overdrive) {
    const p = this.player, W = p.weapon, M = this.mods;
    let rate = W.rate * M.rateMul * (overdrive ? 1.5 : 1);
    if (W.spinUp) rate *= 0.3 + 0.7 * p.spin;
    p.fireCd = 1 / rate;
    p.ammo--;
    p.recoil = 1;
    p.model.muzzle.getWorldPosition(this._v);
    let sx = this._v.x, sz = this._v.z;
    if (this.world.pointBlocked(sx, sz)) { sx = p.x; sz = p.z; }
    let base = Math.atan2(p.aimX - p.x, p.aimZ - p.z);
    const dmg = this.weaponDamage();
    const col = this.loot.ampT > 0 ? 0xff5a5a : W.color;

    if (W.mode === 'arc') {
      this.fireArc(sx, sz, base, dmg);
    } else {
      // light aim assist on desktop: bend the shot onto a target just off the crosshair
      if (!this.input.touchMode) base = this.assist(base, W.range);
      for (let i = 0; i < W.pellets; i++) {
        if (this.bullets.length >= MAX_BULLETS) break;
        const a = base + (Math.random() - 0.5) * 2 * W.spread;
        const dx = Math.sin(a), dz = Math.cos(a);
        const spd = W.speed * rand(0.94, 1.04);
        this.bullets.push({
          x: sx, z: sz, dx, dz, speed: spd, life: (W.range / spd) * rand(0.92, 1.04), dmg,
          pierce: M.pierce, rico: M.ricochet, hit: [], knock: W.knock, color: col,
        });
      }
    }
    this.world.muzzleLight.position.set(this._v.x, 1.2, this._v.z);
    this.world.muzzleLight.intensity = W.pellets > 1 ? 18 : 10;
    this.world.muzzleLight.color.setHex(col);
    this.fx.spray(this._v.x, 1.0, this._v.z, Math.sin(base), Math.cos(base), W.pellets > 1 ? 8 : 3, col, { speed: 9, size: 0.1, life: 0.1, cone: 0.35 });
    sfx.shoot(W.id);
    if (W.pellets > 1) this.world.addShake(0.14);
    else if (W.id === 'minigun') this.world.addShake(0.02);
    if (p.ammo <= 0) this.startReload();
  }

  assist(base, range) {
    const p = this.player;
    let best = null, bd = 0.13;
    for (const e of this.enemies) {
      if (e.dead || e.spawnT > 0 || e.state === 'dormant') continue;
      const d = dist(p.x, p.z, e.x, e.z);
      if (d > range) continue;
      let diff = Math.atan2(e.x - p.x, e.z - p.z) - base;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const tol = Math.max(0.06, Math.min(0.2, 1.1 / d)); // wider when close
      if (Math.abs(diff) < Math.min(bd, tol)) { bd = Math.abs(diff); best = diff; }
    }
    return best === null ? base : base + best;
  }

  fireArc(sx, sz, base, dmg) {
    const p = this.player, W = p.weapon;
    let first = null, bs = Infinity;
    for (const e of this.enemies) {
      if (e.dead || e.spawnT > 0) continue;
      const d = dist(p.x, p.z, e.x, e.z);
      if (d > W.range) continue;
      let diff = Math.atan2(e.x - p.x, e.z - p.z) - base;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const score = d + Math.abs(diff) * 14;
      if (Math.abs(diff) < 0.55 && score < bs) { bs = score; first = e; }
    }
    const pts = [{ x: sx, y: 1.0, z: sz }];
    if (!first) {
      pts.push({ x: sx + Math.sin(base) * 4, y: 0.9, z: sz + Math.cos(base) * 4 });
      this.fx.lightning(pts, W.color, 0.08);
      return;
    }
    const hit = [];
    let cur = first, d = dmg;
    for (let k = 0; k <= W.chain && cur; k++) {
      hit.push(cur.id);
      pts.push({ x: cur.x, y: 1.0, z: cur.z });
      const kx = (cur.x - p.x), kz = (cur.z - p.z), kd = Math.hypot(kx, kz) || 1;
      this.hitEnemy(cur, d, kx / kd * W.knock, kz / kd * W.knock, false);
      this.fx.burst(cur.x, 1, cur.z, 4, W.color, { speed: 4, size: 0.1, life: 0.25 });
      d *= 0.85;
      cur = this.nearestEnemy(cur.x, cur.z, W.chainRange, hit);
    }
    this.fx.lightning(pts, this.loot.ampT > 0 ? 0xff7a7a : W.color, 0.12);
  }

  useSkill(mx, mz) {
    const p = this.player, sk = this.op.skill;
    p.skillCd = sk.cd;
    if (sk.id === 'overdrive') {
      p.skillT = sk.dur;
      this.fx.shockwave(p.x, p.z, 3, 0xffb93a, 0.4);
      sfx.upgrade();
    } else if (sk.id === 'phase') {
      let dx = mx, dz = mz;
      if (Math.hypot(dx, dz) < 0.1) { dx = Math.sin(p.face); dz = Math.cos(p.face); }
      const d = Math.hypot(dx, dz);
      p.dashDX = dx / d; p.dashDZ = dz / d;
      p.dashT = 0.24;
      p.dashSpeed = 7.5 / 0.24;
      p.iframes = Math.max(p.iframes, sk.dur);
      p.skillT = sk.dur;
      this.fx.burst(p.x, 1, p.z, 18, 0x52e08a, { speed: 4, size: 0.2, life: 0.4, gravity: 0, up: 1 });
      sfx.dash();
    }
  }

  heal(amt) {
    const p = this.player;
    p.hp = Math.min(p.maxHp, p.hp + amt);
  }

  damagePlayer(amt, src, fromX = null, fromZ = null, kx = 0, kz = 0) {
    const p = this.player;
    if (p.dead || this.phase === 'extracted' || this.over) return;
    if (src !== 'environment') {
      if (p.iframes > 0) return;
      if (p.exitShieldT > 0) amt *= 0.4;
      p.kx += kx; p.kz += kz;
      p.hurtT = 0.25;
      sfx.hurt();
      this.world.addShake(0.12 + amt / 70);
      this.hud.hurt(fromX, fromZ);
      this.stats.dmgTaken += amt;
    }
    p.hp -= amt;
    this.stats.dmgBy[src] = (this.stats.dmgBy[src] || 0) + amt;
    this.director.onPlayerDamaged(amt, src);
    if (this.phase === 'tutorial') { p.hp = Math.max(p.hp, p.maxHp * 0.3); return; }
    if (p.hp <= 0) {
      if (this.mods.revive && !p.reviveUsed) {
        p.reviveUsed = true;
        p.hp = p.maxHp * 0.4;
        p.iframes = 1.6;
        this.fx.shockwave(p.x, p.z, 5, 0x5aff7a, 0.6);
        this.hud.announce('SECOND WIND', 'green');
        this.slowmo(0.6, 0.35);
        sfx.upgrade();
        return;
      }
      p.hp = 0;
      this.killPlayer(src);
    }
  }

  killPlayer(src) {
    const p = this.player;
    p.dead = true;
    p.model.group.visible = false;
    this.fx.burst(p.x, 1, p.z, 40, this.op.color, { speed: 8, size: 0.25, life: 1 });
    this.fx.burst(p.x, 1, p.z, 30, 0xff4a4a, { speed: 6, size: 0.2, life: 0.8 });
    this.world.addShake(0.8);
    this.slowmo(1.2, 0.3);
    sfx.explosion();
    const carried = p.carriedBio;
    this.comm(carried > 0 ? `Operative down · ${carried} carried sample${carried > 1 ? 's' : ''} lost` : 'Operative down', 'alert');
    this.failReason = src === 'environment' ? 'toxic' : 'death';
    this.phase = 'dead';
    this.phaseT = 0;
  }

  // =========================================================
  // LOOT: grenades, turrets, power-ups, weapons
  // =========================================================
  throwGrenade(target) {
    const p = this.player, G = CFG.loot.grenade;
    let tx = p.aimX, tz = p.aimZ;
    if (this.input.touchMode) {
      const t = target || this.autoAim();
      if (t) { tx = t.x; tz = t.z; } else { tx = p.x + Math.sin(p.face) * 8; tz = p.z + Math.cos(p.face) * 8; }
    }
    const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
    if (d > G.maxRange) { tx = p.x + dx / d * G.maxRange; tz = p.z + dz / d * G.maxRange; }
    this.loot.grenades--;
    this.stats.grenadesThrown++;
    const m = makeGrenade();
    m.position.set(p.x, 1.2, p.z);
    this.root.add(m);
    const ring = this.fx.circleTelegraph(tx, tz, G.radius, G.flight, 0xffa040);
    this.grenades.push({ sx: p.x, sz: p.z, tx, tz, t: 0, model: m, ring });
    sfx.dash();
  }

  updateGrenades(dt) {
    const G = CFG.loot.grenade;
    let j = 0;
    for (const g of this.grenades) {
      g.t += dt;
      const k = Math.min(1, g.t / G.flight);
      g.model.position.set(g.sx + (g.tx - g.sx) * k, 1.2 + Math.sin(k * Math.PI) * 3.2 - k * 1.0, g.sz + (g.tz - g.sz) * k);
      g.model.rotation.x += dt * 12;
      if (k >= 1) {
        this.root.remove(g.model);
        this.explode(g.tx, g.tz, G.radius, G.dmg * (this.loot.ampT > 0 ? 2 : 1), -1, true);
        this.fx.burst(g.tx, 0.5, g.tz, 30, 0xffa040, { speed: 9, size: 0.26, life: 0.7, up: 6 });
        this.fx.burst(g.tx, 0.5, g.tz, 20, 0x5a5050, { speed: 5, size: 0.3, life: 0.9, up: 4 });
        this.fx.shockwave(g.tx, g.tz, G.radius + 1, 0xffd06a, 0.45);
        this.fx.splat(g.tx, g.tz, 0x1a1418, 1.6);
        this.world.addShake(0.55);
        sfx.explosion();
        continue;
      }
      this.grenades[j++] = g;
    }
    this.grenades.length = j;
  }

  deployTurret(x, z) {
    const m = makeTurret();
    m.group.position.set(x, 0, z);
    m.group.scale.setScalar(0.01);
    this.root.add(m.group);
    this.turrets.push({ x, z, t: 0, cd: 0, model: m, face: 0 });
    this.fx.shockwave(x, z, 2.5, 0x5ef0ff, 0.4);
  }

  updateTurrets(dt) {
    const T = CFG.loot.turret;
    let j = 0;
    for (const tu of this.turrets) {
      tu.t += dt;
      tu.model.group.scale.setScalar(Math.min(1, tu.t * 4));
      if (tu.t > T.dur) {
        this.root.remove(tu.model.group);
        this.fx.burst(tu.x, 1, tu.z, 14, 0x5ef0ff, { speed: 4, size: 0.15, life: 0.5 });
        continue;
      }
      tu.cd -= dt;
      let best = null, bd = T.range;
      for (const e of this.enemies) {
        if (e.dead || e.spawnT > 0 || e.dummy) continue;
        const d = dist(tu.x, tu.z, e.x, e.z);
        if (d < bd) { bd = d; best = e; }
      }
      if (best) {
        const yaw = Math.atan2(best.x - tu.x, best.z - tu.z);
        tu.face = angleLerp(tu.face, yaw, Math.min(1, 14 * dt));
        if (tu.cd <= 0 && this.bullets.length < MAX_BULLETS) {
          tu.cd = 1 / T.rate;
          const a = tu.face + (Math.random() - 0.5) * 0.06;
          const sx = tu.x + Math.sin(a) * 0.7, sz = tu.z + Math.cos(a) * 0.7;
          this.bullets.push({ x: sx, z: sz, dx: Math.sin(a), dz: Math.cos(a), speed: 44, life: T.range / 44 + 0.05, dmg: T.dmg, pierce: 0, rico: 0, hit: [], knock: 0.3, color: 0x5ef0ff });
          this.fx.spray(sx, 0.9, sz, Math.sin(a), Math.cos(a), 2, 0x5ef0ff, { speed: 6, size: 0.08, life: 0.08 });
          sfx.hit();
        }
      }
      tu.model.head.rotation.y = tu.face;
      this.turrets[j++] = tu;
    }
    this.turrets.length = j;
  }

  rollLoot() {
    const cur = this.player.weapon.id;
    const opts = [];
    for (const w of ['arc', 'minigun', 'shotgun']) if (w !== cur) opts.push({ kind: 'weapon', id: w, w: this.lootCount === 0 ? 5 : 1.3 });
    opts.push({ kind: 'grenades', w: 1.3 });
    opts.push({ kind: 'turret', w: 1.0 });
    opts.push({ kind: 'amp', w: 0.9 });
    return weightedPick(opts, (o) => o.w);
  }

  // Apply a loot result with a big reveal
  grantLoot(L, x, z) {
    const p = this.player;
    this.lootCount++;
    let name = '', desc = '', icon = L.kind;
    if (L.kind === 'weapon') {
      const W = CFG.weapons[L.id];
      p.weapon = W; p.ammo = W.mag; p.reloadT = 0; p.spin = 0; p.fireCd = 0;
      name = W.name.toUpperCase();
      desc = { arc: 'Lightning that chains between enemies', minigun: 'Spins up into a bullet storm', shotgun: 'Shreds anything up close' }[L.id];
      icon = L.id;
      this.hud.weaponChanged(W);
    } else if (L.kind === 'grenades') {
      this.loot.grenades = Math.min(CFG.loot.grenade.max, this.loot.grenades + 3);
      name = '+3 GRENADES'; desc = this.input.touchMode ? 'Tap GRENADE to throw' : 'Right-click to throw';
    } else if (L.kind === 'turret') {
      this.deployTurret(x + 1.2, z + 1.2);
      name = 'SENTRY TURRET'; desc = `Auto-fires for ${CFG.loot.turret.dur}s`;
    } else if (L.kind === 'amp') {
      this.loot.ampT = CFG.loot.amp.dur;
      name = 'DAMAGE AMP'; desc = `Double damage for ${CFG.loot.amp.dur}s`;
    }
    this.stats.loot.push(name);
    this.hud.lootReveal(icon, name, desc);
    this.slowmo(0.45, 0.3);
    this.fx.shockwave(x, z, 4, 0xffb43a, 0.5);
    this.fx.burst(x, 1.5, z, 30, 0xffd06a, { speed: 6, size: 0.18, life: 0.8, up: 6 });
    sfx.success();
  }

  // =========================================================
  // XP + LEVEL UPS
  // =========================================================
  addXP(n) {
    this.xp += n;
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.level++;
      this.xpNext = CFG.xp.base + CFG.xp.step * (this.level - 1);
      this.pendingLevels++;
      this.levelDelay = 0.45;
      const p = this.player;
      this.hud.levelUp(this.level);
      this.fx.shockwave(p.x, p.z, 5, 0x5affc8, 0.6);
      this.fx.burst(p.x, 1.2, p.z, 24, 0x5affc8, { speed: 5, size: 0.16, life: 0.7, up: 5 });
      sfx.levelUp();
    }
  }

  // =========================================================
  // BEACON
  // =========================================================
  updateBeacon(dt) {
    const b = this.beacon, p = this.player, M = this.mods;
    const bm = b.model;
    if (!b.deployed) {
      b.deployT += dt;
      const k = clamp((b.deployT - 0.3) / 0.5, 0, 1);
      bm.group.position.y = 14 * (1 - k * k);
      if (k >= 1 && !b.landed) {
        b.landed = true;
        this.world.addShake(0.6);
        this.fx.shockwave(b.x, b.z, 7, 0x5ef0ff, 0.7);
        this.fx.burst(b.x, 0.3, b.z, 30, 0x9a9aa8, { speed: 8, size: 0.2, life: 0.7, up: 4 });
        sfx.slam();
      }
      if (b.deployT > 1.2) { b.deployed = true; sfx.fieldUp(); this.comm('Beacon online · field active', 'hq'); }
    }
    b.pulseCd = Math.max(0, b.pulseCd - dt);

    if (b.disruptT > 0) {
      b.disruptT -= dt;
      if (b.disruptT <= 0) { b.disruptT = 0; if (!b.destroyed) { sfx.fieldUp(); this.comm('Field restored', 'hq'); } }
    }
    if (b.destroyed && !this.over && this.phase !== 'dead' && this.phase !== 'extracted' && this.phase !== 'failing') {
      b.emergencyT -= dt;
      if (b.emergencyT <= 10 && Math.floor(b.emergencyT * 2) !== Math.floor((b.emergencyT + dt) * 2)) sfx.alarm();
      if (b.emergencyT <= 0) this.failMission('beacon');
    }
    if (M.autorepair && !b.destroyed && this.time - b.lastHitT > 3 && b.hp < b.maxHp) b.hp = Math.min(b.maxHp, b.hp + 4 * dt);

    const target = this.fieldOn() ? b.baseRadius * M.radiusMul : 0;
    const on = this.fieldOn();
    if (on && !b.wasOn && b.landed) this.fx.shockwave(b.x, b.z, target + 1, this.fieldColor.getHex(), 0.6);
    b.wasOn = on;
    b.radius = damp(b.radius, target, on ? 5 : 9, dt);
    if (!on && b.radius < 0.05) b.radius = 0;

    let st = 'active';
    if (b.destroyed) st = b.rebootT > 0 ? 'rebooting' : 'destroyed';
    else if (b.disruptT > 0) st = 'disrupted';
    else if (b.hp / b.maxHp < CFG.beacon.criticalPct) st = 'critical';
    else if (this.time - b.lastHitT < CFG.beacon.contestedWindow) st = 'contested';
    if (!b.deployed) st = 'deploying';
    b.state = st;

    // ---- player health vs field (the core mechanic) ----
    if (p.dead || this.phase === 'extracted') { p.drainRate = 0; return; }
    const F = CFG.field;
    const inField = this.isInField();
    const safePad = this.padSafe();
    if (inField || safePad || !b.deployed) {
      if (!p.wasIn) this.endExcursion();
      p.outsideT = 0;
      p.insideT += dt;
      p.drainRate = 0;
      if (inField && p.insideT > F.reentryGrace && p.hp < p.maxHp) this.heal(p.maxHp * F.regenPct * M.regenMul * this.metaRegenMul * dt);
      p.wasIn = true;
    } else {
      if (p.wasIn) {
        p.wasIn = false;
        p.exStart = this.time; p.exMax = 0;
        if (M.exitShield && this.fieldOn()) p.exitShieldT = 3;
      }
      p.insideT = 0;
      p.outsideT += dt;
      this.stats.timeOutside += dt;
      p.exMax = Math.max(p.exMax, dist(p.x, p.z, b.x, b.z));
      if (p.outsideT > F.exitGrace) {
        const t = p.outsideT - F.exitGrace;
        const pct = Math.min(F.drainMaxPct, F.drainPct + F.drainRamp * t) * M.drainMul;
        p.drainRate = p.maxHp * pct;
        this.damagePlayer(p.drainRate * dt, 'environment');
      } else p.drainRate = 0;
    }
  }

  endExcursion() {
    const p = this.player;
    const dur = this.time - p.exStart;
    if (dur > 2.5) {
      this.stats.excursions++;
      this.stats.longestExcursion = Math.max(this.stats.longestExcursion, dur);
    }
    this.director.onExcursion(dur, p.exMax);
  }

  damageBeacon(amt) {
    const b = this.beacon;
    if (b.destroyed || !b.deployed || this.phase === 'extracted' || this.over || this.phase === 'tutorial') return;
    b.hp -= amt;
    b.lastHitT = this.time;
    this.director.onBeaconDamaged(amt);
    this.fx.burst(b.x, 1.6, b.z, 6, 0xffc46b, { speed: 5, size: 0.12, life: 0.35 });
    if (this.time - this.lastBeaconWarn > 20) { this.lastBeaconWarn = this.time; this.comm('Beacon under attack!', 'alert'); }
    if (this.mods.pulse && b.pulseCd <= 0) {
      b.pulseCd = 8;
      for (const e of this.enemies) {
        const d = dist(e.x, e.z, b.x, b.z);
        if (d < 6.5 && !e.dead) {
          const k = 14 / e.cfg.mass;
          e.kx += (e.x - b.x) / (d || 1) * k; e.kz += (e.z - b.z) / (d || 1) * k;
          this.hitEnemy(e, 18, 0, 0, false);
        }
      }
      this.fx.shockwave(b.x, b.z, 6.5, 0x5ef0ff, 0.5);
      sfx.slam();
    }
    if (b.hp <= 0) this.destroyBeacon();
  }

  destroyBeacon() {
    const b = this.beacon;
    b.hp = 0;
    b.destroyed = true;
    b.rebootT = 0;
    b.emergencyT = CFG.beacon.emergencyTime;
    this.stats.beaconDestroyed++;
    this.world.addShake(1);
    this.slowmo(0.6, 0.35);
    this.fx.burst(b.x, 2, b.z, 50, 0x5ef0ff, { speed: 9, size: 0.25, life: 0.9 });
    this.fx.burst(b.x, 1, b.z, 40, 0xff8a3a, { speed: 7, size: 0.3, life: 1 });
    this.fx.shockwave(b.x, b.z, 10, 0xff5a3a, 0.8);
    sfx.explosion(); sfx.fieldDown();
    for (const e of this.enemies) if (e.target === 'beacon') e.target = 'player';
    if (b.kits > 0) this.comm('Beacon destroyed · hold E at it to reboot', 'alert');
    else { this.spawnGenerator(); this.comm('Beacon destroyed · reach the backup generator', 'alert'); }
  }

  spawnGenerator() {
    const b = this.beacon, p = this.player;
    let best = null, bd = -1;
    for (const s of BONUS_SPOTS) {
      const db = dist(s.x, s.z, b.x, b.z);
      if (db < 12 || db > 24) continue;
      const dp = dist(s.x, s.z, p.x, p.z);
      if (dp > bd) { bd = dp; best = s; }
    }
    best = best || { x: 18, z: -2 };
    const gm = makeGenerator();
    gm.group.position.set(best.x, 0, best.z);
    this.root.add(gm.group);
    this.generator = { x: best.x, z: best.z, model: gm, holdT: 0 };
    this.spawnAmbush(best.x, best.z, 4);
  }

  rebootBeacon(remote) {
    const b = this.beacon;
    b.destroyed = false;
    b.hp = b.maxHp * CFG.beacon.rebootHpPct;
    b.disruptT = 0;
    b.rebootT = 0;
    b.lastHitT = this.time;
    if (!remote) b.kits--;
    this.fx.shockwave(b.x, b.z, 9, 0x5ef0ff, 0.8);
    this.fx.burst(b.x, 2.5, b.z, 30, 0x5ef0ff, { speed: 6, size: 0.2, life: 0.7 });
    sfx.fieldUp(); sfx.upgrade();
    this.hud.announce('BEACON ONLINE', 'cyan');
    if (this.generator && remote) { this.root.remove(this.generator.model.group); this.generator = null; }
  }

  empHit() {
    const b = this.beacon;
    b.disruptT = CFG.beacon.disruptTime;
    this.stats.empLanded++;
    this.fx.shockwave(b.x, b.z, 14, 0xc86bff, 0.9, 1.2);
    this.fx.shockwave(b.x, b.z, 10, 0xc86bff, 0.6);
    this.fx.burst(b.x, 2.6, b.z, 30, 0xc86bff, { speed: 8, size: 0.18, life: 0.7 });
    this.world.addShake(0.6);
    sfx.emp(); sfx.fieldDown();
    this.comm(`EMP hit · field down ${CFG.beacon.disruptTime}s`, 'alert');
  }

  onDisruptorCharge() {
    this.hint('disruptor', 'Kill the purple Disruptor before its beam completes!', 'alert');
    sfx.alarm();
  }

  // =========================================================
  // MISSION FLOW
  // =========================================================
  updateFlow(dt) {
    switch (this.phase) {
      case 'deploy':
        if (this.phaseT > 2.2) {
          if (this.tutorialMode) this.startTutorial();
          else this.startWave(0);
        }
        break;
      case 'tutorial':
        this.updateTutorial(dt);
        break;
      case 'wave': {
        if (this.director.spawnAllowed()) this.waveT += dt;
        this.runGroups(this.groups, this.waveT, false);
        const allSpawned = this.groups.every((g) => g.spawned >= g.total);
        if (allSpawned) {
          this.straggleT = (this.straggleT || 0) + dt;
          // stragglers: after a while, the last few enemies come to the player so a wave can never stall
          if (this.straggleT > 20) for (const e of this.enemies) if (e.wave && !e.dead && !e.hunt) { e.hunt = true; e.target = 'player'; }
        } else this.straggleT = 0;
        if (allSpawned && !this.enemies.some((e) => e.wave && !e.dead)) { this.straggleT = 0; this.waveCleared(); }
        break;
      }
      case 'lull': {
        this.lullT -= dt;
        if (this.input.pressed('KeyG') && this.lullT > 2) this.lullT = 2;
        if (this.lullT <= 0) this.startWave(this.waveIdx + 1);
        break;
      }
      case 'collect':
        this.collectT -= dt;
        if (this.collectT <= 0) {
          this.collectT = 9;
          const lanes = ['W', 'N', 'E', 'S'];
          const lane = lanes[Math.floor(Math.random() * 4)];
          const n = Math.round(3 * this.director.countMul());
          this.groups.push({ t: this.waveT, type: 'rusher', n, total: n, lane, every: 0.6, spawned: 0, nextT: this.waveT + 2.6, warned: false, beaconBias: 0.2 });
        }
        this.waveT += dt;
        this.runGroups(this.groups, this.waveT, false);
        this.ensureSamples();
        if (this.beacon.bankedBio >= CFG.quota) this.openExtraction();
        break;
      case 'extract':
        this.updateExtractReady(dt);
        break;
      case 'extracting':
        this.updateExtracting(dt);
        break;
      case 'extracted':
        this.updateExtracted(dt);
        break;
      case 'dead':
        if (this.phaseT > 2.2 && !this.over) this.finish(false, this.failReason || 'death');
        break;
      case 'failing':
        if (this.phaseT > 1.8 && !this.over) this.finish(false, 'beacon');
        break;
    }
  }

  // ---------------- tutorial ----------------
  startTutorial() {
    this.phase = 'tutorial';
    this.phaseT = 0;
    this.tstep = -1;
    this.nextTutorialStep();
  }

  nextTutorialStep() {
    this.tstep++;
    this.tstepT = 0;
    this.tdone = false;
    const p = this.player;
    if (this.tstep >= TUTORIAL.length) { this.endTutorial(false); return; }
    const S = TUTORIAL[this.tstep];
    p.moved = 0; p.dashed = false;
    this.tthrown = this.stats.grenadesThrown;
    if (S.id === 'shoot') {
      this.dummies = [[5.5, -4], [6.5, 0.6], [2, -6.6]].map(([x, z]) => this.spawnEnemy('rusher', x, z, { dummy: true, wave: false }));
    } else if (S.id === 'grenade') {
      this.loot.grenades = Math.max(this.loot.grenades, 2);
      this.dummies = [[-5, 4.6], [-6.2, 3.6], [-4, 5.8], [-5.8, 5.6]].map(([x, z]) => this.spawnEnemy('rusher', x, z, { dummy: true, wave: false }));
    }
    this.hud.tutorialCard({ step: S, index: this.tstep, total: TUTORIAL.length, touch: this.input.touchMode });
  }

  updateTutorial(dt) {
    const p = this.player;
    this.tstepT += dt;
    if (this.input.pressed('Enter') || this.hud.consumeSkip()) { this.endTutorial(true); return; }
    if (this.tdone) {
      if (this.tstepT > 0.9) this.nextTutorialStep();
      return;
    }
    const S = TUTORIAL[this.tstep];
    let done = false;
    if (S.id === 'move') done = p.moved > 5;
    else if (S.id === 'shoot') done = this.dummies.every((e) => e.dead);
    else if (S.id === 'dash') done = p.dashed;
    else if (S.id === 'grenade') {
      const thrown = this.stats.grenadesThrown > this.tthrown;
      if (thrown && this.tthrowT === undefined) this.tthrowT = this.tstepT;
      done = thrown && (this.dummies.every((e) => e.dead) || this.tstepT - this.tthrowT > 1.6);
      if (done) { this.tthrowT = undefined; for (const e of this.dummies) if (!e.dead) this.killEnemy(e); }
    } else if (S.id === 'out') done = p.outsideT > 1.8;
    else if (S.id === 'in') done = this.isInField() && p.insideT > 0.8;
    if (done) {
      this.tdone = true;
      this.tstepT = 0;
      this.hud.tutorialDone();
      sfx.bank();
    }
  }

  endTutorial(skipped) {
    for (const e of this.enemies) if (e.dummy && !e.dead) { e.dead = true; }
    this.meta.data.tutorialDone = true;
    this.meta.save();
    this.tutorialMode = false;
    this.hud.tutorialCard(null);
    this.player.hp = this.player.maxHp;
    this.loot.grenades = Math.max(this.loot.grenades, 2);
    if (!skipped) this.hud.announce('TRAINING COMPLETE', 'cyan');
    this.phase = 'deploy';
    this.phaseT = 1.0; // short beat, then wave 1
  }

  startWave(i) {
    this.waveIdx = i;
    this.phase = 'wave';
    this.phaseT = 0;
    this.waveT = 0;
    const W = WAVES[i];
    const d = this.director;
    const all = [...W.groups, ...d.waveExtras(i)];
    const biasAdd = d.beaconBiasAdd();
    this.groups = all
      .filter((g) => !g.minDiff || d.diff >= g.minDiff)
      .map((g) => ({
        ...g, spawned: 0, nextT: g.t, warned: false,
        total: g.fixed ? g.n : Math.max(1, Math.round(g.n * d.countMul())),
        beaconBias: g.beaconBias !== undefined ? Math.min(1, g.beaconBias + (g.siege ? 0 : biasAdd)) : biasAdd,
      }));
    this.hud.banner(`WAVE ${i + 1}`, W.name);
    sfx.waveStart();
    if (i === 0) {
      this.director.intro();
      if (ZONES.some((Z) => !this.meta.data.codex.zones[Z.id])) this.hint('nodes', 'Survey nodes hide in each zone · they hold new specimens', 'tip');
    }
    if (i === 3) this.comm('Disruptor incoming · it targets your field', 'hq');
    if (i === 4) this.comm('Elite specimen incoming!', 'alert');
  }

  runGroups(groups, clock, extraction) {
    const alive = this.enemies.length;
    for (const g of groups) {
      if (g.spawned >= g.total) continue;
      const lane = LANES[g.lane];
      if (!g.warned && clock >= g.t - 2.5) {
        g.warned = true;
        const tx = extraction ? CFG.extraction.x : 0, tz = extraction ? CFG.extraction.z : 0;
        const ex = lane.x * 0.92, ez = lane.z * 0.92;
        this.fx.laneWarning(ex, ez, tx, tz, 3.2);
        this.hud.laneWarn(ex, ez);
      }
      if (clock >= g.nextT) {
        if (alive >= 70) { g.nextT = clock + 0.5; continue; }
        const lx = lane.x, lz = lane.z;
        const len = Math.hypot(lx, lz) || 1;
        const px = -lz / len, pz = lx / len;
        const off = rand(-5, 5);
        const e = this.spawnEnemy(g.type, lx + px * off, lz + pz * off, { beaconBias: extraction ? 0 : (g.beaconBias || 0) });
        if (extraction) e.target = 'player';
        g.spawned++;
        g.nextT = clock + (g.every || 0.3);
      }
    }
  }

  spawnEnemy(type, x, z, opts = {}) {
    const e = createEnemy(this, type, x, z, { hpMul: opts.dummy ? 1 : this.director.hpMul(), wave: opts.wave !== false, ...opts });
    const tmp = { x: e.x, z: e.z };
    this.world.resolve(tmp, e.r);
    e.x = tmp.x; e.z = tmp.z;
    e.model.group.position.set(e.x, 0, e.z);
    this.enemies.push(e);
    if (type === 'elite') { this.world.addShake(0.5); sfx.alarm(); }
    return e;
  }

  spawnAmbush(x, z, n) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand(-0.3, 0.3);
      const ex = x + Math.cos(a) * 2.6, ez = z + Math.sin(a) * 2.6;
      this.fx.burst(ex, 0.3, ez, 10, 0x8a4aff, { speed: 4, size: 0.18, life: 0.5, up: 4 });
      const e = this.spawnEnemy('rusher', ex, ez, {});
      e.target = 'player';
    }
    sfx.alarm();
  }

  waveCleared() {
    const i = this.waveIdx;
    this.director.onWaveCleared(i, this.phaseT);
    for (const o of this.orbs) if (o.kind !== 'health') { o.fly = true; o.t = Math.max(o.t, 0.4); } // vacuum loot
    const bonus = 15 + i * 10;
    this.run.credits += bonus;
    this.addXP(3 + i * 2);
    this.hud.banner('WAVE CLEARED', `+${bonus} credits`, 1.8);
    sfx.success();
    this.groups = [];
    if (i < WAVES.length - 1) this.startLull(WAVES[i].lull);
    else this.finalPhase();
  }

  offerUpgrade() {
    if (this.over) return;
    const cards = this.director.pickUpgrades(this.taken);
    this.paused = true;
    this.app.showUpgrade(cards, (id) => {
      this.applyUpgrade(id);
      this.paused = false;
      this.levelDelay = 0.6;
    }, this.level);
  }

  applyUpgrade(id) {
    const M = this.mods, b = this.beacon;
    this.taken[id] = (this.taken[id] || 0) + 1;
    this.stats.upgrades.push(id);
    switch (id) {
      case 'dmg': M.dmgMul *= 1.2; break;
      case 'rate': M.rateMul *= 1.25; break;
      case 'pierce': M.pierce += 1; break;
      case 'ricochet': M.ricochet += 1; break;
      case 'volatile': M.volatile = true; M.critChance += 0.1; break;
      case 'radius': M.radiusMul *= 1.18; break;
      case 'regen': M.regenMul *= 1.6; break;
      case 'core': b.maxHp = Math.round(b.maxHp * 1.4); if (!b.destroyed) b.hp = b.maxHp; break;
      case 'pulse': M.pulse = true; break;
      case 'autorepair': M.autorepair = true; break;
      case 'exitshield': M.exitShield = true; break;
      case 'runner': M.speedOutMul *= 1.22; break;
      case 'sealant': M.drainMul *= 0.65; break;
      case 'samplemed': M.sampleHeal = 12; break;
      case 'pockets': M.carryBonus += 2; M.pickupMul *= 1.5; break;
      case 'scanner': this.spawnLureCache('scanner'); break;
      case 'revive': M.revive = true; break;
      case 'grenades': this.loot.grenades = Math.min(CFG.loot.grenade.max, this.loot.grenades + 3); break;
      case 'rations': this.heal(40); break;
    }
    sfx.upgrade();
    this.fx.shockwave(this.player.x, this.player.z, 4, 0xffffff, 0.5);
  }

  startLull(L) {
    this.phase = 'lull';
    this.phaseT = 0;
    this.lullT = this.director.lullDuration(L.dur);
    const spawned = L.caches.map((id) => this.spawnCache(CACHES[id], id));
    this.director.onLullStart();
    if (spawned.some((c) => c.crate)) this.comm('Supply crate spotted · loot inside!', 'loot');
    else this.comm(L.tutorial ? 'Bio Sample spotted outside the field' : 'New Bio Samples spotted', 'hq');
  }

  finalPhase() {
    if (this.beacon.bankedBio >= CFG.quota) this.openExtraction();
    else {
      this.phase = 'collect';
      this.phaseT = 0;
      this.collectT = 4;
      this.groups = [];
      this.waveT = 0;
      this.ensureSamples();
    }
  }

  ensureSamples() {
    const b = this.beacon, p = this.player;
    let avail = b.bankedBio + p.carriedBio;
    for (const c of this.caches) if (!c.collected) avail += c.bio;
    if (avail < CFG.quota) this.spawnBonusCache(CFG.quota - avail + 1);
  }

  openExtraction() {
    this.phase = 'extract';
    this.phaseT = 0;
    this.ext.state = 'ready';
    this.hud.banner('EXTRACTION', 'Get to the landing pad', 2.5);
    sfx.success();
  }

  updateExtractReady(dt) {
    const E = this.ext;
    if (this.onPad() && !this.player.dead) {
      E.holdT += dt;
      if (E.holdT >= CFG.extraction.activateHold) this.startExtraction();
    } else E.holdT = Math.max(0, E.holdT - dt * 2);
  }

  startExtraction() {
    const E = this.ext;
    this.phase = 'extracting';
    this.phaseT = 0;
    E.state = 'active';
    E.countdown = CFG.extraction.countdown;
    E.t = 0;
    const d = this.director;
    E.groups = EXTRACTION_GROUPS.map((g) => ({ ...g, spawned: 0, nextT: g.t, warned: false, total: g.fixed ? g.n : Math.max(1, Math.round(g.n * d.countMul())) }));
    this.hud.banner('HOLD THE PAD', `Dropship in ${CFG.extraction.countdown}s`, 2);
    sfx.alarm();
  }

  updateExtracting(dt) {
    const E = this.ext, b = this.beacon;
    E.t += dt;
    if (!E.strike) this.runGroups(E.groups, E.t, true);
    const on = this.onPad() && !this.player.dead;
    if (on && !b.destroyed) E.countdown -= dt;
    E.paused = !on || b.destroyed;
    if (E.countdown <= 7 && !E.ship) {
      E.ship = makeDropship();
      E.ship.position.set(CFG.extraction.x - 8, 18, CFG.extraction.z - 8);
      E.ship.rotation.y = Math.PI / 4;
      this.root.add(E.ship);
      E.shipT = 0;
      sfx.engine();
    }
    if (E.ship) {
      E.shipT += dt;
      const k = clamp(E.shipT / 5.5, 0, 1);
      const ease = 1 - (1 - k) * (1 - k);
      E.ship.position.set(CFG.extraction.x - 8 * (1 - ease), 18 - 14.5 * ease, CFG.extraction.z - 8 * (1 - ease));
      if (Math.random() < 0.5) this.fx.burst(E.ship.position.x, E.ship.position.y - 0.8, E.ship.position.z, 2, 0x5ef0ff, { speed: 2, size: 0.25, life: 0.4, gravity: 5, up: -3 });
    }
    // AIR STRIKE: the gunship wipes out everything before you leave
    if (!E.strike && E.countdown <= CFG.extraction.strikeAt && E.ship) this.startAirStrike();
    if (E.strike) this.updateAirStrike(dt);
    if (E.countdown <= 0 && (!E.strike || E.strike.done)) {
      this.phase = 'extracted';
      this.phaseT = 0;
      E.state = 'done';
      this.player.iframes = 99;
      this.hud.banner('EXTRACTED', 'Payload secured', 2.5);
      sfx.success();
      this.world.addShake(0.4);
    }
  }

  startAirStrike() {
    const E = this.ext;
    const list = this.enemies.filter((e) => !e.dead).sort((a, c) => dist(a.x, a.z, CFG.extraction.x, CFG.extraction.z) - dist(c.x, c.z, CFG.extraction.x, CFG.extraction.z));
    E.strike = { list, i: 0, t: 0, done: list.length === 0 };
    for (const o of this.orbs) { o.fly = true; o.t = Math.max(o.t, 0.4); } // everything left on the ground comes home with you
    for (const g of E.groups) g.spawned = g.total; // no more spawns
    this.hud.announce('AIR STRIKE', 'orange');
    this.slowmo(1.6, 0.45);
    sfx.alarm();
  }

  updateAirStrike(dt) {
    const S = this.ext.strike, ship = this.ext.ship;
    if (S.done) return;
    S.t -= dt;
    while (S.t <= 0 && S.i < S.list.length) {
      const e = S.list[S.i++];
      S.t += Math.max(0.02, 1.2 / Math.max(1, S.list.length));
      if (e.dead) continue;
      this.fx.lightning([{ x: ship.position.x, y: ship.position.y - 0.6, z: ship.position.z }, { x: e.x, y: 0.8, z: e.z }], 0xffa040, 0.15);
      this.fx.burst(e.x, 0.8, e.z, 16, 0xffa040, { speed: 7, size: 0.22, life: 0.6, up: 5 });
      this.fx.shockwave(e.x, e.z, 2.5, 0xffa040, 0.35);
      this.killEnemy(e, true);
      this.world.addShake(0.12);
      sfx.kill(true);
    }
    // anything that spawned late also goes
    if (S.i >= S.list.length) {
      const rest = this.enemies.filter((e) => !e.dead);
      if (rest.length) { S.list.push(...rest); }
      else S.done = true;
    }
  }

  updateExtracted(dt) {
    const E = this.ext, p = this.player;
    E.liftT += dt;
    const k = clamp(E.liftT / 1.2, 0, 1);
    p.model.group.position.y = k * 3.5;
    if (E.liftT > 1.2) p.model.group.visible = false;
    if (E.ship && E.liftT > 1.3) {
      const t = E.liftT - 1.3;
      E.ship.position.y += t * t * 6 * dt * 10;
      E.ship.position.x += t * 8 * dt;
      E.ship.position.z -= t * 8 * dt;
    }
    if (E.liftT > 3.2 && !this.over) this.finish(true, 'extracted');
  }

  failMission() {
    if (this.over || this.phase === 'failing') return;
    this.phase = 'failing';
    this.phaseT = 0;
    this.comm('Protection lost · mission failed', 'alert');
    sfx.fail();
  }

  finish(success, reason) {
    this.over = true;
    this.phase = success ? 'done' : 'failed';
    this.hud.tutorialCard(null);
    const p = this.player, b = this.beacon;
    if (success) for (const o of this.orbs) if (o.kind === 'xp') this.run.credits += o.value; else if (o.kind === 'tech') this.run.tech += o.value;
    let bio, mut, lost, credits, tech;
    let bonus = 0;
    if (success) {
      bio = b.bankedBio + p.carriedBio;
      mut = b.bankedMut + p.carriedMut;
      lost = 0;
      bonus = 120 + bio * 10;
      credits = this.run.credits + bonus;
      tech = this.run.tech;
    } else if (reason === 'beacon') {
      bio = Math.floor(b.bankedBio * 0.5);
      mut = Math.floor(b.bankedMut * 0.5);
      lost = p.carriedBio + (b.bankedBio - bio);
      credits = Math.floor(this.run.credits * 0.5);
      tech = Math.floor(this.run.tech * 0.5);
    } else {
      bio = b.bankedBio;
      mut = b.bankedMut;
      lost = p.carriedBio;
      credits = Math.floor(this.run.credits * 0.5);
      tech = Math.floor(this.run.tech * 0.5);
    }
    const result = {
      success, reason, time: this.time, operative: this.opId,
      bioDelivered: bio, banked: bio, mutagen: mut, lost, collected: this.stats.bioPicked,
      credits, tech, bonus, kills: this.stats.kills, level: this.level, bestCombo: this.stats.bestCombo, loot: this.stats.loot.slice(),
      beaconPct: b.destroyed ? 0 : b.hp / b.maxHp,
      empInterrupts: this.stats.empInterrupts, empLanded: this.stats.empLanded,
      rareCaches: this.stats.rareCaches, timeOutside: this.stats.timeOutside,
      excursions: this.stats.excursions, upgrades: this.stats.upgrades.slice(),
      wave: this.waveIdx + 1,
      specimens: { ...this.stats.specimens }, nodes: this.nodesFound.slice(),
      trail: this.trail.slice(), visited: { ...this.visited },
      death: p.dead ? [p.x, p.z] : null,
      points: this.caches.filter((c) => c.id !== 'specimen' || c.collected).map((c) => ({
        x: c.x, z: c.z, done: c.collected,
        kind: c.node ? 'node' : c.crate ? 'crate' : c.specimen ? 'specimen' : 'bio',
        color: c.node ? SPEC[ZONE_SPEC[c.node]].color : null,
      })),
      director: {
        profile: this.director.styleName(), style: { ...this.director.style },
        diff: this.director.diff, log: this.director.log.slice(), history: this.director.history.slice(),
      },
    };
    this.meta.data.director = this.director.persist(success);
    const metaOut = this.meta.applyMission(result);
    this.input.reset();
    this.app.missionOver(result, metaOut);
  }

  // =========================================================
  // CACHES, ORBS, BANKING, INTERACTION
  // =========================================================
  spawnCache(def, id) {
    const crate = !!def.crate;
    const node = def.node || null;
    const m = node ? makeSurveyNode(SPEC[ZONE_SPEC[node]].color) : crate ? makeLootCrate() : makeCache(!!def.specimen);
    m.group.position.set(def.x, 0, def.z);
    this.root.add(m.group);
    const c = {
      id, x: def.x, z: def.z, crate, node, bio: node ? 0 : crate ? 1 : (def.bio || 1), mutagen: node ? 0 : crate ? 1 : (def.mutagen || 0),
      model: m, collected: false, t: Math.random() * 6, specimen: !!def.specimen,
    };
    this.caches.push(c);
    if (!node) this.fx.shockwave(def.x, def.z, 3, crate ? 0xffb43a : def.specimen ? 0xc85cff : 0x6dff5a, 0.6);
    if (def.guards) {
      for (let i = 0; i < def.guards; i++) {
        const a = (i / def.guards) * Math.PI * 2 + 0.4;
        const type = i === 0 && def.guards >= 3 ? 'spitter' : 'rusher';
        const e = this.spawnEnemy(type, def.x + Math.cos(a) * 3, def.z + Math.sin(a) * 3, { dormant: true, wave: false });
        e.target = 'player';
      }
    }
    return c;
  }

  freeSpot(minB = 12, maxB = 21) {
    const b = this.beacon, p = this.player;
    const cands = BONUS_SPOTS.map((s, i) => ({ s, i }))
      .filter(({ s, i }) => !this.usedSpots.has(i) && dist(s.x, s.z, b.x, b.z) >= minB && dist(s.x, s.z, b.x, b.z) <= maxB)
      .filter(({ s }) => !this.caches.some((c) => !c.collected && dist(c.x, c.z, s.x, s.z) < 4));
    if (!cands.length) return null;
    // prefer spots in front of the player (on screen) so they get noticed
    cands.sort((a, c) => dist(a.s.x, a.s.z, p.x, p.z) - dist(c.s.x, c.s.z, p.x, p.z));
    const pick = cands[Math.min(cands.length - 1, Math.floor(Math.random() * 2))];
    this.usedSpots.add(pick.i);
    return pick.s;
  }

  spawnLureCache(src = 'lure') {
    const s = this.freeSpot(12, 21);
    if (!s) return;
    this.spawnCache({ x: s.x, z: s.z, crate: true, guards: 2 }, src);
    this.comm(src === 'scanner' ? 'Scanner found a supply crate!' : 'Supply crate surfaced outside!', 'loot');
  }

  spawnBonusCache(bio) {
    const s = this.freeSpot(11, 20) || { x: rand(-10, 10), z: rand(11, 14) };
    this.spawnCache({ x: s.x, z: s.z, bio: Math.max(1, bio) }, 'bonus');
    this.comm('More Bio Samples spotted', 'hq');
  }

  updateCaches(dt) {
    const p = this.player;
    for (const c of this.caches) {
      if (c.collected) continue;
      c.t += dt;
      const m = c.model;
      m.can.rotation.y += dt * (c.crate ? 2 : 1);
      if (c.crate) m.can.position.y = 1.7 + Math.sin(c.t * 3) * 0.12;
      m.beamMat.opacity = (c.crate ? 0.3 : 0.18) + Math.sin(c.t * 3) * 0.06;
      m.ring.scale.setScalar(1 + Math.sin(c.t * 4) * 0.08);
      if (p.dead) continue;
      const pickR = 1.2 + CFG.player.pickupRadius * 0.5 * this.op.pickupMul * this.mods.pickupMul;
      if (dist(p.x, p.z, c.x, c.z) < pickR) this.collectCache(c);
    }
  }

  collectCache(c) {
    const p = this.player;
    if (c.node) {
      this.finishCache(c);
      this.nodesFound.push(c.node);
      this.fx.shockwave(c.x, c.z, 4, 0x5affc8, 0.5);
      this.run.credits += 20;
      this.addXP(5);
      this.collectSpecimen(ZONE_SPEC[c.node], c.x, c.z);
      return true;
    }
    if (c.crate && !c.opened) {
      c.opened = true;
      this.stats.rareCaches++;
      this.grantLoot(this.rollLoot(), c.x, c.z);
    }
    const room = this.carryCap() - p.carriedBio;
    if (room <= 0 && c.bio > 0) {
      if (c.crate) { this.finishCache(c); return true; } // loot taken, sample left behind is not worth a soft-lock
      if (this.time > p.fullWarnT) {
        p.fullWarnT = this.time + 3;
        this.comm('Carry full · bank at the beacon', 'alert');
        sfx.denied();
      }
      return false;
    }
    const take = Math.min(room, c.bio);
    c.bio -= take;
    p.carriedBio += take;
    p.carriedMut += c.mutagen;
    c.mutagen = 0;
    this.stats.bioPicked += take;
    if (this.mods.sampleHeal) this.heal(this.mods.sampleHeal * take);
    if (take > 0) {
      this.fx.burst(c.x, 1, c.z, 18, c.crate ? 0xffb43a : c.specimen ? 0xc85cff : 0x6dff5a, { speed: 5, size: 0.16, life: 0.6 });
      this.world.toScreen(c.x, 1, c.z, this._sp || (this._sp = { x: 0, y: 0 }));
      this.hud.flySample(this._sp.x, this._sp.y, take);
      sfx.sample();
      this.hint('carry', 'Carrying samples · bank them at the beacon', 'tip');
    }
    if (c.bio <= 0) this.finishCache(c);
    return true;
  }

  // A specimen scan uploads to the codex immediately. First-ever finds get a reveal.
  collectSpecimen(type, x, z) {
    const S = SPEC[type];
    this.stats.specimens[type] = (this.stats.specimens[type] || 0) + 1;
    if (!this.known.has(type)) {
      this.known.add(type);
      this.hud.lootReveal(specIcon(S.color), S.name.toUpperCase(), S.lore, 'NEW SPECIMEN');
      this.slowmo(0.4, 0.35);
      this.fx.burst(x, 1.4, z, 26, parseInt(S.color.slice(1), 16), { speed: 6, size: 0.18, life: 0.8, up: 6 });
      sfx.success();
    } else {
      this.fx.text(x, 2.4, z, `+1 ${S.name}`, 'ft-loot', 1.2);
      sfx.sample();
    }
  }

  finishCache(c) {
    c.collected = true;
    this.root.remove(c.model.group);
  }

  updateBanking(dt) {
    const p = this.player, b = this.beacon;
    if (p.dead || b.destroyed || !b.deployed) return;
    if (p.carriedBio + p.carriedMut <= 0) { b.bankT = 0; return; }
    const R = Math.max(b.radius, 3.5);
    if (dist(p.x, p.z, b.x, b.z) > R) { b.bankT = 0; return; }
    b.bankT -= dt;
    if (b.bankT > 0) return;
    b.bankT = 0.2;
    const wasBio = p.carriedBio > 0;
    if (wasBio) { p.carriedBio--; b.bankedBio++; } else { p.carriedMut--; b.bankedMut++; }
    for (let i = 0; i < 6; i++) {
      const k = i / 6;
      this.fx.burst(p.x + (b.x - p.x) * k, 1.2 + k * 1.4, p.z + (b.z - p.z) * k, 1, 0x6dff5a, { speed: 0.6, size: 0.2, life: 0.4, gravity: 0, up: 0 });
    }
    this.fx.shockwave(b.x, b.z, 3, 0x6dff5a, 0.4, 2.6);
    sfx.bank();
    if (wasBio) {
      this.hud.banked(b.bankedBio);
      this.addXP(2);
      if (b.bankedBio === CFG.quota) this.hud.announce('QUOTA MET', 'green');
    }
  }

  updateInteract(dt) {
    const p = this.player, b = this.beacon, inp = this.input;
    let ctx = null;
    if (!p.dead && !this.over && this.phase !== 'extracted') {
      const dB = dist(p.x, p.z, b.x, b.z);
      if (b.destroyed && b.kits > 0 && dB < CFG.beacon.radius + CFG.player.interactRadius) {
        ctx = { kind: 'reboot', text: 'REBOOT BEACON', hold: CFG.beacon.rebootHold };
      } else if (this.generator && dist(p.x, p.z, this.generator.x, this.generator.z) < CFG.player.interactRadius + 0.8) {
        ctx = { kind: 'generator', text: 'START GENERATOR', hold: 3 };
      } else if (!b.destroyed && b.deployed && b.hp < b.maxHp * 0.85 && dB < CFG.beacon.radius + CFG.player.interactRadius) {
        const noTech = this.run.tech <= 0 && b.repairCredit <= 0;
        ctx = { kind: 'repair', text: noTech ? 'REPAIR · NEEDS TECH' : 'REPAIR BEACON', hold: 0, noTech };
      }
    }
    const prev = this.interact;
    if (!ctx || !prev || prev.kind !== ctx.kind) { if (ctx) ctx.progress = 0; }
    else ctx.progress = prev.progress;
    this.interact = ctx;
    if (!ctx) { b.rebootT = 0; return; }
    const holding = inp.interacting();
    if (ctx.kind === 'repair') {
      if (holding && !ctx.noTech) {
        if (b.repairCredit <= 0 && this.run.tech > 0) { this.run.tech--; this.run.techSpent++; b.repairCredit += CFG.beacon.repairPerTech; }
        const h = Math.min(CFG.beacon.repairRate * dt, b.repairCredit, b.maxHp - b.hp);
        b.hp += h; b.repairCredit -= h;
        if (Math.random() < 0.4) this.fx.burst(b.x + rand(-0.6, 0.6), 1.5, b.z + rand(-0.6, 0.6), 1, 0x4adcff, { speed: 2, size: 0.12, life: 0.3 });
        ctx.progress = b.hp / b.maxHp;
      } else if (inp.pressed('KeyE') && ctx.noTech) sfx.denied();
      return;
    }
    if (holding) {
      ctx.progress += dt;
      if (ctx.kind === 'reboot') b.rebootT = ctx.progress;
      if (ctx.progress >= ctx.hold) {
        if (ctx.kind === 'reboot') this.rebootBeacon(false);
        else if (ctx.kind === 'generator') this.rebootBeacon(true);
        this.interact = null;
      }
    } else {
      ctx.progress = Math.max(0, ctx.progress - dt * 2);
      if (ctx.kind === 'reboot') b.rebootT = 0;
    }
  }

  spawnOrb(kind, x, z, value = 1, xp = 0, spec = null) {
    const m = orbModel(kind, spec);
    m.position.set(x, 0.6, z);
    this.root.add(m);
    const a = Math.random() * Math.PI * 2, s = rand(1.5, 3.5);
    this.orbs.push({ kind, spec, x, z, y: 0.6, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: rand(4, 6), value, xp, t: 0, model: m, fly: false });
  }

  dropHealthNear(x, z, n) {
    for (let i = 0; i < n; i++) this.spawnOrb('health', x + rand(-2, 2), z + rand(-2, 2), 1);
  }

  updateOrbs(dt) {
    const p = this.player;
    const magR = CFG.player.magnetRadius * this.op.pickupMul * this.mods.pickupMul;
    let j = 0;
    for (const o of this.orbs) {
      o.t += dt;
      if (!o.fly) {
        o.vy -= 18 * dt;
        o.y += o.vy * dt;
        o.x += o.vx * dt; o.z += o.vz * dt;
        o.vx *= Math.exp(-3 * dt); o.vz *= Math.exp(-3 * dt);
        if (o.y < 0.45) { o.y = 0.45; o.vy = Math.abs(o.vy) * 0.3; }
        if (o.t > 0.35 && !p.dead) {
          const want = o.kind !== 'health' || p.hp < p.maxHp;
          if (want && dist(o.x, o.z, p.x, p.z) < magR) o.fly = true;
        }
      } else if (!p.dead) {
        const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz) || 0.01;
        const sp = 10 + o.t * 8;
        o.x += dx / d * sp * dt; o.z += dz / d * sp * dt;
        o.y = damp(o.y, 1.0, 8, dt);
        if (d < 0.6) { this.collectOrb(o); this.root.remove(o.model); continue; }
      }
      if (o.t > 30) { this.root.remove(o.model); continue; }
      o.model.position.set(o.x, o.y + Math.sin(o.t * 4) * 0.08, o.z);
      o.model.rotation.y += dt * 3;
      this.orbs[j++] = o;
    }
    this.orbs.length = j;
  }

  collectOrb(o) {
    const p = this.player;
    if (o.kind === 'xp') { this.run.credits += o.value; this.addXP(o.xp); sfx.pickup(); }
    else if (o.kind === 'tech') { this.run.tech += o.value; this.fx.text(p.x, 2.2, p.z, '+1 TECH', 'ft-tech', 0.8); sfx.pickup(); }
    else if (o.kind === 'health') { this.heal(15); this.fx.text(p.x, 2.2, p.z, '+15', 'ft-heal', 0.8); sfx.pickup(); }
    else if (o.kind === 'spec') this.collectSpecimen(o.spec, p.x, p.z);
    else if (o.kind === 'grenade') {
      this.loot.grenades = Math.min(CFG.loot.grenade.max, this.loot.grenades + 1);
      this.fx.text(p.x, 2.4, p.z, '+1 GRENADE', 'ft-loot', 1);
      sfx.sample();
    }
  }

  // =========================================================
  // COMBAT
  // =========================================================
  updateBullets(dt) {
    const B = this.bullets;
    let j = 0;
    for (let i = 0; i < B.length; i++) {
      const b = B[i];
      const px = b.x, pz = b.z;
      b.x += b.dx * b.speed * dt;
      b.z += b.dz * b.speed * dt;
      b.life -= dt;
      let alive = b.life > 0;
      if (alive && this.world.pointBlocked(b.x, b.z)) {
        alive = false;
        this.fx.spray(px, 1, pz, -b.dx, -b.dz, 3, 0xffc46b, { speed: 4, size: 0.07, life: 0.15 });
      }
      if (alive) {
        for (const e of this.enemies) {
          if (e.dead || e.spawnT > 0.15 || b.hit.includes(e.id)) continue;
          const rr = e.r + 0.15;
          if (segDist2(px, pz, b.x, b.z, e.x, e.z) < rr * rr) {
            const crit = Math.random() < this.mods.critChance;
            const dmg = b.dmg * (crit ? 2 : 1);
            this.hitEnemy(e, dmg, b.dx * b.knock, b.dz * b.knock, crit);
            if (crit && this.mods.volatile) this.explode(e.x, e.z, 2.4, b.dmg * 0.8, e.id);
            b.hit.push(e.id);
            if (b.pierce > 0) { b.pierce--; continue; }
            if (b.rico > 0) {
              const n = this.nearestEnemy(e.x, e.z, 8, b.hit);
              if (n) {
                b.rico--;
                const dx = n.x - e.x, dz = n.z - e.z, d = Math.hypot(dx, dz) || 1;
                b.x = e.x; b.z = e.z; b.dx = dx / d; b.dz = dz / d; b.life = 0.35;
                break;
              }
            }
            alive = false;
            break;
          }
        }
      }
      if (alive) B[j++] = b;
    }
    B.length = j;
    const M = this.bulletMesh;
    for (let i = 0; i < j; i++) {
      const b = B[i];
      this._v.set(b.x, 1.0, b.z);
      this._q.setFromAxisAngle(Y_AXIS, Math.atan2(b.dx, b.dz));
      this._s.set(1, 1, 1);
      this._m.compose(this._v, this._q, this._s);
      M.setMatrixAt(i, this._m);
      M.instanceColor.setXYZ(i, ...this._c.setHex(b.color || 0xffd46b).toArray());
    }
    M.count = j;
    M.instanceMatrix.needsUpdate = true;
    M.instanceColor.needsUpdate = true;
  }

  nearestEnemy(x, z, R, exclude) {
    let best = null, bd = R;
    for (const e of this.enemies) {
      if (e.dead || exclude.includes(e.id) || e.state === 'dormant') continue;
      const d = dist(x, z, e.x, e.z);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  explode(x, z, R, dmg, skipId, knock = false) {
    for (const e of this.enemies) {
      if (e.dead || e.id === skipId) continue;
      const d = dist(x, z, e.x, e.z);
      if (d < R + e.r) {
        const k = knock ? 12 / Math.max(1, d) : 0;
        this.hitEnemy(e, dmg, (e.x - x) / (d || 1) * k, (e.z - z) / (d || 1) * k, false);
      }
    }
    if (!knock) {
      this.fx.shockwave(x, z, R, 0xffa040, 0.3, 0.8);
      this.fx.burst(x, 1, z, 10, 0xffa040, { speed: 5, size: 0.15, life: 0.35 });
    }
  }

  hitEnemy(e, dmg, kx, kz, crit) {
    if (e.dead) return;
    e.hp -= dmg;
    e.flash = 0.07;
    const m = e.cfg.mass;
    e.kx += kx / m * 2.5; e.kz += kz / m * 2.5;
    if (e.state === 'dormant') { e.state = 'move'; e.target = 'player'; }
    // damage numbers, batched per enemy so fast weapons don't flood the screen
    e.dmgAcc = (e.dmgAcc || 0) + dmg;
    if (crit || this.time - (e.numT || -1) > 0.12 || e.hp <= 0) {
      this.fx.text(e.x + rand(-0.4, 0.4), 1.6 + e.r, e.z, Math.round(e.dmgAcc).toString(), crit ? 'ft-crit' : 'ft-dmg', 0.55);
      e.dmgAcc = 0; e.numT = this.time;
    }
    this.fx.burst(e.x, 0.9, e.z, 2, e.type === 'spitter' ? 0x9dff4a : e.type === 'disruptor' ? 0xc86bff : 0xff6a3a, { speed: 3, size: 0.1, life: 0.25 });
    sfx.hit();
    if (e.hp <= 0) this.killEnemy(e);
  }

  killEnemy(e, strike = false) {
    if (e.dead) return;
    e.dead = true;
    if (e.dummy) {
      this.fx.burst(e.x, 0.9, e.z, 14, 0x8a5aff, { speed: 5, size: 0.18, life: 0.5 });
      sfx.kill(false);
      return;
    }
    this.stats.kills++;
    this.director.onKill(e);
    const big = e.type === 'brute' || e.type === 'elite';
    const col = { rusher: 0x8a5aff, spitter: 0x9dff4a, brute: 0xff8a2a, disruptor: 0xc86bff, elite: 0xff4a1a }[e.type];
    this.fx.burst(e.x, 0.9, e.z, big ? 44 : 18, col, { speed: big ? 9 : 6, size: big ? 0.3 : 0.2, life: big ? 0.9 : 0.55 });
    this.fx.burst(e.x, 0.6, e.z, big ? 16 : 6, 0x3a2a40, { speed: 4, size: 0.22, life: 0.7 });
    this.fx.splat(e.x, e.z, e.type === 'spitter' ? 0x1e3a14 : 0x2a1430, big ? 1.6 : 0.8);
    sfx.kill(big);
    if (big) { this.world.addShake(0.4); if (!strike) this.slowmo(0.18, 0.25); }
    // combo
    const c = this.combo;
    c.n++; c.t = 3;
    this.stats.bestCombo = Math.max(this.stats.bestCombo, c.n);
    const tiers = [[10, 'COMBO x10'], [25, 'RAMPAGE'], [50, 'UNSTOPPABLE'], [90, 'GODLIKE']];
    if (c.tier < tiers.length && c.n >= tiers[c.tier][0]) { this.hud.announce(tiers[c.tier][1], 'orange'); c.tier++; sfx.upgrade(); }
    // drops
    const xp = CFG.xp[e.type] || 1;
    if (strike) { this.run.credits += e.cfg.credits; }
    else {
      this.spawnOrb('xp', e.x, e.z, e.cfg.credits, xp);
      if (Math.random() < e.cfg.tech) this.spawnOrb('tech', e.x, e.z, 1);
      if (Math.random() < this.director.healthDropChance()) this.spawnOrb('health', e.x, e.z, 1);
      if (e.type === 'brute' && Math.random() < 0.6) this.spawnOrb('grenade', e.x, e.z, 1);
      // specimen drops (codex)
      let spec = null;
      if (e.type === 'spitter' && Math.random() < 0.12) spec = 'gland';
      else if (e.type === 'brute' && Math.random() < 0.5) spec = 'plate';
      else if (e.type === 'disruptor' && (e.state === 'charge' || Math.random() < 0.35)) spec = 'core';
      else if (e.type === 'elite') spec = 'heart';
      if (spec) this.spawnOrb('spec', e.x, e.z, 0, 0, spec);
    }
    if (e.type === 'disruptor') {
      if (e.state === 'charge') {
        this.stats.empInterrupts++;
        this.hud.announce('EMP STOPPED', 'cyan');
      }
      endCharge(this, e);
    }
    if (e.type === 'elite' && !strike) {
      for (let i = 0; i < 3; i++) this.spawnOrb('tech', e.x, e.z, 1);
      this.spawnCache({ x: e.x, z: e.z, bio: 2, mutagen: 1, specimen: true }, 'specimen');
      this.world.addShake(0.9);
      this.fx.shockwave(e.x, e.z, 8, 0xff4a1a, 0.7);
      this.slowmo(0.7, 0.25);
      sfx.explosion();
      this.hud.announce('ELITE DOWN', 'orange');
      this.comm('Grab its specimen: worth 2 samples', 'hq');
    }
  }

  fireGlob(e, tx, tz) {
    if (this.globs.length >= MAX_GLOBS) return;
    const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz) || 1;
    const speed = 9;
    const travel = Math.min(e.cfg.range + 3, d + 2.5);
    this.globs.push({ x: e.x, z: e.z, dx: dx / d, dz: dz / d, speed, life: travel / speed, total: travel / speed, t: 0, dmg: e.cfg.dmg, bdmg: e.cfg.beaconDmg, y: 1 });
  }

  updateGlobs(dt) {
    const G = this.globs, p = this.player, b = this.beacon;
    let j = 0;
    for (const g of G) {
      g.x += g.dx * g.speed * dt;
      g.z += g.dz * g.speed * dt;
      g.t += dt;
      g.life -= dt;
      const k = g.t / g.total;
      g.y = 0.9 + Math.sin(Math.min(1, k) * Math.PI) * 1.4;
      let alive = g.life > 0;
      if (alive && !p.dead && dist(g.x, g.z, p.x, p.z) < p.r + 0.38 && p.iframes <= 0) {
        this.damagePlayer(g.dmg, 'spitter', g.x - g.dx, g.z - g.dz, g.dx * 3, g.dz * 3);
        alive = false;
      } else if (alive && !b.destroyed && b.deployed && dist(g.x, g.z, b.x, b.z) < CFG.beacon.radius + 0.3) {
        this.damageBeacon(g.bdmg);
        alive = false;
      } else if (alive && this.world.pointBlocked(g.x, g.z) && g.y < 1.6) alive = false;
      if (!alive) {
        this.fx.burst(g.x, Math.max(0.3, g.y * 0.5), g.z, 8, 0x9dff4a, { speed: 3, size: 0.14, life: 0.4 });
        continue;
      }
      G[j++] = g;
    }
    G.length = j;
    const M = this.globMesh;
    for (let i = 0; i < j; i++) {
      const g = G[i];
      this._v.set(g.x, g.y, g.z);
      this._s.set(1, 1, 1);
      this._q.identity();
      this._m.compose(this._v, this._q, this._s);
      M.setMatrixAt(i, this._m);
    }
    M.count = j;
    M.instanceMatrix.needsUpdate = true;
  }

  // =========================================================
  // CAMERA + VISUALS
  // =========================================================
  updateCamera(dt) {
    const p = this.player, b = this.beacon;
    const d = dist(p.x, p.z, b.x, b.z);
    let zoom = 1 + clamp((d - 9) / 26, 0, 0.18);
    if (this.phase === 'extract' || this.phase === 'extracting' || this.phase === 'extracted') zoom = 1.12;
    if (this.slowT > 0 && this.slowScale < 0.5) zoom *= 0.96; // punch-in on big moments
    this.world.setZoom(damp(this.world.zoom, zoom, 3, dt));
    let tx = p.x, tz = p.z;
    if (!this.input.touchMode && !p.dead) {
      tx += clamp(p.aimX - p.x, -12, 12) * 0.12;
      tz += clamp(p.aimZ - p.z, -12, 12) * 0.12;
    }
    this.world.follow(tx, tz, dt);
  }

  updateVisuals(dt) {
    const p = this.player, b = this.beacon, t = this.time;
    const ml = this.world.muzzleLight;
    ml.intensity = Math.max(0, ml.intensity - dt * 120);

    const pm = p.model;
    if (!p.dead && this.phase !== 'extracted') {
      pm.group.position.set(p.x, 0, p.z);
      pm.body.rotation.y = p.face;
      const sw = Math.hypot(p.vx, p.vz) > 0.5 ? Math.sin(p.walk) * 0.6 : 0;
      pm.legL.rotation.x = sw; pm.legR.rotation.x = -sw;
      pm.body.position.y = Math.hypot(p.vx, p.vz) > 0.5 ? Math.abs(Math.sin(p.walk)) * 0.06 : 0;
      pm.gun.position.z = 0.2 - p.recoil * 0.12;
      const inF = this.isInField();
      pm.ring.material.color.setHex(inF || this.padSafe() ? 0x5ef0ff : p.drainRate > 0 ? 0xff4a3a : 0xffb03a);
      pm.ring.material.opacity = 0.6 + Math.sin(t * 6) * 0.2;
      const blink = p.iframes > 0.05 && p.skillT > 0 && this.opId === 'scout';
      pm.body.visible = !blink || Math.sin(t * 50) > 0;
      if (p.hurtT > 0) { pm.accent.emissive.setHex(0xff2020); pm.accent.emissiveIntensity = 2; }
      else if (this.loot.ampT > 0) { pm.accent.emissive.setHex(0xff3a3a); pm.accent.emissiveIntensity = 1.6 + Math.sin(t * 14) * 0.6; }
      else if (p.skillT > 0 && this.opId === 'assault') { pm.accent.emissive.setHex(0xffb93a); pm.accent.emissiveIntensity = 1.5 + Math.sin(t * 20) * 0.5; }
      else if (p.exitShieldT > 0) { pm.accent.emissive.setHex(0x5ef0ff); pm.accent.emissiveIntensity = 1.4; }
      else { pm.accent.emissive.setHex(this.op.color); pm.accent.emissiveIntensity = 0.25; }
    }

    const bm = b.model, F = b.field;
    const stCol = {
      active: this.fieldColor.getHex(), deploying: this.fieldColor.getHex(), contested: 0xffb03a, disrupted: 0xb36bff,
      critical: 0xff3a3a, destroyed: 0x333333, rebooting: 0x5ef0ff,
    }[b.state] || 0x5ef0ff;
    bm.coreMat.color.setHex(stCol);
    bm.coreMat.emissive.setHex(stCol);
    bm.coreMat.emissiveIntensity = b.destroyed ? (b.rebootT > 0 ? 2 + Math.sin(t * 20) : 0.1) : b.state === 'critical' ? 2 + Math.sin(t * 12) * 1.5 : 3;
    bm.stripMat.emissive.setHex(b.destroyed ? 0x221111 : stCol);
    bm.stripMat.color.setHex(b.destroyed ? 0x221111 : stCol);
    bm.core.rotation.y += dt * 1.4;
    bm.core.rotation.x += dt * 0.7;
    bm.ring.rotation.z += dt * (b.destroyed ? 0 : 1.5);
    bm.ring2.rotation.y += dt * (b.destroyed ? 0 : -2.2);
    bm.column.position.y = b.destroyed ? -0.25 : 0;
    bm.column.rotation.z = b.destroyed ? 0.12 : 0;
    if (b.destroyed && Math.random() < 0.15) this.fx.burst(b.x + rand(-0.6, 0.6), 2.2, b.z + rand(-0.6, 0.6), 1, 0xffa040, { speed: 2, size: 0.1, life: 0.4, up: 3 });

    const r = b.radius;
    F.group.visible = r > 0.05;
    F.group.scale.setScalar(Math.max(0.001, r));
    F.uniforms.uTime.value = t;
    let flick = 0;
    for (const e of this.enemies) if (e.type === 'disruptor' && e.state === 'charge') flick = Math.max(flick, e.chargeT * 0.8);
    F.uniforms.uFlicker.value = flick;
    const tint = b.state === 'critical' ? 0xff5a5a : b.state === 'contested' ? 0xffd08a : null;
    F.uniforms.uColor.value.copy(this.fieldColor);
    if (tint !== null) F.uniforms.uColor.value.lerp(this._c.setHex(tint), 0.35 + Math.sin(t * 10) * 0.15);
    F.ringMat.opacity = 0.75 + Math.sin(t * 3) * 0.2;

    const showCue = !p.dead && this.fieldOn() && !this.isInField() && !this.padSafe() && this.phase !== 'extracted' && r > 1;
    this.cue.visible = showCue;
    if (showCue) {
      const dx = b.x - p.x, dz = b.z - p.z, d = Math.hypot(dx, dz);
      const len = Math.max(0.1, d - r);
      this.cue.position.set(p.x, 0.06, p.z);
      this.cue.rotation.y = yawOf(dx, dz);
      this.cue.scale.set(1, 1, len);
      this.cue.material.opacity = 0.35 + Math.sin(t * 8) * 0.15;
      this.cue.material.color.setHex(p.drainRate > p.maxHp * 0.03 ? 0xff4a3a : 0xffa040);
    }

    const E = this.ext, pad = E.pad;
    const padCol = E.state === 'locked' ? 0x6a4a2a : E.state === 'ready' ? 0xff9a2a : 0x5ef0ff;
    pad.lineMat.color.setHex(padCol);
    pad.lineMat.opacity = E.state === 'locked' ? 0.35 : 0.65 + Math.sin(t * 5) * 0.3;
    for (const lm of pad.lamps) { lm.emissive.setHex(padCol); lm.emissiveIntensity = E.state === 'locked' ? 0.4 : 2.5 + Math.sin(t * 6) * 1; }
    pad.ring.rotation.z = t * (E.state === 'locked' ? 0.05 : 0.5);
    let prog = 0;
    if (E.state === 'ready') prog = E.holdT / CFG.extraction.activateHold;
    else if (E.state === 'active') prog = 1 - E.countdown / CFG.extraction.countdown;
    else if (E.state === 'done') prog = 1;
    const pq = Math.round(prog * 100);
    if (pq !== E.lastProg) {
      E.lastProg = pq;
      pad.prog.geometry.dispose();
      pad.prog.geometry = new THREE.RingGeometry(3.3, 3.75, 64, 1, Math.PI / 2, Math.max(0.001, prog * Math.PI * 2));
    }
    if (this.generator) this.generator.model.lightMat.emissiveIntensity = 2 + Math.sin(t * 10) * 1.5;
  }
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);

function segDist2(ax, az, bx, bz, px, pz) {
  const vx = bx - ax, vz = bz - az;
  const wx = px - ax, wz = pz - az;
  const L = vx * vx + vz * vz;
  let t = L > 0 ? (wx * vx + wz * vz) / L : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + vx * t - px, cz = az + vz * t - pz;
  return cx * cx + cz * cz;
}
