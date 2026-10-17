import {
  cardLabel,
  isOppositeColor,
  SUITS,
  type Card,
  type CardId,
} from '../../cards/Card';
import { buildDeck } from '../../cards/Deck';
import { canPlaceOnFoundation } from '../../cards/CardRules';
import { cloneState, type PlacedCard } from '../../cards/Pile';
import { createRng, randomSeed, shuffleInPlace } from '../../cards/Shuffle';
import type { GameModule, GameStateBase, Hint, NewGameOptions } from '../types';

export type KlondikeZone = 'tableau' | 'waste' | 'foundation';

export interface KlondikeLocation {
  zone: KlondikeZone;
  index?: number;
}

export type KlondikeMove =
  | { type: 'draw' }
  | { type: 'recycle' }
  | {
      type: 'move';
      from: KlondikeLocation;
      to: KlondikeLocation;
      count: number;
    };

export interface KlondikeState extends GameStateBase {
  gameId: 'klondike';
  drawCount: 1 | 3;
  tableau: PlacedCard[][];
  stock: PlacedCard[];
  waste: PlacedCard[];
  foundations: PlacedCard[][];
  stockPasses: number;
}

const TABLEAU_COUNT = 7;
const FOUNDATION_COUNT = 4;

function emptyState(seed: string, drawCount: 1 | 3): KlondikeState {
  return {
    gameId: 'klondike',
    seed,
    drawCount,
    moves: 0,
    score: 0,
    won: false,
    createdAt: Date.now(),
    tableau: Array.from({ length: TABLEAU_COUNT }, () => []),
    stock: [],
    waste: [],
    foundations: Array.from({ length: FOUNDATION_COUNT }, () => []),
    stockPasses: 0,
  };
}

export function createKlondikeGame(options: NewGameOptions = {}): KlondikeState {
  const seed = options.seed ?? randomSeed();
  const drawCount: 1 | 3 = options.drawCount === 3 ? 3 : 1;
  const state = emptyState(seed, drawCount);
  const deck = shuffleInPlace(buildDeck(), createRng(seed));

  let cursor = 0;
  for (let col = 0; col < TABLEAU_COUNT; col++) {
    for (let row = 0; row <= col; row++) {
      const card = deck[cursor++];
      const isTop = row === col;
      state.tableau[col].push({ card, faceUp: isTop });
    }
  }
  for (; cursor < deck.length; cursor++) {
    state.stock.push({ card: deck[cursor], faceUp: false });
  }
  return state;
}

function sourcePile(state: KlondikeState, loc: KlondikeLocation): PlacedCard[] {
  if (loc.zone === 'waste') return state.waste;
  if (loc.zone === 'foundation') {
    if (typeof loc.index !== 'number') throw new Error('Не указана базовая стопка');
    const pile = state.foundations[loc.index];
    if (!pile) throw new Error('Неверная базовая стопка');
    return pile;
  }
  if (loc.zone === 'tableau') {
    if (typeof loc.index !== 'number') throw new Error('Не указан столбец');
    const pile = state.tableau[loc.index];
    if (!pile) throw new Error('Неверный столбец');
    return pile;
  }
  throw new Error('Из колоды нельзя перемещать карты напрямую');
}

export function findFoundationIndex(state: KlondikeState, card: Card): number | null {
  for (let i = 0; i < state.foundations.length; i++) {
    const pile = state.foundations[i];
    const top = pile[pile.length - 1];
    if (top && canPlaceOnFoundation(card, top.card)) return i;
  }
  if (card.rank === 1) {
    const usedSuits = new Set(
      state.foundations.flatMap((pile) => (pile.length ? [pile[0].card.suit] : [])),
    );
    if (usedSuits.has(card.suit)) return null;
    for (let i = 0; i < state.foundations.length; i++) {
      if (state.foundations[i].length === 0) return i;
    }
  }
  return null;
}

function isRun(cards: readonly PlacedCard[]): boolean {
  for (let i = 1; i < cards.length; i++) {
    const prev = cards[i - 1];
    const cur = cards[i];
    if (!prev.faceUp || !cur.faceUp) return false;
    if (cur.card.rank !== prev.card.rank - 1) return false;
    if (!isOppositeColor(cur.card, prev.card)) return false;
  }
  return cards.every((c) => c.faceUp);
}

