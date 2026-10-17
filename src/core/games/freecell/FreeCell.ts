import { cardLabel, isOppositeColor, SUITS, type Card } from '../../cards/Card';
import { buildDeck } from '../../cards/Deck';
import { canPlaceOnFoundation } from '../../cards/CardRules';
import { cloneState, isCardLike, type PlacedCard } from '../../cards/Pile';
import { createRng, shuffleInPlace } from '../../cards/Shuffle';
import type { GameModule, GameStateBase, Hint, NewGameOptions } from '../types';

export type FreeCellZone = 'tableau' | 'freecell' | 'foundation';

export interface FreeCellLocation {
  zone: FreeCellZone;
  index: number;
}

export type FreeCellMove = {
  type: 'move';
  from: FreeCellLocation;
  to: FreeCellLocation;
  count: number;
};

export interface FreeCellState extends GameStateBase {
  gameId: 'freecell';
  columns: PlacedCard[][];
  freeCells: (PlacedCard | null)[];
  foundations: PlacedCard[][];
}

const COLUMNS = 8;
const FREE_CELLS = 4;
const FOUNDATIONS = 4;

function createEmpty(seed: string): FreeCellState {
  return {
    gameId: 'freecell',
    seed,
    columns: Array.from({ length: COLUMNS }, () => []),
    freeCells: Array.from({ length: FREE_CELLS }, () => null),
    foundations: Array.from({ length: FOUNDATIONS }, () => []),
    moves: 0,
    score: 0,
    won: false,
    createdAt: Date.now(),
  };
}

export function createFreeCellGame(options: NewGameOptions = {}): FreeCellState {
  // По умолчанию каждый расклад получает числовой номер: его можно
  // назвать, повторить и проверить независимо от устройства.
  const seed = options.seed?.trim() || String(Math.floor(Math.random() * 1_000_000));
  const state = createEmpty(seed);
  const deck = shuffleInPlace(buildDeck(), createRng(seed));
  let cursor = 0;
  for (let col = 0; col < COLUMNS; col++) {
    const count = col < 4 ? 7 : 6;
    for (let i = 0; i < count; i++) {
      state.columns[col].push({ card: deck[cursor++], faceUp: true });
    }
  }
  return state;
}

export function freeCellPile(
  state: FreeCellState,
  loc: FreeCellLocation,
): PlacedCard[] {
  if (loc.zone === 'tableau') {
    const pile = state.columns[loc.index];
    if (!pile) throw new Error('Неверный столбец');
    return pile;
  }
  if (loc.zone === 'freecell') {
    const cell = state.freeCells[loc.index];
    if (cell === undefined) throw new Error('Неверная свободная ячейка');
    return cell ? [cell] : [];
  }
  if (loc.zone === 'foundation') {
    const pile = state.foundations[loc.index];
    if (!pile) throw new Error('Неверная базовая стопка');
    return pile;
  }
  throw new Error('Неизвестная зона');
}

export function freeCellFoundationIndex(state: FreeCellState, card: Card): number | null {
  for (let i = 0; i < state.foundations.length; i++) {
    const pile = state.foundations[i];
    const top = pile[pile.length - 1];
    if (top && canPlaceOnFoundation(card, top.card)) return i;
  }
  if (card.rank === 1) {
    for (let i = 0; i < state.foundations.length; i++) {
      if (state.foundations[i].length === 0) return i;
    }
  }
  return null;
}

export function countEmptyColumns(state: FreeCellState): number {
  return state.columns.filter((c) => c.length === 0).length;
}

export function countFreeCells(state: FreeCellState): number {
  return state.freeCells.filter((c) => c === null).length;
}

/**
 * Классическая формула FreeCell:
 * (свободные ячейки + 1) * 2^(пустые столбцы, доступные как промежуточные).
 * Если целевой столбец пуст, он не считается промежуточным.
 */
