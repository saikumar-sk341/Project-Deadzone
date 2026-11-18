import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ------------------------------------------------------------
// Low-poly procedural models. Everything is built from
// primitives so the prototype needs no art assets.
// Models face +z.
// ------------------------------------------------------------

const MATS = new Map();
export function mat(key, params) {
  if (!MATS.has(key)) {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.2, ...params });
    m.userData.shared = true;
    MATS.set(key, m);
  }
  return MATS.get(key);
}
export function glow(key, color, intensity = 2.2, extra = {}) {
  return mat(key, { color, emissive: color, emissiveIntensity: intensity, roughness: 0.4, metalness: 0, ...extra });
}
function mesh(geo, material, cast = true, receive = false) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}
function box(w, h, d, material, x = 0, y = 0, z = 0, cast = true) {
  const m = mesh(new THREE.BoxGeometry(w, h, d), material, cast, true);
  m.position.set(x, y, z);
  return m;
}

function labelTexture(text, bg = '#3a4150', fg = '#d8c27a') {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 256, 128);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  for (let i = 0; i < 256; i += 16) g.fillRect(i, 0, 3, 128);
  g.fillStyle = fg;
  g.font = 'bold 72px Arial Narrow, Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let hazardTex = null;
function hazardTexture() {
  if (hazardTex) return hazardTex;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#e0b02c'; g.fillRect(0, 0, 128, 32);
  g.fillStyle = '#1a1a1a';
  for (let i = -32; i < 160; i += 32) {
    g.beginPath(); g.moveTo(i, 32); g.lineTo(i + 16, 32); g.lineTo(i + 32, 0); g.lineTo(i + 16, 0); g.fill();
  }
  hazardTex = new THREE.CanvasTexture(c);
  hazardTex.colorSpace = THREE.SRGBColorSpace;
  hazardTex.wrapS = THREE.RepeatWrapping;
  return hazardTex;
}

// ---------------- environment ----------------
export function makeContainer(w, h, d, label) {
  const g = new THREE.Group();
  const body = mat('container', { color: 0x4a5162, roughness: 0.6, metalness: 0.5 });
  const rib = mat('containerRib', { color: 0x363b48, roughness: 0.6, metalness: 0.5 });
  g.add(box(w, h, d, body, 0, h / 2, 0));
  const long = w >= d;
  const n = Math.floor((long ? w : d) / 0.9);
  for (let i = 0; i <= n; i++) {
    const t = -0.5 + i / n;
    if (long) g.add(box(0.12, h * 0.96, d + 0.08, rib, t * w * 0.98, h / 2, 0, false));
    else g.add(box(w + 0.08, h * 0.96, 0.12, rib, 0, h / 2, t * d * 0.98, false));
  }
  const stripeMat = mat('hazardStripe', { map: hazardTexture(), roughness: 0.6 });
  const stripe = box(long ? w + 0.02 : w + 0.1, 0.25, long ? d + 0.1 : d + 0.02, stripeMat, 0, h - 0.35, 0, false);
  g.add(stripe);
  const lightMat = glow('warmLight', 0xffc46b, 3);
  g.add(box(0.3, 0.2, 0.3, lightMat, long ? w / 2 - 0.4 : 0, h + 0.1, long ? 0 : d / 2 - 0.4, false));
  if (label) {
    const lm = new THREE.MeshStandardMaterial({ map: labelTexture(label), roughness: 0.7 });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), lm);
    if (long) { p.position.set(0, h * 0.5, d / 2 + 0.07); }
    else { p.position.set(w / 2 + 0.07, h * 0.5, 0); p.rotation.y = Math.PI / 2; }
    g.add(p);
  }
  return g;
}

export function makeCrate(w, h, d) {
  const g = new THREE.Group();
  const body = mat('crate', { color: 0x5b5f6b, roughness: 0.65, metalness: 0.4 });
  const frame = mat('crateFrame', { color: 0x2f323b, roughness: 0.7, metalness: 0.4 });
  const yel = mat('crateYellow', { color: 0xd9a52b, roughness: 0.6, metalness: 0.2 });
  g.add(box(w, h, d, body, 0, h / 2, 0));
  g.add(box(w + 0.06, 0.12, d + 0.06, frame, 0, h - 0.06, 0, false));
  g.add(box(w + 0.06, 0.12, d + 0.06, frame, 0, 0.06, 0, false));
  g.add(box(w * 0.5, h * 0.18, d + 0.04, yel, 0, h * 0.55, 0, false));
  return g;
}

export function makeBarricade(w, h, d) {
  const g = new THREE.Group();
  const conc = mat('concrete', { color: 0x6b6870, roughness: 0.95, flatShading: true });
  g.add(box(w, h, d, conc, 0, h / 2, 0));
  const stripeMat = mat('hazardStripe2', { map: hazardTexture(), roughness: 0.6 });
  g.add(box(w + 0.02, 0.22, d + 0.02, stripeMat, 0, h * 0.7, 0, false));
  return g;
}

