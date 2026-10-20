// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import App from '../App';
import { useGameStore } from '../store/gameStore';
import { GameSession } from '../core/session/GameSession';
import { klondikeModule } from '../core/games/klondike/Klondike';
import { spiderModule } from '../core/games/spider/Spider';
import { freecellModule } from '../core/games/freecell/FreeCell';
import { pyramidModule } from '../core/games/pyramid/Pyramid';
import { freecellFixture, klondikeFixture, pyramidFixture, spiderFixture } from './helpers';

vi.mock('../ui/components/Board', () => ({
  Board: () => <div data-testid="board-stub">board</div>,
}));

beforeAll(() => {
  localStorage.clear();
});

beforeEach(async () => {
  await useGameStore.getState().resetProgress();
  useGameStore.setState({
    screen: 'menu',
    modal: null,
    session: null,
    gameState: null,
    notifications: [],
    toast: null,
  });
});

afterEach(() => {
  cleanup();
});

type AnyModule = Parameters<typeof GameSession.create>[0];

/** Ставит в стор партию из фикстуры так, как это делает openGame, но без таймера. */
function loadSession(state: unknown, module: AnyModule) {
  const session = new GameSession(module, state as never, { startTimer: false });
  const snapshot = session.state as { moves: number; won: boolean };
  act(() => {
    useGameStore.setState({
      session: session as never,
      gameState: snapshot as never,
      canUndo: true,
      isWon: false,
      isStuck: false,
      screen: 'game',
      modal: null,
    });
  });
  return session;
}

const moves = () => useGameStore.getState().gameState as { moves: number };

