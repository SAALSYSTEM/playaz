import {LEVELS,makeLevel,clamp,hitValue,finishBonus,shareText} from './engine.js';
const $=id=>document.getElementById(id), fmt=n=>Math.floor(n).toLocaleString('de-DE');
const canvas=$('scene'), overlay=$('overlay'), hud=$('hud');
const saved=(()=>{try{const d=JSON.parse(localStorage.getItem('geisterschloss.v1'));return {unlocked:clamp(Math.floor(Number(d?.unlocked)||1),1,20),best:Array.isArray(d?.best)?d.best.slice(0,20).map(x=>Math.max(0,Number(x)||0)):Array(20).fill(0)}}catch{return {unlocked:1,best:Array(20).fill(0)}}})();
while(saved.best.length<20)saved.best.push(0);
const persist=()=>{try{localStorage.setItem('geisterschloss.v1',JSON.stringify(saved))}catch{}};
let renderer,scene,camera,ray,level,objects=[],decor=[],rightHand,run=null,phase='menu',last=0,raf=0,aim={x:0,y:0},mouse={x:0,y:0},pressed={left:false,right:false},keys=new Set(),audio=null,toastTimer=0,hitTimer=0,throwTimer=0;
const T=window.THREE;
// three.js r13x rechnet Hex-Farben nicht selbst in den linearen Raum um; ohne dies wirkt alles ausgewaschen.
const lin=c=>new T.Color(c).convertSRGBToLinear();
const loader=new T.TextureLoader(),texCache={};
function tex(name,rx=1,ry=1,repeat=true){const key=name+rx+'/'+ry;if(!texCache[key]){const t=loader.load(new URL('img/'+name,import.meta.url).href);t.encoding=T.sRGBEncoding;t.anisotropy=4;if(repeat){t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(rx,ry)}texCache[key]=t}return texCache[key]}
const colors={stone:0x302b4a,trim:0x554b71,gold:0xffae4d,blue:0x4b79c7};
const mat=(c,opts={})=>new T.MeshStandardMaterial({color:lin(c),roughness:.72,...opts,...(opts.emissive!==undefined?{emissive:lin(opts.emissive)}:{})});
const stone=mat(colors.stone),trim=mat(colors.trim),wood=mat(0x2b1b3d),gold=mat(colors.gold,{emissive:0x9b4810,emissiveIntensity:.75}),glow=mat(0xffd15b,{emissive:0xffb03c,emissiveIntensity:.32}),dark=mat(0x1c1135),black=mat(0x261343),white=mat(0xfff7e5),purple=mat(0x9c55df,{emissive:0x411c81,emissiveIntensity:.3});
const box=(w,h,d,m)=>new T.Mesh(new T.BoxGeometry(w,h,d),m);
const ball=(r,m)=>new T.Mesh(new T.SphereGeometry(r,16,12),m);
function addBox(parent,x,y,z,w,h,d,m){const b=box(w,h,d,m);b.position.set(x,y,z);parent.add(b);return b}
function addBoxM(parent,x,y,z,w,h,d,mats){const b=new T.Mesh(new T.BoxGeometry(w,h,d),mats);b.position.set(x,y,z);parent.add(b);return b}
function addBall(parent,x,y,z,r,m){const b=ball(r,m);b.position.set(x,y,z);parent.add(b);return b}
function creature(img,w,h,hitW,hitH,{tint=0xffffff,lift=0}={}){const g=new T.Group();
 const vis=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:tex(img,1,1,false),color:lin(tint),transparent:true,alphaTest:.06}));vis.userData.noHit=true;vis.position.y=lift;g.add(vis);g.userData.visual=vis;
 const hit=new T.Mesh(new T.BoxGeometry(hitW,hitH,.5),new T.MeshBasicMaterial({visible:false}));g.add(hit);return g}