export function makeRock(r) {
  const m = mesh(new THREE.DodecahedronGeometry(r, 0), mat('rock', { color: 0x3e3a44, roughness: 1, flatShading: true }), true, true);
  m.scale.set(1, 0.65, 1.1);
  m.position.y = r * 0.35;
  m.rotation.set(Math.random(), Math.random() * 6, Math.random() * 0.4);
  const g = new THREE.Group();
  g.add(m);
  return g;
}

export function makeCrystalCluster() {
  const g = new THREE.Group();
  const cm = glow('crystal', 0xff2f55, 1.6, { roughness: 0.2, flatShading: true });
  const n = 3 + Math.floor(Math.random() * 4);
  for (let i = 0; i < n; i++) {
    const h = 0.6 + Math.random() * 1.6;
    const c = mesh(new THREE.ConeGeometry(0.18 + Math.random() * 0.2, h, 5), cm, false);
    c.position.set((Math.random() - 0.5) * 1.6, h / 2 - 0.05, (Math.random() - 0.5) * 1.6);
    c.rotation.set((Math.random() - 0.5) * 0.7, Math.random() * 3, (Math.random() - 0.5) * 0.7);
    g.add(c);
  }
  // red ground stain
  const stain = new THREE.Mesh(new THREE.CircleGeometry(1.6, 12),
    mat('stain', { color: 0x4a1020, roughness: 1, transparent: true, opacity: 0.6 }));
  stain.rotation.x = -Math.PI / 2; stain.position.y = 0.02;
  g.add(stain);
  return g;
}

export function makeLamp() {
  const g = new THREE.Group();
  const pole = mat('pole', { color: 0x2c2e36, metalness: 0.6, roughness: 0.5 });
  g.add(box(0.14, 3.2, 0.14, pole, 0, 1.6, 0));
  g.add(box(0.6, 0.16, 0.3, pole, 0.2, 3.2, 0));
  g.add(box(0.36, 0.08, 0.24, glow('lampLight', 0xffd29a, 3.5), 0.3, 3.1, 0, false));
  return g;
}

// ---------------- player ----------------
export function makePlayer(color) {
  const g = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color: 0x5a6070, roughness: 0.6, metalness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.2, emissive: color, emissiveIntensity: 0.25 });
  const dark = mat('pDark', { color: 0x23252c, roughness: 0.7 });
  const skin = mat('skin', { color: 0xc89a7a, roughness: 0.8 });
  const body = new THREE.Group();
  g.add(body);
  // legs
  const legL = new THREE.Group(); legL.position.set(0.15, 0.62, 0);
  const legR = new THREE.Group(); legR.position.set(-0.15, 0.62, 0);
  legL.add(box(0.2, 0.62, 0.24, dark, 0, -0.31, 0));
  legR.add(box(0.2, 0.62, 0.24, dark, 0, -0.31, 0));
  body.add(legL, legR);
  // torso
  body.add(box(0.58, 0.62, 0.36, suit, 0, 0.95, 0));
  body.add(box(0.6, 0.18, 0.38, accent, 0, 1.12, 0, false));
  // backpack
  body.add(box(0.46, 0.5, 0.24, dark, 0, 0.98, -0.28));
  body.add(box(0.12, 0.12, 0.05, glow('packLight', 0x5ef0ff, 3), 0.12, 1.08, -0.41, false));
  // head
  const head = mesh(new THREE.SphereGeometry(0.2, 10, 8), skin);
  head.position.set(0, 1.45, 0.02);
  body.add(head);
  body.add(box(0.34, 0.08, 0.12, glow('visor', 0xffb93a, 2.4), 0, 1.47, 0.16, false));
  // arms + gun
  const gun = new THREE.Group();
  gun.position.set(-0.24, 1.0, 0.2);
  gun.add(box(0.12, 0.16, 0.85, dark, 0, 0, 0.25));
  gun.add(box(0.08, 0.2, 0.12, dark, 0, -0.12, 0.08));
  gun.add(box(0.05, 0.05, 0.1, glow('gunTip', 0xffd36b, 2), 0, 0.02, 0.7, false));
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.02, 0.78);
  gun.add(muzzle);
  body.add(gun);
  body.add(box(0.14, 0.14, 0.45, suit, 0.26, 1.02, 0.12, false));
  // selection ring
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.68, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04;
  g.add(ring);
  body.scale.setScalar(1.22);
  return { group: g, body, legL, legR, gun, muzzle, ring, suit, accent };
}

