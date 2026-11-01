// ROCKET REELS – exakte Auszahlungsrechnung und Walzenband-Generator.
//   node tools/rocket-reels-mathe.mjs            rechnet die Bänder aus engine.js exakt durch
//   node tools/rocket-reels-mathe.mjs --bauen    baut neue Bänder aus ANZAHL (unten) und rechnet sie durch
// Warum exakt und schnell: Der Erwartungswert einer Linie hängt nur von der Häufigkeit der Symbole je Walze ab
// (jede Zeile einer Walze zeigt jedes Bandfeld gleich oft). Summe über Linien = Summe der Erwartungswerte (Linearität).
// Scatter und Spezial-Symbol hängen davon ab, ob ein Symbol im 3er-Fenster liegt: dafür werden alle Fenster gezählt.
import * as E from '../public/spiele/rocket-reels/engine.js';

// Symbolanzahl je Walze (Reihenfolge wie E.SYMBOLE: R S L P C M T A K Q J Z W)
const ANZAHL = [
  [1, 1, 1, 1, 2, 2, 2, 3, 4, 4, 4, 4, 1],
  [1, 1, 1, 1, 1, 2, 2, 3, 3, 4, 4, 4, 1],
  [1, 1, 1, 1, 1, 2, 3, 3, 3, 3, 3, 3, 1],
  [1, 1, 1, 1, 1, 2, 2, 3, 3, 3, 4, 4, 1],
  [1, 1, 1, 2, 2, 2, 2, 2, 4, 4, 4, 4, 1]
];

export function rechne(baender) {
  const W = E.WILD, n = baender.length;
  const L = baender.map((b) => b.length);
  const p = baender.map((b) => { const f = new Array(13).fill(0); b.forEach((s) => f[s]++); return f.map((x) => x / b.length); });
  // --- Linien: E[Gewinn einer Linie] in Linieneinsätzen
  let eLinie = 0;
  for (let sym = 0; sym < W; sym++) {
    // Wahrscheinlichkeit für genau k (3..5) Treffer von links für dieses Symbol, wobei die Linie mit dem Symbol "sym" bewertet wird.
    // Das erste Nicht-Stargate bestimmt das Symbol: Linien aus führenden Stargates + sym gehören zu sym.
    for (let k = 3; k <= 5; k++) {
      // Pfad: Positionen 0..k-1 sind sym oder W, mindestens eine davon sym; Position k (falls k<5) ist weder sym noch W.
      let alle = 1, nurW = 1;
      for (let w = 0; w < k; w++) { alle *= p[w][sym] + p[w][W]; nurW *= p[w][W]; }
      // Fall "nur Stargates auf 0..k-1": dann bestimmt ein späteres Symbol die Linie -> separat unten
      let pk = alle - nurW;
      if (k < 5) pk *= 1 - p[k][sym] - p[k][W];
      eLinie += pk * E.AUSZAHLUNG[sym][k - 3];
    }
  }
  // Linien, die mit j Stargates beginnen und dann erst das Symbol zeigen, sind oben schon enthalten (alle - nurW zählt sie mit),
  // außer wenn alle k Stellen Stargates sind und das bestimmende Symbol erst danach kommt: dann ist der Treffer länger, das
  // erfasst die Rechnung für größere k. Kontrolle: Monte-Carlo im Test (tests/rocket-reels-sim.test.mjs).
  // Fünf Stargates zahlen keine Linie (nurW für k=5 abgezogen).

  // --- Fenster: Wahrscheinlichkeit, dass ein Symbol auf Walze w sichtbar ist
  const sicht = baender.map((b) => {
    const f = new Array(13).fill(0);
    for (let s = 0; s < b.length; s++) { const fenster = new Set([b[s], b[(s + 1) % b.length], b[(s + 2) % b.length]]); fenster.forEach((x) => f[x]++); }
    return f.map((x) => x / b.length);
  });
  // Stargates je Fenster: höchstens eines (Bänder halten Abstand), Kontrolle:
  for (const b of baender) for (let s = 0; s < b.length; s++) {
    const c = [0, 1, 2].filter((r) => b[(s + r) % b.length] === W).length;
    if (c > 1) throw new Error('Zwei Stargates in einem Fenster – Abstand im Band zu klein');
  }
  const verteilung = (ps) => { let d = [1]; for (const q of ps) { const nd = new Array(d.length + 1).fill(0); d.forEach((v, i) => { nd[i] += v * (1 - q); nd[i + 1] += v * q; }); d = nd; } return d; };
  const scat = verteilung(sicht.map((f) => f[W]));
  const pAusl = scat[3] + scat[4] + scat[5];
  const eScatter = scat[3] * E.SCATTER[0] + scat[4] * E.SCATTER[1] + scat[5] * E.SCATTER[2]; // in Gesamteinsätzen
  // --- Freispiele: Zusatzgewinn des Spezial-Symbols je Freispiel (in Gesamteinsätzen; 10 Linien je Linieneinsatz = 1 Gesamteinsatz)
  const eSpezial = [];
  for (let sym = 0; sym < W; sym++) {
    const d = verteilung(sicht.map((f) => f[sym]));
    let e = 0; for (let k = 3; k <= 5; k++) e += d[k] * E.AUSZAHLUNG[sym][k - 3];
    eSpezial.push(e); // * 10 Linien * Linieneinsatz = e * Gesamteinsatz
  }
  const eSpezialMittel = eSpezial.reduce((a, b) => a + b, 0) / eSpezial.length;
  const eNormal = eLinie / 10 * E.LINIEN.length / E.LINIEN.length + 0; // Linien in Gesamteinsätzen: 10 Linien * eLinie * (1/10)
  const eRunde = eLinie * E.LINIEN.length / 10 + eScatter; // Gesamteinsätze je bezahlter Runde
  // Anzahl Freispiele: Zustand (rest, gesamt), Neuauslösung mit pAusl (+10, gedeckelt)
  const memo = new Map();
  const eAnzahl = (rest, gesamt) => {
    if (rest === 0) return 0;
    const k = rest + ',' + gesamt; if (memo.has(k)) return memo.get(k);
    const neu = Math.min(E.FREISPIELE, E.FREISPIELE_MAX - gesamt);
    const v = 1 + pAusl * eAnzahl(rest - 1 + neu, gesamt + neu) + (1 - pAusl) * eAnzahl(rest - 1, gesamt);
    memo.set(k, v); return v;
  };
  const nFrei = eAnzahl(E.FREISPIELE, E.FREISPIELE);
  const eFreispiel = eRunde + eSpezialMittel;
  const eBonus = nFrei * eFreispiel;
  const rtp = eRunde + pAusl * eBonus;
  return { laengen: L, eLinien: eLinie * E.LINIEN.length / 10, eScatter, pAusl, eSpezial, nFrei, eFreispiel, eBonus, rtp, sicht };
}

