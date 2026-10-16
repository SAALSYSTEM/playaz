import {WIDTH,HEIGHT,ROW_WIDTHS,MASK,SHAPES,NAMES,CORE,createGame,move,rotate,tick,hardDrop,routeCore,gravityMs,level,challengeCores,challengeText,fits} from './engine.js';

const $=id=>document.getElementById(id),board=$('board'),ctx=board.getContext('2d'),preview=$('preview'),pc=preview.getContext('2d');
const CELL=32,OX=27,colors=['','#55D7DF','#FF9B32','#C485EF','#ED758B','#FFD21C'];
let game=createGame(),playing=false,finished=false,muted=false,last=0,elapsed=0,tone=null,routeAnimation=null,best={cores:0,score:0};
const target=challengeCores(location.search);
try{const saved=JSON.parse(localStorage.getItem('sanduhrblock.v1')||'{}');best.cores=Math.max(0,Number(saved.cores)||0);best.score=Math.max(0,Number(saved.score)||0);muted=localStorage.getItem('sanduhrblock.muted')==='1';}catch{}
$('best').textContent=best.cores.toLocaleString('de-DE');$('sound').textContent=muted?'♩':'♪';$('sound').setAttribute('aria-label',muted?'Ton einschalten':'Ton ausschalten');
if(target!==null){$('challenge').hidden=false;$('challenge').innerHTML=`Schaffst du mehr als <strong>${target.toLocaleString('de-DE')}</strong> ${target===1?'Kern':'Kerne'}?`;}

