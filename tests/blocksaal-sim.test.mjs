import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame,HEIGHT,WIDTH,SHAPES,bag,spawn,move,rotate,lock,tick,hardDrop,challengeLines,challengeText} from '../public/spiele/blocksaal/engine.js';
import {renderPreview} from '../src/vorschau.js';
import worker from '../src/worker.js';
import {readFileSync} from 'node:fs';

test('seven-bag includes every shape once and spawns within the board',()=>{
  assert.deepEqual([...bag(()=>0.5)].sort(),[0,1,2,3,4,5,6]);
  const game=createGame(()=>0.5);
  assert.equal(game.board.length,HEIGHT);assert.equal(game.board[0].length,WIDTH);
  assert.ok(game.current.cells.every(([x])=>x+game.current.x>=0&&x+game.current.x<WIDTH));
});
test('four completed rows disappear and award points',()=>{
  const game=createGame();
  for(let y=HEIGHT-4;y<HEIGHT;y++)game.board[y].fill(3);
  for(let y=HEIGHT-4;y<HEIGHT;y++)game.board[y][4]=0;
  game.current={type:0,x:2,y:HEIGHT-5,cells:[[2,1],[2,2],[2,3],[2,4]]};
  assert.equal(lock(game),4);assert.equal(game.lines,4);assert.equal(game.score,800);
  assert.ok(game.board.every(row=>row.every(v=>v===0)));
});
test('a blocked spawn or locked cells above the roof end the game',()=>{
  const game=createGame(()=>0.5);game.board[0].fill(1);spawn(game);assert.equal(game.over,true);
  const another=createGame();another.current={type:3,x:3,y:-1,cells:SHAPES[3]};lock(another);assert.equal(another.over,true);
});
test('movement, rotation and hard drop respect boundaries and lock',()=>{
  const game=createGame();game.current={type:5,x:0,y:0,cells:SHAPES[5].map(c=>[...c])};
  assert.equal(move(game,-1,0),false);assert.equal(rotate(game),true);
  hardDrop(game);assert.equal(game.board.flat().filter(Boolean).length,4);
  assert.equal(game.over,false);
});
test('share parameter is strictly bounded and only presented as a challenge',()=>{
  assert.equal(challengeLines('?c=42'),42);assert.equal(challengeLines('?c=0'),0);
  for(const s of ['?c=0001','?c=10000','?c=-1','?c=abc',''])assert.equal(challengeLines(s),null,s);
  assert.match(challengeText(1,'https://playsaal.com/spiele/blocksaal?c=1'),/1 Reihe.*Schlägst du mich/);
});
test('dynamic preview is a valid 1200 by 630 PNG',()=>{
  for(const count of [null,0,42,9999]){
    const png=renderPreview(count);
    assert.deepEqual([...png.slice(0,8)],[137,80,78,71,13,10,26,10]);
    assert.equal(new DataView(png.buffer).getUint32(16),1200);
    assert.equal(new DataView(png.buffer).getUint32(20),630);
  }
});
test('worker serves dynamic Open Graph metadata and keeps canonical stable',async()=>{
  const html=readFileSync(new URL('../public/spiele/blocksaal.html',import.meta.url),'utf8');
  const env={ASSETS:{fetch:async()=>new Response(html,{headers:{'Content-Type':'text/html'}})}};
  const result=await worker.fetch(new Request('https://playsaal.com/spiele/blocksaal?c=42'),env);
  const body=await result.text();
  assert.match(body,/og:title" content="42 Reihen geschafft – schlägst du mich\?/);
  assert.match(body,/og:image" content="https:\/\/playsaal.com\/og\/blocksaal\/42.png/);
  assert.match(body,/og:url" content="https:\/\/playsaal.com\/spiele\/blocksaal\?c=42/);
  assert.match(body,/rel="canonical" href="https:\/\/playsaal.com\/spiele\/blocksaal"/);
  const bad=await worker.fetch(new Request('https://playsaal.com/og/blocksaal/nope.png'),env);
  assert.equal(bad.status,404);
});
