import { describe, expect, it } from 'vitest';
import {
  emptyCareer,
  emptyStatsMap,
  recordLoss,
  recordWin,
  sanitizeCareer,
  sanitizeGameStats,
  sanitizeStatsMap,
} from './statistics/stats';
import {
  ACHIEVEMENTS,
  achievementProgress,
  isAchievementUnlocked,
  sanitizeUnlocked,
  unlockAchievements,
} from './achievements/achievements';
import {
  addDaysKey,
  challengeProgress,
  claimChallenge,
  claimLoginReward,
  createDailyState,
  dateKey,
  getChallenge,
  isChallengeComplete,
  isLoginRewardClaimable,
  recordDailyEvent,
  sanitizeDailyState,
  sanitizeLoginState,
  touchLogin,
} from '../services/dailyChallenges';
import { resolveProfileConflict } from '../services/persistence';
import {
  createDefaultProfile,
  isProfileLike,
  profileUpdatedAt,
  sanitizeProfile,
} from '../store/profile';
import { createKlondikeGame, klondikeModule } from './games/klondike/Klondike';

describe('Статистика', () => {
  it('учитывает победу в режиме и карьере', () => {
    const first = recordWin(emptyStatsMap(), emptyCareer(), {
      gameId: 'pyramid',
      elapsedMs: 120_400,
      moves: 28,
      hintsUsed: 0,
    });
    expect(first.stats.pyramid.played).toBe(1);
    expect(first.stats.pyramid.wins).toBe(1);
    expect(first.stats.pyramid.bestTimeMs).toBe(120_400);
    expect(first.stats.pyramid.minMoves).toBe(28);
    expect(first.stats.pyramid.currentStreak).toBe(1);
    expect(first.career.totalWins).toBe(1);
    expect(first.career.totalPlayed).toBe(1);
    expect(first.career.winsWithoutHints).toBe(1);
    expect(first.career.winsByGame.pyramid).toBe(1);
    expect(first.career.fastestWinMs).toBe(120_400);

    const second = recordWin(first.stats, first.career, {
      gameId: 'spider',
      elapsedMs: 60_000,
      moves: 120,
      hintsUsed: 2,
      suitCount: 4,
    });
    expect(second.stats.pyramid.wins).toBe(1);
    expect(second.stats.spider.wins).toBe(1);
    expect(second.career.totalWins).toBe(2);
    expect(second.career.maxStreak).toBe(2);
    expect(second.career.fastestWinMs).toBe(60_000);
    expect(second.career.fourSuitSpiderWins).toBe(1);
    expect(second.career.winsWithoutHints).toBe(1);
    expect(second.career.hintsUsed).toBe(2);
  });

  it('обнуляет серию при поражении и хранит лучшие результаты', () => {
    const won = recordWin(emptyStatsMap(), emptyCareer(), {
      gameId: 'klondike',
      elapsedMs: 200_000,
      moves: 90,
      hintsUsed: 1,
      drawCount: 3,
    });
    const lost = recordLoss(won.stats, won.career, {
      gameId: 'klondike',
      elapsedMs: 45_000,
      moves: 12,
    });
    expect(lost.stats.klondike.played).toBe(2);
    expect(lost.stats.klondike.wins).toBe(1);
    expect(lost.stats.klondike.currentStreak).toBe(0);
    expect(lost.stats.klondike.maxStreak).toBe(1);
    expect(lost.stats.klondike.bestTimeMs).toBe(200_000);
    expect(lost.stats.klondike.minMoves).toBe(90);
    expect(lost.career.totalPlayed).toBe(2);
    expect(lost.career.totalWins).toBe(1);
    expect(lost.career.currentStreak).toBe(0);
    expect(lost.career.maxStreak).toBe(1);
    expect(lost.career.draw3KlondikeWins).toBe(1);
  });

  it('чистит повреждённые сохранения статистики', () => {
    const bad = sanitizeGameStats({
      played: -5,
      wins: 99,
      bestTimeMs: 'slow',
      maxStreak: 2,
      currentStreak: 7,
    });
    expect(bad.played).toBe(0);
    expect(bad.wins).toBe(0);
    expect(bad.bestTimeMs).toBeNull();
    expect(bad.maxStreak).toBe(7);
    const career = sanitizeCareer({ totalPlayed: 3, totalWins: 8, winsByGame: { pyramid: 2 } });
    expect(career.totalWins).toBe(3);
    expect(career.winsByGame.pyramid).toBe(2);
    expect(career.winsByGame.spider).toBe(0);
    expect(sanitizeStatsMap(null)).toEqual(emptyStatsMap());
  });
});

