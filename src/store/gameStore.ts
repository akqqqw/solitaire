import { create } from 'zustand';
import type { GameId, GameStateBase, Hint, NewGameOptions } from '../core/games/types';
import { getGameModule } from '../core/games/registry';
import { GameSession, type AnyGameSession, type StoredSession } from '../core/session/GameSession';
import {
  recordLoss,
  recordWin,
  type CareerStats,
  type StatsMap,
} from '../core/statistics/stats';
import {
  unlockAchievements,
  type AchievementContext,
  type AchievementDef,
} from '../core/achievements/achievements';
import {
  claimChallenge,
  claimLoginReward,
  createDailyState,
  dateKey,
  getChallenge,
  isChallengeComplete,
  isLoginRewardClaimable,
  recordDailyEvent,
  touchLogin,
  type DailyState,
  type LoginState,
} from '../services/dailyChallenges';
import {
  clearProfileStorage,
  loadProfile,
  resolveProfileConflict,
  saveProfile,
  saveProfileLocal,
} from '../services/persistence';
import { LEADERBOARDS, platform } from '../services/platform';
import { COIN_PACKS, iap, type PurchaseProduct } from '../services/iap';
import { canClaimRewarded, canShowInterstitial, rewardedCooldownLeft } from '../services/adPolicy';
import { sound } from '../services/sound';
import {
  CARD_BACKS,
  createDefaultProfile,
  cosmeticPrice,
  isCosmeticOwned,
  REWARDED_HINTS,
  SCHEMA_VERSION,
  TABLE_THEMES,
  type AdState,
  type ProfileData,
  type Settings,
} from './profile';
import {
  getBoardAdapter,
  type InteractionResult,
  type Selection,
} from '../game/adapters/interactions';

export type Screen =
  | 'menu'
  | 'game'
  | 'stats'
  | 'achievements'
  | 'settings'
  | 'daily'
  | 'shop';
export type Modal = 'rules' | 'new-game' | 'pause' | null;

export interface AppNotification {
  id: string;
  kind: 'achievement' | 'daily' | 'reward' | 'info';
  title: string;
  body: string;
  icon: string;
}

export const FREE_HINTS = 5;

interface ProfileState {
  stats: StatsMap;
  career: CareerStats;
  achievements: Record<string, number>;
  daily: DailyState;
  login: LoginState;
  sessions: Partial<Record<GameId, StoredSession>>;
  settings: Settings;
  coins: number;
  owned: string[];
  hints: number;
  processedPurchases: string[];
  ads: AdState;
}

export interface AppState extends ProfileState {
  hydrated: boolean;
  /** Доступны ли реальные покупки (инициализированы ли платежи площадки). */
  payments: boolean;
  /** Витрина с ценами площадки; до ответа каталога — цены-заглушки. */
  catalog: PurchaseProduct[];
  screen: Screen;
  modal: Modal;
  session: AnyGameSession | null;
  gameState: GameStateBase | null;
  selection: Selection | null;
  hint: Hint | null;
  canUndo: boolean;
  isWon: boolean;
  isStuck: boolean;
  hintsUsed: number;
  busy: boolean;
  toast: string | null;
  notifications: AppNotification[];

  init(): Promise<void>;
  refreshDate(): void;
  openGame(gameId: GameId): void;
  newGame(options?: NewGameOptions): void;
  closeGame(): void;
  openScreen(screen: Screen): void;
  openModal(modal: Modal): void;
  closeModal(): void;
  handleCardClick(cardId: string): void;
  handleCardDoubleClick(cardId: string): void;
  handleSlotClick(slotId: string): void;
  handleDrop(cards: string[], slotId: string | null): boolean;
  undo(): Promise<void>;
  requestHint(): Promise<void>;
  dismissHint(): void;
  autoCollect(): void;
  claimDailyChallenge(id: string): void;
  claimDailyLogin(): void;
  updateSettings(partial: Partial<Settings>): void;
  buyCosmetic(id: string): void;
  equipCosmetic(id: string): void;
  purchaseCoins(packId: string): Promise<void>;
  claimRewardedHints(): Promise<void>;
  syncPurchases(): Promise<void>;
  resetProgress(): Promise<void>;
  showToast(message: string): void;
  dismissNotification(id: string): void;
  finalizeWin(): boolean;
  pauseForVisibility(): void;
  resumeForVisibility(): void;
  flushProfile(): void;
}

