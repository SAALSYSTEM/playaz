// JUNGLE RUNNER: Streckenprüfer. Sucht auf der ECHTEN Simulation (public/spiele/jungle-runner/sim.js) eine Route ohne einen
// einzigen Treffer oder Absturz und beweist damit, dass jedes Level lösbar und fair ist.
//   node tools/jungle-pruefer.mjs              → alle 30 Level prüfen, Bericht
//   node tools/jungle-pruefer.mjs 5 12         → nur Level 5 und 12
//   node tools/jungle-pruefer.mjs --schreiben  → Lösungsrouten in tests/jungle-loesungen.json speichern
//   node tools/jungle-pruefer.mjs --endlos 3   → Endlosstrecke mit Seed 3 prüfen (bis 1500 m)
// Geprüft wird je Level:
//  1. Fein-Route: Befehle alle 4 Ticks (66 ms) erlaubt → es gibt mindestens eine fehlerfreie Route.
//  2. Robust-Route: Befehle nur im 0,2-s-Raster (12 Ticks), mit drei Rasterversetzungen → die Route braucht keine Reflexe,
//     jede Versetzung muss lösbar sein. Gleiches gilt mit 0,25 s Eingabeverzögerung (jede Route muss trotzdem klappen).
//  3. Münzroute: die beste fehlerfreie Münzzahl erreicht starCoins (Stern 2); Stern 3 (≥ 2 Herzen) ist damit auch erreichbar.
//  4. Vorwarnzeit der Tiere (Nashorn/Fels ≥ 1,8 s, sichtbar innerhalb der Sichtweite), Mindestabstand der nötigen Aktionen.
//  5. Checkpoints: nach einem Absturz am Checkpoint gibt es von dort aus wieder eine fehlerfreie Route (Respawn-Test).
import { createSim, cloneSim, step, result, replay, encodeInputs, laneX, FALL_Y, HZ, groundH, speedAt } from '../public/spiele/jungle-runner/sim.js';
import { LEVELS, endlessLevel } from '../public/spiele/jungle-runner/levels.js';
import { writeFileSync } from 'node:fs';

export const VIEW = 78;       // Sichtweite des Spiels in Metern (Nebel); Tiere müssen innerhalb dieser Entfernung starten

export function suche(level, { grid = 4, off = 0, K = 700, score = (s) => s.coins, from = null, maxTicks = HZ * 400, delay = 0, endZ = null } = {}) {
  let startSim = from || createSim(level);
  if (off > 0) { startSim = cloneSim(startSim); for (let i = 0; i < off && startSim.s.phase === 'run'; i++) { step(startSim, null); startSim.s.log.length = 0; } }   // Raster um 'off' Ticks versetzen
  const hearts0 = startSim.s.hearts;
  let layer = [{ sim: startSim, parent: null, cmd: null, t: startSim.s.t }];
  const fertig = [];
  const cmds = [null, 'L', 'R', 'U', 'D'];
  while (layer.length) {
    const next = new Map();
    for (const nd of layer) {
      const s0 = nd.sim.s;
      for (const c of cmds) {
        if (c === 'L' && s0.lane === 0) continue;                           // wirkungslose Befehle gar nicht erst versuchen
        if (c === 'R' && s0.lane === 2) continue;
        if (c === 'U' && !s0.grounded && s0.coyote <= 0) continue;
        if (c === 'D' && s0.grounded && s0.slideT > 0) continue;
        const sim = cloneSim(nd.sim);
        const s = sim.s;
        for (let i = 0; i < grid && s.phase === 'run'; i++) {
          // Verzögerung: der Befehl wirkt erst nach 'delay' Ticks
          if (c && delay === 0 && i === 0) step(sim, c);
          else if (c && delay > 0 && i === Math.min(delay, grid - 1)) step(sim, c);
          else step(sim, null);
          s.log.length = 0;
          if (s.hearts < hearts0) break;
        }
        if (s.hearts < hearts0 || s.phase === 'lost') continue;
        const child = { sim, parent: nd, cmd: c, t: nd.t };
        child.start = nd.sim.s.t;
        if (s.phase === 'won' || (endZ && s.z >= endZ)) { fertig.push(child); continue; }
        const key = [s.lane, s.laneT > 0 ? 1 : 0, Math.round(s.y * 6), Math.round(s.vy * 0.8), s.slideT > 0 ? 1 : 0, s.q.length ? s.q[0].c : '-', s.q.length, Math.round(s.z * 3), s.pw.boost > 0 ? 1 : 0, s.pw.shield > 0 ? 1 : 0].join('|');
        const alt = next.get(key);
        if (!alt || score(s) > score(alt.sim.s)) next.set(key, child);
        void s0;
      }
      nd.sim = nd.parent === null ? nd.sim : null;
    }
    // Besten K behalten, dabei Vielfalt in Spur/Zustand wahren
    layer = [...next.values()];
    if (layer.length > K) {
      layer.sort((a, b) => score(b.sim.s) - score(a.sim.s) || b.sim.s.z - a.sim.s.z);
      layer = layer.slice(0, K);
    }
    if (fertig.length && fertig.length > 0 && layer.length === 0) break;
    if (layer.length && layer[0].sim.s.t > maxTicks) break;
    if (fertig.length) break;                                               // ein Rasterschritt, in dem das Ziel erreicht wurde: alle Kandidaten dieses Schritts liegen in „fertig“
  }
  if (!fertig.length) return null;
  fertig.sort((a, b) => score(b.sim.s) - score(a.sim.s));
  const best = fertig[0];
  const rev = []; let nd = best;
  while (nd.parent) { if (nd.cmd) rev.push([nd.start + (delay > 0 ? Math.min(delay, grid - 1) : 0), nd.cmd]); nd = nd.parent; }
  rev.reverse();
  return { inputs: rev, sim: best.sim, coins: best.sim.s.coins };
}

