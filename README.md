# 🎮 Seven-Hand Game

> Proyek Akhir Semester — Pemrograman Web  
> Stack: **Node.js + Express + Socket.io + Tailwind CSS**

---

## 📁 Struktur Proyek

```
seven-hand-game/
├── server/
│   ├── package.json       # Dependensi backend
│   └── server.js          # Server utama (Express + Socket.io + Game Logic)
├── client/
│   └── public/
│       └── index.html     # SPA Frontend (Tailwind CSS + Socket.io Client)
└── README.md
```

---

## ⚙️ Cara Instalasi & Menjalankan

### Prasyarat
- Node.js **v18+** (cek: `node -v`)
- npm (biasanya sudah termasuk dengan Node.js)

### Langkah-langkah

**1. Masuk ke folder server**
```bash
cd seven-hand-game/server
```

**2. Install dependensi**
```bash
npm install
```

**3. Jalankan server**
```bash
# Mode produksi
npm start

# Mode development (auto-restart saat file berubah)
npm run dev
```

**4. Buka di browser**
```
http://localhost:3000
```

---

## 🎮 Cara Bermain

### Membuat Lobby
1. Masukkan nama pemain di halaman utama
2. Klik **"BUAT LOBBY BARU"** → kamu otomatis menjadi **Leader**
3. Bagikan **Lobby ID** ke teman-teman

### Bergabung ke Lobby
1. Masukkan nama pemain
2. Tempel **Lobby ID** yang didapat dari Leader
3. Klik **"JOIN"** — atau klik **"Lihat Lobby Tersedia"** untuk melihat daftar lobby

### Sebagai Leader
- Pilih **mode permainan** (Rebutan Poin / Eliminasi Nyawa / Cup)
- Klik **"MULAI PERMAINAN"** saat pemain sudah cukup (min. 2)

### Saat Permainan
1. **Fase Pemilihan (5 detik)**: Pilih satu dari 7 elemen
2. **Fase Resolusi (2 detik)**: Animasi pengacakan
3. **Fase Hasil**: Pengumuman Menang / Kalah / Seri

---

## 🃏 7 Elemen & Hierarki

| Elemen   | Mengalahkan                    |
|----------|-------------------------------|
| 🪨 Rock     | Scissors, Fire, Sponge        |
| 🔥 Fire     | Scissors, Sponge, Air         |
| ✂️ Scissors | Sponge, Air, Paper            |
| 🧽 Sponge   | Air, Paper, Water             |
| 📄 Paper    | Water, Rock, Fire             |
| 💨 Air      | Water, Rock, Scissors         |
| 💧 Water    | Rock, Fire, Scissors          |

---

## 🏟️ Mode Permainan

| Mode              | Deskripsi                                              |
|-------------------|-------------------------------------------------------|
| 🏆 Rebutan Poin   | 7 ronde, pemain dengan poin terbanyak menang           |
| ❤️ Eliminasi Nyawa | 3 nyawa, habis nyawa → eliminasi, 1 pemain tersisa = menang |
| 🏅 Cup Mode       | 7 Pemain + 1 Bot, sistem eliminasi nyawa               |

---

## 👑 Sistem Suksesi Leader

Sesuai SRS Section 3A:
- Jika Leader meninggalkan lobby (sebelum/sesudah game), kepemimpinan **otomatis** berpindah ke pemain dengan `join_order` terkecil berikutnya
- Event `lobby:leader:changed` di-broadcast ke seluruh peserta secara real-time

---

## 👁️ Spectator Mode

Sesuai SRS Section 2B:
- Pemain yang tereliminasi di mode Cup otomatis menjadi **Spectator**
- Spectator **dapat** menggunakan Lobby Chat
- Spectator **tidak dapat** memilih elemen
- Spectator dapat memilih **"Tinggalkan Pertandingan"** untuk keluar

---

## 🌐 REST API Endpoints

| Method | URL | Deskripsi |
|--------|-----|-----------|
| `GET`   | `/api/v1/lobbies` | Daftar semua lobby yang terbuka |
| `POST`  | `/api/v1/lobby` | Buat lobby baru |
| `POST`  | `/api/v1/lobby/:id/join` | Bergabung ke lobby |
| `PATCH` | `/api/v1/lobby/:id/settings` | Ubah mode (leader only) |
| `POST`  | `/api/v1/lobby/:id/start` | Mulai permainan (leader only) |

---

## 📡 Socket.io Events

### Client → Server
| Event | Payload | Keterangan |
|-------|---------|-----------|
| `lobby:join` | `{match_id, user_id}` | Masuk ke room Socket |
| `lobby:leave` | `{match_id, user_id}` | Keluar dari room |
| `chat:send` | `{match_id, user_id, message}` | Kirim pesan chat |
| `game:choose` | `{match_id, user_id, element}` | Pilih elemen |
| `spectator:decision` | `{match_id, user_id, decision}` | `"leave"` atau `"spectate"` |

### Server → Client
| Event | Keterangan |
|-------|-----------|
| `lobby:state` | State lobby lengkap (broadcast) |
| `lobby:joined` | Konfirmasi masuk lobby |
| `lobby:leader:changed` | Notifikasi pergantian leader |
| `lobby:you:are:leader` | Kamu adalah leader baru |
| `chat:message` | Pesan chat masuk |
| `game:started` | Permainan dimulai |
| `game:phase:selection` | Fase pemilihan dimulai |
| `game:timer:tick` | Countdown tick |
| `game:phase:resolving` | Fase resolusi |
| `game:phase:result` | Hasil ronde / game over |
| `game:eliminated` | Kamu tereliminasi |

---

## 🗃️ Mock Database (In-Memory)

Sesuai SRS Section 5, data disimpan dalam `Map` JavaScript:

**matches**
```
id, mode, status, winner_id, leader_id, round, participants
```

**match_participants** (sebagai Map dalam match)
```
user_id, username, socket_id, join_order, is_spectator, lives, points, choice, eliminated
```

---

## 👨‍💻 Teknologi yang Digunakan

- **Express.js** — HTTP server & REST API
- **Socket.io** — WebSocket real-time communication
- **Tailwind CSS** (CDN) — Styling utility-first
- **uuid** — Generate unique ID untuk match & user
- **nodemon** (dev) — Hot reload server

---

*Seven-Hand Game — Proyek Akhir Pemrograman Web*