export function maxMovableCards(state: FreeCellState, movingToEmpty: boolean): number {
  const free = countFreeCells(state);
  const empty = Math.max(0, countEmptyColumns(state) - (movingToEmpty ? 1 : 0));
  return (free + 1) * 2 ** empty;
}

function isAlternatingRun(cards: readonly PlacedCard[]): boolean {
  for (let i = 1; i < cards.length; i++) {
    const prev = cards[i - 1].card;
    const cur = cards[i].card;
    if (cur.rank !== prev.rank - 1 || !isOppositeColor(cur, prev)) return false;
  }
  return cards.every((c) => c.faceUp);
}

function validateMove(state: FreeCellState, move: FreeCellMove): void {
  if (!move || move.type !== 'move') throw new Error('Неизвестный ход');
  const { from, to, count } = move;
  if (!from || !to) throw new Error('Не указана стопка');
  if (
    typeof from.index !== 'number' ||
    typeof to.index !== 'number' ||
    !Number.isInteger(count) ||
    count < 1
  ) {
    throw new Error('Некорректный ход');
  }
  if (from.zone === to.zone && from.index === to.index) {
    throw new Error('Карты уже в этой стопке');
  }
  const source = freeCellPile(state, from);
  if (count > source.length) throw new Error('В стопке нет столько карт');
  const selected = source.slice(source.length - count);
  if (selected.some((c) => !c.faceUp)) throw new Error('Можно брать только открытые карты');
  if (from.zone !== 'tableau' && count !== 1) {
    throw new Error('Из этой стопки можно взять только одну карту');
  }
  if (count > 1 && !isAlternatingRun(selected)) {
    throw new Error('Последовательность должна идти по убыванию с чередованием цветов');
  }

  if (to.zone === 'tableau') {
    const dest = state.columns[to.index];
    if (!dest) throw new Error('Неверный столбец');
    const first = selected[0].card;
    const target = dest[dest.length - 1];
    if (target) {
      if (!target.faceUp) throw new Error('Верхняя карта столбца закрыта');
      if (target.card.rank !== first.rank + 1 || !isOppositeColor(first, target.card)) {
        throw new Error('Карта не подходит по рангу или цвету');
      }
    }
    if (count > 1) {
      const max = maxMovableCards(state, dest.length === 0);
      if (count > max) {
        throw new Error(
          `Недостаточно свободных ячеек и пустых столбцов: можно перенести не более ${max}`,
        );
      }
    }
    return;
  }

  if (to.zone === 'freecell') {
    if (count !== 1) throw new Error('В свободную ячейку можно положить только одну карту');
    if (to.index < 0 || to.index >= state.freeCells.length) throw new Error('Неверная ячейка');
    if (state.freeCells[to.index] !== null) throw new Error('Свободная ячейка занята');
    return;
  }

  if (to.zone === 'foundation') {
    if (count !== 1) throw new Error('В базовую стопку можно положить только одну карту');
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

  throw new Error('Неизвестная зона назначения');
}

function foundationScore(state: FreeCellState): number {
  return state.foundations.reduce((sum, pile) => sum + pile.length, 0) * 10;
}

function allComplete(state: FreeCellState): boolean {
  return state.foundations.every((pile) => pile.length === 13);
}

export function applyFreeCellMove(state: FreeCellState, move: FreeCellMove): FreeCellState {
  validateMove(state, move);
  const next = cloneState(state);
  next.moves += 1;

  const source = freeCellPile(next, move.from);
  const selected = source.splice(source.length - move.count, move.count);
  if (move.from.zone === 'freecell') {
    next.freeCells[move.from.index] = null;
  }
  if (move.to.zone === 'tableau') {
    next.columns[move.to.index].push(...selected);
  } else if (move.to.zone === 'freecell') {
    next.freeCells[move.to.index] = selected[0];
  } else {
    next.foundations[move.to.index].push(selected[0]);
  }

  const won = allComplete(next);
  next.won = won;
  next.score = foundationScore(next) + (won ? 100 : 0);
  return next;
}

function addMove(
  moves: FreeCellMove[],
  from: FreeCellLocation,
  to: FreeCellLocation,
  count: number,
): void {
  moves.push({ type: 'move', from, to, count });
}

function tableauMoves(state: FreeCellState): FreeCellMove[] {
  const moves: FreeCellMove[] = [];
  for (let col = 0; col < state.columns.length; col++) {
    const pile = state.columns[col];
    if (!pile.length) continue;
    const top = pile[pile.length - 1];
    if (!top.faceUp) continue;

    const fi = freeCellFoundationIndex(state, top.card);
    if (fi !== null) addMove(moves, { zone: 'tableau', index: col }, { zone: 'foundation', index: fi }, 1);

    for (let cell = 0; cell < state.freeCells.length; cell++) {
      if (state.freeCells[cell] === null) {
        addMove(moves, { zone: 'tableau', index: col }, { zone: 'freecell', index: cell }, 1);
        break;
      }
    }

    // Все возможные валидные последовательности из конца столбца.
    let start = pile.length - 1;
    while (start > 0 && isAlternatingRun(pile.slice(start - 1))) start--;
    for (let s = start; s < pile.length; s++) {
      const segment = pile.slice(s);
      if (!isAlternatingRun(segment)) continue;
      const first = segment[0].card;
      for (let dest = 0; dest < state.columns.length; dest++) {
        if (dest === col) continue;
        const target = state.columns[dest][state.columns[dest].length - 1];
        if (
          (!target) ||
          (target.faceUp &&
            target.card.rank === first.rank + 1 &&
            isOppositeColor(first, target.card))
        ) {
          const count = segment.length;
          if (count === 1 || count <= maxMovableCards(state, !target)) {
            addMove(moves, { zone: 'tableau', index: col }, { zone: 'tableau', index: dest }, count);
          }
        }
      }
    }
  }
  return moves;
}

export function legalFreeCellMoves(state: FreeCellState): FreeCellMove[] {
  const moves = tableauMoves(state);
  for (let cell = 0; cell < state.freeCells.length; cell++) {
    const item = state.freeCells[cell];
    if (!item) continue;
    const fi = freeCellFoundationIndex(state, item.card);
    if (fi !== null) {
      addMove(moves, { zone: 'freecell', index: cell }, { zone: 'foundation', index: fi }, 1);
    }
    for (let dest = 0; dest < state.columns.length; dest++) {
      const target = state.columns[dest][state.columns[dest].length - 1];
      if (
        !target ||
        (target.faceUp &&
          target.card.rank === item.card.rank + 1 &&
          isOppositeColor(item.card, target.card))
      ) {
        addMove(moves, { zone: 'freecell', index: cell }, { zone: 'tableau', index: dest }, 1);
      }
    }
  }
  for (let fi = 0; fi < state.foundations.length; fi++) {
    const pile = state.foundations[fi];
    const top = pile[pile.length - 1];
    if (!top) continue;
    for (let dest = 0; dest < state.columns.length; dest++) {
      const target = state.columns[dest][state.columns[dest].length - 1];
      if (
        !target ||
        (target.faceUp &&
          target.card.rank === top.card.rank + 1 &&
          isOppositeColor(top.card, target.card))
      ) {
        addMove(moves, { zone: 'foundation', index: fi }, { zone: 'tableau', index: dest }, 1);
      }
    }
  }
  return moves;
}

function priority(state: FreeCellState, move: FreeCellMove): number {
  if (move.to.zone === 'foundation') return 100;
  if (move.from.zone === 'foundation') return 2;
  if (move.from.zone === 'freecell' && move.to.zone === 'tableau') return 35;
  if (move.to.zone === 'freecell') {
    return 10;
  }
  if (move.from.zone === 'tableau' && move.to.zone === 'tableau') {
    const source = state.columns[move.from.index];
    if (source.length === move.count) return 60;
    if (move.count > 1) return 30;
    return 20;
  }
  return 5;
}

function hintText(state: FreeCellState, move: FreeCellMove): string {
  const source = freeCellPile(state, move.from);
  const top = source[source.length - 1];
  if (!top) return 'Есть допустимый ход';
  if (move.to.zone === 'foundation') return `Перенесите ${cardLabel(top.card)} в базовую стопку`;
  if (move.to.zone === 'freecell') return `Уберите ${cardLabel(top.card)} в свободную ячейку`;
  const target = state.columns[move.to.index].at(-1)?.card;
  return target
    ? `Переложите ${cardLabel(top.card)} на ${cardLabel(target)}`
    : `Переложите ${cardLabel(top.card)} в пустой столбец`;
}

export const freecellModule: GameModule<FreeCellState, FreeCellMove> = {
  id: 'freecell',
  title: 'Свободная ячейка',
  description: 'Стратегический пасьянс: четыре ячейки, восемь столбцов и полный контроль.',
  rules: [
    'Все 52 карты открыты. На поле восемь столбцов и четыре свободные ячейки.',
    'Собирайте столбцы по убыванию с чередованием цветов.',
    'В свободную ячейку помещается только одна карта.',
    'Число карт, переносимых за один раз, ограничено свободными ячейками и пустыми столбцами.',
    'Соберите четыре базовые стопки от туза до короля.',
    'Каждый расклад имеет номер: одинаковый номер всегда даёт те же карты в тех же столбцах.',
  ],
  createGame: createFreeCellGame,
  applyMove: applyFreeCellMove,
  legalMoves: legalFreeCellMoves,
  hint(state) {
    if (allComplete(state)) return null;
    const moves = legalFreeCellMoves(state);
    if (!moves.length) return null;
    const move = [...moves].sort((a, b) => priority(state, b) - priority(state, a))[0];
    const source = freeCellPile(state, move.from);
    return {
      move,
      cards: source.slice(source.length - move.count).map((c) => c.card.id),
      target: { zone: move.to.zone, index: move.to.index },
      text: hintText(state, move),
    };
  },
  autoMoves(state) {
    return legalFreeCellMoves(state).filter((m) => m.to.zone === 'foundation');
  },
  isWon(state) {
    return state.foundations.every((pile) => pile.length === 13);
  },
  isStuck(state) {
    if (allComplete(state)) return false;
    return legalFreeCellMoves(state).length === 0;
  },
  isValidState(raw): raw is FreeCellState {
    if (!raw || typeof raw !== 'object') return false;
    const s = raw as Partial<FreeCellState>;
    if (s.gameId !== 'freecell') return false;
    if (!Array.isArray(s.columns) || s.columns.length !== COLUMNS) return false;
    if (!Array.isArray(s.freeCells) || s.freeCells.length !== FREE_CELLS) return false;
    if (!Array.isArray(s.foundations) || s.foundations.length !== FOUNDATIONS) return false;
    if (typeof s.moves !== 'number' || typeof s.score !== 'number' || typeof s.won !== 'boolean') {
      return false;
    }
    const ids = new Set<string>();
    let total = 0;
    const add = (card: unknown): boolean => {
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
        if (typeof item.faceUp !== 'boolean' || !add(item.card)) return false;
      }
    }
    for (const cell of s.freeCells) {
      if (cell === null) continue;
      if (typeof cell !== 'object' || typeof cell.faceUp !== 'boolean' || !add(cell.card)) {
        return false;
      }
    }
    for (const pile of s.foundations) {
      if (!Array.isArray(pile)) return false;
      for (const item of pile) {
        if (!item || typeof item !== 'object') return false;
        if (typeof item.faceUp !== 'boolean' || !add(item.card)) return false;
      }
    }
    return total === 52;
  },
};
