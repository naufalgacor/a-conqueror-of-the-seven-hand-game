/**
 * Small helpers for match / participant data.
 */

function getMatch(matches, matchId) {
  return matches.get(matchId);
}

function getParticipantArray(match) {
  if (!match?.participants) return [];
  return Array.from(match.participants.values());
}

function getHumanParticipants(match) {
  return getParticipantArray(match).filter((p) => !p.is_bot);
}

function getActiveHumanPlayers(match) {
  return getParticipantArray(match).filter((p) => !p.is_bot && !p.is_spectator && !p.eliminated);
}

function getAllActiveParticipants(match) {
  return getParticipantArray(match).filter((p) => !p.is_spectator && !p.eliminated);
}

module.exports = {
  getMatch,
  getParticipantArray,
  getHumanParticipants,
  getActiveHumanPlayers,
  getAllActiveParticipants,
};
