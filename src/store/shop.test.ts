// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameStore, FREE_HINTS } from './gameStore';
import { GameSession } from '../core/session/GameSession';
import { pyramidModule } from '../core/games/pyramid/Pyramid';
import { pyramidFixture } from '../tests/helpers';
import { emptyCareer, emptyStatsMap } from '../core/statistics/stats';
import { createDailyState } from '../services/dailyChallenges';
import { iap } from '../services/iap';
import { platform } from '../services/platform';
import {
  CARD_BACKS,
  REWARDED_HINTS,
  TABLE_THEMES,
  defaultSettings,
  sanitizeProfile,
} from './profile';

function resetStore(extra: Partial<ReturnType<typeof useGameStore.getState>> = {}): void {
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
    busy: false,
    stats: emptyStatsMap(),
    career: emptyCareer(),
    achievements: {},
    daily: createDailyState(),
    sessions: {},
    settings: defaultSettings(),
    payments: false,
    coins: 0,
    owned: [],
    hints: 0,
    processedPurchases: [],
    ads: { interstitialAt: 0, rewardedAt: 0 },
    ...extra,
  });
}

function fakePayments(overrides: { token?: string; catalogs?: boolean } = {}) {
  const consumed: string[] = [];
  const payments = {
    getCatalog: vi.fn(async () => []),
    getPurchases: vi.fn(async () => []),
    purchase: vi.fn(async ({ id }: { id: string }) => ({
      productID: id,
      purchaseToken: overrides.token ?? `token-${id}`,
    })),
    consumePurchase: vi.fn(async (token: string) => {
      consumed.push(token);
    }),
  };
  return { payments, consumed };
}

function stubPlatform(available: boolean, rewarded = false) {
  vi.spyOn(platform, 'available', 'get').mockReturnValue(available);
  const showRewarded = vi.spyOn(platform, 'showRewarded').mockResolvedValue(rewarded);
  const showInterstitial = vi.spyOn(platform, 'showInterstitial').mockResolvedValue(true);
  return { showRewarded, showInterstitial };
}

describe('стили за монеты', () => {
  beforeEach(() => resetStore());

  it('не продаёт стиль без денег на счету', () => {
    const paid = CARD_BACKS.find((item) => item.price > 0)!;
    useGameStore.setState({ coins: paid.price - 1 });
    useGameStore.getState().buyCosmetic(paid.id);

    const state = useGameStore.getState();
    expect(state.owned).toEqual([]);
    expect(state.coins).toBe(paid.price - 1);
    expect(state.toast).toMatch(/Не хватает 1 монет/);
    expect(state.settings.cardBack).toBe('emerald');
  });

  it('списывает цену, выдаёт стиль и сразу надевает его', () => {
    const paid = CARD_BACKS.find((item) => item.price > 0)!;
    useGameStore.setState({ coins: paid.price + 40 });
    useGameStore.getState().buyCosmetic(paid.id);

    const state = useGameStore.getState();
    expect(state.coins).toBe(40);
    expect(state.owned).toEqual([paid.id]);
    expect(state.settings.cardBack).toBe(paid.id);
  });

  it('не списывает повторно за уже купленный стиль', () => {
    const paid = TABLE_THEMES.find((item) => item.price > 0)!;
    useGameStore.setState({ coins: paid.price });
    useGameStore.getState().buyCosmetic(paid.id);
    useGameStore.getState().buyCosmetic(paid.id);

    const state = useGameStore.getState();
    expect(state.owned).toEqual([paid.id]);
    expect(state.coins).toBe(0);
    expect(state.settings.tableTheme).toBe(paid.id);
  });

  it('не даёт надеть некупленный стиль в обход витрины', () => {
    const paid = TABLE_THEMES.find((item) => item.price > 0)!;
    useGameStore.getState().updateSettings({ tableTheme: paid.id });
    expect(useGameStore.getState().settings.tableTheme).toBe('emerald');
    expect(useGameStore.getState().toast).toMatch(/не куплен/);
  });

  it('отбрасывает при загрузке надетый, но не купленный стиль', () => {
    const paid = CARD_BACKS.find((item) => item.price > 0)!;
    const clean = sanitizeProfile({ settings: { cardBack: paid.id }, owned: [] });
    expect(clean.settings.cardBack).toBe('emerald');
    const kept = sanitizeProfile({ settings: { cardBack: paid.id }, owned: [paid.id] });
    expect(kept.settings.cardBack).toBe(paid.id);
  });
});

