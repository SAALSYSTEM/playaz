// JUNGLE RUNNER: Auszeichnungen. Definitionen und Auswertung sind reine Funktionen (in Node testbar),
// dazu das Zeichnen der Symbole und der 1080×1080-Teilen-Grafik (nur Browser).
export const RARITY = [
  null,
  { id: 'gewoehnlich', name: 'Gewöhnlich', color: '#aab3c5' },
  { id: 'selten', name: 'Selten', color: '#5cc8e6' },
  { id: 'episch', name: 'Episch', color: '#b58cff' },
  { id: 'legendaer', name: 'Legendär', color: '#FF9200' }
];

// p = Fortschritt aus dem Speicherstand, r = gerade beendeter Lauf (oder null), n = Anzahl der Level
// Lauf r: { level, gewonnen, endless, dist, unversehrt, sterne, fails, ersterSieg }
export const AWARDS = [
  { id: 'erster', name: 'Erster Schritt', rarity: 1, metal: 'bronze', glyph: '1', desc: 'Das erste Level geschafft.', share: 'Ich habe mein erstes Dschungel-Level geschafft!', check: (p) => p.done >= 1, prog: (p) => [p.done, 1] },
  { id: 'fuenf', name: 'Fünf Level', rarity: 1, metal: 'bronze', glyph: '5', desc: '5 Level geschafft.', share: 'Ich habe 5 Dschungel-Level geschafft!', check: (p) => p.done >= 5, prog: (p) => [p.done, 5] },
  { id: 'zehn', name: 'Zehn Level', rarity: 2, metal: 'silber', glyph: '10', desc: '10 Level geschafft.', share: 'Ich habe 10 Dschungel-Level geschafft!', check: (p) => p.done >= 10, prog: (p) => [p.done, 10] },
  { id: 'zwanzig', name: 'Zwanzig Level', rarity: 3, metal: 'silber', glyph: '20', desc: '20 Level geschafft.', share: 'Ich habe 20 Dschungel-Level geschafft!', check: (p) => p.done >= 20, prog: (p) => [p.done, 20] },
  { id: 'dreissig', name: 'Dschungelheld', rarity: 4, metal: 'gold', glyph: 'krone', desc: 'Alle 30 Level geschafft.', share: 'Ich habe alle 30 Level von Jungle Runner geschafft!', check: (p, r, n) => p.done >= n, prog: (p, n) => [p.done, n] },
  { id: 'm100', name: 'Hundert Münzen', rarity: 1, glyph: 'muenze', desc: 'Insgesamt 100 Münzen gesammelt.', share: '100 Münzen im Dschungel gesammelt!', check: (p) => p.coinsTotal >= 100, prog: (p) => [Math.min(p.coinsTotal, 100), 100] },
  { id: 'm500', name: 'Münzjäger', rarity: 2, glyph: 'muenze', desc: 'Insgesamt 500 Münzen gesammelt.', share: '500 Münzen im Dschungel gesammelt!', check: (p) => p.coinsTotal >= 500, prog: (p) => [Math.min(p.coinsTotal, 500), 500] },
  { id: 'm1000', name: 'Goldrausch', rarity: 3, metal: 'gold', glyph: 'muenze', desc: 'Insgesamt 1000 Münzen gesammelt.', share: 'Schon 1000 Münzen im Dschungel gesammelt!', check: (p) => p.coinsTotal >= 1000, prog: (p) => [Math.min(p.coinsTotal, 1000), 1000] },
  { id: 'perfekt', name: 'Perfekter Lauf', rarity: 4, metal: 'gold', glyph: 'stern', desc: 'Ein Level ohne Treffer und Absturz mit drei Sternen geschafft.', share: 'Perfekter Lauf: kein Treffer, drei Sterne!', check: (p, r) => !!r && r.gewonnen && !r.endless && r.unversehrt && r.sterne >= 3 },
  { id: 'welt', name: 'Weltmeister', rarity: 3, glyph: 'palme', desc: 'Alle 18 Sterne einer Welt gesammelt.', share: 'Alle Sterne einer Dschungel-Welt geholt!', check: (p) => p.worldStars.some((s) => s >= 18), prog: (p) => [Math.max(...p.worldStars), 18] },
  { id: 'sterne', name: 'Sternesammler', rarity: 3, glyph: 'sterne', desc: '50 Sterne gesammelt.', share: '50 Sterne im Dschungel gesammelt!', check: (p) => p.stars >= 50, prog: (p) => [Math.min(p.stars, 50), 50] },
  { id: 'nashorn', name: 'Nashorn-Tänzer', rarity: 2, glyph: 'nashorn', desc: '10 Nashörnern ausgewichen.', share: 'Ich bin schon 10 Nashörnern ausgewichen!', check: (p) => p.rhino >= 10, prog: (p) => [Math.min(p.rhino, 10), 10] },
  { id: 'staemme', name: 'Stamm-Springer', rarity: 1, glyph: 'stamm', desc: '20 Baumstämme übersprungen.', share: '20 Baumstämme übersprungen!', check: (p) => p.logs >= 20, prog: (p) => [Math.min(p.logs, 20), 20] },
  { id: 'rutscher', name: 'Rutschprofi', rarity: 1, glyph: 'rutsch', desc: '10 Überhänge erfolgreich unterrutscht.', share: '10 Äste unterrutscht!', check: (p) => p.slides >= 10, prog: (p) => [Math.min(p.slides, 10), 10] },
  { id: 'endlos', name: 'Endlos-Läufer', rarity: 3, glyph: 'endlos', desc: '1000 Meter im Endlosmodus gelaufen.', share: '1000 Meter im Endlosmodus geschafft!', check: (p, r) => p.endlessBest >= 1000 || (!!r && r.endless && r.dist >= 1000), prog: (p) => [Math.min(p.endlessBest, 1000), 1000] },
  { id: 'outfit', name: 'Neues Outfit', rarity: 1, glyph: 'farbe', desc: 'Ein neues Outfit gekauft.', share: 'Mein Dschungel-Entdecker hat ein neues Outfit!', check: (p) => p.outfits >= 1 },
  { id: 'teilen', name: 'Herausforderer', rarity: 1, glyph: 'teilen', desc: 'Ein Ergebnis oder einen Award mit Freunden geteilt.', share: 'Ich fordere dich heraus!', check: (p) => p.shared >= 1 },
  { id: 'angenommen', name: 'Herausforderung angenommen', rarity: 3, glyph: 'vs', desc: 'Das Ergebnis aus einer geteilten Herausforderung übertroffen.', share: 'Herausforderung angenommen und gewonnen!', check: (p) => p.challengesWon >= 1 }
];
export const AWARD_BY_ID = Object.fromEntries(AWARDS.map((a) => [a.id, a]));

