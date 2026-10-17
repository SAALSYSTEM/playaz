import {PRODUCTS,PRODUCT,STAFF,UPGRADES,MILESTONES,AWARDS,SHELF_POSITIONS,LOCATIONS,SAVE_VERSION,emptyStock,sumStock,shelfCapacity,shelfCost} from './data.js';
import {near,walkable,moveActor,servicePoint,cashierPoint,queuePoint} from './navigation.js';

export const capacity=s=>4+(s.upgrades.cart?6:0)+s.upgrades.capacity*2;
export const storageCapacity=s=>s.upgrades.warehouseXL?600:s.upgrades.warehouse?240:80;
export const truckCapacity=s=>s.upgrades.warehouseXL?144:s.upgrades.truck?72:24;
export const parcelCapacity=s=>s.upgrades.shipping?8:3;
export const priceUpgrade=(s,id)=>UPGRADES[id].cost*(1+s.upgrades[id]);
export const totalRevenue=s=>s.finance.storeRevenue+s.finance.onlineRevenue;
const count=a=>sumStock(a.cargo);
const finiteInt=n=>Number.isSafeInteger(n)&&n>=0;
const customerPools=new WeakMap();
function actor(id,x,z,extra={}){return {id,x,z,angle:0,cargo:emptyStock(),parcel:null,orderId:null,status:'Bereit',action:'',progress:0,...extra};}
export function createGame(seed=4815){
  const s={version:SAVE_VERSION,seed:seed>>>0,time:0,cash:120,debt:0,serial:1,milestone:0,
    upgrades:Object.fromEntries(Object.keys(UPGRADES).map(k=>[k,0])),
    player:actor('player',4,19),storage:emptyStock(),received:emptyStock(),sold:emptyStock(),
    shelves:[{id:'s0',product:'juice',x:6,z:5,stock:0,level:0}],deliveries:[],customers:[],staff:[],orders:[],
    finance:{initial:120,purchases:0,storeRevenue:0,onlineRevenue:0,wages:0,investment:0,rewards:0,debtRepaid:0,creditPurchases:0},
    stats:{unloaded:0,stocked:0,customers:0,units:0,orders:0,lost:0,typesStocked:[]},
    awards:{},events:[],spawn:7,orderTimer:15,wageTimer:0,mail:{phase:'away',timer:25,progress:0},
    mode:'store',selected:'juice',theme:0,day:{number:0,baseCustomers:0,baseStocked:0,baseOrders:0,claimed:[]},revision:0};
  orderGoods(s,'juice',12,true);return s;
}
function rand(s){s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0;return s.seed/4294967296;}
function event(s,text,type='info',pos=null){s.events.push({id:++s.serial,text,type,pos,time:s.time});if(s.events.length>16)s.events.shift();s.revision++;}
function spend(s,amount,kind,reserve=0){
  if(!finiteInt(amount)||s.cash<amount+reserve)return false;
  s.cash-=amount;s.finance[kind]+=amount;s.revision++;return true;
}
function earn(s,amount,kind){
  s.cash+=amount;s.finance[kind]+=amount;
  const repay=Math.min(s.debt,Math.floor(amount/3));s.debt-=repay;s.cash-=repay;s.finance.debtRepaid+=repay;s.revision++;
}
export function orderGoods(s,id,qty,initial=false){
  if(!PRODUCT[id]||!finiteInt(qty)||qty<1||qty>truckCapacity(s)||s.deliveries.length>=4)return false;
  if(!s.shelves.some(r=>r.product===id))return false;
  if(!spend(s,PRODUCT[id].buy*qty,'purchases'))return false;
  s.received[id]+=qty;
  const items=emptyStock();items[id]=qty;
  const duration=initial?3:s.upgrades.truck?7:10;
  s.deliveries.push({id:++s.serial,items,phase:'enroute',timer:duration,duration,progress:0});
  event(s,`${qty} × ${PRODUCT[id].name} bestellt`);return true;
}
export function buyShelf(s,id){
  if(!PRODUCT[id]||s.shelves.some(r=>r.product===id)||PRODUCT[id].unlock>s.milestone)return false;
  const slot=PRODUCTS.findIndex(p=>p.id===id);
  if(slot>=6&&!s.upgrades.floor)return false;
  if(!spend(s,shelfCost(id),'investment',12))return false;
  const [x,z]=SHELF_POSITIONS[slot];s.shelves.push({id:'s'+slot,product:id,x,z,stock:0,level:0,builtAt:s.time});
  event(s,`${PRODUCT[id].name}: neues ${PRODUCT[id].kind==='fridge'?'Kühlregal':'Regal'}!`,'build',{x,z});updateProgress(s);return true;
}
export function upgradeShelf(s,id){
  const r=s.shelves.find(r=>r.id===id);if(!r||r.level>=4)return false;
  if(!spend(s,60*(r.level+1),'investment',12))return false;
  r.level++;s.revision++;return true;
}
export function buyUpgrade(s,id){
  const u=UPGRADES[id];if(!u||s.milestone<u.unlock||s.upgrades[id]>=u.max)return false;
  if(id==='empire'&&s.shelves.length<12)return false;
  if(!spend(s,priceUpgrade(s,id),'investment',12))return false;
  s.upgrades[id]++;event(s,u.name,'build',LOCATIONS.build);updateProgress(s);return true;
}
export function hire(s,role){
  const def=STAFF[role];if(!def||s.milestone<def.unlock||s.staff.some(e=>e.role===role))return false;
  if(!spend(s,def.cost,'investment',12))return false;
  s.staff.push(actor('e'+(++s.serial),12,22,{role,level:0,workTime:0,arrears:0,active:true}));
  event(s,`${def.name} eingestellt`,'award');updateProgress(s);return true;
}
export function upgradeStaff(s,id){
  const e=s.staff.find(e=>e.id===id);if(!e||e.level>=3||!spend(s,120*(e.level+1),'investment',12))return false;
  e.level++;return true;
}
// A finite stock advance, never free money. Repayment comes out of subsequent sales.
export function rescue(s){
  if(s.debt||s.cash>=12||sumStock(inventory(s))>0)return false;
  const items=emptyStock();items.juice=6;s.debt=12;s.finance.creditPurchases+=12;s.received.juice+=6;
  s.deliveries.push({id:++s.serial,items,phase:'enroute',timer:3,duration:3,progress:0});
  event(s,'6 Saft auf Warenkredit. Rückzahlung aus Verkäufen.');return true;
}
export function movePlayer(s,dx,dz,dt){
  const d=Math.hypot(dx,dz);if(!d)return;
  const speed=3.8*(1+s.upgrades.speed*.15),step=Math.min(dt,.05)*speed/Math.max(1,d),a=s.player;
  if(walkable(s,a.x+dx*step,a.z))a.x+=dx*step;
  if(walkable(s,a.x,a.z+dz*step))a.z+=dz*step;
  a.angle=Math.atan2(dx,dz);
}
function action(a,key,dt,duration,fn){
  if(a.action!==key){a.action=key;a.progress=0;}
  a.progress+=dt/duration;
  if(a.progress>=1){a.progress=0;fn();return true;}return false;
}
const activeDelivery=s=>s.deliveries.find(d=>d.phase==='unloading');
function pickup(s,a,dt,max){
  const d=activeDelivery(s);if(!d||count(a)>=max)return false;
  const id=PRODUCTS.find(p=>d.items[p.id]>0)?.id;if(!id)return false;
  a.status='Entlädt '+PRODUCT[id].name;
  action(a,'pickup'+id,dt,.22,()=>{if(d.items[id]&&count(a)<max){d.items[id]--;a.cargo[id]++;s.stats.unloaded++;s.revision++;}});return true;
}
function deposit(s,a,dt){
  const id=PRODUCTS.find(p=>a.cargo[p.id]>0)?.id;
  if(!id)return false;
  if(sumStock(s.storage)+s.orders.reduce((n,o)=>n+sumStock(o.reserved),0)>=storageCapacity(s)){a.status='Lager voll – direkt ins Regal';return false;}
  a.status='Lagert '+PRODUCT[id].name;
  action(a,'deposit'+id,dt,.18,()=>{a.cargo[id]--;s.storage[id]++;s.revision++;});return true;
}
function fillShelf(s,a,r,dt){
  if(a.cargo[r.product]<=0||r.stock>=shelfCapacity(r))return false;
  a.status='Füllt '+PRODUCT[r.product].name;
  action(a,'fill'+r.id,dt,.25,()=>{
    if(a.cargo[r.product]>0&&r.stock<shelfCapacity(r)){
      a.cargo[r.product]--;r.stock++;s.stats.stocked++;
      if(!s.stats.typesStocked.includes(r.product))s.stats.typesStocked.push(r.product);
      s.revision++;
    }
  });return true;
}
function takeStorage(s,a,id,dt,max){
  if(!id||s.storage[id]<=0||count(a)>=max)return false;
  a.status='Holt '+PRODUCT[id].name;
  action(a,'take'+id,dt,.2,()=>{if(s.storage[id]>0&&count(a)<max){s.storage[id]--;a.cargo[id]++;s.revision++;}});return true;
}
const queues=(s,index)=>s.customers.filter(c=>c.state==='queue'&&c.checkout===index).sort((a,b)=>a.ticket-b.ticket);
function checkout(s,a,index,dt){
  const c=queues(s,index)[0];if(!c||!near(c,queuePoint(index,0),.22)){a.status='Kasse bereit';return false;}
  a.status='Kassiert';
  action(a,'pay'+c.id,dt,1.35/(1+(a.level||0)*.3),()=>{
    if(c.state!=='queue')return;
    let price=0,units=0;for(const p of PRODUCTS){price+=c.cargo[p.id]*p.sell;units+=c.cargo[p.id];s.sold[p.id]+=c.cargo[p.id];c.cargo[p.id]=0;}
    earn(s,price,'storeRevenue');s.stats.units+=units;s.stats.customers++;c.state='exit';c.routeKey='';c.wait=0;
    event(s,`+${price} €`,'money',queuePoint(index,0));
  });return true;
}
export function createOnlineOrder(s,items,express=false){
  if(!s.upgrades.online||s.orders.length>=6)return null;
  const required=emptyStock();let price=0;
  for(const [id,n]of Object.entries(items)){
    if(!PRODUCT[id]||!finiteInt(n)||n>24||!s.shelves.some(r=>r.product===id))return null;
    required[id]=n;price+=PRODUCT[id].sell*n;
  }
  if(!sumStock(required)||sumStock(required)>36)return null;
  const o={id:++s.serial,required,reserved:emptyStock(),staged:emptyStock(),packed:emptyStock(),state:'waiting',station:s.upgrades.shipping?s.serial%2:0,
    price,bonus:express?Math.ceil(price*.25):0,deadline:s.time+120,express,packProgress:0};
  s.orders.push(o);reserveOrders(s);event(s,`Onlineauftrag #${o.id}${express?' · Express':''}`);return o;
}
export function reserveOrders(s){
  for(const o of s.orders){
    if(o.hold||['parcel','ready'].includes(o.state))continue;
    const carried=emptyStock();for(const a of [s.player,...s.staff])if(a.orderId===o.id)for(const p of PRODUCTS)carried[p.id]+=a.cargo[p.id];
    for(const p of PRODUCTS){
      const need=o.required[p.id]-o.reserved[p.id]-o.staged[p.id]-carried[p.id];
      const take=Math.min(s.storage[p.id],Math.max(0,need));s.storage[p.id]-=take;o.reserved[p.id]+=take;
    }
    const available=sumStock(o.reserved)+sumStock(o.staged)+sumStock(carried);
    o.state=available===sumStock(o.required)?'reserved':'waiting';
  }
}
export function holdOrder(s,id){
  const o=s.orders.find(o=>o.id===Number(id));if(!o||['parcel','ready'].includes(o.state))return false;
  if(o.hold){
    if(sumStock(o.staged)||[s.player,...s.staff].some(a=>a.orderId===o.id))return false;
    o.hold=false;o.state='waiting';reserveOrders(s);
  }else{
    o.hold=true;o.state='held';o.packProgress=0;
    // Reserved units are still physically in the warehouse. Staged/carried units
    // must be transported back by the player/packer; no remote teleportation.
    for(const p of PRODUCTS){s.storage[p.id]+=o.reserved[p.id];o.reserved[p.id]=0;}
  }
  s.revision++;return true;
}
const packPoint=o=>o.station?LOCATIONS.pack2:LOCATIONS.pack;
function onlineTarget(s,a){
  if(a.parcel)return LOCATIONS.parcels;
  if(a.orderId){const o=s.orders.find(o=>o.id===a.orderId);return o?.hold?LOCATIONS.storage:packPoint(o||{station:0});}
  const returning=s.orders.find(o=>o.hold&&sumStock(o.staged)>0);if(returning)return packPoint(returning);
  const parcel=s.orders.find(o=>o.state==='parcel'&&![s.player,...s.staff].some(e=>e.parcel===o.id));
  if(parcel&&s.orders.filter(o=>o.state==='ready').length<parcelCapacity(s))return packPoint(parcel);
  const staged=s.orders.find(o=>!o.hold&&sumStock(o.staged)===sumStock(o.required)&&o.state!=='parcel'&&o.state!=='ready');
  if(staged)return packPoint(staged);
  if(s.orders.some(o=>sumStock(o.reserved)>0))return LOCATIONS.storage;
  return null;
}
function onlineInteract(s,a,dt,max){
  if(a.parcel){
    a.status='Trägt Paket zur Abholung';
    if(near(a,LOCATIONS.parcels)&&s.orders.filter(o=>o.state==='ready').length<parcelCapacity(s)){
      const o=s.orders.find(o=>o.id===a.parcel);if(o){o.state='ready';s.revision++;}a.parcel=null;
    }return true;
  }
  if(a.orderId){
    const o=s.orders.find(o=>o.id===a.orderId);if(!o){a.orderId=null;return false;}
    if(o.hold){
      a.status='Bringt zurückgestellte Ware ins Lager';
      if(near(a,LOCATIONS.storage))action(a,'return'+o.id,dt,.7,()=>{
        for(const p of PRODUCTS){s.storage[p.id]+=a.cargo[p.id];a.cargo[p.id]=0;}a.orderId=null;s.revision++;
      });return true;
    }
    a.status='Kommissioniert #'+o.id;
    if(near(a,packPoint(o)))action(a,'stage'+o.id,dt,.7,()=>{
      for(const p of PRODUCTS){o.staged[p.id]+=a.cargo[p.id];a.cargo[p.id]=0;}a.orderId=null;s.revision++;
    });return true;
  }
  const parcel=s.orders.find(o=>o.state==='parcel'&&near(a,packPoint(o))&&![s.player,...s.staff].some(e=>e.parcel===o.id));
  if(parcel&&s.orders.filter(o=>o.state==='ready').length<parcelCapacity(s)){a.parcel=parcel.id;return true;}
  const returning=s.orders.find(o=>o.hold&&sumStock(o.staged)>0&&near(a,packPoint(o)));
  if(returning){a.status='Holt zurückgestellte Ware';action(a,'returnPickup'+returning.id,dt,.55,()=>{
    let room=max;for(const p of PRODUCTS){const n=Math.min(room,returning.staged[p.id]);a.cargo[p.id]+=n;returning.staged[p.id]-=n;room-=n;}if(count(a))a.orderId=returning.id;s.revision++;
  });return true;}
  const o=s.orders.find(o=>!o.hold&&!['parcel','ready'].includes(o.state)&&sumStock(o.staged)===sumStock(o.required)&&near(a,packPoint(o)));
  if(o){
    a.status='Verpackt #'+o.id;o.packProgress+=dt*(1+s.upgrades.packing*.2+(a.level||0)*.2)/3;
    if(o.packProgress>=1){o.packed={...o.staged};o.staged=emptyStock();o.state='parcel';o.packProgress=1;s.revision++;event(s,'Paket fertig','pack',packPoint(o));}
    return true;
  }
  if(near(a,LOCATIONS.storage)&&count(a)===0){
    const o=s.orders.find(o=>sumStock(o.reserved)>0);
    if(o){a.status='Holt Auftrag #'+o.id;action(a,'reserve'+o.id,dt,.55,()=>{
      let room=max;for(const p of PRODUCTS){const n=Math.min(room,o.reserved[p.id]);a.cargo[p.id]+=n;o.reserved[p.id]-=n;room-=n;}
      if(count(a))a.orderId=o.id;s.revision++;
    });return true;}
  }return false;
}
export function interactPlayer(s,dt){
  const a=s.player;a.status='Unterwegs';let done=false;
  if(s.upgrades.online&&(s.mode==='online'||a.orderId||a.parcel)&&(!count(a)||a.orderId))done=onlineInteract(s,a,dt,capacity(s));
  if(!done&&!a.orderId&&!a.parcel){
    const shelf=s.shelves.find(r=>near(a,servicePoint(r))&&a.cargo[r.product]>0&&r.stock<shelfCapacity(r));
    if(shelf)done=fillShelf(s,a,shelf,dt);
    else if(near(a,LOCATIONS.delivery))done=pickup(s,a,dt,capacity(s));
    else if(near(a,LOCATIONS.storage)){
      a.storageIntent ||= count(a)?'deposit':'take';
      if(a.storageIntent==='deposit')done=deposit(s,a,dt);
      else if(s.mode==='store')done=takeStorage(s,a,s.selected,dt,capacity(s));
    }else if(near(a,LOCATIONS.cashier,.95))done=checkout(s,a,0,dt);
    else if(s.upgrades.checkout&&near(a,LOCATIONS.cashier2,.95))done=checkout(s,a,1,dt);
  }
  if(!near(a,LOCATIONS.storage))a.storageIntent=null;
  if(!done){a.action='';a.progress=0;}updateProgress(s);
}
function staffTick(s,a,dt){
  if(!a.active){a.status=a.arrears?'Lohn offen – pausiert':'Pausiert';return;}
  const speed=2.6*(1+a.level*.2),max=4+a.level*2;
  let target=null,work=null;
  if(a.role==='cashier'){
    const q0=queues(s,0),q1=queues(s,1);
    const index=s.upgrades.checkout&&q1.length&&(!q0.length||q1[0].ticket<q0[0].ticket)?1:0;
    target=cashierPoint(index);work=()=>checkout(s,a,index,dt);
  }else if(a.role==='loader'){
    if(count(a)){target=LOCATIONS.storage;work=()=>deposit(s,a,dt);}
    else if(activeDelivery(s)){target=LOCATIONS.delivery;work=()=>pickup(s,a,dt,max);}
  }else if(a.role==='stocker'){
    if(count(a)){
      const r=s.shelves.find(r=>a.cargo[r.product]>0&&r.stock<shelfCapacity(r));
      target=r?servicePoint(r):LOCATIONS.storage;work=()=>r?fillShelf(s,a,r,dt):deposit(s,a,dt);
    }else{
      const r=[...s.shelves].sort((a,b)=>a.stock-b.stock).find(r=>s.storage[r.product]>0&&r.stock<shelfCapacity(r));
      if(r){target=LOCATIONS.storage;work=()=>takeStorage(s,a,r.product,dt,Math.min(max,shelfCapacity(r)-r.stock));}
    }
  }else if(a.role==='packer'){
    target=onlineTarget(s,a);work=()=>onlineInteract(s,a,dt,max);
  }
  if(!target){a.status=a.role==='packer'?'Wartet auf Auftrag / Ware':'Wartet auf Ware';a.action='';a.progress=0;return;}
  // Fill a whole carrying bundle at the source before changing destination.
  if(a.role==='loader'&&near(a,LOCATIONS.delivery,.2)&&count(a)<max&&activeDelivery(s)&&sumStock(activeDelivery(s).items)>0){target=LOCATIONS.delivery;work=()=>pickup(s,a,dt,max);}
  if(a.role==='stocker'&&near(a,LOCATIONS.storage,.2)&&count(a)>0&&count(a)<max){
    const id=PRODUCTS.find(p=>a.cargo[p.id]>0)?.id,r=s.shelves.find(r=>r.product===id);
    if(s.storage[id]>0&&r.stock+count(a)<shelfCapacity(r)){target=LOCATIONS.storage;work=()=>takeStorage(s,a,id,dt,max);}
  }
  a.status='Unterwegs';
  if(moveActor(s,a,target,dt,speed))work?.();else{a.action='';a.progress=0;}
  a.workTime+=dt;
  if(a.workTime>=60){
    a.workTime-=60;const wage=STAFF[a.role].wage+a.level;
    if(!spend(s,wage,'wages')){a.arrears+=wage;a.active=false;event(s,`${STAFF[a.role].name}: Lohn offen`);}
  }
}
export function settleWage(s,id){
  const a=s.staff.find(e=>e.id===id);if(!a||!a.arrears||!spend(s,a.arrears,'wages'))return false;
  a.arrears=0;a.active=true;return true;
}
function spawnCustomer(s){
  if(!s.shelves.some(r=>r.stock>0))return;
  const available=s.shelves.filter(r=>r.stock>0),r=available[Math.floor(rand(s)*available.length)];
  const pool=customerPools.get(s)||[],c=pool.pop()||{};customerPools.set(s,pool);
  for(const key of Object.keys(c))delete c[key];
  Object.assign(c,actor('c'+(++s.serial),12,25,{state:'shopping',product:r.product,wait:0,checkout:0,ticket:0,wanted:s.milestone>=10?2:1,color:Math.floor(rand(s)*6)}));s.customers.push(c);
}
function returnBasket(s,c){for(const p of PRODUCTS){s.storage[p.id]+=c.cargo[p.id];c.cargo[p.id]=0;}}
function customerTick(s,c,dt){
  c.wait+=dt;
  if(c.wait>65&&c.state!=='exit'){
    returnBasket(s,c);c.state='exit';c.wait=0;c.status='Wartezeit zu lang';c.routeKey='';s.stats.lost++;
  }
  if(c.state==='shopping'){
    const r=s.shelves.find(r=>r.product===c.product);
    if(!r){c.state='exit';return;}
    c.status=r.stock?'Kauft '+PRODUCT[r.product].name:'Wartet: Regal leer';
    if(moveActor(s,c,servicePoint(r),dt,2.2)&&r.stock>0){
      action(c,'shop'+r.id,dt,.7,()=>{
        if(r.stock<=0)return;r.stock--;c.cargo[r.product]++;c.wanted--;c.wait=0;s.revision++;
        const next=s.shelves.find(x=>x.product!==c.product&&x.stock>0);
        if(c.wanted&&next){c.product=next.product;c.routeKey='';}else{
          c.state='queue';c.checkout=s.upgrades.checkout&&queues(s,1).length<queues(s,0).length?1:0;c.ticket=++s.serial;c.routeKey='';
        }
      });
    }
  }else if(c.state==='queue'){
    const place=queues(s,c.checkout).findIndex(e=>e.id===c.id);c.status='Wartet an Kasse '+(c.checkout+1);
    moveActor(s,c,queuePoint(c.checkout,place),dt,2.6);
  }else if(c.state==='exit'){
    if(moveActor(s,c,LOCATIONS.entrance,dt,2.8)||c.wait>45){returnBasket(s,c);c.remove=true;}
  }
}
function deliveryTick(s,dt){
  const d=s.deliveries[0];if(!d)return;
  if(d.phase==='enroute'){d.timer-=dt;d.progress=Math.min(1,1-d.timer/(d.duration||10));if(d.timer<=0){d.phase='unloading';d.progress=1;event(s,'Lieferung ist da!','delivery',LOCATIONS.delivery);}}
  else if(d.phase==='unloading'&&sumStock(d.items)===0){d.phase='leaving';d.timer=3;}
  else if(d.phase==='leaving'){d.timer-=dt;d.progress=Math.max(0,d.timer/3);if(d.timer<=0)s.deliveries.shift();}
}
function mailTick(s,dt){
  if(!s.upgrades.online)return;
  const m=s.mail;m.timer-=dt;
  if(m.phase==='away'&&m.timer<=0){m.phase='arriving';m.timer=3;}
  else if(m.phase==='arriving'){m.progress=1-Math.max(0,m.timer)/3;if(m.timer<=0){m.phase='loading';m.timer=.8;}}
  else if(m.phase==='loading'&&m.timer<=0){
    const o=s.orders.find(o=>o.state==='ready');
    if(o){
      let units=0;for(const p of PRODUCTS){s.sold[p.id]+=o.packed[p.id];units+=o.packed[p.id];}
      const amount=o.price+(o.express&&s.time<=o.deadline?o.bonus:0);earn(s,amount,'onlineRevenue');s.stats.units+=units;s.stats.orders++;
      s.orders=s.orders.filter(x=>x!==o);event(s,`Paket abgeholt · +${amount} €`,'money',LOCATIONS.post);m.timer=.8;
    }else{m.phase='leaving';m.timer=3;}
  }else if(m.phase==='leaving'){m.progress=Math.max(0,m.timer/3);if(m.timer<=0){m.phase='away';m.timer=35/(1+s.upgrades.pickup*.35);m.progress=0;}}
}
export function updateProgress(s){
  while(s.milestone<20&&MILESTONES[s.milestone][1](s)){s.milestone++;event(s,`Meilenstein ${s.milestone}: ${MILESTONES[s.milestone-1][0]}`,'milestone');}
  for(const [id,name,value,target] of AWARDS)if(!s.awards[id]&&value(s)>=target){s.awards[id]={at:s.time};event(s,'Erfolg: '+name,'award');}
}
export function dailyTasks(s){return [
  {id:'customers',label:`${20+s.day.number%3*5} Kunden bedienen`,value:s.stats.customers-s.day.baseCustomers,target:20+s.day.number%3*5,reward:60+s.day.number%3*15},
  {id:'stocked',label:`${40+s.day.number%3*10} Produkte einräumen`,value:s.stats.stocked-s.day.baseStocked,target:40+s.day.number%3*10,reward:45+s.day.number%3*10},
  {id:'orders',label:`${3+s.day.number%3} Pakete verschicken`,value:s.stats.orders-s.day.baseOrders,target:3+s.day.number%3,reward:90+s.day.number%3*20}
];}
export function claimTask(s,id){
  const t=dailyTasks(s).find(t=>t.id===id);if(!t||t.value<t.target||s.day.claimed.includes(id))return false;
  s.day.claimed.push(id);earn(s,t.reward,'rewards');event(s,`Tagesziel · +${t.reward} €`,'award');return true;
}
export function tick(s,dt,{x=0,z=0,interact=true}={}){
  if(!Number.isFinite(dt)||dt<=0)return;dt=Math.min(dt,.1);s.time+=dt;
  const day=Math.floor(s.time/600);if(day!==s.day.number)s.day={number:day,baseCustomers:s.stats.customers,baseStocked:s.stats.stocked,baseOrders:s.stats.orders,claimed:[]};
  deliveryTick(s,dt);reserveOrders(s);movePlayer(s,x,z,dt);if(interact)interactPlayer(s,dt);
  for(const a of s.staff)staffTick(s,a,dt);
  s.spawn-=dt;const cap=s.upgrades.empire?24:s.upgrades.floor?16:7;
  if(s.spawn<=0){if(s.customers.length<cap)spawnCustomer(s);s.spawn=Math.max(2.5,8-s.milestone*.22);}
  for(const c of s.customers)customerTick(s,c,dt);
  const pool=customerPools.get(s)||[];for(const c of s.customers)if(c.remove&&pool.length<30)pool.push(c);customerPools.set(s,pool);s.customers=s.customers.filter(c=>!c.remove);
  if(s.upgrades.online){
    s.orderTimer-=dt;
    if(s.orderTimer<=0){
      const ids=s.shelves.map(r=>r.product),items={};const size=s.upgrades.warehouseXL?4:2;
      for(let n=0;n<size;n++){const id=ids[Math.floor(rand(s)*ids.length)];items[id]=(items[id]||0)+1+Math.floor(rand(s)*(s.upgrades.warehouseXL?5:3));}
      createOnlineOrder(s,items,!!s.upgrades.shipping&&rand(s)<.35);s.orderTimer=s.upgrades.empire?20:40;
    }
  }
  mailTick(s,dt);updateProgress(s);
}
export function inventory(s){
  const total=emptyStock(),add=stock=>{for(const p of PRODUCTS)total[p.id]+=stock[p.id]||0;};
  add(s.storage);for(const d of s.deliveries)add(d.items);
  for(const a of [s.player,...s.staff,...s.customers])add(a.cargo);
  for(const r of s.shelves)total[r.product]+=r.stock;
  for(const o of s.orders){add(o.reserved);add(o.staged);add(o.packed);}return total;
}
export function audit(s){
  const errors=[],total=inventory(s);
  for(const p of PRODUCTS)if(total[p.id]+s.sold[p.id]!==s.received[p.id])errors.push('Bestandsdifferenz '+p.id);
  const f=s.finance,expected=f.initial+f.storeRevenue+f.onlineRevenue+f.rewards-f.purchases-f.wages-f.investment-f.debtRepaid;
  if(expected!==s.cash)errors.push('Geldbuchung');
  if(f.creditPurchases-f.debtRepaid!==s.debt)errors.push('Kreditbuchung');
  const stocks=[s.storage,s.received,s.sold,...s.deliveries.map(d=>d.items),...[s.player,...s.staff,...s.customers].map(a=>a.cargo),...s.orders.flatMap(o=>[o.reserved,o.staged,o.packed,o.required])];
  if(stocks.some(b=>PRODUCTS.some(p=>!finiteInt(b[p.id]))))errors.push('Ungültiger Bestand');
  if(!finiteInt(s.cash)||!finiteInt(s.debt)||s.shelves.some(r=>!finiteInt(r.stock)||r.stock>shelfCapacity(r)))errors.push('Ungültige Menge / Geld');
  for(const o of s.orders){
    for(const p of PRODUCTS){const held=[s.player,...s.staff].filter(a=>a.orderId===o.id).reduce((n,a)=>n+a.cargo[p.id],0);
      if(o.reserved[p.id]+o.staged[p.id]+o.packed[p.id]+held>o.required[p.id])errors.push('Doppelreservierung');}
  }
  return [...new Set(errors)];
}
export function serialize(s){
  const errors=audit(s);if(errors.length)throw new Error(errors.join(', '));
  return JSON.stringify(s,(key,value)=>['route','routeKey','events'].includes(key)?undefined:value);
}
export function deserialize(json){
  const s=JSON.parse(json);
  if(!s||s.version!==SAVE_VERSION)throw new Error('Nicht unterstützte Spielstand-Version.');
  // Reject corrupt files instead of silently wiping earned progress.
  if(!Array.isArray(s.shelves)||s.shelves.length<1||s.shelves.length>12||!Array.isArray(s.staff)||s.staff.length>4||!Array.isArray(s.customers)||s.customers.length>30||!Array.isArray(s.orders)||s.orders.length>6||!Array.isArray(s.deliveries)||s.deliveries.length>4)throw new Error('Ungültiger Spielstand.');
  for(const p of PRODUCTS)if(!finiteInt(s.received?.[p.id])||!finiteInt(s.sold?.[p.id]))throw new Error('Ungültige Bestände.');
  if(!finiteInt(s.milestone)||s.milestone>20||!Number.isFinite(s.time)||s.time<0)throw new Error('Ungültiger Fortschritt.');
  if(!['store','online'].includes(s.mode)||!PRODUCT[s.selected]||!finiteInt(s.theme)||s.theme>2||!finiteInt(s.serial)||!finiteInt(s.seed))throw new Error('Ungültiger Spielzustand.');
  for(const key of ['unloaded','stocked','customers','units','orders','lost'])if(!finiteInt(s.stats?.[key]))throw new Error('Ungültige Statistik.');
  if(!Array.isArray(s.stats.typesStocked)||s.stats.typesStocked.some(id=>!PRODUCT[id]))throw new Error('Ungültiges Sortiment.');
  for(const key of ['initial','purchases','storeRevenue','onlineRevenue','wages','investment','rewards','debtRepaid','creditPurchases'])if(!finiteInt(s.finance?.[key]))throw new Error('Ungültige Buchung.');
  if(!s.day||!finiteInt(s.day.number)||!Array.isArray(s.day.claimed)||s.day.claimed.some(id=>!['customers','stocked','orders'].includes(id)))throw new Error('Ungültige Tagesziele.');
  for(const key of ['baseCustomers','baseStocked','baseOrders'])if(!finiteInt(s.day[key]))throw new Error('Ungültiges Tagesziel.');
  if(!s.awards||typeof s.awards!=='object'||Array.isArray(s.awards)||Object.keys(s.awards).some(id=>!AWARDS.some(a=>a[0]===id)))throw new Error('Ungültige Erfolge.');
  if(!s.mail||!['away','arriving','loading','leaving'].includes(s.mail.phase)||!Number.isFinite(s.mail.timer))throw new Error('Ungültiges Postfahrzeug.');
  if(s.deliveries.some(d=>!['enroute','unloading','leaving'].includes(d.phase)||!Number.isFinite(d.timer)))throw new Error('Ungültige Lieferung.');
  const stockRecords=[s.storage,s.received,s.sold,...s.deliveries.map(d=>d.items),...[s.player,...s.staff,...s.customers].map(a=>a.cargo),...s.orders.flatMap(o=>[o.required,o.reserved,o.staged,o.packed])];
  if(stockRecords.some(b=>!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).length!==PRODUCTS.length||Object.keys(b).some(id=>!PRODUCT[id])))throw new Error('Unbekannte Bestandsfelder.');
  for(const o of s.orders){
    if(!finiteInt(o.id)||!['waiting','reserved','parcel','ready','held'].includes(o.state)||!finiteInt(o.price)||!finiteInt(o.bonus)||![0,1].includes(o.station)||!Number.isFinite(o.packProgress)||o.packProgress<0||o.packProgress>1)throw new Error('Ungültiger Onlineauftrag.');
  }
  for(const [id,u]of Object.entries(UPGRADES))if(!finiteInt(s.upgrades?.[id])||s.upgrades[id]>u.max)throw new Error('Ungültiger Ausbau.');
  for(const a of [s.player,...s.staff,...s.customers]){
    if(!Number.isFinite(a.x)||!Number.isFinite(a.z)||a.x<0||a.x>24||a.z<0||a.z>26)throw new Error('Ungültige Figur.');
    a.routeKey='';a.route=[];a.action='';a.progress=0;
  }
  if(s.shelves.some(r=>!PRODUCT[r.product]||!finiteInt(r.level)||r.level>4||r.x!==SHELF_POSITIONS[PRODUCTS.findIndex(p=>p.id===r.product)][0]||r.z!==SHELF_POSITIONS[PRODUCTS.findIndex(p=>p.id===r.product)][1])||new Set(s.shelves.map(r=>r.product)).size!==s.shelves.length)throw new Error('Ungültiges Regal.');
  if(s.staff.some(a=>!STAFF[a.role]||!finiteInt(a.level)||a.level>3||!finiteInt(a.arrears)||!Number.isFinite(a.workTime))||new Set(s.staff.map(a=>a.role)).size!==s.staff.length)throw new Error('Ungültiger Mitarbeiter.');
  if(s.customers.some(a=>!['shopping','queue','exit'].includes(a.state)||!PRODUCT[a.product]||!finiteInt(a.ticket)||!Number.isFinite(a.wait)))throw new Error('Ungültiger Kunde.');
  s.events=[];const errors=audit(s);if(errors.length)throw new Error(errors.join(', '));return s;
}
export function nextHint(s){
  const a=s.player;
  if(a.parcel)return {text:'Paket zur gelben Abholzone tragen',target:LOCATIONS.parcels};
  if(a.orderId){const o=s.orders.find(o=>o.id===a.orderId);return o?.hold?{text:'Zurückgestellte Ware ins Lager zurückbringen',target:LOCATIONS.storage}:{text:'Onlineware zum Packtisch bringen',target:packPoint(o||{station:0})};}
  if(count(a)){
    const r=s.shelves.find(r=>a.cargo[r.product]&&r.stock<shelfCapacity(r));
    return r?{text:'Ware zum '+PRODUCT[r.product].name+'-Regal tragen',target:servicePoint(r)}:{text:'Ware im Lager ablegen',target:LOCATIONS.storage};
  }
  if(s.mode==='online'&&s.upgrades.online)return {text:'Onlineauftrag: reservierte Ware holen, packen, ablegen',target:onlineTarget(s,a)||LOCATIONS.terminal};
  if(s.customers.some(c=>c.state==='queue')&&!s.staff.some(e=>e.role==='cashier'&&e.active))return {text:'Hinter die Kasse laufen und Kunden bedienen',target:LOCATIONS.cashier};
  if(activeDelivery(s)&&sumStock(activeDelivery(s).items))return {text:'Anlieferung: Kartons beim Fahrzeug abholen',target:LOCATIONS.delivery};
  if(s.storage[s.selected]>0)return {text:'Ware im Lager holen: '+PRODUCT[s.selected].name,target:LOCATIONS.storage};
  return {text:s.milestone<3?'Erste Lieferung abholen und Saftregal füllen':'Nächstes Ziel: '+(MILESTONES[s.milestone]?.[0]||'Dein Imperium weiter ausbauen'),target:s.milestone<3?LOCATIONS.delivery:LOCATIONS.build};
}
