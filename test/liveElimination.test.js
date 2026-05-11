jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));

const { createGameService } = require('../src/handlers/gameHandler');

// Mock Socket.io
const io = {
  to: jest.fn().mockReturnThis(),
  emit: jest.fn(),
  sockets: { sockets: new Map() }
};

function createParticipant(id, lives = 3) {
  return {
    id,
    user_id: id,
    username: `Player ${id}`,
    lives,
    points: 0,
    eliminated: false,
    is_spectator: false,
    is_bot: false,
  };
}

function createMatch(participantIds, lives = 3) {
  const participants = new Map();
  participantIds.forEach(id => {
    participants.set(id, createParticipant(id, lives));
  });
  return {
    id: 'match1',
    mode: 'lives',
    status: 'playing',
    round: 1,
    participants,
    winner_id: null,
  };
}

describe('Pengujian Mode Eliminasi Nyawa (Lives Elimination Mode)', () => {
  let match;
  let gameService;

  beforeEach(() => {
    match = createMatch(['p1', 'p2', 'p3'], 2); // 3 pemain, masing-masing 2 nyawa
    
    const matches = new Map();
    matches.set('match1', match);
    
    // Inisialisasi Service untuk mengakses fungsi internalnya
    gameService = createGameService({ io, matches });

    // Reset mock
    io.to.mockClear();
    io.emit.mockClear();
  });

  test('Pengurangan Nyawa: Pemain kalah harus berkurang nyawanya', () => {
    const losers = ['p1'];
    const winners = ['p2'];
    // Simulasikan p1 kalah, p2 menang
    gameService._applyRoundOutcome(match, winners, losers, false);

    expect(match.participants.get('p1').lives).toBe(1); // 2 -> 1
    expect(match.participants.get('p2').lives).toBe(2); // Nyawa utuh
  });

  test('Status Eliminasi: Jika nyawa 0, pemain jadi eliminated & spectator', () => {
    match.participants.get('p1').lives = 1; 
    gameService._applyRoundOutcome(match, ['p2'], ['p1'], false);

    const p1 = match.participants.get('p1');
    expect(p1.lives).toBe(0);
    expect(p1.eliminated).toBe(true);
    expect(p1.is_spectator).toBe(true);
  });

  test('Pemenang Terakhir: checkGameOver mengembalikan true & winner_id di-set', () => {
    // p1 dan p2 eliminated, hanya p3 tersisa
    match.participants.get('p1').eliminated = true;
    match.participants.get('p1').is_spectator = true;
    match.participants.get('p2').eliminated = true;
    match.participants.get('p2').is_spectator = true;

    const isOver = gameService._checkGameOver(match);
    
    expect(isOver).toBe(true);
    expect(match.winner_id).toBe('p3');
  });

  test('Pencegahan Double Loss: Pemain eliminated tidak dikurangi nyawa lagi', () => {
    const p1 = match.participants.get('p1');
    p1.lives = 0;
    p1.eliminated = true;
    p1.is_spectator = true;

    gameService._applyRoundOutcome(match, ['p2'], ['p1'], false);

    // Nyawa tetap 0, tidak jadi -1
    expect(p1.lives).toBe(0);
    expect(p1.eliminated).toBe(true);
  });
});