function sound(freq=480,duration=.055,volume=.055){
  if(muted)return;
  try{tone??=new(window.AudioContext||window.webkitAudioContext)();const osc=tone.createOscillator(),gain=tone.createGain(),t=tone.currentTime;osc.type='sine';osc.frequency.setValueAtTime(freq,t);gain.gain.setValueAtTime(volume,t);gain.gain.exponentialRampToValueAtTime(.001,t+duration);osc.connect(gain).connect(tone.destination);osc.start(t);osc.stop(t+duration);}catch{}
}
function railX(side,y){
  const row=Math.max(0,Math.min(HEIGHT-1,Math.floor(y/CELL))),width=ROW_WIDTHS[row],start=(WIDTH-width)/2;
  return side==='left'?OX+start*CELL-13:OX+(start+width)*CELL+13;
}
function roundRect(c,x,y,w,h,r){
  c.beginPath();c.roundRect(x,y,w,h,r);c.fill();
}
function gem(c,x,y,value,size=CELL,alpha=1){
  const pad=Math.max(1.5,size*.07),r=Math.max(3,size*.16);c.save();c.globalAlpha=alpha;c.fillStyle=colors[value]||colors[1];roundRect(c,x+pad,y+pad,size-pad*2,size-pad*2,r);
  c.beginPath();c.moveTo(x+pad*2,y+pad*2);c.lineTo(x+size-pad*2,y+pad*2);c.lineTo(x+size/2,y+size/2);c.closePath();c.fillStyle='#ffffff42';c.fill();
  c.beginPath();c.moveTo(x+pad*2,y+size-pad*2);c.lineTo(x+size-pad*2,y+size-pad*2);c.lineTo(x+size/2,y+size/2);c.closePath();c.fillStyle='#00000024';c.fill();
  c.strokeStyle='#ffffff35';c.lineWidth=1;c.strokeRect(x+pad+.5,y+pad+.5,size-pad*2-1,size-pad*2-1);c.restore();
}
function drawRails(){
  for(const side of ['left','right']){
    ctx.beginPath();for(let row=0;row<HEIGHT;row++){const y=row*CELL+CELL/2,x=railX(side,y);if(row===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.strokeStyle=side==='left'?'#55d7df42':'#c485ef42';ctx.lineWidth=7;ctx.stroke();ctx.strokeStyle=side==='left'?'#55D7DF':'#C485EF';ctx.lineWidth=2;ctx.stroke();
  }
}
function drawBoard(){
  ctx.clearRect(0,0,board.width,board.height);ctx.fillStyle='#0b0d14';ctx.fillRect(0,0,board.width,board.height);drawRails();
  for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++)if(MASK[y][x]){
    const px=OX+x*CELL,py=y*CELL;ctx.fillStyle=(x+y)%2?'#151925':'#121621';ctx.fillRect(px+1,py+1,CELL-2,CELL-2);
    ctx.beginPath();ctx.moveTo(px+1,py+1);ctx.lineTo(px+CELL-1,py+CELL-1);ctx.strokeStyle='#ffffff0c';ctx.lineWidth=1;ctx.stroke();
    ctx.strokeStyle='#ffffff0c';ctx.strokeRect(px+.5,py+.5,CELL-1,CELL-1);
  }
  ctx.beginPath();for(let y=0;y<HEIGHT;y++){const start=(WIDTH-ROW_WIDTHS[y])/2,x=OX+start*CELL,py=y*CELL+CELL/2;if(y===0)ctx.moveTo(x,py);else ctx.lineTo(x,py);}for(let y=HEIGHT-1;y>=0;y--){const start=(WIDTH-ROW_WIDTHS[y])/2,x=OX+(start+ROW_WIDTHS[y])*CELL,py=y*CELL+CELL/2;ctx.lineTo(x,py);}ctx.closePath();ctx.strokeStyle='#ffd21c66';ctx.lineWidth=2;ctx.stroke();
  game.board.forEach((row,y)=>row.forEach((value,x)=>{if(value)gem(ctx,OX+x*CELL,y*CELL,value);}));
  if(game.current&&!game.over)for(const [x,y] of game.current.cells){const py=game.current.y+y;if(py>=0)gem(ctx,OX+(game.current.x+x)*CELL,py*CELL,game.current.type+1);}
  if(routeAnimation){
    const now=performance.now(),p=Math.min(1,(now-routeAnimation.start)/560),y=(HEIGHT-.5-(HEIGHT-1)*p)*CELL,x=railX(routeAnimation.side,y);ctx.save();ctx.shadowColor='#FFD21C';ctx.shadowBlur=18;gem(ctx,x-11,y-11,5,22);ctx.restore();
  }
  // Engpass markieren
  ctx.fillStyle='#FFD21C';ctx.fillRect(OX+3*CELL,8*CELL-2,3*CELL,3);ctx.font='700 10px Barlow, sans-serif';ctx.textAlign='center';ctx.fillText('ENGPASS',board.width/2,8*CELL-7);
}
function drawPreview(){
  pc.clearRect(0,0,preview.width,preview.height);const type=game.queue[0];if(type===undefined)return;const cells=SHAPES[type],maxX=Math.max(...cells.map(c=>c[0])),maxY=Math.max(...cells.map(c=>c[1])),size=15,ox=(preview.width-(maxX+1)*size)/2,oy=(preview.height-(maxY+1)*size)/2;
  for(const [x,y] of cells)gem(pc,ox+x*size,oy+y*size,type+1,size);preview.setAttribute('aria-label','Nächste Form: '+NAMES[type]);
}
function syncRoute(){
  const choose=game.routeNeeded&&!routeAnimation&&!game.over;$('route').hidden=!choose;
  for(const button of document.querySelectorAll('.control'))button.disabled=choose&&!['left','right'].includes(button.dataset.action);
}
function draw(){
  drawBoard();drawPreview();$('cores').textContent=game.cores.toLocaleString('de-DE');$('score').textContent=game.score.toLocaleString('de-DE');$('level').textContent=String(level(game));$('best').textContent=Math.max(game.cores,best.cores).toLocaleString('de-DE');syncRoute();
}
function show(title,intro,button){$('title').textContent=title;$('intro').textContent=intro;$('start').textContent=button;$('rules').hidden=true;$('overlay').hidden=false;draw();}
function finish(){
  if(finished)return;finished=true;playing=false;routeAnimation=null;best.cores=Math.max(best.cores,game.cores);best.score=Math.max(best.score,game.score);try{localStorage.setItem('sanduhrblock.v1',JSON.stringify(best));}catch{}
  $('result').hidden=false;$('result').innerHTML=`<strong>${game.cores.toLocaleString('de-DE')} ${game.cores===1?'Kern':'Kerne'}</strong> · ${game.score.toLocaleString('de-DE')} Punkte`;$('share').hidden=false;$('message').hidden=true;
  const verdict=target===null?'Fordere deine Freunde heraus!':game.cores>target?'Du hast die Herausforderung geschlagen!':`Das Ziel waren mehr als ${target} ${target===1?'Kern':'Kerne'}.`;
  show('Spiel vorbei',verdict,'Nochmal spielen');sound(210,.18,.07);
}
function start(){game=createGame();playing=true;finished=false;routeAnimation=null;elapsed=0;last=performance.now();$('overlay').hidden=true;$('rules').hidden=false;$('result').hidden=true;$('share').hidden=true;$('message').hidden=true;sound(520,.045);draw();}
function pause(){if(!playing)return;playing=false;show('Pause','Dein Kern bleibt im Magnetfeld.','Weiter spielen');}
function resume(){if(game.over){start();return;}playing=true;last=performance.now();$('overlay').hidden=true;syncRoute();}
function chooseRail(side){
  if(!playing||!game.routeNeeded||routeAnimation)return;routeAnimation={side,start:performance.now()};$('route').hidden=true;sound(side==='left'?380:540,.12,.06);draw();
}
function action(name){
  if(!playing)return;if(game.routeNeeded){if(name==='left'||name==='right')chooseRail(name);return;}
  let changed=false,cleared=0;if(name==='left')changed=move(game,-1,0);if(name==='right')changed=move(game,1,0);if(name==='rotate')changed=rotate(game);if(name==='down'){changed=move(game,0,1);if(changed)game.score++;else{cleared=tick(game);changed=true;}}if(name==='drop'){cleared=hardDrop(game);changed=true;elapsed=0;}
  if(changed)sound(cleared?720:name==='drop'?190:420,cleared?.13:.035,cleared?.07:.04);draw();if(game.over)finish();
}
function frame(now){
  if(playing){
    if(routeAnimation&&now-routeAnimation.start>=560){const side=routeAnimation.side;routeAnimation=null;routeCore(game,side);elapsed=0;sound(760,.08,.05);if(game.over)finish();}
    if(!routeAnimation&&!game.routeNeeded&&!game.over){elapsed+=Math.min(100,Math.max(0,now-last));let interval=gravityMs(game),steps=0;while(elapsed>=interval&&steps++<2&&!game.over&&!game.routeNeeded){elapsed-=interval;const cleared=tick(game);if(cleared)sound(720,.13,.07);interval=gravityMs(game);}}
    draw();if(game.over)finish();
  }
  last=now;requestAnimationFrame(frame);
}
requestAnimationFrame(frame);draw();
$('start').addEventListener('click',()=>{if(game.over||finished||$('start').textContent!=='Weiter spielen')start();else resume();});
$('pause').addEventListener('click',()=>{if(playing)pause();else if(!$('overlay').hidden&&!game.over)resume();});$('restart').addEventListener('click',start);
$('sound').addEventListener('click',()=>{muted=!muted;$('sound').textContent=muted?'♩':'♪';$('sound').setAttribute('aria-label',muted?'Ton einschalten':'Ton ausschalten');try{localStorage.setItem('sanduhrblock.muted',muted?'1':'0');}catch{}});
for(const button of document.querySelectorAll('[data-rail]'))button.addEventListener('click',()=>chooseRail(button.dataset.rail));
let repeat=null;function stopRepeat(){clearTimeout(repeat);clearInterval(repeat);repeat=null;}
for(const button of document.querySelectorAll('[data-action]')){const name=button.dataset.action;button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);stopRepeat();action(name);if(name==='left'||name==='right'||name==='down')repeat=setTimeout(()=>{action(name);repeat=setInterval(()=>action(name),90);},250);});button.addEventListener('pointerup',stopRepeat);button.addEventListener('pointercancel',stopRepeat);button.addEventListener('lostpointercapture',stopRepeat);}
document.addEventListener('keydown',e=>{const name={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'rotate',ArrowDown:'down',' ':'drop'}[e.key];if(name){e.preventDefault();if(!e.repeat||['left','right','down'].includes(name))action(name);}else if(e.key.toLowerCase()==='p'||e.key==='Escape'){e.preventDefault();if(playing)pause();else if(!$('overlay').hidden&&!game.over)resume();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
$('share').addEventListener('click',async()=>{const url=new URL(document.querySelector('link[rel="canonical"]').href);url.searchParams.set('c',String(game.cores));const text=challengeText(game.cores,url.href);if(navigator.share){try{await navigator.share({text});$('message').textContent='Herausforderung geteilt.';$('message').hidden=false;return;}catch(e){if(e?.name==='AbortError')return;}}try{await navigator.clipboard.writeText(text);}catch{const input=document.createElement('textarea');input.value=text;input.style.position='fixed';input.style.opacity='0';document.body.append(input);input.select();const ok=document.execCommand('copy');input.remove();if(!ok){$('message').textContent=text;$('message').hidden=false;return;}}$('message').textContent='Text und Link kopiert.';$('message').hidden=false;});
