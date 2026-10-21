// Kopiert die Spiellogik (SCHRÄGLAGE, SEITENWECHSEL) in die Edge Functions (sie brauchen dieselben Dateien wie der Browser).
// node tools/edge-sync.mjs         kopiert
// node tools/edge-sync.mjs --check prüft nur, ob die Kopien aktuell sind (Exit-Code 1, wenn nicht)
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FUNKTIONEN = [
  { quelle: 'public/spiele/schraeglage', ziel: 'supabase/functions/schraeglage-lauf', dateien: ['sim.js', 'levels.js', 'det.js', 'planck.js'] },
  { quelle: 'public/spiele/seitenwechsel', ziel: 'supabase/functions/seitenwechsel-lauf', dateien: ['sim.js'] }
];
let veraltet = 0;
for (const fn of FUNKTIONEN) for (const f of fn.dateien) {
  const a = readFileSync(join(ROOT, fn.quelle, f), 'utf8'); let b = ''; try { b = readFileSync(join(ROOT, fn.ziel, f), 'utf8'); } catch (e) {}
  if (a === b) continue;
  if (process.argv.includes('--check')) { console.error('Veraltet: ' + fn.ziel + '/' + f); veraltet++; } else { writeFileSync(join(ROOT, fn.ziel, f), a); console.log('Kopiert: ' + fn.ziel + '/' + f); }
}
if (veraltet) process.exit(1);
