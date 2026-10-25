// BACKGAMMON: Regeln und Computergegner. Keine Abhängigkeiten, läuft im Browser und in Node (Tests).
//
// Punkte 0..23. pt[i] > 0: Steine von Hell, < 0: Steine von Dunkel.
// Hell zieht von 23 nach 0 (Heimfeld 0–5) und trägt unter 0 ab, Dunkel zieht von 0 nach 23 (Heimfeld 18–23).
// bar[p] = Steine auf der Bande, off[p] = abgetragene Steine. Teilzug = { f, t }: f = 24 Bande, t = 25 abtragen.
//
// Regeln: Pasch = viermal ziehen. Es müssen so viele Würfel wie möglich genutzt werden; geht nur einer, dann der höhere.
// Erst wieder einsetzen, wenn Steine auf der Bande stehen. Ein Punkt mit 2+ gegnerischen Steinen ist gesperrt,
// ein einzelner gegnerischer Stein wird geschlagen (auf die Bande). Abtragen erst, wenn alle 15 im Heimfeld sind;
// ein höherer Würfel darf nur abtragen, wenn auf höheren Punkten kein eigener Stein mehr steht. Kein Verdopplungswürfel.

export const VERSION = 1;
export const BANDE = 24, RAUS = 25;
export const STUFEN = {
  gemuetlich: { art: 'einfach', rauschen: 30, fehler: 0.25 },
  geuebt: { art: 'einfach', rauschen: 0, fehler: 0 },
  meister: { art: 'voraus', kandidaten: 10, zeit: 900 }
};

export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------- Stellung ----------
export function neueStellung() {
  const pt = new Int8Array(24);
  pt[23] = 2; pt[12] = 5; pt[7] = 3; pt[5] = 5;
  pt[0] = -2; pt[11] = -5; pt[16] = -3; pt[18] = -5;
  return { pt, bar: [0, 0, 0], off: [0, 0, 0], am: 1 };
}
export const kopie = (s) => ({ pt: Int8Array.from(s.pt), bar: s.bar.slice(), off: s.off.slice(), am: s.am });
export const schluessel = (s) => Array.from(s.pt).join(',') + '|' + s.bar.join(',') + '|' + s.off.join(',') + '|' + s.am;
const eigen = (v, p) => (p === 1 ? v > 0 : v < 0);
const anzahl = (v) => (v < 0 ? -v : v);
const richt = (p) => (p === 1 ? -1 : 1);
export function pips(s, p) {
  let n = s.bar[p] * 25;
  for (let i = 0; i < 24; i++) if (eigen(s.pt[i], p)) n += anzahl(s.pt[i]) * (p === 1 ? i + 1 : 24 - i);
  return n;
}
function alleDaheim(s, p) {
  if (s.bar[p]) return false;
  for (let i = 0; i < 24; i++) if (eigen(s.pt[i], p)) { const k = p === 1 ? i : 23 - i; if (k > 5) return false; }
  return true;
}

// Ein Teilzug mit Würfel w für Seite p: Liste der möglichen { f, t }
export function teilzuege(s, p, w) {
  const out = [], o = 3 - p, d = richt(p);
  const frei = (t) => { const v = s.pt[t]; return !(eigen(v, o) && anzahl(v) >= 2); };
  if (s.bar[p]) {
    const t = p === 1 ? 24 - w : w - 1;
    if (frei(t)) out.push({ f: BANDE, t });
    return out;
  }
  const daheim = alleDaheim(s, p);
  for (let f = 0; f < 24; f++) {
    if (!eigen(s.pt[f], p)) continue;
    const t = f + d * w;
    if (t >= 0 && t < 24) { if (frei(t)) out.push({ f, t }); continue; }
    if (!daheim) continue;
    const k = p === 1 ? f : 23 - f;             // 0 = tiefster Punkt im Heimfeld
    if (k + 1 === w) { out.push({ f, t: RAUS }); continue; }
    // höherer Würfel: nur wenn auf höheren Punkten nichts mehr steht
    let hoeher = false;
    for (let kk = k + 1; kk <= 5; kk++) { const i = p === 1 ? kk : 23 - kk; if (eigen(s.pt[i], p)) { hoeher = true; break; } }
    if (!hoeher) out.push({ f, t: RAUS });
  }
  return out;
}
export function setze(s, m) {   // Teilzug ausführen, gibt geschlagen zurück
  const p = s.am, o = 3 - p, sg = p === 1 ? 1 : -1;
  if (m.f === BANDE) s.bar[p]--; else s.pt[m.f] -= sg;
  if (m.t === RAUS) { s.off[p]++; return false; }
  let schlag = false;
  if (eigen(s.pt[m.t], o)) { s.pt[m.t] = 0; s.bar[o]++; schlag = true; }
  s.pt[m.t] += sg;
  return schlag;
}
export const wuerfelListe = (w) => (w[0] === w[1] ? [w[0], w[0], w[0], w[0]] : [w[0], w[1]]);
export const teilWurf = (m, p) => (m.f === BANDE ? (p === 1 ? 24 - m.t : m.t + 1) : m.t === RAUS ? null : Math.abs(m.t - m.f));

