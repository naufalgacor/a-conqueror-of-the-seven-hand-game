# 🎮 Seven-Hand Game

> Proyek Akhir Semester — Pemrograman Web  
> Stack: **Node.js + Express + Socket.io + Tailwind CSS (CDN) + Vanilla JS**

## 📁 Struktur Proyek (Refactor)

```
seven-hand-game/
├── server.js              # Entry point (Express + HTTP + Socket.io)
├── src/                   # Backend modules
│   ├── config/
│   │   └── gameConfig.js
│   ├── handlers/
│   │   ├── gameHandler.js
│   │   └── lobbyHandler.js
│   ├── routes/
│   │   └── lobbyRoutes.js
│   ├── store/
│   │   └── memoryStore.js
│   └── utils/
│       ├── gameRules.js
│       ├── makeParticipant.js
│       ├── matchUtils.js
│       └── serializeMatch.js
├── public/                # Frontend static (served by Express)
│   ├── index.html
│   └── js/
│       ├── main.js
│       ├── socket-client.js
│       └── ui-manager.js
├── package.json
└── README.md
```

## ⚙️ Cara Instalasi & Menjalankan

### Prasyarat
- Node.js **v18+** (cek: `node -v`)
- npm

### Menjalankan
```bash
npm install
npm start
```

Mode dev (auto-restart):
```bash
npm run dev
```

Buka:
- `http://localhost:3000`

## 🃏 Aturan Penaklukan (7 Elemen)

| Elemen   | Mengalahkan                    |
|----------|-------------------------------|
| 🪨 Rock     | Fire, Scissors, Sponge        |
| 🔥 Fire     | Scissors, Sponge, Paper       |
| ✂️ Scissors | Sponge, Paper, Air            |
| 🧽 Sponge   | Paper, Air, Water             |
| 📄 Paper    | Air, Water, Rock              |
| 💨 Air      | Water, Rock, Fire             |
| 💧 Water    | Rock, Fire, Scissors          |

Sumber aturan dipusatkan di `src/utils/gameRules.js`.

## 🌐 REST API

| Method | URL | Deskripsi |
|--------|-----|-----------|
| `GET`   | `/api/v1/lobbies` | Daftar lobby terbuka |
| `POST`  | `/api/v1/lobby` | Buat lobby baru |
| `POST`  | `/api/v1/lobby/:id/join` | Join lobby |
| `PATCH` | `/api/v1/lobby/:id/settings` | Ubah mode (leader only) |
| `POST`  | `/api/v1/lobby/:id/start` | Mulai game (leader only) |

## 📡 Socket.io Events (Ringkas)

Client → Server:
- `lobby:join`, `lobby:leave`
- `chat:send`
- `game:choose`
- `spectator:decision`

Server → Client:
- `lobby:state`, `lobby:joined`, `lobby:left`
- `lobby:leader:changed`, `lobby:you:are:leader`
- `chat:message`
- `game:started`, `game:phase:selection`, `game:timer:tick`, `game:phase:resolving`, `game:phase:result`, `game:eliminated`

---

*Seven-Hand Game — Proyek Akhir Pemrograman Web*
