// Rocket Reels – Ton. Alle Effekte entstehen live mit der Web Audio API (keine Dateien, keine Lizenzfragen).
// Optional: liegt ton/musik.mp3 bzw. ton/freispiele.mp3 im Spielordner (in img/manifest.json als "ton:…" gelistet), wird sie statt der
// erzeugten Musik gespielt. Nichts klingt vor der ersten Berührung (der AudioContext entsteht erst dann).
const KEY = 'rocketreels.ton';
let ctx = null, master = null, sfxBus = null, musikBus = null, rausch = null;
export const einst = (() => {
  let e = null; try { e = JSON.parse(localStorage.getItem(KEY)); } catch (x) {}
  return Object.assign({ effekte: true, musik: true, laut: 60 }, e && typeof e === 'object' ? e : {});
})();
export function speichern() { try { localStorage.setItem(KEY, JSON.stringify(einst)); } catch (e) {} anwenden(); }

export function entsperren() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.connect(master);
  musikBus = ctx.createGain(); musikBus.connect(master);
  const n = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = n.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  rausch = n;
  anwenden();
}
function anwenden() {
  if (!ctx) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime((einst.laut / 100) * 0.55, t, 0.05);
  sfxBus.gain.setTargetAtTime(einst.effekte ? 1 : 0, t, 0.05);
  musikBus.gain.setTargetAtTime(einst.musik ? 0.5 : 0, t, 0.2);
}
document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend().catch(() => {}); else ctx.resume().catch(() => {}); });

// ---- Bausteine
function ton(typ, f0, f1, dauer, laut = 0.3, start = 0, ziel = sfxBus) {
  if (!ctx || !einst.effekte && ziel === sfxBus) return;
  const t = ctx.currentTime + start;
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.type = typ; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dauer);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(laut, t + Math.min(0.02, dauer / 4)); g.gain.exponentialRampToValueAtTime(0.0001, t + dauer);
  o.connect(g); g.connect(ziel); o.start(t); o.stop(t + dauer + 0.05);
}
function rauschen(dauer, laut, f0, f1, q = 1, start = 0, typ = 'bandpass') {
  if (!ctx || !einst.effekte) return;
  const t = ctx.currentTime + start;
  const s = ctx.createBufferSource(); s.buffer = rausch; s.loop = true;
  const f = ctx.createBiquadFilter(); f.type = typ; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dauer);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(laut, t + Math.min(0.08, dauer / 3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dauer);
  s.connect(f); f.connect(g); g.connect(sfxBus); s.start(t); s.stop(t + dauer + 0.05);
}

// ---- Effekte (Soundliste siehe docs/ROCKET_REELS.md)
export const sfx = {
  spin() { rauschen(0.35, 0.18, 400, 2400, 2); ton('triangle', 220, 660, 0.28, 0.12); },
  stopp(i = 0) { ton('square', 900 - i * 60, 420, 0.05, 0.12); rauschen(0.05, 0.12, 3000, 1500, 3, 0, 'highpass'); },
  klein() { [0, 0.07, 0.14].forEach((d, i) => ton('sine', [1320, 1760, 2093][i], [1320, 1760, 2093][i], 0.16, 0.16, d)); },
  gross() {
    [[523, 0], [659, 0.12], [784, 0.24], [1047, 0.38]].forEach(([f, d]) => { ton('sawtooth', f, f, 0.5, 0.07, d); ton('sine', f * 2, f * 2, 0.45, 0.06, d); });
    ton('triangle', 1047, 1047, 0.9, 0.12, 0.5); ton('triangle', 1319, 1319, 0.9, 0.08, 0.5);
  },
  stargate() { ton('sine', 55, 90, 1.1, 0.35); ton('sine', 110, 180, 1.0, 0.12); rauschen(1.0, 0.12, 200, 1800, 4); },
  start() { rauschen(1.6, 0.35, 120, 900, 0.8, 0, 'lowpass'); ton('sawtooth', 60, 160, 1.5, 0.1); },
  warp() { ton('sawtooth', 180, 2200, 0.45, 0.09); rauschen(0.45, 0.15, 600, 6000, 2); ton('sine', 1568, 1568, 0.25, 0.15, 0.42); ton('sine', 2093, 2093, 0.3, 0.12, 0.52); },
  verloren() { ton('sine', 140, 38, 0.6, 0.45); rauschen(0.5, 0.25, 900, 120, 1, 0, 'lowpass'); ton('square', 220, 110, 0.3, 0.05, 0.05); },
  sichern() { ton('triangle', 784, 784, 0.12, 0.18); ton('triangle', 1175, 1175, 0.22, 0.18, 0.1); },
  klick() { ton('sine', 1400, 1100, 0.05, 0.08); },
  tanken() { rauschen(0.8, 0.2, 300, 3000, 1.5); ton('sine', 440, 880, 0.8, 0.1); }
};

