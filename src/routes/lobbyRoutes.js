const express = require("express");
const { v4: uuidv4 } = require("uuid");

const { MODE_CONFIG } = require("../config/gameConfig");
const { makeParticipant } = require("../utils/makeParticipant");
const { getMatch, getParticipantArray, getHumanParticipants } = require("../utils/matchUtils");
const { broadcastLobbyState } = require("../utils/serializeMatch");

function createLobbyRouter({ io, matches, startGame }) {
  const router = express.Router();

  // GET /api/v1/lobbies
  router.get("/lobbies", (req, res) => {
    const open = Array.from(matches.values())
      .filter((m) => m.status === "waiting")
      .map((m) => {
        const leader = m.participants.get(m.leader_id);

        return {
          id: m.id,
          mode: m.mode,
          status: m.status,
          leader_id: m.leader_id,
          leader_name: leader ? leader.username : "Unknown",
          player_count: getHumanParticipants(m).length,
          max_players: MODE_CONFIG[m.mode]?.maxPlayers || 8,
        };
      });

    res.json({ lobbies: open });
  });

  // POST /api/v1/lobby
  router.post("/lobby", (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: "username wajib diisi" });

    const userId = uuidv4();
    const matchId = uuidv4();

    const match = {
      id: matchId,
      mode: "points",
      status: "waiting",
      winner_id: null,
      leader_id: userId,
      round: 0,
      roundTimer: null,
      participants: new Map(),
      cup_bracket: null,
    };

    match.participants.set(
      userId,
      makeParticipant({ userId, username, joinOrder: 1, isBot: false, mode: match.mode })
    );
    matches.set(matchId, match);

    res.status(201).json({ match_id: matchId, user_id: userId, leader: true });
  });

  // POST /api/v1/lobby/:id/join
  router.post("/lobby/:lobby_id/join", (req, res) => {
    const { lobby_id } = req.params;
    const { username } = req.body;

    const match = getMatch(matches, lobby_id);
    if (!match) return res.status(404).json({ error: "Lobby tidak ditemukan" });
    if (match.status !== "waiting") return res.status(400).json({ error: "Game sudah dimulai" });

    const humanCount = getHumanParticipants(match).length;
    const maxHumans = MODE_CONFIG[match.mode]?.maxPlayers || 7;
    if (humanCount >= maxHumans) {
      return res.status(400).json({ error: `Lobby penuh (maks ${maxHumans} pemain)` });
    }

    const userId = uuidv4();
    const joinOrder = getParticipantArray(match).length + 1;

    match.participants.set(
      userId,
      makeParticipant({
        userId,
        username: username || `Player${joinOrder}`,
        joinOrder,
        isBot: false,
        mode: match.mode,
      })
    );

    res.status(200).json({ match_id: lobby_id, user_id: userId, leader: false });
  });

  // PATCH /api/v1/lobby/:id/settings
  router.patch("/lobby/:lobby_id/settings", (req, res) => {
    const { lobby_id } = req.params;
    const { game_mode, user_id } = req.body;

    const match = getMatch(matches, lobby_id);
    if (!match) return res.status(404).json({ error: "Lobby tidak ditemukan" });
    if (match.leader_id !== user_id) return res.status(403).json({ error: "Hanya leader yang bisa mengubah mode" });
    if (match.status !== "waiting") return res.status(400).json({ error: "Mode hanya bisa diubah sebelum game dimulai" });
    if (!MODE_CONFIG[game_mode]) return res.status(400).json({ error: "Mode tidak valid" });

    match.mode = game_mode;

    // Reset stats sesuai mode baru
    match.participants.forEach((p) => {
      p.lives = MODE_CONFIG[game_mode].startingLives;
      p.points = 0;
      p.choice = null;
      p.eliminated = false;
      p.is_spectator = false;
    });

    broadcastLobbyState(io, lobby_id, match);
    res.json({ success: true, mode: match.mode, config: MODE_CONFIG[game_mode] });
  });

  // POST /api/v1/lobby/:id/start
  router.post("/lobby/:lobby_id/start", (req, res) => {
    const { lobby_id } = req.params;
    const { user_id } = req.body;

    const match = getMatch(matches, lobby_id);
    if (!match) return res.status(404).json({ error: "Lobby tidak ditemukan" });
    if (match.leader_id !== user_id) return res.status(403).json({ error: "Hanya leader yang bisa memulai" });
    if (match.status !== "waiting") return res.status(400).json({ error: "Game sudah berjalan" });

    const humanCount = getHumanParticipants(match).length;
    if (humanCount < 1) return res.status(400).json({ error: "Butuh minimal 1 pemain manusia" });

    startGame(lobby_id);
    res.json({ success: true, message: "Game dimulai, bot mengisi slot kosong" });
  });

  return router;
}

module.exports = {
  createLobbyRouter,
};
