// Tier-Ski – Spiellogik ohne Darstellung: Strecke, Fahrphysik, Kollision, Punkte, Spielstand.
// Koordinaten: d = gefahrene Strecke in Metern (bergab), x = seitlich (links negativ), y = Höhe über dem Schnee.
// game.js zeichnet nur, was hier steht; tests/tier-ski-sim.test.mjs prüft die Regeln ohne Browser.

export const PISTE = 5;                       // halbe Breite der Piste (Rand bei ±5 m)
export const RAND = PISTE - 0.45;             // weiter kommt die Figur nicht (Pistenstangen)
export const SPUREN = [-4, -2, 0, 2, 4];      // Raster für Hindernisse
export const TIERE = ['hase', 'fuchs', 'pinguin', 'baer'];
export const NAMEN = { hase: 'Hase Hoppel', fuchs: 'Fuchs Flitz', pinguin: 'Pinguin Pepe', baer: 'Bär Brumm' };
export const PREISE = { hase: 0, fuchs: 50, pinguin: 120, baer: 220 };

export const V0 = 8.5, VMAX = 21, VOLL_BEI = 2000;   // m/s; volle Geschwindigkeit nach 2000 m
export const SEITE = 7.5;                     // höchste seitliche Geschwindigkeit (m/s)
export const G = 20, ABSPRUNG = 8;            // Schwerkraft und Absprung-Tempo an der Schanze
export const SPIELER_R = 0.35;
export const HIND = { tanne: { r: 0.8, h: 3.2 }, fels: { r: 0.95, h: 1.25 }, schneemann: { r: 0.7, h: 2.1 } };
export const SCHANZE = { b: 1.4, l: 3, h: 0.75 }; // halbe Breite, Länge, Kantenhöhe
export const AST = { b: 1.9, oben: 1.9 };       // halbe Spannweite; darüber (im Sprung) frei
export const TRICK_DAUER = 0.6;
export const PUNKTE = { muenze: 5, flocke: 50, trick: 100 };
const TIEFE = { tanne: 0.45, fels: 0.5, schneemann: 0.45, ast: 0.3, muenze: 0.6, flocke: 0.7 };
export const START_FREI = 45;                 // die ersten Meter ohne Hindernisse

export const tempo = (d) => V0 + (VMAX - V0) * Math.min(1, Math.max(0, d) / VOLL_BEI);
export const reihenAbstand = (d) => 15 - 4 * Math.min(1, d / VOLL_BEI);    // 15 m → 11 m
// Flugzeit ab Schanzenkante: h + v·t − g/2·t² = 0
export const flugzeit = () => (ABSPRUNG + Math.sqrt(ABSPRUNG * ABSPRUNG + 2 * G * SCHANZE.h)) / G;

