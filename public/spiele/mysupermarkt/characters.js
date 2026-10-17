// Shared, fully volumetric characters for the game and the 360° inspection room.
// Coordinates are local, front is +Z. No camera-facing portraits or image planes.
// All parts feed the renderer's shared geometry / instance-colour batches.
const SKINS=[0xf1be96,0xb97952,0xe5ac82,0x805239];
const HAIR=[0x683b27,0x342a27,0xb87534,0xd6c6ad];
const SHIRTS=[0xe98573,0x858bc6,0x62b1c3,0xe3bd5a,0x91b580,0xcf90ac];
const TEAL=0x17635d,SEAM=0x388279,SOLE=0xf6ead7,INK=0x263d3e;

export function characterStyle(actor,theme=0){
  const player=actor.id==='player',worker=player||!!actor.role;
  const variant=player?0:Math.abs(Number(actor.color)||({cashier:1,stocker:2,loader:3,packer:4}[actor.role]||0))%6;
  return {worker,variant,skin:SKINS[variant%4],hair:HAIR[variant%4],
    shirt:worker?[0xffcb39,0xee967a,0x7fd5b7][theme%3]:SHIRTS[variant],
    apron:TEAL,trousers:worker?0x294c59:0x3f5365,
    bun:player||variant===2||variant===4,cap:actor.role==='loader',glasses:variant===3};
}

