import * as THREE from 'three';
import { chevronTexture } from './models.js';
import { yawOf } from './util.js';

const MAX_P = 900;

export class FX {
  constructor(world, uiLayer) {
    this.world = world;
    this.scene = world.scene;
    this.ui = uiLayer;

    // ---- particles (one instanced mesh) ----
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const m = new THREE.MeshBasicMaterial({ toneMapped: false });
    this.pm = new THREE.InstancedMesh(geo, m, MAX_P);
    this.pm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pm.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_P * 3), 3);
    this.pm.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.pm.frustumCulled = false;
    this.pm.count = 0;
    this.scene.add(this.pm);
    this.parts = [];
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();

    this.decals = [];   // timed meshes (telegraphs, shockwaves)
    this.texts = [];
    this.textPool = [];
    this._sp = { x: 0, y: 0 };
  }

  clear() {
    this.parts.length = 0;
    this.pm.count = 0;
    for (const d of this.decals) this.scene.remove(d.obj);
    this.decals.length = 0;
    for (const t of this.texts) { t.el.style.display = 'none'; this.textPool.push(t.el); }
    this.texts.length = 0;
    this.splats = [];
  }

  burst(x, y, z, n, color, { speed = 5, size = 0.18, life = 0.5, gravity = 12, up = 3, spread = 1 } = {}) {
    const c = this._c.set(color);
    for (let i = 0; i < n; i++) {
      if (this.parts.length >= MAX_P) this.parts.shift();
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.35 + Math.random() * 0.65);
      this.parts.push({
        x, y, z,
        vx: Math.cos(a) * sp * spread, vy: up * (0.4 + Math.random()), vz: Math.sin(a) * sp * spread,
        life: life * (0.6 + Math.random() * 0.6), max: 0, size: size * (0.6 + Math.random() * 0.8),
        r: c.r, g: c.g, b: c.b, grav: gravity, rot: Math.random() * 6,
      });
      const p = this.parts[this.parts.length - 1];
      p.max = p.life;
    }
  }

  // directional spray (muzzle / impact)
  spray(x, y, z, dx, dz, n, color, { speed = 8, size = 0.1, life = 0.18, cone = 0.5 } = {}) {
    const c = this._c.set(color);
    const base = Math.atan2(dz, dx);
    for (let i = 0; i < n; i++) {
      if (this.parts.length >= MAX_P) this.parts.shift();
      const a = base + (Math.random() - 0.5) * cone * 2;
      const sp = speed * (0.5 + Math.random() * 0.5);
      const l = life * (0.6 + Math.random() * 0.6);
      this.parts.push({ x, y, z, vx: Math.cos(a) * sp, vy: (Math.random() - 0.3) * 2, vz: Math.sin(a) * sp, life: l, max: l, size, r: c.r, g: c.g, b: c.b, grav: 4, rot: 0 });
    }
  }

  // ---- ground decals ----
  addDecal(obj, life, update) {
    this.scene.add(obj);
    const d = { obj, life, t: 0, update };
    this.decals.push(d);
    return d;
  }
  removeDecal(d) {
    if (!d) return;
    d.life = -1;
  }

  // Filling circle telegraph (brute slam etc.)
  circleTelegraph(x, z, radius, duration, color = 0xff3a3a) {
    const g = new THREE.Group();
    g.position.set(x, 0.06, z);
    const edge = new THREE.Mesh(new THREE.RingGeometry(radius - 0.12, radius, 48),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }));
    edge.rotation.x = -Math.PI / 2;
    const fillMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, depthWrite: false, toneMapped: false });
    const fill = new THREE.Mesh(new THREE.CircleGeometry(radius, 48), fillMat);
    fill.rotation.x = -Math.PI / 2;
    fill.scale.setScalar(0.01);
    g.add(edge, fill);
    return this.addDecal(g, duration, (d) => {
      const k = Math.min(1, d.t / duration);
      fill.scale.setScalar(Math.max(0.01, k));
      fillMat.opacity = 0.18 + k * 0.3;
    });
  }

  // Rectangle telegraph for charges
  lineTelegraph(x, z, dx, dz, length, width, duration, color = 0xff3a3a) {
    const g = new THREE.Group();
    g.position.set(x, 0.06, z);
    g.rotation.y = yawOf(dx, dz);
    const geo = new THREE.PlaneGeometry(width, length);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, length / 2);
    const mt = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, depthWrite: false, toneMapped: false });
    const area = new THREE.Mesh(geo, mt);
    const fgeo = geo.clone();
    const fmt = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false });
    const fill = new THREE.Mesh(fgeo, fmt);
    fill.scale.z = 0.01;
    g.add(area, fill);
    return this.addDecal(g, duration, (d) => {
      const k = Math.min(1, d.t / duration);
      fill.scale.z = Math.max(0.01, k);
    });
  }

  shockwave(x, z, radius, color = 0x5ef0ff, life = 0.5, y = 0.1) {
    const mt = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), mt);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, y, z);
    return this.addDecal(ring, life, (d) => {
      const k = d.t / life;
      ring.scale.setScalar(0.2 + k * radius);
      mt.opacity = 0.9 * (1 - k);
    });
  }

  // Red chevrons at a lane edge pointing toward the centre
  laneWarning(x, z, tx, tz, duration = 3) {
    const g = new THREE.Group();
    g.position.set(x, 0.07, z);
    const dx = tx - x, dz = tz - z;
    g.rotation.y = yawOf(dx, dz);
    const mats = [];
    for (let i = 0; i < 3; i++) {
      const mt = new THREE.MeshBasicMaterial({ map: chevronTexture(), color: 0xff3048, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
      const p = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), mt);
      p.rotation.x = -Math.PI / 2;
      p.position.z = 3 + i * 2.2;
      g.add(p);
      mats.push(mt);
    }
    return this.addDecal(g, duration, (d) => {
      const fade = Math.min(1, (duration - d.t) / 0.5);
      for (let i = 0; i < 3; i++) {
        const ph = (d.t * 2.2 - i * 0.3) % 1;
        mats[i].opacity = (0.25 + 0.75 * Math.max(0, Math.sin(ph * Math.PI))) * fade;
      }
    });
  }

  // Jagged lightning through a list of points [{x,y,z}]
  lightning(pts, color = 0x7ad8ff, life = 0.13) {
    if (!this._boltGeo) { this._boltGeo = new THREE.BoxGeometry(1, 1, 1); this._boltGeo.userData.shared = true; }
    const g = new THREE.Group();
    const mt = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending });
    const core = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, toneMapped: false, depthWrite: false });
    const a = new THREE.Vector3(), b = new THREE.Vector3(), mid = new THREE.Vector3();
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i], p1 = pts[i + 1];
      const n = 5;
      let prev = new THREE.Vector3(p0.x, p0.y, p0.z);
      for (let k = 1; k <= n; k++) {
        const t = k / n;
        const nx = new THREE.Vector3(p0.x + (p1.x - p0.x) * t, p0.y + (p1.y - p0.y) * t, p0.z + (p1.z - p0.z) * t);
        if (k < n) { nx.x += (Math.random() - 0.5) * 0.7; nx.y += (Math.random() - 0.5) * 0.4; nx.z += (Math.random() - 0.5) * 0.7; }
        a.copy(prev); b.copy(nx);
        const len = a.distanceTo(b);
        mid.copy(a).add(b).multiplyScalar(0.5);
        for (const [m, w] of [[mt, 0.16], [core, 0.05]]) {
          const seg = new THREE.Mesh(this._boltGeo, m);
          seg.position.copy(mid);
          seg.lookAt(b);
          seg.scale.set(w, w, len);
          g.add(seg);
        }
        prev = nx;
      }
    }
    return this.addDecal(g, life, (d) => { const k = 1 - d.t / life; mt.opacity = k; core.opacity = k; });
  }

  // Ground splat left by kills (fades out, capped)
  splat(x, z, color, r = 0.8) {
    this.splats = this.splats || [];
    if (this.splats.length > 36) this.removeDecal(this.splats.shift());
    const mt = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false });
    const m = new THREE.Mesh(new THREE.CircleGeometry(r * (0.7 + Math.random() * 0.5), 10), mt);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.random() * 6;
    m.position.set(x, 0.025, z);
    m.scale.set(1, 0.7 + Math.random() * 0.5, 1);
    const life = 9;
    const d = this.addDecal(m, life, (dd) => { mt.opacity = 0.55 * Math.min(1, (life - dd.t) / 2); });
    this.splats.push(d);
    return d;
  }

  // ---- floating text (DOM) ----
  text(x, y, z, str, cls = '', life = 1.0) {
    let el = this.textPool.pop();
    if (!el) {
      el = document.createElement('div');
      this.ui.appendChild(el);
    }
    el.className = 'ftext ' + cls;
    el.textContent = str;
    el.style.display = 'block';
    if (this.texts.length > 40) {
      const old = this.texts.shift();
      old.el.style.display = 'none';
      this.textPool.push(old.el);
    }
    this.texts.push({ el, x, y, z, t: 0, life });
  }

  update(dt) {
    // particles
    const P = this.parts;
    let w = 0;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy -= p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.05) { p.y = 0.05; p.vy *= -0.3; p.vx *= 0.7; p.vz *= 0.7; }
      p.rot += dt * 6;
      P[w++] = p;
    }
    P.length = w;
    const pm = this.pm;
    for (let i = 0; i < w; i++) {
      const p = P[i];
      const s = p.size * Math.max(0.05, p.life / p.max);
      this._p.set(p.x, p.y, p.z);
      this._s.set(s, s, s);
      this._q.setFromEuler(this._e.set(p.rot, p.rot * 0.7, 0));
      this._m.compose(this._p, this._q, this._s);
      pm.setMatrixAt(i, this._m);
      pm.instanceColor.setXYZ(i, p.r, p.g, p.b);
    }
    pm.count = w;
    pm.instanceMatrix.needsUpdate = true;
    pm.instanceColor.needsUpdate = true;

    // decals
    let j = 0;
    for (let i = 0; i < this.decals.length; i++) {
      const d = this.decals[i];
      if (d.life < 0) { this.scene.remove(d.obj); disposeObj(d.obj); continue; }
      d.t += dt;
      if (d.t >= d.life) { this.scene.remove(d.obj); disposeObj(d.obj); continue; }
      if (d.update) d.update(d);
      this.decals[j++] = d;
    }
    this.decals.length = j;

    // floating texts
    let k = 0;
    for (let i = 0; i < this.texts.length; i++) {
      const t = this.texts[i];
      t.t += dt;
      if (t.t >= t.life) { t.el.style.display = 'none'; this.textPool.push(t.el); continue; }
      this.world.toScreen(t.x, t.y, t.z, this._sp);
      const rise = t.t * 38;
      const a = t.t < t.life * 0.7 ? 1 : 1 - (t.t - t.life * 0.7) / (t.life * 0.3);
      t.el.style.transform = `translate(${this._sp.x}px, ${this._sp.y - rise}px) translate(-50%, -50%)`;
      t.el.style.opacity = a.toFixed(2);
      this.texts[k++] = t;
    }
    this.texts.length = k;
  }
}

export function disposeObj(o) {
  o.traverse((c) => {
    if (c.geometry && !c.geometry.userData.shared) c.geometry.dispose();
    if (c.material) {
      const ms = Array.isArray(c.material) ? c.material : [c.material];
      for (const m of ms) if (!m.userData.shared) m.dispose();
    }
  });
}
