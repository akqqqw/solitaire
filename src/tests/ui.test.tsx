// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from '../App';
import { useGameStore } from '../store/gameStore';
import { ACHIEVEMENTS } from '../core/achievements/achievements';
import { getBoardAdapter } from '../game/adapters/interactions';
import type { Card } from '../core/cards/Card';
import type { KlondikeState } from '../core/games/klondike/Klondike';
import type { SpiderState } from '../core/games/spider/Spider';
import { createFreeCellGame, type FreeCellState } from '../core/games/freecell/FreeCell';
import { pyramidModule, type PyramidState } from '../core/games/pyramid/Pyramid';
import { GameSession } from '../core/session/GameSession';
import { pyramidFixture } from './helpers';
import { emptyCareer, emptyStatsMap } from '../core/statistics/stats';

vi.mock('../ui/components/Board', () => ({
  Board: () => <div data-testid="board-stub">board</div>,
}));

beforeAll(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('Пасьянс Клуб — интерфейс и состояние', () => {
  it('проходит путь: меню → Косынка → новая партия по три → пауза → правила → меню → экраны', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Пасьянс/ })).toBeTruthy();
    }, { timeout: 4000 });

    expect(screen.getByText('Выберите пасьянс')).toBeTruthy();
    const playButtons = screen.getAllByRole('button', { name: /^Играть$/ });
    expect(playButtons).toHaveLength(4);
    fireEvent.click(playButtons[0]);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Косынка' })).toBeTruthy();
    });
    expect(screen.getByTestId('board-stub')).toBeTruthy();
    expect(screen.getByText('Ходы')).toBeTruthy();
    expect(screen.getByText('Счёт')).toBeTruthy();

    const store = useGameStore.getState();
    expect(store.screen).toBe('game');
    expect(store.session?.gameId).toBe('klondike');
    expect(store.gameState?.moves).toBe(0);
    expect(store.canUndo).toBe(false);

    // Подсказка: показывает только реально допустимый ход из модуля.
    fireEvent.click(screen.getByRole('button', { name: /Подсказка/ }));
    await waitFor(() => {
      expect(document.querySelector('.hint-bar-text')?.textContent?.length).toBeGreaterThan(3);
    });

    // Новая партия по три карты.
    fireEvent.click(screen.getByRole('button', { name: /^Новая$/ }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Новая партия' })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: /По три/ }));
    fireEvent.click(screen.getByRole('button', { name: /Начать партию/ }));
    await waitFor(() => {
      const state = useGameStore.getState().session?.state as { drawCount?: number } | undefined;
      expect(state?.drawCount).toBe(3);
    });
    expect(useGameStore.getState().modal).toBeNull();

    // Пауза и правила.
    fireEvent.click(screen.getByRole('button', { name: 'Пауза и меню' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Пауза' })).toBeTruthy();
    });
    const sessionAtPause = useGameStore.getState().session;
    expect(sessionAtPause?.isRunning).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: /^Правила/ }));
    await waitFor(() => {
      expect(document.querySelector('.modal-panel')).toBeTruthy();
    });
    const rulesModal = within(document.querySelector('.modal-panel') as HTMLElement);
    expect(rulesModal.getByRole('heading', { name: 'Косынка' })).toBeTruthy();
    expect(document.querySelectorAll('.rules-list li').length).toBeGreaterThan(2);
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    await waitFor(() => {
      expect(document.querySelector('.modal-panel')).toBeNull();
    });

    // Выход в меню сохраняет незавершённую партию.
    fireEvent.click(screen.getByRole('button', { name: 'Пауза и меню' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Пауза' })).toBeTruthy();
    });
    fireEvent.click(
      within(document.querySelector('.modal-panel') as HTMLElement).getByRole('button', {
        name: /В главное меню/,
      }),
    );
    await waitFor(() => {
      expect(screen.getByText('Выберите пасьянс')).toBeTruthy();
    });
    expect(useGameStore.getState().screen).toBe('menu');
    expect(useGameStore.getState().sessions.klondike).toBeTruthy();
    expect(screen.getByRole('button', { name: /Продолжить партию/ })).toBeTruthy();

    const quick = (label: string) => {
      const button = Array.from(document.querySelectorAll<HTMLButtonElement>('.quick-card')).find(
        (element) => element.textContent?.includes(label),
      );
      expect(button).toBeTruthy();
      return button as HTMLButtonElement;
    };

    // Статистика.
    fireEvent.click(quick('Статистика'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Статистика' })).toBeTruthy();
    });
    expect(screen.getAllByText('Косынка').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Сыграно').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /Меню/ }));

    // Достижения.
    await waitFor(() => {
      expect(screen.getByText('Выберите пасьянс')).toBeTruthy();
    });
    fireEvent.click(quick('Достижения'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Достижения' })).toBeTruthy();
    });
    expect(document.querySelectorAll('.ach-card')).toHaveLength(ACHIEVEMENTS.length);
    fireEvent.click(screen.getByRole('button', { name: /Меню/ }));

    // Настройки: переключатель анимаций меняет сохранённые настройки.
    await waitFor(() => {
      expect(screen.getByText('Выберите пасьянс')).toBeTruthy();
    });
    fireEvent.click(quick('Настройки'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Настройки' })).toBeTruthy();
    });
    const switches = screen.getAllByRole('switch');
    const before = useGameStore.getState().settings.animations;
    fireEvent.click(switches[0]);
    expect(useGameStore.getState().settings.animations).toBe(!before);

    // Возврат в меню и ежедневный экран с наградой за вход.
    fireEvent.click(screen.getByRole('button', { name: /Меню/ }));
    await waitFor(() => {
      expect(screen.getByText('Выберите пасьянс')).toBeTruthy();
    });
    const coinsBefore = useGameStore.getState().coins;
    fireEvent.click(screen.getByRole('button', { name: 'Ежедневное испытание' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Испытание дня' })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: /Забрать \d+ монет/ }));
    await waitFor(() => {
      expect(useGameStore.getState().coins).toBeGreaterThan(coinsBefore);
    });
    expect(document.querySelectorAll('.challenge-card')).toHaveLength(3);
  }, 20000);

  it('Косынка: ходы через адаптер, подсказка, отмена и возобновление партии', async () => {
    const store = useGameStore.getState();
    store.openGame('klondike');
    useGameStore.getState().newGame({ drawCount: 1 });

    const adapter = getBoardAdapter('klondike');
    const getKlondike = () => useGameStore.getState().gameState as KlondikeState;
    expect(getKlondike().stock.length).toBeGreaterThan(0);
    expect(getKlondike().drawCount).toBe(1);

    // Клик по колоде (слот stock) открывает карту.
    const stockBefore = getKlondike().stock.length;
    act(() => useGameStore.getState().handleSlotClick('stock'));
    expect(getKlondike().stock.length).toBe(stockBefore - 1);
    expect(getKlondike().moves).toBe(1);
    expect(useGameStore.getState().canUndo).toBe(true);

    // Подсказка возвращает текст и подсвечиваемые слоты (не выдуманный ход).
    await act(async () => {
      await useGameStore.getState().requestHint();
    });
    expect(useGameStore.getState().hint?.text.length).toBeGreaterThan(3);

    // Отмена возвращает колоду.
    await act(async () => {
      await useGameStore.getState().undo();
    });
    expect(getKlondike().stock.length).toBe(stockBefore);
    expect(getKlondike().moves).toBe(0);

    // Ищем реальный ход среди открытых карт; при необходимости тянем из колоды.
    const findMove = (): { cards: string[]; slot: string } | null => {
      const state = getKlondike();
      const ids: string[] = [];
      state.tableau.forEach((column: { card: Card; faceUp: boolean }[]) => {
        column.forEach((placed) => {
          if (placed.faceUp) ids.push(placed.card.id);
        });
      });
      const wasteTop = state.waste[state.waste.length - 1];
      if (wasteTop) ids.push(wasteTop.card.id);
      for (const id of ids) {
        const selection = adapter.selectCards(state, id);
        if (!selection) continue;
        const slots = adapter.dropSlots(state, selection);
        if (slots.length) return { cards: selection.cards, slot: slots[0] };
      }
      return null;
    };

    let move = findMove();
    for (let i = 0; i < 15 && !move; i += 1) {
      act(() => useGameStore.getState().handleSlotClick('stock'));
      move = findMove();
    }
    expect(move).toBeTruthy();

    const movesBefore = getKlondike().moves;
    act(() => {
      useGameStore.getState().handleDrop(move!.cards, move!.slot);
    });
    const after = getKlondike();
    expect(after.moves).toBe(movesBefore + 1);
    expect(useGameStore.getState().selection).toBeNull();

    // Закрытие и возобновление сохраняют тот же расклад.
    const seed = after.seed;
    const movesNow = after.moves;
    act(() => useGameStore.getState().closeGame());
    expect(useGameStore.getState().sessions.klondike).toBeTruthy();
    act(() => useGameStore.getState().openGame('klondike'));
    const resumed = getKlondike();
    expect(resumed.seed).toBe(seed);
    expect(resumed.moves).toBe(movesNow);
  });

  it('Паук: выбор сложности, раздача, подсказка, отмена и отсутствие автосборки', async () => {
    act(() => {
      useGameStore.getState().openGame('spider');
      useGameStore.getState().newGame({ suitCount: 2 });
    });

    const spider = () => useGameStore.getState().gameState as SpiderState;
    expect(spider().suitCount).toBe(2);
    expect(spider().columns).toHaveLength(10);
    expect(spider().stock).toHaveLength(50);
    expect(spider().columns.flat().length).toBe(54);
    expect(spider().moves).toBe(0);

    render(<App />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Паук' })).toBeTruthy();
    });
    expect(screen.getByText(/Собрано 0 из 8/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Автосборка/ })).toBeNull();

    act(() => useGameStore.getState().handleSlotClick('spider-stock'));
    expect(spider().stock).toHaveLength(40);
    expect(spider().moves).toBe(1);
    expect(spider().columns.every((col) => col.length >= 6)).toBe(true);

    await act(async () => {
      await useGameStore.getState().undo();
    });
    expect(spider().stock).toHaveLength(50);
    expect(spider().moves).toBe(0);

    await act(async () => {
      await useGameStore.getState().requestHint();
    });
    expect(useGameStore.getState().hint?.text.length).toBeGreaterThan(3);

    fireEvent.click(screen.getByRole('button', { name: /^Новая$/ }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Новая партия' })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: /Четыре масти/ }));
    fireEvent.click(screen.getByRole('button', { name: /Начать партию/ }));
    await waitFor(() => {
      expect((useGameStore.getState().gameState as SpiderState).suitCount).toBe(4);
    });
    expect((useGameStore.getState().gameState as SpiderState).moves).toBe(0);
    expect(useGameStore.getState().isWon).toBe(false);

    // Партия Паука сохраняется и возобновляется без потери расклада.
    act(() => useGameStore.getState().handleSlotClick('spider-stock'));
    const played = spider();
    expect(played.stock).toHaveLength(40);
    act(() => useGameStore.getState().closeGame());
    expect(useGameStore.getState().sessions.spider).toBeTruthy();
    act(() => useGameStore.getState().openGame('spider'));
    const restored = spider();
    expect(restored.seed).toBe(played.seed);
    expect(restored.moves).toBe(played.moves);
    expect(restored.stock).toHaveLength(40);
    expect(useGameStore.getState().canUndo).toBe(true);
  });

  it('Свободная ячейка: номер расклада, ячейки, автосборка и повтор раздачи', async () => {
    act(() => {
      useGameStore.getState().openGame('freecell');
      useGameStore.getState().newGame({ seed: '482913' });
    });
    const freecell = () => useGameStore.getState().gameState as FreeCellState;
    expect(freecell().seed).toBe('482913');
    expect(freecell().columns.flat()).toHaveLength(52);
    expect(freecell().freeCells.filter(Boolean)).toHaveLength(0);

    render(<App />);
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: 'Свободная ячейка' }),
      ).toBeTruthy();
    });
    expect(screen.getByText(/Расклад № 482913/)).toBeTruthy();
    expect(screen.getByText(/свободных ячеек 4\/4/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Автосборка/ })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^Новая$/ }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Новая партия' })).toBeTruthy();
    });
    const seedField = screen.getByPlaceholderText('Например, 482913') as HTMLInputElement;
    fireEvent.change(seedField, { target: { value: '77a77777' } });
    expect(seedField.value).toBe('7777777');
    fireEvent.change(seedField, { target: { value: '777777' } });
    fireEvent.click(screen.getByRole('button', { name: /Начать партию/ }));

    await waitFor(() => {
      expect(freecell().seed).toBe('777777');
    });
    const expected = createFreeCellGame({ seed: '777777' });
    expect(freecell().columns.map((col) => col.map((c) => c.card.id))).toEqual(
      expected.columns.map((col) => col.map((c) => c.card.id)),
    );
    expect(freecell().moves).toBe(0);

    const before = freecell().foundations.reduce((sum, pile) => sum + pile.length, 0);
    act(() => useGameStore.getState().autoCollect());
    const after = (useGameStore.getState().gameState as FreeCellState).foundations.reduce(
      (sum, pile) => sum + pile.length,
      0,
    );
    expect(after).toBeGreaterThanOrEqual(before);
    expect(useGameStore.getState().isStuck).toBe(false);
  });

  it('Пирамида: колода, сброс, подсказка, отмена и новая партия', async () => {
    act(() => {
      useGameStore.getState().openGame('pyramid');
      useGameStore.getState().newGame({});
    });
    const pyramid = () => useGameStore.getState().gameState as PyramidState;
    expect(pyramid().pyramid.map((row) => row.length)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(pyramid().stock).toHaveLength(24);
    expect(pyramid().waste).toHaveLength(0);
    expect(pyramid().moves).toBe(0);

    render(<App />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Пирамида' })).toBeTruthy();
    });
    expect(screen.getByText(/Убрано 0 из 28/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Автосборка/ })).toBeNull();

    act(() => useGameStore.getState().handleSlotClick('pyramid-stock'));
    expect(pyramid().stock).toHaveLength(23);
    expect(pyramid().waste).toHaveLength(1);
    expect(pyramid().moves).toBe(1);
    expect(useGameStore.getState().canUndo).toBe(true);

    await act(async () => {
      await useGameStore.getState().requestHint();
    });
    expect(useGameStore.getState().hint?.text.length).toBeGreaterThan(3);

    await act(async () => {
      await useGameStore.getState().undo();
    });
    expect(pyramid().stock).toHaveLength(24);
    expect(pyramid().waste).toHaveLength(0);
    expect(pyramid().moves).toBe(0);

    // После пустой колоды сброс можно перевернуть.
    act(() => {
      for (let i = 0; i < 24; i += 1) useGameStore.getState().handleSlotClick('pyramid-stock');
    });
    expect(pyramid().stock).toHaveLength(0);
    expect(pyramid().waste).toHaveLength(24);
    act(() => useGameStore.getState().handleSlotClick('pyramid-stock'));
    expect(pyramid().cycles).toBe(1);
    expect(pyramid().stock).toHaveLength(24);
    expect(pyramid().waste).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: /^Новая$/ }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Новая партия' })).toBeTruthy();
    });
    expect(screen.getByText(/Сброс можно переворачивать без ограничений/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Начать партию/ }));
    await waitFor(() => {
      expect(pyramid().moves).toBe(0);
    });
    expect(pyramid().stock).toHaveLength(24);
    expect(pyramid().cycles).toBe(0);
  });

  it('экран победы: показывает итоги, поле по кнопке и возврат в меню', async () => {
    const won = pyramidFixture();
    won.removed = Array.from({ length: 7 }, (_, row) =>
      Array.from({ length: row + 1 }, () => true),
    );
    won.won = true;
    won.moves = 41;
    won.score = 380;
    const session = new GameSession(pyramidModule, won, {
      elapsedMs: 125_000,
      hintsUsed: 0,
      startTimer: false,
    });
    act(() => {
      useGameStore.setState({
        session,
        gameState: won,
        screen: 'game',
        isWon: true,
        isStuck: false,
        canUndo: true,
      });
    });

    render(<App />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Победа!' })).toBeTruthy();
    });
    expect(screen.getAllByText(/Пары на сумму 13/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('41').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Посмотреть поле' }));
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Победа!' })).toBeNull();
    });
    expect(screen.getByRole('heading', { level: 1, name: 'Пирамида' })).toBeTruthy();

    // Победа уже учтена в статистике, повторного начисления не происходит.
    act(() => useGameStore.getState().finalizeWin());
    const wins = useGameStore.getState().stats.pyramid.wins;
    expect(wins).toBeGreaterThan(0);
    expect(useGameStore.getState().stats.pyramid.bestTimeMs).toBe(125_000);
    act(() => useGameStore.getState().finalizeWin());
    expect(useGameStore.getState().stats.pyramid.wins).toBe(wins);
  });

  it('тупик: полоса подсказки предлагает отмену и новую игру', async () => {
    const stuck = pyramidFixture({
      pyramid: [['3d'], null, null, null, null, null, ['2c', '3c', '4c', '2h', '3h', '4h', '2d']],
    });
    stuck.stock = [];
    stuck.waste = [];
    const session = new GameSession(pyramidModule, stuck, { startTimer: false });
    expect(pyramidModule.isStuck(stuck)).toBe(true);
    act(() => {
      useGameStore.setState({
        session,
        gameState: stuck,
        screen: 'game',
        isWon: false,
        isStuck: true,
        canUndo: false,
      });
    });

    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/Ходов больше нет/)).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Новая игра' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Новая партия' })).toBeTruthy();
    });
  });

  it('настройки: сброс прогресса очищает статистику и сохранения', async () => {
    act(() => {
      useGameStore.getState().openGame('pyramid');
      useGameStore.getState().handleSlotClick('pyramid-stock');
      useGameStore.getState().closeGame();
      useGameStore.setState({
        stats: { ...emptyStatsMap(), pyramid: { ...emptyStatsMap().pyramid, played: 4, wins: 2 } },
        career: { ...emptyCareer(), totalPlayed: 4, totalWins: 2 },
        coins: 120,
      });
      useGameStore.getState().openScreen('settings');
    });
    render(<App />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Настройки' })).toBeTruthy();
    });
    expect(useGameStore.getState().career.totalPlayed).toBe(4);

    fireEvent.click(screen.getByRole('button', { name: /Сбросить всё/ }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Сбросить прогресс?' })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: /Да, сбросить/ }));
    await waitFor(() => {
      expect(useGameStore.getState().career.totalPlayed).toBe(0);
    });
    const state = useGameStore.getState();
    expect(state.coins).toBe(0);
    expect(state.stats.pyramid.played).toBe(0);
    expect(state.sessions).toEqual({});
    expect(state.achievements).toEqual({});
    expect(screen.queryByRole('heading', { name: 'Сбросить прогресс?' })).toBeNull();
  });
});
