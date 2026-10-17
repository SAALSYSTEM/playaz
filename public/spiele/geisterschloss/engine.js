export const LEVELS = [
  'Das Schlosstor','Die Eingangshalle','Kürbisgang','Kerzenflur','Die erste Geisterwelle',
  'Mondfenster','Spinnweben','Der lange Gang','Verwunschene Bilder','Die kleine Hexe',
  'Das Verlies','Kalte Treppen','Die Bibliothek','Schattenkorridor','Die große Geisterwelle',
  'Der Schlossturm','Der Nebelgang','Das Hexenzimmer','Die letzte Treppe','Die Schlosshexe'
];
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function makeLevel(number){
  if(!Number.isInteger(number)||number<1||number>20)throw Error('Ungültiges Level');
  const n=number+5, entries=[], lanes=[-1.65,0,1.65];
  let seed=number*104729+71;
  const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  for(let i=0;i<n;i++){
    const d=19+i*5.6;
    const lane=lanes[Math.floor(rand()*3)];
    if(i%3===0)entries.push({type:'garlic',x:lanes[(lanes.indexOf(lane)+1)%3],d:d-3.6,value:4});
    if(i%4===2)entries.push({type:'pumpkin',x:lanes[(lanes.indexOf(lane)+2)%3],d:d-2.5});
    let type='ghost';
    if(number>=7&&i%7===4)type='spider';
    if(number>=10&&i%8===6)type='witch';
    if(number>=12&&i%6===3)type='bat';
    if(i===n-1&&number%5===0)type=number===20?'boss':'big';
    entries.push({type,x:lane,d,hp:type==='witch'?2:type==='big'?3:type==='boss'?5:1,speed:type==='spider'?0.8:type==='bat'?0.95:type==='boss'?0.52:0.5});
    // Geisterwellen (Level 5 und 15): drei Geister nebeneinander, vorher gibt es zusätzlich Knoblauch.
    if((number===5&&i===2)||(number===15&&(i===5||i===11))){
      entries.push({type:'garlic',x:lanes[(lanes.indexOf(lane)+2)%3],d:d-4.6,value:4});
      for(const x of lanes)if(x!==lane)entries.push({type:'ghost',x,d,hp:1,speed:0.5});
    }
  }
  return {number,name:LEVELS[number-1],entries,length:19+(n-1)*5.6+12,startGarlic:8};
}
export function hitValue(type,combo){return (type==='boss'?1200:type==='big'?550:type==='witch'?280:type==='spider'?170:type==='bat'?150:120)*clamp(1+Math.floor(combo/3),1,5);}
export function finishBonus(garlic,hearts,pumpkins){return garlic*25+hearts*150+pumpkins*75;}
export function shareText(level,score){return `Ich habe Level ${level}/20 im Geisterschloss geschafft und ${score.toLocaleString('de-DE')} Punkte geholt. Kommst du weiter?`}
