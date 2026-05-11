const { v4: uuidv4 } = require("uuid");

const { MODE_CONFIG } = require("../config/gameConfig");
const {
  getMatch,
  getParticipantArray,
  getHumanParticipants,
} = require("../utils/matchUtils");
const { broadcastLobbyState } = require("../utils/serializeMatch");

function transferLeadership(match, oldLeaderId) {
  const candidates = getParticipantArray(match)
    .filter((p) => !p.is_bot && p.user_id !== oldLeaderId && !p.eliminated)
    .sort((a, b) => a.join_order - b.join_order);

  if (candidates.length === 0) return null;
  match.leader_id = candidates[0].user_id;
  return candidates[0];
}

function safeClearMatchTimers(match) {
  if (!match) return;
  if (match.roundTimer) {
    clearTimeout(match.roundTimer);
    match.roundTimer = null;
  }
  if (match.tickInterval) {
    clearInterval(match.tickInterval);
    match.tickInterval = null;
  }
}

function registerLobbyHandlers({ io, socket, matches, users, gameService }) {
  socket.on("lobby:join", ({ match_id, user_id }) => {
    const match = getMatch(matches, match_id);
    if (!match) return socket.emit("error", { message: "Lobby not found" });

    const p = match.participants.get(user_id);
    if (!p) return socket.emit("error", { message: "Player not registered" });

    p.socket_id = socket.id;
    users.set(socket.id, { user_id, match_id });
    socket.join(match_id);

    broadcastLobbyState(io, match_id, match);

    socket.emit("lobby:joined", {
      user_id,
      match_id,
      is_leader: match.leader_id === user_id,
      mode_config: MODE_CONFIG[match.mode],
      participant: {
        user_id: p.user_id,
        username: p.username,
        join_order: p.join_order,
        is_spectator: p.is_spectator,
        is_bot: p.is_bot,
        lives: p.lives,
        points: p.points,
      },
    });
  });

  socket.on("chat:send", ({ match_id, user_id, message }) => {
    const match = getMatch(matches, match_id);
    if (!match) return;

    const p = match.participants.get(user_id);
    if (!p || p.is_bot) return;

    io.to(match_id).emit("chat:message", {
      id: uuidv4(),
      match_id,
      user_id,
      username: p.username,
      message: String(message).slice(0, 300),
      created_at: new Date().toISOString(),
      is_spectator: p.is_spectator,
    });
  });

  socket.on("spectator:decision", ({ match_id, user_id, decision }) => {
    const match = getMatch(matches, match_id);
    if (!match) return;

    const p = match.participants.get(user_id);
    if (!p || !p.is_spectator) return;

    if (decision === "leave") {
      match.participants.delete(user_id);
      users.delete(socket.id);
      socket.leave(match_id);
      socket.emit("lobby:left");
      broadcastLobbyState(io, match_id, match);
    }
  });

  socket.on("lobby:leave", ({ match_id, user_id }) => {
    const match = getMatch(matches, match_id);
    if (!match) return;

    const p = match.participants.get(user_id);
    if (!p) return;

    const wasLeader = match.leader_id === user_id;

    match.participants.delete(user_id);
    users.delete(socket.id);
    socket.leave(match_id);

    const remainHumans = getHumanParticipants(match);
    if (remainHumans.length === 0) {
      safeClearMatchTimers(match);
      matches.delete(match_id);
      socket.emit("lobby:left");
      return;
    }

    if (wasLeader) {
      const newLeader = transferLeadership(match, user_id);
      if (newLeader) {
        io.to(match_id).emit("lobby:leader:changed", {
          new_leader_id: newLeader.user_id,
          new_leader_username: newLeader.username,
        });
        if (newLeader.socket_id) io.to(newLeader.socket_id).emit("lobby:you:are:leader");
      }
    }

    socket.emit("lobby:left");
    broadcastLobbyState(io, match_id, match);
  });

  socket.on("lobby:kick", ({ match_id, user_id, target_id }) => {
    const match = getMatch(matches, match_id);
    if (!match) return;

    if (match.leader_id !== user_id) return;
    if (user_id === target_id) return;

    const targetParticipant = match.participants.get(target_id);
    if (!targetParticipant) return;

    if (!targetParticipant.is_bot) {
      const targetSocketId = targetParticipant.socket_id;
      if (targetSocketId) {
        const targetSocket = io.sockets.sockets.get(targetSocketId);
        if (targetSocket) {
          targetSocket.emit("lobby:kicked", { message: "You are kicked by the leader." });
          targetSocket.leave(match_id);
        }
        users.delete(targetSocketId);
      }
    }

    match.participants.delete(target_id);

    if (match.status !== "waiting" && match.status !== "finished") {
        gameService.forceCheckState(match_id);
    }

    broadcastLobbyState(io, match_id, match);
  });

  socket.on("lobby:restart", ({ match_id, user_id }) => {
    const match = getMatch(matches, match_id);
    if (!match || match.leader_id !== user_id) return;

    match.status = "waiting";
    match.winner_id = null;
    match.round = 0;
    match.cup_bracket = null;

    safeClearMatchTimers(match);

    match.participants.forEach((p) => {
      const cfg = MODE_CONFIG[match.mode] || MODE_CONFIG.points;
      p.points = 0;
      p.lives = cfg.startingLives;
      p.choice = null;
      p.eliminated = false;
      p.is_spectator = false;
      p.custom_title = null; // PERBAIKAN: Reset gelar juara di sini!
    });

    io.to(match_id).emit("lobby:restarted");
    broadcastLobbyState(io, match_id, match);
  });

  socket.on("disconnect", () => {
    const userData = users.get(socket.id);
    if (!userData) return;
    users.delete(socket.id);

    const { user_id, match_id } = userData;
    const match = getMatch(matches, match_id);
    if (!match) return;

    const p = match.participants.get(user_id);
    if (!p) return;

    const wasLeader = match.leader_id === user_id;

    if (match.status === "waiting") {
      match.participants.delete(user_id);

      const remainHumans = getHumanParticipants(match);
      if (remainHumans.length === 0) {
        safeClearMatchTimers(match);
        matches.delete(match_id);
        return;
      }
    } else {
      p.eliminated = true;
      p.is_spectator = true;
    }

    if (wasLeader) {
      const newLeader = transferLeadership(match, user_id);
      if (newLeader) {
        io.to(match_id).emit("lobby:leader:changed", {
          new_leader_id: newLeader.user_id,
          new_leader_username: newLeader.username,
        });
        if (newLeader.socket_id) io.to(newLeader.socket_id).emit("lobby:you:are:leader");
      } else {
        safeClearMatchTimers(match);
        matches.delete(match_id);
        return;
      }
    }

    broadcastLobbyState(io, match_id, match);
  });
}

module.exports = {
  registerLobbyHandlers,
};