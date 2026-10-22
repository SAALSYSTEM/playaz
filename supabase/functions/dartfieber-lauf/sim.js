// DARTFIEBER: Regeln. Ganzzahlig und deterministisch, damit Browser und Prüf-Funktion (Supabase Edge Function)
// jede Runde bitgleich nachrechnen. Diese Datei wird nach supabase/functions/dartfieber-lauf/sim.js kopiert
// (node tools/edge-sync.mjs). Keine Fließkomma-Winkelfunktionen: die Sektorgrenzen stehen als feste Tabelle da.
//
// Ablauf eines Wurfs (je 1 Takt = 1/60 s, die Bewegung hängt nur vom Takt ab, nie von der Bildrate):
//   x     senkrechte Ziellinie läuft hin und her; Tippen fixiert die Seite
//   y     waagerechte Ziellinie läuft hoch und runter; Tippen fixiert die Höhe
//   flug  Pfeil fliegt (feste Dauer, Eingaben gesperrt); am Ende wird gewertet
//   nach  kurze Pause mit Ergebnis (Eingaben gesperrt), dann der nächste Wurf
// Trefferpunkt = Zielpunkt + Windversatz. Keine Streuung, kein versteckter Zufall.
export const VERSION = 1;              // Konfigurationsversion (Regeln + wie aus dem Seed die Challenge entsteht)
export const MAX_TICKS = 60 * 60 * 15; // höchstens 15 Minuten je Runde

// ---------------------------------------------------------------------------------------------------------------
// Dartscheibe. Einheit: 1/100 mm einer Standard-Scheibe, Mittelpunkt (0, 0), x nach rechts, y nach unten.
// ---------------------------------------------------------------------------------------------------------------
export const REIHENFOLGE = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];   // im Uhrzeigersinn ab oben
export const RING = { innenBull: 635, aussenBull: 1590, dreifachInnen: 9900, dreifachAussen: 10700, doppelInnen: 16200, doppelAussen: 17000 };
export const SCHEIBE_AUSSEN = 22500;   // Rand des schwarzen Zahlenrings (nur Optik: dort gibt es 0 Punkte)
// Grenze j liegt bei (9 + 18 j) Grad im Uhrzeigersinn ab oben; Einheitsvektoren mal 1 000 000, gerundet.
// Sektor k reicht von Grenze k-1 (eingeschlossen) bis Grenze k (ausgeschlossen).
const BX = [156434, 453990, 707107, 891007, 987688, 987688, 891007, 707107, 453990, 156434, -156434, -453990, -707107, -891007, -987688, -987688, -891007, -707107, -453990, -156434];
const BY = [-987688, -891007, -707107, -453990, -156434, 156434, 453990, 707107, 891007, 987688, 987688, 891007, 707107, 453990, 156434, -156434, -453990, -707107, -891007, -987688];
export const GRENZEN = { x: BX, y: BY };
const kreuz = (ux, uy, vx, vy) => ux * vy - uy * vx;   // > 0: v liegt im Uhrzeigersinn von u (y zeigt nach unten)

// Sektor 0..19 (0 = oben, im Uhrzeigersinn) für einen Vektor (dx, dy) ungleich (0, 0).
// Regel: Ein Punkt genau auf einer Sektorgrenze gehört zum im Uhrzeigersinn folgenden Sektor.
export function sektor(dx, dy) {
  for (let k = 0; k < 20; k++) {
    const a = (k + 19) % 20;
    if (kreuz(BX[a], BY[a], dx, dy) >= 0 && kreuz(dx, dy, BX[k], BY[k]) > 0) return k;
  }
  return -1;
}