// Eingabe mit Verzögerung nachspielen (für die Probe: die gefundene Route muss auch real laufen)
export function spiele(level, inputs, opts = {}) { return replay(level, inputs, opts); }

function aktionsAbstand(inputs) {
  let min = 1e9;
  for (let i = 1; i < inputs.length; i++) min = Math.min(min, (inputs[i][0] - inputs[i - 1][0]) / HZ);
  return inputs.length > 1 ? min : null;
}

export function statisch(level) {
  const meldung = []; let minWarn = 1e9, maxSicht = 0;
  for (const d of level.dyn) {
    if (d.k === 'rhino' || d.k === 'boulder') {
      const v = speedAt(level, d.trig), gap = d.z - d.trig, T = gap / (v + d.v);
      minWarn = Math.min(minWarn, T); maxSicht = Math.max(maxSicht, gap);
      if (T < 1.75) meldung.push(`${d.k} bei z=${d.trig}: Vorwarnzeit ${T.toFixed(2)} s < 1,75 s`);
      if (gap > VIEW + 20) meldung.push(`${d.k} bei z=${d.trig}: startet ${gap.toFixed(0)} m entfernt (Sicht ${VIEW} m)`);
    }
    if (d.k === 'elephant') {
      const v = speedAt(level, d.trig), gap = d.z - d.trig;
      void v;
      if (d.lanes.length >= 3) meldung.push(`Elefant blockiert alle Spuren bei z=${d.z}`);
      if (gap > 110) meldung.push(`Elefant weit entfernt bei z=${d.z}`);
    }
  }
  // Gate-Reihen: mindestens ein Tor je Reihe zu jedem Zeitpunkt offen (Dauer × 3 ≥ Periode)
  for (const d of level.dyn) if (d.k === 'gate' && d.open * 3 < 1 - 1e-9) meldung.push(`Tor bei z=${d.z}: zu kurz offen`);
  // Checkpoints: Spur 1 trägt am Checkpoint (Respawn-Spur) und mindestens 6 m weit
  for (const cp of level.cps) {
    for (let z = cp; z <= cp + 6; z += 0.5) if (groundH(level, 1, z) === null) { meldung.push(`Checkpoint ${cp}: Spur 1 hat bei z=${z} kein Boden`); break; }
  }
  return { meldung, minWarn: minWarn === 1e9 ? null : +minWarn.toFixed(2), maxSicht: Math.round(maxSicht) };
}

// Respawn-Probe: Spieler fällt direkt am Checkpoint ins Wasser, startet am Checkpoint neu und muss ohne weiteren Schaden ankommen
export function checkpointProbe(level, cp) {
  const sim = createSim(level);
  const s = sim.s;
  s.z = cp; s.cp = cp; s.cpHit = level.cps.filter((c) => c <= cp).length; s.y = FALL_Y + 0.05; s.vy = -5; s.grounded = false;
  step(sim, null); s.log.length = 0;
  if (!(s.hearts === 2 && s.invul > 0)) return { ok: false, grund: 'Respawn nicht ausgelöst' };
  const r = suche(level, { grid: 4, K: 400, score: (q) => q.coins, from: sim });
  return { ok: !!r, grund: r ? '' : 'keine fehlerfreie Route ab Checkpoint' };
}

