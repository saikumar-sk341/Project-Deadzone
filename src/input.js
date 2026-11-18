// Keyboard + mouse + touch input. Movement is returned in screen space
// (x = right, y = up) and converted to world space by the game.
export class Input {
  constructor() {
    this.keys = new Set();
    this.edges = new Set();
    this.mouse = { x: innerWidth / 2, y: innerHeight / 2, down: false, moved: false };
    this.touchMode = false;
    this.joy = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.touchBtn = { fire: false, interact: false };
    this.enabled = true;
    // phones/tablets start in touch mode so the controls are visible immediately
    if (matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches) {
      queueMicrotask(() => this.setTouchMode(true));
    }

    addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.edges.add(e.code);
      this.keys.add(e.code);
      if (this.touchMode && !e.repeat) this.setTouchMode(false);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouse.down = false; this.touchBtn.fire = false; this.touchBtn.interact = false; this.joy.active = false; });
    addEventListener('mousemove', (e) => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.moved = true; });
    addEventListener('contextmenu', (e) => { if (e.target && e.target.id === 'gl') e.preventDefault(); });
    addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') { this.setTouchMode(true); return; }
      if (e.target && e.target.id === 'gl' && e.button === 0) this.mouse.down = true;
      if (e.target && e.target.id === 'gl' && e.button === 2) this.edges.add('MouseRight');
    });
    addEventListener('pointerup', (e) => { if (e.pointerType !== 'touch' && e.button === 0) this.mouse.down = false; });
  }

  setTouchMode(on) {
    if (this.touchMode === on) return;
    this.touchMode = on;
    document.body.classList.toggle('touch', on);
  }

  // Wire up on-screen touch controls (created by the HUD).
  bindTouch(zone, base, knob, buttons) {
    this.joyBase = base; this.joyKnob = knob;
    const R = 56;
    zone.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
      this.setTouchMode(true);
      const j = this.joy;
      j.active = true; j.id = e.pointerId; j.ox = e.clientX; j.oy = e.clientY; j.x = 0; j.y = 0;
      base.style.display = 'block';
      base.style.left = e.clientX + 'px'; base.style.top = e.clientY + 'px';
      knob.style.transform = 'translate(-50%,-50%)';
      zone.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    zone.addEventListener('pointermove', (e) => {
      const j = this.joy;
      if (!j.active || e.pointerId !== j.id) return;
      let dx = e.clientX - j.ox, dy = e.clientY - j.oy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx = dx / d * R; dy = dy / d * R; }
      j.x = dx / R; j.y = -dy / R;
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    });
    const end = (e) => {
      const j = this.joy;
      if (e.pointerId !== j.id) return;
      j.active = false; j.x = 0; j.y = 0; j.id = null;
      base.style.display = 'none';
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);

    const hold = (btn, key) => {
      btn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.setTouchMode(true); this.touchBtn[key] = true; btn.classList.add('down'); btn.setPointerCapture(e.pointerId); });
      const up = () => { this.touchBtn[key] = false; btn.classList.remove('down'); };
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
    };
    const tap = (btn, code) => {
      btn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.setTouchMode(true); this.edges.add(code); btn.classList.add('down'); });
      const up = () => btn.classList.remove('down');
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
    };
    hold(buttons.interact, 'interact');
    tap(buttons.grenade, 'KeyF');
    tap(buttons.dash, 'Space');
    tap(buttons.skill, 'KeyQ');
    tap(buttons.ready, 'KeyG');
    tap(buttons.pause, 'Escape');
  }

  pressed(code) { return this.edges.has(code); }
  down(code) { return this.keys.has(code); }

  move() {
    if (this.joy.active) {
      const m = Math.hypot(this.joy.x, this.joy.y);
      if (m < 0.12) return { x: 0, y: 0 };
      return { x: this.joy.x, y: this.joy.y };
    }
    let x = 0, y = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    const m = Math.hypot(x, y);
    if (m > 0) { x /= m; y /= m; }
    return { x, y };
  }

  // touch players auto-fire (handled by the game); desktop holds the mouse button
  firing() { return this.touchMode ? false : this.mouse.down; }
  interacting() { return this.keys.has('KeyE') || this.touchBtn.interact; }

  endFrame() { this.edges.clear(); }
  reset() {
    this.keys.clear(); this.edges.clear(); this.mouse.down = false;
    this.touchBtn.fire = false; this.touchBtn.interact = false;
    this.joy.active = false; this.joy.x = 0; this.joy.y = 0;
    if (this.joyBase) this.joyBase.style.display = 'none';
  }
}
