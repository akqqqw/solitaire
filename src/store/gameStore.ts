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
import { sound } from '../services/sound';
import { createDefaultProfile, type ProfileData, type Settings } from './profile';
import {
  getBoardAdapter,
  type InteractionResult,
  type Selection,
} from '../game/adapters/interactions';

export type Screen = 'menu' | 'game' | 'stats' | 'achievements' | 'settings' | 'daily';
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
}

export interface AppState extends ProfileState {
  hydrated: boolean;
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
let lastInterstitial = 0;

function buildProfile(state: AppState): ProfileData {
  const sessions = { ...state.sessions };
  // Завершённую партию не сохраняем: после перезагрузки её нельзя
  // «продолжить», результат уже учтён в статистике.
  if (state.session && !state.session.state.won) {
    sessions[state.session.gameId] = state.session.serialize();
  }
  return {
    version: 1,
    updatedAt: Date.now(),
    stats: state.stats,
    career: state.career,
    achievements: state.achievements,
    daily: state.daily,
    login: state.login,
    sessions,
    settings: state.settings,
    coins: state.coins,
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
          `${def.title} · награда ${def.reward} монет — заберите в разделе «Испытание»`,
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

function maybeInterstitial(wasWon: boolean): void {
  if (!wasWon || !platform.available) return;
  const now = Date.now();
  if (now - lastInterstitial < 120_000) return;
  lastInterstitial = now;
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

const defaults = createDefaultProfile();

export const useGameStore = create<AppState>((set, get) => ({
  hydrated: false,
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

  async init() {
    if (get().hydrated) return;
    await platform.init();
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
      stats: profile.stats,
      career: profile.career,
      achievements: profile.achievements,
      daily,
      login,
      sessions: profile.sessions,
      settings: profile.settings,
      coins: profile.coins,
      screen: 'menu',
    });
    syncAchievements((partial) => set(partial), get);
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
    maybeInterstitial(wasWon);
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
    if (session.hintsUsed >= FREE_HINTS && platform.available) {
      session.pause();
      set({ busy: true });
      const rewarded = await platform.showRewarded();
      set({ busy: false });
      if (get().session !== session) return;
      if (!rewarded) {
        session.resume();
        get().showToast('Посмотрите короткое видео, чтобы получить дополнительную подсказку.');
        return;
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
        coins: get().coins + def.reward,
        notifications: pushNotifications(get().notifications, [
          notification('reward', 'Награда получена', `+${def.reward} монет за «${def.title}»`, '✦'),
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
        coins: get().coins + result.coins,
        notifications: pushNotifications(get().notifications, [
          notification('reward', 'Ежедневная награда', `+${result.coins} монет за вход в клуб`, '☀'),
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
    const settings = { ...get().settings, ...partial };
    set({ settings });
    sound.setEnabled(settings.sounds);
    if (partial.sounds) sound.play('click');
    queueSave(get);
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
