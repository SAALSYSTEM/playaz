import test from 'node:test';
import assert from 'node:assert/strict';
import {LEVELS,makeLevel,hitValue,finishBonus,shareText} from '../public/spiele/geisterschloss/engine.js';

test('20 deterministic corridors: supplies precede enemies and each boss is reachable',()=>{
 assert.equal(LEVELS.length,20);
 for(let i=1;i<=20;i++){
  const a=makeLevel(i),b=makeLevel(i);
  assert.deepEqual(a,b);
  assert.equal(a.entries.filter(e=>e.type==='big'||e.type==='boss').length,i%5===0?1:0);
  assert.ok(a.entries.every(e=>e.d>0&&e.d<a.length&&[-1.65,0,1.65].includes(e.x)));
  let ammo=a.startGarlic;
  for(const e of [...a.entries].sort((x,y)=>x.d-y.d)){
   if(e.type==='garlic')ammo+=e.value;
   else if(e.hp)ammo-=e.hp;
   assert.ok(ammo>=0,`Level ${i}: too little garlic before ${e.type} at ${e.d}`);
  }
 }
});
test('score and share text are bounded and meaningful',()=>{
 assert.equal(hitValue('ghost',0),120);
 assert.equal(hitValue('ghost',99),600);
 assert.equal(finishBonus(2,3,1),575);
 assert.match(shareText(7,12450),/Level 7\/20.*12\.450 Punkte/);
 assert.throws(()=>makeLevel(21));
});