// Alle erlaubten vollständigen Züge zu einem Wurf: [{ z: [Teilzüge], s: Endstellung }], ohne doppelte Endstellungen.
// Leere Liste mit einem Eintrag { z: [] }, wenn kein Teilzug möglich ist.
// alle = true: jede Reihenfolge einzeln (für die Bedienung, damit der Mensch die Teilzüge in beliebiger Reihenfolge ziehen darf).
// Sonst nur ein Weg je Endstellung (reicht für den Computer und spart Rechenzeit).
export function zuege(s, wurf, alle = false) {
  const p = s.am, ergebnis = new Map();
  let best = 0, hoch = 0;
  const reihen = wurf[0] === wurf[1] ? [wuerfelListe(wurf)] : [[wurf[0], wurf[1]], [wurf[1], wurf[0]]];
  function weiter(st, rest, pfad, genutzt) {
    let ging = false;
    if (rest.length) {
      for (const m of teilzuege(st, p, rest[0])) {
        ging = true;
        const n = kopie(st); setze(n, m);
        weiter(n, rest.slice(1), [...pfad, { ...m, w: rest[0] }], [...genutzt, rest[0]]);
      }
    }
    if (!ging) {
      const zahl = pfad.length, max = genutzt.length ? Math.max(...genutzt) : 0;
      if (zahl < best || (zahl === best && zahl === 1 && max < hoch)) return;
      if (zahl > best || (zahl === 1 && max > hoch)) { ergebnis.clear(); best = zahl; hoch = max; }
      const k = alle ? pfad.map((m) => m.f + '>' + m.t).join(' ') : schluessel(st);
      if (!ergebnis.has(k)) ergebnis.set(k, { z: pfad, s: st });
    }
  }
  for (const r of reihen) weiter(kopie(s), r, [], []);
  // Regel „höherer Würfel, wenn nur einer geht“ gilt nur, wenn nicht beide gehen
  const out = [...ergebnis.values()];
  for (const x of out) { x.s.am = 3 - p; }
  return out.length ? out : [{ z: [], s: { ...kopie(s), am: 3 - p } }];
}

// ---------- Partie ----------
// Kodierung: Züge mit '.' getrennt, je Zug zwei Würfelziffern und Teilzüge als Zeichenpaare (von, nach)
const ZEICHEN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
export const kodiere = (wurf, z) => wurf[0] + '' + wurf[1] + z.map((m) => ZEICHEN[m.f] + ZEICHEN[m.t]).join('');
export function neuePartie(beginner = 1) { const s = neueStellung(); s.am = beginner; return { s, zuege: [], beginner }; }
export const gleicheZuege = (a, b) => a.length === b.length && a.every((m, k) => m.f === b[k].f && m.t === b[k].t);
export function spiele(partie, wurf, z) {
  if (status(partie).ende) return false;
  const liste = zuege(partie.s, wurf, true);
  const ziel = liste.find((x) => gleicheZuege(x.z, z));
  if (!ziel) return false;
  partie.s = ziel.s; partie.zuege.push({ w: wurf.slice(), z: ziel.z });
  return true;
}
export const partieText = (partie) => partie.beginner + ':' + partie.zuege.map((x) => kodiere(x.w, x.z)).join('.');
export function partieAus(text) {
  if (typeof text !== 'string' || text.length > 6000) return null;
  const m = /^([12]):(.*)$/.exec(text); if (!m) return null;
  const p = neuePartie(Number(m[1]));
  if (!m[2]) return p;
  for (const teil of m[2].split('.')) {
    if (teil.length < 2 || (teil.length - 2) % 2) return null;
    const wurf = [Number(teil[0]), Number(teil[1])];
    if (!(wurf[0] >= 1 && wurf[0] <= 6 && wurf[1] >= 1 && wurf[1] <= 6)) return null;
    const z = [];
    for (let k = 2; k < teil.length; k += 2) { const f = ZEICHEN.indexOf(teil[k]), t = ZEICHEN.indexOf(teil[k + 1]); if (f < 0 || t < 0) return null; z.push({ f, t }); }
    if (!spiele(p, wurf, z)) return null;
  }
  return p;
}
// Ergebnis: { ende, sieger, art: 1 normal, 2 Gammon (Verlierer hat nichts abgetragen), 3 Backgammon (zusätzlich Stein auf Bande/im Heimfeld des Siegers) }
export function status(partie) {
  const s = partie.s;
  for (const p of [1, 2]) if (s.off[p] === 15) {
    const o = 3 - p; let art = 1;
    if (s.off[o] === 0) {
      art = 2;
      let tief = s.bar[o] > 0;
      for (let i = 0; i < 24; i++) if (eigen(s.pt[i], o)) { const k = p === 1 ? i : 23 - i; if (k <= 5) tief = true; }
      if (tief) art = 3;
    }
    return { ende: true, sieger: p, art };
  }
  return { ende: false, sieger: 0, art: 0 };
}

