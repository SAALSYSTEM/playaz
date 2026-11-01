// Texas Hold'em – Ton (Web Audio, keine Dateien). Nichts klingt vor der ersten Berührung.
const KEY = 'holdem-ton';
let ctx = null, master = null, rausch = null;
export const einst = (() => { let e = null; try { e = JSON.parse(localStorage.getItem(KEY)); } catch (x) {} return Object.assign({ an: true }, e && typeof e === 'object' ? e : {}); })();
export function speichern() { try { localStorage.setItem(KEY, JSON.stringify(einst)); } catch (e) {} if (ctx) master.gain.setTargetAtTime(einst.an ? 0.45 : 0, ctx.currentTime, 0.05); }
export function entsperren() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  ctx = new AC(); master = ctx.createGain(); master.connect(ctx.destination); master.gain.value = einst.an ? 0.45 : 0;
  const n = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = n.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  rausch = n;
}
document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend().catch(() => {}); else ctx.resume().catch(() => {}); });
function ton(typ, f0, f1, dauer, laut = 0.3, start = 0) {
  if (!ctx || !einst.an) return;
  const t = ctx.currentTime + start; const o = ctx.createOscillator(); const g = ctx.createGain();
  o.type = typ; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dauer);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(laut, t + Math.min(0.01, dauer / 4)); g.gain.exponentialRampToValueAtTime(0.0001, t + dauer);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dauer + 0.05);
}
function rauschen(dauer, laut, f0, f1, q = 1, start = 0, typ = 'bandpass') {
  if (!ctx || !einst.an) return;
  const t = ctx.currentTime + start; const s = ctx.createBufferSource(); s.buffer = rausch;
  const f = ctx.createBiquadFilter(); f.type = typ; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dauer);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(laut, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dauer);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dauer + 0.05);
}
export const sfx = {
  karte() { rauschen(0.09, 0.25, 3000, 900, 1.2, 0, 'bandpass'); },
  chips() { rauschen(0.035, 0.32, 4200, 2600, 4); rauschen(0.03, 0.22, 3600, 2400, 5, 0.04); rauschen(0.03, 0.18, 3900, 2500, 5, 0.075); },
  check() { ton('sine', 160, 120, 0.06, 0.35); ton('sine', 160, 120, 0.06, 0.3, 0.11); },
  fold() { rauschen(0.18, 0.12, 1500, 500, 1); },
  dran() { ton('sine', 880, 880, 0.12, 0.08); ton('sine', 1320, 1320, 0.14, 0.06, 0.09); },
  gewinn() { [0, 0.08, 0.16].forEach((d, i) => ton('sine', [1175, 1480, 1760][i], [1175, 1480, 1760][i], 0.22, 0.14, d)); },
  gross() { [[523, 0], [659, 0.1], [784, 0.2], [1047, 0.32]].forEach(([f, d]) => { ton('triangle', f, f, 0.5, 0.12, d); ton('sine', f * 2, f * 2, 0.4, 0.05, d); }); },
  klick() { ton('sine', 1400, 1100, 0.04, 0.06); }
};
