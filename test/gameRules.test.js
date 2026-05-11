const { beats, resolveChoices } = require('../src/utils/gameRules');

describe('Testing Validation of 1v1 Seven-Hand Game Rules', () => {

  describe('beats() Function - Win Matrix Validation', () => {
    test('🪨 Rock must beat Fire, Scissors, Sponge', () => {
      expect(beats('Rock', 'Fire')).toBe(true);
      expect(beats('Rock', 'Scissors')).toBe(true);
      expect(beats('Rock', 'Sponge')).toBe(true);
    });

    test('🔥 Fire must beat Scissors, Sponge, Paper', () => {
      expect(beats('Fire', 'Scissors')).toBe(true);
      expect(beats('Fire', 'Sponge')).toBe(true);
      expect(beats('Fire', 'Paper')).toBe(true);
    });

    test('✂️ Scissors must beat Sponge, Paper, Air', () => {
      expect(beats('Scissors', 'Sponge')).toBe(true);
      expect(beats('Scissors', 'Paper')).toBe(true);
      expect(beats('Scissors', 'Air')).toBe(true);
    });

    test('🧽 Sponge must beat Paper, Air, Water', () => {
      expect(beats('Sponge', 'Paper')).toBe(true);
      expect(beats('Sponge', 'Air')).toBe(true);
      expect(beats('Sponge', 'Water')).toBe(true);
    });

    test('📄 Paper must beat Air, Water, Rock', () => {
      expect(beats('Paper', 'Air')).toBe(true);
      expect(beats('Paper', 'Water')).toBe(true);
      expect(beats('Paper', 'Rock')).toBe(true);
    });

    test('💨 Air must beat Water, Rock, Fire', () => {
      expect(beats('Air', 'Water')).toBe(true);
      expect(beats('Air', 'Rock')).toBe(true);
      expect(beats('Air', 'Fire')).toBe(true);
    });

    test('💧 Water must beat Rock, Fire, Scissors', () => {
      expect(beats('Water', 'Rock')).toBe(true);
      expect(beats('Water', 'Fire')).toBe(true);
      expect(beats('Water', 'Scissors')).toBe(true);
    });
  });

  describe('resolveChoices() Function - 1v1 Duel Logic', () => {
    test('Duel: Rock vs Fire -> Rock Wins', () => {
      const choices = [
        { userId: 'player1', element: 'Rock' },
        { userId: 'player2', element: 'Fire' }
      ];
      const result = resolveChoices(choices);
      expect(result.winners).toContain('player1');
      expect(result.losers).toContain('player2');
      expect(result.draw).toBe(false);
    });

    test('Duel: Fire vs Paper -> Fire Wins', () => {
      const choices = [
        { userId: 'player1', element: 'Fire' },
        { userId: 'player2', element: 'Paper' }
      ];
      const result = resolveChoices(choices);
      expect(result.winners).toContain('player1');
      expect(result.losers).toContain('player2');
      expect(result.draw).toBe(false);
    });

    test('Duel: Scissors vs Air -> Scissors Wins', () => {
      const choices = [
        { userId: 'player1', element: 'Scissors' },
        { userId: 'player2', element: 'Air' }
      ];
      const result = resolveChoices(choices);
      expect(result.winners).toContain('player1');
      expect(result.losers).toContain('player2');
      expect(result.draw).toBe(false);
    });

    test('Duel: Sponge vs Water -> Sponge Wins', () => {
      const choices = [
        { userId: 'player1', element: 'Sponge' },
        { userId: 'player2', element: 'Water' }
      ];
      const result = resolveChoices(choices);
      expect(result.winners).toContain('player1');
      expect(result.losers).toContain('player2');
      expect(result.draw).toBe(false);
    });

    test('Duel: Paper vs Rock -> Paper Wins', () => {
      const choices = [
        { userId: 'player1', element: 'Paper' },
        { userId: 'player2', element: 'Rock' }
      ];
      const result = resolveChoices(choices);
      expect(result.winners).toContain('player1');
      expect(result.losers).toContain('player2');
      expect(result.draw).toBe(false);
    });

    test('Duel: Air vs Water -> Air Wins', () => {
      const choices = [
        { userId: 'player1', element: 'Air' },
        { userId: 'player2', element: 'Water' }
      ];
      const result = resolveChoices(choices);
      expect(result.winners).toContain('player1');
      expect(result.losers).toContain('player2');
      expect(result.draw).toBe(false);
    });

    test('Duel: Water vs Fire -> Water Wins', () => {
      const choices = [
        { userId: 'player1', element: 'Water' },
        { userId: 'player2', element: 'Fire' }
      ];
      const result = resolveChoices(choices);
      expect(result.winners).toContain('player1');
      expect(result.losers).toContain('player2');
      expect(result.draw).toBe(false);
    });

    test('Duel: Air vs Air -> Draw Result', () => {
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