// ZAHLENSTURM: Auszeichnungen. Definitionen und Auswertung sind reine Funktionen (in Node testbar),
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
// Lauf r: { level, gewonnen, n (Figuren am Ziel), maxN, bossN, unversehrt, alleMuenzen, sterne, fails (Fehlversuche vor diesem Sieg), ersterSieg }
export const AWARDS = [
  { id: 'erster', name: 'Erster Sieg', rarity: 1, metal: 'bronze', glyph: '1', desc: 'Das erste Level geschafft.',
    share: 'Ich habe mein erstes Level geschafft!', check: (p) => p.done >= 1, prog: (p) => [p.done, 1] },
  { id: 'fuenf', name: 'Fünf geschafft', rarity: 1, metal: 'bronze', glyph: '5', desc: '5 Level geschafft.',
    share: 'Ich habe 5 Level geschafft!', check: (p) => p.done >= 5, prog: (p) => [p.done, 5] },
  { id: 'zehn', name: 'Zehn geschafft', rarity: 2, metal: 'silber', glyph: '10', desc: '10 Level geschafft.',
    share: 'Ich habe 10 Level geschafft!', check: (p) => p.done >= 10, prog: (p) => [p.done, 10] },
  { id: 'zwanzig', name: 'Zahlenmeister', rarity: 4, metal: 'gold', glyph: 'krone', desc: 'Alle 20 Level geschafft.',
    share: 'Ich habe alle 20 Level geschafft!', check: (p, r, n) => p.done >= n, prog: (p, n) => [p.done, n] },
  { id: 'hundert', name: 'Hundertschaft', rarity: 1, glyph: 'gruppe', desc: '100 Figuren gleichzeitig in der Gruppe.',
    share: 'Meine Gruppe hatte 100 Figuren!', check: (p) => p.maxN >= 100, prog: (p) => [Math.min(p.maxN, 100), 100] },
  { id: 'fuenfhundert', name: 'Menschenmenge', rarity: 3, glyph: 'menge', desc: '500 Figuren gleichzeitig in der Gruppe.',
    share: '500 Figuren in einer Gruppe!', check: (p) => p.maxN >= 500, prog: (p) => [Math.min(p.maxN, 500), 500] },
  { id: 'unversehrt', name: 'Unversehrt', rarity: 2, glyph: 'schild', desc: 'Ein Level geschafft, ohne dass Hindernisse oder Minus-Tore Figuren gekostet haben.',
    share: 'Ein ganzes Level ohne einen Verlust!', check: (p, r) => !!r && r.gewonnen && r.unversehrt },
  { id: 'muenzen', name: 'Goldrausch', rarity: 2, glyph: 'muenze', desc: 'Alle Münzen eines Levels eingesammelt.',
    share: 'Alle Münzen eines Levels eingesammelt!', check: (p, r) => !!r && r.gewonnen && r.alleMuenzen },
  { id: 'bossriese', name: 'Riesenbezwinger', rarity: 3, glyph: 'boss', desc: 'Einen Boss mit mindestens 300 Figuren besiegt.',
    share: 'Boss besiegt mit einer riesigen Gruppe!', check: (p, r) => !!r && r.gewonnen && r.bossN >= 300 },
  { id: 'perfekt', name: 'Perfekter Lauf', rarity: 4, metal: 'gold', glyph: 'stern', desc: 'Ein Level mit allen Münzen, ohne Verlust und mit drei Sternen geschafft.',
    share: 'Perfekter Lauf: alles eingesammelt, nichts verloren!', check: (p, r) => !!r && r.gewonnen && r.unversehrt && r.alleMuenzen && r.sterne >= 3 },
  { id: 'sterne', name: 'Sternesammler', rarity: 3, glyph: 'sterne', desc: '30 Sterne gesammelt.',
    share: '30 Sterne gesammelt!', check: (p) => p.stars >= 30, prog: (p) => [p.stars, 30] },
  { id: 'sammler', name: 'Münzsammler', rarity: 1, glyph: 'muenze', desc: 'Insgesamt 1000 Münzen eingesammelt.',
    share: 'Schon 1000 Münzen gesammelt!', check: (p) => p.coinsTotal >= 1000, prog: (p) => [Math.min(p.coinsTotal, 1000), 1000] },
  { id: 'knapp', name: 'Auf den letzten Drücker', rarity: 2, glyph: 'sanduhr', desc: 'Ein Level mit höchstens 5 übrigen Figuren geschafft.',
    share: 'Mit nur wenigen Figuren gerade noch gewonnen!', check: (p, r) => !!r && r.gewonnen && r.n <= 5 },
  { id: 'comeback', name: 'Comeback', rarity: 3, glyph: 'comeback', desc: 'Ein Level ab Level 10 nach mindestens fünf Fehlversuchen geschafft.',
    share: 'Fünfmal gescheitert, dann geschafft. Comeback!', check: (p, r) => !!r && r.gewonnen && r.ersterSieg && r.level >= 10 && r.fails >= 5 },
  { id: 'farbe', name: 'Neue Farbe', rarity: 1, glyph: 'farbe', desc: 'Eine neue Figurenfarbe gekauft.',
    share: 'Meine Gruppe hat eine neue Farbe!', check: (p) => p.skins >= 1 },
  { id: 'herausforderer', name: 'Herausforderer', rarity: 1, glyph: 'teilen', desc: 'Ein Ergebnis oder einen Award mit Freunden geteilt.',
    share: 'Ich fordere dich heraus!', check: (p) => p.shared >= 1 },
  { id: 'angenommen', name: 'Herausforderung angenommen', rarity: 3, glyph: 'vs', desc: 'Das Ergebnis aus einer geteilten Herausforderung übertroffen.',
    share: 'Herausforderung angenommen und gewonnen!', check: (p) => p.challengesWon >= 1 }
];
export const AWARD_BY_ID = Object.fromEntries(AWARDS.map((a) => [a.id, a]));

