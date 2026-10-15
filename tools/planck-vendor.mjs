#!/usr/bin/env node
// Erzeugt public/spiele/schraeglage/planck.js aus dem npm-Paket planck (MIT, Box2D-Portierung).
// Einzige Änderung: Math.sin/cos/atan2 werden durch die deterministischen Funktionen aus det.js ersetzt,
// damit ein Lauf in jedem Browser und auf dem Server bitgenau gleich nachgerechnet werden kann.
//
//   npm i --no-save planck@1.4.3 && node tools/planck-vendor.mjs
//
// Braucht esbuild (npx esbuild). Nur nötig, wenn planck aktualisiert werden soll.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ZIEL = join(ROOT, 'public/spiele/schraeglage/planck.js');
const req = createRequire(join(process.cwd(), 'x.js'));
const quelle = req.resolve('planck/dist/planck.mjs');
const version = JSON.parse(readFileSync(join(dirname(quelle), '..', 'package.json'), 'utf8')).version;
let s = readFileSync(quelle, 'utf8');
let n = 0;
s = s.replace(/= Math\.(sin|cos|atan2);/g, (m, f) => { n++; return '= __det_' + f + ';'; });
if (n !== 8) throw new Error('Erwartet 8 Ersetzungen, gefunden ' + n + ' (andere planck-Version?)');
if (/Math\.(sin|cos|atan2|tan|exp|pow|log|hypot)\b/.test(s)) throw new Error('planck nutzt weitere ungenaue Math-Funktionen');
s = "import { dsin as __det_sin, dcos as __det_cos, datan2 as __det_atan2 } from './det.js';\n" + s;
const tmp = join(mkdtempSync(join(tmpdir(), 'planck-')), 'planck.mjs');
writeFileSync(tmp, s);
const out = execFileSync('npx', ['-y', 'esbuild@0.25.0', tmp, '--minify', '--format=esm', '--target=es2019', '--legal-comments=none'], { maxBuffer: 1 << 26 }).toString();
const kopf = `/* planck.js ${version} (MIT, (c) Erin Catto, Ali Shakiba, https://github.com/piqnt/planck.js), ` +
  'für SCHRÄGLAGE mit deterministischen Winkelfunktionen aus det.js. Erzeugt mit tools/planck-vendor.mjs */\n';
writeFileSync(ZIEL, kopf + out);
console.log('geschrieben:', ZIEL, Math.round((kopf + out).length / 1024) + ' KB');
