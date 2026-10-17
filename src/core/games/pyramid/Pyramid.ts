import { cardLabel, RANK_LABEL, SUITS, type Card, type CardId } from '../../cards/Card';
import { buildDeck } from '../../cards/Deck';
import { cloneState, type PlacedCard } from '../../cards/Pile';
import { createRng, randomSeed, shuffleInPlace } from '../../cards/Shuffle';
import type { GameModule, GameStateBase, Hint, NewGameOptions } from '../types';

export type PyramidRef =
  | { zone: 'pyramid'; row: number; col: number }
  | { zone: 'waste' };

export type PyramidMove =
  | { type: 'remove'; a: PyramidRef; b?: PyramidRef }
  | { type: 'draw' }
  | { type: 'recycle' };

export interface PyramidState extends GameStateBase {
  gameId: 'pyramid';
  /** 7 рядов; в ряду row находится row + 1 карта. */
  pyramid: PlacedCard[][];
  removed: boolean[][];
  stock: PlacedCard[];
  waste: PlacedCard[];
  /** Убранные из сброса карты: хранятся, чтобы проверять целостность колоды. */
  discard: PlacedCard[];
  cycles: number;
}

const ROWS = 7;
const PYRAMID_CARDS = 28;

function createEmpty(seed: string): PyramidState {
  return {
    gameId: 'pyramid',
    seed,
    pyramid: Array.from({ length: ROWS }, (_, row) =>
      Array.from({ length: row + 1 }, () => ({ card: { id: '', suit: 'spades', rank: 1, copy: 0 }, faceUp: true })),
    ),
    removed: Array.from({ length: ROWS }, (_, row) =>
      Array.from({ length: row + 1 }, () => false),
    ),
    stock: [],
    waste: [],
    discard: [],
    moves: 0,
    score: 0,
    won: false,
    createdAt: Date.now(),
    cycles: 0,
  };
}

export function createPyramidGame(options: NewGameOptions = {}): PyramidState {
  const seed = options.seed ?? randomSeed();
  const state = createEmpty(seed);
  const deck = shuffleInPlace(buildDeck(), createRng(seed));
  let cursor = 0;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col <= row; col++) {
      state.pyramid[row][col] = { card: deck[cursor++], faceUp: true };
    }
  }
  for (; cursor < deck.length; cursor++) {
    state.stock.push({ card: deck[cursor], faceUp: false });
  }
  return state;
}

export function pyramidCardAt(state: PyramidState, row: number, col: number): Card | null {
  if (row < 0 || row >= ROWS || col < 0 || col > row) return null;
  if (state.removed[row][col]) return null;
  return state.pyramid[row][col]?.card ?? null;
}

/** Карта открыта, если обе карты следующего ряда, накрывающие её, убраны. */
export function isPyramidCardAvailable(
  state: PyramidState,
  row: number,
  col: number,
): boolean {
  if (row < 0 || row >= ROWS || col < 0 || col > row) return false;
  if (state.removed[row][col]) return false;
  const belowLeftRemoved = row + 1 >= ROWS || state.removed[row + 1][col];
  const belowRightRemoved = row + 1 >= ROWS || state.removed[row + 1][col + 1];
  return belowLeftRemoved && belowRightRemoved;
}

export function availablePyramidRefs(state: PyramidState): PyramidRef[] {
  const refs: PyramidRef[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col <= row; col++) {
      if (isPyramidCardAvailable(state, row, col)) refs.push({ zone: 'pyramid', row, col });
    }
  }
  return refs;
}

export function cardAtRef(state: PyramidState, ref: PyramidRef): Card | null {
  if (ref.zone === 'waste') return state.waste[state.waste.length - 1]?.card ?? null;
  return pyramidCardAt(state, ref.row, ref.col);
}

function isRefAvailable(state: PyramidState, ref: PyramidRef): boolean {
  if (ref.zone === 'waste') return state.waste.length > 0;
  return isPyramidCardAvailable(state, ref.row, ref.col);
}

function sameRef(a: PyramidRef, b: PyramidRef): boolean {
  return (
    (a.zone === 'waste' && b.zone === 'waste') ||
    (a.zone === 'pyramid' &&
      b.zone === 'pyramid' &&
      a.row === b.row &&
      a.col === b.col)
  );
}

function validateMove(state: PyramidState, move: PyramidMove): void {
  if (move.type === 'draw') {
    if (state.stock.length === 0) throw new Error('Колода пуста');
    return;
  }
  if (move.type === 'recycle') {
    if (state.stock.length > 0) throw new Error('Сначала используйте колоду');
    if (state.waste.length === 0) throw new Error('Сброс пуст');
    return;
  }
  if (move.type !== 'remove') throw new Error('Неизвестный ход');
  const { a, b } = move;
  if (!isRefAvailable(state, a)) throw new Error('Карта недоступна');
  const cardA = cardAtRef(state, a);
  if (!cardA) throw new Error('Карта недоступна');
  if (!b) {
    if (cardA.rank !== 13) throw new Error('Без пары можно убрать только короля');
    return;
  }
  if (a.zone === 'waste' && b.zone === 'waste') {
    throw new Error('Нельзя убрать две карты из сброса');
  }
  if (sameRef(a, b)) throw new Error('Нужно выбрать две разные карты');
  if (!isRefAvailable(state, b)) throw new Error('Вторая карта недоступна');
  const cardB = cardAtRef(state, b);
  if (!cardB) throw new Error('Вторая карта недоступна');
  if (cardA.rank + cardB.rank !== 13) {
    throw new Error('Сумма карт должна быть равна 13');
  }
}