type StoreSet = (partial: Partial<AppState>) => void;
type StoreGet = () => AppState;

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let cloudTimer: ReturnType<typeof setTimeout> | null = null;
let latestProfile: ProfileData | null = null;
let notificationCounter = 0;
let toastCounter = 0;
let hintTimer: ReturnType<typeof setTimeout> | null = null;

function buildProfile(state: AppState): ProfileData {
  const sessions = { ...state.sessions };
  // Завершённую партию не сохраняем: после перезагрузки её нельзя
  // «продолжить», результат уже учтён в статистике.
  if (state.session && !state.session.state.won) {
    sessions[state.session.gameId] = state.session.serialize();
  }
  return {
    version: SCHEMA_VERSION,
    updatedAt: Date.now(),
    stats: state.stats,
    career: state.career,
    achievements: state.achievements,
    daily: state.daily,
    login: state.login,
    sessions,
    settings: state.settings,
    coins: state.coins,
    owned: state.owned,
    hints: state.hints,
    processedPurchases: state.processedPurchases,
    ads: state.ads,
  };
}

function queueSave(get: StoreGet): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    latestProfile = buildProfile(get());
    void saveProfile(latestProfile);
    if (cloudTimer) clearTimeout(cloudTimer);
    cloudTimer = setTimeout(() => {
      if (platform.available && latestProfile) void platform.pushCloudSave(latestProfile);
    }, 1800);
  }, 300);
}

/** Русское склонение для «подсказка/подсказки/подсказок». */
function hintsWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'подсказка';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'подсказки';
  return 'подсказок';
}

function notification(
  kind: AppNotification['kind'],
  title: string,
  body: string,
  icon: string,
): AppNotification {
  notificationCounter += 1;
  return { id: `n-${Date.now()}-${notificationCounter}`, kind, title, body, icon };
}

function achievementNotification(def: AchievementDef): AppNotification {
  return notification('achievement', 'Новое достижение', `${def.title} — ${def.description}`, def.icon);
}

function challengeCompletionNotifications(
  before: DailyState,
  after: DailyState,
): AppNotification[] {
  const result: AppNotification[] = [];
  for (const id of after.ids) {
    const def = getChallenge(id);
    if (!def || after.claimed.includes(id)) continue;
    if (!isChallengeComplete(after, def)) continue;
    const wasComplete = before.ids.includes(id) && isChallengeComplete(before, def);
    if (!wasComplete) {
      result.push(
        notification(
          'daily',
          'Ежедневное задание выполнено',
          `${def.title} · награда ${def.hintReward} ${hintsWord(def.hintReward)} — заберите в разделе «Испытание»`,
          '☀',
        ),
      );
    }
  }
  return result;
}

function pushNotifications(
  notifications: AppNotification[],
  extra: AppNotification[],
): AppNotification[] {
  if (!extra.length) return notifications;
  return [...extra, ...notifications].slice(0, 4);
}

function achievementContext(state: AppState): AchievementContext {
  return { career: state.career, loginStreak: state.login.streak };
}

function syncAchievements(set: StoreSet, get: StoreGet): void {
  const ctx = achievementContext(get());
  const result = unlockAchievements(ctx, get().achievements);
  if (result.newlyUnlocked.length) {
    set({
      achievements: result.unlocked,
      notifications: pushNotifications(
        get().notifications,
        result.newlyUnlocked.map((def) => achievementNotification(def)),
      ),
    });
  }
}

