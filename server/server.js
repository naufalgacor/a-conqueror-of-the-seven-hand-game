/**
 * Seven-Hand Game — Backend Server v2
 * Node.js + Express + Socket.io
 *
 * Changelog v2:
 *  - fillWithBots(): auto-fill slot kosong dengan bot bernama acak
 *  - Mode 1v1 (points/lives): max 2 pemain, bot otomatis jika solo
 *  - Mode points: Best-of-3 (first to 2 wins)
 *  - Mode lives: 3 HP per pemain, eliminasi saat HP = 0
 *  - Mode cup: 7 real players + bots mengisi slot kosong s/d 8 slot
 *  - getActiveBots(): semua bot ikut pilih elemen tiap fase
 *  - checkGameOver(): unified logic untuk semua mode + bot
 *  - Participant schema: tambah field `is_bot`
 */

const express = require("express");
const http    = require("http");
const { Server } = require("socket.io");
const cors   = require("cors");
const { v4: uuidv4 } = require("uuid");
const path   = require("path");

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../client/public")));

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const ELEMENTS = ["Rock", "Fire", "Scissors", "Sponge", "Paper", "Air", "Water"];

/**
 * Win matrix — WINS[a] = array of elements that 'a' beats.
 * Each element beats exactly 3 others (symmetric 7-element variant).
 */
const WINS = {
  Rock:     ["Scissors", "Fire",   "Sponge"],
  Fire:     ["Scissors", "Sponge", "Air"],
  Scissors: ["Sponge",   "Air",    "Paper"],
  Sponge:   ["Air",      "Paper",  "Water"],
  Paper:    ["Water",    "Rock",   "Fire"],
  Air:      ["Water",    "Rock",   "Scissors"],
  Water:    ["Rock",     "Fire",   "Scissors"],
};

// Timing (ms)
const PHASE_SELECTION_MS  = 15000;
const PHASE_RESOLUTION_MS = 2000;

/**
 * Per-mode configuration:
 *   maxPlayers  : batas pemain manusia yang bisa join
 *   targetScore : poin target untuk menang (mode points)
 *   startingLives: HP awal (mode lives & cup)
 */
const MODE_CONFIG = {
  points: { maxPlayers: 2, targetScore: 4, startingLives: 0  }, // Best-of-3
  lives:  { maxPlayers: 2, targetScore: 0, startingLives: 3  }, // 3 HP eliminasi
  cup:    { maxPlayers: 7, targetScore: 0, startingLives: 3  }, // 7 slot + bot(s)
};

// Pool nama bot — dipakai berurutan
const BOT_NAMES = [
  "Bot_Alpha", "Bot_Beta", "Bot_Gamma", "Bot_Delta",
  "Bot_Epsilon", "Bot_Zeta", "Bot_Theta",
];

// ═══════════════════════════════════════════════════════════════
// IN-MEMORY DATABASE
// ═══════════════════════════════════════════════════════════════

/**
 * matches: Map<matchId, Match>
 *
 * Match {
 *   id, mode, status, winner_id, leader_id,
 *   round, roundTimer,
 *   participants: Map<userId, Participant>
 * }
 *
 * Participant {
 *   user_id, username, socket_id, join_order,
 *   is_spectator, is_bot,
 *   lives, points, choice, eliminated
 * }
 */
const matches = new Map();

/** users: Map<socketId, { user_id, match_id }> */
const users = new Map();

// ═══════════════════════════════════════════════════════════════
// PARTICIPANT FACTORY
// ═══════════════════════════════════════════════════════════════

function makeParticipant({ userId, username, joinOrder, isBot = false, mode }) {
  const cfg = MODE_CONFIG[mode] || MODE_CONFIG.lives;
  return {
    user_id:      userId,
    username,
    socket_id:    null,
    join_order:   joinOrder,
    is_spectator: false,
    is_bot:       isBot,
    lives:        cfg.startingLives,
    points:       0,
    choice:       null,
    eliminated:   false,
  };
}

// ═══════════════════════════════════════════════════════════════
// BOT MANAGEMENT
// ═══════════════════════════════════════════════════════════════

