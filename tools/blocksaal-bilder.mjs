#!/usr/bin/env node
// Schreibt das Kachelbild von BlockSaal für die Startseite neu: public/bilder/blocksaal.png (960 × 600).
// Das Vorschaubild für Herausforderungslinks (1200 × 630) entsteht dagegen erst beim Abruf im Worker (src/worker.js).
// Beide Bilder kommen aus src/vorschau.js; nur nötig, wenn Motiv oder Farben geändert werden:
//   node tools/blocksaal-bilder.mjs            Kachelbild neu schreiben
//   node tools/blocksaal-bilder.mjs vorschau 42   Vorschau für 42 Reihen als vorschau-42.png in den aktuellen Ordner
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderKachel, renderVorschau } from '../src/vorschau.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const [, , was, zahl] = process.argv;
if (was === 'vorschau') {
  const n = Number(zahl) || 42;
  writeFileSync(`vorschau-${n}.png`, await renderVorschau(n));
  console.log(`vorschau-${n}.png geschrieben`);
} else {
  const png = await renderKachel();
  writeFileSync(join(ROOT, 'public/bilder/blocksaal.png'), png);
  console.log(`public/bilder/blocksaal.png geschrieben (${png.length} Bytes)`);
}