// Wertung eines Punkts, relativ zur Scheibenmitte (dx, dy in Feldeinheiten), Scheibengröße s in Promille (1000 = Normalgröße).
// Regel: Liegt ein Punkt genau auf einer Ringgrenze (Abstand = Radius), gehört er zum innen liegenden Feld.
// Alles jenseits des Doppelrings (auch der Zahlenring) zählt 0.
export function treffer(dx, dy, s) {
  const d = (dx * dx + dy * dy) * 1e6;
  const innen = (r) => d <= (r * s) * (r * s);
  if (innen(RING.innenBull)) return { ring: 'innenbull', sektor: -1, zahl: 25, faktor: 2, punkte: 50 };
  if (innen(RING.aussenBull)) return { ring: 'aussenbull', sektor: -1, zahl: 25, faktor: 1, punkte: 25 };
  if (!innen(RING.doppelAussen)) return { ring: 'aus', sektor: -1, zahl: 0, faktor: 0, punkte: 0 };
  const k = sektor(dx, dy), zahl = REIHENFOLGE[k];
  const ring = innen(RING.dreifachInnen) ? 'innen' : innen(RING.dreifachAussen) ? 'dreifach' : innen(RING.doppelInnen) ? 'aussen' : 'doppel';
  const faktor = ring === 'dreifach' ? 3 : ring === 'doppel' ? 2 : 1;
  return { ring, sektor: k, zahl, faktor, punkte: zahl * faktor };
}

// Farbe eines Felds (Zeichnen und Test nutzen dieselbe Zuordnung): 'schwarz' | 'creme' | 'rot' | 'gruen'
export function feldFarbe(ring, k) {
  if (ring === 'innenbull') return 'rot';
  if (ring === 'aussenbull') return 'gruen';
  const gerade = k % 2 === 0;
  if (ring === 'doppel' || ring === 'dreifach') return gerade ? 'rot' : 'gruen';
  return gerade ? 'schwarz' : 'creme';
}

