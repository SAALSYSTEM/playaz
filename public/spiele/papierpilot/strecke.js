// PAPIERPILOT: Hindernistypen und Streckenabschnitte (alle Angaben in Metern).
// Wird von sim.js (Regeln) und game.js (Darstellung) gemeinsam genutzt.
// Koordinaten: x = seitlich (links negativ), z = Flugrichtung, y = Höhe über dem Boden.
// Fliegbarer Korridor: |x| <= 11 m. Alles mit |x| >= 15 m ist reine Kulisse.

// Kollision: rund = Säule mit Radius r; kasten = Quader mit halber Breite hx und halber Tiefe hz.
// h = Kollisionshöhe (darüber kann man hinwegfliegen). Bewusst etwas kleiner als das Bild (fair).
// bildH = Höhe der Grafik im Spiel; die Breite ergibt sich aus dem Seitenverhältnis des Bildes.
export const TYPEN = {
  baum:     { bild: 'baum-rund',     bildH: 7.0,  form: 'rund',   r: 2.5, h: 6.3 },
  zypresse: { bild: 'baum-zypresse', bildH: 12.5, form: 'rund',   r: 1.0, h: 11.5 },
  haus:     { bild: 'haus',          bildH: 9.7,  form: 'kasten', hx: 4.4, hz: 2.0, h: 9.0 },
  turm:     { bild: 'turm',          bildH: 23.5, form: 'kasten', hx: 2.2, hz: 2.2, h: 20.5 }
};

export const LAENGE = 40;   // Länge eines Abschnitts

// o: [typ, x, z]   a: Aufwind [x, zAnfang, Länge]   r: Ring [x, y, z]   (z relativ zum Abschnitt)
export const ABSCHNITTE = {
  start:    { o: [['haus', -8, 10], ['haus', 8, 22], ['haus', -2, 36]], a: [[-5, 16, 14]], r: [[-5, 15, 14]] },
  allee:    { o: [['baum', -7, 8], ['baum', 7, 8], ['baum', -7, 24], ['baum', 7, 24], ['zypresse', 0, 32]], a: [[0, 8, 14]], r: [[0, 13, 8]] },
  turm:     { o: [['turm', 0, 18], ['baum', 8, 6], ['baum', -9.5, 34]], a: [[-5, 22, 14]], r: [[-5, 12, 22]] },
  slalom:   { o: [['zypresse', -4, 6], ['zypresse', 4, 16], ['zypresse', -4, 26], ['zypresse', 4, 36]], a: [[7, 4, 12]], r: [[0, 11, 21]] },
  lichtung: { o: [['baum', -9, 12], ['baum', 9, 22]], a: [[2, 6, 16], [-6, 30, 10]], r: [[2, 12, 6]] },
  tuerme:   { o: [['turm', -5, 10], ['turm', 5, 28], ['zypresse', 6, 12]], a: [[-1, 14, 12]], r: [[0, 11, 19]] },
  hecke:    { o: [['baum', -9, 20], ['baum', -3.5, 20], ['baum', 8.5, 20], ['zypresse', -8, 36]], a: [[3, 24, 12]], r: [[2.5, 10, 20]] },
  haeuser:  { o: [['haus', -6, 10], ['haus', 6, 26], ['baum', -8, 36]], a: [[0, 30, 10]], r: [[0, 11, 30]] }
};

// Teststrecke für V1 (fest). "-" vor dem Namen = gespiegelt (x * -1).
export const TESTSTRECKE = ['start', 'allee', 'turm', 'slalom', 'lichtung', 'tuerme', 'hecke', 'haeuser',
  '-allee', '-turm', '-slalom', '-lichtung', '-tuerme', '-hecke', '-haeuser'];

// Strecke als flache Listen mit absoluten Koordinaten (Meter), nach z sortiert.
export function baueStrecke(namen) {
  const o = [], a = [], r = [];
  namen.forEach((n, i) => {
    const sp = n[0] === '-' ? -1 : 1, ab = ABSCHNITTE[sp < 0 ? n.slice(1) : n], z0 = i * LAENGE;
    for (const [t, x, z] of ab.o) o.push({ t, x: x * sp, z: z0 + z });
    for (const [x, z, l] of ab.a) a.push({ x: x * sp, z: z0 + z, l });
    for (const [x, y, z] of ab.r) r.push({ x: x * sp, y, z: z0 + z });
  });
  const nachZ = (p, q) => p.z - q.z;
  return { o: o.sort(nachZ), a: a.sort(nachZ), r: r.sort(nachZ), laenge: namen.length * LAENGE };
}
