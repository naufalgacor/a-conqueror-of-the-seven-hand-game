/**
 * Seven-Hand Game - Backend Server
 * Node.js + Express + Socket.io
 *
 * SRS Reference: Seven-Hand Game V6
 * Elemen: Rock, Fire, Scissors, Sponge, Paper, Air, Water
 * Mode: Rebutan Poin | Eliminasi Nyawa | Cup (7 pemain + 1 Bot)
 */

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../client/public")));

// ============================================================
// CONSTANTS & GAME RULES
// ============================================================

const ELEMENTS = ["Rock", "Fire", "Scissors", "Sponge", "Paper", "Air", "Water"];

// 7-element win matrix: WINS[a][b] = true means 'a' beats 'b'
// Rock > Scissors, Fire, Sponge
// Fire > Scissors, Sponge, Air
// Scissors > Sponge, Air, Paper
// Sponge > Air, Paper, Water
// Paper > Water, Rock, Fire
// Air > Water, Rock, Scissors (not Fire, not Sponge handled above)
// Water > Rock, Fire, Scissors
// Source: common 7-element RPS variant logic
const WINS = {
  Rock:     ["Scissors", "Fire",  "Sponge"],
  Fire:     ["Scissors", "Sponge","Air"],
  Scissors: ["Sponge",   "Air",   "Paper"],
  Sponge:   ["Air",      "Paper", "Water"],
  Paper:    ["Water",    "Rock",  "Fire"],
  Air:      ["Water",    "Rock",  "Scissors"],
  Water:    ["Rock",     "Fire",  "Scissors"],
};

const PHASE_SELECTION_MS  = 5000; // 5 detik fase pilih
const PHASE_RESOLUTION_MS = 2000; // 2 detik animasi resolusi
const STARTING_LIVES      = 3;    // untuk mode Eliminasi Nyawa
const STARTING_POINTS     = 0;    // untuk mode Rebutan Poin
const BOT_NAME            = "🤖 SevenBot";

// ============================================================
// MOCK DATABASE (in-memory)
// ============================================================

/** @type {Map<string, Match>} */
const matches = new Map();

/** @type {Map<string, User>} */
const users = new Map(); // socketId -> User

/**
 * Match structure:
 * {
 *   id, mode, status, winner_id, leader_id,
 *   round, roundTimer, participants: Map<userId, Participant>
 * }
 *
 * Participant structure:
 * {
 *   user_id, username, socket_id, join_order,
 *   is_spectator, lives, points, choice, eliminated
 * }
 */

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function beats(a, b) {
  return WINS[a] && WINS[a].includes(b);
}

function resolveChoices(choices) {
  // choices: [{ userId, element }]
  // Returns { winners: [userId], losers: [userId], draw: bool }
  if (choices.length === 0) return { winners: [], losers: [], draw: true };

  // Count distinct elements
  const elements = choices.map((c) => c.element);
  const unique = [...new Set(elements)];

  if (unique.length === 1) {
    // Everyone picked same: DRAW
    return { winners: choices.map((c) => c.userId), losers: [], draw: true };
  }

  // Find which elements win against at least one other
  const winning = unique.filter((el) =>
    unique.some((other) => other !== el && beats(el, other))
  );

  if (winning.length === 0) {
    // Cycle: all cancel out → DRAW
    return { winners: choices.map((c) => c.userId), losers: [], draw: true };
  }

  // Players whose element is in winning set → winners
  // Players whose element is beaten by at least one winner → losers
  const winnerUsers = choices
    .filter((c) => winning.includes(c.element))
    .map((c) => c.userId);

  const loserUsers = choices
    .filter((c) => {
      // Loser if their element is beaten by any winning element
      return winning.some((w) => beats(w, c.element));
    })
    .map((c) => c.userId);

  const draw = winnerUsers.length === 0 || loserUsers.length === 0;

  return { winners: winnerUsers, losers: loserUsers, draw };
}

function getBotChoice() {
  return ELEMENTS[Math.floor(Math.random() * ELEMENTS.length)];
}

function getMatch(matchId) {
  return matches.get(matchId);
}

function getParticipantArray(match) {
  return Array.from(match.participants.values());
}

function getActivePlayers(match) {
  return getParticipantArray(match).filter(
    (p) => !p.is_spectator && !p.eliminated && p.user_id !== "bot"
  );
}

