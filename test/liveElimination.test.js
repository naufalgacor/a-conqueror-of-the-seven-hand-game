jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));

const { createGameService } = require('../src/handlers/gameHandler');
const { createLobbyRouter } = require('../src/routes/lobbyRoutes');
const { MODE_CONFIG } = require('../src/config/gameConfig');

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

describe('Testing Lives Elimination Mode', () => {
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

  test('Life Reduction: Losing player must lose a life', () => {
    const losers = ['p1'];
    const winners = ['p2'];
    // Simulate p1 loses, p2 wins
    gameService._applyRoundOutcome(match, winners, losers, false);

    expect(match.participants.get('p1').lives).toBe(1); // 2 -> 1
    expect(match.participants.get('p2').lives).toBe(2); // Lives intact
  });

  test('Elimination Status: If lives 0, player becomes eliminated & spectator', () => {
    match.participants.get('p1').lives = 1; 
    gameService._applyRoundOutcome(match, ['p2'], ['p1'], false);

    const p1 = match.participants.get('p1');
    expect(p1.lives).toBe(0);
    expect(p1.eliminated).toBe(true);
    expect(p1.is_spectator).toBe(true);
  });

  test('Last Winner: checkGameOver returns true & winner_id is set', () => {
    // p1 and p2 eliminated, only p3 remains
    match.participants.get('p1').eliminated = true;
    match.participants.get('p1').is_spectator = true;
    match.participants.get('p2').eliminated = true;
    match.participants.get('p2').is_spectator = true;

    const isOver = gameService._checkGameOver(match);
    
    expect(isOver).toBe(true);
    expect(match.winner_id).toBe('p3');
  });

  test('Prevent Double Loss: Eliminated player does not lose lives again', () => {
    const p1 = match.participants.get('p1');
    p1.lives = 0;
    p1.eliminated = true;
    p1.is_spectator = true;

    gameService._applyRoundOutcome(match, ['p2'], ['p1'], false);

    // Lives remain 0, not -1
    expect(p1.lives).toBe(0);
    expect(p1.eliminated).toBe(true);
  });

  test('Entry limit (lives): cannot join if maxPlayers (2) is reached', () => {
    const localMatches = new Map();
    const a = createParticipant('a', 3);
    const b = createParticipant('b', 3);
    const lobby = { id: 'L1', mode: 'lives', status: 'waiting', leader_id: 'a', participants: new Map([[a.user_id, a], [b.user_id, b]]) };
    localMatches.set(lobby.id, lobby);

    const router = createLobbyRouter({ io, matches: localMatches, startGame: () => {} });
    const layer = router.stack.find((l) => l.route && l.route.path === '/lobby/:lobby_id/join');
    const handler = layer.route.stack[0].handle;

    const req = { params: { lobby_id: 'L1' }, body: { username: 'new' } };
    let statusCode; let body;
    const res = { status: (s) => { statusCode = s; return res; }, json: (b) => { body = b; return res; } };

    handler(req, res);

    expect(statusCode).toBe(400);
    expect(body && body.error).toBe(`Lobby penuh (maks ${MODE_CONFIG.lives.maxPlayers} pemain)`);
  });

  test('Entry allowed (lives): can join if not yet at maxPlayers', () => {
    const localMatches = new Map();
    const a = createParticipant('a', 3);
    const lobby = { id: 'L2', mode: 'lives', status: 'waiting', leader_id: 'a', participants: new Map([[a.user_id, a]]) };
    localMatches.set(lobby.id, lobby);

    const router = createLobbyRouter({ io, matches: localMatches, startGame: () => {} });
    const layer = router.stack.find((l) => l.route && l.route.path === '/lobby/:lobby_id/join');
    const handler = layer.route.stack[0].handle;

    const req = { params: { lobby_id: 'L2' }, body: { username: 'player2' } };
    let statusCode; let body;
    const res = { status: (s) => { statusCode = s; return res; }, json: (b) => { body = b; return res; } };

    handler(req, res);

    expect(statusCode).toBe(200);
    const humanCount = Array.from(localMatches.get('L2').participants.values()).filter((p) => !p.is_bot).length;
    expect(humanCount).toBe(2);
  });
});