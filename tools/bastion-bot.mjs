// LETZTE BASTION: einfacher Bot für Tests (Balance, Nachspielen für die Rangliste).
import * as L from '../public/spiele/letzte-bastion/logik.js';

// Ziel: nächster Gegner oder Kugel; Winkel darf der Bot normal rechnen (er erzeugt nur Eingaben)
// Menschlicher: reaction = Takte, die ein Gegner in Reichweite sein muss; fehler = ± Grad Zielfehler; r = Zufall für den Fehler
export function bot(f, { traege = 0, reaktion = 0, fehler = 0, r = null } = {}) {
  if (f.phase === 'wahl') return { angriff: -1, wahl: 0 };
  if (f.abklingen > 0) return { angriff: -1, wahl: -1 };
  if (reaktion) { f.__sicht = (f.__sicht || 0) + 1; if (f.__sicht < reaktion) return { angriff: -1, wahl: -1 }; }
  let best = null, bd = 1e9;
  const rw = L.reichweite(f);
  for (const e of f.gegner) { if (e.tot) continue; const d = Math.sqrt(e.x * e.x + e.z * e.z); if (d < rw + 0.1 - traege && d < bd) { bd = d; best = e; } }
  for (const k of f.kugeln) { if (k.weg) continue; const d = Math.sqrt(k.x * k.x + k.z * k.z); if (d < 2.4 && d < bd) { bd = d; best = k; } }
  if (!best) { f.__sicht = 0; return { angriff: -1, wahl: -1 }; }
  f.__sicht = 0;
  const g = Math.round(Math.atan2(best.x, -best.z) * 180 / Math.PI + (fehler && r ? (r() * 2 - 1) * fehler : 0));
  return { angriff: (g + 360) % 360, wahl: -1 };
}
export function code(ein) { return ein.wahl >= 0 ? 400 + ein.wahl : ein.angriff >= 0 ? ein.angriff : -1; }
// Spielt mit festen Takten bis zum Sturz und liefert eine Meldung wie aus dem Browser.
// Ab Welle „bisWelle“ greift der Bot nicht mehr an (damit der Lauf sicher endet).
export function botLauf(seed, bisWelle = 6, opt = {}) {
  const f = L.neuerLauf(seed), ein = [];
  if (opt.fehler && !opt.r) opt = { ...opt, r: L.zufall(seed ^ 77) };
  for (let t = 0; t < L.MAX_TAKTE && !f.tot; t++) {
    let e = bot(f, opt);
    if (f.welle >= bisWelle && f.phase === 'kampf') e = { angriff: -1, wahl: -1 };
    const c = code(e);
    if (c >= 0) ein.push([t, c]);
    L.schritt(f, L.DT, L.eingabe(c));
  }
  return { lauf: { v: L.SIM_VERSION, seed, inputs: L.kodiere(ein), takte: f.takt, punkte: f.punkte, gold: f.gold, kills: f.kills, welle: f.welle }, f };
}
