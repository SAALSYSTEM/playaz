import {WIDTH,HEIGHT,LEVEL_COUNT,TILE,createGame,move,tick,progress,freshSave,sanitizeSave,recordWin,starsFor} from './engine.js';
const $=s=>document.querySelector(s),canvas=$('#board'),ctx=canvas.getContext('2d'),CELL=40;
const KEY='kristallrausch.v1';
let save=freshSave();
try{save=sanitizeSave(JSON.parse(localStorage.getItem(KEY)));}catch{}
let g=createGame(1),running=false,sound=false,audio=null,mode='intro',lastMove=0,gesture=null,holdTimer=null;
let toast='Sammle Kristalle!',toastUntil=0;
const notify=(s)=>{toast=s;toastUntil=performance.now()+1700;$('#notice').textContent=s;};
function persist(){try{localStorage.setItem(KEY,JSON.stringify(save));}catch{}}
function beep(kind){
  if(!sound)return;
  try{
    audio ||= new (window.AudioContext||window.webkitAudioContext)();
    if(audio.state==='suspended')audio.resume();
    const now=audio.currentTime,o=audio.createOscillator(),v=audio.createGain();
    const data=kind==='gem'?[720,1020,.15]:kind==='won'?[440,880,.35]:kind==='dead'?[260,90,.4]:kind==='dig'?[140,100,.045]:[260,180,.08];
    o.type=kind==='gem'?'sine':'triangle';o.frequency.setValueAtTime(data[0],now);o.frequency.exponentialRampToValueAtTime(data[1],now+data[2]);
    v.gain.setValueAtTime(.055,now);v.gain.exponentialRampToValueAtTime(.001,now+data[2]);
    o.connect(v);v.connect(audio.destination);o.start(now);o.stop(now+data[2]+.01);
  }catch{}
}
function sync(){
  $('#level').textContent=g.number+' / '+LEVEL_COUNT;
  $('#gems').textContent=g.collected+' / '+g.needed;
  $('#time').textContent=Math.ceil(g.timeLeft)+' s';
  $('#score').textContent=g.score.toLocaleString('de-DE');
  $('#progress').style.width=(progress(g)*100)+'%';
  if(performance.now()>toastUntil)$('#notice').textContent=g.collected>=g.needed?'Der Ausgang ist offen!':'Sammle Kristalle!';
}
function selectOptions(){
  const chooser=$('#chooseLevel');chooser.textContent='';
  for(let i=1;i<=save.unlocked;i++){
    const opt=document.createElement('option'),stars=save.levels[i]?.stars||0;
    opt.value=String(i);opt.textContent='Höhle '+i+(stars?' · '+'★'.repeat(stars):'');
    chooser.appendChild(opt);
  }
  chooser.value=String(Math.min(g.number,save.unlocked));
}
function hideOverlay(){$('#overlay').hidden=true;mode='playing';running=true;sync();}
function showOverlay(kind){
  stopHold();running=false;mode=kind;$('#overlay').hidden=false;
  const title=$('#dialogTitle'),kicker=$('#dialogKicker'),description=$('#dialogText'),primary=$('#primary'),secondary=$('#secondary'),choose=$('#choose');
  secondary.hidden=true;choose.hidden=true;
  if(kind==='intro'){
    kicker.textContent='20 Höhlen voller Schätze';title.innerHTML='Kristall<b>rausch</b>';
    description.textContent='Grabe durch die Erde, sammle Kristalle und weiche fallenden Felsen aus. Der Ausgang öffnet sich, sobald du genug Kristalle hast.';
    choose.hidden=false;selectOptions();
    primary.textContent='Abenteuer starten';primary.onclick=()=>start(Number($('#chooseLevel').value)||1);
  } else if(kind==='pause'){
    kicker.textContent='Kurze Pause';title.textContent='Verschnaufpause';
    description.textContent='Die Zeit und alle Felsen stehen still. Dein aktueller Versuch bleibt erhalten.';
    primary.textContent='Weiterspielen';primary.onclick=hideOverlay;
    secondary.hidden=false;secondary.textContent='Höhle neu starten';secondary.onclick=()=>start(g.number);
  } else if(kind==='won'){
    kicker.textContent='Höhle geschafft!';title.textContent='Kristall-Profi! 💎';
    const stars=starsFor(g);
    description.textContent='★'.repeat(stars)+'☆'.repeat(3-stars)+' · '+g.collected+' Kristalle · '+g.score.toLocaleString('de-DE')+' Punkte · '+Math.ceil(g.timeLeft)+' Sekunden übrig';
    if(g.number<LEVEL_COUNT){primary.textContent='Nächste Höhle →';primary.onclick=()=>start(g.number+1);}
    else {primary.textContent='Alle 20 Höhlen gemeistert!';primary.onclick=()=>showOverlay('intro');}
    secondary.hidden=false;secondary.textContent='Höhle wiederholen';secondary.onclick=()=>start(g.number);
  } else if(kind==='dead'){
    kicker.textContent='Das war knapp!';title.textContent='Noch ein Versuch?';
    description.textContent=g.lastEvent==='time'?'Die Zeit ist um. Such dir einen schnelleren Weg durch die Höhle.':'Ein Fels hat dich erwischt. Achte auf freigegrabene Felder direkt unter den Steinen.';
    primary.textContent='Noch mal versuchen';primary.onclick=()=>start(g.number);
    secondary.hidden=false;secondary.textContent='Andere Höhle wählen';secondary.onclick=()=>showOverlay('intro');
    beep('dead');
  }
}
function start(level){try{localStorage.setItem('playsaal.zuletzt',JSON.stringify({s:'kristallrausch'}));}catch{}g=createGame(level);toastUntil=0;notify('Viel Erfolg in Höhle '+level+'!');hideOverlay();}
function act(dx,dy){
  if(!running||g.status!=='playing')return;
  const now=performance.now();if(now-lastMove<83)return;lastMove=now;
  const old=g.lastEvent,changed=move(g,dx,dy);
  if(changed){
    if(g.lastEvent==='gem'){beep('gem');notify(g.collected>=g.needed?'Alle nötigen Kristalle! Zum Ausgang!':'Kristall gefunden!');}
    else if(g.lastEvent==='push')beep('push');
    else if(g.lastEvent==='dig')beep('dig');
    if(g.status==='won'){beep('won');save=recordWin(save,g);persist();showOverlay('won');}
  }else if(g.lastEvent==='locked'&&old!=='locked')notify('Dir fehlen noch Kristalle!');
  sync();
}
function stopHold(){if(holdTimer){clearInterval(holdTimer);holdTimer=null;}document.querySelectorAll('.pad button').forEach(b=>b.classList.remove('pressed'));}
document.querySelectorAll('.pad button').forEach(btn=>{
  const dx=Number(btn.dataset.dx),dy=Number(btn.dataset.dy);
  btn.addEventListener('pointerdown',e=>{e.preventDefault();stopHold();btn.classList.add('pressed');lastMove=0;act(dx,dy);holdTimer=setInterval(()=>act(dx,dy),145);try{btn.setPointerCapture(e.pointerId);}catch{}});
  btn.addEventListener('pointerup',stopHold);
  btn.addEventListener('pointercancel',stopHold);
  btn.addEventListener('lostpointercapture',stopHold);
});
window.addEventListener('blur',stopHold);
const directions={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1],a:[-1,0],d:[1,0],w:[0,-1],s:[0,1]};
document.addEventListener('keydown',e=>{
  if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName))return;
  const v=directions[e.key]||directions[e.key.toLowerCase?.()];
  if(v){e.preventDefault();if(running)act(...v);return;}
  if(e.key==='Escape'||e.key.toLowerCase()==='p'){e.preventDefault();if(running)showOverlay('pause');else if(mode==='pause')hideOverlay();}
});
canvas.addEventListener('pointerdown',e=>{if(!running)return;gesture={x:e.clientX,y:e.clientY};try{canvas.setPointerCapture(e.pointerId);}catch{}});
canvas.addEventListener('pointermove',e=>{
  if(!gesture||!running)return;
  const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y,threshold=21;
  if(Math.max(Math.abs(dx),Math.abs(dy))<threshold)return;
  if(Math.abs(dx)>Math.abs(dy))act(dx>0?1:-1,0);else act(0,dy>0?1:-1);
  gesture={x:e.clientX,y:e.clientY};
});
canvas.addEventListener('pointerup',e=>{
  if(!gesture)return;
  const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;
  if(Math.max(Math.abs(dx),Math.abs(dy))>18){if(Math.abs(dx)>Math.abs(dy))act(dx>0?1:-1,0);else act(0,dy>0?1:-1);}
  gesture=null;
});
canvas.addEventListener('pointercancel',()=>gesture=null);
$('#pause').onclick=()=>running?showOverlay('pause'):mode==='pause'?hideOverlay():showOverlay('intro');
$('#restart').onclick=()=>start(g.number);
$('#sound').onclick=()=>{
  sound=!sound;$('#sound').textContent=sound?'♫':'♪̸';$('#sound').setAttribute('aria-label',sound?'Ton ausschalten':'Ton einschalten');
  if(sound)beep('gem');
};
document.addEventListener('visibilitychange',()=>{if(document.hidden&&running)showOverlay('pause');});
setInterval(()=>{
  if(!running)return;
  tick(g,.2);sync();
  if(g.status==='dead')showOverlay('dead');
},200);
const rnd=(x,y,n=0)=>{let s=(Math.imul(x+7,73856093)^Math.imul(y+9,19349663)^Math.imul(n+11,83492791))>>>0;return (s%1000)/1000;};
function rounded(x,y,w,h,r,color){
  ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();
}
function gem(x,y,t){
  const pulse=1+Math.sin(t*3+x*.1+y*.2)*.045;
  ctx.save();ctx.translate(x+20,y+20);ctx.scale(pulse,pulse);
  ctx.shadowColor='#29f7fa';ctx.shadowBlur=14;
  ctx.fillStyle='#2cf0e7';ctx.beginPath();ctx.moveTo(0,-15);ctx.lineTo(13,-4);ctx.lineTo(9,11);ctx.lineTo(0,17);ctx.lineTo(-11,9);ctx.lineTo(-13,-4);ctx.closePath();ctx.fill();
  ctx.shadowBlur=0;ctx.fillStyle='#dcffff';ctx.beginPath();ctx.moveTo(0,-13);ctx.lineTo(8,-4);ctx.lineTo(0,2);ctx.lineTo(-10,-4);ctx.closePath();ctx.fill();
  ctx.fillStyle='#48a9d5';ctx.beginPath();ctx.moveTo(0,2);ctx.lineTo(9,11);ctx.lineTo(0,17);ctx.closePath();ctx.fill();
  ctx.restore();
}
function rock(x,y,r){
  ctx.save();ctx.translate(x+20,y+21);ctx.rotate((r-.5)*.35);
  ctx.shadowColor='#020a12';ctx.shadowBlur=5;ctx.shadowOffsetY=4;
  ctx.fillStyle='#334456';ctx.beginPath();ctx.moveTo(-16,-7);ctx.lineTo(-9,-15);ctx.lineTo(8,-17);ctx.lineTo(16,-8);ctx.lineTo(17,8);ctx.lineTo(7,16);ctx.lineTo(-10,15);ctx.lineTo(-18,5);ctx.closePath();ctx.fill();
  ctx.shadowBlur=0;ctx.shadowOffsetY=0;
  ctx.fillStyle='#758da0';ctx.beginPath();ctx.moveTo(-15,-7);ctx.lineTo(-9,-15);ctx.lineTo(8,-17);ctx.lineTo(2,-5);ctx.lineTo(-7,-1);ctx.closePath();ctx.fill();
  ctx.fillStyle='#202d3d';ctx.beginPath();ctx.moveTo(2,-5);ctx.lineTo(16,-8);ctx.lineTo(17,8);ctx.lineTo(7,16);ctx.closePath();ctx.fill();
  ctx.fillStyle='#a9b9c9';ctx.beginPath();ctx.ellipse(-6,-9,4,2.3,-.5,0,6.28);ctx.fill();ctx.restore();
}
function miner(t){
  const x=g.player.x*CELL,y=g.player.y*CELL;
  ctx.save();ctx.translate(x+20,y+21+Math.sin(t*7)*1.1);
  ctx.shadowColor='#f7d74b';ctx.shadowBlur=10;
  rounded(-12,-9,24,27,9,'#ed9a39');ctx.shadowBlur=0;
  rounded(-15,-15,30,24,11,'#ffe36f');rounded(-15,-8,30,6,2,'#d89b31');
  rounded(-9,-1,18,13,7,'#ffdeb0');
  ctx.fillStyle='#202a39';ctx.beginPath();ctx.arc(-4,5,2.4,0,Math.PI*2);ctx.arc(5,5,2.4,0,Math.PI*2);ctx.fill();
  rounded(-13,13,12,6,3,'#48566c');rounded(1,13,12,6,3,'#48566c');
  rounded(-5,-18,10,7,3,'#f5fbfb');ctx.fillStyle='#ffffff';ctx.beginPath();ctx.arc(0,-15,2.4,0,Math.PI*2);ctx.fill();
  ctx.restore();
}
function draw(timestamp){
  const t=timestamp*.001;
  ctx.clearRect(0,0,720,560);
  ctx.fillStyle='#0b1b28';ctx.fillRect(0,0,720,560);
  for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++){
    const px=x*CELL,py=y*CELL,v=g.grid[y][x],r=rnd(x,y);
    ctx.fillStyle=(x+y)%2?'#10202b':'#0d1b27';ctx.fillRect(px,py,40,40);
    if(v===TILE.WALL){
      rounded(px+1,py+1,38,38,5,'#263b47');
      ctx.fillStyle='#3b5360';ctx.fillRect(px+2,py+1,35,5);ctx.fillRect(px+2,py+7,5,26);
      rounded(px+9+(r*7),py+12,17,15,3,'#314857');
      ctx.fillStyle='#192b39';ctx.fillRect(px+5,py+35,30,3);
    }else if(v===TILE.DIRT){
      rounded(px+1,py+1,38,38,4,(x+y)%2?'#77513b':'#845b40');
      ctx.fillStyle='#a06a47';ctx.fillRect(px+3,py+2,34,4);
      ctx.fillStyle='#b58451';ctx.beginPath();ctx.arc(px+8+r*18,py+16,2,0,6.283);ctx.arc(px+22,py+31-r*7,3,0,6.283);ctx.fill();
      ctx.fillStyle='#5b3a31';ctx.fillRect(px+6,py+28,8,2);
    }else if(v===TILE.ROCK)rock(px,py,r);
    else if(v===TILE.GEM)gem(px,py,t);
    else if(v===TILE.EXIT){
      const opened=g.collected>=g.needed;
      ctx.shadowBlur=opened?17:0;ctx.shadowColor='#ffc834';
      rounded(px+4,py+3,32,36,12,opened?'#f6c64a':'#455264');ctx.shadowBlur=0;
      rounded(px+9,py+8,22,31,8,opened?'#523660':'#202b37');
      ctx.fillStyle=opened?'#f9e799':'#758393';ctx.fillRect(px+18,py+17,4,13);
      if(opened){ctx.fillStyle='#fdf6bd';ctx.fillRect(px+12,py+7,16,4);}
    }else{
      if(r>.8){ctx.fillStyle='#254257';ctx.fillRect(px+Math.floor(r*22),py+Math.floor(r*14)+8,2,2);}
    }
  }
  miner(t);
  if(g.collected>=g.needed&&g.status!=='dead'){
    const ex=g.exit.x*CELL+20,ey=g.exit.y*CELL+20;
    ctx.strokeStyle='#ffe56b';ctx.lineWidth=2+Math.sin(t*5);ctx.globalAlpha=.4+.3*Math.sin(t*3)**2;ctx.beginPath();ctx.arc(ex,ey,24+Math.sin(t*3)*2,0,6.283);ctx.stroke();ctx.globalAlpha=1;
  }
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
showOverlay('intro');
sync();
