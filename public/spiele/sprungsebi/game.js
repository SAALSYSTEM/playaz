import{LEVEL_COUNT,WORLD_NAMES,WORLD_COLORS,makeLevel,clamp,overlap,hitsUnderside,advanceWater,freshSave,sanitizeSave,totalStars,completedLevels,recordLevel,challengeText}from'./engine.js';
const $=s=>document.querySelector(s),canvas=$('#game'),ctx=canvas.getContext('2d'),STORE='sprungssebi.v1';
let save;try{save=sanitizeSave(JSON.parse(localStorage.getItem(STORE)))}catch(e){save=freshSave()}
const persist=()=>{try{localStorage.setItem(STORE,JSON.stringify(save))}catch(e){}};try{localStorage.setItem('playsaal.zuletzt',JSON.stringify({s:'sprungsebi',t:Date.now()}))}catch(e){}
let level,player,state='menu',cameraY=1800,waterY=3600,last=0,acc=0,started=0,elapsed=0,coins=0,stars=new Set(),keys={},particles=[],audio=null;
const touch=('ontouchstart'in window)||navigator.maxTouchPoints>0;document.body.classList.toggle('touch',touch);

function resize(){const r=canvas.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);canvas.width=Math.max(1,Math.round(r.width*d));canvas.height=Math.max(1,Math.round(r.height*d));}
addEventListener('resize',resize);resize();
function view(){const s=Math.min(canvas.width/900,canvas.height/1600);return{s,ox:(canvas.width-900*s)/2,oy:(canvas.height-1600*s)/2};}
function rr(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
function gradient(a,b,y0,y1){const g=ctx.createLinearGradient(0,y0,0,y1);g.addColorStop(0,a);g.addColorStop(1,b);return g;}
function tone(f=440,d=.08,type='sine',v=.035){if(save.muted)return;try{audio??=new AudioContext();if(audio.state==='suspended')audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.value=f;g.gain.setValueAtTime(v,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+d);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+d)}catch(e){}}
function puff(x,y,color='#fff',n=8){for(let i=0;i<n;i++)particles.push({x,y,vx:(Math.random()-.5)*250,vy:-80-Math.random()*180,t:.5+Math.random()*.35,r:5+Math.random()*8,color});}
function show(id){document.querySelectorAll('.screen').forEach(x=>x.hidden=true);if(id)$(id).hidden=false;$('#hud').hidden=state!=='play';$('#touch').hidden=state!=='play'||!touch;}

