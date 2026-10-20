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

/** Версия схемы сохранений: 2 — появились покупки, подсказки и лимиты рекламы. */
export const SCHEMA_VERSION = 2;

export type CardBackId =
  | 'emerald'
  | 'midnight'
  | 'burgundy'
  | 'sapphire'
  | 'onyx'
  | 'royal'
  | 'frost'
  | 'aurum';

export type TableThemeId = 'emerald' | 'midnight' | 'burgundy' | 'royal' | 'obsidian' | 'sand';

export interface Settings {
  cardBack: CardBackId;
  tableTheme: TableThemeId;
  animations: boolean;
  sounds: boolean;
  /** Подсвечивать места, куда можно положить взятую карту. По умолчанию выключено. */
  targetHints: boolean;
}

/**
 * Стили карт и стола. Цена указана в клубных монетах, а монеты пополняются
 * только покупкой: бесплатных источников валюты в игре нет.
 */
export const CARD_BACKS: {
  id: CardBackId;
  label: string;
  accent: string;
  deep: string;
  price: number;
}[] = [
  { id: 'emerald', label: 'Изумруд', accent: '#c8a85a', deep: '#123c2d', price: 0 },
  { id: 'midnight', label: 'Полночь', accent: '#b9c6dd', deep: '#1b2742', price: 0 },
  { id: 'burgundy', label: 'Бордо', accent: '#e2b177', deep: '#4a1d26', price: 0 },
  { id: 'sapphire', label: 'Сапфир', accent: '#a9c7e8', deep: '#143453', price: 0 },
  { id: 'onyx', label: 'Оникс', accent: '#d9c27a', deep: '#1a1a1e', price: 350 },
  { id: 'royal', label: 'Королевский', accent: '#e0c07a', deep: '#3a1d50', price: 450 },
  { id: 'frost', label: 'Мороз', accent: '#cfe6f2', deep: '#1f3d4d', price: 550 },
  { id: 'aurum', label: 'Аурум', accent: '#f0d08a', deep: '#2b2113', price: 700 },
];

export const TABLE_THEMES: { id: TableThemeId; label: string; price: number }[] = [
  { id: 'emerald', label: 'Зелёное сукно', price: 0 },
  { id: 'midnight', label: 'Ночной клуб', price: 0 },
  { id: 'burgundy', label: 'Бордовый зал', price: 0 },
  { id: 'sand', label: 'Тёплый песок', price: 250 },
  { id: 'royal', label: 'Королевский пурпур', price: 350 },
  { id: 'obsidian', label: 'Обсидиан', price: 450 },
];

export type CosmeticKind = 'cardBack' | 'tableTheme';

export const ALL_COSMETIC_IDS: string[] = [
  ...CARD_BACKS.map((item) => item.id),
  ...TABLE_THEMES.map((item) => item.id),
];

export function cosmeticPrice(id: string): number {
  const back = CARD_BACKS.find((item) => item.id === id);
  if (back) return back.price;
  const theme = TABLE_THEMES.find((item) => item.id === id);
  return theme ? theme.price : 0;
}

export function isCosmeticOwned(owned: readonly string[], id: string): boolean {
  return cosmeticPrice(id) === 0 || owned.includes(id);
}

export function cosmeticLabel(id: string): string {
  const back = CARD_BACKS.find((item) => item.id === id);
  if (back) return back.label;
  return TABLE_THEMES.find((item) => item.id === id)?.label ?? id;
}

/** Сколько времени должно пройти между межстраничными рекламами. */
export const INTERSTITIAL_INTERVAL_MS = 210_000;
/** Не чаще одной награды за рекламу в две минуты. */
export const REWARDED_COOLDOWN_MS = 120_000;
/** Сколько подсказок даёт один rewarded-ролик. */
export const REWARDED_HINTS = 3;

export interface AdState {
  /** Когда в последний раз показывали межстраничную рекламу. */
  interstitialAt: number;
  /** Когда в последний раз выдавали награду за ролик. */
  rewardedAt: number;
}

export function emptyAdState(): AdState {
  return { interstitialAt: 0, rewardedAt: 0 };
}

export function defaultSettings(): Settings {
  return {
    cardBack: 'emerald',
    tableTheme: 'emerald',
    animations: true,
    sounds: true,
    targetHints: false,
  };
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
  /** Клубные монеты: пополняются только покупкой за реальные деньги. */
  coins: number;
  /** Купленные стили карт и стола (id из CARD_BACKS и TABLE_THEMES). */
  owned: string[];
  /** Запас подсказок сверх бесплатных на партию. */
  hints: number;
  /** Токены уже выданных покупок, чтобы не начислить монеты дважды. */
  processedPurchases: string[];
  ads: AdState;
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
    owned: [],
    hints: 0,
    processedPurchases: [],
    ads: emptyAdState(),
  };
}

function sanitizeSettings(raw: unknown, owned: readonly string[]): Settings {
  const fallback = defaultSettings();
  if (!raw || typeof raw !== 'object') return fallback;
  const v = raw as Partial<Settings>;
  const backOk = CARD_BACKS.some((b) => b.id === v.cardBack) && isCosmeticOwned(owned, v.cardBack!);
  const themeOk =
    TABLE_THEMES.some((t) => t.id === v.tableTheme) && isCosmeticOwned(owned, v.tableTheme!);
  return {
    cardBack: backOk ? v.cardBack! : fallback.cardBack,
    tableTheme: themeOk ? v.tableTheme! : fallback.tableTheme,
    animations: typeof v.animations === 'boolean' ? v.animations : fallback.animations,
    sounds: typeof v.sounds === 'boolean' ? v.sounds : fallback.sounds,
    targetHints: typeof v.targetHints === 'boolean' ? v.targetHints : fallback.targetHints,
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
  const owned = Array.isArray(v.owned)
    ? Array.from(
        new Set(
          v.owned.filter(
            (id): id is string =>
              typeof id === 'string' && ALL_COSMETIC_IDS.includes(id) && cosmeticPrice(id) > 0,
          ),
        ),
      )
    : [];
  const hints =
    typeof v.hints === 'number' && Number.isFinite(v.hints) && v.hints >= 0
      ? Math.floor(v.hints)
      : 0;
  const processedPurchases = Array.isArray(v.processedPurchases)
    ? Array.from(
        new Set(v.processedPurchases.filter((token): token is string => typeof token === 'string')),
      ).slice(-50)
    : [];
  const adsRaw = (v.ads ?? {}) as Partial<AdState>;
  const stamp = (value: unknown): number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
  return {
    version: SCHEMA_VERSION,
    updatedAt,
    stats: sanitizeStatsMap(v.stats),
    career: sanitizeCareer(v.career),
    achievements: sanitizeUnlocked(v.achievements),
    daily: sanitizeDailyState(v.daily),
    login: sanitizeLoginState(v.login),
    sessions: sanitizeSessions(v.sessions),
    settings: sanitizeSettings(v.settings, owned),
    coins,
    owned,
    hints,
    processedPurchases,
    ads: { interstitialAt: stamp(adsRaw.interstitialAt), rewardedAt: stamp(adsRaw.rewardedAt) },
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