describe('покупка монет', () => {
  beforeEach(() => resetStore());
  afterEach(() => {
    iap.reset();
    vi.restoreAllMocks();
  });

  it('начисляет монеты и подтверждает расходуемую покупку', async () => {
    const { payments, consumed } = fakePayments();
    iap.bindSdk(() => ({ payments }));
    await iap.init();

    await useGameStore.getState().purchaseCoins('coins_100');

    const state = useGameStore.getState();
    expect(state.coins).toBe(100);
    expect(state.processedPurchases).toEqual(['token-coins_100']);
    expect(consumed).toEqual(['token-coins_100']);
    expect(state.notifications[0].body).toContain('+100 монет');
  });

  it('не начисляет монеты дважды за один токен', async () => {
    const { payments } = fakePayments({ token: 'same-token' });
    iap.bindSdk(() => ({ payments }));
    await iap.init();

    await useGameStore.getState().purchaseCoins('coins_100');
    await useGameStore.getState().purchaseCoins('coins_100');
    expect(useGameStore.getState().coins).toBe(100);
  });

  it('в офлайн-режиме объясняет, где работают покупки', async () => {
    iap.reset();
    await iap.init();
    await useGameStore.getState().purchaseCoins('coins_100');

    const state = useGameStore.getState();
    expect(state.coins).toBe(0);
    expect(state.toast).toMatch(/Яндекс Играх/);
  });

  it('не подтверждает покупку вне платформы', async () => {
    const consumed = await iap.consume('token');
    expect(consumed).toBe(false);
  });
});

describe('награда за ролик и межстраничная реклама', () => {
  beforeEach(() => resetStore());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('+3 подсказки за просмотренный ролик и пауза после него', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-20T12:00:00Z'));
    const { showRewarded } = stubPlatform(true, true);

    await useGameStore.getState().claimRewardedHints();
    let state = useGameStore.getState();
    expect(state.hints).toBe(REWARDED_HINTS);
    expect(state.ads.rewardedAt).toBe(Date.now());
    expect(state.notifications.length).toBe(0);

    // Второй ролик в пределах кулдауна не показывается.
    await useGameStore.getState().claimRewardedHints();
    expect(showRewarded).toHaveBeenCalledTimes(1);
    state = useGameStore.getState();
    expect(state.hints).toBe(REWARDED_HINTS);
    expect(state.toast).toMatch(/через 120 с/);

    // Через две минуты награда снова доступна.
    vi.setSystemTime(Date.now() + 120_000);
    await useGameStore.getState().claimRewardedHints();
    expect(showRewarded).toHaveBeenCalledTimes(2);
    expect(useGameStore.getState().hints).toBe(REWARDED_HINTS * 2);
  });

  it('не выдаёт награду за прерванный ролик', async () => {
    stubPlatform(true, false);
    await useGameStore.getState().claimRewardedHints();
    expect(useGameStore.getState().hints).toBe(0);
    expect(useGameStore.getState().toast).toMatch(/не было просмотрено/);
  });

  it('тратит запас подсказок вместо рекламы', async () => {
    const state = pyramidFixture({
      pyramid: [null, null, null, null, null, null, ['6h', '7s', '2c', '3c', '4c', '5c', '2h']],
    });
    const session = new GameSession(pyramidModule, state, { startTimer: false });
    session.hintsUsed = FREE_HINTS;
    useGameStore.setState({
      session,
      gameState: state,
      screen: 'game',
      hints: 2,
      hintsUsed: FREE_HINTS,
    });

    await useGameStore.getState().requestHint();
    const next = useGameStore.getState();
    expect(next.hints).toBe(1);
    expect(next.hint).not.toBeNull();
    expect(next.hintsUsed).toBe(FREE_HINTS + 1);
  });

  it('после победы показывает рекламу не чаще раза в интервал', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-20T12:00:00Z'));
    const { showInterstitial } = stubPlatform(true);

    const wonState = { ...pyramidFixture({}), won: true };
    const session = new GameSession(pyramidModule, wonState, { startTimer: false });
    useGameStore.setState({ session, gameState: wonState, screen: 'game' });

    useGameStore.getState().closeGame();
    expect(showInterstitial).toHaveBeenCalledTimes(1);
    expect(useGameStore.getState().ads.interstitialAt).toBe(Date.now());

    const second = new GameSession(pyramidModule, wonState, { startTimer: false });
    useGameStore.setState({ session: second, gameState: wonState, screen: 'game' });
    useGameStore.getState().closeGame();
    expect(showInterstitial).toHaveBeenCalledTimes(1);
  });
});
