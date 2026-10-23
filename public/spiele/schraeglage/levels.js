// SCHRÄGLAGE: Level. Jedes Level wird mit einem kleinen Baukasten beschrieben:
// ein "Stift" läuft von links nach rechts und zeichnet den Boden (flat, line, curve, hill …),
// Lücken, Brücken, Wippen und bewegte Plattformen werden an der Stiftposition eingesetzt.
// Einheiten: Meter. Start bei x = 0. gold = Goldzeit in Sekunden.
// Nur deterministische Mathematik verwenden (det.js), damit der Server Läufe exakt nachrechnen kann.
import { dsin, dcos, PI } from './det.js';

export const THEMES = {
  wiese:     { name: 'Wiese',     surface: 'gras' },
  canyon:    { name: 'Canyon',    surface: 'erde' },
  baustelle: { name: 'Baustelle', surface: 'asphalt' },
  gletscher: { name: 'Gletscher', surface: 'schnee' },
  insel:     { name: 'Insel',     surface: 'strand' },
  vulkan:    { name: 'Vulkan',    surface: 'stein' },
  gipfel:    { name: 'Gipfel',    surface: 'schnee' },
  wald:      { name: 'Wald',      surface: 'erde' },
  wueste:    { name: 'Wüste',     surface: 'strand' },
  hafen:     { name: 'Hafen',     surface: 'asphalt' },
  mine:      { name: 'Bergwerk',  surface: 'stein' },
  nacht:     { name: 'Mitternacht', surface: 'asphalt' }
};

class Bau {
  constructor(theme) {
    this.theme = theme; this.s = THEMES[theme].surface;
    this.pieces = []; this.cur = null; this.objects = []; this.swaps = [];
    this.x = 0; this.y = 0; this.finishX = null;
    this.begin(-12, 0);
    this.objects.push({ type: 'box', x: -12.5, y: 3, w: 1, h: 7, surface: 'stein', deco: 'wand' });
    this.flat(12);
  }
  // ---- Boden ----
  begin(x, y) { this.end(); this.x = x; this.y = y; this.cur = { pts: [[x, y]], surf: [] }; return this; }
  end() { if (this.cur && this.cur.pts.length > 1) this.pieces.push(this.cur); this.cur = null; return this; }
  pt(x, y, surf) { if (!this.cur) this.begin(this.x, this.y); this.cur.pts.push([x, y]); this.cur.surf.push(surf || this.s); this.x = x; this.y = y; return this; }
  surf(name) { this.s = name || THEMES[this.theme].surface; return this; }
  flat(len) { return this.pt(this.x + len, this.y); }
  line(len, dy) { return this.pt(this.x + len, this.y + dy); }
  // weicher Übergang um dy (Kosinus-Rampe)
  curve(len, dy, step = 0.6) {
    const x0 = this.x, y0 = this.y, n = Math.max(2, Math.ceil(len / step));
    for (let i = 1; i <= n; i++) { const t = i / n; this.pt(x0 + len * t, y0 + dy * (0.5 - 0.5 * dcos(PI * t))); }
    return this;
  }
  // Hügel/Mulde der Höhe h (negativ = Mulde)
  hill(len, h, step = 0.6) {
    const x0 = this.x, y0 = this.y, n = Math.max(3, Math.ceil(len / step));
    for (let i = 1; i <= n; i++) { const t = i / n; this.pt(x0 + len * t, y0 + h * (0.5 - 0.5 * dcos(2 * PI * t))); }
    return this;
  }
  bumps(len, h, count) { const l = len / count; for (let i = 0; i < count; i++) this.hill(l, h, 0.4); return this; }
  // Schanze: flach anlaufend, oben steiler
  kicker(len, dy) {
    const x0 = this.x, y0 = this.y;
    return this.pt(x0 + len * 0.3, y0 + dy * 0.1).pt(x0 + len * 0.6, y0 + dy * 0.36).pt(x0 + len, y0 + dy);
  }
  step(dy) { return this.pt(this.x + 0.08, this.y + dy); }
  stairs(n, w, dy) { for (let i = 0; i < n; i++) this.step(dy).flat(w); return this; }
  // Lücke: Boden endet, geht nach len Metern auf Höhe y+dy weiter
  gap(len, dy = 0, extra) { this.unten(len, dy, extra); this.end(); return this.begin(this.x + len, this.y + dy); }
  unten(len, dy, extra) {
    if (!extra || !extra.unten) return;
    const top = Math.min(this.y, this.y + (dy || 0)) - (extra.tief || 2.6);
    this.objects.push({ type: 'kill', x0: this.x, x1: this.x + len, y0: top - 12, y1: top, kind: extra.unten });
  }
  // Lücke mit Wasser oder Lava unten
  water(len, dy = 0, kind = 'wasser', tief = 2.6) { return this.gap(len, dy, { unten: kind, tief }); }
  lava(len, dy = 0, tief = 2.2) { return this.water(len, dy, 'lava', tief); }
  // ---- Objekte (relativ zur Stiftposition) ----
  obj(o) { this.objects.push(o); return this; }
  box(dx, dy, w, h, extra) { return this.obj(Object.assign({ type: 'box', x: this.x + dx, y: this.y + dy, w, h }, extra)); }
  crate(dx, dy, size = 0.9, extra) { return this.obj(Object.assign({ type: 'crate', x: this.x + dx, y: this.y + dy + size / 2, w: size, h: size }, extra)); }
  barrel(dx, dy, r = 0.45, extra) { return this.obj(Object.assign({ type: 'barrel', x: this.x + dx, y: this.y + dy + r, r }, extra)); }
  ball(dx, dy, r = 0.7, extra) { return this.obj(Object.assign({ type: 'ball', x: this.x + dx, y: this.y + dy + r, r }, extra)); }
  rock(dx, r, dy = 0) { return this.obj({ type: 'rock', x: this.x + dx, y: this.y + dy, r }); }
  ceiling(dx, len, h, thick = 1.2, extra) { return this.obj(Object.assign({ type: 'box', x: this.x + dx + len / 2, y: this.y + h + thick / 2, w: len, h: thick, surface: 'stein' }, extra)); }
  // Brücke über eine Lücke der Länge len (Endhöhe y+dy)
  bridge(len, dy = 0, extra = {}) {
    this.unten(len, dy, extra); this.end();
    this.obj(Object.assign({ type: 'bridge', x0: this.x, y0: this.y, x1: this.x + len, y1: this.y + dy }, extra));
    return this.begin(this.x + len, this.y + dy);
  }
  // Wippe über einer Lücke. Das ferne Ufer liegt so tief wie das gekippte Brettende.
  seesaw(len, extra = {}) {
    const lim = extra.limit || 14;
    const gapL = len + 0.5;
    const tiefer = -(len / 2) * dsin((lim * PI) / 180) - 0.13;
    const dy2 = extra.dy2 != null ? extra.dy2 : tiefer;
    this.unten(gapL, Math.min(0, dy2), extra); this.end();
    const cx = this.x + gapL / 2, py = this.y - 0.5;
    this.obj(Object.assign({ type: 'seesaw', x: cx, y: py, w: len, h: 0.35, limit: lim }, extra));
    this.obj({ type: 'poly', pts: [[cx - 0.8, py - 3.2], [cx + 0.8, py - 3.2], [cx, py - 0.05]], surface: 'stein', deco: 'bock' });
    return this.begin(this.x + gapL, this.y + dy2);
  }
  // Fähre: pendelt zwischen den Ufern
  ferry(gapLen, w, period, extra = {}) {
    this.unten(gapLen, extra.dy2 || 0, extra); this.end();
    this.obj(Object.assign({ type: 'mover', x: this.x + w / 2 + 0.15, y: this.y - 0.25, w, h: 0.5, dx: gapLen - w - 0.3, dy: 0, period, phase: extra.phase || 0, wait: 0.2 }, extra));
    return this.begin(this.x + gapLen, this.y + (extra.dy2 || 0));
  }
  // Aufzug: fährt hoch auf das nächste Ufer
  elevator(gapLen, w, hub, period, extra = {}) {
    this.unten(gapLen, 0, extra); this.end();
    // Plattform füllt den Schacht fast ganz aus, damit kein Rad in einen Spalt rutscht
    this.obj(Object.assign({ type: 'mover', x: this.x + gapLen / 2, y: this.y - 0.25, w: gapLen - 0.3, h: 0.5, dx: 0, dy: hub, period, phase: extra.phase || 0, wait: 0.25 }, extra));
    return this.begin(this.x + gapLen, this.y + hub);
  }
  // Schaukel: Plattform an zwei Seilen über einer Lücke
  swingGap(len, w, extra = {}) {
    this.unten(len, extra.dy2 || 0, extra); this.end();
    this.obj(Object.assign({ type: 'swing', x: this.x + len / 2, y: this.y - 0.2, w, h: 0.4, top: this.y + (extra.hoch || 6) }, extra));
    return this.begin(this.x + len, this.y + (extra.dy2 || 0));
  }
  // Bröckelplatten über einer Lücke
  fallBridge(len, n, extra = {}) {
    this.unten(len, 0, extra); this.end();
    const w = len / n;
    for (let i = 0; i < n; i++) this.obj({ type: 'fall', x: this.x + w * (i + 0.5), y: this.y - 0.25, w: w - 0.06, h: 0.5, delay: extra.delay || 20 });
    return this.begin(this.x + len, this.y);
  }
  // Drehbalken über einer Lücke (Mitte auf Uferhöhe)
  rotorGap(len, w, speed, extra = {}) {
    this.unten(len, 0, extra); this.end();
    this.obj(Object.assign({ type: 'rotor', x: this.x + len / 2, y: this.y - 0.23, w, h: 0.45, speed, arms: extra.arms || 1 }, extra));
    return this.begin(this.x + len, this.y + (extra.dy2 || 0));
  }
  swap(vehicle, dx = 0) { this.swaps.push({ x: this.x + dx, vehicle }); return this; }
  // Ziel: Linie, danach Auslauf und Wand
  finish(run = 16) {
    this.flat(3);
    this.finishX = this.x;
    this.flat(run);
    this.objects.push({ type: 'box', x: this.x + 0.5, y: this.y + 3.5, w: 1, h: 7, surface: 'stein', deco: 'wand' });
    this.end();
    return this;
  }
}

