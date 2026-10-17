import type { GameId } from '../core/games/types';
import { GAME_IDS } from '../core/games/types';
import { createRng } from '../core/cards/Shuffle';

export interface DailyProgress {
  moves: number;
  wins: number;
  winsWithoutHints: number;
  winsByGame: Record<GameId, number>;
  modes: GameId[];
}

export interface DailyState {
  date: string;
  ids: string[];
  progress: DailyProgress;
  claimed: string[];
}

export interface ChallengeDef {
  id: string;
  title: string;
  description: string;
  target: number;
  reward: number;
  metric: 'wins' | 'moves' | 'modes' | 'winsByGame' | 'noHintWins';
  gameId?: GameId;
}

export type DailyEvent =
  | { type: 'move'; count?: number }
  | { type: 'win'; gameId: GameId; hintsUsed: number }
  | { type: 'mode'; gameId: GameId };

const GENERIC_CHALLENGES: ChallengeDef[] = [
  {
    id: 'daily_win',
    title: 'Первая победа дня',
    description: 'Выиграйте одну партию в любом режиме',
    target: 1,
    reward: 25,
    metric: 'wins',
  },
  {
    id: 'daily_moves_50',
    title: 'Разминка',
    description: 'Сделайте 50 ходов за день',
    target: 50,
    reward: 20,
    metric: 'moves',
  },
  {
    id: 'daily_modes_3',
    title: 'Смена декораций',
    description: 'Сыграйте в трёх разных режимах',
    target: 3,
    reward: 30,
    metric: 'modes',
  },
];

const GAME_CHALLENGES: ChallengeDef[] = [
  ...(['klondike', 'spider', 'freecell', 'pyramid'] as GameId[]).map((gameId) => ({
    id: `daily_win_${gameId}`,
    title:
      gameId === 'klondike'
        ? 'Косынка дня'
        : gameId === 'spider'
          ? 'Охота на паука'
          : gameId === 'freecell'
            ? 'Свободный выбор'
            : 'Вершина пирамиды',
    description: `Выиграйте партию: ${
      gameId === 'klondike'
        ? 'Косынка'
        : gameId === 'spider'
          ? 'Паук'
          : gameId === 'freecell'
            ? 'Свободная ячейка'
            : 'Пирамида'
    }`,
    target: 1,
    reward: 30,
    metric: 'winsByGame' as const,
    gameId,
  })),
  {
    id: 'daily_no_hint_win',
    title: 'Своим умом',
    description: 'Выиграйте партию, не используя подсказки',
    target: 1,
    reward: 35,
    metric: 'noHintWins',
  },
];

export const ALL_CHALLENGES: ChallengeDef[] = [...GENERIC_CHALLENGES, ...GAME_CHALLENGES];

export function getChallenge(id: string): ChallengeDef | undefined {
  return ALL_CHALLENGES.find((c) => c.id === id);
}

export function dateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, (m ?? 1) - 1, (d ?? 1) + days, 12, 0, 0, 0);
  return dateKey(date);
}

export function emptyProgress(): DailyProgress {
  return {
    moves: 0,
    wins: 0,
    winsWithoutHints: 0,
    winsByGame: { klondike: 0, spider: 0, freecell: 0, pyramid: 0 },
    modes: [],
  };
}

function pickChallenges(forDate: string): string[] {
  const rng = createRng(`daily-challenges:${forDate}`);
  const generic = GENERIC_CHALLENGES[Math.floor(rng() * GENERIC_CHALLENGES.length)].id;
  const specifics = [...GAME_CHALLENGES];
  // Детерминированное перемешивание только специфичных заданий.
  for (let i = specifics.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [specifics[i], specifics[j]] = [specifics[j], specifics[i]];
  }
  const selected = [generic, specifics[0].id, specifics[1].id];
  for (let i = selected.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [selected[i], selected[j]] = [selected[j], selected[i]];
  }
  return selected;
}

export function createDailyState(forDate = dateKey()): DailyState {
  return {
    date: forDate,
    ids: pickChallenges(forDate),
    progress: emptyProgress(),
    claimed: [],
  };
}

