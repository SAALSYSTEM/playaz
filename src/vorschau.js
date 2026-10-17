// BlockSaal: Vorschaubilder als PNG, ganz ohne Abhängigkeiten (läuft im Worker und in Node).
//   renderVorschau(n)  1200 × 630 für Link-Vorschauen (WhatsApp, iMessage, Facebook ...) mit der Reihenzahl groß im Bild
//   renderKachel()     960 × 600 Kachelbild für die Startseite (tools/blocksaal-bilder.mjs schreibt es nach public/bilder/)
// Bewusst Pixel-Optik: harte Kanten, 30 Farben, daher nur wenige KB groß und ohne Schrift-Dateien lesbar.
// Die Spielsteinfarben kommen aus der Engine, damit Spiel und Bild zusammenpassen.
import Engine from '../public/spiele/blocksaal/engine.js';

export const W = 1200, H = 630;
export const KACHEL_W = 960, KACHEL_H = 600;

// ---------- Palette ----------
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => a.map((c, i) => Math.round(c + (b[i] - c) * t));
const FARBEN = {
  BG: hex('#11121A'), FELD: hex('#0B0C12'), RASTER: hex('#1E2030'), GELB: hex('#FFD21C'), ORANGE: hex('#FF9200'),
  WEISS: hex('#F6F7F9'), GRAU: hex('#B6B9C8'), RAHMEN: hex('#2B2D3E'), DIM: hex('#161722')
};
const NAMEN = Object.keys(FARBEN);
const C = Object.fromEntries(NAMEN.map((k, i) => [k, i]));
const PALETTE = NAMEN.map((k) => FARBEN[k]);
const STEIN = [];   // je Spielstein: [Grundfarbe, hell, dunkel] als Palettenindex
Engine.COLORS.forEach((h) => {
  const base = hex(h), i = PALETTE.length;
  PALETTE.push(base, mix(base, [255, 255, 255], 0.38), mix(base, [0, 0, 0], 0.5));
  STEIN.push([i, i + 1, i + 2]);
});

// ---------- Pixelschrift 5 × 7 (Großbuchstaben, Ziffern, ein paar Zeichen) ----------
const GLYPHEN = {
  A: '.###.|#...#|#...#|#####|#...#|#...#|#...#', B: '####.|#...#|#...#|####.|#...#|#...#|####.',
  C: '.###.|#...#|#....|#....|#....|#...#|.###.', D: '####.|#...#|#...#|#...#|#...#|#...#|####.',
  E: '#####|#....|#....|####.|#....|#....|#####', F: '#####|#....|#....|####.|#....|#....|#....',
  G: '.###.|#...#|#....|#.###|#...#|#...#|.####', H: '#...#|#...#|#...#|#####|#...#|#...#|#...#',
  I: '.###.|..#..|..#..|..#..|..#..|..#..|.###.', J: '..###|...#.|...#.|...#.|...#.|#..#.|.##..',
  K: '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#', L: '#....|#....|#....|#....|#....|#....|#####',
  M: '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#', N: '#...#|##..#|#.#.#|#..##|#...#|#...#|#...#',
  O: '.###.|#...#|#...#|#...#|#...#|#...#|.###.', P: '####.|#...#|#...#|####.|#....|#....|#....',
  Q: '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#', R: '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
  S: '.####|#....|#....|.###.|....#|....#|####.', T: '#####|..#..|..#..|..#..|..#..|..#..|..#..',
  U: '#...#|#...#|#...#|#...#|#...#|#...#|.###.', V: '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..',
  W: '#...#|#...#|#...#|#.#.#|#.#.#|##.##|#...#', X: '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
  Y: '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..', Z: '#####|....#|...#.|..#..|.#...|#....|#####',
  0: '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.', 1: '..#..|.##..|..#..|..#..|..#..|..#..|.###.',
  2: '.###.|#...#|....#|...#.|..#..|.#...|#####', 3: '.###.|#...#|....#|..##.|....#|#...#|.###.',
  4: '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.', 5: '#####|#....|####.|....#|....#|#...#|.###.',
  6: '..##.|.#...|#....|####.|#...#|#...#|.###.', 7: '#####|....#|...#.|..#..|.#...|.#...|.#...',
  8: '.###.|#...#|#...#|.###.|#...#|#...#|.###.', 9: '.###.|#...#|#...#|.####|....#|...#.|.##..',
  '?': '.###.|#...#|....#|...#.|..#..|.....|..#..', '.': '.....|.....|.....|.....|.....|.....|..#..',
  '-': '.....|.....|.....|#####|.....|.....|.....', ' ': '.....|.....|.....|.....|.....|.....|.....'
};
const G = Object.fromEntries(Object.entries(GLYPHEN).map(([k, v]) => [k, v.split('|').join('')]));
const UML = { 'Ä': 'A', 'Ö': 'O', 'Ü': 'U' };

