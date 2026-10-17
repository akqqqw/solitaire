import { describe, expect, it } from 'vitest';
import { createRng } from '../../core/cards/Shuffle';
import { GAME_MODULES } from '../../core/games/registry';
import type { GameId, NewGameOptions } from '../../core/games/types';
import { presentBoard } from '../view';
import {
  getBoardAdapter,
  type BoardAdapter,
  type InteractionResult,
} from './interactions';

interface FuzzCase {
  gameId: GameId;
  options: NewGameOptions;
}

const CASES: FuzzCase[] = [
  { gameId: 'klondike', options: { seed: 'click-k', drawCount: 1 } },
  { gameId: 'klondike', options: { seed: 'click-k3', drawCount: 3 } },
  { gameId: 'spider', options: { seed: 'click-s1', suitCount: 1 } },
  { gameId: 'spider', options: { seed: 'click-s4', suitCount: 4 } },
  { gameId: 'freecell', options: { seed: 'click-f' } },
  { gameId: 'pyramid', options: { seed: 'click-p' } },
];

const present = (state: unknown, gameId: GameId) =>
  presentBoard(gameId, state as never, {
    width: 390,
    height: 700,
    selected: null,
    hint: null,
    hintSlotIds: [],
    dropSlotIds: [],
    cardBack: 'emerald',
    animations: false,
  });

/** Проверяет, что адаптер не отдаёт заведомо невозможный набор ходов. */
function auditResult(
  gameId: GameId,
  state: unknown,
  result: InteractionResult,
  counters: { moves: number; checks: number },
): void {
  counters.checks += 1;
  if (result.type !== 'moves') return;
  counters.moves += 1;
  const module = GAME_MODULES[gameId];
  expect(result.moves.length).toBeGreaterThan(0);
  let draft = state;
  for (const move of result.moves) draft = module.applyMove(draft, move as never);
  expect(module.isValidState(draft)).toBe(true);
}

describe('Адаптеры: любой клик остаётся корректным', () => {
  for (const { gameId, options } of CASES) {
    it(`${gameId} ${JSON.stringify(options)}: карты, слоты, сброс и перетаскивание`, () => {
      const module = GAME_MODULES[gameId];
      const adapter: BoardAdapter = getBoardAdapter(gameId);
      const rng = createRng(`fuzz-clicks:${gameId}:${options.seed}`);
      let state = module.createGame(options);
      for (let step = 0; step < 12; step += 1) {
        const moves = module.legalMoves(state);
        if (!moves.length) break;
        state = module.applyMove(state, moves[Math.floor(rng() * moves.length)]);
      }
      expect(module.isValidState(state)).toBe(true);

      const view = present(state, gameId);
      const counters = { moves: 0, checks: 0 };
      const sample = <T,>(items: T[], count: number): T[] => {
        if (items.length <= count) return items;
        return Array.from({ length: count }, () => items[Math.floor(rng() * items.length)]);
      };

      for (const card of view.cards) {
        const selection = adapter.selectCards(state, card.id);
        auditResult(gameId, state, adapter.clickCard(state, card.id, null), counters);
        auditResult(gameId, state, adapter.doubleClick(state, card.id), counters);
        if (!selection) continue;
        for (const other of sample(view.cards, 6)) {
          auditResult(gameId, state, adapter.clickCard(state, other.id, selection), counters);
        }
        for (const slot of sample(view.slots, 5)) {
          auditResult(gameId, state, adapter.clickSlot(state, slot.id, selection), counters);
        }
        for (const slotId of adapter.dropSlots(state, selection)) {
          auditResult(gameId, state, adapter.drop(state, selection.cards, slotId), counters);
        }
      }

      for (const slot of view.slots) {
        const selection = adapter.selectCards(state, view.cards[0].id);
        auditResult(gameId, state, adapter.clickSlot(state, slot.id, null), counters);
        if (selection) {
          auditResult(gameId, state, adapter.clickSlot(state, slot.id, selection), counters);
        }
      }

      expect(counters.checks, `${gameId}: ${JSON.stringify(counters)}`).toBeGreaterThan(30);
      expect(counters.moves, `${gameId}: ${JSON.stringify(counters)}`).toBeGreaterThan(0);
      expect(module.isValidState(state)).toBe(true);
    });
  }
});
