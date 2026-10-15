#!/usr/bin/env node
// SCHRÄGLAGE: Bot-Lösungen zusammenführen, prüfen und Goldzeiten in levels.js eintragen.
//   node tools/schraeglage-gold.mjs loesungen1.json [loesungen2.json …]
// Spätere Dateien überschreiben frühere je Level. Ergebnis: tests/schraeglage-loesungen.json
// Goldzeit = schnellste Bot-Zeit + 12 %, aufgerundet auf 0,5 s.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { replay, decodeInputs } from '../public/spiele/schraeglage/sim.js';
import { LEVELS } from '../public/spiele/schraeglage/levels.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const alle = {};
for (const f of process.argv.slice(2)) Object.assign(alle, JSON.parse(readFileSync(f, 'utf8')));
const out = {}; let fehler = 0;
let src = readFileSync(join(ROOT, 'public/spiele/schraeglage/levels.js'), 'utf8');
for (const l of LEVELS) {
  const s = alle[l.id];
  if (!s) { console.log(`L${l.id}: keine Lösung`); fehler++; continue; }
  const a = replay(l, decodeInputs(s.inputs)), b = replay(l, decodeInputs(s.einfach));
  if (!a.finished || !b.finished) { console.log(`L${l.id}: Lösung kommt nicht (mehr) ins Ziel`); fehler++; continue; }
  const gold = Math.ceil((a.ms * 1.12) / 500) * 0.5;
  out[l.id] = { ms: a.ms, inputs: s.inputs, einfach: s.einfach, einfachMs: b.ms, robust4: s.robust4, robust8: s.robust8, gold };
  // gold: X in der Level-Zeile setzen
  const re = new RegExp(`(L\\(${l.id}, '[^']*', \\{ theme: '[a-z]+')(, gold: [0-9.]+)?`);
  src = src.replace(re, `$1, gold: ${gold}`);
  console.log(`L${String(l.id).padStart(2)} ${l.name.padEnd(20)} Bot ${(a.ms / 1000).toFixed(2)} s  Gold ${gold.toFixed(1)} s  einfach ${(b.ms / 1000).toFixed(2)} s  Toleranz ±4: ${Math.round(s.robust4 * 100)} %  ±8: ${Math.round(s.robust8 * 100)} %`);
}
if (fehler) { console.error(fehler + ' Level ohne gültige Lösung – nichts geschrieben.'); process.exit(1); }
writeFileSync(join(ROOT, 'tests/schraeglage-loesungen.json'), JSON.stringify(out, null, 1) + '\n');
writeFileSync(join(ROOT, 'public/spiele/schraeglage/levels.js'), src);
console.log('geschrieben: tests/schraeglage-loesungen.json und Goldzeiten in levels.js');
