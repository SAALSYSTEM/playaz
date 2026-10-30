// Hexis Zaubersuppe – Regeln, Rezept, Sterne und Spielstand (ohne DOM, in Node testbar).
// Grundsatz für Kinder ab 5: kein Verlieren, keine Zeit. Eine falsche Zutat macht nur „Puff!“ und springt zurück ins Regal.

export const STORE = 'zaubersuppe.v1';

// Zutaten: Name (Einzahl/Mehrzahl) und Suppenfarbe
export const ZUTATEN = {
  frosch: { name: 'Frosch', viele: 'Frösche', farbe: '#7ed957' },
  kuerbis: { name: 'Kürbis', viele: 'Kürbisse', farbe: '#ff9a2e' },
  stern: { name: 'Stern', viele: 'Sterne', farbe: '#ffd93b' },
  pilz: { name: 'Fliegenpilz', viele: 'Fliegenpilze', farbe: '#ff5a4f' },
  fledermaus: { name: 'Fledermaus', viele: 'Fledermäuse', farbe: '#8a5cd6' },
  apfel: { name: 'Apfel', viele: 'Äpfel', farbe: '#ff4f6d' },
  bonbon: { name: 'Bonbon', viele: 'Bonbons', farbe: '#c86bff' },
  feder: { name: 'Feder', viele: 'Federn', farbe: '#4fb3ff' },
  mond: { name: 'Mond', viele: 'Monde', farbe: '#fff1a6' },
  beeren: { name: 'Zauberbeeren', viele: 'Zauberbeeren', farbe: '#9b3df0' }
};

// Kasimirs Verwandlungen (Reihenfolge = Zauberbuch)
export const VERWANDLUNGEN = {
  lila: 'Glitzer-Kasimir',
  kuerbis: 'Kürbis-Kasimir',
  hut: 'Hexen-Kasimir',
  fluegel: 'Flatter-Kasimir',
  regenbogen: 'Regenbogen-Kasimir',
  winzig: 'Mini-Kasimir'
};
export const VERWANDLUNG_IDS = Object.keys(VERWANDLUNGEN);

// ---------- Level prüfen ----------
export function checkLevel(lv) {
  const fail = (m) => { throw new Error(`Level ${lv && lv.id}: ${m}`); };
  if (!lv || !lv.rezept || !Array.isArray(lv.regal)) fail('rezept/regal fehlt');
  const rz = Object.entries(lv.rezept);
  if (!rz.length || rz.length > 5) fail('1 bis 5 Zutaten im Rezept');
  for (const [z, n] of rz) {
    if (!ZUTATEN[z]) fail(`unbekannte Zutat ${z}`);
    if (!Number.isInteger(n) || n < 1 || n > 3) fail(`${z}: Anzahl 1 bis 3`);
    if (!lv.regal.includes(z)) fail(`${z} fehlt im Regal`);
  }
  if (lv.regal.length > 10) fail('höchstens 10 Zutaten im Regal');
  if (new Set(lv.regal).size !== lv.regal.length) fail('Zutat doppelt im Regal');
  for (const z of lv.regal) if (!ZUTATEN[z]) fail(`unbekannte Zutat ${z}`);
  if (lv.regal.length <= rz.length) fail('Regal braucht mindestens eine Ablenkung');
  if (!VERWANDLUNGEN[lv.kater]) fail(`unbekannte Verwandlung ${lv.kater}`);
  return true;
}

// ---------- Zustand ----------
export function newState(lv) {
  checkLevel(lv);
  const brauch = { ...lv.rezept }, drin = {};
  for (const z of Object.keys(brauch)) drin[z] = 0;
  return { id: lv.id, brauch, drin, fehler: 0, rein: [], done: false };
}

