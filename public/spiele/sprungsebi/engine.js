// Deterministic level plans and small pure helpers for SprungSebi.
export const WORLD_NAMES = ['Sonnige Hügel','Baumwipfel','Kristallhöhlen','Kunterbunte Werkstatt','Schneeberge','Fliegende Inseln'];
export const WORLD_COLORS = [
  ['#65cbed','#c7f5ff','#58bb58','#277d45'],['#4fc6c8','#b8f2d0','#3da75c','#1d6c47'],
  ['#554aa1','#161c50','#23b5cb','#7563e9'],['#ffad4f','#ffe7a6','#ec6b3d','#795241'],
  ['#83cfff','#eafaff','#7fadd4','#496f9b'],['#70a9ff','#e9f5ff','#a889ef','#5d55a8']
];
export const LEVEL_COUNT = 30;

export function seeded(seed=1){let s=seed>>>0;return()=>((s=(s*1664525+1013904223)>>>0)/4294967296);}
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function overlap(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;}

function ledge(x,y,w,type='solid',extra={}){return{x,y,w,h:34,type,...extra};}
function coinLine(out,x,y,n=5,gap=54){for(let i=0;i<n;i++)out.push({x:x+i*gap,y,type:'coin'});}

export function makeLevel(number){
  const n=clamp(Math.floor(number)||1,1,LEVEL_COUNT),world=Math.floor((n-1)/5),step=(n-1)%5,rnd=seeded(9127+n*499);
  const width=3500+step*260+world*120,groundY=760;
  const platforms=[],items=[],enemies=[],ladders=[],checkpoints=[];
  let x=0,top=groundY;
  while(x<width){
    const seg=500+Math.floor(rnd()*330); top=groundY-(rnd()<.28?Math.floor(rnd()*2)*55:0);
    platforms.push(ledge(x,top,Math.min(seg,width-x),'ground'));
    if(x>650&&rnd()<.75)platforms.push(ledge(x+150,top-150-Math.floor(rnd()*70),190+Math.floor(rnd()*130),n>=6&&rnd()<.22?'crumble':'solid'));
    coinLine(items,x+130,top-70,Math.max(3,Math.floor((seg-180)/70)),62);
    if(x>400&&rnd()<.62)enemies.push({x:x+260+rnd()*Math.max(60,seg-360),y:top-54,type:n>=13&&rnd()<.25?'hopper':'walker'});
    const gap=n<3?70:90+Math.floor(rnd()*Math.min(105,35+n*2));
    x+=seg+gap;
  }
  platforms.push(ledge(width-560,groundY,660,'ground'));
  // Three optional stars: low, high, and close to the finish.
  const highX=Math.floor(width*.52);
  items.push({x:780,y:groundY-95,type:'star',id:0},{x:highX,y:groundY-255,type:'star',id:1},{x:width-420,y:groundY-130,type:'star',id:2});
  platforms.push(ledge(highX-235,groundY-105,150),ledge(highX-55,groundY-200,170));
  if(n>=3){const sx=1080+(step*170)%500;items.push({x:sx,y:groundY-42,type:'spring'});platforms.push(ledge(sx+100,groundY-315,250));coinLine(items,sx+130,groundY-380,4,55);}
  if(n>=5)items.push({x:1480+(step*130)%550,y:groundY-85,type:'boost'});
  if(n>=8){const lx=1850+(step*120)%600;platforms.push(ledge(lx,groundY-330,360));ladders.push({x:lx+45,y:groundY-330,w:48,h:330});coinLine(items,lx+90,groundY-390,5,52);}
  if(n>=11){const mx=2250+(step*145)%550;platforms.push(ledge(mx,groundY-210,220,'moving',{axis:step%2?'y':'x',range:step%2?150:230,speed:55+(n%5)*8,phase:rnd()*6}));}
  if(n>=16){const jx=650+(step*190)%650;items.push({x:jx,y:groundY-90,type:'jetpack'});coinLine(items,jx+250,groundY-360,7,64);platforms.push(ledge(jx+180,groundY-430,540));}
  if(n>=21){for(let i=0;i<2;i++)enemies.push({x:2300+i*320,y:groundY-260-i*45,type:'flyer'});}
  checkpoints.push({x:Math.floor(width*.46),y:groundY-82},{x:Math.floor(width*.76),y:groundY-82});
  return{number:n,name:`${WORLD_NAMES[world]} · ${step+1}`,world,step,width,height:900,groundY,spawn:{x:90,y:groundY-100},exit:{x:width-155,y:groundY-150,w:86,h:150},platforms,items,enemies,ladders,checkpoints};
}

export function freshSave(){return{version:1,unlocked:1,levels:{},muted:false};}
export function sanitizeSave(raw){
  const s=freshSave();if(!raw||typeof raw!=='object')return s;
  s.unlocked=clamp(Math.floor(raw.unlocked)||1,1,LEVEL_COUNT);
  s.muted=!!raw.muted;
  for(const [k,v] of Object.entries(raw.levels||{})){const n=Number(k);if(n>=1&&n<=LEVEL_COUNT&&v&&typeof v==='object')s.levels[n]={stars:clamp(Math.floor(v.stars)||0,0,3),coins:Math.max(0,Math.floor(v.coins)||0),time:Number(v.time)>0?Number(v.time):null};}
  return s;
}
export function totalStars(save){return Object.values(save.levels||{}).reduce((sum,v)=>sum+(Number(v.stars)||0),0);}
export function completedLevels(save){return Object.keys(save.levels||{}).filter(k=>save.levels[k]&&save.levels[k].time).length;}
export function recordLevel(save,number,result){
  const old=save.levels[number]||{stars:0,coins:0,time:null};
  save.levels[number]={stars:Math.max(old.stars,result.stars||0),coins:Math.max(old.coins,result.coins||0),time:old.time?Math.min(old.time,result.time):result.time};
  save.unlocked=Math.max(save.unlocked,Math.min(LEVEL_COUNT,number+1));return save;
}
export function challengeText(level,stars){return`Ich habe bei SprungSebi Level ${level} erreicht und ${stars} von 90 Sternen gesammelt. Bist du besser? Jetzt spielen!`;}