/** Transfer leader to next valid player by join_order */
function transferLeadership(match, oldLeaderId) {
  const candidates = getParticipantArray(match)
    .filter((p) => p.user_id !== oldLeaderId && !p.eliminated && p.user_id !== "bot")
    .sort((a, b) => a.join_order - b.join_order);

  if (candidates.length === 0) return null;
  const newLeader = candidates[0];
  match.leader_id = newLeader.user_id;
  return newLeader;
}

function broadcastLobbyState(matchId) {
  const match = getMatch(matchId);
  if (!match) return;
  io.to(matchId).emit("lobby:state", serializeMatch(match));
}

function serializeMatch(match) {
  return {
    id: match.id,
    mode: match.mode,
    status: match.status,
    winner_id: match.winner_id,
    leader_id: match.leader_id,
    round: match.round,
    participants: getParticipantArray(match).map((p) => ({
      user_id:      p.user_id,
      username:     p.username,
      join_order:   p.join_order,
      is_spectator: p.is_spectator,
      lives:        p.lives,
      points:       p.points,
      eliminated:   p.eliminated,
      choice:       match.status === "result" ? p.choice : p.choice ? "chosen" : null,
    })),
  };
}

// ============================================================
// GAME PHASE ENGINE
// ============================================================

function startGame(matchId) {
  const match = getMatch(matchId);
  if (!match) return;

  match.status = "playing";
  match.round = 0;

  // Add bot for Cup mode
  if (match.mode === "cup") {
    const botParticipant = {
      user_id:      "bot",
      username:     BOT_NAME,
      socket_id:    null,
      join_order:   999,
      is_spectator: false,
      lives:        STARTING_LIVES,
      points:       STARTING_POINTS,
      choice:       null,
      eliminated:   false,
    };
    match.participants.set("bot", botParticipant);
  }

  io.to(matchId).emit("game:started", { mode: match.mode });
  startSelectionPhase(matchId);
}

function startSelectionPhase(matchId) {
  const match = getMatch(matchId);
  if (!match || match.status === "finished") return;

  match.round += 1;
  match.status = "selection";

  // Reset choices for all active, non-spectator participants
  match.participants.forEach((p) => {
    p.choice = null;
  });

  io.to(matchId).emit("game:phase:selection", {
    round:    match.round,
    duration: PHASE_SELECTION_MS,
    players:  getActivePlayers(match).map((p) => p.user_id),
  });

  // Auto-choose for bot immediately
  if (match.mode === "cup") {
    const bot = match.participants.get("bot");
    if (bot && !bot.eliminated) {
      bot.choice = getBotChoice();
    }
  }

  // Send countdown ticks
  let remaining = PHASE_SELECTION_MS / 1000;
  const tick = setInterval(() => {
    remaining--;
    io.to(matchId).emit("game:timer:tick", { remaining });
    if (remaining <= 0) clearInterval(tick);
  }, 1000);

  // After selection window, resolve
  match.roundTimer = setTimeout(() => {
    clearInterval(tick);
    resolveRound(matchId);
  }, PHASE_SELECTION_MS);
}