// Fortschrittszahlen aus dem Speicherstand
export function progressOf(save, levelCount) {
  const lv = save.levels || {};
  let done = 0, stars = 0;
  for (let i = 1; i <= levelCount; i++) { const l = lv[i]; if (l && l.done) { done++; stars += l.stars || 0; } }
  const st = save.stats || {};
  return { done, stars, maxN: st.maxN || 0, coinsTotal: st.coinsTotal || 0, shared: st.shared || 0, challengesWon: st.challengesWon || 0, skins: Math.max(0, ((save.skins && save.skins.owned) || []).length - 1) };
}

// Neue Auszeichnungen ermitteln und mit Datum eintragen. Gibt die neu freigeschalteten zurück.
export function evaluateAwards(save, levelCount, run, now) {
  save.awards = save.awards || {};
  const p = progressOf(save, levelCount), neu = [];
  for (const a of AWARDS) {
    if (save.awards[a.id]) continue;
    let ok = false;
    try { ok = !!a.check(p, run || null, levelCount); } catch (e) { ok = false; }
    if (ok) {
      save.awards[a.id] = { at: (now || new Date()).toISOString(), level: run ? run.level : null, n: run && run.gewonnen ? run.n : null };
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
function figur(ctx, x, y, s) {   // kleine Spielfigur (Kopf + Körper), Fuß bei (x, y)
  ctx.beginPath(); ctx.ellipse(x, y - s * 0.28, s * 0.27, s * 0.3, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(x, y - s * 0.78, s * 0.2, 0, 7); ctx.fill();
}

// Symbole in einem 100×100-Feld, Mittelpunkt (50, 50), Linienfarbe col
function glyph(ctx, g, col) {
  ctx.save();
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const L = (pts) => { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke(); };
  switch (g) {
    case 'krone':
      ctx.beginPath(); ctx.moveTo(20, 68); ctx.lineTo(16, 34); ctx.lineTo(34, 48); ctx.lineTo(50, 26); ctx.lineTo(66, 48); ctx.lineTo(84, 34); ctx.lineTo(80, 68); ctx.closePath(); ctx.fill();
      ctx.fillRect(20, 72, 60, 8); break;
    case 'gruppe': figur(ctx, 30, 78, 52); figur(ctx, 70, 78, 52); figur(ctx, 50, 66, 62); break;
    case 'menge':
      for (const [x, y, s] of [[22, 60, 34], [50, 56, 34], [78, 60, 34], [36, 82, 40], [64, 82, 40], [50, 46, 30]]) figur(ctx, x, y, s); break;
    case 'schild':
      ctx.beginPath(); ctx.moveTo(50, 14); ctx.lineTo(80, 26); ctx.quadraticCurveTo(80, 70, 50, 86); ctx.quadraticCurveTo(20, 70, 20, 26); ctx.closePath(); ctx.stroke();
      L([[36, 50], [47, 61], [66, 40]]); break;
    case 'muenze':
      ctx.beginPath(); ctx.arc(50, 52, 30, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(50, 52, 15, 0, 7); ctx.stroke(); break;
    case 'boss':
      ctx.beginPath(); ctx.ellipse(50, 56, 30, 26, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#20222c'; ctx.beginPath(); ctx.arc(40, 52, 6, 0, 7); ctx.arc(60, 52, 6, 0, 7); ctx.fill();
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(26, 38); ctx.lineTo(24, 16); ctx.lineTo(40, 32); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(74, 38); ctx.lineTo(76, 16); ctx.lineTo(60, 32); ctx.closePath(); ctx.fill(); break;
    case 'stern': star(ctx, 50, 52, 34, 5, 0.48); ctx.fill(); break;
    case 'sterne': star(ctx, 30, 62, 20, 5, 0.48); ctx.fill(); star(ctx, 70, 62, 20, 5, 0.48); ctx.fill(); star(ctx, 50, 34, 24, 5, 0.48); ctx.fill(); break;
    case 'sanduhr':
      L([[28, 18], [72, 18]]); L([[28, 82], [72, 82]]);
      ctx.beginPath(); ctx.moveTo(32, 18); ctx.lineTo(68, 18); ctx.lineTo(52, 50); ctx.lineTo(68, 82); ctx.lineTo(32, 82); ctx.lineTo(48, 50); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(40, 80); ctx.lineTo(60, 80); ctx.lineTo(50, 64); ctx.closePath(); ctx.fill(); break;
    case 'comeback':
      L([[16, 30], [36, 66], [56, 50], [82, 18]]); L([[66, 18], [82, 18], [82, 34]]); break;
    case 'farbe':
      ctx.beginPath(); ctx.arc(50, 52, 32, 0, 7); ctx.stroke();
      for (const [x, y, c] of [[36, 42, '#ff5d73'], [58, 38, '#ffd84d'], [64, 58, '#5ee0ff'], [42, 64, '#7dffb0']]) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, 7, 0, 7); ctx.fill(); }
      break;
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
  // Spielmotiv: Gruppe kleiner Figuren am unteren Rand
  ctx.save(); ctx.fillStyle = hexA('#7dd3fc', 0.9);
  for (let i = 0; i < 46; i++) {
    const t = i / 45, x = 40 + t * (S - 80), y = 930 + Math.sin(t * 9 + 1) * 10 + (i % 3) * 14, sz = 40 + (i % 4) * 6;
    ctx.globalAlpha = 0.35 + (i % 5) * 0.1; figur(ctx, x, y, sz);
  }
  ctx.restore();
  // Spielname oben
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#f6f7f9';
  ctx.font = '400 54px "Dela Gothic One", "Arial Black", sans-serif';
  ctx.save(); ctx.translate(S / 2, 118); ctx.rotate(-0.04); ctx.fillText(info.spiel || 'ZAHLENSTURM', 0, 0);
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
  ctx.fillText(info.url || 'playsaal.com/spiele/zahlensturm', 64, 1034);
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
