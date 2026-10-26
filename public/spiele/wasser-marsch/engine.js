// Wasser Marsch! – Regeln, Gebäudeaufbau, Trefferflächen und Spielstand (ohne DOM, in Node testbar).
// Grundsatz: kein Scheitern. Wasser unbegrenzt, Feuer verliert nur bei Treffer Stärke, nichts wächst nach.

export const STORE = 'wassermarsch.v1';
export const SAVE_VERSION = 1;
export const MIN_HIT = 46;           // Mindestgröße jeder Trefferfläche in CSS-px (Kinderfinger)

// Rettung: Leiter fährt aus, Katze hüpft in den Korb, Leiter fährt ein, Katze hüpft auf den Gehweg. Summe = 4,5 s.
export const RESCUE = { extend: 1.6, hop: 0.7, retract: 1.6, settle: 0.6 };
export const RESCUE_TOTAL = RESCUE.extend + RESCUE.hop + RESCUE.retract + RESCUE.settle;

// Manuelle Leiter (Level ab MANUAL_FIRST): Kind zieht den Korb zum Katzenfenster, danach läuft alles von selbst.
// Phasen: dock (Korb gleitet ins Fenster) -> hop (Katze steigt ein) -> retract (Rückfahrt zum Wagen) -> settle (Katze springt aufs Pflaster).
export const MANUAL_FIRST = 21;
export const RESCUE_M = { dock: 0.35, hop: 0.7, settle: 0.6 };
export const GRAB_MIN = 56;      // Greifradius um den Korb (CSS-px), großzügig für Kinderfinger
export const SNAP_MIN = 56, SNAP_MAX = 84;   // Einrastradius um die Korbposition am Fenster
export const isManual = (level) => !!level && level.ladder === 'manual';
export const retractTime = (dist) => Math.max(1.2, Math.min(2.4, dist / 300));

// Seitenverhältnisse (Breite/Höhe) der Kernrechtecke aus assets.json
export const ASPECT = {
  small: 1304 / 951, row: 740 / 1341, floor: 620 / 413, ground: 621 / 413,
  roofW: 661 / 620, roof: 661 / 141, window: 438 / 501
};

// Fensterraster je Profil. Mittelpunkte normiert auf das sichtbare Gebäude.
// Gegenüber dem Starter-Profil angepasst, damit Fenster nicht mit Tür/Dachkante überlappen (siehe docs/WASSER_MARSCH.md).
export const PROFILES = {
  small: { kind: 'small', rows: 2, cols: 2, ww: 0.15, cx: [0.28, 0.72], cy: [0.5, 0.75] },
  row: { kind: 'row', rows: 3, cols: 2, ww: 0.2, cx: [0.22, 0.78], cy: [0.2, 0.47, 0.77] },
  tower3: { kind: 'tower', rows: 3, cols: 2, ww: 0.3, cx: [0.28, 0.72] },
  tower4: { kind: 'tower', rows: 4, cols: 2, ww: 0.3, cx: [0.28, 0.72] },
  tower5: { kind: 'tower', rows: 5, cols: 2, ww: 0.3, cx: [0.28, 0.72] }
};

