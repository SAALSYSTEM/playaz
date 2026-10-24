// HALMA 16x16: Regeln, Partie und Computergegner ohne Oberfläche (läuft auch im Web Worker und in Node-Tests).
// Brett: 256 Felder, Index = Zeile * 16 + Spalte, Zeile 0 oben. Spieler 1 = Hell (Lager unten links), 2 = Dunkel (Lager oben rechts).
// Jede Seite hat 19 Steine in ihrer Ecke (Reihen zu 5, 5, 4, 3, 2) und will sie ins gegenüberliegende Lager bringen.
export const N = 16, ANZ = 19, MAX_ZUEGE = 200;   // MAX_ZUEGE je Seite, danach Remis

export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export const zeile = (i) => i >> 4, spalte = (i) => i & 15;

// ---------- Lager und Nachbarn ----------
const BREITEN = [5, 5, 4, 3, 2];
const eckeObenLinks = [];
BREITEN.forEach((b, r) => { for (let c = 0; c < b; c++) eckeObenLinks.push([r, c]); });
export const LAGER = [null,
  eckeObenLinks.map(([r, c]) => (N - 1 - r) * N + c),          // Hell: unten links
  eckeObenLinks.map(([r, c]) => r * N + (N - 1 - c))];         // Dunkel: oben rechts
export const ZIEL = [null, LAGER[2], LAGER[1]];
const imZiel = [null, new Uint8Array(N * N), new Uint8Array(N * N)];
for (const p of [1, 2]) for (const i of ZIEL[p]) imZiel[p][i] = 1;
export const istZiel = (p, i) => imZiel[p][i] === 1;

const RICHT = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const NACH = new Int16Array(N * N * 8).fill(-1), SPRUNG = new Int16Array(N * N * 8).fill(-1);
for (let i = 0; i < N * N; i++) for (let d = 0; d < 8; d++) {
  const r = zeile(i), c = spalte(i), [dr, dc] = RICHT[d];
  const r1 = r + dr, c1 = c + dc, r2 = r + 2 * dr, c2 = c + 2 * dc;
  if (r1 >= 0 && r1 < N && c1 >= 0 && c1 < N) NACH[i * 8 + d] = r1 * N + c1;
  if (r2 >= 0 && r2 < N && c2 >= 0 && c2 < N) SPRUNG[i * 8 + d] = r2 * N + c2;
}

// Fortschritt eines Feldes für Spieler p: Weg zur Zielecke (0 = eigene Ecke hinten, 30 = Zielecke), leicht gewölbt,
// damit Nachzügler mehr zählen als Steine, die schon weit vorn stehen.
const FORT = [null, new Float64Array(N * N), new Float64Array(N * N)];
for (let i = 0; i < N * N; i++) {
  const r = zeile(i), c = spalte(i), d1 = (N - 1 - r) + c, d2 = r + (N - 1 - c);
  FORT[1][i] = d1 * (1 - d1 / 90); FORT[2][i] = d2 * (1 - d2 / 90);
}

// ---------- Stellung ----------
// s = { b: Int8Array(256) (0 leer, 1 Hell, 2 Dunkel), am, st: [_, Int16Array(19), Int16Array(19)] Steinfelder, sc: [_, Σ Fortschritt Hell, Σ Dunkel],
//       g: [_, [_, Hell im Hell-Ziel, Dunkel im Hell-Ziel], [_, …]], n: Halbzüge }
export function neueStellung() {
  const s = { b: new Int8Array(N * N), am: 1, st: [null, new Int16Array(ANZ), new Int16Array(ANZ)], sc: [0, 0, 0], g: [null, [0, 0, 0], [0, 0, 0]], n: 0 };
  for (const p of [1, 2]) LAGER[p].forEach((i, k) => { s.b[i] = p; s.st[p][k] = i; });
  neuBerechnen(s);
  return s;
}
export function neuBerechnen(s) {
  s.sc = [0, 0, 0]; s.g = [null, [0, 0, 0], [0, 0, 0]];
  for (const p of [1, 2]) for (let k = 0; k < ANZ; k++) {
    const i = s.st[p][k]; s.sc[p] += FORT[p][i];
    for (const q of [1, 2]) s.g[q][p] += imZiel[q][i];
  }
}
export function kopie(s) {
  return { b: Int8Array.from(s.b), am: s.am, st: [null, Int16Array.from(s.st[1]), Int16Array.from(s.st[2])], sc: [0, s.sc[1], s.sc[2]], g: [null, s.g[1].slice(), s.g[2].slice()], n: s.n };
}
export const schluessel = (s) => String.fromCharCode(...s.b.reduce((a, v, i) => { if (v) a.push(v === 1 ? i : i + 256); return a; }, []).sort()) + s.am;
export const imZielAnzahl = (s, p) => s.g[p][p];

