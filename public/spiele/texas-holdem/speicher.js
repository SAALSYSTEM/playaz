// Texas Hold'em – wo der Stand lebt. Keine eigene Kasse: dieselben Coins wie Rocket Reels und Roulette.
//  Gast:  derselbe Stand (localStorage "rocketreels-gast.v1"), Poker-Daten unter zustand.poker; vor jeder Aktion frisch gelesen.
//  Konto: Edge Function "rocket-reels" (Aktion 'poker'). Der Server mischt, spielt die Computergegner und schickt nur die
//         Ansicht zurück (ohne Kartenstapel und verdeckte Gegnerkarten).
import * as E from '../rocket-reels/engine.js';
import * as P from './poker.js';
import { GAST_KEY, berlinTag, gastLaden } from '../rocket-reels/speicher.js';

export { GAST_KEY, berlinTag, gastLaden };

export function lokal(testZufall = null) {
  let zustand = gastLaden() || E.neuerZustand();
  const zufall = testZufall || P.kryptoZufall();
  const speichern = () => { try { localStorage.setItem(GAST_KEY, JSON.stringify(zustand)); return true; } catch (e) { return false; } };
  speichern();
  return {
    art: 'gast',
    zustand: () => P.ansicht(zustand),
    async laden() { zustand = gastLaden() || zustand; return P.ansicht(zustand); },
    async ausfuehren(a) {
      zustand = gastLaden() || zustand;
      const r = a.typ === 'poker' ? P.aktion(zustand, a, zufall) : E.aktion(zustand, a, zufall, { tag: berlinTag() });
      if (r.fehler) return { fehler: r.fehler };
      zustand = r.zustand; speichern();
      return { zustand: P.ansicht(zustand), ergebnis: r.ergebnis };
    }
  };
}

export function konto(P0) {
  const C = P0.cfg;
  let zustand = null;
  async function rufe(body) {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const t = setTimeout(() => ctl && ctl.abort(), 15000);
    try {
      const r = await fetch(C.url + '/functions/v1/rocket-reels', {
        method: 'POST', signal: ctl ? ctl.signal : undefined,
        headers: { apikey: C.key, authorization: 'Bearer ' + P0.token(), 'content-type': 'application/json' },
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
      if (a.typ !== 'poker') return rufe({ aktion: a.typ });
      const body = { aktion: 'poker' };
      for (const k of ['p', 'art', 'stufe', 'buyin', 'zug', 'betrag']) if (a[k] !== undefined) body[k] = a[k];
      return rufe(body);
    },
    async gastUebernehmen(gast) { return rufe({ aktion: 'gast', gast }); }
  };
}
