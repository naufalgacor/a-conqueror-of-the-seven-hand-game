const { v4: uuidv4 } = require("uuid");

const {
  PHASE_SELECTION_MS,
  PHASE_RESOLUTION_MS,
  MODE_CONFIG,
  BOT_NAMES,
} = require("../config/gameConfig");

const { ELEMENTS, resolveChoices } = require("../utils/gameRules");
const { makeParticipant } = require("../utils/makeParticipant");
const {
  getMatch,
  getParticipantArray,
  getActiveHumanPlayers,
  getAllActiveParticipants,
} = require("../utils/matchUtils");
const { broadcastLobbyState } = require("../utils/serializeMatch");

function createGameService({ io, matches }) {
  // ─────────────────────────────────────────────────────────────
  // BOT MANAGEMENT
  // ─────────────────────────────────────────────────────────────

  function fillWithBots(match) {
    const cfg = MODE_CONFIG[match.mode];
    if (!cfg) return;

    // Total participant target (humans + bots)
    const totalTarget = match.mode === "cup" ? MODE_CONFIG.cup.maxPlayers : cfg.maxPlayers;

    const current = getParticipantArray(match).length;
    const slotsNeeded = Math.max(0, totalTarget - current);

    if (slotsNeeded === 0) return;

    const usedNames = new Set(
      getParticipantArray(match)
        .filter((p) => p.is_bot)
        .map((p) => p.username)
    );
    const availableNames = BOT_NAMES.filter((n) => !usedNames.has(n));

    for (let i = 0; i < slotsNeeded; i++) {
      const botId = `bot_${uuidv4()}`;
      const botName = availableNames[i] || `Bot_${i + 1}`;
      const joinOrder = getParticipantArray(match).length + 1;

      const bot = makeParticipant({
        userId: botId,
        username: botName,
        joinOrder,
        isBot: true,
        mode: match.mode,
      });

      match.participants.set(botId, bot);
    }
  }

  function getActiveBots(match) {
    return getParticipantArray(match).filter(
      (p) => p.is_bot && !p.eliminated && !p.is_spectator
    );
  }

  function assignBotChoices(match) {
    getActiveBots(match).forEach((bot) => {
      bot.choice = ELEMENTS[Math.floor(Math.random() * ELEMENTS.length)];
    });
  }

  // ─────────────────────────────────────────────────────────────
  // CUP MODE (basic bracket scaffold)
  // ─────────────────────────────────────────────────────────────

  function generateCupBracket(match) {
    const participants = getParticipantArray(match);
    const shuffled = participants.sort(() => Math.random() - 0.5);

    match.cup_bracket = {
      round: 1,
      matches: [
        { p1: shuffled[0]?.user_id, p2: shuffled[1]?.user_id, winner: null },
        { p1: shuffled[2]?.user_id, p2: shuffled[3]?.user_id, winner: null },
        { p1: shuffled[4]?.user_id, p2: shuffled[5]?.user_id, winner: null },
      ],
      bye: shuffled[6]?.user_id,
      winners: [],
    };
  }

  // ─────────────────────────────────────────────────────────────
  // GAME PHASE ENGINE
  // ─────────────────────────────────────────────────────────────

  function startGame(matchId) {
    const match = getMatch(matches, matchId);
    if (!match) return;

    match.status = "playing";
    match.round = 0;

    fillWithBots(match);
    if (match.mode === "cup") generateCupBracket(match);

    const botList = getParticipantArray(match)
      .filter((p) => p.is_bot)
      .map((p) => ({ user_id: p.user_id, username: p.username }));

    io.to(matchId).emit("game:started", {
      mode: match.mode,
      bot_count: botList.length,
      bots: botList,
    });

    broadcastLobbyState(io, matchId, match);
    startSelectionPhase(matchId);
  }

  function startSelectionPhase(matchId) {
    const match = getMatch(matches, matchId);
    if (!match || match.status === "finished") return;

    match.round += 1;
    match.status = "selection";

    // Reset choices
    match.participants.forEach((p) => {
      p.choice = null;
    });

    // Bots choose instantly (server-side)
    assignBotChoices(match);

    io.to(matchId).emit("game:phase:selection", {
      round: match.round,
      duration: PHASE_SELECTION_MS,
      players: getAllActiveParticipants(match).map((p) => ({
        user_id: p.user_id,
        username: p.username,
        is_bot: p.is_bot,
      })),
    });

    // Countdown ticks
    let remaining = Math.floor(PHASE_SELECTION_MS / 1000);
    if (match.tickInterval) clearInterval(match.tickInterval);

    match.tickInterval = setInterval(() => {
      remaining -= 1;
      io.to(matchId).emit("game:timer:tick", { remaining });
      if (remaining <= 0) {
        clearInterval(match.tickInterval);
        match.tickInterval = null;
      }
    }, 1000);

    // Resolve after timeout
    if (match.roundTimer) clearTimeout(match.roundTimer);
    match.roundTimer = setTimeout(() => {
      if (match.tickInterval) {
        clearInterval(match.tickInterval);
        match.tickInterval = null;
      }
      resolveRound(matchId);
    }, PHASE_SELECTION_MS);
  }

  function applyRoundOutcome(match, winners, losers, draw) {
    if (!draw) {
      winners.forEach((uid) => {
        const p = match.participants.get(uid);
        if (p && !p.eliminated) p.points += 1;
      });
    }

    if (match.mode === "lives" || match.mode === "cup") {
      losers.forEach((uid) => {
        const p = match.participants.get(uid);
        if (!p || p.eliminated) return;

        p.lives = Math.max(0, p.lives - 1);
        if (p.lives <= 0) {
          p.eliminated = true;
          p.is_spectator = true;

          // Notify only real users
          if (!p.is_bot && p.socket_id) {
            io.to(p.socket_id).emit("game:eliminated", {
              message: "Nyawamu habis! Kamu sekarang menjadi Spectator.",
            });
          }
        }
      });
    }
  }

  function checkGameOver(match) {
    const cfg = MODE_CONFIG[match.mode];

    if (match.mode === "points") {
      const reached = getParticipantArray(match).filter((p) => p.points >= cfg.targetScore);
      if (reached.length > 0) {
        reached.sort((a, b) => b.points - a.points);
        const humanWinner = reached.find((p) => !p.is_bot);
        match.winner_id = (humanWinner || reached[0]).user_id;
        return true;
      }

      const maxRounds = cfg.targetScore * 2 - 1; // first-to-N => max (2N-1) rounds
      if (match.round >= maxRounds) {
        const sorted = getParticipantArray(match).sort((a, b) => b.points - a.points);
        const top = sorted[0];
        if (!top) {
          match.winner_id = null;
          return true;
        }

        const humanWinner = sorted.find((p) => !p.is_bot && p.points === top.points);
        match.winner_id = (humanWinner || top).user_id;
        return true;
      }

      return false;
    }

    // lives & cup
    const stillActive = getAllActiveParticipants(match);
    if (stillActive.length <= 1) {
      match.winner_id = stillActive.length === 1 ? stillActive[0].user_id : null;
      return true;
    }

    return false;
  }

  function resolveRound(matchId) {
    const match = getMatch(matches, matchId);
    if (!match) return;

    match.status = "resolving";
    io.to(matchId).emit("game:phase:resolving", { round: match.round });

    const allActive = getAllActiveParticipants(match);
    const choices = allActive.map((p) => ({ userId: p.user_id, element: p.choice || null }));

    const forfeits = choices.filter((c) => !c.element).map((c) => c.userId);
    const validChoices = choices.filter((c) => c.element);

    let { winners, losers, draw } = resolveChoices(validChoices);

    // Forfeit (no pick) always loses if someone picked
    if (validChoices.length > 0 && forfeits.length > 0) {
      losers = [...new Set([...losers, ...forfeits])];
      draw = false;
    }

    // Build per-user result
    const roundResults = {};
    allActive.forEach((p) => {
      roundResults[p.user_id] = {
        username: p.username,
        is_bot: p.is_bot,
        choice: p.choice,
        result: draw ? "draw" : winners.includes(p.user_id) ? "win" : "lose",
      };
    });

    applyRoundOutcome(match, winners, losers, draw);
    const gameOver = checkGameOver(match);

    setTimeout(() => {
      match.status = gameOver ? "finished" : "result";

      io.to(matchId).emit("game:phase:result", {
        round: match.round,
        results: roundResults,
        draw,
        game_over: gameOver,
        winner_id: match.winner_id,
        participants: getParticipantArray(match).map((p) => ({
          user_id: p.user_id,
          username: p.username,
          is_bot: p.is_bot,
          lives: p.lives,
          points: p.points,
          eliminated: p.eliminated,
          is_spectator: p.is_spectator,
        })),
      });

      broadcastLobbyState(io, matchId, match);

      if (!gameOver) {
        setTimeout(() => startSelectionPhase(matchId), 2000);
      }
    }, PHASE_RESOLUTION_MS);
  }

  // ─────────────────────────────────────────────────────────────
  // SOCKET EVENT HANDLERS
  // ─────────────────────────────────────────────────────────────

  function registerGameHandlers(socket) {
    socket.on("game:choose", ({ match_id, user_id, element }) => {
      const match = getMatch(matches, match_id);
      if (!match || match.status !== "selection") {
        return socket.emit("error", { message: "Bukan fase pemilihan" });
      }

      if (!ELEMENTS.includes(element)) {
        return socket.emit("error", { message: "Elemen tidak valid" });
      }

      const p = match.participants.get(user_id);
      if (!p || p.is_spectator || p.eliminated || p.is_bot) return;

      const changed = Boolean(p.choice);
      p.choice = element;

      socket.emit("game:choice:confirmed", { element });

      io.to(match_id).emit("game:player:chosen", {
        user_id,
        username: p.username,
        changed,
      });

      // NOTE: we intentionally do NOT auto-resolve when everyone picked
      // to allow players to change choice until timer runs out.

      // const allChosen = getActiveHumanPlayers(match).every((hp) => hp.choice);
      // if (allChosen) {
      //   if (match.roundTimer) clearTimeout(match.roundTimer);
      //   resolveRound(match_id);
      // }
    });
  }

  return {
    startGame,
    startSelectionPhase,
    resolveRound,
    registerGameHandlers,
  };
}

module.exports = {
  createGameService,
};
