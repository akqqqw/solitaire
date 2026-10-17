import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from './gameStore';
import { GameSession } from '../core/session/GameSession';
import { pyramidModule } from '../core/games/pyramid/Pyramid';
import { pyramidFixture } from '../tests/helpers';
import { createDailyState } from '../services/dailyChallenges';
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
    expect(session.resultRecorded).toBe(true);
    expect(useGameStore.getState().finalizeWin()).toBe(false);
    expect(useGameStore.getState().stats.pyramid.wins).toBe(1);
    expect(useGameStore.getState().daily.progress.wins).toBe(1);
  });
});
