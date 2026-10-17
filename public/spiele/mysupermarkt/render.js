import {PRODUCTS,PRODUCT,LOCATIONS,STAFF,sumStock,shelfCapacity} from './data.js';
import {nextHint} from './engine.js';
import {drawCharacter} from './characters.js';

// Real Three.js scene; all models are built here from our own geometry.
// Geometry/material caches + instanced batches bound draw calls as the shop grows.
export function createView(canvas,{quality='auto',inspection=false}={}){
  const T=globalThis.THREE;
  if(!T)throw new Error('Die lokale 3D-Engine konnte nicht geladen werden.');
  const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio||1,quality==='low'?1:1.6));
  renderer.outputEncoding=T.sRGBEncoding;renderer.setClearColor(0xc3e3d4);
  renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
  renderer.shadowMap.enabled=quality!=='low';renderer.shadowMap.type=T.PCFSoftShadowMap;
  const scene=new T.Scene();scene.fog=new T.Fog(0xc3e3d4,52,95);
  const camera=new T.OrthographicCamera(-10,10,14,-14,.1,130);
  scene.add(new T.HemisphereLight(0xfff8e5,0x8eafad,.95));
  const sun=new T.DirectionalLight(0xfff3d6,.85);sun.position.set(-12,28,16);sun.castShadow=true;
  sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-22,right:22,top:24,bottom:-24,near:1,far:65});
  sun.shadow.normalBias=.035;sun.shadow.bias=-.0002;scene.add(sun);sun.target.position.set(10,0,10);scene.add(sun.target);
  sun.shadow.camera.updateProjectionMatrix();
  const geos={box:new T.BoxGeometry(1,1,1),ball:new T.SphereGeometry(.5,12,10),portrait:new T.SphereGeometry(.5,18,14),cylinder:new T.CylinderGeometry(.5,.5,1,12),cone:new T.ConeGeometry(.5,1,12),ring:new T.TorusGeometry(.75,.035,6,36),
    torso:new T.LatheGeometry([[0,0],[.32,0],[.46,.10],[.49,.30],[.44,.65],[.40,.83],[.29,.97],[0,1]].map(([x,y])=>new T.Vector2(x,y)),18)};
  const shape=new T.Shape();shape.moveTo(-.42,-.5);shape.lineTo(.42,-.5);shape.quadraticCurveTo(.5,-.5,.5,-.42);shape.lineTo(.5,.42);shape.quadraticCurveTo(.5,.5,.42,.5);shape.lineTo(-.42,.5);shape.quadraticCurveTo(-.5,.5,-.5,.42);shape.lineTo(-.5,-.42);shape.quadraticCurveTo(-.5,-.5,-.42,-.5);
  geos.soft=new T.ExtrudeGeometry(shape,{depth:.84,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.05,bevelThickness:.08,curveSegments:3});geos.soft.translate(0,0,-.42);
  const materials=new Map(),batches=new Map(),labels=new Map(),dynamicLabels=new Map(),colors=new Map(),poses=new Map();
  const temp=new T.Object3D(),turn=new T.Quaternion(),axis=new T.Vector3(0,1,0);let phase='static',generation=0,lastLayout='',width=1,height=1,basis=null,frameDelta=0;
  const mat=geo=>{if(!materials.has(geo))materials.set(geo,new T.MeshStandardMaterial({color:0xffffff,roughness:geo==='portrait'?.55:.7,metalness:.02}));return materials.get(geo);};
  function part(geo,color,x,y,z,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0){
    if(basis){const dx=x-basis.x,dz=z-basis.z,c=Math.cos(basis.angle),s=Math.sin(basis.angle);x=basis.x+dx*c+dz*s;z=basis.z-dx*s+dz*c;}
    // Per-instance colours keep customer diversity from multiplying draw calls.
    const base=phase+'/'+geo;let page=0,key=base+'/'+page,b=batches.get(key);
    while(b&&b.n>=1024){key=base+'/'+(++page);b=batches.get(key);}
    if(!b){const mesh=new T.InstancedMesh(geos[geo],mat(geo),1024);mesh.name=key;mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);mesh.frustumCulled=false;mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);b={mesh,n:0};batches.set(key,b);}
    temp.position.set(x,y,z);temp.scale.set(sx,sy,sz);temp.rotation.set(rx,ry,rz);
    if(basis)temp.quaternion.premultiply(turn.setFromAxisAngle(axis,basis.angle));
    temp.updateMatrix();b.mesh.setMatrixAt(b.n,temp.matrix);
    if(!colors.has(color))colors.set(color,new T.Color(color));b.mesh.setColorAt(b.n++,colors.get(color));
  }
  const box=(c,x,y,z,w,h,d,ry=0)=>part('soft',c,x,y,z,w,h,d,0,ry);
  function reset(which){phase=which;for(const[k,b]of batches)if(k.startsWith(which+'/'))b.n=0;}
  function flush(which){for(const[k,b]of batches)if(k.startsWith(which+'/')){b.mesh.count=b.n;b.mesh.instanceMatrix.needsUpdate=true;if(b.mesh.instanceColor)b.mesh.instanceColor.needsUpdate=true;}}
  function label(key,text,x,y,z,{color='#254c48',bg='#ffffff',size=1.8,dynamic=false}={}){
    const map=dynamic?dynamicLabels:labels;let l=map.get(key);
    if(!l){const c=document.createElement('canvas');c.width=512;c.height=128;const tex=new T.CanvasTexture(c);tex.encoding=T.sRGBEncoding;
      const sprite=new T.Sprite(new T.SpriteMaterial({map:tex,depthWrite:false}));scene.add(sprite);l={canvas:c,tex,sprite,text:''};map.set(key,l);}
    if(l.text!==text){const c=l.canvas.getContext('2d');c.clearRect(0,0,512,128);c.fillStyle=bg;c.beginPath();c.roundRect?c.roundRect(8,12,496,104,24):c.rect(8,12,496,104);c.fill();c.font='bold 46px system-ui';c.textAlign='center';c.textBaseline='middle';c.fillStyle=color;c.fillText(text,256,66,468);l.tex.needsUpdate=true;l.text=text;}
    l.sprite.position.set(x,y,z);l.sprite.scale.set(size,size/4,1);l.sprite.visible=true;l.gen=generation;
  }
  function removeLabels(){for(const l of labels.values()){scene.remove(l.sprite);l.tex.dispose();l.sprite.material.dispose();}labels.clear();}
  function zone(x,z,color,size=1.7){part('ring',color,x,.04,z,size,size,size,Math.PI/2);}
  function tree(x,z){box(0xb59770,x,.7,z,.28,1.4,.28);part('ball',0x72bd8d,x,1.7,z,1.5,1.7,1.5);part('ball',0x8ad399,x-.4,1.6,z+.15,.9,1.2,.9);}
  function checkout(x,z,index){
    box(0x17635d,x,.5,z,2.4,1,1.2);box(0xe9b879,x,1.04,z,2.6,.14,1.35);
    box(0xf9cc42,x,.66,z+.61,2.1,.08,.025);box(0x388279,x,.28,z+.61,2.1,.28,.035);
    box(0x344e50,x-.6,1.14,z,.85,.08,.9);box(0x274c55,x+.65,1.35,z,.5,.4,.12);
    box(0x79d5c0,x+.65,1.36,z-.08,.37,.24,.03);zone(x,z-1.5,0xffd21c,1.1);
    box(0xffce43,x+.65,1.13,z+.25,.32,.04,.20);
    for(let i=0;i<5;i++)box(0x647b72,x-.6,1.185,z-.35+i*.16,.78,.012,.018);
    label('checkout'+index,'KASSE '+(index+1),x,1.8,z,{size:2});
  }
  function rebuild(s){
    reset('static');removeLabels();const w=s.upgrades.floor?24:14;
    box(0x9ac9a8,11,-.65,10,80,1,72);
    box(0xadc0ba,12,-.12,24,55,.28,6);
    for(let x=-12;x<38;x+=3)box(0xfdf4d5,x,.035,24,1.4,.02,.13);
    box(0xdde5d9,w/2,-.12,10.6,w+.5,.4,21.2);
    for(let z=1;z<21;z+=2)for(let x=1;x<w;x+=2)box((x+z)%4===0?0xf7f3df:0xecebdc,x,.065,z,1.97,.04,1.97);
    // Cutaway architecture: only a low back/left wall, never a roof in front of play.
    box(0x17635d,w/2,.5,.05,w,.9,.22);box(0x83bba6,.05,.5,10,.22,.9,20);
    box(0xf9f4df,w/2,.98,.05,w,.12,.27);
    // Back-wall awning and timber trim, outside the navigable interior.
    for(let x=.75;x<w;x+=1.5){box(0xd6a46b,x,.65,-.07,.07,1.1,.27);box(Math.floor(x/1.5)%2?0xffd054:0xfff3d9,x,2.45,-.45,1.48,.12,1.3,-.01);}
    box(0x17635d,w/2,2.35,-1,w,.25,.2);
    label('brand','MY SUPERMARKT',w/2,2.25,.5,{size:6,bg:'#246b58',color:'#fff4cc'});
    for(let x=5;x<w;x+=3){box(0xf4c176,x,.75,20.6,1.45,.12,.2);box(0xf4c176,x-.7,.4,20.6,.1,.8,.1);}
    for(const [x,z]of [[-1,2],[-1,10],[w+1,2],[w+1,12],[w+1,19]])tree(x,z);
    // Delivery, warehouse and workstation furniture remains out of walking cells.
    box(0xb99365,1.9,.16,13.2,1.3,.25,1.1);zone(2,13,0x58b9a1,1.6);
    label('storage','LAGER',2,2,13,{size:2.1});
    box(0x375c61,.8,.55,10,1,1.1,.7);box(0x263e4a,.8,1.35,10,.82,.6,.12);box(0x92e3c0,.8,1.36,10+.07,.65,.43,.02);
    zone(2,10,0x79cebb);label('terminal','EINKAUF',1.4,2.1,10,{size:2});
    zone(2,20,0xffd21c,1.8);label('delivery','WARENANNAHME',2,2,21.6,{size:3});
    zone(12,12,0xffd21c,1.4);label('build','AUSBAU',12,1.5,12,{size:1.7});
    checkout(8,17,0);if(s.upgrades.checkout)checkout(13,17,1);
    if(s.upgrades.online){
      box(0x55b8ae,1,.65,4,1.8,1.3,.85);box(0xf6e9c9,1,1.35,4,2,.12,1);
      box(0x264557,.6,1.7,4,.65,.5,.1);zone(2,4,0x5dbac5);
      label('pack','PACKTISCH',2,2.3,4,{size:2.3});
      zone(19,20,0xffc953,1.7);label('parcel','POSTABHOLUNG',19,2,20,{size:2.6});
      if(s.upgrades.shipping){box(0x55b8ae,4,.65,2.4,1.8,1.3,.85);box(0xf6e9c9,4,1.35,2.4,2,.12,1);zone(4,4,0x5dbac5);}
    }
    if(!s.upgrades.floor){
      box(0xb7cdb6,19,0,10,9,.15,20);
      for(let z=3;z<19;z+=3)box(0xf4cf79,14.6,.5,z,.18,1,1.5);
      label('future','HIER WÄCHST DEIN MARKT',19,.7,10,{size:5,bg:'#eaf0df',color:'#7e9782'});
    }
    for(const r of s.shelves){
      const p=PRODUCT[r.product],kind=p.kind,fruit=kind==='produce',cold=kind==='fridge',freezer=kind==='freezer';
      const color=cold?0x87b9bd:freezer?0xa7cacc:fruit?0xc99a61:0x25766b;
      box(color,r.x,fruit||freezer?.55:.20,r.z,2.2,fruit||freezer?.9:.30,1.1);
      if(!fruit&&!freezer){
        box(color,r.x-.99,1.15,r.z,.15,2.15,1.05);box(color,r.x+.99,1.15,r.z,.15,2.15,1.05);
        box(color,r.x,1.12,r.z-.48,2.1,2.1,.12);
        for(const y of [.45,1.05,1.65]){
          box(0xe4b985,r.x,y,r.z,2.2,.09,1.15);
          for(const dx of [-.66,0,.66]){box(0xfff8da,r.x+dx,y-.02,r.z+.585,.28,.10,.025);box(0x386359,r.x+dx,y-.02,r.z+.604,.13,.024,.01);}
        }
        if(cold)for(const side of [-1,1])box(0xd1f3e5,r.x+side*.87,1.13,r.z+.43,.035,1.7,.035);
      }else{
        box(0xf6e7ba,r.x,1,r.z,2.15,.12,1.1);
        for(const side of [-1,1])box(color,r.x+side*1.02,1.20,r.z,.08,.31,1.1);
        box(color,r.x,1.12,r.z+.52,2.15,.16,.09);
        if(fruit)for(const dx of [-.36,.36])box(color,r.x+dx,1.16,r.z,.045,.20,1);
      }
      box(0xffd054,r.x,2.08,r.z,2.25,.2,.3);
      label(r.id,p.name.toUpperCase(),r.x,2.52,r.z,{size:2.25});
    }
    flush('static');
  }
  function product(id,x,y,z,k=.38,rotation=0){
    const p=PRODUCT[id];if(!p)return;
    if(p.shape==='bottle'){
      part('cylinder',p.color,x,y+k*.4,z,k*.55,k,k*.55);box(0xf4f4e7,x,y+k*.91,z,k*.34,k*.15,k*.34);box(0xf5f0e6,x,y+k*.4,z+.12,k*.5,k*.3,.03);
    }else if(p.shape==='fruit'){
      part('ball',p.color,x,y+.15,z,k,k,k);box(0x6ea85e,x+.05,y+.36,z,.18,.08,.08,rotation);
    }else if(p.shape==='banana'){
      for(let j=0;j<3;j++)part('ball',p.color,x+(j-1)*.12,y+.12,z,k*.28,k*.38,k*1.2,0,.25+j*.2,.3);
    }else if(p.shape==='loaf'){
      part('ball',p.color,x,y+.12,z,k*1.2,k*.6,k*.8);box(0xf1d098,x,y+.25,z,.07,.03,k*.7);
    }else if(p.shape==='eggs'){
      box(0xbdb999,x,y+.07,z,k*1.3,.13,k*.75);
      for(let n=0;n<4;n++)part('ball',0xfff2dc,x+(n%2-.5)*.2,y+.18,z+(Math.floor(n/2)-.5)*.14,.15,.2,.15);
    }else{
      const flat=p.shape==='pizza'||p.shape==='bar';box(p.color,x,y+(flat?.08:.23),z,k*(flat?1.25:.8),flat?.13:k*1.2,k*(flat?.9:.5),rotation);
      box(0xfff5d5,x,y+(flat?.15:.27),z+.11,k*.55,flat?.02:k*.35,.025,rotation);
      if(p.shape==='carton')part('cone',p.color,x,y+k*1.25,z,k*.85,k*.25,k*.6,0,Math.PI/4);
    }
  }
  function carton(x,y,z,size=.55,color=0xd9a26b){box(color,x,y,z,size,size*.8,size*.85);box(0xf1d5a0,x,y+size*.41,z,size*.14,.025,size*.87);box(0xffefc8,x+size*.18,y,z+size*.435,size*.28,size*.20,.012);box(0xb08051,x+size*.18,y,z+size*.45,size*.16,.014,.009);}
  function vehicle(x,z,color,doors,scale=1,angle=0){
    basis={x,z,angle};
    box(0x44645c,x,.50,z,1.8*scale,.25,3.6*scale);
    for(const side of [-1,1]){
      box(color,x+side*.85*scale,1.18,z-.45*scale,.16,1.45,2.6*scale);
      box(0xffd054,x+side*.94*scale,1.05,z-.35*scale,.025,.24,1.8*scale);
      box(0x3b6264,x+side*.93*scale,1.62,z+.95*scale,.035,.52,.8*scale);
      box(color,x+side*1.03*scale,1.38,z+1.40*scale,.18,.16,.25);
    }
    box(color,x,1.94,z-.45*scale,1.85*scale,.15,2.7*scale);
    box(color,x,.95,z+1.12*scale,1.8*scale,.75,1.2*scale);box(0xf6f2da,x,1.55,z+.9*scale,1.8*scale,1,1.3*scale);
    box(0x558b99,x,1.62,z+1.58*scale,1.5*scale,.55,.07);
    box(0xf4df94,x-.6*scale,.75,z+1.83*scale,.35,.2,.05);box(0xf4df94,x+.6*scale,.75,z+1.83*scale,.35,.2,.05);
    for(const side of [-1,1])for(const dz of [-1.05,1.05])part('cylinder',0x354b52,x+side*.92*scale,.4,z+dz*scale,.58,.23,.58,0,0,Math.PI/2);
    if(doors){box(0x4b645d,x,.64,z-1.1*scale,1.5*scale,.06,1.4);box(color,x-1.1*scale,1.2,z-1.9*scale,.1,1.4,1);box(color,x+1.1*scale,1.2,z-1.9*scale,.1,1.4,1);}
    else box(0xf4f1df,x,1.1,z-1.8*scale,1.6*scale,1,.08);
    basis=null;
  }
  function person(a,s){
    const player=a.id==='player';
    let pose=poses.get(a.id);if(!pose){pose={x:a.x,z:a.z,angle:a.angle||0,movedAt:-100};poses.set(a.id,pose);}
    if(Math.hypot(a.x-pose.x,a.z-pose.z)>.00001)pose.movedAt=s.time;
    // Simulation ticks at 30 Hz, rendering can be 60+ Hz; keep gait continuous
    // between simulation steps instead of flickering between walk and idle.
    const moving=inspection?a.status==='Unterwegs':s.time-pose.movedAt<.09;
    const bob=moving?Math.abs(Math.sin(s.time*9))*.035:Math.sin(s.time*2)*.012;
    const targetAngle=a.angle||0;pose.angle+=Math.atan2(Math.sin(targetAngle-pose.angle),Math.cos(targetAngle-pose.angle))*(inspection?1:1-Math.exp(-frameDelta*15));
    pose.x=a.x;pose.z=a.z;pose.gen=generation;
    const x=a.x,z=a.z,ry=pose.angle;
    const n=sumStock(a.cargo),parcel=!!a.parcel;
    const cart=player&&!!s.upgrades.cart;
    basis={x,z,angle:ry};
    drawCharacter((geo,color,xx,y,zz,...args)=>part(geo,color,x+xx,y,z+zz,...args),a,
      {time:s.time,theme:s.theme||0,moving,carrying:!!(n||parcel)&&!cart,cart,working:!!a.action&&!moving});
    if(player&&s.upgrades.cart){
      const xx=x,zz=z+1;box(0x73979c,xx,.27,zz,.7,.12,.8);
      for(const side of [-1,1]){box(0x17635d,x+side*.31,.59,z+.70,.045,.65,.045);for(const dz of [-.27,.27])part('cylinder',0x354b52,x+side*.32,.14,zz+dz,.2,.12,.2,0,0,Math.PI/2);}
      box(0x17635d,x,.90,z+.70,.66,.055,.055);
      for(let i=0;i<Math.min(5,n);i++)carton(xx,.52+i*.27,zz,.45);
    }else if(n||parcel){for(let i=0;i<Math.min(4,parcel?1:n);i++)carton(x+.12+(i%2)*.025,1.12+i*.40+bob,z+.56,.48,parcel?0xe5b277:i%2?0xd7aa73:0xe6b87f);}
    basis=null;
    if(player&&!inspection)zone(x,z,0xffcf36,1);
    if(!inspection){
      if(a.role)label(a.id,STAFF[a.role].name.toUpperCase(),x,2.5,z,{size:1.7,dynamic:true,bg:a.active?'#296955':'#985d46',color:'#fff'});
      if(a.state==='queue'||a.status?.startsWith('Wartet:'))label(a.id,a.wait>35?'GEDULD …':a.state==='queue'?'ZUR KASSE':'REGAL LEER',x,2.4,z,{size:1.6,dynamic:true,bg:a.wait>35?'#ffe0bc':'#ffffff'});
      if(player&&(n||parcel))label('carry',parcel?'PAKET':n+' EINHEITEN',x,2.65,z,{size:2,dynamic:true,bg:'#254c48',color:'#fff8dc'});
    }
  }
  const look=new T.Vector3(7,0,13),desired=new T.Vector3(),screenVector=new T.Vector3();
  function resize(){const r=canvas.getBoundingClientRect();width=r.width;height=r.height;renderer.setSize(width,height,false);}
  function frame(s,dt){
    frameDelta=dt;generation++;
    if(inspection){
      if(!lastLayout){reset('static');part('cylinder',0x276c60,0,-.12,0,2.6,.24,2.6);box(0xc3e3d4,0,-.32,0,30,.15,30);flush('static');lastLayout='inspection';sun.target.position.set(0,1,0);}
      reset('dynamic');person(s.player,s);flush('dynamic');
      const halfY=Math.max(1.8,1.6/(width/height)),halfX=halfY*width/height;
      Object.assign(camera,{left:-halfX,right:halfX,top:halfY,bottom:-halfY});camera.updateProjectionMatrix();
      camera.position.set(0,2.8,7);camera.lookAt(0,1.05,0);renderer.render(scene,camera);return;
    }
    const key=s.shelves.map(r=>r.id+':'+r.level).join(',')+'/'+Object.values(s.upgrades).join(',')+'/'+s.theme;
    if(key!==lastLayout){lastLayout=key;rebuild(s);}
    reset('dynamic');
    for(const r of s.shelves){
      const flat=['produce','freezer'].includes(PRODUCT[r.product].kind);
      const visible=r.stock;
      for(let i=0;i<visible;i++){
        const x=r.x+(i%6-2.5)*.30,y=flat?1.1+Math.floor(i/24)*.3: .52+(Math.floor(i/6)%3)*.6,z=r.z+(flat?((Math.floor(i/6)%4)-1.5)*.23:.28-Math.floor(i/18)*.23);
        product(r.product,x,y,z,.32);
      }
      label('stock'+r.id,r.stock+'/'+shelfCapacity(r),r.x,.4,r.z+1,{size:1.1,dynamic:true,bg:r.stock?'#ffffff':'#ffe2c0'});
    }
    for(let i=0;i<Math.min(16,Math.ceil(sumStock(s.storage)/4));i++)carton(1+(i%3)*.5,.45+Math.floor(i/6)*.48,12+(Math.floor(i/3)%2)*.5,.45);
    const d=s.deliveries[0];if(d){
      const scale=s.upgrades.warehouseXL?1.35:s.upgrades.truck?1.15:1;
      const x=2+(1-d.progress)*20,angle=(d.phase==='leaving'?1:-1)*Math.PI/2*Math.min(1,(1-d.progress)*5);vehicle(x,23,0x77bba5,d.phase==='unloading',scale,angle);
      if(d.phase==='unloading')for(let i=0;i<Math.min(9,Math.ceil(sumStock(d.items)/2));i++)carton(1.5+i%3*.48,.65+Math.floor(i/3)*.45,21.6,.44);
    }
    if(s.upgrades.online&&s.mail.phase!=='away')vehicle(19+(1-s.mail.progress)*18,23,0xf8c543,s.mail.phase==='loading',.85,(s.mail.phase==='leaving'?1:-1)*Math.PI/2*Math.min(1,(1-s.mail.progress)*5));
    let parcelIndex=0;
    for(const o of s.orders){
      if(o.state==='ready'){const i=parcelIndex++;carton(18.5+i%2*.65,.4+Math.floor(i/4)*.55,19.4+Math.floor(i/2)%2*.6,.58);}
      else if(o.state==='parcel'&&![s.player,...s.staff].some(a=>a.parcel===o.id))carton(o.station?4:1,1.75,o.station?2.4:4,.65);
      else if(sumStock(o.staged))carton(o.station?4:1,1.6,o.station?2.4:4,.5,0xedc995);
    }
    for(const a of [...s.customers,...s.staff,s.player])person(a,s);
    for(const [id,pose]of poses)if(pose.gen!==generation)poses.delete(id);
    const hint=nextHint(s);if(hint.target){
      const y=2.8+Math.sin(s.time*3)*.17;part('cone',0xffd438,hint.target.x,y,hint.target.z,.5,.6,.5,Math.PI);
      zone(hint.target.x,hint.target.z,0xffd438,1.2+Math.sin(s.time*3)*.05);
    }
    for(const e of s.events){const age=s.time-e.time;if(age<.8&&e.text.startsWith('Paket abgeholt'))carton(19,.6+age,20+age*2,.6);if(age<1.3&&e.pos)for(let i=0;i<7;i++){
      const a=i*6.28/7;part('ball',i%2?0xffdc56:0xffffff,e.pos.x+Math.cos(a)*age,1.2+age*1.4,e.pos.z+Math.sin(a)*age,.12,.12,.12);
    }}
    flush('dynamic');for(const [id,l] of dynamicLabels)if(l.gen!==generation){scene.remove(l.sprite);l.tex.dispose();l.sprite.material.dispose();dynamicLabels.delete(id);}
    const aspect=width/height,span=aspect<.8?12.4:aspect<1.2?16:24;
    const halfX=span/2+(s.upgrades.floor?1:0),halfY=halfX/aspect;
    camera.left=-halfX;camera.right=halfX;camera.top=halfY;camera.bottom=-halfY;camera.updateProjectionMatrix();
    desired.set(s.player.x,0,s.player.z-1.8);look.lerp(desired,1-Math.exp(-dt*4));
    camera.position.set(look.x+9,look.y+23,look.z+18);camera.lookAt(look);renderer.render(scene,camera);
  }
  function project(x,z,y=1){screenVector.set(x,y,z).project(camera);return {x:(screenVector.x+1)/2*width,y:(1-screenVector.y)/2*height};}
  function dispose(){for(const b of batches.values())scene.remove(b.mesh);for(const g of Object.values(geos))g.dispose();for(const m of materials.values())m.dispose();for(const l of [...labels.values(),...dynamicLabels.values()]){l.tex.dispose();l.sprite.material.dispose();}renderer.dispose();}
  resize();return {frame,resize,project,dispose,info:()=>({...renderer.info.render,geometries:renderer.info.memory.geometries})};
}