function bulb(){const g=new T.Group();const m=mat(0xfff4db);addBall(g,0,0,0,.28,m);addBall(g,-.17,-.05,.04,.14,m);addBall(g,.17,-.05,.04,.14,m);const stalk=new T.Mesh(new T.ConeGeometry(.09,.25,7),mat(0xc9c18b));stalk.position.y=.29;g.add(stalk);return g}
function pumpkin(){const g=new T.Group();const m=mat(0xff8732,{emissive:0x98330b,emissiveIntensity:.36});for(let x of [-.18,0,.18])addBall(g,x,0,0,.27,m);addBox(g,0,.27,0,.1,.15,.1,mat(0x426b35));addBall(g,-.1,.04,.25,.045,dark);addBall(g,.1,.04,.25,.045,dark);return g}
function makeHands(){
 const glove=new T.MeshBasicMaterial({color:lin(0x2d2446)}),seam=new T.MeshBasicMaterial({color:lin(0x554778)});
 for(const side of [-1,1]){
  const hand=new T.Group();hand.position.set(side*.48,-.57,-.9);hand.rotation.z=side*.16;
  const arm=new T.Mesh(new T.CylinderGeometry(.13,.2,.55,10),glove);arm.rotation.x=-.55;arm.position.set(side*.05,-.2,.14);hand.add(arm);
  const palm=addBall(hand,0,.02,-.08,.19,glove);palm.scale.set(1.12,.65,1.28);
  for(let i=0;i<4;i++){const finger=addBall(hand,side*(i-1.5)*.075,.02,-.25,.06,glove);finger.scale.set(.7,.68,1.8)}
  addBall(hand,-side*.2,-.025,-.15,.075,seam);
  if(side===1){const garlic=bulb();garlic.scale.setScalar(.57);garlic.position.set(0,.13,-.23);hand.add(garlic);rightHand=hand}
  camera.add(hand);
 }
}
const THEMES=[
 {name:'Eingangshalle',wall:0x4a3a72,trim:0x8a6bb8,floor:0x2a2145,carpet:0x5a1228,win:0x4a74c9,torch:0xffa24a,fog:0x1a1236,fogD:.036,gate:0xffae4d,tint:0xffffff,carpetTint:0xffffff},
 {name:'Mondgang',wall:0x34406e,trim:0x6f84c8,floor:0x1e2848,carpet:0x1c3566,win:0x9cc3ff,torch:0x9fc4ff,fog:0x0e1832,fogD:.04,gate:0xcfe0ff,tint:0xa8c4ff,carpetTint:0x7fa6ff},
 {name:'Verlies',wall:0x28504a,trim:0x4f8c78,floor:0x16292b,carpet:0x2a4020,win:0x4fffa0,torch:0x7dffb0,fog:0x0b1f1f,fogD:.05,gate:0x9dffc8,tint:0x9fffd0,carpetTint:0x9fe07a},
 {name:'Turm',wall:0x5a2a52,trim:0xb4507c,floor:0x2c1530,carpet:0x6a1220,win:0xff7a6a,torch:0xff6b4a,fog:0x240d22,fogD:.045,gate:0xff9a7a,tint:0xffa8c0,carpetTint:0xffffff},
 {name:'Hexenhalle',wall:0x3c2858,trim:0xd7a937,floor:0x1c1230,carpet:0x40186a,win:0xc77dff,torch:0xd37dff,fog:0x180c2c,fogD:.055,gate:0xd7a937,tint:0xd8a8ff,carpetTint:0xb88aff}
];
let TH=null,fx=[],torchLight=null,moonLight=null;
function makeTheme(num){const t=THEMES[num===20?4:Math.min(3,Math.floor((num-1)/5))];
 const tm=(name,rx,ry,tint)=>new T.MeshStandardMaterial({map:tex(name,rx,ry),color:lin(tint),roughness:.85});
 return {...t,stone:mat(t.wall),trim:mat(t.trim),floor:mat(t.floor),carpet:mat(t.carpet),ceil:mat(t.floor),
  wallTex:tm('wand.webp',2,1.25,t.tint),floorTex:tm('boden.webp',1.5,2,t.tint),carpetTex:tm('teppich.webp',1,2,t.carpetTint),
  window:mat(t.win,{emissive:t.win,emissiveIntensity:.7}),flame:mat(t.torch,{emissive:t.torch,emissiveIntensity:2.2}),banner:mat(t.carpet)}}
