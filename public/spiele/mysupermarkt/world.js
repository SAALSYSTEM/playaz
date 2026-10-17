// World dimensions shared by collision detection, navigation and vehicle drawing.
export const ACTOR_RADIUS=.28;
export function furnitureBounds(s){
  const boxes=s.shelves.map(r=>({x:r.x,z:r.z,w:2.25,d:1.15}));
  boxes.push({x:8,z:17,w:2.6,d:1.35},
    {x:.95,z:12.7,w:1.3,d:1.6}, // warehouse pallet, beside the service position
    {x:.8,z:10,w:1,d:.7});
  if(s.upgrades.checkout)boxes.push({x:13,z:17,w:2.6,d:1.35});
  if(s.upgrades.online){
    boxes.push({x:.7,z:4,w:1.4,d:1});
    if(s.upgrades.shipping)boxes.push({x:4,z:2.4,w:2,d:1});
  }
  return boxes;
}
export function contains(box,x,z,radius=ACTOR_RADIUS){
  const dx=x-box.x,dz=z-box.z,c=Math.cos(box.angle||0),s=Math.sin(box.angle||0);
  return Math.abs(dx*c-dz*s)<box.w/2+radius&&Math.abs(dx*s+dz*c)<box.d/2+radius;
}
export function vehiclePose(s,kind){
  const delivery=kind==='delivery',v=delivery?s.deliveries[0]:s.mail;
  if(!v||(!delivery&&(!s.upgrades.online||v.phase==='away')))return null;
  const scale=delivery?(s.upgrades.warehouseXL?1.35:s.upgrades.truck?1.15:1):.85;
  const p=Math.max(0,Math.min(1,v.progress||0)),bay=delivery?2:19;
  // Drive along the street outside the playable floor, then reverse into the bay.
  const approach=Math.min(1,p/.60),parking=Math.max(0,(p-.60)/.40);
  return {x:bay+(1-approach)*20,z:28-parking*5,scale,
    angle:-(Math.PI/2)*(1-Math.min(1,parking*3)),doors:v.phase===(delivery?'unloading':'loading')};
}
export function vehicleBounds(s,kind){
  const v=vehiclePose(s,kind);return v?{...v,w:2.3*v.scale,d:3.8*v.scale}:null;
}
export function vehicleObstacles(s){
  const result=[];
  for(const kind of ['delivery','mail']){
    const b=vehicleBounds(s,kind);if(!b)continue;result.push(b);
    if(b.doors)for(const side of [-1,1]){
      const dx=side*1.1*b.scale,dz=-1.9*b.scale,c=Math.cos(b.angle),sin=Math.sin(b.angle);
      result.push({x:b.x+dx*c+dz*sin,z:b.z-dx*sin+dz*c,w:.1,d:b.scale,angle:b.angle});
    }
  }
  return result;
}
export function vehicleBlocked(s,kind){
  const b=vehicleBounds(s,kind);return b&&[s.player,...s.staff,...s.customers].some(a=>contains(b,a.x,a.z));
}
// NPCs never plan through parking bays, even while a vehicle is absent. The
// player collides only with actual vehicles, not these navigation reservations.
export const parkingReservations=()=>[{x:2,z:24,w:3.1,d:6.8},{x:19,z:24,w:2,d:6.4}];
