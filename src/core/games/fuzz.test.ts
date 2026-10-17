import { describe, expect, it } from 'vitest';
import { createRng } from '../cards/Shuffle';
import { GAME_MODULES } from './registry';
import type { GameId, NewGameOptions } from './types';

interface FuzzCase {
  gameId: GameId;
  options: NewGameOptions;
}

const CASES: FuzzCase[] = Array.from({ length: 12 }, (_, index) => {
  const variant = index % 3;
  if (index % 4 === 0) {
    return { gameId: 'klondike', options: { seed: `fuzz-k-${index}`, drawCount: variant === 0 ? 1 : 3 } };
  }
  if (index % 4 === 1) {
    return {
      gameId: 'spider',
      options: { seed: `fuzz-s-${index}`, suitCount: ([1, 2, 4] as const)[variant] },
    };
  }
  if (index % 4 === 2) return { gameId: 'freecell', options: { seed: `fuzz-f-${index}` } };
  return { gameId: 'pyramid', options: { seed: `fuzz-p-${index}` } };
});

describe('Случайные легальные партии всех режимов', () => {
  for (const { gameId, options } of CASES) {
    it(`${gameId} ${JSON.stringify(options)}: состояние остаётся валидным`, () => {
      const module = GAME_MODULES[gameId];
      const rng = createRng(`fuzz-moves:${gameId}:${options.seed}`);
      let state = module.createGame(options);
      expect(module.isValidState(state)).toBe(true);
      expect(module.isWon(state)).toBe(false);

      for (let step = 0; step < 60; step += 1) {
        const moves = module.legalMoves(state);
        if (!moves.length) break;
        expect(module.isValidState(state)).toBe(true);
        expect(module.isWon(state)).toBe(state.won);

        if (step % 9 === 0) {
          const hint = module.hint(state);
          if (hint) {
            expect(module.legalMoves(state).length).toBeGreaterThan(0);
            const viaHint = module.applyMove(state, hint.move);
            expect(module.isValidState(viaHint)).toBe(true);
          }
        }

        const move = moves[Math.floor(rng() * moves.length)];
        const before = state.moves;
        state = module.applyMove(state, move);
        expect(state.moves).toBe(before + 1);
        expect(state.score).toBeGreaterThanOrEqual(0);
        expect(module.isValidState(state)).toBe(true);
        expect(module.isWon(state)).toBe(state.won);

        if (state.won) {
          expect(module.legalMoves(state)).toHaveLength(0);
          break;
        }
      }
    });
  }

  it('детерминированный сид даёт одинаковые партии', () => {
    for (const { gameId, options } of CASES.slice(0, 4)) {
      const module = GAME_MODULES[gameId];
      const first = module.createGame(options) as { createdAt: number };
      const second = module.createGame(options) as { createdAt: number };
      expect({ ...first, createdAt: 0 }).toEqual({ ...second, createdAt: 0 });
    }
  });
});