/**
 * fillWithBots(match)
 *
 * Dipanggil saat leader menekan Start Game.
 * Mengisi slot kosong dengan bot hingga kuota mode terpenuhi:
 *   - points → total 2 slot (1v1Bot jika main sendirian)
 *   - lives  → total 2 slot
 *   - cup    → total 8 slot (7 manusia + 1 bot minimum, atau lebih)
 *
 * Perubahan schema DB:
 *   match.participants ← tambah entri bot baru
 *   Setiap bot: { is_bot: true, user_id: "bot_<uuid>", username: "Bot_Xxx" }
 */
function fillWithBots(match) {
  const cfg        = MODE_CONFIG[match.mode];
  // Total slot yang harus terisi (manusia + bot)
  const totalTarget = match.mode === "cup" ? 8 : cfg.maxPlayers;
  const current    = getParticipantArray(match).length;
  const slotsNeeded = Math.max(0, totalTarget - current);

  if (slotsNeeded === 0) {
    console.log(`[Bot] Tidak perlu bot untuk match ${match.id}`);
    return;
  }

  // Nama bot yang belum dipakai di match ini
  const usedNames = new Set(
    getParticipantArray(match).filter((p) => p.is_bot).map((p) => p.username)
  );
  const availableNames = BOT_NAMES.filter((n) => !usedNames.has(n));

  for (let i = 0; i < slotsNeeded; i++) {
    const botId     = `bot_${uuidv4()}`;
    const botName   = availableNames[i] || `Bot_${i + 1}`;
    const joinOrder = getParticipantArray(match).length + 1;

    const bot = makeParticipant({
      userId:    botId,
      username:  botName,
      joinOrder,
      isBot:     true,
      mode:      match.mode,
    });

    match.participants.set(botId, bot);
    console.log(`[Bot] Tambah ${botName} (${botId}) ke match ${match.id}`);
  }
}

/** Semua bot aktif (belum eliminated & bukan spectator) */
function getActiveBots(match) {
  return getParticipantArray(match).filter(
    (p) => p.is_bot && !p.eliminated && !p.is_spectator
  );
}

function highlightSelectedElement(element) {
  // Hapus semua border pilihan sebelumnya
  document.querySelectorAll('.element-card').forEach(card => {
    card.classList.remove('border-neon-cyan', 'ring-2', 'ring-neon-cyan');
  });
  
  // Tambahkan border ke elemen yang baru dipilih
  const activeCard = document.querySelector(`[data-element="${element}"]`);
  if (activeCard) {
    activeCard.classList.add('border-neon-cyan', 'ring-2', 'ring-neon-cyan');
  }
}
/**
 * assignBotChoices(match)
 *
 * Bot memilih elemen secara acak.
 * Dipanggil di awal setiap fase selection — SEBELUM timer berjalan,
 * sehingga input bot tidak bisa dimanipulasi oleh timing.
 */
function assignBotChoices(match) {
  getActiveBots(match).forEach((bot) => {
    bot.choice = ELEMENTS[Math.floor(Math.random() * ELEMENTS.length)];
    console.log(`[Bot] ${bot.username} memilih: ${bot.choice}`);
  });
}

// ═══════════════════════════════════════════════════════════════
// GAME LOGIC HELPERS
// ═══════════════════════════════════════════════════════════════

function beats(a, b) {
  return WINS[a] && WINS[a].includes(b);
}

/**
 * resolveChoices(choices)
 *
 * Input : [{ userId, element }]
 * Output: { winners: [userId], losers: [userId], draw: bool }
 *
 * Berlaku untuk manusia maupun bot — tidak ada pembedaan.
 */