// ---------- Züge ----------
// Ein Zug = { v: von, n: nach }. Erlaubt: ein Feld in beliebige Richtung (8 Richtungen) oder eine Kette von Sprüngen
// über beliebige Steine (eigene wie gegnerische, über jeweils einen) auf freie Felder. Erreichbare Ziele zählen als ein Zug.
const besucht = new Int32Array(N * N); let marke = 0;
const stapel = new Int16Array(N * N);
function ziele(s, v, aus) {
  const b = s.b, ein = b[v]; b[v] = 0;
  let sp = 0; marke++; besucht[v] = marke; stapel[sp++] = v;
  while (sp) {
    const x = stapel[--sp];
    for (let d = 0; d < 8; d++) {
      const m = NACH[x * 8 + d], l = SPRUNG[x * 8 + d];
      if (l >= 0 && b[m] && !b[l] && besucht[l] !== marke) { besucht[l] = marke; aus.push(l); stapel[sp++] = l; }
    }
  }
  const sprung = aus.length;
  for (let d = 0; d < 8; d++) { const m = NACH[v * 8 + d]; if (m >= 0 && !b[m]) aus.push(m); }
  b[v] = ein;
  return sprung;
}
export function zielfelder(s, v) { const a = []; if (s.b[v]) ziele(s, v, a); return a; }

export function zuege(s) {
  const p = s.am, liste = [], tmp = [];
  for (let k = 0; k < ANZ; k++) {
    const v = s.st[p][k]; tmp.length = 0; ziele(s, v, tmp);
    for (const n of tmp) liste.push({ v, n });
  }
  return liste;
}
export const gleich = (a, b) => a.v === b.v && a.n === b.n;

// Der Weg einer Figur (Start, Landefelder …, Ziel): kürzeste Sprungkette, oder ein einzelner Schritt.
export function weg(s, v, n) {
  const b = s.b, ein = b[v]; b[v] = 0;
  try {
    if (Math.abs(zeile(v) - zeile(n)) <= 1 && Math.abs(spalte(v) - spalte(n)) <= 1) return [v, n];
    const vor = new Map([[v, -1]]), q = [v];
    for (let h = 0; h < q.length; h++) {
      const x = q[h];
      if (x === n) break;
      for (let d = 0; d < 8; d++) {
        const m = NACH[x * 8 + d], l = SPRUNG[x * 8 + d];
        if (l >= 0 && b[m] && !b[l] && !vor.has(l)) { vor.set(l, x); q.push(l); }
      }
    }
    if (!vor.has(n)) return [v, n];
    const pfad = []; for (let x = n; x !== -1; x = vor.get(x)) pfad.push(x);
    return pfad.reverse();
  } finally { b[v] = ein; }
}

function setzeStein(s, p, v, n) {
  const st = s.st[p]; for (let k = 0; k < ANZ; k++) if (st[k] === v) { st[k] = n; break; }
  s.b[v] = 0; s.b[n] = p;
  s.sc[p] += FORT[p][n] - FORT[p][v];
  s.g[1][p] += imZiel[1][n] - imZiel[1][v]; s.g[2][p] += imZiel[2][n] - imZiel[2][v];
}
export function mache(s, m) {
  const p = s.am; setzeStein(s, p, m.v, m.n); s.am = 3 - p; s.n++;
}
export function nimmZurueck(s, m) {
  s.am = 3 - s.am; s.n--; setzeStein(s, s.am, m.n, m.v);
}

// ---------- Partie ----------
const BUCHST = 'abcdefghijklmnop';
const feldText = (i) => BUCHST[zeile(i)] + BUCHST[spalte(i)];
export const kodiere = (m) => feldText(m.v) + feldText(m.n);
export const partieText = (partie) => partie.zuege.map(kodiere).join('');
export function neuePartie() { return { s: neueStellung(), zuege: [] }; }
export function spiele(partie, m) {
  if (status(partie).ende) return false;
  const p = partie.s.am;
  if (partie.s.b[m.v] !== p || partie.s.b[m.n] || !zielfelder(partie.s, m.v).includes(m.n)) return false;
  mache(partie.s, m); partie.zuege.push({ v: m.v, n: m.n });
  return true;
}
export function partieAus(text) {
  if (typeof text !== 'string' || text.length > 4 * MAX_ZUEGE * 2 + 8 || text.length % 4) return null;
  const p = neuePartie();
  const feld = (a, b) => { const r = BUCHST.indexOf(a), c = BUCHST.indexOf(b); return r < 0 || c < 0 ? -1 : r * N + c; };
  for (let k = 0; k < text.length; k += 4) {
    const v = feld(text[k], text[k + 1]), n = feld(text[k + 2], text[k + 3]);
    if (v < 0 || n < 0 || !spiele(p, { v, n })) return null;
  }
  return p;
}

