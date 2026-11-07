// Leuchtpfad – Wege, Zeigen, Nachlaufen, Sterne, Rekordpfad und Spielstand (ohne DOM, in Node testbar).
// Grundsatz für Kinder ab 4: kein Zeitdruck beim Nachlaufen. Ein falscher Stein macht „Hoppla!“,
// Lumi fliegt zurück zum Start und zeigt den Weg noch einmal.

export const STORE = 'leuchtpfad.v1';

// ---------- Zufall mit festem Startwert (auf jedem Gerät gleich) ----------
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Feld ----------
export const zeile = (cell, cols) => Math.floor(cell / cols);
export const spalte = (cell, cols) => cell % cols;
export function nachbarn(cell, cols, rows) {
  const r = zeile(cell, cols), c = spalte(cell, cols), n = [];
  if (r > 0) n.push(cell - cols);
  if (r < rows - 1) n.push(cell + cols);
  if (c > 0) n.push(cell - 1);
  if (c < cols - 1) n.push(cell + 1);
  return n;
}
export const benachbart = (a, b, cols) =>
  Math.abs(zeile(a, cols) - zeile(b, cols)) + Math.abs(spalte(a, cols) - spalte(b, cols)) === 1;

export function knicke(path, cols) {
  let n = 0;
  for (let i = 2; i < path.length; i++) {
    const d1 = path[i - 1] - path[i - 2], d2 = path[i] - path[i - 1];
    if (d1 !== d2) n++;
  }
  return n;
}
export const mindestKnicke = (len) => (len >= 8 ? 2 : len >= 4 ? 1 : 0);

// Weg erzeugen: beginnt in der untersten Reihe, endet weiter oben, Schritte nur waagrecht/senkrecht,
// kein Stein doppelt. "Berührungsfrei": ein Stein liegt nie neben einem anderen Wegstein außer Vorgänger/Nachfolger –
// so ist der Weg auf einen Blick eindeutig.
export function macheWeg(rand, cols, rows, len, beruehrungsfrei = true) {
  for (let versuch = 0; versuch < 4000; versuch++) {
    const start = (rows - 1) * cols + Math.floor(rand() * cols);
    const path = [start], drin = new Set(path);
    while (path.length < len) {
      const cur = path[path.length - 1];
      const opts = nachbarn(cur, cols, rows).filter((n) => {
        if (drin.has(n)) return false;
        if (!beruehrungsfrei) return true;
        return nachbarn(n, cols, rows).every((m) => m === cur || !drin.has(m));
      });
      if (!opts.length) break;
      // leichte Vorliebe für "nach oben", damit Lumi Richtung Pilzhaus läuft
      const gew = opts.map((n) => (n === cur - cols ? 1.6 : 1));
      let x = rand() * gew.reduce((a, b) => a + b, 0), k = 0;
      while (x > gew[k]) { x -= gew[k]; k++; }
      path.push(opts[Math.min(k, opts.length - 1)]);
      drin.add(path[path.length - 1]);
    }
    if (path.length < len) continue;
    if (zeile(path[len - 1], cols) >= zeile(start, cols)) continue;
    if (knicke(path, cols) < mindestKnicke(len)) continue;
    return path;
  }
  if (beruehrungsfrei) return macheWeg(rand, cols, rows, len, false);
  throw new Error(`Kein Weg für ${cols}×${rows}, Länge ${len}`);
}

// Irrlichter: Steine direkt neben dem Weg (wie eine Abzweigung), nicht neben dem Start und nicht nebeneinander
export function macheIrrlichter(rand, path, cols, rows, n) {
  if (!n) return [];
  const drin = new Set(path), start = path[0];
  const kand = [];
  for (let i = 1; i < path.length - 1; i++) {
    for (const m of nachbarn(path[i], cols, rows)) {
      if (drin.has(m) || benachbart(m, start, cols) || kand.some((k) => k.cell === m)) continue;
      kand.push({ cell: m, an: i });
    }
  }
  const out = [];
  while (out.length < n && kand.length) {
    const k = kand.splice(Math.floor(rand() * kand.length), 1)[0];
    if (out.some((o) => benachbart(o.cell, k.cell, cols))) continue;
    out.push(k);
  }
  return out.sort((a, b) => a.an - b.an);
}

// Spielbrett eines Levels (oder einer Rekordpfad-Runde)
export function brett(def) {
  const rand = rng(def.seed);
  const path = macheWeg(rand, def.c, def.r, def.len);
  const irr = macheIrrlichter(rand, path, def.c, def.r, def.irr || 0);
  return { cols: def.c, rows: def.r, path, irr, step: def.step, hold: def.hold, spur: def.spur || 0 };
}

