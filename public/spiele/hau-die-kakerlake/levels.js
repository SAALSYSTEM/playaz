// HAU DIE KAKERLAKE! – Kakerlaken im Parlament: Leveldaten, Gegnerarten und reproduzierbare Spawnpläne.
// Reine Daten und Mathematik, kein DOM. Jeder Plan ist über einen festen Zufallsstart (Level-Nummer)
// vollständig vorherbestimmt, damit schwierige Stellen nachvollziehbar bleiben und Tests exakt rechnen können.
// Alles Erfundene: keine echten Personen, Parteien, Logos oder Porträts.

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------------------------
// Gegnerarten. speed = relative Laufgeschwindigkeit, hitR/bodyR in Layout-Einheiten (× layout.unit).
// lead = Dauer der sichtbaren Vorwarnung am Eingang in Sekunden.
// ---------------------------------------------------------------------------------------------
export const TYPES = {
  standard: { id: 'standard', name: 'Kakerlake',         hp: 1, pts: 100,  speed: 1.0,  hitR: 46, bodyR: 30, scale: 1,   lead: 0.9 },
  flitzer:  { id: 'flitzer',  name: 'Flitzer',           hp: 1, pts: 150,  speed: 1.7,  hitR: 46, bodyR: 30, scale: 1,   lead: 1.4 },
  helm:     { id: 'helm',     name: 'Helmträger',        hp: 2, pts: 200,  speed: 0.92, hitR: 48, bodyR: 31, scale: 1.05, lead: 1.0 },
  zickzack: { id: 'zickzack', name: 'Zickzack-Läufer',   hp: 1, pts: 150,  speed: 0.95, hitR: 46, bodyR: 30, scale: 1,   lead: 1.0, zig: true },
  koffer:   { id: 'koffer',   name: 'Aktenkoffer-Träger', hp: 1, pts: 100, speed: 0.9,  hitR: 48, bodyR: 31, scale: 1,   lead: 1.0 },
  nachr:    { id: 'nachr',    name: 'Nachrücker',        hp: 1, pts: 100,  speed: 1.0,  hitR: 46, bodyR: 30, scale: 1,   lead: 1.0, successor: true },
  boss:     { id: 'boss',     name: 'Boss',              hp: 5, pts: 1000, speed: 0.45, hitR: 92, bodyR: 62, scale: 2.3, lead: 2.0 }
};
export const FOLLOWUP_LEAD = 1.2;     // Vorwarnung für den Standardgegner, der einem Nachrücker folgt

export const BOSSES = {
  hinterbaenkler:  { name: 'Der Hinterbänkler',      accessory: 'tie',        speed: 0.42 },
  fraktionskrabbler: { name: 'Der Fraktionskrabbler', accessory: 'case',       speed: 0.45 },
  dauerredner:     { name: 'Der Dauerredner',        accessory: 'megaphone',  speed: 0.45 },
  ausschusskoenig: { name: 'Der Ausschusskönig',     accessory: 'crown',      speed: 0.50 },
  vorsitzender:    { name: 'Der große Vorsitzende',  accessory: 'gavel',      speed: 0.55 }
};

// ---------------------------------------------------------------------------------------------
// Kapitel und Level. total = ALLE Gegner des Levels (inklusive Nachrücker-Folgegegner und Boss).
// span = ungefähre Dauer der Spawnphase in Sekunden (erster bis letzter geplanter Spawn).
// ent = geöffnete Eingänge, rows = erlaubte Zieltiefen [min,max] (0 nah am Eingang … 5 tief im Saal),
// cap = höchstens so viele gleichzeitig aktive Gegner (wird auf kleinen Displays abgesenkt),
// sizes = Wellengrößen (zyklisch), gap = Abstand der Spawns innerhalb einer Welle in Sekunden; die Pausen
// zwischen den Wellen ergeben sich daraus, damit die Spawnphase genau span lang ist.
// ---------------------------------------------------------------------------------------------
export const CHAPTERS = [
  { id: 1, name: 'Die ersten Abgeordneten', sub: 'Ein Eingang, kurze Wege', levels: [1, 2, 3, 4, 5, 6] },
  { id: 2, name: 'Sitzungsbeginn',          sub: 'Die Seitentüren öffnen sich', levels: [7, 8, 9, 10, 11, 12] },
  { id: 3, name: 'Die große Debatte',       sub: 'Alle Gänge werden genutzt', levels: [13, 14, 15, 16, 17, 18] },
  { id: 4, name: 'Alle wollen einen Sitz',  sub: 'Nachrücker und gemischte Wellen', levels: [19, 20, 21, 22, 23, 24] },
  { id: 5, name: 'Die Sondersitzung',       sub: 'Alle Eingänge sind geöffnet', levels: [25, 26, 27, 28, 29, 30] }
];

