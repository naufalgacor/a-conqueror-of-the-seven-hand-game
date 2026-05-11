const ELEMENTS = ["Rock", "Fire", "Scissors", "Sponge", "Paper", "Air", "Water"];

const WINS = {
  Rock:     ["Scissors", "Fire",   "Sponge"],
  Fire:     ["Scissors", "Sponge", "Paper"],
  Scissors: ["Sponge",   "Paper",  "Air"],
  Sponge:   ["Paper",    "Air",    "Water"],
  Paper:    ["Air",      "Water",  "Rock"],
  Air:      ["Water",    "Rock",   "Fire"],
  Water:    ["Rock",     "Fire",   "Scissors"],
};

function beats(a, b) {
  return Array.isArray(WINS[a]) && WINS[a].includes(b);
}

/**
 * resolveChoices(choices)
 * Dioptimalkan khusus untuk 1v1 (2 Pemain).
 */
function resolveChoices(choices) {
  if (!Array.isArray(choices) || choices.length < 2) {
    return { winners: choices.map(c => c.userId), losers: [], draw: true };
  }

  const p1 = choices[0];
  const p2 = choices[1];

  // Skenario 1: Seri (Elemen sama)
  if (p1.element === p2.element) {
    return { winners: [p1.userId, p2.userId], losers: [], draw: true };
  }

  // Skenario 2: P1 Menang
  if (beats(p1.element, p2.element)) {
    return { winners: [p1.userId], losers: [p2.userId], draw: false };
  }

  // Skenario 3: P2 Menang
  if (beats(p2.element, p1.element)) {
    return { winners: [p2.userId], losers: [p1.userId], draw: false };
  }

  // Skenario 4: Fallback (Jika tidak ada yang saling mengalahkan, misal elemen tidak valid)
  return { winners: [p1.userId, p2.userId], losers: [], draw: true };
}

module.exports = { ELEMENTS, beats, resolveChoices };