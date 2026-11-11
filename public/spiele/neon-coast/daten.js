// Neon Coast – Fluchtwagen: Autos, Aufträge, Ränge und Spielstand (ohne DOM, testbar).
export const STORE = 'neoncoast.v1';

// Fahrzeugmaße in Metern (für alle Autos auf der Straße), masse relativ zum Kleinwagen
export const FAHRZEUG = {
  'auto-flitzer': { l: 4.0, b: 1.8, masse: 1.0 }, 'auto-limo': { l: 4.8, b: 1.9, masse: 1.25 }, 'auto-taxi': { l: 4.7, b: 1.9, masse: 1.2 },
  'auto-muscle': { l: 4.8, b: 2.0, masse: 1.3 }, 'auto-suv': { l: 4.8, b: 2.0, masse: 1.5 }, 'auto-pickup': { l: 5.3, b: 2.0, masse: 1.6 },
  'auto-van': { l: 5.4, b: 2.1, masse: 1.7 }, 'auto-lkw': { l: 7.2, b: 2.4, masse: 3.2 }, 'auto-sport': { l: 4.5, b: 1.95, masse: 1.1 },
  'auto-super': { l: 4.6, b: 2.05, masse: 1.15 }, 'polizei': { l: 4.8, b: 1.95, masse: 1.3 }, 'polizei-suv': { l: 5.0, b: 2.1, masse: 1.75 }
};

// Spielerautos: vmax m/s, acc m/s², grip = Seitenhalt m/s², panzer = Haltbarkeit (1 = 100 Punkte)
export const AUTOS = [
  { id: 'flitzer', name: 'Flitzer', bild: 'auto-flitzer', preis: 0, vmax: 20, acc: 10, grip: 23, panzer: 1.0, text: 'Klein, wendig, unauffällig. Für den Anfang genau richtig.' },
  { id: 'taxi', name: 'Taxi', bild: 'auto-taxi', preis: 1500, vmax: 21.5, acc: 10.5, grip: 23, panzer: 1.25, text: 'Fällt im Verkehr kaum auf und hält etwas mehr aus.' },
  { id: 'limo', name: 'Limousine', bild: 'auto-limo', preis: 4000, vmax: 23, acc: 11.5, grip: 24, panzer: 1.35, text: 'Schneller und stabiler. Solide Wahl.' },
  { id: 'pickup', name: 'Pickup', bild: 'auto-pickup', preis: 8000, vmax: 22, acc: 11, grip: 22, panzer: 2.0, text: 'Der Rammbock: schwer, robust, schiebt Streifenwagen zur Seite.' },
  { id: 'suv', name: 'SUV', bild: 'auto-suv', preis: 14000, vmax: 24, acc: 12, grip: 24, panzer: 1.75, text: 'Schnell und robust zugleich.' },
  { id: 'muscle', name: 'Muscle-Car', bild: 'auto-muscle', preis: 25000, vmax: 27, acc: 15, grip: 22, panzer: 1.35, text: 'Viel Dampf, wenig Halt: die Driftmaschine.' },
  { id: 'sport', name: 'Sportwagen', bild: 'auto-sport', preis: 45000, vmax: 29, acc: 16, grip: 28, panzer: 1.15, text: 'Klebt auf der Straße und hängt die Polizei ab.' },
  { id: 'super', name: 'Supersportwagen', bild: 'auto-super', preis: 90000, vmax: 32, acc: 19, grip: 31, panzer: 1.25, text: 'Das schnellste Auto von Neon Coast.' }
];
export const autoVon = (id) => AUTOS.find((a) => a.id === id) || AUTOS[0];

