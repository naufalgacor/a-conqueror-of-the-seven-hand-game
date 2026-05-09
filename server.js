/**
 * Seven-Hand Game — Backend Server (modular)
 * Node.js + Express + Socket.io
 *
 * Entry point only: wiring Express, HTTP server, Socket.io, routes, handlers.
 */

const express = require("express");
const http = require("http");
const path = require("path");
const cors = require("cors");
const { Server } = require("socket.io");

const { matches, users } = require("./src/store/memoryStore");
const { createGameService } = require("./src/handlers/gameHandler");
const { registerLobbyHandlers } = require("./src/handlers/lobbyHandler");
const { createLobbyRouter } = require("./src/routes/lobbyRoutes");
const { BOT_NAMES, MODE_CONFIG } = require("./src/config/gameConfig");

const app = express();
app.use(cors());
app.use(express.json());

// Frontend static files
app.use(express.static(path.join(__dirname, "public")));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// Game service (used by both REST routes and Socket handlers)
const gameService = createGameService({ io, matches });

// REST API
app.use("/api/v1", createLobbyRouter({ io, matches, startGame: gameService.startGame }));

// Socket.io
io.on("connection", (socket) => {
  console.log(`[Socket] Connect: ${socket.id}`);

  registerLobbyHandlers({ io, socket, matches, users, gameService });
  gameService.registerGameHandlers(socket);
});

// Start
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🎮  Seven-Hand Game  ─  http://localhost:${PORT}`);
  console.log(`🤖  Bot pool: ${BOT_NAMES.join(", ")}`);
  console.log("📋  Mode config:");
  Object.entries(MODE_CONFIG).forEach(([k, v]) => {
    console.log(
      `     ${k.padEnd(8)} → maxPlayers=${v.maxPlayers}, targetScore=${v.targetScore}, startingLives=${v.startingLives}`
    );
  });
  console.log();
});
