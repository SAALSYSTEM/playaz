import {WIDTH,HEIGHT,SHAPES,createGame,move,rotate,tick,hardDrop,gravityMs,challengeLines,challengeText,fits} from './engine.js';

const $ = id => document.getElementById(id);
const board=$('board'), ctx=board.getContext('2d'), preview=$('preview'), pc=preview.getContext('2d');
const colors=['','#47C9EF','#6688F4','#FFAF56','#FFD21C','#72D895','#C485EF','#ED758B'];
const shapes=['I','J','L','O','S','T','Z'];
let game=createGame(), playing=false, muted=false, ghostEnabled=false, last=0, elapsed=0, tone=null, best={score:0,lines:0};
const target=challengeLines(location.search);
try { const saved=JSON.parse(localStorage.getItem('blocksaal.v1')||'{}'); best.score=Math.max(0,Number(saved.score)||0); best.lines=Math.max(0,Number(saved.lines)||0); muted=localStorage.getItem('blocksaal.muted')==='1'; ghostEnabled=localStorage.getItem('blocksaal.ghost')==='1'; } catch {}
$('best').textContent=best.score.toLocaleString('de-DE');
$('sound').textContent=muted?'♩':'♪'; $('sound').setAttribute('aria-label',muted?'Ton einschalten':'Ton ausschalten');
function updateGhostButton(){ $('ghost-state').textContent=ghostEnabled?'An':'Aus'; $('ghost').setAttribute('aria-pressed',String(ghostEnabled)); $('ghost').setAttribute('aria-label',ghostEnabled?'Schatten ausschalten':'Schatten einschalten'); }
updateGhostButton();
if(target!==null){$('challenge').hidden=false;$('challenge').innerHTML=`Schaffst du mehr als <strong>${target.toLocaleString('de-DE')}</strong> ${target===1?'Reihe':'Reihen'}?`;}