function resolveChoices(choices) {
  if (choices.length === 0) return { winners: [], losers: [], draw: true };

  const elements = choices.map((c) => c.element);
  const unique   = [...new Set(elements)];

  if (unique.length === 1) {
    // Semua pilih sama → draw
    return { winners: choices.map((c) => c.userId), losers: [], draw: true };
  }

  const winning = unique.filter((el) =>
    unique.some((other) => other !== el && beats(el, other))
  );

  if (winning.length === 0) {
    // Siklus penuh → draw
    return { winners: choices.map((c) => c.userId), losers: [], draw: true };
  }

  const winnerUsers = choices.filter((c) => winning.includes(c.element)).map((c) => c.userId);
  const loserUsers  = choices.filter((c) => winning.some((w) => beats(w, c.element))).map((c) => c.userId);

  const draw = winnerUsers.length === 0 || loserUsers.length === 0;
  return { winners: winnerUsers, losers: loserUsers, draw };
}

function getMatch(matchId)          { return matches.get(matchId); }
function getParticipantArray(match) { return Array.from(match.participants.values()); }

/** Pemain manusia aktif (tidak spectator / eliminated) */
function getActivePlayers(match) {
  return getParticipantArray(match).filter(
    (p) => !p.is_bot && !p.is_spectator && !p.eliminated
  );
}

/** Semua peserta aktif (manusia + bot) */
function getAllActiveParticipants(match) {
  return getParticipantArray(match).filter(
    (p) => !p.is_spectator && !p.eliminated
  );
}

/**
 * transferLeadership(match, oldLeaderId)
 *
 * Pindah leader ke manusia dengan join_order terkecil setelah oldLeader.
 * Sesuai SRS Section 3A.
 */
function transferLeadership(match, oldLeaderId) {
  const candidates = getParticipantArray(match)
    .filter((p) => !p.is_bot && p.user_id !== oldLeaderId && !p.eliminated)
    .sort((a, b) => a.join_order - b.join_order);

  if (candidates.length === 0) return null;
  match.leader_id = candidates[0].user_id;
  return candidates[0];
}

function broadcastLobbyState(matchId) {
  const match = getMatch(matchId);
  if (!match) return;
  io.to(matchId).emit("lobby:state", serializeMatch(match));
}

function serializeMatch(match) {
  return {
    id:           match.id,
    mode:         match.mode,
    status:       match.status,
    winner_id:    match.winner_id,
    leader_id:    match.leader_id,
    round:        match.round,
    target_score: MODE_CONFIG[match.mode]?.targetScore || 0,
    mode_config:  MODE_CONFIG[match.mode],
    participants: getParticipantArray(match).map((p) => ({
      user_id:      p.user_id,
      username:     p.username,
      join_order:   p.join_order,
      is_spectator: p.is_spectator,
      is_bot:       p.is_bot,
      lives:        p.lives,
      points:       p.points,
      eliminated:   p.eliminated,
      choice: match.status === "result" || match.status === "finished"
        ? p.choice
        : p.choice ? "chosen" : null,
    })),
  };
}

// ═══════════════════════════════════════════════════════════════
// GAME PHASE ENGINE
// ═══════════════════════════════════════════════════════════════

/**
 * startGame(matchId)
 *
 * 1. fillWithBots() — isi slot kosong
 * 2. Broadcast game:started dengan info bot yang ditambah
 * 3. Mulai fase selection ronde 1
 */
function startGame(matchId) {
  const match = getMatch(matchId);
  if (!match) return;

  match.status = "playing";
  match.round  = 0;

  fillWithBots(match); // ← CORE: isi slot kosong

  const botList = getParticipantArray(match)
    .filter((p) => p.is_bot)
    .map((p) => ({ user_id: p.user_id, username: p.username }));

  io.to(matchId).emit("game:started", {
    mode:      match.mode,
    bot_count: botList.length,
    bots:      botList,
  });

  broadcastLobbyState(matchId);
  startSelectionPhase(matchId);
}

/**
 * startSelectionPhase(matchId)
 *
 * - Reset semua pilihan
 * - Bot langsung pilih acak (server-side, aman dari cheat)
 * - Timer 5 detik, lalu resolveRound()
 * - Early resolve jika semua manusia sudah memilih
 */