function webMaterial(){return new T.MeshBasicMaterial({map:tex('spinnweb.webp',1,1,false),transparent:true,opacity:.8,alphaTest:.05,depthWrite:false,side:T.DoubleSide})}
function corridorSegment(z,index){const g=new T.Group();g.position.z=z;
 addBoxM(g,0,-.13,0,6.2,.26,8,[TH.floor,TH.floor,TH.floorTex,TH.floor,TH.floor,TH.floor]);addBoxM(g,0,.012,0,1.9,.024,8,[TH.carpet,TH.carpet,TH.carpetTex,TH.carpet,TH.carpet,TH.carpet]);addBox(g,0,5,0,6.2,.22,8,TH.ceil);
 for(const side of [-1,1]){const inner=side<0?[TH.wallTex,TH.stone]:[TH.stone,TH.wallTex];addBoxM(g,side*3.12,2.4,0,.25,5,8,[...inner,TH.stone,TH.stone,TH.stone,TH.stone]);addBox(g,side*2.95,.32,0,.35,.64,8,TH.trim);addBox(g,side*2.95,4.85,0,.36,.3,8,TH.trim);
 for(const zz of [-3.7,3.7]){addBox(g,side*2.84,2.45,zz,.47,4.8,.48,TH.trim);addBox(g,side*2.83,3.95,zz,.62,.18,.62,gold)}
 addBox(g,side*3.012,2.75,0,.045,2.25,1.25,TH.window);
 addBox(g,side*2.96,2.75,0,.09,2.25,.1,TH.trim);addBox(g,side*2.96,2.72,0,.1,.1,1.26,TH.trim);addBox(g,side*2.95,1.58,0,.2,.1,1.5,TH.trim);
 if(index%2===0){const pic=new T.Mesh(new T.PlaneGeometry(1.4,2.1),new T.MeshBasicMaterial({map:tex('bild-'+((index*2+(side>0?1:0))%6+1)+'.webp',1,1,false),color:0xd8d8d8,transparent:true,alphaTest:.05,side:T.DoubleSide}));pic.position.set(side*2.985,2.75,2.2);pic.rotation.y=side<0?Math.PI/2:-Math.PI/2;g.add(pic)}
 // Fackel
 if(index%2===1){addBox(g,side*2.78,2.2,-2,.12,.5,.12,wood);addBall(g,side*2.74,2.58,-2,.17,TH.flame);const f=new T.Mesh(new T.ConeGeometry(.12,.34,7),TH.flame);f.position.set(side*2.74,2.84,-2);f.userData.flame=true;g.add(f)}
 // Banner
 if(index%4===3){addBox(g,side*2.9,3.3,1.8,.06,1.5,.8,TH.banner);addBox(g,side*2.86,3.3,1.8,.04,.8,.12,gold)}
 // Spinnweben in den Deckenecken
 if(index%3===1){const web=new T.Mesh(new T.PlaneGeometry(1.5,1.5),webMaterial());web.position.set(side*2.975,4.0,-2.7);web.rotation.y=Math.PI/2;if(side>0)web.scale.x=-1;g.add(web)}}
 for(let zz=-4;zz<=4;zz+=2)addBox(g,0,-.005,zz,6.03,.012,.035,TH.trim);
 return g}
