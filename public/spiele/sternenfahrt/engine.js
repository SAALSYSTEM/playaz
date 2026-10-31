// Neon Coast – Sternenfahrt: Regeln, Fahrt, Kollisionen, Spielstand (ohne DOM, in Node testbar).
// Grundsatz für Kinder ab 5: kein Game-over. Eine Berührung macht nur „Hoppla“: kurz langsamer, kurz unverwundbar.
//
// Welt: x = Querlage in Spurbreiten (Spurmitten -1, 0, 1), y = Fahrstrecke in Spurbreiten (nach vorn).
// Die Kamera zeigt immer mindestens VIS_MIN Spurbreiten vor dem Auto (game.js passt den Maßstab an).

export const STORE = 'sternenfahrt.v1';
export const STEP = 1 / 120;          // feste Rechenschritte: gleiches Verhalten bei 30, 60 oder 144 Bildern pro Sekunde
export const VIS_MIN = 7;             // so weit (mindestens) sieht man vor der Automitte
export const SPAWN = 15;              // ab hier werden Objekte aktiv (immer außerhalb des Bildes)
export const TC = 0.3;                // Dauer eines Spurwechsels in Sekunden
export const CAR = { hw: 0.25, hl: 0.6 };   // Trefferfläche Spielerauto (kleiner als das Bild: verzeiht knappe Stellen)
export const INV = 2.2;               // Schutzzeit nach einer Berührung
export const SLOW = 1.4;              // so lange wird nach einer Berührung wieder beschleunigt
export const SLOW_F = 0.45;           // Tempo direkt nach der Berührung (Anteil)
export const RAMP = 1.2;              // Anfahren am Levelstart
export const CAR_K = 0.4;             // langsame Autos fahren mit 40 % des eigenen Tempos
export const CAR_RUN = CAR_K * SPAWN / (1 - CAR_K);   // so viele Spurbreiten fährt ein langsames Auto, bis man es erreicht

// Hindernisse: halbe Breite/Länge der Trefferfläche
export const KINDS = {
  kegel: { hw: 0.24, hl: 0.24 },
  bake: { hw: 0.36, hl: 0.17 },
  absperrung: { hw: 0.43, hl: 0.15 },
  auto: { hw: 0.27, hl: 0.62 }
};
const CHAR_KIND = { k: 'kegel', b: 'bake', a: 'absperrung', c: 'auto' };

export const AUTOS = {
  tuerkis: { name: 'Türkis-Flitzer', ab: 0, img: 'auto-tuerkis' },
  pink: { name: 'Pinke Rakete', ab: 3, img: 'auto-pink' },        // frei nach Level 3
  orange: { name: 'Orange Blitz', ab: 6, img: 'auto-orange' },    // frei nach Level 6
  lila: { name: 'Lila Limousine', ab: 12, img: 'verkehr-lila' },  // frei nach Level 12
  taxi: { name: 'Sonnen-Taxi', ab: 16, img: 'verkehr-taxi' }      // frei nach Level 16
};
export const AUTO_IDS = Object.keys(AUTOS);

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (k) => k * k * (3 - 2 * k);

// ---------- Level aus Bausteinen ----------
// Ein Baustein: Zeilen von oben nach unten (so wie man sie auf dem Bildschirm sieht), je Zeile 3 Spuren.
// '.' frei, '*' Stern, 'k' Leitkegel, 'b' Bake, 'a' Absperrung, 'c' langsames Auto (Zeile = wo man es einholt)
export function buildLevel(def, chunks) {
  const rows = [];
  for (const tok of def.seq.trim().split(/\s+/)) {
    if (/^_\d+$/.test(tok)) { for (let i = 0; i < Number(tok.slice(1)); i++) rows.push('...'); continue; }
    const c = chunks[tok];
    if (!c) throw new Error(`Level ${def.id}: unbekannter Baustein ${tok}`);
    for (let i = c.length - 1; i >= 0; i--) rows.push(c[i]);
  }
  const objs = [];
  rows.forEach((r, i) => {
    if (r.length !== 3) throw new Error(`Level ${def.id}: Zeile „${r}“ braucht 3 Zeichen`);
    for (let l = 0; l < 3; l++) {
      const ch = r[l];
      if (ch === '.') continue;
      const y = def.vorlauf + i;
      if (ch === '*') objs.push({ kind: 'stern', lane: l - 1, y });
      else if (CHAR_KIND[ch]) objs.push({ kind: CHAR_KIND[ch], lane: l - 1, y });
      else throw new Error(`Level ${def.id}: unbekanntes Zeichen ${ch}`);
    }
  });
  const length = def.vorlauf + rows.length + def.auslauf;
  return { ...def, objs, length, stars: objs.filter((o) => o.kind === 'stern').length };
}

