// Deterministic vertical escape levels. Smaller y values are higher in the tower.
export const WORLD_NAMES=['Altstadt','Regenwald','Kristallkanal','Maschinenwerk','Eisgipfel','Wolkenstadt'];
export const WORLD_COLORS=[
  ['#65d1f0','#d9f8ff','#6bc65b','#245f51'],['#38bfa8','#c6f5cb','#43a452','#174f43'],
  ['#5552a9','#151b4e','#43cee3','#8b68e8'],['#f59b3f','#ffe2a1','#e05e3d','#624743'],
  ['#76caff','#eefaff','#91bde1','#4e739c'],['#72a9ff','#f0f7ff','#b494ef','#6158a8']
];
export const LEVEL_COUNT=30;
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function seeded(seed=1){let s=seed>>>0;return()=>((s=(s*1664525+1013904223)>>>0)/4294967296);}
export function overlap(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;}
export function hitsUnderside(body,oldY,platform){return body.vy<0&&body.x+body.w>platform.x+7&&body.x<platform.x+platform.w-7&&oldY>=platform.y+platform.h-12&&body.y<=platform.y+platform.h;}
export function waterPosition(level,elapsed,climb){return level.water.startY-elapsed*level.water.speed-Math.max(0,climb)*.78;}
export function advanceWater(previous,level,elapsed,climb){return Math.min(previous,waterPosition(level,elapsed,climb));}

export function makeLevel(number){
  const n=clamp(Math.floor(number)||1,1,LEVEL_COUNT),world=Math.floor((n-1)/5),step=(n-1)%5,rnd=seeded(7301+n*811);
  const width=900,height=3400,platforms=[],items=[],hazards=[];
  const floor={x:0,y:3260,w:900,h:80,type:'ground'};platforms.push(floor);
  let y=3090;
  const route=[];
  for(let i=0;i<23;i++){
    const w=180+Math.floor(rnd()*41),firstOuter=n%2?2:0;
    const lane=i%2===1?1:(Math.floor(i/2)%2?2-firstOuter:firstOuter);
    const x=[40,350,660][lane]+Math.floor((rnd()-.5)*17);
    let type='solid';
    if(n>=8&&i>4&&i%8===(step+2)%8)type='moving';
    const p={x,y,w,h:34,type,index:i};
    if(type==='moving')Object.assign(p,{baseX:x,range:35+step*8,speed:.75+world*.08,phase:rnd()*6.28});
    platforms.push(p);route.push(p);
    const coinCount=i%3===0?3:2;for(let c=0;c<coinCount;c++)items.push({x:x+w/2+(c-(coinCount-1)/2)*48,y:y-46,type:'coin'});
    if([5,12,19].includes(i))items.push({x:x+w/2,y:y-75,type:'star',id:[5,12,19].indexOf(i)});
    if(n>=3&&i===3+step%3)items.push({x:x+w/2,y:y-25,type:'spring'});
    if(n>=16&&i===9+step%4)items.push({x:x+w/2,y:y-52,type:'jetpack'});
    if(n>=11&&i>5&&i%9===4)hazards.push({x:x+w/2,y:y-28,type:'bird',range:135+world*10,phase:rnd()*6.28});
    y-=118+Math.floor(rnd()*27);
  }
  const top=route.at(-1),goal={x:clamp(top.x+top.w/2-55,35,755),y:top.y-145,w:110,h:145};
  const water={startY:height+120,speed:38+world*5+step*2.4};
  return{number:n,name:`${WORLD_NAMES[world]} · ${step+1}`,world,step,width,height,spawn:{x:420,y:floor.y-82},goal,platforms,route,items,hazards,water};
}

export function freshSave(){return{version:2,unlocked:1,levels:{},muted:false,bestHeight:0};}
export function sanitizeSave(raw){
  const s=freshSave();if(!raw||typeof raw!=='object')return s;
  s.unlocked=clamp(Math.floor(raw.unlocked)||1,1,LEVEL_COUNT);s.muted=!!raw.muted;s.bestHeight=Math.max(0,Math.floor(raw.bestHeight)||0);
  for(const[k,v]of Object.entries(raw.levels||{})){const n=Number(k);if(n>=1&&n<=LEVEL_COUNT&&v&&typeof v==='object')s.levels[n]={stars:clamp(Math.floor(v.stars)||0,0,3),coins:Math.max(0,Math.floor(v.coins)||0),time:Number(v.time)>0?Number(v.time):null};}
  return s;
}
export function totalStars(save){return Object.values(save.levels||{}).reduce((sum,v)=>sum+(Number(v.stars)||0),0);}
export function completedLevels(save){return Object.keys(save.levels||{}).filter(k=>save.levels[k]&&save.levels[k].time).length;}
export function recordLevel(save,number,result){
  const old=save.levels[number]||{stars:0,coins:0,time:null};
  save.levels[number]={stars:Math.max(old.stars,result.stars||0),coins:Math.max(old.coins,result.coins||0),time:old.time?Math.min(old.time,result.time):result.time};
  save.unlocked=Math.max(save.unlocked,Math.min(LEVEL_COUNT,number+1));save.bestHeight=Math.max(save.bestHeight,number);return save;
}
export function challengeText(level,stars){return`Ich bin bei SprungSebi bis Level ${level} vor dem Hochwasser geflohen und habe ${stars} Sterne gesammelt. Kommst du höher?`;}