describe('Победа засчитывается по последнему настоящему ходу во всех режимах', () => {
  it('Косынка: последний король в базе закрывает партию', async () => {
    const suits = ['clubs', 'diamonds', 'hearts', 'spades'];
    const foundations = suits.map((suit) => {
      const cards = [];
      for (let rank = 1; rank <= 12; rank += 1) {
        cards.push(`${rank === 1 ? 'A' : rank === 11 ? 'J' : rank === 12 ? 'Q' : rank}${suit[0]}`);
      }
      return cards;
    });
    const state = klondikeFixture({
      tableau: suits.map((suit) => [`K${suit[0]}`]),
      foundations: foundations.map((pile) => pile),
    });
    expect(state.foundations.map((pile) => pile.length)).toEqual([12, 12, 12, 12]);

    loadSession(state, klondikeModule);
    const session = useGameStore.getState().session!;
    // Три короля ещё не завершают партию — победа только на четвёртом.
    for (let index = 0; index < 3; index += 1) {
      act(() => {
        const ok = useGameStore.getState().handleDrop([`${suits[index]}-13-0`], `foundation-${index}`);
        expect(ok).toBe(true);
      });
    }
    expect(useGameStore.getState().isWon).toBe(false);
    act(() => {
      const ok = useGameStore.getState().handleDrop(['spades-13-0'], 'foundation-3');
      expect(ok).toBe(true);
    });
    expect(moves().moves).toBe(4);
    expect(useGameStore.getState().isWon).toBe(true);
    expect(useGameStore.getState().stats.klondike.wins).toBe(1);
    expect(useGameStore.getState().stats.klondike.played).toBe(1);
    expect(useGameStore.getState().canUndo).toBe(false);
    // Победная партия не остаётся в «Продолжить».
    expect(useGameStore.getState().sessions.klondike).toBeUndefined();
    expect(session.state.won).toBe(true);
  });

  it('Паук: восьмая последовательность завершает игру', async () => {
    const runTokens = (copy: number) =>
      ['K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2', 'A'].map(
        (rank) => `${rank}s#${copy}`,
      );
    const completed = Array.from({ length: 7 }, (_, copy) => runTokens(copy));
    const state = spiderFixture({
      suitCount: 1,
      completed,
      columns: [runTokens(7).slice(0, 12), ['As#7']],
    });

    loadSession(state, spiderModule);
    act(() => {
      const ok = useGameStore.getState().handleDrop(['spades-1-7'], 'spider-column-0');
      expect(ok).toBe(true);
    });
    expect(useGameStore.getState().isWon).toBe(true);
    expect(useGameStore.getState().stats.spider.wins).toBe(1);
    expect(useGameStore.getState().sessions.spider).toBeUndefined();
  });

  it('Свободная ячейка: четыре короля в базах дают победу', async () => {
    const suits = ['clubs', 'diamonds', 'hearts', 'spades'];
    const foundations = suits.map((suit) => {
      const cards: string[] = [];
      for (let rank = 1; rank <= 12; rank += 1) {
        cards.push(`${rank === 1 ? 'A' : rank === 11 ? 'J' : rank === 12 ? 'Q' : rank}${suit[0]}`);
      }
      return cards;
    });
    const state = freecellFixture({
      columns: suits.map((suit) => [`K${suit[0]}`]),
      foundations: foundations.map((pile) => pile),
    });

    loadSession(state, freecellModule);
    for (let index = 0; index < 4; index += 1) {
      act(() => {
        const ok = useGameStore.getState().handleDrop(
          [`${suits[index]}-13-0`],
          `freecell-foundation-${index}`,
        );
        expect(ok).toBe(true);
      });
      expect(useGameStore.getState().isWon).toBe(index === 3);
    }
    expect(useGameStore.getState().stats.freecell.wins).toBe(1);
    expect(useGameStore.getState().sessions.freecell).toBeUndefined();
  });

  it('Пирамида: снятие последней карты закрывает партию', async () => {
    // На вершине пирамиды шестёрка, в сбросе семёрка: 6 + 7 = 13.
    const state = pyramidFixture({ pyramid: [['6h'], ['2c', '3c']], waste: ['7s'] });
    // Отмечаем снятыми все карты, кроме верхней в пирамиде.
    state.removed = state.removed.map((row, rowIndex) =>
      row.map((_cell, colIndex) => !(rowIndex === 0 && colIndex === 0)),
    );
    expect(state.pyramid[0][0].card.rank).toBe(6);
    expect(state.waste[state.waste.length - 1].card.rank).toBe(7);
    expect(pyramidModule.isWon(state)).toBe(false);

    loadSession(state, pyramidModule);
    const topId = state.pyramid[0][0].card.id;
    act(() => {
      const ok = useGameStore.getState().handleDrop([topId], 'pyramid-waste');
      expect(ok).toBe(true);
    });
    expect(useGameStore.getState().isWon).toBe(true);
    expect(useGameStore.getState().stats.pyramid.wins).toBe(1);
    expect(useGameStore.getState().sessions.pyramid).toBeUndefined();
  });

  it('победа ровно один раз: оверлей, статистика и сохранение не дублируются', async () => {
    const suits = ['clubs', 'diamonds', 'hearts', 'spades'];
    const foundations = suits.map((suit) => {
      const cards: string[] = [];
      for (let rank = 1; rank <= 12; rank += 1) {
        cards.push(`${rank === 1 ? 'A' : rank === 11 ? 'J' : rank === 12 ? 'Q' : rank}${suit[0]}`);
      }
      return cards;
    });
    const state = klondikeFixture({
      tableau: suits.map((suit) => [`K${suit[0]}`]),
      foundations,
    });

    render(<App />);
    await waitFor(() => {
      expect(useGameStore.getState().hydrated).toBe(true);
    }, { timeout: 4000 });

    loadSession(state, klondikeModule);
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Косынка' })).toBeTruthy();
    });

    act(() => {
      for (let index = 0; index < 4; index += 1) {
        useGameStore.getState().handleDrop([`${suits[index]}-13-0`], `foundation-${index}`);
      }
    });
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Победа!' })).toBeTruthy();
    });

    // Повторный finalizeWin ничего не добавляет.
    act(() => {
      expect(useGameStore.getState().finalizeWin()).toBe(false);
      expect(useGameStore.getState().finalizeWin()).toBe(false);
    });
    expect(useGameStore.getState().stats.klondike.wins).toBe(1);
    expect(useGameStore.getState().stats.klondike.played).toBe(1);
    expect(useGameStore.getState().career.totalWins).toBe(1);

    // Новая партия после победы не записывает поражение.
    act(() => {
      useGameStore.getState().newGame({ drawCount: 1 });
    });
    expect(useGameStore.getState().stats.klondike.played).toBe(1);
    expect(useGameStore.getState().stats.klondike.wins).toBe(1);
    expect(useGameStore.getState().isWon).toBe(false);
  });
});