function freshDailyAndLogin(
  daily: DailyState,
  login: LoginState,
  today = dateKey(),
): { daily: DailyState; login: LoginState; changed: boolean } {
  const nextDaily = daily.date === today ? daily : createDailyState(today);
  const nextLogin = touchLogin(login, today);
  return {
    daily: nextDaily,
    login: nextLogin,
    changed: nextDaily !== daily || nextLogin !== login,
  };
}

function variantOf(session: AnyGameSession): { suitCount?: 1 | 2 | 4; drawCount?: 1 | 3 } {
  const s = session.state as { suitCount?: 1 | 2 | 4; drawCount?: 1 | 3 };
  return { suitCount: s.suitCount, drawCount: s.drawCount };
}

function statusFields(session: AnyGameSession | null) {
  return {
    session,
    gameState: session?.state ?? null,
    // После победы партия завершена: отмена вернула бы уже учтённый результат.
    canUndo: session ? !session.state.won && session.canUndo : false,
    isWon: session?.state.won ?? false,
    isStuck: session ? !session.state.won && session.module.isStuck(session.state) : false,
    hintsUsed: session?.hintsUsed ?? 0,
  };
}

/**
 * Межстраничная реклама — только после завершённой партии и не чаще
 * INTERSTITIAL_INTERVAL_MS. Отметка о показе хранится в профиле,
 * поэтому перезапуск игры не даёт обойти интервал.
 */
function maybeInterstitial(set: StoreSet, get: StoreGet): void {
  if (!platform.available) return;
  const ads = get().ads;
  if (!canShowInterstitial(ads)) return;
  set({ ads: { ...ads, interstitialAt: Date.now() } });
  queueSave(get);
  void platform.showInterstitial();
}

function applyMovesToStore(moves: unknown[], set: StoreSet, get: StoreGet): boolean {
  const state = get();
  const session = state.session;
  if (!session) return false;
  try {
    session.applyMoves(moves as never[]);
  } catch (error) {
    sound.play('error');
    state.showToast(error instanceof Error ? error.message : 'Ход недоступен');
    return false;
  }
  const beforeDaily = state.daily;
  const daily = recordDailyEvent(beforeDaily, { type: 'move', count: moves.length });
  set({
    ...statusFields(session),
    daily,
    selection: null,
    hint: null,
  });
  set({
    notifications: pushNotifications(
      state.notifications,
      challengeCompletionNotifications(beforeDaily, daily),
    ),
  });
  sound.play('move');
  get().finalizeWin();
  queueSave(get);
  return true;
}

function applyInteractionResult(
  result: InteractionResult,
  set: StoreSet,
  get: StoreGet,
): boolean {
  if (result.type === 'select') {
    sound.play('select');
    set({ selection: { cards: result.cards, slot: result.slot }, hint: null });
    return true;
  }
  if (result.type === 'clear') {
    sound.play('click');
    set({ selection: null });
    return true;
  }
  if (result.type === 'error') {
    sound.play('error');
    get().showToast(result.message);
    return false;
  }
  if (result.type === 'moves') {
    return applyMovesToStore(result.moves, set, get);
  }
  return false;
}

/**
 * Начисляет монеты за покупку ровно один раз.
 *
 * Токен покупки — единственный идентификатор транзакции, поэтому он попадает
 * в processedPurchases до сохранения. Площадка требует подтвердить расходуемую
 * покупку (consumePurchase), иначе товар нельзя купить повторно.
 */