function startSelectionPhase(matchId) {
  const match = getMatch(matchId);
  if (!match || match.status === "finished") return;

  match.round++;
  match.status = "selection";
  match.participants.forEach((p) => { p.choice = null; });

  // Bot memilih di awal fase (server-side, tidak bisa diintip)
  assignBotChoices(match);

  io.to(matchId).emit("game:phase:selection", {
    round:    match.round,
    duration: PHASE_SELECTION_MS,
    players:  getAllActiveParticipants(match).map((p) => ({
      user_id:  p.user_id,
      username: p.username,
      is_bot:   p.is_bot,
    })),
  });

  // Countdown tick
  let remaining = Math.floor(PHASE_SELECTION_MS / 1000);
  const tick = setInterval(() => {
    remaining--;
    io.to(matchId).emit("game:timer:tick", { remaining });
    if (remaining <= 0) clearInterval(tick);
  }, 1000);

  // Timeout resolusi
  match.roundTimer = setTimeout(() => {
    clearInterval(tick);
    resolveRound(matchId);
  }, PHASE_SELECTION_MS);
}

/**
 * resolveRound(matchId)
 *
 * Kumpulkan pilihan semua peserta aktif (manusia + bot).
 * Forfeit (tidak pilih) = kalah dari siapapun yang pilih.
 */
function resolveRound(matchId) {
  const match = getMatch(matchId);
  if (!match) return;

  match.status = "resolving";
  io.to(matchId).emit("game:phase:resolving", { round: match.round });

  const allActive    = getAllActiveParticipants(match);
  const choices      = allActive.map((p) => ({ userId: p.user_id, element: p.choice || null }));
  const forfeits     = choices.filter((c) => !c.element).map((c) => c.userId);
  const validChoices = choices.filter((c) => c.element);

  let { winners, losers, draw } = resolveChoices(validChoices);

  if (validChoices.length > 0 && forfeits.length > 0) {
    losers = [...new Set([...losers, ...forfeits])];
    draw   = false;
  } else if (validChoices.length === 0) {
    draw = true;
  }

  // Build hasil ronde (termasuk bot agar klien tahu bot pilih apa)
  const roundResults = {};
  allActive.forEach((p) => {
    roundResults[p.user_id] = {
      username: p.username,
      is_bot:   p.is_bot,
      choice:   p.choice,
      result:   draw
        ? "draw"
        : winners.includes(p.user_id) ? "win" : "lose",
    };
  });

  applyRoundOutcome(match, winners, losers, draw);
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
        user_id:      p.user_id,
        username:     p.username,
        is_bot:       p.is_bot,
        lives:        p.lives,
        points:       p.points,
        eliminated:   p.eliminated,
        is_spectator: p.is_spectator,
      })),
    });

    broadcastLobbyState(matchId);
    if (!gameOver) {
      setTimeout(() => startSelectionPhase(matchId), 2000);
    }
  }, PHASE_RESOLUTION_MS);
}

/**
 * applyRoundOutcome(match, winners, losers, draw)
 *
 * Mode points : winner +1 poin (berlaku untuk bot juga)
 * Mode lives  : loser -1 HP → eliminated jika HP 0
 * Mode cup    : loser -1 HP → is_spectator jika HP 0
 */
function applyRoundOutcome(match, winners, losers, draw) {
  if (!draw ) {
    winners.forEach((uid) => {
      const p = match.participants.get(uid);
      if (p && !p.eliminated) p.points++;
    });
  }

  if (match.mode === "lives" || match.mode === "cup") {
    losers.forEach((uid) => {
      const p = match.participants.get(uid);
      if (!p || p.eliminated) return;

      p.lives = Math.max(0, p.lives - 1);
      if (p.lives <= 0) {
        p.eliminated   = true;
        p.is_spectator = true;
        if (!p.is_bot && p.socket_id) {
          io.to(p.socket_id).emit("game:eliminated", {
            message: "Nyawamu habis! Kamu sekarang menjadi Spectator.",
          });
        }
        console.log(`[Game] ${p.username} tereliminasi (ronde ${match.round})`);
      }
    });
  }
}

