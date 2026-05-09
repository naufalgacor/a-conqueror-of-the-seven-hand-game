/**
 * Seven-Hand Game — Rules
 *
 * Exported as a small, reusable module so both REST handlers and
 * Socket.io handlers can rely on a single source of truth.
 */

const ELEMENTS = ["Rock", "Fire", "Scissors", "Sponge", "Paper", "Air", "Water"];

/**
 * Win matrix — WINS[a] = array of elements that 'a' beats.
 * Each element beats exactly 3 others.
 */
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
 *
 * @param {Array<{userId: string, element: string}>} choices - only VALID (non-null) choices.
 * @returns {{winners: string[], losers: string[], draw: boolean}}
 *
 * Multi-player resolution:
 * - If everyone picks the same element => draw
 * - Otherwise, winners are players whose element is NOT beaten by any other
 *   element present in this round.
 * - If no such element exists (cycle) => draw
 */
function resolveChoices(choices) {
  if (!Array.isArray(choices) || choices.length === 0) {
    return { winners: [], losers: [], draw: true };
  }

  const elements = choices.map((c) => c.element);
  const unique = [...new Set(elements)];

  if (unique.length === 1) {
    return { winners: choices.map((c) => c.userId), losers: [], draw: true };
  }

  // Mark elements that are beaten by ANY other element in the chosen set.
  const isBeaten = new Map(unique.map((el) => [el, false]));

  for (const el of unique) {
    for (const other of unique) {
      if (other === el) continue;
      if (beats(other, el)) {
        isBeaten.set(el, true);
        break;
      }
    }
  }

  const winningElements = unique.filter((el) => !isBeaten.get(el));

  if (winningElements.length === 0) {
    // Full cycle => draw
    return { winners: choices.map((c) => c.userId), losers: [], draw: true };
  }

  const winners = choices.filter((c) => winningElements.includes(c.element)).map((c) => c.userId);
  const losers = choices.filter((c) => !winningElements.includes(c.element)).map((c) => c.userId);

  return { winners, losers, draw: false };
}

module.exports = {
  ELEMENTS,
  WINS,
  beats,
  resolveChoices,
};
