// ZAHLENSTURM: Level als reine Daten. Ein Level = Strecke (Tore, Hindernisse, Gegner, Münzen, Boss, Bonus-Sprossen).
// Mit dem kleinen Baukasten (Bau) sind Level kurz notiert; für Level 21–100 genügt es, hier weitere Einträge anzuhängen.
// Prüfung: tools/zahlensturm-bot.mjs löst jedes Level (Lösbarkeit, Torvielfalt, Par-Werte).

export const THEMES = {
  wiese:   { name: 'Sonnenwiese',   sky: [0xbfe6ff, 0xf4fbff], fog: 0xd9f1ff, track: 0xf4f5f7, stripe: 0xe1e5ea, rail: 0x9fb3d1, ground: 0x9ad66b, ground2: 0x7fc455, accent: 0x38bdf8 },
  wueste:  { name: 'Zuckerwüste',   sky: [0xffd9a8, 0xfff2de], fog: 0xffe6c4, track: 0xfff6ec, stripe: 0xf3dfc9, rail: 0xd69a6b, ground: 0xf6c978, ground2: 0xecb25a, accent: 0xff7a59 },
  eis:     { name: 'Eiskristall',   sky: [0xbfeaf5, 0xf0fcff], fog: 0xdaf4fb, track: 0xf1fbff, stripe: 0xd5ecf5, rail: 0x7fb4d6, ground: 0xe4f3fb, ground2: 0xc9e6f5, accent: 0x22d3ee },
  zirkus:  { name: 'Sternenzirkus', sky: [0x8f7cf0, 0xe0c9ff], fog: 0xc0aef5, track: 0xf7f0ff, stripe: 0xe3d6f7, rail: 0x6d4ac2, ground: 0x6a52c9, ground2: 0x5841b0, accent: 0xff5db1 }
};

const EDGE = 5;   // halbe Streckenbreite (Standard)

class Bau {
  constructor(hw = EDGE) { this.hw = hw; this.gates = []; this.obs = []; this.enemies = []; this.coins = []; }
  // Tor-Reihe: ops von links nach rechts, z.B. '+10', '×2', '-5', '÷2'. Breite gleichmäßig, optional x0/x1 für schmalere Reihen
  gate(z, ops, o = {}) {
    const x0 = o.x0 ?? -this.hw, x1 = o.x1 ?? this.hw, w = o.w || ops.map(() => 1);
    const sum = w.reduce((a, b) => a + b, 0);
    const panels = []; let x = x0;
    ops.forEach((t, i) => {
      const m = /^([+\-×÷])(\d+)$/.exec(t); if (!m) throw new Error('Tor ' + t);
      const nx = i === ops.length - 1 ? x1 : x + ((x1 - x0) * w[i]) / sum;
      panels.push({ x0: x, x1: nx, op: m[1], v: +m[2] }); x = nx;
    });
    this.gates.push({ z, panels });
    return this;
  }
  wall(z, x0, x1) { this.obs.push({ type: 'wall', z, x0, x1 }); return this; }
  // Zwei Wände mit einem Durchgang [a, b] dazwischen
  enge(z, a, b) { this.wall(z, -this.hw, a); this.wall(z, b, this.hw); return this; }
  spikes(z, x0, x1, cost) { this.obs.push({ type: 'spikes', z, x0, x1, cost }); return this; }
  pit(z, x0, x1) { this.obs.push({ type: 'pit', z, x0, x1 }); return this; }
  mover(z, cx, amp, half, period, ph = 0) { this.obs.push({ type: 'mover', z, cx, amp, half, period, ph }); return this; }
  rotor(z, cx, len, period, ph = 0) { this.obs.push({ type: 'rotor', z, cx, len, period, ph }); return this; }
  plat(z, cx, amp, pw, period, ph = 0) { this.obs.push({ type: 'plat', z, cx, amp, pw, period, ph }); return this; }
  squad(z, x0, x1, hp, atk) { this.enemies.push({ z, x0, x1, hp, atk: atk ?? Math.round(hp * 0.4) }); return this; }
  // Münzen: Linie von (xa, za) nach (xb, zb) mit n Stück
  line(xa, za, xb, zb, n) { for (let i = 0; i < n; i++) { const t = n === 1 ? 0 : i / (n - 1); this.coins.push([+(xa + (xb - xa) * t).toFixed(2), +(za + (zb - za) * t).toFixed(2)]); } return this; }
  // Münzen in Schlangenlinie um die Mitte cx, Amplitude a
  wave(cx, a, z0, z1, n) { for (let i = 0; i < n; i++) { const t = n === 1 ? 0 : i / (n - 1); this.coins.push([+(cx + a * Math.sin(t * Math.PI * 2)).toFixed(2), +(z0 + (z1 - z0) * t).toFixed(2)]); } return this; }
  ring(cx, z, r, n) { for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; this.coins.push([+(cx + Math.cos(a) * r).toFixed(2), +(z + Math.sin(a) * r * 1.6).toFixed(2)]); } return this; }
}

