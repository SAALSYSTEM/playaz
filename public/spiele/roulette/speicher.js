// Roulette – wo der Spielstand lebt. Roulette hat KEINE eigene Kasse: Es nutzt die Coins von Rocket Reels.
//  Gast:  derselbe Stand wie Rocket Reels (localStorage "rocketreels-gast.v1"), Roulette-Daten unter zustand.roulette.
//         Vor jeder Aktion wird frisch gelesen, damit ein offener Rocket-Reels-Tab nichts überschreibt.
//  Konto: Edge Function "rocket-reels" (Aktion 'roulette'), derselbe Stand mit derselben Revision → nichts wird doppelt gebucht.
// Nachfüllen und Tagesbonus sind die von Rocket Reels (einmal je Tag für beide Spiele).
import * as E from '../rocket-reels/engine.js';
import * as R from './roulette.js';
import { GAST_KEY, berlinTag, gastLaden } from '../rocket-reels/speicher.js';

export { GAST_KEY, berlinTag, gastLaden };

function rechnen(zustand, a, zufall) {
  if (a.typ === 'roulette') return R.drehen(zustand, a.wetten, zufall);
  return E.aktion(zustand, a, zufall, { tag: berlinTag() });
}

export function lokal(testZufall = null) {
  let zustand = gastLaden() || E.neuerZustand();
  const zufall = testZufall || R.kryptoZufall();
  const speichern = () => { try { localStorage.setItem(GAST_KEY, JSON.stringify(zustand)); return true; } catch (e) { return false; } };
  speichern();
  return {
    art: 'gast',
    zustand: () => zustand,
    async laden() { zustand = gastLaden() || zustand; return zustand; },
    // Ergebnis wird sofort gespeichert – noch vor der Kugel. Neuladen während der Animation zeigt den fertigen Stand.
    async ausfuehren(a) {
      zustand = gastLaden() || zustand;
      const r = rechnen(zustand, a, zufall);
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
      if (a.wetten !== undefined) body.wetten = a.wetten;
      return rufe(body);
    },
    async gastUebernehmen(gast) { return rufe({ aktion: 'gast', gast }); }
  };
}