function validateMove(state: KlondikeState, move: KlondikeMove): void {
  if (move.type === 'draw') {
    if (state.stock.length === 0) throw new Error('Колода пуста');
    return;
  }
  if (move.type === 'recycle') {
    if (state.stock.length > 0) throw new Error('Сначала нужно использовать колоду');
    if (state.waste.length === 0) throw new Error('Сброс пуст');
    return;
  }
  if (move.type !== 'move') throw new Error('Неизвестный ход');

  const { from, to } = move;
  if (from.zone === 'foundation' && to.zone === 'foundation') {
    throw new Error('Нельзя перемещать между базовыми стопками');
  }
  if (!Number.isInteger(move.count) || move.count < 1) {
    throw new Error('Неверное количество карт');
  }
  const source = sourcePile(state, from);
  if (move.count > source.length) throw new Error('В стопке нет столько карт');
  const selected = source.slice(source.length - move.count);
  if (selected.some((c) => !c.faceUp)) throw new Error('Можно брать только открытые карты');
  if (from.zone !== 'tableau' && move.count !== 1) {
    throw new Error('Из этой стопки можно взять только одну карту');
  }
  if (from.zone === 'tableau' && to.zone === 'tableau' && from.index === to.index) {
    throw new Error('Карты уже в этом столбце');
  }
  if (move.count > 1 && !isRun(selected)) {
    throw new Error('Последовательность должна идти по убыванию с чередованием цветов');
  }

  if (to.zone === 'tableau') {
    if (typeof to.index !== 'number') throw new Error('Не указан столбец');
    const target = state.tableau[to.index];
    if (!target) throw new Error('Неверный столбец');
    const first = selected[0].card;
    const top = target[target.length - 1];
    if (!top) {
      if (first.rank !== 13) throw new Error('На пустой столбец можно положить только короля');
    } else {
      if (!top.faceUp) throw new Error('Верхняя карта столбца закрыта');
      if (top.card.rank !== first.rank + 1 || !isOppositeColor(first, top.card)) {
        throw new Error('Карта не подходит по рангу или цвету');
      }
    }
    return;
  }

  if (to.zone === 'foundation') {
    if (move.count !== 1) throw new Error('В базовую стопку можно положить только одну карту');
    if (typeof to.index !== 'number') throw new Error('Не указана базовая стопка');
    const pile = state.foundations[to.index];
    if (!pile) throw new Error('Неверная базовая стопка');
    const card = selected[0].card;
    const top = pile[pile.length - 1];
    if (!canPlaceOnFoundation(card, top?.card)) {
      throw new Error('Карта не продолжает базовую стопку');
    }
    if (!top) {
      for (let i = 0; i < state.foundations.length; i++) {
        if (i !== to.index && state.foundations[i].some((c) => c.card.suit === card.suit)) {
          throw new Error('Для этой масти уже есть базовая стопка');
        }
      }
    }
    return;
  }

  throw new Error('Нельзя переместить карты в колоду');
}

function allFoundationComplete(foundations: PlacedCard[][]): boolean {
  return foundations.length === 4 && foundations.every((pile) => pile.length === 13);
}

function checkWin(state: KlondikeState, previous: KlondikeState): void {
  if (!previous.won && allFoundationComplete(state.foundations)) {
    state.won = true;
    state.score += 100;
  }
}

export function applyKlondikeMove(state: KlondikeState, move: KlondikeMove): KlondikeState {
  validateMove(state, move);
  const next = cloneState(state);
  next.moves += 1;
  next.won = state.won;
  next.score = state.score;

  if (move.type === 'draw') {
    const count = Math.min(next.drawCount, next.stock.length);
    for (let i = 0; i < count; i++) {
      const card = next.stock.pop();
      if (!card) break;
      card.faceUp = true;
      next.waste.push(card);
    }
    next.score = next.score;
    checkWin(next, state);
    return next;
  }

  if (move.type === 'recycle') {
    next.stock = next.waste
      .slice()
      .reverse()
      .map((c) => ({ ...c, faceUp: false }));
    next.waste = [];
    next.stockPasses += 1;
    checkWin(next, state);
    return next;
  }

  const source = sourcePile(next, move.from);
  const moved = source.splice(source.length - move.count, move.count);
  for (const item of moved) item.faceUp = true;

  if (move.to.zone === 'tableau' && typeof move.to.index === 'number') {
    next.tableau[move.to.index].push(...moved);
  } else if (move.to.zone === 'foundation' && typeof move.to.index === 'number') {
    next.foundations[move.to.index].push(moved[0]);
  }

  if (move.to.zone === 'foundation') {
    next.score += 10;
  } else if (move.from.zone === 'waste' && move.to.zone === 'tableau') {
    next.score += 5;
  } else if (move.from.zone === 'foundation' && move.to.zone === 'tableau') {
    next.score -= 15;
  }

  if (move.from.zone === 'tableau' && typeof move.from.index === 'number') {
    const pile = next.tableau[move.from.index];
    const top = pile[pile.length - 1];
    if (top && !top.faceUp) {
      top.faceUp = true;
      next.score += 5;
    }
  }

  next.score = Math.max(0, next.score);
  checkWin(next, state);
  return next;
}

