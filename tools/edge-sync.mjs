// Kopiert die Physik-Dateien von SCHRÄGLAGE in die Edge Function (sie braucht dieselben Dateien wie der Browser).
// node tools/edge-sync.mjs         kopiert
// node tools/edge-sync.mjs --check prüft nur, ob die Kopien aktuell sind (Exit-Code 1, wenn nicht)
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const QUELLE = join(ROOT, 'public/spiele/schraeglage'), ZIEL = join(ROOT, 'supabase/functions/schraeglage-lauf');
let veraltet = 0;
for (const f of ['sim.js', 'levels.js', 'det.js', 'planck.js']) {
  const a = readFileSync(join(QUELLE, f), 'utf8'); let b = ''; try { b = readFileSync(join(ZIEL, f), 'utf8'); } catch (e) {}
  if (a === b) continue;
  if (process.argv.includes('--check')) { console.error('Veraltet: ' + f); veraltet++; } else { writeFileSync(join(ZIEL, f), a); console.log('Kopiert: ' + f); }
}
if (veraltet) process.exit(1);
