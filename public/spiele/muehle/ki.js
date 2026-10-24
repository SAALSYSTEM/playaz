// MÜHLE: Computergegner im Hintergrund (Web Worker), damit die Seite beim Nachdenken flüssig bleibt.
import { partieAus, kiZug, rng } from './engine.js';

onmessage = (e) => {
  const { id, z, stufe, seed } = e.data || {};
  let m = null;
  try {
    const p = partieAus(z);
    if (p) m = kiZug(p.s, stufe, { zufall: rng(seed >>> 0), gesehen: p.wdh });
  } catch (err) { m = null; }
  postMessage({ id, m });
};
