import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame,tick,audit,inventory,orderGoods,buyShelf,buyUpgrade,hire,upgradeShelf,upgradeStaff,settleWage,rescue,holdOrder,createOnlineOrder,reserveOrders,serialize,deserialize,interactPlayer,updateProgress,capacity,claimTask,totalRevenue} from '../public/spiele/mysupermarkt/engine.js';
import {PRODUCTS,PRODUCT,UPGRADES,STAFF,LOCATIONS,MILESTONES,AWARDS,emptyStock,sumStock,shelfCapacity,shelfCost} from '../public/spiele/mysupermarkt/data.js';
import {moveActor,pathTo,walkable,near,servicePoint,obstacles,queuePoint} from '../public/spiele/mysupermarkt/navigation.js';
import {shareText,shareURL,challengeFrom} from '../public/spiele/mysupermarkt/share.js';

function advance(s,seconds,interact=false){for(let i=0;i<Math.ceil(seconds*20);i++)tick(s,.05,{interact});}
function at(s,pos,seconds=1){s.player.x=pos.x;s.player.z=pos.z;advance(s,seconds,true);}
function grant(s,amount){s.finance.initial+=amount;s.cash+=amount;}
function assertClean(s){assert.deepEqual(audit(s),[]);}
function unlock(s){s.milestone=19;grant(s,100000);for(const id of ['warehouse','truck','floor','checkout','cart','online','shipping','warehouseXL'])assert.equal(buyUpgrade(s,id),true);for(const p of PRODUCTS.slice(1))assert.equal(buyShelf(s,p.id),true);}

