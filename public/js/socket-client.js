export function createSocketClient({ state, ui, MODE_LABELS, actions = {} }) {
  const socket = io();

  socket.on("connect", () => console.log("[Socket] Connected:", socket.id));

  socket.on("lobby:joined", (data) => {
    state.isLeader = data.is_leader;
    state.isSpectator = data.participant.is_spectator;
    state.modeConfig = data.mode_config;
    ui.appendSystem(`👋 Joined as ${data.is_leader ? "Leader 👑" : "Player"}`);
  });

  socket.on("lobby:state", (match) => {
    ui.renderLobbyState(match);
  });

  socket.on("lobby:leader:changed", (data) => {
    ui.showToast(`👑 ${data.new_leader_username} is the new Leader!`);
    ui.appendSystem(`👑 New Leader: ${data.new_leader_username}`);
  });

  socket.on("lobby:you:are:leader", () => {
    state.isLeader = true;
    ui.showToast("👑 You are now Leader!");
    document.getElementById("leader-panel").classList.remove("hidden");
  });

  socket.on("lobby:left", () => {
    actions.onLobbyLeft?.();
  });

  socket.on("chat:message", (data) => ui.appendChat(data));

  socket.on("game:started", (data) => {
    ui.setGameStartedUI({ mode: data.mode });

    if (data.bot_count > 0) {
      ui.appendSystem(`🤖 ${data.bot_count} bots joined: ${data.bots.map((b) => b.username).join(", ")}`);
    }
  });

  socket.on("game:phase:selection", (data) => {
    state.currentPhase = "selection";
    ui.setPhaseUI("selection", data.round);
    ui.lockElements(false);
    
    // PERBAIKAN: Bersihkan sisa ronde sebelumnya (Banner hasil & Highlight elemen)
    ui.hideResultBanner();
    ui.resetElements();

    if (data.duration) {
      ui.startTimer(data.duration / 1000);
    }
  });

  socket.on("game:timer:tick", (data) => {
    const el = document.getElementById("timer-display");
    if (el) el.textContent = data.remaining;
  });

  socket.on("game:phase:resolving", () => {
    state.currentPhase = "resolving";
    ui.setPhaseUI("resolving");
    ui.lockElements(true);
    ui.stopTimer();

    document.getElementById("timer-display").textContent = "⚡";
    ui.appendSystem("⚡ Calculating result...");
  });

  socket.on("game:player:chosen", (data) => {
    if (data.changed) {
      ui.appendSystem(`🔁 ${data.username} changed choice`);
      return;
    }
    ui.appendSystem(`✅ ${data.username} already chose`);
  });

  socket.on("game:choice:confirmed", (data) => {
    ui.setSelectedElement(data.element);
  });

  socket.on("game:phase:result", (data) => {
    state.currentPhase = "result";
    ui.setPhaseUI("result", data.round);
    ui.lockElements(true);

    if (data.game_over) {
      console.log("[DEBUG] game over data:", data);
      if (data.winner_id) {
        state.lastWinnerId = data.winner_id;
        console.log("🏆 [DEBUG] Winner successfully saved with ID:", state.lastWinnerId);
      } else if (data.winner && data.winner_id){
        state.lastWinnerId = data.winner.user_id;
        console.log("🤝 [DEBUG] Game Draw, no title given.");
      }
      ui.showGameOver(data);
      return;
    }

    const myResult = data.results[state.userId];
    if (myResult) ui.showResultBanner(myResult.result, myResult.choice);

    const lines = Object.values(data.results)
      .map((r) => `${r.username}${r.is_bot ? "🤖" : ""}: ${r.choice || "❌"} → ${r.result}`)
      .join(" | ");
    ui.appendSystem(`📊 ${lines}`);

    if (data.draw) ui.appendSystem("🤝 This round is a DRAW");
  });

  socket.on("game:eliminated", (data) => {
    state.isSpectator = true;
    ui.showToast("💀 " + data.message, 15000);
    ui.appendSystem("💠 You are eliminated! Spectator mode active.");
  });

  socket.on("error", (data) => ui.showToast("❌ " + data.message));

  socket.on("lobby:kicked", (data) => {
    ui.showToast("❌ " + data.message, 5000);
    ui.setLobbyLeftUI(); 
    if (actions.onLobbyLeft) actions.onLobbyLeft();
  });

  socket.on("lobby:restarted", () => {
    ui.handleLobbyRestarted(); 
    state.currentPhase = "waiting";
    state.myChoice = null;
    ui.resetElements(); 
    // PERBAIKAN: Bersihkan banner di awal permainan baru
    ui.hideResultBanner();
  });

  window.requestKickPlayer = (targetId, targetUsername) => {
    ui.showKickModal(targetUsername, () => {
      socket.emit("lobby:kick", {
        match_id: state.matchId,
        user_id: state.userId,
        target_id: targetId
      });
    });
  };

  window.requestRestartLobby = () => {
    socket.emit("lobby:restart", {
      match_id: state.matchId,
      user_id: state.userId
    });
  };

  return socket;
}