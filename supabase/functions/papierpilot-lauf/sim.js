// PAPIERPILOT: Flugregeln. Nur ganze Zahlen (+ − × und abgeschnittene Division, alle Werte < 2^53),
// fester 60-Hz-Takt. Dadurch rechnet später die Prüf-Funktion auf dem Server jeden Flug bitgleich nach.
// Einheiten: u = 0,1 mm, Geschwindigkeiten in u je Takt.
import { TYPEN, baueStrecke, tagesStrecke } from './strecke.js';

export const SIM_VERSION = 1;
export const TAKT_HZ = 60;
export const M = 10000;                  // 1 Meter in u

export const START_Y = 18 * M;           // Abwurf vom Dach
export const VC = 1400;                  // Reisetempo 8,4 m/s
export const V_WURF = 600;               // + bis 3,6 m/s beim perfekten Wurf
export const VY_WURF = 220;              // + bis 1,3 m/s Steigen beim perfekten Wurf
export const SINKEN = 130;               // 0,78 m/s Sinken im Geradeausflug
export const SINKEN_KURVE = 70;          // zusätzlich bei voller Schräglage
export const AUFTRIEB = 420;             // Aufwind-Mitte: 3,4 m/s nach oben
export const AUF_R = 25000;              // Aufwind: halbe Breite 2,5 m
export const AUF_RAMPE = 20000;          // weicher Ein- und Ausstieg (2 m)
export const DECKE_AB = 30 * M, DECKE_BIS = 38 * M;   // Aufwind lässt oben nach
export const QUER = 60;                  // seitliche Beschleunigung bei voller Schräglage
export const NEIGEN = 70;                // Schräglage-Änderung je Takt (von 1000)
export const XMAX = 11 * M;              // Korridor
export const FR = 3500;                  // Trefferradius des Fliegers 0,35 m
export const RING_R = 18000;             // Ring: Radius 1,8 m
export const RING_V = 350, RING_VY = 150;
export const WURF_PERIODE = 80;          // Kraftanzeige: 0→1000→0 in 80 Takten
export const MAX_TICKS = TAKT_HZ * 240;

// Eingabe je Takt: Bit 1 = links, Bit 2 = rechts, Bit 4 = Tippen (Wurf)
export const LINKS = 1, RECHTS = 2, TIPP = 4;

const div = (a, b) => Math.trunc(a / b);
const mm = (m) => Math.round(m * M);

export function kraftBei(t) { const p = t % WURF_PERIODE, h = WURF_PERIODE / 2; return (p < h ? p : WURF_PERIODE - p) * (1000 / h); }

export function vorbereiteteStrecke(namen) {
  const s = baueStrecke(namen);
  return {
    laenge: mm(s.laenge),
    o: s.o.map((o) => { const T = TYPEN[o.t]; return { t: o.t, x: mm(o.x), z: mm(o.z), rund: T.form === 'rund', r: mm(T.r || 0), hx: mm(T.hx || 0), hz: mm(T.hz || 0), h: mm(T.h) }; }),
    a: s.a.map((a) => ({ x: mm(a.x), z0: mm(a.z), z1: mm(a.z + a.l) })),
    r: s.r.map((r) => ({ x: mm(r.x), y: mm(r.y), z: mm(r.z) }))
  };
}