describe('Достижения', () => {
  it('содержит не менее 20 достижений с осмысленными целями', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(20);
    const ids = new Set(ACHIEVEMENTS.map((a) => a.id));
    expect(ids.size).toBe(ACHIEVEMENTS.length);
    for (const def of ACHIEVEMENTS) {
      expect(def.target).toBeGreaterThan(0);
      expect(def.title.length).toBeGreaterThan(2);
    }
  });

  it('открывает достижения по прогрессу и не дублирует их', () => {
    const career = {
      ...emptyCareer(),
      totalWins: 2,
      totalPlayed: 2,
      winsByGame: { klondike: 1, spider: 0, freecell: 1, pyramid: 0 },
      playedByGame: { klondike: 1, spider: 0, freecell: 1, pyramid: 0 },
    };
    const ctx = { career, loginStreak: 7 };
    const { unlocked, newlyUnlocked } = unlockAchievements(ctx, {}, 1000);
    const ids = newlyUnlocked.map((a) => a.id);
    expect(ids).toContain('first_win');
    expect(ids).toContain('login_7');
    expect(ids).not.toContain('all_modes');
    expect(ids).not.toContain('speed_3min');
    expect(unlocked.first_win).toBe(1000);

    const again = unlockAchievements(ctx, unlocked, 2000);
    expect(again.newlyUnlocked).toHaveLength(0);

    const allModes = {
      ...ctx,
      career: {
        ...career,
        winsByGame: { klondike: 1, spider: 1, freecell: 1, pyramid: 1 },
      },
    };
    const def = ACHIEVEMENTS.find((a) => a.id === 'all_modes')!;
    expect(isAchievementUnlocked(def, allModes)).toBe(true);
    expect(achievementProgress(def, ctx)).toBe(2);
  });

  it('не открывает достижения повторно и отбрасывает мусор', () => {
    const cleaned = sanitizeUnlocked({
      first_win: 123,
      unknown: 500,
      wins_50: 'soon',
      speed_90s: -1,
    });
    expect(cleaned).toEqual({ first_win: 123 });
    expect(sanitizeUnlocked('nope')).toEqual({});
  });
});

describe('Ежедневные задания', () => {
  const day = '2026-10-17';

  it('детерминированно выбирает три задания на дату', () => {
    const a = createDailyState(day);
    const b = createDailyState(day);
    expect(a.ids).toEqual(b.ids);
    expect(new Set(a.ids).size).toBe(3);
    const week = new Set(
      Array.from({ length: 7 }, (_, i) => createDailyState(addDaysKey(day, i)).ids.join('|')),
    );
    expect(week.size).toBeGreaterThan(1);
  });

  it('начисляет прогресс за ходы, режимы и победы', () => {
    let daily = createDailyState(day);
    daily = recordDailyEvent(daily, { type: 'move', count: 12 });
    daily = recordDailyEvent(daily, { type: 'move' });
    expect(daily.progress.moves).toBe(13);
    daily = recordDailyEvent(daily, { type: 'mode', gameId: 'pyramid' });
    daily = recordDailyEvent(daily, { type: 'mode', gameId: 'pyramid' });
    daily = recordDailyEvent(daily, { type: 'mode', gameId: 'spider' });
    expect(daily.progress.modes).toEqual(['pyramid', 'spider']);
    daily = recordDailyEvent(daily, { type: 'win', gameId: 'pyramid', hintsUsed: 0 });
    daily = recordDailyEvent(daily, { type: 'win', gameId: 'spider', hintsUsed: 4 });
    expect(daily.progress.wins).toBe(2);
    expect(daily.progress.winsByGame.pyramid).toBe(1);
    expect(daily.progress.winsByGame.spider).toBe(1);
    expect(daily.progress.winsWithoutHints).toBe(1);
  });

  it('выдаёт награду только за выполненное задание и только один раз', () => {
    let daily = {
      ...createDailyState(day),
      ids: ['daily_win', 'daily_moves_50', 'daily_no_hint_win'],
    };
    const def = getChallenge('daily_win')!;
    expect(isChallengeComplete(daily, def)).toBe(false);
    expect(() => claimChallenge(daily, 'daily_win')).toThrow(/не выполнено/);
    expect(() => claimChallenge(daily, 'daily_win_freecell')).toThrow(/списке/);

    daily = recordDailyEvent(daily, { type: 'win', gameId: 'klondike', hintsUsed: 2 });
    expect(challengeProgress(daily, def)).toBe(1);
    expect(isChallengeComplete(daily, def)).toBe(true);
    expect(isChallengeComplete(daily, getChallenge('daily_no_hint_win')!)).toBe(false);
    const claimed = claimChallenge(daily, 'daily_win');
    expect(claimed.claimed).toEqual(['daily_win']);
    expect(() => claimChallenge(claimed, 'daily_win')).toThrow(/уже получена/);
  });

  it('сбрасывает вчерашние задания и чистит повреждённые данные', () => {
    const state = createDailyState(day);
    const broken = sanitizeDailyState({ ...state, date: '2026-01-01', ids: ['x', 'y'] }, day);
    expect(broken.date).toBe(day);
    expect(broken.ids).toHaveLength(3);
    const sanitized = sanitizeDailyState(
      {
        date: day,
        ids: ['daily_win', 'daily_moves_50', 'daily_no_hint_win'],
        progress: { moves: -5, wins: 1.8, modes: ['pyramid', 'bad'], winsByGame: { pyramid: 2 } },
        claimed: ['daily_win', 'bad'],
      },
      day,
    );
    expect(sanitized.ids).toEqual(['daily_win', 'daily_moves_50', 'daily_no_hint_win']);
    expect(sanitized.progress.moves).toBe(0);
    expect(sanitized.progress.wins).toBe(1);
    expect(sanitized.progress.modes).toEqual(['pyramid']);
    expect(sanitized.progress.winsByGame.pyramid).toBe(2);
    expect(sanitized.claimed).toEqual(['daily_win']);
    const dropped = sanitizeDailyState(
      { date: day, ids: ['daily_win', 'bad', 'daily_moves_50'], progress: {}, claimed: [] },
      day,
    );
    expect(dropped.ids).toEqual(createDailyState(day).ids);
  });

  it('считает серию входов и награду календаря', () => {
    expect(addDaysKey('2026-10-31', 1)).toBe('2026-11-01');
    let login = touchLogin({ streak: 0, lastActiveDate: null, lastClaimDate: null }, '2026-10-10');
    expect(login.streak).toBe(1);
    login = touchLogin(login, '2026-10-10');
    expect(login.streak).toBe(1);
    login = touchLogin(login, '2026-10-11');
    expect(login.streak).toBe(2);
    login = touchLogin(login, '2026-10-14');
    expect(login.streak).toBe(1);
    expect(isLoginRewardClaimable(login)).toBe(true);
    const reward = claimLoginReward(login, '2026-10-14');
    expect(reward.coins).toBe(10);
    expect(reward.login.lastClaimDate).toBe('2026-10-14');
    expect(isLoginRewardClaimable(reward.login, '2026-10-14')).toBe(false);
    expect(() => claimLoginReward(reward.login, '2026-10-14')).toThrow(/уже получена/);
    expect(sanitizeLoginState({ streak: -3, lastActiveDate: 'nope' })).toEqual({
      streak: 0,
      lastActiveDate: null,
      lastClaimDate: null,
    });
  });
});