function resolveRound(matchId) {
  const match = getMatch(matchId);
  if (!match) return;

  match.status = "resolving";
  io.to(matchId).emit("game:phase:resolving", { round: match.round });

  // Collect choices (players who did not choose get null → treated as forfeit/loss)
  const activePlayers = getActivePlayers(match);
  const botPart = match.participants.get("bot");

  const allActive = match.mode === "cup" && botPart && !botPart.eliminated
    ? [...activePlayers, botPart]
    : activePlayers;

  const choices = allActive.map((p) => ({
    userId:  p.user_id,
    element: p.choice || null,
  }));

  // Players who didn't choose → auto-assign null → treated as "forfeit"
  // For fairness: forfeit players lose to anyone who chose
  const forfeits = choices.filter((c) => !c.element).map((c) => c.userId);
  const validChoices = choices.filter((c) => c.element);

  let { winners, losers, draw } = resolveChoices(validChoices);

  // Forfeit players are always losers if anyone chose
  if (validChoices.length > 0) {
    losers = [...new Set([...losers, ...forfeits])];
  } else {
    // Nobody chose → draw
    draw = true;
  }

  // Build result map
  const roundResults = {};
  allActive.forEach((p) => {
    roundResults[p.user_id] = {
      username: p.username,
      choice:   p.choice,
      result:   draw
        ? "draw"
        : winners.includes(p.user_id)
        ? "win"
        : "lose",
    };
  });

  // Apply penalties / scoring
  applyRoundOutcome(match, winners, losers, draw);

  // Check game-over condition
  const gameOver = checkGameOver(match);

  setTimeout(() => {
    match.status = gameOver ? "finished" : "result";

    io.to(matchId).emit("game:phase:result", {
      round:        match.round,
      results:      roundResults,
      draw,
      game_over:    gameOver,
      winner_id:    match.winner_id,
      participants: getParticipantArray(match).map((p) => ({
        user_id:   p.user_id,
        username:  p.username,
        lives:     p.lives,
        points:    p.points,
        eliminated: p.eliminated,
        is_spectator: p.is_spectator,
      })),
    });

    broadcastLobbyState(matchId);

    if (!gameOver) {
      // Continue to next round
      setTimeout(() => startSelectionPhase(matchId), 1500);
    }
  }, PHASE_RESOLUTION_MS);
}

function applyRoundOutcome(match, winners, losers, draw) {
  const mode = match.mode;

  losers.forEach((userId) => {
    const p = match.participants.get(userId);
    if (!p || p.eliminated) return;

    if (mode === "cup" || mode === "lives") {
      p.lives = Math.max(0, p.lives - 1);
      if (p.lives <= 0) {
        p.eliminated = true;
        p.is_spectator = true;
        io.to(p.socket_id).emit("game:eliminated", {
          message: "Kamu tereliminasi! Kamu sekarang menjadi Spectator.",
        });
      }
    } else if (mode === "points") {
      // In points mode, winners gain 1 point
    }
  });

  if (!draw) {
    winners.forEach((userId) => {
      const p = match.participants.get(userId);
      if (!p) return;
      if (mode === "points") {
        p.points += 1;
      }
    });
  }
}

function checkGameOver(match) {
  const activePlayers = getParticipantArray(match).filter(
    (p) => !p.eliminated && !p.is_spectator
  );

  if (match.mode === "cup" || match.mode === "lives") {
    // Game over when only 1 (or 0) active player remains
    if (activePlayers.length <= 1) {
      if (activePlayers.length === 1) {
        match.winner_id = activePlayers[0].user_id;
      }
      return true;
    }
  } else if (match.mode === "points") {
    // Game ends after 7 rounds
    if (match.round >= 7) {
      // Find highest points
      const sorted = getParticipantArray(match)
        .filter((p) => p.user_id !== "bot")
        .sort((a, b) => b.points - a.points);
      match.winner_id = sorted[0]?.user_id || null;
      return true;
    }
  }

  return false;
}

// ============================================================
// REST API ENDPOINTS (SRS Section 6)
// ============================================================

// GET /api/v1/lobbies - list all open lobbies
app.get("/api/v1/lobbies", (req, res) => {
  const open = Array.from(matches.values())
    .filter((m) => m.status === "waiting")
    .map((m) => ({
      id:           m.id,
      mode:         m.mode,
      status:       m.status,
      leader_id:    m.leader_id,
      player_count: getParticipantArray(m).length,
    }));
  res.json({ lobbies: open });
});

// POST /api/v1/lobby - create a new lobby
app.post("/api/v1/lobby", (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: "username required" });

  const userId  = uuidv4();
  const matchId = uuidv4();

  const match = {
    id:           matchId,
    mode:         "points", // default, can be changed by leader
    status:       "waiting",
    winner_id:    null,
    leader_id:    userId,
    round:        0,
    roundTimer:   null,
    participants: new Map(),
  };

  const participant = {
    user_id:      userId,
    username:     username,
    socket_id:    null,
    join_order:   1,
    is_spectator: false,
    lives:        STARTING_LIVES,
    points:       STARTING_POINTS,
    choice:       null,
    eliminated:   false,
  };

  match.participants.set(userId, participant);
  matches.set(matchId, match);

  res.status(201).json({ match_id: matchId, user_id: userId, leader: true });
});