// ---------- Fahrt ----------
export function newRun(lv, opts = {}) {
  const tut = !!(lv.tutorial && opts.tutorial !== false);
  const st = {
    lv, t: 0, acc: 0, p: 0, v: 0, ramp: 0,
    target: 0, x: 0, x0: 0, x1: 0, k: 1, dur: 0,
    phase: tut ? 'links' : 'fahrt', offset: tut ? null : 0, tutAt: 0, tutStars: 0,
    objs: [], next: 0, got: 0, gotLevel: 0, hits: 0, inv: 0, slow: 0, endT: 0, done: false,
    events: []
  };
  return st;
}

// Ein Tastendruck = genau eine Spur (auch mitten im Wechsel: dann von der Zielspur aus weiter)
export function press(st, dir) {
  if (st.done || st.phase === 'ziel') return false;
  const to = clamp(st.target + dir, -1, 1);
  if (to === st.target) { st.events.push({ e: 'rand', dir }); return false; }
  st.target = to;
  st.x0 = st.x; st.x1 = to; st.k = 0;
  st.dur = Math.max(0.16, TC * Math.abs(st.x1 - st.x0));
  st.events.push({ e: 'spur', dir });
  return true;
}

const nominal = (st) => st.lv.speed;
export const progress = (st) => (st.offset == null ? 0 : clamp((st.p - st.offset) / st.lv.length, 0, 1));
// Position eines langsamen Autos hängt nur von der eigenen Fahrstrecke ab (gleich bei jeder Bildrate)
function carY(o, p) {
  const pa = o.y0 - SPAWN;
  return p <= pa ? o.y0 : o.y0 + CAR_K * (p - pa);
}

function spawn(st) {
  if (st.offset == null) return;
  const objs = st.lv.objs;
  while (st.next < objs.length && objs[st.next].y + st.offset - st.p < SPAWN + CAR_RUN + 1) {
    const d = objs[st.next++], o = { ...d, y: d.y + st.offset, id: st.next, hit: false, got: false };
    if (o.kind === 'auto') { o.meet = o.y; o.y0 = o.y - CAR_RUN; o.y = o.y0; }
    st.objs.push(o);
  }
}

function tutorial(st) {
  // Übungssterne vor dem Auto in der Spur, in die das Kind lenken soll
  const lane = st.phase === 'links' ? -1 : 1;
  if (st.p >= st.tutAt) {
    st.tutAt = st.p + 1.6;
    st.objs.push({ kind: 'stern', lane, y: st.p + 12, id: 'u' + st.tutStars++, tut: true, got: false, hit: false });
  }
  if (st.phase === 'links' && st.target === -1 && Math.abs(st.x + 1) < 0.05) { st.phase = 'rechts'; st.tutAt = 0; st.events.push({ e: 'lerne', phase: 'rechts' }); }
  else if (st.phase === 'rechts' && st.target === 1 && Math.abs(st.x - 1) < 0.05) {
    st.phase = 'fahrt'; st.offset = st.p + 9.5;   // Level beginnt oben am Bildrand, Übungssterne fliegen raus
    st.objs = st.objs.filter((o) => o.y > st.p - 2);
    st.events.push({ e: 'lerne', phase: 'fertig' });
  }
}

function overlap(st, o) {
  const k = KINDS[o.kind];
  return Math.abs(st.x - o.lane) < CAR.hw + k.hw && Math.abs(st.p - o.y) < CAR.hl + k.hl;
}

