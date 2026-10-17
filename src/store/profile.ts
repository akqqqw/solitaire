import type { GameId } from '../core/games/types';
import { GAME_IDS } from '../core/games/types';
import { GAME_MODULES } from '../core/games/registry';
import type { StoredSession } from '../core/session/GameSession';
import {
  emptyCareer,
  emptyStatsMap,
  sanitizeCareer,
  sanitizeStatsMap,
  type CareerStats,
  type StatsMap,
} from '../core/statistics/stats';
import { sanitizeUnlocked } from '../core/achievements/achievements';
import {
  createDailyState,
  sanitizeDailyState,
  sanitizeLoginState,
  type DailyState,
  type LoginState,
} from '../services/dailyChallenges';

export const SCHEMA_VERSION = 1;

export type CardBackId = 'emerald' | 'midnight' | 'burgundy' | 'sapphire';
export type TableThemeId = 'emerald' | 'midnight' | 'burgundy';

export interface Settings {
  cardBack: CardBackId;
  tableTheme: TableThemeId;
  animations: boolean;
  sounds: boolean;
}

export const CARD_BACKS: { id: CardBackId; label: string; accent: string; deep: string }[] = [
  { id: 'emerald', label: 'Изумруд', accent: '#c8a85a', deep: '#123c2d' },
  { id: 'midnight', label: 'Полночь', accent: '#b9c6dd', deep: '#1b2742' },
  { id: 'burgundy', label: 'Бордо', accent: '#e2b177', deep: '#4a1d26' },
  { id: 'sapphire', label: 'Сапфир', accent: '#a9c7e8', deep: '#143453' },
];

export const TABLE_THEMES: { id: TableThemeId; label: string }[] = [
  { id: 'emerald', label: 'Зелёное сукно' },
  { id: 'midnight', label: 'Ночной клуб' },
  { id: 'burgundy', label: 'Бордовый зал' },
];

export function defaultSettings(): Settings {
  return { cardBack: 'emerald', tableTheme: 'emerald', animations: true, sounds: true };
}

export interface ProfileData {
  version: number;
  updatedAt: number;
  stats: StatsMap;
  career: CareerStats;
  achievements: Record<string, number>;
  daily: DailyState;
  login: LoginState;
  sessions: Partial<Record<GameId, StoredSession>>;
  settings: Settings;
  coins: number;
}

export function createDefaultProfile(): ProfileData {
  return {
    version: SCHEMA_VERSION,
    updatedAt: Date.now(),
    stats: emptyStatsMap(),
    career: emptyCareer(),
    achievements: {},
    daily: createDailyState(),
    login: sanitizeLoginState(null),
    sessions: {},
    settings: defaultSettings(),
    coins: 0,
  };
}

function sanitizeSettings(raw: unknown): Settings {
  const fallback = defaultSettings();
  if (!raw || typeof raw !== 'object') return fallback;
  const v = raw as Partial<Settings>;
  return {
    cardBack: CARD_BACKS.some((b) => b.id === v.cardBack) ? v.cardBack! : fallback.cardBack,
    tableTheme: TABLE_THEMES.some((t) => t.id === v.tableTheme)
      ? v.tableTheme!
      : fallback.tableTheme,
    animations: typeof v.animations === 'boolean' ? v.animations : fallback.animations,
    sounds: typeof v.sounds === 'boolean' ? v.sounds : fallback.sounds,
  };
}

function sanitizeSessions(raw: unknown): Partial<Record<GameId, StoredSession>> {
  const result: Partial<Record<GameId, StoredSession>> = {};
  if (!raw || typeof raw !== 'object') return result;
  const source = raw as Record<string, unknown>;
  for (const gameId of GAME_IDS) {
    const item = source[gameId] as Partial<StoredSession> | undefined;
    if (!item || typeof item !== 'object') continue;
    const module = GAME_MODULES[gameId];
    if (!module.isValidState(item.state)) continue;
    const undo = Array.isArray(item.undo)
      ? item.undo.filter((state) => module.isValidState(state)).slice(-40)
      : [];
    const elapsed =
      typeof item.elapsedMs === 'number' && Number.isFinite(item.elapsedMs) && item.elapsedMs >= 0
        ? Math.min(item.elapsedMs, 30 * 24 * 3600 * 1000)
        : 0;
    const hints =
      typeof item.hintsUsed === 'number' && Number.isFinite(item.hintsUsed) && item.hintsUsed >= 0
        ? Math.floor(item.hintsUsed)
        : 0;
    result[gameId] = {
      gameId,
      state: item.state,
      undo,
      elapsedMs: Math.round(elapsed),
      resultRecorded: !!item.resultRecorded,
      hintsUsed: hints,
      savedAt:
        typeof item.savedAt === 'number' && Number.isFinite(item.savedAt)
          ? item.savedAt
          : Date.now(),
    };
  }
  return result;
}

export function sanitizeProfile(raw: unknown): ProfileData {
  const fallback = createDefaultProfile();
  if (!raw || typeof raw !== 'object') return fallback;
  const v = raw as Partial<ProfileData>;
  const updatedAt =
    typeof v.updatedAt === 'number' && Number.isFinite(v.updatedAt) && v.updatedAt > 0
      ? v.updatedAt
      : Date.now();
  const coins =
    typeof v.coins === 'number' && Number.isFinite(v.coins) && v.coins >= 0
      ? Math.floor(v.coins)
      : 0;
  return {
    version: SCHEMA_VERSION,
    updatedAt,
    stats: sanitizeStatsMap(v.stats),
    career: sanitizeCareer(v.career),
    achievements: sanitizeUnlocked(v.achievements),
    daily: sanitizeDailyState(v.daily),
    login: sanitizeLoginState(v.login),
    sessions: sanitizeSessions(v.sessions),
    settings: sanitizeSettings(v.settings),
    coins,
  };
}

export function isProfileLike(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const v = raw as Record<string, unknown>;
  return (
    typeof v.version === 'number' &&
    (typeof v.stats === 'object' || typeof v.settings === 'object' || typeof v.sessions === 'object')
  );
}

export function profileUpdatedAt(raw: unknown): number {
  if (!raw || typeof raw !== 'object') return 0;
  const v = raw as Record<string, unknown>;
  return typeof v.updatedAt === 'number' && Number.isFinite(v.updatedAt) ? v.updatedAt : 0;
}
