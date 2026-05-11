import { createUIManager } from "./ui-manager.js";
import { createSocketClient } from "./socket-client.js";

// ─────────────────────────────────────────────────────────────
// BGM & AUDIO
// ─────────────────────────────────────────────────────────────
// Ganti path URL ini sesuai dengan lokasi file audio di server kamu
const bgm = new Audio("/music/golden_brown.mp3");
bgm.loop = true; 
bgm.volume = 0.4; 
let isMusicPlaying = false;

function toggleMusic() {
  const icon = document.getElementById("music-icon");
  if (isMusicPlaying) {
    bgm.pause();
    isMusicPlaying = false;
    if(icon) icon.textContent = "🔇";
  } else {
    bgm.play().catch((e) => console.log("Autoplay blocked", e));
    isMusicPlaying = true;
    if(icon) icon.textContent = "🎵";
  }
}

// ─────────────────────────────────────────────────────────────
// STATE & CONSTANTS
// ─────────────────────────────────────────────────────────────
const state = {
  userId: null,
  matchId: null,
  username: null,
  isLeader: false,
  isSpectator: false,
  myChoice: null,
  currentPhase: "waiting",
  timerInterval: null,
  modeConfig: null,
  lastWinnerId: null,
};

const ELEMENTS = [
  { name: "Rock", emoji: "🪨" },
  { name: "Fire", emoji: "🔥" },
  { name: "Scissors", emoji: "✂️" },
  { name: "Sponge", emoji: "🧽" },
  { name: "Paper", emoji: "📄" },
  { name: "Air", emoji: "💨" },
  { name: "Water", emoji: "💧" },
];

const MODE_LABELS = {
  points: "🏆 Point Rush",
  lives: "❤️ Lives Elimination",
  cup: "🏅 Cup Mode",
};

const MODE_INFO = {
  points: "1v1 · Best-of-7 · First to 4 points wins · Bots fill if solo",
  lives: "1v1 · 3 HP · Lose round = -1 HP · Bots fill if solo",
  cup: "8-Slot Tournament Bracket · HP Elimination",
};

// ─────────────────────────────────────────────────────────────
// UI + SOCKET INIT
// ─────────────────────────────────────────────────────────────
const ui = createUIManager({ state, ELEMENTS, MODE_LABELS, MODE_INFO });

const socket = createSocketClient({
  state,
  ui,
  MODE_LABELS,
  actions: {
    onLobbyLeft() {
      resetState();
      ui.showScreen("home");
    },
  },
});

// ─────────────────────────────────────────────────────────────
// HOME ACTIONS
// ─────────────────────────────────────────────────────────────
async function createLobby() {
  const username = document.getElementById("input-username").value.trim();
  if (!username) return ui.showError("Please enter your name first!");

  try {
    const res = await fetch("/api/v1/lobby", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });

    const data = await res.json();
    if (!res.ok) return ui.showError(data.error || "Failed to create lobby");

    state.userId = data.user_id;
    state.matchId = data.match_id;
    state.username = username;
    state.isLeader = true;

    enterLobby();
  } catch {
    ui.showError("Server unreachable");
  }
}

async function joinLobbyById() {
  const username = document.getElementById("input-username").value.trim();
  const lobbyId = document.getElementById("input-lobby-id").value.trim();
  if (!username) return ui.showError("Please enter your name first!");
  if (!lobbyId) return ui.showError("Please enter Lobby ID!");

  await joinLobbyByIdStr(username, lobbyId);
}

