/**
 * Тонкая обёртка над Yandex Games SDK.
 * Вне платформы все методы безопасно работают как офлайн-заглушки,
 * поэтому игра остаётся полностью функциональной без интернета.
 */

interface YandexCallbacks {
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: unknown) => void;
  onRewarded?: () => void;
}

interface YandexPlayer {
  getData(keys?: string[]): Promise<Record<string, unknown>>;
  setData(data: Record<string, unknown>, flush?: boolean): Promise<void>;
}

interface YandexSDK {
  features?: { LoadingAPI?: { ready?: () => void } };
  adv?: {
    showFullscreenAdv?: (options?: { callbacks?: YandexCallbacks }) => void;
    showRewardedVideo?: (options?: { callbacks?: YandexCallbacks }) => void;
  };
  getPlayer?: (options?: unknown) => Promise<YandexPlayer>;
  getLeaderboards?: () => Promise<{
    setLeaderboardScore(name: string, score: number): Promise<void>;
  }>;
  environment?: { i18n?: { lang?: string } };
}

declare global {
  interface Window {
    YaGames?: { init(): Promise<YandexSDK> };
    /** Флаги загрузки официального скрипта SDK из index.html. */
    __yaSdkLoaded?: boolean;
    __yaSdkFailed?: boolean;
  }
}

const SDK_WAIT_MS = 1500;

export type PlatformName = 'yandex' | 'offline';

class PlatformService {
  private sdk: YandexSDK | null = null;
  private initPromise: Promise<void> | null = null;
  onAdStart: (() => void) | null = null;
  onAdEnd: (() => void) | null = null;

  get available(): boolean {
    return this.sdk !== null;
  }

  get name(): PlatformName {
    return this.sdk ? 'yandex' : 'offline';
  }

  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.doInit();
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    if (typeof window === 'undefined') return;
    // Скрипт SDK подключён асинхронно: даём ему короткое время на загрузку,
    // но не задерживаем игру, если площадка недоступна (офлайн-режим).
    const hasSdkScript =
      typeof document !== 'undefined' &&
      !!document.querySelector('script[src*="games/sdk"]');
    if (hasSdkScript && !window.YaGames && !window.__yaSdkFailed) {
      const deadline = Date.now() + SDK_WAIT_MS;
      while (!window.YaGames && !window.__yaSdkFailed && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 60));
      }
    }
    if (!window.YaGames) return;
    try {
      // Вне площадки init() может не завершиться — не держим игрока
      // на экране загрузки и через пару секунд уходим в офлайн-режим.
      const sdk = await Promise.race([
        window.YaGames.init(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
      ]);
      if (!sdk) return;
      this.sdk = sdk;
      try {
        this.sdk.features?.LoadingAPI?.ready?.();
      } catch {
        // Не критично.
      }
    } catch {
      this.sdk = null;
    }
  }

  private async showAdv(
    type: 'interstitial' | 'rewarded',
  ): Promise<{ shown: boolean; rewarded: boolean }> {
    if (!this.sdk?.adv) return { shown: false, rewarded: false };
    this.onAdStart?.();
    return new Promise((resolve) => {
      let rewarded = false;
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        this.onAdEnd?.();
        resolve({ shown: true, rewarded });
      };
      const callbacks: YandexCallbacks = {
        onOpen: () => undefined,
        onClose: finish,
        onError: finish,
        onRewarded: () => {
          rewarded = true;
        },
      };
      try {
        if (type === 'interstitial') this.sdk?.adv?.showFullscreenAdv?.({ callbacks });
        else this.sdk?.adv?.showRewardedVideo?.({ callbacks });
      } catch {
        finish();
      }
      // Страховка, если SDK не вызвал onClose.
      setTimeout(finish, 45_000);
    });
  }

  async showInterstitial(): Promise<boolean> {
    const result = await this.showAdv('interstitial');
    return result.shown;
  }

  async showRewarded(): Promise<boolean> {
    const result = await this.showAdv('rewarded');
    return result.rewarded;
  }

  async submitScore(board: string, score: number): Promise<void> {
    if (!this.sdk?.getLeaderboards) return;
    try {
      const leaderboards = await this.sdk.getLeaderboards();
      await leaderboards.setLeaderboardScore(board, Math.round(score));
    } catch {
      // Таблица лидеров недоступна — не мешаем игре.
    }
  }

  async pullCloudSave(): Promise<unknown | null> {
    if (!this.sdk?.getPlayer) return null;
    try {
      const player = await this.sdk.getPlayer({ scopes: false });
      const data = await player.getData(['solitaire-club']);
      return data['solitaire-club'] ?? null;
    } catch {
      return null;
    }
  }

  async pushCloudSave(profile: unknown): Promise<void> {
    if (!this.sdk?.getPlayer) return;
    try {
      const player = await this.sdk.getPlayer({ scopes: false });
      await player.setData({ 'solitaire-club': profile }, true);
    } catch {
      // Офлайн-режим: локальное сохранение уже выполнено.
    }
  }
}

export const platform = new PlatformService();

export const LEADERBOARDS = {
  klondikeTime: 'klondike_best_time',
  spiderTime: 'spider_best_time',
  freecellTime: 'freecell_best_time',
  pyramidTime: 'pyramid_best_time',
  totalWins: 'total_wins',
} as const;