const C1 = ['C'], C3 = ['C', 'L2', 'R2'], CG = ['C', 'L1', 'R1'], ALL = ['C', 'L1', 'R1', 'L2', 'R2'];

const DEFS = [
  // ---- Kapitel 1: Die ersten Abgeordneten (nur der Haupteingang) ----
  { id: 1, name: 'Da krabbelt was', total: 3, span: 6, ent: C1, speed: 0.55, rows: [0, 1], cap: 4, sizes: [1], gap: 0,
    tip: 'Tippe auf die Kakerlake, bevor sie einen Sitz erreicht.' },
  { id: 2, name: 'Die nächste kommt bestimmt', total: 6, span: 10, ent: C1, speed: 0.6, rows: [0, 2], cap: 4, sizes: [1, 2, 1, 2], gap: 0.9,
    tip: 'Triffst du daneben, reißt die Kombo ab, aber du verlierst nichts.' },
  { id: 3, name: 'Hinter dem Rednerpult', total: 9, span: 14, ent: C1, speed: 0.65, rows: [0, 3], cap: 4, sizes: [1, 2, 1, 2], gap: 1.0,
    tip: 'Je tiefer das Ziel im Saal, desto länger der Weg.' },
  { id: 4, name: 'Sitzungspause vorbei', total: 12, span: 18, ent: C1, speed: 0.7, rows: [0, 3], cap: 4, sizes: [2], gap: 1.0,
    tip: 'Jetzt kommen sie zu zweit.' },
  { id: 5, name: 'Eilige Angelegenheit', total: 15, span: 20, ent: C1, speed: 0.75, rows: [0, 4], cap: 4, sizes: [2, 1, 2], gap: 0.9,
    mix: { flitzer: 2 }, safe: 4, tip: 'Neu: Flitzer. Rotes Warnschild am Eingang, dann geht es schnell.' },
  { id: 6, name: 'Der Hinterbänkler', total: 18, span: 24, ent: C1, speed: 0.75, rows: [0, 4], cap: 4, sizes: [2, 3, 2, 3], gap: 0.8,
    mix: { flitzer: 2 }, boss: { id: 'hinterbaenkler', hp: 5, at: 0.5 }, tip: 'Der Boss hat eine Lebensanzeige: mehrere Treffer nötig.' },

  // ---- Kapitel 2: Sitzungsbeginn (Seitentüren) ----
  { id: 7, name: 'Die Türen öffnen sich', total: 18, span: 24, ent: C3, speed: 0.8, rows: [0, 4], cap: 5, sizes: [2, 3, 2], gap: 0.8,
    mix: { flitzer: 2 }, tip: 'Seitentüren! Achte auf die Warnschilder.' },
  { id: 8, name: 'Mit Schutzhelm', total: 20, span: 26, ent: C3, speed: 0.8, rows: [0, 4], cap: 5, sizes: [2, 3, 2], gap: 0.75,
    mix: { helm: 4, flitzer: 2 }, limits: { helm: 2 }, tip: 'Neu: Helmträger. Der erste Treffer lässt den Helm fliegen, der zweite erledigt ihn.' },
  { id: 9, name: 'Drängler am Eingang', total: 23, span: 28, ent: C3, speed: 0.85, rows: [0, 5], cap: 5, sizes: [3, 3, 4], gap: 0.7,
    mix: { flitzer: 4, helm: 3 }, limits: { helm: 2 }, tip: 'Erst die Flitzer, dann den Rest.' },
  { id: 10, name: 'Immer schön der Reihe nach', total: 25, span: 30, ent: C3, speed: 0.85, rows: [0, 5], cap: 5, sizes: [4], gap: 0.6,
    mix: { flitzer: 4, helm: 4 }, limits: { helm: 2 }, tip: 'Neu: Die große Klatsche. Nach zehn besiegten Gegnern lädt sie sich auf.' },
  { id: 11, name: 'Alle wollen einen Platz', total: 28, span: 32, ent: C3, speed: 0.9, rows: [0, 5], cap: 6, sizes: [3, 4, 5], gap: 0.6,
    mix: { flitzer: 5, helm: 5 }, limits: { helm: 2 }, tip: 'Drei Eingänge, drei Wege.' },
  { id: 12, name: 'Der Fraktionskrabbler', total: 30, span: 34, ent: C3, speed: 0.9, rows: [0, 5], cap: 6, sizes: [3, 4, 3, 4], gap: 0.6,
    mix: { flitzer: 4, helm: 4 }, limits: { helm: 2 }, boss: { id: 'fraktionskrabbler', hp: 7, at: 0.5 }, tip: 'Der Boss bringt Begleiter mit.' },

  // ---- Kapitel 3: Die große Debatte (Gänge) ----
  { id: 13, name: 'Ab in die Debatte', total: 28, span: 32, ent: CG, speed: 0.95, rows: [0, 5], cap: 6, sizes: [4, 3, 5], gap: 0.55,
    mix: { koffer: 6, flitzer: 3 }, tip: 'Neu: Aktenkoffer-Träger. Sie verlieren beim Treffer ihre Papiere.' },
  { id: 14, name: 'Anträge auf Abwegen', total: 30, span: 34, ent: CG, speed: 1.0, rows: [0, 5], cap: 6, sizes: [4, 5, 4], gap: 0.55,
    mix: { zickzack: 6, koffer: 4, flitzer: 3, helm: 2 }, limits: { helm: 2 }, tip: 'Neu: Zickzack-Läufer. Sanfte Kurven, zielen auf die Mitte.' },
  { id: 15, name: 'Von allen Seiten', total: 33, span: 36, ent: ALL, entMode: 'wave', speed: 1.0, rows: [0, 5], cap: 6, sizes: [4, 5], gap: 0.5,
    mix: { zickzack: 6, koffer: 5, flitzer: 4, helm: 3 }, limits: { helm: 2 }, tip: 'Jede Welle kommt durch einen anderen Eingang.' },
  { id: 16, name: 'Die Vertretung', total: 35, span: 38, ent: ALL, speed: 1.0, rows: [0, 5], cap: 7, sizes: [4, 5, 4], gap: 0.5,
    mix: { nachr: 4, zickzack: 5, koffer: 4, flitzer: 4, helm: 3 }, limits: { helm: 2 }, tip: 'Neu: Nachrücker. Nach dem Treffer erscheint eine Vertretung.' },
  { id: 17, name: 'Antragsstau', total: 38, span: 40, ent: ALL, speed: 1.05, rows: [0, 5], cap: 7, sizes: [5, 4, 3], gap: 0.5,
    mix: { nachr: 3, zickzack: 6, koffer: 5, flitzer: 5, helm: 4 }, limits: { helm: 2 }, tip: 'Zwischen den Gruppen bleibt kurz Luft.' },
  { id: 18, name: 'Der Dauerredner', total: 40, span: 42, ent: ALL, speed: 1.05, rows: [0, 5], cap: 7, sizes: [4, 5, 4], gap: 0.5,
    mix: { nachr: 3, zickzack: 5, koffer: 5, flitzer: 5, helm: 4 }, limits: { helm: 2 }, boss: { id: 'dauerredner', hp: 8, at: 0.5 }, tip: 'Der Dauerredner redet und redet. Hau zu.' },

  // ---- Kapitel 4: Alle wollen einen Sitz ----
  { id: 19, name: 'Sitzung eröffnet', total: 38, span: 38, ent: ALL, speed: 1.05, rows: [0, 5], cap: 7, sizes: [5], gap: 0.45,
    mix: { flitzer: 3, helm: 4, koffer: 4, zickzack: 4 }, limits: { helm: 2 }, tip: 'Übersichtliche Wellen, kurze Pausen.' },
  { id: 20, name: 'Kurze Wortmeldung', total: 40, span: 40, ent: ALL, speed: 1.05, rows: [0, 5], cap: 7, sizes: [5, 4], gap: 0.5,
    mix: { flitzer: 10, helm: 3, koffer: 4, zickzack: 4 }, bursts: [['flitzer', 3], ['flitzer', 3], ['flitzer', 4]], limits: { helm: 2 }, tip: 'Flitzerwellen kündigen sich groß an.' },
  { id: 21, name: 'Die nächste Ausschusssitzung', total: 43, span: 42, ent: ALL, speed: 1.1, rows: [0, 5], cap: 8, sizes: [5, 6, 5], gap: 0.4,
    mix: { nachr: 7, flitzer: 4, helm: 3, koffer: 3, zickzack: 3 }, limits: { helm: 2 }, tip: 'Viele Vertretungen.' },
  { id: 22, name: 'Helm auf, Meinung raus', total: 45, span: 44, ent: ALL, speed: 1.1, rows: [0, 5], cap: 8, sizes: [5, 6, 5], gap: 0.45,
    mix: { helm: 12, flitzer: 2, zickzack: 4, koffer: 5, nachr: 3 }, limits: { helm: 3 }, tip: 'Mehr Helme, dafür weniger Tempo.' },
  { id: 23, name: 'Alle reden gleichzeitig', total: 48, span: 46, ent: ALL, speed: 1.1, rows: [0, 5], cap: 8, sizes: [6, 5, 6], gap: 0.4,
    mix: { nachr: 5, helm: 7, flitzer: 6, zickzack: 7, koffer: 6 }, limits: { helm: 3 }, tip: 'Alle Arten, abwechslungsreiche Wellen.' },
  { id: 24, name: 'Der Ausschusskönig', total: 50, span: 48, ent: ALL, speed: 1.1, rows: [0, 5], cap: 8, sizes: [5, 6, 5], gap: 0.4,
    mix: { nachr: 4, helm: 6, flitzer: 6, zickzack: 6, koffer: 6 }, limits: { helm: 3 }, boss: { id: 'ausschusskoenig', hp: 10, at: 0.5 }, tip: 'Der Ausschusskönig kommt mit eigenen Begleitwellen.' },

  // ---- Kapitel 5: Die Sondersitzung ----
  { id: 25, name: 'Empfang auf rotem Teppich', total: 48, span: 44, ent: ALL, speed: 1.15, rows: [0, 5], cap: 8, sizes: [6, 5, 6], gap: 0.4,
    mix: { nachr: 4, helm: 6, flitzer: 6, zickzack: 6, koffer: 6 }, limits: { helm: 3 }, tip: 'Alle Türen sind offen.' },
  { id: 26, name: 'Plätze für alle', total: 52, span: 48, ent: ALL, speed: 1.15, rows: [0, 5], cap: 8, sizes: [6, 7, 6], gap: 0.3,
    mix: { nachr: 4, helm: 7, flitzer: 6, zickzack: 6, koffer: 7 }, limits: { helm: 3 }, tip: 'Breite Gruppen: manchmal erwischt ein Schlag zwei.' },
  { id: 27, name: 'Kaum weg, schon ersetzt', total: 56, span: 50, ent: ALL, speed: 1.15, rows: [0, 5], cap: 8, sizes: [5, 6, 5], gap: 0.4,
    mix: { nachr: 12, helm: 5, flitzer: 5, zickzack: 5, koffer: 5 }, limits: { helm: 3 }, tip: 'Fast jede zweite hat eine Vertretung.' },
  { id: 28, name: 'Die große Eile', total: 60, span: 54, ent: ALL, speed: 1.2, rows: [0, 5], cap: 9, sizes: [6, 5, 7], gap: 0.35,
    mix: { flitzer: 18, helm: 3, zickzack: 7, koffer: 7, nachr: 4 }, limits: { helm: 2 }, tip: 'Viele Flitzer, kaum Helme.' },
  { id: 29, name: 'Kurz vor der großen Abstimmung', total: 65, span: 58, ent: ALL, speed: 1.2, rows: [0, 5], cap: 9, sizes: [6, 5, 6, 4], gap: 0.35,
    mix: { nachr: 6, helm: 9, flitzer: 12, zickzack: 10, koffer: 9 }, limits: { helm: 3 }, tip: 'Alles dabei, mit kurzen Verschnaufpausen.' },
  { id: 30, name: 'Einer geht. Alle kommen.', total: 75, span: 65, ent: ALL, speed: 1.25, rows: [0, 5], cap: 9, sizes: [22, 22, 24], gap: 0.5,
    mix: { nachr: 7, helm: 9, flitzer: 14, zickzack: 10, koffer: 10 }, limits: { helm: 3 }, boss: { id: 'vorsitzender', hp: 12, at: 0.66 },
    tip: 'Drei Wellen und der große Vorsitzende.' }
];

