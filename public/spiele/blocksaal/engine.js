export const WIDTH = 10, HEIGHT = 20;
export const SHAPES = [
  [[0,1],[1,1],[2,1],[3,1]],
  [[0,0],[0,1],[1,1],[2,1]],
  [[2,0],[0,1],[1,1],[2,1]],
  [[1,0],[2,0],[1,1],[2,1]],
  [[1,0],[2,0],[0,1],[1,1]],
  [[1,0],[0,1],[1,1],[2,1]],
  [[0,0],[1,0],[1,1],[2,1]]
];

export function bag(random = Math.random) {
  const types = SHAPES.map((_, i) => i);
  for (let i = types.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [types[i], types[j]] = [types[j], types[i]];
  }
  return types;
}
function fillQueue(game) { while (game.queue.length < 8) game.queue.push(...bag(game.random)); }
export function createGame(random = Math.random) {
  const game = {board:Array.from({length:HEIGHT},()=>Array(WIDTH).fill(0)), queue:[], current:null,
    score:0, lines:0, over:false, random};
  spawn(game); return game;
}
export function fits(game, piece, x = piece.x, y = piece.y, cells = piece.cells) {
  return cells.every(([cx,cy]) => {
    const col=x+cx, row=y+cy;
    return col >= 0 && col < WIDTH && row < HEIGHT && (row < 0 || game.board[row][col] === 0);
  });
}
export function spawn(game) {
  fillQueue(game);
  const type = game.queue.shift();
  game.current = {type,x:3,y:-1,cells:SHAPES[type].map(cell=>[...cell])};
  if (!fits(game, game.current)) game.over=true;
}
export function move(game, dx, dy) {
  if (game.over || !fits(game,game.current,game.current.x+dx,game.current.y+dy)) return false;
  game.current.x += dx; game.current.y += dy; return true;
}
export function rotate(game) {
  if (game.over) return false;
  if (game.current.type === 3) return true;
  const cells=game.current.cells.map(([x,y])=>[2-y,x]);
  for (const dx of [0,-1,1,-2,2]) {
    if (fits(game,game.current,game.current.x+dx,game.current.y,cells)) {
      game.current.x+=dx; game.current.cells=cells; return true;
    }
  }
  return false;
}
export function lock(game) {
  if (game.over) return 0;
  const piece=game.current;
  if (piece.cells.some(([,cy])=>piece.y+cy < 0)) { game.over=true; return 0; }
  for (const [cx,cy] of piece.cells) game.board[piece.y+cy][piece.x+cx]=piece.type+1;
  const rest=game.board.filter(row=>row.some(v=>v===0));
  const cleared=HEIGHT-rest.length;
  game.board=[...Array.from({length:cleared},()=>Array(WIDTH).fill(0)),...rest];
  game.score += [0,100,300,500,800][cleared]*(Math.floor(game.lines/10)+1);
  game.lines += cleared;
  spawn(game);
  return cleared;
}
export function tick(game) { if (game.over) return 0; if (!move(game,0,1)) return lock(game); return 0; }
export function hardDrop(game) {
  if (game.over) return 0;
  let cells=0; while (move(game,0,1)) cells++;
  game.score += cells*2;
  return lock(game);
}
export function gravityMs(game) { return Math.max(100, 800*Math.pow(.84,Math.floor(game.lines/10))); }
export function challengeLines(search) {
  const raw=new URLSearchParams(search).get('c');
  return raw !== null && /^(0|[1-9]\d{0,3})$/.test(raw) ? Number(raw) : null;
}
export function challengeText(lines, url) {
  return `🧱 Ich habe ${lines} ${lines === 1 ? 'Reihe' : 'Reihen'} bei BlockSaal geschafft! Schlägst du mich? 🎮 ${url}`;
}
