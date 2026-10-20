// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../store/gameStore';
import { loadProfile } from '../services/persistence';
import { GameSession } from '../core/session/GameSession';
import { klondikeModule, type KlondikeState } from '../core/games/klondike/Klondike';
import { pyramidModule } from '../core/games/pyramid/Pyramid';
import { klondikeFixture, pyramidFixture } from './helpers';

const store = () => useGameStore.getState();

beforeAll(() => {
  localStorage.clear();
});

beforeEach(async () => {
  await store().resetProgress();
  useGameStore.setState({
    screen: 'game',
    modal: null,
    session: null,
    gameState: null,
    toast: null,
    notifications: [],
  });
});

afterEach(async () => {
  store().flushProfile();
  await new Promise((r) => setTimeout(r, 20));
});

describe('жизненный цикл партии: видимость вкладки, пауза и сохранение', () => {
  it('скрытие вкладки останавливает таймер и запоминает партию', async () => {
    store().openGame('klondike');
    store().newGame({ seed: 'life-1', drawCount: 1 });
    store().handleSlotClick('stock');
    expect((store().gameState as KlondikeState).moves).toBe(1);

    const session = store().session!;
    const startedAt = session.elapsedMs;
    expect(startedAt).toBeGreaterThanOrEqual(0);

    await new Promise((r) => setTimeout(r, 30));
    store().pauseForVisibility();
    expect(session.isRunning).toBe(false);

    const pausedAt = session.elapsedMs;
    // Пока вкладка скрыта, время не идёт.
    await new Promise((r) => setTimeout(r, 40));
    expect(session.elapsedMs).toBe(pausedAt);
    expect(store().sessions.klondike).toBeTruthy();
    const saved = store().sessions.klondike?.state as KlondikeState | undefined;
    expect(saved?.moves).toBe(1);
  });

  it('возврат на вкладку продолжает партию, но не после победы', async () => {
    const open = () => {
      store().openGame('klondike');
      store().newGame({ seed: 'life-2', drawCount: 1 });
    };
    open();
    store().pauseForVisibility();
    store().resumeForVisibility();
    expect(store().session?.isRunning).toBe(true);

    // После победы таймер остаётся остановленным.
    const suits = ['clubs', 'diamonds', 'hearts', 'spades'];
    const foundations = suits.map((suit) => {
      const cards: string[] = [];
      for (let rank = 1; rank <= 12; rank += 1) {
        cards.push(`${rank === 1 ? 'A' : rank === 11 ? 'J' : rank === 12 ? 'Q' : rank}${suit[0]}`);
      }
      return cards;
    });
    const won = klondikeFixture({ tableau: suits.map((suit) => [`K${suit[0]}`]), foundations });
    const session = new GameSession(klondikeModule, won, { startTimer: false });
    useGameStore.setState({ session: session as never, gameState: session.state as never });
    for (let index = 0; index < 4; index += 1) {
      store().handleDrop([`${suits[index]}-13-0`], `foundation-${index}`);
    }
    expect(store().isWon).toBe(true);
    store().resumeForVisibility();
    expect(session.isRunning).toBe(false);
  });

  it('в меню возврат на вкладку не запускает таймер скрытой партии', () => {
    store().openGame('klondike');
    store().newGame({ seed: 'life-3', drawCount: 1 });
    store().openModal('pause');
    const session = store().session!;
    useGameStore.setState({ screen: 'menu' });
    store().resumeForVisibility();
    expect(session.isRunning).toBe(false);
  });

  it('flushProfile сохраняет незавершённую партию на диск сразу', async () => {
    store().openGame('pyramid');
    store().newGame({ seed: 'life-4' });
    store().handleSlotClick('pyramid-stock');
    const moves = (store().gameState as { moves: number }).moves;
    expect(moves).toBe(1);

    store().flushProfile();
    const profile = await loadProfile();
    expect(profile.sessions.pyramid).toBeTruthy();
    expect((profile.sessions.pyramid?.state as { moves: number }).moves).toBe(1);
    // Восстановление идёт через тот же модуль и сохраняет расклад.
    const restored = GameSession.restore(pyramidModule, profile.sessions.pyramid!);
    expect(restored).not.toBeNull();
    expect((restored!.state as { moves: number }).moves).toBe(1);
  });

  it('выход в меню не теряет партию, а новая поверх неё закрывает старую', async () => {
    store().openGame('klondike');
    store().newGame({ seed: 'life-5', drawCount: 1 });
    store().handleSlotClick('stock');
    store().closeGame();
    expect(store().screen).toBe('menu');
    expect(store().sessions.klondike).toBeTruthy();

    store().openGame('klondike');
    expect((store().gameState as KlondikeState).moves).toBe(1);

    // Новая партия поверх недоигранной: старая учитывается как поражение.
    const playedBefore = store().stats.klondike.played;
    store().newGame({ seed: 'life-6', drawCount: 3 });
    expect(store().stats.klondike.played).toBe(playedBefore + 1);
    expect((store().gameState as KlondikeState).drawCount).toBe(3);
    expect(store().sessions.klondike).toBeUndefined();
  });

  it('профиль переживает перезагрузку страницы вместе с настройками и монетами', async () => {
    store().updateSettings({ cardBack: 'sapphire', tableTheme: 'midnight', animations: false });
    store().showToast('проверка');
    const coins = store().coins;
    store().flushProfile();

    const profile = await loadProfile();
    expect(profile.settings.cardBack).toBe('sapphire');
    expect(profile.settings.tableTheme).toBe('midnight');
    expect(profile.settings.animations).toBe(false);
    expect(profile.coins).toBe(coins);
  });

});
