// Tiertrumpf: Platzhalter für Startseiten-Kachel (720×720) und Teilen-Vorschau (1200×630), gezeichnet mit den Spielkarten selbst.
// Aufruf: node tools/tiertrumpf-platzhalter.mjs   (braucht Playwright + Chromium; schreibt public/bilder/tiertrumpf.webp und tiertrumpf-og.jpg)
// Sobald ChatGPT-Bilder (kachel.png, social-preview.png) in design/tiertrumpf/ liegen, ersetzt tools/tiertrumpf-assets.py diese Dateien.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const req = createRequire(import.meta.url);
let pw; try { pw = req('playwright'); } catch { pw = req(join(execSync('npm root -g').toString().trim(), 'playwright')); }
const css = readFileSync(join(ROOT, 'public/spiele/tiertrumpf/style.css'), 'utf8');
const fonts = readFileSync(join(ROOT, 'public/assets/fonts.css'), 'utf8').replace(/url\((['"]?)(?:\.\/)?fonts\//g, `url($1file://${ROOT}public/assets/fonts/`);

const card = (color, emoji, n, w, rot, x, y) => `<div class="card ${color}" style="--w:${w}px;position:absolute;left:${x}px;top:${y}px;transform:rotate(${rot}deg)"><span class="num tl">${n}</span><span class="num br">${n}</span><span class="win"><span class="emo">${emoji}</span></span></div>`;
const fox = (s, x, y) => `<div class="avatar" style="position:absolute;left:${x}px;top:${y}px;width:${s}px;height:${s}px;font-size:${s * 0.62}px;box-shadow:0 ${s * 0.05}px 0 #c76d1c,0 10px 30px rgba(0,0,0,.18)">🦊</div>`;
const page = (w, h, inner) => `<!doctype html><html><head><meta charset="utf-8"><style>${fonts}${css}html,body{overflow:hidden;width:${w}px;height:${h}px;background:linear-gradient(#bfe2ff 0%,#d6efc4 55%,#9ed27f 100%)}</style></head><body>${inner}</body></html>`;

const kachel = page(720, 720,
  card('red', '🐰', 6, 190, -16, 40, 300) + card('blue', '🐼', 2, 200, -5, 180, 270) + card('green', '🐸', 3, 200, 6, 330, 275) +
  card('yellow', '🦁', 5, 190, 17, 480, 320) + fox(260, 230, 40));
const og = page(1200, 630,
  `<div style="position:absolute;left:70px;top:150px;font:700 118px/1 Fredoka;color:#fff;text-shadow:0 7px 0 #c96a12,0 12px 30px rgba(120,60,0,.3)">Tier<span style="color:#FFE27A">trumpf</span></div>
   <div style="position:absolute;left:76px;top:300px;font:600 40px/1.25 Fredoka;color:#7a4c26">Farbe auf Farbe,<br>Tier auf Tier!</div>
   <div style="position:absolute;left:76px;top:440px;font:600 28px/1 Fredoka;color:#1d4d2b;background:#fff;border-radius:22px;padding:12px 20px">Ab 4 Jahren · gegen Fuchs Fiete</div>` +
  card('red', '🐰', 6, 190, -14, 650, 250) + card('blue', '🐼', 2, 200, -3, 780, 215) + card('green', '🐸', 3, 200, 9, 920, 235) + fox(210, 840, 30));

const b = await pw.chromium.launch();
for (const [html, w, h, file, type] of [[kachel, 720, 720, 'tiertrumpf.png', 'png'], [og, 1200, 630, 'tiertrumpf-og.jpg', 'jpeg']]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  const tmp = join(tmpdir(), 'tiertrumpf-' + file + '.html'); writeFileSync(tmp, html);
  await p.goto('file://' + tmp, { waitUntil: 'networkidle' }); await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: join(ROOT, 'public/bilder', file), type, quality: type === 'jpeg' ? 86 : undefined });
}
await b.close();
// PNG -> WebP (wie die anderen Kacheln, mit Pillow)
const png = join(ROOT, 'public/bilder/tiertrumpf.png');
execSync(`python3 -c "from PIL import Image; Image.open('${png}').convert('RGB').save('${png.replace(/png$/, 'webp')}', 'WEBP', quality=84, method=6)"`);
execSync(`rm '${png}'`);
console.log('Platzhalter geschrieben: public/bilder/tiertrumpf.webp, public/bilder/tiertrumpf-og.jpg');