/**
 * checkGameOver(match) → boolean
 *
 * Mode points:
 *   - Selesai jika ada pemain yang mencapai targetScore
 *   - Atau sudah mencapai maxRounds (best-of-3 = 3 ronde max)
 *
 * Mode lives & cup:
 *   - Selesai jika hanya ≤1 peserta aktif tersisa
 *   - Bot yang tersisa sendirian = bot menang (edge case)
 *
 * Winner diprioritaskan ke pemain manusia jika bot ikut menang.
 */
function checkGameOver(match) {
  const cfg = MODE_CONFIG[match.mode];

  if (match.mode === "points") {
    const reached = getParticipantArray(match).filter(
      (p) => p.points >= cfg.targetScore
    );
    if (reached.length > 0) {
      reached.sort((a, b) => b.points - a.points);
      // Prioritaskan manusia jika ada bot yang juga mencapai skor sama
      const humanWinner = reached.find((p) => !p.is_bot);
      match.winner_id = (humanWinner || reached[0]).user_id;
      return true;
    }
    const maxRounds = cfg.targetScore * 2 - 1; // Best-of-3 = max 3 ronde
    if (match.round >= maxRounds) {
      const sorted = getParticipantArray(match).sort((a, b) => b.points - a.points);
      const humanWinner = sorted.find((p) => !p.is_bot && p.points === sorted[0].points);
      match.winner_id = (humanWinner || sorted[0])?.user_id || null;
      return true;
    }
    return false;
  }

  // lives & cup
  const stillActive = getAllActiveParticipants(match);
  if (stillActive.length <= 1) {
    if (stillActive.length === 1) {
      match.winner_id = stillActive[0].user_id;
    } else {
      match.winner_id = null; // semua tereliminasi (draw)
    }
    return true;
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════
// REST API
// ═══════════════════════════════════════════════════════════════

// GET /api/v1/lobbies
// Cari bagian API lobbies di server.js
app.get("/api/v1/lobbies", (req, res) => {
  const open = Array.from(matches.values())
    .filter((m) => m.status === "waiting")
    .map((m) => {
      // PENTING: Ambil data objek leader dari Map participants menggunakan leader_id
      const leader = m.participants.get(m.leader_id);
      
      return {
        id:           m.id,
        mode:         m.mode,
        status:       m.status,
        leader_id:    m.leader_id,
        // Kirim username leader ke client, jika tidak ketemu tulis "Unknown"
        leader_name:  leader ? leader.username : "Unknown", 
        player_count: getParticipantArray(m).filter((p) => !p.is_bot).length,
        max_players:  MODE_CONFIG[m.mode]?.maxPlayers || 8,
      };
    });
  res.json({ lobbies: open });
});

// POST /api/v1/lobby
app.post("/api/v1/lobby", (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: "username wajib diisi" });

  const userId  = uuidv4();
  const matchId = uuidv4();

  const match = {
    id:           matchId,
    mode:         "points",
    status:       "waiting",
    winner_id:    null,
    leader_id:    userId,
    round:        0,
    roundTimer:   null,
    participants: new Map(),
  };

  match.participants.set(userId, makeParticipant({
    userId, username, joinOrder: 1, isBot: false, mode: "points",
  }));
  matches.set(matchId, match);

  res.status(201).json({ match_id: matchId, user_id: userId, leader: true });
});

// POST /api/v1/lobby/:id/join
app.post("/api/v1/lobby/:lobby_id/join", (req, res) => {
  const { lobby_id } = req.params;
  const { username } = req.body;

  const match = getMatch(lobby_id);
  if (!match)                     return res.status(404).json({ error: "Lobby tidak ditemukan" });
  if (match.status !== "waiting") return res.status(400).json({ error: "Game sudah dimulai" });

  const humanCount = getParticipantArray(match).filter((p) => !p.is_bot).length;
  const maxHumans  = MODE_CONFIG[match.mode]?.maxPlayers || 7;
  if (humanCount >= maxHumans)
    return res.status(400).json({ error: `Lobby penuh (maks ${maxHumans} pemain)` });

  const userId   = uuidv4();
  const joinOrder = getParticipantArray(match).length + 1;

  match.participants.set(userId, makeParticipant({
    userId,
    username: username || `Player${joinOrder}`,
    joinOrder,
    isBot: false,
    mode: match.mode,
  }));

  res.status(200).json({ match_id: lobby_id, user_id: userId, leader: false });
});