function L(id, name, opts, build) {
  const b = new Bau(opts.theme);
  build(b);
  if (b.finishX == null) b.finish();
  b.end();
  let minY = Infinity;
  for (const p of b.pieces) for (const q of p.pts) minY = Math.min(minY, q[1]);
  for (const o of b.objects) if (o.type !== 'kill' && o.y != null) minY = Math.min(minY, o.y);
  const bottom = minY - 30;
  for (const p of b.pieces) p.bottom = bottom;
  return {
    id, name, theme: opts.theme, vehicle: opts.vehicle || 'kraxler', gold: opts.gold || null, tip: opts.tip || '',
    start: [0, 0], finish: b.finishX, killY: minY - 7, bottom,
    ground: b.pieces, objects: b.objects, swaps: b.swaps
  };
}

// ======================================================================
// Level 1–5: Grundlagen, einfache Hügel, kleine Sprünge
// Level 6–10: schmale Brücken, größere Rampen, kontrolliertes Bremsen
// Level 11–15: bewegliche Plattformen, Wippen, instabile Hindernisse
// Level 16–20: Sprungkombinationen, unterschiedliche Untergründe
// Level 21–25: Fahrzeugwechsel, große Räder, Balance
// Level 26–30: alles zusammen
// Level 31–35: Gipfel (Zusatzwelt): steile Hänge, Eis, lange Brücken, schwere Fahrzeuge, Finale mit allen fünf Fahrzeugen
// Level 36–40: Wald: Schlamm, Baumstämme, Pilz-Trampoline, Baumwipfelpfad
// Level 41–45: Wüste: Tiefsand, Dünen, Oasen, Sandsturm
// Level 46–50: Hafen: Container, Fähren, Drehbrücken, Ladekräne
// Level 51–55: Bergwerk: niedrige Stollendecken, Aufzüge, Loren, Glutnester
// Level 56–60: Mitternacht: alles zusammen, großes Finale mit allen fünf Fahrzeugen
export const LEVELS = [
  // ------------------------------------------------ Wiese
  L(1, 'Erste Runde', { theme: 'wiese', gold: 14, tip: 'Halte Gas gedrückt. Vor großen Kuppen kurz loslassen.' }, (b) => {
    b.flat(10).hill(16, 1.2).flat(6).curve(10, 1.2).flat(8).hill(16, 1.6).flat(6).curve(12, -1.2).flat(4).bumps(12, 0.35, 3).flat(4);
  }),
  L(2, 'Hüpfburg', { theme: 'wiese', gold: 9, tip: 'In der Luft: Gas hebt die Nase, Bremse senkt sie.' }, (b) => {
    b.flat(8).kicker(7, 1.0).gap(5, -0.5).flat(10).hill(12, 1.0).flat(6).kicker(6, 0.9).gap(6, -0.4).flat(8).curve(8, 1).flat(4).kicker(6, 0.8).gap(6, -1.2).flat(6);
  }),
  L(3, 'Holzweg', { theme: 'wiese', gold: 17.5, tip: 'Brücken wackeln. Gleichmäßig fahren.' }, (b) => {
    b.flat(6).curve(8, 1.2).flat(4).bridge(12, 0).flat(8).crate(4, 0).crate(5.4, 0).flat(10).curve(10, -1.2).flat(4).bridge(10, -0.5).flat(6).hill(10, 1).flat(4);
  }),
  L(4, 'Wippe', { theme: 'wiese', gold: 16.5, tip: 'Fahr auf die Wippe, sie kippt dich sanft nach vorn.' }, (b) => {
    b.flat(8).seesaw(8).flat(8).stairs(3, 3, 0.35).flat(4).seesaw(9).flat(8).curve(8, -1).flat(4).hill(12, 1.4).flat(4);
  }),
  L(5, 'Achterbahn', { theme: 'wiese', gold: 13, vehicle: 'strandfloh', tip: 'Der Strandfloh ist leicht und schnell. Auf Kuppen kurz vom Gas!' }, (b) => {
    b.flat(8).curve(12, 1.6).flat(4).curve(12, -1.6).flat(6).hill(20, 1.8).flat(6).kicker(8, 1.2).gap(7, -1).curve(12, -1.2).flat(8).hill(22, 2).flat(6).curve(10, 1).kicker(6, 0.8).gap(6, -1.5).curve(8, -0.5).flat(6);
  }),
  // ------------------------------------------------ Canyon
  L(6, 'Hängebrücke', { theme: 'canyon', gold: 10.5, tip: 'Lange Brücken schwingen. Nicht zu schnell drauf.' }, (b) => {
    b.flat(8).curve(8, 1).flat(4).bridge(16, 0).flat(6).kicker(6, 0.8).gap(5, -0.8).flat(6).bridge(12, 0.6).flat(4).curve(10, -1.6).flat(3).bridge(12, -0.6).flat(6);
  }),
  L(7, 'Talfahrt', { theme: 'canyon', gold: 10, tip: 'Bergab wird es schnell. Vor den Schanzen dosieren!' }, (b) => {
    b.flat(8).curve(10, 3).flat(4).line(12, -4).flat(3).kicker(5, 0.6).gap(4, -1.5).flat(9).kicker(5, 0.6).gap(4, -1.5).flat(9).curve(8, -1.5).flat(3)
      .step(-0.7).flat(3).step(-0.7).flat(5).kicker(6, 1).gap(6, -1).flat(6);
  }),
  L(8, 'Canyon-Sprung', { theme: 'canyon', gold: 11, vehicle: 'pritsche', tip: 'Die Pritsche fliegt weit. In der Luft gerade halten.' }, (b) => {
    b.flat(8).curve(12, 1.5).flat(4).kicker(10, 1.8).gap(10, -1.5).curve(14, -1.5).flat(6).kicker(10, 1.6).gap(11, 0).curve(10, -1).flat(4).kicker(8, 1.8).gap(9, -1).curve(12, -1.5).flat(6);
  }),
  L(9, 'Schmaler Grat', { theme: 'canyon', gold: 11.5, vehicle: 'strandfloh', tip: 'Schmale Säulen: mit Tempo drüber, nicht übermütig werden.' }, (b) => {
    b.flat(8).curve(6, 1).flat(4).gap(2.5, 0).flat(5).gap(2.5, 0).flat(4).kicker(3, 0.3).gap(3.5, -0.3).flat(5).curve(8, 1.5).flat(4).gap(2.5, -0.3).flat(5).gap(2.5, -0.3).flat(5).line(8, -1.5).kicker(3, 0.3).gap(4, -0.8).flat(5).bridge(10, 0, { h: 0.24 }).flat(6);
  }),
  L(10, 'Felsenmeer', { theme: 'canyon', gold: 18, tip: 'Über die Brocken mit Schwung, steile Hänge mit Gefühl.' }, (b) => {
    b.flat(8).rock(5, 0.5, -0.2).flat(12).curve(10, 3).flat(4).rock(2, 0.45, -0.2).flat(6).curve(10, -3).rock(5, 0.5, -0.25).flat(10)
      .curve(8, 2).flat(2).curve(8, -2).flat(4).kicker(8, 1.6).gap(8, -1.5).flat(4).rock(5, 0.5, -0.25).flat(10);
  }),
  // ------------------------------------------------ Baustelle
  L(11, 'Aufzug', { theme: 'baustelle', gold: 24, vehicle: 'pritsche', tip: 'Warte, bis die Plattform da ist. Bremse hält dich, gedrückt halten fährt rückwärts.' }, (b) => {
    b.flat(8).ferry(12, 5, 5).flat(6).elevator(7, 5, 3, 6).flat(6).curve(8, -1).flat(2).ferry(13, 5, 3.6, { phase: 0.5 }).flat(6).kicker(6, 1).gap(5, -1).flat(6);
  }),
  L(12, 'Wippenwerk', { theme: 'baustelle', gold: 20, tip: 'Eine Wippe nach der anderen. Nicht zu schnell!' }, (b) => {
    b.flat(8).seesaw(8).flat(4).seesaw(10).flat(4).curve(6, 1.5).flat(2).seesaw(8, { limit: 18 }).flat(6).curve(6, 1).seesaw(12, { limit: 12 }).flat(6);
  }),
  L(13, 'Schwertransport', { theme: 'baustelle', gold: 14, vehicle: 'brummi', tip: 'Der Brummi schiebt alles weg. Bremsen braucht Platz.' }, (b) => {
    b.flat(10).bridge(16, 0, { density: 90 }).flat(6).crate(3, 0, 1.2).crate(3, 1.2, 1.2).crate(4.4, 0, 1.2).barrel(8, 0).barrel(9.2, 0).flat(14)
      .seesaw(14, { limit: 10, density: 14 }).flat(8).curve(10, 2).flat(6).curve(10, -2).flat(6);
  }),
  L(14, 'Kranschaukel', { theme: 'baustelle', gold: 17.5, tip: 'Schaukeln schwingen, Platten bröckeln. Nicht stehen bleiben!' }, (b) => {
    b.flat(8).swingGap(10.5, 6.5).flat(6).fallBridge(12, 4, { delay: 16 }).flat(6).swingGap(10.5, 6.5).flat(6).ferry(12, 5.5, 5, { wait: 0.3 }).flat(5).fallBridge(10, 3, { delay: 18 }).flat(6);
  }),
  L(15, 'Rohbau', { theme: 'baustelle', gold: 11.5, vehicle: 'pritsche', tip: 'Aufzug, Bröckelboden, Fähre: alles im Fluss halten.' }, (b) => {
    b.flat(8).elevator(7, 5, 3, 5).flat(6).fallBridge(12, 4).flat(4).ferry(12, 5.5, 5, { wait: 0.3 }).flat(5).crate(3, 0).crate(3, 0.9).crate(4.2, 0).flat(10).kicker(6, 1.2).gap(6, -2).flat(6);
  }),
  // ------------------------------------------------ Gletscher
  L(16, 'Glatteis', { theme: 'gletscher', gold: 10.5, tip: 'Auf Eis greifen die Reifen kaum. Schwung mitnehmen, nicht bremsen!' }, (b) => {
    b.flat(8).surf('eis').flat(8).surf().curve(10, 2.5).flat(3).surf('eis').curve(10, -2.5).flat(4).kicker(6, 1).surf().gap(7, -1).flat(4)
      .surf('eis').curve(12, 3).surf().flat(4).curve(8, -1.5).surf('eis').flat(6).surf().kicker(6, 1).gap(6, -1.5).flat(6);
  }),
  L(17, 'Schneeschanze', { theme: 'gletscher', gold: 11, vehicle: 'strandfloh', tip: 'Lange Luftzeit: Nase leicht unten halten, auf dem Hang landen.' }, (b) => {
    b.flat(6).curve(10, 4).flat(4).line(14, -5).kicker(6, 0.8).gap(14, -6).line(16, -4).curve(10, -1).flat(6).kicker(8, 1.6).gap(10, -1).flat(8).hill(12, 2).flat(6);
  }),
  L(18, 'Eisige Stufen', { theme: 'gletscher', gold: 17, vehicle: 'wummser', tip: 'Der Wummser klettert Stufen. Auf vereisten Stufen fehlt Grip!' }, (b) => {
    b.flat(8).stairs(2, 4, 0.7).surf('eis').flat(3).surf().flat(1.5).step(0.55).surf('eis').flat(3).surf().flat(1.5).step(0.55).flat(3).surf('eis').curve(10, -2).surf().flat(4).rock(4, 0.8, -0.3).flat(6)
      .kicker(8, 1.8).gap(10, -1).surf('eis').flat(5).surf().stairs(2, 3, 0.6).flat(4).curve(10, -3).flat(6);
  }),
  L(19, 'Gletscherspalten', { theme: 'gletscher', gold: 12, vehicle: 'pritsche', tip: 'Turbo-Streifen geben Schub für die breiten Spalten.' }, (b) => {
    b.flat(6).surf('boost').flat(6).surf().kicker(6, 1.2).gap(13, -0.5).surf('eis').flat(8).surf().flat(2).surf('boost').flat(4).surf().kicker(6, 1.2).gap(15, 0).flat(6)
      .surf('eis').curve(8, 2).surf().kicker(5, 0.8).gap(9, -2).flat(3).surf('eis').hill(10, 1.2).surf().flat(7).kicker(5, 1).gap(7, -1).flat(6);
  }),
  L(20, 'Lawinenhang', { theme: 'gletscher', gold: 9.5, tip: 'Schneebälle im Weg? Drüber oder wegschieben.' }, (b) => {
    b.flat(8).curve(12, 4).flat(6).ball(3, 0, 0.6).flat(8).curve(12, -4).surf('eis').flat(6).surf().ball(4, 0, 0.55).ball(6, 0, 0.5).flat(10).kicker(6, 1.4).gap(8, -1).flat(4).surf('eis').curve(8, -2).surf().flat(6);
  }),
  // ------------------------------------------------ Insel
  L(21, 'Umsteigen, bitte!', { theme: 'insel', gold: 12.5, tip: 'Fahr durch das orange Tor, dann sitzt du in einem anderen Fahrzeug.' }, (b) => {
    b.flat(8).curve(6, 1).flat(6).swap('wummser', 2).flat(8).rock(3, 1.0, -0.3).rock(8, 1.1, -0.4).flat(10).stairs(2, 3.5, 0.7).flat(6).seesaw(10, { unten: 'wasser' }).flat(8).swap('kraxler', 3).flat(8)
      .kicker(6, 1).water(6, -1.2).flat(6).seesaw(8, { unten: 'wasser' }).flat(6);
  }),
  L(22, 'Monsterstrand', { theme: 'insel', gold: 15.5, vehicle: 'wummser', tip: 'Große Räder, großes Ego. Trotzdem: nicht überschlagen!' }, (b) => {
    b.flat(8).rock(5, 1.3, -0.4).rock(10, 1.1, -0.3).flat(14).rock(3, 0.9, -0.3).rock(5.5, 1.0, -0.4).flat(10).hill(16, 3).flat(4)
      .stairs(3, 3.5, 0.75).flat(4).curve(8, -2.2).flat(4).kicker(8, 1.5).water(9, -0.5).flat(6).rock(4, 1.2, -0.4).flat(10);
  }),
  L(23, 'Balanceakt', { theme: 'insel', gold: 8, vehicle: 'strandfloh', tip: 'Wippen über dem Wasser. Ruhig bleiben.' }, (b) => {
    b.flat(8).seesaw(8, { unten: 'wasser' }).flat(5).bridge(12, 0, { h: 0.24, unten: 'wasser' }).flat(4).seesaw(10, { unten: 'wasser' }).flat(4).swingGap(10, 5, { unten: 'wasser' }).flat(6);
  }),
  L(24, 'Fährbetrieb', { theme: 'insel', gold: 17.5, vehicle: 'brummi', tip: 'Erst mit dem Brummi auf die Fähren, dann flink mit dem Floh weiter.' }, (b) => {
    b.flat(10).ferry(15, 8, 6, { unten: 'wasser', wait: 0.3 }).flat(6).ferry(16, 8, 6, { unten: 'wasser', phase: 0.5, wait: 0.3 }).flat(6).swap('strandfloh', 3).flat(8).kicker(7, 1.5).water(10, -1).flat(6).kicker(6, 1.2).water(9, 0).flat(6);
  }),
  L(25, 'Inselhüpfer', { theme: 'insel', gold: 15.5, vehicle: 'wummser', tip: 'Sprungfedern schleudern dich hoch. Zweimal umsteigen!' }, (b) => {
    b.flat(8).surf('feder').flat(3).surf().flat(5).gap(6, 2.5).flat(6).swap('pritsche', 2).flat(8).kicker(8, 1.6).water(10, -1).flat(6).swap('kraxler', 2).flat(6).surf('feder').flat(2.5).surf().flat(3).gap(5, 2).flat(5).bridge(10, 0, { unten: 'wasser' }).flat(6);
  }),
  // ------------------------------------------------ Vulkan
  L(26, 'Glutpfad', { theme: 'vulkan', gold: 18, tip: 'Lava = sofort vorbei. Bröckelplatten nicht abwarten!' }, (b) => {
    b.flat(8).kicker(6, 1).lava(7, -0.5).flat(5).fallBridge(14, 5, { unten: 'lava' }).flat(4).kicker(3, 0.3).gap(3, -0.3, { unten: 'lava' }).flat(4).gap(2.5, -0.6, { unten: 'lava' }).flat(4)
      .surf('boost').flat(5).surf().kicker(7, 1.4).lava(13, -1).flat(6).fallBridge(12, 4, { unten: 'lava' }).flat(4).ferry(12, 5.5, 5, { unten: 'lava', wait: 0.3 }).flat(5).seesaw(9, { unten: 'lava' }).flat(4).kicker(5, 0.8).lava(6, -1).flat(6);
  }),
  L(27, 'Ascheregen', { theme: 'vulkan', gold: 15.5, vehicle: 'pritsche', tip: 'Wippen und Fähren über Lava. Timing ist alles.' }, (b) => {
    b.flat(8).seesaw(10, { unten: 'lava' }).flat(6).ferry(13, 5, 4, { unten: 'lava' }).flat(5).curve(8, 2).flat(2).seesaw(12, { unten: 'lava', limit: 12 }).flat(5).kicker(7, 1.4).lava(9, -1).flat(6);
  }),
  L(28, 'Magmakammer', { theme: 'vulkan', gold: 19, vehicle: 'wummser', tip: 'Aufzug, Wippe, Bröckelplatten über Lava. Erst schauen, dann fahren.' }, (b) => {
    b.flat(8).stairs(2, 3.5, 0.7).flat(4).elevator(8, 5.5, 3, 6, { unten: 'lava' }).flat(6).seesaw(11, { unten: 'lava', limit: 12 }).flat(5).fallBridge(10, 3, { unten: 'lava' }).flat(4).curve(10, -2).flat(4).kicker(8, 1.5).lava(9, -0.5).flat(4).stairs(2, 3, 0.7).flat(6);
  }),
  L(29, 'Feuerprobe', { theme: 'vulkan', gold: 13, vehicle: 'strandfloh', tip: 'Floh, Brummi, Kraxler: jedes Fahrzeug für seinen Abschnitt.' }, (b) => {
    b.flat(8).kicker(6, 1.2).lava(8, -0.5).flat(6).swap('brummi', 2).flat(8).bridge(14, 0, { density: 90, unten: 'lava' }).flat(6).crate(3, 0, 1.2).crate(4.3, 0, 1.2).flat(8).swap('kraxler', 2).flat(8).seesaw(9, { unten: 'lava' }).flat(4).kicker(6, 1.1).lava(7, -1).flat(6);
  }),
  L(30, 'Schräglage', { theme: 'vulkan', gold: 20, tip: 'Das Finale: alles, was du gelernt hast.' }, (b) => {
    b.flat(8).bridge(12, 0, { unten: 'lava' }).flat(5).seesaw(9, { unten: 'lava' }).flat(5).ferry(13, 6, 5, { unten: 'lava', wait: 0.3 }).flat(5).fallBridge(10, 3, { unten: 'lava' }).flat(4)
      .surf('boost').flat(5).surf().kicker(7, 1.6).lava(12, -1).flat(4).stairs(2, 3, 0.8).flat(4).swingGap(9, 7, { unten: 'lava' }).flat(5).kicker(6, 1).lava(7, -1.5).flat(6);
  }),
  // ------------------------------------------------ Gipfel
  L(31, 'Gipfelstürmer', { theme: 'gipfel', gold: 14, tip: 'Steile Hänge hoch: Gas halten. Vor den Schanzen nicht zu früh bremsen.' }, (b) => {
    b.flat(8).curve(12, 4).flat(4).surf('eis').curve(10, 3).surf().flat(4).kicker(6, 1.2).gap(7, 1).flat(5).curve(10, -3).flat(4).kicker(6, 1).gap(8, -1.5).flat(4).curve(8, 2).flat(3).stairs(2, 3, 0.6).flat(6);
  }),
  L(32, 'Wolkenbrücke', { theme: 'gipfel', gold: 9, vehicle: 'strandfloh', tip: 'Brücke, Schaukel, Bröckelplatten: der Floh ist leicht, bleib sanft am Gas.' }, (b) => {
    b.flat(8).bridge(14, 0, { h: 0.24 }).flat(4).swingGap(10, 5).flat(4).fallBridge(12, 4, { delay: 14 }).flat(4).kicker(6, 1.3).gap(9, -1).flat(4).bridge(16, 0.5, { h: 0.24 }).flat(6);
  }),
  L(33, 'Rutschpartie', { theme: 'gipfel', gold: 10.5, vehicle: 'pritsche', tip: 'Eis, Wippen und Turbo. Auf dem Eis kaum lenken, einfach rollen lassen.' }, (b) => {
    b.flat(8).surf('eis').curve(10, -3).flat(6).surf().seesaw(10).flat(4).surf('eis').flat(8).surf('boost').flat(5).surf().kicker(7, 1.5).gap(12, -1).surf('eis').flat(6).surf().seesaw(9, { limit: 16 }).flat(5).kicker(5, 1).gap(6, -1).flat(6);
  }),
  L(34, 'Schwergewicht', { theme: 'gipfel', gold: 24, vehicle: 'brummi', tip: 'Erst mit dem Brummi alles wegschieben, dann mit dem Wummser über Stufen und Aufzug.' }, (b) => {
    b.flat(10).bridge(14, 0, { density: 90 }).flat(6).crate(3, 0, 1.2).crate(3, 1.2, 1.2).crate(4.4, 0, 1.2).flat(18).swap('wummser', 2).flat(10).rock(4, 1.0, -0.3).rock(9, 1.1, -0.4).flat(12).stairs(2, 3.5, 0.6).flat(6).elevator(8, 5.5, 3, 6).flat(6).curve(8, -1.5).flat(3).kicker(6, 1).gap(6, -0.5).flat(6);
  }),
  L(35, 'Gipfelkreuz', { theme: 'gipfel', gold: 28, tip: 'Das große Finale: alle fünf Fahrzeuge, ein Berg. Viel Glück!' }, (b) => {
    b.flat(8).kicker(6, 1.2).gap(8, -0.5).flat(5).swap('strandfloh', 2).flat(6).fallBridge(12, 4).flat(4).swingGap(9, 6).flat(5).swap('pritsche', 2).flat(6).surf('boost').flat(5).surf().kicker(7, 1.5).gap(12, -1).flat(4).swap('brummi', 2).flat(8).bridge(12, 0, { density: 90 }).flat(5).seesaw(10, { limit: 10, density: 14 }).flat(5).swap('wummser', 2).flat(6).stairs(3, 3.5, 0.75).flat(4).elevator(7, 5, 3, 6).flat(5).kicker(7, 1.4).gap(9, -0.5).flat(6);
  }),
  // ------------------------------------------------ Wald
  L(36, 'Waldweg', { theme: 'wald', gold: 17, tip: 'Schlamm bremst stark. Mit Schwung rein, Gas halten!' }, (b) => {
    b.flat(8).bumps(10, 0.35, 3).flat(4).surf('schlamm').flat(5).surf().flat(4).curve(8, 1.2).flat(4).bridge(12, 0).flat(5).surf('schlamm').flat(4).surf().kicker(6, 1).gap(6, -0.8).flat(6).hill(12, 1.2).flat(4);
  }),
  L(37, 'Holzfäller', { theme: 'wald', gold: 10.5, vehicle: 'brummi', tip: 'Baumstämme liegen quer. Der Brummi rollt sie einfach weg.' }, (b) => {
    b.flat(10).barrel(4, 0, 0.5).barrel(5.1, 0, 0.5).barrel(4.55, 0.95, 0.45).flat(12).surf('schlamm').flat(5).surf().flat(4).bridge(14, 0, { density: 90 }).flat(6).crate(3, 0, 1.2).crate(4.3, 0, 1.2).flat(12).curve(10, 1.5).flat(4).barrel(3, 0, 0.5).flat(8).curve(10, -1.5).flat(6);
  }),
  L(38, 'Pilzhüpfer', { theme: 'wald', gold: 9, vehicle: 'strandfloh', tip: 'Rote Pilze federn dich hoch. In der Luft gerade bleiben!' }, (b) => {
    b.flat(8).curve(6, 1).flat(4).kicker(5, 0.6).gap(5, -0.6).surf('trampolin').flat(5).surf().curve(6, 0.6).flat(6).bumps(8, 0.3, 2).flat(4).kicker(5, 0.6).gap(5, -0.6).surf('trampolin').flat(5).surf().curve(6, 0.6).flat(5).surf('schlamm').flat(3).surf().flat(4).kicker(5, 0.8).gap(5, -0.8).flat(6);
  }),
  L(39, 'Wurzelwerk', { theme: 'wald', gold: 13.5, vehicle: 'wummser', tip: 'Wurzeln und Stufen: der Wummser klettert, aber nicht zu wild.' }, (b) => {
    b.flat(8).rock(4, 0.8, -0.3).rock(8, 0.9, -0.35).flat(12).stairs(3, 3.5, 0.6).flat(4).surf('schlamm').flat(5).surf().seesaw(10).flat(5).rock(4, 1.0, -0.4).flat(8).curve(10, -2).flat(4).kicker(8, 1.6).gap(8, -1).flat(6);
  }),
  L(40, 'Baumwipfelpfad', { theme: 'wald', gold: 11, vehicle: 'pritsche', tip: 'Hoch oben in den Wipfeln: Hängebrücken, Schaukeln, morsche Bretter.' }, (b) => {
    b.flat(8).curve(10, 2.5).flat(4).bridge(14, 0, { h: 0.26 }).flat(4).swingGap(10.5, 6.5).flat(5).fallBridge(12, 4, { delay: 16 }).flat(4).bridge(12, 0.4, { h: 0.26 }).flat(4).kicker(7, 1.2).gap(9, -1.5).flat(6);
  }),
  // ------------------------------------------------ Wüste
  L(41, 'Dünenmeer', { theme: 'wueste', gold: 12, vehicle: 'strandfloh', tip: 'Weiche Dünen: oben kurz vom Gas, unten wieder drauf.' }, (b) => {
    b.flat(8).hill(16, 2).flat(4).hill(18, 2.5).flat(3).kicker(7, 1.2).gap(8, -1.2).flat(4).hill(14, 1.6).flat(4).surf('sand').flat(4).surf().curve(10, 1.5).kicker(6, 0.8).gap(7, -1.8).flat(6);
  }),
  L(42, 'Treibsand', { theme: 'wueste', gold: 12, vehicle: 'wummser', tip: 'Tiefsand zieht dich runter. Turbo-Streifen helfen.' }, (b) => {
    b.flat(8).surf('sand').flat(8).surf().flat(4).rock(3, 0.9, -0.3).flat(8).surf('boost').flat(5).surf('sand').flat(10).surf().curve(8, 1.5).flat(4).stairs(2, 3.5, 0.6).flat(4).surf('sand').curve(10, -2.5).surf().flat(4).kicker(8, 1.5).gap(8, -1).flat(6);
  }),
  L(43, 'Oase', { theme: 'wueste', gold: 10.5, tip: 'Wasserlöcher im Sand. Brücke und Wippe sind die trockenen Wege.' }, (b) => {
    b.flat(8).curve(8, 1).flat(4).kicker(6, 1).water(7, -1).flat(5).bridge(12, 0, { unten: 'wasser' }).flat(5).surf('sand').flat(4).surf().seesaw(9, { unten: 'wasser' }).flat(5).kicker(6, 1.1).water(8, -0.5).flat(6);
  }),
  L(44, 'Karawane', { theme: 'wueste', gold: 13.5, vehicle: 'brummi', tip: 'Mit dem Brummi die Ladung wegschieben, dann mit dem Floh über die Dünen.' }, (b) => {
    b.flat(10).bridge(14, 0, { density: 90 }).flat(6).crate(3, 0, 1.2).crate(3, 1.2, 1.2).crate(4.4, 0, 1.2).barrel(8, 0).barrel(9.2, 0).flat(14).surf('sand').flat(6).surf().flat(8).swap('strandfloh', 3).flat(8).hill(14, 2).flat(3).kicker(7, 1.3).gap(9, -1).flat(4).hill(12, 1.5).flat(6);
  }),
  L(45, 'Sandsturm', { theme: 'wueste', gold: 9.5, vehicle: 'pritsche', tip: 'Weite Sprünge über die Dünentäler. Turbo vorher mitnehmen.' }, (b) => {
    b.flat(6).surf('boost').flat(6).surf().kicker(8, 1.5).gap(11, -0.5).flat(4).surf('sand').flat(4).surf().curve(10, 2).flat(3).kicker(8, 1.4).gap(10, -1.5).flat(4).fallBridge(12, 4).flat(4).surf('boost').flat(5).surf().kicker(8, 1.6).gap(12, -1).flat(6);
  }),
  // ------------------------------------------------ Hafen
  L(46, 'Kaimauer', { theme: 'hafen', gold: 17.5, tip: 'Container im Weg, Fähre über das Becken. Erst schauen, dann fahren.' }, (b) => {
    b.flat(8).barrel(5, 0).flat(10).stairs(2, 3, 0.6).flat(4).curve(8, -1.2).flat(4).ferry(13, 5.5, 5, { unten: 'wasser', wait: 0.3 }).flat(6).kicker(6, 1).water(7, -0.8).flat(6).crate(4, 0, 0.9).crate(5, 0, 0.9).flat(10);
  }),
  L(47, 'Drehbrücke', { theme: 'hafen', gold: 21, vehicle: 'pritsche', tip: 'Die Drehbrücke kreist. Warte, bis sie flach liegt, dann zügig drüber.' }, (b) => {
    b.flat(10).rotorGap(6, 6.4, 0.35, { unten: 'wasser' }).flat(8).curve(8, 1).flat(4).kicker(7, 1.3).water(9, -1).flat(6).rotorGap(6, 6.4, 0.35, { unten: 'wasser' }).flat(8);
  }),
  L(48, 'Containerstapel', { theme: 'hafen', gold: 18.5, vehicle: 'wummser', tip: 'Containertürme hoch und runter. Große Räder, kleine Schritte.' }, (b) => {
    b.flat(8).stairs(3, 4, 0.7).flat(4).crate(3, 0, 1.2).flat(6).line(8, -2.1).flat(4).box(3.5, 0.6, 3, 1.2, { surface: 'metall' }).flat(10).stairs(2, 4, 0.75).flat(4).curve(10, -1.5).flat(4).kicker(8, 1.5).water(8, -1).flat(6);
  }),
  L(49, 'Ladekran', { theme: 'hafen', gold: 22.5, tip: 'Kranplattformen schaukeln über dem Wasser. Sanft auffahren!' }, (b) => {
    b.flat(8).swingGap(10.5, 6.5, { unten: 'wasser' }).flat(6).elevator(7, 5, 3, 6).flat(6).bridge(12, 0, { unten: 'wasser' }).flat(5).curve(8, -1.5).flat(4).kicker(6, 1).water(7, -1).flat(6);
  }),
  L(50, 'Leinen los!', { theme: 'hafen', gold: 24.5, vehicle: 'brummi', tip: 'Erst mit dem Brummi die Container wegschieben, dann mit dem Floh auf Fähre und Drehbrücke.' }, (b) => {
    b.flat(10).crate(3, 0, 1.2).crate(3, 1.2, 1.2).crate(4.4, 0, 1.2).flat(12).bridge(14, 0, { density: 90, unten: 'wasser' }).flat(6).swap('strandfloh', 3).flat(8).ferry(12, 5, 5, { unten: 'wasser', wait: 0.3 }).flat(6).rotorGap(6, 6.4, 0.35, { unten: 'wasser' }).flat(6).kicker(7, 1.4).water(10, -1).flat(6);
  }),
  // ------------------------------------------------ Bergwerk
  L(51, 'Stollen', { theme: 'mine', gold: 11, tip: 'Niedrige Decke! Nicht zu hoch springen, sonst stößt du dir den Kopf.' }, (b) => {
    b.flat(8).ceiling(2, 26, 3.4).bumps(10, 0.35, 3).flat(4).kicker(4, 0.5).gap(4, -0.5).flat(8).curve(8, -1.5).ceiling(-1, 22, 3.4).flat(4).stairs(2, 3, 0.5).flat(8).kicker(6, 1).gap(6, -1).flat(6);
  }),
  L(52, 'Lorenbahn', { theme: 'mine', gold: 15.5, vehicle: 'pritsche', tip: 'Stahlschienen sind glatt. Aufzug abwarten, Bröckelboden nicht.' }, (b) => {
    b.flat(8).surf('metall').flat(10).surf().elevator(7, 5, 3, 5).flat(6).fallBridge(12, 4).flat(4).surf('metall').curve(10, -2).surf().flat(4).ferry(12, 5.5, 5, { wait: 0.3 }).flat(5).kicker(6, 1).gap(6, -1.5).flat(6);
  }),
  L(53, 'Förderschacht', { theme: 'mine', gold: 20, vehicle: 'wummser', tip: 'Zwei Aufzüge nach oben. Oben angekommen: Gas!' }, (b) => {
    b.flat(8).stairs(2, 3.5, 0.6).flat(4).elevator(8, 5.5, 3, 6).flat(6).rock(3, 0.9, -0.3).flat(8).stairs(3, 3.5, 0.7).flat(6).curve(12, -3).flat(4).kicker(8, 1.5).gap(8, -1).flat(6);
  }),
  L(54, 'Sprengkammer', { theme: 'mine', gold: 16, vehicle: 'strandfloh', tip: 'Federboden, Drehbalken, tiefe Decke: hier zählt Gefühl.' }, (b) => {
    b.flat(8).kicker(6, 1).gap(5, 1).flat(6).rotorGap(6, 6.4, 0.35, {}).flat(6).ceiling(1, 20, 3.2).bumps(8, 0.3, 2).flat(4).kicker(4, 0.5).gap(4, -0.6).flat(6).curve(8, -1.5).flat(8);
  }),
  L(55, 'Glutnest', { theme: 'mine', gold: 13, vehicle: 'brummi', tip: 'Tief unten glüht es. Der Brummi ist schwer, die Bretter halten nicht lange.' }, (b) => {
    b.flat(10).bridge(14, 0, { density: 90, unten: 'lava' }).flat(6).crate(3, 0, 1.2).crate(3, 1.2, 1.2).flat(10).seesaw(14, { limit: 10, density: 14, unten: 'lava' }).flat(8).elevator(8, 6.5, 3, 6, { unten: 'lava' }).flat(6).curve(10, -2).flat(6);
  }),
  // ------------------------------------------------ Mitternacht
  L(56, 'Nachtschicht', { theme: 'nacht', gold: 14, tip: 'Im Dunkeln über die Stadt: Rampen, Brücken, Wippen.' }, (b) => {
    b.flat(8).kicker(6, 1.2).gap(8, -0.5).flat(5).bridge(12, 0).flat(5).seesaw(9).flat(5).surf('boost').flat(5).surf().kicker(7, 1.4).gap(10, -1).flat(5).stairs(2, 3, 0.7).flat(4).kicker(6, 1).gap(7, -1.5).flat(6);
  }),
  L(57, 'Sternschnuppe', { theme: 'nacht', gold: 11, vehicle: 'strandfloh', tip: 'Riesensprünge unter dem Sternenhimmel. Nase leicht unten halten.' }, (b) => {
    b.flat(6).curve(10, 4).flat(4).line(14, -5).kicker(6, 0.8).gap(14, -6).line(16, -4).curve(10, -1).flat(6).hill(12, 1.5).flat(4).kicker(8, 1.4).gap(10, -1).flat(6);
  }),
  L(58, 'Geisterbahn', { theme: 'nacht', gold: 18, vehicle: 'wummser', tip: 'Drehbalken, Wippen und Bröckelboden. Nicht erschrecken!' }, (b) => {
    b.flat(8).rock(4, 0.9, -0.3).flat(8).seesaw(11, { limit: 12 }).flat(5).rotorGap(6, 6.4, 0.35, {}).flat(6).fallBridge(10, 3).flat(4).stairs(2, 3.5, 0.7).flat(4).curve(10, -2).flat(4).kicker(8, 1.5).gap(8, -1).flat(6);
  }),
  L(59, 'Neonmeile', { theme: 'nacht', gold: 12, vehicle: 'pritsche', tip: 'Turbo, Eis und Schlamm im Wechsel. Gefühl schlägt Vollgas.' }, (b) => {
    b.flat(6).surf('boost').flat(6).surf().kicker(8, 1.5).gap(11, -0.5).flat(4).surf('eis').flat(8).surf('schlamm').flat(4).surf().flat(4).ferry(12, 5.5, 5, { wait: 0.3 }).flat(5).surf('boost').flat(5).surf().kicker(7, 1.5).gap(12, -1).flat(4).bridge(12, 0).flat(6);
  }),
  L(60, 'Grenzgänger', { theme: 'nacht', gold: 27, tip: 'Level 60: alle fünf Fahrzeuge, alle Tricks. Respekt, wenn du hier ankommst!' }, (b) => {
    b.flat(8).kicker(6, 1.2).gap(8, -0.5).flat(5).surf('schlamm').flat(4).surf().flat(3).swap('strandfloh', 2).flat(6).surf('feder').flat(3).surf().flat(5).gap(6, 2.5).flat(5).swingGap(9, 6).flat(5).swap('pritsche', 2).flat(6).surf('boost').flat(5).surf().kicker(7, 1.5).gap(12, -1).flat(4).rotorGap(6, 6.4, 0.35, {}).flat(5).swap('brummi', 2).flat(8).bridge(12, 0, { density: 90 }).flat(5).swap('wummser', 2).flat(6).stairs(3, 3.5, 0.75).flat(4).elevator(7, 5, 3, 6).flat(5).kicker(7, 1.4).gap(9, -0.5).flat(6);
  })
];