// Bonus-Sprossen: je Sprosse 2–3 Bahnen mit Faktor. Breite gleichmäßig, Faktoren von links nach rechts.
function sprossen(hw, reihen) {
  return reihen.map((faktoren) => {
    const w = (2 * hw) / faktoren.length;
    return faktoren.map((m, i) => ({ x0: -hw + i * w, x1: i === faktoren.length - 1 ? hw : -hw + (i + 1) * w, m }));
  });
}

// Boss-Stärke: „t“ = ab dieser Gruppengröße gewinnt man den Kampf (hp = t² / (2·atk), siehe sim.js)
const bossHp = (t, atk) => Math.round((t * t) / (2 * atk));

export const BOSS_T = [
  24, 34, 37, 44, 62,
  41, 148, 188, 131, 271,
  150, 329, 302, 285, 324,
  817, 486, 444, 628, 293
];
const BOSS_ATK = (i) => 8 + i * 1.5;

const L = [];
function level(id, name, theme, hw, start, len, bau, bonus, extra = {}) {
  const i = id - 1, atk = Math.round(BOSS_ATK(i)), t = BOSS_T[i];
  L.push({
    id, name, theme, hw, start, len,
    gates: bau.gates, obs: bau.obs, enemies: bau.enemies, coins: bau.coins,
    boss: { z: len, hp: bossHp(t, atk), atk, t, name: extra.boss || 'Zahlenwächter' },
    bonus: sprossen(hw, bonus), hint: extra.hint || '', par: extra.par || 0
  });
}

// ---------------------------------------------------------------- Welt 1: Sonnenwiese (Einstieg)
level(1, 'Erste Schritte', 'wiese', 5, 4, 170, new Bau()
  .gate(28, ['+6', '×2']).gate(58, ['×2', '+5']).gate(88, ['×2', '+10'])
  .wall(112, -5, -1.5).gate(128, ['+5', '+10', '+8']).gate(152, ['+10', '+20'])
  .wave(0, 3, 14, 52, 10).line(3, 70, 3, 100, 6).wave(-2, 2.5, 104, 150, 10),
  [[1, 2], [2, 3], [3, 4]], { hint: 'Zieh den Finger nach links oder rechts und wähle das bessere Tor!' });

level(2, 'Rechenwege', 'wiese', 5, 6, 190, new Bau()
  .gate(26, ['+8', '×2', '+3']).gate(56, ['+10', '×2']).wall(78, -1.5, 5).gate(96, ['+6', '+10']).wall(116, -5, 1.5)
  .gate(136, ['+20', '×2']).gate(162, ['+10', '+5', '+8'])
  .line(-3, 10, 3, 50, 8).wave(2, 2.5, 60, 100, 10).line(-3, 120, -3, 150, 6).wave(0, 3.5, 150, 182, 8),
  [[1, 2], [2, 3], [2, 4]]);

level(3, 'Minus ist gemein', 'wiese', 5, 8, 200, new Bau()
  .gate(24, ['+10', '-5']).gate(50, ['-5', '×2']).gate(76, ['+10', '+6', '-10']).spikes(98, -2, 2, 4)
  .gate(116, ['+12', '+8']).gate(142, ['-10', '+10', '+6']).wall(162, 1, 5).gate(176, ['+8', '+20'])
  .wave(0, 3, 12, 44, 8).line(-3.5, 56, -3.5, 90, 6).line(3.5, 104, 3.5, 135, 6).wave(-1, 3, 150, 192, 10),
  [[1, 2, 1], [2, 3, 2], [1, 3, 5]]);

