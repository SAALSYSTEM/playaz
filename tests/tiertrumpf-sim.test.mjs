import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../public/spiele/tiertrumpf/engine.js';
function rng(seed) { return () => ((seed = Math.imul(seed,1664525) + 1013904223 >>> 0) / 4294967296); }
function rig(value, level=3) {
  const s=E.create(level,rng(8));
  const cards=E.deck(level); const first=cards.find(c=>c.color==='red'&&c.value==='elephant');
  const chosen=cards.find(c=>c.id!==first.id&&c.value===value&&(c.color==='red'||c.color==='wild'));
  s.discard=[first];s.color='red';s.hands=[[chosen,cards.find(c=>c.color==='blue'&&c.value==='cat')],[cards.find(c=>c.color==='green'&&c.value==='lion')]];
  const used=new Set([...s.discard,...s.hands.flat()].map(c=>c.id));s.pile=cards.filter(c=>!used.has(c.id));return s;
}
test('three decks, five cards each, animal start, valid restore',()=>{
  for(let level=1;level<=3;level++){
    assert.equal(E.deck(level).length,[0,48,52,60][level]);
    const s=E.create(level,rng(5));assert.deepEqual(s.hands.map(h=>h.length),[5,5]);
    assert.ok(E.ANIMALS.includes(s.discard[0].value));assert.ok(E.restore(JSON.stringify(s)));
  }
});
test('matches by color, animal or wild; rejects illegal play without mutation',()=>{
  const s=rig('elephant');const before=JSON.stringify(s);
  assert.equal(E.matches(s,{color:'blue',value:'elephant'}),true);
  assert.equal(E.matches(s,{color:'blue',value:'cat'}),false);
  assert.equal(E.play(s,s.hands[0][1].id),false);assert.equal(JSON.stringify(s),before);
  assert.equal(E.draw(s),false);
});
test('wild requires color and updates next player',()=>{
  const s=rig('wild');const id=s.hands[0][0].id;
  assert.equal(E.play(s,id),false);assert.equal(E.play(s,id,'purple'),false);
  assert.equal(E.play(s,id,'blue'),true);assert.equal(s.color,'blue');assert.equal(s.turn,1);
});
test('skip and +1 grant another turn; +1 gives exactly one card',()=>{
  for(const value of ['skip','draw1']){const s=rig(value);E.play(s,s.hands[0][0].id);assert.equal(s.turn,0);assert.equal(s.hands[1].length,value==='skip'?1:2);assert.equal(s.drawn,null);}
});
test('last action card wins immediately',()=>{
  for(const value of ['skip','draw1','wild']){const s=rig(value);s.pile.push(s.hands[0].pop());E.play(s,s.hands[0][0].id,'blue');assert.equal(s.winner,0);assert.equal(s.hands[1].length,1);assert.equal(E.draw(s),false);assert.ok(E.restore(JSON.stringify(s)));}
});
test('draw matching card: only it can be played, or retained',()=>{
  const s=rig('elephant');s.pile.push(s.hands[0].shift()); // now only nonmatching blue cat
  assert.equal(E.draw(s),true);assert.equal(s.turn,0);assert.notEqual(s.drawn,null);
  assert.deepEqual(E.legal(s),[s.drawn]);assert.equal(E.draw(s),false);
  assert.equal(E.pass(s),true);assert.equal(s.turn,1);assert.equal(s.drawn,null);
});
test('nonmatching draw advances turn',()=>{
  const s=rig('elephant');s.pile.push(s.hands[0].shift());
  const i=s.pile.findIndex(c=>c.color==='yellow'&&c.value==='rabbit');s.pile.push(...s.pile.splice(i,1));
  E.draw(s);assert.equal(s.turn,1);assert.equal(s.hands[0].length,2);
});
test('recycling retains the top card and avoids a deadlock with no cards',()=>{
  const s=rig('elephant');s.pile.push(s.hands[0].shift());s.discard.unshift(...s.pile);s.pile=[];
  const top=s.discard.at(-1).id;E.draw(s,rng(5));assert.equal(s.discard.length,1);assert.equal(s.discard[0].id,top);
  const blocked={...s,pile:[],discard:[{id:90,color:'red',value:'elephant'}],hands:[[{id:91,color:'blue',value:'cat'}],[{id:92,color:'green',value:'lion'}]],turn:0,drawn:null,passes:0,winner:null};
  E.draw(blocked);E.draw(blocked);assert.equal(blocked.winner,'tie');
});
test('corrupt saves rejected',()=>{
  assert.equal(E.restore('oops'),null);
  const s=E.create(3);s.hands[0][0].value='<script>';assert.equal(E.restore(JSON.stringify(s)),null);
  const d=E.create(1);d.pile[0]=d.hands[0][0];assert.equal(E.restore(JSON.stringify(d)),null);
});
test('900 seeded full games conserve cards, obey legal moves, restore and finish',()=>{
  for(let level=1;level<=3;level++)for(let seed=1;seed<=300;seed++){
    const random=rng(seed),s=E.create(level,random);let steps=0;
    while(s.winner===null&&steps++<3000){
      assert.equal(E.ai(s,random),true);
      const all=[...s.pile,...s.discard,...s.hands.flat()];
      assert.equal(all.length,E.deck(level).length);assert.equal(new Set(all.map(c=>c.id)).size,all.length);
      assert.ok(E.restore(JSON.stringify(s)));
    }
    assert.notEqual(s.winner,null,`level ${level} seed ${seed}`);
  }
});
test('last wild needs no color choice; wild with cards left still does',()=>{
  const s=rig('wild');s.pile.push(s.hands[0].pop());
  assert.equal(E.play(s,s.hands[0][0].id),true);assert.equal(s.winner,0);assert.ok(E.COLORS.includes(s.color));
  const t=rig('wild');assert.equal(E.play(t,t.hands[0][0].id),false);assert.equal(t.hands[0].length,2);
});
test('animal numbers are fixed 1 to 6',()=>{
  assert.deepEqual(E.ANIMALS.map(E.number),[1,2,3,4,5,6]);assert.equal(E.number('wild'),0);
});
test('last-step info for the interface: play, +1 extra card, draw, keep, empty pile',()=>{
  const s=rig('draw1');const id=s.hands[0][0].id;E.play(s,id);
  assert.equal(s.last.type,'play');assert.equal(s.last.who,0);assert.equal(s.last.card,id);assert.equal(s.last.extra,s.hands[1].at(-1).id);
  const d=rig('elephant');d.pile.push(d.hands[0].shift());E.draw(d);assert.equal(d.last.type,'draw');assert.equal(d.last.card,d.hands[0].at(-1).id);
  if(d.drawn!==null){E.pass(d);assert.equal(d.last.type,'keep');}
});
test('Fiete uses no hidden information: same own hand and open cards give the same move',()=>{
  for(let seed=1;seed<=200;seed++){
    const a=E.create(3,rng(seed));a.turn=1;
    const b=JSON.parse(JSON.stringify(a));
    // Verdeckte Informationen vertauschen: Hand des Kindes und Nachziehstapel
    const pool=[...b.hands[0],...b.pile];E.shuffle(pool,rng(seed*7+1));b.hands[0]=pool.splice(0,b.hands[0].length);b.pile=pool;
    const ra=rng(99),rb=rng(99);
    if(E.legal(a).length===0)continue; // Ziehen hängt naturgemäß vom Stapel ab
    E.ai(a,ra);E.ai(b,rb);
    assert.deepEqual([a.last.type,a.last.card],[b.last.type,b.last.card],`seed ${seed}`);assert.equal(a.color,b.color);
  }
});
test('restore accepts objects, strips unknown fields and returns an independent copy',()=>{
  const s=E.create(2,rng(3));s.hands[0][0].evil='<img>';const r=E.restore(s);
  assert.ok(r);assert.equal(r.hands[0][0].evil,undefined);r.hands[0].pop();assert.equal(s.hands[0].length,5);
  assert.equal(E.restore({...s,drawn:'1'}),null);assert.equal(E.restore(null),null);
});
test('kid can always act on her turn: play, draw, keep or the round ends',()=>{
  for(let level=1;level<=3;level++)for(let seed=1;seed<=100;seed++){
    const random=rng(seed+1000),s=E.create(level,random);let steps=0;
    while(s.winner===null&&steps++<3000){
      if(s.turn===0){
        const ids=E.legal(s);
        if(ids.length){ const pick=ids[Math.floor(random()*ids.length)],c=s.hands[0].find(k=>k.id===pick);
          // Kind behält eine gezogene Karte manchmal
          if(s.drawn!==null&&random()<.3){assert.equal(E.pass(s),true);continue;}
          assert.equal(E.play(s,c.id,E.COLORS[Math.floor(random()*4)],random),true);
        } else assert.equal(E.draw(s,random),true);
      } else assert.equal(E.ai(s,random),true);
    }
    assert.notEqual(s.winner,null);
  }
});
