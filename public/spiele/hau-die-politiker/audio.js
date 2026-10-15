// HAU DIE „POLITIKER“ – Ton: alles per WebAudio erzeugt, keine Dateien. Der AudioContext entsteht erst nach der
// ersten Bedienung (unlock). Stummschalten wirkt sofort und vollständig (Master-Gain = 0, keine neuen Töne).

export class Sound {
  constructor() { this.ctx = null; this.master = null; this.muted = false; this.last = {}; }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    } catch (e) { this.ctx = null; }
  }
  setMuted(m) {
    this.muted = !!m;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
  }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); }
  resume() { if (this.ctx && !this.muted && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); }

  _ok(name, gap) {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return false;
    const t = this.ctx.currentTime;
    if (gap && this.last[name] && t - this.last[name] < gap) return false;
    this.last[name] = t;
    return true;
  }
  _tone(freq, dur, type = 'sine', vol = 0.3, when = 0, slideTo = null) {
    const c = this.ctx, t = c.currentTime + when;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.03);
  }
  _noise(dur, vol = 0.3, hp = 400, when = 0) {
    const c = this.ctx, n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = buf; f.type = 'highpass'; f.frequency.value = hp; g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(this.master); s.start(c.currentTime + when);
  }

  play(name, arg) {
    if (!this._ok(name, name === 'tap' ? 0.05 : 0.03)) return;
    switch (name) {
      case 'hit': this._noise(0.09, 0.35, 900); this._tone(220, 0.12, 'square', 0.22, 0, 90); this._tone(660 + Math.min(arg || 0, 12) * 40, 0.1, 'triangle', 0.14, 0.02); break;
      case 'miss': this._noise(0.1, 0.16, 1800); this._tone(180, 0.1, 'sine', 0.12, 0, 110); break;
      case 'helm': this._tone(900, 0.12, 'square', 0.18, 0, 500); this._noise(0.08, 0.2, 2500); break;
      case 'bosshit': this._tone(150, 0.2, 'sawtooth', 0.22, 0, 70); this._noise(0.12, 0.3, 600); break;
      case 'kill': this._tone(520, 0.08, 'triangle', 0.14, 0.03); this._tone(780, 0.1, 'triangle', 0.12, 0.08); break;
      case 'boss': this._tone(110, 0.5, 'sawtooth', 0.22, 0, 55); this._tone(165, 0.5, 'square', 0.1, 0.05, 80); break;
      case 'warn': this._tone(740, 0.09, 'square', 0.1); this._tone(740, 0.09, 'square', 0.1, 0.14); break;
      case 'escape': this._tone(300, 0.3, 'sawtooth', 0.2, 0, 120); this._noise(0.14, 0.2, 500, 0.02); break;
      case 'slam': this._noise(0.4, 0.5, 120); this._tone(90, 0.4, 'sine', 0.5, 0, 40); break;
      case 'charged': this._tone(523, 0.1, 'triangle', 0.2); this._tone(784, 0.1, 'triangle', 0.2, 0.08); this._tone(1046, 0.16, 'triangle', 0.2, 0.16); break;
      case 'combo': this._tone(880, 0.12, 'sine', 0.2); this._tone(1318, 0.18, 'sine', 0.18, 0.06); break;
      case 'win': [523, 659, 784, 1046].forEach((f, i) => this._tone(f, 0.22, 'triangle', 0.22, i * 0.12)); break;
      case 'lose': [392, 330, 262, 196].forEach((f, i) => this._tone(f, 0.3, 'sawtooth', 0.16, i * 0.16)); break;
      case 'tap': this._tone(600, 0.05, 'square', 0.08); break;
      default: break;
    }
  }
}
