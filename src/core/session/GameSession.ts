import { cloneState } from '../cards/Pile';
import type { GameModule, GameMoveBase, GameStateBase, Hint, NewGameOptions } from '../games/types';

export interface StoredSession {
  gameId: GameStateBase['gameId'];
  state: unknown;
  undo: unknown[];
  elapsedMs: number;
  resultRecorded: boolean;
  hintsUsed: number;
  savedAt: number;
}

const MAX_UNDO = 40;

/**
 * Одна активная партия: состояние, история отмен, таймер и подсказки.
 * Класс не зависит от React и Phaser.
 */
export class GameSession<S extends GameStateBase = any, M extends GameMoveBase = any> {
  readonly module: GameModule<S, M>;
  state: S;
  undoStack: S[] = [];
  hintsUsed = 0;
  resultRecorded = false;
  private elapsedBase: number;
  private runningSince: number | null;

  constructor(
    module: GameModule<S, M>,
    state: S,
    options: {
      undo?: S[];
      elapsedMs?: number;
      resultRecorded?: boolean;
      hintsUsed?: number;
      startTimer?: boolean;
    } = {},
  ) {
    this.module = module;
    this.state = state;
    this.undoStack = (options.undo ?? []).slice(-MAX_UNDO);
    this.elapsedBase = Math.max(0, options.elapsedMs ?? 0);
    this.resultRecorded = options.resultRecorded ?? false;
    this.hintsUsed = Math.max(0, options.hintsUsed ?? 0);
    this.runningSince =
      options.startTimer !== false && !state.won ? Date.now() : null;
  }

  static create(module: GameModule<any, any>, options: NewGameOptions = {}): GameSession {
    return new GameSession(module, module.createGame(options));
  }

  static restore(
    module: GameModule<any, any>,
    snapshot: StoredSession,
  ): GameSession | null {
    if (!module.isValidState(snapshot.state)) return null;
    const undo = Array.isArray(snapshot.undo)
      ? snapshot.undo.filter((s) => module.isValidState(s)).slice(-MAX_UNDO)
      : [];
    return new GameSession(module, snapshot.state, {
      undo,
      elapsedMs: Number.isFinite(snapshot.elapsedMs) ? snapshot.elapsedMs : 0,
      resultRecorded: !!snapshot.resultRecorded,
      hintsUsed: Number.isFinite(snapshot.hintsUsed) ? snapshot.hintsUsed : 0,
    });
  }

  get gameId() {
    return this.module.id;
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get elapsedMs() {
    const live = this.runningSince === null ? 0 : Math.max(0, Date.now() - this.runningSince);
    return this.elapsedBase + live;
  }

  get isRunning() {
    return this.runningSince !== null;
  }

  get won() {
    return this.state.won;
  }

  private stopTimerAtWin(): void {
    if (this.state.won && this.runningSince !== null) {
      this.elapsedBase = this.elapsedMs;
      this.runningSince = null;
    }
  }

  pause(): void {
    if (this.runningSince !== null) {
      this.elapsedBase = this.elapsedMs;
      this.runningSince = null;
    }
  }

  resume(): void {
    if (!this.state.won && this.runningSince === null) {
      this.runningSince = Date.now();
    }
  }

  /**
   * Применяет цепочку ходов как одно действие. Либо все ходы валидны,
   * либо состояние не меняется вовсе.
   */
  applyMoves(moves: M[], options: { recordUndo?: boolean } = {}): void {
    if (!moves.length) return;
    const before = this.state;
    let draft: S = before;
    for (const move of moves) {
      draft = this.module.applyMove(draft, move);
    }
    if (options.recordUndo !== false) {
      this.undoStack.push(before);
      if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    }
    this.state = draft;
    this.stopTimerAtWin();
  }

  perform(move: M): void {
    this.applyMoves([move]);
  }

  undo(): boolean {
    const previous = this.undoStack.pop();
    if (!previous) return false;
    const wasWon = this.state.won;
    this.state = previous;
    if (wasWon && !this.state.won) this.resume();
    return true;
  }

  hint(): Hint<M> | null {
    return this.module.hint(this.state);
  }

  /** Возвращает число применённых автоматических ходов. */
  autoCollect(limit = 60): number {
    if (this.state.won) return 0;
    const before = this.state;
    let draft: S = before;
    let applied = 0;
    for (let i = 0; i < limit; i++) {
      const auto = this.module.autoMoves(draft);
      if (!auto.length) break;
      try {
        draft = this.module.applyMove(draft, auto[0]);
        applied++;
      } catch {
        break;
      }
    }
    if (applied > 0) {
      this.undoStack.push(before);
      if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
      this.state = draft;
      this.stopTimerAtWin();
    }
    return applied;
  }

  markResultRecorded(): void {
    this.resultRecorded = true;
  }

  serialize(): StoredSession {
    // Снимок делаем через cloneState, чтобы сохранение не могло изменить игру.
    return {
      gameId: this.module.id,
      state: cloneState(this.state),
      undo: this.undoStack.slice(-MAX_UNDO).map((s) => cloneState(s)),
      elapsedMs: Math.round(this.elapsedMs),
      resultRecorded: this.resultRecorded,
      hintsUsed: this.hintsUsed,
      savedAt: Date.now(),
    };
  }
}

export type AnyGameSession = GameSession<any, any>;