function makeWorld(){scene=new T.Scene();scene.background=lin(0x10102a);scene.fog=new T.FogExp2(lin(0x14112e),.035);camera=new T.PerspectiveCamera(73,1,.05,90);scene.add(camera);scene.add(new T.HemisphereLight(lin(0x788cd3),lin(0x362144),.62));makeHands();torchLight=new T.PointLight(lin(0xffa954),3,22,1.8);torchLight.position.set(0,3.2,-6);scene.add(torchLight);moonLight=new T.PointLight(lin(0x629bff),2.2,40,1.4);moonLight.position.set(-1,4,-27);scene.add(moonLight);ray=new T.Raycaster();renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.outputEncoding=T.sRGBEncoding;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;resize();window.addEventListener('resize',resize)}
function resize(){if(!renderer)return;renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix()}
function clearLevel(){for(const x of [...objects,...decor,...fx])scene.remove(x.mesh||x);objects=[];decor=[];fx=[]}
function buildLevel(num){clearLevel();level=makeLevel(num);TH=makeTheme(num);
 scene.background=lin(TH.fog);scene.fog=new T.FogExp2(lin(TH.fog),TH.fogD);torchLight.color.copy(lin(TH.torch));moonLight.color.copy(lin(TH.win));
 for(let i=0;i<Math.ceil((level.length+16)/8);i++){const seg=corridorSegment(-i*8-4,i);scene.add(seg);decor.push(seg)}
 for(const e of level.entries){const mesh=e.type==='ghost'?creature('geist.webp',1.7,1.7,.95,1.2):e.type==='big'?creature('geist.webp',1.7,1.7,.95,1.2,{tint:0xd9c4ff}):e.type==='spider'?creature('spinne.webp',1.35,1.35,1,.75,{lift:.12}):e.type==='bat'?creature('fledermaus.webp',1.5,1.5,1.1,.7):e.type==='witch'||e.type==='boss'?creature('hexe.webp',2.1,2.1,.9,1.7,{tint:e.type==='boss'?0xffd0ff:0xffffff}):e.type==='garlic'?bulb():pumpkin();
  if(e.type==='big')mesh.scale.setScalar(1.65);if(e.type==='boss')mesh.scale.setScalar(1.48);
  const y=e.type==='spider'?.58:e.type==='garlic'?.7:e.type==='pumpkin'?.52:e.type==='boss'?1.8:e.type==='bat'?1.9:1.55;
  mesh.position.set(e.x,y,-e.d);scene.add(mesh);
  const amp=e.type==='bat'?.55:e.type==='ghost'&&num>=3?Math.min(.5,.12+num*.02):0;
  objects.push({...e,mesh,alive:true,baseY:y,baseZ:mesh.position.z,hp:e.hp||0,amp,flash:0})}
 const gate=new T.Group();gate.position.z=-level.length;const gm=mat(TH.gate,{emissive:TH.gate,emissiveIntensity:.5});addBox(gate,-2,2,0,.7,4,.7,gm);addBox(gate,2,2,0,.7,4,.7,gm);addBox(gate,0,4,0,4.7,.7,.7,gm);
 const exit=new T.Mesh(new T.PlaneGeometry(3.3,3.6),new T.MeshBasicMaterial({color:lin(TH.gate),transparent:true,opacity:.28,depthWrite:false}));exit.position.y=1.8;gate.add(exit);scene.add(gate);decor.push(gate)}
