// Letzte Bastion – Regeln ohne Darstellung (testbar in node, nachspielbar auf dem Server).
// Der Held steht in der Mitte des Raums, Skelette kommen in Wellen. Ein Tipp = Hieb in diese Richtung.
// Wichtig für die geprüfte Rangliste: nur Rechenarten, die in jedem Browser und auf dem Server bitgenau gleich sind
// (+ − × ÷, Math.sqrt, Math.floor, Math.imul). Keine Math.sin/cos/atan2 – Winkel kommen aus einer festen Tabelle.

export const SCHLUESSEL = 'bastion.v1';
export const TAKT = 60, DT = 1 / TAKT;
export const SIM_VERSION = 1;
export const MAX_TAKTE = TAKT * 60 * 40;   // 40 Minuten
export const HELDEN = ['ritter', 'barbar', 'schurke', 'waldlaeufer', 'magier'];
export const PREISE = { ritter: 0, barbar: 500, schurke: 1500, waldlaeufer: 3500, magier: 7500 };
export const NAMEN = { ritter: 'Ritter Rudi', barbar: 'Barbarin Bruni', schurke: 'Schurke Schatten', waldlaeufer: 'Waldläuferin Wilma', magier: 'Magier Merlin' };

// sin(Grad) × 1 000 000, fest eingetragen (nicht berechnet) – überall identisch
const SIN6 = [0,17452,34899,52336,69756,87156,104528,121869,139173,156434,173648,190809,207912,224951,241922,258819,275637,292372,309017,325568,342020,358368,374607,390731,406737,422618,438371,453990,469472,484810,500000,515038,529919,544639,559193,573576,587785,601815,615661,629320,642788,656059,669131,681998,694658,707107,719340,731354,743145,754710,766044,777146,788011,798636,809017,819152,829038,838671,848048,857167,866025,874620,882948,891007,898794,906308,913545,920505,927184,933580,939693,945519,951057,956305,961262,965926,970296,974370,978148,981627,984808,987688,990268,992546,994522,996195,997564,998630,999391,999848,1000000,999848,999391,998630,997564,996195,994522,992546,990268,987688,984808,981627,978148,974370,970296,965926,961262,956305,951057,945519,939693,933580,927184,920505,913545,906308,898794,891007,882948,874620,866025,857167,848048,838671,829038,819152,809017,798636,788011,777146,766044,754710,743145,731354,719340,707107,694658,681998,669131,656059,642788,629320,615661,601815,587785,573576,559193,544639,529919,515038,500000,484810,469472,453990,438371,422618,406737,390731,374607,358368,342020,325568,309017,292372,275637,258819,241922,224951,207912,190809,173648,156434,139173,121869,104528,87156,69756,52336,34899,17452,0,-17452,-34899,-52336,-69756,-87156,-104528,-121869,-139173,-156434,-173648,-190809,-207912,-224951,-241922,-258819,-275637,-292372,-309017,-325568,-342020,-358368,-374607,-390731,-406737,-422618,-438371,-453990,-469472,-484810,-500000,-515038,-529919,-544639,-559193,-573576,-587785,-601815,-615661,-629320,-642788,-656059,-669131,-681998,-694658,-707107,-719340,-731354,-743145,-754710,-766044,-777146,-788011,-798636,-809017,-819152,-829038,-838671,-848048,-857167,-866025,-874620,-882948,-891007,-898794,-906308,-913545,-920505,-927184,-933580,-939693,-945519,-951057,-956305,-961262,-965926,-970296,-974370,-978148,-981627,-984808,-987688,-990268,-992546,-994522,-996195,-997564,-998630,-999391,-999848,-1000000,-999848,-999391,-998630,-997564,-996195,-994522,-992546,-990268,-987688,-984808,-981627,-978148,-974370,-970296,-965926,-961262,-956305,-951057,-945519,-939693,-933580,-927184,-920505,-913545,-906308,-898794,-891007,-882948,-874620,-866025,-857167,-848048,-838671,-829038,-819152,-809017,-798636,-788011,-777146,-766044,-754710,-743145,-731354,-719340,-707107,-694658,-681998,-669131,-656059,-642788,-629320,-615661,-601815,-587785,-573576,-559193,-544639,-529919,-515038,-500000,-484810,-469472,-453990,-438371,-422618,-406737,-390731,-374607,-358368,-342020,-325568,-309017,-292372,-275637,-258819,-241922,-224951,-207912,-190809,-173648,-156434,-139173,-121869,-104528,-87156,-69756,-52336,-34899,-17452];
export const sin = (g) => SIN6[((g % 360) + 360) % 360] / 1e6;
export const cos = (g) => SIN6[(((g + 90) % 360) + 360) % 360] / 1e6;
// Richtung zu Grad (0 = nach vorn/oben = −z, 90 = rechts = +x): Richtungsvektor (sin g, −cos g)

