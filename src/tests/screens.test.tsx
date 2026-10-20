// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from '../App';
import { useGameStore } from '../store/gameStore';
import { ACHIEVEMENTS } from '../core/achievements/achievements';
import { CARD_BACKS, TABLE_THEMES } from '../store/profile';
import { klondikeModule, type KlondikeState } from '../core/games/klondike/Klondike';
import { GameSession } from '../core/session/GameSession';
import { klondikeFixture } from './helpers';

vi.mock('../ui/components/Board', () => ({
  Board: () => <div data-testid="board-stub">board</div>,
}));

beforeAll(() => {
  localStorage.clear();
});

beforeEach(async () => {
  await useGameStore.getState().resetProgress();
  useGameStore.setState({ screen: 'menu', modal: null, session: null, gameState: null });
});

afterEach(() => {
  cleanup();
});

async function boot(): Promise<void> {
  render(<App />);
  await waitFor(() => {
    expect(useGameStore.getState().hydrated).toBe(true);
  }, { timeout: 4000 });
}

function openScreen(
  name: 'menu' | 'stats' | 'achievements' | 'settings' | 'daily' | 'shop',
): void {
  act(() => {
    useGameStore.getState().openScreen(name);
  });
}

describe('Экраны: каждая кнопка делает то, что обещает', () => {
  it('достижения: фильтры «все / открытые / закрытые» считают карточки', async () => {
    await boot();
    openScreen('achievements');
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Достижения' })).toBeTruthy();
    });

    expect(document.querySelectorAll('.ach-card')).toHaveLength(ACHIEVEMENTS.length);

    fireEvent.click(screen.getByRole('tab', { name: /Открытые/ }));
    expect(document.querySelectorAll('.ach-card')).toHaveLength(0);

    fireEvent.click(screen.getByRole('tab', { name: /Закрытые/ }));
    expect(document.querySelectorAll('.ach-card')).toHaveLength(ACHIEVEMENTS.length);

    // Открываем один знак — он появляется во вкладке «Открытые» и исчезает из «Закрытых».
    const first = ACHIEVEMENTS[0];
    act(() => {
      useGameStore.setState({ achievements: { [first.id]: Date.now() } });
    });
    fireEvent.click(screen.getByRole('tab', { name: /Открытые/ }));
    expect(document.querySelectorAll('.ach-card')).toHaveLength(1);
    fireEvent.click(screen.getByRole('tab', { name: /Закрытые/ }));
    expect(document.querySelectorAll('.ach-card')).toHaveLength(ACHIEVEMENTS.length - 1);
    expect(screen.getByRole('tab', { name: /Все/ }).getAttribute('aria-selected')).toBe('false');
  });

  it('настройки: рубашка, сукно и звук меняются и применяются к документу', async () => {
    await boot();
    openScreen('settings');
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Настройки' })).toBeTruthy();
    });

    const back = [...CARD_BACKS].reverse().find((item) => item.price === 0)!;
    const backButton = Array.from(document.querySelectorAll<HTMLButtonElement>('.card-back-option')).find(
      (element) => element.textContent?.includes(back.label),
    );
    expect(backButton).toBeTruthy();
    fireEvent.click(backButton as HTMLButtonElement);
    expect(useGameStore.getState().settings.cardBack).toBe(back.id);
    expect(backButton?.getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelectorAll('.card-back-option.is-active')).toHaveLength(1);

    const theme = [...TABLE_THEMES].reverse().find((item) => item.price === 0)!;
    const themeButton = Array.from(document.querySelectorAll<HTMLButtonElement>('.theme-option')).find(
      (element) => element.textContent?.includes(theme.label),
    );
    expect(themeButton).toBeTruthy();
    fireEvent.click(themeButton as HTMLButtonElement);
    expect(useGameStore.getState().settings.tableTheme).toBe(theme.id);
    await waitFor(() => {
      expect(document.documentElement.dataset.table).toBe(theme.id);
    });

    const sounds = useGameStore.getState().settings.sounds;
    fireEvent.click(screen.getByRole('switch', { name: 'Звуки' }));
    expect(useGameStore.getState().settings.sounds).toBe(!sounds);
    fireEvent.click(screen.getByRole('switch', { name: 'Звуки' }));
    expect(useGameStore.getState().settings.sounds).toBe(sounds);

    // Подсветка мест по умолчанию выключена и включается переключателем.
    expect(useGameStore.getState().settings.targetHints).toBe(false);
    const hintsSwitch = screen.getByRole('switch', { name: 'Подсветка мест' });
    expect(hintsSwitch.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(hintsSwitch);
    expect(useGameStore.getState().settings.targetHints).toBe(true);
    expect(hintsSwitch.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(hintsSwitch);
    expect(useGameStore.getState().settings.targetHints).toBe(false);

    // Заблокированный стиль не надевается, а ведёт на витрину.
    const lockedBack = CARD_BACKS.find((item) => item.price > 0)!;
    const lockedButton = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.card-back-option'),
    ).find((element) => element.textContent?.includes(lockedBack.label));
    expect(lockedButton).toBeTruthy();
    fireEvent.click(lockedButton as HTMLButtonElement);
    await waitFor(() => {
      expect(useGameStore.getState().screen).toBe('shop');
      expect(useGameStore.getState().settings.cardBack).toBe(back.id);
    });

    // Возврат в меню действительно возвращает в меню.
    fireEvent.click(screen.getByRole('button', { name: /Меню/ }));
    await waitFor(() => {
      expect(useGameStore.getState().screen).toBe('menu');
      expect(screen.getByText('Выберите пасьянс')).toBeTruthy();
    });
  });

  it('ежедневный экран: календарь из семи дней и три задания', async () => {
    await boot();
    openScreen('daily');
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Испытание дня' })).toBeTruthy();
    });
    expect(document.querySelectorAll('.login-day')).toHaveLength(7);
    expect(document.querySelectorAll('.challenge-card')).toHaveLength(3);
    // Точки прогресса трёх заданий есть на главном экране.
    openScreen('menu');
    await waitFor(() => {
      expect(screen.getByText('Выберите пасьянс')).toBeTruthy();
    });
    expect(document.querySelectorAll('.daily-dot')).toHaveLength(3);
  });

  it('горячие клавиши: H — подсказка, Esc — пауза, Z — отмена хода', async () => {
    await boot();
    act(() => {
      useGameStore.getState().openGame('klondike');
      useGameStore.getState().newGame({ drawCount: 1 });
    });
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Косынка' })).toBeTruthy();
    });

    const store = () => useGameStore.getState();

    // Сначала реальный ход, чтобы отмене было что возвращать.
    act(() => store().handleSlotClick('stock'));
    expect((store().gameState as KlondikeState).moves).toBe(1);

    act(() => {
      fireEvent.keyDown(window, { key: 'h' });
    });
    await waitFor(() => {
      expect(store().hint?.text.length).toBeGreaterThan(3);
    });
    expect(document.querySelector('.hint-bar-text')?.textContent).toBe(store().hint?.text);

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Пауза' })).toBeTruthy();
    });
    expect(store().session?.isRunning).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: /Продолжить игру/ }));
    await waitFor(() => {
      expect(store().modal).toBeNull();
    });
    expect(store().session?.isRunning).toBe(true);

    await act(async () => {
      fireEvent.keyDown(window, { key: 'z' });
    });
    await waitFor(() => {
      expect((store().gameState as KlondikeState).moves).toBe(0);
    });
  });

  it('автосборка отправляет открытого туза в базу и сообщает об отсутствии ходов', async () => {
    await boot();
    const fixture = klondikeFixture({ tableau: [['Ad'], [], [], [], [], [], []] });
    const session = new GameSession(klondikeModule, fixture, { startTimer: false });
    act(() => {
      useGameStore.setState({
        screen: 'game',
        session,
        gameState: fixture,
        canUndo: true,
        isWon: false,
        isStuck: false,
        modal: null,
      });
    });
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Косынка' })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /Автосборка/ }));
    await waitFor(() => {
      const state = useGameStore.getState().gameState as KlondikeState;
      const total = state.foundations.reduce((sum, pile) => sum + pile.length, 0);
      expect(total).toBeGreaterThan(0);
    });

    // Повторная автосборка без подходящих ходов не ломает партию, а показывает тост.
    fireEvent.click(screen.getByRole('button', { name: /Автосборка/ }));
    await waitFor(() => {
      expect(document.querySelector('.toast')?.textContent ?? '').toContain('Автосборка');
    });
  });

  it('магазин: покупка стиля за монеты, экипировка и недоступная оплата', async () => {
    await boot();
    openScreen('shop');
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Магазин' })).toBeTruthy();
    });

    // В офлайне покупки честно заблокированы, но витрина видна.
    const packButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.shop-buy'));
    expect(packButtons).toHaveLength(4);
    for (const button of packButtons) expect(button.disabled).toBe(true);

    // Копим на самый дешёвый платный стиль и покупаем его прямо на витрине.
    const paid = CARD_BACKS.find((item) => item.price > 0)!;
    act(() => {
      useGameStore.setState({ coins: paid.price });
    });
    const card = Array.from(document.querySelectorAll<HTMLElement>('.shop-style')).find((el) =>
      el.textContent?.includes(paid.label),
    );
    expect(card).toBeTruthy();
    const buy = within(card!).getByRole('button', { name: /Купить/ });
    fireEvent.click(buy);
    await waitFor(() => {
      expect(useGameStore.getState().owned).toContain(paid.id);
    });
    expect(useGameStore.getState().settings.cardBack).toBe(paid.id);
    expect(useGameStore.getState().coins).toBe(0);

    // После покупки кнопка меняется на «Выбрано», второй оплаты нет.
    const updated = Array.from(document.querySelectorAll<HTMLElement>('.shop-style')).find((el) =>
      el.textContent?.includes(paid.label),
    );
    expect(updated?.querySelector('button')?.disabled).toBe(true);
    expect(updated?.querySelector('button')?.textContent).toContain('Выбрано');
  });

  it('правила открываются во всех четырёх режимах и содержат список шагов', async () => {
    await boot();
    for (const [gameId, title] of [
      ['klondike', 'Косынка'],
      ['spider', 'Паук'],
      ['freecell', 'Свободная ячейка'],
      ['pyramid', 'Пирамида'],
    ] as const) {
      act(() => {
        useGameStore.getState().openGame(gameId);
        useGameStore.getState().newGame({});
      });
      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1, name: title })).toBeTruthy();
      });
      fireEvent.click(screen.getByRole('button', { name: 'Пауза и меню' }));
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: 'Пауза' })).toBeTruthy();
      });
      fireEvent.click(screen.getByRole('button', { name: /^Правила/ }));
      await waitFor(() => {
        expect(document.querySelector('.modal-panel')).toBeTruthy();
      });
      const panel = within(document.querySelector('.modal-panel') as HTMLElement);
      expect(panel.getByRole('heading', { name: title })).toBeTruthy();
      expect(document.querySelectorAll('.rules-list li').length).toBeGreaterThan(2);
      fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
      await waitFor(() => {
        expect(document.querySelector('.modal-panel')).toBeNull();
      });
      act(() => {
        useGameStore.getState().closeGame();
      });
    }
  });
});
