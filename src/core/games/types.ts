import type { CardId } from '../cards/Card';

export type GameId = 'klondike' | 'spider' | 'freecell' | 'pyramid';

export const GAME_IDS: readonly GameId[] = ['klondike', 'spider', 'freecell', 'pyramid'];

export const GAME_TITLES: Record<GameId, string> = {
  klondike: 'Косынка',
  spider: 'Паук',
  freecell: 'Свободная ячейка',
  pyramid: 'Пирамида',
};

export const GAME_ICONS: Record<GameId, string> = {
  klondike: '♠',
  spider: '🕷',
  freecell: '♣',
  pyramid: '▲',
};

export interface GameStateBase {
  readonly gameId: GameId;
  readonly seed: string;
  moves: number;
  score: number;
  won: boolean;
  createdAt: number;
}

export interface GameMoveBase {
  readonly type: string;
}

export interface HintTarget {
  zone: string;
  index?: number;
}

export interface Hint<M extends GameMoveBase = GameMoveBase> {
  move: M;
  /** Карты, которые нужно подсветить как источник. */
  cards: CardId[];
  /** Зона назначения для мягкой подсветки. */
  target?: HintTarget;
  text: string;
}

export interface NewGameOptions {
  seed?: string;
  /** Количество карт, открываемых из колоды за раз (Косынка). */
  drawCount?: 1 | 3;
  /** Число мастей в Пауке: 1, 2 или 4. */
  suitCount?: 1 | 2 | 4;
}

export interface GameModule<S extends GameStateBase, M extends GameMoveBase> {
  readonly id: GameId;
  readonly title: string;
  readonly description: string;
  readonly rules: readonly string[];
  createGame(options: NewGameOptions): S;
  /** Бросает Error, если ход недопустим. Возвращает НОВОЕ состояние. */
  applyMove(state: S, move: M): S;
  /** Все допустимые ходы в данный момент (без гарантии выигрыша). */
  legalMoves(state: S): M[];
  hint(state: S): Hint<M> | null;
  /** Ходы, которые можно безопасно выполнить автоматически (автосборка). */
  autoMoves(state: S): M[];
  isWon(state: S): boolean;
  /** Больше нет полезных ходов (для экрана «тупик»). */
  isStuck(state: S): boolean;
  isValidState(raw: unknown): raw is S;
  /** Человеческое описание хода для журнала/подсказки. */
  describeMove?(state: S, move: M): string;
}

/** Отметка источника/цели — только для отображения и подсказок. */
export interface PileLocation {
  zone: string;
  index?: number;
}
