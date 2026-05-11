const { beats, resolveChoices } = require('../src/utils/gameRules');

describe('Pengujian Validasi Aturan 1v1 Seven-Hand Game', () => {

  describe('Fungsi beats() - Validasi Matrix Kemenangan', () => {
    test('🪨 Rock harus menang vs Fire, Scissors, Sponge', () => {
      expect(beats('Rock', 'Fire')).toBe(true);
      expect(beats('Rock', 'Scissors')).toBe(true);
      expect(beats('Rock', 'Sponge')).toBe(true);
    });

    test('🔥 Fire harus menang vs Scissors, Sponge, Paper', () => {
      expect(beats('Fire', 'Scissors')).toBe(true);
      expect(beats('Fire', 'Sponge')).toBe(true);
      expect(beats('Fire', 'Paper')).toBe(true);
    });

    test('✂️ Scissors harus menang vs Sponge, Paper, Air', () => {
      expect(beats('Scissors', 'Sponge')).toBe(true);
      expect(beats('Scissors', 'Paper')).toBe(true);
      expect(beats('Scissors', 'Air')).toBe(true);
    });

    test('🧽 Sponge harus menang vs Paper, Air, Water', () => {
      expect(beats('Sponge', 'Paper')).toBe(true);
      expect(beats('Sponge', 'Air')).toBe(true);
      expect(beats('Sponge', 'Water')).toBe(true);
    });

    test('📄 Paper harus menang vs Air, Water, Rock', () => {
      expect(beats('Paper', 'Air')).toBe(true);
      expect(beats('Paper', 'Water')).toBe(true);
      expect(beats('Paper', 'Rock')).toBe(true);
    });

    test('💨 Air harus menang vs Water, Rock, Fire', () => {
      expect(beats('Air', 'Water')).toBe(true);
      expect(beats('Air', 'Rock')).toBe(true);
      expect(beats('Air', 'Fire')).toBe(true);
    });

    test('💧 Water harus menang vs Rock, Fire, Scissors', () => {
      expect(beats('Water', 'Rock')).toBe(true);
      expect(beats('Water', 'Fire')).toBe(true);
      expect(beats('Water', 'Scissors')).toBe(true);
    });
  });

  describe('Fungsi resolveChoices() - 1v1 Duel Logic', () => {
    test('Duel: Rock vs Fire -> Rock Menang', () => {
      const choices = [
        { userId: 'player1', element: 'Rock' },
        { userId: 'player2', element: 'Fire' }
      ];
      const result = resolveChoices(choices);
      expect(result.winners).toContain('player1');
      expect(result.losers).toContain('player2');
      expect(result.draw).toBe(false);
    });

    test('Duel: Fire vs Paper -> Fire Menang', () => {
      const choices = [
        { userId: 'player1', element: 'Fire' },
        { userId: 'player2', element: 'Paper' }
      ];
      const result = resolveChoices(choices);
      expect(result.winners).toContain('player1');
      expect(result.losers).toContain('player2');
      expect(result.draw).toBe(false);
    });

    test('Duel: Scissors vs Air -> Scissors Menang', () => {
      const choices = [
        { userId: 'player1', element: 'Scissors' },
        { userId: 'player2', element: 'Air' }
      ];
      const result = resolveChoices(choices);
      expect(result.winners).toContain('player1');
      expect(result.losers).toContain('player2');
      expect(result.draw).toBe(false);
    });

    test('Duel: Sponge vs Water -> Sponge Menang', () => {
      const choices = [
        { userId: 'player1', element: 'Sponge' },
        { userId: 'player2', element: 'Water' }
      ];
      const result = resolveChoices(choices);
      expect(result.winners).toContain('player1');
      expect(result.losers).toContain('player2');
      expect(result.draw).toBe(false);
    });

    test('Duel: Paper vs Rock -> Paper Menang', () => {
      const choices = [
        { userId: 'player1', element: 'Paper' },
        { userId: 'player2', element: 'Rock' }
      ];
      const result = resolveChoices(choices);
      expect(result.winners).toContain('player1');
      expect(result.losers).toContain('player2');
      expect(result.draw).toBe(false);
    });

    test('Duel: Air vs Water -> Air Menang', () => {
      const choices = [
        { userId: 'player1', element: 'Air' },
        { userId: 'player2', element: 'Water' }
      ];
      const result = resolveChoices(choices);
      expect(result.winners).toContain('player1');
      expect(result.losers).toContain('player2');
      expect(result.draw).toBe(false);
    });

    test('Duel: Water vs Fire -> Water Menang', () => {
      const choices = [
        { userId: 'player1', element: 'Water' },
        { userId: 'player2', element: 'Fire' }
      ];
      const result = resolveChoices(choices);
      expect(result.winners).toContain('player1');
      expect(result.losers).toContain('player2');
      expect(result.draw).toBe(false);
    });

    test('Duel: Air vs Air -> Hasil Seri (Draw)', () => {
      const choices = [
        { userId: 'player1', element: 'Air' },
        { userId: 'player2', element: 'Air' }
      ];
      const result = resolveChoices(choices);
      expect(result.draw).toBe(true);
      expect(result.winners.length).toBe(2);
    });
  });
});