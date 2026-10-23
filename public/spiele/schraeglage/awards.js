// SCHRÄGLAGE: Auszeichnungen. Definitionen und Auswertung sind reine Funktionen (in Node testbar),
// darunter das Zeichnen von Symbolen und der 1080×1080-Teilen-Grafik (nur Browser).

export const RARITY = [
  null,
  { id: 'gewoehnlich', name: 'Gewöhnlich', color: '#aab3c5' },
  { id: 'selten', name: 'Selten', color: '#5cc8e6' },
  { id: 'episch', name: 'Episch', color: '#b58cff' },
  { id: 'legendaer', name: 'Legendär', color: '#FF9200' }
];

// p = Fortschritt (aus dem Speicherstand abgeleitet), r = gerade beendeter Lauf (oder null)
// check() → true, wenn freigeschaltet. prog() → [ist, soll] für die Fortschrittsanzeige.
export const AWARDS = [
  { id: 'bronze', name: 'Bronze', rarity: 1, metal: 'bronze', glyph: '1', desc: 'Das erste Level geschafft.',
    share: 'Ich habe mein erstes Level geschafft!', check: (p) => p.done >= 1, prog: (p) => [p.done, 1] },
  { id: 'silber', name: 'Silber', rarity: 2, metal: 'silber', glyph: '10', desc: '10 Level geschafft.',
    share: 'Ich habe 10 Level geschafft!', check: (p) => p.done >= 10, prog: (p) => [p.done, 10] },
  { id: 'gold', name: 'Gold', rarity: 3, metal: 'gold', glyph: '25', desc: '25 Level geschafft.',
    share: 'Ich habe 25 Level geschafft!', check: (p) => p.done >= 25, prog: (p) => [p.done, 25] },
  { id: 'meister', name: 'Meisterfahrer', rarity: 4, metal: 'gold', glyph: 'krone', desc: '35 Level geschafft.',
    share: 'Ich habe 35 Level geschafft!', check: (p) => p.done >= 35, prog: (p) => [p.done, 35] },
  { id: 'landung', name: 'Perfekte Landung', rarity: 2, glyph: 'landung', desc: 'Ein Level mit Sprung beendet, ohne Überschlag und ohne dass die Karosserie aufsetzt.',
    share: 'Perfekte Landung: ein ganzes Level ohne Kratzer!', check: (p, r) => !!r && r.finished && r.stats.jumps >= 1 && !r.stats.chassisHit && r.stats.maxTilt < 1.75 },
  { id: 'speedrunner', name: 'Speedrunner', rarity: 2, glyph: 'uhr', desc: 'Ein Level schneller als die Goldzeit beendet.',
    share: 'Ich war schneller als die Goldzeit!', check: (p) => p.golds >= 1, prog: (p) => [p.golds, 1] },
  { id: 'unkaputtbar', name: 'Unkaputtbar', rarity: 3, glyph: 'schild', desc: 'Fünfmal in Folge ins Ziel gekommen, ohne einen Unfall dazwischen.',
    share: 'Fünf Level am Stück ohne einen einzigen Unfall!', check: (p) => p.streak >= 5, prog: (p) => [p.streak, 5] },
  { id: 'stunt', name: 'Stunt-König', rarity: 2, glyph: 'sprung', desc: 'Drei saubere Sprünge in einem Level.',
    share: 'Drei saubere Sprünge in einem Level: Stunt-König!', check: (p, r) => !!r && r.finished && r.stats.jumps >= 3 },
  { id: 'comeback', name: 'Comeback', rarity: 3, glyph: 'comeback', desc: 'Ein schweres Level (ab Level 11) nach mindestens zehn Fehlversuchen geschafft.',
    share: 'Zehnmal gescheitert, dann geschafft. Comeback!', check: (p, r) => !!r && r.finished && r.firstWin && r.level >= 11 && r.fails >= 10 },
  { id: 'salto', name: 'Salto', rarity: 3, glyph: 'salto', desc: 'Einen Überschlag in der Luft gedreht und sauber gelandet.',
    share: 'Salto in der Luft und sauber gelandet!', check: (p) => p.flips >= 1, prog: (p) => [p.flips, 1] },
  { id: 'doppelsalto', name: 'Doppelsalto', rarity: 4, glyph: 'salto2', desc: 'Zwei Überschläge in einem Sprung, sauber gelandet.',
    share: 'Doppelsalto! Zwei Überschläge in einem Sprung.', check: (p) => p.flips >= 2, prog: (p) => [p.flips, 2] },
  { id: 'goldrausch', name: 'Goldrausch', rarity: 3, metal: 'gold', glyph: 'medaillen', desc: '10 Goldzeiten geholt.',
    share: 'Zehn Goldzeiten geholt!', check: (p) => p.golds >= 10, prog: (p) => [p.golds, 10] },
  { id: 'allesgold', name: 'Alles Gold', rarity: 4, metal: 'gold', glyph: 'stern', desc: 'In 35 Leveln die Goldzeit geschlagen.',
    share: '35 Goldzeiten. Alles Gold!', check: (p) => p.golds >= 35, prog: (p) => [p.golds, 35] },
  { id: 'weltenbummler', name: 'Weltenbummler', rarity: 4, metal: 'gold', glyph: 'krone', desc: 'Alle 60 Level in allen zwölf Welten geschafft.',
    share: 'Alle 60 Level geschafft. Weltenbummler!', check: (p) => p.done >= 60, prog: (p) => [p.done, 60] },
  { id: 'goldader', name: 'Goldader', rarity: 4, metal: 'gold', glyph: 'stern', desc: 'In allen 60 Leveln die Goldzeit geschlagen.',
    share: 'Alle 60 Goldzeiten. Goldader!', check: (p) => p.golds >= 60, prog: (p) => [p.golds, 60] },
  { id: 'vielflieger', name: 'Vielflieger', rarity: 1, glyph: 'fluegel', desc: 'Insgesamt 60 Sekunden in der Luft.',
    share: 'Schon eine Minute in der Luft verbracht!', check: (p) => p.airS >= 60, prog: (p) => [Math.floor(p.airS), 60] },
  { id: 'wheelie', name: 'Wheelie', rarity: 2, glyph: 'wheelie', desc: 'Drei Sekunden am Stück nur auf den Hinterrädern gefahren.',
    share: 'Drei Sekunden Wheelie!', check: (p, r) => !!r && r.stats.wheelieMax >= 180 },
  { id: 'ohnebremse', name: 'Ohne Bremse', rarity: 2, glyph: 'ohnebremse', desc: 'Ein Level ab Level 6 geschafft, ohne einmal zu bremsen.',
    share: 'Ein ganzes Level ohne Bremse!', check: (p, r) => !!r && r.finished && r.level >= 6 && !r.stats.brake },
  { id: 'fuhrpark', name: 'Fuhrpark', rarity: 2, glyph: 'garage', desc: 'Mit allen fünf Fahrzeugen gefahren.',
    share: 'Alle fünf Fahrzeuge gefahren!', check: (p) => p.vehicles >= 5, prog: (p) => [p.vehicles, 5] },
  { id: 'kilometer', name: 'Kilometerfresser', rarity: 1, glyph: 'strasse', desc: 'Insgesamt 10 Kilometer gefahren.',
    share: 'Schon 10 Kilometer auf dem Tacho!', check: (p) => p.km >= 10, prog: (p) => [Math.floor(p.km * 10) / 10, 10] },
  { id: 'hartnaeckig', name: 'Hartnäckig', rarity: 1, glyph: 'pflaster', desc: '100 Unfälle gebaut und trotzdem weitergefahren.',
    share: '100 Unfälle und kein bisschen müde!', check: (p) => p.crashes >= 100, prog: (p) => [p.crashes, 100] },
  { id: 'herausforderer', name: 'Herausforderer', rarity: 1, glyph: 'teilen', desc: 'Eine Zeit oder einen Award mit Freunden geteilt.',
    share: 'Ich fordere dich heraus!', check: (p) => p.shared >= 1 },
  { id: 'angenommen', name: 'Herausforderung angenommen', rarity: 3, glyph: 'vs', desc: 'Die Zeit aus einer geteilten Herausforderung geschlagen.',
    share: 'Herausforderung angenommen und gewonnen!', check: (p) => p.challengesWon >= 1 }
];
export const AWARD_BY_ID = Object.fromEntries(AWARDS.map((a) => [a.id, a]));