// Aufträge: immer die ersten drei offenen sind aktiv. k = Zähler aus der Fahrt (stat), art 'nacht' = in einer Fahrt.
export const AUFTRAEGE = [
  { id: 'a1', text: 'Sichere 500 $ im Versteck', k: 'sicher', ziel: 500, lohn: 200 },
  { id: 'a2', text: 'Sammle 3 Koffer in einer Nacht', k: 'koffer', ziel: 3, lohn: 200 },
  { id: 'a3', text: 'Entkomme der Polizei', k: 'entkommen', ziel: 1, lohn: 250 },
  { id: 'a4', text: 'Fahre 10 Dinge um (Mülleimer, Schirme, Laternen)', k: 'dinge', ziel: 10, lohn: 250 },
  { id: 'a5', text: 'Zünde 2 Mal Nitro in einer Nacht', k: 'nitro', ziel: 2, lohn: 300 },
  { id: 'a6', text: 'Sammle 3 Koffer, ohne zwischendurch zu sichern', k: 'serie', ziel: 3, lohn: 400 },
  { id: 'a7', text: 'Lass 2 Streifenwagen verunglücken', k: 'schrott', ziel: 2, lohn: 400 },
  { id: 'a8', text: 'Sichere 2.500 $ in einer Nacht', k: 'sicher', ziel: 2500, lohn: 500 },
  { id: 'a9', text: 'Entkomme mit 3 Sternen', k: 'entkommenSterne', ziel: 3, lohn: 600 },
  { id: 'a10', text: '5 Mal haarscharf am Verkehr vorbei', k: 'haarscharf', ziel: 5, lohn: 500 },
  { id: 'a11', text: 'Lass dich in der Werkstatt umlackieren', k: 'werkstatt', ziel: 1, lohn: 500 },
  { id: 'a12', text: 'Drifte insgesamt 15 Sekunden', k: 'drift', ziel: 15, lohn: 600 },
  { id: 'a13', text: 'Hol einen Koffer vom Pier', k: 'pier', ziel: 1, lohn: 700 },
  { id: 'a14', text: 'Sichere 5.000 $ in einer Nacht', k: 'sicher', ziel: 5000, lohn: 1000 },
  { id: 'a15', text: 'Sammle 5 Koffer, ohne zu sichern', k: 'serie', ziel: 5, lohn: 1000 },
  { id: 'a16', text: 'Lass 5 Streifenwagen verunglücken', k: 'schrott', ziel: 5, lohn: 1000 },
  { id: 'a17', text: 'Erreiche 5 Fahndungssterne', k: 'maxSterne', ziel: 5, lohn: 1200 },
  { id: 'a18', text: 'Fahre 40 Dinge in einer Nacht um', k: 'dinge', ziel: 40, lohn: 1200 },
  { id: 'a19', text: 'Versenke einen Streifenwagen im Wasser', k: 'versenkt', ziel: 1, lohn: 1500 },
  { id: 'a20', text: 'Bleib 4 Minuten auf freiem Fuß', k: 'dauer', ziel: 240, lohn: 1500 },
  { id: 'a21', text: 'Entkomme mit 5 Sternen', k: 'entkommenSterne', ziel: 5, lohn: 2500 },
  { id: 'a22', text: 'Sichere 10.000 $ in einer Nacht', k: 'sicher', ziel: 10000, lohn: 2500 },
  { id: 'a23', text: 'Sammle 8 Koffer, ohne zu sichern', k: 'serie', ziel: 8, lohn: 3000 },
  { id: 'a24', text: 'Lass 10 Streifenwagen verunglücken', k: 'schrott', ziel: 10, lohn: 3000 },
  { id: 'a25', text: '15 Mal haarscharf in einer Nacht', k: 'haarscharf', ziel: 15, lohn: 2500 },
  { id: 'a26', text: 'Sichere 25.000 $ in einer Nacht', k: 'sicher', ziel: 25000, lohn: 6000 },
  { id: 'a27', text: 'Sammle 10 Koffer, ohne zu sichern', k: 'serie', ziel: 10, lohn: 8000 },
  { id: 'a28', text: 'Sichere 50.000 $ in einer Nacht', k: 'sicher', ziel: 50000, lohn: 15000 }
];
export const RAENGE = [
  [0, 'Kleiner Fisch'], [2000, 'Fahrer'], [8000, 'Fluchtprofi'], [25000, 'Nachtschatten'], [60000, 'Asphalt-Phantom'], [150000, 'Legende von Neon Coast']
];
export function rang(save) {
  let n = 0; for (let i = 0; i < RAENGE.length; i++) if (save.stat.sicher >= RAENGE[i][0]) n = i;
  const next = RAENGE[n + 1] || null;
  return { nr: n, name: RAENGE[n][1], ab: RAENGE[n][0], naechster: next ? next[1] : null, bis: next ? next[0] : null };
}

