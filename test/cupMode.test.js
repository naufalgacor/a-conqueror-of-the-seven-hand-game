jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));

const { createGameService } = require('../src/handlers/gameHandler');
const { createLobbyRouter } = require('../src/routes/lobbyRoutes');
const { registerLobbyHandlers } = require('../src/handlers/lobbyHandler');

// Mock Socket.io
const io = {
  to: jest.fn().mockReturnThis(),
  emit: jest.fn(),
  sockets: { sockets: new Map() }
};

function createParticipant(id, opts = {}) {
  const { isBot = false, points = 0, lives = 3 } = opts;
  return {
    user_id: id,
    username: `Player ${id}`,
    points,
    lives,
    eliminated: false,
    is_spectator: false,
    is_bot: isBot,
    socket_id: null,
    custom_title: null,
  };
}

function createMatch(participants = [], round = 1) {
  const map = new Map();
  participants.forEach((p) => map.set(p.user_id, p));
  return {
    id: 'c1',
    mode: 'cup',
    status: 'waiting',
    round,
    participants: map,
    winner_id: null,
    cup_bracket: null,
  };
}

describe('Testing Cup Mode and Lobby Management', () => {
  let matches; let match; let gameService; let router;

  // Hentikan waktu asli agar Jest tidak hang!
  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    matches = new Map();
    const participants = [];
    for (let i = 0; i < 6; i++) {
      participants.push(createParticipant(`p${i}`, { isBot: false }));
    }
    participants.push(createParticipant('b0', { isBot: true }));
    match = createMatch(participants, 1);
    matches.set(match.id, match);

    gameService = createGameService({ io, matches });
    router = createLobbyRouter({ io, matches, startGame: () => {} });

    io.to.mockClear();
    io.emit.mockClear();
  });

  afterEach(() => {
    // Bersihkan sisa timer setelah setiap pengetesan
    matches.forEach(m => {
      if (m.roundTimer) clearTimeout(m.roundTimer);
      if (m.tickInterval) clearInterval(m.tickInterval);
    });
  });

  describe('Bracket Logic', () => {
    test('Bracket Generation: creates valid 8-slot structure with bots', () => {
      gameService.startGame(match.id);

      expect(match.cup_bracket).toBeDefined();
      expect(match.cup_bracket.schedule).toHaveLength(7);
      expect(match.cup_bracket.slots).toHaveLength(7);
      
      const byeMatch = match.cup_bracket.schedule.find(m => m.p2 === 'BYE');
      expect(byeMatch).toBeDefined();
      expect(byeMatch.w).toBe(byeMatch.p1); 
    });

    test('Match Progression & BYE: winners advance to semi-finals', () => {
      gameService.startGame(match.id);
      const bracket = match.cup_bracket;

      // Simulasi pemenang babak 1
      bracket.schedule[0].w = bracket.schedule[0].p1; 
      bracket.schedule[1].w = bracket.schedule[1].p1; 
      bracket.schedule[2].w = bracket.schedule[2].p1; 
      
      // Paksa majukan bracket
      gameService._checkGameOver(match); 

      expect(bracket.schedule[4].p1).toBe(bracket.schedule[0].w);
      expect(bracket.schedule[4].p2).toBe(bracket.schedule[1].w);
      expect(bracket.schedule[5].p1).toBe(bracket.schedule[2].w);
    });

    test('HP Reset: winners of matchup have lives reset to 3', () => {
      gameService.startGame(match.id);
      const bracket = match.cup_bracket;

      const p2 = match.participants.get(bracket.active_p2);
      p2.eliminated = true;
      p2.is_spectator = true;
      const winnerId = bracket.active_p1;
      match.participants.get(winnerId).lives = 1;

      gameService._checkGameOver(match);
      expect(match.participants.get(winnerId).lives).toBe(3);
    });

    test('Player Kicked Logic: kicking active duelist awards win to remaining player', () => {
      gameService.startGame(match.id);
      const bracket = match.cup_bracket;

      // KUNCI JAWABAN: Simpan nama pemain yang masih hidup SEBELUM bracketnya maju!
      const expectedWinner = bracket.active_p2; 

      const p1 = match.participants.get(bracket.active_p1);
      p1.eliminated = true;
      p1.is_spectator = true;

      const over = gameService._checkGameOver(match);
      expect(over).toBe(false); 
      expect(bracket.schedule[0].w).toBe(expectedWinner); // Bandingkan dengan yang sudah dikunci
    });
  });

  describe('Restrictions', () => {
    test('Mode Change Restriction: leader cannot change mode if participant count > 2', () => {
      const localMatches = new Map();
      const p1 = createParticipant('h1');
      const p2 = createParticipant('h2');
      const p3 = createParticipant('h3');
      const lobby = { id: 'l1', mode: 'points', status: 'waiting', leader_id: 'h1', participants: new Map([[p1.user_id, p1], [p2.user_id, p2], [p3.user_id, p3]]) };
      localMatches.set(lobby.id, lobby);

      const localRouter = createLobbyRouter({ io, matches: localMatches, startGame: () => {} });
      const layer = localRouter.stack.find((l) => l.route && l.route.path === '/lobby/:lobby_id/settings');
      const handler = layer.route.stack[0].handle;

      let statusCode; let body;
      const res = { status: (s) => { statusCode = s; return res; }, json: (b) => { body = b; return res; } };
      const req = { params: { lobby_id: 'l1' }, body: { game_mode: 'cup', user_id: 'h1' } };

      handler(req, res);

      expect(statusCode).toBe(400);
      expect(body.error).toContain('Cannot change mode');
    });
  });
  
  describe('Restart Logic', () => {
    test('Play Again (Restart): resets status, clears bracket, resets stats and titles', () => {
      const users = new Map();
      const socket = { on: jest.fn(), id: 'socket-1', join: jest.fn(), leave: jest.fn(), emit: jest.fn() };
      
      registerLobbyHandlers({ io, socket, matches, users, gameService });
      
      const restartHandler = socket.on.mock.calls.find(call => call[0] === 'lobby:restart')[1];
      
      match.status = 'finished';
      match.winner_id = 'p1';
      match.cup_bracket = { schedule: [] };
      match.participants.get('p1').points = 5;
      match.participants.get('p1').custom_title = 'Champion';
      match.leader_id = 'p0';

      // Eksekusi fungsi restart
      restartHandler({ match_id: match.id, user_id: 'p0' });

      expect(match.status).toBe('waiting');
      expect(match.winner_id).toBeNull();
      expect(match.cup_bracket).toBeNull();
      expect(match.participants.get('p1').points).toBe(0);
      expect(match.participants.get('p1').custom_title).toBeNull();
    });
  });
});