// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from '../App';
import { useGameStore } from '../store/gameStore';
import { ACHIEVEMENTS } from '../core/achievements/achievements';
import { getBoardAdapter } from '../game/adapters/interactions';
import type { Card } from '../core/cards/Card';
import type { KlondikeState } from '../core/games/klondike/Klondike';

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
});