function sound(freq=440,duration=.09,type='sine'){try{audio??=new(window.AudioContext||window.webkitAudioContext)();const o=audio.createOscillator(),v=audio.createGain();o.type=type;o.frequency.setValueAtTime(freq,audio.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(80,freq*.5),audio.currentTime+duration);v.gain.setValueAtTime(.075,audio.currentTime);v.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(v).connect(audio.destination);o.start();o.stop(audio.currentTime+duration)}catch{}}
function toast(t){$('toast').textContent=t;$('toast').classList.add('on');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('on'),1050)}
function setPanel(eyebrow,title,msg,summary,buttons,showLevels=false){$('eyebrow').textContent=eyebrow;$('title').textContent=title;$('message').textContent=msg;$('summary').textContent=summary||'';$('buttons').replaceChildren();for(const [label,fn,primary] of buttons){const b=document.createElement('button');b.textContent=label;if(primary)b.className='primary';b.onclick=fn;$('buttons').append(b)}$('levels').replaceChildren();if(showLevels)for(let i=1;i<=20;i++){const b=document.createElement('button');b.textContent=i;b.title=LEVELS[i-1]+(saved.best[i-1]?' · Rekord '+fmt(saved.best[i-1]):'');b.disabled=i>saved.unlocked;b.className=i===saved.unlocked?'selected':'';b.onclick=()=>start(i);$('levels').append(b)}overlay.hidden=false;hud.hidden=true;$('home').hidden=false}
function menu(){phase='menu';setPanel('PlaySaal · Halloween-Abenteuer','Geisterschloss','20 Flure. Leuchtende Geister. Verzauberter Knoblauch. Weiche aus und wirf gezielt, bevor sie dich erreichen.',`Freigeschaltet: ${saved.unlocked} / 20 · Gesamtbestwert: ${fmt(saved.best.reduce((a,b)=>a+b,0))}`,[[saved.unlocked>1?'Weiter bei Level '+saved.unlocked:'Spiel starten',()=>start(saved.unlocked),true]],true)}
function start(num){buildLevel(num);run={level:num,progress:0,x:0,hearts:3,ammo:level.startGarlic,score:0,combo:0,pumpkins:0,throwTime:0,damageTime:0,elapsed:0};phase='playing';overlay.hidden=true;hud.hidden=false;$('home').hidden=true;aim={x:0,y:0};updateReticle();updateHud();canvas.focus();last=performance.now()}
function updateHud(){$('level').textContent=String(run.level).padStart(2,'0')+' / 20';$('hearts').textContent='♥ '.repeat(run.hearts).trim()||'♡';$('ammo').textContent=run.ammo;$('score').textContent=fmt(run.score);$('pumpkins').textContent=run.pumpkins;$('combo').textContent=run.combo>=3?'· ×'+clamp(1+Math.floor(run.combo/3),1,5):'';$('bar').style.width=(run.progress/level.length*100).toFixed(1)+'%'}
function damage(){if(run.damageTime>0)return;run.hearts--;run.combo=0;run.damageTime=1.5;const f=$('flash');f.classList.add('on');setTimeout(()=>f.classList.remove('on'),110);sound(145,.22,'sawtooth');toast(run.hearts?'Achtung!':'Erwischt!');updateHud();if(!run.hearts)finish(false)}
function finish(won){if(phase!=='playing')return;phase=won?'win':'loss';if(won){run.score+=finishBonus(run.ammo,run.hearts,run.pumpkins);saved.best[run.level-1]=Math.max(saved.best[run.level-1],run.score);saved.unlocked=Math.max(saved.unlocked,Math.min(20,run.level+1));persist();sound(660,.22)}
 const text=won?`Level ${run.level} geschafft · ${run.hearts} Herzen übrig · ${run.pumpkins} Kürbisse gesammelt.`:'Die Geister waren schneller. Du startest nur diesen Flur neu.';
 const actions=won?[[run.level<20?'Nächster Flur':'Noch einmal spielen',()=>start(run.level<20?run.level+1:1),true],['Ergebnis teilen',share],['Level wählen',menu]]:[['Erneut versuchen',()=>start(run.level),true],['Level wählen',menu]];
 setPanel(won?'FLUR GESCHAFFT':'VERSUCH BEENDET',won?(run.level===20?'Schloss gerettet!':'Geister vertrieben!'):'Noch ein Versuch!',text,`${fmt(run.score)} Punkte · Bestwert ${fmt(saved.best[run.level-1])}`,actions)}
