// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from './gameStore';
import { GameSession } from '../core/session/GameSession';
import { pyramidModule } from '../core/games/pyramid/Pyramid';
import { pyramidFixture } from '../tests/helpers';
import { getBoardAdapter } from '../game/adapters/interactions';
import { loadProfile } from '../services/persistence';
import {
  createDailyState,
  dateKey,
  emptyProgress,
  touchLogin,
} from '../services/dailyChallenges';
import { emptyCareer, emptyStatsMap } from '../core/statistics/stats';

function resetStore(): void {
  useGameStore.setState({
    screen: 'menu',
    modal: null,
    session: null,
    gameState: null,
    selection: null,
    hint: null,
    canUndo: false,
    isWon: false,
    isStuck: false,
    hintsUsed: 0,
    notifications: [],
    toast: null,
    stats: emptyStatsMap(),
    career: emptyCareer(),
    achievements: {},
    daily: createDailyState(),
    sessions: {},
    coins: 0,
    owned: [],
    hints: 0,
    processedPurchases: [],
    ads: { interstitialAt: 0, rewardedAt: 0 },
  });
}

describe('Связка состояния с результатами партий', () => {
  beforeEach(resetStore);

  it('засчитывает поражение при новой партии после ходов', () => {
    useGameStore.getState().openGame('pyramid');
    useGameStore.getState().handleSlotClick('pyramid-stock');
    expect(useGameStore.getState().session?.state.moves).toBe(1);
    expect(useGameStore.getState().canUndo).toBe(true);

    useGameStore.getState().newGame({});
    const state = useGameStore.getState();
    expect(state.stats.pyramid.played).toBe(1);
    expect(state.stats.pyramid.wins).toBe(0);
    expect(state.career.totalPlayed).toBe(1);
    expect(state.career.totalWins).toBe(0);
    expect(state.career.currentStreak).toBe(0);
    expect(state.sessions.pyramid).toBeUndefined();
    expect(state.session?.state.moves).toBe(0);
    expect(state.stats.pyramid.totalTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('выдаёт подсказки за задание дня и вход, не повторяя награду', () => {
    const daily = {
      ...createDailyState(),
      ids: ['daily_win', 'daily_moves_50', 'daily_no_hint_win'],
      progress: { ...emptyProgress(), wins: 1 },
    };
    useGameStore.setState({ daily, coins: 0, hints: 0 });
    useGameStore.getState().claimDailyChallenge('daily_win');
    let state = useGameStore.getState();
    expect(state.hints).toBe(2);
    expect(state.coins).toBe(0);
    expect(state.daily.claimed).toContain('daily_win');
    expect(state.career.dailyCompleted).toBe(1);
    expect(state.achievements.daily_1).toBeTruthy();

    useGameStore.getState().claimDailyChallenge('daily_win');
    expect(useGameStore.getState().hints).toBe(2);

    const login = touchLogin(
      { streak: 0, lastActiveDate: null, lastClaimDate: null },
      dateKey(),
    );
    useGameStore.setState({ login });
    useGameStore.getState().claimDailyLogin();
    state = useGameStore.getState();
    expect(state.hints).toBe(3);
    expect(state.login.lastClaimDate).toBe(dateKey());
    useGameStore.getState().claimDailyLogin();
    expect(useGameStore.getState().hints).toBe(3);
  });

  it('выбор карты нажатием даёт легальные цели для подсветки', () => {
    const state = pyramidFixture({
      pyramid: [null, null, null, null, null, null, ['6h', '7s', '2c', '3c', '4c', '5c', '2h']],
    });
    const session = new GameSession(pyramidModule, state, { startTimer: false });
    useGameStore.setState({ session, gameState: state, screen: 'game' });
    useGameStore.getState().handleCardClick('hearts-6-0');

    const selection = useGameStore.getState().selection;
    expect(selection?.cards).toEqual(['hearts-6-0']);
    const slots = getBoardAdapter('pyramid').dropSlots(
      useGameStore.getState().gameState,
      selection,
    );
    expect(slots).toContain('pyramid-6-1');

    // Повторный клик по выбранной карте снимает выбор.
    useGameStore.getState().handleCardClick('hearts-6-0');
    expect(useGameStore.getState().selection).toBeNull();
  });

  it('после победы отмена недоступна и не возвращает партию в игру', async () => {
    const won = pyramidFixture();
    won.removed = Array.from({ length: 7 }, (_, row) =>
      Array.from({ length: row + 1 }, () => true),
    );
    won.won = true;
    won.moves = 40;
    const previous = pyramidFixture();
    const session = new GameSession(pyramidModule, won, { startTimer: false });
    session.undoStack.push(previous);
    useGameStore.setState({ session, gameState: won, screen: 'game', isWon: true });
    useGameStore.getState().finalizeWin();
    expect(useGameStore.getState().stats.pyramid.wins).toBe(1);
    expect(useGameStore.getState().canUndo).toBe(false);

    await useGameStore.getState().undo();
    expect(useGameStore.getState().gameState?.won).toBe(true);
    expect(useGameStore.getState().gameState?.moves).toBe(40);
    expect(session.undoStack).toHaveLength(1);
  });

  it('завершённая партия не сохраняется как «продолжить»', async () => {
    const won = pyramidFixture();
    won.removed = Array.from({ length: 7 }, (_, row) =>
      Array.from({ length: row + 1 }, () => true),
    );
    won.won = true;
    const session = new GameSession(pyramidModule, won, {
      elapsedMs: 30_000,
      startTimer: false,
    });
    useGameStore.setState({ session, gameState: won, screen: 'game', isWon: true });
    useGameStore.getState().finalizeWin();
    expect(useGameStore.getState().stats.pyramid.wins).toBe(1);
    expect(useGameStore.getState().sessions.pyramid).toBeUndefined();

    useGameStore.getState().flushProfile();
    const saved = await loadProfile();
    expect(saved.sessions.pyramid).toBeUndefined();
    expect(saved.stats.pyramid.wins).toBe(1);
  });

  it('старое сохранение с завершённой партией заменяется новой', () => {
    const won = pyramidFixture();
    won.removed = Array.from({ length: 7 }, (_, row) =>
      Array.from({ length: row + 1 }, () => true),
    );
    won.won = true;
    const stored = new GameSession(pyramidModule, won, { startTimer: false }).serialize();
    useGameStore.setState({ sessions: { pyramid: stored } });

    useGameStore.getState().openGame('pyramid');
    const state = useGameStore.getState();
    expect(state.session?.state.won).toBe(false);
    expect(state.session?.state.moves).toBe(0);
    expect(state.sessions.pyramid).toBeUndefined();
    expect(state.isWon).toBe(false);
  });

  it('начисляет победу, достижения и ежедневный прогресс ровно один раз', () => {
    const wonState = pyramidFixture();
    wonState.removed = Array.from({ length: 7 }, (_, row) =>
      Array.from({ length: row + 1 }, () => true),
    );
    wonState.won = true;
    const session = new GameSession(pyramidModule, wonState, {
      elapsedMs: 600_000,
      hintsUsed: 0,
      startTimer: false,
    });
    useGameStore.setState({ session, gameState: wonState, screen: 'game', isWon: true });

    expect(useGameStore.getState().finalizeWin()).toBe(true);
    const state = useGameStore.getState();
    expect(state.stats.pyramid.played).toBe(1);
    expect(state.stats.pyramid.wins).toBe(1);
    expect(state.stats.pyramid.bestTimeMs).toBe(600_000);
    expect(state.stats.pyramid.minMoves).toBe(wonState.moves);
    expect(state.career.totalWins).toBe(1);
    expect(state.career.winsByGame.pyramid).toBe(1);
    expect(state.career.winsWithoutHints).toBe(1);
    expect(state.daily.progress.wins).toBe(1);
    expect(state.daily.progress.winsByGame.pyramid).toBe(1);
    expect(state.achievements.first_win).toBeTruthy();
    expect(state.achievements.no_hints).toBeTruthy();
    expect(state.achievements.speed_3min).toBeFalsy();
    expect(state.notifications.filter((n) => n.kind === 'achievement').length).toBeGreaterThan(0);
    expect(session.resultRecorded).toBe(true);
    expect(useGameStore.getState().finalizeWin()).toBe(false);
    expect(useGameStore.getState().stats.pyramid.wins).toBe(1);
    expect(useGameStore.getState().daily.progress.wins).toBe(1);
  });
});