function sound(freq=500,duration=.055){
  if(muted) return;
  try { tone ??= new (window.AudioContext||window.webkitAudioContext)(); const osc=tone.createOscillator(), gain=tone.createGain(), t=tone.currentTime;
    osc.type='sine'; osc.frequency.setValueAtTime(freq,t); gain.gain.setValueAtTime(.06,t); gain.gain.exponentialRampToValueAtTime(.001,t+duration);
    osc.connect(gain).connect(tone.destination); osc.start(t); osc.stop(t+duration); } catch {}
}
function cell(c,x,y,v,alpha=1,size=30){
  if(y<0) return; c.globalAlpha=alpha;
  c.fillStyle=colors[v]; c.fillRect(x*size+1,y*size+1,size-2,size-2);
  c.fillStyle='#ffffff55';c.fillRect(x*size+3,y*size+3,size-6,3);
  c.fillStyle='#00000033';c.fillRect(x*size+3,y*size+size-6,size-6,3);
  c.globalAlpha=1;
}
function draw(){
  ctx.fillStyle='#0e1018';ctx.fillRect(0,0,300,600);
  ctx.strokeStyle='#ffffff0a';ctx.beginPath();for(let i=1;i<WIDTH;i++){ctx.moveTo(i*30+.5,0);ctx.lineTo(i*30+.5,600);}for(let i=1;i<HEIGHT;i++){ctx.moveTo(0,i*30+.5);ctx.lineTo(300,i*30+.5);}ctx.stroke();
  game.board.forEach((row,y)=>row.forEach((v,x)=>{if(v)cell(ctx,x,y,v)}));
  if(!game.over){const p=game.current;
    if(ghostEnabled){let ghost=p.y;while(fits(game,p,p.x,ghost+1))ghost++;
      p.cells.forEach(([x,y])=>cell(ctx,p.x+x,ghost+y,p.type+1,.22));}
    p.cells.forEach(([x,y])=>cell(ctx,p.x+x,p.y+y,p.type+1));
  }
  pc.clearRect(0,0,84,66);const next=game.queue[0];
  if(next!==undefined) SHAPES[next].forEach(([x,y])=>cell(pc,x+.4,y+.15,next+1,1,18));
  $('score').textContent=game.score.toLocaleString('de-DE');$('lines').textContent=game.lines.toLocaleString('de-DE');
  $('level').textContent=String(1+Math.floor(game.lines/10));$('best').textContent=Math.max(game.score,best.score).toLocaleString('de-DE');
  preview.setAttribute('aria-label','Nächster Block: '+(shapes[next]||''));
}
function show(title,intro,button){
  $('title').textContent=title;$('intro').textContent=intro;$('start').textContent=button;
  $('overlay').hidden=false;draw();
}
function finish(){
  playing=false;
  best.score=Math.max(best.score,game.score);best.lines=Math.max(best.lines,game.lines);
  try {localStorage.setItem('blocksaal.v1',JSON.stringify(best));} catch {}
  $('result').hidden=false;
  $('result').innerHTML=`<strong>${game.lines.toLocaleString('de-DE')} ${game.lines===1?'Reihe':'Reihen'}</strong> · ${game.score.toLocaleString('de-DE')} Punkte`;
  $('share').hidden=false;$('message').hidden=true;
  const verdict=target===null?'Fordere deine Freunde heraus!':game.lines>target?'Du hast die Herausforderung geschlagen!':`Das Ziel waren mehr als ${target} ${target===1?'Reihe':'Reihen'}.`;
  show('Spiel vorbei',verdict,'Nochmal spielen');sound(230,.14);
}
function start(){game=createGame();playing=true;elapsed=0;last=performance.now();$('overlay').hidden=true;$('result').hidden=true;$('share').hidden=true;$('message').hidden=true;draw();}
function pause(){if(!playing)return;playing=false;show('Pause','Dein Spiel wartet auf dich.','Weiter spielen');}
function resume(){if(game.over){start();return;}playing=true;last=performance.now();$('overlay').hidden=true;}
function action(name){
  if(!playing)return;
  let changed=false,cleared=0;
  if(name==='left')changed=move(game,-1,0);
  if(name==='right')changed=move(game,1,0);
  if(name==='rotate')changed=rotate(game);
  if(name==='down'){changed=move(game,0,1);if(changed)game.score++;else {cleared=tick(game);changed=true;}}
  if(name==='drop'){cleared=hardDrop(game);changed=true;elapsed=0;}
  if(changed)sound(cleared?660:name==='drop'?190:400,cleared?.11:.035);
  draw();if(game.over)finish();
}
function frame(now){
  if(playing){elapsed+=Math.min(100,Math.max(0,now-last));let interval=gravityMs(game);let steps=0;
    while(elapsed>=interval && steps++<2 && !game.over){elapsed-=interval;const cleared=tick(game);if(cleared)sound(660,.11);interval=gravityMs(game);}
    draw();if(game.over)finish();
  }
  last=now;requestAnimationFrame(frame);
}
requestAnimationFrame(frame);draw();
$('start').addEventListener('click',()=>{if(game.over || $('start').textContent!=='Weiter spielen')start();else resume();});
$('pause').addEventListener('click',()=>{if(playing)pause();else if(!$('overlay').hidden&&!game.over)resume();});
$('restart').addEventListener('click',start);
$('sound').addEventListener('click',()=>{muted=!muted;$('sound').textContent=muted?'♩':'♪';$('sound').setAttribute('aria-label',muted?'Ton einschalten':'Ton ausschalten');try{localStorage.setItem('blocksaal.muted',muted?'1':'0');}catch{}});
$('ghost').addEventListener('click',()=>{ghostEnabled=!ghostEnabled;updateGhostButton();try{localStorage.setItem('blocksaal.ghost',ghostEnabled?'1':'0');}catch{}draw();});
let repeat=null;function stopRepeat(){clearTimeout(repeat);clearInterval(repeat);repeat=null;}
for(const button of document.querySelectorAll('[data-action]')){
  const name=button.dataset.action;
  button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);stopRepeat();action(name);
    if(name==='left'||name==='right'||name==='down')repeat=setTimeout(()=>{action(name);repeat=setInterval(()=>action(name),90);},250);
  });
  button.addEventListener('pointerup',stopRepeat);button.addEventListener('pointercancel',stopRepeat);button.addEventListener('lostpointercapture',stopRepeat);
}
document.addEventListener('keydown',e=>{
  const name={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'rotate',ArrowDown:'down',' ':'drop'}[e.key];
  if(name){e.preventDefault();if(!e.repeat || ['left','right','down'].includes(name))action(name);}
  else if(e.key.toLowerCase()==='p'||e.key==='Escape'){e.preventDefault();if(playing)pause();else if(!$('overlay').hidden&&!game.over)resume();}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
$('share').addEventListener('click',async()=>{
  const url=new URL(document.querySelector('link[rel="canonical"]').href);url.searchParams.set('c',String(game.lines));
  const text=challengeText(game.lines,url.href);
  if(navigator.share){try{await navigator.share({text});$('message').textContent='Herausforderung geteilt.';$('message').hidden=false;return;}catch(e){if(e?.name==='AbortError')return;}}
  try{await navigator.clipboard.writeText(text);}catch{
    const input=document.createElement('textarea');input.value=text;input.style.position='fixed';input.style.opacity='0';document.body.append(input);input.select();
    const ok=document.execCommand('copy');input.remove();if(!ok){$('message').textContent=text;$('message').hidden=false;return;}
  }
  $('message').textContent='Text und Link kopiert.';$('message').hidden=false;
});
