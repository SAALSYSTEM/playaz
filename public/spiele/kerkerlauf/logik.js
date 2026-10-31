// Kerkerlauf – Regeln ohne Darstellung (testbar in node): Strecke, Laufen, Springen, Spurwechsel, Angriff,
// Kollision, Münzen, Kombo, Tempo, Spielstand. Darstellung und Eingabe stehen in game.js.

export const SPUREN = [-3, 0, 3];           // x der drei Spuren (Meter)
export const SCHLUESSEL = 'kerkerlauf.v1';
export const HELDEN = ['ritter', 'barbar', 'schurke', 'waldlaeufer', 'magier'];
export const PREISE = { ritter: 0, barbar: 100, schurke: 250, waldlaeufer: 500, magier: 800 };
export const NAMEN = { ritter: 'Ritter Rudi', barbar: 'Barbarin Bruni', schurke: 'Schurke Schatten', waldlaeufer: 'Waldläuferin Wilma', magier: 'Magier Merlin' };
export const PUNKTE = { muenze: 10, kill: 50, truhe: 100 };
export const SPRUNG = { v: 9.5, g: 27 };    // Sprunghöhe ≈ 1,7 m, Flugzeit ≈ 0,7 s
export const ANGRIFF = { reichweite: 6.5, dauer: 0.42 };
const START_FREI = 45;

export function tempo(d) { return Math.min(22, 9 + d / 190); }          // 9 m/s → 22 m/s nach ~2,5 km
export function kombo(serie) { return Math.min(5, 1 + Math.floor(serie / 3)); } // ×1 … ×5

