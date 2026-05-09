/**
 * Central game configuration (timings, modes, bots)
 */

// Timing (ms)
const PHASE_SELECTION_MS = 15000;
const PHASE_RESOLUTION_MS = 2000;

/**
 * Per-mode configuration:
 * - maxPlayers: max HUMAN players allowed to join a lobby
 * - targetScore: points needed to win (mode: points)
 * - startingLives: starting HP (mode: lives & cup)
 */
const MODE_CONFIG = {
  points: { maxPlayers: 2, targetScore: 4, startingLives: 0 }, // Best-of-7 => first to 4
  lives: { maxPlayers: 2, targetScore: 0, startingLives: 3 },
  cup: { maxPlayers: 7, targetScore: 0, startingLives: 3 },
};

const TITLES = {
  CHAMPION: "The Apex Sovereign",
};

// Pool nama bot — dipakai berurutan
const BOT_NAMES = [
  "Bot_Alpha",
  "Bot_Beta",
  "Bot_Gamma",
  "Bot_Delta",
  "Bot_Epsilon",
  "Bot_Zeta",
  "Bot_Theta",
];

module.exports = {
  PHASE_SELECTION_MS,
  PHASE_RESOLUTION_MS,
  MODE_CONFIG,
  TITLES,
  BOT_NAMES,
};
