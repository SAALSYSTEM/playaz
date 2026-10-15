#!/usr/bin/env node
// SCHRÄGLAGE: Lösungs-Bot. Sucht für jedes Level eine Eingabefolge (Gas/Bremse in 0,1-s-Schritten),
// die mit der echten Spielphysik ins Ziel führt, und prüft, wie empfindlich die Lösung auf ungenaues Timing reagiert.
//
//   node tools/schraeglage-bot.mjs              alle Level
//   node tools/schraeglage-bot.mjs 7 8 9        nur diese Level
//   node tools/schraeglage-bot.mjs --json out.json   Lösungen speichern (für Tests und Goldzeiten)
//
// Der Bot ist kein Beweis für "leicht", aber für "lösbar mit zwei Knöpfen und menschlichem Takt".
import { createSim, DT, encodeInputs, replay } from '../public/spiele/schraeglage/sim.js';
import { LEVELS } from '../public/spiele/schraeglage/levels.js';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const CHUNK = 6;                       // 0,1 s pro Entscheidung
const args = process.argv.slice(2);
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const wahl = args.filter((a) => /^\d+$/.test(a)).map(Number);
const ziel = wahl.length ? LEVELS.filter((l) => wahl.includes(l.id)) : LEVELS;
let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

// Lauf mit Aktionsliste (je Chunk), danach Standard "Gas"
function lauf(level, acts, maxTicks = 60 * 150) {
  const sim = createSim(level);
  let maxX = -1e9, maxP = -1e9, lastGain = 0, input = 1;
  while (!sim.finished && !sim.crashed && sim.tick < maxTicks) {
    const c = Math.floor(sim.tick / CHUNK);
    input = c < acts.length ? acts[c] : 1;
    if (!sim.started && input === 0) input = 1;
    sim.step(input);
    const pos = sim.car.chassis.getPosition(), x = pos.x;
    if (x > maxX) maxX = x;
    // Fortschritt = vorwärts oder aufwärts (Aufzug); 6 s ohne Fortschritt = festgefahren
    const pr = x + Math.max(0, pos.y) * 1.5;
    if (pr > maxP + 0.05) { maxP = pr; lastGain = sim.tick; }
    if (sim.tick - lastGain > 60 * 6) break;
  }
  if (maxX > level.finish && !sim.finished && process.env.DBG) console.error('ANOMALIE', level.id, sim.tick, maxX, JSON.stringify(acts));
  return { finished: sim.finished, ms: sim.finishMs, tick: sim.tick, maxX, crashed: sim.crashed, failChunk: Math.max(0, Math.floor((sim.tick - (sim.crashed ? 0 : 60 * 5)) / CHUNK)) };
}
const score = (r) => (r.finished ? 1e7 - r.ms : r.maxX * 1000 + r.tick * 0.01);
function toChanges(acts, ticks) {
  const ch = []; let last = null;
  const n = Math.ceil(ticks / CHUNK) + 1;
  for (let c = 0; c < n; c++) { const a = c < acts.length ? acts[c] : 1; if (a !== last) { ch.push([c * CHUNK, a]); last = a; } }
  if (ch.length && ch[0][1] === 0) ch[0][1] = 1;
  return ch;
}
function zufall() { const r = rnd(); return r < 0.55 ? 1 : r < 0.8 ? 0 : -1; }