export function sanitizeDailyState(raw: unknown, forDate = dateKey()): DailyState {
  if (!raw || typeof raw !== 'object') return createDailyState(forDate);
  const v = raw as Partial<DailyState>;
  if (typeof v.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.date)) {
    return createDailyState(forDate);
  }
  if (v.date !== forDate) return createDailyState(forDate);
  const ids =
    Array.isArray(v.ids) && v.ids.length === 3
      ? v.ids.filter((id): id is string => typeof id === 'string' && !!getChallenge(id))
      : [];
  if (ids.length !== 3) return createDailyState(forDate);
  const p = (v.progress && typeof v.progress === 'object' ? v.progress : {}) as Partial<DailyProgress>;
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0);
  const byGame = (p.winsByGame && typeof p.winsByGame === 'object'
    ? p.winsByGame
    : {}) as Record<string, unknown>;
  const modes = Array.isArray(p.modes)
    ? p.modes.filter((m): m is GameId => GAME_IDS.includes(m as GameId))
    : [];
  const claimed = Array.isArray(v.claimed)
    ? v.claimed.filter((id): id is string => typeof id === 'string' && ids.includes(id))
    : [];
  return {
    date: v.date,
    ids,
    progress: {
      moves: num(p.moves),
      wins: num(p.wins),
      winsWithoutHints: num(p.winsWithoutHints),
      winsByGame: {
        klondike: num(byGame.klondike),
        spider: num(byGame.spider),
        freecell: num(byGame.freecell),
        pyramid: num(byGame.pyramid),
      },
      modes: [...new Set(modes)],
    },
    claimed: [...new Set(claimed)],
  };
}

export function challengeProgress(state: DailyState, def: ChallengeDef): number {
  switch (def.metric) {
    case 'wins':
      return state.progress.wins;
    case 'moves':
      return state.progress.moves;
    case 'modes':
      return state.progress.modes.length;
    case 'winsByGame':
      return def.gameId ? state.progress.winsByGame[def.gameId] : 0;
    case 'noHintWins':
      return state.progress.winsWithoutHints;
    default:
      return 0;
  }
}

export function isChallengeComplete(state: DailyState, def: ChallengeDef): boolean {
  return challengeProgress(state, def) >= def.target;
}

export function recordDailyEvent(state: DailyState, event: DailyEvent): DailyState {
  const progress: DailyProgress = {
    ...state.progress,
    winsByGame: { ...state.progress.winsByGame },
    modes: [...state.progress.modes],
  };
  if (event.type === 'move') {
    progress.moves += Math.max(1, event.count ?? 1);
  } else if (event.type === 'mode') {
    if (!progress.modes.includes(event.gameId)) progress.modes.push(event.gameId);
  } else if (event.type === 'win') {
    progress.wins += 1;
    progress.winsByGame[event.gameId] += 1;
    if (event.hintsUsed === 0) progress.winsWithoutHints += 1;
  }
  return { ...state, progress };
}

export function claimChallenge(state: DailyState, id: string): DailyState {
  const def = getChallenge(id);
  if (!def) throw new Error('Задание не найдено');
  if (!state.ids.includes(id)) throw new Error('Этого задания нет в сегодняшнем списке');
  if (state.claimed.includes(id)) throw new Error('Награда уже получена');
  if (!isChallengeComplete(state, def)) throw new Error('Задание ещё не выполнено');
  return { ...state, claimed: [...state.claimed, id] };
}

export interface LoginState {
  streak: number;
  lastActiveDate: string | null;
  lastClaimDate: string | null;
}

export const LOGIN_REWARDS = [10, 15, 20, 25, 30, 40, 60];

export function emptyLoginState(): LoginState {
  return { streak: 0, lastActiveDate: null, lastClaimDate: null };
}

export function touchLogin(state: LoginState, today = dateKey()): LoginState {
  if (state.lastActiveDate === today) return state;
  let streak = 1;
  if (state.lastActiveDate && addDaysKey(state.lastActiveDate, 1) === today) {
    streak = state.streak + 1;
  }
  return { ...state, streak, lastActiveDate: today };
}

export function loginRewardDay(state: LoginState): number {
  return ((Math.max(1, state.streak) - 1) % LOGIN_REWARDS.length) + 1;
}

export function isLoginRewardClaimable(state: LoginState, today = dateKey()): boolean {
  return state.streak > 0 && state.lastClaimDate !== today;
}

export function claimLoginReward(
  state: LoginState,
  today = dateKey(),
): { login: LoginState; coins: number } {
  if (!isLoginRewardClaimable(state, today)) throw new Error('Награда уже получена сегодня');
  const day = loginRewardDay(state);
  const coins = LOGIN_REWARDS[day - 1];
  return {
    login: { ...state, lastClaimDate: today },
    coins,
  };
}

export function sanitizeLoginState(raw: unknown): LoginState {
  if (!raw || typeof raw !== 'object') return emptyLoginState();
  const v = raw as Partial<LoginState>;
  const date = (x: unknown): string | null =>
    typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : null;
  const streak =
    typeof v.streak === 'number' && Number.isFinite(v.streak) && v.streak >= 0
      ? Math.floor(v.streak)
      : 0;
  return {
    streak,
    lastActiveDate: date(v.lastActiveDate),
    lastClaimDate: date(v.lastClaimDate),
  };
}
