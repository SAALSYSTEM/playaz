// BACKGAMMON: Computergegner im Hintergrund (Web Worker), damit die Seite beim Nachdenken flüssig bleibt.
import { partieAus, kiZug, rng } from './engine.js?v=2';

onmessage = (e) => {
  const { id, z, wurf, stufe, seed } = e.data || {};
  let zug = null;
  try {
    const p = partieAus(z);
    if (p) zug = kiZug(p.s, wurf, stufe, { zufall: rng(seed >>> 0) });
  } catch (err) { zug = null; }
  postMessage({ id, z: zug });
};
