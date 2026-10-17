// JUNGLE RUNNER: Speicherstand. Reine Funktionen ohne Browserzugriff (in Node testbar).
// Schema-Version: Änderungen am Aufbau erhöhen SAVE_VERSION und bekommen einen Schritt in MIGRATIONEN.
export const SAVE_KEY = 'jungle.v1';
export const SAVE_VERSION = 1;

export function leerStand() {
  return {
    v: SAVE_VERSION,
    char: { kind: null, outfit: 'entdecker', owned: ['entdecker'] },
    levels: {},
    awards: {},
    coins: 0,
    stats: { coinsTotal: 0, rhino: 0, logs: 0, slides: 0, runs: 0, shared: 0, challengesWon: 0 },
    endless: { best: 0, tag: { datum: '', best: 0 } },
    settings: { sound: true, music: true, name: '' },
    last: 1
  };
}

// Migrationsschritte: Schlüssel n wandelt Version n in Version n+1 um.
// v0 = interne Entwicklungsstände vor der Veröffentlichung: levels[id] war nur die Sternezahl, Münzen lagen in "muenzen", Figur in "figur".
export const MIGRATIONEN = {
  0: (r) => {
    const o = { ...r, v: 1, levels: {}, coins: r.coins ?? r.muenzen ?? 0 };
    if (r.levels && typeof r.levels === 'object') for (const k of Object.keys(r.levels)) {
      const l = r.levels[k];
      o.levels[k] = typeof l === 'number' ? { done: l > 0, stars: l } : l;
    }
    if (r.figur === 'boy' || r.figur === 'girl') o.char = { kind: r.figur, outfit: 'entdecker', owned: ['entdecker'] };
    return o;
  }
};

export function migriere(roh) {
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) return null;
  let v = Number.isInteger(roh.v) && roh.v >= 0 ? roh.v : 0;
  if (v > SAVE_VERSION) return roh;                     // neuerer Stand (anderes Gerät/Tab): nur bekannte Felder lesen, nichts umschreiben
  let r = roh;
  while (v < SAVE_VERSION) {
    const f = MIGRATIONEN[v];
    if (!f) return null;
    r = f(r); v = r.v = v + 1;
  }
  return r;
}

const zahl = (v, max = 1e9) => (Number.isFinite(v) && v >= 0 ? Math.min(Math.round(v), max) : 0);

// Liest einen (möglicherweise alten, kaputten oder manipulierten) Rohstand und liefert immer einen gültigen Stand.
// ids: { levels: [..], outfits: [..], awards: [..] }
export function ladeAusRoh(roh, ids) {
  const s = leerStand();
  let r = null;
  try { r = migriere(roh); } catch (e) { r = null; }
  if (!r) return s;
  const L = new Set(ids.levels), O = new Set(ids.outfits), A = new Set(ids.awards);
  if (r.levels && typeof r.levels === 'object') for (const k of Object.keys(r.levels)) {
    const id = +k, l = r.levels[k];
    if (!L.has(id) || !l || typeof l !== 'object') continue;
    s.levels[id] = { done: !!l.done, stars: Math.min(3, zahl(l.stars)), bestCoins: zahl(l.bestCoins, 9999), bestHearts: Math.min(3, zahl(l.bestHearts)), bestSek: zahl(l.bestSek, 99999),
      bestPunkte: zahl(l.bestPunkte, 99999), fails: zahl(l.fails, 99999), tries: zahl(l.tries, 99999), wins: zahl(l.wins, 99999) };
    if (!s.levels[id].done) s.levels[id].stars = 0;
  }
  if (r.awards && typeof r.awards === 'object') for (const k of Object.keys(r.awards)) {
    const a = r.awards[k];
    if (A.has(k) && a && typeof a.at === 'string' && !Number.isNaN(Date.parse(a.at))) s.awards[k] = { at: a.at, level: (a.level | 0) || null };
  }
  s.coins = zahl(r.coins, 1e8);
  if (r.char && typeof r.char === 'object') {
    const own = Array.isArray(r.char.owned) ? r.char.owned.filter((id) => O.has(id)) : [];
    if (!own.includes('entdecker')) own.unshift('entdecker');
    s.char.owned = [...new Set(own)];
    s.char.outfit = O.has(r.char.outfit) && s.char.owned.includes(r.char.outfit) ? r.char.outfit : 'entdecker';
    s.char.kind = r.char.kind === 'boy' || r.char.kind === 'girl' ? r.char.kind : null;
  }
  const st = r.stats || {};
  for (const k of Object.keys(s.stats)) s.stats[k] = zahl(st[k]);
  if (r.endless && typeof r.endless === 'object') {
    s.endless.best = zahl(r.endless.best, 999999);
    const t = r.endless.tag;
    if (t && typeof t === 'object' && /^\d{4}-\d{2}-\d{2}$/.test(t.datum || '')) s.endless.tag = { datum: t.datum, best: zahl(t.best, 999999) };
  }
  const se = r.settings || {};
  if (typeof se.sound === 'boolean') s.settings.sound = se.sound;
  if (typeof se.music === 'boolean') s.settings.music = se.music;
  if (typeof se.name === 'string') s.settings.name = saubererName(se.name);
  if (L.has(r.last)) s.last = r.last;
  return s;
}

export function saubererName(n) {
  n = String(n || '').replace(/[^A-Za-z0-9ÄÖÜäöüß_. -]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  return n.length >= 3 ? n : '';
}

// Zufallszahl für die Tagesstrecke: gleiche Zahl für alle am selben Kalendertag (lokales Datum)
export function tagesSeed(datum) {
  let h = 2166136261;
  for (let i = 0; i < datum.length; i++) h = Math.imul(h ^ datum.charCodeAt(i), 16777619) >>> 0;
  return (h % 900000) + 1;
}
export function heute(d = new Date()) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