function menu(){keys={};if(!level)demo();state='menu';show('#menu');$('#progress').textContent=`${completedLevels(save)} / 30`;$('#starsTotal').textContent=`${totalStars(save)} / 90`;$('#continue').textContent=save.unlocked>1?`Weiter: Level ${save.unlocked}`:'Flucht starten';$('#mute').textContent=save.muted?'Ton: aus':'Ton: an';levels();draw();}
function demo(){level=makeLevel(1);player={x:410,y:level.spawn.y,w:62,h:82,vx:0,vy:0,dir:1,on:true,coyote:0,buffer:0,jet:0,inv:0};cameraY=level.height-1600;waterY=level.height-50;elapsed=0;}
function levels(){const g=$('#levelGrid');g.textContent='';for(let i=1;i<=LEVEL_COUNT;i++){const b=document.createElement('button'),r=save.levels[i];b.type='button';b.disabled=i>save.unlocked;b.innerHTML=`<b>${i}</b><span>${r?'★'.repeat(r.stars)+'☆'.repeat(3-r.stars):i<=save.unlocked?'☆☆☆':'●'}</span>`;b.title=i>save.unlocked?'Noch gesperrt':`${WORLD_NAMES[Math.floor((i-1)/5)]} – Level ${i}`;b.onclick=()=>start(i);g.append(b)}}
function start(n){keys={};level=makeLevel(n);coins=0;stars=new Set();particles=[];elapsed=0;started=performance.now();waterY=level.water.startY;player={x:level.spawn.x,y:level.spawn.y,w:62,h:82,vx:0,vy:0,dir:1,on:false,coyote:0,buffer:0,jet:0,inv:0};cameraY=level.height-1600;state='play';show();updateHud();history.replaceState(null,'','/spiele/sprungsebi');last=performance.now();acc=0;tone(392,.1,'triangle');requestAnimationFrame(loop)}
function fail(reason='Das Hochwasser war schneller.'){if(state!=='play')return;keys={};state='fail';save.bestHeight=Math.max(save.bestHeight,level.number-1);persist();$('#failReason').textContent=reason;$('#failFacts').innerHTML=`<span><b>Level ${level.number}</b>erreicht</span><span><b>${Math.max(0,Math.round((level.spawn.y-player.y)/10))} m</b>geklettert</span><span><b>${stars.size}/3</b>Sterne</span>`;show('#fail');tone(120,.35,'sawtooth');}
function complete(){if(state!=='play')return;keys={};state='complete';const time=(performance.now()-started)/1000;recordLevel(save,level.number,{stars:stars.size,coins,time});persist();$('#doneTitle').textContent=level.number===30?'Ganz oben angekommen!':`Level ${level.number} geschafft!`;$('#doneFacts').innerHTML=`<span><b>${stars.size}/3</b>Sterne</span><span><b>${coins}</b>Münzen</span><span><b>${time.toFixed(1)} s</b>Zeit</span>`;$('#next').hidden=level.number===30;show('#complete');tone(523,.1,'triangle');setTimeout(()=>tone(659,.15,'triangle'),100)}
function updateHud(){$('#levelNo').textContent=`${level.number}/30`;$('#height').textContent=`${Math.max(0,Math.round((level.spawn.y-player.y)/10))} m`;$('#coinCount').textContent=coins;$('#starCount').textContent=`${stars.size}/3`;const gap=clamp((waterY-(player.y+player.h))/650,0,1);$('#danger').style.transform=`scaleX(${gap})`;$('#dangerBox').classList.toggle('hot',gap<.34);$('#fuel').hidden=player.jet<=0;$('#fuelBar').style.transform=`scaleX(${clamp(player.jet/5,0,1)})`;}

function down(k){return!!keys[k]}
function jump(){if(state!=='play')return;player.buffer=.14}
function step(dt){if(state!=='play')return;elapsed=(performance.now()-started)/1000;player.inv=Math.max(0,player.inv-dt);player.buffer=Math.max(0,player.buffer-dt);player.coyote=player.on ? .11 : Math.max(0,player.coyote-dt);
  const left=down('left')||down('ArrowLeft')||down('KeyA'),right=down('right')||down('ArrowRight')||down('KeyD'),target=(right-left)*345;
  player.vx+=(target-player.vx)*Math.min(1,dt*(player.on?14:6));if(target)player.dir=Math.sign(target);
  if(player.buffer>0&&player.coyote>0){player.vy=-880;player.buffer=0;player.coyote=0;player.on=false;tone(310,.065,'triangle');puff(player.x+31,player.y+80,'#fff',4)}
  if(player.jet>0&&down('jump')){player.vy-=2300*dt;player.jet=Math.max(0,player.jet-dt);if(Math.random()<.4)puff(player.x+31,player.y+82,'#ffcb3d',1)}
  player.vy+=2050*dt;const oldTop=player.y,oldBottom=player.y+player.h;player.x=clamp(player.x+player.vx*dt,8,level.width-player.w-8);player.y+=player.vy*dt;player.on=false;
  for(const p of level.platforms){if(p.type==='moving')p.x=clamp(p.baseX+Math.sin(elapsed*p.speed+p.phase)*p.range,25,level.width-p.w-25);if(hitsUnderside(player,oldTop,p)){player.y=p.y+p.h;player.vy=30;tone(125,.035,'square',.014)}else if(player.vy>=0&&player.x+player.w>p.x+7&&player.x<p.x+p.w-7&&oldBottom<=p.y+12&&player.y+player.h>=p.y){player.y=p.y-player.h;player.vy=0;player.on=true;}}
  for(const it of level.items){if(it.taken)continue;const b={x:it.x-24,y:it.y-28,w:48,h:52};if(!overlap(player,b))continue;if(it.type==='coin'){it.taken=true;coins++;tone(720,.04,'sine',.018)}else if(it.type==='star'){it.taken=true;stars.add(it.id);tone(940,.1,'triangle');puff(it.x,it.y,'#ffe33d',12)}else if(it.type==='jetpack'){it.taken=true;player.jet=5;tone(500,.13,'triangle');puff(it.x,it.y,'#ffb13c',12)}else if(it.type==='spring'&&player.vy>=0){player.vy=-1080;player.on=false;tone(350,.12,'square');puff(it.x,it.y,'#68e7ff',8)}}
  for(let i=0;i<level.hazards.length;i++){const h=level.hazards[i],x=h.x+Math.sin(elapsed*1.45+h.phase)*h.range,b={x:x-36,y:h.y-22,w:72,h:44};if(player.inv<=0&&overlap(player,b)){player.vy=390;player.vx+=(player.x<x?-260:260);player.inv=1.2;tone(155,.13,'square');puff(x,h.y,'#f66b61',8)}}
  waterY=advanceWater(waterY,level,dt,player.y+player.h);
  if(player.y+player.h>waterY)return fail();
  if(player.y>level.height+160)return fail('Du bist zu tief gefallen.');
  if(overlap(player,level.goal))return complete();
  const targetCam=clamp(player.y-930,-170,level.height-1600);cameraY+=(targetCam-cameraY)*Math.min(1,dt*5);updateHud();
}

