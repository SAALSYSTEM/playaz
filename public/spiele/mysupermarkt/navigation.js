// Deterministic grid paths shared by customers, employees and simulation tests.
import {LOCATIONS} from './data.js';
import {ACTOR_RADIUS,furnitureBounds,vehicleObstacles,parkingReservations,contains} from './world.js';
export const RADIUS=ACTOR_RADIUS, CELL=.5;
export function worldWidth(s){return s.upgrades.floor?24:14;}
export function obstacles(s){
  return [...furnitureBounds(s),...vehicleObstacles(s)];
}
export function walkable(s,x,z,boxes=obstacles(s)){
  return x>=.5&&x<=worldWidth(s)-.5&&z>=.5&&z<=26&&
    !boxes.some(b=>contains(b,x,z));
}
let cacheKey='', grid=null;
const layoutKey=s=>s.shelves.map(r=>`${r.id}:${r.x}:${r.z}`).join(',')+'/'+s.upgrades.floor+'/'+s.upgrades.checkout+'/'+s.upgrades.online+'/'+s.upgrades.shipping;
function nav(s){
  const key=layoutKey(s);
  if(key===cacheKey&&grid)return grid;
  const w=worldWidth(s)*2+1,h=53,free=new Uint8Array(w*h),boxes=[...furnitureBounds(s),...parkingReservations()];
  for(let z=1;z<h;z++)for(let x=1;x<w;x++)free[z*w+x]=walkable(s,x/2,z/2,boxes)?1:0;
  cacheKey=key;grid={w,h,free,fields:new Map()};return grid;
}
// A purchase can place furniture underneath a person. Move only intersecting
// actors to the closest free cell and invalidate paths for the changed layout.
export function repairLayout(s){
  const g=nav(s);
  for(const a of [s.player,...s.staff,...s.customers]){
    if(!walkable(s,a.x,a.z)){
      let best=null,distance=Infinity;
      for(let i=0;i<g.free.length;i++)if(g.free[i]){
        const x=(i%g.w)/2,z=Math.floor(i/g.w)/2,d=(x-a.x)**2+(z-a.z)**2;
        if(d<distance){distance=d;best={x,z};}
      }
      if(best){a.x=best.x;a.z=best.z;}
    }
    a.routeKey='';a.route=[];a.action='';a.progress=0;
  }
}
export function pathTo(s,start,target){
  const g=nav(s),{w,h,free}=g;
  const nearest=p=>{
    let best=-1,dist=Infinity;
    for(let i=0;i<free.length;i++)if(free[i]){
      const d=(i%w/2-p.x)**2+(Math.floor(i/w)/2-p.z)**2;
      if(d<dist){dist=d;best=i;}
    }
    return best;
  };
  const goal=nearest(target),from=nearest(start);
  if(goal<0||from<0)return null;
  let field=g.fields.get(goal);
  if(!field){
    field=new Int32Array(w*h).fill(-1);field[goal]=0;
    const queue=new Int32Array(w*h);let a=0,b=1;queue[0]=goal;
    while(a<b){const i=queue[a++];for(const n of [i-1,i+1,i-w,i+w]){
      if(n<0||n>=free.length||Math.abs(n%w-i%w)>1||!free[n]||field[n]>=0)continue;
      field[n]=field[i]+1;queue[b++]=n;
    }}
    if(g.fields.size>100)g.fields.clear();g.fields.set(goal,field);
  }
  if(field[from]<0)return null;
  const points=[];let at=from;
  // Align to the grid first; this prevents diagonal corner-cutting after a retarget.
  points.push({x:at%w/2,z:Math.floor(at/w)/2});
  while(at!==goal){
    const next=[at-1,at+1,at-w,at+w].find(n=>n>=0&&n<free.length&&Math.abs(n%w-at%w)<=1&&field[n]===field[at]-1);
    if(next===undefined)return null;
    at=next;points.push({x:at%w/2,z:Math.floor(at/w)/2});
  }
  return points;
}
export const near=(a,b,r=1.2)=>Math.hypot(a.x-b.x,a.z-b.z)<r;
export function moveActor(s,a,target,dt,speed=2.6){
  const key=`${target.x},${target.z},${layoutKey(s)}`;
  if(a.routeKey!==key){a.route=pathTo(s,a,target);a.routeKey=key;}
  if(!a.route){a.status='Weg blockiert';a.routeKey='';return false;}
  let distance=speed*dt;
  while(a.route.length&&distance>0){
    const p=a.route[0],dx=p.x-a.x,dz=p.z-a.z,d=Math.hypot(dx,dz);
    if(d>.001)a.angle=Math.atan2(dx,dz);
    if(d<=distance){a.x=p.x;a.z=p.z;distance-=d;a.route.shift();}
    else{a.x+=dx/d*distance;a.z+=dz/d*distance;distance=0;}
  }
  return a.route.length===0;
}
export const servicePoint=r=>({x:r.x,z:r.z+1.5});
export const cashierPoint=index=>index?LOCATIONS.cashier2:LOCATIONS.cashier;
// Fold each line into three columns instead of sending its tail off the map.
// Both tills have distinct, reachable positions for the full 24-customer cap.
export const queuePoint=(index,place)=>{
  const n=Math.max(0,Math.min(23,place)),column=Math.floor(n/8),row=n%8;
  return {x:(index?13:8)-column*1.5,z:18.5+(column%2?7-row:row)*.75};
};
