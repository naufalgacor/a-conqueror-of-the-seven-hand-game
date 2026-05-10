export function createSocketClient({ state, ui, MODE_LABELS, actions = {} }) {
  const socket = io();

  socket.on("connect", () => console.log("[Socket] Connected:", socket.id));

  socket.on("lobby:joined", (data) => {
    state.isLeader = data.is_leader;
    state.isSpectator = data.participant.is_spectator;
    state.modeConfig = data.mode_config;
    ui.appendSystem(`👋 Bergabung sebagai ${data.is_leader ? "Leader 👑" : "Pemain"}`);
  });

  socket.on("lobby:state", (match) => {
    ui.renderLobbyState(match);
  });

  socket.on("lobby:leader:changed", (data) => {
    ui.showToast(`👑 ${data.new_leader_username} adalah Leader baru!`);
    ui.appendSystem(`👑 Leader baru: ${data.new_leader_username}`);
  });

  socket.on("lobby:you:are:leader", () => {
    state.isLeader = true;
    ui.showToast("👑 Kamu sekarang menjadi Leader!");
    document.getElementById("leader-panel").classList.remove("hidden");
  });

  socket.on("lobby:left", () => {
    actions.onLobbyLeft?.();
  });

  socket.on("chat:message", (data) => ui.appendChat(data));

  socket.on("game:started", (data) => {
    ui.setGameStartedUI({ mode: data.mode });

    if (data.bot_count > 0) {
      ui.appendSystem(`🤖 ${data.bot_count} bot bergabung: ${data.bots.map((b) => b.username).join(", ")}`);
    }
  });

  socket.on("game:phase:selection", (data) => {
    state.currentPhase = "selection";
    ui.setPhaseUI("selection", data.round);
    ui.lockElements(false);

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
    ui.appendSystem("⚡ Menghitung hasil...");
  });

  socket.on("game:player:chosen", (data) => {
    if (data.changed) {
      ui.appendSystem(`🔁 ${data.username} mengganti pilihan`);
      return;
    }
    ui.appendSystem(`✅ ${data.username} sudah memilih`);
  });

  socket.on("game:choice:confirmed", (data) => {
    ui.setSelectedElement(data.element);
  });

  socket.on("game:phase:result", (data) => {
    state.currentPhase = "result";
    ui.setPhaseUI("result", data.round);
    ui.lockElements(true);

    if (data.game_over) {
      ui.showGameOver(data);
      return;
    }

    const myResult = data.results[state.userId];
    if (myResult) ui.showResultBanner(myResult.result, myResult.choice);

    const lines = Object.values(data.results)
      .map((r) => `${r.username}${r.is_bot ? "🤖" : ""}: ${r.choice || "❌"} → ${r.result}`)
      .join(" | ");
    ui.appendSystem(`📊 ${lines}`);

    if (data.draw) ui.appendSystem("🤝 Ronde ini SERI");
  });

  socket.on("game:eliminated", (data) => {
    state.isSpectator = true;
    ui.showToast("💀 " + data.message, 15000);
    ui.appendSystem("💀 Kamu tereliminasi! Mode Spectator aktif.");
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
  });

  // --- PERBAIKAN: Fungsi dipecah agar tidak bersarang (nested) ---
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