// ---------------- beacon ----------------
export function makeBeacon() {
  const g = new THREE.Group();
  const metal = mat('beaconMetal', { color: 0x6c7280, roughness: 0.45, metalness: 0.7 });
  const darkMetal = mat('beaconDark', { color: 0x2c3038, roughness: 0.5, metalness: 0.7 });
  const yel = mat('beaconYellow', { color: 0xe0a92a, roughness: 0.5, metalness: 0.3 });
  const coreMat = new THREE.MeshStandardMaterial({ color: 0x5ef0ff, emissive: 0x5ef0ff, emissiveIntensity: 3, roughness: 0.2 });
  const stripMat = new THREE.MeshStandardMaterial({ color: 0x5ef0ff, emissive: 0x5ef0ff, emissiveIntensity: 2.4 });

  const base = mesh(new THREE.CylinderGeometry(1.35, 1.65, 0.45, 8), darkMetal, true, true);
  base.position.y = 0.22;
  g.add(base);
  const legs = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const leg = box(0.4, 0.35, 1.4, metal, Math.sin(a) * 1.35, 0.18, Math.cos(a) * 1.35);
    leg.rotation.y = a;
    legs.add(leg);
    const foot = box(0.5, 0.12, 0.5, yel, Math.sin(a) * 1.95, 0.06, Math.cos(a) * 1.95, false);
    legs.add(foot);
  }
  g.add(legs);
  const column = new THREE.Group();
  g.add(column);
  const col = mesh(new THREE.CylinderGeometry(0.62, 0.85, 1.5, 8), metal);
  col.position.y = 1.15;
  column.add(col);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const p = box(0.36, 0.9, 0.12, yel, Math.sin(a) * 0.78, 1.1, Math.cos(a) * 0.78, false);
    p.rotation.y = a;
    column.add(p);
    const s = box(0.08, 0.7, 0.04, stripMat, Math.sin(a + 0.4) * 0.74, 1.15, Math.cos(a + 0.4) * 0.74, false);
    s.rotation.y = a + 0.4;
    column.add(s);
  }
  const cap = mesh(new THREE.CylinderGeometry(0.5, 0.62, 0.3, 8), darkMetal);
  cap.position.y = 2.05;
  column.add(cap);
  const core = mesh(new THREE.IcosahedronGeometry(0.42, 0), coreMat, false);
  core.position.y = 2.6;
  column.add(core);
  const ring = mesh(new THREE.TorusGeometry(0.78, 0.06, 6, 32), stripMat, false);
  ring.position.y = 2.6;
  ring.rotation.x = Math.PI / 2;
  column.add(ring);
  const ring2 = mesh(new THREE.TorusGeometry(0.62, 0.04, 6, 32), stripMat, false);
  ring2.position.y = 2.6;
  column.add(ring2);
  return { group: g, core, coreMat, stripMat, ring, ring2, column, legs };
}

