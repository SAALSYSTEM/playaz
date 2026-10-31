// Tiertrumpf: Regeln für zwei Spieler (0 = Kind, 1 = Fuchs Fiete). Kein DOM. Die KI sieht nur die eigene Hand und offene Karten.
export const COLORS = ['red', 'blue', 'green', 'yellow'];
// Jedes Tier hat eine feste Zahl (Position + 1): Elefant 1, Panda 2, Frosch 3, Katze 4, Löwe 5, Hase 6.
export const ANIMALS = ['elephant', 'panda', 'frog', 'cat', 'lion', 'rabbit'];
export const number = (value) => ANIMALS.indexOf(value) + 1;

export function deck(level) {
  const cards = [];
  const add = (color, value) => cards.push({ id: cards.length, color, value });
  for (const c of COLORS) {
    for (const a of ANIMALS) { add(c, a); add(c, a); }
    if (level === 3) { add(c, 'skip'); add(c, 'draw1'); }
  }
  if (level >= 2) for (let i = 0; i < 4; i++) add('wild', 'wild');
  return cards;
}

export function shuffle(cards, random = Math.random) {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

export function create(level = 1, random = Math.random) {
  if (![1, 2, 3].includes(level)) throw new Error('Invalid level');
  const pile = shuffle(deck(level), random);
  const hands = [pile.splice(0, 5), pile.splice(0, 5)];
  // Die erste offene Karte ist immer eine Tierkarte (keine Sonderkarte zum Start).
  const first = pile.findIndex((c) => ANIMALS.includes(c.value));
  const discard = pile.splice(first, 1);
  return { version: 1, level, pile, hands, discard, color: discard[0].color,
    turn: 0, drawn: null, winner: null, passes: 0, moves: 0, event: 'start', last: null };
}

export function matches(state, card) {
  return card.value === 'wild' || card.color === state.color || card.value === state.discard.at(-1).value;
}

export function legal(state) {
  if (state.winner !== null) return [];
  return state.hands[state.turn].filter((c) => matches(state, c) &&
    (state.drawn === null || c.id === state.drawn)).map((c) => c.id);
}

function take(state, random) {
  if (!state.pile.length && state.discard.length > 1) {
    const top = state.discard.pop();
    state.pile = shuffle(state.discard, random);
    state.discard = [top];
  }
  return state.pile.pop() || null;
}

function endTurn(s) { s.turn = 1 - s.turn; s.drawn = null; s.moves++; }

// s.last beschreibt den letzten Schritt für die Oberfläche (Animation, Ansage). Für die Regeln ohne Bedeutung.
export function play(s, id, color, random = Math.random) {
  if (!legal(s).includes(id)) return false;
  const hand = s.hands[s.turn];
  const index = hand.findIndex((c) => c.id === id), card = hand[index];
  const lastCard = hand.length === 1;
  // Farbwechsel als letzte Karte: Die Runde ist sofort vorbei, eine Farbwahl ist nicht nötig.
  if (card.value === 'wild' && !COLORS.includes(color)) {
    if (!lastCard) return false;
    color = s.color;
  }
  const who = s.turn;
  hand.splice(index, 1); s.discard.push(card);
  s.color = card.value === 'wild' ? color : card.color;
  s.drawn = null; s.passes = 0; s.moves++; s.event = card.value;
  s.last = { who, type: 'play', card: card.id, extra: null };
  // Leere Hand gewinnt sofort, auch nach einer Sonderkarte (deren Wirkung entfällt dann).
  if (!hand.length) { s.winner = who; return true; }
  if (card.value === 'draw1') {
    // Der andere zieht genau eine Karte und setzt aus. Kein Stapeln.
    const extra = take(s, random);
    if (extra) { s.hands[1 - who].push(extra); s.last.extra = extra.id; }
  } else if (card.value !== 'skip') s.turn = 1 - who;
  return true;
}

// Ziehen nur, wenn nichts passt. Passt die gezogene Karte, darf (nur) sie sofort gelegt oder behalten werden.
export function draw(s, random = Math.random) {
  if (s.winner !== null || s.drawn !== null || legal(s).length) return false;
  const who = s.turn;
  const card = take(s, random); s.event = 'draw';
  if (!card) {
    s.passes++; s.event = 'pass'; s.last = { who, type: 'empty', card: null, extra: null }; endTurn(s);
    if (s.passes >= 2) { s.winner = 'tie'; s.event = 'tie'; }
    return true;
  }
  s.passes = 0; s.hands[who].push(card);
  const fits = matches(s, card);
  s.last = { who, type: 'draw', card: card.id, extra: null, fits };
  if (fits) s.drawn = card.id;
  else endTurn(s);
  return true;
}

// Gezogene, passende Karte behalten: Zug endet.
export function pass(s) {
  if (s.winner !== null || s.drawn === null) return false;
  s.event = 'pass'; s.last = { who: s.turn, type: 'keep', card: s.drawn, extra: null }; endTurn(s); return true;
}

export function bestColor(hand) {
  const counts = Object.fromEntries(COLORS.map((c) => [c, hand.filter((k) => k.color === c).length]));
  return COLORS.reduce((a, b) => (counts[b] > counts[a] ? b : a));
}

// Fiete: legt bevorzugt eine Karte seiner häufigsten Farbe, hebt Farbwechsel auf. Gezogene passende Karten legt er immer.
export function ai(s, random = Math.random) {
  if (s.winner !== null) return false;
  const ids = legal(s);
  if (!ids.length) return draw(s, random);
  const hand = s.hands[s.turn];
  const counts = Object.fromEntries(COLORS.map((c) => [c, hand.filter((k) => k.color === c).length]));
  const options = hand.filter((c) => ids.includes(c.id));
  options.sort((a, b) => (b.value !== 'wild') - (a.value !== 'wild') || (counts[b.color] || 0) - (counts[a.color] || 0));
  const card = options[0];
  return play(s, card.id, bestColor(hand.filter((c) => c.id !== card.id)), random);
}

// Strenges Laden: Jede Karte muss genau einmal mit ihrer ursprünglichen Identität vorkommen.
// Nimmt einen JSON-Text oder ein bereits gelesenes Objekt; liefert eine unabhängige Kopie oder null.
export function restore(raw) {
  try {
    const s = typeof raw === 'string' ? JSON.parse(raw) : JSON.parse(JSON.stringify(raw));
    if (!s || s.version !== 1 || ![1, 2, 3].includes(s.level) || ![0, 1].includes(s.turn) ||
      !COLORS.includes(s.color) || ![null, 0, 1, 'tie'].includes(s.winner) ||
      !Array.isArray(s.hands) || s.hands.length !== 2 || !s.hands.every(Array.isArray) ||
      !Array.isArray(s.pile) || !Array.isArray(s.discard) || !s.discard.length ||
      !Number.isInteger(s.passes) || s.passes < 0 || s.passes > 2 ||
      !Number.isInteger(s.moves) || s.moves < 0) return null;
    const expected = deck(s.level), all = [...s.pile, ...s.discard, ...s.hands.flat()];
    if (all.length !== expected.length || new Set(all.map((c) => c?.id)).size !== expected.length ||
      all.some((c) => !c || !Number.isInteger(c.id) || !expected[c.id] || expected[c.id].color !== c.color || expected[c.id].value !== c.value)) return null;
    // Nur die bekannten Felder übernehmen
    const clean = (c) => ({ id: c.id, color: c.color, value: c.value });
    s.pile = s.pile.map(clean); s.discard = s.discard.map(clean); s.hands = s.hands.map((h) => h.map(clean));
    if (s.drawn !== null && !(Number.isInteger(s.drawn) && s.hands[s.turn].some((c) => c.id === s.drawn && matches(s, c)))) return null;
    if (s.winner === null && s.hands.some((h) => h.length === 0)) return null;
    if ([0, 1].includes(s.winner) && s.hands[s.winner].length !== 0) return null;
    if (s.discard.at(-1).value !== 'wild' && s.color !== s.discard.at(-1).color) return null;
    s.event = 'resume'; s.last = null; return s;
  } catch { return null; }
}
