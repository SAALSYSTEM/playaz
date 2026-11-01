// Schattenschritt – Level-Vorschläge erzeugen (Hilfe beim Leveldesign, nicht im Spiel).
// Würfelt Karten + Wächter nach einer Vorgabe, prüft mit dem Löser, ob sie lösbar sind und die gewünschten Mechaniken
// wirklich brauchen, und zeigt die besten Kandidaten als fertigen Level-Eintrag. Ausgesucht und nachbearbeitet wird von Hand.
// node tools/schattenschritt-generator.mjs <vorgabe> [anzahl] [startwert]
import * as L from '../public/spiele/schattenschritt/logik.js';

const VORGABEN = {
  // w × h Innenraum, mauern = Anteil Mauerfelder, wachen = [Art, Verhalten], braucht = Mechaniken ohne die es nicht geht
  wache: { w: 5, h: 7, mauern: 0.22, wachen: [['d', 'steht']], muenzen: 2, braucht: [], ohne: ['ko', 'warten'], umweg: 2 },
  ko: { w: 5, h: 7, mauern: 0.28, wachen: [['d', 'steht'], ['d', 'steht']], muenzen: 2, braucht: ['ko'], umweg: 0 },
  dreht: { w: 5, h: 7, mauern: 0.2, wachen: [['d', 'dreht']], muenzen: 2, braucht: [], umweg: 2 },
  patrouille: { w: 5, h: 8, mauern: 0.22, wachen: [['d', 'geht']], muenzen: 2, braucht: [], umweg: 2 },
  zwei: { w: 5, h: 8, mauern: 0.22, wachen: [['d', 'geht'], ['d', 'dreht']], muenzen: 2, braucht: [], umweg: 3 },
  warten: { w: 5, h: 8, mauern: 0.25, wachen: [['d', 'geht'], ['d', 'geht']], muenzen: 2, braucht: ['warten'], umweg: 2 },
  kerker: { w: 6, h: 9, mauern: 0.22, wachen: [['d', 'geht'], ['d', 'dreht'], ['d', 'steht']], muenzen: 3, braucht: ['ko'], umweg: 3 },
  schatten: { w: 5, h: 8, mauern: 0.18, wachen: [['d', 'steht'], ['d', 'dreht']], schatten: 2, muenzen: 2, braucht: ['schatten'], umweg: 0 },
  schatten2: { w: 6, h: 8, mauern: 0.2, wachen: [['d', 'geht'], ['d', 'steht'], ['d', 'dreht']], schatten: 3, muenzen: 3, braucht: ['schatten'], umweg: 2 },
  tor: { w: 5, h: 8, mauern: 0.22, wachen: [['d', 'geht'], ['d', 'steht']], tor: true, muenzen: 2, braucht: ['tor'], umweg: 0 },
  krieger: { w: 5, h: 8, mauern: 0.2, wachen: [['k', 'geht'], ['d', 'steht']], muenzen: 2, braucht: [], umweg: 3 },
  krieger2: { w: 6, h: 9, mauern: 0.2, wachen: [['k', 'dreht'], ['k', 'geht'], ['d', 'steht']], schatten: 3, muenzen: 3, braucht: [], umweg: 3, max: 28, warten: 5 },
  gruft: { w: 6, h: 9, mauern: 0.22, wachen: [['k', 'geht'], ['d', 'geht'], ['d', 'dreht']], schatten: 2, tor: true, muenzen: 3, braucht: ['tor'], umweg: 3, max: 28, warten: 5 },
  spaeher: { w: 5, h: 9, mauern: 0.18, wachen: [['s', 'steht'], ['s', 'dreht']], muenzen: 2, braucht: [], umweg: 3 },
  magier: { w: 5, h: 8, mauern: 0.18, wachen: [['m', 'steht'], ['d', 'geht']], schatten: 2, muenzen: 2, braucht: [], umweg: 3 },
  magier2: { w: 6, h: 9, mauern: 0.2, wachen: [['m', 'steht'], ['s', 'dreht'], ['k', 'geht']], schatten: 3, muenzen: 3, braucht: [], umweg: 3, max: 28, warten: 5 },
  turm: { w: 6, h: 10, mauern: 0.2, wachen: [['m', 'steht'], ['s', 'geht'], ['k', 'dreht'], ['d', 'geht']], schatten: 3, tor: true, muenzen: 3, braucht: ['tor'], umweg: 4, max: 32, warten: 6, egal: 1 },
  finale: { w: 6, h: 10, mauern: 0.2, wachen: [['m', 'steht'], ['s', 'dreht'], ['k', 'geht'], ['d', 'geht'], ['d', 'dreht']], schatten: 3, tor: true, muenzen: 3, braucht: ['tor', 'ko'], umweg: 4, max: 32, warten: 6, egal: 2 },
};