// Fortschrittszahlen aus dem Speicherstand
export function progressOf(save, levelCount) {
  const lv = save.levels || {};
  let done = 0, golds = 0;
  for (let i = 1; i <= levelCount; i++) { const l = lv[i]; if (l && l.done) { done++; if (l.gold) golds++; } }
  const st = save.stats || {};
  return {
    done, golds, streak: st.streak || 0, flips: st.flips || 0, airS: (st.airTicks || 0) / 60, km: (st.dist || 0) / 1000,
    crashes: st.crashes || 0, shared: st.shared || 0, challengesWon: st.challengesWon || 0, vehicles: (st.vehicles || []).length
  };
}

// Neue Auszeichnungen ermitteln und mit Datum eintragen. Gibt die neu freigeschalteten zurück.
export function evaluateAwards(save, levelCount, run, now) {
  save.awards = save.awards || {};
  const p = progressOf(save, levelCount), neu = [];
  for (const a of AWARDS) {
    if (save.awards[a.id]) continue;
    let ok = false;
    try { ok = !!a.check(p, run || null); } catch (e) { ok = false; }
    if (ok) {
      save.awards[a.id] = { at: (now || new Date()).toISOString(), level: run ? run.level : null, ms: run && run.finished ? run.ms : null };
      neu.push(a);
    }
  }
  return neu;
}