// Gewonnen hat, wer alle 19 Steine im Zielfeld hat. Damit niemand mit ein, zwei Steinen im eigenen Lager blockieren kann,
// genügt es, wenn das Zielfeld voll ist und mindestens 17 davon eigene Steine sind.
export function hatGewonnen(s, p) {
  const eigene = s.g[p][p], fremde = s.g[p][3 - p];
  return eigene === ANZ || (eigene + fremde === ANZ && eigene >= ANZ - 2);
}
// Ergebnis: { ende, sieger (1/2, 0 = Remis), grund: 'ziel' | 'zulang' | 'blockiert' }
export function status(partie) {
  const s = partie.s;
  for (const p of [1, 2]) if (hatGewonnen(s, p)) return { ende: true, sieger: p, grund: 'ziel' };
  if (s.n >= MAX_ZUEGE * 2) return { ende: true, sieger: 0, grund: 'zulang' };
  if (!zuege(s).length) return { ende: true, sieger: 0, grund: 'blockiert' };
  return { ende: false, sieger: 0, grund: '' };
}

// ---------- Bewertung und Suche ----------
const SIEG = 100000;
const bewerte = (s, p) => s.sc[p] - s.sc[3 - p];
class Abbruch extends Error {}

// Wie viel bringt der Zug gleich: Fortschritt des Steins (Sprungketten ergeben große Werte).
const zugWert = (s, p, m) => FORT[p][m.n] - FORT[p][m.v];

export const STUFEN = {
  gemuetlich: { tiefe: 1, breite: 99, rausch: 3.5, fehler: 0.08 },
  geuebt: { tiefe: 3, breite: 10 },
  meister: { tiefe: 8, breite: 12, zeit: 900 }
};

export function kiZug(stellung, stufe = 'meister', opts = {}) {
  const st = typeof stufe === 'string' ? STUFEN[stufe] : stufe;
  const zufall = opts.zufall || Math.random;
  const s = kopie(stellung), p0 = s.am;
  const alle = zuege(s);
  if (!alle.length) return null;
  if (st.fehler && zufall() < st.fehler) {
    // Fehlgriff: ein zufälliger Zug, der nicht rückwärts geht
    const vor = alle.filter((m) => zugWert(s, p0, m) >= 0);
    const q = vor.length ? vor : alle; return q[Math.floor(zufall() * q.length)];
  }
  const ende = st.zeit ? Date.now() + (opts.zeit != null ? opts.zeit : st.zeit) : Infinity;
  const maxTiefe = opts.tiefe || st.tiefe;
  let knoten = 0;

  const kandidaten = (liste, p, breite) => {
    for (const m of liste) m.w = zugWert(s, p, m);
    liste.sort((a, b) => b.w - a.w);
    return liste.length > breite ? liste.slice(0, breite) : liste;
  };
  function suche(tiefe, alpha, beta, ply) {
    if ((++knoten & 1023) === 0 && Date.now() > ende) throw new Abbruch();
    const p = s.am;
    if (tiefe <= 0) return bewerte(s, p);
    const liste = kandidaten(zuege(s), p, st.breite);
    let bester = -Infinity;
    for (const m of liste) {
      mache(s, m);
      let w;
      if (hatGewonnen(s, p)) w = SIEG - ply;     // der Zieher hat mit diesem Zug gewonnen
      else w = -suche(tiefe - 1, -beta, -alpha, ply + 1);
      nimmZurueck(s, m);
      if (w > bester) bester = w;
      if (w > alpha) alpha = w;
      if (alpha >= beta) break;
    }
    return bester;
  }

  const wurzel = kandidaten(alle, p0, st.breite).map((m) => ({ m, w: 0, r: zufall() }));
  if (st.rausch) {     // Gemütlich: nur Sofortwert plus kräftiges Rauschen, kein Vorausschauen
    let best = null, bw = -Infinity;
    for (const x of wurzel) { const w = x.m.w + (zufall() - 0.5) * 2 * st.rausch; if (w > bw) { bw = w; best = x.m; } }
    return { v: best.v, n: best.n };
  }
  let ergebnis = wurzel[0].m;
  for (let tiefe = 1; tiefe <= maxTiefe; tiefe++) {
    try {
      let alpha = -Infinity;
      const neu = [];
      for (const x of wurzel) {
        mache(s, x.m);
        let w;
        if (hatGewonnen(s, p0)) w = SIEG;
        else w = -suche(tiefe - 1, -Infinity, -alpha, 1);
        nimmZurueck(s, x.m);
        neu.push({ m: x.m, w, r: x.r });
        if (w > alpha) alpha = w;
      }
      neu.sort((a, b) => b.w - a.w || a.r - b.r);
      wurzel.splice(0, wurzel.length, ...neu);
      ergebnis = wurzel[0].m;
      if (wurzel[0].w >= SIEG - 100) break;
      if (opts.info) { opts.info.tiefe = tiefe; opts.info.wert = wurzel[0].w; opts.info.knoten = knoten; }
    } catch (err) {
      if (!(err instanceof Abbruch)) throw err;
      break;
    }
  }
  return { v: ergebnis.v, n: ergebnis.n };
}
