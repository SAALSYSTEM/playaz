// AUSFAHRT FREI: baut die festen Rätsel (30 Level + Tagespool) und prüft sie mit einem vollständigen Löser.
// Vorgehen: zufällige Aufstellung würfeln, ihren ganzen Zustandsraum durchsuchen (Züge sind umkehrbar), von allen gelösten
// Stellungen aus rückwärts die Mindestzugzahl jeder Stellung bestimmen und eine Stellung mit der gewünschten Zugzahl nehmen.
// node tools/ausfahrt-raetsel.mjs           schreibt public/spiele/ausfahrt-frei/raetsel.js
// Export loese(text) wird von den Tests benutzt (Mindestzugzahl per Breitensuche).
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { N, AUSFAHRT_ZEILE, lese, raster, spielraum, geloest } from '../public/spiele/ausfahrt-frei/sim.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const schluessel = (pos) => pos.reduce((a, p) => a * 5 + p, 0);

function nachbarn(teile, pos) {
  const g = raster(teile, pos), out = [];
  for (let k = 0; k < teile.length; k++) {
    const [lo, hi] = spielraum(teile, pos, g, k);
    for (let p = lo; p <= hi; p++) if (p !== pos[k]) { const n = pos.slice(); n[k] = p; out.push(n); }
  }
  return out;
}

// Mindestzahl Züge bis zur Lösung (Breitensuche), -1 wenn unlösbar
export function loese(text) {
  const teile = lese(text); if (!teile) return -1;
  const start = teile.map((t) => t.pos);
  if (geloest(start)) return 0;
  const gesehen = new Set([schluessel(start)]); let ebene = [start], d = 0;
  while (ebene.length) {
    d++; const naechste = [];
    for (const pos of ebene) for (const n of nachbarn(teile, pos)) {
      const s = schluessel(n); if (gesehen.has(s)) continue; gesehen.add(s);
      if (geloest(n)) return d;
      naechste.push(n);
    }
    ebene = naechste;
  }
  return -1;
}

// Ein kürzester Lösungsweg als Liste [Fahrzeug, neue Position] (Breitensuche mit Rückverweisen)
export function loesungsweg(text) {
  const teile = lese(text); if (!teile) return null;
  const start = teile.map((t) => t.pos), vor = new Map([[schluessel(start), null]]);
  let ebene = [start];
  while (ebene.length) {
    const naechste = [];
    for (const pos of ebene) {
      const g = raster(teile, pos);
      for (let k = 0; k < teile.length; k++) {
        const [lo, hi] = spielraum(teile, pos, g, k);
        for (let p = lo; p <= hi; p++) {
          if (p === pos[k]) continue;
          const n = pos.slice(); n[k] = p; const s = schluessel(n); if (vor.has(s)) continue;
          vor.set(s, [schluessel(pos), k, p, pos]);
          if (geloest(n)) { const weg = []; let x = s; while (vor.get(x)) { const [v, kk, pp] = vor.get(x); weg.unshift([kk, pp]); x = v; } return weg; }
          naechste.push(n);
        }
      }
    }
    ebene = naechste;
  }
  return null;
}