// ---------------------------------------------------------------------------------------------------------------
// Zufall (mulberry32): nur ganzzahlige Operationen, überall bitgleich. Wird NUR zum Bau der Challenge benutzt,
// nie während der Runde.
// ---------------------------------------------------------------------------------------------------------------
export function zufall(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Konfiguration je Version. Alle Spielparameter stehen hier an einer Stelle. Eine Änderung bekommt eine NEUE Version
// (die alte bleibt stehen, damit frühere Tage nachrechenbar bleiben).
// ---------------------------------------------------------------------------------------------------------------
export const KONFIG = {
  1: {
    pfeile: 5, maxWuerfe: 30, bonusPfeile: 3,
    flugTicks: 36,            // 0,6 s Flug, Eingaben gesperrt
    nachTicks: 24,            // 0,4 s Ergebnisanzeige, Eingaben gesperrt
    sperre: 6,                // Tippen zählt frühestens 6 Takte nach Beginn einer Linie (verhindert Doppelauslösung)
    feld: 21000,              // halbe Seitenlänge des logischen Spielfelds; die Linien laufen von -feld bis +feld
    scheibe: { min: 820, max: 1000, versatz: 1400 },   // Größe in Promille, Verschiebung der Mitte (je Achse)
    tempo: { min: 220, max: 320, zuwachs: 12, deckel: 1400 },   // Einheiten je Takt am Anfang; +1,2 % je Wurf, höchstens +40 %
    wind: { block: 5, max: [2, 6], jeMs: 300 },        // Wind gilt je 5 Würfe; Versatz je m/s: 3 mm
    bonus: { erster: [1, 2], abstand: [2, 3], r0: 2000, rMin: 1000, schwund: 28, rand: 880 }   // Radius in Feldeinheiten (20 mm → 12 mm bei Wurf 30)
  }
};
export const WIND_X = [0, 707, 1000, 707, 0, -707, -1000, -707];     // N, NO, O, SO, S, SW, W, NW (Promille)
export const WIND_Y = [-1000, -707, 0, 707, 1000, 707, 0, -707];
const rund1000 = (n) => Math.floor((n + 500) / 1000);

// Alle Bedingungen eines Tages aus Seed + Version. Gleicher Seed + gleiche Version = gleiche Challenge, überall.
export function challengeAus(seed, version) {
  const K = KONFIG[version];
  if (!K || !Number.isInteger(seed) || seed < 1 || seed > 2147483647) return null;
  const r = zufall((seed ^ 0x51ED270B) >>> 0);
  const ganz = (a, b) => a + Math.floor(r() * (b - a + 1));    // a bis b einschließlich
  const ch = { version, seed, K };
  ch.s = ganz(K.scheibe.min, K.scheibe.max);
  ch.cx = ganz(-K.scheibe.versatz, K.scheibe.versatz);
  ch.cy = ganz(-K.scheibe.versatz, K.scheibe.versatz);
  ch.v0 = ganz(K.tempo.min, K.tempo.max);
  ch.windMax = ganz(K.wind.max[0], K.wind.max[1]);
  ch.wind = [];
  for (let b = 0; b < Math.ceil(K.maxWuerfe / K.wind.block); b++) {
    const richtung = ganz(0, 7), staerke = ganz(0, ch.windMax);
    ch.wind.push({ richtung, staerke, dx: rund1000(staerke * K.wind.jeMs * WIND_X[richtung]), dy: rund1000(staerke * K.wind.jeMs * WIND_Y[richtung]) });
  }
  const L = 4 * K.feld;
  ch.startX = []; ch.startY = [];
  for (let i = 0; i < K.maxWuerfe; i++) { ch.startX.push(ganz(0, L - 1)); ch.startY.push(ganz(0, L - 1)); }
  ch.bonus = new Array(K.maxWuerfe).fill(null);
  const rb = Math.floor((RING.doppelAussen * ch.s / 1000) * K.bonus.rand / 1000);
  for (let n = ganz(K.bonus.erster[0], K.bonus.erster[1]); n < K.maxWuerfe; n += ganz(K.bonus.abstand[0], K.bonus.abstand[1])) {
    let px = 0, py = 0;
    for (let v = 0; v < 40; v++) { const x = ganz(-rb, rb), y = ganz(-rb, rb); if (x * x + y * y <= rb * rb) { px = x; py = y; break; } }
    ch.bonus[n] = { x: ch.cx + px, y: ch.cy + py, r: Math.max(K.bonus.rMin, K.bonus.r0 - K.bonus.schwund * n) };
  }
  return ch;
}

// Linienposition: Dreieckswelle über das Feld. start in [0, 4*feld), k = Takte seit Beginn der Linie.
export function linie(K, start, v, k) {
  const F = K.feld, u = (start + v * k) % (4 * F);
  return u < 2 * F ? u - F : 3 * F - u;
}
export const tempoWurf = (ch, i) => Math.floor(ch.v0 * Math.min(ch.K.tempo.deckel, 1000 + ch.K.tempo.zuwachs * i) / 1000);
export const windWurf = (ch, i) => ch.wind[Math.floor(i / ch.K.wind.block)];

// ---------------------------------------------------------------------------------------------------------------
// Runde. Zustand s.phase: 'x' | 'y' | 'flug' | 'nach' | 'ende'. schritt(tipp) = ein Takt; liefert false, wenn die Runde zu Ende ist.
// s.ev nennt, was in diesem Takt passiert ist: '' | 'stopp1' | 'wurf' | 'landung' | 'naechster' | 'ende'.
// ---------------------------------------------------------------------------------------------------------------
export function neueRunde(ch) {
  const K = ch.K;
  const s = { t: 0, i: 0, phase: 'x', k: 0, ax: 0, ay: 0, hx: 0, hy: 0, pfeile: K.pfeile, punkte: 0, wuerfe: 0, boni: 0, ev: '', letzter: null, lauf: null };
  const pos = (achse) => linie(K, achse === 'x' ? ch.startX[s.i] : ch.startY[s.i], tempoWurf(ch, s.i), s.k);
  const nimmtTipp = () => (s.phase === 'x' || s.phase === 'y') && s.k >= K.sperre;
  function schritt(tipp) {
    s.ev = '';
    if (s.phase === 'ende') return false;
    s.t++;
    if (s.phase === 'x' || s.phase === 'y') {
      if (tipp && s.k >= K.sperre) {
        if (s.phase === 'x') { s.ax = pos('x'); s.phase = 'y'; s.k = 0; s.ev = 'stopp1'; }
        else {
          s.ay = pos('y');
          const w = windWurf(ch, s.i);
          s.hx = s.ax + w.dx; s.hy = s.ay + w.dy;
          s.pfeile--; s.phase = 'flug'; s.k = 0; s.ev = 'wurf';
        }
      } else s.k++;
      return true;
    }
    s.k++;
    if (s.phase === 'flug' && s.k >= K.flugTicks) {
      const res = treffer(s.hx - ch.cx, s.hy - ch.cy, ch.s);
      const b = ch.bonus[s.i];
      const bonus = !!b && (s.hx - b.x) * (s.hx - b.x) + (s.hy - b.y) * (s.hy - b.y) <= b.r * b.r;
      if (bonus) { s.pfeile += K.bonusPfeile; s.boni++; }
      s.punkte += res.punkte; s.wuerfe++;
      s.letzter = { i: s.i, ax: s.ax, ay: s.ay, hx: s.hx, hy: s.hy, ...res, bonus };
      s.k = 0;
      if (s.pfeile <= 0 || s.wuerfe >= K.maxWuerfe) { s.phase = 'ende'; s.ev = 'ende'; return false; }
      s.phase = 'nach'; s.ev = 'landung';
    } else if (s.phase === 'nach' && s.k >= K.nachTicks) {
      s.i++; s.phase = 'x'; s.k = 0; s.ev = 'naechster';
    }
    return true;
  }
  return { s, schritt, nimmtTipp, pos };
}

// ---------------------------------------------------------------------------------------------------------------
// Eingaben als Text: Takt jedes angenommenen Tippens als Abstand zum vorigen, Basis 36, durch Punkte getrennt ("1c.a.9").
// ---------------------------------------------------------------------------------------------------------------
export function kodiere(tipps) {
  let vor = 0; const out = [];
  for (const t of tipps) { out.push((t - vor).toString(36)); vor = t; }
  return out.join('.');
}
export function dekodiere(text, maxTipps = 64) {
  if (typeof text !== 'string') return null;
  if (text === '') return [];
  const teile = text.split('.'); if (teile.length > maxTipps) return null;
  const out = []; let t = 0;
  for (const p of teile) { if (!/^[0-9a-z]{1,6}$/.test(p)) return null; t += parseInt(p, 36); if (t > MAX_TICKS) return null; out.push(t); }
  return out;
}

// Nachfahren: Tipps (Takte, aufsteigend) -> Ergebnis. Jeder Tipp muss in einem Takt liegen, in dem er gilt.
export function nachfahren(ch, tipps) {
  const l = neueRunde(ch); let k = 0;
  for (;;) {
    let tipp = false;
    if (k < tipps.length) {
      if (tipps[k] < l.s.t) return { fehler: 'eingaben' };
      if (tipps[k] === l.s.t) { if (!l.nimmtTipp()) return { fehler: 'eingaben' }; tipp = true; k++; }
    }
    if (!l.schritt(tipp)) break;
    if (l.s.t >= MAX_TICKS) return { fehler: 'zu_lang' };
  }
  if (k < tipps.length) return { fehler: 'eingaben' };
  return { ticks: l.s.t, punkte: l.s.punkte, wuerfe: l.s.wuerfe, boni: l.s.boni, ende: l.s.phase === 'ende' };
}

// Serverseitige Prüfung einer gemeldeten Runde. Seed und Version kommen aus der Datenbank (Run-ID), nie vom Browser.
export function pruefeLauf(seed, version, lauf) {
  try {
    const ch = challengeAus(seed, version);
    if (!ch) return { ok: false, grund: 'version' };
    if (!lauf || typeof lauf !== 'object') return { ok: false, grund: 'ungueltig' };
    const tipps = dekodiere(lauf.inputs, 2 * ch.K.maxWuerfe);
    if (!tipps) return { ok: false, grund: 'eingaben' };
    const r = nachfahren(ch, tipps);
    if (r.fehler) return { ok: false, grund: r.fehler };
    if (!r.ende) return { ok: false, grund: 'kein_ende' };
    if (r.ticks !== lauf.ticks || r.punkte !== lauf.score || r.wuerfe !== lauf.throws) return { ok: false, grund: 'ergebnis_weicht_ab', ticks: r.ticks, punkte: r.punkte, wuerfe: r.wuerfe };
    return { ok: true, ticks: r.ticks, punkte: r.punkte, wuerfe: r.wuerfe, boni: r.boni };
  } catch (e) { return { ok: false, grund: 'fehler' }; }
}
