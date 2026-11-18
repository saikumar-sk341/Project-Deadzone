import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CFG } from './config.js';
import { mat, makeCrystalCluster, makeRock, makeContainer, makeCrate, makeBarricade, makeLamp, bakeStatic } from './models.js';

const CAM_DIR = new THREE.Vector3(1, 1.32, 1).normalize();
const CAM_DIST = 70;

// Static level layout for OUTPOST ZERO. Axis-aligned boxes and circles are
// used for collision so movement stays cheap and predictable.
export const LAYOUT = {
  boxes: [
    { kind: 'container', x: -14, z: -10, w: 9, d: 3.2, h: 3.0, label: 'A-03' },
    { kind: 'container', x: -17, z: 6, w: 3.2, d: 8, h: 3.0 },
    { kind: 'container', x: 22, z: 14, w: 8, d: 3, h: 2.8, label: 'C-11' },
    { kind: 'container', x: -24, z: -22, w: 3, d: 8, h: 2.8 },
    { kind: 'crate', x: 12, z: 8, w: 2, d: 2, h: 1.4 },
    { kind: 'crate', x: 14, z: 10.2, w: 1.6, d: 1.6, h: 1.1 },
    { kind: 'crate', x: -6, z: 15, w: 2.2, d: 2.2, h: 1.5 },
    { kind: 'crate', x: 18, z: -8, w: 2, d: 2, h: 1.4 },
    { kind: 'crate', x: 26, z: -15, w: 2.4, d: 2.4, h: 1.6 },
    { kind: 'crate', x: -28, z: 13, w: 2.2, d: 2.2, h: 1.5 },
    { kind: 'crate', x: 8, z: 24, w: 2, d: 2, h: 1.3 },
    { kind: 'crate', x: -10, z: 28, w: 2.4, d: 2.4, h: 1.6 },
    { kind: 'crate', x: 30, z: 25, w: 2, d: 2, h: 1.4 },
    { kind: 'crate', x: 2.6, z: 3.2, w: 1.2, d: 1.2, h: 0.9 },
    { kind: 'crate', x: -3.2, z: -2.4, w: 1.2, d: 1.2, h: 0.9 },
    { kind: 'barricade', x: -4, z: -25, w: 6, d: 0.9, h: 1.2 },
    { kind: 'barricade', x: 12.5, z: -25.5, w: 5, d: 0.9, h: 1.2 },
  ],
  circles: [
    { x: -31, z: -5, r: 2.2 },
    { x: -9, z: -35, r: 2.5 },
    { x: 34, z: 4, r: 2.8 },
    { x: 20, z: 33, r: 2.4 },
    { x: -34, z: 31, r: 3.0 },
    { x: 35, z: -35, r: 3.2 },
    { x: -36, z: -36, r: 3.2 },
    { x: 6, z: 36, r: 2.2 },
  ],
  crystals: [
    [-20, -14], [-30, 22], [24, -24], [33, 15], [-12, 33], [16, 28], [-35, -18], [5, -38],
    [-22, 30], [37, -20], [-38, 8], [28, 36], [-6, -40], [14, -36], [-26, -32], [38, 30],
  ],
  lamps: [[-10, -8], [-15, 2], [17.5, 12.5], [-1, -27], [10, -27], [20, -10]],
};