const name = process.argv[2], anzahl = Number(process.argv[3] || 600), seed0 = Number(process.argv[4] || 1);
const V = VORGABEN[name];
if (!V) { console.log('Vorgaben:', Object.keys(VORGABEN).join(', ')); process.exit(1); }

const R = L.zufallVon ? L.zufallVon(seed0) : (() => { let a = seed0 >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
const zahl = (n) => Math.floor(R() * n);
const nimm = (a) => a[zahl(a.length)];

function zusammenhaengend(k, w, h) {
  const frei = []; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (k[y][x] !== '#') frei.push([x, y]);
  if (!frei.length) return false;
  const seen = new Set([frei[0].join()]), q = [frei[0]];
  while (q.length) { const [x, y] = q.pop(); for (let d = 0; d < 4; d++) { const nx = x + L.DX[d], ny = y + L.DY[d]; if (nx < 0 || ny < 0 || nx >= w || ny >= h || k[ny][nx] === '#' || seen.has(nx + ',' + ny)) continue; seen.add(nx + ',' + ny); q.push([nx, ny]); } }
  return seen.size === frei.length;
}

function kandidat() {
  const { w, h } = V;
  const k = Array.from({ length: h }, () => Array(w).fill('.'));
  const sx = zahl(w), zx = zahl(w);
  k[h - 1][sx] = 'S'; k[0][zx] = 'Z';
  // Mauern in kleinen Stücken (1 oder 2 Felder)
  let ziel = Math.round(w * h * V.mauern), versuche = 0;
  while (ziel > 0 && versuche++ < 300) {
    const x = zahl(w), y = zahl(h), lang = R() < 0.5 ? 2 : 1, quer = R() < 0.5;
    const felder = [[x, y]]; if (lang === 2) felder.push(quer ? [x + 1, y] : [x, y + 1]);
    if (felder.some(([a, b]) => a >= w || b >= h || k[b][a] !== '.')) continue;
    for (const [a, b] of felder) k[b][a] = '#';
    if (!zusammenhaengend(k, w, h)) { for (const [a, b] of felder) k[b][a] = '.'; continue; }
    ziel -= felder.length;
  }
  const leer = () => { for (let i = 0; i < 200; i++) { const x = zahl(w), y = zahl(h); if (k[y][x] === '.') return [x, y]; } return null; };
  // Schatten-Flecken (2–3 Felder)
  for (let s = 0; s < (V.schatten || 0); s++) { let p = leer(); if (!p) continue; for (let n = 0; n < 3 && p; n++) { k[p[1]][p[0]] = ','; const d = zahl(4), nx = p[0] + L.DX[d], ny = p[1] + L.DY[d]; p = nx >= 0 && ny >= 0 && nx < w && ny < h && k[ny][nx] === '.' ? [nx, ny] : null; } }
  if (V.tor) {
    const t = leer(), s = leer(); if (!t || !s) return null;
    k[t[1]][t[0]] = 'T'; k[s[1]][s[0]] = 'k';
  }
  for (let m = 0; m < V.muenzen; m++) { const p = leer(); if (p) k[p[1]][p[0]] = 'o'; }
  const frei = (x, y) => x >= 0 && y >= 0 && x < w && y < h && k[y][x] !== '#' && k[y][x] !== 'T' && k[y][x] !== 'S' && k[y][x] !== 'Z';
  const wachen = [], belegt = new Set();
  for (const [a, art] of V.wachen) {
    let g = null;
    for (let i = 0; i < 80 && !g; i++) {
      const p = leer(); if (!p || belegt.has(p.join()) || Math.abs(p[0] - sx) + Math.abs(p[1] - (h - 1)) < 3) continue;
      if (art === 'steht') g = { a, p, b: 'NOSW'[zahl(4)] };
      else if (art === 'dreht') g = { a, p, b: nimm(['NOSW', 'NS', 'OW', 'WOS', 'NSO', 'SWNO']) };
      else {
        const d = zahl(4), n = 2 + zahl(3); let r = '', x = p[0], y = p[1], ok = true;
        for (let s = 0; s < n; s++) { x += L.DX[d]; y += L.DY[d]; if (!frei(x, y)) { ok = false; break; } r += 'NOSW'[d]; }
        if (ok) g = { a, p, r };
      }
    }
    if (!g) return null;
    belegt.add(g.p.join()); wachen.push(g);
  }
  return { name, karte: k.map((r) => r.join('')), w: wachen };
}

function bewerte(def) {
  let lv; try { lv = L.baue(def); } catch (e) { return null; }
  // Startfeld darf nicht schon gesehen werden
  const f0 = L.neuerLauf(lv); if (L.gesehenVon(f0) >= 0) return null;
  const r = L.loese(lv, 60); if (!r.kurz || !r.alle) return null;
  if (r.alle.length > (V.max || 22) + 14) return null;
  const ohne = L.loese({ ...lv, waechter: [] }, 60);
  const umweg = r.kurz.length - ohne.kurz.length;
  if (umweg < V.umweg) return null;
  for (const b of V.braucht) if (L.loese(lv, 60, { [b]: false }).kurz) return null;
  for (const b of V.ohne || []) if (!L.loese(lv, 60, { [b]: false }).kurz) return null;   // muss auch ohne diese Mechanik gehen
  // Jeder Wächter muss etwas ausmachen (ohne ihn wird der kürzeste Weg kürzer oder der Münzweg kürzer); bei großen Leveln dürfen „egal“ viele nur Kulisse sein
  let egal = 0;
  for (let i = 0; i < lv.waechter.length; i++) {
    const o = L.loese({ ...lv, waechter: lv.waechter.filter((_, j) => j !== i) }, 60);
    if (o.kurz && o.alle && o.kurz.length >= r.kurz.length && o.alle.length >= r.alle.length && ++egal > (V.egal || 0)) return null;
  }
  const extra = r.alle.length - r.kurz.length;
  if (extra < 2 || extra > 14) return null;
  // Gute Rätsel: echter Umweg, wenig bloßes Abwarten, nicht zu lang
  const warten = (r.kurz.match(/w/g) || []).length, wendet = (r.kurz.match(/NS|SN|OW|WO/g) || []).length;
  if (r.kurz.length > (V.max || 22) || warten > (V.warten || 4)) return null;
  const echt = umweg - warten - 2 * wendet;
  if (echt < V.umweg) return null;
  return { r, umweg, extra, punkte: echt * 2 + Math.min(extra, 6) + Math.min(warten, 2) + V.wachen.length };
}

const liste = [];
for (let i = 0; i < anzahl; i++) {
  const d = kandidat(); if (!d) continue;
  const b = bewerte(d); if (b) liste.push({ d, b });
}
liste.sort((a, b) => b.b.punkte - a.b.punkte);
console.log(`${liste.length} brauchbare von ${anzahl}`);
for (const { d, b } of liste.slice(0, 4)) {
  console.log(`\n// Punkte ${b.punkte.toFixed(1)}, Umweg ${b.umweg}, kürzester ${b.r.kurz.length} (${b.r.kurz}), mit allen Münzen ${b.r.alle.length} (${b.r.alle})`);
  console.log(`{ name: '${d.name}', zuege: ${b.r.kurz.length}, karte: [${d.karte.map((r) => `'${r}'`).join(', ')}],\n  w: [${d.w.map((g) => JSON.stringify(g).replace(/"(\w+)":/g, '$1: ').replace(/"/g, "'")).join(', ')}] },`);
}
