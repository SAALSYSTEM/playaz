// LEUCHTPFAD: Startseiten-Kachel (720 × 720 WebP) und Teilen-Vorschau (1200 × 630 JPG).
// Liegen die ChatGPT-Bilder in design/leuchtpfad/ (lp-kachel.gif oder lp-kachel.png, lp-social.png), werden nur diese
// umgewandelt (GIF -> animiertes WebP). Sonst zeichnet das Skript eine Nachtwiese mit leuchtendem Weg (erste Fassung).
// node tools/leuchtpfad-cover.mjs   (Python mit Pillow; für die gezeichnete Fassung zusätzlich Playwright mit Chromium)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, unlinkSync, writeFileSync, mkdtempSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const D = (n) => resolve(root, 'design/leuchtpfad/' + n);
const kachelSrc = ['lp-kachel.gif', 'lp-kachel.png'].map(D).find(existsSync), socialSrc = existsSync(D('lp-social.png')) ? D('lp-social.png') : null;
const py = (code) => { const f = resolve(root, 'design/leuchtpfad/.cover.py'); writeFileSync(f, code); try { execSync('python3 -I ' + JSON.stringify(f)); } finally { unlinkSync(f); } };

if (kachelSrc && socialSrc) {
  py(`from PIL import Image, ImageSequence
r = ${JSON.stringify(root + '/')}
src = Image.open(${JSON.stringify(kachelSrc)}); fr = []; dur = []
for f in ImageSequence.Iterator(src):
    dur.append(f.info.get('duration', 350)); w, h = f.size; s = min(w, h)
    fr.append(f.convert('RGB').crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s)).resize((720, 720), Image.LANCZOS))
if len(fr) > 1: fr[0].save(r + 'public/bilder/leuchtpfad.webp', 'WEBP', save_all=True, append_images=fr[1:], duration=dur, loop=0, quality=70, method=6)
else: fr[0].save(r + 'public/bilder/leuchtpfad.webp', 'WEBP', quality=82, method=6)
s = Image.open(${JSON.stringify(socialSrc)}).convert('RGB'); w, h = s.size; th = round(w * 630 / 1200)
if th <= h: s = s.crop((0, (h - th) // 2, w, (h - th) // 2 + th))
s.resize((1200, 630), Image.LANCZOS).save(r + 'public/bilder/leuchtpfad-og.jpg', 'JPEG', quality=86, optimize=True, progressive=True)
`);
  console.log('Leuchtpfad: Kachel und Teilen-Vorschau aus den ChatGPT-Bildern');
  process.exit(0);
}

const req = createRequire(import.meta.url);
let pw; try { pw = req('playwright'); } catch (e) { try { pw = req(join(execSync('npm root -g').toString().trim(), 'playwright')); } catch (e2) { pw = req('/opt/npm-tools/node_modules/playwright'); } }
const b64 = (p) => readFileSync(resolve(root, p)).toString('base64');
const fonts = `@font-face{font-family:F;font-weight:700;src:url(data:font/woff2;base64,${b64('public/assets/fonts/' + (existsSync(resolve(root, 'public/assets/fonts/fredoka-latin-700-normal.woff2')) ? 'fredoka-latin-700-normal.woff2' : 'barlow-condensed-latin-700-normal.woff2'))}) format('woff2')}`;