function allPyramidRemoved(state: PyramidState): boolean {
  return state.removed.every((row) => row.every(Boolean));
}

function scoreState(state: PyramidState): number {
  let removed = 0;
  for (const row of state.removed) for (const flag of row) if (flag) removed++;
  return removed * 10 + (removed === PYRAMID_CARDS ? 100 : 0);
}

function removeRef(state: PyramidState, ref: PyramidRef): void {
  if (ref.zone === 'pyramid') {
    state.removed[ref.row][ref.col] = true;
  } else {
    const item = state.waste.pop();
    if (item) state.discard.push(item);
  }
}

export function applyPyramidMove(state: PyramidState, move: PyramidMove): PyramidState {
  validateMove(state, move);
  const next = cloneState(state);
  next.moves += 1;

  if (move.type === 'draw') {
    const item = next.stock.pop();
    if (item) {
      item.faceUp = true;
      next.waste.push(item);
    }
    next.score = scoreState(next);
    return next;
  }
  if (move.type === 'recycle') {
    next.stock = next.waste
      .slice()
      .reverse()
      .map((c) => ({ ...c, faceUp: false }));
    next.waste = [];
    next.cycles += 1;
    next.score = scoreState(next);
    return next;
  }

  removeRef(next, move.a);
  if (move.b) removeRef(next, move.b);
  next.won = allPyramidRemoved(next);
  next.score = scoreState(next);
  return next;
}

export function hasAnyPyramidPair(cards: readonly Card[], target = 13): boolean {
  const seen = new Set<number>();
  for (const card of cards) {
    if (seen.has(target - card.rank)) return true;
    seen.add(card.rank);
  }
  return false;
}

export function legalPyramidMoves(state: PyramidState): PyramidMove[] {
  const moves: PyramidMove[] = [];
  if (allPyramidRemoved(state)) return moves;
  const refs = availablePyramidRefs(state);
  for (const ref of refs) {
    const card = cardAtRef(state, ref);
    if (card?.rank === 13) moves.push({ type: 'remove', a: ref });
  }
  const wasteTop = state.waste[state.waste.length - 1];
  if (wasteTop) {
    if (wasteTop.card.rank === 13) moves.push({ type: 'remove', a: { zone: 'waste' } });
    for (const ref of refs) {
      const card = cardAtRef(state, ref);
      if (card && card.rank + wasteTop.card.rank === 13) {
        moves.push({ type: 'remove', a: ref, b: { zone: 'waste' } });
      }
    }
  }
  for (let i = 0; i < refs.length; i++) {
    const a = refs[i];
    const cardA = cardAtRef(state, a);
    if (!cardA) continue;
    for (let j = i + 1; j < refs.length; j++) {
      const b = refs[j];
      const cardB = cardAtRef(state, b);
      if (cardB && cardA.rank + cardB.rank === 13) {
        moves.push({ type: 'remove', a, b });
      }
    }
  }
  if (state.stock.length > 0) moves.push({ type: 'draw' });
  else if (state.waste.length > 0) moves.push({ type: 'recycle' });
  return moves;
}

function refCards(state: PyramidState, ref: PyramidRef): CardId[] {
  const card = cardAtRef(state, ref);
  return card ? [card.id] : [];
}

function priority(state: PyramidState, move: PyramidMove): number {
  if (move.type === 'remove') {
    if (!move.b) return 100;
    // Карты из нижних рядов держат верхние: убирая их, мы открываем больше карт.
    const rows = [move.a, move.b]
      .filter((r): r is Extract<PyramidRef, { zone: 'pyramid' }> => r.zone === 'pyramid')
      .map((r) => r.row);
    const depth = rows.length ? Math.max(...rows) : 0;
    return 50 + depth * 5 + (rows.length === 2 ? 5 : 0);
  }
  if (move.type === 'draw') return 10;
  return 5;
}

function hintText(state: PyramidState, move: PyramidMove): string {
  if (move.type === 'draw') return 'Откройте карту из колоды';
  if (move.type === 'recycle') return 'Переверните сброс и продолжите перебор';
  const a = cardAtRef(state, move.a);
  if (!a) return 'Есть допустимый ход';
  if (!move.b) return `Уберите ${cardLabel(a)} отдельно — это король`;
  const b = cardAtRef(state, move.b);
  return b
    ? `Уберите пару ${cardLabel(a)} + ${cardLabel(b)} (сумма 13)`
    : 'Уберите пару, дающую 13';
}