async function joinLobbyByIdStr(username, lobbyId) {
  try {
    const res = await fetch(`/api/v1/lobby/${lobbyId}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });

    const data = await res.json();
    if (!res.ok) return ui.showError(data.error || "Failed to join");

    state.userId = data.user_id;
    state.matchId = data.match_id;
    state.username = username;
    state.isLeader = false;

    enterLobby();
  } catch {
    ui.showError("Server unreachable");
  }
}

async function loadLobbies() {
  const listEl = document.getElementById("lobby-list");
  listEl.innerHTML = `<div class="text-slate-600 text-xs text-center py-2">Loading...</div>`;

  try {
    const res = await fetch("/api/v1/lobbies");
    const data = await res.json();

    if (!data.lobbies?.length) {
      listEl.innerHTML = `<div class="text-slate-600 text-xs text-center py-3">No open lobbies</div>`;
      return;
    }

    listEl.innerHTML = data.lobbies
      .map((l) => {
        const isFull = l.player_count >= l.max_players;
        const btnClass = isFull 
          ? "bg-error/20 border-error/40 text-error hover:bg-error/30 cursor-not-allowed opacity-80" 
          : "bg-tertiary/20 border-tertiary/40 text-tertiary hover:bg-tertiary/30";
        const btnText = isFull ? "Full" : "Join";
        const disabledAttr = isFull ? "disabled" : "";

        return `
        <div class="flex items-center justify-between glass rounded-lg px-3 py-2.5">
          <div>
            <div class="text-xs font-semibold text-slate-300">${MODE_LABELS[l.mode] || l.mode}</div>
            <div class="text-[10px] text-slate-400 mt-0.5">Host: <span class="text-neon-cyan font-medium">${l.leader_name}</span></div>
            <div class="text-[10px] text-slate-500 font-mono mt-0.5">ID: ${l.id.slice(0, 8)}…</div>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs text-slate-400">${l.player_count}/${l.max_players}</span>
            <button onclick="joinFromList('${l.id}')" ${disabledAttr}
              class="px-3 py-1.5 rounded-lg border text-xs transition-all ${btnClass}">${btnText}</button>
          </div>
        </div>`;
      })
      .join("");
  } catch {
    listEl.innerHTML = `<div class="text-slate-600 text-xs text-center">Failed to load</div>`;
  }
}

function joinFromList(lobbyId) {
  const username = document.getElementById("input-username").value.trim();
  if (!username) return ui.showError("Please enter your name first!");
  joinLobbyByIdStr(username, lobbyId);
}

// ─────────────────────────────────────────────────────────────
// ENTER / LEAVE LOBBY
// ─────────────────────────────────────────────────────────────
function enterLobby() {
  ui.showScreen("lobby");

  document.getElementById("lobby-id-display").textContent = state.matchId;
  ui.buildElementGrid();

  socket.emit("lobby:join", { match_id: state.matchId, user_id: state.userId });

// --- TRIGGER MUSIC WHEN ENTERING LOBBY ---
  if (!isMusicPlaying) {
    bgm.play().then(() => {
      isMusicPlaying = true;
      const icon = document.getElementById("music-icon");
      if(icon) icon.textContent = "🎵";
    }).catch(err => {
      console.log("Waiting for user interaction to play music", err);
    });
  }
}

function leaveLobby() {
  socket.emit("lobby:leave", { match_id: state.matchId, user_id: state.userId });
  resetState();
  ui.showScreen("home");
}

function leaveAsSpectator() {
  socket.emit("spectator:decision", {
    match_id: state.matchId,
    user_id: state.userId,
    decision: "leave",
  });
  resetState();
  ui.showScreen("home");
}

function goHome() {
  resetState();
  ui.showScreen("home");
}

function restartLobby() {
  if (!state.isLeader) return;
  socket.emit("lobby:restart", { match_id: state.matchId, user_id: state.userId });
}

function resetState() {
  clearInterval(state.timerInterval);
  Object.assign(state, {
    userId: null,
    matchId: null,
    username: null,
    isLeader: false,
    isSpectator: false,
    myChoice: null,
    currentPhase: "waiting",
    modeConfig: null,
    lastWinnerId: null, 
  });

  ui.setLobbyLeftUI();
}

// ─────────────────────────────────────────────────────────────
// LEADER ACTIONS
// ─────────────────────────────────────────────────────────────
async function updateGameMode(mode) {
  if (!state.isLeader) return;

  const res = await fetch(`/api/v1/lobby/${state.matchId}/settings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ game_mode: mode, user_id: state.userId }),
  });

  if (!res.ok) {
    const d = await res.json();
    ui.showToast("❌ " + (d.error || "Failed to change mode"));
  }
}

async function startGame() {
  if (!state.isLeader) return;

  const res = await fetch(`/api/v1/lobby/${state.matchId}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: state.userId }),
  });

  const data = await res.json();
  if (!res.ok) ui.showToast("❌ " + (data.error || "Failed to start"));
}

// ─────────────────────────────────────────────────────────────
// GAME ACTIONS
// ─────────────────────────────────────────────────────────────
function chooseElement(name) {
  if (state.isSpectator) return;
  ui.setSelectedElement(name);
  socket.emit("game:choose", { match_id: state.matchId, user_id: state.userId, element: name });
}

function sendChat() {
  const input = document.getElementById("chat-input");
  const msg = input.value.trim();
  if (!msg || !state.matchId) return;

  socket.emit("chat:send", { match_id: state.matchId, user_id: state.userId, message: msg });
  input.value = "";
}

// ─────────────────────────────────────────────────────────────
// EXPOSE TO WINDOW 
// ─────────────────────────────────────────────────────────────
window.createLobby = createLobby;
window.joinLobbyById = joinLobbyById;
window.joinFromList = joinFromList;
window.loadLobbies = loadLobbies;
window.leaveLobby = leaveLobby;
window.leaveAsSpectator = leaveAsSpectator;
window.goHome = goHome;
window.restartLobby = restartLobby;
window.updateGameMode = updateGameMode;
window.startGame = startGame;
window.chooseElement = chooseElement;
window.sendChat = sendChat;
window.copyLobbyId = ui.copyLobbyId;
window.toggleMusic = toggleMusic;