class Bild {
  constructor(w, h) { this.w = w; this.h = h; this.stride = w + 1; this.buf = new Uint8Array(this.stride * h); }
  klon() { const b = new Bild(this.w, this.h); b.buf.set(this.buf); return b; }
  rect(x, y, w, h, c) {
    const x0 = Math.max(0, x), x1 = Math.min(this.w, x + w), y0 = Math.max(0, y), y1 = Math.min(this.h, y + h);
    if (x1 <= x0) return;
    for (let yy = y0; yy < y1; yy++) { const o = yy * this.stride + 1 + x0; this.buf.fill(c, o, o + (x1 - x0)); }
  }
  rahmen(x, y, w, h, d, c) { this.rect(x, y, w, d, c); this.rect(x, y + h - d, w, d, c); this.rect(x, y, d, h, c); this.rect(x + w - d, y, d, h, c); }
  // Spielstein mit Kante: dunkler Rand, Farbfläche, helle obere und linke Kante
  stein(x, y, s, i) {
    const [base, hell, dunkel] = STEIN[i], b = Math.max(2, Math.round(s * 0.1));
    this.rect(x, y, s, s, dunkel);
    this.rect(x + b, y + b, s - 2 * b, s - 2 * b, base);
    this.rect(x + b, y + b, s - 2 * b, b, hell);
    this.rect(x + b, y + b, b, s - 2 * b, hell);
  }
  // Text mit Oberkante y (Umlautpunkte liegen darüber); gibt das Ende zurück
  text(str, x, y, s, c) {
    let cx = x;
    for (const ch of str) {
      const base = UML[ch] || ch, g = G[base] || G['?'];
      for (let r = 0; r < 7; r++) for (let q = 0; q < 5; q++) if (g[r * 5 + q] === '#') this.rect(cx + q * s, y + r * s, s, s, c);
      if (UML[ch]) { this.rect(cx + s, y - 2 * s, s, s, c); this.rect(cx + 3 * s, y - 2 * s, s, s, c); }
      cx += 6 * s;
    }
    return cx;
  }
}
export const textBreite = (str, s) => (str.length * 6 - 1) * s;

// ---------- PNG ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function chunk(type, data) {
  const out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
async function deflate(bytes) {
  const cs = new CompressionStream('deflate');   // zlib-Format, wie PNG es verlangt
  const w = cs.writable.getWriter();
  w.write(bytes); w.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}
async function png(bild) {
  const ihdr = new Uint8Array(13), dv = new DataView(ihdr.buffer);
  dv.setUint32(0, bild.w); dv.setUint32(4, bild.h); ihdr[8] = 8; ihdr[9] = 3;   // 8 Bit, Palette
  const plte = new Uint8Array(PALETTE.length * 3);
  PALETTE.forEach((c, i) => plte.set(c, i * 3));
  const teile = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('PLTE', plte), chunk('IDAT', await deflate(bild.buf)), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(teile.reduce((s, t) => s + t.length, 0));
  let o = 0; for (const t of teile) { out.set(t, o); o += t.length; }
  return out;
}