async function share(){const url=new URL('/spiele/geisterschloss',location.origin);url.searchParams.set('l',String(run.level));url.searchParams.set('p',String(run.score));const text=shareText(run.level,run.score);try{if(navigator.share){await navigator.share({title:'Geisterschloss · PlaySaal',text,url:url.href});return}await navigator.clipboard.writeText(text+' '+url.href);toast('Link kopiert')}catch{toast('Teilen abgebrochen')}}
function updateReticle(){$('reticle').style.left=((aim.x+1)*50)+'%';$('reticle').style.top=((1-aim.y)*50)+'%'}
function burst(point,color,n=8){for(let i=0;i<n;i++){const m=new T.Mesh(new T.SphereGeometry(.07+Math.random()*.05,6,5),new T.MeshBasicMaterial({color:lin(color),transparent:true}));m.position.copy(point);scene.add(m);const a=Math.random()*6.28,u=.8+Math.random()*2.2;fx.push({mesh:m,vx:Math.cos(a)*u,vy:.6+Math.random()*2.4,vz:Math.sin(a)*u+1.2,life:.55})}}
function fire(){if(phase!=='playing'||run.throwTime>0)return;if(run.ammo<=0){toast('Knoblauch aufsammeln!');return}run.ammo--;run.throwTime=.27;throwTimer=.18;sound(540,.09,'triangle');ray.setFromCamera(new T.Vector2(aim.x,aim.y),camera);const hittable=objects.filter(o=>o.alive&&['ghost','big','witch','boss','spider','bat'].includes(o.type)&&o.mesh.position.z<camera.position.z-.3&&o.mesh.position.z>camera.position.z-28);const meshes=[];for(const o of hittable)o.mesh.traverse(child=>{if(child.isMesh&&!child.userData.noHit){child.userData.entity=o;meshes.push(child)}});const hits=ray.intersectObjects(meshes,false);if(hits.length){const obj=hits[0].object.userData.entity;obj.hp--;if(obj.hp>0){obj.s0=(obj.s0??obj.mesh.scale.x)*.94;obj.baseZ-=.7;obj.flash=.22}burst(hits[0].point,obj.type==='spider'||obj.type==='bat'?0xb06cff:0xfff0a0,obj.hp>0?5:12);$('reticle').classList.add('hit');setTimeout(()=>$('reticle').classList.remove('hit'),160);if(obj.hp<=0){obj.alive=false;scene.remove(obj.mesh);run.combo++;run.score+=hitValue(obj.type,run.combo);toast(run.combo>=3?'Treffer-Serie ×'+clamp(1+Math.floor(run.combo/3),1,5):'Treffer!');sound(850,.16,'sine')}else{run.score+=40;toast(`Noch ${obj.hp} Treffer!`);sound(370,.11,'triangle')}}updateHud()}
function update(dt,t){if(phase!=='playing')return;run.elapsed+=dt;run.throwTime=Math.max(0,run.throwTime-dt);run.damageTime=Math.max(0,run.damageTime-dt);throwTimer=Math.max(0,throwTimer-dt);
 const move=(keys.has('a')||keys.has('arrowleft')||pressed.left?-1:0)+(keys.has('d')||keys.has('arrowright')||pressed.right?1:0);run.x=clamp(run.x+move*dt*4.2,-2.25,2.25);run.progress=Math.min(level.length,run.progress+dt*(3.35+Math.min(run.level,20)*.035));const playerZ=-run.progress;
 camera.position.set(run.x,1.72+Math.sin(t*9)*.034,playerZ+1.1);camera.rotation.set(0,0,-move*.022);camera.lookAt(run.x+aim.x*.8,1.66+aim.y*.58,playerZ-8);if(rightHand)rightHand.rotation.x=-throwTimer*3.4+Math.sin(t*9)*.018;
 for(const obj of objects){if(!obj.alive)continue;const mesh=obj.mesh;const enemy=!['garlic','pumpkin'].includes(obj.type);if(enemy){mesh.position.z=Math.min(playerZ+1,obj.baseZ+run.elapsed*obj.speed);mesh.position.y=obj.baseY+Math.sin(t*(obj.type==='bat'?5:2.2)+obj.d)*(obj.type==='bat'?.22:.11);mesh.rotation.y=Math.sin(t*1.6+obj.d)*.08;
  if(obj.amp)mesh.position.x=obj.x+Math.sin(t*1.3+obj.d*.7)*obj.amp;
  if(obj.type==='bat'&&mesh.userData.visual)mesh.userData.visual.scale.set(1+Math.sin(t*16+obj.d)*.1,1-Math.sin(t*16+obj.d)*.12,1);
  if(obj.flash>0){obj.flash=Math.max(0,obj.flash-dt);const k=(obj.s0??1)*(1+obj.flash*.9);mesh.scale.setScalar(k)}}else{mesh.rotation.y+=dt*1.3;mesh.position.y=obj.baseY+Math.sin(t*2.2+obj.d)*.12}
 const delta=mesh.position.z-playerZ;if(delta>=-.7){obj.alive=false;scene.remove(mesh);if(Math.abs(run.x-mesh.position.x)<(obj.type==='big'||obj.type==='boss'?1.35:obj.type==='garlic'||obj.type==='pumpkin'?1.05:.95)){if(obj.type==='garlic'){run.ammo=Math.min(30,run.ammo+obj.value);run.score+=25;toast('+4 Knoblauch');sound(780,.13)}else if(obj.type==='pumpkin'){run.pumpkins++;run.score+=75;toast('+75 Kürbis');sound(620,.12)}else {damage();if((obj.type==='boss'||obj.type==='big')&&phase==='playing')finish(false)}}}
 }
 for(let i=fx.length-1;i>=0;i--){const f=fx[i];f.life-=dt;f.vy-=5*dt;f.mesh.position.x+=f.vx*dt;f.mesh.position.y+=f.vy*dt;f.mesh.position.z+=f.vz*dt;f.mesh.material.opacity=Math.max(0,f.life/.55);if(f.life<=0){scene.remove(f.mesh);f.mesh.geometry.dispose();f.mesh.material.dispose();fx.splice(i,1)}}
 if(torchLight){torchLight.position.set(run.x*.5,3.4,playerZ-5);torchLight.intensity=2.9+Math.sin(t*11)*.3+Math.sin(t*23)*.18}
 if(moonLight)moonLight.position.set(-1,4,playerZ-26);
 if(run.progress>=level.length&&phase==='playing')finish(true);updateHud()}