export class World {
  constructor(container, quality = 'high') {
    this.quality = quality;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    const isMobile = matchMedia('(pointer: coarse)').matches;
    this.isMobile = isMobile;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.id = 'gl';
    container.prepend(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f0b16);
    scene.fog = new THREE.Fog(0x140f1c, 62, 118);
    this.scene = scene;

    
    this.zoom = 1;
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
    this.camera = cam;
    this.camTarget = new THREE.Vector3();
    this.shake = 0;
    this.shakeOff = new THREE.Vector3();

    // Lights
    const hemi = new THREE.HemisphereLight(0xa8b8e8, 0x3a2a34, 1.7);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffe2c0, 2.6);
    sun.position.set(-18, 34, 12);
    sun.castShadow = true;
    const sm = isMobile ? 1024 : 2048;
    sun.shadow.mapSize.set(sm, sm);
    const sc = sun.shadow.camera;
    sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 90;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);
    scene.add(sun.target);
    this.sun = sun;
    const rim = new THREE.DirectionalLight(0x7a5cff, 0.55);
    rim.position.set(20, 10, -25);
    scene.add(rim);

    // Muzzle light (shared, flashes when firing)
    this.muzzleLight = new THREE.PointLight(0xffc56b, 0, 9, 2);
    scene.add(this.muzzleLight);

    this.colliders = { boxes: [], circles: [] };
    this.buildGround();
    this.buildProps();

    // Post-processing (bloom gives the glowing sci-fi read from the mockup)
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, cam));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.6, 0.4, 0.8);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.useBloom = quality !== 'low';

    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._v = new THREE.Vector3();

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setQuality(q) {
    this.quality = q;
    this.useBloom = q !== 'low';
    this.renderer.shadowMap.enabled = q !== 'low';
    this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.aspect = w / h;
    // Keep at least ~19 m of horizontal view on portrait phones.
    // ~21 m of vertical view on landscape; on portrait phones keep >= 17 m of width.
    this.baseViewH = Math.max(21, 17 / this.aspect);
    this.updateProjection();
  }

  updateProjection() {
    const vh = this.baseViewH * this.zoom;
    const vw = vh * this.aspect;
    const c = this.camera;
    c.left = -vw / 2; c.right = vw / 2; c.top = vh / 2; c.bottom = -vh / 2;
    c.updateProjectionMatrix();
  }

  setZoom(z) {
    if (Math.abs(z - this.zoom) > 0.0005) {
      this.zoom = z;
      this.updateProjection();
    }
  }

  // Snap or follow a world point.
  follow(x, z, dt, snap = false) {
    const t = this.camTarget;
    if (snap) t.set(x, 0, z);
    else {
      const k = 1 - Math.exp(-6 * dt);
      t.x += (x - t.x) * k;
      t.z += (z - t.z) * k;
    }
    this.shake = Math.max(0, this.shake - dt * 2.8);
    const s = this.shake * this.shake * 0.9;
    this.shakeOff.set((Math.random() - 0.5) * s, 0, (Math.random() - 0.5) * s);
    const c = this.camera;
    c.position.copy(t).addScaledVector(CAM_DIR, CAM_DIST).add(this.shakeOff);
    c.lookAt(t.x + this.shakeOff.x, 0, t.z + this.shakeOff.z);
    // shadow camera follows view
    this.sun.position.set(t.x - 18, 34, t.z + 12);
    this.sun.target.position.set(t.x, 0, t.z);
  }

  addShake(a) { this.shake = Math.min(1.2, this.shake + a); }

  // Mouse (client px) -> ground point
  screenToGround(px, py, out) {
    const ndc = this._v.set((px / window.innerWidth) * 2 - 1, -(py / window.innerHeight) * 2 + 1, 0);
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.ray.intersectPlane(this.groundPlane, out);
  }

  // World -> screen px. Returns false if behind camera (never for ortho).
  toScreen(x, y, z, out) {
    const v = this._v.set(x, y, z).project(this.camera);
    out.x = (v.x * 0.5 + 0.5) * window.innerWidth;
    out.y = (-v.y * 0.5 + 0.5) * window.innerHeight;
    return out;
  }

  render() {
    if (this.useBloom) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  buildGround() {
    const size = 512;
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const g = cv.getContext('2d');
    g.fillStyle = '#423c48';
    g.fillRect(0, 0, size, size);
    // noise speckle
    const img = g.getImageData(0, 0, size, size);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * 22;
      img.data[i] += n; img.data[i + 1] += n * 0.9; img.data[i + 2] += n * 1.05;
    }
    g.putImageData(img, 0, 0);
    // panel seams
    g.strokeStyle = 'rgba(10,8,14,0.55)';
    g.lineWidth = 3;
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, size); g.stroke();
      g.beginPath(); g.moveTo(0, i * 128); g.lineTo(size, i * 128); g.stroke();
    }
    g.strokeStyle = 'rgba(120,110,140,0.08)';
    g.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo(i * 128 + 2, 0); g.lineTo(i * 128 + 2, size); g.stroke();
      g.beginPath(); g.moveTo(0, i * 128 + 2); g.lineTo(size, i * 128 + 2); g.stroke();
    }
    // stains
    for (let i = 0; i < 18; i++) {
      const x = Math.random() * size, y = Math.random() * size, r = 20 + Math.random() * 60;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(15,10,20,0.35)');
      grd.addColorStop(1, 'rgba(15,10,20,0)');
      g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // cracks
    g.strokeStyle = 'rgba(8,6,10,0.6)';
    g.lineWidth = 1.5;
    for (let i = 0; i < 10; i++) {
      let x = Math.random() * size, y = Math.random() * size;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (Math.random() - 0.5) * 50; y += (Math.random() - 0.5) * 50; g.lineTo(x, y); }
      g.stroke();
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(14, 14);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(160, 160),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0.05 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Contamination tint beyond the play area edge + border glow
    const H = CFG.map.half;
    const edgeMat = new THREE.MeshBasicMaterial({ color: 0x3a0f22, transparent: true, opacity: 0.55, depthWrite: false });
    const strips = [
      [0, -H - 20, 200, 40], [0, H + 20, 200, 40], [-H - 20, 0, 40, 200], [H + 20, 0, 40, 200],
    ];
    for (const [x, z, w, d] of strips) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), edgeMat);
      m.rotation.x = -Math.PI / 2; m.position.set(x, 0.02, z);
      this.scene.add(m);
    }
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-H, 0.05, -H), new THREE.Vector3(H, 0.05, -H), new THREE.Vector3(H, 0.05, H),
      new THREE.Vector3(-H, 0.05, H), new THREE.Vector3(-H, 0.05, -H),
    ]);
    this.scene.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xff3355, transparent: true, opacity: 0.4 })));
  }

  buildProps() {
    const S = new THREE.Group();
    this.scene.add(S);
    for (const b of LAYOUT.boxes) {
      let obj;
      if (b.kind === 'container') obj = makeContainer(b.w, b.h, b.d, b.label);
      else if (b.kind === 'barricade') obj = makeBarricade(b.w, b.h, b.d);
      else obj = makeCrate(b.w, b.h, b.d);
      obj.position.set(b.x, 0, b.z);
      S.add(obj);
      this.colliders.boxes.push({ minX: b.x - b.w / 2, maxX: b.x + b.w / 2, minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2 });
    }
    for (const c of LAYOUT.circles) {
      const r = makeRock(c.r);
      r.position.set(c.x, 0, c.z);
      S.add(r);
      this.colliders.circles.push({ x: c.x, z: c.z, r: c.r * 0.9 });
    }
    for (const [x, z] of LAYOUT.crystals) {
      const cr = makeCrystalCluster();
      cr.position.set(x, 0, z);
      cr.rotation.y = Math.random() * Math.PI * 2;
      S.add(cr);
    }
    for (const [x, z] of LAYOUT.lamps) {
      const l = makeLamp();
      l.position.set(x, 0, z);
      S.add(l);
    }
    // Scattered debris for texture (non-colliding)
    const debrisMat = mat('debris', { color: 0x3d3846, roughness: 0.9, flatShading: true });
    for (let i = 0; i < 70; i++) {
      const x = (Math.random() - 0.5) * 2 * (CFG.map.half - 2);
      const z = (Math.random() - 0.5) * 2 * (CFG.map.half - 2);
      if (Math.hypot(x, z) < 9) continue;
      const s = 0.15 + Math.random() * 0.35;
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), debrisMat);
      m.position.set(x, s * 0.4, z);
      m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      m.receiveShadow = true;
      S.add(m);
    }
    bakeStatic(S); // all props are static: merge into a handful of draw calls
  }

  // Push a circle (entity) out of static colliders. Returns true if it hit.
  resolve(ent, r) {
    let hit = false;
    for (const b of this.colliders.boxes) {
      const cx = Math.max(b.minX, Math.min(ent.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(ent.z, b.maxZ));
      const dx = ent.x - cx, dz = ent.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        hit = true;
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const push = r - d;
          ent.x += (dx / d) * push;
          ent.z += (dz / d) * push;
        } else {
          // centre inside box: push out along shortest axis
          const l = ent.x - b.minX, rr = b.maxX - ent.x, t = ent.z - b.minZ, bb = b.maxZ - ent.z;
          const m = Math.min(l, rr, t, bb);
          if (m === l) ent.x = b.minX - r;
          else if (m === rr) ent.x = b.maxX + r;
          else if (m === t) ent.z = b.minZ - r;
          else ent.z = b.maxZ + r;
        }
      }
    }
    for (const c of this.colliders.circles) {
      const dx = ent.x - c.x, dz = ent.z - c.z;
      const rr = r + c.r;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr) {
        hit = true;
        const d = Math.sqrt(d2) || 0.001;
        ent.x = c.x + (dx / d) * rr;
        ent.z = c.z + (dz / d) * rr;
      }
    }
    const H = CFG.map.half - r;
    if (ent.x < -H) { ent.x = -H; hit = true; }
    if (ent.x > H) { ent.x = H; hit = true; }
    if (ent.z < -H) { ent.z = -H; hit = true; }
    if (ent.z > H) { ent.z = H; hit = true; }
    return hit;
  }

  // Point inside any static collider? (for bullets)
  pointBlocked(x, z, pad = 0) {
    for (const b of this.colliders.boxes) {
      if (x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad) return true;
    }
    for (const c of this.colliders.circles) {
      const dx = x - c.x, dz = z - c.z;
      if (dx * dx + dz * dz < (c.r + pad) * (c.r + pad)) return true;
    }
    return false;
  }
}
