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

    // LOGIKA TRIGGER ANIMASI VS
    if (match.mode === "cup" && match.cup_bracket && match.status !== "finished" && match.status !== "waiting") {
        if (match.cup_bracket.schedule && match.cup_bracket.schedule[match.cup_bracket.current_match_idx]) {
            const currentMatchId = match.cup_bracket.schedule[match.cup_bracket.current_match_idx].id;
            
            // Jika pindah match, munculkan layar VS!
            if (state.lastCupMatchId !== currentMatchId) {
                state.lastCupMatchId = currentMatchId;
                
                const p1 = match.participants.find(p => p.user_id === match.cup_bracket.active_p1);
                const p2 = match.participants.find(p => p.user_id === match.cup_bracket.active_p2);
                
                if (p1 && p2) ui.showVSOverlay(p1, p2, match.cup_bracket.label);
            }
        }
    }
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
      console.log("[DEBUG] game over data:", data);
      if (data.winner_id) {
        state.lastWinnerId = data.winner_id;
        console.log("🏆 [DEBUG] Pemenang berhasil disimpan dengan ID:", state.lastWinnerId);
      } else if (data.winner && data.winner_id){
        state.lastWinnerId = data.winner.user_id
        console.log("🤝 [DEBUG] Permainan Seri, tidak ada titel yang diberikan.");
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
    state.lastCupMatchId = null;
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