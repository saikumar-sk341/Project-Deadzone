import * as THREE from 'three';
import { World } from './world.js';
import { FX } from './fx.js';
import { Input } from './input.js';
import { HUD } from './hud.js';
import { Meta, SKINS } from './meta.js';
import { Game } from './game.js';
import { UI } from './ui.js';
import { sfx } from './audio.js';
import { makeBeacon, makeField } from './models.js';

class App {
  constructor() {
    const root = document.getElementById('app');
    this.meta = new Meta();
    const st = this.meta.data.settings;
    this.world = new World(root, st.quality);
    const wl = document.createElement('div');
    wl.id = 'ftext-layer';
    root.appendChild(wl);
    this.fx = new FX(this.world, wl);
    this.input = new Input();
    this.hud = new HUD(root, this.world, this.input);
    this.ui = new UI(root, this);
    this.game = new Game(this);
    this.state = 'menu';
    this.menuView = 'title';
    this.applySettings();
    this.buildMenuScene();

    const params = new URLSearchParams(location.search);
    this.debug = params.has('debug');
    if (this.debug) {
      // Test hooks: run the simulation without rendering (used by automated playtests).
      window.DZ = {
        app: this, game: this.game, THREE,
        sim: (seconds, each) => {
          const steps = Math.round(seconds * 30);
          for (let i = 0; i < steps; i++) {
            if (each && each(this.game) === false) break;
            if (this.state !== 'mission') break;
            this.game.update(1 / 30);
            this.input.endFrame();
          }
        },
      };
    }

    this.last = performance.now();
    this.t = 0;
    const loop = (now) => {
      requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.frame(dt);
    };
    requestAnimationFrame(loop);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'mission' && !this.game.paused && !this.game.over) this.togglePause(true);
    });

    this.ui.title();
    document.getElementById('boot')?.remove();
  }

  buildMenuScene() {
    const g = new THREE.Group();
    const b = makeBeacon();
    const f = makeField();
    f.group.scale.setScalar(8.5);
    g.add(b.group, f.group);
    this.world.scene.add(g);
    this.menu = { group: g, field: f, beacon: b };
    this.updateMenuSkin();
  }

  updateMenuSkin() {
    const skin = SKINS[this.meta.data.skins.active] || SKINS.cyan;
    this.menu.field.uniforms.uColor.value.setHex(skin.color);
    this.menu.field.ringMat.color.setHex(skin.color);
  }

  applySettings() {
    const st = this.meta.data.settings;
    sfx.setMuted(st.muted);
    this.world.setQuality(st.quality);
    this.hud.setLens(st.lens);
    if (this.menu) this.updateMenuSkin();
  }

  setMuted(m) {
    this.meta.data.settings.muted = m;
    sfx.setMuted(m);
    this.meta.save();
  }

  toggleLens() {
    const st = this.meta.data.settings;
    st.lens = !st.lens;
    this.hud.setLens(st.lens);
    this.meta.save();
  }

  frame(dt) {
    this.t += dt;
    const inp = this.input;
    if (this.state === 'mission') {
      const g = this.game;
      if (inp.pressed('Escape') || inp.pressed('KeyP')) {
        if (!g.over && !this.ui.screens.upgrade.classList.contains('hidden')) { /* upgrade choice open */ }
        else if (!g.over) this.togglePause(!this.pausedByMenu);
      }
      if (inp.pressed('KeyI') && !this.pausedByMenu) this.toggleLens();
      if (inp.pressed('KeyM')) this.setMuted(!this.meta.data.settings.muted);
      g.update(dt);
    } else {
      // slow cinematic orbit around the beacon on menu screens;
      // on the HQ the beacon sits to the right of the menu panel
      const a = this.t * 0.06;
      this.world.setZoom(0.85);
      let ox = 0, oz = 0;
      if (this.menuView === 'hq' && innerWidth / innerHeight > 1.15) {
        const vw = this.world.baseViewH * this.world.zoom * (innerWidth / innerHeight);
        const k = vw * 0.22;
        ox = -k * Math.SQRT1_2; oz = k * Math.SQRT1_2;
      }
      this.world.follow(Math.cos(a) * 2 + ox, Math.sin(a) * 2 + oz + 1, dt, false);
      const f = this.menu.field;
      f.uniforms.uTime.value = this.t;
      this.menu.beacon.core.rotation.y += dt;
      this.menu.beacon.ring.rotation.z += dt * 1.5;
      this.fx.update(dt);
    }
    this.world.render();
    inp.endFrame();
  }

  deploy(opts) {
    sfx.init();
    const d = this.meta.data;
    if (opts.operative && !d.unlocked[opts.operative]) opts.operative = 'assault';
    if (opts.weapon === 'shotgun' && !d.armory.shotgun) opts.weapon = 'ar';
    this.lastOpts = opts;
    this.ui.hideAll();
    this.menu.group.visible = false;
    this.pausedByMenu = false;
    this.state = 'mission';
    this.game.start(opts);
  }

  restart() {
    this.ui.pause(false);
    this.game.over = true;
    this.game.dispose();
    this.deploy(this.lastOpts || { operative: 'assault', weapon: 'ar' });
  }

  abandon() {
    this.ui.pause(false);
    this.game.over = true;
    this.game.dispose();
    this.toMenu();
    this.ui.hq();
  }

  setMenuView(v) { this.menuView = v; }

  toMenu() {
    this.state = 'menu';
    this.pausedByMenu = false;
    this.hud.show(false);
    this.menu.group.visible = true;
    this.updateMenuSkin();
    this.world.follow(0, 2, 0, true);
  }

  togglePause(on) {
    if (this.state !== 'mission' || this.game.over) return;
    this.pausedByMenu = on;
    this.game.paused = on || !this.ui.screens.upgrade.classList.contains('hidden');
    this.input.reset();
    this.ui.pause(on);
  }

  showUpgrade(cards, cb, level) {
    this.input.reset();
    this.ui.upgrade(cards, (id) => {
      cb(id);
      if (this.pausedByMenu) this.game.paused = true;
    }, level);
  }

  missionOver(result, metaOut) {
    setTimeout(() => {
      this.game.dispose();
      this.toMenu();
      this.meta.save();
      this.ui.results(result, metaOut);
    }, 400);
  }
}

window.addEventListener('load', () => {
  try {
    new App();
  } catch (e) {
    console.error(e);
    const b = document.getElementById('boot');
    if (b) b.innerHTML = `<div>Could not start WebGL.<br><small>${String(e.message || e)}</small></div>`;
  }
});
