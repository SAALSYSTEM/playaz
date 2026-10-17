// MySupermarkt: prices are whole game euros, quantities are individual units.
export const SAVE_VERSION = 1;
export const SAVE_KEY = 'mysupermarkt.v1';
export const PRODUCTS = [
  {id:'juice',name:'Saft',buy:2,sell:6,color:0xffa53d,shape:'carton',kind:'shelf',unlock:0},
  {id:'water',name:'Wasser',buy:1,sell:4,color:0x51c5ef,shape:'bottle',kind:'shelf',unlock:3},
  {id:'milk',name:'Milch',buy:3,sell:8,color:0xe9f5ff,shape:'carton',kind:'fridge',unlock:6},
  {id:'bread',name:'Brot',buy:2,sell:7,color:0xd79b56,shape:'loaf',kind:'large',unlock:10},
  {id:'apple',name:'Äpfel',buy:2,sell:6,color:0xef6557,shape:'fruit',kind:'produce',unlock:10},
  {id:'banana',name:'Bananen',buy:2,sell:7,color:0xffd84b,shape:'banana',kind:'produce',unlock:10},
  {id:'eggs',name:'Eier',buy:3,sell:9,color:0xe7d5b8,shape:'eggs',kind:'fridge',unlock:10},
  {id:'pasta',name:'Nudeln',buy:2,sell:8,color:0xf7ca62,shape:'bag',kind:'large',unlock:10},
  {id:'cereal',name:'Müsli',buy:3,sell:10,color:0x8bce86,shape:'box',kind:'large',unlock:14},
  {id:'chocolate',name:'Schokolade',buy:3,sell:10,color:0x9862c9,shape:'bar',kind:'shelf',unlock:14},
  {id:'pizza',name:'Tiefkühlpizza',buy:4,sell:13,color:0xd95755,shape:'pizza',kind:'freezer',unlock:16},
  {id:'coffee',name:'Kaffee',buy:5,sell:16,color:0x694942,shape:'bag',kind:'large',unlock:18}
];
export const PRODUCT = Object.fromEntries(PRODUCTS.map(p=>[p.id,p]));
export const SHELF_POSITIONS = [[6,5],[10,5],[6,9],[10,9],[6,13],[10,13],[16,5],[20,5],[16,9],[20,9],[16,13],[20,13]];
export const LOCATIONS = {
  delivery:{x:2,z:20}, storage:{x:2,z:13}, terminal:{x:2,z:10},
  pack:{x:2,z:4}, pack2:{x:4,z:4}, parcels:{x:19,z:20}, post:{x:19,z:21},
  build:{x:12,z:12}, entrance:{x:12,z:25}, cashier:{x:8,z:15.5}, cashier2:{x:13,z:15.5}
};
export const STAFF = {
  cashier:{name:'Kassierer',cost:160,wage:4,unlock:5},
  stocker:{name:'Warenverräumer',cost:260,wage:5,unlock:8},
  loader:{name:'Lagerarbeiter',cost:380,wage:5,unlock:12},
  packer:{name:'Online-Packer',cost:600,wage:6,unlock:17}
};
export const UPGRADES = {
  warehouse:{name:'Lagerraum erweitern',cost:180,unlock:7,max:1,desc:'Lagerkapazität 80 → 240 Einheiten.'},
  truck:{name:'Mittlerer LKW',cost:320,unlock:9,max:1,desc:'Bis zu 72 Einheiten pro Bestellung; kürzere Anfahrt.'},
  floor:{name:'Neue Verkaufsfläche',cost:440,unlock:10,max:1,desc:'Sechs zusätzliche Stellplätze und neues Sortiment.'},
  checkout:{name:'Zweite Kasse',cost:340,unlock:11,max:1,desc:'Zweite echte Warteschlange. Kassierer bedient beide nacheinander.'},
  cart:{name:'Transportwagen',cost:250,unlock:13,max:1,desc:'Tragkapazität 4 → 10; sichtbarer Transportwagen.'},
  online:{name:'Onlineshop eröffnen',cost:480,unlock:14,max:1,desc:'Bestellungen, Packtisch, Paketablage und Postabholung.'},
  shipping:{name:'Versandbereich ausbauen',cost:600,unlock:16,max:1,desc:'Zweiter Packtisch, acht Paketplätze und Expressaufträge.'},
  warehouseXL:{name:'Großes Versandlager',cost:850,unlock:18,max:1,desc:'Lagerkapazität 600, großer LKW und Großbestellungen.'},
  empire:{name:'Imperium eröffnen',cost:1500,unlock:19,max:1,desc:'Alle 12 Regale erforderlich. Mehr Kundschaft und Aufträge im Endlosbetrieb.'},
  speed:{name:'Leichte Arbeitsschuhe',cost:90,unlock:3,max:3,desc:'Je Stufe 15 % schneller laufen.'},
  capacity:{name:'Tragkraft verbessern',cost:100,unlock:5,max:3,desc:'Je Stufe zwei zusätzliche Einheiten tragen.'},
  packing:{name:'Packtechnik',cost:180,unlock:15,max:3,desc:'Je Stufe 20 % schneller verpacken.'},
  pickup:{name:'Häufigere Postabholung',cost:200,unlock:16,max:3,desc:'Kürzerer Abholrhythmus.'}
};
export const MILESTONES = [
  ['Erste Lieferung entladen',s=>s.stats.unloaded>0],
  ['Erstes Regal auffüllen',s=>s.stats.stocked>0],
  ['Ersten Kunden kassieren',s=>s.stats.customers>0],
  ['Zweites Regal kaufen',s=>s.shelves.length>=2],
  ['Neue Produktgruppe anbieten',s=>s.stats.typesStocked.includes('water')],
  ['Kassierer einstellen',s=>s.staff.some(e=>e.role==='cashier')],
  ['Kühlregal bauen',s=>s.shelves.some(r=>r.product==='milk')],
  ['Lagerraum erweitern',s=>s.upgrades.warehouse>0],
  ['Warenverräumer einstellen',s=>s.staff.some(e=>e.role==='stocker')],
  ['Größeren LKW kaufen',s=>s.upgrades.truck>0],
  ['Verkaufsfläche eröffnen',s=>s.upgrades.floor>0],
  ['Zweite Kasse bauen',s=>s.upgrades.checkout>0],
  ['Lagerarbeiter einstellen',s=>s.staff.some(e=>e.role==='loader')],
  ['Transportwagen anschaffen',s=>s.upgrades.cart>0],
  ['Onlineshop eröffnen',s=>s.upgrades.online>0],
  ['Erste Onlinebestellung versenden',s=>s.stats.orders>0],
  ['Versandbereich ausbauen',s=>s.upgrades.shipping>0],
  ['Online-Packer einstellen',s=>s.staff.some(e=>e.role==='packer')],
  ['Großes Versandlager bauen',s=>s.upgrades.warehouseXL>0],
  ['Supermarkt-Imperium',s=>s.upgrades.empire>0]
];
export const AWARDS = [
  ['first','Mein erster Verkauf',s=>s.stats.customers,1],
  ['hundred','100 Kunden bedient',s=>s.stats.customers,100],
  ['thousand','1.000 Produkte verkauft',s=>s.stats.units,1000],
  ['staff','Erster Mitarbeiter',s=>s.staff.length,1],
  ['shelves','10 Regale gekauft',s=>s.shelves.length,10],
  ['online','Erster Onlineauftrag',s=>s.stats.orders,1],
  ['parcels','100 Pakete verschickt',s=>s.stats.orders,100],
  ['revenue','10.000 Umsatz',s=>s.finance.storeRevenue+s.finance.onlineRevenue,10000],
  ['empire','Voll ausgebaut',s=>s.milestone,20],
  ['million','Supermarkt-Millionär',s=>s.cash,1000000]
];
export const emptyStock = () => Object.fromEntries(PRODUCTS.map(p=>[p.id,0]));
export const sumStock = stock => Object.values(stock).reduce((a,b)=>a+b,0);
export const shelfCost = id => id==='water'?100: id==='milk'?200: 160+PRODUCTS.findIndex(p=>p.id===id)*35;
export const shelfCapacity = shelf => (PRODUCT[shelf.product].kind==='large'?24:16)+shelf.level*8;
