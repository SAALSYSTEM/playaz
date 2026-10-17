import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderKristallPreview} from '../src/vorschau.js';
import {WIDTH,HEIGHT,LEVEL_COUNT,TILE,makeLevel,createGame,move,tick,recordWin,starsFor,freshSave,sanitizeSave,cameraOrigin} from '../public/spiele/kristallrausch/engine.js';
test('20 deterministic, safe-start caves with enough gems and an accessible exit',()=>{
  assert.equal(LEVEL_COUNT,20);
  for(let i=1;i<=LEVEL_COUNT;i++){
    const a=makeLevel(i),b=makeLevel(i);
    assert.deepEqual(a.grid,b.grid,'fixed seed '+i);
    assert.equal(a.grid.length,HEIGHT);
    assert.ok(a.grid.every(row=>row.length===WIDTH));
    assert.equal(a.grid[a.spawn.y][a.spawn.x],TILE.EMPTY);
    assert.equal(a.grid[a.exit.y][a.exit.x],TILE.EXIT);
    assert.equal(a.grid.flat().filter(t=>t===TILE.GEM).length,a.total);
    const seen=new Set(['1,1']),todo=[[1,1]];let found=0,exit=false;
    for(let q=0;q<todo.length;q++){
      const [x,y]=todo[q],t=a.grid[y][x];
      if(t===TILE.GEM)found++;
      if(t===TILE.EXIT)exit=true;
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const nx=x+dx,ny=y+dy,key=nx+','+ny;
        if(nx<0||ny<0||nx>=WIDTH||ny>=HEIGHT||seen.has(key)||[TILE.WALL,TILE.ROCK].includes(a.grid[ny][nx]))continue;
        todo.push([nx,ny]);seen.add(key);
      }
    }
    assert.ok(found>=a.needed,'gems reachable without pushing rocks in level '+i);
    assert.ok(exit,'exit reachable in level '+i);
  }
});
test('dirt is dug, gems collected, exit remains closed until quota',()=>{
  const g=createGame(1);
  for(let y=1;y<HEIGHT-1;y++)for(let x=1;x<WIDTH-1;x++)g.grid[y][x]=TILE.EMPTY;
  g.grid[2][1]=TILE.DIRT;
  g.grid[3][1]=TILE.GEM;
  assert.equal(move(g,0,1),true);
  assert.equal(g.grid[2][1],TILE.EMPTY);
  assert.equal(move(g,0,1),true);
  assert.equal(g.collected,1);
  g.grid[4][1]=TILE.EXIT;
  assert.equal(move(g,0,1),false);
  g.collected=g.needed;
  assert.equal(move(g,0,1),true);
  assert.equal(g.status,'won');
  const s=recordWin(freshSave(),g);
  assert.equal(s.unlocked,2);
  assert.equal(s.levels[1].score,g.score);
  assert.ok(starsFor(g)>=1);
});
test('rocks push horizontally but cannot be pushed through walls',()=>{
  const g=createGame(1);
  for(let y=1;y<HEIGHT-1;y++)for(let x=1;x<WIDTH-1;x++)g.grid[y][x]=TILE.EMPTY;
  g.player={x:4,y:6};g.grid[6][5]=TILE.ROCK;g.grid[6][7]=TILE.WALL;
  assert.equal(move(g,1,0),true);
  assert.equal(g.grid[6][6],TILE.ROCK);
  assert.equal(move(g,1,0),false);
});
test('falling rocks move one tile at a time and crush only when already falling',()=>{
  const g=createGame(1);
  for(let y=1;y<HEIGHT-1;y++)for(let x=1;x<WIDTH-1;x++)g.grid[y][x]=TILE.EMPTY;
  g.player={x:5,y:5};g.grid[2][5]=TILE.ROCK;
  tick(g);
  assert.equal(g.grid[3][5],TILE.ROCK);
  assert.equal(g.status,'playing');
  tick(g);
  assert.equal(g.grid[4][5],TILE.ROCK);
  tick(g);
  assert.equal(g.status,'dead');
  assert.equal(g.lastEvent,'crushed');
});
test('malformed saves are clamped and cannot unlock nonexisting caves',()=>{
  const s=sanitizeSave({unlocked:999,best:-42,levels:{1:{score:-20,stars:88}}});
  assert.equal(s.unlocked,LEVEL_COUNT);
  assert.equal(s.best,0);
  assert.deepEqual(s.levels[1],{score:0,stars:3});
});

test('mobile camera stays within the cave and includes the player',()=>{
  for(const columns of [10,18])for(const rows of [12,14])for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++){
    const v=cameraOrigin({x,y},columns,rows);
    assert.ok(v.x>=0&&v.y>=0);
    assert.ok(v.x+v.columns<=WIDTH&&v.y+v.rows<=HEIGHT);
    assert.ok(x>=v.x&&x<v.x+v.columns,'x '+x);
    assert.ok(y>=v.y&&y<v.y+v.rows,'y '+y);
  }
  assert.deepEqual(cameraOrigin({x:1,y:1},10,12),{x:0,y:0,columns:10,rows:12});
  assert.deepEqual(cameraOrigin({x:16,y:12},10,12),{x:8,y:2,columns:10,rows:12});
});
test('social preview is a correctly sized 1200x630 PNG',()=>{
  const image=renderKristallPreview();
  assert.deepEqual(Array.from(image.subarray(0,8)),[137,80,78,71,13,10,26,10]);
  const dimensions=new DataView(image.buffer,image.byteOffset,image.byteLength);
  assert.equal(dimensions.getUint32(16),1200);
  assert.equal(dimensions.getUint32(20),630);
  assert.ok(image.byteLength>10000);
});
test('the share endpoint, structured data and mobile controls are wired',()=>{
  const html=readFileSync(new URL('../public/spiele/kristallrausch.html',import.meta.url),'utf8');
  const game=readFileSync(new URL('../public/spiele/kristallrausch/game.js',import.meta.url),'utf8');
  const worker=readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
  assert.match(html,/application\/ld\+json/);
  assert.match(html,/og\/kristallrausch\/start\.png/);
  assert.match(html,/id="map"/);
  assert.match(html,/id="share"/);
  assert.match(game,/navigator\.share\(data\)/);
  assert.match(game,/viewCols=zoomed\?10:WIDTH/);
  assert.match(worker,/renderKristallPreview\(\)/);
});