// ---- Musik: ruhige Weltraumfläche (nur Freispiele) oder Datei
let musik = null;
const DATEIEN = {};
export function musikDateien(liste) { liste.forEach((n) => { DATEIEN[n] = '/spiele/rocket-reels/ton/' + n + '.mp3'; }); }
export function musikStart(art) {
  if (!ctx) return;
  if (musik && musik.art === art) return;
  musikStop();
  const datei = DATEIEN[art];
  if (datei) {
    const a = new Audio(datei); a.loop = true; a.crossOrigin = 'anonymous';
    const src = ctx.createMediaElementSource(a); const g = ctx.createGain(); g.gain.value = 0.7; src.connect(g); g.connect(musikBus);
    a.play().catch(() => {});
    musik = { art, stop: () => { g.gain.setTargetAtTime(0, ctx.currentTime, 0.3); setTimeout(() => { a.pause(); src.disconnect(); }, 900); } };
    return;
  }
  if (art !== 'freispiele') return; // im Grundspiel ohne Datei: keine Musik (Effekte reichen)
  // Akkordfolge Am – F – C – G, weiche Sägezähne durch Tiefpass, 8 Sekunden je Runde
  const akk = [[220, 261.6, 329.6], [174.6, 220, 261.6], [261.6, 329.6, 392], [196, 246.9, 293.7]];
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; f.Q.value = 0.7;
  const lfo = ctx.createOscillator(); const lg = ctx.createGain(); lfo.frequency.value = 0.08; lg.gain.value = 350; lfo.connect(lg); lg.connect(f.frequency); lfo.start();
  const g = ctx.createGain(); g.gain.value = 0.0001; g.gain.setTargetAtTime(0.16, ctx.currentTime, 1.2);
  f.connect(g); g.connect(musikBus);
  let aktiv = true, n = 0; const oszis = new Set();
  const plane = () => {
    if (!aktiv) return;
    const t0 = ctx.currentTime + 0.05;
    akk[n % 4].forEach((hz) => [-6, 6].forEach((det) => {
      const o = ctx.createOscillator(); const og = ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = hz; o.detune.value = det;
      og.gain.setValueAtTime(0.0001, t0); og.gain.exponentialRampToValueAtTime(0.06, t0 + 0.6); og.gain.setValueAtTime(0.06, t0 + 1.6); og.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.2);
      o.connect(og); og.connect(f); o.start(t0); o.stop(t0 + 2.3); oszis.add(o); o.onended = () => oszis.delete(o);
    }));
    // leise Glöckchen
    ton('sine', akk[n % 4][2] * 4, akk[n % 4][2] * 4, 0.6, 0.03, 0.4, musikBus);
    n++; timer = setTimeout(plane, 2000);
  };
  let timer = null; plane();
  musik = { art, stop: () => { aktiv = false; clearTimeout(timer); g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4); setTimeout(() => { lfo.stop(); oszis.forEach((o) => { try { o.stop(); } catch (e) {} }); g.disconnect(); }, 1500); } };
}
export function musikStop() { if (musik) { musik.stop(); musik = null; } }