export function progressOf(save, levelCount) {
  const lv = save.levels || {}, st = save.stats || {};
  let done = 0, stars = 0; const worldStars = [0, 0, 0, 0, 0];
  for (let i = 1; i <= levelCount; i++) { const l = lv[i]; if (l && l.done) { done++; stars += l.stars || 0; worldStars[Math.floor((i - 1) / 6)] += l.stars || 0; } }
  return { done, stars, worldStars, coinsTotal: st.coinsTotal || 0, rhino: st.rhino || 0, logs: st.logs || 0, slides: st.slides || 0, endlessBest: (save.endless && save.endless.best) || 0,
    shared: st.shared || 0, challengesWon: st.challengesWon || 0, outfits: Math.max(0, (((save.char && save.char.owned) || []).length) - 1) };
}

// Neue Auszeichnungen ermitteln und mit Datum eintragen (jede höchstens einmal)
export function evaluateAwards(save, levelCount, run, now) {
  save.awards = save.awards || {};
  const p = progressOf(save, levelCount), neu = [];
  for (const a of AWARDS) {
    if (save.awards[a.id]) continue;
    let ok = false;
    try { ok = !!a.check(p, run || null, levelCount); } catch (e) { ok = false; }
    if (ok) { save.awards[a.id] = { at: (now || new Date()).toISOString(), level: run && run.level ? run.level : null }; neu.push(a); }
  }
  return neu;
}

