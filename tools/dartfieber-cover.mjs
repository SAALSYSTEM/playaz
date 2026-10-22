// DARTFIEBER: Teilen-Vorschau (1200 × 630) aus dem ChatGPT-Bild + Schriftzug in der PlaySaal-Schrift.
// Der Schriftzug wird hier gesetzt (nicht von der Bild-KI), damit er richtig geschrieben ist und zur Marke passt.
// node tools/dartfieber-cover.mjs   (braucht Playwright mit Chromium)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(import.meta.url);
let pw; try { pw = req('playwright'); } catch (e) { try { pw = req(join(execSync('npm root -g').toString().trim(), 'playwright')); } catch (e2) { pw = req('/opt/npm-tools/node_modules/playwright'); } }
const b64 = (p) => readFileSync(resolve(root, p)).toString('base64');
const html = `<!doctype html><html><head><style>
@font-face{font-family:D;src:url(data:font/woff2;base64,${b64('public/assets/fonts/dela-gothic-one-latin-400-normal.woff2')}) format('woff2')}
@font-face{font-family:B;font-weight:700;src:url(data:font/woff2;base64,${b64('public/assets/fonts/barlow-condensed-latin-700-normal.woff2')}) format('woff2')}
html,body{margin:0;width:1200px;height:630px;overflow:hidden}
.bild{position:absolute;inset:0;background:url(data:image/png;base64,${b64('design/dartfieber/df-social.png')}) center 50%/cover}
.schatten{position:absolute;inset:0;background:linear-gradient(90deg,rgba(12,24,35,.7),rgba(12,24,35,.25) 45%,rgba(12,24,35,0) 60%)}
.text{position:absolute;left:60px;top:150px;color:#fff}
h1{font:400 88px/0.95 D;margin:0;letter-spacing:.01em;text-shadow:0 4px 18px rgba(0,0,0,.5)}h1 em{font-style:normal;color:#FF8A1F}
p{font:700 36px/1.15 B;margin:22px 0 0;letter-spacing:.03em;text-transform:uppercase;text-shadow:0 2px 10px rgba(0,0,0,.55)}
.marke{display:inline-block;margin-top:28px;font:700 26px/1 B;letter-spacing:.08em;text-transform:uppercase;background:#FF8A1F;color:#1a0d00;padding:10px 18px;border-radius:12px}
</style></head><body><div class="bild"></div><div class="schatten"></div><div class="text"><h1>DART<br><em>FIEBER</em></h1><p>Jeden Tag eine neue<br>Challenge. Dein Rang?</p><span class="marke">Gratis spielen · PlaySaal</span></div></body></html>`;
const b = await pw.chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
await p.setContent(html); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(200);
await p.screenshot({ path: resolve(root, 'public/bilder/dartfieber-og.jpg'), type: 'jpeg', quality: 86 });
await b.close();
console.log('Dartfieber: public/bilder/dartfieber-og.jpg (1200 × 630)');
