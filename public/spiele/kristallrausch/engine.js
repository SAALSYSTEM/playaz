/* Kristallrausch – eigene, deterministische Höhlen-Engine. Keine DOM-Abhängigkeiten. */
export const WIDTH = 18;
export const HEIGHT = 14;
export const LEVEL_COUNT = 20;
export const TILE = Object.freeze({ EMPTY:' ', DIRT:'.', WALL:'#', ROCK:'O', GEM:'*', EXIT:'E' });
const xy = (x,y) => x + ',' + y;
const within = (x,y) => x>=0 && y>=0 && x<WIDTH && y<HEIGHT;
const randFor = (seed) => { let s=seed>>>0; return () => ((s=Math.imul(s^s>>>15,1|s),s^=s+Math.imul(s^s>>>7,61|s),((s^s>>>14)>>>0)/4294967296)); };
export function makeLevel(number) {
  const n=Math.max(1,Math.min(LEVEL_COUNT,Math.floor(Number(number)||1)));
  const random=randFor((n*0x9e3779b1)>>>0);
  const grid=Array.from({length:HEIGHT},(_,y)=>Array.from({length:WIDTH},(_,x)=>(!x||!y||x===WIDTH-1||y===HEIGHT-1)?TILE.WALL:TILE.DIRT));
  const set=(x,y,t)=>{grid[y][x]=t;};
  for(let y=1;y<HEIGHT-1;y++) for(let x=1;x<WIDTH-1;x++) {
    if(random()<.115) set(x,y,TILE.EMPTY);
  }
  // Die ersten Schritte und die Zufahrt zum Ausgang bleiben felsfrei.
  for(let y=2;y<HEIGHT-2;y++) if(random()<.28) set(2,y,TILE.EMPTY);
  const rocks=12+Math.floor(n*.7);
  let count=0,tries=0;
  while(count<rocks && tries++<1000) {
    const x=3+Math.floor(random()*(WIDTH-6)),y=2+Math.floor(random()*(HEIGHT-5));
    if(grid[y][x]===TILE.DIRT) {set(x,y,TILE.ROCK);count++;}
  }
  // Ein paar kleine, unzerstörbare Pfeiler ab der zweiten Welt.
  if(n>5) for(let i=0;i<Math.min(4,Math.floor(n/5));i++) {
    const x=6+i*3,y=4+((n+i*3)%5);
    if(grid[y][x]===TILE.DIRT) set(x,y,TILE.WALL);
  }
  let gems=0;
  const amount=11+Math.floor((n-1)/3);
  tries=0;
  while(gems<amount && tries++<1000) {
    const x=2+Math.floor(random()*(WIDTH-4)),y=2+Math.floor(random()*(HEIGHT-4));
    if(grid[y][x]===TILE.DIRT||grid[y][x]===TILE.EMPTY) {set(x,y,TILE.GEM);gems++;}
  }
  // Immer zwei leicht erreichbare Kristalle im Einstieg.
  for(const [x,y] of [[3,1],[1,3]]) {if(grid[y][x]!==TILE.GEM) {set(x,y,TILE.GEM);gems++;}}
  for(const [x,y] of [[1,1],[1,2],[2,1],[2,2],[WIDTH-3,HEIGHT-2],[WIDTH-2,HEIGHT-3]]) {
    if(grid[y][x]===TILE.GEM) gems--;
    set(x,y,TILE.EMPTY);
  }
  set(WIDTH-2,HEIGHT-2,TILE.EXIT);
  const needed=Math.max(5,Math.min(gems,Math.ceil(gems*.7)));
  return {number:n,grid,spawn:{x:1,y:1},exit:{x:WIDTH-2,y:HEIGHT-2},total:gems,needed,time:155-Math.min(n-1,15)*2};
}
export function createGame(number=1) {
  const level=makeLevel(number);
  return {...level,player:{...level.spawn},collected:0,score:0,timeLeft:level.time,ticks:0,falling:new Set(),status:'playing',lastEvent:'start'};
}
export function tile(g,x,y) {return within(x,y)?g.grid[y][x]:TILE.WALL;}
export function canEnter(g,x,y) {const t=tile(g,x,y);return t===TILE.EMPTY||t===TILE.DIRT||t===TILE.GEM||(t===TILE.EXIT&&g.collected>=g.needed);}
export function move(g,dx,dy) {
  if(g.status!=='playing'||Math.abs(dx)+Math.abs(dy)!==1)return false;
  const x=g.player.x+dx,y=g.player.y+dy,t=tile(g,x,y);
  if(t===TILE.WALL)return false;
  if(t===TILE.EXIT&&g.collected<g.needed) {g.lastEvent='locked';return false;}
  if(t===TILE.ROCK) {
    // Waagerecht schieben, sofern der Fels sich nicht gerade im Sturz befindet.
    if(dy||g.falling.has(xy(x,y))||tile(g,x+dx,y)!==TILE.EMPTY||(g.player.x===x+dx&&g.player.y===y))return false;
    g.grid[y][x+dx]=TILE.ROCK;
    g.grid[y][x]=TILE.EMPTY;
    g.falling.delete(xy(x,y));
    g.lastEvent='push';
  } else if(t===TILE.GEM) {
    g.collected++;
    g.score+=100;
    g.grid[y][x]=TILE.EMPTY;
    g.lastEvent='gem';
  } else if(t===TILE.DIRT) {
    g.grid[y][x]=TILE.EMPTY;
    g.score+=2;
    g.lastEvent='dig';
  } else if(t===TILE.EXIT) {
    g.player={x,y};g.status='won';g.score+=Math.ceil(g.timeLeft)*5;g.lastEvent='won';return true;
  } else g.lastEvent='step';
  g.player={x,y};return true;
}
export function tick(g,dt=.2) {
  if(g.status!=='playing')return g;
  g.ticks++;
  g.timeLeft=Math.max(0,g.timeLeft+(-Math.max(0,Math.min(1,dt))));
  if(g.timeLeft===0) {g.status='dead';g.lastEvent='time';return g;}
  const nextFalling=new Set(),occupied=(x,y)=>g.player.x===x&&g.player.y===y;
  const order=g.ticks%2===0?1:-1;
  for(let y=HEIGHT-2;y>=1;y--) for(let k=0;k<WIDTH-2;k++) {
    const x=order===1?k+1:WIDTH-2-k;
    if(tile(g,x,y)!==TILE.ROCK)continue;
    const wasFalling=g.falling.has(xy(x,y));
    let nx=x,ny=y;
    if(tile(g,x,y+1)===TILE.EMPTY) {
      if(occupied(x,y+1)) {
        if(wasFalling){g.status='dead';g.lastEvent='crushed';}
      } else ny=y+1;
    } else if(tile(g,x,y+1)===TILE.ROCK||tile(g,x,y+1)===TILE.WALL) {
      const first=g.ticks%2===0?1:-1;
      for(const dx of [first,-first]) {
        if(tile(g,x+dx,y)===TILE.EMPTY&&tile(g,x+dx,y+1)===TILE.EMPTY&&!occupied(x+dx,y)&&!occupied(x+dx,y+1)) {
          nx=x+dx;ny=y+1;break;
        }
      }
    }
    if(g.status==='dead')break;
    if(nx!==x||ny!==y) {
      g.grid[y][x]=TILE.EMPTY;g.grid[ny][nx]=TILE.ROCK;
      nextFalling.add(xy(nx,ny));
    }
  }
  g.falling=nextFalling;
  return g;
}
export function progress(g) {return Math.min(1,g.collected/g.needed);}
export function freshSave() {return {unlocked:1,best:0,levels:{}};}
export function sanitizeSave(obj) {
  const s=freshSave();
  if(!obj||typeof obj!=='object')return s;
  s.unlocked=Math.max(1,Math.min(LEVEL_COUNT,Math.floor(Number(obj.unlocked)||1)));
  s.best=Math.max(0,Math.floor(Number(obj.best)||0));
  if(obj.levels&&typeof obj.levels==='object')for(let i=1;i<=LEVEL_COUNT;i++) {
    const v=obj.levels[i];if(!v||typeof v!=='object')continue;
    s.levels[i]={score:Math.max(0,Math.floor(Number(v.score)||0)),stars:Math.max(0,Math.min(3,Math.floor(Number(v.stars)||0)))};
  }
  return s;
}
export function starsFor(g) {return g.status==='won'?(g.timeLeft>g.time*.58?3:g.timeLeft>g.time*.24?2:1):0;}
export function recordWin(save,g) {
  if(g.status!=='won')return sanitizeSave(save);
  const s=sanitizeSave(save),old=s.levels[g.number]||{score:0,stars:0};
  s.levels[g.number]={score:Math.max(old.score,g.score),stars:Math.max(old.stars,starsFor(g))};
  s.best=Math.max(s.best,g.score);
  s.unlocked=Math.max(s.unlocked,Math.min(LEVEL_COUNT,g.number+1));
  return s;
}
