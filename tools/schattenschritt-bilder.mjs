// SCHATTENSCHRITT: Kachel (720 × 720 WebP, ohne Schrift) und Teilen-Vorschau (1200 × 630 JPG mit Schriftzug)
// direkt aus dem Spiel gerendert (Foto-Modus: Level 21 mitten im Schleichen, nur mit ?test erreichbar).
// node tools/schattenschritt-bilder.mjs   (braucht Playwright mit Chromium)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
const req = createRequire(import.meta.url);
let pw; try { pw = req('playwright'); } catch (e) { try { pw = req(join(execSync('npm root -g').toString().trim(), 'playwright')); } catch (e2) { pw = req('/opt/npm-tools/node_modules/playwright'); } }

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = createServer((rq, rs) => {
  let f = join(pub, normalize(decodeURIComponent(new URL(rq.url, 'http://x').pathname)));
  if (existsSync(f + '.html') && (!existsSync(f) || statSync(f).isDirectory())) f += '.html';
  if (!f.startsWith(pub) || !existsSync(f) || statSync(f).isDirectory()) { rs.statusCode = 404; return rs.end(); }
  rs.setHeader('content-type', MIME[extname(f)] || 'application/octet-stream'); rs.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function foto(w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.route('**/assets/playsaal*.js', (r) => r.fulfill({ contentType: 'application/javascript', body: '' }));
  const page = await ctx.newPage();
  await page.goto(base + '/spiele/schattenschritt?test&level=21');
  await page.waitForFunction(() => window.__schatten && window.__schatten.zustand === 'spiel', null, { timeout: 30000 });
  await page.evaluate(() => window.__schatten.foto());
  await page.waitForTimeout(2500);
  const png = await page.screenshot({ type: 'png' });
  await ctx.close();
  return png.toString('base64');
}

const kachel = await foto(720, 720);
const og = await foto(1200, 630);
const b64 = (p) => readFileSync(join(pub, p)).toString('base64');

const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 } });
const page = await ctx.newPage();
// Kachel: PNG → WebP im Browser
await page.setContent('<canvas id="c" width="720" height="720"></canvas>');
const webp = await page.evaluate(async (src) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + src; await img.decode();
  const c = document.getElementById('c'); c.getContext('2d').drawImage(img, 0, 0);
  return c.toDataURL('image/webp', 0.84).split(',')[1];
}, kachel);
writeFileSync(join(pub, 'bilder/schattenschritt.webp'), Buffer.from(webp, 'base64'));
// Teilen-Vorschau: Spielbild + Schriftzug in der PlaySaal-Schrift
await page.setContent(`<!doctype html><html><head><style>
@font-face{font-family:D;src:url(data:font/woff2;base64,${b64('assets/fonts/dela-gothic-one-latin-400-normal.woff2')}) format('woff2')}
@font-face{font-family:B;font-weight:700;src:url(data:font/woff2;base64,${b64('assets/fonts/barlow-condensed-latin-700-normal.woff2')}) format('woff2')}
html,body{margin:0;width:1200px;height:630px;overflow:hidden}
.bild{position:absolute;inset:0;background:url(data:image/png;base64,${og}) center/cover}
.text{position:absolute;left:0;right:0;top:34px;text-align:center;color:#fff}
h1{font:400 80px/1 D;margin:0;letter-spacing:.01em;-webkit-text-stroke:5px #11121a;paint-order:stroke fill;text-shadow:0 8px 0 #11121a}h1 em{font-style:normal;color:#ff9200}
.marke{position:absolute;right:36px;bottom:30px;font:700 28px/1 B;letter-spacing:.08em;text-transform:uppercase;background:#FFD21C;color:#11121a;padding:12px 20px;border-radius:14px}
</style></head><body><div class="bild"></div><div class="text"><h1>SCHATTEN<em>SCHRITT</em></h1></div><span class="marke">Gratis spielen · PlaySaal</span></body></html>`);
await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(200);
await page.screenshot({ path: join(pub, 'bilder/schattenschritt-og.jpg'), type: 'jpeg', quality: 86 });
await browser.close(); server.close();
console.log('Schattenschritt: public/bilder/schattenschritt.webp (720 × 720), public/bilder/schattenschritt-og.jpg (1200 × 630)');
