// Erzeugt public/spiele/turmschicht/levels.js: 6 handgebaute Einführungslevel + 24 per Zufallssuche gefundene Level,
// die alle Prüfregeln bestehen (Löser beide Modi, Hebel nötig, Zeitfenster, Bot schafft beide Modi ohne Neustart).
// Aufruf: node tools/turmschicht-levels.mjs   (deterministisch, gleicher Startwert → gleiche Level)
import { writeFileSync } from 'node:fs';
import { validate, solve, playPath, segOf, C } from '../public/spiele/turmschicht/engine.js';

import { TUTORIAL, F } from './turmschicht-tutorial.mjs';
const NAMES = ['Stahlträger', 'Nachtschicht', 'Kranbahn', 'Nietenkolonne', 'Schweißnaht', 'Lastenaufzug', 'Gerüstbau', 'Kesselhaus',
  'Querstrebe', 'Doppelschicht', 'Hochregal', 'Funkenflug', 'Stellwerk 9', 'Fahrstuhlschacht', 'Turmkran', 'Brandmauer',
  'Überstunden', 'Hallendach', 'Stahlgerippe', 'Wartungsgang', 'Notausgang', 'Schichtwechsel', 'Richtkrone', 'Feierabend'];

let seed = 20261017;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (a) => a[Math.floor(rnd() * a.length)];