// Szene in Canvas: Steine, goldener Weg, Lumi, Pilzhaus (gleiche Formen wie im Spiel)
const szene = (W, H, text) => `<!doctype html><html><head><style>${fonts}html,body{margin:0;background:#151a40}</style></head><body><canvas id=c width=${W} height=${H}></canvas><script>
document.fonts.load('700 40px F').then(()=>{
const c=document.getElementById('c'),X=c.getContext('2d'),W=${W},H=${H},TAU=Math.PI*2,TEXT=${JSON.stringify(text)};
const g=X.createLinearGradient(0,0,0,H);g.addColorStop(0,'#1d2463');g.addColorStop(.5,'#2d3a86');g.addColorStop(1,'#1f4a3a');X.fillStyle=g;X.fillRect(0,0,W,H);
for(let i=0;i<90;i++){X.fillStyle='rgba(255,255,240,'+(.3+(i%4)*.15)+')';X.beginPath();X.arc((i*97.3)%W,(i*53.7)%(H*.35),.8+(i%3)*.7,0,TAU);X.fill();}
X.fillStyle='#1f4a3a';X.beginPath();X.moveTo(0,H*.36);for(let x=0;x<=W;x+=W/12)X.lineTo(x,H*.35+Math.sin(x/W*5)*H*.02);X.lineTo(W,H);X.lineTo(0,H);X.fill();
const ox=TEXT?W*.05:W*.1, area=TEXT?H*0.95:W*.8, cols=5, rows=4, cs=Math.min((TEXT?W*.5:area)/cols,(H*.62)/rows), bx=TEXT?W*.04:(W-cs*cols)/2, by=H*.33;
const path=[[0,3],[1,3],[1,2],[2,2],[3,2],[3,1],[3,0],[4,0]];
const lit=(c,r)=>path.findIndex(p=>p[0]===c&&p[1]===r);
for(let r=0;r<rows;r++)for(let col=0;col<cols;col++){const x=bx+(col+.5)*cs,y=by+(r+.5)*cs,rx=cs*.37,ry=cs*.3,i=lit(col,r),on=i>=0&&i<7;
 X.fillStyle='rgba(0,0,0,.28)';X.beginPath();X.ellipse(x,y+ry*.35,rx,ry*.9,0,0,TAU);X.fill();
 if(on){X.save();X.globalCompositeOperation='lighter';const q=X.createRadialGradient(x,y,rx*.2,x,y,rx*2);q.addColorStop(0,'rgba(255,200,40,.75)');q.addColorStop(1,'rgba(0,0,0,0)');X.fillStyle=q;X.beginPath();X.arc(x,y,rx*2,0,TAU);X.fill();X.restore();}
 const s=X.createRadialGradient(x-rx*.3,y-ry*.5,rx*.1,x,y,rx*1.1);s.addColorStop(0,on?'#fff7c2':'#8a95c8');s.addColorStop(1,on?'#ffb300':'#566091');X.fillStyle=s;X.beginPath();X.ellipse(x,y,rx,ry,0,0,TAU);X.fill();}
// Pilzhaus
{const x=bx+4.5*cs,y=by+.5*cs-cs*.06;X.fillStyle='#f3e6c8';X.beginPath();X.roundRect(x-cs*.2,y-cs*.42,cs*.4,cs*.42,cs*.07);X.fill();X.fillStyle='#7a4c26';X.beginPath();X.roundRect(x-cs*.07,y-cs*.2,cs*.14,cs*.2,[cs*.07,cs*.07,0,0]);X.fill();
X.fillStyle='#e8473a';X.beginPath();X.ellipse(x,y-cs*.42,cs*.42,cs*.3,0,Math.PI,TAU);X.fill();X.fillStyle='#fff';for(const[dx,dy,r]of[[-.2,-.55,.06],[.08,-.64,.07],[.25,-.5,.05]]){X.beginPath();X.arc(x+dx*cs,y+dy*cs,r*cs,0,TAU);X.fill();}}
// Lumi über Stein 6
{const x=bx+3.5*cs,y=by+.5*cs-cs*.45,s=cs*.55,d=1;X.save();X.globalCompositeOperation='lighter';const q=X.createRadialGradient(x-s*.35,y+s*.25,1,x-s*.35,y+s*.25,s*1.4);q.addColorStop(0,'rgba(255,230,90,.9)');q.addColorStop(1,'rgba(0,0,0,0)');X.fillStyle=q;X.beginPath();X.arc(x-s*.35,y+s*.25,s*1.4,0,TAU);X.fill();X.restore();
X.save();X.translate(x,y);X.fillStyle='rgba(220,240,255,.6)';for(const[dx,rot]of[[-.15,-.9],[.1,-.5]]){X.save();X.translate(dx*s,-s*.25);X.rotate(rot);X.beginPath();X.ellipse(0,-s*.38,s*.24,s*.42,0,0,TAU);X.fill();X.restore();}
X.fillStyle='#ffe56b';X.beginPath();X.ellipse(-s*.38,s*.22,s*.36,s*.3,-.3,0,TAU);X.fill();X.fillStyle='#4b3a78';X.beginPath();X.ellipse(-s*.02,s*.08,s*.3,s*.26,0,0,TAU);X.fill();X.fillStyle='#5d4a94';X.beginPath();X.arc(s*.3,-s*.12,s*.36,0,TAU);X.fill();
X.strokeStyle='#4b3a78';X.lineWidth=s*.06;X.lineCap='round';for(const dx of[.2,.45]){X.beginPath();X.moveTo(dx*s,-s*.42);X.quadraticCurveTo((dx+.05)*s,-s*.75,(dx+.2)*s,-s*.8);X.stroke();X.fillStyle='#ffd21c';X.beginPath();X.arc((dx+.2)*s,-s*.8,s*.07,0,TAU);X.fill();}
for(const dx of[.2,.44]){X.fillStyle='#fff';X.beginPath();X.arc(dx*s,-s*.16,s*.11,0,TAU);X.fill();X.fillStyle='#1a1230';X.beginPath();X.arc(dx*s+s*.025,-s*.15,s*.06,0,TAU);X.fill();}
X.fillStyle='rgba(255,140,170,.7)';X.beginPath();X.arc(s*.1,s*.02,s*.06,0,TAU);X.arc(s*.56,s*.02,s*.06,0,TAU);X.fill();X.strokeStyle='#1a1230';X.lineWidth=s*.04;X.beginPath();X.arc(s*.33,0,s*.08,.2,Math.PI-.2);X.stroke();X.restore();}
if(TEXT){X.textAlign='left';X.font='700 78px F';X.fillStyle='#FFD21C';X.shadowColor='rgba(255,210,28,.6)';X.shadowBlur=24;X.fillText('Leuchtpfad',W*.56,H*.42);X.shadowBlur=0;
X.font='700 38px F';X.fillStyle='#fff';X.fillText('Merk dir Lumis Weg!',W*.56,H*.53);X.font='700 28px F';X.fillStyle='#ffe9a8';X.fillText('Merkspiel für Kinder ab 4',W*.56,H*.62);
X.fillStyle='#FFD21C';X.beginPath();X.roundRect(W*.56,H*.7,190,52,14);X.fill();X.fillStyle='#11121A';X.font='700 26px F';X.fillText('PLAYSAAL',W*.56+30,H*.7+36);}
window.fertig=true;});
</script></body></html>`;

