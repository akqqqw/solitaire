import type { GameId } from '../games/types';
import { GAME_IDS } from '../games/types';

export interface GameStats {
  played: number;
  wins: number;
  bestTimeMs: number | null;
  minMoves: number | null;
  currentStreak: number;
  maxStreak: number;
  totalTimeMs: number;
}

export type StatsMap = Record<GameId, GameStats>;

export interface CareerStats {
  totalPlayed: number;
  totalWins: number;
  totalMoves: number;
  totalTimeMs: number;
  hintsUsed: number;
  winsWithoutHints: number;
  fastestWinMs: number | null;
  currentStreak: number;
  maxStreak: number;
  dailyCompleted: number;
  winsByGame: Record<GameId, number>;
  playedByGame: Record<GameId, number>;
  fourSuitSpiderWins: number;
  draw3KlondikeWins: number;
}

export interface WinResult {
  gameId: GameId;
  elapsedMs: number;
  moves: number;
  hintsUsed: number;
  suitCount?: 1 | 2 | 4;
  drawCount?: 1 | 3;
}

export interface LossResult {
  gameId: GameId;
  elapsedMs: number;
  moves: number;
}

export function emptyGameStats(): GameStats {
  return {
    played: 0,
    wins: 0,
    bestTimeMs: null,
    minMoves: null,
    currentStreak: 0,
    maxStreak: 0,
    totalTimeMs: 0,
  };
}

export function emptyStatsMap(): StatsMap {
  return {
    klondike: emptyGameStats(),
    spider: emptyGameStats(),
    freecell: emptyGameStats(),
    pyramid: emptyGameStats(),
  };
}

export function emptyCareer(): CareerStats {
  return {
    totalPlayed: 0,
    totalWins: 0,
    totalMoves: 0,
    totalTimeMs: 0,
    hintsUsed: 0,
    winsWithoutHints: 0,
    fastestWinMs: null,
    currentStreak: 0,
    maxStreak: 0,
    dailyCompleted: 0,
    winsByGame: { klondike: 0, spider: 0, freecell: 0, pyramid: 0 },
    playedByGame: { klondike: 0, spider: 0, freecell: 0, pyramid: 0 },
    fourSuitSpiderWins: 0,
    draw3KlondikeWins: 0,
  };
}

export function winRate(stats: GameStats): number {
  return stats.played > 0 ? Math.round((stats.wins / stats.played) * 100) : 0;
}

function cloneStats(stats: GameStats): GameStats {
  return { ...stats };
}

export function recordWin(
  stats: StatsMap,
  career: CareerStats,
  result: WinResult,
): { stats: StatsMap; career: CareerStats } {
  const game = cloneStats(stats[result.gameId]);
  game.played += 1;
  game.wins += 1;
  game.currentStreak += 1;
  game.maxStreak = Math.max(game.maxStreak, game.currentStreak);
  game.totalTimeMs += Math.max(0, Math.round(result.elapsedMs));
  game.bestTimeMs =
    game.bestTimeMs === null
      ? Math.round(result.elapsedMs)
      : Math.min(game.bestTimeMs, Math.round(result.elapsedMs));
  game.minMoves =
    game.minMoves === null ? result.moves : Math.min(game.minMoves, result.moves);
  const nextStats: StatsMap = { ...stats, [result.gameId]: game };

  const nextCareer: CareerStats = {
    ...career,
    totalPlayed: career.totalPlayed + 1,
    totalWins: career.totalWins + 1,
    totalMoves: career.totalMoves + Math.max(0, result.moves),
    totalTimeMs: career.totalTimeMs + Math.max(0, Math.round(result.elapsedMs)),
    hintsUsed: career.hintsUsed + Math.max(0, result.hintsUsed),
    winsWithoutHints: career.winsWithoutHints + (result.hintsUsed === 0 ? 1 : 0),
    fastestWinMs:
      career.fastestWinMs === null
        ? Math.round(result.elapsedMs)
        : Math.min(career.fastestWinMs, Math.round(result.elapsedMs)),
    currentStreak: career.currentStreak + 1,
    maxStreak: Math.max(career.maxStreak, career.currentStreak + 1),
    winsByGame: {
      ...career.winsByGame,
      [result.gameId]: career.winsByGame[result.gameId] + 1,
    },
    playedByGame: {
      ...career.playedByGame,
      [result.gameId]: career.playedByGame[result.gameId] + 1,
    },
    fourSuitSpiderWins:
      career.fourSuitSpiderWins +
      (result.gameId === 'spider' && result.suitCount === 4 ? 1 : 0),
    draw3KlondikeWins:
      career.draw3KlondikeWins +
      (result.gameId === 'klondike' && result.drawCount === 3 ? 1 : 0),
  };
  return { stats: nextStats, career: nextCareer };
}