function backdrop(){
  const c=WORLD_COLORS[level?.world||0],w=level?.world||0;
  ctx.fillStyle=gradient(c[0],c[1],0,1600);ctx.fillRect(0,0,900,1600);
  const drift=cameraY*.11;
  ctx.globalAlpha=.26;ctx.fillStyle=c[3];
  for(let i=0;i<7;i++){
    const x=(i*177+(i%2)*60)%1000-50,y=((i*390-drift)%1900+1900)%1900-200,s=.8+(i%3)*.22;
    ctx.save();ctx.translate(x+60,y);ctx.scale(s,s);
    if(w===0){rr(-50,40,100,190,6);ctx.fill();ctx.beginPath();ctx.moveTo(-62,42);ctx.lineTo(0,-30);ctx.lineTo(62,42);ctx.closePath();ctx.fill()}
    else if(w===1){rr(-12,40,24,200,8);ctx.fill();ctx.beginPath();ctx.arc(0,30,52,0,7);ctx.moveTo(2,60);ctx.arc(-34,60,36,0,7);ctx.moveTo(70,60);ctx.arc(34,60,36,0,7);ctx.fill()}
    else if(w===2){ctx.beginPath();ctx.moveTo(-34,230);ctx.lineTo(-14,20);ctx.lineTo(0,-40);ctx.lineTo(16,30);ctx.lineTo(36,230);ctx.closePath();ctx.fill()}
    else if(w===3){ctx.rotate(elapsed*.15*(i%2?1:-1));ctx.beginPath();for(let k=0;k<12;k++){const a=k*Math.PI/6;ctx.lineTo(Math.cos(a)*(k%2?58:76),Math.sin(a)*(k%2?58:76))}ctx.closePath();ctx.fill();ctx.globalAlpha=1;ctx.fillStyle=c[1];ctx.beginPath();ctx.arc(0,0,20,0,7);ctx.fill();ctx.globalAlpha=.26;ctx.fillStyle=c[3]}
    else if(w===4){ctx.beginPath();ctx.moveTo(-90,230);ctx.lineTo(0,-40);ctx.lineTo(90,230);ctx.closePath();ctx.fill();ctx.fillStyle='#fff';ctx.globalAlpha=.3;ctx.beginPath();ctx.moveTo(-26,40);ctx.lineTo(0,-40);ctx.lineTo(26,40);ctx.lineTo(8,28);ctx.lineTo(-6,44);ctx.closePath();ctx.fill();ctx.fillStyle=c[3];ctx.globalAlpha=.26}
    else{ctx.beginPath();ctx.arc(-40,20,34,0,7);ctx.moveTo(48,0);ctx.arc(0,0,48,0,7);ctx.moveTo(80,18);ctx.arc(44,18,36,0,7);ctx.fill();rr(-76,18,150,36,18);ctx.fill()}
    ctx.restore();
  }
  ctx.globalAlpha=.22;ctx.fillStyle='#fff';
  for(let i=0;i<13;i++){const x=(i*83)%930-20,y=((i*247-cameraY*.3)%1800+1800)%1800;ctx.beginPath();ctx.arc(x,y,3+(i%3)*2,0,7);ctx.fill()}
  ctx.globalAlpha=1;
}
const PLAT=[
  {body:'#7a5238',top:'#67ce60'},{body:'#4a3626',top:'#3fae4a'},{body:'#2f2d63',top:'#58dbe4'},
  {body:'#565c6b',top:'#f2a13b'},{body:'#86b3d4',top:'#f4fbff'},{body:'#e4ebfb',top:'#ffffff'}
];
function platform(p){
  const y=p.y-cameraY;if(y>1680||y<-100)return;
  const w=level.world,k=PLAT[w],bh=p.h+32;
  ctx.save();
  ctx.shadowColor='rgba(5,18,35,.35)';ctx.shadowBlur=18;ctx.shadowOffsetY=12;
  ctx.fillStyle=k.body;rr(p.x,y,p.w,bh,15);ctx.fill();
  ctx.shadowColor='transparent';
  // Körper-Details je Welt
  ctx.save();rr(p.x,y,p.w,bh,15);ctx.clip();
  ctx.fillStyle='rgba(0,0,0,.16)';
  if(w===0){for(let r=0;r<3;r++){ctx.fillRect(p.x,y+26+r*14,p.w,3);for(let c=(r%2)*22+10;c<p.w;c+=44)ctx.fillRect(p.x+c,y+26+r*14,3,14)}}
  else if(w===1){for(let c=14;c<p.w;c+=38){ctx.beginPath();ctx.ellipse(p.x+c,y+40,8,5,.4,0,7);ctx.fill()}}
  else if(w===2){ctx.fillStyle='rgba(88,219,228,.25)';for(let c=20;c<p.w;c+=46){ctx.beginPath();ctx.moveTo(p.x+c,y+22);ctx.lineTo(p.x+c+9,y+52);ctx.lineTo(p.x+c-9,y+52);ctx.fill()}}
  else if(w===3){ctx.fillStyle='rgba(255,255,255,.28)';for(const c of [14,p.w-14]){ctx.beginPath();ctx.arc(p.x+c,y+36,5,0,7);ctx.fill()}ctx.fillStyle='rgba(0,0,0,.2)';ctx.fillRect(p.x,y+44,p.w,4)}
  else if(w===4){ctx.fillStyle='rgba(255,255,255,.35)';for(let c=18;c<p.w;c+=52){ctx.fillRect(p.x+c,y+26,18,3);ctx.fillRect(p.x+c+10,y+36,12,3)}}
  else{ctx.fillStyle='rgba(120,140,200,.18)';rr(p.x+10,y+30,p.w-20,26,13);ctx.fill()}
  ctx.restore();
  // Oberfläche
  ctx.fillStyle=k.top;rr(p.x,y,p.w,18,12);ctx.fill();
  if(w===3){ctx.save();rr(p.x,y,p.w,18,12);ctx.clip();ctx.fillStyle='rgba(30,20,10,.55)';for(let c=-10;c<p.w;c+=26){ctx.beginPath();ctx.moveTo(p.x+c,y);ctx.lineTo(p.x+c+13,y);ctx.lineTo(p.x+c+3,y+18);ctx.lineTo(p.x+c-10,y+18);ctx.fill()}ctx.restore()}
  else{ctx.fillStyle='rgba(255,255,255,.24)';rr(p.x+12,y+4,p.w-24,5,3);ctx.fill()}
  if(w===1){ctx.fillStyle=k.top;for(let c=18;c<p.w-8;c+=34){ctx.beginPath();ctx.arc(p.x+c,y+18,8,0,7);ctx.fill();rr(p.x+c-2,y+18,4,(c*7)%16+8,2);ctx.fill()}}
  if(w===2){ctx.fillStyle='#9af6ff';for(const c of [.18,.5,.8]){const cx=p.x+p.w*c;ctx.beginPath();ctx.moveTo(cx-9,y+2);ctx.lineTo(cx,y-17);ctx.lineTo(cx+9,y+2);ctx.fill()}}
  if(w===4){ctx.fillStyle=k.body;for(let c=16;c<p.w-10;c+=40){ctx.beginPath();ctx.moveTo(p.x+c,y+bh-4);ctx.lineTo(p.x+c+9,y+bh+(c%3)*6+14);ctx.lineTo(p.x+c+18,y+bh-4);ctx.fill()}}
  if(w===5){ctx.fillStyle=k.top;for(const c of [.2,.45,.7]){ctx.beginPath();ctx.arc(p.x+p.w*c,y+2,14+((c*10)|0)%3*2,Math.PI,0);ctx.fill()}}
  if(p.type==='moving'){ctx.fillStyle='#ffd43b';ctx.fillRect(p.x+p.w/2-28,y+bh-10,56,8)}
  ctx.restore();
}
function item(it){if(it.taken)return;const y=it.y-cameraY;if(y<-80||y>1680)return;ctx.save();ctx.translate(it.x,y);ctx.shadowColor='rgba(0,0,0,.3)';ctx.shadowBlur=10;if(it.type==='coin'){ctx.scale(Math.max(.35,Math.abs(Math.cos(elapsed*3.2+it.x*.02))),1);ctx.fillStyle='#ffd52b';ctx.strokeStyle='#ed9b00';ctx.lineWidth=5;ctx.beginPath();ctx.ellipse(0,0,14,20,0,0,7);ctx.fill();ctx.stroke();ctx.fillStyle='#fff2a1';ctx.fillRect(-4,-11,5,19)}else if(it.type==='star'){ctx.fillStyle='#ffe23d';ctx.strokeStyle='#e58d00';ctx.lineWidth=5;ctx.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?14:30;ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r)}ctx.closePath();ctx.fill();ctx.stroke()}else if(it.type==='spring'){ctx.fillStyle='#27bddc';rr(-28,-16,56,25,8);ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-19,-16);ctx.lineTo(-8,-36);ctx.lineTo(4,-16);ctx.lineTo(17,-37);ctx.stroke()}else{ctx.fillStyle='#ee6540';rr(-24,-33,48,66,13);ctx.fill();ctx.fillStyle='#ffd43b';ctx.fillRect(-15,-22,30,30);ctx.fillStyle='#263753';ctx.fillRect(-17,22,11,17);ctx.fillRect(6,22,11,17)}ctx.restore()}
function hero(){const x=player.x+31,y=player.y-cameraY+41,bob=player.on&&Math.abs(player.vx)>20?Math.sin(elapsed*12)*3:0;ctx.save();ctx.translate(x,y+bob);const st=clamp(-player.vy/4200,-.1,.16);ctx.scale(player.dir*(1-st*.6),1+st);ctx.lineJoin='round';if(player.inv>0&&Math.floor(player.inv*12)%2)ctx.globalAlpha=.35;ctx.fillStyle='rgba(0,0,0,.22)';ctx.beginPath();ctx.ellipse(0,43,31,9,0,0,7);ctx.fill();if(player.jet>0){ctx.fillStyle='#e25b42';rr(-37,-8,15,42,7);ctx.fill();ctx.fillStyle='#ffdb3e';ctx.beginPath();ctx.moveTo(-34,35);ctx.lineTo(-20,61);ctx.lineTo(-27,30);ctx.fill()}ctx.fillStyle='#2f58a8';rr(-23,15,18,31,8);ctx.fill();rr(5,15,18,31,8);ctx.fill();ctx.fillStyle='#55ddff';rr(-29,37,31,13,7);ctx.fill();rr(4,37,31,13,7);ctx.fill();ctx.fillStyle='#ffd43b';rr(-28,-22,56,46,18);ctx.fill();ctx.fillStyle='#ef7b55';ctx.beginPath();ctx.arc(0,-34,24,0,7);ctx.fill();ctx.fillStyle='#17284b';ctx.beginPath();ctx.arc(-4,-41,25,3.1,6.3);ctx.lineTo(32,-35);ctx.lineTo(8,-29);ctx.fill();ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(9,-35,7,0,7);ctx.fill();ctx.fillStyle='#152440';ctx.beginPath();ctx.arc(11,-35,3,0,7);ctx.fill();ctx.strokeStyle='#ffd43b';ctx.lineWidth=10;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(23,-7);ctx.lineTo(34,10);ctx.stroke();ctx.restore()}
function hazard(h,i){const x=h.x+Math.sin(elapsed*1.45+h.phase)*h.range,y=h.y-cameraY;if(y<-80||y>1680)return;ctx.save();ctx.translate(x,y);ctx.fillStyle='#863f99';ctx.beginPath();ctx.ellipse(0,0,29,18,0,0,7);ctx.fill();ctx.fillStyle='#cda0e2';ctx.beginPath();ctx.ellipse(-30,-2,24,10,-.3,0,7);ctx.ellipse(30,-2,24,10,.3,0,7);ctx.fill();ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(10,-4,7,0,7);ctx.fill();ctx.fillStyle='#182341';ctx.beginPath();ctx.arc(12,-4,3,0,7);ctx.fill();ctx.restore()}
function water(){
  const y=waterY-cameraY;if(y>1700)return;
  ctx.save();
  const g=gradient('#4be4ff','#087fc9',Math.max(y,0),1600);
  ctx.globalAlpha=.55;ctx.fillStyle='#8cf1ff';ctx.beginPath();ctx.moveTo(0,y-14);
  for(let x=0;x<=900;x+=30)ctx.lineTo(x,y-14+Math.sin(x*.028-elapsed*2.6)*10);
  ctx.lineTo(900,1700);ctx.lineTo(0,1700);ctx.closePath();ctx.fill();
  ctx.globalAlpha=.92;ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(0,y);
  for(let x=0;x<=900;x+=30)ctx.lineTo(x,y+Math.sin(x*.035+elapsed*4)*12);
  ctx.lineTo(900,1700);ctx.lineTo(0,1700);ctx.closePath();ctx.fill();
  ctx.globalAlpha=.8;ctx.strokeStyle='#fff';ctx.lineWidth=6;ctx.lineCap='round';ctx.beginPath();
  for(let x=0;x<=900;x+=30){const yy=y+Math.sin(x*.035+elapsed*4)*12;x?ctx.lineTo(x,yy):ctx.moveTo(x,yy)}
  ctx.stroke();
  ctx.globalAlpha=.35;ctx.fillStyle='#fff';
  for(let x=20;x<900;x+=90){ctx.beginPath();ctx.arc(x,y+30+Math.sin(x+elapsed)*12,5,0,7);ctx.fill()}
  ctx.restore();
}
function goal(){const y=level.goal.y-cameraY;if(y<-180||y>1700)return;ctx.save();ctx.translate(level.goal.x,y);ctx.shadowColor='#62efff';ctx.shadowBlur=34;ctx.fillStyle='#49dcef';rr(0,0,level.goal.w,level.goal.h,36);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#fff';ctx.font='700 24px Barlow';ctx.textAlign='center';ctx.fillText('RAUS!',55,82);ctx.restore()}
function draw(){if(!level)return;const v=view();ctx.setTransform(v.s,0,0,v.s,v.ox,v.oy);backdrop();level.platforms.forEach(platform);level.items.forEach(item);level.hazards.forEach(hazard);goal();hero();water();for(const p of particles){ctx.globalAlpha=Math.max(0,p.t*1.5);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y-cameraY,p.r,0,7);ctx.fill()}ctx.globalAlpha=1;ctx.setTransform(1,0,0,1,0,0)}
function loop(t){if(state!=='play'){draw();return}const dt=Math.min(.045,(t-last)/1000);last=t;acc+=dt;while(acc>=1/120){step(1/120);for(const p of particles){p.x+=p.vx/120;p.y+=p.vy/120;p.vy+=380/120;p.t-=1/120}particles=particles.filter(p=>p.t>0);acc-=1/120}draw();requestAnimationFrame(loop)}