// POST /api/v1/lobby/:lobby_id/join - join existing lobby
app.post("/api/v1/lobby/:lobby_id/join", (req, res) => {
  const { lobby_id } = req.params;
  const { username } = req.body;

  const match = getMatch(lobby_id);
  if (!match) return res.status(404).json({ error: "Lobby not found" });
  if (match.status !== "waiting") return res.status(400).json({ error: "Game already started" });

  const maxPlayers = match.mode === "cup" ? 7 : 6;
  if (getParticipantArray(match).length >= maxPlayers)
    return res.status(400).json({ error: "Lobby is full" });

  const userId    = uuidv4();
  const joinOrder = getParticipantArray(match).length + 1;

  const participant = {
    user_id:      userId,
    username:     username || `Player${joinOrder}`,
    socket_id:    null,
    join_order:   joinOrder,
    is_spectator: false,
    lives:        STARTING_LIVES,
    points:       STARTING_POINTS,
    choice:       null,
    eliminated:   false,
  };

  match.participants.set(userId, participant);
  res.status(200).json({ match_id: lobby_id, user_id: userId, leader: false });
});

// PATCH /api/v1/lobby/:lobby_id/settings - leader sets game mode (SRS Section 6)
app.patch("/api/v1/lobby/:lobby_id/settings", (req, res) => {
  const { lobby_id } = req.params;
  const { game_mode, user_id } = req.body;

  const match = getMatch(lobby_id);
  if (!match) return res.status(404).json({ error: "Lobby not found" });
  if (match.leader_id !== user_id)
    return res.status(403).json({ error: "Only the leader can change settings" });
  if (!["points", "lives", "cup"].includes(game_mode))
    return res.status(400).json({ error: "Invalid game mode" });

  match.mode = game_mode;
  broadcastLobbyState(lobby_id);
  res.json({ success: true, mode: match.mode });
});

// POST /api/v1/lobby/:lobby_id/start - leader starts game (SRS Section 6)
app.post("/api/v1/lobby/:lobby_id/start", (req, res) => {
  const { lobby_id } = req.params;
  const { user_id } = req.body;

  const match = getMatch(lobby_id);
  if (!match) return res.status(404).json({ error: "Lobby not found" });
  if (match.leader_id !== user_id)
    return res.status(403).json({ error: "Only the leader can start the game" });
  if (match.status !== "waiting")
    return res.status(400).json({ error: "Game already started" });

  const playerCount = getParticipantArray(match).length;
  if (playerCount < 2)
    return res.status(400).json({ error: "Need at least 2 players" });

  startGame(lobby_id);
  // Broadcast to all participants that game has started
  res.json({ success: true, message: "Game started" });
});

// ============================================================
// SOCKET.IO — REAL-TIME EVENTS
// ============================================================