export const ARTEN = {
  diener: { hp: 1, v: 1.5, punkte: 10 },
  schurke: { hp: 1, v: 2.6, punkte: 15 },
  krieger: { hp: 2, v: 1.15, punkte: 20 },
  magier: { hp: 1, v: 1.3, punkte: 25, abstand: 6.5, zauber: 3.4 },
};
export const HELD = { herzen: 3, reichweite: 2.8, kegel: 100, abklingen: 0.38, schutz: 1.0 };
export const NAH = { start: 1.15, treffer: 1.6, ausholen: 0.7, zurueck: 2.2 };
export const KUGEL = { v: 3.2, treffer: 0.7 };
export const UPGRADES = {
  reichweite: { name: 'Lange Klinge', text: '+0,4 m Reichweite', max: 2 },
  kegel: { name: 'Breiter Hieb', text: '+20° Schlagbreite', max: 2 },
  tempo: { name: 'Flinke Hand', text: '15 % schneller zuschlagen', max: 2 },
  herz: { name: 'Zähes Herz', text: '+1 Herz (max. 5)', max: 2 },
  wirbel: { name: 'Wirbelhieb', text: 'Jeder 6. (dann 4.) Hieb trifft rundum', max: 2 },
  heilen: { name: 'Heiltrank', text: 'Alle Herzen auffüllen', max: 99 },
};
export const WIRBEL_ALLE = [0, 6, 4];
// Türen (Gegner laufen herein) – hinten, links, rechts
export const TUEREN = [[0, -11], [-6.5, -6], [6.5, -6]];