test('Start: echter Einkauf, zwölf Saft, ein Regal, keine Mitarbeiter',()=>{
  const s=createGame();assert.equal(s.cash,96);assert.equal(s.finance.purchases,24);assert.equal(s.shelves.length,1);assert.equal(s.staff.length,0);assert.equal(inventory(s).juice,12);assertClean(s);
  assert.equal(orderGoods(s,'juice',-1),false);assert.equal(orderGoods(s,'juice',.5),false);assert.equal(orderGoods(s,'coffee',3),false);assert.equal(orderGoods(s,'juice',25),false);assertClean(s);
});
test('Komplette Ladenkette: Lieferung → Tragen → Regal → Kundenkorb → Zahlung',()=>{
  const s=createGame();advance(s,4);at(s,LOCATIONS.delivery,1.2);assert.equal(s.player.cargo.juice,4);assert.equal(s.stats.unloaded,4);
  at(s,servicePoint(s.shelves[0]),1.3);assert.equal(s.player.cargo.juice,0);assert.ok(s.shelves[0].stock>0);assert.equal(s.milestone,2);
  at(s,LOCATIONS.cashier,40);assert.ok(s.stats.customers>=1);assert.equal(s.finance.storeRevenue,s.stats.units*6);assert.equal(s.finance.purchases,24);assert.equal(s.cash,96+s.finance.storeRevenue);assertClean(s);
});
test('Lager abgeben/abholen oszilliert nicht, Traglimit gilt',()=>{
  const s=createGame();advance(s,4);at(s,LOCATIONS.delivery,2);at(s,LOCATIONS.storage,5);
  assert.equal(s.storage.juice,4);assert.equal(s.player.cargo.juice,0);
  at(s,{x:4,z:15},.1);at(s,LOCATIONS.storage,5);assert.equal(s.storage.juice,0);assert.equal(s.player.cargo.juice,4);assertClean(s);
});
test('Regal nicht überfüllbar und keine Ware aus dem Nichts',()=>{
  const s=createGame();advance(s,4);for(let n=0;n<3;n++){at(s,LOCATIONS.delivery,2);at(s,servicePoint(s.shelves[0]),2);}
  const before=inventory(s).juice;at(s,LOCATIONS.delivery,5);assert.equal(s.player.cargo.juice,0);assert.equal(inventory(s).juice,before);assertClean(s);
});
test('Onlinekette: Reservieren → Tragen → Packen → Ablage → Postzahlung',()=>{
  const s=createGame();s.milestone=14;grant(s,1000);buyUpgrade(s,'online');advance(s,4);
  at(s,LOCATIONS.delivery,1.2);at(s,LOCATIONS.storage,1.2);assert.equal(s.storage.juice,4);
  s.orderTimer=999;s.mode='online';const o=createOnlineOrder(s,{juice:3});assert.ok(o);assert.equal(o.reserved.juice,3);assert.equal(s.storage.juice,1);assert.equal(s.finance.onlineRevenue,0);
  at(s,{x:4,z:15},.1);at(s,LOCATIONS.storage,.8);assert.equal(s.player.orderId,o.id);assert.equal(s.player.cargo.juice,3);
  at(s,LOCATIONS.pack,5);assert.equal(s.player.parcel,o.id);assert.equal(s.finance.onlineRevenue,0);
  at(s,LOCATIONS.parcels,.2);assert.equal(o.state,'ready');assert.equal(s.finance.onlineRevenue,0);
  advance(s,60);assert.equal(s.stats.orders,1);assert.equal(s.finance.onlineRevenue,18);assert.equal(s.sold.juice,3);assertClean(s);
  advance(s,60);assert.equal(s.finance.onlineRevenue,18);assertClean(s);
});
test('Reservierungen: zwei Aufträge teilen fünf vorhandene Einheiten ohne Doppelverkauf',()=>{
  const s=createGame();s.upgrades.online=1;s.storage.juice=5;s.received.juice+=5;
  const a=createOnlineOrder(s,{juice:3}),b=createOnlineOrder(s,{juice:3});reserveOrders(s);
  assert.equal(a.reserved.juice,3);assert.equal(b.reserved.juice,2);assert.equal(b.state,'waiting');assert.equal(s.storage.juice,0);assertClean(s);
  for(let i=0;i<20;i++)reserveOrders(s);assert.equal(b.reserved.juice,2);assertClean(s);
});
test('Unerfüllte Aufträge bleiben erhalten, Expressablauf vernichtet keinen Auftrag',()=>{
  const s=createGame();s.upgrades.online=1;s.orderTimer=9999;const o=createOnlineOrder(s,{juice:4},true);advance(s,180);assert.ok(s.orders.includes(o));assert.equal(o.state,'waiting');assertClean(s);
});
test('Zurückstellen gibt nur Lagerreservierungen sofort frei; Packware wird zurückgetragen',()=>{
  const s=createGame();s.upgrades.online=1;s.orderTimer=9999;s.storage.juice=4;s.received.juice+=4;
  const o=createOnlineOrder(s,{juice:4});s.mode='online';at(s,LOCATIONS.storage,.8);at(s,LOCATIONS.pack,.8);
  assert.equal(o.staged.juice,4);assert.equal(s.storage.juice,0);assert.equal(holdOrder(s,o.id),true);
  assert.equal(s.storage.juice,0);assert.equal(holdOrder(s,o.id),false);assertClean(s);
  at(s,LOCATIONS.pack,.8);assert.equal(s.player.cargo.juice,4);assert.equal(o.staged.juice,0);
  at(s,LOCATIONS.storage,.8);assert.equal(s.storage.juice,4);assert.equal(s.player.cargo.juice,0);
  assert.ok(s.orders.includes(o));assert.equal(o.state,'held');assert.equal(holdOrder(s,o.id),true);assert.equal(o.reserved.juice,4);assertClean(s);
});
test('Speicherdateien mit HTML in Statistik oder doppelten Regalen werden abgelehnt',()=>{
  const s=createGame(),a=JSON.parse(serialize(s));a.stats.customers='<img src=x onerror=alert(1)>';assert.throws(()=>deserialize(JSON.stringify(a)));
  const b=JSON.parse(serialize(s));b.shelves.push({...b.shelves[0]});assert.throws(()=>deserialize(JSON.stringify(b)));
});
test('Wegfindung: alle Arbeitsplätze mit allen 12 Regalen erreichbar',()=>{
  const s=createGame();unlock(s);
  const targets=[...Object.values(LOCATIONS),...s.shelves.map(servicePoint),...Array.from({length:10},(_,i)=>queuePoint(0,i)),...Array.from({length:10},(_,i)=>queuePoint(1,i))];
  for(const target of targets){const path=pathTo(s,{x:12,z:25},target);assert.ok(path?.length,JSON.stringify(target));for(const p of path)assert.equal(walkable(s,p.x,p.z),true);}
  for(const b of obstacles(s))assert.equal(walkable(s,b.x,b.z),false);
});
test('Kunden verlassen einen unbedienten Laden, Ware bleibt erhalten',()=>{
  const s=createGame();advance(s,4);at(s,LOCATIONS.delivery,1.2);at(s,servicePoint(s.shelves[0]),1.3);
  advance(s,110);assert.ok(s.stats.lost>0);assert.equal(s.finance.storeRevenue,0);assertClean(s);
});
test('Mitarbeiter bewegen echte Ware; Löhne korrekt, Pausen kosten nichts',()=>{
  const s=createGame();unlock(s);s.orderTimer=9999;hire(s,'loader');hire(s,'stocker');hire(s,'cashier');
  advance(s,180);assert.ok(s.stats.unloaded>=12);assert.ok(s.stats.stocked>0);assert.ok(s.stats.customers>0);assert.ok(s.finance.wages>0);assertClean(s);
  for(const e of s.staff)e.active=false;const wages=s.finance.wages;advance(s,120);assert.equal(s.finance.wages,wages);assertClean(s);
});
test('Fehlendes Lohnbudget pausiert Mitarbeiter, Begleichen bucht genau einmal',()=>{
  const s=createGame();s.milestone=5;grant(s,500);hire(s,'cashier');const a=s.staff[0];s.finance.investment+=s.cash;s.cash=0;a.workTime=59.99;
  advance(s,.1);assert.equal(a.active,false);assert.equal(a.arrears,4);assert.equal(s.cash,0);assert.equal(settleWage(s,a.id),false);
  grant(s,20);assert.equal(settleWage(s,a.id),true);assert.equal(s.cash,16);assert.equal(settleWage(s,a.id),false);assertClean(s);
});
test('Upgrade-/Baukäufe respektieren Freischaltungen, Reserven und Limits',()=>{
  const s=createGame();assert.equal(buyShelf(s,'water'),false);assert.equal(hire(s,'cashier'),false);assert.equal(buyUpgrade(s,'online'),false);
  s.milestone=3;grant(s,100);assert.equal(buyShelf(s,'water'),true);const cash=s.cash;assert.equal(buyShelf(s,'water'),false);assert.equal(s.cash,cash);
  grant(s,1000);for(let i=0;i<4;i++)assert.equal(upgradeShelf(s,'s0'),true);assert.equal(upgradeShelf(s,'s0'),false);assertClean(s);
});
test('Warenkredit bringt Ware, kein Geld, und wird aus Verkäufen zurückgezahlt',()=>{
  const s=createGame();s.deliveries=[];s.received.juice=0;s.finance.investment+=s.cash;s.cash=0;
  assert.equal(rescue(s),true);assert.equal(rescue(s),false);assert.equal(s.cash,0);assert.equal(s.debt,12);assertClean(s);
  advance(s,4);at(s,LOCATIONS.delivery,2);at(s,servicePoint(s.shelves[0]),2);at(s,LOCATIONS.cashier,50);assert.ok(s.debt<12);assert.ok(s.cash>0);assertClean(s);
});
test('Tagesbelohnungen nur bei Arbeit und einmal pro Spieltag',()=>{
  const s=createGame();assert.equal(claimTask(s,'stocked'),false);s.stats.stocked=40;const cash=s.cash;assert.equal(claimTask(s,'stocked'),true);assert.equal(claimTask(s,'stocked'),false);assert.equal(s.cash,cash+45);assertClean(s);
});
test('Speichern/Laden mit Waren unterwegs und reservierten Onlineaufträgen',()=>{
  const s=createGame();s.upgrades.online=1;s.orderTimer=999;s.storage.juice=4;s.received.juice+=4;createOnlineOrder(s,{juice:3});s.mode='online';at(s,LOCATIONS.storage,.8);
  const copy=deserialize(serialize(s));assert.deepEqual(inventory(copy),inventory(s));assert.equal(copy.player.orderId,s.player.orderId);assert.equal(copy.cash,s.cash);assertClean(copy);
  at(copy,LOCATIONS.pack,5);at(copy,LOCATIONS.parcels,.2);advance(copy,60);assert.equal(copy.stats.orders,1);assertClean(copy);
  const broken=JSON.parse(serialize(s));broken.storage.juice=-3;assert.throws(()=>deserialize(JSON.stringify(broken)));assert.throws(()=>deserialize('{bad'));assert.throws(()=>deserialize('{"version":99}'));
});
test('Sharing ist lokal, Herausforderung begrenzt und Link vollständig',()=>{
  const s=createGame();s.stats.customers=123;assert.match(shareText(s),/123 Kunden/);const url=shareURL('https://playsaal.com/spiele/mysupermarkt',s);assert.equal(challengeFrom(url),123);assert.equal(challengeFrom('https://playsaal.com/?kunden=-1'),null);assert.equal(challengeFrom('https://playsaal.com/?kunden=Infinity'),null);
});
test('Alle 20 Meilensteine und zehn Awards definiert',()=>{assert.equal(MILESTONES.length,20);assert.equal(AWARDS.length,10);assert.equal(new Set(PRODUCTS.map(p=>p.id)).size,12);});

