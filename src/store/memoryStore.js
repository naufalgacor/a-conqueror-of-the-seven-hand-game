/**
 * In-memory store (mock DB)
 *
 * matches: Map<matchId, Match>
 * users  : Map<socketId, { user_id, match_id }>
 */

const matches = new Map();
const users = new Map();

module.exports = {
  matches,
  users,
};