// Zustand: phase 'wurf' | 'flug' | 'ende'. grund: 'boden' | 'hindernis' | 'zeit'.
export function neuerFlug(strecke, von) {
  const S = strecke;
  const s = von ? { ...von.s } : { phase: 'wurf', t: 0, ft: 0, kraft: 0, x: 0, y: START_Y, z: 0, vx: 0, vy: 0, v: VC, neig: 0, lift: 0,
    ringe: 0, ringNeu: -1, grund: '', treffer: -1 };
  const genommen = von ? von.genommen.slice() : new Uint8Array(S.r.length);
  let oi = von ? von.idx().oi : 0, ri = von ? von.idx().ri : 0;

  function aufwind() {
    let best = 0;
    for (const a of S.a) {
      if (s.z < a.z0 || s.z > a.z1) continue;
      const dx = s.x - a.x; if (dx <= -AUF_R || dx >= AUF_R) continue;
      let l = div(AUFTRIEB * (AUF_R * AUF_R - dx * dx), AUF_R * AUF_R);
      const rand = Math.min(s.z - a.z0, a.z1 - s.z);
      if (rand < AUF_RAMPE) l = div(l * rand, AUF_RAMPE);
      if (l > best) best = l;
    }
    if (s.y > DECKE_AB) best = s.y >= DECKE_BIS ? 0 : div(best * (DECKE_BIS - s.y), DECKE_BIS - DECKE_AB);
    return best;
  }

  function kollision() {
    while (oi < S.o.length && S.o[oi].z < s.z - 6 * M) oi++;
    for (let i = oi; i < S.o.length && S.o[i].z < s.z + 6 * M; i++) {
      const o = S.o[i]; if (s.y - FR >= o.h) continue;
      const dx = s.x - o.x, dz = s.z - o.z;
      if (o.rund ? dx * dx + dz * dz < (o.r + FR) * (o.r + FR) : (Math.abs(dx) < o.hx + FR && Math.abs(dz) < o.hz + FR)) return i;
    }
    return -1;
  }

  function schritt(eingabe) {
    if (s.phase === 'ende') return false;
    s.t++;
    if (s.t > MAX_TICKS) { s.phase = 'ende'; s.grund = 'zeit'; return false; }
    if (s.phase === 'wurf') {
      if (eingabe & TIPP) {
        s.kraft = kraftBei(s.t);
        s.v = VC + div(V_WURF * s.kraft, 1000);
        s.vy = div(VY_WURF * s.kraft, 1000);
        s.phase = 'flug';
      }
      return true;
    }
    s.ft++;
    // Steuern: Schräglage folgt der Eingabe weich, die Schräglage schiebt seitlich
    const ziel = ((eingabe & RECHTS) ? 1000 : 0) - ((eingabe & LINKS) ? 1000 : 0);
    s.neig += Math.max(-NEIGEN, Math.min(NEIGEN, ziel - s.neig));
    s.vx += div(QUER * s.neig, 1000) - div(s.vx, 16);
    s.x += s.vx;
    if (s.x > XMAX) { s.x = XMAX; if (s.vx > 0) s.vx = 0; }
    if (s.x < -XMAX) { s.x = -XMAX; if (s.vx < 0) s.vx = 0; }
    // Vorwärts: nach Wurf oder Ring langsam zurück zum Reisetempo
    s.v += div(VC - s.v, 90);
    s.z += s.v;
    // Höhe: Sinken (Kurven kosten mehr), Aufwind hebt
    s.lift = aufwind();
    const zielVy = s.lift - SINKEN - div(SINKEN_KURVE * Math.abs(s.neig), 1000);
    s.vy += div(zielVy - s.vy, 12);
    s.y += s.vy;
    // Ringe
    s.ringNeu = -1;
    while (ri < S.r.length && S.r[ri].z <= s.z) {
      const r = S.r[ri], dx = s.x - r.x, dy = s.y - r.y;
      if (!genommen[ri] && dx * dx + dy * dy < RING_R * RING_R) { genommen[ri] = 1; s.ringe++; s.ringNeu = ri; s.v += RING_V; s.vy += RING_VY; }
      ri++;
    }
    // Ende
    if (s.y <= 0) { s.y = 0; s.phase = 'ende'; s.grund = 'boden'; return false; }
    const k = kollision();
    if (k >= 0) { s.phase = 'ende'; s.grund = 'hindernis'; s.treffer = k; return false; }
    return true;
  }

  const flug = { s, schritt, genommen, idx: () => ({ oi, ri }), distanzCm: () => div(s.z, 100) };
  flug.klon = () => neuerFlug(S, flug);   // für Bots und Vorausschau
  return flug;
}

// Eingabefolge kompakt: Lauflängen "wert:anzahl" (für Speicher, Geist und spätere Server-Prüfung)
export function kodiere(eingaben) {
  const t = []; let i = 0;
  while (i < eingaben.length) { let j = i; while (j < eingaben.length && eingaben[j] === eingaben[i]) j++; t.push(eingaben[i].toString(36) + (j - i > 1 ? ':' + (j - i).toString(36) : '')); i = j; }
  return t.join(',');
}
export function dekodiere(text) {
  const e = []; if (!text) return e;
  for (const teil of text.split(',')) { const [w, n] = teil.split(':'); const v = parseInt(w, 36), k = n ? parseInt(n, 36) : 1; if (!(v >= 0 && v < 8 && k > 0 && k <= MAX_TICKS)) return null; for (let i = 0; i < k; i++) e.push(v); if (e.length > MAX_TICKS + 1) return null; }
  return e;
}

// Seed (Datum JJJJMMTT) -> vorbereitete Tagesstrecke
export function tagesKurs(seed) { return vorbereiteteStrecke(tagesStrecke(seed)); }

// Nachfliegen: Eingaben (je Takt) auf der Tagesstrecke. Der Flug muss genau mit der letzten Eingabe enden.
export function nachfliegen(seed, eingaben) {
  const f = neuerFlug(tagesKurs(seed));
  for (let i = 0; i < eingaben.length; i++) { if (f.s.phase === 'ende') return { ok: false, grund: 'zu_viele_eingaben' }; f.schritt(eingaben[i]); }
  if (f.s.phase !== 'ende') return { ok: false, grund: 'kein_ende' };
  return { ok: true, cm: f.distanzCm(), ft: f.s.ft, ticks: f.s.t, grund: f.s.grund, ringe: f.s.ringe };
}

// Serverseitige Prüfung einer gemeldeten Leistung: { v, seed, inputs, ticks, cm, ft }
export function pruefeFlug(lauf) {
  try {
    if (!lauf || lauf.v !== SIM_VERSION) return { ok: false, grund: 'version' };
    if (!Number.isInteger(lauf.seed) || lauf.seed < 20200101 || lauf.seed > 20991231) return { ok: false, grund: 'seed' };
    const e = dekodiere(lauf.inputs);
    if (!e || !e.length) return { ok: false, grund: 'eingaben' };
    const r = nachfliegen(lauf.seed, e);
    if (!r.ok) return r;
    if (r.ticks !== lauf.ticks || r.cm !== lauf.cm || r.ft !== lauf.ft) return { ok: false, grund: 'ergebnis_weicht_ab', cm: r.cm, ft: r.ft };
    if (r.cm < 100) return { ok: false, grund: 'zu_kurz' };
    return { ok: true, cm: r.cm, ft: r.ft, ticks: r.ticks };
  } catch (err) { return { ok: false, grund: 'fehler' }; }
}