// ---------- Bewertung (aus Sicht von p) ----------
function kontakt(s) {
  if (s.bar[1] || s.bar[2]) return true;
  let hellMax = -1, dunkelMin = 24;
  for (let i = 0; i < 24; i++) { if (s.pt[i] > 0) hellMax = Math.max(hellMax, i); if (s.pt[i] < 0) dunkelMin = Math.min(dunkelMin, i); }
  return hellMax > dunkelMin;
}
const TREFFER = [0, 11, 12, 14, 15, 15, 17, 6, 6, 5, 3, 2, 3, 0, 0, 1, 1, 0, 1, 0, 1, 0, 0, 0, 1];   // ungefähr: Würfe von 36, die eine Entfernung treffen
function seite(s, p) {
  const o = 3 - p, sg = p === 1 ? 1 : -1;
  const rel = (k) => (p === 1 ? k : 23 - k);   // eigene Sicht: 0 = tiefster Heimpunkt
  let w = 0, prime = 0, laenge = 0;
  for (let k = 0; k < 24; k++) {
    const v = s.pt[rel(k)] * sg;
    if (v >= 2) {
      w += k <= 5 ? (k >= 3 ? 9 : 6) : k === 6 ? 7 : k >= 18 ? 4 : 2;
      laenge++; if (laenge > prime) prime = laenge;
    } else laenge = 0;
  }
  w += prime >= 3 ? prime * prime * 2 : 0;
  // Einzelsteine: Gefahr, geschlagen zu werden
  for (let k = 0; k < 24; k++) {
    const i = rel(k);
    if (s.pt[i] * sg !== 1) continue;
    let schuesse = 0;
    for (let j = 0; j < 24; j++) {
      if (!(s.pt[j] * sg < 0)) continue;
      const dist = p === 1 ? i - j : j - i;      // Gegner zieht in Gegenrichtung auf den Stein zu
      if (dist > 0 && dist < 25) schuesse += TREFFER[dist];
    }
    if (s.bar[o]) { const dist = p === 1 ? i + 1 : 24 - i; if (dist > 0 && dist < 25) schuesse += TREFFER[dist]; }
    const risiko = Math.min(30, schuesse) / 36;
    w -= risiko * (24 - k) * 0.9 + (risiko > 0 ? 2 : 0);
  }
  w -= s.bar[p] * 8;
  return w;
}
export function bewerte(s, p) {
  const o = 3 - p;
  if (s.off[p] === 15) return 10000;
  if (s.off[o] === 15) return -10000;
  const pipVorteil = pips(s, o) - pips(s, p);
  if (!kontakt(s)) return pipVorteil * 2 + (s.off[p] - s.off[o]) * 2;
  return pipVorteil + seite(s, p) - seite(s, o);
}

// ---------- Computer ----------
const ALLE_WUERFE = [];
for (let a = 1; a <= 6; a++) for (let b = a; b <= 6; b++) ALLE_WUERFE.push({ w: [a, b], g: a === b ? 1 : 2 });
export function wuerfeln(zufall = Math.random) { return [1 + Math.floor(zufall() * 6), 1 + Math.floor(zufall() * 6)]; }

// Bester vollständiger Zug (Liste von Teilzügen) für die Seite am Zug
export function kiZug(stellung, wurf, stufe = 'meister', opts = {}) {
  const st = typeof stufe === 'string' ? STUFEN[stufe] : stufe;
  const zufall = opts.zufall || Math.random;
  const p = stellung.am;
  const liste = zuege(stellung, wurf);
  if (liste.length === 1) return liste[0].z;
  if (st.fehler && zufall() < st.fehler) return liste[Math.floor(zufall() * liste.length)].z;
  const bewertet = liste.map((x) => ({ x, w: bewerte(x.s, p) + (st.rauschen ? (zufall() - 0.5) * st.rauschen : 0) }));
  bewertet.sort((a, b) => b.w - a.w);
  if (st.art !== 'voraus') return bewertet[0].x.z;
  // Meister: die besten Kandidaten einen Wurf weiter rechnen (Gegner antwortet mit seinem besten einfachen Zug)
  const ende = Date.now() + (opts.zeit != null ? opts.zeit : st.zeit);
  let bester = bewertet[0], bestWert = -Infinity;
  for (const k of bewertet.slice(0, st.kandidaten)) {
    if (k.x.s.off[p] === 15) return k.x.z;
    let summe = 0;
    for (const { w, g } of ALLE_WUERFE) {
      let antwort = -Infinity;
      for (const y of zuege(k.x.s, w)) { const v = bewerte(y.s, 3 - p); if (v > antwort) antwort = v; }
      summe -= antwort * g;
    }
    const wert = summe / 36;
    if (wert > bestWert) { bestWert = wert; bester = k; }
    if (Date.now() > ende) break;
  }
  return bester.x.z;
}