level(4, 'Der erste Gegner', 'wiese', 5, 10, 210, new Bau()
  .gate(24, ['×2', '+10']).gate(54, ['+15', '×2', '-8']).squad(82, -5, 1, 8, 4).gate(104, ['+12', '+8']).wall(126, -5, 0)
  .gate(144, ['+20', '+12']).squad(166, 0.5, 5, 16, 6).gate(186, ['+10', '+25'])
  .line(3.5, 12, 3.5, 44, 8).wave(0, 3, 58, 100, 10).line(-3.5, 108, -3.5, 138, 6).wave(1, 3, 150, 200, 10),
  [[1, 2], [2, 4], [1, 2, 3]], { hint: 'Gegner kosten Figuren. Weich ihnen aus oder sei stärker.' });

level(5, 'Wackelwand', 'wiese', 5, 12, 220, new Bau()
  .gate(26, ['+10', '×2', '+5']).mover(52, 0, 3.4, 1.6, 3.2).gate(72, ['+8', '-10', '+20']).mover(96, 0, 3, 1.4, 2.6, 1.2)
  .gate(116, ['+25', '×2']).spikes(138, -5, -1, 6).gate(156, ['+15', '+10']).mover(178, 0, 3.4, 1.7, 3, 2.4).gate(196, ['+20', '+12'])
  .wave(0, 3, 10, 48, 9).line(-3, 100, 3, 112, 6).wave(2, 2, 120, 170, 10).line(-3.5, 180, 3.5, 192, 6),
  [[1, 3, 2], [2, 3, 5], [1, 4, 2, 6]]);

// ---------------------------------------------------------------- Welt 2: Zuckerwüste (Entscheidungen)
level(6, 'Sägeblätter', 'wueste', 5, 20, 230, new Bau()
  .gate(24, ['+5', '+15', '×2']).rotor(48, 0, 7, 3).gate(68, ['+20', '+12']).rotor(90, -2.5, 5, 2.4, 1).rotor(90, 2.5, 5, 2.4, 3)
  .gate(112, ['+10', '-10', '+15']).squad(136, -5, 0, 20, 8).gate(158, ['+30', '×2']).rotor(180, 0, 7, 2.8, 2).gate(200, ['+10', '×2'])
  .wave(0, 3, 10, 44, 9).line(0, 52, 0, 64, 5).wave(0, 3.5, 94, 130, 9).wave(2, 3, 162, 196, 9),
  [[1, 2, 3], [3, 5], [2, 4, 3]]);

level(7, 'Geteilt', 'wueste', 5, 24, 240, new Bau()
  .gate(24, ['+10', '×2']).gate(50, ['÷2', '+20', '+12']).wall(72, -1.2, 1.2).gate(92, ['+15', '+10']).gate(112, ['+20', '÷2', '+25'])
  .spikes(136, -5, 0, 10).gate(156, ['×2', '+25']).squad(180, -2, 2, 30, 10).gate(202, ['+20', '÷2', '+30']).gate(222, ['+10', '+25'])
  .line(-3.5, 14, 3.5, 44, 8).line(0, 54, 0, 70, 5).wave(0, 3, 96, 130, 9).wave(0, 3.5, 160, 198, 9),
  [[1, 2], [2, 3, 2], [1, 3, 4]]);

level(8, 'Stachelfeld', 'wueste', 5, 28, 250, new Bau()
  .gate(22, ['×2', '+10']).spikes(44, -2, 2, 8).gate(66, ['+15', '+25', '-10']).spikes(88, -5, -1.5, 10).spikes(88, 1.5, 5, 10)
  .gate(110, ['+30', '+20']).mover(132, 0, 3.2, 1.5, 3).gate(152, ['÷2', '+30', '+40']).squad(176, 0.5, 5, 34, 10).gate(198, ['+30', '+20', '-15'])
  .gate(224, ['+20', '×2']).wave(0, 3.5, 8, 40, 9).line(-3.5, 48, -3.5, 82, 7).line(0, 92, 0, 106, 5).wave(0, 3, 156, 196, 10),
  [[1, 2], [2, 3, 2], [3, 5], [2, 4, 3]]);