function bauen(anzahl, seed) {
  const z = E.seedZufall(seed);
  return anzahl.map((a) => {
    for (let versuch = 0; versuch < 20000; versuch++) {
      const b = []; a.forEach((c, s) => { for (let i = 0; i < c; i++) b.push(s); });
      for (let i = b.length - 1; i > 0; i--) { const j = z(i + 1); [b[i], b[j]] = [b[j], b[i]]; }
      let ok = true;
      for (let i = 0; i < b.length && ok; i++) {
        if (b[i] === b[(i + 1) % b.length]) ok = false; // keine zwei gleichen Symbole direkt untereinander
        if (b[i] === E.WILD && (b[(i + 1) % b.length] === E.WILD || b[(i + 2) % b.length] === E.WILD)) ok = false;
      }
      if (ok) return b;
    }
    throw new Error('Kein gültiges Band gefunden');
  });
}

const zeig = (r) => {
  const pc = (x) => (x * 100).toFixed(2) + ' %';
  console.log('Bandlängen          ', r.laengen.join(' '));
  console.log('Linien (Grundspiel) ', pc(r.eLinien));
  console.log('Scatter             ', pc(r.eScatter));
  console.log('Freispiel-Auslösung  1 zu', (1 / r.pAusl).toFixed(1), '(' + pc(r.pAusl) + ')');
  console.log('Ø Freispiele je Bonus', r.nFrei.toFixed(3));
  console.log('Ø Bonusgewinn        ', r.eBonus.toFixed(2), '× Einsatz');
  console.log('Bonus-Anteil         ', pc(r.pAusl * r.eBonus));
  console.log('Auszahlungsquote     ', pc(r.rtp), '(Risiko-Spiel ist neutral: 50 % × doppelt)');
  console.log('Spezial-Zusatz je Freispiel (× Einsatz):', E.SYMBOLE.slice(0, 12).map((s, i) => s.kurz + ' ' + r.eSpezial[i].toFixed(3)).join('  '));
};

if (import.meta.url === 'file://' + process.argv[1]) {
  if (process.argv.includes('--bauen')) {
    const seed = Number(process.argv[process.argv.indexOf('--bauen') + 1]) || 7;
    const b = bauen(ANZAHL, seed);
    const r = rechne(b);
    zeig(r);
    console.log('\nexport const WALZEN = [\n' + b.map((x) => "  '" + x.map((s) => E.SYMBOLE[s].kurz).join('') + "'").join(',\n') + '\n];');
  } else zeig(rechne(E.BAENDER));
}