describe('Профиль и сохранения', () => {
  it('создаёт валидный профиль по умолчанию', () => {
    const profile = createDefaultProfile();
    expect(profile.version).toBe(1);
    expect(isProfileLike(JSON.parse(JSON.stringify(profile)))).toBe(true);
    expect(profile.settings.cardBack).toBe('emerald');
    expect(profile.sessions).toEqual({});
  });

  it('чистит повреждённый профиль, сохраняя валидные поля', () => {
    const clean = sanitizeProfile({
      version: 'v1',
      updatedAt: 1234,
      stats: { pyramid: { played: 2, wins: 1 } },
      career: { totalPlayed: 2, totalWins: 1 },
      achievements: { first_win: 10, nope: 5 },
      coins: -10,
      settings: { cardBack: 'unknown', sounds: false, animations: 'yes' },
      sessions: 'broken',
    });
    expect(clean.version).toBe(1);
    expect(clean.updatedAt).toBe(1234);
    expect(clean.stats.pyramid.played).toBe(2);
    expect(clean.stats.spider.played).toBe(0);
    expect(clean.achievements).toEqual({ first_win: 10 });
    expect(clean.coins).toBe(0);
    expect(clean.settings.cardBack).toBe('emerald');
    expect(clean.settings.sounds).toBe(false);
    expect(clean.settings.animations).toBe(true);
    // Новая настройка без значения в старом профиле получает безопасный дефолт.
    expect(clean.settings.targetHints).toBe(false);
    expect(clean.sessions).toEqual({});
    expect(profileUpdatedAt(clean)).toBe(1234);
  });

  it('проверяет сохранённые партии через правила режима', () => {
    const state = createKlondikeGame({ seed: 'save-1', drawCount: 3 });
    const stored = {
      klondike: {
        gameId: 'klondike',
        state,
        undo: [state],
        elapsedMs: 5000,
        resultRecorded: false,
        hintsUsed: 1,
        savedAt: 100,
      },
      spider: {
        gameId: 'spider',
        state: { gameId: 'spider', broken: true },
        undo: [],
        elapsedMs: 1,
        savedAt: 1,
      },
    };
    const profile = sanitizeProfile({ ...createDefaultProfile(), sessions: stored });
    expect((profile.sessions.klondike?.state as { gameId: string }).gameId).toBe('klondike');
    expect(profile.sessions.klondike?.elapsedMs).toBe(5000);
    expect(profile.sessions.spider).toBeUndefined();
    expect(klondikeModule.isValidState(profile.sessions.klondike?.state)).toBe(true);
  });

  it('выбирает более свежую версию при конфликте облака и устройства', () => {
    const local = { ...createDefaultProfile(), updatedAt: 2000, coins: 10 };
    const cloud = { ...createDefaultProfile(), updatedAt: 3000, coins: 40 };
    expect(resolveProfileConflict(local, cloud).coins).toBe(40);
    expect(resolveProfileConflict(local, { ...cloud, updatedAt: 1000 }).coins).toBe(10);
    expect(resolveProfileConflict(local, null)).toBe(local);
  });
});
