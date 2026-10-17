import {PRODUCTS,PRODUCT,STAFF,UPGRADES,MILESTONES,AWARDS,LOCATIONS,SAVE_KEY,sumStock,shelfCapacity,shelfCost} from './data.js';
import {createGame,tick,serialize,deserialize,orderGoods,buyShelf,upgradeShelf,buyUpgrade,hire,upgradeStaff,settleWage,rescue,holdOrder,dailyTasks,claimTask,capacity,storageCapacity,truckCapacity,priceUpgrade,nextHint,totalRevenue,inventory} from './engine.js';
import {near} from './navigation.js';
import {createView} from './render.js';
import {shareText,shareURL,challengeFrom,drawShare} from './share.js';

const $=id=>document.getElementById(id),money=n=>n.toLocaleString('de-DE')+' €',esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state,view,started=false,panel=null,last=0,accumulator=0,lastSave=0,lastRevision=-1,seenEvent=0,toastUntil=0,keys={},pointer=null,stick={x:0,z:0},pausedBySystem=false,savingAllowed=true,audio=null,muted=false,modalFocus=null,uiTimer=0;
const base=document.querySelector('link[rel=canonical]').href,challenge=challengeFrom(location.href);
let storageBlocked=false,challengeShown=false,shareUntil=0;
try{const raw=localStorage.getItem(SAVE_KEY);state=raw?deserialize(raw):createGame();muted=localStorage.getItem('mysupermarkt.muted')==='1';}
catch(e){
  try{const backup=localStorage.getItem(SAVE_KEY+'.backup');if(!backup)throw e;state=deserialize(backup);$('saveWarning').textContent='Die letzte Sicherung wurde wiederhergestellt. Der beschädigte Stand bleibt zunächst erhalten.';savingAllowed=false;}
  catch(_){state=createGame();savingAllowed=false;storageBlocked=true;$('saveWarning').textContent='Der vorhandene Spielstand ist nicht lesbar oder der Speicher gesperrt. Er wird nicht überschrieben. Du kannst vorübergehend ohne Speicherung spielen.';}
  $('saveWarning').hidden=false;
}
function toast(text){$('toast').textContent=text;$('toast').hidden=false;toastUntil=performance.now()+4200;}
function save(force=false){
  if(!savingAllowed)return;
  if(!force&&state.revision===lastRevision&&state.time-lastSave<10)return;
  try{
    const raw=serialize(state),old=localStorage.getItem(SAVE_KEY);
    if(old){try{deserialize(old);localStorage.setItem(SAVE_KEY+'.backup',old);}catch(_){}}
    localStorage.setItem(SAVE_KEY,raw);lastSave=state.time;lastRevision=state.revision;
  }catch(e){toast('Speichern nicht möglich. Bitte Spielstand unter Pause exportieren.');}
}
function beep(kind){
  if(muted||!audio)return;try{const o=audio.createOscillator(),g=audio.createGain();o.type='sine';o.frequency.value=kind==='money'?660:kind==='award'?880:480;g.gain.setValueAtTime(.04,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.16);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+.17);}catch(_){}
}
function unlockAudio(){if(!audio)try{audio=new(window.AudioContext||window.webkitAudioContext)();}catch(_){}audio?.resume().catch(()=>{});}
function release(){keys={};stick={x:0,z:0};pointer=null;$('joystick').hidden=true;}
function openPanel(kind){release();modalFocus=document.activeElement;panel=kind;$('modal').hidden=false;renderPanel();$('closeModal').focus();save(true);}
function closePanel(){panel=null;$('modal').hidden=true;release();last=performance.now();accumulator=0;modalFocus?.focus?.();}
function disabled(ok){return ok?'':' disabled';}
function button(cmd,id,label,ok=true,cls='buy'){return `<button class="${cls}" data-cmd="${cmd}" data-id="${esc(id)}"${disabled(ok)}>${label}</button>`;}
function row(title,detail,btn,color){return `<div class="item">${color?`<span class="swatch" style="background:#${color.toString(16).padStart(6,'0')}"></span>`:''}<div><b>${title}</b><small>${detail}</small></div>${btn||''}</div>`;}
function renderPanel(){
  const s=state;let html='';const titles={supply:'Waren einkaufen',build:'Dein Markt wächst',staff:'Dein Team',overview:'Dein Supermarkt',orders:'Onlineversand',pause:'Kurz durchatmen',awards:'Deine Erfolge',milestones:'Dein Weg zum Imperium',share:'Freunde herausfordern'};
  $('modalTitle').textContent=titles[panel]||'MySupermarkt';
  if(panel==='supply'){
    html=`<p>Bezahle die Ware hier. Hole sie anschließend beim Fahrzeug ab. Neue Bestellungen warten hinter dem aktuellen Fahrzeug.</p><div class="metrics"><div class="metric"><b>${money(s.cash)}</b>Guthaben</div><div class="metric"><b>${sumStock(s.storage)} / ${storageCapacity(s)}</b>Freie Ware im Lager</div></div>`;
    for(const r of s.shelves){const p=PRODUCT[r.product],qty=Math.min(12,truckCapacity(s)),incoming=s.deliveries.reduce((n,d)=>n+d.items[p.id],0),reserved=s.orders.reduce((n,o)=>n+o.reserved[p.id],0);
      html+=row(p.name,`Einkauf ${p.buy} € · Verkauf ${p.sell} €<br>Lager ${s.storage[p.id]} · Regal ${r.stock}/${shelfCapacity(r)} · Reserviert ${reserved}${incoming?' · Unterwegs '+incoming:''}`,button('order',p.id,`${qty} für ${qty*p.buy} €`,s.cash>=qty*p.buy&&s.deliveries.length<4),p.color);
      html+=`<div class="actions">${button('orderSmall',p.id,'4 Stück · '+p.buy*4+' €',s.cash>=p.buy*4&&s.deliveries.length<4,'secondary')}${s.upgrades.truck?button('orderBulk',p.id,truckCapacity(s)+' Stück · '+truckCapacity(s)*p.buy+' €',s.cash>=truckCapacity(s)*p.buy&&s.deliveries.length<4,'secondary'):''}</div>`;
    }
    html+='<h3>Lieferplan</h3>';
    html+=s.deliveries.length?s.deliveries.map((d,i)=>`<p>${i+1}. ${d.phase==='unloading'?'Am Tor – abholen':d.phase==='leaving'?'Fährt ab':i?'In der Lieferwarteschlange':'Unterwegs'} · ${sumStock(d.items)} Einheiten</p>`).join(''):'<p>Keine Lieferung unterwegs.</p>';
    if(s.cash<12&&sumStock(inventory(s))===0&&!s.debt)html+=`<div class="warning">Keine Ware und kein Einkaufsgeld? 6 Saft auf 12 € Warenkredit. Ein Drittel späterer Einnahmen tilgt den Kredit.${button('rescue','','Warenkredit nutzen')}</div>`;
  }else if(panel==='build'){
    html=`<p>Guthaben: <strong>${money(s.cash)}</strong>. Für Nachbestellungen bleiben bei Ausbaukäufen mindestens 12 € übrig.</p><h3>Dein nächstes Ziel</h3><p>${MILESTONES[s.milestone]?.[0]||'Imperium-Modus: Mehr Kundschaft und Großbestellungen.'}</p>`;
    for(const [id,u]of Object.entries(UPGRADES))if(s.upgrades[id]<u.max){
      const eligible=s.milestone>=u.unlock&&(id!=='empire'||s.shelves.length===12);
      html+=row(u.name+(u.max>1?' · Stufe '+(s.upgrades[id]+1):''),u.desc+(!eligible?`<br>Ab Meilenstein ${u.unlock}${id==='empire'?' und 12 Regalen':''}`:''),button('upgrade',id,money(priceUpgrade(s,id)),eligible&&s.cash>=priceUpgrade(s,id)+12));
    }
    html+='<h3>Sortiment & Regale</h3>';
    for(const p of PRODUCTS){const r=s.shelves.find(r=>r.product===p.id),slot=PRODUCTS.indexOf(p),unlocked=s.milestone>=p.unlock&&(slot<6||s.upgrades.floor);
      html+=r?row(p.name,`${r.stock}/${shelfCapacity(r)} gefüllt · Ausbaustufe ${r.level}/4`,button('shelfUpgrade',r.id,r.level<4?money(60*(r.level+1)):'MAX',r.level<4&&s.cash>=60*(r.level+1)+12),p.color):row(p.name,`EK ${p.buy} € · VK ${p.sell} €${unlocked?'':` · Ab Meilenstein ${p.unlock}${slot>=6?' + Verkaufsfläche':''}`}`,button('shelf',p.id,money(shelfCost(p.id)),unlocked&&s.cash>=shelfCost(p.id)+12),p.color);
    }
    html+='<h3>Ladengestaltung</h3><p>Eine kostenlose Schürzenfarbe – rein optisch.</p><div class="actions">'+[0,1,2].map((n)=>button('theme',String(n),['Sonnengelb','Koralle','Mint'][n],true,'secondary')).join('')+'</div>';
  }else if(panel==='staff'){
    html='<p>Löhne fallen pro 60 Sekunden bezahlter Einsatzzeit an. In Menüs, Pause und bei ausgeschalteter Beschäftigung läuft keine Zeit. Bei fehlendem Geld bleibt der Lohn offen und die Person pausiert.</p>';
    for(const [role,def]of Object.entries(STAFF)){
      const a=s.staff.find(a=>a.role===role);
      if(!a)html+=row(def.name,`${def.wage} €/Arbeitsminute · Ab Meilenstein ${def.unlock}`,button('hire',role,money(def.cost),s.milestone>=def.unlock&&s.cash>=def.cost+12));
      else{
        html+=row(def.name,`${esc(a.status)} · Stufe ${a.level}/3 · ${def.wage+a.level} €/Arbeitsminute`,button('staffUpgrade',a.id,a.level<3?money(120*(a.level+1)):'MAX',a.level<3&&s.cash>=120*(a.level+1)+12));
        html+='<div class="actions">'+(a.arrears?button('wage',a.id,'Offenen Lohn zahlen: '+money(a.arrears),s.cash>=a.arrears):button('staffToggle',a.id,a.active?'Pausieren':'Weiterarbeiten',true,'secondary'))+'</div>';
      }
    }
  }else if(panel==='orders'){
    html=s.upgrades.online?'<p>Onlineware wird zuerst im Lager reserviert. Im Modus <strong>Online</strong> holst du sie dort ab, trägst sie zum markierten Packtisch und danach als Paket zur Abholzone. Geld gibt es erst bei der Postabholung.</p>':'<p>Der Onlineshop wird ab Meilenstein 14 kaufbar.</p>';
    html+='<div class="orders">';
    for(const o of s.orders){const held=[s.player,...s.staff].filter(a=>a.orderId===o.id).reduce((n,a)=>n+sumStock(a.cargo),0),reserved=sumStock(o.reserved)+sumStock(o.staged)+held;
      const status=o.hold?'Zurückgestellt – Ware vom Packtisch ins Lager zurücktragen':o.state==='ready'?'In der Abholzone':o.state==='parcel'?'Paket fertig – zur Abholzone tragen':sumStock(o.staged)===sumStock(o.required)?'Am Packtisch verpacken':o.state==='waiting'?'Wartet auf Nachlieferung':'Ware reserviert';
      html+=`<article><b>Auftrag #${o.id} · ${money(o.price)}</b> ${o.express?'<span class="tag">EXPRESS</span>':''}<p>${PRODUCTS.filter(p=>o.required[p.id]).map(p=>`${o.required[p.id]} × ${p.name}`).join(' · ')}</p><small>${status} · ${['ready','parcel'].includes(o.state)?sumStock(o.required):reserved}/${sumStock(o.required)} bereit</small>${o.express?`<p>Bonus ${o.bonus} € bei Abholung in ${Math.max(0,Math.ceil(o.deadline-s.time))} s. Danach bleibt der normale Auftrag erhalten.</p>`:''}</article>`;
      if(!['parcel','ready'].includes(o.state))html+=button('hold',String(o.id),o.hold?'Auftrag fortsetzen':'Zurückstellen / Bestand freigeben',!o.hold||(!sumStock(o.staged)&&![s.player,...s.staff].some(a=>a.orderId===o.id)),'secondary');
    }
    if(!s.orders.length)html+='<p>Noch keine offenen Aufträge. Neue kommen während des Spielens.</p>';
    html+='</div>';
    if(s.upgrades.online)html+=button('mode','','Modus: '+(s.mode==='online'?'Online → Laden':'Laden → Online'));
  }else if(panel==='overview'){
    const f=s.finance;const metrics=[[money(s.cash),'Guthaben'],[money(totalRevenue(s)),'Gesamtumsatz'],[money(f.storeRevenue),'Ladenumsatz'],[money(f.onlineRevenue),'Onlineumsatz'],[money(f.purchases+f.creditPurchases),'Wareneinkäufe inkl. Kredit'],[money(f.wages+s.staff.reduce((n,e)=>n+e.arrears,0)),'Lohnaufwand inkl. offen'],[money(f.investment),'Investitionen'],[money(s.debt),'Offener Warenkredit'],[s.stats.customers,'Kunden bedient'],[s.stats.units,'Produkte verkauft'],[s.stats.orders,'Pakete versandt'],[money(totalRevenue(s)+f.rewards-f.purchases-f.creditPurchases-f.wages-s.staff.reduce((n,e)=>n+e.arrears,0)),'Vereinfachter Überschuss vor Investitionen']];
    html='<div class="metrics">'+metrics.map(([v,n])=>`<div class="metric"><b>${v}</b>${n}</div>`).join('')+'</div><p class="tip">Vereinfachte Einkaufsrechnung, keine periodengerechte Gewinnrechnung. Lagerkäufe sind sofort als Ausgabe enthalten.</p>';
    html+=`<h3>Tag ${s.day.number+1} · Tagesziele</h3><p>Ein Spieltag dauert zehn aktive Minuten.</p>`;
    for(const t of dailyTasks(s))html+=row(t.label,`${Math.max(0,t.value)} / ${t.target}`,button('claim',t.id,s.day.claimed.includes(t.id)?'Erledigt':money(t.reward),!s.day.claimed.includes(t.id)&&t.value>=t.target));
    html+='<div class="actions" style="margin-top:16px">'+button('panel','awards','Erfolge',true,'secondary')+button('panel','milestones','Meilensteine',true,'secondary')+button('panel','orders','Onlineaufträge',true,'secondary')+'</div><div class="sharing">'+button('panel','share','Erfolg teilen',true,'primary')+'</div>';
  }else if(panel==='milestones'){
    html=MILESTONES.map(([name],i)=>`<div class="milestone ${s.milestone>i?'done':''}"><strong>${s.milestone>i?'✓':i+1}</strong>${name}</div>`).join('');
  }else if(panel==='awards'){
    html=AWARDS.map(([id,name,value,target])=>row((s.awards[id]?'★ ':'☆ ')+name,Math.min(value(s),target).toLocaleString('de-DE')+' / '+target.toLocaleString('de-DE'),s.awards[id]?button('panel','share','Teilen',true,'secondary'):null)).join('');
  }else if(panel==='share'){
    html=`<p>${shareText(s)}</p><canvas id="shareCanvas" style="width:100%;border-radius:14px"></canvas><div class="actions" style="margin-top:12px">${button('share','','Teilen',true,'primary')}${button('downloadImage','','PNG laden',true,'secondary')}${button('copyLink','','Link kopieren',true,'secondary')}</div><p class="tip">Dein Stand ist lokal. Geteilte Herausforderungen sind keine verifizierte Rangliste.</p>`;
  }else{
    html=`<p>Dein Laden wartet auf dich. Lieferungen, Kunden und Löhne sind pausiert.</p><div class="actions">${button('resume','','Weiter',true,'primary')}${button('fullscreen','','Vollbild',!!document.documentElement.requestFullscreen,'secondary')}</div><h3>Spielstand</h3><p>Automatisch auf diesem Gerät. Keine Anmeldung, keine Offline-Einnahmen.</p><div class="actions">${button('export','','Sicherung herunterladen',true,'secondary')}${button('import','','Sicherung importieren',true,'secondary')}</div><input id="importFile" class="save-file" type="file" accept=".json,application/json"><p id="importStatus" role="status"></p>${!savingAllowed?'<p class="warning">Automatisches Speichern ist zum Schutz des vorhandenen Spielstands deaktiviert. Exportiere diesen Stand oder importiere eine gültige Sicherung.</p>':''}<h3>Steuerung</h3><p>WASD / Pfeiltasten oder mit einem Finger auf der Spielwelt ziehen. Nähe startet die Tätigkeit. Weglaufen unterbricht sie. Einkauf, Ausbau und Team pausieren die Welt. ESC schließt Fenster oder pausiert.</p><div class="actions">${button('panel','awards','Erfolge',true,'secondary')}${button('panel','share','Teilen',true,'secondary')}</div>`;
  }
  $('modalBody').innerHTML=html;
  if(panel==='share')drawShare($('shareCanvas'),s);
  $('importFile')?.addEventListener('change',importSave);
}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}
async function importSave(e){
  const file=e.target.files[0];if(!file)return;
  try{
    if(file.size>2000000)throw new Error('Datei zu groß.');
    const next=deserialize(await file.text());
    $('importStatus').textContent=`Gültige Sicherung: ${next.stats.customers} Kunden, ${next.milestone}/20 Ziele. Der aktuelle Stand wird vorher als Datei gesichert.`;
    const confirm=document.createElement('button');confirm.className='primary full';confirm.textContent='Sicherung übernehmen';$('importStatus').append(confirm);
    confirm.onclick=()=>{download(new Blob([serialize(state)],{type:'application/json'}),'mysupermarkt-vor-import.json');state=next;savingAllowed=true;storageBlocked=false;save(true);renderPanel();toast('Spielstand übernommen.');};
  }catch(err){$('importStatus').textContent='Nicht importiert: '+err.message;}
}
async function command(cmd,id){
  let ok=true;unlockAudio();const s=state;
  if(cmd==='order')ok=orderGoods(s,id,12);
  else if(cmd==='orderSmall')ok=orderGoods(s,id,4);
  else if(cmd==='orderBulk')ok=orderGoods(s,id,truckCapacity(s));
  else if(cmd==='shelf')ok=buyShelf(s,id);
  else if(cmd==='shelfUpgrade')ok=upgradeShelf(s,id);
  else if(cmd==='upgrade')ok=buyUpgrade(s,id);
  else if(cmd==='hire')ok=hire(s,id);
  else if(cmd==='staffUpgrade')ok=upgradeStaff(s,id);
  else if(cmd==='wage')ok=settleWage(s,id);
  else if(cmd==='staffToggle'){const a=s.staff.find(e=>e.id===id);if(a&&!a.arrears){a.active=!a.active;s.revision++;}}
  else if(cmd==='rescue')ok=rescue(s);
  else if(cmd==='hold')ok=holdOrder(s,id);
  else if(cmd==='claim')ok=claimTask(s,id);
  else if(cmd==='theme'){s.theme=Number(id);s.revision++;}
  else if(cmd==='mode'){s.mode=s.mode==='online'?'store':'online';s.player.storageIntent=null;closePanel();toast(s.mode==='online'?'Online: reservierte Ware im Lager holen':'Laden: Waren ins Regal bringen');}
  else if(cmd==='panel'){panel=id;renderPanel();return;}
  else if(cmd==='resume'){closePanel();return;}
  else if(cmd==='fullscreen'){try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen();}catch(_){toast('Vollbild wird von diesem Browser nicht unterstützt.');}return;}
  else if(cmd==='export'){download(new Blob([serialize(s)],{type:'application/json'}),'mysupermarkt-spielstand.json');return;}
  else if(cmd==='import'){$('importFile').click();return;}
  else if(cmd==='downloadImage'){$('shareCanvas').toBlob(blob=>{if(blob)download(blob,'mein-supermarkt.png');},'image/png');return;}
  else if(cmd==='copyLink'){
    try{await navigator.clipboard.writeText(shareURL(base,s));toast('Link kopiert.');}catch(_){showCopyLink();}return;
  }else if(cmd==='share'){
    const payload={title:'MySupermarkt · PlaySaal',text:shareText(s),url:shareURL(base,s)};
    try{if(navigator.share)await navigator.share(payload);else{await navigator.clipboard.writeText(payload.text+' '+payload.url);toast('Herausforderung kopiert.');}}catch(e){if(e.name!=='AbortError')showCopyLink();}return;
  }
  if(!ok)toast('Noch nicht möglich. Guthaben oder Freischaltung fehlt.');else beep('build');save(true);if(panel)renderPanel();updateUI();
}
function showCopyLink(){const p=document.createElement('p'),a=document.createElement('a');a.href=shareURL(base,state);a.textContent=a.href;a.style.cssText='color:#ffda72;overflow-wrap:anywhere;user-select:all';p.append('Link manuell kopieren: ',a);$('modalBody').append(p);}
function updateUI(){
  const s=state;$('cash').textContent=money(s.cash);$('stage').textContent=s.milestone<7?'DEIN ERSTER LADEN':s.milestone<15?'DEIN MARKT WÄCHST':s.milestone<20?'LADEN & ONLINEVERSAND':'SUPERMARKT-IMPERIUM';
  $('goalText').textContent=MILESTONES[s.milestone]?.[0]||'Dein Imperium wächst weiter';$('progressText').textContent=s.milestone+'/20';$('progress').style.width=s.milestone*5+'%';
  $('hintText').textContent=nextHint(s).text;$('actionText').textContent=s.player.status==='Unterwegs'?'Ziehen zum Laufen · Tätigkeiten automatisch':s.player.status;$('actionProgress').style.width=Math.min(100,s.player.progress*100)+'%';
  $('carrying').textContent=s.player.parcel?'1 Paket':sumStock(s.player.cargo)+' / '+capacity(s);$('onlineMode').hidden=!s.upgrades.online;$('onlineMode').classList.toggle('active',s.mode==='online');
  if($('productSelect').options.length!==s.shelves.length)$('productSelect').innerHTML=s.shelves.map(r=>`<option value="${r.product}">${PRODUCT[r.product].name}</option>`).join('');$('productSelect').value=s.selected;
  let context=null;
  if(near(s.player,LOCATIONS.terminal,1.8))context=['supply','Einkaufsterminal öffnen'];
  else if(near(s.player,LOCATIONS.build,1.8))context=['build','Hier weiter ausbauen'];
  else if(s.upgrades.online&&near(s.player,LOCATIONS.pack,1.8))context=['orders','Onlineaufträge ansehen'];
  else if(performance.now()<shareUntil)context=['share','★ Diesen Erfolg teilen'];
  $('context').hidden=!context||!!panel||!started;if(context){$('context').textContent=context[1];$('context').dataset.open=context[0];}
  const events=s.events.filter(e=>e.id>seenEvent);if(events.length){seenEvent=Math.max(...events.map(e=>e.id));const e=events.find(e=>['milestone','award'].includes(e.type))||events.at(-1);toast(e.text);beep(e.type);if(events.some(e=>e.type==='award'||e.type==='milestone'&&s.milestone>=4))shareUntil=performance.now()+8000;}
  if(challenge&&s.stats.customers>=challenge&&!challengeShown){challengeShown=true;toast('Herausforderung geschafft! '+challenge+' Kunden bedient.');}
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-open],[data-cmd]');if(!b||b.disabled)return;if(b.dataset.open)openPanel(b.dataset.open);else command(b.dataset.cmd,b.dataset.id);});
$('productSelect').onchange=e=>{state.selected=e.target.value;state.player.storageIntent=null;};
$('onlineMode').onclick=()=>openPanel('orders');$('pauseButton').onclick=()=>openPanel('pause');$('closeModal').onclick=closePanel;
$('sound').onclick=()=>{unlockAudio();muted=!muted;$('sound').textContent=muted?'♩̸':'♪';$('sound').setAttribute('aria-pressed',String(muted));try{localStorage.setItem('mysupermarkt.muted',muted?'1':'0');}catch(_){}if(!muted)beep('money');};
$('sound').textContent=muted?'♩̸':'♪';
$('start').textContent=state.time>1?'Meinen Laden weiterführen →':'Meinen Laden öffnen →';
$('start').onclick=()=>{unlockAudio();started=true;$('welcome').hidden=true;release();last=performance.now();try{localStorage.setItem('playsaal.zuletzt',JSON.stringify({s:'mysupermarkt',t:Date.now()}));}catch(_){}if(challenge)toast(`Herausforderung: ${challenge} Kunden bedienen!`);};
const codes=['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD'];
window.addEventListener('keydown',e=>{
  if(e.code==='Escape'){e.preventDefault();if(!started)return;if(panel)closePanel();else openPanel('pause');return;}
  if(panel&&e.key==='Tab'){
    const els=[...$('modal').querySelectorAll('button:not(:disabled),a,input,select')].filter(e=>!e.hidden&&e.offsetParent!==null);if(!els.length)return;
    const first=els[0],end=els.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();end.focus();}else if(!e.shiftKey&&document.activeElement===end){e.preventDefault();first.focus();}return;
  }
  if(!codes.includes(e.code)||panel||!started||['SELECT','INPUT'].includes(document.activeElement.tagName))return;e.preventDefault();keys[e.code]=true;
});
window.addEventListener('keyup',e=>{delete keys[e.code];});
const canvas=$('world');
canvas.addEventListener('pointerdown',e=>{
  if(panel||!started||pointer!==null)return;e.preventDefault();unlockAudio();pointer={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);
  $('joystick').hidden=false;$('joystick').style.left=e.clientX+'px';$('joystick').style.top=e.clientY+'px';
});
canvas.addEventListener('pointermove',e=>{
  if(pointer?.id!==e.pointerId)return;e.preventDefault();const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y,d=Math.hypot(dx,dy),scale=Math.min(1,d/45),den=Math.max(1,d);
  stick={x:dx/den*scale,z:dy/den*scale};$('joystick').firstElementChild.style.transform=`translate(${stick.x*28}px,${stick.z*28}px)`;
});
for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,e=>{if(pointer?.id===e.pointerId)release();});
window.addEventListener('blur',()=>{release();if(started&&!panel){openPanel('pause');pausedBySystem=true;}save(true);});
document.addEventListener('visibilitychange',()=>{if(document.hidden){release();if(started&&!panel){openPanel('pause');pausedBySystem=true;}save(true);}else{last=performance.now();accumulator=0;}});
window.addEventListener('pagehide',()=>save(true));
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();release();openPanel('pause');toast('3D-Verbindung unterbrochen. Spielstand gesichert. Bitte Seite neu laden.');});
window.addEventListener('resize',()=>view?.resize());
function loop(now){
  const dt=Math.min(.1,(now-last)/1000||0);last=now;
  if(started&&!panel&&!document.hidden){
    const x=stick.x+(keys.ArrowRight||keys.KeyD?1:0)-(keys.ArrowLeft||keys.KeyA?1:0),z=stick.z+(keys.ArrowDown||keys.KeyS?1:0)-(keys.ArrowUp||keys.KeyW?1:0);
    accumulator+=dt;let steps=0;
    while(accumulator>=1/30&&steps++<4){tick(state,1/30,{x:x*.894+z*.447,z:-x*.447+z*.894});accumulator-=1/30;}
    if(state.time-lastSave>=2)save();
  }
  uiTimer+=dt;if(uiTimer>.12){uiTimer=0;updateUI();}if(now>toastUntil)$('toast').hidden=true;
  view.frame(state,dt);requestAnimationFrame(loop);
}
try{view=createView(canvas);updateUI();requestAnimationFrame(loop);}
catch(e){$('fatal').hidden=false;$('fatalMessage').textContent=e.message;}