// Alle erreichbaren Stellen (Etage, x) über alle Hebelzustände – ohne Monster
function reach(lv) {
  const LE = lv.levers, seen = new Set(), out = new Map(), q = [[0, Math.round(lv.start.x / 2) * 2, 0]];
  const lx = (l, m) => (l.xs ? l.xs[m >> l.lever & 1] : l.x);
  while (q.length) {
    const [f, x, m] = q.pop(), k = f + ',' + x + ',' + m; if (seen.has(k)) continue; seen.add(k); out.set(f + ',' + x, [f, x]);
    const sg = segOf(lv, f, x); if (!sg) continue;
    for (const d of [-2, 2]) { const nx = x + d; if (nx >= sg[0] + C.edge && nx <= sg[1] - C.edge) q.push([f, nx, m]); }
    for (const l of lv.ladders) { const X = lx(l, m); if (Math.abs(X - x) > C.grab) continue; if (l.f === f) q.push([f + 1, Math.round(X / 2) * 2, m]); else if (l.f + 1 === f) q.push([f - 1, Math.round(X / 2) * 2, m]); }
    LE.forEach((o, i) => { if (o.f === f && Math.abs(o.x - x) <= C.lever) q.push([f, x, m ^ (1 << i)]); });
  }
  return [...out.values()];
}
function params(n) {
  return {
    floors: n < 15 ? 5 : 6,
    levers: n < 12 ? 1 : n < 24 ? 2 : 3,
    patrols: n < 11 ? 1 : 2,
    hunters: n < 16 ? 1 : 2,
    gaps: n < 10 ? 1 : n < 20 ? 2 : 3,
    speed: n < 19 ? [13 + n * 0.3, 26 + n * 0.5] : [14 + n * 0.15, 26 + n * 0.5], // sechs Etagen sind niedriger, daher ab 19 flacher // Bestzeit Schneller Ausbruch (s) – Menschen brauchen etwa doppelt so lang
    hits: n < 12 ? 1 : 2
  };
}
function candidate(n) {
  const P = params(n), nf = P.floors, floors = Array.from({ length: nf }, () => F);
  const gapFloors = new Set(); while (gapFloors.size < P.gaps) gapFloors.add(ri(1, nf - 1));
  for (const f of gapFloors) { const c = ri(56, 124); floors[f] = [[4, c - 9], [c + 9, 176]]; }
  const lv = { tip: '-', floors, ladders: [], levers: [], monsters: [], stars: [] };
  const ok = (f, x) => { const s = segOf(lv, f, x); return s && x >= s[0] + 8 && x <= s[1] - 8; };
  const ends = [];
  const free = (f, x) => !ends.some((e) => Math.abs(e.x - x) < 18 && (e.f === f || e.f === f + 1 || e.f + 1 === f));
  const xsOK = (f, x) => ok(f, x) && ok(f + 1, x) && free(f, x);
  const addEnds = (f, x) => ends.push({ f, x });
  const col = () => ri(2, 21) * 8 - 4; // 12 … 164
  const sideX = (right) => (right ? ri(18, 21) : ri(2, 5)) * 8 - 4; // rechtes oder linkes Drittel
  const startRight = rnd() < 0.5; lv.start = { x: startRight ? 166 : 14 };
  const leverFloors = new Set(); while (leverFloors.size < P.levers) leverFloors.add(ri(0, nf - 2));
  let right = !startRight, k = 0;
  for (let f = 0; f < nf - 1; f++) {
    let placed = false;
    for (let t = 0; t < 60 && !placed; t++) {
      if (leverFloors.has(f)) {
        const a = sideX(right), b = rnd() < 0.5 ? sideX(!right) : ri(9, 14) * 8 - 4;
        if (Math.abs(a - b) < 40 || !xsOK(f, a) || !xsOK(f, b)) continue;
        const init = rnd() < 0.5; lv.ladders.push({ f, xs: init ? [b, a] : [a, b], lever: k++ }); addEnds(f, a); addEnds(f, b); placed = true;
      } else { const x = sideX(right); if (xsOK(f, x)) { lv.ladders.push({ f, x }); addEnds(f, x); placed = true; } }
    }
    if (!placed) { lv.exit = { x: -99 }; return lv; } // ungültig, wird verworfen
    if (rnd() < 0.15) for (let t = 0; t < 20; t++) { const x = col(); if (xsOK(f, x)) { lv.ladders.push({ f, x }); addEnds(f, x); break; } }
    right = !right;
  }
  for (let j = 0; j < k; j++) { // Hebel nur dorthin, wo man mit den bisherigen Hebeln hinkommt
    const lf = lv.ladders.find((l) => l.lever === j).f;
    const spots = reach(lv).filter(([f, x]) => f <= lf + 1 && x % 4 === 0 && ok(f, x) && !lv.ladders.some((l) => (l.f === f || l.f + 1 === f) && (l.xs || [l.x]).some((lx) => Math.abs(lx - x) < 10)));
    if (!spots.length) { lv.exit = { x: -99 }; return lv; }
    const [f, x] = pick(spots); lv.levers.push({ f, x });
  }
  lv.exit = { x: right ? 166 : 14 };
  { // Ausgang: erreichbare Stelle oben, möglichst weit an der Seite
    const top = reach(lv).filter(([f, x]) => f === nf - 1 && x % 2 === 0);
    if (!top.length) { lv.exit = { x: -99 }; return lv; }
    top.sort((p, q) => (right ? q[1] - p[1] : p[1] - q[1])); lv.exit = { x: Math.max(12, Math.min(168, top[0][1])) };
  }
  // Sterne nur auf erreichbare Stellen (alle Hebelzustände), je Etage höchstens einer, nicht direkt an Leiterenden
  const spots = reach(lv).filter(([f, x]) => f > 0 || Math.abs(x - lv.start.x) > 30).filter(([f, x]) => !lv.ladders.some((l) => (l.f === f || l.f + 1 === f) && (l.xs || [l.x]).some((lx) => Math.abs(lx - x) < 10)));
  // Sterne abseits des schnellsten Wegs: damit „Schneller Ausbruch“ und „Perfekter Lauf“ verschiedene Wege sind
  lv.stars = []; const fast = solve({ ...lv, stars: [] }, 's');
  if (!fast.ok) { lv.exit = { x: -99 }; return lv; }
  const away = ([f, x]) => { let d = Infinity; for (const p of fast.path) if (p.f === f && segOf(lv, f, p.x) === segOf(lv, f, x)) d = Math.min(d, Math.abs(p.x - x)); return d; };
  const far = spots.filter((p) => away(p) >= 34 && p[1] % 4 === 2);
  const used = new Set();
  for (let t = 0; t < 300 && lv.stars.length < 3; t++) { const [f, x] = pick(t < 150 && far.length ? far : spots) || [0, 0]; if (!used.has(f) && x % 2 === 0) { used.add(f); lv.stars.push({ f, x }); } }
  const mon = (hunt) => {
    for (let t = 0; t < 60; t++) {
      const f = ri(1, nf - 1), s = lv.floors[f][ri(0, lv.floors[f].length - 1)], w = ri(36, 76);
      if (s[1] - s[0] - 8 < w + 2) continue;
      const a = ri(s[0] + 4, s[1] - 4 - w), b = a + w;
      if (lv.monsters.some((m) => m.f === f && !(b < m.a - 10 || a > m.b + 10))) continue;
      lv.monsters.push({ f, x: Math.round((a + b) / 2), a, b, dir: pick([-1, 1]), ...(hunt ? { hunt: true } : {}) }); return;
    }
  };
  for (let i = 0; i < P.patrols; i++) mon(false);
  for (let i = 0; i < P.hunters; i++) mon(true);
  return lv;
}
function check(lv, n, P) {
  if (validate(lv).length) return null;
  const sp = solve(lv, 's'), pf = solve(lv, 'p');
  if (!sp.ok || !pf.ok) return null;
  if (sp.seconds < P.speed[0] || sp.seconds > P.speed[1]) return null;
  if (pf.seconds < sp.seconds * 1.35 || pf.seconds > 75) return null;
  if (lv.levers.length) { // Hebel müssen etwas bewirken: ohne Umschalten nicht lösbar, jeder Hebel kommt im perfekten Lauf vor
    if (solve(lv, 's', { noLevers: true }).ok && solve(lv, 'p', { noLevers: true }).ok) return null;
    for (let k = 0; k < lv.levers.length; k++) if (!pf.path.some((p, i) => i && ((p.lev ^ pf.path[i - 1].lev) >> k & 1))) return null;
  }
  const bs = playPath(lv, 's', sp.path), bp = playPath(lv, 'p', pf.path);
  if (!bs.done || !bp.done || bs.hits > P.hits || bp.hits > P.hits) return null;
  return { speed: sp.seconds, perfect: pf.seconds, botS: bs.time / 60, botP: bp.time / 60, hitsS: bs.hits, hitsP: bp.hits };
}
const TIPS = { lever: 'Gestrichelt = dorthin springt die Leiter beim Hebel.', hunter: 'Jäger klettern dir nach. Ein Hebel kann ihren Weg kappen.', patrol: 'Patrouillen laufen hin und her – auf der Leiter abwarten.', stars: 'Perfekter Lauf: erst alle ★, dann raus.' };