const FIELD_VERT = /* glsl */`
  varying vec3 vN;
  varying vec3 vP;
  void main(){
    vP = position;
    vN = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const DOME_FRAG = /* glsl */`
  uniform vec3 uColor; uniform float uTime; uniform float uOpacity; uniform float uFlicker;
  varying vec3 vN; varying vec3 vP;
  void main(){
    float f = 1.0 - abs(dot(normalize(vN), vec3(0.0, 0.0, 1.0)));
    f = pow(f, 2.0);
    float ang = atan(vP.z, vP.x);
    float lat = vP.y;
    float grid = smoothstep(0.93, 1.0, abs(sin(ang * 18.0))) * 0.45 + smoothstep(0.95, 1.0, abs(sin(lat * 22.0 - uTime * 0.6))) * 0.35;
    float band = exp(-pow((lat - fract(uTime * 0.25)) * 9.0, 2.0)) * 0.6;
    float flick = 1.0 - uFlicker * (0.5 + 0.5 * sin(uTime * 60.0 + vP.x * 9.0));
    float a = (0.02 + f * 0.3 + grid * 0.16 + band * 0.14) * uOpacity * flick;
    a *= 1.0 - smoothstep(0.92, 1.0, lat) * 0.4;
    gl_FragColor = vec4(uColor * (0.6 + f * 0.9 + band * 0.6), a);
  }`;
const DISC_FRAG = /* glsl */`
  uniform vec3 uColor; uniform float uTime; uniform float uOpacity; uniform float uFlicker;
  varying vec3 vN; varying vec3 vP;
  void main(){
    float r = length(vP.xy);
    float edge = smoothstep(0.86, 1.0, r) * (1.0 - smoothstep(0.985, 1.0, r));
    float rings = smoothstep(0.9, 1.0, sin((r - uTime * 0.18) * 40.0)) * 0.12 * (1.0 - r);
    float ang = atan(vP.y, vP.x);
    float spokes = smoothstep(0.97, 1.0, abs(sin(ang * 12.0 + uTime * 0.2))) * 0.06 * smoothstep(0.2, 0.9, r);
    float flick = 1.0 - uFlicker * (0.5 + 0.5 * sin(uTime * 55.0));
    float a = (0.035 + edge * 0.6 + rings * 0.7 + spokes) * uOpacity * flick;
    gl_FragColor = vec4(uColor * (0.8 + edge * 1.2), a);
  }`;

export function makeField() {
  const uniforms = {
    uColor: { value: new THREE.Color(0x4ee8ff) },
    uTime: { value: 0 },
    uOpacity: { value: 1 },
    uFlicker: { value: 0 },
  };
  const domeMat = new THREE.ShaderMaterial({
    uniforms, vertexShader: FIELD_VERT, fragmentShader: DOME_FRAG,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  });
  const discMat = new THREE.ShaderMaterial({
    uniforms, vertexShader: FIELD_VERT, fragmentShader: DISC_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const g = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
  dome.scale.y = 0.5;
  dome.renderOrder = 5;
  g.add(dome);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 96), discMat);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.03;
  disc.renderOrder = 4;
  g.add(disc);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x7ff3ff, transparent: true, opacity: 0.95, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.985, 1.0, 128), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  g.add(ring);
  return { group: g, dome, disc, ring, ringMat, uniforms };
}

// ---------------- enemies ----------------
function legPivot(x, y, z, len, thick, m, rotY) {
  const p = new THREE.Group();
  p.position.set(x, y, z);
  p.rotation.y = rotY;
  const l = box(thick, thick, len, m, 0, 0, len / 2, false);
  l.rotation.x = 0.55;
  p.add(l);
  return p;
}

// Two alternating leg sets (tripod gait), each merged into a single mesh.
function groupLegs(r, inner) {
  const A = new THREE.Group(), B = new THREE.Group();
  r.legs.forEach((lp, i) => { inner.remove(lp); (i % 2 ? B : A).add(lp); });
  bakeStatic(A); bakeStatic(B);
  inner.add(A, B);
  r.legs = [A, B];
}

export function makeEnemy(type) {
  const g = new THREE.Group();
  const inner = new THREE.Group();
  g.add(inner);
  const r = { group: g, inner, legs: [], extra: {} };
  if (type === 'rusher') {
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x7a5a92, roughness: 0.5, metalness: 0.15, flatShading: true, emissive: 0x000000 });
    const legMat = mat('rLeg', { color: 0x4a3858, roughness: 0.6, flatShading: true });
    const b = mesh(new THREE.SphereGeometry(0.45, 7, 5), bodyMat);
    b.scale.set(1, 0.62, 1.25); b.position.y = 0.55;
    inner.add(b);
    const head = mesh(new THREE.SphereGeometry(0.26, 6, 4), bodyMat);
    head.position.set(0, 0.55, 0.55);
    inner.add(head);
    const eye = glow('eyeOrange', 0xff7a1a, 3.2);
    inner.add(box(0.12, 0.1, 0.08, eye, 0.11, 0.62, 0.78, false));
    inner.add(box(0.12, 0.1, 0.08, eye, -0.11, 0.62, 0.78, false));
    const spikeM = mat('rSpike', { color: 0x6b4a8a, roughness: 0.5, flatShading: true });
    for (let i = 0; i < 3; i++) {
      const s = mesh(new THREE.ConeGeometry(0.08, 0.32, 4), spikeM, false);
      s.position.set(0, 0.8, -0.2 + i * 0.22); s.rotation.x = -0.4;
      inner.add(s);
    }
    for (let i = 0; i < 6; i++) {
      const side = i < 3 ? 1 : -1;
      const k = i % 3;
      const lp = legPivot(side * 0.3, 0.55, -0.25 + k * 0.28, 0.75, 0.07, legMat, side * (Math.PI / 2) + (k - 1) * -0.5 * side);
      inner.add(lp);
      r.legs.push(lp);
    }
    groupLegs(r, inner);
    r.bodyMat = bodyMat;
    r.barY = 1.3;
  } else if (type === 'spitter') {
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x5f7a52, roughness: 0.55, flatShading: true, emissive: 0x000000 });
    const legMat = mat('sLeg', { color: 0x262e25, roughness: 0.6, flatShading: true });
    const b = mesh(new THREE.SphereGeometry(0.5, 7, 6), bodyMat);
    b.scale.set(1, 0.8, 1.05); b.position.y = 0.62;
    inner.add(b);
    const sacMat = new THREE.MeshStandardMaterial({ color: 0x8dff4a, emissive: 0x6dff2a, emissiveIntensity: 1.6, roughness: 0.3, transparent: true, opacity: 0.92 });
    const sac = mesh(new THREE.SphereGeometry(0.38, 8, 6), sacMat, false);
    sac.position.set(0, 1.0, -0.3);
    inner.add(sac);
    const mouth = mesh(new THREE.ConeGeometry(0.2, 0.4, 6), bodyMat);
    mouth.rotation.x = Math.PI / 2; mouth.position.set(0, 0.7, 0.55);
    inner.add(mouth);
    inner.add(box(0.12, 0.08, 0.08, glow('eyeGreen', 0xc8ff4a, 3), 0, 0.85, 0.48, false));
    for (let i = 0; i < 4; i++) {
      const side = i < 2 ? 1 : -1;
      const k = i % 2;
      const lp = legPivot(side * 0.32, 0.5, -0.15 + k * 0.32, 0.6, 0.09, legMat, side * (Math.PI / 2) + (k - 0.5) * -0.6 * side);
      inner.add(lp);
      r.legs.push(lp);
    }
    groupLegs(r, inner);
    r.bodyMat = bodyMat;
    r.extra.sac = sac;
    r.extra.sacMat = sacMat;
    r.barY = 2.0;
  } else if (type === 'brute' || type === 'elite') {
    const elite = type === 'elite';
    const s = elite ? 1.3 : 1;
    const bodyMat = new THREE.MeshStandardMaterial({ color: elite ? 0x7a3a32 : 0x6a5868, roughness: 0.55, flatShading: true, emissive: 0x000000 });
    const crack = glow(elite ? 'crackRed' : 'crackOrange', elite ? 0xff3a1a : 0xff8a2a, elite ? 3 : 2.4);
    const torso = box(1.35 * s, 1.15 * s, 1.0 * s, bodyMat, 0, 1.35 * s, 0);
    inner.add(torso);
    const head = box(0.6 * s, 0.5 * s, 0.55 * s, bodyMat, 0, 1.7 * s, 0.55 * s);
    inner.add(head);
    inner.add(box(0.12 * s, 0.08 * s, 0.05, crack, 0.15 * s, 1.75 * s, 0.84 * s, false));
    inner.add(box(0.12 * s, 0.08 * s, 0.05, crack, -0.15 * s, 1.75 * s, 0.84 * s, false));
    // cracks on torso
    for (let i = 0; i < 4; i++) {
      inner.add(box(0.06 * s, 0.4 * s, 0.05, crack, (-0.45 + i * 0.3) * s, (1.25 + (i % 2) * 0.2) * s, 0.51 * s, false));
    }
    const armL = new THREE.Group(); armL.position.set(0.85 * s, 1.75 * s, 0.1);
    const armR = new THREE.Group(); armR.position.set(-0.85 * s, 1.75 * s, 0.1);
    armL.add(box(0.45 * s, 1.3 * s, 0.5 * s, bodyMat, 0, -0.6 * s, 0.1));
    armR.add(box(0.45 * s, 1.3 * s, 0.5 * s, bodyMat, 0, -0.6 * s, 0.1));
    armL.add(box(0.55 * s, 0.4 * s, 0.6 * s, crack, 0, -1.3 * s, 0.1, false));
    armR.add(box(0.55 * s, 0.4 * s, 0.6 * s, crack, 0, -1.3 * s, 0.1, false));
    inner.add(armL, armR);
    const legMat = mat('bLeg', { color: 0x2a2228, roughness: 0.7, flatShading: true });
    const legL = new THREE.Group(); legL.position.set(0.35 * s, 0.8 * s, 0);
    const legR = new THREE.Group(); legR.position.set(-0.35 * s, 0.8 * s, 0);
    legL.add(box(0.4 * s, 0.8 * s, 0.45 * s, legMat, 0, -0.4 * s, 0));
    legR.add(box(0.4 * s, 0.8 * s, 0.45 * s, legMat, 0, -0.4 * s, 0));
    inner.add(legL, legR);
    const spikeM = elite ? glow('eliteSpike', 0xff5a2a, 1.5, { flatShading: true }) : mat('bSpike', { color: 0x6e5a70, flatShading: true });
    const nSp = elite ? 7 : 4;
    for (let i = 0; i < nSp; i++) {
      const sp = mesh(new THREE.ConeGeometry(0.14 * s, (elite ? 0.8 : 0.5) * s, 4), spikeM, false);
      sp.position.set((-0.45 + (i / (nSp - 1)) * 0.9) * s, 2.0 * s, -0.25 * s);
      sp.rotation.x = -0.5;
      inner.add(sp);
    }
    r.bodyMat = bodyMat;
    r.extra.armL = armL; r.extra.armR = armR;
    r.legs = [legL, legR];
    r.barY = (elite ? 3.6 : 2.7);
  } else if (type === 'disruptor') {
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x6a3bb0, emissive: 0x7a3bff, emissiveIntensity: 0.9, roughness: 0.3, flatShading: true });
    const hover = new THREE.Group();
    hover.position.y = 1.4;
    inner.add(hover);
    const core = mesh(new THREE.OctahedronGeometry(0.55, 0), bodyMat);
    core.scale.y = 1.3;
    hover.add(core);
    const ringMat = glow('disRing', 0xc78bff, 2.6);
    const ring = mesh(new THREE.TorusGeometry(0.85, 0.05, 6, 28), ringMat, false);
    ring.rotation.x = Math.PI / 2;
    hover.add(ring);
    const ant = box(0.06, 0.7, 0.06, mat('disAnt', { color: 0x2a2236 }), 0, 0.95, 0);
    hover.add(ant);
    const tip = mesh(new THREE.SphereGeometry(0.1, 8, 6), glow('disTip', 0xff5af0, 4), false);
    tip.position.y = 1.35;
    hover.add(tip);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.6, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.03;
    g.add(shadow);
    r.bodyMat = bodyMat;
    r.extra.hover = hover; r.extra.ring = ring; r.extra.tip = tip;
    r.barY = 3.6;
  }
  // red threat ring on the ground so enemies read instantly against the floor
  const rr = { rusher: 0.62, spitter: 0.7, brute: 1.35, disruptor: 0.75, elite: 1.9 }[type];
  const ring = new THREE.Mesh(new THREE.RingGeometry(rr * 0.82, rr, 24),
    new THREE.MeshBasicMaterial({ color: type === 'disruptor' ? 0xc86bff : type === 'elite' ? 0xff5a1a : 0xff3a4a, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }));
  ring.material.userData.shared = true;
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04;
  g.add(ring);
  inner.scale.setScalar(type === 'brute' || type === 'elite' ? 1.1 : 1.25);
  return r;
}

// ---------------- world-space health bar ----------------
export function makeBar(width, color, height = 0.13) {
  const g = new THREE.Group();
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(width + 0.06, height + 0.06),
    new THREE.MeshBasicMaterial({ color: 0x0b0b10, transparent: true, opacity: 0.8, depthTest: false, depthWrite: false }));
  const fg = new THREE.PlaneGeometry(width, height);
  fg.translate(width / 2, 0, 0);
  const fill = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false }));
  fill.position.x = -width / 2;
  fill.position.z = 0.001;
  bg.renderOrder = 998; fill.renderOrder = 999;
  g.add(bg, fill);
  g.userData.fill = fill;
  return g;
}

// ---------------- pickups / objectives ----------------
export function makeCache(rare) {
  const g = new THREE.Group();
  const color = rare ? 0xc85cff : 0x6dff5a;
  const metal = mat('cacheMetal', { color: 0x585e6a, metalness: 0.7, roughness: 0.4 });
  const fluid = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.0, transparent: true, opacity: 0.9, roughness: 0.2 });
  const s = rare ? 1.25 : 1;
  const base = mesh(new THREE.CylinderGeometry(0.55 * s, 0.65 * s, 0.18, 10), metal, true, true);
  base.position.y = 0.09;
  g.add(base);
  const can = mesh(new THREE.CylinderGeometry(0.3 * s, 0.3 * s, 0.85 * s, 12), fluid, false);
  can.position.y = 0.18 + 0.43 * s;
  g.add(can);
  const cap = mesh(new THREE.CylinderGeometry(0.34 * s, 0.34 * s, 0.12, 12), metal);
  cap.position.y = 0.18 + 0.86 * s + 0.04;
  g.add(cap);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const rod = box(0.06, 0.85 * s, 0.06, metal, Math.sin(a) * 0.33 * s, 0.18 + 0.43 * s, Math.cos(a) * 0.33 * s, false);
    g.add(rod);
  }
  const beamMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: rare ? 0.28 : 0.2, blending: THREE.AdditiveBlending, depthWrite: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, 16, 8, 1, true), beamMat);
  beam.position.y = 8;
  g.add(beam);
  const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.8 * s, 0.92 * s, 32), ringMat);
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04;
  g.add(ring);
  return { group: g, can, beam, ring, fluid, beamMat, ringMat };
}

// Gold supply crate: holds loot (weapon / grenades / power-up)
export function makeLootCrate() {
  const g = new THREE.Group();
  const gold = 0xffb43a;
  const metal = mat('lcMetal', { color: 0x3a3e48, metalness: 0.7, roughness: 0.4 });
  const trim = new THREE.MeshStandardMaterial({ color: gold, emissive: gold, emissiveIntensity: 1.6, roughness: 0.4 });
  const lid = new THREE.Group();
  g.add(box(1.3, 0.7, 0.9, metal, 0, 0.35, 0));
  g.add(box(1.36, 0.1, 0.96, trim, 0, 0.12, 0, false));
  g.add(box(0.14, 0.72, 0.96, trim, -0.45, 0.36, 0, false));
  g.add(box(0.14, 0.72, 0.96, trim, 0.45, 0.36, 0, false));
  lid.add(box(1.36, 0.16, 0.96, metal, 0, 0, 0));
  lid.add(box(0.4, 0.06, 0.4, trim, 0, 0.1, 0, false));
  lid.position.y = 0.78;
  g.add(lid);
  const beamMat = new THREE.MeshBasicMaterial({ color: gold, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 16, 8, 1, true), beamMat);
  beam.position.y = 8;
  g.add(beam);
  const ringMat = new THREE.MeshBasicMaterial({ color: gold, transparent: true, opacity: 0.85, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.05, 1.2, 32), ringMat);
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04;
  g.add(ring);
  // floating "?" diamond so it reads as loot from far away
  const gem = mesh(new THREE.OctahedronGeometry(0.28, 0), trim, false);
  gem.position.y = 1.7;
  g.add(gem);
  return { group: g, can: gem, beam, ring, beamMat, ringMat, lid };
}

// Survey node: a small sensor pylon that holds a zone's specimen
export function makeSurveyNode(color) {
  const g = new THREE.Group();
  const metal = mat('nodeMetal', { color: 0x4a505e, metalness: 0.7, roughness: 0.4 });
  const c = new THREE.Color(color);
  const glowM = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 2.4, roughness: 0.3 });
  const base = mesh(new THREE.CylinderGeometry(0.7, 0.9, 0.3, 6), metal, true, true);
  base.position.y = 0.15;
  g.add(base);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const fin = box(0.12, 1.1, 0.4, metal, Math.sin(a) * 0.45, 0.8, Math.cos(a) * 0.45);
    fin.rotation.y = a;
    g.add(fin);
  }
  const pod = mesh(new THREE.OctahedronGeometry(0.34, 0), glowM, false);
  pod.position.y = 1.6;
  pod.scale.y = 1.5;
  g.add(pod);
  const beamMat = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.22, 16, 6, 1, true), beamMat);
  beam.position.y = 8;
  g.add(beam);
  const ringMat = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.8, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.08, 6), ringMat);
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04;
  g.add(ring);
  return { group: g, can: pod, beam, ring, beamMat, ringMat };
}

export function makeSpecOrb(color) {
  const g = new THREE.Group();
  const c = new THREE.Color(color);
  const m = mesh(new THREE.OctahedronGeometry(0.22, 0), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 3, roughness: 0.3 }), false);
  m.scale.y = 1.5;
  g.add(m);
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.4, 16), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
  g.add(halo);
  return g;
}

export function makeTurret() {
  const g = new THREE.Group();
  const metal = mat('turMetal', { color: 0x5a606e, metalness: 0.7, roughness: 0.4 });
  const glowM = glow('turGlow', 0x5ef0ff, 2.6);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = box(0.12, 0.8, 0.12, metal, Math.sin(a) * 0.35, 0.35, Math.cos(a) * 0.35);
    leg.rotation.set(Math.cos(a) * 0.4, 0, -Math.sin(a) * 0.4);
    g.add(leg);
  }
  const head = new THREE.Group();
  head.position.y = 0.85;
  head.add(box(0.5, 0.36, 0.6, metal, 0, 0, 0));
  head.add(box(0.12, 0.12, 0.7, metal, 0.12, 0, 0.5));
  head.add(box(0.12, 0.12, 0.7, metal, -0.12, 0, 0.5));
  head.add(box(0.3, 0.08, 0.06, glowM, 0, 0.1, 0.31, false));
  g.add(head);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.72, 24), new THREE.MeshBasicMaterial({ color: 0x5ef0ff, transparent: true, opacity: 0.7, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04;
  g.add(ring);
  return { group: g, head };
}

export function makeGrenade() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.SphereGeometry(0.16, 8, 6), mat('nade', { color: 0x3a4a2a, roughness: 0.6 }), false));
  g.add(box(0.08, 0.08, 0.08, glow('nadeLight', 0xff3a2a, 4), 0, 0.15, 0, false));
  return g;
}

export function makeOrb(kind) {
  let m;
  if (kind === 'xp') {
    m = mesh(new THREE.OctahedronGeometry(0.17, 0), glow('orbXp', 0x5affc8, 2.6), false);
    m.scale.y = 1.4;
  } else if (kind === 'grenade') {
    m = makeGrenade();
    m.scale.setScalar(1.6);
  } else if (kind === 'credit') m = mesh(new THREE.OctahedronGeometry(0.16, 0), glow('orbCredit', 0xffd23a, 2.5), false);
  else if (kind === 'tech') m = mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), glow('orbTech', 0x4adcff, 2.5), false);
  else if (kind === 'health') {
    m = new THREE.Group();
    const hm = glow('orbHealth', 0x5aff7a, 2.5);
    m.add(box(0.42, 0.13, 0.13, hm, 0, 0, 0, false));
    m.add(box(0.13, 0.42, 0.13, hm, 0, 0, 0, false));
  } else if (kind === 'bio') m = mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.38, 8), glow('orbBio', 0x6dff5a, 2.5), false);
  else m = mesh(new THREE.IcosahedronGeometry(0.2, 0), glow('orbMut', 0xc85cff, 2.8), false);
  const g = new THREE.Group();
  g.add(m);
  return g;
}

export function makeExtractionPad() {
  const g = new THREE.Group();
  const metal = mat('padMetal', { color: 0x3a3e48, metalness: 0.6, roughness: 0.5 });
  const plat = mesh(new THREE.CylinderGeometry(4.6, 4.9, 0.22, 6), metal, false, true);
  plat.position.y = 0.11;
  g.add(plat);
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xff9a2a, transparent: true, opacity: 0.9, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(4.25, 4.55, 6), lineMat);
  ring.rotation.x = -Math.PI / 2; ring.rotation.z = Math.PI / 6 * 0; ring.position.y = 0.24;
  g.add(ring);
  const ring2 = new THREE.Mesh(new THREE.RingGeometry(2.3, 2.45, 48), lineMat);
  ring2.rotation.x = -Math.PI / 2; ring2.position.y = 0.24;
  g.add(ring2);
  const progMat = new THREE.MeshBasicMaterial({ color: 0x5ef0ff, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
  const prog = new THREE.Mesh(new THREE.RingGeometry(3.3, 3.75, 64, 1, 0, 0.001), progMat);
  prog.rotation.x = -Math.PI / 2; prog.position.y = 0.26;
  g.add(prog);
  const H = mat('padH', { color: 0xd9a52b, roughness: 0.6 });
  g.add(box(0.3, 0.02, 1.6, H, -0.5, 0.23, 0, false));
  g.add(box(0.3, 0.02, 1.6, H, 0.5, 0.23, 0, false));
  g.add(box(1.0, 0.02, 0.3, H, 0, 0.23, 0, false));
  const lamps = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const post = box(0.2, 1.4, 0.2, metal, Math.sin(a) * 5.1, 0.7, Math.cos(a) * 5.1);
    g.add(post);
    const lm = new THREE.MeshStandardMaterial({ color: 0xff9a2a, emissive: 0xff9a2a, emissiveIntensity: 2.5 });
    const l = box(0.32, 0.2, 0.32, lm, Math.sin(a) * 5.1, 1.45, Math.cos(a) * 5.1, false);
    g.add(l);
    lamps.push(lm);
  }
  return { group: g, ring, ring2, lineMat, prog, progMat, lamps };
}

export function makeDropship() {
  const g = new THREE.Group();
  const hull = mat('shipHull', { color: 0x6a707e, metalness: 0.6, roughness: 0.4, flatShading: true });
  const dark = mat('shipDark', { color: 0x2a2d35, metalness: 0.6, roughness: 0.5 });
  const eng = glow('shipEngine', 0x5ef0ff, 3.5);
  g.add(box(2.6, 1.3, 5.6, hull, 0, 0, 0));
  g.add(box(2.0, 0.8, 1.6, dark, 0, 0.5, 2.4));
  g.add(box(1.6, 0.25, 0.6, glow('shipGlass', 0xffb93a, 1.8), 0, 0.75, 3.0, false));
  g.add(box(7.4, 0.25, 1.8, hull, 0, 0.1, -0.6));
  for (const sx of [-3.4, 3.4]) {
    g.add(box(1.0, 1.0, 2.4, dark, sx, -0.1, -0.6));
    const e = box(0.8, 0.8, 0.2, eng, sx, -0.1, -1.85, false);
    g.add(e);
    const d = box(0.7, 0.15, 0.7, eng, sx, -0.65, -0.6, false);
    g.add(d);
  }
  g.add(box(0.2, 1.2, 1.4, hull, 0, 1.0, -2.2));
  return g;
}

export function makeGenerator() {
  const g = new THREE.Group();
  const m = mat('genMetal', { color: 0x585e6a, metalness: 0.6, roughness: 0.5 });
  g.add(box(1.6, 1.1, 1.2, m, 0, 0.55, 0));
  g.add(box(1.7, 0.2, 1.3, mat('crateYellow', { color: 0xd9a52b }), 0, 1.15, 0, false));
  g.add(box(0.1, 1.6, 0.1, m, 0.5, 1.9, 0));
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xffa22a, emissive: 0xffa22a, emissiveIntensity: 3 });
  g.add(box(0.25, 0.25, 0.25, lightMat, 0.5, 2.75, 0, false));
  return { group: g, lightMat };
}

let chevTex = null;
export function chevronTexture() {
  if (chevTex) return chevTex;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(14, 30); g.lineTo(64, 80); g.lineTo(114, 30); g.lineTo(114, 62); g.lineTo(64, 112); g.lineTo(14, 62);
  g.closePath(); g.fill();
  chevTex = new THREE.CanvasTexture(c);
  return chevTex;
}

// Merge static meshes under `root` into one mesh per material (big draw-call saver).
// `filter(mesh)` decides which meshes may be merged (animated parts must be excluded).
export function bakeStatic(root, filter) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  const victims = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    if (filter && !filter(o)) return;
    const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    let geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    geo.applyMatrix4(m);
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    if (!geo.attributes.normal) geo.computeVertexNormals();
    geo.morphAttributes = {};
    const key = o.material.uuid + '|' + o.castShadow + '|' + o.receiveShadow + '|' + o.renderOrder;
    if (!buckets.has(key)) buckets.set(key, { mat: o.material, cast: o.castShadow, recv: o.receiveShadow, order: o.renderOrder, geos: [] });
    buckets.get(key).geos.push(geo);
    victims.push(o);
  });
  for (const o of victims) o.parent.remove(o);
  for (const b of buckets.values()) {
    const merged = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, b.mat);
    mesh.castShadow = b.cast; mesh.receiveShadow = b.recv; mesh.renderOrder = b.order;
    root.add(mesh);
  }
  return root;
}
