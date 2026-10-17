import { cardLabel, SUITS, type Card, type CardId, type Suit } from '../../cards/Card';
import { buildSpiderDeck, type SpiderSuitCount } from '../../cards/Deck';
import { canStackDescendingSameSuit } from '../../cards/CardRules';
import { cloneState, isCardLike, type PlacedCard } from '../../cards/Pile';
import { createRng, randomSeed, shuffleInPlace } from '../../cards/Shuffle';
import type { GameModule, GameStateBase, Hint, NewGameOptions } from '../types';

export interface SpiderState extends GameStateBase {
  gameId: 'spider';
  suitCount: SpiderSuitCount;
  columns: PlacedCard[][];
  stock: PlacedCard[];
  completed: Card[][];
}

export type SpiderMove =
  | { type: 'move'; from: number; to: number; count: number }
  | { type: 'deal' };

const COLUMNS = 10;
const COMPLETE_COUNT = 8;

function createEmpty(seed: string, suitCount: SpiderSuitCount): SpiderState {
  return {
    gameId: 'spider',
    seed,
    suitCount,
    columns: Array.from({ length: COLUMNS }, () => []),
    stock: [],
    completed: [],
    moves: 0,
    score: 500,
    won: false,
    createdAt: Date.now(),
  };
}

export function createSpiderGame(options: NewGameOptions = {}): SpiderState {
  const seed = options.seed ?? randomSeed();
  const suitCount: SpiderSuitCount =
    options.suitCount === 4 ? 4 : options.suitCount === 2 ? 2 : 1;
  const state = createEmpty(seed, suitCount);
  const deck = shuffleInPlace(buildSpiderDeck(suitCount), createRng(seed));

  let cursor = 0;
  for (let col = 0; col < COLUMNS; col++) {
    const count = col < 4 ? 6 : 5;
    for (let i = 0; i < count; i++) {
      state.columns[col].push({ card: deck[cursor++], faceUp: i === count - 1 });
    }
  }
  for (; cursor < deck.length; cursor++) {
    state.stock.push({ card: deck[cursor], faceUp: false });
  }
  return state;
}

function validateMove(state: SpiderState, move: SpiderMove): void {
  if (move.type === 'deal') {
    if (state.stock.length < COLUMNS) throw new Error('В колоде недостаточно карт для раздачи');
    if (state.columns.some((col) => col.length === 0)) {
      throw new Error('Нельзя раздавать при пустом столбце');
    }
    return;
  }
  if (move.type !== 'move') throw new Error('Неизвестный ход');
  if (
    !Number.isInteger(move.from) ||
    !Number.isInteger(move.to) ||
    !Number.isInteger(move.count)
  ) {
    throw new Error('Некорректный ход');
  }
  if (move.from < 0 || move.from >= COLUMNS || move.to < 0 || move.to >= COLUMNS) {
    throw new Error('Неверный столбец');
  }
  if (move.from === move.to) throw new Error('Карты уже в этом столбце');
  const source = state.columns[move.from];
  if (move.count < 1 || move.count > source.length) throw new Error('Неверное количество карт');
  const selected = source.slice(source.length - move.count);
  if (selected.some((c) => !c.faceUp)) throw new Error('Можно брать только открытые карты');
  if (move.count > 1) {
    for (let i = 1; i < selected.length; i++) {
      if (!canStackDescendingSameSuit(selected[i].card, selected[i - 1].card)) {
        throw new Error('Переносить вместе можно только последовательность одной масти');
      }
    }
  }
  const dest = state.columns[move.to];
  const target = dest[dest.length - 1];
  const first = selected[0].card;
  if (target) {
    if (!target.faceUp) throw new Error('Верхняя карта столбца закрыта');
    if (target.card.rank !== first.rank + 1) {
      throw new Error('Карту можно положить только на номинал на единицу старше');
    }
  }
}