for(const seed of [7,71,715])test(`Stress ${seed}: Kunden, Reservierungen, Rücktransporte und Speicherwechsel`,()=>{
  let s=createGame(seed);unlock(s);buyUpgrade(s,'empire');for(const role of Object.keys(STAFF))hire(s,role);
  for(let i=0;i<18000;i++){
    if(i%100===0){const p=PRODUCTS[Math.floor(i/100)%12];orderGoods(s,p.id,24);}
    if(i%1500===0&&s.orders.length){const o=s.orders.find(o=>!o.hold);if(o)holdOrder(s,o.id);}
    if(i%1500===500)for(const o of s.orders)if(o.hold)holdOrder(s,o.id);
    tick(s,.1,{x:Math.sin(i*.002),z:Math.cos(i*.002),interact:true});
    if(i%600===0){assertClean(s);assert.ok(s.customers.length<=24);assert.ok(walkable(s,s.player.x,s.player.z));s=deserialize(serialize(s));}
    if(i%100===0)for(const a of [...s.staff,...s.customers])assert.equal(walkable(s,a.x,a.z),true,`${a.id}: ${a.x},${a.z}`);
  }
  assert.ok(s.stats.customers>100);assert.ok(s.stats.orders>0);assertClean(s);
});

// An autonomous regression player uses actual paths and interaction timers.
// This is a systems/balance test, not a claim that a human playtest was performed.
export function botStep(s,dt=.1){
  const a=s.player;
  for(const t of dailyTasksForBot(s))claimTask(s,t);
  // Reserve replenishment money before investments.
  for(const r of s.shelves){
    const id=r.product,held=inventory(s)[id];
    if(held<6&&s.deliveries.length<4&&s.cash>=PRODUCT[id].buy*12+12)orderGoods(s,id,12);
  }
  if(s.cash>100){
    const goals={3:()=>buyShelf(s,'water'),5:()=>hire(s,'cashier'),6:()=>buyShelf(s,'milk'),7:()=>buyUpgrade(s,'warehouse'),8:()=>hire(s,'stocker'),9:()=>buyUpgrade(s,'truck'),10:()=>buyUpgrade(s,'floor'),11:()=>buyUpgrade(s,'checkout'),12:()=>hire(s,'loader'),13:()=>buyUpgrade(s,'cart'),14:()=>buyUpgrade(s,'online'),16:()=>buyUpgrade(s,'shipping'),17:()=>hire(s,'packer'),18:()=>buyUpgrade(s,'warehouseXL')};
    goals[s.milestone]?.();
    if(s.milestone>=19){for(const p of PRODUCTS)buyShelf(s,p.id);buyUpgrade(s,'empire');}
  }
  for(const e of s.staff)if(e.arrears)settleWage(s,e.id);
  if(s.cash<24)for(const o of s.orders)if(!o.hold)holdOrder(s,o.id);
  if(s.cash>150)for(const o of s.orders)if(o.hold)holdOrder(s,o.id);
  let target=null;
  if(a.parcel)target=LOCATIONS.parcels;
  else if(a.orderId){const o=s.orders.find(o=>o.id===a.orderId);target=o?.hold?LOCATIONS.storage:o?.station?LOCATIONS.pack2:LOCATIONS.pack;}
  else if(sumStock(a.cargo)){
    const r=s.shelves.find(r=>a.cargo[r.product]&&r.stock<shelfCapacity(r));target=r?servicePoint(r):LOCATIONS.storage;
  }else if(s.upgrades.online&&!s.staff.some(e=>e.role==='packer')){
    const o=s.orders.find(o=>o.state==='parcel'||sumStock(o.staged)===sumStock(o.required));
    if(o){s.mode='online';target=o.station?LOCATIONS.pack2:LOCATIONS.pack;}
    else if(s.orders.some(o=>sumStock(o.reserved)>0)){s.mode='online';target=LOCATIONS.storage;}
  }
  if(!target){
    s.mode='store';
    if(!s.staff.some(e=>e.role==='cashier'&&e.active)&&s.customers.some(c=>c.state==='queue'))target=LOCATIONS.cashier;
    else if(!s.staff.some(e=>e.role==='loader'&&e.active)&&s.deliveries.some(d=>d.phase==='unloading'&&sumStock(d.items)))target=LOCATIONS.delivery;
    else if(!s.staff.some(e=>e.role==='stocker'&&e.active)){
      const r=s.shelves.find(r=>s.storage[r.product]>0&&r.stock<shelfCapacity(r));if(r){s.selected=r.product;target=LOCATIONS.storage;}
    }
    if(!target)target={x:4,z:17};
  }
  if(near(a,LOCATIONS.storage,.1)&&a.storageIntent==='deposit'&&!sumStock(a.cargo)&&target===LOCATIONS.storage)target={x:4,z:15};
  moveActor(s,a,target,dt,3.8);tick(s,dt,{interact:true});
}
function dailyTasksForBot(s){return ['customers','stocked','orders'].filter(id=>!s.day.claimed.includes(id));}

test('Langlauf: 20 Meilensteine ohne Geld-Cheats erreichbar, Inventur bleibt korrekt',t=>{
  const s=createGame();let maxStage=0;
  for(let i=0;i<180000&&s.milestone<20;i++){
    botStep(s);if(i%1000===0)assertClean(s);maxStage=Math.max(maxStage,s.milestone);
  }
  assertClean(s);assert.equal(s.milestone,20,JSON.stringify({stage:maxStage,cash:s.cash,time:s.time,stock:inventory(s),staff:s.staff.map(e=>[e.role,e.status]),player:s.player.status}));
  assert.equal(s.finance.initial,120);assert.ok(s.stats.orders>0);assert.equal(s.shelves.length,12);assert.ok(totalRevenue(s)>5000);
  t.diagnostic(`Imperium nach ${(s.time/60).toFixed(1)} simulierten Minuten; ${s.stats.customers} Kunden, ${s.stats.orders} Pakete, ${totalRevenue(s)} € Umsatz.`);
  for(let i=0;i<6000;i++)botStep(s);assertClean(s);assert.ok(s.stats.customers>100);
});
