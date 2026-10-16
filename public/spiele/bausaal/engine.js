// Pure voxel packing rules. Nothing clears: every placed cell stays in the room.
export const ROOMS = {
  schacht: {name:'Bauschacht', width:5, depth:5, height:6, accepts:()=>true},
  kamin: {name:'Kamin', width:3, depth:4, height:8, accepts:()=>true},
  zimmer: {name:'L-Zimmer', width:6, depth:5, height:5, accepts:(x,y)=>x<3||y<3}
};
export const SHAPES = [
  {name:'Träger',cells:[[0,0,0],[1,0,0],[2,0,0]]},
  {name:'Winkel',cells:[[0,0,0],[1,0,0],[0,1,0]]},
  {name:'Platte',cells:[[0,0,0],[1,0,0],[0,1,0],[1,1,0]]},
  {name:'Treppe',cells:[[0,0,0],[1,0,0],[1,0,1]]},
  {name:'Ecke',cells:[[0,0,0],[1,0,0],[0,1,0],[0,0,1]]},
  {name:'Doppelstein',cells:[[0,0,0],[1,0,0]]}
];
export const key=(x,y,z)=>`${x},${y},${z}`;
export function normalize(cells){const min=[0,1,2].map(i=>Math.min(...cells.map(c=>c[i])));return cells.map(c=>c.map((v,i)=>v-min[i]));}
export function transform(cells,axis){return normalize(cells.map(([x,y,z])=>axis==='tip'?[x,-z,y]:[-y,x,z]));}
export function dimensions(cells){return [0,1,2].map(i=>Math.max(...cells.map(c=>c[i]))+1);}
export function makeBag(random=Math.random){const b=SHAPES.flatMap((_,i)=>[i,i]);for(let i=b.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[b[i],b[j]]=[b[j],b[i]];}return b;}
function take(g){if(!g.bag.length)g.bag=makeBag(g.random);return g.bag.pop();}
function spawn(g){const id=g.next;g.next=take(g);const cells=SHAPES[id].cells.map(c=>[...c]);const [w,d]=dimensions(cells);g.active={id,cells,x:Math.floor((g.room.width-w)/2),y:Math.floor((g.room.depth-d)/2)};}
export function createGame(room='schacht',random=Math.random){const spec=ROOMS[room]||ROOMS.schacht;const floor=[];for(let y=0;y<spec.depth;y++)for(let x=0;x<spec.width;x++)if(spec.accepts(x,y))floor.push([x,y]);const g={room:spec,roomId:ROOMS[room]?room:'schacht',floor,capacity:floor.length*spec.height,occupied:new Map(),bag:[],random,next:0,active:null,filled:0,placed:0,waste:0,score:0,over:false};g.next=take(g);spawn(g);return g;}
export function footprintFits(g,cells,x,y){return cells.every(([dx,dy])=>x+dx>=0&&y+dy>=0&&x+dx<g.room.width&&y+dy<g.room.depth&&g.room.accepts(x+dx,y+dy));}
export function landing(g,active=g.active){if(!active||!footprintFits(g,active.cells,active.x,active.y))return null;const h=dimensions(active.cells)[2];let z=g.room.height+1;const collision=zz=>active.cells.some(([dx,dy,dz])=>zz+dz<0||g.occupied.has(key(active.x+dx,active.y+dy,zz+dz)));while(!collision(z-1))z--;return z+h<=g.room.height?z:null;}
export function move(g,dx,dy){if(g.over)return false;const a=g.active;if(!footprintFits(g,a.cells,a.x+dx,a.y+dy))return false;a.x+=dx;a.y+=dy;return true;}
export function rotate(g,axis='turn'){if(g.over)return false;const cells=transform(g.active.cells,axis);for(const [dx,dy] of [[0,0],[-1,0],[0,-1],[-2,0],[0,-2],[-1,-1],[1,0],[0,1]]){const x=g.active.x+dx,y=g.active.y+dy;if(footprintFits(g,cells,x,y)){g.active={...g.active,cells,x,y};return true;}}return false;}
export function drop(g){if(g.over)return null;const z=landing(g);if(z===null)return null;const a=g.active;const placed=a.cells.map(([dx,dy,dz])=>({x:a.x+dx,y:a.y+dy,z:z+dz,id:a.id,piece:g.placed}));for(const c of placed)g.occupied.set(key(c.x,c.y,c.z),c);g.placed++;g.filled+=placed.length;g.score=g.filled*10;let full=0;for(let zz=0;zz<g.room.height;zz++)if(g.floor.every(([x,y])=>g.occupied.has(key(x,y,zz))))full++;g.score+=full*100;spawn(g);if(g.filled===g.capacity)g.over=true;return placed;}
export function discard(g){if(g.over||g.waste>=3)return false;g.waste++;spawn(g);return true;}
export function finish(g){g.over=true;}
export function percent(g){return Math.round(g.filled/g.capacity*100);}
export function maxHeight(g){return Math.max(0,...[...g.occupied.values()].map(c=>c.z+1));}
