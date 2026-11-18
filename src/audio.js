// Tiny procedural audio layer (WebAudio). No audio files needed.
export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.last = {};
    this.heartT = 0;
    this.outside = 0; // 0..1 danger intensity while outside
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    this.master.connect(comp);
    // noise buffer
    const len = ctx.sampleRate * 1.5;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    // field hum
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 420;
    this.humGain.connect(lp); lp.connect(this.master);
    for (const f of [55, 82.5, 110.3]) {
      const o = ctx.createOscillator();
      o.type = f === 55 ? 'sine' : 'triangle';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = f === 55 ? 0.5 : 0.18;
      o.connect(g); g.connect(this.humGain);
      o.start();
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.05);
  }

  throttle(key, ms) {
    const now = performance.now();
    if (this.last[key] && now - this.last[key] < ms) return false;
    this.last[key] = now;
    return true;
  }

  tone(freq, dur, { type = 'sine', vol = 0.2, slide = null, attack = 0.005, delay = 0 } = {}) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  noise(dur, { vol = 0.2, freq = 2000, type = 'lowpass', q = 0.8, delay = 0, slide = null } = {}) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (slide) f.frequency.exponentialRampToValueAtTime(slide, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }

  shoot(kind) {
    if (kind === 'arc') {
      this.noise(0.16, { vol: 0.25, freq: 4000, type: 'bandpass', slide: 1200, q: 4 });
      this.tone(1600, 0.12, { type: 'sawtooth', vol: 0.06, slide: 400 });
      return;
    }
    if (kind === 'minigun') {
      if (!this.throttle('mg', 40)) return;
      this.noise(0.05, { vol: 0.16, freq: 2600, slide: 900 });
      return;
    }
    if (kind === 'shotgun') {
      this.noise(0.28, { vol: 0.5, freq: 2400, slide: 300 });
      this.tone(120, 0.16, { type: 'square', vol: 0.18, slide: 45 });
    } else {
      this.noise(0.07, { vol: 0.22, freq: 3200, slide: 900 });
      this.tone(210, 0.06, { type: 'square', vol: 0.06, slide: 90 });
    }
  }
  hit() { if (this.throttle('hit', 45)) this.tone(780 + Math.random() * 200, 0.05, { type: 'triangle', vol: 0.06 }); }
  kill(big) {
    if (!this.throttle('kill', 40)) return;
    this.noise(big ? 0.5 : 0.18, { vol: big ? 0.4 : 0.16, freq: big ? 900 : 1600, slide: 120 });
    this.tone(big ? 140 : 300, big ? 0.4 : 0.12, { type: 'sawtooth', vol: big ? 0.12 : 0.05, slide: 50 });
  }
  hurt() { if (this.throttle('hurt', 160)) { this.tone(140, 0.16, { type: 'square', vol: 0.12, slide: 70 }); this.noise(0.1, { vol: 0.12, freq: 700 }); } }
  pickup() { if (this.throttle('pick', 50)) this.tone(900, 0.07, { type: 'triangle', vol: 0.07, slide: 1400 }); }
  sample() { this.tone(660, 0.1, { type: 'triangle', vol: 0.14 }); this.tone(990, 0.16, { type: 'triangle', vol: 0.14, delay: 0.08 }); }
  bank() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.18, { type: 'triangle', vol: 0.11, delay: i * 0.06 })); }
  warn() { if (this.throttle('warn', 300)) this.tone(880, 0.12, { type: 'square', vol: 0.08 }); }
  alarm() { if (this.throttle('alarm', 900)) { this.tone(700, 0.2, { type: 'sawtooth', vol: 0.1 }); this.tone(520, 0.25, { type: 'sawtooth', vol: 0.1, delay: 0.22 }); } }
  dash() { this.noise(0.18, { vol: 0.18, freq: 600, type: 'bandpass', slide: 2400, q: 2 }); }
  reload() { this.tone(400, 0.05, { type: 'square', vol: 0.06 }); this.tone(600, 0.05, { type: 'square', vol: 0.06, delay: 0.12 }); }
  slam() { this.noise(0.5, { vol: 0.5, freq: 500, slide: 60 }); this.tone(70, 0.4, { type: 'sine', vol: 0.4, slide: 35 }); }
  spit() { if (this.throttle('spit', 120)) this.noise(0.15, { vol: 0.12, freq: 1200, type: 'bandpass', slide: 400, q: 3 }); }
  emp() { this.noise(0.9, { vol: 0.5, freq: 3000, slide: 80 }); this.tone(1200, 0.8, { type: 'sawtooth', vol: 0.15, slide: 60 }); }
  fieldUp() { this.tone(220, 0.5, { type: 'sine', vol: 0.18, slide: 660 }); this.tone(330, 0.5, { type: 'triangle', vol: 0.08, slide: 990, delay: 0.05 }); }
  fieldDown() { this.tone(660, 0.6, { type: 'sawtooth', vol: 0.12, slide: 80 }); }
  explosion() { this.noise(0.6, { vol: 0.5, freq: 1400, slide: 60 }); this.tone(90, 0.4, { type: 'sine', vol: 0.3, slide: 30 }); }
  upgrade() { [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.25, { type: 'triangle', vol: 0.1, delay: i * 0.07 })); }
  levelUp() { [523, 784, 1046, 1568].forEach((f, i) => this.tone(f, 0.22, { type: 'triangle', vol: 0.12, delay: i * 0.05 })); }
  ui() { this.tone(520, 0.05, { type: 'triangle', vol: 0.08 }); }
  denied() { this.tone(180, 0.12, { type: 'square', vol: 0.08 }); }
  waveStart() { this.tone(330, 0.3, { type: 'sawtooth', vol: 0.09 }); this.tone(247, 0.4, { type: 'sawtooth', vol: 0.09, delay: 0.25 }); }
  success() { [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.35, { type: 'triangle', vol: 0.12, delay: i * 0.1 })); }
  fail() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.4, { type: 'sawtooth', vol: 0.08, delay: i * 0.16 })); }
  engine() { this.noise(1.4, { vol: 0.35, freq: 300, slide: 1200 }); }
  charge(t) { // t 0..1, called while charging
    if (this.throttle('charge', 260 - t * 180)) this.tone(300 + t * 900, 0.08, { type: 'square', vol: 0.06 + t * 0.06 });
  }

  // continuous state: inside/outside the field
  update(dt, insideField, fieldOn, outsideDanger) {
    if (!this.ctx) return;
    const target = this.muted ? 0 : insideField && fieldOn ? 0.09 : 0.015;
    this.humGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.25);
    if (outsideDanger > 0) {
      this.heartT -= dt;
      if (this.heartT <= 0) {
        this.heartT = 1.0 - outsideDanger * 0.55;
        this.tone(58, 0.12, { type: 'sine', vol: 0.25 + outsideDanger * 0.2 });
        this.tone(52, 0.12, { type: 'sine', vol: 0.2 + outsideDanger * 0.2, delay: 0.16 });
      }
    } else this.heartT = 0.2;
  }
}

export const sfx = new Sound();