// Gebäudeanordnung je Szene: x-Bereich (Anteil der Spielbreite), Farbvariante und Fensterfarben.
// Fensterfarben: 0 Creme, 2 Koralle, 3 Türkis (1 = offen, nur für Feuer/Katze).
export const SCENE_LAYOUT = {
  1: { boxes: [[0.07, 0.93]], skins: [{ v: '', win: 3 }],
    deco: [{ k: 'deko-busch', x: 0.06, h: 0.07 }, { k: 'deko-laterne', x: 0.97, h: 0.2 }] },
  2: { boxes: [[-0.02, 0.52], [0.48, 1.02]], skins: [{ v: '', win: 3 }, { v: '', win: 2 }],
    deco: [{ k: 'deko-zaun', x: 0.5, h: 0.045 }] },
  3: { boxes: [[0.22, 0.78]], skins: [{ v: '', win: 0 }],
    deco: [{ k: 'deko-baum', x: 0.1, h: 0.2 }, { k: 'deko-baum', x: 0.9, h: 0.17 }, { k: 'deko-laterne', x: 0.8, h: 0.19 }] },
  4: { boxes: [[0.02, 0.49], [0.51, 0.98]], skins: [{ v: '', win: 0 }, { v: 'tuerkis', win: 0 }],
    deco: [{ k: 'deko-laterne', x: 0.5, h: 0.19 }] },
  5: { boxes: [[0.03, 0.48], [0.52, 0.97]], skins: [{ v: 'koralle', win: 0 }, { v: '', win: 0 }],
    deco: [{ k: 'deko-busch', x: 0.5, h: 0.05 }] },
  6: { boxes: [[0.015, 0.325], [0.345, 0.655], [0.675, 0.985]], skins: [{ v: 'gelb', win: 3 }, { v: '', win: 0 }, { v: 'koralle', win: 0 }],
    deco: [] }
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const winId = (b, r, c) => `b${b}-r${r}-c${c}`;
export function parseWin(id) {
  const m = /^b(\d+)-r(\d+)-c(\d+)$/.exec(String(id));
  return m ? { b: +m[1], r: +m[2], c: +m[3] } : null;
}
export const buildingOf = (id) => (parseWin(id) || { b: -1 }).b;

// ---------- Aufbau ----------
// view: { w: Spielbreite, top: oberste nutzbare y-Position (unter dem HUD), ground: Gehweg-Oberkante }
function towerHeightFactor(rows, sq) {
  const roofH = ASPECT.roofW / ASPECT.roof;   // Dachhöhe relativ zur Fassadenbreite
  return roofH * 0.78 + rows / ASPECT.floor * sq + 1 / ASPECT.ground * sq;
}

export function layout(scene, view) {
  const def = SCENE_LAYOUT[scene.id];
  const avail = Math.max(60, view.ground - view.top);
  const profs = scene.profiles.map((p) => PROFILES[p]);
  // gemeinsame Skalierung je Gebäudetyp innerhalb einer Szene
  let bwTower = Infinity, sq = 1, scaleFlat = Infinity;
  profs.forEach((p, i) => {
    const boxW = (def.boxes[i][1] - def.boxes[i][0]) * view.w;
    if (p.kind === 'tower') {
      let s = 1;
      if (avail / towerHeightFactor(p.rows, 1) < boxW) {
        const need = (avail / boxW - towerHeightFactor(p.rows, 0)) / (towerHeightFactor(p.rows, 1) - towerHeightFactor(p.rows, 0));
        s = clamp(need, 0.8, 1);
      }
      sq = Math.min(sq, s);
    }
  });
  profs.forEach((p, i) => {
    const boxW = (def.boxes[i][1] - def.boxes[i][0]) * view.w;
    if (p.kind === 'tower') bwTower = Math.min(bwTower, boxW, avail / towerHeightFactor(p.rows, sq));
    else {
      const asp = p.kind === 'small' ? ASPECT.small : ASPECT.row;
      scaleFlat = Math.min(scaleFlat, boxW, avail * asp);
    }
  });

  const buildings = profs.map((p, b) => {
    const box = def.boxes[b], skin = def.skins[b];
    const cxBox = (box[0] + box[1]) / 2 * view.w;
    const out = { b, profile: scene.profiles[b], kind: p.kind, skin, parts: [], windows: [] };
    let rowsY = [], colsX = [], ww;
    if (p.kind === 'tower') {
      const bw = bwTower, floorH = bw / ASPECT.floor * sq, groundH = bw / ASPECT.ground * sq;
      const roofW = bw * ASPECT.roofW, roofH = roofW / ASPECT.roof;
      const x = cxBox - bw / 2, ov = 2;
      let y = view.ground - groundH;
      out.parts.push({ k: 'hochhaus-eg', x, y, w: bw, h: groundH });
      const floors = [];
      for (let i = 0; i < p.rows; i++) { y = y - floorH + ov; floors.push({ k: 'hochhaus-etage', x, y, w: bw, h: floorH }); }
      out.parts.push(...floors);
      const roofY = y - roofH * 0.78;
      out.parts.push({ k: 'hochhaus-dach', x: cxBox - roofW / 2, y: roofY, w: roofW, h: roofH });
      Object.assign(out, { x, y: roofY, w: bw, h: view.ground - roofY, floorH });
      // Reihe 0 = oberste Etage
      rowsY = floors.slice().reverse().map((f) => f.y + f.h * 0.53);
      colsX = p.cx.map((c) => x + c * bw);
      ww = p.ww * bw;
      out.rowPitch = floorH - ov;
    } else {
      const asp = p.kind === 'small' ? ASPECT.small : ASPECT.row;
      const w = scaleFlat, h = w / asp, x = cxBox - w / 2, y = view.ground - h;
      out.parts.push({ k: p.kind === 'small' ? 'kleines-haus' : 'reihenhaus', x, y, w, h });
      Object.assign(out, { x, y, w, h });
      rowsY = p.cy.map((c) => y + c * h);
      colsX = p.cx.map((c) => x + c * w);
      ww = p.ww * w;
      out.rowPitch = rowsY.length > 1 ? rowsY[1] - rowsY[0] : h * 0.3;
    }
    const wh = ww / ASPECT.window;
    for (let r = 0; r < p.rows; r++) for (let c = 0; c < p.cols; c++) {
      const cx = colsX[c], cy = rowsY[r];
      const hw = Math.max(MIN_HIT, ww * 1.5, (colsX[1] - colsX[0]) * 0.9), hh = Math.max(MIN_HIT, wh * 1.3, out.rowPitch * 0.9);
      out.windows.push({ id: winId(b, r, c), b, r, c, cx, cy, x: cx - ww / 2, y: cy - wh / 2, w: ww, h: wh,
        hit: { x: cx - hw / 2, y: cy - hh / 2, w: hw, h: hh } });
    }
    return out;
  });
  const windows = buildings.flatMap((bd) => bd.windows);
  return { buildings, windows, byId: Object.fromEntries(windows.map((w) => [w.id, w])), sq };
}

// Nächstes Fenster, dessen Trefferfläche den Punkt enthält (optional gefiltert). Eng stehende Fenster: nächster Mittelpunkt gewinnt.
export function pickWindow(windows, px, py, filter = null, grow = 1) {
  let best = null, bd = Infinity;
  for (const w of windows) {
    if (filter && !filter(w)) continue;
    const hw = w.hit.w / 2 * grow, hh = w.hit.h / 2 * grow;
    if (Math.abs(px - w.cx) > hw || Math.abs(py - w.cy) > hh) continue;
    const d = Math.hypot(px - w.cx, py - w.cy);
    if (d < bd) { bd = d; best = w; }
  }
  return best;
}

// ---------- Leveldaten prüfen ----------
export function validateLevels(levels, scenes) {
  const err = [];
  const sceneIds = new Set(scenes.map((s) => s.id));
  const used = new Set();
  levels.forEach((lv, i) => {
    const tag = `Level ${i + 1}`;
    if (lv.id !== i + 1) err.push(`${tag}: id ${lv.id} statt ${i + 1}`);
    if (!sceneIds.has(lv.scene)) { err.push(`${tag}: Szene ${lv.scene} fehlt`); return; }
    used.add(lv.scene);
    const scene = scenes.find((s) => s.id === lv.scene);
    if (!SCENE_LAYOUT[lv.scene] || SCENE_LAYOUT[lv.scene].boxes.length !== scene.profiles.length) err.push(`${tag}: Szenenlayout passt nicht`);
    const seen = new Set();
    const check = (id, what) => {
      const p = parseWin(id);
      if (!p) { err.push(`${tag}: ${what} ${id} ungültig`); return; }
      const prof = PROFILES[scene.profiles[p.b]];
      if (!prof || p.r >= prof.rows || p.c >= prof.cols) err.push(`${tag}: ${what} ${id} existiert nicht`);
      if (seen.has(id)) err.push(`${tag}: ${id} doppelt belegt`);
      seen.add(id);
    };
    if (!Array.isArray(lv.fires) || !lv.fires.length) err.push(`${tag}: keine Feuer`);
    (lv.fires || []).forEach((f) => {
      check(f.window, 'Feuer');
      if (!(Number.isFinite(f.waterSeconds) && f.waterSeconds > 0 && f.waterSeconds < 20)) err.push(`${tag}: Feuerstärke ${f.waterSeconds}`);
    });
    (lv.cats || []).forEach((c) => {
      check(c.window, 'Katze');
      if (c.unlock !== 'buildingFiresCleared') err.push(`${tag}: unbekannte Freigabe ${c.unlock}`);
      if (!(lv.fires || []).some((f) => buildingOf(f.window) === buildingOf(c.window))) err.push(`${tag}: Katze ${c.window} ohne Feuer im Haus`);
    });
    if ((lv.cats || []).length && lv.id < 7) err.push(`${tag}: Katzen erst ab Level 7`);
    if (lv.ladder !== undefined && lv.ladder !== 'manual') err.push(`${tag}: unbekannte Leitersteuerung ${lv.ladder}`);
    if ((lv.ladder === 'manual') !== (lv.id >= MANUAL_FIRST)) err.push(`${tag}: manuelle Leiter nur ab Level ${MANUAL_FIRST}`);
    if (lv.ladder === 'manual' && !(lv.cats || []).length) err.push(`${tag}: manuelles Level ohne Katze`);
  });
  for (const s of scenes) if (!used.has(s.id)) err.push(`Szene ${s.id} unbenutzt`);
  return err;
}

// ---------- Spielzustand ----------
export function newState(level) {
  return {
    level: level.id,
    fires: level.fires.map((f) => ({ win: f.window, b: buildingOf(f.window), total: f.waterSeconds, left: f.waterSeconds })),
    cats: (level.cats || []).map((c) => ({ win: c.window, b: buildingOf(c.window), state: 'wait' })),
    manual: isManual(level),
    rescue: null,   // { cat, t, manual?, retractDur? }
    won: false
  };
}
export const burning = (f) => f.left > 0;
export const firesOut = (st) => st.fires.filter((f) => !burning(f)).length;
export const catsDown = (st) => st.cats.filter((c) => c.state === 'down').length;
export const fireLevel = (f) => clamp(f.left / f.total, 0, 1);
export function catUnlocked(st, i) {
  const cat = st.cats[i];
  return !!cat && !st.fires.some((f) => f.b === cat.b && burning(f));
}

// Wasser auf ein Fenster. Gibt die ID zurück, wenn das Feuer dabei ausgeht.
export function spray(st, win, dt) {
  if (st.rescue || st.won || !win) return null;
  const f = st.fires.find((x) => x.win === win);
  if (!f || !burning(f)) return null;
  f.left = Math.max(0, f.left - clamp(dt, 0, 0.1));
  if (f.left <= 1e-6) { f.left = 0; return win; }
  return null;
}

// Antippen einer Katze: 'start' (Rettung läuft), 'locked' (Feuer im Haus), 'busy' (andere Rettung läuft), 'done' (schon gerettet)
export function tapCat(st, i) {
  const cat = st.cats[i];
  if (!cat || st.won) return 'none';
  if (st.manual) return 'manual';          // in Leitersteuerungs-Leveln startet nur das Greifen des Korbs eine Rettung
  if (cat.state !== 'wait') return 'done';
  if (st.rescue) return 'busy';
  if (!catUnlocked(st, i)) return 'locked';
  cat.state = 'rescue';
  st.rescue = { cat: i, t: 0 };
  return 'start';
}

// Rettung per Korb am Fenster starten (nur manuelle Level). Gleiche Rückgaben wie tapCat.
export function startManualRescue(st, i, retractDur = 1.6) {
  const cat = st.cats[i];
  if (!cat || st.won || !st.manual) return 'none';
  if (cat.state !== 'wait') return 'done';
  if (st.rescue) return 'busy';
  if (!catUnlocked(st, i)) return 'locked';
  cat.state = 'rescue';
  st.rescue = { cat: i, t: 0, manual: true, retractDur: Math.max(1.2, Math.min(2.4, retractDur)) };
  return 'start';
}
export function rescuePhase(t) {
  const a = RESCUE.extend, b = a + RESCUE.hop, c = b + RESCUE.retract;
  if (t < a) return { phase: 'extend', k: t / a };
  if (t < b) return { phase: 'hop', k: (t - a) / RESCUE.hop };
  if (t < c) return { phase: 'retract', k: (t - b) / RESCUE.retract };
  return { phase: 'settle', k: clamp((t - c) / RESCUE.settle, 0, 1) };
}

// Phase einer laufenden Rettung (automatisch: extend/hop/retract/settle, manuell: dock/hop/retract/settle)
export function rescuePhaseOf(r) {
  if (!r.manual) return rescuePhase(r.t);
  const a = RESCUE_M.dock, b = a + RESCUE_M.hop, c = b + r.retractDur;
  if (r.t < a) return { phase: 'dock', k: r.t / a };
  if (r.t < b) return { phase: 'hop', k: (r.t - a) / RESCUE_M.hop };
  if (r.t < c) return { phase: 'retract', k: (r.t - b) / r.retractDur };
  return { phase: 'settle', k: clamp((r.t - c) / RESCUE_M.settle, 0, 1) };
}
const rescueMarks = (r) => {
  if (r.manual) { const a = RESCUE_M.dock, b = a + RESCUE_M.hop, c = b + r.retractDur; return [['hop', a], ['board', b], ['arrive', c], ['done', c + RESCUE_M.settle]]; }
  return [['hop', RESCUE.extend], ['board', RESCUE.extend + RESCUE.hop], ['arrive', RESCUE.extend + RESCUE.hop + RESCUE.retract], ['done', RESCUE_TOTAL]];
};

// Rettung fortschreiben. Ereignisse: 'hop' (Katze springt), 'board' (im Korb), 'arrive' (unten, Zähler +1), 'done'
export function stepRescue(st, dt) {
  const ev = [];
  const r = st.rescue;
  if (!r) return ev;
  const t0 = r.t, t1 = r.t + clamp(dt, 0, 0.1);
  const marks = rescueMarks(r);
  for (const [name, at] of marks) if (t0 < at && t1 >= at) ev.push(name);
  r.t = t1;
  if (ev.includes('arrive')) st.cats[r.cat].state = 'down';
  if (ev.includes('done')) st.rescue = null;
  return ev;
}

export function checkWin(st) {
  if (!st.won && !st.rescue && st.fires.every((f) => !burning(f)) && st.cats.every((c) => c.state === 'down')) st.won = true;
  return st.won;
}

// ---------- Manuelle Leiter: Geometrie, Greifen, Einrasten ----------
// Wagen unten rechts; Leiterbasis auf dem Wagen, Korb ruht auf dem Fahrerhaus.
export function truckGeometry(W, H, ground) {
  const tw = Math.min(W * 0.56, 300), th = tw / (1502 / 806);
  const tBottom = Math.min(H - 6, ground + (H - ground) * 0.93);
  const truck = { x: W - tw - W * 0.012, y: tBottom - th, w: tw, h: th };
  return {
    truck,
    ladderBase: { x: truck.x + 0.83 * tw, y: truck.y + 0.12 * th },
    restTip: { x: truck.x + tw * 0.36, y: truck.y + th * 0.14 }
  };
}
// Korb- und Katzengröße (gemeinsame Skalierung beider Katzenposen)
export function basketGeom(truckW, minWinH, korbAspect, catAspect) {
  const maxBasketH = truckW * 0.27 / korbAspect;      // Korb bleibt klein gegenüber dem Wagen
  const catH = clamp(Math.min(minWinH * 0.92, maxBasketH * 0.72), 22, 56);
  const bh = catH / 0.72;
  return { catH, catW: catH * catAspect, bw: bh * korbAspect, bh };
}
// Leiterspitze (Korb-Unterseite Mitte), wenn der Korb am Fensterbrett sitzt
export function basketTip(w, basket, W) {
  const top = w.y + w.h - basket.bh * 0.3;
  const bx = clamp(w.cx - basket.bw / 2, 2, W - basket.bw - 2);
  return { x: bx + basket.bw * 0.5, y: top + basket.bh * 0.92 };
}
// Erlaubter Bereich für die Leiterspitze: Winkel (von der Wagenbasis nach links aufwärts), Auszuglänge, Bildschirmrand, nicht unter Ruhehöhe.
export function makeReach(geo, view, basket) {
  const { ladderBase: base, restTip: rest } = geo;
  const restL = Math.hypot(rest.x - base.x, rest.y - base.y);
  const minX = basket.bw / 2 + 2, maxX = view.w - basket.bw / 2 - 2;
  const minY = view.top + basket.bh * 0.92 + 4, maxY = rest.y;
  return { base, minL: restL * 0.8, maxL: Math.hypot(base.x - minX, base.y - minY), aMin: -0.04, aMax: 2.6, minX, maxX, minY, maxY };
}
export function clampTip(reach, p) {
  const b = reach.base, dx = b.x - p.x, dy = b.y - p.y;
  const a = clamp(Math.atan2(dy, dx), reach.aMin, reach.aMax), l = clamp(Math.hypot(dx, dy), reach.minL, reach.maxL);
  return { x: clamp(b.x - l * Math.cos(a), reach.minX, reach.maxX), y: clamp(b.y - l * Math.sin(a), reach.minY, reach.maxY) };
}
export const snapRadius = (basket) => clamp(basket.bw * 1.3, SNAP_MIN, SNAP_MAX);
// Katze, deren Fenster der Korb nahe genug ist (nur freigegebene, wartende; bei laufender Rettung keine). targets: Fenster-ID -> Spitzenposition.
export function pickSnap(st, targets, tip, radius) {
  if (!st.manual || st.rescue || st.won) return -1;
  let best = -1, bd = radius;
  st.cats.forEach((c, i) => {
    if (c.state !== 'wait' || !catUnlocked(st, i) || !targets[c.win]) return;
    const d = Math.hypot(tip.x - targets[c.win].x, tip.y - targets[c.win].y);
    if (d <= bd) { bd = d; best = i; }
  });
  return best;
}
// Greifzone um den Korb: 'tight' (auf dem Korb selbst), 'wide' (großzügiger Kreis), sonst null
export function grabZone(tip, basket, p) {
  const cx = tip.x, cy = tip.y - basket.bh * 0.46;
  if (Math.abs(p.x - cx) <= basket.bw / 2 + 10 && Math.abs(p.y - cy) <= basket.bh / 2 + 10) return 'tight';
  return Math.hypot(p.x - cx, p.y - cy) <= Math.max(GRAB_MIN, basket.bw) ? 'wide' : null;
}
// Gibt es eine wartende, freigegebene Katze? (Dann darf der Korb gegriffen werden.)
export const grabbable = (st) => st.manual && !st.rescue && !st.won && st.cats.some((c, i) => c.state === 'wait' && catUnlocked(st, i));

// ---------- Spielstand ----------
export const freshSave = () => ({ v: SAVE_VERSION, unlocked: 1, done: {}, mute: false });
export function sanitizeSave(raw, count) {
  const s = freshSave();
  if (!raw || typeof raw !== 'object' || raw.v !== SAVE_VERSION) return s;
  s.unlocked = clamp(Math.floor(Number(raw.unlocked) || 1), 1, count);
  if (raw.done && typeof raw.done === 'object') {
    for (const k of Object.keys(raw.done)) { const n = Math.floor(Number(k)); if (n >= 1 && n <= count && raw.done[k]) s.done[n] = true; }
  }
  for (const k of Object.keys(s.done)) s.unlocked = Math.max(s.unlocked, Math.min(count, Number(k) + 1));
  s.mute = !!raw.mute;
  return s;
}
export function recordWin(save, id, count) {
  save.done[id] = true;
  save.unlocked = Math.max(save.unlocked, Math.min(count, id + 1));
  return save;
}