// Aufruf: node tools/turmschicht-levels.mjs [von bis]  → sucht Level von..bis (Standard 7..30), schreibt Teil-JSON
//         node tools/turmschicht-levels.mjs merge      → setzt Einführung + alle Teile zu levels.js zusammen
import { readFileSync, readdirSync } from 'node:fs';
const PART = (a, b) => new URL(`./.turmschicht-${a}-${b}${process.argv[4] ? '-s' + process.argv[4] : ''}.json`, import.meta.url);
if (process.argv[2] === 'merge') {
  const out = [...TUTORIAL], report = [];
  TUTORIAL.forEach((lv, i) => { const sp = solve(lv, 's'), pf = solve(lv, 'p'), bs = playPath(lv, 's', sp.path), bp = playPath(lv, 'p', pf.path); report.push(`${i + 1} ${lv.name}: ${validate(lv).join(';') || 'ok'} speed ${sp.seconds.toFixed(1)} perfect ${pf.seconds.toFixed(1)} bot ${bs.done ? 'ok' : 'FAIL'}/${bp.done ? 'ok' : 'FAIL'} hits ${bs.hits}/${bp.hits}`); });
  const parts = readdirSync(new URL('.', import.meta.url)).filter((f) => f.startsWith('.turmschicht-')).flatMap((f) => JSON.parse(readFileSync(new URL('./' + f, import.meta.url), 'utf8')));
  parts.sort((a, b) => a.n - b.n); for (let i = parts.length - 1; i > 0; i--) if (parts[i].n === parts[i - 1].n) parts.splice(i, 1); // doppelt gesuchte Level nur einmal
  for (const p of parts) { out.push(p.level); report.push(`${p.n} ${p.level.name}: ${p.info}`); }
  const body = out.map((l) => '  ' + JSON.stringify(l)).join(',\n');
  writeFileSync(new URL('../public/spiele/turmschicht/levels.js', import.meta.url),
    `// Erzeugt von tools/turmschicht-levels.mjs – feste Level, nicht von Hand ändern (Generator anpassen und neu laufen lassen).\n// floors: Plattformstücke je Etage (0 = unten) · ladders: {f,x} fest oder {f,xs:[a,b],lever} umschaltbar · monsters: hunt = Jäger\nexport const LEVELS = [\n${body}\n];\nexport const LEVEL_COUNT = LEVELS.length;\n`);
  console.log(report.join('\n'), '\nLevel insgesamt:', out.length);
} else {
  const from = Number(process.argv[2] || 7), to = Number(process.argv[3] || 30), res = [];
  for (let n = from; n <= to; n++) {
    seed = 20261017 + n * 7919 + Number(process.argv[4] || 0) * 104729; // optionaler Zusatz, falls ein Startwert nichts findet
    const P = params(n); let found = null, tries = 0;
    while (!found && tries < 20000) { tries++; const lv = candidate(n); const r = check(lv, n, P); if (r) found = { lv, r }; }
    if (!found) { console.error(n, 'NICHTS GEFUNDEN'); continue; }
    const lv = found.lv, r = found.r;
    const tip = n % 4 === 0 ? TIPS.stars : lv.monsters.some((m) => m.hunt) && n % 3 === 0 ? TIPS.hunter : n % 2 ? TIPS.lever : TIPS.patrol;
    const info = `tries ${tries} speed ${r.speed.toFixed(1)} perfect ${r.perfect.toFixed(1)} bot ${r.botS.toFixed(1)}/${r.botP.toFixed(1)} hits ${r.hitsS}/${r.hitsP}`;
    res.push({ n, level: { name: NAMES[n - 7], ...lv, tip }, info }); console.error(n, info);
    writeFileSync(PART(from, to), JSON.stringify(res));
  }
}