// PATCH /api/v1/lobby/:id/settings
app.patch("/api/v1/lobby/:lobby_id/settings", (req, res) => {
  const { lobby_id } = req.params;
  const { game_mode, user_id } = req.body;

  const match = getMatch(lobby_id);
  if (!match)                      return res.status(404).json({ error: "Lobby tidak ditemukan" });
  if (match.leader_id !== user_id) return res.status(403).json({ error: "Hanya leader yang bisa mengubah mode" });
  if (!MODE_CONFIG[game_mode])     return res.status(400).json({ error: "Mode tidak valid" });

  match.mode = game_mode;
  // Reset stats semua peserta sesuai mode baru
  match.participants.forEach((p) => {
    p.lives  = MODE_CONFIG[game_mode].startingLives;
    p.points = 0;
  });

  broadcastLobbyState(lobby_id);
  res.json({ success: true, mode: match.mode, config: MODE_CONFIG[game_mode] });
});

// POST /api/v1/lobby/:id/start
app.post("/api/v1/lobby/:lobby_id/start", (req, res) => {
  const { lobby_id } = req.params;
  const { user_id } = req.body;

  const match = getMatch(lobby_id);
  if (!match)                       return res.status(404).json({ error: "Lobby tidak ditemukan" });
  if (match.leader_id !== user_id)  return res.status(403).json({ error: "Hanya leader yang bisa memulai" });
  if (match.status !== "waiting")   return res.status(400).json({ error: "Game sudah berjalan" });

  // Minimal 1 pemain manusia (slot sisanya akan diisi bot)
  const humanCount = getParticipantArray(match).filter((p) => !p.is_bot).length;
  if (humanCount < 1)
    return res.status(400).json({ error: "Butuh minimal 1 pemain manusia" });

  startGame(lobby_id);
  res.json({ success: true, message: "Game dimulai, bot mengisi slot kosong" });
});

// ═══════════════════════════════════════════════════════════════
// SOCKET.IO
// ═══════════════════════════════════════════════════════════════