// ---------- Zeigen (reine Zeitrechnung, die Oberfläche fragt nur ab) ----------
export const zeigeEnde = (b) => (b.path.length - 1) * b.step + b.hold;
export const zeigeDauer = (b) => zeigeEnde(b) + 350;
const FADE_IN = 140, FADE_OUT = 300;
// Helligkeit 0..1 von Wegstein i zur Zeit t (ms seit Beginn des Zeigens)
export function helligkeit(b, i, t) {
  const an = i * b.step;
  if (t < an) return 0;
  const aus = b.spur ? Math.min((i + b.spur) * b.step, zeigeEnde(b)) : zeigeEnde(b);
  if (t < aus) return Math.min(1, (t - an) / FADE_IN);
  return Math.max(0, 1 - (t - aus) / FADE_OUT);
}
// Irrlicht flackert kurz auf, wenn Lumi an seiner Abzweigung vorbeifliegt
export function irrHelligkeit(b, irr, t) {
  const an = irr.an * b.step + b.step * 0.35, dauer = Math.max(450, b.step * 1.4);
  if (t < an || t > an + dauer) return 0;
  const k = (t - an) / dauer;
  return Math.min(1, k * 6, (1 - k) * 4);
}
// Lumis Position (Kommazahl im Weg) beim Zeigen
export const lumiBeimZeigen = (b, t) => Math.max(0, Math.min(b.path.length - 1, t / b.step));

// ---------- Nachlaufen ----------
export const neuerLauf = () => ({ pos: 0, fehler: 0, hinweise: 0, done: false });

// Stein antippen: 'still' (Start oder schon gelaufen), 'gut', 'ziel' (Pilzhaus erreicht), 'falsch'
export function tippe(b, st, cell) {
  if (st.done) return 'still';
  const i = b.path.indexOf(cell);
  if (i !== -1 && i <= st.pos) return 'still';
  if (i === st.pos + 1) {
    st.pos = i;
    if (i === b.path.length - 1) { st.done = true; return 'ziel'; }
    return 'gut';
  }
  st.fehler++;
  st.pos = 0;
  return 'falsch';
}
export function hinweis(st) { if (!st.done) { st.hinweise++; st.pos = 0; } }

// Sterne: ohne Fehler und ohne „Nochmal zeigen“ 3, mit einem davon 2, sonst 1 (geschafft ist immer geschafft)
export const sterne = (st) => { const w = st.fehler + st.hinweise; return w <= 0 ? 3 : w <= 1 ? 2 : 1; };

// ---------- Rekordpfad (endlos: jede Runde ein Stein mehr, 3 Glühwürmchen-Leben) ----------
export const REKORD_START = 3, REKORD_MAX = 22;   // ab 22 Steinen wird nur noch das Zeigen schneller
export function rekordRunde(seed, len) {
  const l = Math.min(REKORD_MAX, len);
  return brett({ seed, c: 5, r: 7, len: l, step: Math.max(300, 600 - len * 22), hold: Math.max(450, 1500 - len * 80), spur: 0, irr: 0 });
}

// ---------- Spielstand ----------
export const freshSave = () => ({ v: 1, unlocked: 1, best: {}, rekord: 0, mute: false });

export function sanitizeSave(raw, count) {
  const s = freshSave();
  if (!raw || typeof raw !== 'object') return s;
  if (raw.mute === true) s.mute = true;
  if (raw.best && typeof raw.best === 'object') {
    for (const [k, v] of Object.entries(raw.best)) {
      const n = Number(k), st = Number(v);
      if (Number.isInteger(n) && n >= 1 && n <= count && Number.isInteger(st) && st >= 1 && st <= 3) s.best[n] = st;
    }
  }
  const r = Number(raw.rekord);
  if (Number.isInteger(r) && r > 0 && r <= 99) s.rekord = r;
  let u = Number(raw.unlocked);
  if (!Number.isInteger(u) || u < 1) u = 1;
  const done = Object.keys(s.best).map(Number);
  if (done.length) u = Math.max(u, Math.max(...done) + 1);
  s.unlocked = Math.min(count, u);
  return s;
}

// Level geschafft: Bestwert merken, nächstes Level frei. Liefert { rec, stars }
export function recordWin(save, n, st, count) {
  const stars = sterne(st);
  const rec = !save.best[n] || stars > save.best[n];
  if (rec) save.best[n] = stars;
  if (n <= save.unlocked && n + 1 > save.unlocked) save.unlocked = Math.min(count, n + 1);   // Einladung schaltet nichts außer der Reihe frei
  return { rec, stars };
}
export const totalStars = (save) => Object.values(save.best).reduce((a, b) => a + b, 0);

// Einladung per Link: ?l=Level oder ?r=Rekord (Rekordpfad-Herausforderung)
export function parseInvite(search, count) {
  const q = new URLSearchParams(search || ''), l = Number(q.get('l')), r = Number(q.get('r'));
  if (Number.isInteger(l) && l >= 1 && l <= count) return { l };
  if (Number.isInteger(r) && r >= REKORD_START && r <= 99) return { r };
  return null;
}