export function zufall(seed) {
  let a = seed >>> 0 || 1;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------- Strecke: Reihen mit drei Spuren, ein Pfad bleibt immer machbar ----------
export function neueStrecke(seed) {
  return { r: zufall(seed), items: [], next: START_FREI, pfad: 1, id: 0, reihe: 0 };
}
const HINDERNIS = ['kiste', 'fass', 'stapel'];
function plus(s, it) { s.items.push({ id: s.id++, ...it }); }

// Reihen bis „bis“ Meter voraus erzeugen
export function erzeuge(s, bis) {
  while (s.next < bis) {
    const d = s.next, v = tempo(d), r = s.r;
    const alt = s.pfad;
    if (r() < 0.6) s.pfad = Math.max(0, Math.min(2, s.pfad + (r() < 0.5 ? -1 : 1)));
    const frei = new Set([alt, s.pfad]);       // beide Spuren bleiben frei → Wechsel ist immer möglich
    const schwer = Math.min(1, d / 1500);
    // Pfad-Spur: leer, Münzen, Stacheln (springen) oder Skelett (angreifen)
    const p = r();
    let aufPfad = 'muenzen';
    if (p < 0.18 + 0.12 * schwer) aufPfad = 'skelett';
    else if (p < 0.33 + 0.12 * schwer) aufPfad = 'stachel';
    else if (s.reihe % 9 === 8) aufPfad = 'truhe';
    for (const l of frei) {
      if (l !== s.pfad) continue;
      if (aufPfad === 'skelett') plus(s, { typ: 'skelett', art: r() < 0.35 + 0.3 * schwer ? 'krieger' : 'diener', spur: l, d });
      else if (aufPfad === 'stachel') { plus(s, { typ: 'stachel', spur: l, d }); for (let k = -1; k <= 1; k++) plus(s, { typ: 'muenze', spur: l, d: d + k * 1.6, y: 1.9 - Math.abs(k) * 0.5 }); }
      else if (aufPfad === 'truhe') plus(s, { typ: 'truhe', spur: l, d });
    }
    // Münzspur zwischen den Reihen auf dem Pfad
    if (aufPfad !== 'truhe') for (let k = 1; k <= 4; k++) plus(s, { typ: 'muenze', spur: s.pfad, d: d + 3 + k * 2.2, y: 0.9 });
    // Übrige Spuren: Hindernisse, Stacheln oder Skelette
    for (let l = 0; l < 3; l++) {
      if (frei.has(l)) continue;
      const q = r();
      if (q < 0.55) plus(s, { typ: HINDERNIS[Math.floor(r() * 3)], spur: l, d });
      else if (q < 0.72) plus(s, { typ: 'stachel', spur: l, d });
      else if (q < 0.92) plus(s, { typ: 'skelett', art: r() < 0.5 ? 'krieger' : 'diener', spur: l, d });
    }
    s.reihe++;
    // Abstand: genug Zeit zum Reagieren (≈ 1,25 s), später etwas knapper
    s.next = d + Math.max(13, v * (1.35 - 0.25 * schwer));
  }
  // Alte Objekte weg
  if (s.items.length > 260) s.items = s.items.filter((it) => it.d > s.items[s.items.length - 1].d - 400);
}

// ---------- Lauf ----------
export function neuerLauf(seed) {
  return {
    seed, d: 0, spur: 1, x: 0, y: 0, vy: 0, luft: false, tot: false, getroffen: null, t: 0,
    angriff: 0, angriffe: 0, muenzen: 0, truhen: 0, kills: 0, serie: 0, besteSerie: 0, bonus: 0,
    strecke: neueStrecke(seed),
  };
}
export function punkte(f) { return Math.floor(f.d) + f.muenzen * PUNKTE.muenze + f.bonus; }

const BREITE = { kiste: 0.75, fass: 0.9, stapel: 1.05, stachel: 1.1, skelett: 0.55, truhe: 0.8, muenze: 0.5 };
const TIEFE = { kiste: 0.75, fass: 0.9, stapel: 1.1, stachel: 1.1, skelett: 0.4, truhe: 0.6, muenze: 0.4 };

// Ein Zeitschritt. Eingabe: { links, rechts, sprung, angriff } – jeweils einmalige Auslöser (Wischen/Taste).
// Rückgabe: Ereignisse für Ton und Effekte.
export function schritt(f, dt, ein = {}) {
  const ev = [];
  if (f.tot) return ev;
  f.t += dt;
  const v = tempo(f.d), d0 = f.d;
  f.d += v * dt;
  erzeuge(f.strecke, f.d + 150);
  // Spur wechseln (sofortiges Ziel, weiche Bewegung)
  if (ein.links && f.spur > 0) { f.spur--; ev.push('wechsel'); }
  if (ein.rechts && f.spur < 2) { f.spur++; ev.push('wechsel'); }
  const zx = SPUREN[f.spur];
  f.x += Math.sign(zx - f.x) * Math.min(Math.abs(zx - f.x), 16 * dt);
  // Springen
  if (ein.sprung && !f.luft) { f.luft = true; f.vy = SPRUNG.v; ev.push('sprung'); }
  if (f.luft) {
    f.vy -= SPRUNG.g * dt; f.y += f.vy * dt;
    if (f.y <= 0) { f.y = 0; f.vy = 0; f.luft = false; ev.push('landung'); }
  }
  // Angriff: trifft das nächste Skelett in der eigenen Spur innerhalb der Reichweite
  f.angriff = Math.max(0, f.angriff - dt);
  if (ein.angriff && f.angriff <= 0) {
    f.angriff = ANGRIFF.dauer; f.angriffe++; ev.push('angriff');
    let ziel = null;
    for (const it of f.strecke.items) {
      if (it.typ !== 'skelett' || it.weg || it.besiegt) continue;
      if (Math.abs(SPUREN[it.spur] - f.x) > 1.4) continue;
      const vor = it.d - f.d;
      if (vor > -0.2 && vor < ANGRIFF.reichweite && (!ziel || it.d < ziel.d)) ziel = it;
    }
    if (ziel) {
      ziel.besiegt = f.t; f.kills++; f.serie++; f.besteSerie = Math.max(f.besteSerie, f.serie);
      const m = kombo(f.serie - 1);
      f.bonus += PUNKTE.kill * m; ev.push({ typ: 'kill', id: ziel.id, mal: m, punkte: PUNKTE.kill * m });
    }
  }
  // Kollisionen
  for (const it of f.strecke.items) {
    if (it.weg || it.besiegt) continue;
    const vor = it.d - f.d;
    if (vor > TIEFE[it.typ] + 0.4 || vor < -TIEFE[it.typ] - 0.4) {
      // Skelett ungeschlagen passiert → Serie reißt
      if (it.typ === 'skelett' && !it.vorbei && vor < -1) { it.vorbei = true; if (f.serie) { f.serie = 0; ev.push('serieWeg'); } }
      continue;
    }
    // Nur vorne und mittig zählt – wer schon vorbei ist und seitlich wechselt, streift nichts mehr
    const nah = Math.abs(SPUREN[it.spur] - f.x) < BREITE[it.typ] + 0.45 && vor < TIEFE[it.typ] && vor > -0.35;
    if (!nah) continue;
    if (it.typ === 'muenze') {
      if (Math.abs((it.y ?? 0.9) - (f.y + 0.9)) < 1.1) { it.weg = true; f.muenzen++; ev.push('muenze'); }
    } else if (it.typ === 'truhe') {
      it.weg = true; f.truhen++; f.muenzen += 10; f.bonus += PUNKTE.truhe; ev.push('truhe');
    } else if (it.typ === 'stachel') {
      if (f.y < 0.55) { f.tot = true; f.getroffen = 'stachel'; ev.push('sturz'); break; }
    } else {
      f.tot = true; f.getroffen = it.typ === 'skelett' ? it.art : it.typ; ev.push('sturz'); break;
    }
  }
  if (f.tot) f.d = Math.max(d0, f.d - 0.3);
  return ev;
}

// ---------- Spielstand ----------
export function leerStand() { return { v: 1, gold: 0, rekord: 0, meter: 0, kills: 0, helden: ['ritter'], held: 'ritter', ton: true }; }
export function pruefeStand(s) {
  const l = leerStand();
  if (!s || typeof s !== 'object') return l;
  const zahl = (x) => (Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0);
  const helden = Array.isArray(s.helden) ? s.helden.filter((h) => HELDEN.includes(h)) : [];
  if (!helden.includes('ritter')) helden.unshift('ritter');
  return { v: 1, gold: zahl(s.gold), rekord: zahl(s.rekord), meter: zahl(s.meter), kills: zahl(s.kills), helden: [...new Set(helden)], held: helden.includes(s.held) ? s.held : 'ritter', ton: s.ton !== false };
}
// Lauf ins Spielstand übernehmen; gibt true zurück bei neuem Rekord
export function verbuche(st, f) {
  const p = punkte(f);
  st.gold += f.muenzen; st.kills += f.kills; st.meter = Math.max(st.meter, Math.floor(f.d));
  if (p > st.rekord) { st.rekord = p; return true; }
  return false;
}
export function freischalten(st, held) {
  if (!HELDEN.includes(held) || st.helden.includes(held) || st.gold < PREISE[held]) return false;
  st.gold -= PREISE[held]; st.helden.push(held); st.held = held; return true;
}