export function step(st, dt = STEP) {
  if (st.done) return;
  st.t += dt;
  // Tempo: anfahren, nach Berührung kurz langsamer, im Ziel ausrollen
  st.ramp = Math.min(1, st.ramp + dt / RAMP);
  let f = smooth(st.ramp);
  if (st.slow > 0) { st.slow = Math.max(0, st.slow - dt); f *= SLOW_F + (1 - SLOW_F) * smooth(1 - st.slow / SLOW); }
  if (st.phase === 'ziel') { st.endT += dt; f *= Math.max(0.15, 1 - st.endT / 1.4); }
  st.v = nominal(st) * f;
  st.p += st.v * dt;
  if (st.inv > 0) st.inv = Math.max(0, st.inv - dt);
  // Spurwechsel (sanft)
  if (st.k < 1) { st.k = Math.min(1, st.k + dt / st.dur); st.x = st.x0 + (st.x1 - st.x0) * smooth(st.k); }
  if (st.phase === 'links' || st.phase === 'rechts') tutorial(st);
  spawn(st);
  // Objekte
  for (const o of st.objs) {
    if (o.kind === 'auto') o.y = carY(o, st.p);
    if (o.got || o.hit) continue;
    if (o.kind === 'stern') {
      if (Math.abs(st.x - o.lane) < 0.55 && Math.abs(st.p - o.y) < 0.8) {
        o.got = true; st.got++; if (!o.tut) st.gotLevel++;
        st.events.push({ e: 'stern', o });
      }
    } else if (st.inv <= 0 && overlap(st, o)) {
      o.hit = true; st.hits++; st.inv = INV; st.slow = SLOW;
      o.hitX = Math.sign(o.lane - st.x) || (Math.random() < 0.5 ? -1 : 1);
      st.events.push({ e: 'hoppla', o });
    } else if (st.inv > 0 && overlap(st, o)) {
      o.hit = true;   // in der Schutzzeit einfach durchfahren (kein zweiter Treffer, Hindernis weicht aus)
      o.hitX = Math.sign(o.lane - st.x) || 1; o.soft = true;
    }
  }
  if (st.objs.length > 40 || st.t % 1 < dt) st.objs = st.objs.filter((o) => o.y > st.p - 6);
  // Ziel
  if (st.phase === 'fahrt' && st.p >= st.offset + st.lv.length) { st.phase = 'ziel'; st.events.push({ e: 'ziel' }); }
  if (st.phase === 'ziel' && st.endT >= 1.4) { st.done = true; st.events.push({ e: 'fertig' }); }
}

// Bildzeit in feste Schritte zerlegen (große Sprünge, z. B. nach einem Ruckler, werden begrenzt)
export function advance(st, dt) {
  st.acc += Math.min(0.25, Math.max(0, dt));
  while (st.acc >= STEP && !st.done) { step(st, STEP); st.acc -= STEP; }
}

// ---------- Auszeichnung ----------
// Bis zu drei Sterne nach dem Anteil gesammelter Sterne; jedes Ankommen zählt mindestens einen
export function award(got, total) {
  const q = total ? got / total : 1;
  return q >= 0.9 ? 3 : q >= 0.6 ? 2 : 1;
}

// ---------- Spielstand ----------
export const freshSave = () => ({ v: 1, unlocked: 1, best: {}, got: {}, car: 'tuerkis', mute: false });

export function carsUnlocked(save) {
  return AUTO_IDS.filter((id) => AUTOS[id].ab === 0 || save.best[AUTOS[id].ab]);
}

