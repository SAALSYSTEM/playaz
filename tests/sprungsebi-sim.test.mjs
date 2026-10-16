import{test}from'node:test';
import assert from'node:assert/strict';
import{readFileSync}from'node:fs';
import{LEVEL_COUNT,WORLD_NAMES,makeLevel,freshSave,sanitizeSave,totalStars,completedLevels,recordLevel,challengeText}from'../public/spiele/sprungsebi/engine.js';
import worker from'../src/worker.js';
import{renderSebiPreview}from'../src/vorschau.js';

test('30 levels cover six worlds with a start, goal, three stars and a safe path',()=>{
  assert.equal(LEVEL_COUNT,30);assert.equal(WORLD_NAMES.length,6);
  for(let n=1;n<=30;n++){const l=makeLevel(n);assert.equal(l.number,n);assert.equal(l.world,Math.floor((n-1)/5));assert.ok(l.width>3000);assert.ok(l.spawn.x<l.exit.x);assert.equal(l.items.filter(x=>x.type==='star').length,3);assert.ok(l.platforms.some(p=>p.type==='ground'&&p.x===0));assert.ok(l.platforms.some(p=>p.type==='ground'&&p.x+p.w>=l.width));}
});
test('mechanics are introduced gradually across the campaign',()=>{
  assert.ok(!makeLevel(2).items.some(x=>x.type==='spring'));assert.ok(makeLevel(3).items.some(x=>x.type==='spring'));
  assert.ok(makeLevel(5).items.some(x=>x.type==='boost'));assert.ok(makeLevel(8).ladders.length);
  assert.ok(makeLevel(11).platforms.some(x=>x.type==='moving'));assert.ok(makeLevel(16).items.some(x=>x.type==='jetpack'));assert.ok(makeLevel(21).enemies.some(x=>x.type==='flyer'));
});
test('progress preserves best stars, coins and fastest time',()=>{const s=freshSave();recordLevel(s,1,{stars:2,coins:12,time:44});recordLevel(s,1,{stars:1,coins:15,time:51});recordLevel(s,2,{stars:3,coins:8,time:39});assert.equal(s.unlocked,3);assert.deepEqual(s.levels[1],{stars:2,coins:15,time:44});assert.equal(totalStars(s),5);assert.equal(completedLevels(s),2);});
test('stored progress is bounded and malformed values are ignored',()=>{const s=sanitizeSave({unlocked:99,muted:1,levels:{1:{stars:8,coins:-2,time:-5},99:{stars:3,time:4}}});assert.equal(s.unlocked,30);assert.equal(s.muted,true);assert.deepEqual(s.levels[1],{stars:3,coins:0,time:null});assert.equal(s.levels[99],undefined);});
test('challenge text and worker preview expose reached level and stars',async()=>{assert.match(challengeText(12,28),/Level 12.*28 von 90/);const html=readFileSync(new URL('../public/spiele/sprungsebi.html',import.meta.url),'utf8');const env={ASSETS:{fetch:async()=>new Response(html,{headers:{'Content-Type':'text/html'}})}};const res=await worker.fetch(new Request('https://playsaal.com/spiele/sprungsebi?c=12&s=28'),env),body=await res.text();assert.match(body,/Level 12 erreicht/);assert.match(body,/28 von 90 Sternen/);assert.match(body,/og\/sprungsebi\/12-28.png/);for(const args of [[null,0],[12,28]]){const png=renderSebiPreview(...args);assert.deepEqual([...png.slice(0,8)],[137,80,78,71,13,10,26,10]);}const image=await worker.fetch(new Request('https://playsaal.com/og/sprungsebi/12-28.png'),env);assert.equal(image.status,200);assert.equal(image.headers.get('Content-Type'),'image/png');});
