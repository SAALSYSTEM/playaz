import {drawAwardIcon} from '../zahlensturm/awards.js';
export function shareText(s){return `Mein Supermarkt hat ${s.stats.customers.toLocaleString('de-DE')} Kunden bedient und ${s.stats.orders.toLocaleString('de-DE')} Pakete verschickt! Schaffst du mehr?`;}
export function shareURL(base,s){const u=new URL(base);u.searchParams.set('kunden',String(s.stats.customers));return u.href;}
export function challengeFrom(url){const n=Number(new URL(url).searchParams.get('kunden'));return Number.isSafeInteger(n)&&n>0&&n<=100000000?n:null;}
export function drawShare(canvas,s){
  canvas.width=1200;canvas.height=630;const c=canvas.getContext('2d');
  const g=c.createLinearGradient(0,0,1200,630);g.addColorStop(0,'#173e36');g.addColorStop(1,'#37775b');c.fillStyle=g;c.fillRect(0,0,1200,630);
  c.fillStyle='#ffffff08';for(let i=0;i<9;i++){c.beginPath();c.arc(1040,330,80+i*60,0,Math.PI*2);c.strokeStyle='#ffffff08';c.lineWidth=20;c.stroke();}
  c.fillStyle='#ffdf62';c.font='700 23px Barlow, sans-serif';c.fillText('PLAYSAAL  /  MEIN LADEN. MEIN IMPERIUM.',64,76);
  c.fillStyle='#fff9e4';c.font='700 66px Fredoka, sans-serif';c.fillText('MySupermarkt',64,167);
  c.font='700 125px Barlow Condensed, sans-serif';c.fillText(s.stats.customers.toLocaleString('de-DE'),64,325);
  c.fillStyle='#b7d4bb';c.font='500 30px Barlow, sans-serif';c.fillText('KUNDEN BEDIENT',67,374);
  c.fillStyle='#fff3be';c.font='600 27px Barlow, sans-serif';c.fillText(`${s.stats.orders} Pakete  ·  ${s.milestone}/20 Meilensteine`,66,431);
  drawAwardIcon(c,{rarity:4,metal:'gold',glyph:'krone'},970,290,250,false);
  c.fillStyle='#ffd21c';c.fillRect(0,503,1200,127);c.fillStyle='#173e36';c.font='700 40px Barlow, sans-serif';c.fillText('Schaffst du mehr?',64,560);c.font='600 25px Barlow, sans-serif';c.fillText('playsaal.com/spiele/mysupermarkt',64,600);
  return canvas;
}