export function zufall(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------- Strecke ----------
// Jede Reihe lässt zwei benachbarte Spuren frei: die bisherige Pfad-Spur und die neue.
// Der Pfad wandert höchstens eine Spur pro Reihe – so gibt es immer einen fahrbaren Weg.
export function neueStrecke(seed = 1) {
  return { r: zufall(seed), pfad: 2, next: START_FREI, items: [], id: 0, seitSchanze: 2, reihen: [] };
}

function add(s, it) { it.id = ++s.id; s.items.push(it); return it; }

function reihe(s) {
  const r = s.r, d = s.next, diff = Math.min(1, d / VOLL_BEI);
  const alt = s.pfad;
  if (r() < 0.55) s.pfad = Math.max(0, Math.min(4, alt + (r() < 0.5 ? -1 : 1)));
  const frei = new Set([alt, s.pfad]);
  const wurf = r();
  s.seitSchanze++;
  if (s.seitSchanze >= 4 && wurf < 0.16) {
    // Schanze auf dem Pfad, Münzbogen in der Luft, danach freie Landezone über die ganze Breite
    const x = SPUREN[s.pfad], v = tempo(d), kante = d + SCHANZE.l / 2, ft = flugzeit();
    add(s, { typ: 'schanze', x, d });
    for (let t = 0.15; t < ft - 0.1; t += 0.16) {
      add(s, { typ: 'muenze', x, d: kante + v * t, y: SCHANZE.h + ABSPRUNG * t - G / 2 * t * t + 0.55 });
    }
    s.reihen.push({ d, typ: 'schanze', frei: [...frei], pfad: s.pfad });
    s.seitSchanze = 0;
    s.next = kante + v * ft + 9;
    return;
  }
  if (diff > 0.04 && wurf < 0.3) {
    add(s, { typ: 'ast', x: SPUREN[s.pfad], d });
    s.reihen.push({ d, typ: 'ast', frei: SPUREN.map((_, i) => i), pfad: s.pfad });
  } else {
    const k = 1 + (r() < 0.35 + 0.45 * diff ? 1 : 0) + (r() < 0.1 + 0.3 * diff ? 1 : 0);
    const kandidaten = [0, 1, 2, 3, 4].filter((i) => !frei.has(i));
    for (let n = 0; n < k && kandidaten.length; n++) {
      const i = kandidaten.splice(Math.floor(r() * kandidaten.length), 1)[0];
      const w = r(), typ = w < 0.45 ? 'tanne' : w < 0.75 ? 'fels' : 'schneemann';
      add(s, { typ, x: SPUREN[i] + (r() - 0.5) * 0.4, d: d + (r() - 0.5) * 1.2 });
    }
    s.reihen.push({ d, typ: 'reihe', frei: [...frei], pfad: s.pfad });
  }
  const abst = reihenAbstand(d);
  // Münzen zeigen den Weg zur nächsten Reihe
  if (r() < 0.6) {
    const x = SPUREN[s.pfad], n = 3 + Math.floor(r() * 3);
    for (let j = 0; j < n; j++) add(s, { typ: 'muenze', x, d: d + 3 + j * ((abst - 5) / Math.max(1, n - 1)), y: 0.9 });
  } else if (r() < 0.2) {
    add(s, { typ: 'flocke', x: SPUREN[s.pfad], d: d + abst / 2, y: 1.1 });
  }
  s.next = d + abst;
}

export function fuelle(s, bis) { while (s.next < bis) reihe(s); }

// ---------- Fahrt ----------
export function neueFahrt(seed = Date.now() % 1e9) {
  const f = { d: 0, x: 0, vx: 0, y: 0, vy: 0, luft: false, duck: false, lenk: 0,
    trick: null, tricks: 0, muenzen: 0, flocken: 0, bonus: 0, tot: false, zeit: 0, schanze: null, strecke: neueStrecke(seed) };
  fuelle(f.strecke, 140);
  return f;
}

export const punkte = (f) => Math.floor(f.d) + f.muenzen * PUNKTE.muenze + f.bonus;

// input: { links, rechts, duck, trick } (trick = einmaliger Tipp). Gibt Ereignisse zurück.
export function schritt(f, dt, input = {}) {
  const ev = [];
  if (f.tot) return ev;
  dt = Math.min(dt, 0.05);
  f.zeit += dt;
  const v = tempo(f.d);
  const dir = (input.rechts ? 1 : 0) - (input.links ? 1 : 0);
  f.vx += (dir * SEITE - f.vx) * Math.min(1, dt * 9);
  f.x += f.vx * dt;
  if (f.x > RAND) { f.x = RAND; f.vx = Math.min(0, f.vx); }
  if (f.x < -RAND) { f.x = -RAND; f.vx = Math.max(0, f.vx); }
  f.lenk = f.vx / SEITE;
  const d0 = f.d;
  f.d += v * dt;

  // Schanze hinauf, an der Kante abheben
  if (!f.luft) {
    const sch = f.schanze || f.strecke.items.find((it) => it.typ === 'schanze' && Math.abs(f.x - it.x) < SCHANZE.b && f.d >= it.d - SCHANZE.l / 2 && d0 <= it.d + SCHANZE.l / 2);
    if (sch && f.d < sch.d + SCHANZE.l / 2) { f.schanze = sch; f.y = SCHANZE.h * Math.max(0, (f.d - (sch.d - SCHANZE.l / 2)) / SCHANZE.l); }
    else if (sch) { f.schanze = null; f.luft = true; f.y = SCHANZE.h; f.vy = ABSPRUNG; f.duck = false; ev.push('sprung'); }
    else f.y = 0;
  } else {
    f.vy -= G * dt; f.y += f.vy * dt;
    if (f.trick) f.trick.t += dt;
    if (f.y <= 0) {
      f.y = 0; f.vy = 0; f.luft = false; ev.push('landung');
      if (f.trick) { f.tricks++; f.bonus += PUNKTE.trick; ev.push('trick'); f.trick = null; }
    }
  }
  if (input.trick && f.luft && !f.trick) { f.trick = { t: 0 }; ev.push('trickStart'); }
  f.duck = !f.luft && !f.schanze && !!input.duck;

  // Berührungen zwischen alter und neuer Position (kein Durchtunneln bei hohem Tempo)
  for (const it of f.strecke.items) {
    if (it.weg) continue;
    const t = TIEFE[it.typ];
    if (!t || it.d + t < d0 || it.d - t > f.d) continue;
    const dx = Math.abs(f.x - it.x);
    if (HIND[it.typ]) {
      if (dx < HIND[it.typ].r + SPIELER_R && f.y < HIND[it.typ].h) { sturz(f, it, ev); break; }
    } else if (it.typ === 'ast') {
      if (dx < AST.b && !f.duck && f.y < AST.oben) { sturz(f, it, ev); break; }
    } else if (it.typ === 'muenze' || it.typ === 'flocke') {
      if (dx < 0.8 && Math.abs(f.y + 0.8 - it.y) < 1.1) {
        it.weg = true;
        if (it.typ === 'muenze') { f.muenzen++; ev.push('muenze'); } else { f.flocken++; f.bonus += PUNKTE.flocke; ev.push('flocke'); }
      }
    }
  }
  const items = f.strecke.items;
  if (items.length && items[0].d < f.d - 12) f.strecke.items = items.filter((it) => it.d >= f.d - 12);
  const rh = f.strecke.reihen;
  if (rh.length > 30) rh.splice(0, rh.length - 30);
  fuelle(f.strecke, f.d + 140);
  return ev;
}

function sturz(f, it, ev) { f.tot = true; f.vx = 0; f.trick = null; f.getroffen = it.typ; ev.push('sturz'); }

// ---------- Spielstand ----------
export const SCHLUESSEL = 'tierski.v1';
export function leerStand() { return { v: 1, muenzen: 0, rekord: 0, meter: 0, tiere: ['hase'], tier: 'hase', ton: true }; }
export function pruefeStand(s) {
  const l = leerStand();
  if (!s || typeof s !== 'object') return l;
  const zahl = (n) => (Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0);
  const tiere = Array.isArray(s.tiere) ? TIERE.filter((t) => t === 'hase' || s.tiere.includes(t)) : l.tiere;
  return { v: 1, muenzen: zahl(s.muenzen), rekord: zahl(s.rekord), meter: zahl(s.meter), tiere, tier: tiere.includes(s.tier) ? s.tier : 'hase', ton: s.ton !== false };
}
export function freischalten(stand, tier) {
  if (!TIERE.includes(tier) || stand.tiere.includes(tier) || stand.muenzen < PREISE[tier]) return false;
  stand.muenzen -= PREISE[tier]; stand.tiere.push(tier); stand.tier = tier; return true;
}
// Fahrt verbuchen: Münzen gutschreiben, Rekord prüfen. Gibt true zurück bei neuem Rekord.
export function verbuche(stand, f) {
  const p = punkte(f);
  stand.muenzen += f.muenzen;
  stand.meter = Math.max(stand.meter, Math.floor(f.d));
  if (p > stand.rekord) { stand.rekord = p; return true; }
  return false;
}