// ---------- Motiv: Spielfeld mit Stapel, fallender Stange und Landeschatten ----------
// Buchstabe = Spielstein (Reihenfolge wie Engine.TYPES), Punkt = leer. Rechts bleibt ein Schacht für die Stange frei.
const STAPEL = [
  '..........', '..........', '..........', '..........', '..........', '..........', '..........',
  '......T...',
  '.OO..ZZ...',
  '.O..SSJJ..',
  'OOZZSSLLT.',
  'JJZZTTSSL.',
  'JIIIITLLL.',
  'ZZOOSSJJJ.'
];
function motiv(b, x0, y0, z) {
  const cols = 10, rows = STAPEL.length;
  b.rect(x0 - 6, y0 - 6, cols * z + 12, rows * z + 12, C.RAHMEN);
  b.rect(x0, y0, cols * z, rows * z, C.FELD);
  for (let i = 1; i < cols; i++) b.rect(x0 + i * z, y0, 1, rows * z, C.RASTER);
  for (let i = 1; i < rows; i++) b.rect(x0, y0 + i * z, cols * z, 1, C.RASTER);
  STAPEL.forEach((zeile, r) => [...zeile].forEach((ch, q) => { if (ch !== '.') b.stein(x0 + q * z, y0 + r * z, z, Engine.TYPES.indexOf(ch)); }));
  const stange = Engine.TYPES.indexOf('I');
  b.rahmen(x0 + 9 * z + 3, y0 + (rows - 4) * z + 3, z - 6, 4 * z - 6, 3, STEIN[stange][0]);   // Landeschatten im Schacht
  for (let r = 0; r < 4; r++) b.stein(x0 + 9 * z, y0 + (1 + r) * z, z, stange);               // fallende Stange
}
// Einzelnes Teil in beliebiger Drehung, links oben bei (x, y)
function teil(b, typ, rot, x, y, z) {
  Engine.SHAPES[typ][rot].forEach(([cx, cy]) => b.stein(x + cx * z, y + cy * z, z, Engine.TYPES.indexOf(typ)));
}

// ---------- Vorschau für Herausforderungslinks ----------
const vorlage = (() => {
  const b = new Bild(W, H);
  b.rect(0, 0, W, H, C.BG);
  motiv(b, 76, 55, 38);
  b.text('BLOCK', 540, 62, 8, C.WEISS);
  b.text('SAAL', 540 + 5 * 6 * 8, 62, 8, C.ORANGE);
  b.rect(540, 138, 424, 8, C.ORANGE);
  b.text('SCHLÄGST DU MICH?', 540, 506, 6, C.GELB);
  b.text('PLAYSAAL.COM', 540, 576, 4, C.GRAU);
  return b;
})();

export async function renderVorschau(n) {
  const rows = Math.max(0, Math.min(Engine.MAX_CHALLENGE, Math.floor(Number(n) || 0)));
  const b = vorlage.klon();
  const zahl = String(rows), s = 30;
  b.text(zahl, 540 + 6, 182 + 6, s, C.ORANGE);   // Schatten
  b.text(zahl, 540, 182, s, C.WEISS);
  b.text(rows === 1 ? 'REIHE GESCHAFFT' : 'REIHEN GESCHAFFT', 540, 424, 6, C.ORANGE);
  return png(b);
}

// ---------- Kachelbild für die Startseite ----------
export async function renderKachel() {
  const b = new Bild(KACHEL_W, KACHEL_H);
  b.rect(0, 0, KACHEL_W, KACHEL_H, C.BG);
  // Hintergrund: dezente Fliesen
  for (let gy = 0; gy < 15; gy++) for (let gx = 0; gx < 24; gx++) if ((gx * 7 + gy * 13 + gx * gy) % 5 === 0) b.rect(gx * 40 + 2, gy * 40 + 2, 36, 36, C.DIM);
  motiv(b, 310, 96, 34);
  const mitte = Math.round((KACHEL_W - textBreite('BLOCKSAAL', 8)) / 2);
  b.rect(mitte - 18, 24, textBreite('BLOCKSAAL', 8) + 36, 70, C.BG);
  b.text('BLOCK', mitte, 32, 8, C.WEISS);
  b.text('SAAL', mitte + 5 * 6 * 8, 32, 8, C.ORANGE);
  teil(b, 'L', 1, 64, 150, 44);
  teil(b, 'S', 0, 76, 420, 40);
  teil(b, 'T', 2, 716, 190, 44);
  teil(b, 'J', 0, 724, 440, 40);
  return png(b);
}