level(9, 'Schmaler Grat', 'wueste', 5, 30, 260, new Bau()
  .gate(22, ['+15', '+25']).enge(46, -1.4, 1.4).gate(68, ['+30', '×2', '+20']).pit(92, -5, -2).pit(92, 2, 5).gate(114, ['+40', '-10']).enge(138, -4.2, -1.6)
  .gate(158, ['+30', '+20']).rotor(182, 0, 7, 3, 1).gate(204, ['÷2', '+40', '+30']).squad(228, -5, 1, 42, 12).gate(248, ['×2', '+20'])
  .wave(0, 3.5, 8, 40, 9).line(0, 50, 0, 64, 5).wave(0, 3, 96, 132, 9).line(-2.8, 142, -2.8, 154, 5).wave(0, 3.5, 210, 244, 9),
  [[2, 3, 1], [1, 3, 5], [2, 4, 2], [1, 5, 3]]);

level(10, 'Wanderplattform', 'wueste', 5, 34, 270, new Bau()
  .gate(22, ['×2', '+25', '+10']).plat(48, 0, 3.2, 2.4, 3.6).gate(70, ['+30', '+50']).rotor(94, 0, 7, 3.2).gate(116, ['+30', '-15', '+40'])
  .mover(138, 0, 3.4, 1.6, 2.8).gate(158, ['÷2', '+35', '+45']).squad(182, -5, 0.5, 48, 12).gate(206, ['+60', '+30']).plat(230, 0, 3, 2.2, 3.2, 1.7)
  .gate(250, ['×2', '+40']).wave(0, 3, 8, 44, 9).line(-3, 100, -3, 112, 5).wave(1, 3, 120, 150, 8).wave(0, 3.5, 210, 246, 9),
  [[1, 2, 3], [2, 4, 3], [3, 5, 2], [1, 3, 5, 2]]);

// ---------------------------------------------------------------- Welt 3: Eiskristall (Fortgeschritten)
level(11, 'Glatteis', 'eis', 5, 40, 280, new Bau()
  .gate(22, ['+30', '+50']).gate(44, ['+40', '÷2', '+25']).enge(68, -3, 0.2).gate(90, ['+60', '×2']).mover(112, 0, 3, 1.4, 2.4).gate(132, ['+40', '-20', '+60'])
  .squad(156, -2, 5, 56, 14).gate(180, ['÷2', '+60', '+50']).rotor(204, 0, 7, 2.6, 0.5).gate(228, ['+50', '+70']).spikes(252, -1.5, 1.5, 15).gate(266, ['+40', '+30'])
  .wave(0, 3.5, 8, 40, 9).line(-2, 74, -2, 86, 5).wave(0, 3, 138, 176, 9).wave(0, 3.5, 232, 262, 8),
  [[1, 2, 3], [2, 3, 5], [1, 4, 2], [3, 6]]);

level(12, 'Entscheidung', 'eis', 5, 44, 290, new Bau()
  .gate(22, ['+40', '×2', '+30']).gate(48, ['+50', '÷2', '+70']).wall(70, -5, -1.2).wall(70, 1.2, 5).gate(94, ['+80', '-30']).squad(118, -5, 0, 40, 14)
  .gate(140, ['+40', '+60', '÷2']).gate(160, ['+60', '×2']).mover(184, 0, 3.4, 1.8, 2.8, 1).gate(206, ['+60', '÷3', '+90']).spikes(230, -5, 1, 20).gate(252, ['+70', '+50'])
  .gate(272, ['+40', '+80']).wave(0, 3, 8, 44, 9).line(0, 76, 0, 90, 5).wave(0, 3.5, 144, 180, 9).line(3.2, 232, 3.2, 248, 5).wave(0, 3.5, 256, 286, 8),
  [[1, 3, 2], [2, 4, 3], [1, 5, 2, 4]]);

level(13, 'Doppelkopf', 'eis', 5, 48, 300, new Bau()
  .gate(22, ['+40', '+70']).rotor(44, -2.6, 5.4, 2.2).rotor(44, 2.6, 5.4, 2.2, 2.4).gate(66, ['+80', '-30', '+60']).squad(90, -5, -0.5, 60, 14).squad(90, 0.5, 5, 30, 10)
  .gate(112, ['+90', '+60', '÷2']).enge(136, 0.3, 3.4).gate(158, ['+80', '×2']).mover(182, 0, 3.4, 1.6, 2.4).gate(204, ['÷2', '+100', '+70']).plat(228, 0, 3.2, 2.4, 3).gate(250, ['+70', '+100'])
  .gate(274, ['+60', '+90']).wave(0, 3.5, 8, 40, 9).line(-3, 50, -3, 62, 5).wave(0, 3, 120, 154, 9).wave(0, 3.5, 254, 296, 10),
  [[1, 2, 3], [3, 5, 2], [2, 4, 6, 3]]);