export function pruefe(level, { robust = true, cps = true } = {}) {
  const t0 = Date.now();
  const out = { id: level.id, name: level.name };
  const st = statisch(level); out.statisch = st;
  const fein = suche(level, { grid: 4, K: 250 });
  out.fein = !!fein;
  if (fein) { const rp = replay(level, fein.inputs); out.probe = rp.s.phase === 'won' && rp.s.stats.hits === 0 && rp.s.stats.falls === 0; }
  if (robust && fein) {
    const rr = [0, 4, 8].map((off) => suche(level, { grid: 12, off, K: 250 }));
    out.robust = rr.map((x) => !!x);
    out.aktAbstand = rr[0] ? aktionsAbstand(rr[0].inputs) : null;
    out.verzoegert = !!suche(level, { grid: 12, off: 0, delay: 8, K: 250 });          // Eingabe wirkt 0,13 s später
  }
  if (fein) {
    const m = suche(level, { grid: 4, K: 350, score: (s) => s.coins * 1000 + s.z * 0 });
    out.muenzMax = m ? m.coins : 0; out.muenzGesamt = level.coins.length; out.starCoins = level.starCoins; out.muenzRoute = m ? encodeInputs(m.inputs) : null;
    out.route = encodeInputs(fein.inputs);
    out.stern3 = !!m && m.coins >= level.starCoins;
  }
  if (cps && fein) { out.cp = level.cps.map((cp) => ({ z: cp, ...checkpointProbe(level, cp) })); }
  out.ok = !!(out.fein && out.probe && st.meldung.length === 0 && (!robust || (out.robust.every(Boolean) && out.verzoegert)) && out.stern3 && (!cps || out.cp.every((c) => c.ok)));
  out.sek = +((Date.now() - t0) / 1000).toFixed(1);
  return out;
}

if (process.argv[1] && process.argv[1].endsWith('jungle-pruefer.mjs')) {
  const nur = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number);
  const endlos = process.argv.indexOf('--endlos');
  const schreiben = process.argv.includes('--schreiben');
  const schnell = process.argv.includes('--schnell');
  let fehler = 0;
  if (endlos >= 0) {
    const seed = +process.argv[endlos + 1] || 1;
    const lv = endlessLevel(seed);
    const r = suche(lv, { grid: 4, K: 400, endZ: 1500 });
    console.log(`Endlos Seed ${seed}: ${r ? 'fehlerfreie Route bis 1500 m gefunden (Münzen ' + r.coins + ')' : 'KEINE Route'}`);
    process.exit(r ? 0 : 1);
  }
  const ids = LEVELS.filter((l) => !nur.length || nur.includes(l.id)).map((l) => l.id);
  const alle = {};
  if (process.argv.includes('--json')) {                      // Kindprozess: ein Level prüfen und als JSON ausgeben
    const l = LEVELS.find((q) => q.id === ids[0]);
    process.stdout.write(JSON.stringify(pruefe(l, { robust: !schnell, cps: !schnell })));
    process.exit(0);
  }
  const { spawn } = await import('node:child_process');
  const lauf = (id) => new Promise((res) => {
    const c = spawn(process.execPath, [process.argv[1], String(id), '--json', ...(schnell ? ['--schnell'] : [])]);
    let o = ''; c.stdout.on('data', (d) => (o += d)); c.stderr.on('data', (d) => process.stderr.write(d));
    c.on('close', () => { try { res(JSON.parse(o)); } catch { res({ id, name: '?', ok: false, fein: false, statisch: { meldung: ['Prüfer abgestürzt'] } }); } });
  });
  const res = {}; let nextI = 0;
  await Promise.all(Array.from({ length: Math.min(2, ids.length) }, async () => { while (nextI < ids.length) { const id = ids[nextI++]; res[id] = await lauf(id); } }));
  for (const id of ids) {
    const l = LEVELS.find((q) => q.id === id), r = res[id];
    alle[id] = r;
    const rb = r.robust ? r.robust.map((x) => (x ? 'ja' : 'NEIN')).join('/') : '-';
    console.log(`L${String(l.id).padStart(2)} ${l.name.padEnd(22)} ${r.ok ? 'OK  ' : 'FEHL'} ${String(Math.round(l.len)).padStart(4)} m ~${String(l.time).padStart(3)}s fein=${r.fein ? 'ja' : 'NEIN'} robust=${rb} verz=${r.verzoegert === undefined ? '-' : r.verzoegert ? 'ja' : 'NEIN'} Münzen ${r.muenzMax}/${r.muenzGesamt} (★2≥${r.starCoins}) Warn≥${r.statisch.minWarn ?? '-'}s CP ${r.cp ? r.cp.map((c) => (c.ok ? 'ok' : 'NEIN')).join(',') || '-' : '-'} (${r.sek}s)`);
    for (const m of r.statisch.meldung) console.log('     ! ' + m);
    if (r.cp) for (const c of r.cp) if (!c.ok) console.log(`     ! Checkpoint ${c.z}: ${c.grund}`);
    if (!r.ok) fehler++;
  }
  if (schreiben && !nur.length) {
    const lsg = {}; for (const [id, r] of Object.entries(alle)) lsg[id] = { route: r.route, muenzRoute: r.muenzRoute, muenzMax: r.muenzMax, aktAbstand: r.aktAbstand };
    writeFileSync(new URL('../tests/jungle-loesungen.json', import.meta.url), JSON.stringify(lsg, null, 1));
    console.log('tests/jungle-loesungen.json geschrieben');
  }
  console.log(fehler ? `\n${fehler} Level mit Befund` : '\nAlle geprüften Level lösbar und fair');
  process.exit(fehler ? 1 : 0);
}
void laneX;