function makeMove(
  from: KlondikeLocation,
  to: KlondikeLocation,
  count: number,
): KlondikeMove {
  return { type: 'move', from, to, count };
}

/** Все ходы кроме перебора колоды. */
function cardMoves(state: KlondikeState): KlondikeMove[] {
  const moves: KlondikeMove[] = [];

  const wasteTop = state.waste[state.waste.length - 1];
  if (wasteTop) {
    const fi = findFoundationIndex(state, wasteTop.card);
    if (fi !== null) moves.push(makeMove({ zone: 'waste' }, { zone: 'foundation', index: fi }, 1));
    for (let col = 0; col < state.tableau.length; col++) {
      const target = state.tableau[col][state.tableau[col].length - 1];
      if (
        (!target && wasteTop.card.rank === 13) ||
        (target &&
          target.faceUp &&
          target.card.rank === wasteTop.card.rank + 1 &&
          isOppositeColor(wasteTop.card, target.card))
      ) {
        moves.push(makeMove({ zone: 'waste' }, { zone: 'tableau', index: col }, 1));
      }
    }
  }

  // Верхние карты столбцов.
  for (let col = 0; col < state.tableau.length; col++) {
    const pile = state.tableau[col];
    const topIndex = pile.length - 1;
    if (topIndex < 0 || !pile[topIndex].faceUp) continue;

    const topCard = pile[topIndex].card;
    const fi = findFoundationIndex(state, topCard);
    if (fi !== null) {
      moves.push(
        makeMove({ zone: 'tableau', index: col }, { zone: 'foundation', index: fi }, 1),
      );
    }
    for (let dest = 0; dest < state.tableau.length; dest++) {
      if (dest === col) continue;
      const destPile = state.tableau[dest];
      const target = destPile[destPile.length - 1];
      if (
        (!target && topCard.rank === 13) ||
        (target &&
          target.faceUp &&
          target.card.rank === topCard.rank + 1 &&
          isOppositeColor(topCard, target.card))
      ) {
        moves.push(makeMove({ zone: 'tableau', index: col }, { zone: 'tableau', index: dest }, 1));
      }
    }
  }

  // Много карт: перебираем валидные сегменты в столбцах.
  for (let col = 0; col < state.tableau.length; col++) {
    const pile = state.tableau[col];
    for (let start = 0; start < pile.length - 1; start++) {
      if (!pile[start].faceUp) continue;
      const segment = pile.slice(start);
      if (!isRun(segment)) continue;
      const first = segment[0].card;
      for (let dest = 0; dest < state.tableau.length; dest++) {
        if (dest === col) continue;
        const destPile = state.tableau[dest];
        const target = destPile[destPile.length - 1];
        if (
          (!target && first.rank === 13) ||
          (target &&
            target.faceUp &&
            target.card.rank === first.rank + 1 &&
            isOppositeColor(first, target.card))
        ) {
          const move = makeMove(
            { zone: 'tableau', index: col },
            { zone: 'tableau', index: dest },
            segment.length,
          );
          if (!moves.some((m) => JSON.stringify(m) === JSON.stringify(move))) moves.push(move);
        }
      }
    }
  }

  // Возврат из базовых стопок (не подсказываем, но это допустимо).
  for (let fi = 0; fi < state.foundations.length; fi++) {
    const pile = state.foundations[fi];
    const top = pile[pile.length - 1];
    if (!top) continue;
    for (let col = 0; col < state.tableau.length; col++) {
      const destPile = state.tableau[col];
      const target = destPile[destPile.length - 1];
      if (
        (!target && top.card.rank === 13) ||
        (target &&
          target.faceUp &&
          target.card.rank === top.card.rank + 1 &&
          isOppositeColor(top.card, target.card))
      ) {
        moves.push(makeMove({ zone: 'foundation', index: fi }, { zone: 'tableau', index: col }, 1));
      }
    }
  }

  return moves;
}

export function legalKlondikeMoves(state: KlondikeState): KlondikeMove[] {
  const moves = cardMoves(state);
  if (state.stock.length > 0) moves.push({ type: 'draw' });
  else if (state.waste.length > 0) moves.push({ type: 'recycle' });
  return moves;
}

function hintPriority(state: KlondikeState, move: KlondikeMove): number {
  if (move.type === 'draw') return 5;
  if (move.type === 'recycle') return 3;
  if (move.type !== 'move') return 0;
  if (move.from.zone === 'foundation') return 1;
  if (move.to.zone === 'foundation') return 100;
  if (move.to.zone === 'waste') return 0;
  if (move.from.zone === 'waste') return 50;
  if (move.from.zone === 'tableau' && move.to.zone === 'tableau') {
    const pile = state.tableau[move.from.index ?? -1] ?? [];
    const movedStart = pile.length - move.count;
    const exposesDown = movedStart > 0 && !pile[movedStart - 1].faceUp;
    const emptiesColumn = movedStart === 0;
    if (exposesDown) return 80;
    if (emptiesColumn) return 60;
    return 20;
  }
  return 10;
}