level(14, 'Lawine', 'eis', 5, 52, 310, new Bau()
  .gate(20, ['+40', '+70']).gate(38, ['+80', '+50']).gate(56, ['+60', '÷2']).mover(78, 0, 3.4, 1.6, 2.2, 0.6).gate(98, ['+60', '-50', '+90']).spikes(122, -5, -0.5, 18)
  .gate(144, ['+100', '×2']).squad(168, -1.5, 5, 70, 16).gate(190, ['+90', '÷2', '+70']).rotor(214, 0, 7, 2.4, 1).gate(236, ['+70', '+110']).enge(258, -1.6, 1.6)
  .gate(280, ['+90', '+60']).gate(296, ['+80', '+110']).wave(0, 3.5, 6, 34, 8).line(-3.5, 84, -3.5, 96, 4).wave(0, 3, 148, 186, 9).wave(0, 3.5, 262, 292, 9),
  [[2, 3, 1], [1, 3, 5], [2, 4, 3, 6]]);

level(15, 'Kristallhöhle', 'eis', 5, 56, 320, new Bau()
  .gate(22, ['+60', '+90', '-10']).enge(46, -3.8, -0.6).gate(68, ['+80', '+110', '÷2']).rotor(92, -2.6, 5, 2.2).rotor(92, 2.6, 5, 2.2, 3).gate(114, ['+100', '-60']).squad(138, -5, 1.5, 80, 16)
  .gate(160, ['÷2', '+110', '+80']).plat(184, 0, 3.2, 2.2, 3).gate(206, ['+90', '+120']).mover(230, 0, 3.4, 1.5, 2).gate(252, ['+110', '÷3', '+80']).spikes(276, -3, 3, 25).gate(298, ['+100', '+130'])
  .wave(0, 3.5, 8, 40, 9).line(-2.2, 50, -2.2, 64, 5).wave(0, 3.5, 118, 156, 9).wave(0, 3.5, 212, 248, 9).wave(0, 3, 280, 316, 9),
  [[1, 3, 2], [2, 5, 3], [3, 6, 2, 4]]);

// ---------------------------------------------------------------- Welt 4: Sternenzirkus (Herausforderung)
level(16, 'Torschuss', 'zirkus', 5, 60, 320, new Bau()
  .gate(20, ['+60', '+90']).gate(34, ['+100', '+70']).gate(48, ['÷2', '+90']).gate(62, ['+110', '-60', '+80']).mover(84, 0, 3.4, 1.6, 2.4).gate(104, ['+100', '+140'])
  .gate(118, ['+110', '+80']).squad(142, -5, 0, 90, 18).gate(164, ['+120', '÷2', '+100']).rotor(188, 0, 7, 2.4).gate(210, ['+140', '-80']).gate(224, ['+110', '+130'])
  .spikes(248, -1.5, 5, 25).gate(270, ['+110', '+150']).gate(290, ['÷2', '+120']).wave(0, 3.5, 6, 30, 7).line(0, 90, 0, 100, 4).wave(0, 3.5, 168, 206, 9).wave(0, 3.5, 274, 306, 9),
  [[1, 2, 3], [2, 4, 6, 3], [2, 5, 3, 7]]);

level(17, 'Manege', 'zirkus', 5, 64, 330, new Bau()
  .gate(22, ['+80', '+140', '+110']).rotor(44, 0, 7, 2.6).gate(64, ['+110', '÷2', '+140']).enge(86, 1, 3.2).gate(106, ['+120', '+90']).squad(130, -2.5, 5, 100, 18)
  .gate(152, ['+130', '-60', '+110']).mover(176, 0, 3.6, 1.6, 2).gate(196, ['÷2', '+140', '+110']).plat(220, 0, 3.4, 2, 2.8).gate(242, ['+120', '+160']).spikes(266, -5, 2, 30).gate(288, ['+110', '+170']).gate(308, ['+100', '+140'])
  .wave(0, 3.5, 8, 40, 9).line(2.2, 90, 2.2, 102, 4).wave(0, 3.5, 110, 150, 9).wave(0, 3.5, 246, 284, 9).wave(0, 3.5, 292, 326, 8),
  [[1, 3, 2], [2, 4, 3, 5], [3, 6, 2, 8]]);