export function frisch() {
  return { v: 1, geld: 0, rekord: 0, autos: ['flitzer'], auto: 'flitzer', erledigt: [], stat: { naechte: 0, sicher: 0, koffer: 0, schrott: 0, entkommen: 0, serie: 0, sterne: 0 }, mute: false, hilfe: 0 };
}
const zahl = (v, max = 1e9) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(max, Math.floor(Number(v)))) : 0);
export function saeubere(o) {
  const s = frisch();
  if (!o || typeof o !== 'object') return s;
  s.geld = zahl(o.geld); s.rekord = zahl(o.rekord);
  const ids = AUTOS.map((a) => a.id);
  if (Array.isArray(o.autos)) for (const id of o.autos) if (ids.includes(id) && !s.autos.includes(id)) s.autos.push(id);
  s.auto = s.autos.includes(o.auto) ? o.auto : 'flitzer';
  const aid = AUFTRAEGE.map((a) => a.id);
  if (Array.isArray(o.erledigt)) for (const id of o.erledigt) if (aid.includes(id) && !s.erledigt.includes(id)) s.erledigt.push(id);
  if (o.stat && typeof o.stat === 'object') for (const k of Object.keys(s.stat)) s.stat[k] = zahl(o.stat[k]);
  s.mute = !!o.mute; s.hilfe = zahl(o.hilfe, 9);
  return s;
}
export const aktiveAuftraege = (save) => AUFTRAEGE.filter((a) => !save.erledigt.includes(a.id)).slice(0, 3);
export function kaufen(save, id) {
  const a = AUTOS.find((x) => x.id === id);
  if (!a || save.autos.includes(id) || save.geld < a.preis) return false;
  save.geld -= a.preis; save.autos.push(id); save.auto = id; return true;
}
// Fahrt abrechnen: gesicherte Beute und Auftragslohn aufs Konto, Rekord, Zähler. Gibt die Abrechnung zurück.
export function abrechnen(save, S) {
  const fertig = AUFTRAEGE.filter((a) => S.erledigt.includes(a.id) && !save.erledigt.includes(a.id));
  const lohn = fertig.reduce((n, a) => n + a.lohn, 0);
  const neuerRekord = S.sicher > save.rekord;
  save.geld += S.sicher + lohn;
  if (neuerRekord) save.rekord = S.sicher;
  for (const a of fertig) save.erledigt.push(a.id);
  const st = save.stat;
  st.naechte++; st.sicher += S.sicher; st.koffer += S.stat.koffer; st.schrott += S.stat.schrott; st.entkommen += S.stat.entkommen;
  st.serie = Math.max(st.serie, S.stat.serie); st.sterne = Math.max(st.sterne, S.stat.maxSterne);
  return { sicher: S.sicher, verloren: S.beute, lohn, fertig, neuerRekord, summe: S.sicher + lohn };
}
// Herausforderung per Link: ?r=Betrag
export function parseEinladung(search) {
  try { const r = Number(new URLSearchParams(search).get('r')); return Number.isFinite(r) && r >= 100 && r <= 5e6 ? { r: Math.floor(r) } : null; } catch { return null; }
}
export const geld = (n) => Math.round(n).toLocaleString('de-DE') + ' $';