export const LEVELS = DEFS.map((d) => Object.freeze(Object.assign({
  mix: {}, limits: {}, safe: 3, entMode: 'event', bursts: [], boss: null
}, d)));
export const LEVEL_COUNT = LEVELS.length;
export const levelById = (id) => LEVELS[id - 1];
export const chapterOf = (id) => CHAPTERS[Math.floor((id - 1) / 6)];
export const POWER_FROM_LEVEL = 10;

// ---------------------------------------------------------------------------------------------
// Spawnplan
// ---------------------------------------------------------------------------------------------
const SPECIAL_KEYS = ['helm', 'flitzer', 'zickzack', 'koffer', 'nachr'];
export const START_DELAY = 2.2;           // erster Spawn frühestens so spät (Sekunden nach "Los")

function shuffle(a, rng) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}

// Welche Typen stehen im Plan? (Boss und Nachrücker-Folgegegner zählen zur Gesamtzahl, die Folgegegner stehen aber nicht im Plan.)
export function composition(L) {
  const nachr = L.mix.nachr || 0;
  const boss = L.boss ? 1 : 0;
  let special = 0;
  for (const k of SPECIAL_KEYS) special += L.mix[k] || 0;
  const standard = L.total - boss - nachr - special;
  return { nachr, boss, special, standard, planned: L.total - nachr };
}