export function recordLoss(
  stats: StatsMap,
  career: CareerStats,
  result: LossResult,
): { stats: StatsMap; career: CareerStats } {
  const game = cloneStats(stats[result.gameId]);
  game.played += 1;
  game.currentStreak = 0;
  game.totalTimeMs += Math.max(0, Math.round(result.elapsedMs));
  const nextStats: StatsMap = { ...stats, [result.gameId]: game };
  const nextCareer: CareerStats = {
    ...career,
    totalPlayed: career.totalPlayed + 1,
    totalMoves: career.totalMoves + Math.max(0, result.moves),
    totalTimeMs: career.totalTimeMs + Math.max(0, Math.round(result.elapsedMs)),
    currentStreak: 0,
    playedByGame: {
      ...career.playedByGame,
      [result.gameId]: career.playedByGame[result.gameId] + 1,
    },
  };
  return { stats: nextStats, career: nextCareer };
}

export function addHintsUsed(career: CareerStats, count = 1): CareerStats {
  return { ...career, hintsUsed: career.hintsUsed + Math.max(0, count) };
}

export function sanitizeGameStats(value: unknown): GameStats {
  const fallback = emptyGameStats();
  if (!value || typeof value !== 'object') return fallback;
  const v = value as Partial<GameStats>;
  const num = (x: unknown, fallbackValue = 0) =>
    typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : fallbackValue;
  const opt = (x: unknown): number | null =>
    typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : null;
  return {
    played: num(v.played),
    wins: Math.min(num(v.wins), num(v.played)),
    bestTimeMs: opt(v.bestTimeMs),
    minMoves: opt(v.minMoves),
    currentStreak: num(v.currentStreak),
    maxStreak: Math.max(num(v.maxStreak), num(v.currentStreak)),
    totalTimeMs: num(v.totalTimeMs),
  };
}

export function sanitizeCareer(value: unknown): CareerStats {
  const fallback = emptyCareer();
  if (!value || typeof value !== 'object') return fallback;
  const v = value as Partial<CareerStats>;
  const num = (x: unknown, fallbackValue = 0) =>
    typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : fallbackValue;
  const opt = (x: unknown): number | null =>
    typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : null;
  const byGame = (x: unknown): Record<GameId, number> => {
    const source = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    return {
      klondike: num(source.klondike),
      spider: num(source.spider),
      freecell: num(source.freecell),
      pyramid: num(source.pyramid),
    };
  };
  return {
    totalPlayed: num(v.totalPlayed),
    totalWins: Math.min(num(v.totalWins), num(v.totalPlayed)),
    totalMoves: num(v.totalMoves),
    totalTimeMs: num(v.totalTimeMs),
    hintsUsed: num(v.hintsUsed),
    winsWithoutHints: num(v.winsWithoutHints),
    fastestWinMs: opt(v.fastestWinMs),
    currentStreak: num(v.currentStreak),
    maxStreak: num(v.maxStreak),
    dailyCompleted: num(v.dailyCompleted),
    winsByGame: byGame(v.winsByGame),
    playedByGame: byGame(v.playedByGame),
    fourSuitSpiderWins: num(v.fourSuitSpiderWins),
    draw3KlondikeWins: num(v.draw3KlondikeWins),
  };
}

export function sanitizeStatsMap(value: unknown): StatsMap {
  const source = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const result = emptyStatsMap();
  for (const id of GAME_IDS) result[id] = sanitizeGameStats(source[id]);
  return result;
}
