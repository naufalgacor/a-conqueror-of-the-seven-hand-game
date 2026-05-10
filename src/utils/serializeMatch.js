/**
 * Serialize Match for client UI.
 */

const { MODE_CONFIG } = require("../config/gameConfig");
const { getParticipantArray } = require("./matchUtils");

function serializeMatch(match) {
  return {
    id: match.id,
    mode: match.mode,
    status: match.status,
    winner_id: match.winner_id,
    leader_id: match.leader_id,
    round: match.round,
    target_score: MODE_CONFIG[match.mode]?.targetScore || 0,
    mode_config: MODE_CONFIG[match.mode],
    participants: getParticipantArray(match).map((p) => ({
      user_id: p.user_id,
      username: p.username,
      join_order: p.join_order,
      is_spectator: p.is_spectator,
      is_bot: p.is_bot,
      lives: p.lives,
      points: p.points,
      eliminated: p.eliminated,
      choice:
        match.status === "result" || match.status === "finished"
          ? p.choice
          : p.choice
            ? "chosen"
            : null,
    })),
    cup_bracket: match.cup_bracket,
  };
}

function broadcastLobbyState(io, matchId, match) {
  if (!match) return;
  io.to(matchId).emit("lobby:state", serializeMatch(match));
}

module.exports = {
  serializeMatch,
  broadcastLobbyState,
};
