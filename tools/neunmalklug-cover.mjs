// NEUNMALKLUG: Startseiten-Kachel (720 × 720 WebP) und Teilen-Vorschau (1200 × 630 JPG).
// Liegen die ChatGPT-Bilder in design/neunmalklug/ (nk-kachel.png, nk-social.png, beide ohne Schrift), werden sie benutzt,
// sonst zeichnet das Skript ein Sudoku-Brett in den PlaySaal-Farben. Der Schriftzug kommt immer hier dazu (richtig geschrieben).
// node tools/neunmalklug-cover.mjs   (braucht Playwright mit Chromium und Python mit Pillow für WebP)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, unlinkSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(import.meta.url);
let pw; try { pw = req('playwright'); } catch (e) { try { pw = req(join(execSync('npm root -g').toString().trim(), 'playwright')); } catch (e2) { pw = req('/opt/npm-tools/node_modules/playwright'); } }
const b64 = (p) => readFileSync(resolve(root, p)).toString('base64');
const bild = (n) => (existsSync(resolve(root, 'design/neunmalklug/' + n)) ? 'data:image/png;base64,' + b64('design/neunmalklug/' + n) : null);
const fonts = `@font-face{font-family:D;src:url(data:font/woff2;base64,${b64('public/assets/fonts/dela-gothic-one-latin-400-normal.woff2')}) format('woff2')}
@font-face{font-family:B;font-weight:700;src:url(data:font/woff2;base64,${b64('public/assets/fonts/barlow-condensed-latin-700-normal.woff2')}) format('woff2')}`;

// Gezeichnetes Brett (Ersatz, solange keine ChatGPT-Bilder da sind)
const ZIFFERN = '5.3..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79';
function brett(px, sel) {
  const z = px / 9; let h = `<div style="position:relative;width:${px}px;height:${px}px;border-radius:${z * 0.35}px;overflow:hidden;background:#1a1b26;box-shadow:0 0 0 ${z * 0.08}px rgba(246,247,249,.55),0 ${z * 0.6}px ${z * 1.6}px rgba(0,0,0,.6),0 0 ${z * 2.4}px rgba(255,146,0,.28)">`;
  for (let i = 0; i < 81; i++) {
    const r = Math.floor(i / 9), c = i % 9, v = ZIFFERN[i];
    const bg = i === sel ? 'rgba(255,146,0,.85)' : (r === Math.floor(sel / 9) || c === sel % 9) ? '#262839' : v !== '.' ? '#1f2130' : '#1a1b26';
    h += `<div style="position:absolute;left:${c * z}px;top:${r * z}px;width:${z}px;height:${z}px;background:${bg};display:grid;place-items:center;font:700 ${z * 0.66}px/1 B;color:${i === sel ? '#fff' : '#f6f7f9'}">${i === sel ? '4' : v === '.' ? '' : v}</div>`;
  }
  for (let k = 1; k < 9; k++) {
    const w = k % 3 ? 1 : Math.max(2, z * 0.07), f = k % 3 ? 'rgba(246,247,249,.14)' : 'rgba(246,247,249,.55)';
    h += `<div style="position:absolute;left:${k * z - w / 2}px;top:0;width:${w}px;height:100%;background:${f}"></div><div style="position:absolute;top:${k * z - w / 2}px;left:0;height:${w}px;width:100%;background:${f}"></div>`;
  }
  return h + '</div>';
}
const funken = (n, w, h) => Array.from({ length: n }, (_, i) => { const x = (i * 397) % w, y = (i * 211) % h, s = 2 + (i % 4); return `<i style="position:absolute;left:${x}px;top:${y}px;width:${s}px;height:${s}px;border-radius:50%;background:#FFD21C;opacity:${0.25 + (i % 5) * 0.12};box-shadow:0 0 ${s * 3}px #FFD21C"></i>`; }).join('');
const hg = 'radial-gradient(70% 70% at 50% 45%,#2a2433 0%,#16171f 60%,#11121A 100%)';

const kachelBild = bild('nk-kachel.png'), socialBild = bild('nk-social.png');
const kachel = `<!doctype html><html><head><style>${fonts}html,body{margin:0;width:720px;height:720px;overflow:hidden;background:${hg}}</style></head><body>
${kachelBild ? `<img src="${kachelBild}" style="width:720px;height:720px;object-fit:cover">` : `${funken(26, 720, 720)}<div style="position:absolute;left:105px;top:105px;transform:perspective(1100px) rotateX(18deg) rotateZ(-8deg)">${brett(510, 40)}</div>`}
</body></html>`;
const social = `<!doctype html><html><head><style>${fonts}html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:${hg}}
.text{position:absolute;left:640px;top:170px;color:#fff}h1{font:400 76px/0.95 D;margin:0;text-shadow:0 4px 18px rgba(0,0,0,.5)}h1 em{font-style:normal;color:#FF9200}
p{font:700 34px/1.15 B;margin:22px 0 0;letter-spacing:.03em;text-transform:uppercase}
.marke{display:inline-block;margin-top:26px;font:700 26px/1 B;letter-spacing:.08em;text-transform:uppercase;background:#FFD21C;color:#11121A;padding:10px 18px;border-radius:12px}</style></head><body>
${socialBild ? `<img src="${socialBild}" style="position:absolute;left:0;top:0;height:630px;width:auto"><div style="position:absolute;inset:0;background:linear-gradient(270deg,rgba(17,18,26,.85),rgba(17,18,26,.4) 45%,rgba(17,18,26,0) 60%)"></div>`
    : `${funken(30, 1200, 630)}<div style="position:absolute;left:90px;top:75px;transform:perspective(1100px) rotateX(16deg) rotateZ(-7deg)">${brett(470, 40)}</div>`}
<div class="text"><h1>NEUNMAL<br><em>KLUG</em></h1><p>Jeden Tag ein neues Sudoku.<br>Mit Tagesrangliste.</p><span class="marke">Gratis spielen · PlaySaal</span></div></body></html>`;

const b = await pw.chromium.launch();
const p = await b.newPage({ viewport: { width: 720, height: 720 } });
await p.setContent(kachel); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(200);
const tmp = resolve(root, 'public/bilder/neunmalklug-tmp.png');
await p.screenshot({ path: tmp });
await p.setViewportSize({ width: 1200, height: 630 });
await p.setContent(social); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(200);
await p.screenshot({ path: resolve(root, 'public/bilder/neunmalklug-og.jpg'), type: 'jpeg', quality: 86 });
await b.close();
execSync(`python3 -c "from PIL import Image; Image.open('${tmp}').convert('RGB').save('${resolve(root, 'public/bilder/neunmalklug.webp')}', 'WEBP', quality=84, method=6)"`);
unlinkSync(tmp);
console.log('Neunmalklug: public/bilder/neunmalklug.webp (720 × 720), public/bilder/neunmalklug-og.jpg (1200 × 630)' + (kachelBild && socialBild ? '' : ' – mit gezeichnetem Ersatzbrett'));