// Der große Boss kommt nie durch die äußeren Seitentüren: im schmalen Hochformat läge er dort halb außerhalb des Bildes
function bossEntrance(ent, ents) {
  if (ent !== 'L2' && ent !== 'R2') return ent;
  const inner = ent === 'L2' ? 'L1' : 'R1';
  return ents.includes(inner) ? inner : ents.includes('C') ? 'C' : ent;
}

export function buildPlan(L) {
  const rng = mulberry32(L.id * 7919 + 13);
  const comp = composition(L);
  if (comp.standard < 0) throw new Error('Level ' + L.id + ': Mischung größer als Gesamtzahl');
  // Burst-Gegner aus der normalen Mischung herausnehmen
  const pool = [];
  const burstLeft = {};
  for (const b of L.bursts) burstLeft[b[0]] = (burstLeft[b[0]] || 0) + b[1];
  for (const k of SPECIAL_KEYS) {
    let n = L.mix[k] || 0;
    if (burstLeft[k]) n -= burstLeft[k];
    if (n < 0) throw new Error('Level ' + L.id + ': Burst größer als Mischung');
    for (let i = 0; i < n; i++) pool.push(k);
  }
  for (let i = 0; i < comp.standard; i++) pool.push('standard');
  shuffle(pool, rng);

  // Die ersten Gegner sind einfache, außerdem keine zwei gleichen Sondertypen direkt hintereinander
  for (let i = 0; i < Math.min(L.safe, pool.length); i++) {
    if (pool[i] !== 'standard') {
      const j = pool.findIndex((t, x) => x >= L.safe && t === 'standard');
      if (j >= 0) { const t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
    }
  }
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 1; i < pool.length; i++) {
      if (pool[i] !== 'standard' && pool[i] === pool[i - 1]) {
        for (let j = i + 1; j < pool.length; j++) {
          if (pool[j] !== pool[i] && j >= L.safe && pool[j] !== pool[i - 1]) { const t = pool[i]; pool[i] = pool[j]; pool[j] = t; break; }
        }
      }
    }
  }

  // Wellen bilden: Wellengrößen zyklisch; der Boss eröffnet immer seine eigene Welle
  const seq = pool.slice();
  if (L.boss) seq.splice(Math.round(pool.length * (L.boss.at == null ? 0.5 : L.boss.at)), 0, 'boss');
  const waves = [];
  let cur = [], wi = 0, limit = L.sizes[0];
  const closeWave = () => { waves.push(cur); cur = []; wi++; limit = L.sizes[wi % L.sizes.length]; };
  for (const ty of seq) {
    if (ty === 'boss' && cur.length) closeWave();
    cur.push(ty);
    if (cur.length >= limit) closeWave();
  }
  if (cur.length) waves.push(cur);
  // Burst-Wellen (z. B. Flitzerwellen) gleichmäßig einstreuen
  const bursts = L.bursts.map((b) => new Array(b[1]).fill(b[0]));
  const baseLen = waves.length;
  bursts.forEach((bw, i) => {
    const pos = Math.min(baseLen, Math.floor(((i + 1) * baseLen) / (bursts.length + 1)));
    waves.splice(pos + i, 0, bw);
  });

  // Zeiten: Abstand innerhalb einer Welle ist fest (gap), die Pausen zwischen den Wellen füllen die Spawnphase aus
  const isBurst = (w) => bursts.some((bw) => bw === w);
  const gapOf = (w) => (isBurst(w) ? Math.min(0.5, L.gap) : L.gap);
  const intra = waves.reduce((s, w) => s + (w.length - 1) * gapOf(w), 0);
  const nPause = waves.length - 1;
  let pause = nPause > 0 ? (L.span - intra) / nPause : 0, gapScale = 1;
  if (nPause > 0 && pause < 1.0) { pause = 1.0; gapScale = (L.span - nPause) / intra; }
  if (nPause === 0) gapScale = intra > 0 ? L.span / intra : 0;
  const raw = [];
  let t = 0;
  waves.forEach((w, wIdx) => {
    const gap = gapOf(w) * gapScale;
    w.forEach((type, j) => { raw.push({ wave: wIdx, type, t: t + j * gap }); });
    t += (w.length - 1) * gap + pause;
  });

  // Eingänge
  const ents = L.ent;
  const waveEnt = [];
  const order = shuffle(ents.slice(), rng);
  waves.forEach((_, i) => { waveEnt.push(order[i % order.length]); });
  let prevEnt = null;
  const events = raw.map((e, i) => {
    let ent;
    if (L.entMode === 'wave') ent = waveEnt[e.wave];
    else {
      ent = ents[Math.floor(rng() * ents.length)];
      if (ents.length > 1 && ent === prevEnt) ent = ents[(ents.indexOf(ent) + 1 + Math.floor(rng() * (ents.length - 1))) % ents.length];
    }
    if (e.type === 'boss') ent = bossEntrance(ent, ents);
    prevEnt = ent;
    const lo = L.rows[0], hi = L.rows[1];
    let d = lo + Math.floor(rng() * (hi - lo + 1));
    if (e.type === 'boss') d = Math.min(hi, Math.max(lo, 3));
    return {
      i, at: START_DELAY + e.t, type: e.type, ent, d, r1: rng(), r2: rng(), wave: e.wave,
      hp: e.type === 'boss' ? L.boss.hp : TYPES[e.type].hp,
      boss: e.type === 'boss' ? L.boss.id : null
    };
  });
  events.sort((a, b) => a.at - b.at || a.i - b.i);
  return { events, total: L.total, nachr: comp.nachr, waves: waves.length };
}

