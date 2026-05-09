/**
 * Participant factory.
 */

const { MODE_CONFIG } = require("../config/gameConfig");

function makeParticipant({ userId, username, joinOrder, isBot = false, mode }) {
  const cfg = MODE_CONFIG[mode] || MODE_CONFIG.lives;
  return {
    user_id: userId,
    username,
    socket_id: null,
    join_order: joinOrder,
    is_spectator: false,
    is_bot: isBot,
    lives: cfg.startingLives,
    points: 0,
    choice: null,
    eliminated: false,
  };
}

module.exports = {
  makeParticipant,
};