function frame(time){raf=requestAnimationFrame(frame);const dt=Math.min((time-last)/1000||0,.05);last=time;if(phase==='playing')update(dt,time/1000);if(renderer)renderer.render(scene,camera)}
function togglePause(){if(phase==='playing'){phase='paused';setPanel('PAUSE','Kurz durchatmen','Dein Flur wartet auf dich.',`${fmt(run.score)} Punkte`,[['Weiterlaufen',()=>{phase='playing';overlay.hidden=true;hud.hidden=false;$('home').hidden=true;last=performance.now()},true],['Level neu starten',()=>start(run.level)],['Level wählen',menu]])}else if(phase==='paused'){phase='playing';overlay.hidden=true;hud.hidden=false;$('home').hidden=true;last=performance.now()}}
window.addEventListener('keydown',e=>{const k=e.key.toLowerCase();if([' ','arrowleft','arrowright','arrowup','arrowdown'].includes(k))e.preventDefault();keys.add(k);if(k==='p'||k==='escape')togglePause();if((k===' '||k==='enter')&&!e.repeat&&phase==='playing')fire()});window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>{keys.clear();pressed.left=pressed.right=false;if(phase==='playing')togglePause()});
canvas.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'&&phase==='playing'){aim.x=clamp(e.clientX/innerWidth*2-1,-.85,.85);aim.y=clamp(1-e.clientY/innerHeight*2,-.58,.58);updateReticle()}});
canvas.addEventListener('pointerdown',e=>{if(phase!=='playing')return;e.preventDefault();aim.x=clamp(e.clientX/innerWidth*2-1,-.85,.85);aim.y=clamp(1-e.clientY/innerHeight*2,-.58,.58);updateReticle();fire()});
for(const id of ['left','right']){const b=$(id);b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);pressed[id]=true});for(const ev of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(ev,()=>pressed[id]=false)}$('fire').addEventListener('pointerdown',e=>{e.preventDefault();fire()});$('pause').onclick=togglePause;
try{makeWorld();camera.position.set(0,1.7,2);camera.lookAt(0,1.6,-8);buildLevel(1);const q=new URLSearchParams(location.search),l=Number(q.get('l')),p=Number(q.get('p'));menu();if(Number.isInteger(l)&&l>=1&&l<=20&&Number.isInteger(p)&&p>=0&&p<=999999){$('message').textContent=`Ein Freund hat Level ${l}/20 geschafft und ${fmt(p)} Punkte geholt. Schaffst du mehr?`;}$('scene').tabIndex=0;last=performance.now();raf=requestAnimationFrame(frame)}catch(error){console.error(error);setPanel('TECHNISCHER FEHLER','3D nicht verfügbar','Dieses Gerät konnte die 3D-Grafik nicht starten. Prüfe, ob WebGL im Browser aktiviert ist.','',[['Zurück zu PlaySaal',()=>location.href='/']])}