function loese(level, budget = +(process.env.BUDGET || 1500)) {
  let acts = [];
  let best = lauf(level, acts), evals = 1;
  let fenster = 6;
  while (!best.finished && evals < budget) {
    const fail = best.failChunk;
    const von = Math.max(0, fail - fenster);
    let verbessert = false;
    for (let k = 0; k < 24 && evals < budget; k++) {
      let cand;
      if (k % 3 === 2) {
        // Warten: vor der Fehlerstelle eine Weile bremsen, Rest verschieben (Aufzüge, Fähren, Wippen)
        const p = Math.max(0, fail - 1 - Math.floor(rnd() * fenster));
        const w = 5 + Math.floor(rnd() * 40);
        cand = acts.slice(0, p); while (cand.length < p) cand.push(1);
        const br = Math.floor(rnd() * 8);
        for (let i = 0; i < w; i++) cand.push(i < br ? -1 : 0);
        for (let i = 0; i < 6; i++) cand.push(1);
      } else {
        cand = acts.slice(0, von);
        while (cand.length < von) cand.push(1);
        const bis = fail + 2;
        // zusammenhängende Blöcke statt Einzelrauschen (menschlicher)
        let a = zufall();
        for (let c = von; c < bis; c++) { if (rnd() < 0.35) a = zufall(); cand.push(a); }
      }
      const r = lauf(level, cand); evals++;
      if (score(r) > score(best) + 1) { best = r; acts = cand; verbessert = true; }
      if (best.finished) break;
    }
    fenster = verbessert ? 6 : Math.min(fenster + 6, 90);
  }
  if (!best.finished) return { ok: false, evals, best };
  const gefunden = acts.slice();
  // a) Einfach: so wenige Eingabewechsel wie möglich (menschlicher, aussagekräftigere Robustheit)
  let einfach = gefunden.slice(), eBest = best;
  for (let pass = 0; pass < 3; pass++) {
    let geaendert = false;
    for (let c = 1; c < einfach.length; c++) {
      if (einfach[c] === einfach[c - 1]) continue;
      // Abschnitt ab c bis zum nächsten Wechsel auf den vorherigen Wert setzen
      let e = c; while (e < einfach.length && einfach[e] === einfach[c]) e++;
      const cand = einfach.slice(); for (let k = c; k < e; k++) cand[k] = einfach[c - 1];
      const r = lauf(level, cand); evals++;
      if (r.finished) { einfach = cand; eBest = r; geaendert = true; }
    }
    if (!geaendert) break;
  }
  // b) Schnell: Bremsen/Rollen durch Gas ersetzen, wenn es trotzdem klappt (für die Goldzeit)
  for (let pass = 0; pass < 3; pass++) {
    for (let c = 0; c < acts.length; c++) {
      if (acts[c] === 1) continue;
      const cand = acts.slice(); cand[c] = 1;
      const r = lauf(level, cand); evals++;
      if (r.finished && r.ms <= best.ms) { acts = cand; best = r; }
    }
  }
  const fertig = (a, r) => { a = a.slice(); while (a.length && a[a.length - 1] === 1) a.pop(); const ch = toChanges(a, r.tick); return { ch, rp: replay(level, ch) }; };
  const f1 = fertig(acts, best), f2 = fertig(einfach, eBest);
  if (!f1.rp.finished || !f2.rp.finished) return { ok: false, evals, best, grund: 'replay' };
  return { ok: true, evals, ms: f1.rp.ms, changes: f1.ch, inputs: encodeInputs(f1.ch), drueck: f1.ch.length,
    einfach: { ms: f2.rp.ms, changes: f2.ch, inputs: encodeInputs(f2.ch), drueck: f2.ch.length } };
}

// Robustheit: jede Eingabe zufällig um bis zu ±j Takte verschieben
function robust(level, changes, j = 4, n = 30) {
  let ok = 0;
  for (let i = 0; i < n; i++) {
    const ch = changes.map(([t, v], k) => [k === 0 ? 0 : Math.max(1, t + Math.round((rnd() * 2 - 1) * j)), v]).sort((a, b) => a[0] - b[0]);
    if (replay(level, ch).finished) ok++;
  }
  return ok / n;
}

const alt = jsonOut && existsSync(jsonOut) ? JSON.parse(readFileSync(jsonOut, 'utf8')) : {};
const out = { ...alt };
let fehler = 0;
for (const level of ziel) {
  const t0 = Date.now();
  const r = loese(level);
  const s = ((Date.now() - t0) / 1000).toFixed(1);
  if (!r.ok) {
    fehler++;
    console.log(`L${level.id} ${level.name}: NICHT GELÖST (${r.evals} Läufe, ${s}s) – bis x=${r.best.maxX.toFixed(1)} von ${level.finish.toFixed(1)}, ${r.best.crashed || 'stecken geblieben'}`);
    continue;
  }
  const rb = robust(level, r.einfach.changes, 4), rb8 = robust(level, r.einfach.changes, 8);
  const gold = level.gold ? (r.ms / 1000 <= level.gold ? 'unter Gold ' + level.gold : 'ÜBER GOLD ' + level.gold) : '';
  console.log(`L${level.id} ${level.name}: schnell ${(r.ms / 1000).toFixed(2)} s · einfach ${(r.einfach.ms / 1000).toFixed(2)} s mit ${r.einfach.drueck} Wechseln · Toleranz ±4: ${(rb * 100).toFixed(0)} %, ±8: ${(rb8 * 100).toFixed(0)} % (${r.evals} Läufe, ${s}s) ${gold}`);
  out[level.id] = { ms: r.ms, inputs: r.inputs, einfach: r.einfach.inputs, einfachMs: r.einfach.ms, robust4: rb, robust8: rb8 };
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1));
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1));
process.exit(fehler ? 1 : 0);