// ====================================================================== Zeichnen (Browser)
const METAL = {
  bronze: ['#f2b07a', '#b8692f', '#7a3f17'],
  silber: ['#f4f6fb', '#aeb6c6', '#6c7486'],
  gold: ['#fff1a8', '#f2b81f', '#a86d00']
};

function star(ctx, x, y, r, n = 5, inner = 0.45) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n, rr = i % 2 ? r * inner : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

// Symbole in einem 100×100-Feld, Mittelpunkt (50, 50), Linienfarbe col
function glyph(ctx, g, col) {
  ctx.save();
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const L = (pts) => { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke(); };
  const wheel = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y, r * 0.3, 0, 7); ctx.fill(); };
  switch (g) {
    case 'krone':
      ctx.beginPath(); ctx.moveTo(20, 68); ctx.lineTo(16, 34); ctx.lineTo(34, 48); ctx.lineTo(50, 26); ctx.lineTo(66, 48); ctx.lineTo(84, 34); ctx.lineTo(80, 68); ctx.closePath(); ctx.fill();
      ctx.fillRect(20, 72, 60, 8); break;
    case 'landung':
      L([[18, 70], [82, 70]]); wheel(36, 54, 10); wheel(66, 54, 10);
      ctx.beginPath(); ctx.moveTo(24, 46); ctx.lineTo(28, 34); ctx.lineTo(70, 34); ctx.lineTo(80, 46); ctx.closePath(); ctx.fill();
      L([[50, 10], [50, 22]]); L([[44, 17], [50, 23], [56, 17]]); break;
    case 'uhr':
      ctx.beginPath(); ctx.arc(50, 56, 28, 0, 7); ctx.stroke(); L([[50, 56], [50, 40]]); L([[50, 56], [62, 62]]); L([[44, 18], [56, 18]]); L([[50, 18], [50, 28]]); break;
    case 'schild':
      ctx.beginPath(); ctx.moveTo(50, 14); ctx.lineTo(80, 26); ctx.quadraticCurveTo(80, 70, 50, 86); ctx.quadraticCurveTo(20, 70, 20, 26); ctx.closePath(); ctx.stroke();
      L([[36, 50], [47, 61], [66, 40]]); break;
    case 'sprung':
      ctx.beginPath(); ctx.moveTo(14, 76); ctx.quadraticCurveTo(50, 2, 86, 76); ctx.setLineDash([2, 12]); ctx.stroke(); ctx.setLineDash([]);
      star(ctx, 50, 34, 14); ctx.fill(); L([[10, 80], [30, 80]]); L([[70, 80], [90, 80]]); break;
    case 'comeback':
      L([[16, 30], [36, 66], [56, 50], [82, 18]]); L([[66, 18], [82, 18], [82, 34]]); break;
    case 'salto': case 'salto2':
      ctx.beginPath(); ctx.arc(50, 50, 28, Math.PI * 0.15, Math.PI * 1.85); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(78, 28); ctx.lineTo(84, 48); ctx.lineTo(64, 44); ctx.closePath(); ctx.fill();
      if (g === 'salto2') { ctx.beginPath(); ctx.arc(50, 50, 13, Math.PI * 1.15, Math.PI * 2.85); ctx.stroke(); }
      break;
    case 'medaillen':
      for (const [x, y] of [[36, 56], [64, 46]]) { ctx.beginPath(); ctx.arc(x, y, 18, 0, 7); ctx.stroke(); star(ctx, x, y, 8); ctx.fill(); }
      break;
    case 'stern': star(ctx, 50, 52, 34, 5, 0.48); ctx.fill(); break;
    case 'fluegel':
      ctx.beginPath(); ctx.moveTo(50, 40); ctx.bezierCurveTo(30, 20, 8, 26, 10, 36); ctx.bezierCurveTo(20, 42, 28, 50, 50, 58); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(50, 40); ctx.bezierCurveTo(70, 20, 92, 26, 90, 36); ctx.bezierCurveTo(80, 42, 72, 50, 50, 58); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.arc(50, 52, 8, 0, 7); ctx.fill(); L([[30, 74], [70, 74]]); break;
    case 'wheelie':
      L([[10, 80], [90, 80]]); wheel(36, 64, 14);
      ctx.save(); ctx.translate(36, 64); ctx.rotate(-0.6); ctx.fillRect(-4, -12, 54, 14); ctx.restore(); wheel(70, 30, 10); break;
    case 'ohnebremse':
      ctx.beginPath(); ctx.arc(50, 50, 32, 0, 7); ctx.stroke(); ctx.fillRect(38, 30, 24, 36); L([[28, 72], [72, 28]]); break;
    case 'garage':
      ctx.beginPath(); ctx.moveTo(14, 44); ctx.lineTo(50, 18); ctx.lineTo(86, 44); ctx.stroke();
      L([[22, 44], [22, 82], [78, 82], [78, 44]]); for (let y = 52; y <= 74; y += 11) L([[32, y], [68, y]]); break;
    case 'strasse':
      L([[34, 84], [44, 16]]); L([[66, 84], [56, 16]]); ctx.lineWidth = 5; L([[50, 80], [50, 68]]); L([[50, 56], [50, 46]]); L([[50, 36], [50, 28]]); break;
    case 'pflaster':
      ctx.save(); ctx.translate(50, 50); ctx.rotate(-0.7);
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-36, -13, 72, 26, 12) : ctx.rect(-36, -13, 72, 26); ctx.stroke();
      ctx.beginPath(); ctx.rect(-10, -13, 20, 26); ctx.fill(); ctx.restore(); break;
    case 'teilen':
      for (const [x, y] of [[30, 50], [70, 28], [70, 72]]) { ctx.beginPath(); ctx.arc(x, y, 10, 0, 7); ctx.fill(); }
      L([[30, 50], [70, 28]]); L([[30, 50], [70, 72]]); break;
    case 'vs':
      ctx.font = '900 46px "Dela Gothic One", "Arial Black", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('VS', 50, 54); break;
    default:
      ctx.font = `900 ${g.length > 1 ? 44 : 54}px "Dela Gothic One", "Arial Black", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(g, 50, 55);
  }
  ctx.restore();
}

// Medaille mit Band, Rand nach Metall bzw. Seltenheit, Symbol in der Mitte. (x, y) = Mitte, s = Durchmesser
export function drawAwardIcon(ctx, award, x, y, s, locked) {
  const rar = RARITY[award.rarity];
  const m = award.metal ? METAL[award.metal] : [shade(rar.color, 0.45), rar.color, shade(rar.color, -0.45)];
  ctx.save();
  ctx.translate(x - s / 2, y - s / 2); ctx.scale(s / 100, s / 100);
  if (locked) ctx.globalAlpha = 0.9;
  // Band
  const band = locked ? ['#3a3d4c', '#2b2e3a'] : [shade(rar.color, -0.1), shade(rar.color, -0.4)];
  ctx.fillStyle = band[0];
  ctx.beginPath(); ctx.moveTo(30, 0); ctx.lineTo(46, 0); ctx.lineTo(40, 40); ctx.lineTo(24, 40); ctx.closePath(); ctx.fill();
  ctx.fillStyle = band[1];
  ctx.beginPath(); ctx.moveTo(54, 0); ctx.lineTo(70, 0); ctx.lineTo(76, 40); ctx.lineTo(60, 40); ctx.closePath(); ctx.fill();
  // Scheibe
  const g = ctx.createLinearGradient(20, 22, 80, 98);
  if (locked) { g.addColorStop(0, '#5a5e70'); g.addColorStop(1, '#2a2d39'); }
  else { g.addColorStop(0, m[0]); g.addColorStop(0.55, m[1]); g.addColorStop(1, m[2]); }
  ctx.fillStyle = g;
  ctx.beginPath();
  if (award.rarity >= 3) { // Zackenrand für Episch/Legendär
    for (let i = 0; i < 32; i++) { const a = (i * Math.PI) / 16, r = i % 2 ? 37 : 41; ctx.lineTo(50 + Math.cos(a) * r, 60 + Math.sin(a) * r); }
    ctx.closePath();
  } else ctx.arc(50, 60, 39, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.stroke();
  // Innenfläche
  ctx.beginPath(); ctx.arc(50, 60, 29, 0, Math.PI * 2);
  ctx.fillStyle = locked ? '#20222c' : 'rgba(17,18,26,.82)'; ctx.fill();
  // Glanz
  if (!locked) {
    ctx.beginPath(); ctx.arc(50, 60, 37, Math.PI * 1.1, Math.PI * 1.6); ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.stroke();
  }
  ctx.translate(50 - 25, 60 - 25); ctx.scale(0.5, 0.5);
  glyph(ctx, award.glyph, locked ? '#6d7286' : (award.metal ? m[0] : rar.color));
  ctx.restore();
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const t = f < 0 ? 0 : 255, p = Math.abs(f);
  r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

// Teilen-Grafik 1080×1080. info: { award?, titel, zeile, name, logo (Image), spiel, url, verifiziert, auto (Funktion zum Zeichnen eines Fahrzeugs) }
export function drawShareImage(canvas, info) {
  canvas.width = 1080; canvas.height = 1080;
  const ctx = canvas.getContext('2d');
  const S = 1080;
  const accent = info.award ? RARITY[info.award.rarity].color : '#FF9200';
  // Hintergrund: Anthrazit mit Lichtkegel
  ctx.fillStyle = '#11121A'; ctx.fillRect(0, 0, S, S);
  const rg = ctx.createRadialGradient(S / 2, 430, 40, S / 2, 430, 620);
  rg.addColorStop(0, hexA(accent, 0.55)); rg.addColorStop(0.45, hexA(accent, 0.14)); rg.addColorStop(1, 'rgba(17,18,26,0)');
  ctx.fillStyle = rg; ctx.fillRect(0, 0, S, S);
  // Strahlen
  ctx.save(); ctx.translate(S / 2, 430); ctx.globalAlpha = 0.08; ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 18; i++) { ctx.rotate(Math.PI / 9); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-40, -760); ctx.lineTo(40, -760); ctx.closePath(); ctx.fill(); }
  ctx.restore();
  // schräger Boden-Streifen unten (Spielmotiv)
  ctx.save(); ctx.translate(0, 914); ctx.rotate(-0.05);
  ctx.fillStyle = '#1d2030'; ctx.fillRect(-100, 0, S + 200, 400);
  ctx.fillStyle = '#4fae4a'; ctx.fillRect(-100, -6, S + 200, 22);
  ctx.restore();
  if (info.auto) { ctx.save(); ctx.translate(948, 872); ctx.rotate(-0.05); info.auto(ctx, 40); ctx.restore(); }
  // Spielname oben
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#f6f7f9';
  ctx.font = '400 54px "Dela Gothic One", "Arial Black", sans-serif';
  ctx.save(); ctx.translate(S / 2, 118); ctx.rotate(-0.04); ctx.fillText(info.spiel || 'SCHRÄGLAGE', 0, 0);
  ctx.fillStyle = '#FF9200'; ctx.fillRect(-150, 18, 300, 8); ctx.restore();
  // Symbol
  if (info.award) {
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 16;
    drawAwardIcon(ctx, info.award, S / 2, 400, 360, false); ctx.restore();
  } else if (info.zeitGross) {
    ctx.font = '700 190px "Barlow Condensed", "Arial Narrow", sans-serif'; ctx.fillStyle = '#ffffff';
    ctx.fillText(info.zeitGross, S / 2, 450);
    ctx.font = '600 44px "Barlow", sans-serif'; ctx.fillStyle = '#b6b9c8'; ctx.fillText(info.unterZeit || '', S / 2, 520);
  }
  // Award-Titel und Leistung
  ctx.fillStyle = accent;
  ctx.font = '700 40px "Barlow", "Segoe UI", sans-serif';
  ctx.fillText(info.kicker || '', S / 2, 640);
  ctx.fillStyle = '#ffffff';
  fitText(ctx, info.titel || '', S / 2, 712, 960, 64, '400 {s}px "Dela Gothic One", "Arial Black", sans-serif');
  ctx.fillStyle = '#dfe2ea';
  fitText(ctx, info.zeile || '', S / 2, 778, 940, 42, '600 {s}px "Barlow", "Segoe UI", sans-serif');
  if (info.name) { ctx.fillStyle = '#b6b9c8'; ctx.font = '500 34px "Barlow", sans-serif'; ctx.fillText('– ' + info.name, S / 2, 826); }
  if (info.hinweis) { ctx.fillStyle = '#8d92a6'; ctx.font = '500 26px "Barlow", sans-serif'; ctx.fillText(info.hinweis, S / 2, 862); }
  // Einladung + Logo
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  fitText(ctx, info.einladung || 'Kannst du mich schlagen?', 64, 990, 600, 40, '700 {s}px "Barlow", sans-serif');
  ctx.fillStyle = '#b6b9c8'; ctx.font = '500 30px "Barlow", sans-serif';
  ctx.fillText(info.url || 'playsaal.com/spiele/schraeglage', 64, 1034);
  if (info.logo && info.logo.complete && info.logo.naturalWidth) {
    const h = 64, w = (info.logo.naturalWidth / info.logo.naturalHeight) * h;
    try { ctx.drawImage(info.logo, S - 64 - w, 958, w, h); } catch (e) { /* Logo optional */ }
  } else {
    ctx.textAlign = 'right'; ctx.fillStyle = '#ffffff'; ctx.font = '400 48px "Dela Gothic One", sans-serif'; ctx.fillText('playsaal', S - 64, 1010);
  }
  return canvas;
}
function fitText(ctx, text, x, y, maxW, size, font) {
  let s = size;
  do { ctx.font = font.replace('{s}', s); s -= 2; } while (ctx.measureText(text).width > maxW && s > 18);
  ctx.fillText(text, x, y);
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
