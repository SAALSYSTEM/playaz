// PUTT-PROFI: Prüf-Bot. Sucht für jede Bahn (normal und gespiegelt) eine Schlagfolge und prüft so,
// dass jede Bahn lösbar ist und das Par erreichbar ist. Schreibt tests/putt-profi-loesungen.json.
//   node tools/putt-profi-bot.mjs            alle Bahnen
//   node tools/putt-profi-bot.mjs 7 12       nur Bahn 8 und 13 (Zählung ab 0), Ergebnis nur anzeigen
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as L from '../public/spiele/putt-profi/logik.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RASTER = 0.05;

// Wegstrecke zum Loch auf einem feinen Raster (Kugel muss frei durchpassen) – Bewertung einer Kugellage
export function potential(b) {
  const nx = Math.round(b.w / RASTER), nz = Math.round(b.h / RASTER);
  const frei = new Uint8Array(nx * nz), dist = new Float64Array(nx * nz).fill(Infinity);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = -0.5 + (i + 0.5) * RASTER, z = -0.5 + (j + 0.5) * RASTER, h = L.boden(b, x, z);
    if (h === h && L.wandAbstand2(b, x, h + L.R, z) > (L.R * 1.05) ** 2) frei[j * nx + i] = 1;
  }
  const start = Math.floor((b.loch.z + 0.5) / RASTER) * nx + Math.floor((b.loch.x + 0.5) / RASTER);
  dist[start] = 0; const offen = [start];
  while (offen.length) {
    let bi = 0; for (let k = 1; k < offen.length; k++) if (dist[offen[k]] < dist[offen[bi]]) bi = k;
    const c = offen.splice(bi, 1)[0], ci = c % nx, cj = (c - ci) / nx;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
      const k = j * nx + i; if (!frei[k]) continue;
      const d = dist[c] + Math.sqrt(di * di + dj * dj) * RASTER;
      if (d < dist[k]) { if (dist[k] === Infinity) offen.push(k); dist[k] = d; }
    }
  }
  return (x, z) => {
    const i = Math.floor((x + 0.5) / RASTER), j = Math.floor((z + 0.5) / RASTER);
    let best = Infinity;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (ii >= 0 && jj >= 0 && ii < nx && jj < nz) best = Math.min(best, dist[jj * nx + ii] + (di || dj ? RASTER : 0)); }
    return best;
  };
}

function kandidaten(b, ball, pot, winkelSchritt = 3, staerken = 24) {
  const out = [];
  const phasen = b.muehlen.length ? [0, 60, 120, 180, 240] : [0];
  for (let a = 0; a < 360; a += winkelSchritt) {
    const dx = Math.round(Math.sin(a * Math.PI / 180) * 10000), dz = Math.round(-Math.cos(a * Math.PI / 180) * 10000);
    for (let k = 1; k <= staerken; k++) {
      const p = Math.round(k * 1000 / staerken);
      for (const ph of phasen) {
        const e = { dx, dz, p, ph }, bb = { ...ball };
        const s = L.schlage(b, bb, e);
        out.push({ e, ball: bb, wert: bb.eingelocht ? -1 : s.ende === 'aus' ? 1e6 : pot(bb.x, bb.z) });
      }
    }
  }
  return out.sort((x, y) => x.wert - y.wert);
}

// Strahlsuche: je Schlag die besten Lagen weiterverfolgen
export function loese(nr, spiegel, { breite = 4, tiefe } = {}) {
  const b = L.baueBahn(nr, spiegel), pot = potential(b);
  tiefe = tiefe ?? b.par + 1;
  let strahl = [{ ball: L.neuerBall(b), wege: [] }];
  for (let t = 0; t < tiefe; t++) {
    const neu = [];
    for (const st of strahl) {
      for (const k of kandidaten(b, st.ball, pot).slice(0, 40)) {
        const w = { ball: k.ball, wege: [...st.wege, k.e], wert: k.wert };
        if (k.ball.eingelocht) return { b, wege: w.wege, schlaege: k.ball.schlaege };
        neu.push(w);
      }
    }
    // verschiedene Lagen behalten (nicht alle an derselben Stelle)
    neu.sort((x, y) => x.wert - y.wert);
    strahl = [];
    for (const w of neu) { if (strahl.length >= breite) break; if (strahl.every((s) => (s.ball.x - w.ball.x) ** 2 + (s.ball.z - w.ball.z) ** 2 > 0.04)) strahl.push(w); }
  }
  return { b, wege: null, schlaege: null };
}

// Wie viele leicht verrutschte Schläge (±1°, ±3 % Stärke) treffen auch? Maß dafür, wie fair der erste Schlag ist.
export function toleranz(b, wege) {
  let ok = 0, n = 0;
  for (const dw of [-1, 0, 1]) for (const dp of [-30, 0, 30]) {
    const ball = L.neuerBall(b);
    wege.forEach((e, i) => {
      if (ball.fertig) return;
      let { dx, dz, p } = e;
      if (i === wege.length - 1) { const w = Math.atan2(dx, -dz) + dw * Math.PI / 180; dx = Math.round(Math.sin(w) * 10000); dz = Math.round(-Math.cos(w) * 10000); p = Math.max(1, Math.min(1000, p + dp)); }
      L.schlage(b, ball, { dx, dz, p, ph: e.ph });
    });
    n++; if (ball.eingelocht) ok++;
  }
  return ok / n;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const nur = process.argv.slice(2).map(Number);
  const liste = nur.length ? nur : L.BAHNEN.map((_, i) => i);
  const erg = {};
  for (const nr of liste) for (const spiegel of [false, true]) {
    const t = Date.now(), r = loese(nr, spiegel);
    const tol = r.wege ? toleranz(r.b, r.wege) : 0;
    console.log(`${String(nr + 1).padStart(2)} ${spiegel ? 'S' : ' '} ${L.BAHNEN[nr].name.padEnd(16)} Par ${L.BAHNEN[nr].par}  Bot ${r.schlaege ?? '–'}  Toleranz letzter Schlag ${(tol * 100).toFixed(0)} %  ${((Date.now() - t) / 1000).toFixed(1)} s`);
    erg[nr + (spiegel ? 's' : '')] = r.wege ? r.wege.map((e) => `${e.dx},${e.dz},${e.p},${e.ph}`).join(';') : null;
  }
  if (!nur.length) { writeFileSync(join(ROOT, 'tests/putt-profi-loesungen.json'), JSON.stringify({ sim: L.SIM_VERSION, loesungen: erg }, null, 1) + '\n'); console.log('geschrieben: tests/putt-profi-loesungen.json'); }
}
