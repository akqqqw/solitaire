// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../store/gameStore';
import { getBoardAdapter } from '../game/adapters/interactions';
import { GAME_MODULES } from '../core/games/registry';
import type { GameId } from '../core/games/types';

beforeAll(() => {
  localStorage.clear();
});

beforeEach(async () => {
  await useGameStore.getState().resetProgress();
  useGameStore.setState({ screen: 'game', modal: null, session: null, gameState: null });
});

afterEach(() => {
  useGameStore.getState().flushProfile();
});

interface Step {
  cards: string[];
  slot: string;
}

/** Ищет любой легальный ход через адаптер — тот же путь, что использовал бы игрок. */
function findMove(gameId: GameId): Step | null {
  const store = useGameStore.getState();
  const state = store.gameState;
  if (!state) return null;
  const adapter = getBoardAdapter(gameId);
  const data = state as {
    tableau?: { card: { id: string }; faceUp: boolean }[][];
    columns?: { card: { id: string }; faceUp: boolean }[][];
    waste?: { card: { id: string } }[];
    foundations?: { card: { id: string } }[][];
    freeCells?: ({ card: { id: string } } | null)[];
  };
  const ids: string[] = [];
  for (const column of data.tableau ?? data.columns ?? []) {
    for (const placed of column) if (placed.faceUp) ids.push(placed.card.id);
  }
  for (const placed of data.waste ?? []) ids.push(placed.card.id);
  for (const pile of data.foundations ?? []) {
    const top = pile[pile.length - 1];
    if (top) ids.push(top.card.id);
  }
  for (const cell of data.freeCells ?? []) if (cell) ids.push(cell.card.id);

  // Сначала базы, потом столбцы, в самом конце — свободные ячейки:
  // иначе первый же найденный ход гоняет карты туда-обратно.
  // Важно: 'freecell-column-0' тоже содержит 'cell', поэтому только префиксы.
  const isCell = (slot: string) => /(^|-)cell-/.test(slot);
  const isFoundation = (slot: string) => /(^|-)foundation-/.test(slot);
  const rank = (slot: string): number => {
    if (isFoundation(slot)) return 0;
    if (isCell(slot)) return 2;
    return 1;
  };
  let best: (Step & { score: number }) | null = null;
  for (const id of ids) {
    const selection = adapter.selectCards(state, id);
    if (!selection) continue;
    for (const slot of adapter.dropSlots(state, selection)) {
      // Карта из свободной ячейки обратно в ячейку — пустая трата хода.
      if (isCell(selection.slot) && isCell(slot)) continue;
      const score = rank(slot);
      if (!best || score < best.score) best = { cards: selection.cards, slot, score };
      if (score === 0) break;
    }
    if (best?.score === 0) break;
  }
  return best ? { cards: best.cards, slot: best.slot } : null;
}

function stockSlot(gameId: GameId): string | null {
  if (gameId === 'klondike') return 'stock';
  if (gameId === 'spider') return 'spider-stock';
  if (gameId === 'pyramid') return 'pyramid-stock';
  return null;
}

describe('долгая партия через стор не ломает состояние', () => {
  for (const gameId of ['klondike', 'spider', 'freecell', 'pyramid'] as GameId[]) {
    it(`${gameId}: 60 ходов подряд, состояние валидно, история отмены ограничена`, () => {
      const store = useGameStore.getState();
      store.openGame(gameId);
      // Фиксированный расклад: тест не должен зависеть от случайной раздачи.
      useGameStore.getState().newGame({ seed: `stress-${gameId}`, drawCount: 1, suitCount: 2 });
      const module = GAME_MODULES[gameId];
      const adapter = getBoardAdapter(gameId);

      let applied = 0;
      let stockClicks = 0;
      let stagnant = 0;
      for (let step = 0; step < 120; step += 1) {
        const move = findMove(gameId);
        if (move) {
          const ok = useGameStore.getState().handleDrop(move.cards, move.slot);
          expect(ok).toBe(true);
          applied += 1;
          stagnant = 0;
        } else {
          const stock = stockSlot(gameId);
          if (!stock) break;
          const before = useGameStore.getState().gameState as { moves: number };
          useGameStore.getState().handleSlotClick(stock);
          const after = useGameStore.getState().gameState as { moves: number };
          if (after.moves === before.moves) {
            // Колода перевернулась или раздача недоступна — дальше искать нечего.
            stagnant += 1;
            if (stagnant >= 2) break;
          } else {
            stockClicks += 1;
          }
        }
        const state = useGameStore.getState().gameState as { moves: number; score: number; won: boolean };
        expect(module.isValidState(state)).toBe(true);
        expect(state.moves).toBe(applied + stockClicks);
        expect(state.score).toBeGreaterThanOrEqual(0);
        expect(useGameStore.getState().isWon).toBe(state.won);
        expect(adapter.dropSlots(state, null)).toEqual([]);
      }

      expect(applied + stockClicks).toBeGreaterThan(20);
      // Ходы должны быть настоящими, а не только переворотами колоды.
      expect(applied).toBeGreaterThan(5);
      const session = useGameStore.getState().session;
      expect(session).toBeTruthy();
      const undo = (session as unknown as { undoStack: unknown[] }).undoStack;
      expect(undo.length).toBeLessThanOrEqual(40);
      expect(useGameStore.getState().notifications.length).toBeLessThanOrEqual(4);
      // Подсказка в любой момент — либо ход, либо честный отказ.
      const hint = session?.hint();
      if (hint) {
        expect(hint.text.length).toBeGreaterThan(3);
        expect(adapter.hintSlotIds(session!.state, hint).length).toBeLessThanOrEqual(2);
      }
    }, 30000);
  }

  it('отмена возвращает ровно предыдущее состояние и не уходит в минус', async () => {
    const store = useGameStore.getState();
    store.openGame('klondike');
    useGameStore.getState().newGame({ drawCount: 1 });

    const snapshots: unknown[] = [];
    for (let step = 0; step < 12; step += 1) {
      snapshots.push(structuredClone(useGameStore.getState().gameState));
      const move = findMove('klondike');
      if (move) useGameStore.getState().handleDrop(move.cards, move.slot);
      else useGameStore.getState().handleSlotClick('stock');
    }
    expect(snapshots.length).toBe(12);

    for (let step = 11; step >= 0; step -= 1) {
      await useGameStore.getState().undo();
      const state = structuredClone(useGameStore.getState().gameState);
      expect(state).toEqual(snapshots[step]);
    }
    // Больше отменять нечего, состояние не портится.
    await useGameStore.getState().undo();
    await useGameStore.getState().undo();
    expect(useGameStore.getState().canUndo).toBe(false);
    expect((useGameStore.getState().gameState as { moves: number }).moves).toBe(0);
  }, 30000);
});