level(18, 'Seiltanz', 'zirkus', 4.2, 68, 340, new Bau(4.2)
  .gate(22, ['+90', '+140']).enge(44, -1.6, 1.6).gate(66, ['+110', '+150']).rotor(88, 0, 7, 2.2).gate(110, ['+120', '-80', '+160']).squad(134, -4.2, 0.5, 110, 20).gate(156, ['+170', '+120'])
  .pit(180, -4.2, -1.8).gate(200, ['÷2', '+150', '+180']).mover(224, 0, 2.8, 1.4, 2.2).gate(246, ['+140', '+190']).plat(270, 0, 2.6, 1.8, 3).gate(292, ['+170', '+130']).spikes(316, -1.2, 1.2, 40).gate(332, ['+150', '+200'])
  .wave(0, 3, 8, 40, 9).wave(0, 3, 114, 150, 9).wave(0, 3, 204, 240, 9).wave(0, 3, 296, 328, 8),
  [[1, 3, 2], [2, 4, 3], [3, 5, 2, 7]]);

level(19, 'Feuerwerk', 'zirkus', 5, 72, 350, new Bau()
  .gate(22, ['+100', '+140', '÷2']).gate(36, ['+130', '+90']).gate(50, ['+110', '-70', '+150']).rotor(72, -2.6, 5.4, 2.2).rotor(72, 2.6, 5.4, 2.2, 3).gate(94, ['+160', '+120']).squad(118, 0.5, 5, 130, 22).squad(118, -5, -0.5, 60, 12)
  .gate(140, ['÷2', '+180', '+140']).mover(164, 0, 3.6, 1.6, 2).gate(186, ['+150', '-90', '+190']).enge(210, -3.6, -0.4).gate(232, ['+170', '+130']).plat(256, 0, 3.4, 2, 2.6).gate(278, ['+140', '+200']).spikes(302, -5, 0.5, 40).gate(324, ['+160', '+120']).gate(340, ['+130', '+180'])
  .wave(0, 3.5, 8, 30, 7).wave(0, 3.5, 98, 136, 9).wave(0, 3.5, 236, 274, 9).wave(0, 3.5, 306, 348, 9),
  [[1, 3, 2], [2, 4, 6, 3], [3, 6, 2, 8], [2, 5, 3, 9]]);

level(20, 'Das große Finale', 'zirkus', 5, 80, 360, new Bau()
  .gate(22, ['+120', '+140', '+160']).gate(36, ['+150', '+110', '÷2']).rotor(58, 0, 7, 2.4).gate(80, ['+170', '-100']).enge(102, -1.4, 1.4).gate(122, ['+180', '+140', '+200']).squad(146, -5, 0, 140, 22)
  .gate(168, ['÷2', '+200', '+160']).mover(192, 0, 3.6, 1.6, 2).gate(214, ['+170', '-110', '+210']).plat(238, 0, 3.4, 2, 2.4).gate(260, ['+190', '+150']).spikes(284, -5, 1.5, 50).gate(306, ['+170', '+220']).rotor(330, 0, 7, 2.2, 1).gate(346, ['+190', '+150'])
  .wave(0, 3.5, 8, 30, 7).wave(0, 3.5, 126, 160, 8).wave(0, 3.5, 216, 256, 9).wave(0, 3.5, 310, 356, 10),
  [[1, 3, 2], [2, 4, 3, 5], [3, 6, 2, 8], [2, 5, 3, 9], [4, 10, 5]], { boss: 'Der große Zahlenwächter' });

export const LEVELS = L;
export const LEVEL_BY_ID = Object.fromEntries(L.map((l) => [l.id, l]));

// Par-Werte (Figuren am Ziel für den dritten Stern) werden vom Lösungs-Bot berechnet und in par.js abgelegt.
import { PAR } from './par.js';
for (const l of L) l.par = PAR[l.id] || 0;
