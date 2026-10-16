import {test} from 'node:test';
import assert from 'node:assert/strict';
import {WIDTH,HEIGHT,ROW_WIDTHS,MASK,SHAPES,CORE,bag,createGame,move,rotate,lock,tick,hardDrop,routeCore,challengeCores,challengeText} from '../public/spiele/sanduhrblock/engine.js';
import {renderSanduhrPreview} from '../src/vorschau.js';
import worker from '../src/worker.js';
import {readFileSync} from 'node:fs';

test('hourglass has a three-cell neck and four non-tetromino shapes',()=>{
  assert.equal(WIDTH,9);assert.equal(HEIGHT,18);assert.equal(Math.min(...ROW_WIDTHS),3);
  assert.deepEqual(ROW_WIDTHS,[9,9,9,7,7,5,5,3,3,3,5,5,7,7,9,9,9,9]);
  assert.equal(SHAPES.length,4);assert.deepEqual(SHAPES.map(s=>s.length),[3,3,5,5]);
  assert.deepEqual([...bag(()=>0.5)].sort(),[0,1,2,3]);
  assert.equal(MASK[8].filter(Boolean).length,3);
});

test('a full band compresses into a routed single-cell core',()=>{
  const game=createGame(()=>0.5),y=HEIGHT-1;
  for(let x=0;x<WIDTH;x++)game.board[y][x]=x===4?0:2;
  game.current={type:CORE,x:4,y,cells:[[0,0]],core:true};
  assert.equal(lock(game),1);assert.equal(game.cores,1);assert.equal(game.routeNeeded,true);assert.equal(game.current,null);
  assert.ok(game.board.every(row=>row.every(v=>v===0)));
  assert.equal(routeCore(game,'left'),true);assert.equal(game.routeNeeded,false);assert.equal(game.current.core,true);assert.equal(game.current.x,1);
  hardDrop(game);assert.equal(game.board.flat().filter(Boolean).length,1);
});

test('movement and rotation respect the narrowing walls',()=>{
  const game=createGame(()=>0.5);game.current={type:0,x:0,y:7,cells:[[0,0],[0,1],[0,2]],core:false};
  assert.equal(move(game,-1,0),false);assert.equal(move(game,1,0),false);
  game.current={type:1,x:3,y:4,cells:SHAPES[1].map(c=>[...c]),core:false};
  assert.equal(rotate(game),true);
  assert.equal(tick(game)>=0,true);
});

test('challenge input and text are bounded',()=>{
  assert.equal(challengeCores('?c=42'),42);assert.equal(challengeCores('?c=0'),0);
  for(const q of ['?c=0001','?c=10000','?c=-1','?c=abc',''])assert.equal(challengeCores(q),null,q);
  assert.match(challengeText(1,'https://playsaal.com/spiele/sanduhrblock?c=1'),/1 Kern.*Schlägst du mich/);
});

test('Sanduhrblock preview and worker metadata are valid',async()=>{
  for(const count of [null,0,42,9999]){
    const png=renderSanduhrPreview(count);assert.deepEqual([...png.slice(0,8)],[137,80,78,71,13,10,26,10]);
    assert.equal(new DataView(png.buffer).getUint32(16),1200);assert.equal(new DataView(png.buffer).getUint32(20),630);
  }
  const html=readFileSync(new URL('../public/spiele/sanduhrblock.html',import.meta.url),'utf8');
  const env={ASSETS:{fetch:async()=>new Response(html,{headers:{'Content-Type':'text/html'}})}};
  const result=await worker.fetch(new Request('https://playsaal.com/spiele/sanduhrblock?c=42'),env),body=await result.text();
  assert.match(body,/og:title" content="42 Kerne geschafft – schlägst du mich\?/);
  assert.match(body,/og:image" content="https:\/\/playsaal.com\/og\/sanduhrblock\/42.png/);
  assert.match(body,/og:url" content="https:\/\/playsaal.com\/spiele\/sanduhrblock\?c=42/);
  assert.match(body,/rel="canonical" href="https:\/\/playsaal.com\/spiele\/sanduhrblock"/);
});
