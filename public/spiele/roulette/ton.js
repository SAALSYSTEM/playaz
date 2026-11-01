// Roulette – Ton. Alle Geräusche entstehen live mit der Web Audio API (keine Dateien). Nichts klingt vor der ersten Berührung.
const KEY = 'roulette-ton';
let ctx = null, master = null, rausch = null;
export const einst = (() => {
  let e = null; try { e = JSON.parse(localStorage.getItem(KEY)); } catch (x) {}
  return Object.assign({ an: true, laut: 70 }, e && typeof e === 'object' ? e : {});
})();
export function speichern() { try { localStorage.setItem(KEY, JSON.stringify(einst)); } catch (e) {} anwenden(); }
export function entsperren() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  ctx = new AC(); master = ctx.createGain(); master.connect(ctx.destination);
  const n = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = n.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  rausch = n; anwenden();
}
function anwenden() { if (ctx) master.gain.setTargetAtTime(einst.an ? (einst.laut / 100) * 0.6 : 0, ctx.currentTime, 0.05); }
document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend().catch(() => {}); else ctx.resume().catch(() => {}); });

function ton(typ, f0, f1, dauer, laut = 0.3, start = 0) {
  if (!ctx || !einst.an) return;
  const t = ctx.currentTime + start;
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.type = typ; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dauer);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(laut, t + Math.min(0.01, dauer / 4)); g.gain.exponentialRampToValueAtTime(0.0001, t + dauer);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dauer + 0.05);
}
function rauschen(dauer, laut, f0, f1, q = 1, start = 0, typ = 'bandpass', anstieg = 0.004) {
  if (!ctx || !einst.an) return null;
  const t = ctx.currentTime + start;
  const s = ctx.createBufferSource(); s.buffer = rausch; s.loop = true;
  const f = ctx.createBiquadFilter(); f.type = typ; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dauer);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(laut, t + Math.max(anstieg, 0.002)); g.gain.exponentialRampToValueAtTime(0.0001, t + dauer);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dauer + 0.05);
  return s;
}

let roll = null;
export const sfx = {
  // Jeton auf den Filz (zwei kurze Klicks wie aufeinanderliegende Chips)
  jeton() { rauschen(0.035, 0.35, 4200, 2600, 4, 0, 'bandpass'); rauschen(0.03, 0.22, 3600, 2400, 5, 0.035); ton('sine', 2600, 2300, 0.03, 0.05); },
  weg() { rauschen(0.12, 0.12, 1800, 700, 1.5, 0, 'bandpass', 0.02); },
  // Kugel rollt: Rauschen, das langsamer und tiefer wird (Dauer in s)
  rollen(dauer) {
    if (!ctx || !einst.an) return;
    sfx.rollenStopp();
    const t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = rausch; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2.2;
    f.frequency.setValueAtTime(2600, t); f.frequency.exponentialRampToValueAtTime(700, t + dauer);
    const am = ctx.createGain(); const lfo = ctx.createOscillator(); const lg = ctx.createGain();
    lfo.frequency.setValueAtTime(22, t); lfo.frequency.exponentialRampToValueAtTime(5, t + dauer); lg.gain.value = 0.5; lfo.connect(lg); lg.connect(am.gain); am.gain.value = 0.6;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.15); g.gain.setValueAtTime(0.22, t + dauer * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dauer);
    s.connect(f); f.connect(am); am.connect(g); g.connect(master); s.start(t); lfo.start(t); s.stop(t + dauer + 0.1); lfo.stop(t + dauer + 0.1);
    roll = { s, lfo, g };
  },
  rollenStopp() { if (roll && ctx) { try { roll.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.03); roll.s.stop(ctx.currentTime + 0.15); roll.lfo.stop(ctx.currentTime + 0.15); } catch (e) {} } roll = null; },
  klack(laut = 1) { rauschen(0.025, 0.5 * laut, 5200, 3000, 3, 0, 'highpass'); ton('triangle', 1900, 1200, 0.03, 0.12 * laut); },
  kessel() { rauschen(0.6, 0.08, 300, 180, 0.8, 0, 'lowpass', 0.1); },
  gewinn() { [0, 0.08, 0.16].forEach((d, i) => ton('sine', [1175, 1480, 1760][i], [1175, 1480, 1760][i], 0.22, 0.14, d)); },
  gross() {
    [[523, 0], [659, 0.1], [784, 0.2], [1047, 0.32]].forEach(([f, d]) => { ton('triangle', f, f, 0.5, 0.12, d); ton('sine', f * 2, f * 2, 0.4, 0.05, d); });
    ton('sine', 1568, 1568, 0.9, 0.08, 0.45);
  },
  klick() { ton('sine', 1400, 1100, 0.04, 0.06); }
};