function moveNow(dir){if(state!=='play')return;player.vx=dir*345;player.dir=dir}
addEventListener('keydown',e=>{keys[e.code]=true;if(['ArrowLeft','ArrowRight','ArrowUp','Space'].includes(e.code))e.preventDefault();if(['ArrowLeft','KeyA'].includes(e.code))moveNow(-1);if(['ArrowRight','KeyD'].includes(e.code))moveNow(1);if(['ArrowUp','Space','KeyW'].includes(e.code)&&!e.repeat){keys.jump=true;jump()}if(e.code==='Escape'&&state==='play')pause()});addEventListener('keyup',e=>{keys[e.code]=false;if(['ArrowUp','Space','KeyW'].includes(e.code))keys.jump=false});
function bind(id,key){const b=$(id),on=e=>{e.preventDefault();b.setPointerCapture?.(e.pointerId);keys[key]=true;if(key==='left')moveNow(-1);else if(key==='right')moveNow(1);else jump()},off=e=>{e.preventDefault();keys[key]=false;if(b.hasPointerCapture?.(e.pointerId))b.releasePointerCapture(e.pointerId)};b.addEventListener('pointerdown',on);['pointerup','pointercancel','lostpointercapture'].forEach(n=>b.addEventListener(n,off))}bind('#left','left');bind('#right','right');bind('#jump','jump');
function pause(){if(state!=='play')return;keys={};state='pause';show('#pause')}$('#pauseBtn').onclick=pause;$('#resume').onclick=()=>{keys={};state='play';show();last=performance.now();started=performance.now()-elapsed*1000;requestAnimationFrame(loop)};$('#backMenu').onclick=menu;$('#home').onclick=menu;$('#failHome').onclick=menu;$('#continue').onclick=()=>start(save.unlocked);$('#levelsBtn').onclick=()=>{state='levels';show('#levels')};$('#closeLevels').onclick=menu;$('#next').onclick=()=>start(level.number+1);$('#retry').onclick=()=>start(level.number);$('#failRetry').onclick=()=>start(level.number);$('#mute').onclick=()=>{save.muted=!save.muted;persist();menu()};
$('#share').onclick=async()=>{const l=Math.max(level.number,save.unlocked),s=totalStars(save),url=`${location.origin}/spiele/sprungsebi?c=${l}&s=${s}`,data={title:'SprungSebi',text:challengeText(l,s),url};try{if(navigator.share)await navigator.share(data);else{await navigator.clipboard.writeText(`${data.text} ${url}`);$('#share').textContent='Link kopiert!';setTimeout(()=>$('#share').textContent='Freunde herausfordern',1600)}}catch(e){}};
$('#soundBtn').onclick=()=>{save.muted=!save.muted;persist();$('#soundBtn').textContent=save.muted?'🔇':'🔊'};$('#soundBtn').textContent=save.muted?'🔇':'🔊';addEventListener('blur',()=>{keys={}});addEventListener('visibilitychange',()=>{keys={};if(document.hidden&&state==='play')pause()});
const q=new URLSearchParams(location.search),chall=Number(q.get('c')),challStars=Number(q.get('s'));if(chall>=1&&chall<=30){$('#challenge').hidden=false;$('#challenge').textContent=`Herausforderung: Level ${chall} · ${clamp(challStars||0,0,90)} Sterne – kommst du höher?`}
menu();
