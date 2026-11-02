// PUTT-PROFI: die 18 Bahnen in 3 Welten. Jede Bahn ist ein Raster aus Feldern (oben = Norden = vom Spieler weg).
// Die Banden setzt logik.js automatisch: Wo kein Nachbarfeld ist, steht eine Bande.
//   #  Bahn         T  Abschlag      H  Loch (Sackgasse oder freie Fläche)     r  runde Kurve (nur in Ecken)
//   Nur in geraden Stücken:  k Block · n/m/v Engstelle (eckig/rund/schräg) · C Burg · W Windmühle · U/V/D Tunnel (eng/breit/doppelt)
//                            g Graben · s Trennwand · b Buckel · h Hügel · q Plateau
//   Nur auf freien Flächen:  x Raute · y Dreiecke · o Kuppe · u Mulde
export const WELTEN = [
  { id: 'wiese', name: 'Sommerwiese', textur: 'colormap', himmel: ['#8fd3ff', '#e8f7ff'], boden: '#5d9e4c', licht: 0xfff4e0 },
  { id: 'burg', name: 'Burgberg', textur: 'colormap', himmel: ['#ffc58a', '#fff0d6'], boden: '#8aa04a', licht: 0xffe2bd },
  { id: 'muehle', name: 'Mühlental', textur: 'colormap', himmel: ['#5b4a9e', '#ffb07a'], boden: '#4f7a45', licht: 0xffc9a8 },
];

export const BAHNEN = [
  // ---------- Sommerwiese ----------
  { name: 'Erster Putt', welt: 0, par: 2, karte: [
    'H',
    '#',
    '#',
    '#',
    '#',
    'T'] },
  { name: 'Um die Ecke', welt: 0, par: 2, karte: [
    'H#r',
    '..#',
    '..#',
    '..#',
    '..T'] },
  { name: 'Hügelchen', welt: 0, par: 2, karte: [
    'H',
    '#',
    'h',
    '#',
    '#',
    'T'] },
  { name: 'Diamant', welt: 0, par: 2, karte: [
    '.H.',
    '###',
    '#x#',
    '###',
    '.#.',
    '.T.'] },
  { name: 'Zickzack', welt: 0, par: 3, karte: [
    'H#r',
    '..#',
    'r#r',
    '#..',
    'T..'] },
  { name: 'Dellen-Allee', welt: 0, par: 2, karte: [
    '.H.',
    '###',
    '#u#',
    '###',
    '#o#',
    '###',
    '.T.'] },
  // ---------- Burgberg ----------
  { name: 'Burgtor', welt: 1, par: 2, karte: [
    'H',
    '#',
    'C',
    '#',
    '#',
    'T'] },
  { name: 'Engpass', welt: 1, par: 2, karte: [
    'H##r',
    '...n',
    '...#',
    '...m',
    '...#',
    '...T'] },
  { name: 'Tunnelwahl', welt: 1, par: 3, karte: [
    '..H..',
    'r###r',
    '#...#',
    'U...D',
    '#...#',
    'r#T#r'] },
  { name: 'Burggraben', welt: 1, par: 2, karte: [
    'H',
    '#',
    'g',
    '#',
    '#',
    'T'] },
  { name: 'Hindernislauf', welt: 1, par: 2, karte: [
    '.H.',
    '###',
    '#y#',
    '###',
    '.k.',
    '.#.',
    '.T.'] },
  { name: 'Schlängelburg', welt: 1, par: 3, karte: [
    'r#H',
    '#..',
    '#..',
    'r#r',
    '..C',
    '..#',
    '..T'] },
  // ---------- Mühlental ----------
  { name: 'Die Mühle', welt: 2, par: 2, karte: [
    'H',
    '#',
    'W',
    '#',
    '#',
    'T'] },
  { name: 'Zweibahn', welt: 2, par: 2, karte: [
    'H',
    '#',
    's',
    's',
    '#',
    'T'] },
  { name: 'Hügelland', welt: 2, par: 3, karte: [
    '..H',
    '..#',
    'r#r',
    'q..',
    '#..',
    'h..',
    'T..'] },
  { name: 'Mühlenkurve', welt: 2, par: 3, karte: [
    'r#W#H',
    '#....',
    '#....',
    '#....',
    'T....'] },
  { name: 'Bunte Mitte', welt: 2, par: 2, karte: [
    '..H..',
    '#####',
    '#y#x#',
    '#####',
    '##o##',
    '#####',
    '..T..'] },
  { name: 'Großes Finale', welt: 2, par: 4, karte: [
    'H#r',
    '..#',
    '..W',
    '..#',
    'r#r',
    '#..',
    'h..',
    '#..',
    'r#r',
    '..C',
    '..#',
    '..T'] },
];
