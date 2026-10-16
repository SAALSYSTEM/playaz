import{test}from'node:test';
import assert from'node:assert/strict';
import{readFileSync}from'node:fs';
import{LEVEL_COUNT,WORLD_NAMES,makeLevel,hitsUnderside,advanceWater,freshSave,sanitizeSave,totalStars,completedLevels,recordLevel,challengeText}from'../public/spiele/sprungsebi/engine.js';
import worker from'../src/worker.js';
import{renderSebiPreview}from'../src/vorschau.js';

test('30 portrait levels climb through six worlds above rising water',()=>{
  assert.equal(LEVEL_COUNT,30);assert.equal(WORLD_NAMES.length,6);
  for(let n=1;n<=30;n++){
    const l=makeLevel(n);
    assert.equal(l.number,n);assert.equal(l.world,Math.floor((n-1)/5));
    assert.equal(l.width,900);assert.ok(l.height>l.width*3);
    assert.ok(l.goal.y<l.spawn.y);assert.ok(l.water.startY>l.spawn.y);
    assert.equal(l.route.length,23);assert.equal(l.items.filter(x=>x.type==='star').length,3);
    for(let i=1;i<l.route.length;i++){
      const lower=l.route[i-1],upper=l.route[i];
      assert.ok(upper.y<lower.y,'route always climbs');
      assert.ok(lower.y-upper.y<=145,'vertical jump stays reachable');
      assert.ok(Math.abs((lower.x+lower.w/2)-(upper.x+upper.w/2))<350,'horizontal jump stays reachable');
      assert.ok(lower.x+lower.w<upper.x||upper.x+upper.w<lower.x,'solid platforms leave a clear route around their underside');
    }
  }
});

test('solid platform undersides stop Sebis head',()=>{
  const platform={x:300,y:500,w:220,h:34};
  assert.equal(hitsUnderside({x:360,y:520,w:62,h:82,vy:-500},550,platform),true);
  assert.equal(hitsUnderside({x:40,y:520,w:62,h:82,vy:-500},550,platform),false);
  assert.equal(hitsUnderside({x:360,y:520,w:62,h:82,vy:500},550,platform),false);
});

test('the flood keeps rising and follows Sebi up the tower',()=>{
  const level=makeLevel(1),start=level.water.startY;
  assert.equal(advanceWater(start,level,1,4000),start-level.water.speed,'time always raises the water');
  assert.equal(advanceWater(start,level,1,1000),1520,'the flood follows within 520 units');
  const climbed=advanceWater(start,level,1,1000);assert.ok(advanceWater(climbed,level,1,3000)<climbed,'falling never makes the flood recede');
  assert.ok(level.platforms.every(p=>p.type!=='crumble'),'mandatory platforms never disappear');
});

function canJump(lower,upper){
  const direction=(upper.x+upper.w/2)>(lower.x+lower.w/2)?1:-1,starts=[];
  for(let x=lower.x;x<=lower.x+lower.w-62;x+=20)starts.push(x);
  for(const startX of starts)for(const turnAt of [99,.25,.35,.45,.55,.65]){
    const body={x:startX,y:lower.y-82,w:62,h:82,vx:direction*345,vy:-880};
    for(let frame=0;frame<180;frame++){
      const time=frame/120,oldY=body.y,oldBottom=body.y+body.h,target=(time>turnAt?-direction:direction)*345;
      body.vx+=(target-body.vx)*Math.min(1,6/120);body.vy+=2050/120;body.x+=body.vx/120;body.y+=body.vy/120;
      if(hitsUnderside(body,oldY,upper)){body.y=upper.y+upper.h;body.vy=30;}
      if(body.vy>=0&&body.x+body.w>upper.x+7&&body.x<upper.x+upper.w-7&&oldBottom<=upper.y+12&&body.y+body.h>=upper.y)return true;
      if(body.y>lower.y+300)break;
    }
  }
  return false;
}

test('the real jump physics can reach every mandatory platform in all 30 levels',()=>{
  for(let number=1;number<=30;number++){
    const level=makeLevel(number),path=[level.platforms[0],...level.route];
    for(let i=1;i<path.length;i++)assert.ok(canJump(path[i-1],path[i]),`level ${number}, jump ${i}`);
  }
});

test('the flood accelerates and mechanics are introduced gradually',()=>{
  assert.ok(makeLevel(30).water.speed>makeLevel(1).water.speed);
  assert.ok(!makeLevel(2).items.some(x=>x.type==='spring'));assert.ok(makeLevel(3).items.some(x=>x.type==='spring'));
  assert.ok(makeLevel(8).platforms.some(x=>x.type==='moving'));
  assert.ok(makeLevel(11).hazards.some(x=>x.type==='bird'));
  assert.ok(makeLevel(16).items.some(x=>x.type==='jetpack'));
});

test('progress preserves best stars, coins and fastest time',()=>{const s=freshSave();recordLevel(s,1,{stars:2,coins:12,time:44});recordLevel(s,1,{stars:1,coins:15,time:51});recordLevel(s,2,{stars:3,coins:8,time:39});assert.equal(s.unlocked,3);assert.deepEqual(s.levels[1],{stars:2,coins:15,time:44});assert.equal(totalStars(s),5);assert.equal(completedLevels(s),2);});
test('stored progress is bounded and malformed values are ignored',()=>{const s=sanitizeSave({unlocked:99,muted:1,bestHeight:9,levels:{1:{stars:8,coins:-2,time:-5},99:{stars:3,time:4}}});assert.equal(s.unlocked,30);assert.equal(s.muted,true);assert.equal(s.bestHeight,9);assert.deepEqual(s.levels[1],{stars:3,coins:0,time:null});assert.equal(s.levels[99],undefined);});
test('challenge text and worker preview describe the flood escape',async()=>{
  assert.match(challengeText(12,28),/Level 12.*Hochwasser.*28 Sterne/);
  const html=readFileSync(new URL('../public/spiele/sprungsebi.html',import.meta.url),'utf8'),env={ASSETS:{fetch:async()=>new Response(html,{headers:{'Content-Type':'text/html'}})}};
  const res=await worker.fetch(new Request('https://playsaal.com/spiele/sprungsebi?c=12&s=28'),env),body=await res.text();
  assert.match(body,/Bis Level 12 vor dem Hochwasser/);assert.match(body,/28 von 90 Sternen/);assert.match(body,/og\/sprungsebi\/12-28.png/);
  for(const args of [[null,0],[12,28]]){const png=renderSebiPreview(...args);assert.deepEqual([...png.slice(0,8)],[137,80,78,71,13,10,26,10]);}
  const image=await worker.fetch(new Request('https://playsaal.com/og/sprungsebi/12-28.png'),env);assert.equal(image.status,200);assert.equal(image.headers.get('Content-Type'),'image/png');
});
