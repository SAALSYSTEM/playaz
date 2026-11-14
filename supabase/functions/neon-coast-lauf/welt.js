// Neon Coast – Fluchtwagen: die Stadt. Fest (immer dieselbe Insel), aus Regeln gebaut, ohne DOM – läuft auch in Node.
// Maße in Metern, x nach Osten, y nach Süden. Bodenraster 2 m. Gebäudeflächen kommen aus bilder.js (aus der Bildform).
import { GROESSE, UMRISS } from './bilder.js';

export const Z = 2;
export const BREITE = 760, HOEHE = 780;
export const NX = BREITE / Z, NY = HOEHE / Z;
export const BODEN = { TIEF: 0, FLACH: 1, SAND: 2, GRAS: 3, ASPHALT: 4, GEHWEG: 5, PFLASTER: 6, BETON: 7, HOLZ: 8 };

// Straßen: Mittellinien und Breiten (Nord–Süd bzw. West–Ost). Index 3 ist jeweils die breite Allee.
export const SX = [60, 152, 244, 340, 436, 528, 620], SXB = [12, 12, 12, 20, 12, 12, 12];
export const SY = [60, 136, 212, 292, 372, 448, 524, 604], SYB = [12, 12, 12, 20, 12, 12, 12, 20];
const LAND = { x0: 50, y0: 50, x1: 680, y1: 626 };
const STRAND = { y0: 626, y1: 672, x0: 50, x1: 626 };
const GEHWEG_B = 4;

// Gebäude: Breite in Metern (Tiefe folgt aus dem Bild), Neonfarbe für die Nacht
export const HAUS = {
  'haus-wohn': { b: 16, neon: '#ffb86b', schwach: true },
  'haus-terrasse': { b: 23, neon: '#ff7fb0' },
  'haus-apart': { b: 22, neon: '#ff7a66' },
  'haus-hotel': { b: 27, neon: '#33e6e0' },
  'haus-neon': { b: 29, neon: '#39e8ff' },
  'haus-laden': { b: 18, neon: '#ff5fa2' },
  'haus-cafe': { b: 21, neon: '#ffc24d' },
  'haus-club': { b: 22, neon: '#c85bff' },
  'haus-werk': { b: 26, neon: '#33e6e0' },
  'haus-halle': { b: 27, neon: '#8fb4ff', schwach: true },
  'haus-polizei': { b: 29, neon: '#4d86ff' },
  'haus-garage': { b: 28, neon: '#ffb300' },
  'tank-shop': { b: 16, neon: '#ff7a66' },
  'tank-dach': { b: 26, neon: '#ffffff' }
};
// Koffer-Orte: Grundwert je Art
export const KOFFER = {
  laden: { name: 'Koffer am Laden', wert: 200 }, cafe: { name: 'Koffer am Café', wert: 250 }, tank: { name: 'Koffer an der Tankstelle', wert: 250 },
  park: { name: 'Übergabe im Park', wert: 300 }, halle: { name: 'Koffer an der Halle', wert: 350 }, club: { name: 'Koffer am Club', wert: 400 },
  kiste: { name: 'Kiste im Hafen', wert: 400 }, hotel: { name: 'Koffer am Hotel', wert: 450 }, strand: { name: 'Koffer am Strand', wert: 500 },
  kai: { name: 'Lieferung am Kai', wert: 700 }, yacht: { name: 'Koffer am Pier', wert: 800 }
};
const KOFFER_ART = { 'haus-laden': 'laden', 'haus-cafe': 'cafe', 'haus-club': 'club', 'haus-hotel': 'hotel', 'haus-neon': 'hotel', 'haus-halle': 'halle', 'tank-shop': 'tank' };

export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

let WELT = null;
export function baueWelt() { return WELT || (WELT = bauen()); }