const dir = mkdtempSync(join(tmpdir(), 'lp-cover-'));
let browser; try { browser = await pw.chromium.launch(); } catch (e) {
  const fs = await import('node:fs'); const pd = '/opt/pw-browsers';
  const exe = fs.readdirSync(pd).filter((d) => d.startsWith('chromium-')).map((d) => join(pd, d, 'chrome-linux/chrome')).find(fs.existsSync);
  browser = await pw.chromium.launch({ executablePath: exe });
}
for (const [w, h, text, out] of [[720, 720, false, 'k.png'], [1200, 630, true, 's.png']]) {
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  await p.setContent(szene(w, h, text)); await p.waitForFunction(() => window.fertig);
  await p.locator('#c').screenshot({ path: join(dir, out) });
  await p.close();
}
await browser.close();
py(`from PIL import Image
r = ${JSON.stringify(root + '/')}; d = ${JSON.stringify(dir + '/')}
Image.open(d + 'k.png').convert('RGB').save(r + 'public/bilder/leuchtpfad.webp', 'WEBP', quality=82, method=6)
Image.open(d + 's.png').convert('RGB').save(r + 'public/bilder/leuchtpfad-og.jpg', 'JPEG', quality=86, optimize=True, progressive=True)
`);
console.log('Leuchtpfad: gezeichnete Kachel und Teilen-Vorschau (bis die ChatGPT-Bilder da sind)');
