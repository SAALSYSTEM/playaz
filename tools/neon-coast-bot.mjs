// Neon Coast – Tagesnacht: ein Bot fährt eine ganze Nacht und liefert die Meldung, wie der Browser sie schickt (für Tests).
import { neuerBot, botEingabe } from '../public/spiele/neon-coast/engine.js';
import { tagFahrt, tagSchritt, lauf, TAG } from '../public/spiele/neon-coast/tagesnacht.js';

export function botNacht(seed, gier = 1) {
  const S = tagFahrt(seed), B = neuerBot({ gier }), codes = [];
  for (let n = 0; !S.ende && n < TAG.maxTakte; n++) tagSchritt(S, codes, botEingabe(S, B));
  return { S, codes, lauf: lauf(S, codes) };
}
