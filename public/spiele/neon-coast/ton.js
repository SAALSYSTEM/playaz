// Neon Coast – Fluchtwagen: Ton. Alles über WebAudio erzeugt (Motor, Reifen, Sirene, Effekte);
// das Autoradio spielt zwei eigene Sender (radio/, Pixabay, vom Auftraggeber); das Rauschen beim Umschalten kommt aus der Sternenfahrt.
export function neuerTon(istStumm) {
  let actx = null, rauschen = null, aus = null, motor = null, reifen = null, sirene = null, uhr = 0;
  const stumm = () => !!istStumm();
  function entsperren() {
    if (stumm()) return;
    try {
      actx ??= new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      if (!rauschen) {
        rauschen = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate);
        const d = rauschen.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        aus = actx.createGain(); aus.gain.value = 1; aus.connect(actx.destination);
      }
    } catch { actx = null; }
  }
  function ton(freq, dauer, form = 'sine', laut = 0.1, gleit = 0, spaeter = 0, tief = 0) {
    if (stumm() || !actx || !aus) return;
    try {
      const t = actx.currentTime + spaeter, o = actx.createOscillator(), g = actx.createGain();
      o.type = form; o.frequency.setValueAtTime(freq, t);
      if (gleit) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * gleit), t + dauer);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(laut, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dauer);
      let n = o.connect(g);
      if (tief) { const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = tief; n = g.connect(f); }
      n.connect(aus); o.start(t); o.stop(t + dauer + 0.05);
    } catch { /* egal */ }
  }
  function rausch(dauer, freq, laut, q = 1, spaeter = 0, art = 'bandpass', bis = 0) {
    if (stumm() || !actx || !rauschen) return;
    try {
      const t = actx.currentTime + spaeter, s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
      s.buffer = rauschen; f.type = art; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
      if (bis) f.frequency.exponentialRampToValueAtTime(bis, t + dauer);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(laut, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dauer);
      s.connect(f).connect(g).connect(aus); s.start(t, Math.random()); s.stop(t + dauer + 0.05);
    } catch { /* egal */ }
  }
  // Dauerklänge: Motor (zwei Oszillatoren), Reifen (gefiltertes Rauschen), Sirene (Jaulton)
  function dauer() {
    if (!actx || motor) return;
    try {
      const mg = actx.createGain(), mf = actx.createBiquadFilter(), o1 = actx.createOscillator(), o2 = actx.createOscillator();
      mg.gain.value = 0; mf.type = 'lowpass'; mf.frequency.value = 520; o1.type = 'sawtooth'; o2.type = 'square'; o1.frequency.value = 60; o2.frequency.value = 30;
      const g2 = actx.createGain(); g2.gain.value = 0.5;
      o1.connect(mf); o2.connect(g2).connect(mf); mf.connect(mg).connect(aus); o1.start(); o2.start();
      motor = { g: mg, f: mf, o1, o2 };
      const rs = actx.createBufferSource(), rf = actx.createBiquadFilter(), rg = actx.createGain();
      rs.buffer = rauschen; rs.loop = true; rf.type = 'bandpass'; rf.frequency.value = 1500; rf.Q.value = 3.5; rg.gain.value = 0;
      rs.connect(rf).connect(rg).connect(aus); rs.start();
      reifen = { g: rg, f: rf };
      const so = actx.createOscillator(), sf = actx.createBiquadFilter(), sg = actx.createGain();
      so.type = 'sawtooth'; so.frequency.value = 700; sf.type = 'lowpass'; sf.frequency.value = 2100; sg.gain.value = 0;
      so.connect(sf).connect(sg).connect(aus); so.start();
      sirene = { o: so, g: sg };
    } catch { motor = null; }
  }
  // einmal je Bild: v = Tempo in m/s, rutsch 0..1, nah 0..1 (wie nah ist die Polizei), an = wird gerade gefahren
  function laufend(dt, v, vmax, rutsch, nah, nitro, an) {
    if (!actx || stumm()) return;
    dauer(); if (!motor) return;
    uhr += dt;
    const t = actx.currentTime, gang = Math.min(4, Math.floor(v / (vmax / 4 + 0.01))), im = (v % (vmax / 4 + 0.01)) / (vmax / 4 + 0.01);
    const f = 52 + gang * 9 + im * 58 + (nitro ? 40 : 0);
    motor.o1.frequency.setTargetAtTime(f, t, 0.05); motor.o2.frequency.setTargetAtTime(f / 2, t, 0.05);
    motor.f.frequency.setTargetAtTime(380 + v * 22 + (nitro ? 900 : 0), t, 0.08);
    motor.g.gain.setTargetAtTime(an ? 0.05 + Math.min(0.03, v * 0.0012) + (nitro ? 0.03 : 0) : 0, t, 0.08);
    reifen.g.gain.setTargetAtTime(an ? Math.min(0.085, rutsch * 0.085) : 0, t, 0.06);
    reifen.f.frequency.setTargetAtTime(1300 + rutsch * 500, t, 0.1);
    sirene.o.frequency.setTargetAtTime(880 + 420 * Math.sin(uhr * 3.6), t, 0.03);
    sirene.g.gain.setTargetAtTime(an ? nah * 0.05 : 0, t, 0.15);
  }
  function still() { if (!actx || !motor) return; const t = actx.currentTime; for (const k of [motor, reifen, sirene]) k.g.gain.setTargetAtTime(0, t, 0.05); }

  const SFX = {
    klick: () => ton(520, 0.06, 'sine', 0.06),
    koffer: (m = 1) => { const k = Math.pow(2, Math.min(8, (m - 1) * 2) / 12); ton(1320 * k, 0.09, 'square', 0.05, 0, 0, 5000); ton(1760 * k, 0.3, 'triangle', 0.09, 0, 0.07); ton(2640 * k, 0.4, 'sine', 0.05, 0, 0.07); rausch(0.08, 6000, 0.05, 1, 0); },
    gesichert: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => ton(f, i === 4 ? 0.5 : 0.14, 'triangle', 0.09, 0, i * 0.09)); for (let i = 0; i < 6; i++) rausch(0.05, 7000, 0.04, 2, 0.1 + i * 0.07); },
    stern: (n = 1) => { for (let i = 0; i < Math.min(n, 5); i++) ton(980, 0.09, 'square', 0.045, 0, i * 0.12, 3000); ton(740, 0.25, 'square', 0.04, 0, Math.min(n, 5) * 0.12, 3000); },
    alarm: () => { ton(620, 0.16, 'square', 0.05, 0, 0, 2600); ton(830, 0.2, 'square', 0.05, 0, 0.17, 2600); },
    entkommen: () => { [784, 659, 523, 784, 1047].forEach((f, i) => ton(f, 0.16, 'sine', 0.08, 0, i * 0.1)); rausch(0.6, 2500, 0.04, 0.7, 0, 'bandpass', 400); },
    krach: (s = 8) => { const k = Math.min(1, s / 16); rausch(0.14 + k * 0.3, 900 + k * 900, 0.08 + k * 0.2, 0.6, 0, 'lowpass'); ton(90 - k * 30, 0.2 + k * 0.2, 'sine', 0.1 + k * 0.2, 0.5); if (k > 0.45) rausch(0.3, 3500, 0.07, 1.5, 0.03); },
    fern: () => rausch(0.25, 500, 0.05, 0.6, 0, 'lowpass'),
    ding: () => { rausch(0.09, 1800, 0.1, 1, 0); ton(180, 0.1, 'triangle', 0.09, 0.6); },
    haarscharf: () => { rausch(0.3, 600, 0.09, 1.2, 0, 'bandpass', 3200); ton(1200, 0.12, 'sine', 0.05, 1.5, 0.12); },
    nitro: () => { rausch(0.9, 500, 0.14, 0.8, 0, 'bandpass', 4200); ton(120, 0.8, 'sawtooth', 0.07, 3.2, 0, 1800); },
    schrott: () => { rausch(0.7, 1400, 0.3, 0.5, 0, 'lowpass'); ton(70, 0.5, 'sine', 0.3, 0.5); rausch(0.5, 4200, 0.09, 2, 0.05); [988, 1319].forEach((f, i) => ton(f, 0.2, 'triangle', 0.07, 0, 0.25 + i * 0.1)); },
    platsch: () => { rausch(0.7, 2200, 0.2, 0.6, 0, 'lowpass', 300); ton(160, 0.35, 'sine', 0.12, 0.4); },
    geschnappt: () => { ton(392, 0.25, 'sawtooth', 0.07, 0.94, 0, 1500); ton(330, 0.25, 'sawtooth', 0.07, 0.94, 0.26, 1500); ton(262, 0.7, 'sawtooth', 0.08, 0.6, 0.52, 1500); },
    hupe: () => { ton(415, 0.3, 'square', 0.035, 0, 0, 1500); ton(520, 0.3, 'square', 0.03, 0, 0, 1500); },
    auftrag: () => [659, 784, 988, 1319, 1568].forEach((f, i) => ton(f, 0.18, 'triangle', 0.08, 0, i * 0.08)),
    tor: () => { ton(150, 0.18, 'square', 0.06, 0, 0, 900); ton(150, 0.22, 'square', 0.06, 0, 0.22, 900); },
    kauf: () => { [784, 988, 1175, 1568].forEach((f, i) => ton(f, 0.16, 'triangle', 0.09, 0, i * 0.07)); rausch(0.06, 7000, 0.05, 2, 0.3); },
    los: () => { ton(110, 0.5, 'sawtooth', 0.07, 2, 0, 1200); }
  };
  const sfx = (name, a) => { try { SFX[name] && SFX[name](a); } catch { /* egal */ } };

  // ---------- Autoradio (wie in der Sternenfahrt): nach 45–90 s kurzes Rauschen und Wechsel zum anderen Sender
  const SENDER = ['sender-1', 'sender-2'];
  const url = (k) => new URL((k === 'rauschen' ? '../sternenfahrt/radio/' : 'radio/') + k + '.mp3', import.meta.url).href;
  const VOL_M = 0.24, VOL_R = 0.16;
  const musik = new Audio(); musik.preload = 'none'; musik.volume = VOL_M;
  const stoer = new Audio(url('rauschen')); stoer.preload = 'none'; stoer.volume = VOL_R;
  let sender = -1, wechsel = false, weg = null, beruehrt = false, timer = 0;
  function route() {
    if (weg || !actx) return;
    try {
      const m = actx.createGain(), r = actx.createGain();
      actx.createMediaElementSource(musik).connect(m).connect(actx.destination);
      actx.createMediaElementSource(stoer).connect(r).connect(actx.destination);
      m.gain.value = wechsel ? 0 : VOL_M; r.gain.value = VOL_R; musik.volume = 1; stoer.volume = 1;
      weg = { m, r };
    } catch { weg = null; }
  }
  const lautM = (v) => { if (weg) { try { weg.m.gain.setTargetAtTime(v, actx.currentTime, 0.08); return; } catch { /* unten */ } } musik.volume = weg ? 1 : v; };
  const will = () => beruehrt && !stumm() && !document.hidden;
  const spiel = (a) => { const p = a.play(); if (p && p.catch) p.catch(() => {}); };
  function umschalten() {
    let n; do { n = Math.floor(Math.random() * SENDER.length); } while (n === sender);
    sender = n; wechsel = true;
    route(); lautM(0);
    musik.src = url(SENDER[n]);
    musik.addEventListener('loadedmetadata', () => { try { musik.currentTime = Math.random() * Math.max(0, musik.duration - 50); } catch { /* egal */ } }, { once: true });
    try { stoer.currentTime = Math.random() * 4; } catch { /* noch nicht geladen */ }
    if (will()) { spiel(stoer); spiel(musik); }
    clearTimeout(timer); clearTimeout(umschalten.h);
    umschalten.h = setTimeout(() => { stoer.pause(); wechsel = false; lautM(VOL_M); radio(); }, 1000);
    timer = setTimeout(() => { if (will()) umschalten(); }, 45000 + Math.random() * 45000);
  }
  function radio() {
    if (!will()) { musik.pause(); stoer.pause(); return; }
    if (sender < 0) { umschalten(); return; }
    route(); if (wechsel) spiel(stoer); spiel(musik);
  }
  musik.addEventListener('ended', () => { if (will()) umschalten(); });
  function ersteBeruehrung() { if (beruehrt) return; beruehrt = true; entsperren(); radio(); }
  for (const e of ['pointerup', 'touchend', 'click', 'keydown']) document.addEventListener(e, ersteBeruehrung, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => { radio(); if (document.hidden) still(); });

  return { entsperren, sfx, laufend, still, radio, sender: () => { if (will()) umschalten(); }, wechselStumm: () => { if (stumm()) { still(); } else entsperren(); radio(); } };
}