io.on("connection", (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);

  // --- JOIN LOBBY ---
  socket.on("lobby:join", ({ match_id, user_id }) => {
    const match = getMatch(match_id);
    if (!match) return socket.emit("error", { message: "Lobby not found" });

    const participant = match.participants.get(user_id);
    if (!participant) return socket.emit("error", { message: "Player not in lobby" });

    // Bind socket id
    participant.socket_id = socket.id;
    users.set(socket.id, { user_id, match_id });

    socket.join(match_id);
    console.log(`[Lobby] ${participant.username} joined room ${match_id}`);

    // Tell everyone the new state
    broadcastLobbyState(match_id);
    socket.emit("lobby:joined", {
      user_id,
      match_id,
      is_leader: match.leader_id === user_id,
      participant: {
        user_id:      participant.user_id,
        username:     participant.username,
        join_order:   participant.join_order,
        is_spectator: participant.is_spectator,
        lives:        participant.lives,
        points:       participant.points,
      },
    });
  });

  // --- LOBBY CHAT (SRS Section 3B) ---
  socket.on("chat:send", ({ match_id, user_id, message }) => {
    const match = getMatch(match_id);
    if (!match) return;

    const participant = match.participants.get(user_id);
    if (!participant) return;

    const msgRecord = {
      id:         uuidv4(),
      match_id,
      user_id,
      username:   participant.username,
      message:    String(message).slice(0, 300),
      created_at: new Date().toISOString(),
      is_spectator: participant.is_spectator,
    };

    // Broadcast to all in room (lobby_messages table mock)
    io.to(match_id).emit("chat:message", msgRecord);
  });

  // --- PLAYER MAKES CHOICE ---
  socket.on("game:choose", ({ match_id, user_id, element }) => {
    const match = getMatch(match_id);
    if (!match || match.status !== "selection") return;
    if (!ELEMENTS.includes(element)) return socket.emit("error", { message: "Invalid element" });

    const participant = match.participants.get(user_id);
    if (!participant || participant.is_spectator || participant.eliminated) return;
    if (participant.choice) return; // Already chosen

    participant.choice = element;
    socket.emit("game:choice:confirmed", { element });

    // Notify others that this player has chosen (without revealing element)
    socket.to(match_id).emit("game:player:chosen", { user_id });

    // Check if all active players have chosen → resolve early
    const active = getActivePlayers(match);
    const bot = match.participants.get("bot");
    const allChosen = active.every((p) => p.choice) &&
      (match.mode !== "cup" || !bot || bot.eliminated || bot.choice);

    if (allChosen) {
      if (match.roundTimer) clearTimeout(match.roundTimer);
      resolveRound(match_id);
    }
  });

  // --- SPECTATOR: CHOOSE TO STAY OR LEAVE ---
  socket.on("spectator:decision", ({ match_id, user_id, decision }) => {
    const match = getMatch(match_id);
    if (!match) return;
    const p = match.participants.get(user_id);
    if (!p || !p.is_spectator) return;

    if (decision === "leave") {
      match.participants.delete(user_id);
      socket.leave(match_id);
      socket.emit("lobby:left");
      broadcastLobbyState(match_id);
    }
    // If "spectate", do nothing — they stay in room as spectator
  });

  // --- DISCONNECT / LEAVE ---
  socket.on("disconnect", () => {
    console.log(`[Socket] Disconnected: ${socket.id}`);
    const userData = users.get(socket.id);
    if (!userData) return;

    users.delete(socket.id);
    const { user_id, match_id } = userData;
    const match = getMatch(match_id);
    if (!match) return;

    const participant = match.participants.get(user_id);
    if (!participant) return;

    const wasLeader = match.leader_id === user_id;

    // If game is waiting, remove from lobby entirely
    if (match.status === "waiting") {
      match.participants.delete(user_id);

      // If lobby empty, delete it
      if (match.participants.size === 0) {
        matches.delete(match_id);
        return;
      }
    } else {
      // Mark as eliminated/spectator if game in progress
      participant.eliminated = true;
      participant.is_spectator = true;
    }

    // --- LEADERSHIP SUCCESSION (SRS Section 3A) ---
    if (wasLeader) {
      const newLeader = transferLeadership(match, user_id);
      if (newLeader) {
        io.to(match_id).emit("lobby:leader:changed", {
          new_leader_id:       newLeader.user_id,
          new_leader_username: newLeader.username,
        });
        io.to(newLeader.socket_id).emit("lobby:you:are:leader");
      } else {
        // No players left
        if (match.roundTimer) clearTimeout(match.roundTimer);
        matches.delete(match_id);
        return;
      }
    }

    broadcastLobbyState(match_id);
  });

  // --- LEAVE LOBBY (explicit) ---
  socket.on("lobby:leave", ({ match_id, user_id }) => {
    const match = getMatch(match_id);
    if (!match) return;

    const participant = match.participants.get(user_id);
    if (!participant) return;

    const wasLeader = match.leader_id === user_id;
    match.participants.delete(user_id);

    socket.leave(match_id);

    if (match.participants.size === 0) {
      matches.delete(match_id);
      socket.emit("lobby:left");
      return;
    }

    if (wasLeader) {
      const newLeader = transferLeadership(match, user_id);
      if (newLeader) {
        io.to(match_id).emit("lobby:leader:changed", {
          new_leader_id:       newLeader.user_id,
          new_leader_username: newLeader.username,
        });
        io.to(newLeader.socket_id).emit("lobby:you:are:leader");
      }
    }

    socket.emit("lobby:left");
    broadcastLobbyState(match_id);
  });
});

// ============================================================
// START SERVER
// ============================================================

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🎮 Seven-Hand Game Server running on http://localhost:${PORT}`);
  console.log(`   WebSocket ready via Socket.io`);
  console.log(`   Mock DB: in-memory (matches + participants)\n`);
});