export function zufall(seed) {
  let a = seed >>> 0 || 1;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const kombo = (serie) => Math.min(5, 1 + Math.floor(serie / 8));
export const wellenGroesse = (n) => 3 + 2 * n;
export const tempoFaktor = (n) => Math.min(2.3, 1 + 0.06 * (n - 1));
export const ausholZeit = (n) => Math.max(0.4, NAH.ausholen - 0.015 * (n - 1));
export const gruppe = (n) => 1 + (n >= 5 ? 1 : 0) + (n >= 10 ? 1 : 0) + (n >= 16 ? 1 : 0);
// Spätere Wellen: Krieger halten mehr aus (ab Welle 10 ein Treffer mehr, ab 20 noch einer)
export const lebenszusatz = (art, n) => (art === 'krieger' ? Math.floor(n / 10) : art === 'diener' && n >= 18 ? 1 : 0);

// Welle zusammenstellen: welche Arten in welcher Reihenfolge, wo sie erscheinen
function plane(r, n) {
  const liste = [];
  for (let i = 0; i < wellenGroesse(n); i++) {
    const q = r();
    let art = 'diener';
    if (n >= 4 && q < 0.12 + 0.02 * n) art = 'magier';
    else if (n >= 3 && q < 0.35 + 0.02 * n) art = 'krieger';
    else if (n >= 2 && q < 0.6) art = 'schurke';
    // Erscheinen: Tür (0–2) oder aus dem Boden (3) – ab Welle 2
    const ort = n >= 2 && r() < 0.35 ? 3 : Math.floor(r() * 3);
    liste.push({ art, ort, g: Math.floor(r() * 360), d: 4.5 + r() * 3 });
  }
  return liste;
}

export function neuerLauf(seed) {
  const f = {
    seed, t: 0, takt: 0, r: zufall(seed), tot: false, welle: 0, phase: 'pause', pause: 1.2,
    herzen: HELD.herzen, maxHerzen: HELD.herzen, schutz: 0, abklingen: 0, blick: 0, hiebe: 0, hieb: null,
    up: { reichweite: 0, kegel: 0, tempo: 0, herz: 0, wirbel: 0, heilen: 0 }, wahl: null,
    gegner: [], kugeln: [], plan: [], naechster: 0, id: 0,
    kills: 0, serie: 0, besteSerie: 0, punkte: 0, gold: 0, getroffenVon: null,
  };
  return f;
}
export function reichweite(f) { return HELD.reichweite + 0.4 * f.up.reichweite; }
export function kegel(f) { return HELD.kegel + 20 * f.up.kegel; }
export function abklingzeit(f) { let a = HELD.abklingen; for (let i = 0; i < f.up.tempo; i++) a *= 0.85; return a; }

function starteWelle(f) {
  f.welle++; f.phase = 'kampf'; f.plan = plane(f.r, f.welle); f.naechster = 0.6;
}
function upgradeAngebot(f) {
  const frei = Object.keys(UPGRADES).filter((k) => f.up[k] < UPGRADES[k].max && (k !== 'heilen' || f.herzen < f.maxHerzen));
  const out = [];
  while (out.length < 3 && frei.length) out.push(frei.splice(Math.floor(f.r() * frei.length), 1)[0]);
  return out;
}
export function waehle(f, k) {
  if (f.phase !== 'wahl' || !f.wahl || !f.wahl[k]) return false;
  const u = f.wahl[k]; f.up[u]++;
  if (u === 'herz') { f.maxHerzen++; f.herzen++; }
  if (u === 'heilen') f.herzen = f.maxHerzen;
  f.wahl = null; f.phase = 'pause'; f.pause = 1.0;
  return u;
}
function schaden(f, wer, ev) {
  if (f.schutz > 0 || f.tot) return;
  f.herzen--; f.schutz = HELD.schutz; f.serie = 0; ev.push({ typ: 'treffer', von: wer });
  if (f.herzen <= 0) { f.tot = true; f.getroffenVon = wer; ev.push('tot'); }
}

// Ein Takt. ein: { angriff: Grad 0–359 oder −1, wahl: 0–2 oder −1 }. Rückgabe: Ereignisse.
export function schritt(f, dt, ein = {}) {
  const ev = [];
  if (f.tot) return ev;
  f.t += dt; f.takt++;
  f.schutz = Math.max(0, f.schutz - dt); f.abklingen = Math.max(0, f.abklingen - dt);
  if (f.hieb) { f.hieb.zeit -= dt; if (f.hieb.zeit <= 0) f.hieb = null; }
  // Upgrade-Wahl zwischen den Wellen
  if (f.phase === 'wahl') {
    if (ein.wahl >= 0) { const u = waehle(f, ein.wahl); if (u) ev.push({ typ: 'upgrade', u }); }
    return ev;
  }
  if (f.phase === 'pause') { f.pause -= dt; if (f.pause <= 0) { starteWelle(f); ev.push({ typ: 'welle', n: f.welle }); } return ev; }
  // Angriff in Blickrichtung
  const g = ein.angriff;
  if (Number.isInteger(g) && g >= 0 && g < 360 && f.abklingen <= 0) {
    f.blick = g; f.abklingen = abklingzeit(f); f.hiebe++;
    const w = WIRBEL_ALLE[f.up.wirbel], rund = w > 0 && f.hiebe % w === 0;
    const dx = sin(g), dz = -cos(g), rw = reichweite(f), halb = rund ? 180 : kegel(f) / 2, ck = rund ? -2 : cos(Math.floor(halb));
    f.hieb = { g, rund, zeit: 0.25 };
    ev.push({ typ: 'hieb', g, rund });
    let getroffen = 0;
    for (const e of f.gegner) {
      if (e.tot) continue;
      const l = Math.sqrt(e.x * e.x + e.z * e.z);
      if (l > rw + 0.3) continue;
      if (l > 0.3 && (e.x * dx + e.z * dz) < ck * l) continue;
      e.hp--; getroffen++;
      if (e.hp <= 0) {
        e.tot = true; e.totSeit = f.t; f.kills++; f.serie++; f.besteSerie = Math.max(f.besteSerie, f.serie);
        const m = kombo(f.serie - 1), p = ARTEN[e.art].punkte * m;
        f.punkte += p; f.gold++;
        ev.push({ typ: 'kill', id: e.id, art: e.art, punkte: p, mal: m });
      } else { e.ausholen = 0; e.rueck = 0.35; ev.push({ typ: 'schlag', id: e.id }); }
    }
    for (const k of f.kugeln) {
      if (k.weg) continue;
      const l = Math.sqrt(k.x * k.x + k.z * k.z);
      if (l > rw + 1.2) continue;
      if (l > 0.3 && (k.x * dx + k.z * dz) < ck * l) continue;
      k.weg = true; f.punkte += 2; ev.push({ typ: 'kugelWeg', id: k.id }); getroffen++;
    }
    if (!getroffen) ev.push('daneben');
  }
  // Gegner erscheinen lassen
  if (f.plan.length) {
    f.naechster -= dt;
    if (f.naechster <= 0) for (let k = gruppe(f.welle); k > 0 && f.plan.length; k--) {
      const p = f.plan.shift(), a = ARTEN[p.art];
      let x, z, aufstehen = 0;
      if (p.ort < 3) [x, z] = TUEREN[p.ort];
      else { x = sin(p.g) * p.d * 0.7; z = -cos(p.g) * p.d * 0.8 - 1; aufstehen = 1.3; }
      f.gegner.push({ id: f.id++, art: p.art, x, z, hp: a.hp + lebenszusatz(p.art, f.welle), tot: false, aufstehen, ausholen: 0, rueck: 0, zauber: a.zauber ? 1.5 : 0, abstand: a.abstand || 0 });
      ev.push({ typ: 'neu', id: f.id - 1, art: p.art, boden: aufstehen > 0 });
      f.naechster = Math.max(0.5, 1.6 - 0.08 * f.welle);
    }
  }
  // Gegner bewegen
  const tf = tempoFaktor(f.welle);
  for (const e of f.gegner) {
    if (e.tot) continue;
    if (e.aufstehen > 0) { e.aufstehen -= dt; continue; }
    if (e.rueck > 0) { e.rueck -= dt; continue; }
    const a = ARTEN[e.art], l = Math.sqrt(e.x * e.x + e.z * e.z);
    // Magier bleibt auf Abstand und zaubert – nach jedem Zauber rückt er näher (so ist er nach wenigen Kugeln erreichbar)
    if (a.abstand && l <= e.abstand) {
      e.zauber -= dt;
      if (e.zauber <= 0) {
        e.zauber = a.zauber; e.abstand -= 1.4;
        f.kugeln.push({ id: f.id++, x: e.x, z: e.z, vx: -e.x / l * KUGEL.v, vz: -e.z / l * KUGEL.v, weg: false }); ev.push({ typ: 'zauber', id: e.id });
      }
      continue;
    }
    if (l <= NAH.start) {
      e.ausholen += dt;
      if (e.ausholen >= ausholZeit(f.welle)) {
        e.ausholen = 0;
        if (l <= NAH.treffer) { ev.push({ typ: 'nahHieb', id: e.id }); schaden(f, e.art, ev); }
        const s = NAH.zurueck / (l || 1); e.x *= s; e.z *= s; e.rueck = 0.3;
      }
      continue;
    }
    e.ausholen = 0;
    const s = Math.min(l - NAH.start + 0.05, a.v * tf * dt) / l;
    e.x -= e.x * s; e.z -= e.z * s;
  }
  // Zauberkugeln
  for (const k of f.kugeln) {
    if (k.weg) continue;
    k.x += k.vx * dt; k.z += k.vz * dt;
    if (k.x * k.x + k.z * k.z < KUGEL.treffer * KUGEL.treffer) { k.weg = true; ev.push({ typ: 'kugelTreffer', id: k.id }); schaden(f, 'kugel', ev); }
  }
  if (f.kugeln.length > 30) f.kugeln = f.kugeln.filter((k) => !k.weg);
  if (f.gegner.length > 40) f.gegner = f.gegner.filter((e) => !e.tot || f.t - e.totSeit < 2);
  // Welle geschafft
  if (!f.tot && f.welle > 0 && !f.plan.length && f.gegner.every((e) => e.tot)) {
    const bonus = 50 * f.welle; f.punkte += bonus; f.gold += f.welle;
    f.kugeln.forEach((k) => { k.weg = true; });
    f.wahl = upgradeAngebot(f);
    if (f.wahl.length) f.phase = 'wahl'; else { f.wahl = null; f.phase = 'pause'; f.pause = 1.5; }   // alles ausgebaut → direkt weiter
    ev.push({ typ: 'geschafft', n: f.welle, bonus, wahl: !!f.wahl });
  }
  return ev;
}
// Erste Welle startet nach kurzer Pause
export function punkte(f) { return f.punkte; }

// ---------- Eingaben kodieren und nachspielen ----------
// Token „Abstand:Code“, Code 0–359 = Hieb in Grad, 400–402 = Upgrade-Wahl.
export function kodiere(eingaben) { let vor = 0; return eingaben.map(([t, c]) => { const s = (t - vor) + ':' + c; vor = t; return s; }).join(','); }
export function dekodiere(text) {
  if (typeof text !== 'string') return null;
  if (!text) return [];
  const out = []; let t = 0;
  for (const teil of text.split(',')) {
    const m = /^(\d{1,7}):(\d{1,3})$/.exec(teil); if (!m) return null;
    const d = Number(m[1]), c = Number(m[2]);
    if ((out.length && d < 1) || !((c >= 0 && c < 360) || (c >= 400 && c <= 402))) return null;
    t += d; out.push([t, c]);
  }
  return out;
}
export function eingabe(code) { return code >= 400 ? { angriff: -1, wahl: code - 400 } : code >= 0 ? { angriff: code, wahl: -1 } : { angriff: -1, wahl: -1 }; }
export function pruefeLauf(l) {
  if (!l || l.v !== SIM_VERSION || !Number.isInteger(l.seed) || !Number.isInteger(l.takte) || l.takte < 1 || l.takte > MAX_TAKTE) return { ok: false, grund: 'ungueltig' };
  const ein = dekodiere(l.inputs);
  if (!ein || ein.length > l.takte) return { ok: false, grund: 'eingaben' };
  const f = neuerLauf(l.seed); let i = 0;
  for (let t = 0; t < l.takte; t++) {
    if (f.tot) return { ok: false, grund: 'zu_lang' };
    let c = -1; if (i < ein.length && ein[i][0] === t) c = ein[i++][1];
    if (i < ein.length && ein[i][0] <= t) return { ok: false, grund: 'eingaben' };
    schritt(f, DT, eingabe(c));
  }
  if (!f.tot) return { ok: false, grund: 'kein_ende' };
  if (i !== ein.length) return { ok: false, grund: 'eingaben' };
  if (f.punkte !== l.punkte || f.gold !== l.gold || f.kills !== l.kills || f.welle !== l.welle) return { ok: false, grund: 'abweichung' };
  return { ok: true, punkte: f.punkte, welle: f.welle, kills: f.kills, gold: f.gold, takte: l.takte };
}
export function berlinTag(jetzt = new Date(), tage = 0) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(jetzt.getTime() + tage * 86400000));
  return Number(p.replace(/-/g, ''));
}

