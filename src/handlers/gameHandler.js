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
  getAllActiveParticipants,
} = require("../utils/matchUtils");
const { broadcastLobbyState } = require("../utils/serializeMatch");

function createGameService({ io, matches }) {

  function fillWithBots(match) {
    const cfg = MODE_CONFIG[match.mode];
    if (!cfg) return;

    const totalTarget = match.mode === "cup" ? 7 : cfg.maxPlayers;
    const current = getParticipantArray(match).length;
    const slotsNeeded = Math.max(0, totalTarget - current);

    if (slotsNeeded === 0) return;

    const usedNames = new Set(getParticipantArray(match).filter((p) => p.is_bot).map((p) => p.username));
    const availableNames = BOT_NAMES.filter((n) => !usedNames.has(n));

    for (let i = 0; i < slotsNeeded; i++) {
      const botId = `bot_${uuidv4()}`;
      const botName = availableNames[i] || `Bot_${i + 1}`;
      const joinOrder = getParticipantArray(match).length + 1;

      const bot = makeParticipant({
        userId: botId, username: botName, joinOrder, isBot: true, mode: match.mode,
      });
      match.participants.set(botId, bot);
    }
  }

  function getActiveBots(match) {
    return getParticipantArray(match).filter((p) => p.is_bot && !p.eliminated && !p.is_spectator);
  }

  function assignBotChoices(match) {
    const activeBots = getActiveBots(match);
    if (match.mode === "cup" && match.cup_bracket) {
         const { active_p1, active_p2 } = match.cup_bracket;
         activeBots.forEach((bot) => {
             if(bot.user_id === active_p1 || bot.user_id === active_p2) {
                  bot.choice = ELEMENTS[Math.floor(Math.random() * ELEMENTS.length)];
             }
         });
    } else {
         activeBots.forEach((bot) => {
            bot.choice = ELEMENTS[Math.floor(Math.random() * ELEMENTS.length)];
         });
    }
  }

  function generateCupBracket(match) {
    const participants = getParticipantArray(match);
    const shuffled = participants.sort(() => Math.random() - 0.5);
    const pIds = shuffled.map(p => p.user_id);

    match.cup_bracket = {
      round: 1, label: "Putaran 1", slots: pIds, active_p1: pIds[0], active_p2: pIds[1],
      schedule: [
        { id: 1, r: 1, p1: pIds[0], p2: pIds[1], w: null },
        { id: 2, r: 1, p1: pIds[2], p2: pIds[3], w: null },
        { id: 3, r: 1, p1: pIds[4], p2: pIds[5], w: null },
        { id: 4, r: 1, p1: pIds[6], p2: "BYE", w: pIds[6] },
        { id: 5, r: 2, p1: null, p2: null, w: null },
        { id: 6, r: 2, p1: null, p2: pIds[6], w: null },
        { id: 7, r: 3, p1: null, p2: null, w: null }
      ],
      current_match_idx: 0
    };
  }
  
  function advanceCupMatchup(match) {
      let bracket = match.cup_bracket;
      if (!bracket || !bracket.schedule) return;

      let cm = bracket.schedule[bracket.current_match_idx];

      while (cm && cm.w) {
          if (cm.id === 1 && bracket.schedule[4]) bracket.schedule[4].p1 = cm.w;
          if (cm.id === 2 && bracket.schedule[4]) bracket.schedule[4].p2 = cm.w;
          if (cm.id === 3 && bracket.schedule[5]) bracket.schedule[5].p1 = cm.w;
          if (cm.id === 5 && bracket.schedule[6]) bracket.schedule[6].p1 = cm.w;
          if (cm.id === 6 && bracket.schedule[6]) bracket.schedule[6].p2 = cm.w;

          bracket.current_match_idx++;
          cm = bracket.schedule[bracket.current_match_idx];
          if (cm && cm.p2 === "BYE") cm.w = cm.p1;
      }

      if (cm) {
          bracket.round = cm.r;
          bracket.label = cm.r === 1 ? "Putaran 1" : cm.r === 2 ? "Semifinal" : "Grand Final";
          bracket.active_p1 = cm.p1;
          bracket.active_p2 = cm.p2;
      } else {
          match.winner_id = bracket.schedule[6] ? bracket.schedule[6].w : null; 
          match.status = "finished";
      }
  }

  function checkGameOver(match) {
    const cfg = MODE_CONFIG[match.mode];
    const stillActive = getAllActiveParticipants(match);

    if (stillActive.length <= 1) {
      match.winner_id = stillActive.length === 1 ? stillActive[0].user_id : null;
      if(match.winner_id) {
           const winner = match.participants.get(match.winner_id);
           if(!winner.is_bot) winner.custom_title = "I won my last match";
      }
      return true;
    }

    if (match.mode === "points") {
      const reached = getParticipantArray(match).filter((p) => p.points >= cfg.targetScore);
      if (reached.length > 0) {
        reached.sort((a, b) => b.points - a.points);
        const humanWinner = reached.find((p) => !p.is_bot);
        match.winner_id = (humanWinner || reached[0]).user_id;
        return true;
      }
      const maxRounds = cfg.targetScore * 2 - 1; 
      if (match.round >= maxRounds) {
        const sorted = getParticipantArray(match).sort((a, b) => b.points - a.points);
        const top = sorted[0];
        if (!top) { match.winner_id = null; return true; }
        const humanWinner = sorted.find((p) => !p.is_bot && p.points === top.points);
        match.winner_id = (humanWinner || top).user_id;
        return true;
      }
      return false;
    }

    if (match.mode === "cup") {
        let bracket = match.cup_bracket;
        if (!bracket || !bracket.schedule) return false;
        
        let cm = bracket.schedule[bracket.current_match_idx];
        if (!cm) return false;

        let p1 = match.participants.get(bracket.active_p1);
        let p2 = match.participants.get(bracket.active_p2);
        
        if (!p1 || p1.eliminated || !p2 || p2.eliminated) {
            cm.w = (!p1 || p1.eliminated) ? bracket.active_p2 : bracket.active_p1;
            
            const winnerOfMatchup = match.participants.get(cm.w);
            if (winnerOfMatchup) {
                winnerOfMatchup.lives = 3; 
                winnerOfMatchup.eliminated = false;
            }

            advanceCupMatchup(match);
            if (match.status === "finished") {
                const absoluteWinner = match.participants.get(match.winner_id);
                if(absoluteWinner && !absoluteWinner.is_bot) absoluteWinner.custom_title = "I won my last cup";
                return true;
            }
        }
        return false;
    }
    return false;
  }

  function resolveRound(matchId) {
    const match = getMatch(matches, matchId);
    if (!match) return;

    match.status = "resolving";
    let roundLabel = match.round.toString();
    
    if (match.mode === "cup") {
        if (match.cup_bracket && match.cup_bracket.schedule && match.cup_bracket.schedule[match.cup_bracket.current_match_idx]) {
            roundLabel = `${match.cup_bracket.label} (Match ${match.cup_bracket.schedule[match.cup_bracket.current_match_idx].id})`;
        }
    }

    io.to(matchId).emit("game:phase:resolving", { round: roundLabel });

    let activeFighters = [];
    if (match.mode === "cup" && match.cup_bracket) {
         const p1 = match.participants.get(match.cup_bracket.active_p1);
         const p2 = match.participants.get(match.cup_bracket.active_p2);
         if(p1) activeFighters.push(p1);
         if(p2) activeFighters.push(p2);
    } else {
         activeFighters = getAllActiveParticipants(match);
    }

    const choices = activeFighters.map((p) => ({ userId: p.user_id, element: p.choice || null }));
    const forfeits = choices.filter((c) => !c.element).map((c) => c.userId);
    const validChoices = choices.filter((c) => c.element);

    let { winners, losers, draw } = resolveChoices(validChoices);
    if (validChoices.length > 0 && forfeits.length > 0) {
      losers = [...new Set([...losers, ...forfeits])];
      draw = false;
    }
    if(validChoices.length === 0) draw = true;

    const roundResults = {};
    activeFighters.forEach((p) => {
      roundResults[p.user_id] = { username: p.username, is_bot: p.is_bot, choice: p.choice, result: draw ? "draw" : winners.includes(p.user_id) ? "win" : "lose" };
    });

    applyRoundOutcome(match, winners, losers, draw);
    const gameOver = checkGameOver(match);
    if (gameOver) match.status = "finished";

    setTimeout(() => {
      if(!gameOver) match.status = "result";
      io.to(matchId).emit("game:phase:result", {
        round: roundLabel, results: roundResults, draw, game_over: gameOver, winner_id: match.winner_id,
        participants: getParticipantArray(match).map((p) => ({ user_id: p.user_id, username: p.username, is_bot: p.is_bot, lives: p.lives, points: p.points, eliminated: p.eliminated, is_spectator: p.is_spectator })),
      });
      broadcastLobbyState(io, matchId, match);
      if (!gameOver) {
          if (match.roundTimer) clearTimeout(match.roundTimer);
          match.roundTimer = setTimeout(() => startSelectionPhase(matchId), 2500);
      }
    }, PHASE_RESOLUTION_MS);
  }

  function startSelectionPhase(matchId) {
    const match = getMatch(matches, matchId);
    if (!match || match.status === "finished" || match.status === "waiting") return;

    match.round += 1;
    match.status = "selection";
    match.participants.forEach((p) => p.choice = null);
    assignBotChoices(match);

    let roundLabel = match.round.toString();
    let playersInvolved = [];
    
    if (match.mode === "cup") {
        if (match.cup_bracket && match.cup_bracket.schedule && match.cup_bracket.schedule[match.cup_bracket.current_match_idx]) {
             roundLabel = `${match.cup_bracket.label} (Match ${match.cup_bracket.schedule[match.cup_bracket.current_match_idx].id})`;
             const p1 = match.participants.get(match.cup_bracket.active_p1);
             const p2 = match.participants.get(match.cup_bracket.active_p2);
             if(p1) playersInvolved.push({user_id: p1.user_id, username: p1.username, is_bot: p1.is_bot});
             if(p2) playersInvolved.push({user_id: p2.user_id, username: p2.username, is_bot: p2.is_bot});
        }
    } else {
         playersInvolved = getAllActiveParticipants(match).map((p) => ({ user_id: p.user_id, username: p.username, is_bot: p.is_bot }));
    }

    io.to(matchId).emit("game:phase:selection", { round: roundLabel, duration: PHASE_SELECTION_MS, players: playersInvolved });

    let remaining = Math.floor(PHASE_SELECTION_MS / 1000);
    if (match.tickInterval) clearInterval(match.tickInterval);
    match.tickInterval = setInterval(() => {
      remaining -= 1;
      io.to(matchId).emit("game:timer:tick", { remaining });
      if (remaining <= 0) { clearInterval(match.tickInterval); match.tickInterval = null; }
    }, 1000);

    if (match.roundTimer) clearTimeout(match.roundTimer);
    match.roundTimer = setTimeout(() => {
      if (match.tickInterval) { clearInterval(match.tickInterval); match.tickInterval = null; }
      resolveRound(matchId);
    }, PHASE_SELECTION_MS);
  }

  function applyRoundOutcome(match, winners, losers, draw) {
    if (!draw) winners.forEach((uid) => { const p = match.participants.get(uid); if (p && !p.eliminated) p.points += 1; });
    if (match.mode === "lives" || match.mode === "cup") {
      losers.forEach((uid) => {
        const p = match.participants.get(uid);
        if (!p || p.eliminated) return;
        p.lives = Math.max(0, p.lives - 1);
        if (p.lives <= 0) {
          p.eliminated = true; p.is_spectator = true;
          if (!p.is_bot && p.socket_id) io.to(p.socket_id).emit("game:eliminated", { message: "Nyawamu habis! Kamu sekarang menonton." });
        }
      });
    }
  }

  function startGame(matchId) {
    const match = getMatch(matches, matchId);
    if (!match) return;

    match.status = "playing";
    match.round = 0;

    fillWithBots(match);
    if (match.mode === "cup") generateCupBracket(match);

    const botList = getParticipantArray(match).filter((p) => p.is_bot).map((p) => ({ user_id: p.user_id, username: p.username }));

    io.to(matchId).emit("game:started", { mode: match.mode, bot_count: botList.length, bots: botList });
    broadcastLobbyState(io, matchId, match);
    
    if (match.roundTimer) clearTimeout(match.roundTimer);

    if (match.mode === "cup") {
        match.roundTimer = setTimeout(() => startSelectionPhase(matchId), 4000);
    } else {
        startSelectionPhase(matchId);
    }
  }

  function forceCheckState(matchId) {
      const match = getMatch(matches, matchId);
      if (!match || match.status === "waiting") return;
      if (checkGameOver(match)) {
          match.status = "finished";
          io.to(matchId).emit("game:phase:result", { 
              game_over: true, 
              winner_id: match.winner_id,
              participants: getParticipantArray(match).map(p => ({ 
                  user_id: p.user_id, username: p.username, lives: p.lives, points: p.points, eliminated: p.eliminated, is_bot: p.is_bot
              }))
          });
      }
  }

  function registerGameHandlers(socket) {
    socket.on("game:choose", ({ match_id, user_id, element }) => {
      const match = getMatch(matches, match_id);
      if (!match || match.status !== "selection") return;
      if (!ELEMENTS.includes(element)) return socket.emit("error", { message: "Elemen tidak valid" });
      const p = match.participants.get(user_id);
      if (!p || p.is_spectator || p.eliminated || p.is_bot) return;
      
      if (match.mode === "cup" && match.cup_bracket) {
           if (user_id !== match.cup_bracket.active_p1 && user_id !== match.cup_bracket.active_p2) return;
      }
      const changed = Boolean(p.choice);
      p.choice = element;
      socket.emit("game:choice:confirmed", { element });
      io.to(match_id).emit("game:player:chosen", { user_id, username: p.username, changed });
    });
  }

  return {
    startGame,
    startSelectionPhase,
    resolveRound,
    registerGameHandlers,
    forceCheckState,
    
    // --- KHUSUS TESTING ---
    _applyRoundOutcome: applyRoundOutcome,
    _checkGameOver: checkGameOver
  };
}

module.exports = { createGameService };