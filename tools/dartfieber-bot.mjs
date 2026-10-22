// DARTFIEBER: Spiel-Bot. Spielt eine Runde mit dem Zeitgefühl eines Menschen (Streuung in Takten) und liefert die Eingaben.
// Wird von den Tests benutzt und misst die Rundenlänge: node tools/dartfieber-bot.mjs
import { neueRunde, linie, tempoWurf, windWurf, RING, challengeAus, zufall, kodiere } from '../public/spiele/dartfieber/sim.js';
import { fileURLToPath } from 'node:url';

// opt.sigma: Streuung des Tippzeitpunkts in Takten (0 = perfekt). opt.ziel: 'bonus' (Bonus wenn da, sonst T20) | 't20' | 'bull'.
export function bot(ch, opt = {}) {
  const { sigma = 0, seed = 1, ziel = 'bonus' } = opt;
  const K = ch.K, F = K.feld, rz = zufall(seed >>> 0);
  const gauss = () => { const u = Math.max(1e-12, rz()), v = rz(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const l = neueRunde(ch), tipps = [];
  const naechster = (start, v, wunsch) => {    // erster Takt, in dem die Linie den Wunschwert erreicht
    const grenze = Math.ceil(4 * F / v) + 2;
    for (let k = K.sperre; k < grenze; k++) if (Math.abs(linie(K, start, v, k) - wunsch) <= v / 2) return k;
    return K.sperre;
  };
  let plan = null;
  while (l.s.phase !== 'ende') {
    const s = l.s;
    if ((s.phase === 'x' || s.phase === 'y') && s.k === 0) {
      if (s.phase === 'x') {
        const w = windWurf(ch, s.i), b = ch.bonus[s.i];
        let zx, zy;
        if (b && ziel === 'bonus') { zx = b.x; zy = b.y; }
        else if (ziel === 'bull') { zx = ch.cx; zy = ch.cy; }
        else { zx = ch.cx; zy = ch.cy - Math.floor((RING.dreifachInnen + RING.dreifachAussen) / 2 * ch.s / 1000); }
        plan = { zx: Math.max(-F, Math.min(F, zx - w.dx)), zy: Math.max(-F, Math.min(F, zy - w.dy)) };
      }
      const v = tempoWurf(ch, s.i);
      const k0 = naechster(s.phase === 'x' ? ch.startX[s.i] : ch.startY[s.i], v, s.phase === 'x' ? plan.zx : plan.zy);
      plan.k = Math.max(K.sperre, Math.round(k0 + (sigma ? sigma * gauss() : 0)));
    }
    const tipp = (s.phase === 'x' || s.phase === 'y') && s.k === plan.k && l.nimmtTipp();
    if (tipp) tipps.push(s.t);
    l.schritt(tipp);
    if (s.t > 200000) throw new Error('Bot läuft nicht aus');
  }
  return { tipps, inputs: kodiere(tipps), s: l.s, lauf: { inputs: kodiere(tipps), ticks: l.s.t, score: l.s.punkte, throws: l.s.wuerfe } };
}

// Aufruf: Rundenlängen und Punkte für verschiedene Zielgenauigkeiten (Takt = 1/60 s; Streuung 2 Takte ≈ 33 ms)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const TAGE = Number(process.argv[2]) || 200;
  console.log('Tage: ' + TAGE + ' · Tippstreuung in Takten (1 Takt = 17 ms)');
  console.log('streuung  ziel   Würfe(Ø)  Punkte(Ø)  Sekunden(Ø)  Sekunden(min–max)  Obergrenze erreicht  Bonus/Runde');
  for (const [ziel, sigma] of [['bonus', 0], ['bonus', 1], ['bonus', 2], ['bonus', 3], ['bonus', 5], ['bonus', 8], ['t20', 3]]) {
    let w = 0, p = 0, sek = 0, mn = 1e9, mx = 0, cap = 0, bo = 0;
    for (let d = 0; d < TAGE; d++) {
      const ch = challengeAus(1000003 + d * 7919, 1), r = bot(ch, { sigma, seed: d + 1, ziel });
      w += r.s.wuerfe; p += r.s.punkte; bo += r.s.boni; const t = r.s.t / 60; sek += t; mn = Math.min(mn, t); mx = Math.max(mx, t); if (r.s.wuerfe >= ch.K.maxWuerfe) cap++;
    }
    console.log(String(sigma).padStart(7) + '   ' + ziel.padEnd(6) + String((w / TAGE).toFixed(1)).padStart(8) + String((p / TAGE).toFixed(0)).padStart(11) + String((sek / TAGE).toFixed(0)).padStart(12) + '   ' + (mn.toFixed(0) + '–' + mx.toFixed(0)).padStart(14) + String(Math.round(cap / TAGE * 100) + ' %').padStart(18) + String((bo / TAGE).toFixed(1)).padStart(14));
  }
}