function bauen() {
  const W = {
    boden: new Uint8Array(NX * NY), flaechen: [], gebaeude: [], boxen: [], kreise: [], dinge: [], parker: [], strassen: [], kreuzungen: [],
    knoten: [], kanten: [], verstecke: [], werkstaetten: [], koffer: [], wachen: [], start: null
  };
  const fuelle = (x0, y0, x1, y1, t) => {
    const i0 = Math.max(0, Math.round(x0 / Z)), i1 = Math.min(NX, Math.round(x1 / Z)), j0 = Math.max(0, Math.round(y0 / Z)), j1 = Math.min(NY, Math.round(y1 / Z));
    for (let j = j0; j < j1; j++) W.boden.fill(t, j * NX + i0, j * NX + i1);
    if (i1 > i0 && j1 > j0) W.flaechen.push({ x0: i0 * Z, y0: j0 * Z, x1: i1 * Z, y1: j1 * Z, t });
  };
  const box = (x0, y0, x1, y1, hoch = true, art = '') => { const b = { x0, y0, x1, y1, hoch, art }; W.boxen.push(b); return b; };
  const kreis = (x, y, r) => { W.kreise.push({ x, y, r }); };
  // ebene: 0 = am Boden (unter Autos), 2 = oben (über Autos). weich: wird umgefahren (Radius r).
  const ding = (bild, x, y, g, rot = 0, o = {}) => { const d = { bild, x, y, g, rot, ebene: 0, weich: false, r: 0, ...o }; W.dinge.push(d); return d; };

  // ---------- Grundflächen ----------
  fuelle(30, STRAND.y1, 646, STRAND.y1 + 20, BODEN.FLACH);
  fuelle(30, STRAND.y0 - 8, LAND.x0, STRAND.y1, BODEN.FLACH);
  fuelle(LAND.x0, LAND.y0, LAND.x1, LAND.y1, BODEN.PFLASTER);
  fuelle(STRAND.x0, STRAND.y0, STRAND.x1, STRAND.y1, BODEN.SAND);
  fuelle(626, LAND.y0, LAND.x1, STRAND.y1, BODEN.BETON);
  fuelle(LAND.x0, 614, 626, 626, BODEN.GEHWEG);   // Strandpromenade
  // Straßen
  const xA = SX[0] - SXB[0] / 2, xE = SX[6] + SXB[6] / 2, yA = SY[0] - SYB[0] / 2, yE = SY[7] + SYB[7] / 2;
  fuelle(LAND.x0, LAND.y0, xE, yA, BODEN.GEHWEG); fuelle(LAND.x0, LAND.y0, xA, yE, BODEN.GEHWEG);   // Uferweg Nord und West
  SX.forEach((x, i) => { fuelle(x - SXB[i] / 2, yA, x + SXB[i] / 2, yE, BODEN.ASPHALT); W.strassen.push({ r: 'v', m: x, b: SXB[i], a: yA, e: yE, i }); });
  SY.forEach((y, j) => { fuelle(xA, y - SYB[j] / 2, xE, y + SYB[j] / 2, BODEN.ASPHALT); W.strassen.push({ r: 'h', m: y, b: SYB[j], a: xA, e: xE, i: j }); });
  for (let i = 0; i < SX.length; i++) for (let j = 0; j < SY.length; j++) W.kreuzungen.push({ x: SX[i], y: SY[j], bx: SXB[i], by: SYB[j], i, j });
  // Leitplanken an Nord- und Westufer (kein Sturz ins Wasser), Ost (Hafen) und Süd (Strand) sind offen
  box(LAND.x0, LAND.y0, LAND.x1, LAND.y0 + 1, false, 'planke'); box(LAND.x0, LAND.y0, LAND.x0 + 1, LAND.y1, false, 'planke');
  for (let x = LAND.x0 + 3; x < LAND.x1 - 2; x += 6) ding('leitplanke', x, LAND.y0 + 0.6, 6, 0);
  for (let y = LAND.y0 + 3; y < LAND.y1 - 2; y += 6) ding('leitplanke', LAND.x0 + 0.6, y, 6, 1.5708);
  // Stege (Holz) am Strand und Piers (Beton) im Hafen
  const stege = [{ x: 200, e: 742 }, { x: 424, e: 730 }];
  for (const s of stege) {
    fuelle(s.x - 4, STRAND.y0, s.x + 4, s.e, BODEN.HOLZ); fuelle(s.x - 10, s.e - 14, s.x + 10, s.e, BODEN.HOLZ);
    W.koffer.push({ x: s.x, y: s.e - 7, art: 'yacht' });
    ding('boot', s.x - 15, s.e - 8, 9, 0.1); ding('boot', s.x + 15.5, s.e - 30, 9, 3.2);
  }
  const piers = [{ y: 170, e: 744 }, { y: 402, e: 738 }];
  for (const p of piers) {
    fuelle(LAND.x1, p.y - 6, p.e, p.y + 6, BODEN.BETON); fuelle(p.e - 16, p.y - 12, p.e, p.y + 12, BODEN.BETON);
    W.koffer.push({ x: p.e - 8, y: p.y, art: 'kai' });
    ding('boot', p.e - 34, p.y - 12, 9, 1.57); ding('boot', p.e - 30, p.y + 12.5, 9, -1.5);
  }
  for (let y = 80; y < 660; y += 58) if (!piers.some((p) => Math.abs(p.y - y) < 20)) ding('boot', LAND.x1 + 5.5, y, 9, y % 3 ? 0 : 3.14);

  // ---------- Gebäude ----------
  function haus(bild, cx, cy, rot, skala = 1) {
    const [pw, ph] = GROESSE[bild], b = HAUS[bild].b * skala, h = b * ph / pw;
    const g = { bild, x: cx, y: cy, b, h, rot, neon: HAUS[bild].neon, schwach: !!HAUS[bild].schwach, boxen: [] };
    if (bild !== 'tank-dach') {
      for (const [u0, v0, u1, v1] of UMRISS[bild]) {
        let ax = (u0 - 0.5) * b, ay = (v0 - 0.5) * h, bx = (u1 - 0.5) * b, by = (v1 - 0.5) * h;
        for (let k = 0; k < rot; k++) { [ax, ay] = [-ay, ax]; [bx, by] = [-by, bx]; }
        const e = 0.35;
        g.boxen.push(box(cx + Math.min(ax, bx) + e, cy + Math.min(ay, by) + e, cx + Math.max(ax, bx) - e, cy + Math.max(ay, by) - e, true, 'haus'));
      }
    }
    g.bb = rot % 2 ? { x0: cx - h / 2, y0: cy - b / 2, x1: cx + h / 2, y1: cy + b / 2 } : { x0: cx - b / 2, y0: cy - h / 2, x1: cx + b / 2, y1: cy + h / 2 };
    W.gebaeude.push(g);
    return g;
  }
  const tiefe = (bild) => HAUS[bild].b * GROESSE[bild][1] / GROESSE[bild][0];
  // Koffer-Ort vor der Fassade (auf der Straße am Bordstein)
  function kofferVor(g, weit = 6.5) {
    const art = KOFFER_ART[g.bild]; if (!art) return;
    const t = g.h / 2 + weit, v = [[0, 1], [-1, 0], [0, -1], [1, 0]][g.rot];
    W.koffer.push({ x: g.x + v[0] * t, y: g.y + v[1] * t, art });
  }
  // Eine Häuserzeile entlang einer Kante: richtung 's' (Fassade nach Süden, Zeile am unteren Rand) oder 'n'
  function zeile(r, x0, x1, kante, richtung, pool, o = {}) {
    const luecke = o.luecke || [6, 9], zu = o.zu ?? 0.3, liste = [];
    let x = x0, sicher = 0;
    while (sicher++ < 20) {
      const kand = pool.filter((b) => x + HAUS[b].b <= x1 + 0.01);
      if (!kand.length) break;
      const bild = kand[Math.floor(r() * kand.length)];
      const frei = r() < zu ? 0 : Math.round(luecke[0] + r() * (luecke[1] - luecke[0]));
      liste.push({ bild, x, b: HAUS[bild].b, frei }); x += HAUS[bild].b + frei;
    }
    if (!liste.length) return [];
    const ende = liste[liste.length - 1]; x -= ende.frei; ende.frei = 0;
    let rest = x1 - x, skala = 1, versatz = 0;
    if (rest >= 5.5) { if (r() < 0.5) versatz = rest; else if (rest >= 11 && r() < 0.5) versatz = rest / 2; }
    else {
      const offen = liste.filter((e) => e.frei > 0);
      if (offen.length) { let add = rest / offen.length, sum = 0; for (const e of liste) { e.x += sum; if (e.frei > 0) { e.frei += add; sum += add; } } }
      else skala = 1 + rest / (x - x0);
    }
    const out = [];
    let lauf = 0;
    for (const e of liste) {
      const b = e.b * skala, t = tiefe(e.bild) * skala, cx = (skala === 1 ? e.x : x0 + lauf) + versatz + b / 2; lauf += b + e.frei;
      const vor = o.vor || 0;
      const g = richtung === 's' ? haus(e.bild, cx, kante - vor - t / 2, 0, skala) : haus(e.bild, cx, kante + vor + t / 2, 2, skala);
      if (!o.ohneKoffer) kofferVor(g, 6.5 + vor);
      out.push(g);
    }
    return out;
  }
  const frei = (x, y, r) => !W.boxen.some((b) => x + r > b.x0 && x - r < b.x1 && y + r > b.y0 && y - r < b.y1) && !W.kreise.some((k) => (k.x - x) ** 2 + (k.y - y) ** 2 < (k.r + r) ** 2);
  const baum = (bild, x, y, g, r, stamm = 0.4) => { kreis(x, y, stamm); ding(bild, x, y, g, r() * 6.283, { ebene: 2 }); };
  const PALMEN = ['palme', 'palme-faecher', 'palme-jung'];
  const AUTOS_PARK = ['auto-flitzer', 'auto-limo', 'auto-taxi', 'auto-suv', 'auto-pickup', 'auto-van', 'auto-muscle'];
  const parke = (r, x, y, a, typ) => { if (frei(x, y, 2.6) && !W.parker.some((p) => Math.abs(p.x - x) < 5.6 && Math.abs(p.y - y) < 5.6)) W.parker.push({ typ: typ || AUTOS_PARK[Math.floor(r() * AUTOS_PARK.length)], x, y, a }); };
  const CONTAINER = ['container', 'container-blau', 'container-gruen', 'container-gelb', 'container-lila'];
  function containerReihe(r, x, y, n, quer = false) {
    for (let k = 0; k < n; k++) {
      const cx = quer ? x : x + k * 2.9, cy = quer ? y + k * 2.9 : y;
      if (!frei(cx, cy, 3.2) && k === 0) return;
      box(cx - (quer ? 3 : 1.25), cy - (quer ? 1.25 : 3), cx + (quer ? 3 : 1.25), cy + (quer ? 1.25 : 3), true, 'container');
      ding(CONTAINER[Math.floor(r() * CONTAINER.length)], cx, cy, 6.1, quer ? 1.5708 : 0, { ebene: 1 });
    }
  }

  // ---------- Blöcke ----------
  const PLAN = [
    ['versteck', 'haus', 'haus', 'haus', 'tank', 'lager'],
    ['haus', 'haus', 'werkstatt', 'haus', 'haus', 'versteckHafen'],
    ['stadt', 'stadt', 'stadt', 'platz', 'polizei', 'container'],
    ['stadt', 'park', 'stadt', 'stadt', 'stadt', 'lager'],
    ['stadt', 'stadt', 'stadt', 'stadt', 'stadt', 'container'],
    ['tank', 'versteckStadt', 'stadt', 'stadt', 'stadt', 'werkstatt'],
    ['strand', 'strand', 'strand', 'strand', 'strand', 'lager']
  ];
  const STADT = ['haus-apart', 'haus-laden', 'haus-cafe', 'haus-club', 'haus-hotel', 'haus-neon', 'haus-terrasse', 'haus-apart', 'haus-laden'];
  W.bloecke = [];
  for (let rr = 0; rr < 7; rr++) for (let c = 0; c < 6; c++) {
    const typ = PLAN[rr][c], r = rng(1000 + rr * 37 + c * 101);
    const bx0 = SX[c] + SXB[c] / 2, bx1 = SX[c + 1] - SXB[c + 1] / 2, by0 = SY[rr] + SYB[rr] / 2, by1 = SY[rr + 1] - SYB[rr + 1] / 2;
    const lx0 = bx0 + GEHWEG_B, lx1 = bx1 - GEHWEG_B, ly0 = by0 + GEHWEG_B, ly1 = by1 - GEHWEG_B, mx = (bx0 + bx1) / 2, my = (by0 + by1) / 2;
    W.bloecke.push({ typ, x0: bx0, y0: by0, x1: bx1, y1: by1 });
    fuelle(bx0, by0, bx1, by1, BODEN.GEHWEG);
    const hafen = c === 5;
    const grund = typ === 'haus' || typ === 'park' || typ === 'versteck' ? BODEN.GRAS : hafen || typ === 'tank' || typ === 'polizei' || typ === 'werkstatt' ? BODEN.BETON : BODEN.PFLASTER;
    fuelle(lx0, ly0, lx1, ly1, grund);

    if (typ === 'stadt' || typ === 'strand') {
      const sued = typ === 'strand' ? ['haus-hotel', 'haus-neon', 'haus-club', 'haus-cafe', 'haus-hotel', 'haus-neon'] : STADT;
      zeile(r, lx0, lx1, ly0, 'n', typ === 'strand' ? ['haus-apart', 'haus-laden', 'haus-terrasse', 'haus-cafe'] : STADT);
      zeile(r, lx0, lx1, ly1, 's', sued);
      // Hinterhof: Müllcontainer, geparkte Autos
      for (let k = 0; k < 5; k++) {
        const x = lx0 + 5 + r() * (lx1 - lx0 - 10), y = my + (r() - 0.5) * 3;
        if (k < 2) { if (frei(x, y, 2.4)) { box(x - 1.3, y - 0.9, x + 1.3, y + 0.9, false, 'muell'); ding('muellcontainer', x, y, 2.9, 0, { ebene: 1 }); } }
        else if (k < 4) parke(r, x, y, r() < 0.5 ? 0 : 3.1416);
        else if (frei(x, y, 0.8)) ding('muelleimer', x, y, 0.9, 0, { weich: true, r: 0.5 });
      }
    } else if (typ === 'haus' || typ === 'versteck') {
      const pool = ['haus-wohn', 'haus-wohn', 'haus-terrasse'];
      if (typ === 'versteck') {
        const g = haus('haus-garage', mx, ly1 - tiefe('haus-garage') / 2, 0);
        W.verstecke.push({ x: mx, y: by1 - 2, bx: 11, by: 2.2, name: 'Garage am Hügel', haus: g, raus: 1.5708 });
        zeile(r, lx0, lx1, ly0, 'n', pool, { luecke: [7, 10], zu: 0, vor: 4, ohneKoffer: true });
        fuelle(mx - 14, ly1 - 0.1, mx + 14, by1, BODEN.BETON);
      } else {
        zeile(r, lx0, lx1, ly0, 'n', pool, { luecke: [7, 10], zu: 0, vor: 4, ohneKoffer: true });
        zeile(r, lx0, lx1, ly1, 's', pool, { luecke: [7, 10], zu: 0, vor: 4, ohneKoffer: true });
      }
      // Gärten: Bäume, Hecken, Büsche
      for (let k = 0; k < 7; k++) { const x = lx0 + 3 + r() * (lx1 - lx0 - 6), y = my + (r() - 0.5) * 12; if (frei(x, y, 2.2)) baum(r() < 0.6 ? 'baum' : 'zierbaum', x, y, 6 + r() * 2, r); }
      for (let x = lx0 + 5; x < lx1 - 5; x += 9 + Math.floor(r() * 4)) { const y = my + (r() - 0.5) * 6; if (frei(x, y, 3.6)) ding('hecke', x, y, 7, 0, { weich: true, r: 1.1, lang: 3 }); }
      for (let k = 0; k < 6; k++) { const x = lx0 + 2 + r() * (lx1 - lx0 - 4), y = (r() < 0.5 ? ly0 + 1.6 : ly1 - 1.6); if (frei(x, y, 1.2)) ding('busch', x, y, 2.4, r() * 6.28, { weich: true, r: 0.9 }); }
    } else if (typ === 'park') {
      fuelle(mx - 2, ly0, mx + 2, ly1, BODEN.PFLASTER); fuelle(lx0, my - 2, lx1, my + 2, BODEN.PFLASTER); fuelle(mx - 8, my - 8, mx + 8, my + 8, BODEN.PFLASTER);
      for (let k = 0; k < 16; k++) {
        const x = lx0 + 3 + r() * (lx1 - lx0 - 6), y = ly0 + 3 + r() * (ly1 - ly0 - 6);
        if (Math.abs(x - mx) < 5 || Math.abs(y - my) < 5 || !frei(x, y, 3)) continue;
        baum(r() < 0.5 ? 'baum' : r() < 0.5 ? 'zierbaum' : PALMEN[Math.floor(r() * 3)], x, y, 6.5 + r() * 2, r);
      }
      for (const [dx, dy, rot] of [[-5.5, -11, 1], [5.5, 11, 3], [-11, 5.5, 0], [11, -5.5, 2]]) ding('bank', mx + dx, my + dy, 2.4, rot * 1.5708, { weich: true, r: 0.8 });
      for (let k = 0; k < 6; k++) { const x = lx0 + 2 + r() * (lx1 - lx0 - 4), y = ly0 + 2 + r() * (ly1 - ly0 - 4); if (frei(x, y, 1.4) && Math.abs(x - mx) > 4 && Math.abs(y - my) > 4) ding('busch', x, y, 2.6, r() * 6.28, { weich: true, r: 0.9 }); }
      W.koffer.push({ x: mx, y: my, art: 'park' });
    } else if (typ === 'platz') {
      const g = haus('haus-cafe', lx0 + 11, ly0 + 11.5, 3); kofferVor(g, 7);
      for (let x = lx0 + 30; x < lx1 - 3; x += 12) for (let y = ly0 + 6; y < ly1 - 3; y += 12) if (frei(x, y, 2)) baum(PALMEN[Math.floor(r() * 3)], x, y, 6.5, r, 0.35);
      ding('haltestelle', mx + 6, by1 - 2, 5.4, 0, { weich: true, r: 1.2, lang: 2 });
      for (const [dx, dy] of [[36, 12], [48, 24], [36, 36], [60, 36]]) if (frei(lx0 + dx, ly0 + dy, 1)) ding('bank', lx0 + dx, ly0 + dy, 2.4, 0, { weich: true, r: 0.8 });
      for (let y = ly0 + 28; y < ly1; y += 3) if (frei(lx0 + 4, y, 0.5)) { kreis(lx0 + 4, y, 0.32); ding('poller', lx0 + 4, y, 0.8, 0, { ebene: 1 }); }
    } else if (typ === 'polizei') {
      const g = haus('haus-polizei', mx, ly0 + tiefe('haus-polizei') / 2 + 1, 0);
      W.wachen.push({ x: mx, y: g.y });
      for (let k = 0; k < 6; k++) { const x = lx0 + 5 + k * 3.4 + (k > 2 ? 44 : 0); if (frei(x, ly1 - 5, 1.5)) W.parker.push({ typ: k % 3 === 1 ? 'polizei-suv' : 'polizei', x, y: ly1 - 5, a: -1.5708 }); }
      for (const dx of [-30, 30]) ding('hecke', mx + dx, ly0 + 3, 7, 0, { weich: true, r: 1.1, lang: 3 });
    } else if (typ === 'tank') {
      const dach = haus('tank-dach', mx, ly0 + 13, 0), shop = haus('tank-shop', mx + 5, ly1 - tiefe('tank-shop') / 2 - 1, 0);
      dach.ueber = true; shop.schild = 'TANK';
      for (const dx of [-8.3, 0, 8.3]) box(mx + dx - 0.7, ly0 + 16.6, mx + dx + 0.7, ly0 + 19.2, false, 'zapf');
      W.koffer.push({ x: mx - 20, y: ly0 + 13, art: 'tank' });
      parke(r, lx0 + 8, ly1 - 6, 0); if (frei(lx1 - 5, ly1 - 5, 2.4)) { box(lx1 - 6.3, ly1 - 5.9, lx1 - 3.7, ly1 - 4.1, false, 'muell'); ding('muellcontainer', lx1 - 5, ly1 - 5, 2.9, 0, { ebene: 1 }); }
    } else if (typ === 'werkstatt') {
      const g = haus('haus-garage', mx, ly0 + tiefe('haus-garage') / 2 + 10, 0); g.schild = 'LACK & FIX';
      W.werkstaetten.push({ x: mx, y: g.y + g.h / 2 + 2.6, bx: 11, by: 2.6, haus: g, raus: 1.5708 });
      for (let k = 0; k < 3; k++) parke(r, lx0 + 6 + k * 5.5, ly1 - 5, 0);
      containerReihe(r, lx1 - 9, ly1 - 6, 2);
      if (!hafen) for (const dx of [-26, 26]) baum('zierbaum', mx + dx, ly0 + 5, 5.5, r);
    } else if (typ === 'versteckStadt') {
      const oben = zeile(r, lx0, lx1, ly0, 'n', STADT);
      void oben;
      const g = haus('haus-werk', lx0 + 13, ly1 - tiefe('haus-werk') / 2, 0);
      W.verstecke.push({ x: g.x, y: by1 - 2, bx: 9, by: 2.2, name: 'Hinterhof-Werkstatt', haus: g, raus: 1.5708 });
      zeile(r, lx0 + 34, lx1, ly1, 's', ['haus-laden', 'haus-cafe', 'haus-apart']);
      parke(r, lx0 + 31, my + 8, 0);
    } else if (typ === 'versteckHafen') {
      const g = haus('haus-halle', lx0 + tiefe('haus-halle') / 2, my, 1);
      W.verstecke.push({ x: bx0 + 2, y: my, bx: 2.2, by: 9, name: 'Halle 7', haus: g, raus: 3.1416 });
      containerReihe(r, mx + 8, ly0 + 6, 5); containerReihe(r, mx + 8, ly1 - 6, 5); containerReihe(r, lx1 - 6, my - 4, 3, true);
    } else if (typ === 'lager') {
      const a = haus('haus-halle', lx0 + 13.5, ly0 + 13.5, 1), b = haus('haus-halle', lx1 - 13.5, ly1 - 13.5, 3);
      kofferVor(a, 7); kofferVor(b, 7);
      containerReihe(r, lx0 + 34, ly0 + 5, 4); containerReihe(r, lx0 + 4, ly1 - 5, 4);
      if (frei(mx, my, 2.4)) { box(mx - 1.3, my - 0.9, mx + 1.3, my + 0.9, false, 'muell'); ding('muellcontainer', mx, my, 2.9, 0, { ebene: 1 }); }
      parke(r, mx + 10, my - 2, 1.5708, 'auto-van');
    } else if (typ === 'container') {
      for (let y = ly0 + 5; y < ly1 - 3; y += 15) for (let x = lx0 + 3; x < lx1 - 12; x += 22) if (r() < 0.82) containerReihe(r, x, y, 3 + Math.floor(r() * 3));
      W.koffer.push({ x: mx + 2, y: ly0 + 12.5, art: 'kiste' }); W.koffer.push({ x: mx - 20, y: ly1 - 12.5, art: 'kiste' });
    }
  }

  // ---------- Kai (Hafenkante) ----------
  { const r = rng(77);
    for (let y = 70; y < 650; y += 26 + Math.floor(r() * 14)) if (!piers.some((p) => Math.abs(p.y - y) < 16)) { if (r() < 0.7) containerReihe(r, 640 + Math.floor(r() * 12), y, 2 + Math.floor(r() * 2)); else if (frei(650, y, 2.6)) parke(r, 650, y, r() * 6.28, 'auto-pickup'); }
    for (let y = 60; y < 668; y += 18) if (frei(LAND.x1 - 1.2, y, 0.6)) { kreis(LAND.x1 - 1.2, y, 0.32); ding('poller', LAND.x1 - 1.2, y, 0.9, 0, { ebene: 1 }); }
    W.koffer.push({ x: 656, y: 300, art: 'kiste' }); W.koffer.push({ x: 656, y: 560, art: 'kiste' });
  }

  // ---------- Strand ----------
  { const r = rng(4242);
    for (let x = 60; x < 618; x += 8 + r() * 5) {
      if (stege.some((s) => Math.abs(s.x - x) < 9)) continue;
      for (let y = 634; y < 664; y += 10 + r() * 3) {
        if (r() < 0.25) continue;
        const sx = x + (r() - 0.5) * 2;
        ding('liege', sx + 2.1, y + 0.5, 2.1, (r() - 0.5) * 0.3, { weich: true, r: 0.8 });
        if (r() < 0.5) ding('liege', sx - 2.1, y + 0.6, 2.1, (r() - 0.5) * 0.3, { weich: true, r: 0.8 });
        ding('schirm', sx, y, 3.3, r() * 6.28, { weich: true, r: 0.7, ebene: 2 });
      }
    }
    for (const x of [112, 312, 520]) { box(x - 1.8, 646, x + 1.8, 649.6, true, 'turm'); ding('rettungsturm', x, 649, 6.6, 0, { ebene: 1 }); W.koffer.push({ x: x + 9, y: 652, art: 'strand' }); }
    // Promenade: Palmen, Bänke
    for (let x = 62; x < 620; x += 11 + r() * 3) {
      if (stege.some((s) => Math.abs(s.x - x) < 7)) continue;
      const t = r();
      if (t < 0.6) baum(PALMEN[Math.floor(r() * 3)], x, 620 + (r() - 0.5), 6.5 + r(), r, 0.35);
      else if (t < 0.8) ding('bank', x, 623, 2.4, 0, { weich: true, r: 0.8 });
      else ding('muelleimer', x, 617, 0.9, 0, { weich: true, r: 0.5 });
    }
  }

  // ---------- Gehwege: Laternen, Palmen, Mülleimer ----------
  { const r = rng(909);
    for (const b of W.bloecke) {
      const stadt = b.typ === 'stadt' || b.typ === 'strand' || b.typ === 'platz' || b.typ === 'versteckStadt';
      const rand = [
        { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y0, nx: 0, ny: -1 }, { x0: b.x0, y0: b.y1, x1: b.x1, y1: b.y1, nx: 0, ny: 1 },
        { x0: b.x0, y0: b.y0, x1: b.x0, y1: b.y1, nx: -1, ny: 0 }, { x0: b.x1, y0: b.y0, x1: b.x1, y1: b.y1, nx: 1, ny: 0 }
      ];
      for (const k of rand) {
        const len = Math.abs(k.x1 - k.x0) + Math.abs(k.y1 - k.y0), tx = (k.x1 - k.x0) / len, ty = (k.y1 - k.y0) / len;
        const rot = k.ny < 0 ? -1.5708 : k.ny > 0 ? 1.5708 : k.nx < 0 ? 3.1416 : 0;   // Arm zeigt zur Straße
        for (const t of k.ny ? [6, len / 2, len - 6] : [len / 2]) {
          const x = k.x0 + tx * t - k.nx * 1.1, y = k.y0 + ty * t - k.ny * 1.1;
          if (W.verstecke.concat(W.werkstaetten).some((v) => Math.abs(v.x - x) < 14 && Math.abs(v.y - y) < 14)) continue;
          ding('laterne', x + k.nx * 1.8, y + k.ny * 1.8, 4.2, rot, { weich: true, r: 0.3, ebene: 2, licht: true, fx: x, fy: y });
        }
        for (let t = 14; t < len - 12; t += 13 + r() * 6) {
          if (Math.abs(t - len / 2) < 4) continue;
          const x = k.x0 + tx * t - k.nx * 1.6, y = k.y0 + ty * t - k.ny * 1.6, w = r();
          if (W.verstecke.concat(W.werkstaetten).some((v) => Math.abs(v.x - x) < 14 && Math.abs(v.y - y) < 12)) continue;
          if (W.koffer.some((q) => Math.abs(q.x - x) < 5 && Math.abs(q.y - y) < 9)) continue;
          if (stadt && w < 0.5) baum(PALMEN[Math.floor(r() * 3)], x, y, 5.6 + r(), r, 0.32);
          else if (!stadt && b.typ !== 'container' && b.typ !== 'lager' && w < 0.35) baum('zierbaum', x, y, 5 + r(), r, 0.35);
          else if (w < 0.72) ding('muelleimer', x, y, 0.9, 0, { weich: true, r: 0.5 });
          else if (w < 0.82 && stadt) ding('bank', x - k.nx * 0.6, y - k.ny * 0.6, 2.4, k.nx ? 1.5708 : 0, { weich: true, r: 0.8 });
        }
      }
    }
  }

  // ---------- Verkehrsnetz (Rechtsverkehr) ----------
  const kn = (i, j) => j * SX.length + i;
  for (let j = 0; j < SY.length; j++) for (let i = 0; i < SX.length; i++) W.knoten.push({ x: SX[i], y: SY[j], i, j, raus: [] });
  const kante = (a, b, breite) => {
    const A = W.knoten[a], B = W.knoten[b], len = Math.abs(B.x - A.x) + Math.abs(B.y - A.y), dx = (B.x - A.x) / len, dy = (B.y - A.y) / len;
    const rA = (dx ? SXB[A.i] : SYB[A.j]) / 2 + 1, rB = (dx ? SXB[B.i] : SYB[B.j]) / 2 + 1;
    const k = { a, b, dx, dy, nx: -dy, ny: dx, x0: A.x + dx * rA, y0: A.y + dy * rA, len: len - rA - rB, breite, spuren: breite > 14 ? [2.6, 7.4] : [3] };
    A.raus.push(W.kanten.length); W.kanten.push(k);
  };
  for (let j = 0; j < SY.length; j++) for (let i = 0; i < SX.length; i++) {
    if (i + 1 < SX.length) { kante(kn(i, j), kn(i + 1, j), SYB[j]); kante(kn(i + 1, j), kn(i, j), SYB[j]); }
    if (j + 1 < SY.length) { kante(kn(i, j), kn(i, j + 1), SXB[i]); kante(kn(i, j + 1), kn(i, j), SXB[i]); }
  }

  // ---------- Raster für Kollision, Sicht und Wege ----------
  // hoch: Zellen, die die Sicht versperren (Gebäude, Container). zu: Zellen, in die kein Auto passt (mit 0,9 m Rand).
  W.hoch = new Uint8Array(NX * NY); W.zu = new Uint8Array(NX * NY);
  for (const b of W.boxen) {
    if (b.hoch) for (let j = Math.max(0, Math.floor((b.y0 + 0.3) / Z)); j < Math.min(NY, Math.ceil((b.y1 - 0.3) / Z)); j++) for (let i = Math.max(0, Math.floor((b.x0 + 0.3) / Z)); i < Math.min(NX, Math.ceil((b.x1 - 0.3) / Z)); i++) {
      const cx = i * Z + 1, cy = j * Z + 1; if (cx > b.x0 && cx < b.x1 && cy > b.y0 && cy < b.y1) W.hoch[j * NX + i] = 1;
    }
    const e = 0.9;
    for (let j = Math.max(0, Math.floor((b.y0 - e) / Z)); j <= Math.min(NY - 1, Math.floor((b.y1 + e) / Z)); j++) for (let i = Math.max(0, Math.floor((b.x0 - e) / Z)); i <= Math.min(NX - 1, Math.floor((b.x1 + e) / Z)); i++) {
      const cx = i * Z + 1, cy = j * Z + 1; if (cx > b.x0 - e && cx < b.x1 + e && cy > b.y0 - e && cy < b.y1 + e) W.zu[j * NX + i] = 1;
    }
  }
  for (let k = 0; k < NX * NY; k++) if (W.boden[k] <= BODEN.FLACH) W.zu[k] = 1;
  // Wegkosten je Zelle: Straße 2, sonst 3, bei Bäumen/Pollern 7; 0 = gesperrt
  W.kosten = new Uint8Array(NX * NY);
  for (let k = 0; k < NX * NY; k++) W.kosten[k] = W.zu[k] ? 0 : W.boden[k] === BODEN.ASPHALT ? 2 : W.boden[k] === BODEN.SAND || W.boden[k] === BODEN.HOLZ ? 4 : 3;
  for (const k of W.kreise) { const i = Math.floor(k.x / Z), j = Math.floor(k.y / Z); if (W.kosten[j * NX + i]) W.kosten[j * NX + i] = 7; }
  // Raster 8 m: welche Boxen, Kreise und weichen Dinge liegen in der Nähe
  const G = 8, gx = Math.ceil(BREITE / G), gy = Math.ceil(HOEHE / G);
  W.gitter = { G, gx, gy, box: Array.from({ length: gx * gy }, () => []), kreis: Array.from({ length: gx * gy }, () => []), weich: Array.from({ length: gx * gy }, () => []) };
  W.boxen.forEach((b, n) => { for (let j = Math.max(0, Math.floor(b.y0 / G)); j <= Math.min(gy - 1, Math.floor(b.y1 / G)); j++) for (let i = Math.max(0, Math.floor(b.x0 / G)); i <= Math.min(gx - 1, Math.floor(b.x1 / G)); i++) W.gitter.box[j * gx + i].push(n); });
  W.kreise.forEach((k, n) => { for (let j = Math.max(0, Math.floor((k.y - k.r) / G)); j <= Math.min(gy - 1, Math.floor((k.y + k.r) / G)); j++) for (let i = Math.max(0, Math.floor((k.x - k.r) / G)); i <= Math.min(gx - 1, Math.floor((k.x + k.r) / G)); i++) W.gitter.kreis[j * gx + i].push(n); });
  W.weich = [];
  W.dinge.forEach((d, n) => {
    if (!d.weich) return;
    const px = d.fx ?? d.x, py = d.fy ?? d.y, rr = d.r + (d.lang || 0);
    d.wi = W.weich.length; W.weich.push(n);
    for (let j = Math.max(0, Math.floor((py - rr) / G)); j <= Math.min(gy - 1, Math.floor((py + rr) / G)); j++) for (let i = Math.max(0, Math.floor((px - rr) / G)); i <= Math.min(gx - 1, Math.floor((px + rr) / G)); i++) W.gitter.weich[j * gx + i].push(n);
  });
  // Koffer-Orte: nur erreichbare (nicht in einer gesperrten Zelle)
  W.koffer = W.koffer.filter((q) => !W.zu[Math.floor(q.y / Z) * NX + Math.floor(q.x / Z)]);
  W.koffer.forEach((q, n) => { q.id = n; q.wert = KOFFER[q.art].wert; });
  const v0 = W.verstecke[0];
  W.start = { x: v0.x - 30, y: SY[1] + 3, a: 0 };
  return W;
}

// Name des Viertels an einer Stelle (für die Einblendung beim Hineinfahren)
export function viertel(x, y) {
  if (x >= 534) return 'Hafen';
  if (y >= 530) return 'Strandmeile';
  return y < 212 ? 'Palmenhügel' : 'Neonstadt';
}
export function bodenBei(W, x, y) {
  if (x < 0 || y < 0 || x >= BREITE || y >= HOEHE) return BODEN.TIEF;
  return W.boden[Math.floor(y / Z) * NX + Math.floor(x / Z)];
}
// Freie Sicht zwischen zwei Punkten? (Gebäude und Container versperren sie)
export function sichtFrei(W, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, d = Math.sqrt(dx * dx + dy * dy), n = Math.max(1, Math.ceil(d / 1.4));
  for (let k = 1; k < n; k++) {
    const x = x0 + dx * k / n, y = y0 + dy * k / n;
    if (x < 0 || y < 0 || x >= BREITE || y >= HOEHE) continue;
    if (W.hoch[Math.floor(y / Z) * NX + Math.floor(x / Z)]) return false;
  }
  return true;
}