export const pyramidModule: GameModule<PyramidState, PyramidMove> = {
  id: 'pyramid',
  title: 'Пирамида',
  description: 'Убирайте пары карт, дающие в сумме 13, и разберите всю пирамиду.',
  rules: [
    'Пирамида состоит из 28 карт в семи рядах.',
    'Убирать можно только открытые карты, не перекрытые картами нижнего ряда.',
    'Пара карт должна давать в сумме 13. Король (13) убирается один.',
    'Номиналы: туз — 1, валет — 11, дама — 12, король — 13.',
    'С верхней картой сброса можно составить пару с доступной картой пирамиды.',
    'Колода открывается по одной карте в сброс. С верхней картой сброса можно составить пару.',
    'Когда колода пуста, сброс переворачивается и снова становится колодой — число кругов не ограничено.',
    'Победа — когда убраны все 28 карт пирамиды. Оставшиеся карты колоды не мешают победе.',
  ],
  createGame: createPyramidGame,
  applyMove: applyPyramidMove,
  legalMoves: legalPyramidMoves,
  hint(state) {
    if (allPyramidRemoved(state)) return null;
    const moves = legalPyramidMoves(state);
    if (!moves.length) return null;
    const move = [...moves].sort((a, b) => priority(state, b) - priority(state, a))[0];
    const cards: CardId[] = [];
    if (move.type === 'remove') {
      cards.push(...refCards(state, move.a));
      if (move.b) cards.push(...refCards(state, move.b));
    } else if (move.type === 'draw') {
      const top = state.stock[state.stock.length - 1];
      if (top) cards.push(top.card.id);
    }
    return {
      move,
      cards,
      target: undefined,
      text: hintText(state, move),
    };
  },
  autoMoves() {
    return [];
  },
  isWon(state) {
    return state.removed.every((row) => row.every(Boolean));
  },
  isStuck(state) {
    if (allPyramidRemoved(state)) return false;
    if (state.stock.length > 0) return false;
    if (legalPyramidMoves(state).some((m) => m.type === 'remove')) return false;
    if (state.waste.length === 0) return true;
    // Сброс можно переворачивать: проверяем, есть ли среди его карт полезная.
    const available = availablePyramidRefs(state)
      .map((r) => cardAtRef(state, r))
      .filter((c): c is Card => !!c);
    return !state.waste.some(
      (item) => item.card.rank === 13 || available.some((c) => c.rank + item.card.rank === 13),
    );
  },
  isValidState(raw): raw is PyramidState {
    if (!raw || typeof raw !== 'object') return false;
    const s = raw as Partial<PyramidState>;
    if (s.gameId !== 'pyramid') return false;
    if (!Array.isArray(s.pyramid) || s.pyramid.length !== ROWS) return false;
    if (!Array.isArray(s.removed) || s.removed.length !== ROWS) return false;
    if (!Array.isArray(s.stock) || !Array.isArray(s.waste)) return false;
    if (!Array.isArray(s.discard)) return false;
    if (typeof s.moves !== 'number' || typeof s.score !== 'number' || typeof s.won !== 'boolean') {
      return false;
    }
    if (typeof s.cycles !== 'number' || s.cycles < 0) return false;
    const ids = new Set<string>();
    let total = 0;
    const add = (card: unknown): boolean => {
      if (!card || typeof card !== 'object') return false;
      const c = card as Card;
      if (
        typeof c.id !== 'string' ||
        typeof c.suit !== 'string' ||
        !SUITS.includes(c.suit) ||
        !Number.isInteger(c.rank) ||
        c.rank < 1 ||
        c.rank > 13
      ) {
        return false;
      }
      if (ids.has(c.id)) return false;
      ids.add(c.id);
      total++;
      return true;
    };
    for (let row = 0; row < ROWS; row++) {
      if (!Array.isArray(s.pyramid[row]) || s.pyramid[row].length !== row + 1) return false;
      if (!Array.isArray(s.removed[row]) || s.removed[row].length !== row + 1) return false;
      for (let col = 0; col <= row; col++) {
        const cell = s.pyramid[row][col];
        if (!cell || typeof cell.card !== 'object' || !add(cell.card)) return false;
        if (typeof cell.faceUp !== 'boolean') return false;
        if (typeof s.removed[row][col] !== 'boolean') return false;
      }
    }
    for (const item of s.stock) {
      if (!item || typeof item !== 'object' || !add(item.card)) return false;
    }
    for (const item of s.waste) {
      if (!item || typeof item !== 'object' || !add(item.card)) return false;
    }
    for (const item of s.discard) {
      if (!item || typeof item !== 'object' || !add(item.card)) return false;
    }
    return total === 52;
  },
};

export function pyramidAvailableCards(state: PyramidState): Card[] {
  return availablePyramidRefs(state)
    .map((r) => cardAtRef(state, r))
    .filter((c): c is Card => !!c);
}

export function pyramidRefEquals(a: PyramidRef, b: PyramidRef): boolean {
  return sameRef(a, b);
}
