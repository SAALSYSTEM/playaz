export const WIDTH=9,HEIGHT=18;
export const ROW_WIDTHS=[9,9,9,7,7,5,5,3,3,3,5,5,7,7,9,9,9,9];
export const MASK=ROW_WIDTHS.map(width=>{
  const start=(WIDTH-width)/2;
  return Array.from({length:WIDTH},(_,x)=>x>=start&&x<start+width);
});

// Keine sieben Tetrominos: zwei Triominos und zwei Pentominos.
export const SHAPES=[
  [[0,0],[0,1],[0,2]],
  [[0,0],[0,1],[1,1]],
  [[0,0],[2,0],[0,1],[1,1],[2,1]],
  [[1,0],[0,1],[1,1],[2,1],[1,2]]
];
export const NAMES=['Nadel','Winkel','Krone','Stern'];
export const CORE=4;

function clone(cells){return cells.map(([x,y])=>[x,y]);}
function bounds(cells){
  return {w:Math.max(...cells.map(c=>c[0]))+1,h:Math.max(...cells.map(c=>c[1]))+1};
}
function normalized(cells){
  const minX=Math.min(...cells.map(c=>c[0])),minY=Math.min(...cells.map(c=>c[1]));
  return cells.map(([x,y])=>[x-minX,y-minY]);
}
export function bag(random=Math.random){
  const values=[0,1,2,3];
  for(let i=values.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[values[i],values[j]]=[values[j],values[i]];}
  return values;
}
function fillQueue(game){while(game.queue.length<5)game.queue.push(...bag(game.random));}
export function active(x,y){return y>=0&&y<HEIGHT&&x>=0&&x<WIDTH&&MASK[y][x];}
export function fits(game,piece,x=piece.x,y=piece.y,cells=piece.cells){
  return cells.every(([cx,cy])=>{
    const px=x+cx,py=y+cy;
    if(px<0||px>=WIDTH||py>=HEIGHT)return false;
    if(py<0)return MASK[0][px];
    return MASK[py][px]&&!game.board[py][px];
  });
}
export function createGame(random=Math.random){
  const game={board:Array.from({length:HEIGHT},()=>Array(WIDTH).fill(0)),queue:[],current:null,score:0,cores:0,pieces:0,over:false,routeNeeded:false,pendingCores:0,lastClear:0,random};
  fillQueue(game);spawn(game);return game;
}
export function spawn(game){
  if(game.over||game.routeNeeded)return false;
  fillQueue(game);const type=game.queue.shift(),cells=clone(SHAPES[type]),{w}=bounds(cells);
  const piece={type,cells,x:Math.floor((WIDTH-w)/2),y:-1,core:false};
  game.current=piece;
  if(!fits(game,piece)){game.over=true;return false;}
  return true;
}
export function routeCore(game,side){
  if(game.over||!game.routeNeeded||!['left','right'].includes(side))return false;
  const x=side==='left'?1:WIDTH-2;
  game.pendingCores=Math.max(0,game.pendingCores-1);game.routeNeeded=false;
  game.current={type:CORE,cells:[[0,0]],x,y:0,core:true,rail:side};
  if(!fits(game,game.current)){game.over=true;return false;}
  return true;
}
export function move(game,dx,dy){
  const p=game.current;if(game.over||game.routeNeeded||!p||!fits(game,p,p.x+dx,p.y+dy))return false;
  p.x+=dx;p.y+=dy;return true;
}
export function rotate(game){
  const p=game.current;if(game.over||game.routeNeeded||!p)return false;
  if(p.core||p.cells.length===1)return true;
  const {h}=bounds(p.cells),cells=normalized(p.cells.map(([x,y])=>[h-1-y,x]));
  for(const dx of [0,-1,1,-2,2])if(fits(game,p,p.x+dx,p.y,cells)){p.x+=dx;p.cells=cells;return true;}
  return false;
}
function settle(board){
  let moved=true,guard=0;
  while(moved&&guard++<HEIGHT*WIDTH){
    moved=false;
    for(let y=HEIGHT-2;y>=0;y--)for(let x=0;x<WIDTH;x++){
      const value=board[y][x];if(!value)continue;
      if(active(x,y+1)&&!board[y+1][x]){board[y+1][x]=value;board[y][x]=0;moved=true;continue;}
      const toward=x<WIDTH/2?1:-1;
      if(!active(x,y+1)&&active(x+toward,y+1)&&!board[y+1][x+toward]){
        board[y+1][x+toward]=value;board[y][x]=0;moved=true;
      }
    }
  }
}
function compress(game){
  const full=[];
  for(let y=0;y<HEIGHT;y++)if(MASK[y].every((on,x)=>!on||game.board[y][x]))full.push(y);
  if(!full.length)return 0;
  for(const y of full)for(let x=0;x<WIDTH;x++)if(MASK[y][x])game.board[y][x]=0;
  settle(game.board);
  game.cores+=full.length;game.pendingCores+=full.length;game.routeNeeded=true;game.current=null;game.lastClear=full.length;
  const level=1+Math.floor((game.cores-full.length)/4);
  game.score+=full.length*250*level+(full.length>1?(full.length-1)*150*level:0);
  return full.length;
}
export function lock(game){
  const piece=game.current;if(game.over||game.routeNeeded||!piece)return 0;
  if(piece.cells.some(([,cy])=>piece.y+cy<0)){game.over=true;return 0;}
  for(const [cx,cy] of piece.cells)game.board[piece.y+cy][piece.x+cx]=piece.type+1;
  game.pieces++;game.current=null;game.lastClear=0;
  const cleared=compress(game);
  if(!cleared){if(game.pendingCores>0)game.routeNeeded=true;else spawn(game);}
  return cleared;
}
function fallOne(game){
  if(move(game,0,1))return true;
  const p=game.current;if(!p||p.y>=10)return false;
  const {w}=bounds(p.cells),middle=p.x+(w-1)/2,primary=middle<4?1:middle>4?-1:0;
  const directions=primary?[primary,-primary]:[-1,1];
  for(const dx of directions)if(fits(game,p,p.x+dx,p.y+1)){p.x+=dx;p.y++;return true;}
  return false;
}
export function tick(game){
  if(game.over||game.routeNeeded||!game.current)return 0;
  if(!fallOne(game))return lock(game);
  return 0;
}
export function hardDrop(game){
  if(game.over||game.routeNeeded||!game.current)return 0;
  let cells=0;while(fallOne(game))cells++;
  game.score+=cells*2;return lock(game);
}
export function level(game){return 1+Math.floor(game.cores/4);}
export function gravityMs(game){return Math.max(150,900*Math.pow(.84,level(game)-1));}
export function challengeCores(search){
  const raw=new URLSearchParams(search).get('c');
  return raw!==null&&/^(0|[1-9]\d{0,3})$/.test(raw)?Number(raw):null;
}
export function challengeText(cores,url){
  return `⌛ Ich habe ${cores} ${cores===1?'Kern':'Kerne'} bei Sanduhrblock erzeugt! Schlägst du mich? 🧲 ${url}`;
}
