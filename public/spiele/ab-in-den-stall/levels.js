// Ab in den Stall! – 30 feste Level in 3 Welten (je 6 Spalten × 9 Reihen, oberste Reihe zuerst).
//
// Zeichen:
//   .  Wiese            T  Baum           H  Heuballen       Z  Zaun
//   W  Bach             B  Brücke         P  Pfütze (nur Ferkel dürfen durch)
//   G  Gatter (zu, antippen = auf)
//   Tiere (klein):  k Küken  s Ferkel  c Kälbchen  l Lämmchen  e Entchen  f Fohlen
//   Zuhause (groß): K Hühnerstall  S Schweinestall  C Kuhstall  L Schafstall  E Teich  F Pferdestall
//
// Jedes Level wird in tests/ab-in-den-stall-sim.test.mjs mit dem Löser aus engine.js geprüft.
export const WORLDS = [
  { id: 1, name: 'Der Bauernhof', from: 1, to: 10 },
  { id: 2, name: 'Am Bach', from: 11, to: 20 },
  { id: 3, name: 'Schlammbad', from: 21, to: 30 }
];

export const LEVELS = [
  // ---------- Welt 1: Der Bauernhof ----------
  { id: 1, title: 'Piep, piep!', tip: { icon: '👆', text: 'Vom Küken zum Stall malen' },
    map: ['..K...', '......', '......', '......', '......', '......', '......', '..k...', '......'] },
  { id: 2, title: 'Um die Ecke', tip: { icon: '↪️', text: 'Der Weg darf Kurven haben' },
    map: ['.....K', '......', '......', '......', '......', '......', '......', 'k.....', '......'] },
  { id: 3, title: 'Das Ferkel', tip: { icon: '🐷', text: 'Jedes Tier hat sein eigenes Haus' },
    map: ['K....S', '......', '......', '......', '......', '......', '......', '.k..s.', '......'] },
  { id: 4, title: 'Heuballen', tip: { icon: '🌾', text: 'Um das Heu herum malen' },
    map: ['..K...', '......', '.HHHH.', '......', '......', '......', '......', '..k...', '......'] },
  { id: 5, title: 'Zwei Küken', tip: { icon: '🐥', text: 'Beide Küken wollen nach Hause' },
    map: ['S...K.', '......', 'ZZZ...', '......', '...ZZZ', '......', '......', '.s..kk', '......'] },
  { id: 6, title: 'Das Kälbchen', tip: { icon: '🐮', text: 'Das Kälbchen wohnt im Kuhstall' },
    map: ['C....K', '......', 'T..T..', '......', '..T..T', '......', '......', 'c....k', '......'] },
  { id: 7, title: 'Das Lämmchen', tip: { icon: '🐑', text: 'Das Lämmchen wohnt im Schafstall' },
    map: ['L..S..', '......', 'HH..HH', '......', '......', '.T..T.', '......', 'l....s', '......'] },
  { id: 8, title: 'Alle vier', tip: { icon: '🏡', text: 'Vier Tiere, vier Häuser' },
    map: ['K.S.CL', '......', '.Z..Z.', '.Z..Z.', '......', 'H....H', '......', 'lcks..', '......'] },
  { id: 9, title: 'Wer zuerst?', tip: { icon: '☝️', text: 'Das vordere Tier zuerst' },
    map: ['K....S', '......', 'ZZ.ZZZ', 'ZZ.ZZZ', 'ZZkZZZ', 'ZZsZZZ', 'ZZ.ZZZ', '......', '......'] },
  { id: 10, title: 'Großer Hof', tip: { icon: '⭐', text: 'Alle Tiere nach Hause bringen' },
    map: ['KLCS..', '......', '..HH..', 'H....H', '...T..', '.T....', '......', 'kslck.', '......'] },

  // ---------- Welt 2: Am Bach ----------
  { id: 11, title: 'Die Brücke', tip: { icon: '🌉', text: 'Über die Brücke laufen' },
    map: ['..K...', '......', '......', '......', 'WWBWWW', '......', '......', '...k..', '......'] },
  { id: 12, title: 'Zwei Brücken', tip: { icon: '🌉', text: 'Welche Brücke ist die richtige?' },
    map: ['S....C', '......', 'WWWWBW', '......', '......', 'BWWWWW', '......', '..s.c.', '......'] },
  { id: 13, title: 'Das Gatter', tip: { icon: '🚪', text: 'Gatter antippen, dann geht es auf' },
    map: ['..L...', '......', 'ZZGZZZ', '......', '......', '......', '..l...', '......', '......'] },
  { id: 14, title: 'Der Teich', tip: { icon: '🦆', text: 'Das Entchen will in den Teich' },
    map: ['....E.', '......', 'ZZZGZZ', '......', '.T..T.', '......', 'k....e', '......', '..K...'] },
  { id: 15, title: 'Tor und Brücke', tip: { icon: '🚪', text: 'Erst das Gatter, dann die Brücke' },
    map: ['C..L..', '......', 'WWWBWW', '......', 'ZGZZZZ', '......', '......', '.c..l.', '......'] },
  { id: 16, title: 'Viele Küken', tip: { icon: '🐥', text: 'Drei Küken, ein Stall' },
    map: ['...K..', '.H..H.', '......', 'H.TT.H', '......', '.Z..Z.', '......', 'k..k.k', '......'] },
  { id: 17, title: 'Bach-Zickzack', tip: { icon: '〰️', text: 'Hin und her über den Bach' },
    map: ['S....C', '.....Z', 'BWWWWW', '......', 'WWWWBW', '......', 'ZZ....', '.s..c.', '......'] },
  { id: 18, title: 'Zwei Gatter', tip: { icon: '🚪', text: 'Jedes Gatter antippen' },
    map: ['L.K...', '......', 'ZZGZZZ', '......', 'ZZZZGZ', '......', '......', '..k.l.', '......'] },
  { id: 19, title: 'Erst das Lämmchen', tip: { icon: '☝️', text: 'Das vordere Tier zuerst' },
    map: ['L....K', '......', 'ZZGZZZ', 'ZZ.ZZZ', 'ZZlZZZ', 'ZZkZZZ', 'ZZ.ZZZ', '......', '......'] },
  { id: 20, title: 'Hof am Bach', tip: { icon: '⭐', text: 'Alle Tiere nach Hause bringen' },
    map: ['K.SL.E', '......', 'WWBWWB', '......', 'ZZZGZZ', '......', '.H..H.', 'ksl.ek', '......'] },

  // ---------- Welt 3: Schlammbad ----------
  { id: 21, title: 'Schlammbad', tip: { icon: '🐷', text: 'Ferkel lieben Pfützen!' },
    map: ['..S...', '......', 'PPPPPP', '......', '......', '......', '..s...', '......', '......'] },
  { id: 22, title: 'Nur für Ferkel', tip: { icon: '💧', text: 'Andere Tiere gehen nicht in Pfützen' },
    map: ['S.....', '......', 'PPPZZZ', '......', '......', '.....K', '......', 'k...s.', '......'] },
  { id: 23, title: 'Das Fohlen', tip: { icon: '🐴', text: 'Das Fohlen wohnt im Pferdestall' },
    map: ['F.....', '......', '.TT.TT', '......', 'TT.TT.', '......', '.....f', '......', '......'] },
  { id: 24, title: 'Pfütze oder Gatter', tip: { icon: '🚪', text: 'Das Fohlen braucht das Gatter' },
    map: ['S..F..', '......', 'WWBWWW', '......', 'PPZGZZ', '......', '......', '.s..f.', '......'] },
  { id: 25, title: 'Enten-Ausflug', tip: { icon: '🦆', text: 'Zwei Entchen, ein Teich' },
    map: ['..E...', '......', 'WWWWBW', '......', '.HPPH.', '.H..H.', '......', 'e....e', '......'] },
  { id: 26, title: 'Der Engpass', tip: { icon: '🐷', text: 'Das Ferkel nimmt die Pfütze' },
    map: ['L....S', '......', 'ZZ.ZPZ', 'ZZlZ.Z', 'ZZkZ.Z', 'ZZ.Z.Z', '......', '....s.', 'K.....'] },
  { id: 27, title: 'Großer Bauernhof', tip: { icon: '🏡', text: 'Sechs Tiere, sechs Häuser' },
    map: ['KSCLEF', '......', 'ZGZZGZ', '......', '.T..T.', '......', '......', 'fkcsle', '......'] },
  { id: 28, title: 'Brücke und Pfützen', tip: { icon: '🌉', text: 'Wer darf durch die Pfütze?' },
    map: ['E.S..F', '......', 'WWBWWW', '......', 'PPPPZG', '......', '......', '.e.sf.', '......'] },
  { id: 29, title: 'Hintereinander', tip: { icon: '☝️', text: 'Immer das vordere Tier zuerst' },
    map: ['K.L..C', '......', 'ZZ.ZZZ', 'ZZcZZZ', 'ZZlZZZ', 'ZZkZZZ', 'ZZZZZZ', 'T....T', '..H...'] },
  { id: 30, title: 'Feierabend', tip: { icon: '🌙', text: 'Alle Tiere ab ins Bett!' },
    map: ['KSCLEF', '......', 'WBWWBW', '......', 'ZGZZPZ', '......', 'TT..TT', '..s.c.', 'kl.e.f'] }
];

export const LEVEL_COUNT = LEVELS.length;
export const worldOf = (id) => WORLDS.find((w) => id >= w.from && id <= w.to) || WORLDS[0];
