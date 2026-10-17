// JUNGLE RUNNER: Ton, vollständig synthetisch (WebAudio), keine Dateien. Ein/Aus wird im Speicherstand gemerkt.
// Dazu eine kleine Marimba-und-Bongo-Schleife als Hintergrundmusik (leise, endet bei Pause).
export function createAudio(isOn) {
  const A = {
    ctx: null, master: null, music: null, noise: null, letzter: {}, musikAn: false, step: 0, timer: 0, next: 0,
    init() {
      if (this.ctx || (!window.AudioContext && !window.webkitAudioContext)) return;
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext, ctx = this.ctx = new Ctx();
        this.master = ctx.createGain(); this.master.gain.value = isOn() ? 0.75 : 0; this.master.connect(ctx.destination);
        this.music = ctx.createGain(); this.music.gain.value = 0.55; this.music.connect(this.master);
        const len = ctx.sampleRate * 1.2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.noise = buf;
      } catch (e) { this.ctx = null; }
    },
    resume() { this.init(); if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); },
    suspend() { if (this.ctx) this.ctx.suspend().catch(() => {}); },
    setOn(on) { if (this.master) this.master.gain.setTargetAtTime(on ? 0.75 : 0, this.ctx.currentTime, 0.05); },
    drossel(name, ms) { const t = performance.now(); if (t - (this.letzter[name] || 0) < ms) return false; this.letzter[name] = t; return true; },
    rauschen(dauer, typ, f0, f1, vol, q, wann = 0, ziel) {
      if (!this.ctx) return;
      const ctx = this.ctx, t = ctx.currentTime + wann, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = this.noise; f.type = typ; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dauer); f.Q.value = q || 1;
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dauer);
      s.connect(f); f.connect(g); g.connect(ziel || this.master); s.start(t); s.stop(t + dauer + 0.05);
    },
    klang(freq, dauer, typ, vol, wann = 0, bis, ziel) {
      if (!this.ctx) return;
      const ctx = this.ctx, t = ctx.currentTime + wann, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = typ || 'triangle'; o.frequency.setValueAtTime(freq, t); if (bis) o.frequency.exponentialRampToValueAtTime(bis, t + dauer);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dauer);
      o.connect(g); g.connect(ziel || this.master); o.start(t); o.stop(t + dauer + 0.05);
    },
    klick() { this.klang(880, 0.05, 'square', 0.05); },
    muenze(kombo = 0) { if (this.drossel('m', 40)) { const f = 1320 * Math.pow(2, Math.min(kombo, 8) / 12); this.klang(f, 0.09, 'square', 0.035); this.klang(f * 1.5, 0.14, 'triangle', 0.05, 0.05); } },
    spur() { if (this.drossel('l', 60)) this.rauschen(0.12, 'bandpass', 1200, 500, 0.07, 1.5); },
    sprung() { this.klang(300, 0.18, 'triangle', 0.09, 0, 620); this.rauschen(0.14, 'highpass', 1500, 3500, 0.04); },
    landen() { if (this.drossel('land', 120)) { this.klang(120, 0.12, 'sine', 0.22, 0, 55); this.rauschen(0.1, 'lowpass', 900, 200, 0.12); } },
    rutschen() { this.rauschen(0.4, 'bandpass', 1800, 400, 0.12, 0.8); },
    treffer() { this.rauschen(0.4, 'lowpass', 1700, 120, 0.45); this.klang(100, 0.3, 'sine', 0.45, 0, 40); this.klang(230, 0.18, 'sawtooth', 0.1, 0.02, 120); },
    schild() { this.klang(500, 0.3, 'triangle', 0.14, 0, 1200); this.rauschen(0.25, 'highpass', 3000, 8000, 0.08); },
    platsch() { this.rauschen(0.55, 'bandpass', 1500, 300, 0.4, 0.7); this.klang(220, 0.25, 'sine', 0.2, 0, 90); },
    respawn() { [392, 523, 659].forEach((f, i) => this.klang(f, 0.18, 'triangle', 0.1, i * 0.07)); },
    checkpoint() { [523, 659, 784, 1046].forEach((f, i) => this.klang(f, 0.2, 'triangle', 0.1, i * 0.07)); },
    power(k) { const b = { magnet: 440, shield: 520, boost: 600, x2: 700 }[k] || 500; [b, b * 1.25, b * 1.5, b * 2].forEach((f, i) => this.klang(f, 0.2, 'square', 0.07, i * 0.06)); },
    powerEnde() { this.klang(500, 0.2, 'triangle', 0.08, 0, 250); },
    nashorn() { this.klang(90, 0.9, 'sawtooth', 0.14, 0, 70); this.rauschen(0.9, 'lowpass', 400, 120, 0.2); },
    fels() { this.rauschen(1.2, 'lowpass', 300, 80, 0.3); this.klang(60, 1.0, 'sine', 0.3, 0, 40); },
    elefant() { if (this.drossel('ele', 4000)) { this.klang(280, 0.5, 'sawtooth', 0.12, 0, 520); this.klang(520, 0.35, 'sawtooth', 0.1, 0.4, 330); this.rauschen(0.7, 'bandpass', 700, 900, 0.07, 3); } },
    affe() { if (this.drossel('aff', 1500)) { [700, 900, 700, 1000].forEach((f, i) => this.klang(f, 0.09, 'square', 0.06, i * 0.1, f * 1.2)); } },
    kokos() { this.klang(180, 0.15, 'sine', 0.3, 0, 70); this.rauschen(0.18, 'bandpass', 1400, 600, 0.2); },
    tor() { if (this.drossel('tor', 300)) { this.rauschen(0.5, 'lowpass', 500, 150, 0.2); this.klang(70, 0.4, 'sine', 0.2, 0, 50); } },
    anstoss() { if (this.drossel('bump', 150)) this.klang(160, 0.08, 'square', 0.07, 0, 90); },
    zaehler(letzte) { this.klang(letzte ? 1046 : 660, letzte ? 0.35 : 0.16, 'square', 0.09); },
    sieg() { [523, 659, 784, 1046, 1318].forEach((f, i) => this.klang(f, 0.24, 'square', 0.08, i * 0.09)); this.klang(1046, 0.7, 'triangle', 0.12, 0.45); this.rauschen(0.5, 'highpass', 2500, 7000, 0.08, 1, 0.3); },
    verloren() { [392, 330, 262, 196].forEach((f, i) => this.klang(f, 0.3, 'triangle', 0.14, i * 0.13)); },
    award() { [784, 988, 1175, 1568, 1976].forEach((f, i) => this.klang(f, 0.3, 'triangle', 0.13, i * 0.07)); },
    kauf() { this.klang(660, 0.1, 'square', 0.07); this.klang(990, 0.18, 'square', 0.07, 0.08); },

    // ---- Musik: 8 Schritte, Bongo und Marimba in Pentatonik
    musikStart() {
      this.init(); if (!this.ctx || this.musikAn) return;
      this.musikAn = true; this.step = 0; this.next = this.ctx.currentTime + 0.1;
      this.timer = setInterval(() => this.takt(), 90);
    },
    musikStop() { this.musikAn = false; clearInterval(this.timer); this.timer = 0; },
    takt() {
      if (!this.ctx || !this.musikAn || this.ctx.state !== 'running') { if (this.ctx) this.next = Math.max(this.next, this.ctx.currentTime); return; }
      const dt = 0.15;                                   // Sechzehntel bei 100 BPM
      while (this.next < this.ctx.currentTime + 0.3) {
        const w = this.next - this.ctx.currentTime, s = this.step % 16;
        const bong = [1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1][s];
        if (bong) this.klang(s % 4 === 0 ? 150 : 210, 0.12, 'sine', 0.12, w, 80, this.music);
        if (s % 4 === 0) this.rauschen(0.05, 'bandpass', 2400, 1800, 0.04, 2, w, this.music);
        const PENT = [0, 3, 5, 7, 10, 12, 15, 17];
        const mel = [0, -1, 2, -1, 4, -1, 2, -1, 5, -1, 4, -1, 2, 3, -1, 1][s];
        if (mel >= 0) this.klang(262 * Math.pow(2, PENT[mel] / 12), 0.22, 'sine', 0.1, w, undefined, this.music);
        if (s === 0 || s === 8) this.klang(131 * Math.pow(2, (s ? 5 : 0) / 12), 0.5, 'triangle', 0.1, w, undefined, this.music);
        this.next += dt; this.step++;
      }
    }
  };
  return A;
}