function removeCompletedSequences(state: SpiderState): number {
  let removed = 0;
  let repeat = true;
  while (repeat) {
    repeat = false;
    for (let col = 0; col < state.columns.length; col++) {
      const pile = state.columns[col];
      if (pile.length < 13) continue;
      const segment = pile.slice(-13);
      const sameSuit = segment.every((c) => c.card.suit === segment[0].card.suit);
      const descending = segment.every((c, i) => c.card.rank === 13 - i);
      if (!sameSuit || !descending) continue;
      const cards = segment.map((c) => ({ ...c.card }));
      pile.splice(-13, 13);
      state.completed.push(cards);
      const top = pile[pile.length - 1];
      if (top && !top.faceUp) top.faceUp = true;
      state.score += 100;
      removed++;
      repeat = true;
      break;
    }
  }
  return removed;
}

function hasTurns(state: SpiderState): boolean {
  return state.stock.length >= COLUMNS && state.columns.every((c) => c.length > 0);
}

export function applySpiderMove(state: SpiderState, move: SpiderMove): SpiderState {
  validateMove(state, move);
  const next = cloneState(state);
  next.moves += 1;
  next.score = Math.max(0, next.score - 1);

  if (move.type === 'deal') {
    for (let col = 0; col < COLUMNS; col++) {
      const card = next.stock.pop();
      if (!card) break;
      card.faceUp = true;
      next.columns[col].push(card);
    }
    removeCompletedSequences(next);
    if (next.completed.length === COMPLETE_COUNT) {
      next.won = true;
      next.score += 100;
    }
    return next;
  }

  const source = next.columns[move.from];
  const moved = source.splice(source.length - move.count, move.count);
  next.columns[move.to].push(...moved);
  const exposed = source[source.length - 1];
  if (exposed && !exposed.faceUp) exposed.faceUp = true;
  removeCompletedSequences(next);
  next.score = Math.max(0, next.score);
  if (next.completed.length === COMPLETE_COUNT) {
    next.won = true;
    next.score += 100;
  }
  return next;
}

function movableRunLength(column: PlacedCard[]): number {
  let length = 0;
  for (let i = column.length - 1; i >= 0; i--) {
    if (!column[i].faceUp) break;
    if (i < column.length - 1) {
      if (!canStackDescendingSameSuit(column[i + 1].card, column[i].card)) break;
    }
    length++;
  }
  return length;
}

export function legalSpiderMoves(state: SpiderState): SpiderMove[] {
  const moves: SpiderMove[] = [];
  for (let from = 0; from < COLUMNS; from++) {
    const source = state.columns[from];
    const maxCount = movableRunLength(source);
    for (let count = 1; count <= maxCount; count++) {
      const first = source[source.length - count].card;
      for (let to = 0; to < COLUMNS; to++) {
        if (to === from) continue;
        const dest = state.columns[to];
        const target = dest[dest.length - 1];
        if (!target || (target.faceUp && target.card.rank === first.rank + 1)) {
          moves.push({ type: 'move', from, to, count });
        }
      }
    }
  }
  if (hasTurns(state)) moves.push({ type: 'deal' });
  return moves;
}

function exposesFaceDown(state: SpiderState, move: SpiderMove): boolean {
  if (move.type !== 'move') return false;
  const pile = state.columns[move.from];
  const firstMoved = pile.length - move.count;
  return firstMoved > 0 && !pile[firstMoved - 1].faceUp;
}

function sameSuitRun(state: SpiderState, move: SpiderMove): boolean {
  if (move.type !== 'move' || move.count < 1) return false;
  const pile = state.columns[move.from];
  const selected = pile.slice(pile.length - move.count);
  return selected.every((c) => c.card.suit === selected[0].card.suit);
}

function priority(state: SpiderState, move: SpiderMove): number {
  if (move.type === 'deal') return 15;
  let score = 20;
  if (exposesFaceDown(state, move)) score += 100;
  if (sameSuitRun(state, move)) score += 60;
  if (move.count > 1) score += 10;
  const source = state.columns[move.from];
  if (source.length === move.count) score += 30;
  return score;
}

function hintText(state: SpiderState, move: SpiderMove): string {
  if (move.type === 'deal') return 'Раздайте новый ряд из колоды';
  const source = state.columns[move.from];
  const moved = source[source.length - move.count].card;
  const target = state.columns[move.to][state.columns[move.to].length - 1]?.card;
  return target
    ? `Переложите ${cardLabel(moved)} на ${cardLabel(target)}`
    : `Переложите ${cardLabel(moved)} в пустой столбец`;
}

