// ZAHLENSTURM: Lösungs-Bot. Findet per Strahlsuche (Beam Search) auf der echten Simulation Eingaben,
// die jedes Level lösen: (A) möglichst viele Figuren am Ziel, (B) möglichst viele Münzen.
// Schreibt par.js (Figuren-Par für den 3. Stern) und tests/zahlensturm-loesungen.json.
//   node tools/zahlensturm-bot.mjs            → alle Level lösen, Bericht ausgeben
//   node tools/zahlensturm-bot.mjs --schreiben → zusätzlich par.js und Lösungen speichern
//   node tools/zahlensturm-bot.mjs 7          → nur Level 7
import { createSim, cloneSim, step, result, replay, encodeInputs, decodeInputs, prepare, applyOp } from '../public/spiele/zahlensturm/sim.js';
import { writeFileSync, readFileSync } from 'node:fs';

export const CANDS = [-4.4, -3.6, -2.8, -2, -1.2, -0.4, 0.4, 1.2, 2, 2.8, 3.6, 4.4];
const SLICE = 12;

export function beam(level, score, { K = 36, cands = CANDS, slice = SLICE, maxTicks = 60 * 240 } = {}) {
  let layer = [{ sim: createSim(level), parent: null, tx: 0, t: 0 }];
  const fertig = [];
  while (layer.length) {
    const next = new Map();
    for (const nd of layer) {
      for (const tx of cands) {
        const sim = cloneSim(nd.sim);
        for (let i = 0; i < slice && sim.s.phase !== 'won' && sim.s.phase !== 'lost'; i++) step(sim, tx);
        sim.s.log.length = 0;
        if (sim.s.phase === 'lost') continue;
        const child = { sim, parent: nd, tx, t: nd.t + slice };
        if (sim.s.phase === 'won') { fertig.push(child); continue; }
        const s = sim.s;
        const key = [s.phase, s.ei, s.ri, s.n, Math.round(s.x * 2), s.coins, s.fight ? Math.round(s.fight.hp) : 0].join('|');
        const alt = next.get(key);
        if (!alt || score(s) > score(alt.sim.s)) next.set(key, child);
      }
      nd.sim = null;
    }
    layer = [...next.values()].sort((a, b) => score(b.sim.s) - score(a.sim.s)).slice(0, K);
    if (layer.length && layer[0].t > maxTicks) break;
  }
  if (!fertig.length) return null;
  fertig.sort((a, b) => score(b.sim.s) - score(a.sim.s));
  const best = fertig[0];
  const inputs = []; let nd = best, last = null;
  const rev = [];
  while (nd.parent) { rev.push([nd.parent.t, nd.tx]); nd = nd.parent; }
  rev.reverse();
  for (const [t, x] of rev) if (x !== last) { inputs.push([t, x]); last = x; }
  return { inputs, s: best.sim.s, sim: best.sim };
}

export const scoreN = (s) => s.n * 1000 + s.bonusCoins * 10 + s.coins;
export const scoreCoins = (s) => s.coins * 1e5 + s.n * 100 + s.bonusCoins;

export function loese(level) {
  const a = beam(level, scoreN);
  if (!a) return null;
  const b = beam(level, scoreCoins, { K: 90 }) || a;
  return { a, b };
}

// Seitenverteilung der gewählten Tore (L / M / R) einer Eingabeliste
export function torSeiten(level, inputs) {
  const sim = createSim(level); const out = [];
  let i = 0, tx = 0;
  while (sim.s.phase !== 'won' && sim.s.phase !== 'lost' && sim.s.t < 60 * 300) {
    while (i < inputs.length && inputs[i][0] <= sim.s.t) tx = inputs[i++][1];
    step(sim, tx);
    for (const e of sim.s.log) if (e.e === 'gate') {
      const g = level.gates.find((q) => q.z === e.z);
      if (g.panels.length >= 2) out.push(e.panel === 0 ? 'L' : e.panel === g.panels.length - 1 ? 'R' : 'M');
    }
    sim.s.log.length = 0;
  }
  return out;
}