export function sanitizeSave(raw, count) {
  const s = freshSave();
  if (!raw || typeof raw !== 'object') return s;
  if (raw.mute === true) s.mute = true;
  if (raw.best && typeof raw.best === 'object') {
    for (const [k, v] of Object.entries(raw.best)) {
      const n = Number(k), a = Number(v);
      if (Number.isInteger(n) && n >= 1 && n <= count && Number.isInteger(a) && a >= 1 && a <= 3) s.best[n] = a;
    }
  }
  if (raw.got && typeof raw.got === 'object') {
    for (const [k, v] of Object.entries(raw.got)) {
      const n = Number(k), g = Number(v);
      if (s.best[n] && Number.isInteger(g) && g >= 0 && g <= 999) s.got[n] = g;
    }
  }
  let u = Number(raw.unlocked);
  if (!Number.isInteger(u) || u < 1) u = 1;
  const done = Object.keys(s.best).map(Number);
  if (done.length) u = Math.max(u, Math.max(...done) + 1);
  s.unlocked = Math.min(count, u);
  s.car = carsUnlocked(s).includes(raw.car) ? raw.car : 'tuerkis';
  return s;
}

// Level geschafft: Bestwerte, nächstes Level frei, neue Autos. Liefert { stars, rec, neuAuto }
export function recordWin(save, lv, st, count) {
  const n = lv.id, stars = award(st.gotLevel, lv.stars);
  const vorher = carsUnlocked(save);
  const rec = !save.best[n] || stars > save.best[n] || st.gotLevel > (save.got[n] || 0);
  if (!save.best[n] || stars > save.best[n]) save.best[n] = stars;
  if (st.gotLevel > (save.got[n] || 0)) save.got[n] = st.gotLevel;
  if (n <= save.unlocked && n + 1 > save.unlocked) save.unlocked = Math.min(count, n + 1);   // Einladung zu gesperrtem Level schaltet nichts frei
  const neuAuto = carsUnlocked(save).find((id) => !vorher.includes(id)) || null;
  return { stars, rec, neuAuto };
}

export const totalAwards = (save) => Object.values(save.best).reduce((a, b) => a + b, 0);

export function parseInvite(search, count) {
  const q = new URLSearchParams(search || ''), l = Number(q.get('l'));
  return Number.isInteger(l) && l >= 1 && l <= count ? { l } : null;
}

// ---------- Prüf-Fahrer (für Tests): Kind mit Reaktionszeit ----------
// Sieht ein Objekt erst, wenn es VIS_MIN vor der Automitte auftaucht, reagiert nach `reaction` Sekunden,
// drückt höchstens alle `gap` Sekunden. Weicht Hindernissen aus und holt nahe Sterne, wenn es sicher ist.
export function kidBot(opts = {}) {
  const R = opts.reaction ?? 1, gap = opts.gap ?? 0.25, greedy = opts.stars ?? true;
  const seen = new Map();
  let lastPress = -9;
  return function decide(st) {
    for (const o of st.objs) if (!seen.has(o) && o.y - st.p <= VIS_MIN) seen.set(o, st.t);
    if (st.t - lastPress < gap || st.phase === 'ziel') return 0;
    const known = st.objs.filter((o) => seen.has(o) && st.t - seen.get(o) >= R && !o.got && !o.hit);
    const danger = (lane) => {
      let d = Infinity;
      for (const o of known) {
        if (o.kind === 'stern' || o.lane !== lane) continue;
        const rel = o.y - st.p;
        if (rel > -(CAR.hl + KINDS[o.kind].hl)) d = Math.min(d, rel);
      }
      return d;
    };
    const DZ = st.lv.speed * 1.5 + 1;
    let want = st.target;
    if (danger(st.target) < DZ) {
      let best = -Infinity;
      for (const l of [-1, 0, 1]) {
        if (l === st.target) continue;
        if (Math.abs(l - st.target) === 2 && danger((l + st.target) / 2) < 1.2) continue;
        const score = Math.min(danger(l), 30) - Math.abs(l - st.target) * 0.5;
        if (score > best) { best = score; want = l; }
      }
    } else if (greedy) {
      const star = known.filter((o) => o.kind === 'stern' && o.y - st.p > 0.5 && o.y - st.p < 5).sort((a, b) => a.y - b.y)[0];
      if (star && star.lane !== st.target && danger(star.lane) > DZ + 1.5 && danger(st.target + Math.sign(star.lane - st.target)) > DZ) want = star.lane;
    }
    if (want === st.target) return 0;
    lastPress = st.t;
    return Math.sign(want - st.target);
  };
}