export const spiderModule: GameModule<SpiderState, SpiderMove> = {
  id: 'spider',
  title: 'Паук',
  description: 'Соберите восемь полных последовательностей от короля до туза.',
  rules: [
    'На поле 10 столбцов и 104 карты. В колоде 5 дополнительных раздач по 10 карт.',
    'Класть карту можно на карту на единицу старше, масть при этом не важна.',
    'Переносить вместе можно только последовательность одной масти по убыванию.',
    'Полная последовательность от короля до туза автоматически убирается.',
    'Раздача запрещена, если хотя бы один столбец пуст.',
  ],
  createGame: createSpiderGame,
  applyMove: applySpiderMove,
  legalMoves: legalSpiderMoves,
  hint(state) {
    const moves = legalSpiderMoves(state);
    if (!moves.length) return null;
    const move = [...moves].sort((a, b) => priority(state, b) - priority(state, a))[0];
    let cards: CardId[] = [];
    if (move.type === 'move') {
      const pile = state.columns[move.from];
      cards = pile.slice(pile.length - move.count).map((c) => c.card.id);
    }
    return {
      move,
      cards,
      target:
        move.type === 'move' ? { zone: 'spider-column', index: move.to } : { zone: 'spider-stock' },
      text: hintText(state, move),
    };
  },
  autoMoves() {
    return [];
  },
  isWon(state) {
    return state.completed.length === COMPLETE_COUNT;
  },
  isStuck(state) {
    if (state.completed.length === COMPLETE_COUNT) return false;
    const moves = legalSpiderMoves(state);
    return moves.length === 0;
  },
  isValidState(raw): raw is SpiderState {
    if (!raw || typeof raw !== 'object') return false;
    const s = raw as Partial<SpiderState>;
    if (s.gameId !== 'spider') return false;
    if (s.suitCount !== 1 && s.suitCount !== 2 && s.suitCount !== 4) return false;
    if (!Array.isArray(s.columns) || s.columns.length !== COLUMNS) return false;
    if (!Array.isArray(s.stock) || !Array.isArray(s.completed)) return false;
    if (s.completed.length > COMPLETE_COUNT) return false;
    if (typeof s.moves !== 'number' || typeof s.score !== 'number' || typeof s.won !== 'boolean') {
      return false;
    }
    const ids = new Set<string>();
    let total = 0;
    const addCard = (card: unknown): boolean => {
      if (!isCardLike(card)) return false;
      if (!SUITS.includes(card.suit)) return false;
      if (ids.has(card.id)) return false;
      ids.add(card.id);
      total++;
      return true;
    };
    for (const pile of s.columns) {
      if (!Array.isArray(pile)) return false;
      for (const item of pile) {
        if (!item || typeof item !== 'object') return false;
        const pc = item as PlacedCard;
        if (typeof pc.faceUp !== 'boolean' || !addCard(pc.card)) return false;
      }
    }
    for (const item of s.stock) {
      if (!item || typeof item !== 'object') return false;
      const pc = item as PlacedCard;
      if (typeof pc.faceUp !== 'boolean' || !addCard(pc.card)) return false;
    }
    for (const run of s.completed) {
      if (!Array.isArray(run) || run.length !== 13) return false;
      const suit = (run[0] as Card | undefined)?.suit;
      for (let i = 0; i < run.length; i++) {
        const card = run[i] as Card;
        if (!addCard(card)) return false;
        const checked = card as Card;
        if (checked.suit !== suit || checked.rank !== 13 - i) return false;
      }
    }
    return total === 104;
  },
};

export function spiderSuitLabel(suitCount: SpiderSuitCount): string {
  if (suitCount === 1) return '1 масть · легко';
  if (suitCount === 2) return '2 масти · средне';
  return '4 масти · сложно';
}

export function spiderCompletedSuits(state: SpiderState): Suit[] {
  return state.completed.map((run) => run[0].suit);
}