export const gesamt = (st) => Object.values(st.brauch).reduce((a, b) => a + b, 0);
export const geschafft = (st) => Object.values(st.drin).reduce((a, b) => a + b, 0);
export const fehlt = (st, z) => (st.brauch[z] || 0) - (st.drin[z] || 0);
// Zutaten, die noch gebraucht werden (in Rezept-Reihenfolge)
export const offen = (st) => Object.keys(st.brauch).filter((z) => fehlt(st, z) > 0);

// Zutat in den Kessel: 'gut' (passt), 'fertig' (passt, Rezept vollständig) oder 'puff' (falsch oder schon genug davon)
export function zugeben(st, z) {
  if (st.done) return 'aus';
  if (fehlt(st, z) > 0) {
    st.drin[z]++; st.rein.push(z);
    if (!offen(st).length) { st.done = true; return 'fertig'; }
    return 'gut';
  }
  st.fehler++;
  return 'puff';
}

// Sterne: ohne Puff 3, mit 1–2 Puffs 2, sonst 1 (geschafft ist immer geschafft)
export const sterne = (fehler) => (fehler <= 0 ? 3 : fehler <= 2 ? 2 : 1);

// Suppenfarbe: Mischung der Farben aller Zutaten im Kessel (grau, solange leer)
export function suppenFarbe(st) {
  if (!st.rein.length) return null;
  let r = 0, g = 0, b = 0;
  for (const z of st.rein) {
    const h = ZUTATEN[z].farbe;
    r += parseInt(h.slice(1, 3), 16); g += parseInt(h.slice(3, 5), 16); b += parseInt(h.slice(5, 7), 16);
  }
  const n = st.rein.length, to = (v) => Math.round(v / n).toString(16).padStart(2, '0');
  return '#' + to(r) + to(g) + to(b);
}

// ---------- Spielstand ----------
export const freshSave = () => ({ v: 1, unlocked: 1, best: {}, kater: [], mute: false });

export function sanitizeSave(raw, count) {
  const s = freshSave();
  if (!raw || typeof raw !== 'object') return s;
  if (raw.mute === true) s.mute = true;
  if (raw.best && typeof raw.best === 'object') {
    for (const [k, v] of Object.entries(raw.best)) {
      const n = Number(k), st = Number(v);
      if (Number.isInteger(n) && n >= 1 && n <= count && Number.isInteger(st) && st >= 1 && st <= 3) s.best[n] = st;
    }
  }
  if (Array.isArray(raw.kater)) s.kater = VERWANDLUNG_IDS.filter((k) => raw.kater.includes(k));
  let u = Number(raw.unlocked);
  if (!Number.isInteger(u) || u < 1) u = 1;
  const done = Object.keys(s.best).map(Number);
  if (done.length) u = Math.max(u, Math.max(...done) + 1);
  s.unlocked = Math.min(count, u);
  return s;
}

// Level geschafft: Bestwert, nächstes Level frei, Verwandlung ins Zauberbuch. Liefert { rec, neu }
export function recordWin(save, lv, st, count) {
  const n = lv.id, stars = sterne(st.fehler);
  const rec = !save.best[n] || stars > save.best[n];
  if (rec) save.best[n] = stars;
  if (n <= save.unlocked && n + 1 > save.unlocked) save.unlocked = Math.min(count, n + 1);   // Einladung zu einem gesperrten Level schaltet nichts frei
  const neu = !save.kater.includes(lv.kater);
  if (neu) save.kater = VERWANDLUNG_IDS.filter((k) => k === lv.kater || save.kater.includes(k));
  return { rec, neu, stars };
}

export const totalStars = (save) => Object.values(save.best).reduce((a, b) => a + b, 0);

// Einladung per Link: ?l=Level (schaltet nichts außer der Reihe frei, startet nur dieses Level, wenn es offen ist)
export function parseInvite(search, count) {
  const q = new URLSearchParams(search || ''), l = Number(q.get('l'));
  return Number.isInteger(l) && l >= 1 && l <= count ? { l } : null;
}
