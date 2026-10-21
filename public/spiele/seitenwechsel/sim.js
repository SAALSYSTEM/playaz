// SEITENWECHSEL: Spielregeln ohne DOM, rein ganzzahlig und deterministisch.
// Dieselbe Datei läuft im Browser und in der Prüf-Funktion des Servers (supabase/functions/seitenwechsel-lauf).
// Ein Lauf ist vollständig bestimmt durch: Kurs-Nummer (seed) + Tippzeitpunkte (Takte). Der Server fährt ihn nach.
//
// Spielfeld: ein Schacht der Breite W, der nach unten scrollt. Die Figur sitzt an einer Wand und flitzt bei jedem Tippen
// zur anderen Wand. Stacheln ragen von links oder rechts in den Schacht. Wer berührt, ist raus. Punkte = überlebte Zeit.

export const SIM_VERSION = 1;
export const W = 360;          // Schachtbreite (Logikpixel)
export const PL = 28;          // Figurgröße
export const V = 6;            // Scrollgeschwindigkeit je Takt (Tiefe)
export const VF = 10;          // Seitengeschwindigkeit der Figur je Takt
export const SPIKE = 190;      // Tiefe der Stacheln in den Schacht hinein (zwei gegenüber lassen keinen Platz in der Mitte)
export const MARGIN = 6;       // Nachsicht bei Berührung
export const TAPGAP = 4;       // Mindestabstand zwischen zwei Tippern (Takte); schnellere werden ignoriert
export const MAX_TICKS = 60 * 60 * 20;   // höchstens 20 Minuten je Lauf
export const X_MAX = W - PL;
export const START_VORLAUF = 70;         // Takte bis zum ersten Stachel

// Zufall (mulberry32): nur ganzzahlige Operationen, überall bitgleich
export function zufall(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Kurs: unendliche Folge von Stachel-Blöcken, Tiefe d0..d1 (in Pixeln), Seite 0 = links, 1 = rechts.
// Mit der Zahl der Blöcke werden Abstände und Längen kleiner (bis zu einem Mindestwert), das Spiel wird schneller im Takt.
export function neuerKurs(seed) {
  const r = zufall(seed ^ 0x5EED1234);
  const n = (k) => Math.floor(r() * k);
  const liste = [];
  let ende = START_VORLAUF * V, seite = 1;
  return {
    block(i) {
      while (liste.length <= i) {
        const k = liste.length;
        const wechsel = k === 0 ? true : n(100) < 72;                 // meist die andere Wand, manchmal dieselbe
        if (k > 0 && wechsel) seite = 1 - seite;
        const luecke = k === 0 ? 0 : wechsel ? Math.max(20, 74 - Math.floor(k * 1.4)) + n(12) : Math.max(10, 36 - k) + n(10);
        const laenge = Math.max(14, 48 - Math.floor(k / 3)) + n(22);
        const d0 = ende + luecke * V, d1 = d0 + laenge * V;
        liste.push({ d0, d1, seite });
        ende = d1;
      }
      return liste[i];
    }
  };
}

export function neuerLauf(seed) {
  const kurs = neuerKurs(seed);
  const s = { t: 0, x: 0, dir: -1, letzterTipp: -999, tot: false, naechster: 0 };   // x = linker Rand der Figur; Start an der linken Wand
  return {
    s, kurs,
    // Ein Takt. tipp = true, wenn in diesem Takt getippt wurde. Gibt false zurück, sobald der Lauf beendet ist.
    schritt(tipp) {
      if (s.tot) return false;
      if (tipp && s.t - s.letzterTipp >= TAPGAP) { s.dir = -s.dir; s.letzterTipp = s.t; }
      s.x += s.dir * VF;
      if (s.x < 0) s.x = 0; else if (s.x > X_MAX) s.x = X_MAX;
      s.t++;
      const p0 = s.t * V, p1 = p0 + PL;
      while (kurs.block(s.naechster).d1 - MARGIN <= p0) s.naechster++;
      for (let i = s.naechster; ; i++) {
        const b = kurs.block(i);
        if (b.d0 + MARGIN >= p1) break;
        if (b.seite === 0 ? s.x < SPIKE - MARGIN : s.x + PL > W - SPIKE + MARGIN) { s.tot = true; return false; }
      }
      if (s.t >= MAX_TICKS) { s.tot = true; return false; }
      return true;
    },
    punkte() { return Math.floor(s.t / 6); }
  };
}

// Eingaben als Text: Tippzeitpunkte als Abstände in Takten, Basis 36, durch Punkte getrennt ("1c.a.9"). Leer = nie getippt.
export function kodiere(tipps) {
  let vor = 0; const out = [];
  for (const t of tipps) { out.push((t - vor).toString(36)); vor = t; }
  return out.join('.');
}
export function dekodiere(text) {
  if (typeof text !== 'string') return null;
  if (text === '') return [];
  const teile = text.split('.'); if (teile.length > 20000) return null;
  const out = []; let t = 0;
  for (const p of teile) { if (!/^[0-9a-z]{1,6}$/.test(p)) return null; t += parseInt(p, 36); if (t > MAX_TICKS) return null; out.push(t); }
  return out;
}

// Nachfahren: Tipps (Takte, aufsteigend) -> Ergebnis. Läuft, bis die Figur berührt (oder MAX_TICKS erreicht sind).
export function nachfahren(seed, tipps) {
  const l = neuerLauf(seed); let k = 0;
  for (;;) {
    let tipp = false;
    while (k < tipps.length && tipps[k] < l.s.t) k++;
    if (k < tipps.length && tipps[k] === l.s.t) { tipp = true; k++; }
    if (!l.schritt(tipp)) break;
  }
  return { takte: l.s.t, punkte: l.punkte(), tot: l.s.tot };
}

// Serverseitige Prüfung einer gemeldeten Leistung
export function pruefeLauf(lauf) {
  try {
    if (!lauf || lauf.v !== SIM_VERSION) return { ok: false, grund: 'version' };
    if (!Number.isInteger(lauf.seed) || lauf.seed < 20200101 || lauf.seed > 20991231) return { ok: false, grund: 'seed' };
    const tipps = dekodiere(lauf.inputs);
    if (!tipps) return { ok: false, grund: 'eingaben' };
    for (let i = 1; i < tipps.length; i++) if (tipps[i] === tipps[i - 1]) return { ok: false, grund: 'eingaben' };
    const r = nachfahren(lauf.seed, tipps);
    if (!r.tot) return { ok: false, grund: 'kein_ende' };
    if (r.takte !== lauf.ticks || r.punkte !== lauf.score) return { ok: false, grund: 'ergebnis_weicht_ab', takte: r.takte, punkte: r.punkte };
    return { ok: true, takte: r.takte, punkte: r.punkte };
  } catch (e) { return { ok: false, grund: 'fehler' }; }
}