io.on("connection", (socket) => {
  console.log(`[Socket] Connect: ${socket.id}`);

  socket.on("lobby:join", ({ match_id, user_id }) => {
    const match = getMatch(match_id);
    if (!match) return socket.emit("error", { message: "Lobby tidak ditemukan" });
    const p = match.participants.get(user_id);
    if (!p)     return socket.emit("error", { message: "Pemain tidak terdaftar" });

    p.socket_id = socket.id;
    users.set(socket.id, { user_id, match_id });
    socket.join(match_id);

    broadcastLobbyState(match_id);
    socket.emit("lobby:joined", {
      user_id,
      match_id,
      is_leader:   match.leader_id === user_id,
      mode_config: MODE_CONFIG[match.mode],
      participant: {
        user_id:      p.user_id,
        username:     p.username,
        join_order:   p.join_order,
        is_spectator: p.is_spectator,
        is_bot:       p.is_bot,
        lives:        p.lives,
        points:       p.points,
      },
    });
  });

  socket.on("chat:send", ({ match_id, user_id, message }) => {
    const match = getMatch(match_id);
    if (!match) return;
    const p = match.participants.get(user_id);
    if (!p || p.is_bot) return;

    io.to(match_id).emit("chat:message", {
      id:           uuidv4(),
      match_id,
      user_id,
      username:     p.username,
      message:      String(message).slice(0, 300),
      created_at:   new Date().toISOString(),
      is_spectator: p.is_spectator,
    });
  });

  socket.on("game:choose", ({ match_id, user_id, element }) => {
  const match = getMatch(match_id);
  if (!match || match.status !== "selection") return;

  const p = match.participants.get(user_id);
  // HAPUS p.choice dari pengecekan di bawah ini
  if (!p || p.is_spectator || p.eliminated || p.is_bot) return;

  // Timpa pilihan lama dengan yang baru
  p.choice = element;

  // Kirim konfirmasi ke user tersebut
  socket.emit("game:choice:confirmed", { element });

  // Beritahu pemain lain (opsional: agar UI mereka update)
  io.to(match_id).emit("game:player:chosen", { 
    user_id, 
    username: p.username,
    changed: true // Tambahkan flag ini jika ingin menampilkan pesan "mengubah pilihan"
  });

  // JANGAN gunakan auto-resolve (allChosen) jika ingin memberi kesempatan ganti
  // sampai waktu habis, atau biarkan saja jika ingin langsung lanjut saat semua siap.
  // const allChosen = getActivePlayers(match).every((hp) => hp.choice);
  // if (allChosen) {
  //   // Memberikan delay kecil agar pemain tidak kaget saat pindah fase
  //   if (match.roundTimer) clearTimeout(match.roundTimer);
  //   setTimeout(() => { resolveRound(match_id); }, 800);
  // }
});

  socket.on("spectator:decision", ({ match_id, user_id, decision }) => {
    const match = getMatch(match_id);
    if (!match) return;
    const p = match.participants.get(user_id);
    if (!p || !p.is_spectator) return;

    if (decision === "leave") {
      match.participants.delete(user_id);
      users.delete(socket.id);
      socket.leave(match_id);
      socket.emit("lobby:left");
      broadcastLobbyState(match_id);
    }
  });

  socket.on("disconnect", () => {
    const userData = users.get(socket.id);
    if (!userData) return;
    users.delete(socket.id);

    const { user_id, match_id } = userData;
    const match = getMatch(match_id);
    if (!match) return;

    const p = match.participants.get(user_id);
    if (!p) return;

    const wasLeader = match.leader_id === user_id;

    if (match.status === "waiting") {
      match.participants.delete(user_id);
      const remainHumans = getParticipantArray(match).filter((mp) => !mp.is_bot);
      if (remainHumans.length === 0) {
        if (match.roundTimer) clearTimeout(match.roundTimer);
        matches.delete(match_id);
        return;
      }
    } else {
      p.eliminated   = true;
      p.is_spectator = true;
    }

    if (wasLeader) {
      const newLeader = transferLeadership(match, user_id);
      if (newLeader) {
        io.to(match_id).emit("lobby:leader:changed", {
          new_leader_id:       newLeader.user_id,
          new_leader_username: newLeader.username,
        });
        if (newLeader.socket_id) io.to(newLeader.socket_id).emit("lobby:you:are:leader");
      } else {
        if (match.roundTimer) clearTimeout(match.roundTimer);
        matches.delete(match_id);
        return;
      }
    }

    broadcastLobbyState(match_id);
  });

  socket.on("lobby:leave", ({ match_id, user_id }) => {
    const match = getMatch(match_id);
    if (!match) return;
    const p = match.participants.get(user_id);
    if (!p) return;

    const wasLeader = match.leader_id === user_id;
    match.participants.delete(user_id);
    users.delete(socket.id);
    socket.leave(match_id);

    const remainHumans = getParticipantArray(match).filter((mp) => !mp.is_bot);
    if (remainHumans.length === 0) {
      if (match.roundTimer) clearTimeout(match.roundTimer);
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
        if (newLeader.socket_id) io.to(newLeader.socket_id).emit("lobby:you:are:leader");
      }
    }

    socket.emit("lobby:left");
    broadcastLobbyState(match_id);
  });
});

// ═══════════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════════

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🎮  Seven-Hand Game v2  ─  http://localhost:${PORT}`);
  console.log(`🤖  Bot pool: ${BOT_NAMES.join(", ")}`);
  console.log(`📋  Mode config:`);
  Object.entries(MODE_CONFIG).forEach(([k, v]) => {
    console.log(`     ${k.padEnd(8)} → maxPlayers=${v.maxPlayers}, targetScore=${v.targetScore}, startingLives=${v.startingLives}`);
  });
  console.log();
});