// ====================================================================== Zeichnen (Browser)
const METAL = { bronze: ['#f2b07a', '#b8692f', '#7a3f17'], silber: ['#f4f6fb', '#aeb6c6', '#6c7486'], gold: ['#fff1a8', '#f2b81f', '#a86d00'] };
function star(ctx, x, y, r, n = 5, inner = 0.45) { ctx.beginPath(); for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + (i * Math.PI) / n, rr = i % 2 ? r * inner : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath(); }

function glyph(ctx, g, col) {
  ctx.save();
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const L = (pts) => { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke(); };
  switch (g) {
    case 'krone': ctx.beginPath(); ctx.moveTo(20, 68); ctx.lineTo(16, 34); ctx.lineTo(34, 48); ctx.lineTo(50, 26); ctx.lineTo(66, 48); ctx.lineTo(84, 34); ctx.lineTo(80, 68); ctx.closePath(); ctx.fill(); ctx.fillRect(20, 72, 60, 8); break;
    case 'muenze': ctx.beginPath(); ctx.arc(50, 52, 30, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(50, 52, 15, 0, 7); ctx.stroke(); break;
    case 'stern': star(ctx, 50, 52, 34, 5, 0.48); ctx.fill(); break;
    case 'sterne': star(ctx, 30, 62, 20, 5, 0.48); ctx.fill(); star(ctx, 70, 62, 20, 5, 0.48); ctx.fill(); star(ctx, 50, 34, 24, 5, 0.48); ctx.fill(); break;
    case 'palme':
      L([[50, 86], [48, 54], [52, 34]]);
      for (const [dx, dy] of [[-26, 6], [-18, -10], [0, -16], [20, -10], [28, 8]]) { ctx.beginPath(); ctx.moveTo(52, 34); ctx.quadraticCurveTo(52 + dx * 0.6, 34 + dy - 14, 52 + dx, 34 + dy + 8); ctx.stroke(); }
      break;
    case 'nashorn':
      ctx.beginPath(); ctx.ellipse(46, 58, 28, 22, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(66, 52); ctx.lineTo(88, 24); ctx.lineTo(76, 58); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(24, 40); ctx.lineTo(22, 22); ctx.lineTo(38, 36); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#20222c'; ctx.beginPath(); ctx.arc(54, 52, 4.5, 0, 7); ctx.fill(); break;
    case 'stamm': ctx.beginPath(); ctx.roundRect ? ctx.roundRect(14, 40, 72, 28, 12) : ctx.rect(14, 40, 72, 28); ctx.stroke(); ctx.beginPath(); ctx.ellipse(78, 54, 6, 11, 0, 0, 7); ctx.stroke(); L([[30, 50], [52, 50]]); L([[26, 60], [44, 60]]); L([[22, 22], [78, 22]]); L([[70, 14], [78, 22], [70, 30]]); break;
    case 'rutsch': ctx.beginPath(); ctx.roundRect ? ctx.roundRect(14, 22, 72, 22, 10) : ctx.rect(14, 22, 72, 22); ctx.stroke(); L([[50, 50], [50, 82]]); L([[38, 72], [50, 84], [62, 72]]); break;
    case 'endlos': ctx.beginPath(); ctx.moveTo(50, 52); ctx.bezierCurveTo(60, 30, 88, 30, 88, 52); ctx.bezierCurveTo(88, 74, 60, 74, 50, 52); ctx.bezierCurveTo(40, 30, 12, 30, 12, 52); ctx.bezierCurveTo(12, 74, 40, 74, 50, 52); ctx.stroke(); break;
    case 'farbe': ctx.beginPath(); ctx.arc(50, 52, 32, 0, 7); ctx.stroke(); for (const [x, y, c] of [[36, 42, '#ff5d73'], [58, 38, '#ffd84d'], [64, 58, '#5ee0ff'], [42, 64, '#7dffb0']]) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, 7, 0, 7); ctx.fill(); } break;
    case 'teilen': for (const [x, y] of [[30, 50], [70, 28], [70, 72]]) { ctx.beginPath(); ctx.arc(x, y, 10, 0, 7); ctx.fill(); } L([[30, 50], [70, 28]]); L([[30, 50], [70, 72]]); break;
    case 'vs': ctx.font = '900 46px "Dela Gothic One", "Arial Black", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('VS', 50, 54); break;
    default: ctx.font = `900 ${g.length > 1 ? 44 : 54}px "Dela Gothic One", "Arial Black", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(g, 50, 55);
  }
  ctx.restore();
}

export function drawAwardIcon(ctx, award, x, y, s, locked) {
  const rar = RARITY[award.rarity];
  const m = award.metal ? METAL[award.metal] : [shade(rar.color, 0.45), rar.color, shade(rar.color, -0.45)];
  ctx.save(); ctx.translate(x - s / 2, y - s / 2); ctx.scale(s / 100, s / 100);
  if (locked) ctx.globalAlpha = 0.9;
  const band = locked ? ['#3a3d4c', '#2b2e3a'] : [shade(rar.color, -0.1), shade(rar.color, -0.4)];
  ctx.fillStyle = band[0]; ctx.beginPath(); ctx.moveTo(30, 0); ctx.lineTo(46, 0); ctx.lineTo(40, 40); ctx.lineTo(24, 40); ctx.closePath(); ctx.fill();
  ctx.fillStyle = band[1]; ctx.beginPath(); ctx.moveTo(54, 0); ctx.lineTo(70, 0); ctx.lineTo(76, 40); ctx.lineTo(60, 40); ctx.closePath(); ctx.fill();
  const g = ctx.createLinearGradient(20, 22, 80, 98);
  if (locked) { g.addColorStop(0, '#5a5e70'); g.addColorStop(1, '#2a2d39'); } else { g.addColorStop(0, m[0]); g.addColorStop(0.55, m[1]); g.addColorStop(1, m[2]); }
  ctx.fillStyle = g; ctx.beginPath();
  if (award.rarity >= 3) { for (let i = 0; i < 32; i++) { const a = (i * Math.PI) / 16, r = i % 2 ? 37 : 41; ctx.lineTo(50 + Math.cos(a) * r, 60 + Math.sin(a) * r); } ctx.closePath(); } else ctx.arc(50, 60, 39, 0, Math.PI * 2);
  ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.stroke();
  ctx.beginPath(); ctx.arc(50, 60, 29, 0, Math.PI * 2); ctx.fillStyle = locked ? '#20222c' : 'rgba(17,18,26,.82)'; ctx.fill();
  if (!locked) { ctx.beginPath(); ctx.arc(50, 60, 37, Math.PI * 1.1, Math.PI * 1.6); ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.stroke(); }
  ctx.translate(25, 35); ctx.scale(0.5, 0.5);
  glyph(ctx, award.glyph, locked ? '#6d7286' : (award.metal ? m[0] : rar.color));
  ctx.restore();
}
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16); let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const t = f < 0 ? 0 : 255, p = Math.abs(f);
  r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
const hx = (n) => '#' + n.toString(16).padStart(6, '0');

// Kleine 2D-Figur (Junge/Mädchen) für Teilen-Bild, Kleiderschrank-Karten und Figurenwahl. Fußpunkt (x, y), Höhe s.
export function drawKid(ctx, kind, o, x, y, s) {
  const girl = kind === 'girl', k = s / 100, skin = '#f3bb91', hair = girl ? '#5b2f1b' : '#6e3f20';
  const pick = (v) => (Array.isArray(v) ? v[girl ? 1 : 0] : v);
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(0, 0, 26, 6, 0, 0, 7); ctx.fill();
  ctx.fillStyle = hx(o.pack); ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-16, -62, 32, 34, 6) : ctx.rect(-16, -62, 32, 34); ctx.fill();         // Rucksack
  ctx.fillStyle = '#20222c'; ctx.fillRect(-9, -22, 7, 22); ctx.fillRect(2, -22, 7, 22);                                                              // Beine/Schuhe angedeutet
  ctx.fillStyle = hx(o.shoes); ctx.fillRect(-12, -5, 12, 6); ctx.fillRect(1, -5, 12, 6);
  ctx.fillStyle = hx(pick(o.pants)); ctx.fillRect(-11, -33, 22, 13);
  ctx.fillStyle = hx(pick(o.shirt)); ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-14, -62, 28, 31, 7) : ctx.rect(-14, -62, 28, 31); ctx.fill();
  ctx.fillStyle = hx(o.shirt2); ctx.fillRect(-9, -62, 5, 20); ctx.fillRect(4, -62, 5, 20);
  ctx.fillStyle = skin; ctx.fillRect(-21, -58, 7, 20); ctx.fillRect(14, -58, 7, 20);                                                                  // Arme
  ctx.beginPath(); ctx.arc(0, -78, 17, 0, 7); ctx.fill();                                                                                           // Kopf
  ctx.fillStyle = hair; ctx.beginPath(); ctx.arc(0, -82, 17.5, Math.PI, 0); ctx.fill(); ctx.fillRect(-17.5, -83, 6, 10); ctx.fillRect(11.5, -83, 6, 10);
  if (girl) { ctx.beginPath(); ctx.ellipse(19, -70, 7, 15, 0.3, 0, 7); ctx.fill(); ctx.fillStyle = '#e53935'; ctx.fillRect(15, -86, 8, 6); }
  else { ctx.beginPath(); ctx.moveTo(-10, -97); ctx.lineTo(-4, -108); ctx.lineTo(2, -97); ctx.lineTo(9, -106); ctx.lineTo(13, -95); ctx.closePath(); ctx.fill(); }
  if (o.hat === 'cap') { ctx.fillStyle = hx(o.hatC); ctx.beginPath(); ctx.arc(0, -84, 18, Math.PI, 0); ctx.fill(); ctx.fillRect(-4, -86, 24, 4); }
  else if (o.hat === 'safari') { ctx.fillStyle = hx(o.hatC); ctx.beginPath(); ctx.ellipse(0, -90, 27, 5, 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(0, -90, 14, Math.PI, 0); ctx.fill(); }
  else if (o.hat === 'band') { ctx.fillStyle = hx(o.hatC); ctx.fillRect(-17.5, -90, 35, 6); }
  ctx.fillStyle = '#20222c'; ctx.beginPath(); ctx.arc(-6, -76, 2.6, 0, 7); ctx.arc(6, -76, 2.6, 0, 7); ctx.fill();
  ctx.fillStyle = '#8a2b3a'; ctx.fillRect(-4, -68, 8, 2.4);
  ctx.restore();
}

// Teilen-Grafik 1080×1080
export function drawShareImage(canvas, info) {
  canvas.width = 1080; canvas.height = 1080;
  const ctx = canvas.getContext('2d'), S = 1080;
  const accent = info.award ? RARITY[info.award.rarity].color : '#FFD21C';
  const bg = ctx.createLinearGradient(0, 0, 0, S); bg.addColorStop(0, '#0f3d2e'); bg.addColorStop(0.55, '#11694f'); bg.addColorStop(1, '#11121A');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, S, S);
  const rg = ctx.createRadialGradient(S / 2, 430, 40, S / 2, 430, 640); rg.addColorStop(0, hexA(accent, 0.5)); rg.addColorStop(0.5, hexA(accent, 0.12)); rg.addColorStop(1, 'rgba(17,18,26,0)');
  ctx.fillStyle = rg; ctx.fillRect(0, 0, S, S);
  ctx.save(); ctx.translate(S / 2, 430); ctx.globalAlpha = 0.07; ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 18; i++) { ctx.rotate(Math.PI / 9); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-40, -760); ctx.lineTo(40, -760); ctx.closePath(); ctx.fill(); }
  ctx.restore();
  // Palmen-Silhouetten links und rechts
  ctx.save(); ctx.fillStyle = 'rgba(8,40,28,.75)';
  for (const [px, sc] of [[70, 1.1], [1010, 1.1], [190, 0.7], [890, 0.7]]) {
    ctx.save(); ctx.translate(px, 1000); ctx.scale(sc, sc);
    ctx.beginPath(); ctx.moveTo(-10, 0); ctx.quadraticCurveTo(-4, -300, 14, -520); ctx.lineTo(26, -520); ctx.quadraticCurveTo(6, -300, 12, 0); ctx.closePath(); ctx.fill();
    for (let i = 0; i < 7; i++) { const a = -Math.PI * 0.95 + (i * Math.PI * 0.9) / 6; ctx.beginPath(); ctx.moveTo(20, -520); ctx.quadraticCurveTo(20 + Math.cos(a) * 110, -520 + Math.sin(a) * 90 - 40, 20 + Math.cos(a) * 230, -520 + Math.sin(a) * 160 + 70); ctx.quadraticCurveTo(20 + Math.cos(a) * 120, -520 + Math.sin(a) * 90, 20, -515); ctx.fill(); }
    ctx.restore();
  }
  ctx.restore();
  // Weg
  ctx.save(); ctx.fillStyle = 'rgba(214,190,140,.35)'; ctx.beginPath(); ctx.moveTo(430, 700); ctx.lineTo(650, 700); ctx.lineTo(1000, 1080); ctx.lineTo(80, 1080); ctx.closePath(); ctx.fill(); ctx.restore();
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#f6f7f9';
  ctx.font = '400 62px "Dela Gothic One", "Arial Black", sans-serif';
  ctx.save(); ctx.translate(S / 2, 118); ctx.rotate(-0.04); ctx.fillText('JUNGLE RUNNER', 0, 0); ctx.fillStyle = '#FFD21C'; ctx.fillRect(-250, 18, 500, 9); ctx.restore();
  if (info.award) { ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 16; drawAwardIcon(ctx, info.award, S / 2, 400, 360, false); ctx.restore(); }
  else if (info.zeitGross) {
    ctx.font = '700 200px "Barlow Condensed", "Arial Narrow", sans-serif'; ctx.fillStyle = '#ffffff'; ctx.fillText(info.zeitGross, S / 2, 440);
    ctx.font = '600 44px "Barlow", sans-serif'; ctx.fillStyle = '#d6e6dc'; ctx.fillText(info.unterZeit || '', S / 2, 515);
  }
  if (info.kid) drawKid(ctx, info.kid.kind, info.kid.outfit, info.award ? 150 : 150, info.award ? 640 : 640, 300 / 1);
  ctx.fillStyle = accent; ctx.font = '700 40px "Barlow", "Segoe UI", sans-serif'; ctx.fillText(info.kicker || '', S / 2, 640);
  ctx.fillStyle = '#ffffff'; fitText(ctx, info.titel || '', S / 2, 712, 960, 64, '400 {s}px "Dela Gothic One", "Arial Black", sans-serif');
  ctx.fillStyle = '#e4efe8'; fitText(ctx, info.zeile || '', S / 2, 778, 940, 42, '600 {s}px "Barlow", "Segoe UI", sans-serif');
  if (info.name) { ctx.fillStyle = '#c3d6cb'; ctx.font = '500 34px "Barlow", sans-serif'; ctx.fillText('– ' + info.name, S / 2, 826); }
  if (info.hinweis) { ctx.fillStyle = '#9db8aa'; ctx.font = '500 26px "Barlow", sans-serif'; ctx.fillText(info.hinweis, S / 2, 862); }
  ctx.textAlign = 'left'; ctx.fillStyle = '#ffffff'; fitText(ctx, info.einladung || 'Kannst du mich schlagen?', 64, 990, 600, 40, '700 {s}px "Barlow", sans-serif');
  ctx.fillStyle = '#c3d6cb'; ctx.font = '500 30px "Barlow", sans-serif'; ctx.fillText(info.url || 'playsaal.com/spiele/jungle-runner', 64, 1034);
  if (info.logo && info.logo.complete && info.logo.naturalWidth) { const h = 64, w = (info.logo.naturalWidth / info.logo.naturalHeight) * h; try { ctx.drawImage(info.logo, S - 64 - w, 958, w, h); } catch (e) { /* Logo optional */ } }
  else { ctx.textAlign = 'right'; ctx.fillStyle = '#ffffff'; ctx.font = '400 48px "Dela Gothic One", sans-serif'; ctx.fillText('playsaal', S - 64, 1010); }
  return canvas;
}
function fitText(ctx, text, x, y, maxW, size, font) { let s = size; do { ctx.font = font.replace('{s}', s); s -= 2; } while (ctx.measureText(text).width > maxW && s > 18); ctx.fillText(text, x, y); }