// ---------- Spielstand ----------
export function leerStand() { return { v: 1, gold: 0, rekord: 0, welle: 0, kills: 0, helden: ['ritter'], held: 'ritter', ton: true, tag: 0, tagBest: 0 }; }
export function pruefeStand(s) {
  const l = leerStand();
  if (!s || typeof s !== 'object') return l;
  const zahl = (x) => (Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0);
  const helden = Array.isArray(s.helden) ? s.helden.filter((h) => HELDEN.includes(h)) : [];
  if (!helden.includes('ritter')) helden.unshift('ritter');
  return { v: 1, gold: zahl(s.gold), rekord: zahl(s.rekord), welle: zahl(s.welle), kills: zahl(s.kills), helden: [...new Set(helden)], held: helden.includes(s.held) ? s.held : 'ritter', ton: s.ton !== false, tag: zahl(s.tag), tagBest: zahl(s.tagBest) };
}
export function verbuche(st, f, tag = 0) {
  st.gold += f.gold; st.kills += f.kills; st.welle = Math.max(st.welle, f.welle);
  if (tag) { if (st.tag !== tag) { st.tag = tag; st.tagBest = 0; } if (f.punkte > st.tagBest) { st.tagBest = f.punkte; f.tagesBest = true; } }
  if (f.punkte > st.rekord) { st.rekord = f.punkte; return true; }
  return false;
}
export function freischalten(st, held) {
  if (!HELDEN.includes(held) || st.helden.includes(held) || st.gold < PREISE[held]) return false;
  st.gold -= PREISE[held]; st.helden.push(held); st.held = held; return true;
}