function moveCards(state: KlondikeState, move: KlondikeMove): CardId[] {
  if (move.type !== 'move') return [];
  const pile = sourcePile(state, move.from);
  return pile.slice(Math.max(0, pile.length - move.count)).map((c) => c.card.id);
}

function hintText(state: KlondikeState, move: KlondikeMove): string {
  if (move.type === 'draw') return 'Откройте карты из колоды';
  if (move.type === 'recycle') return 'Переверните сброс и продолжите перебор';
  if (move.from.zone === 'foundation' || move.to.zone === 'foundation') {
    const pile = sourcePile(state, move.from);
    const card = pile[pile.length - 1]?.card;
    return card ? `Переложите ${cardLabel(card)} в базовую стопку` : 'Есть допустимый ход';
  }
  const pile = sourcePile(state, move.from);
  const moved = pile[pile.length - move.count]?.card;
  if (!moved) return 'Есть допустимый ход';
  const target =
    move.to.zone === 'tableau'
      ? state.tableau[move.to.index ?? 0].at(-1)?.card
      : undefined;
  if (!target) return `Переложите ${cardLabel(moved)} в пустой столбец`;
  return `Переложите ${cardLabel(moved)} на ${cardLabel(target)}`;
}

export const klondikeModule: GameModule<KlondikeState, KlondikeMove> = {
  id: 'klondike',
  title: 'Косынка',
  description: 'Классика Windows: семь столбцов, четыре масти и верная стратегия.',
  rules: [
    'Собирайте карты в столбцах по убыванию с чередованием красного и чёрного.',
    'На пустой столбец можно положить только короля.',
    'Собирайте базовые стопки от туза до короля по мастям.',
    'В колоде 24 карты. В зависимости от режима открывается 1 или 3 карты.',
  ],
  createGame: createKlondikeGame,
  applyMove: applyKlondikeMove,
  legalMoves: legalKlondikeMoves,
  hint(state) {
    const moves = legalKlondikeMoves(state);
    if (!moves.length) return null;
    const sorted = [...moves].sort((a, b) => hintPriority(state, b) - hintPriority(state, a));
    const move = sorted[0];
    return {
      move,
      cards: moveCards(state, move),
      target:
        move.type === 'move' ? { zone: move.to.zone, index: move.to.index } : undefined,
      text: hintText(state, move),
    };
  },
  autoMoves(state) {
    return cardMoves(state).filter((m) => m.type === 'move' && m.to.zone === 'foundation');
  },
  isWon(state) {
    return allFoundationComplete(state.foundations);
  },
  isStuck(state) {
    if (state.won) return false;
    if (state.stock.length || state.waste.length) return false;
    const moves = cardMoves(state).filter(
      (m) => m.type === 'move' && m.from.zone !== 'foundation' && m.to.zone !== 'foundation',
    );
    return moves.length === 0;
  },
  isValidState(raw): raw is KlondikeState {
    if (!raw || typeof raw !== 'object') return false;
    const s = raw as Partial<KlondikeState>;
    if (s.gameId !== 'klondike') return false;
    if (s.drawCount !== 1 && s.drawCount !== 3) return false;
    if (!Array.isArray(s.tableau) || s.tableau.length !== 7) return false;
    if (!Array.isArray(s.foundations) || s.foundations.length !== 4) return false;
    if (!Array.isArray(s.stock) || !Array.isArray(s.waste)) return false;
    if (typeof s.moves !== 'number' || typeof s.score !== 'number' || typeof s.won !== 'boolean') {
      return false;
    }
    const piles = [...s.tableau, ...s.foundations, s.stock, s.waste];
    const ids = new Set<string>();
    let total = 0;
    for (const pile of piles) {
      if (!Array.isArray(pile)) return false;
      for (const item of pile) {
        if (!item || typeof item !== 'object') return false;
        const pc = item as PlacedCard;
        if (!pc.card || typeof pc.card.id !== 'string' || typeof pc.faceUp !== 'boolean') {
          return false;
        }
        if (!SUITS.includes(pc.card.suit)) return false;
        if (!Number.isInteger(pc.card.rank) || pc.card.rank < 1 || pc.card.rank > 13) return false;
        if (ids.has(pc.card.id)) return false;
        ids.add(pc.card.id);
        total++;
      }
    }
    return total === 52;
  },
};

export function klondikeGridCards(state: KlondikeState): PlacedCard[] {
  return [
    ...state.tableau.flat(),
    ...state.stock,
    ...state.waste,
    ...state.foundations.flat(),
  ];
}

export { allFoundationComplete };