// Konstante Strategien: immer links, Mitte, rechts
export function konstant(level, tx) {
  const sim = createSim(level);
  while (sim.s.phase !== 'won' && sim.s.phase !== 'lost' && sim.s.t < 60 * 300) { step(sim, tx); sim.s.log.length = 0; }
  return sim;
}

if (process.argv[1] && process.argv[1].endsWith('zahlensturm-bot.mjs')) {
  const { LEVELS } = await import('../public/spiele/zahlensturm/levels.js');
  const nur = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number);
  const schreiben = process.argv.includes('--schreiben');
  const par = {}, lsg = {};
  let fehler = 0;
  for (const l of LEVELS) {
    if (nur.length && !nur.includes(l.id)) continue;
    const t0 = Date.now();
    const r = loese(l);
    if (!r) { console.log(`Level ${l.id} ${l.name}: NICHT GELÖST`); fehler++; continue; }
    const rs = result(r.a.sim), rb = result(r.b.sim);
    if (process.argv.includes('--traj')) {
      const sim = createSim(l); let i = 0, tx = 0; const rows = [];
      while (sim.s.phase !== 'won' && sim.s.phase !== 'lost' && sim.s.t < 60 * 300) {
        while (i < r.a.inputs.length && r.a.inputs[i][0] <= sim.s.t) tx = r.a.inputs[i++][1];
        step(sim, tx);
        for (const e of sim.s.log) {
          if (e.e === 'gate') { const g = l.gates.find((q) => q.z === e.z); rows.push(`z${e.z}: n=${e.vor} [${g.panels.map((q, k) => (k === e.panel ? '*' : '') + q.op + q.v + '→' + applyOp(e.vor, q.op, q.v)).join(' ')}]`); }
          else if (e.e === 'hit') rows.push(`z${e.z}: TREFFER ${e.type} -${e.loss}`);
          else if (e.e === 'fight') rows.push(`z${e.z}: KAMPF ${e.boss ? 'BOSS' : 'Trupp'} hp=${e.hp} n=${e.n}`);
          else if (e.e === 'sieg') rows.push(`z${e.z}: SIEG n=${e.n} (−${e.verlust})`);
        }
        sim.s.log.length = 0;
      }
      console.log('   ' + rows.join('\n   '));
    }
    const seiten = torSeiten(l, r.a.inputs);
    const cnt = { L: 0, M: 0, R: 0 }; for (const x of seiten) cnt[x]++;
    const kon = [-3.3, 0, 3.3].map((x) => { const q = konstant(l, x); return q.s.phase === 'won' ? q.s.n : 'x'; });
    par[l.id] = Math.floor(rs.n * 0.85);
    lsg[l.id] = { a: encodeInputs(r.a.inputs), nA: rs.n, bossN: rs.bossN, b: encodeInputs(r.b.inputs), coinsB: rb.coins, coinsGesamt: rb.coinsGesamt, nB: rb.n, bonusA: rs.bonusCoins };
    console.log(`L${String(l.id).padStart(2)} ${l.name.padEnd(18)} n_Ziel=${String(rs.n).padStart(4)} Boss-Start=${String(rs.bossN).padStart(4)} (Boss braucht ${l.boss.t}) Münzen A ${rs.coins}/${rs.coinsGesamt} B ${rb.coins} unversehrt=${rs.unversehrt ? 'ja' : 'nein'} Tore L/M/R=${cnt.L}/${cnt.M}/${cnt.R} konstant l/m/r=${kon.join('/')} Bonus=${rs.bonusCoins} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }
  if (schreiben && !nur.length) {
    writeFileSync(new URL('../public/spiele/zahlensturm/par.js', import.meta.url), '// Erzeugt von tools/zahlensturm-bot.mjs: 85 % der besten Figurenzahl am Ziel (Bot) = Par für den 3. Stern.\nexport const PAR = ' + JSON.stringify(par) + ';\n');
    writeFileSync(new URL('../tests/zahlensturm-loesungen.json', import.meta.url), JSON.stringify(lsg, null, 1));
    console.log('par.js und tests/zahlensturm-loesungen.json geschrieben');
  }
  process.exit(fehler ? 1 : 0);
}
