export function createUIManager({ state, ELEMENTS, MODE_LABELS, MODE_INFO }) {
  // ─────────────────────────────────────────────────────────────
  // SCREENS
  // ─────────────────────────────────────────────────────────────
  function showScreen(id) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    document.getElementById(`screen-${id}`)?.classList.add("active");
  }

  // ─────────────────────────────────────────────────────────────
  // TOAST & ERROR
  // ─────────────────────────────────────────────────────────────
  let toastTimer;
  function showToast(msg, ms = 3000) {
    const t = document.getElementById("toast");
    document.getElementById("toast-text").textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add("hidden"), ms);
  }

  function showError(msg) {
    const el = document.getElementById("home-error");
    el.textContent = msg;
    el.classList.remove("hidden");
    el.classList.add("animate-shake");
    setTimeout(() => {
      el.classList.add("hidden");
      el.classList.remove("animate-shake");
    }, 3500);
  }

  // ─────────────────────────────────────────────────────────────
  // COPY LOBBY ID
  // ─────────────────────────────────────────────────────────────
  function copyLobbyId() {
    if (!state.matchId) return;

    const btn = document.getElementById("btn-copy-id");
    const icon = document.getElementById("copy-icon");
    const label = document.getElementById("copy-label");

    navigator.clipboard
      .writeText(state.matchId)
      .then(() => {
        btn.classList.add("copy-btn-success");
        icon.textContent = "✅";
        label.textContent = "Tersalin!";
        showToast("✅ Lobby ID berhasil disalin!");
        setTimeout(() => {
          btn.classList.remove("copy-btn-success");
          icon.textContent = "📋";
          label.textContent = "Copy ID";
        }, 2500);
      })
      .catch(() => {
        const tmp = document.createElement("input");
        tmp.value = state.matchId;
        document.body.appendChild(tmp);
        tmp.select();
        document.execCommand("copy");
        document.body.removeChild(tmp);
        btn.classList.add("copy-btn-success");
        icon.textContent = "✅";
        label.textContent = "Tersalin!";
        showToast("✅ Lobby ID disalin (fallback)");
        setTimeout(() => {
          btn.classList.remove("copy-btn-success");
          icon.textContent = "📋";
          label.textContent = "Copy ID";
        }, 2500);
      });
  }

  function showVSOverlay(p1, p2, roundLabel) {
      const overlay = document.getElementById("vs-overlay");
      document.getElementById("vs-round-label").textContent = roundLabel || "DUEL BARU";
      
      document.getElementById("vs-p1-name").textContent = p1.username;
      document.getElementById("vs-p1-avatar").textContent = p1.is_bot ? "🤖" : "👤";
      
      document.getElementById("vs-p2-name").textContent = p2.username;
      document.getElementById("vs-p2-avatar").textContent = p2.is_bot ? "🤖" : "👤";

      overlay.classList.remove("hidden");
      
      // Sembunyikan setelah 3.5 detik
      setTimeout(() => {
          overlay.classList.add("hidden");
      }, 3500);
  }

  // ─────────────────────────────────────────────────────────────
  // KICK MODAL
  // ─────────────────────────────────────────────────────────────
  let onConfirmKickCallback = null;

  function showKickModal(username, onConfirm) {
    document.getElementById("kick-modal-username").textContent = username;
    document.getElementById("kick-modal").classList.remove("hidden");
    onConfirmKickCallback = onConfirm; // Simpan aksi yang mau dijalankan
  }

  function closeKickModal() {
    document.getElementById("kick-modal").classList.add("hidden");
    onConfirmKickCallback = null;
  }

  // Event listener untuk tombol Batal dan Konfirmasi di modal
  document.getElementById("btn-cancel-kick")?.addEventListener("click", closeKickModal);
  document.getElementById("btn-confirm-kick")?.addEventListener("click", () => {
    if (onConfirmKickCallback) onConfirmKickCallback(); // Jalankan emit socket
    closeKickModal(); // Tutup modal setelah klik
  });

  // ─────────────────────────────────────────────────────────────
  // LOBBY UI
  // ─────────────────────────────────────────────────────────────
  function renderLobbyState(match) {
    const humanCount = match.participants.filter((p) => !p.is_bot).length;
    const botCount = match.participants.filter((p) => p.is_bot).length;
    const maxP = match.mode_config?.maxPlayers || "?";
    document.getElementById("lobby-player-count").textContent =
      `${humanCount}/${maxP} Pemain${botCount > 0 ? ` + ${botCount} Bot` : ""}`;

    const modeInfo = MODE_INFO[match.mode] || "";
    document.getElementById("current-mode-display").textContent =
      `${MODE_LABELS[match.mode] || match.mode} — ${modeInfo}`;

    const topBadge = document.getElementById("top-mode-badge");
    if (topBadge) {
        topBadge.textContent = MODE_LABELS[match.mode] || match.mode;
        topBadge.classList.remove("hidden");
    }

    const me = match.participants.find((p) => p.user_id === state.userId);
    if (me) {
      state.isSpectator = me.is_spectator;
      state.isLeader = match.leader_id === state.userId;
    }
    if (state.isLeader) {
      const modeSelect = document.getElementById("mode-select");
      const modeBadge = document.getElementById("mode-info-badge");
      
      if (modeSelect) {
          modeSelect.value = match.mode;
          
          // Hitung total pemain (bisa manusia + bot, atau manusia saja tergantung kebutuhan)
          const totalPlayers = match.participants.length; 

          if (totalPlayers > 2) {
              // Kunci dropdown jika pemain > 2
              modeSelect.disabled = true;
              modeSelect.classList.add("opacity-50", "cursor-not-allowed");
              
              // Ubah teks badge untuk memberi tahu alasan kenapa dikunci
              if (modeBadge) {
                  modeBadge.textContent = "🔒 Terkunci! Sisakan 2 pemain untuk ganti mode (Keluar atau Kick).";
                  modeBadge.classList.add("text-red-400"); // Beri warna merah/peringatan
              }
          } else {
              // Buka kunci jika pemain <= 2
              modeSelect.disabled = false;
              modeSelect.classList.remove("opacity-50", "cursor-not-allowed");
              
              if (modeBadge) {
                  modeBadge.textContent = MODE_INFO[match.mode] || "";
                  modeBadge.classList.remove("text-red-400");
              }
          }
      }
    }
    const isCupMode = match.mode === "cup" && match.cup_bracket;
    const isGameRunning = match.status !== "waiting" && match.status !== "finished";
    
    if (isCupMode && isGameRunning) {
        renderCupPlayers(match);
    } else {
        // Jika mode normal atau sedang di lobby, render list pemain biasa
        renderIngamePlayers(match);
    }

    // Leader panel tetap hanya muncul di waiting
    document.getElementById("leader-panel").classList.toggle("hidden", !(state.isLeader && match.status === "waiting"));

    renderPlayerList(match);
  }

  function renderPlayerList(match) {
    document.getElementById("players-list").innerHTML = match.participants
      .map((p) => {
        const isMe = p.user_id === state.userId;
        const isLeader = p.user_id === match.leader_id;
        const isBot = p.is_bot;
        const titleHtml = p.custom_title
          ? `<div class="text-[9px] text-neon-gold font-bold uppercase tracking-widest">${p.custom_title}</div>`
          : "";

        // --- TAMBAHAN KODE TOMBOL KICK ---
        const showKickBtn = state.isLeader && !isMe;
        const safeName = p.username.replace(/'/g, "\\'"); // Berjaga-jaga kalau ada user pakai tanda kutip di namanya
        const kickBtnHtml = showKickBtn 
          ? `<button onclick="window.requestKickPlayer('${p.user_id}', '${safeName}')" class="ml-auto bg-red-500/20 hover:bg-red-500/40 text-red-400 border border-red-500/50 rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors">Kick</button>`
          : "";
        // ---------------------------------

        return `
      <div class="flex items-center gap-2.5 rounded-xl px-3 py-2
        ${isMe ? "bg-neon-cyan/10 border border-neon-cyan/25" : "bg-slate-900/40 border border-transparent"}">
        <div class="w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0
          ${isBot ? "bg-slate-800" : isMe ? "bg-neon-cyan/25" : "bg-slate-800"}">
          ${isBot ? "🤖" : isLeader ? "👑" : "👤"}
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-sm font-semibold truncate ${isMe ? "text-neon-cyan" : isBot ? "text-slate-500" : "text-slate-200"}">
            ${titleHtml}${p.username}${isMe ? " (Kamu)" : ""}${isBot ? " 🤖" : ""}
          </div>
          <div class="text-xs text-slate-600">
            ${isLeader && !isBot ? "👑 Leader" : p.is_spectator ? "👁 Spectator" : isBot ? "Auto" : "Pemain"}
            ${match.status !== "waiting" ? ` · 🏅${p.points} · ❤️${p.lives}` : ""}
          </div>
        </div>
        ${p.eliminated ? '<span class="text-xs text-red-500 flex-shrink-0">💀</span>' : kickBtnHtml}
      </div>`;
      })
      .join("");
  }

  function renderIngamePlayers(match) {
    document.getElementById("ingame-players").innerHTML = match.participants
      .map((p) => {
        const isMe = p.user_id === state.userId;
        const titleHtml = p.custom_title ? `<div class="text-[9px] text-neon-gold font-bold uppercase tracking-widest">${p.custom_title}</div>` : "";
        const hasChosen = p.choice && p.choice !== "";
        const revChoice = (match.status === "result" || match.status === "finished") ? p.choice : null;
        const elemEmoji = revChoice ? ELEMENTS.find((e) => e.name === revChoice)?.emoji || "?" : null;

        return `
      <div class="glass rounded-xl p-2.5 text-center transition-all
        ${p.eliminated ? "opacity-35" : ""}
        ${isMe ? "border border-neon-cyan/30" : ""}
        ${p.is_bot ? "border border-slate-700/60" : ""}">
        <div class="text-lg mb-0.5">
          ${p.is_spectator ? "👁" : hasChosen ? "✅" : elemEmoji || (p.is_bot ? "🤖" : "🤔")}
        </div>
        <div class="text-xs font-semibold truncate ${isMe ? "text-neon-cyan" : p.is_bot ? "text-slate-500" : "text-slate-300"}">
          ${titleHtml}
          ${p.username.slice(0, 9)}
        </div>
        <div class="text-xs text-slate-500">
          🏅${p.points} &nbsp; ❤️${p.lives}
        </div>
      </div>`;
      })
      .join("");
  }

  // Lacak match yang sedang ditampilkan di popup
  let _lastCupMatchKey = null;
  let _cupPopupTimer = null;

  function showCupMatchPopup(match) {
      const bracket = match.cup_bracket;
      if (!bracket) return;

      const matchKey = `${bracket.active_p1}-${bracket.active_p2}`;
      if (_lastCupMatchKey === matchKey) return; // Match sama, jangan tampil lagi
      _lastCupMatchKey = matchKey;

      const p1 = match.participants.find(x => x.user_id === bracket.active_p1);
      const p2 = match.participants.find(x => x.user_id === bracket.active_p2);
      if (!p1 || !p2) return;

      const currentMatchData = bracket.schedule?.find(m =>
          m.p1 === bracket.active_p1 && m.p2 === bracket.active_p2);

      const popup   = document.getElementById("cup-match-popup");
      const label   = document.getElementById("cup-popup-match-label");
      const fighters = document.getElementById("cup-popup-fighters");
      const bar     = document.getElementById("cup-popup-bar");
      if (!popup) return;

      label.textContent = currentMatchData?.id ? `Match ${currentMatchData.id}` : "Match Sekarang";

      fighters.innerHTML = `
        <div class="flex-1 text-center">
          <div class="text-2xl mb-1">${p1.is_bot ? '🤖' : '👤'}</div>
          <div class="text-xs font-semibold text-slate-100 truncate">${p1.username}</div>
          <div class="text-[10px] text-red-400 mt-0.5">❤️ ${p1.lives} HP</div>
        </div>
        <div class="flex-shrink-0">
          <span class="text-sm font-black italic text-red-500 bg-slate-900/80 px-2 py-0.5 rounded">VS</span>
        </div>
        <div class="flex-1 text-center">
          <div class="text-2xl mb-1">${p2.is_bot ? '🤖' : '👤'}</div>
          <div class="text-xs font-semibold text-slate-100 truncate">${p2.username}</div>
          <div class="text-[10px] text-red-400 mt-0.5">❤️ ${p2.lives} HP</div>
        </div>
      `;

      // Reset countdown bar
      bar.style.transition = "none";
      bar.style.width = "100%";
      popup.classList.remove("hidden");
      requestAnimationFrame(() => requestAnimationFrame(() => {
          bar.style.transition = "width 10s linear";
          bar.style.width = "0%";
      }));

      clearTimeout(_cupPopupTimer);
      _cupPopupTimer = setTimeout(() => popup.classList.add("hidden"), 10000);
  }

  function renderCupPlayers(match) {
      const bracket = match.cup_bracket;
      if (!bracket || !bracket.schedule) {
          document.getElementById("cup-bracket-container")?.classList.add("hidden");
          renderIngamePlayers(match); return;
      }

      // Tampilkan bagan di sidebar
      const bracketContainer = document.getElementById("cup-bracket-container");
      if (bracketContainer) bracketContainer.classList.remove("hidden");

      // Tampilkan popup jika ada match baru
      showCupMatchPopup(match);

      // Render semua pertandingan di ronde ini ke dalam sidebar
      const matchesInRound = bracket.schedule.filter(m => m.r === bracket.round);
      document.getElementById("cup-bracket-list").innerHTML = matchesInRound.map(m => {
          const p1 = match.participants.find(x => x.user_id === m.p1);
          const p2 = match.participants.find(x => x.user_id === m.p2);
          const n1 = p1 ? p1.username : (m.p1 === "BYE" ? "BYE" : "???");
          const n2 = p2 ? p2.username : (m.p2 === "BYE" ? "BYE" : "???");
          const isActive = m.p1 === bracket.active_p1 && m.p2 === bracket.active_p2;
          const isFinished = Boolean(m.w);
          const p1Won = m.w === m.p1;
          const p2Won = m.w === m.p2;

          const cardClass = isActive
              ? "border border-neon-cyan/60 bg-cyan-950/40 shadow-[0_0_8px_rgba(0,245,255,0.2)]"
              : isFinished
                  ? "border border-slate-700/30 bg-slate-800/10 opacity-50"
                  : "border border-slate-700/40 bg-slate-800/20";

          const p1Cls = isFinished && !p1Won ? "text-slate-500 line-through" : p1Won ? "text-neon-gold font-bold" : "text-slate-200";
          const p2Cls = isFinished && !p2Won ? "text-slate-500 line-through" : p2Won ? "text-neon-gold font-bold" : "text-slate-200";

          let badge = "";
          if (isActive)    badge = `<span class="text-[9px] text-neon-cyan animate-pulse">⚔️ Berduel</span>`;
          else if (isFinished) {
              const wn = match.participants.find(x => x.user_id === m.w)?.username || "";
              badge = `<span class="text-[9px] text-neon-gold">🏆 ${wn}</span>`;
          } else badge = `<span class="text-[9px] text-slate-600">⏳ Menunggu</span>`;

          return `
          <div class="rounded-lg px-2.5 py-2 ${cardClass} transition-all">
            <div class="flex items-center gap-2 text-[11px]">
              <span class="${p1Cls} flex-1 truncate text-right">${p1Won ? "👑 " : ""}${n1}${p1?.is_bot ? " 🤖" : ""}</span>
              <span class="text-red-500 font-black italic flex-shrink-0 text-[10px]">VS</span>
              <span class="${p2Cls} flex-1 truncate">${n2}${p2?.is_bot ? " 🤖" : ""}${p2Won ? " 👑" : ""}</span>
            </div>
            <div class="text-center mt-1">${badge}</div>
          </div>`;
      }).join("");

      // Render pemain aktif di area tengah
      const activePlayers = [
        match.participants.find(p => p.user_id === bracket.active_p1),
        match.participants.find(p => p.user_id === bracket.active_p2)
      ].filter(Boolean);

      document.getElementById("ingame-players").innerHTML = activePlayers.map((p) => {
          const isMe = p.user_id === state.userId;
          const hasChosen = p.choice && p.choice !== "";
          const revChoice = (match.status === "result" || match.status === "finished") ? p.choice : null;
          const elemEmoji = revChoice ? ELEMENTS.find((e) => e.name === revChoice)?.emoji || "?" : null;

          return `
        <div class="glass rounded-xl p-4 text-center transition-all ${isMe ? "border border-neon-cyan/40" : ""} ${p.is_bot ? "border border-slate-700/60" : ""}">
          <div class="text-3xl mb-2">${hasChosen ? "✅" : elemEmoji || (p.is_bot ? "🤖" : "🤔")}</div>
          <div class="text-sm font-bold truncate ${isMe ? "text-neon-cyan" : p.is_bot ? "text-slate-500" : "text-white"}">
            ${p.username.slice(0, 10)}
          </div>
          <div class="text-xs text-slate-400 mt-1">❤️ ${p.lives}</div>
        </div>`;
      }).join("");
  }


  // ─────────────────────────────────────────────────────────────
  // ELEMENT BUTTONS
  // ─────────────────────────────────────────────────────────────
  function buildElementGrid() {
    document.getElementById("elements-grid").innerHTML = ELEMENTS
      .map(
        (el) => `
    <button class="elem-btn elem-${el.name}" id="btn-elem-${el.name}"
      onclick="chooseElement('${el.name}')">
      <span class="text-2xl">${el.emoji}</span>
      <span>${el.name}</span>
    </button>`
      )
      .join("");
  }

  function setSelectedElement(name) {
    document.querySelectorAll(".elem-btn").forEach((b) => {
      b.classList.add("opacity-40");
      b.classList.remove("selected", "ring-2", "ring-neon-cyan", "scale-105");
    });

    const sel = document.getElementById(`btn-elem-${name}`);
    if (sel) {
      sel.classList.remove("opacity-40");
      sel.classList.add("selected", "ring-2", "ring-neon-cyan", "scale-105");
    }
  }

  function lockElements(lock) {
    document.querySelectorAll(".elem-btn").forEach((b) => {
      b.disabled = lock;
      lock ? b.classList.add("opacity-40") : b.classList.remove("opacity-40", "selected");
    });
  }

  function resetElements() {
    state.myChoice = null;
    document.querySelectorAll(".elem-btn").forEach((b) => {
      b.disabled = false;
      b.classList.remove("opacity-40", "selected");
    });
  }

  // ─────────────────────────────────────────────────────────────
  // TIMER
  // ─────────────────────────────────────────────────────────────
  const CIRCUMFERENCE = 2 * Math.PI * 36;

  function startTimer(totalSec) {
    clearInterval(state.timerInterval);
    const path = document.getElementById("timerPath");
    const disp = document.getElementById("timer-display");
    let rem = totalSec;

    const update = () => {
      disp.textContent = rem;
      path.style.strokeDashoffset = CIRCUMFERENCE * (1 - rem / totalSec);
      path.style.stroke = rem <= 2 ? "#ff0080" : rem <= 3 ? "#ffd700" : "#00f5ff";
    };
    update();
    state.timerInterval = setInterval(() => {
      rem--;
      update();
      if (rem <= 0) clearInterval(state.timerInterval);
    }, 1000);
  }

  function stopTimer() {
    clearInterval(state.timerInterval);
    document.getElementById("timerPath").style.strokeDashoffset = 0;
    document.getElementById("timer-display").textContent = "—";
  }

  // ─────────────────────────────────────────────────────────────
  // PHASE UI
  // ─────────────────────────────────────────────────────────────
  function setPhaseUI(phase, labelOverride) {
    state.currentPhase = phase;
    const map = {
      selection: ["PILIH SEKARANG!", "text-neon-cyan text-glow-cyan"],
      resolving: ["RESOLUSI...", "text-neon-pink text-glow-pink"],
      result: ["HASIL RONDE", "text-neon-gold text-glow-gold"],
      waiting: ["Menunggu...", "text-slate-400"],
      finished: ["SELESAI", "text-neon-green text-glow-green"],
    };
    const [label, cls] = map[phase] || map.waiting;
    const el = document.getElementById("phase-label");
    el.textContent = label;
    el.className = `font-display text-lg ${cls}`;
    if (labelOverride) document.getElementById("round-label").innerHTML = labelOverride;
  }

  function showResultBanner(result, choice) {
    const banner = document.getElementById("result-banner");
    const cfgs = {
      win: { icon: "🏆", text: "MENANG!", bg: "bg-neon-green/10 border border-neon-green/40", tc: "text-neon-green text-glow-green" },
      lose: { icon: "💀", text: "KALAH", bg: "bg-red-900/20 border border-red-800/40", tc: "text-red-400" },
      draw: { icon: "🤝", text: "SERI", bg: "bg-neon-gold/10 border border-neon-gold/40", tc: "text-neon-gold text-glow-gold" },
      spectate: { icon: "👁", text: "MENONTON", bg: "bg-slate-800/40 border border-slate-600", tc: "text-slate-400"}
    };
    const cfg = cfgs[result] || cfgs.draw;

    banner.className = `rounded-xl py-4 text-center ${cfg.bg} animate-pop-in`;
    banner.classList.remove("hidden");

    document.getElementById("result-icon").textContent = cfg.icon;

    const textEl = document.getElementById("result-text");
    textEl.className = `font-display text-xl ${cfg.tc}`;
    textEl.textContent = cfg.text;

    document.getElementById("result-detail").textContent = choice ? `Memilih: ${choice}` : "";

    if (result === "win") spawnParticles();
  }

  function hideResultBanner() {
    document.getElementById("result-banner").classList.add("hidden");
  }

  // ─────────────────────────────────────────────────────────────
  // GAME OVER
  // ─────────────────────────────────────────────────────────────
  function showGameOver(data) {
    document.getElementById("game-board").classList.add("hidden");
    document.getElementById("waiting-screen").classList.add("hidden");

    const isWinner = data.winner_id === state.userId;
    const winner = data.participants?.find((p) => p.user_id === data.winner_id);

    document.getElementById("game-over-emoji").textContent =
      isWinner ? "🏆" : data.winner_id ? "🎮" : "🤝";
    document.getElementById("game-over-title").textContent = isWinner ? "KAMU MENANG!" : "PERMAINAN SELESAI";
    document.getElementById("game-over-winner").textContent = winner
      ? `Pemenang: ${winner.username}${winner.is_bot ? " 🤖" : ""}`
      : "Hasil Imbang";

    if (data.participants) {
      const sorted = [...data.participants].sort((a, b) => {
         if (b.points !== a.points) return b.points - a.points;
         return b.lives - a.lives;
      });
      document.getElementById("final-scoreboard").innerHTML = `
      <div class="glass rounded-xl overflow-hidden text-left">
        <table class="w-full text-sm">
          <thead><tr class="border-b border-slate-800">
            <th class="px-3 py-2 text-xs text-slate-500 text-left">#</th>
            <th class="px-3 py-2 text-xs text-slate-500 text-left">Pemain</th>
            <th class="px-3 py-2 text-xs text-slate-500 text-center">Poin</th>
            <th class="px-3 py-2 text-xs text-slate-500 text-center">HP</th>
          </tr></thead>
          <tbody>${sorted
            .map(
              (p, i) => `
            <tr class="border-b border-slate-800/40 ${p.user_id === state.userId ? "bg-neon-cyan/5" : ""}">
              <td class="px-3 py-2 text-slate-500">${i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</td>
              <td class="px-3 py-2 font-semibold ${p.user_id === state.userId ? "text-neon-cyan" : p.is_bot ? "text-slate-500" : "text-slate-200"}">
                ${p.username}${p.is_bot ? " 🤖" : ""}
              </td>
              <td class="px-3 py-2 text-center text-neon-gold">${p.points}</td>
              <td class="px-3 py-2 text-center text-red-400">${p.lives}</td>
            </tr>`
            )
            .join("")}
          </tbody>
        </table>
      </div>`;
    }

    document.getElementById("game-over-screen").classList.remove("hidden");

    const btnRestart = document.getElementById("btn-restart-game");
    if (btnRestart) {
        console.log("Apakah saya leader?", state.isLeader); // Cek di Inspect Element (F12)
        if (state.isLeader) {
            btnRestart.classList.remove("hidden");
            btnRestart.style.display = "block"; // Paksa muncul!
        } else {
            btnRestart.classList.add("hidden");
            btnRestart.style.display = "none";
        }
    }

    if (isWinner) {
      spawnParticles();
      setTimeout(spawnParticles, 500);
      setTimeout(spawnParticles, 1000);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // PARTICLES
  // ─────────────────────────────────────────────────────────────
  function spawnParticles() {
    const c = document.getElementById("particles-container");
    const colors = ["#00f5ff", "#ff0080", "#ffd700", "#39ff14", "#bf00ff"];
    for (let i = 0; i < 28; i++) {
      const p = document.createElement("div");
      p.className = "particle";
      p.style.cssText = `left:${Math.random() * 100}%;top:${45 + Math.random() * 35}%;background:${colors[Math.floor(Math.random() * colors.length)]};animation-delay:${Math.random() * 0.5}s;animation-duration:${0.8 + Math.random() * 0.8}s`;
      c.appendChild(p);
      setTimeout(() => p.remove(), 1600);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // CHAT
  // ─────────────────────────────────────────────────────────────
  function appendChat(data) {
    const box = document.getElementById("chat-box");
    const isMe = data.user_id === state.userId;
    const div = document.createElement("div");
    div.className = `chat-msg flex ${isMe ? "justify-end" : "justify-start"}`;
    div.innerHTML = `
    <div class="max-w-[75%] ${isMe
      ? "bg-neon-cyan/15 border border-neon-cyan/25 rounded-2xl rounded-tr-sm"
      : "bg-slate-800/60 border border-slate-700/50 rounded-2xl rounded-tl-sm"}
      px-3 py-2">
      ${!isMe
        ? `<div class="text-xs font-semibold mb-0.5 ${data.is_spectator ? "text-neon-purple" : "text-slate-400"}">${data.username}${data.is_spectator ? " 👁" : ""}</div>`
        : ""}
      <div class="text-sm text-slate-200 leading-relaxed">${esc(data.message)}</div>
      <div class="text-xs text-slate-600 mt-0.5 ${isMe ? "text-right" : ""}">${fmtTime(data.created_at)}</div>
    </div>`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

  function appendSystem(msg) {
    const box = document.getElementById("chat-box");
    const div = document.createElement("div");
    div.className = "text-center text-xs text-slate-600 py-1 chat-msg";
    div.textContent = msg;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function fmtTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  // ─────────────────────────────────────────────────────────────
  // SHARED UI SHORTCUTS
  // ─────────────────────────────────────────────────────────────
  function setGameStartedUI({ mode }) {
    showToast(`🚀 Game mulai! Mode: ${MODE_LABELS[mode] || mode}`, 4000);
    document.getElementById("waiting-screen").classList.add("hidden");
    document.getElementById("game-over-screen").classList.add("hidden");
    document.getElementById("game-board").classList.remove("hidden");
    document.getElementById("leader-panel").classList.add("hidden");
    appendSystem("─── Permainan dimulai! ───");
  }

  function setLobbyLeftUI() {
    document.getElementById("chat-box").innerHTML = "";
    document.getElementById("game-board").classList.add("hidden");
    document.getElementById("waiting-screen").classList.remove("hidden");
    document.getElementById("game-over-screen").classList.add("hidden");
    document.getElementById("spectator-notice").classList.add("hidden");
    // Reset popup state
    _lastCupMatchKey = null;
    clearTimeout(_cupPopupTimer);
    document.getElementById("cup-match-popup")?.classList.add("hidden");
  }
  
  function handleLobbyRestarted() {
     document.getElementById("game-board").classList.add("hidden");
     document.getElementById("game-over-screen").classList.add("hidden");
     document.getElementById("waiting-screen").classList.remove("hidden");
     document.getElementById("chat-box").innerHTML = "";
     // Reset popup state
     _lastCupMatchKey = null;
     clearTimeout(_cupPopupTimer);
     document.getElementById("cup-match-popup")?.classList.add("hidden");
     appendSystem("♻️ Lobi di-reset oleh Leader. Siap main lagi!");
  }

  return {
    showScreen,
    showToast,
    showError,
    copyLobbyId,
    renderLobbyState,
    buildElementGrid,
    setSelectedElement,
    lockElements,
    resetElements,
    startTimer,
    showKickModal,
    stopTimer,
    setPhaseUI,
    showResultBanner,
    hideResultBanner,
    showGameOver,
    showVSOverlay,
    appendChat,
    appendSystem,
    setGameStartedUI,
    setLobbyLeftUI,
    handleLobbyRestarted
  };
}