// ---------------------------------------------------------------------------------------------
// Endlosmodus „Dauersitzung“
// ---------------------------------------------------------------------------------------------
export const ENDLESS = Object.freeze({
  id: 'endless', name: 'Dauersitzung', total: Infinity, ent: ALL, mix: {}, limits: { helm: 3 }, safe: 0, boss: null, entMode: 'event'
});

export function endlessParams(n) {
  return {
    speed: Math.min(1.3, 0.85 + 0.03 * n),
    cap: Math.min(9, 4 + Math.floor(n / 2)),
    rows: [0, Math.min(5, 2 + Math.floor(n / 2))],
    size: Math.min(30, 6 + 2 * n),
    gap: Math.max(0.5, 1.15 - 0.04 * n),
    group: Math.min(5, 2 + Math.floor(n / 3)),
    groupPause: Math.max(1.6, 2.6 - 0.06 * n),
    relief: n % 4 === 0 ? 7 : 3.5               // Entlastungsphase nach der Welle
  };
}

const ENDLESS_BOSSES = ['hinterbaenkler', 'fraktionskrabbler', 'dauerredner', 'ausschusskoenig', 'vorsitzender'];

// Liefert die Ereignisse der Welle n (n ≥ 1) mit Zeiten relativ zum Wellenstart.
export function buildEndlessWave(n, seed = 1) {
  const rng = mulberry32(seed * 104729 + n * 31);
  const P = endlessParams(n);
  const ents = n < 3 ? ['C', 'L1', 'R1'] : ALL;
  const p = {
    flitzer: Math.min(0.28, 0.04 * n),
    helm: n >= 2 ? Math.min(0.22, 0.05 * (n - 1)) : 0,
    zickzack: n >= 3 ? Math.min(0.2, 0.04 * (n - 2)) : 0,
    koffer: n >= 2 ? 0.1 : 0,
    nachr: n >= 4 ? 0.08 : 0
  };
  const types = [];
  for (let i = 0; i < P.size; i++) {
    const r = rng();
    let acc = 0, ty = 'standard';
    for (const k of ['flitzer', 'helm', 'zickzack', 'koffer', 'nachr']) { acc += p[k]; if (r < acc) { ty = k; break; } }
    types.push(ty);
  }
  for (let i = 0; i < Math.min(2, types.length); i++) types[i] = 'standard';
  const bossWave = n % 5 === 0;
  const events = [];
  let t = 0, j = 0, prevEnt = null;
  const pushEv = (type, extra) => {
    let ent = ents[Math.floor(rng() * ents.length)];
    if (ents.length > 1 && ent === prevEnt) ent = ents[(ents.indexOf(ent) + 1) % ents.length];
    if (type === 'boss') ent = bossEntrance(ent, ents);
    prevEnt = ent;
    const lo = P.rows[0], hi = P.rows[1];
    events.push(Object.assign({
      i: events.length, at: t, type, ent, d: lo + Math.floor(rng() * (hi - lo + 1)), r1: rng(), r2: rng(), wave: n,
      hp: TYPES[type].hp, boss: null
    }, extra));
  };
  if (bossWave) {
    const bid = ENDLESS_BOSSES[(n / 5 - 1) % ENDLESS_BOSSES.length];
    pushEv('boss', { hp: Math.min(14, 6 + 2 * Math.floor(n / 5)), boss: bid, d: Math.min(P.rows[1], 3) });
    t += 3;
  }
  types.forEach((ty) => {
    pushEv(ty);
    j++;
    if (j % P.group === 0) t += P.groupPause; else t += P.gap;
  });
  return { events, params: P };
}
