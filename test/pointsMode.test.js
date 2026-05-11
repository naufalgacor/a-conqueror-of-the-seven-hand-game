jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));

const { createGameService } = require('../src/handlers/gameHandler');
const { MODE_CONFIG } = require('../src/config/gameConfig');
const { createLobbyRouter } = require('../src/routes/lobbyRoutes');

// Mock Socket.io
const io = {
  to: jest.fn().mockReturnThis(),
  emit: jest.fn(),
  sockets: { sockets: new Map() }
};

function createParticipant(id, opts = {}) {
  const { isBot = false, points = 0, lives = 0 } = opts;
  return {
    user_id: id,
    username: `Player ${id}`,
    points,
    lives,
    eliminated: false,
    is_spectator: false,
    is_bot: isBot,
    socket_id: null,
  };
}

function createMatch(participants = [], round = 1) {
  const map = new Map();
  participants.forEach((p) => map.set(p.user_id, p));
  return {
    id: 'm1',
    mode: 'points',
    status: 'playing',
    round,
    participants: map,
    winner_id: null,
  };
}

describe('Pengujian Mode Rebutan Poin (Points Mode)', () => {
  let matches; let match; let gameService;
  const cfg = MODE_CONFIG.points;

  beforeEach(() => {
    matches = new Map();
    // Default: satu manusia (p1) dan satu bot (b1)
    const p1 = createParticipant('p1', { isBot: false, points: 0 });
    const b1 = createParticipant('b1', { isBot: true, points: 0 });
    match = createMatch([p1, b1], 1);
    matches.set(match.id, match);

    gameService = createGameService({ io, matches });

    io.to.mockClear();
    io.emit.mockClear();
  });

  test('Penambahan Poin: hanya pemenang yang mendapat +1 poin', () => {
    // p1 menang, b1 kalah
    gameService._applyRoundOutcome(match, ['p1'], ['b1'], false);

    expect(match.participants.get('p1').points).toBe(1);
    expect(match.participants.get('b1').points).toBe(0);
  });

  test('Pencapaian Target Skor: pemain yang mencapai targetScore menjadi pemenang', () => {
    // set p1 sudah mendekati target
    match.participants.get('p1').points = cfg.targetScore - 1; // 3 jika target 4
    // p1 menang sekali lagi
    gameService._applyRoundOutcome(match, ['p1'], ['b1'], false);

    const over = gameService._checkGameOver(match);
    expect(over).toBe(true);
    expect(match.winner_id).toBe('p1');
  });

  test('Batas Maksimal Ronde: game berakhir pada ronde maksimal dan pemimpin poin jadi pemenang', () => {
    // set skor sehingga b1 unggul
    match.participants.get('p1').points = 1;
    match.participants.get('b1').points = 3;
    // capai ronde maksimal
    match.round = cfg.targetScore * 2 - 1;

    const over = gameService._checkGameOver(match);
    expect(over).toBe(true);
    expect(match.winner_id).toBe('b1');
  });

  test('Prioritas Pemain Manusia (Tiebreaker) pada targetScore: manusia menang jika poin sama', () => {
    // kedua pemain mencapai target secara bersamaan
    match.participants.get('p1').points = cfg.targetScore;
    match.participants.get('b1').points = cfg.targetScore;

    const over = gameService._checkGameOver(match);
    expect(over).toBe(true);
    // human (p1) harus diprioritaskan terhadap bot
    expect(match.winner_id).toBe('p1');
  });

  test('Prioritas Pemain Manusia (Tiebreaker) pada ronde maksimal: manusia menang jika skor seri', () => {
    // keduanya imbang pada ronde maksimal
    match.participants.get('p1').points = 2;
    match.participants.get('b1').points = 2;
    match.round = cfg.targetScore * 2 - 1;

    const over = gameService._checkGameOver(match);
    expect(over).toBe(true);
    expect(match.winner_id).toBe('p1');
  });

  test('Entry limit (points): tidak dapat join jika sudah mencapai maxPlayers (2)', () => {
    // buat lobby dengan 2 pemain manusia sudah ada
    const localMatches = new Map();
    const p1 = createParticipant('h1', { isBot: false, points: 0 });
    const p2 = createParticipant('h2', { isBot: false, points: 0 });
    const lobby = {
      id: 'lobby1', mode: 'points', status: 'waiting', leader_id: 'h1', participants: new Map([[p1.user_id, p1], [p2.user_id, p2]]),
    };
    localMatches.set(lobby.id, lobby);

    const router = createLobbyRouter({ io, matches: localMatches, startGame: () => {} });
    const layer = router.stack.find((l) => l.route && l.route.path === '/lobby/:lobby_id/join');
    const handler = layer.route.stack[0].handle;

    const req = { params: { lobby_id: 'lobby1' }, body: { username: 'h3' } };
    let statusCode; let body;
    const res = { status: (s) => { statusCode = s; return res; }, json: (b) => { body = b; return res; } };

    handler(req, res);

    expect(statusCode).toBe(400);
    expect(body && body.error).toBe(`Lobby penuh (maks ${cfg.maxPlayers} pemain)`);
  });

  test('Entry allowed (points): dapat join jika belum mencapai maxPlayers', () => {
    const localMatches = new Map();
    const p1 = createParticipant('h1', { isBot: false, points: 0 });
    const lobby = { id: 'lobby2', mode: 'points', status: 'waiting', leader_id: 'h1', participants: new Map([[p1.user_id, p1]]) };
    localMatches.set(lobby.id, lobby);

    const router = createLobbyRouter({ io, matches: localMatches, startGame: () => {} });
    const layer = router.stack.find((l) => l.route && l.route.path === '/lobby/:lobby_id/join');
    const handler = layer.route.stack[0].handle;

    const req = { params: { lobby_id: 'lobby2' }, body: { username: 'newplayer' } };
    let statusCode; let body;
    const res = { status: (s) => { statusCode = s; return res; }, json: (b) => { body = b; return res; } };

    handler(req, res);

    expect(statusCode).toBe(200);
    // peserta manusia sekarang 2
    const humanCount = Array.from(localMatches.get('lobby2').participants.values()).filter((p) => !p.is_bot).length;
    expect(humanCount).toBe(2);
  });
});
