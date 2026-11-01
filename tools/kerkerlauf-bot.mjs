// KERKERLAUF: einfacher Bot für Tests (Fairness der Strecke, Nachspielen für die Rangliste).
import * as L from '../public/spiele/kerkerlauf/logik.js';
const BLOCK = new Set(['kiste', 'fass', 'stapel']);

// Bot: sieht die nächste Reihe, wählt eine machbare Spur, springt über Stacheln, greift Skelette an
export function bot(f) {
  const vor = f.strecke.items.filter((it) => !it.weg && !it.besiegt && it.typ !== 'muenze' && it.typ !== 'truhe' && it.d > f.d - 0.2 && it.d < f.d + 40).sort((a, b) => a.d - b.d);
  if (!vor.length) return {};
  const dRow = vor[0].d, reihe = vor.filter((it) => it.d === dRow);
  const art = (l) => { const it = reihe.find((i) => i.spur === l); return it ? (BLOCK.has(it.typ) ? 9 : it.typ === 'stachel' ? 1 : 2) : 0; };
  let ziel = f.spur, best = 99;
  for (const l of [f.spur, f.spur - 1, f.spur + 1, f.spur - 2, f.spur + 2]) {
    if (l < 0 || l > 2) continue;
    const kosten = art(l) * 3 + Math.abs(l - f.spur);
    if (kosten < best) { best = kosten; ziel = l; }
  }
  const ein = {};
  if (ziel < f.spur) ein.links = true; else if (ziel > f.spur) ein.rechts = true;
  const hier = reihe.find((i) => i.spur === f.spur), abst = dRow - f.d, v = L.tempo(f.d);
  if (hier && hier.typ === 'stachel' && !f.luft && abst < v * 0.33 + 0.9) ein.sprung = true;
  if (hier && hier.typ === 'skelett' && abst < 5) ein.angriff = true;
  return ein;
}


// Spielt die Tagesstrecke mit festen Takten und liefert eine Meldung wie aus dem Browser (bis maxMeter, dann ohne Eingaben bis zum Sturz)
export function botLauf(seed, maxMeter = 1500, fehlerBei = Infinity) {
  const f = L.neuerLauf(seed), ein = [];
  let t = 0;
  while (!f.tot && t < L.MAX_TAKTE) {
    const e = f.d < fehlerBei ? bot(f) : {};
    if (f.d > maxMeter) { e.links = e.rechts = e.sprung = e.angriff = false; }
    const m = L.maske(e);
    if (m) ein.push([t, m]);
    L.schritt(f, L.DT, { links: !!(m & 1), rechts: !!(m & 2), sprung: !!(m & 4), angriff: !!(m & 8) });
    t++;
  }
  return { v: L.SIM_VERSION, seed, inputs: L.kodiere(ein), takte: t, punkte: L.punkte(f), gold: f.muenzen, kills: f.kills };
}