function zufall(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Zufällige Aufstellung mit n Fahrzeugen (als Text) oder null
function wuerfle(rnd, n) {
  const g = new Array(N * N).fill('.');
  const setze = (id, waag, len, fest, pos) => {
    const z = []; for (let j = 0; j < len; j++) z.push(waag ? fest * N + pos + j : (pos + j) * N + fest);
    if (z.some((i) => g[i] !== '.')) return false; for (const i of z) g[i] = id; return true;
  };
  setze('A', true, 2, AUSFAHRT_ZEILE, Math.floor(rnd() * 3));
  let id = 1, versuche = 0;
  while (id <= n && versuche++ < 400) {
    const waag = rnd() < 0.5, len = rnd() < 0.3 ? 3 : 2, fest = Math.floor(rnd() * N), pos = Math.floor(rnd() * (N - len + 1));
    if (waag && fest === AUSFAHRT_ZEILE) continue;   // waagerecht in der Ausfahrtzeile würde für immer blockieren
    if (setze(String.fromCharCode(65 + id), waag, len, fest, pos)) id++;
  }
  return id > n ? g.join('') : null;
}

// Ganzen Zustandsraum einer Aufstellung durchsuchen; Abstand jeder Stellung zur nächsten Lösung
function raum(text) {
  const teile = lese(text), start = teile.map((t) => t.pos);
  const alle = new Map([[schluessel(start), start]]), q = [start];
  for (let i = 0; i < q.length; i++) { for (const n of nachbarn(teile, q[i])) { const s = schluessel(n); if (!alle.has(s)) { alle.set(s, n); q.push(n); } } if (alle.size > 400000) return null; }
  const dist = new Map(); let ebene = [];
  for (const [s, p] of alle) if (geloest(p)) { dist.set(s, 0); ebene.push(p); }
  if (!ebene.length) return null;
  for (let d = 1; ebene.length; d++) {
    const naechste = [];
    for (const p of ebene) for (const n of nachbarn(teile, p)) { const s = schluessel(n); if (!dist.has(s)) { dist.set(s, d); naechste.push(n); } }
    ebene = naechste;
  }
  return { teile, alle, dist };
}
function alsText(teile, pos) { const g = raster(teile, pos); return g.map((k) => (k < 0 ? '.' : teile[k].id)).join(''); }

// Stellung mit genau d Mindestzügen (aus einer zufälligen Aufstellung), gefolgt von Prüfung mit dem Löser
function finde(rnd, d, nMin, nMax, gesehen) {
  for (let v = 0; v < 20000; v++) {
    const t = wuerfle(rnd, nMin + Math.floor(rnd() * (nMax - nMin + 1))); if (!t) continue;
    const r = raum(t); if (!r) continue;
    const kandidaten = []; for (const [s, x] of r.dist) if (x === d) kandidaten.push(s);
    if (!kandidaten.length) continue;
    const pos = r.alle.get(kandidaten[Math.floor(rnd() * kandidaten.length)]);
    const text = alsText(r.teile, pos);
    if (gesehen.has(text)) continue;
    gesehen.add(text); return text;
  }
  throw new Error('nichts gefunden für ' + d);
}

// Bergsteigen für schwere Rätsel: Aufstellung leicht verändern (ein Fahrzeug weg, ein neues dazu) und behalten, wenn die
// schwerste Stellung ihres Zustandsraums nicht leichter wird. Nebenbei wird aus jedem Zustandsraum je gesuchter Zugzahl
// eine Stellung eingesammelt.
function veraendere(rnd, text) {
  const g = text.split(''), ids = [...new Set(g.filter((c) => c !== '.' && c !== 'A'))];
  if (ids.length) { const weg = ids[Math.floor(rnd() * ids.length)]; for (let i = 0; i < g.length; i++) if (g[i] === weg) g[i] = '.'; }
  const frei = 'BCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find((c) => !g.includes(c));
  for (let v = 0; v < 60; v++) {
    const waag = rnd() < 0.5, len = rnd() < 0.3 ? 3 : 2, fest = Math.floor(rnd() * N), pos = Math.floor(rnd() * (N - len + 1));
    if (waag && fest === AUSFAHRT_ZEILE) continue;
    const z = []; for (let j = 0; j < len; j++) z.push(waag ? fest * N + pos + j : (pos + j) * N + fest);
    if (z.every((i) => g[i] === '.')) { for (const i of z) g[i] = frei; break; }
  }
  // Buchstaben neu der Reihe nach vergeben (A bleibt A)
  const neu = {}; let n = 1; return g.map((c) => (c === '.' || c === 'A' ? c : (neu[c] = neu[c] || String.fromCharCode(65 + n++)))).join('');
}
function hoechster(dist) { let m = 0; for (const d of dist.values()) if (d > m) m = d; return m; }
function sammle(rnd, r, faecher, gesehen) {
  const je = {}; for (const [s, d] of r.dist) if (faecher[d] && faecher[d].fehlt > 0) (je[d] = je[d] || []).push(s);
  for (const d of Object.keys(je)) {
    const t = alsText(r.teile, r.alle.get(je[d][Math.floor(rnd() * je[d].length)]));
    if (gesehen.has(t)) continue; gesehen.add(t); faecher[d].liste.push(t); faecher[d].fehlt--;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rnd = zufall(20261023), gesehen = new Set();
  const LEVEL_D = Array.from({ length: 30 }, (_, i) => Math.round(2 + i * 28 / 29));   // 2 .. 30 Mindestzüge
  const TAG_D = [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24], TAG_ANZAHL = 366;
  const LEVEL = new Array(30);
  // Leichte Level (bis 12 Züge) direkt aus kleinen Aufstellungen
  for (let i = 0; i < 30; i++) if (LEVEL_D[i] <= 12) { const n = Math.round(4 + i * 9 / 29); const t = finde(rnd, LEVEL_D[i], Math.max(3, n - 1), n + 1, gesehen); LEVEL[i] = [t, loese(t)]; }
  // Schwere Level und Tagespool durch Bergsteigen
  const faecher = {};
  for (const d of TAG_D) faecher[d] = { fehlt: Math.ceil(TAG_ANZAHL / TAG_D.length), liste: [] };
  for (let i = 0; i < 30; i++) if (!LEVEL[i]) (faecher[LEVEL_D[i]] = faecher[LEVEL_D[i]] || { fehlt: 0, liste: [] }).fehlt++;
  const offen = () => Object.values(faecher).some((f) => f.fehlt > 0);
  let runden = 0; const t0 = Date.now();
  while (offen()) {
    let t = null; while (!t) t = wuerfle(rnd, 10 + Math.floor(rnd() * 4));
    let r = raum(t); if (!r) continue;
    let best = hoechster(r.dist), ohne = 0;
    while (ohne < 150 && offen()) {
      const t2 = veraendere(rnd, t), r2 = raum(t2); runden++;
      if (!r2) { ohne++; continue; }
      sammle(rnd, r2, faecher, gesehen);
      const m = hoechster(r2.dist);
      if (m >= best) { if (m > best) ohne = 0; else ohne++; best = m; t = t2; } else ohne++;
    }
    process.stdout.write('[' + Math.round((Date.now() - t0) / 1000) + 's beste ' + best + ', offen ' + Object.entries(faecher).filter(([, f]) => f.fehlt > 0).map(([d, f]) => d + ':' + f.fehlt).join(',') + ']\n');
  }
  for (let i = 0; i < 30; i++) if (!LEVEL[i]) { const t = faecher[LEVEL_D[i]].liste.pop(); LEVEL[i] = [t, loese(t)]; }
  const TAG = [];
  for (let i = 0; TAG.length < TAG_ANZAHL; i++) { const f = faecher[TAG_D[i % TAG_D.length]]; if (f.liste.length) { const t = f.liste.splice(Math.floor(rnd() * f.liste.length), 1)[0]; TAG.push([t, loese(t)]); } }
  // Tagespool mischen, damit die Schwierigkeit von Tag zu Tag wechselt
  for (let i = TAG.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [TAG[i], TAG[j]] = [TAG[j], TAG[i]]; }
  console.log('Level:', LEVEL.map((x) => x[1]).join(' '));
  const zeile = (x) => '  [' + JSON.stringify(x[0]) + ', ' + x[1] + ']';
  writeFileSync(join(ROOT, 'public/spiele/ausfahrt-frei/raetsel.js'),
    '// AUSFAHRT FREI: feste Rätsel. Gebaut und mit dem Löser geprüft von tools/ausfahrt-raetsel.mjs – nicht von Hand ändern.\n' +
    '// Je Eintrag: [Aufstellung (36 Zeichen, Zeile für Zeile), Mindestzahl Züge]. Diese Datei wird auch in die Edge Function kopiert.\n' +
    'export const LEVEL = [\n' + LEVEL.map(zeile).join(',\n') + '\n];\n\n' +
    '// Tagespools je Konfigurationsversion. Das Tagesrätsel ist POOLS[version][seed % Länge].\n' +
    'export const POOLS = {\n  1: [\n' + TAG.map((x) => '  ' + zeile(x)).join(',\n') + '\n  ]\n};\n');
  console.log('fertig nach ' + runden + ' Zustandsräumen');
}
