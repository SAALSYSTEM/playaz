// Rocket Reels – wo der Spielstand lebt.
//  Gast:  Regeln laufen im Browser (engine.js, Zufall aus crypto.getRandomValues), Stand im localStorage dieses Geräts.
//  Konto: Regeln laufen auf dem Server (Edge Function "rocket-reels", gleiche engine.js). Der Browser schickt nur Wünsche
//         ("drehen mit 20", "sichern", "Route links") und bekommt Ergebnis + neuen Stand zurück. Coins lassen sich so nicht
//         durch manipulierte Anfragen verändern.
// Alle Schlüssel beginnen absichtlich mit "rocketreels-" (Bindestrich): Der allgemeine PlaySaal-Sync (Präfix "rocketreels.") nimmt sie nicht mit.
// Gäste-Coins sollen nicht über den frei beschreibbaren Sync ins Konto wandern, dafür gibt es die einmalige, gedeckelte Übernahme.
import * as E from './engine.js';

export const GAST_KEY = 'rocketreels-gast.v1';

export function berlinTag(d = new Date()) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); }
  catch (e) { return d.toISOString().slice(0, 10); }
}

export function gastLaden() {
  let z = null;
  try { z = JSON.parse(localStorage.getItem(GAST_KEY)); } catch (e) {}
  return E.pruefeZustand(z) || null;
}

export function lokal(testZufall = null) {
  let zustand = gastLaden() || E.neuerZustand();
  const zufall = testZufall || E.kryptoZufall();
  const speichern = () => { try { localStorage.setItem(GAST_KEY, JSON.stringify(zustand)); return true; } catch (e) { return false; } };
  speichern();
  return {
    art: 'gast',
    zustand: () => zustand,
    async laden() { return zustand; },
    // Ergebnis wird sofort gespeichert – noch vor jeder Animation. Neuladen mitten in der Animation zeigt den fertigen Stand.
    async ausfuehren(a) {
      const r = E.aktion(zustand, a, zufall, { tag: berlinTag() });
      if (r.fehler) return { fehler: r.fehler };
      zustand = r.zustand; speichern();
      return r;
    }
  };
}

export function konto(P) {
  const C = P.cfg;
  let zustand = null;
  async function rufe(body) {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const t = setTimeout(() => ctl && ctl.abort(), 12000);
    try {
      const r = await fetch(C.url + '/functions/v1/rocket-reels', {
        method: 'POST', signal: ctl ? ctl.signal : undefined,
        headers: { apikey: C.key, authorization: 'Bearer ' + P.token(), 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });
      const d = await r.json().catch(() => null);
      if (!d) return { fehler: r.status === 401 ? 'nicht_angemeldet' : 'netz' };
      if (d.zustand && E.pruefeZustand(d.zustand)) zustand = d.zustand;
      if (!d.ok) return { fehler: d.grund || 'server' };
      return { zustand: d.zustand, ergebnis: d.ergebnis };
    } catch (e) { return { fehler: 'netz' }; } finally { clearTimeout(t); }
  }
  return {
    art: 'konto',
    zustand: () => zustand,
    async laden() { const r = await rufe({ aktion: 'stand' }); return r.fehler ? null : zustand; },
    async ausfuehren(a) {
      const body = { aktion: a.typ };
      if (a.einsatz !== undefined) body.einsatz = a.einsatz;
      if (a.route !== undefined) body.route = a.route;
      return rufe(body);
    },
    async gastUebernehmen(gast) { return rufe({ aktion: 'gast', gast }); }
  };
}