export function drawCharacter(part,actor,{time=0,theme=0,moving=false,carrying=false,cart=false,working=false}={}){
  const c=characterStyle(actor,theme),phase=time*9+c.variant*.9;
  const stride=moving?Math.sin(phase):0,bob=moving?Math.abs(Math.sin(phase))*.035:Math.sin(time*2)*.012;
  const ball=(color,x,y,z,sx,sy,sz,rx=0,ry=0,rz=0)=>part('portrait',color,x,y+bob,z,sx,sy,sz,rx,ry,rz);
  const box=(color,x,y,z,sx,sy,sz,rx=0,ry=0,rz=0)=>part('soft',color,x,y+bob,z,sx,sy,sz,rx,ry,rz);
  // Cylindrical segments are oriented between joints: hands stay on the cargo,
  // while empty arms swing opposite the legs, in any world-facing direction.
  function limb(color,a,b,r){
    const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],len=Math.hypot(dx,dy,dz);
    part('cylinder',color,(a[0]+b[0])/2,(a[1]+b[1])/2+bob,(a[2]+b[2])/2,r*2,len,r*2,
      Math.atan2(dz,dy),0,-Math.atan2(dx,Math.hypot(dy,dz)));
    ball(color,...a,r*2,r*2,r*2);ball(color,...b,r*2,r*2,r*2);
  }
  // Shoes, tapered legs and a softly shaped torso, rather than a box body.
  for(const side of [-1,1]){
    const step=stride*side*.19,lift=moving?Math.max(0,stride*side)*.075:0;
    limb(c.trousers,[side*.145,.66,0],[side*.155,.21+lift,step],.105);
    box(SOLE,side*.155,.10+lift,step+.065,.26,.10,.40);
    ball(TEAL,side*.155,.18+lift,step+.055,.27,.21,.38);
    for(let i=0;i<2;i++)box(SOLE,side*.155,.265+lift,step+.09+i*.055,.14,.018,.024);
  }
  part('torso',c.shirt,0,.67+bob,0,.67,.62,.48);
  ball(c.shirt,0,.76,0,.62,.38,.47);
  ball(c.skin,0,1.29,0,.22,.27,.22);
  if(c.worker){
    // Apron wraps the waist; ties and straps exist on the back as well.
    box(c.apron,0,.84,.235,.48,.57,.065);
    box(c.apron,0,1.115,.23,.34,.25,.065);
    box(c.apron,0,.85,-.242,.57,.075,.055);
    for(const side of [-1,1]){
      box(c.apron,side*.16,1.20,0,.064,.055,.47,0,0,side*.15);
      box(c.apron,side*.13,1.075,-.22,.055,.29,.055,0,0,side*.5);
      box(SEAM,side*.085,.72,-.27,.045,.25,.032,0,0,side*.3);
      ball(0xe5b94e,side*.16,1.12,.279,.045,.045,.025);
    }
    box(SEAM,0,.83,.277,.29,.18,.026);
    box(0xf8e5b6,.08,1.075,.278,.12,.065,.018);
    box(TEAL,.08,1.075,.29,.075,.012,.009);
  }else{
    box(0xf2dfba,0,1.20,.2,.22,.04,.06);
    box(0xffffff,.15,1.07,.245,.12,.13,.025);
  }
  // Bent elbows and mitten-like hands: all geometry, including rear silhouette.
  for(const side of [-1,1]){
    const busy=working?Math.sin(time*7+side)*.045:0;
    const shoulder=[side*.30,1.14,0];
    const elbow=carrying||cart?[side*.39,.90,.20]:[side*.36,.91,-stride*side*.13];
    const hand=carrying?[side*.26+.12,.99+busy,.47]:cart?[side*.31,.90,.70]:working?[side*.25,1.03+busy,.39]:[side*.35,.71,-stride*side*.23];
    limb(c.shirt,shoulder,[side*.35,1.02,.06],.12);
    limb(c.skin,[side*.35,1.02,.06],elbow,.077);limb(c.skin,elbow,hand,.075);
    ball(c.skin,...hand,.17,.19,.145);
    ball(c.skin,hand[0]-side*.07,hand[1]+.015,hand[2]+.025,.075,.10,.09);
  }
  // Oversized rounded face: cheeks, ears, nose, inset smile and glossy eyes.
  ball(c.skin,0,1.64,0,.69,.74,.60);
  ball(c.skin,0,1.48,.13,.50,.39,.43);
  for(const side of [-1,1]){
    ball(c.skin,side*.34,1.63,0,.14,.21,.16);
    ball(0xd68c72,side*.385,1.63,.035,.035,.10,.07);
    ball(c.skin,side*.20,1.53,.24,.20,.14,.09);
    ball(0xffffff,side*.14,1.69,.267,.18,.205,.09);
    ball(0x785137,side*.14,1.685,.310,.105,.13,.035);
    ball(INK,side*.14,1.685,.329,.058,.085,.022);
    ball(0xffffff,side*.14-.018,1.71,.342,.029,.035,.015);
    ball(c.hair,side*.145,1.822,.245,.19,.043,.055,0,0,side*.13);
    if(c.glasses){
      part('ring',0x72573b,side*.15,1.69+bob,.33,.14,.14,.14);
      box(0x72573b,side*.31,1.71,.16,.025,.027,.32);
    }
  }
  if(c.glasses)box(0x72573b,0,1.70,.34,.10,.025,.025);
  ball(c.skin,0,1.59,.33,.13,.135,.14);
  ball(0x814332,0,1.46,.35,.20,.09,.045);
  box(0xfff6e4,0,1.48,.376,.14,.025,.012);
  // A full rear hair shell plus a crown of rounded locks. The face stays clear.
  ball(c.hair,0,1.75,-.13,.70,.63,.45);
  ball(c.hair,0,1.94,-.015,.68,.25,.57);
  for(let i=0;i<7;i++){
    const a=i/6*Math.PI;
    ball(c.hair,Math.cos(a)*.28,1.85+Math.sin(a)*.09,Math.sin(a)*.14,.24,.22,.27,0,0,-.35);
  }
  ball(c.hair,-.19,1.85,.20,.33,.15,.19,0,0,-.4);
  if(c.bun){
    ball(c.hair,.02,1.96,-.34,.43,.40,.40);
    part('ring',0xe6b348,.02,1.94+bob,-.25,.18,.18,.18);
    ball(c.hair,-.30,1.70,.03,.14,.36,.18,0,0,-.16);
    ball(c.hair,.31,1.76,-.02,.12,.28,.18,0,0,.12);
  }
  if(c.cap){
    ball(TEAL,0,1.98,-.015,.74,.23,.63);
    box(TEAL,0,1.94,.30,.49,.06,.35);
    box(0xffce3c,0,2.025,.25,.14,.08,.035);
  }
}