async function grantPurchase(
  token: string,
  productId: string,
  coins: number,
  set: StoreSet,
  get: StoreGet,
): Promise<void> {
  const state = get();
  if (state.processedPurchases.includes(token)) {
    void iap.consume(token);
    return;
  }
  set({
    coins: state.coins + coins,
    processedPurchases: [...state.processedPurchases, token].slice(-50),
    notifications: pushNotifications(state.notifications, [
      notification('reward', 'Покупка завершена', `+${coins} монет на клубный счёт`, '◆'),
    ]),
  });
  sound.play('win');
  // Сохраняем начисление до подтверждения покупки: если подтвердить раньше,
  // а игра закроется до записи профиля, монеты пропадут безвозвратно.
  latestProfile = buildProfile(get());
  await saveProfile(latestProfile);
  const consumed = await iap.consume(token);
  if (!consumed) {
    // Товар останется неподтверждённым; при следующем запуске syncPurchases
    // увидит его в getPurchases(), а токен уже в processedPurchases — повторно
    // монеты не начислятся.
    console.warn('Не удалось подтвердить покупку', productId);
  }
}

const defaults = createDefaultProfile();

export const useGameStore = create<AppState>((set, get) => ({
  hydrated: false,
  payments: false,
  catalog: [],
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
  busy: false,
  toast: null,
  notifications: [],
  stats: defaults.stats,
  career: defaults.career,
  achievements: defaults.achievements,
  daily: defaults.daily,
  login: defaults.login,
  sessions: {},
  settings: defaults.settings,
  coins: defaults.coins,
  owned: defaults.owned,
  hints: defaults.hints,
  processedPurchases: defaults.processedPurchases,
  ads: defaults.ads,

  async init() {
    if (get().hydrated) return;
    await platform.init();
    await iap.init();
    // Цены догружаем фоном: витрина уже доступна с ценами-заглушками.
    void iap.catalog().then((catalog) => set({ catalog }));
    const loaded = await loadProfile();
    const cloud = await platform.pullCloudSave();
    const profile = resolveProfileConflict(loaded, cloud);
    const today = dateKey();
    const daily = profile.daily.date === today ? profile.daily : createDailyState(today);
    const login = touchLogin(profile.login, today);
    sound.setEnabled(profile.settings.sounds);
    platform.onAdStart = () => {
      get().session?.pause();
      sound.setEnabled(false);
    };
    platform.onAdEnd = () => {
      sound.setEnabled(get().settings.sounds);
      const session = get().session;
      const visible = typeof document === 'undefined' || document.visibilityState === 'visible';
      if (session && get().screen === 'game' && !session.state.won && visible) {
        session.resume();
      }
    };
    set({
      hydrated: true,
      payments: iap.available,
      stats: profile.stats,
      career: profile.career,
      achievements: profile.achievements,
      daily,
      login,
      sessions: profile.sessions,
      settings: profile.settings,
      coins: profile.coins,
      owned: profile.owned,
      hints: profile.hints,
      processedPurchases: profile.processedPurchases,
      ads: profile.ads,
      screen: 'menu',
    });
    syncAchievements((partial) => set(partial), get);
    // Покупки, оформленные в прошлом сеансе, но не подтверждённые.
    void get().syncPurchases();
    latestProfile = buildProfile(get());
    void saveProfile(latestProfile);
  },

  refreshDate() {
    const state = get();
    const result = freshDailyAndLogin(state.daily, state.login);
    if (!result.changed) return;
    set({ daily: result.daily, login: result.login });
    syncAchievements((partial) => set(partial), get);
    queueSave(get);
  },

  openGame(gameId) {
    get().refreshDate();
    const state = get();
    if (state.session) {
      state.session.pause();
      set({
        sessions: { ...state.sessions, [state.session.gameId]: state.session.serialize() },
      });
    }
    const module = getGameModule(gameId);
    const saved = get().sessions[gameId];
    let session = saved ? GameSession.restore(module, saved) : null;
    if (session?.state.won) {
      // Старые сохранения могли содержать завершённую партию.
      const sessions = { ...get().sessions };
      delete sessions[gameId];
      set({ sessions });
      session = null;
    }
    if (!session) session = GameSession.create(module);
    const daily = recordDailyEvent(get().daily, { type: 'mode', gameId });
    set({
      ...statusFields(session),
      daily,
      selection: null,
      hint: null,
      screen: 'game',
      modal: null,
      toast: null,
    });
    sound.play('deal');
    get().finalizeWin();
    queueSave(get);
  },

  newGame(options = {}) {
    get().refreshDate();
    if (!get().session) return;
    get().finalizeWin();
    const current = get().session;
    if (!current) return;
    const gameId = current.gameId;
    const module = current.module;
    let { stats, career } = get();
    if (!current.state.won && current.state.moves > 0 && !current.resultRecorded) {
      const loss = recordLoss(stats, career, {
        gameId,
        elapsedMs: current.elapsedMs,
        moves: current.state.moves,
      });
      stats = loss.stats;
      career = loss.career;
      current.markResultRecorded();
    }
    const session = GameSession.create(module, options);
    const sessions = { ...get().sessions };
    delete sessions[gameId];
    const daily = recordDailyEvent(get().daily, { type: 'mode', gameId });
    set({
      stats,
      career,
      sessions,
      daily,
      ...statusFields(session),
      selection: null,
      hint: null,
      modal: null,
      screen: 'game',
      toast: null,
    });
    sound.play('deal');
    syncAchievements((partial) => set(partial), get);
    queueSave(get);
  },

  closeGame() {
    get().finalizeWin();
    const state = get();
    const session = state.session;
    if (!session) {
      set({ screen: 'menu', modal: null, hint: null, selection: null });
      return;
    }
    const wasWon = session.state.won;
    // Реклама уместна после сыгранной партии, а не после случайного выхода.
    const playedRound = wasWon || session.state.moves > 0;
    const sessions = { ...state.sessions };
    if (wasWon) {
      delete sessions[session.gameId];
    } else {
      session.pause();
      sessions[session.gameId] = session.serialize();
    }
    set({
      sessions,
      session: null,
      gameState: null,
      selection: null,
      hint: null,
      canUndo: false,
      isWon: false,
      isStuck: false,
      hintsUsed: 0,
      screen: 'menu',
      modal: null,
    });
    queueSave(get);
    if (playedRound) maybeInterstitial((partial) => set(partial), get);
  },

  openScreen(screen) {
    if (get().session) get().closeGame();
    get().refreshDate();
    set({ screen, modal: null });
    queueSave(get);
  },

  openModal(modal) {
    const session = get().session;
    if (modal && session && !session.state.won) {
      session.pause();
      set({
        sessions: { ...get().sessions, [session.gameId]: session.serialize() },
        canUndo: session.canUndo,
      });
    }
    set({ modal });
  },

  closeModal() {
    set({ modal: null });
    const session = get().session;
    const visible = typeof document === 'undefined' || document.visibilityState === 'visible';
    if (session && !session.state.won && get().screen === 'game' && visible) {
      session.resume();
    }
  },

  handleCardClick(cardId) {
    const session = get().session;
    if (!session || session.state.won) return;
    const adapter = getBoardAdapter(session.gameId);
    applyInteractionResult(
      adapter.clickCard(session.state, cardId, get().selection),
      (partial) => set(partial),
      get,
    );
  },

  handleCardDoubleClick(cardId) {
    const session = get().session;
    if (!session || session.state.won) return;
    const adapter = getBoardAdapter(session.gameId);
    applyInteractionResult(
      adapter.doubleClick(session.state, cardId),
      (partial) => set(partial),
      get,
    );
  },

  handleSlotClick(slotId) {
    const session = get().session;
    if (!session || session.state.won) return;
    const adapter = getBoardAdapter(session.gameId);
    applyInteractionResult(
      adapter.clickSlot(session.state, slotId, get().selection),
      (partial) => set(partial),
      get,
    );
  },

  handleDrop(cards, slotId) {
    const session = get().session;
    if (!session || session.state.won || !slotId) return false;
    const adapter = getBoardAdapter(session.gameId);
    const result = adapter.drop(session.state, cards, slotId);
    if (result.type !== 'moves') return false;
    return applyMovesToStore(result.moves, (partial) => set(partial), get);
  },

  async undo() {
    const session = get().session;
    if (!session || !session.canUndo || session.state.won) return;
    session.undo();
    set({ ...statusFields(session), selection: null, hint: null });
    sound.play('undo');
    queueSave(get);
  },

  async requestHint() {
    get().refreshDate();
    const session = get().session;
    if (!session || session.state.won) return;
    const hint = session.hint();
    if (!hint) {
      get().showToast('Доступных ходов больше нет. Попробуйте отменить ход.');
      return;
    }
    if (session.hintsUsed >= FREE_HINTS) {
      const state = get();
      if (state.hints > 0) {
        set({ hints: state.hints - 1 });
      } else {
        if (!platform.available) {
          get().showToast('Подсказки закончились. Новые можно получить за ролик в Яндекс Играх.');
          return;
        }
        if (!canClaimRewarded(state.ads)) {
          get().showToast(
            `Следующая награда за видео через ${rewardedCooldownLeft(state.ads)} с.`,
          );
          return;
        }
        session.pause();
        set({ busy: true });
        const rewarded = await platform.showRewarded();
        set({ busy: false });
        if (get().session !== session) return;
        if (!rewarded) {
          session.resume();
          get().showToast('Посмотрите короткое видео, чтобы получить дополнительные подсказки.');
          return;
        }
        // Ролик сразу даёт запас подсказок, одна из них тратится на текущую.
        set({
          hints: get().hints + REWARDED_HINTS - 1,
          ads: { ...get().ads, rewardedAt: Date.now() },
        });
        get().showToast(`+${REWARDED_HINTS} ${hintsWord(REWARDED_HINTS)} за просмотр видео.`);
      }
    }
    session.hintsUsed += 1;
    set({ ...statusFields(session), hint, selection: null, busy: false });
    sound.play('click');
    if (hintTimer) clearTimeout(hintTimer);
    hintTimer = setTimeout(() => {
      if (get().hint === hint) set({ hint: null });
    }, 9000);
    queueSave(get);
  },

  dismissHint() {
    if (hintTimer) clearTimeout(hintTimer);
    set({ hint: null });
  },

  autoCollect() {
    const session = get().session;
    if (!session || session.state.won) return;
    const count = session.autoCollect();
    if (count === 0) {
      get().showToast('Автосборка не нашла подходящих ходов.');
      return;
    }
    const beforeDaily = get().daily;
    const daily = recordDailyEvent(beforeDaily, { type: 'move', count });
    set({ ...statusFields(session), daily, selection: null, hint: null });
    set({
      notifications: pushNotifications(
        get().notifications,
        challengeCompletionNotifications(beforeDaily, daily),
      ),
    });
    sound.play('move');
    get().finalizeWin();
    queueSave(get);
  },

  claimDailyChallenge(id) {
    get().refreshDate();
    const def = getChallenge(id);
    if (!def) return;
    try {
      const nextDaily = claimChallenge(get().daily, id);
      set({
        daily: nextDaily,
        career: { ...get().career, dailyCompleted: get().career.dailyCompleted + 1 },
        hints: get().hints + def.hintReward,
        notifications: pushNotifications(get().notifications, [
          notification(
            'reward',
            'Награда получена',
            `+${def.hintReward} ${hintsWord(def.hintReward)} за «${def.title}»`,
            '✦',
          ),
        ]),
      });
      syncAchievements((partial) => set(partial), get);
      sound.play('select');
      queueSave(get);
    } catch (error) {
      get().showToast(error instanceof Error ? error.message : 'Награда недоступна');
    }
  },

  claimDailyLogin() {
    get().refreshDate();
    const login = get().login;
    if (!isLoginRewardClaimable(login)) {
      get().showToast('Ежедневная награда уже получена.');
      return;
    }
    try {
      const result = claimLoginReward(login);
      set({
        login: result.login,
        hints: get().hints + result.hints,
        notifications: pushNotifications(get().notifications, [
          notification(
            'reward',
            'Ежедневная награда',
            `+${result.hints} ${hintsWord(result.hints)} за вход в клуб`,
            '☀',
          ),
        ]),
      });
      syncAchievements((partial) => set(partial), get);
      sound.play('select');
      queueSave(get);
    } catch (error) {
      get().showToast(error instanceof Error ? error.message : 'Награда недоступна');
    }
  },

  updateSettings(partial) {
    const state = get();
    // Стиль, который не куплен, надеть нельзя: защищаемся от вызовов в обход витрины.
    if (partial.cardBack && !isCosmeticOwned(state.owned, partial.cardBack)) {
      get().showToast('Этот стиль рубашки ещё не куплен.');
      return;
    }
    if (partial.tableTheme && !isCosmeticOwned(state.owned, partial.tableTheme)) {
      get().showToast('Этот стиль стола ещё не куплен.');
      return;
    }
    const settings = { ...state.settings, ...partial };
    set({ settings });
    sound.setEnabled(settings.sounds);
    if (partial.sounds) sound.play('click');
    queueSave(get);
  },

  buyCosmetic(id) {
    const state = get();
    const price = cosmeticPrice(id);
    if (price <= 0) return;
    if (state.owned.includes(id)) {
      get().equipCosmetic(id);
      return;
    }
    if (state.coins < price) {
      get().showToast(`Не хватает ${price - state.coins} монет. Монеты пополняются покупкой.`);
      return;
    }
    set({ coins: state.coins - price, owned: [...state.owned, id] });
    get().equipCosmetic(id);
    sound.play('select');
    queueSave(get);
  },

  equipCosmetic(id) {
    const state = get();
    if (!isCosmeticOwned(state.owned, id)) {
      get().showToast('Этот стиль ещё не куплен.');
      return;
    }
    const settings = { ...state.settings };
    if (CARD_BACKS.some((item) => item.id === id)) settings.cardBack = id as Settings['cardBack'];
    else if (TABLE_THEMES.some((item) => item.id === id)) {
      settings.tableTheme = id as Settings['tableTheme'];
    } else {
      return;
    }
    set({ settings });
    sound.play('click');
    queueSave(get);
  },

  async purchaseCoins(packId) {
    if (!iap.available) {
      get().showToast('Покупки доступны в Яндекс Играх.');
      return;
    }
    const state = get();
    if (state.busy) return;
    set({ busy: true });
    const result = await iap.purchase(packId);
    set({ busy: false });
    if (result.status === 'cancelled') {
      get().showToast(result.message ?? 'Покупка отменена.');
      return;
    }
    if (result.status === 'unavailable' || result.status === 'failed' || !result.token) {
      get().showToast(result.message ?? 'Не удалось завершить покупку.');
      return;
    }
    await grantPurchase(result.token, result.productId ?? packId, result.coins ?? 0, set, get);
  },

  async claimRewardedHints() {
    const state = get();
    if (!platform.available) {
      get().showToast('Видео с наградой доступно в Яндекс Играх.');
      return;
    }
    if (state.busy) return;
    if (!canClaimRewarded(state.ads)) {
      get().showToast(`Следующая награда за видео через ${rewardedCooldownLeft(state.ads)} с.`);
      return;
    }
    set({ busy: true });
    const rewarded = await platform.showRewarded();
    set({ busy: false });
    if (!rewarded) {
      get().showToast('Видео не было просмотрено до конца.');
      return;
    }
    set({
      hints: get().hints + REWARDED_HINTS,
      ads: { ...get().ads, rewardedAt: Date.now() },
    });
    get().showToast(`+${REWARDED_HINTS} ${hintsWord(REWARDED_HINTS)} за просмотр видео.`);
    sound.play('select');
    queueSave(get);
  },

  async syncPurchases() {
    if (!iap.available) return;
    const pending = await iap.pendingPurchases();
    for (const item of pending) {
      const pack = COIN_PACKS.find((p) => p.id === item.productId);
      if (!pack) continue;
      await grantPurchase(item.token, item.productId, pack.coins, (partial) => set(partial), get);
    }
  },

  async resetProgress() {
    await clearProfileStorage();
    sound.setEnabled(defaults.settings.sounds);
    const daily = createDailyState(dateKey());
    const login = touchLogin(
      { streak: 0, lastActiveDate: null, lastClaimDate: null },
      dateKey(),
    );
    const fresh = createDefaultProfile();
    set({
      stats: fresh.stats,
      career: fresh.career,
      achievements: {},
      daily,
      login,
      sessions: {},
      settings: fresh.settings,
      coins: 0,
      owned: fresh.owned,
      hints: fresh.hints,
      processedPurchases: fresh.processedPurchases,
      ads: fresh.ads,
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
      screen: 'menu',
      modal: null,
      hydrated: true,
    });
    const profile = buildProfile(get());
    latestProfile = profile;
    await saveProfile(profile);
    if (platform.available) void platform.pushCloudSave(profile);
  },

  showToast(message) {
    toastCounter += 1;
    const current = toastCounter;
    set({ toast: message });
    setTimeout(() => {
      if (toastCounter === current) set({ toast: null });
    }, 2800);
  },

  dismissNotification(id) {
    set({ notifications: get().notifications.filter((n) => n.id !== id) });
  },

  finalizeWin() {
    const session = get().session;
    if (!session || !session.state.won || session.resultRecorded) return false;
    const before = get().daily;
    const result = recordWin(get().stats, get().career, {
      gameId: session.gameId,
      elapsedMs: session.elapsedMs,
      moves: session.state.moves,
      hintsUsed: session.hintsUsed,
      ...variantOf(session),
    });
    session.markResultRecorded();
    const daily = recordDailyEvent(before, {
      type: 'win',
      gameId: session.gameId,
      hintsUsed: session.hintsUsed,
    });
    const sessions = { ...get().sessions };
    delete sessions[session.gameId];
    set({
      stats: result.stats,
      career: result.career,
      daily,
      sessions,
      ...statusFields(session),
    });
    set({
      notifications: pushNotifications(
        get().notifications,
        challengeCompletionNotifications(before, daily),
      ),
    });
    sound.play('win');
    syncAchievements((partial) => set(partial), get);
    if (platform.available) {
      const boards: Record<GameId, string> = {
        klondike: LEADERBOARDS.klondikeTime,
        spider: LEADERBOARDS.spiderTime,
        freecell: LEADERBOARDS.freecellTime,
        pyramid: LEADERBOARDS.pyramidTime,
      };
      void platform.submitScore(boards[session.gameId], Math.round(session.elapsedMs));
      void platform.submitScore(LEADERBOARDS.totalWins, result.career.totalWins);
    }
    queueSave(get);
    return true;
  },

  pauseForVisibility() {
    const session = get().session;
    if (!session) return;
    session.pause();
    if (get().screen === 'game') {
      set({ sessions: { ...get().sessions, [session.gameId]: session.serialize() } });
      queueSave(get);
    }
  },

  resumeForVisibility() {
    const session = get().session;
    const visible = typeof document === 'undefined' || document.visibilityState === 'visible';
    if (!session || session.state.won || get().screen !== 'game' || get().modal || !visible) return;
    session.resume();
  },

  flushProfile() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    latestProfile = buildProfile(get());
    saveProfileLocal(latestProfile);
    void saveProfile(latestProfile);
    if (platform.available) void platform.pushCloudSave(latestProfile);
  },
}));
