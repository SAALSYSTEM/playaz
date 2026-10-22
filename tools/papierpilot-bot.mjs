// PAPIERPILOT: Flug-Bot mit Vorausschau. Prüft, ob eine Strecke durchfliegbar ist und wie lange Flüge dauern.
// node tools/papierpilot-bot.mjs
import { neuerFlug, vorbereiteteStrecke, kraftBei, M, LINKS, RECHTS, TIPP } from '../public/spiele/papierpilot/sim.js';
import { TESTSTRECKE } from '../public/spiele/papierpilot/strecke.js';

// Pläne: eine Richtung halten, dann loslassen. Bewertet wird, wie weit und wie hoch der Flieger danach noch ist.
const PLAENE = [[0, 0], [LINKS, 12], [LINKS, 30], [RECHTS, 12], [RECHTS, 30], [LINKS, 60], [RECHTS, 60]];
function bewerte(f, plan, horizont) {
  const k = f.klon(); let t = 0;
  while (t < horizont && k.s.phase !== 'ende') { k.schritt(t < plan[1] ? plan[0] : 0); t++; }
  if (k.s.grund === 'hindernis') return -1e12 + t;
  return k.s.z + k.s.y * 4 - Math.abs(k.s.x) * 0.05;
}

// wurf = Ziel der Kraftanzeige (0..1000), zittern = Anteil zufälliger Fehlgriffe (Mensch-Ersatz)
export function botFlug(namen, { wurf = 1000, horizont = 220, zittern = 0, seed = 1 } = {}) {
  const S = vorbereiteteStrecke(namen), f = neuerFlug(S), s = f.s, ein = [];
  let r = seed >>> 0; const zz = () => { r = (Math.imul(r, 1664525) + 1013904223) >>> 0; return r / 4294967296; };
  let plan = PLAENE[0], pt = 0;
  while (s.phase !== 'ende') {
    let e = 0;
    if (s.phase === 'wurf') { if (Math.abs(kraftBei(s.t + 1) - wurf) <= 25 || s.t > 400) e = TIPP; }
    else {
      if (pt % 6 === 0) { let best = -Infinity; for (const p of PLAENE) { const w = bewerte(f, p, horizont); if (w > best) { best = w; plan = p; } } pt = 0; }
      e = pt < plan[1] ? plan[0] : 0; pt++;
      if (zittern && zz() < zittern) e = [0, LINKS, RECHTS][Math.floor(zz() * 3)];
    }
    ein.push(e); f.schritt(e);
  }
  return { m: s.z / M, sek: s.ft / 60, grund: s.grund, ringe: s.ringe, eingaben: ein };
}

if (import.meta.url === 'file://' + process.argv[1]) {
  const f = neuerFlug(vorbereiteteStrecke(TESTSTRECKE)); while (kraftBei(f.s.t + 1) !== 1000) f.schritt(0); f.schritt(TIPP); while (f.s.phase !== 'ende') f.schritt(0);
  console.log('geradeaus', Math.round(f.s.z / M) + ' m', (f.s.ft / 60).toFixed(1) + ' s', f.s.grund);
  const zeige = (r) => Math.round(r.m) + 'm/' + r.sek.toFixed(0) + 's/' + r.grund[0] + '/' + r.ringe + 'R';
  console.log('bester Bot', zeige(botFlug(TESTSTRECKE)));
  for (const [z, h] of [[0.1, 120], [0.25, 90], [0.4, 60]]) console.log('zittern', z, 'sicht', h, [1, 2, 3, 4, 5, 6].map((seed) => zeige(botFlug(TESTSTRECKE, { zittern: z, horizont: h, wurf: 600, seed }))).join(' '));
}
