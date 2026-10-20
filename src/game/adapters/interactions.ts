import type { CardId } from '../../core/cards/Card';
import type { Hint, GameId, GameMoveBase } from '../../core/games/types';
import {
  applyKlondikeMove,
  findFoundationIndex as findKlondikeFoundation,
  klondikeModule,
  legalKlondikeMoves,
  type KlondikeLocation,
  type KlondikeMove,
  type KlondikeState,
} from '../../core/games/klondike/Klondike';
import {
  applySpiderMove,
  legalSpiderMoves,
  type SpiderMove,
  type SpiderState,
} from '../../core/games/spider/Spider';
import {
  applyFreeCellMove,
  freeCellFoundationIndex,
  legalFreeCellMoves,
  type FreeCellLocation,
  type FreeCellMove,
  type FreeCellState,
} from '../../core/games/freecell/FreeCell';
import {
  applyPyramidMove,
  availablePyramidRefs,
  cardAtRef,
  pyramidCardAt,
  type PyramidMove,
  type PyramidRef,
  type PyramidState,
} from '../../core/games/pyramid/Pyramid';
import { isOppositeColor, type Card } from '../../core/cards/Card';

export interface Selection {
  cards: CardId[];
  slot: string;
}

export type InteractionResult =
  | { type: 'select'; cards: CardId[]; slot: string }
  | { type: 'moves'; moves: GameMoveBase[] }
  | { type: 'clear' }
  | { type: 'error'; message: string }
  | { type: 'none' };

export interface BoardAdapter {
  locate(state: unknown, cardId: CardId): { slot: string; available: boolean } | null;
  selectCards(state: unknown, cardId: CardId): Selection | null;
  clickCard(state: unknown, cardId: CardId, selection: Selection | null): InteractionResult;
  doubleClick(state: unknown, cardId: CardId): InteractionResult;
  clickSlot(state: unknown, slotId: string, selection: Selection | null): InteractionResult;
  drop(state: unknown, cards: CardId[], slotId: string): InteractionResult;
  dropSlots(state: unknown, selection: Selection | null): string[];
  hintSlotIds(state: unknown, hint: Hint | null): string[];
  draggable: boolean;
}

function none(): InteractionResult {
  return { type: 'none' };
}

function tryApply<S>(module: { applyMove(state: S, move: any): S }, state: S, move: unknown): boolean {
  try {
    module.applyMove(state, move as never);
    return true;
  } catch {
    return false;
  }
}

function movesResult(moves: GameMoveBase[]): InteractionResult {
  if (!moves.length) return none();
  return { type: 'moves', moves };
}

// ---------------------------------------------------------------------------
// Косынка
// ---------------------------------------------------------------------------

interface KlondikeHit {
  slot: string;
  zone: 'tableau' | 'waste' | 'foundation';
  index: number;
  pileIndex: number;
  pile: { card: Card; faceUp: boolean }[];
}

function hitKlondike(state: KlondikeState, cardId: CardId): KlondikeHit | null {
  for (let col = 0; col < state.tableau.length; col++) {
    const pile = state.tableau[col];
    const index = pile.findIndex((c) => c.card.id === cardId);
    if (index >= 0) {
      return {
        slot: `tableau-${col}`,
        zone: 'tableau',
        index: col,
        pileIndex: index,
        pile,
      };
    }
  }
  const wasteIndex = state.waste.findIndex((c) => c.card.id === cardId);
  if (wasteIndex >= 0) {
    return {
      slot: 'waste',
      zone: 'waste',
      index: 0,
      pileIndex: wasteIndex,
      pile: state.waste,
    };
  }
  for (let f = 0; f < state.foundations.length; f++) {
    const pile = state.foundations[f];
    const index = pile.findIndex((c) => c.card.id === cardId);
    if (index >= 0) {
      return {
        slot: `foundation-${f}`,
        zone: 'foundation',
        index: f,
        pileIndex: index,
        pile,
      };
    }
  }
  return null;
}

function klondikeSuffix(state: KlondikeState, hit: KlondikeHit): CardId[] | null {
  if (hit.zone === 'waste') {
    if (hit.pileIndex !== hit.pile.length - 1) return null;
    return hit.pile[hit.pileIndex].faceUp ? [hit.pile[hit.pileIndex].card.id] : null;
  }
  if (hit.zone === 'foundation') {
    if (hit.pileIndex !== hit.pile.length - 1) return null;
    return [hit.pile[hit.pileIndex].card.id];
  }
  if (!hit.pile[hit.pileIndex].faceUp) return null;
  for (let i = hit.pileIndex; i < hit.pile.length; i++) {
    if (!hit.pile[i].faceUp) return null;
    if (i > hit.pileIndex) {
      const prev = hit.pile[i - 1].card;
      const cur = hit.pile[i].card;
      if (cur.rank !== prev.rank - 1 || !isOppositeColor(cur, prev)) return null;
    }
  }
  return hit.pile.slice(hit.pileIndex).map((c) => c.card.id);
}

function klondikeSourceFromSlot(
  slot: string,
  count: number,
): { from: KlondikeLocation; count: number } | null {
  if (slot === 'waste') return { from: { zone: 'waste' }, count: Math.min(count, 1) };
  const table = /^tableau-(\d+)$/.exec(slot);
  if (table) return { from: { zone: 'tableau', index: Number(table[1]) }, count };
  const foundation = /^foundation-(\d+)$/.exec(slot);
  if (foundation) {
    return { from: { zone: 'foundation', index: Number(foundation[1]) }, count: 1 };
  }
  return null;
}

function klondikeTarget(slot: string): KlondikeLocation | null {
  const table = /^tableau-(\d+)$/.exec(slot);
  if (table) return { zone: 'tableau', index: Number(table[1]) };
  const foundation = /^foundation-(\d+)$/.exec(slot);
  if (foundation) return { zone: 'foundation', index: Number(foundation[1]) };
  return null;
}

function klondikeBuildMove(
  state: KlondikeState,
  slot: string,
  cards: CardId[],
  targetSlot: string,
): KlondikeMove | null {
  const target = klondikeTarget(targetSlot);
  if (!target || !cards.length) return null;
  const source = klondikeSourceFromSlot(slot, cards.length);
  if (!source) return null;
  const move: KlondikeMove = {
    type: 'move',
    from: source.from,
    to: target,
    count: source.count,
  };
  return tryApply(klondikeModule, state, move) ? move : null;
}

function bestKlondikeTableauMove(state: KlondikeState, slot: string, count: number) {
  const source = klondikeSourceFromSlot(slot, count);
  if (!source) return null;
  const moves = legalKlondikeMoves(state).filter(
    (m): m is Extract<KlondikeMove, { type: 'move' }> =>
      m.type === 'move' &&
      m.to.zone === 'tableau' &&
      m.count === source.count &&
      m.from.zone === source.from.zone &&
      m.from.index === source.from.index,
  );
  return moves[0] ?? null;
}

function klondikeSlotClick(
  state: KlondikeState,
  slotId: string,
  selection: Selection | null,
): InteractionResult {
  if (slotId === 'stock') {
    if (state.stock.length > 0) return movesResult([{ type: 'draw' } as KlondikeMove]);
    if (state.waste.length > 0) return movesResult([{ type: 'recycle' } as KlondikeMove]);
    return { type: 'error', message: 'Колода и сброс пусты' };
  }
  if (slotId === 'waste') {
    if (!selection) {
      const top = state.waste.at(-1);
      if (!top) return none();
      return { type: 'select', cards: [top.card.id], slot: 'waste' };
    }
    return { type: 'clear' };
  }
  if (selection) {
    const move = klondikeBuildMove(state, selection.slot, selection.cards, slotId);
    if (move) return movesResult([move]);
    return { type: 'error', message: 'Сюда нельзя положить эти карты' };
  }
  const foundation = /^foundation-(\d+)$/.exec(slotId);
  if (foundation) {
    const pile = state.foundations[Number(foundation[1])];
    const top = pile?.at(-1);
    if (top) return { type: 'select', cards: [top.card.id], slot: slotId };
  }
  return none();
}

export const klondikeAdapter: BoardAdapter = {
  draggable: true,
  locate(state, cardId) {
    const hit = hitKlondike(state as KlondikeState, cardId);
    if (!hit) return null;
    return { slot: hit.slot, available: !!klondikeSuffix(state as KlondikeState, hit) };
  },
  selectCards(state, cardId) {
    const hit = hitKlondike(state as KlondikeState, cardId);
    if (!hit) return null;
    const cards = klondikeSuffix(state as KlondikeState, hit);
    return cards ? { cards, slot: hit.slot } : null;
  },
  clickCard(state, cardId, selection) {
    const s = state as KlondikeState;
    const hit = hitKlondike(s, cardId);
    if (!hit) return none();
    if (selection?.cards.includes(cardId)) return { type: 'clear' };
    if (selection) {
      const targetTop =
        hit.zone === 'tableau' || hit.zone === 'foundation'
          ? hit.pileIndex === hit.pile.length - 1
          : false;
      if (targetTop) {
        const move = klondikeBuildMove(s, selection.slot, selection.cards, hit.slot);
        if (move) return movesResult([move]);
      }
    }
    const cards = klondikeSuffix(s, hit);
    if (!cards) return { type: 'error', message: 'Эту карту нельзя переместить' };
    return { type: 'select', cards, slot: hit.slot };
  },
  doubleClick(state, cardId) {
    const s = state as KlondikeState;
    const hit = hitKlondike(s, cardId);
    if (!hit || hit.pileIndex !== hit.pile.length - 1) return none();
    if (hit.pileIndex < 0 || !hit.pile[hit.pileIndex]?.faceUp) return none();
    const card = hit.pile[hit.pileIndex].card;
    const foundation = findKlondikeFoundation(s, card);
    if (foundation !== null) {
      const move: KlondikeMove = {
        type: 'move',
        from:
          hit.zone === 'tableau'
            ? { zone: 'tableau', index: hit.index }
            : hit.zone === 'waste'
              ? { zone: 'waste' }
              : { zone: 'foundation', index: hit.index },
        to: { zone: 'foundation', index: foundation },
        count: 1,
      };
      if (tryApply(klondikeModule, s, move)) return movesResult([move]);
    }
    if (hit.zone === 'tableau' || hit.zone === 'waste') {
      const move = bestKlondikeTableauMove(s, hit.slot, 1);
      if (move) return movesResult([move]);
    }
    return { type: 'error', message: 'Для этой карты нет автоматического хода' };
  },
  clickSlot(state, slotId, selection) {
    return klondikeSlotClick(state as KlondikeState, slotId, selection);
  },
  drop(state, cards, slotId) {
    const s = state as KlondikeState;
    if (!selectionSlotFromCards(cards)) return none();
    const first = hitKlondike(s, cards[0]);
    if (!first) return none();
    const move = klondikeBuildMove(s, first.slot, cards, slotId);
    return move ? movesResult([move]) : none();
  },
  dropSlots(state, selection) {
    const s = state as KlondikeState;
    if (!selection) return [];
    return s.tableau
      .map((_, index) => `tableau-${index}`)
      .concat(s.foundations.map((_, index) => `foundation-${index}`))
      .filter((slot) => !!klondikeBuildMove(s, selection.slot, selection.cards, slot));
  },
  hintSlotIds(state, hint) {
    if (!hint?.target) return [];
    const t = hint.target;
    const suffix =
      t.index === undefined ? t.zone : `${t.zone}-${t.index}`;
    if (t.zone === 'foundation' || t.zone === 'tableau') return [suffix];
    if (t.zone === 'waste') return ['waste'];
    return [];
  },
};

function selectionSlotFromCards(cards: CardId[]): boolean {
  return cards.length > 0;
}

// ---------------------------------------------------------------------------
// Паук
// ---------------------------------------------------------------------------

interface SpiderHit {
  column: number;
  pileIndex: number;
  cards: { card: Card; faceUp: boolean }[];
}

function hitSpider(state: SpiderState, cardId: CardId): SpiderHit | null {
  for (let col = 0; col < state.columns.length; col++) {
    const pile = state.columns[col];
    const index = pile.findIndex((c) => c.card.id === cardId);
    if (index >= 0) return { column: col, pileIndex: index, cards: pile };
  }
  return null;
}

function spiderSuffix(state: SpiderState, hit: SpiderHit): CardId[] | null {
  if (!hit.cards[hit.pileIndex].faceUp) return null;
  for (let i = hit.pileIndex; i < hit.cards.length; i++) {
    if (!hit.cards[i].faceUp) return null;
    if (i > hit.pileIndex) {
      const prev = hit.cards[i - 1].card;
      const cur = hit.cards[i].card;
      if (cur.rank !== prev.rank - 1 || cur.suit !== prev.suit) return null;
    }
  }
  return hit.cards.slice(hit.pileIndex).map((c) => c.card.id);
}

function spiderMove(s: SpiderState, from: number, count: number, to: number): SpiderMove | null {
  const move: SpiderMove = { type: 'move', from, to, count };
  return tryApply({ applyMove: applySpiderMove }, s, move) ? move : null;
}

function spiderClickCard(
  state: SpiderState,
  cardId: CardId,
  selection: Selection | null,
): InteractionResult {
  const hit = hitSpider(state, cardId);
  if (!hit) return none();
  if (selection?.cards.includes(cardId)) return { type: 'clear' };
  if (selection) {
    const source = hitSpider(state, selection.cards[0]);
    if (source && hit.pileIndex === hit.cards.length - 1 && source.column !== hit.column) {
      const move = spiderMove(state, source.column, selection.cards.length, hit.column);
      if (move) return movesResult([move]);
    }
  }
  const cards = spiderSuffix(state, hit);
  if (!cards) return { type: 'error', message: 'Эту карту нельзя переместить' };
  return { type: 'select', cards, slot: `spider-column-${hit.column}` };
}

export const spiderAdapter: BoardAdapter = {
  draggable: true,
  locate(state, cardId) {
    const hit = hitSpider(state as SpiderState, cardId);
    if (!hit) return null;
    return {
      slot: `spider-column-${hit.column}`,
      available: !!spiderSuffix(state as SpiderState, hit),
    };
  },
  selectCards(state, cardId) {
    const hit = hitSpider(state as SpiderState, cardId);
    if (!hit) return null;
    const cards = spiderSuffix(state as SpiderState, hit);
    return cards ? { cards, slot: `spider-column-${hit.column}` } : null;
  },
  clickCard(state, cardId, selection) {
    return spiderClickCard(state as SpiderState, cardId, selection);
  },
  doubleClick(state, cardId) {
    const s = state as SpiderState;
    const hit = hitSpider(s, cardId);
    if (!hit) return none();
    const cards = spiderSuffix(s, hit);
    if (!cards) return none();
    const options = legalSpiderMoves(s).filter(
      (m): m is Extract<SpiderMove, { type: 'move' }> =>
        m.type === 'move' && m.from === hit.column && m.count === cards.length,
    );
    if (!options.length) return none();
    const cardSuit = hit.cards[hit.pileIndex].card.suit;
    const sorted = [...options].sort((a, b) => {
      const at = s.columns[a.to].at(-1)?.card;
      const bt = s.columns[b.to].at(-1)?.card;
      const score = (card: Card | undefined) => {
        if (!card) return 1;
        return card.suit === cardSuit ? 3 : 2;
      };
      return score(bt) - score(at);
    });
    return movesResult([sorted[0]]);
  },
  clickSlot(state, slotId, selection) {
    const s = state as SpiderState;
    if (slotId === 'spider-stock') {
      if (s.stock.length < 10) {
        return { type: 'error', message: 'В колоде не осталось карт для раздачи' };
      }
      if (s.columns.some((col) => col.length === 0)) {
        return { type: 'error', message: 'Сначала заполните пустые столбцы — раздача запрещена' };
      }
      const move: SpiderMove = { type: 'deal' };
      if (tryApply({ applyMove: applySpiderMove }, s, move)) return movesResult([move]);
      return { type: 'error', message: 'Раздача сейчас недоступна' };
    }
    const column = /^spider-column-(\d+)$/.exec(slotId);
    if (column && selection) {
      const source = hitSpider(s, selection.cards[0]);
      if (source) {
        const move = spiderMove(s, source.column, selection.cards.length, Number(column[1]));
        if (move) return movesResult([move]);
        return { type: 'error', message: 'Сюда нельзя положить эти карты' };
      }
    }
    return none();
  },
  drop(state, cards, slotId) {
    const s = state as SpiderState;
    const column = /^spider-column-(\d+)$/.exec(slotId);
    if (!column || !cards.length) return none();
    const first = hitSpider(s, cards[0]);
    if (!first) return none();
    const move = spiderMove(s, first.column, cards.length, Number(column[1]));
    return move ? movesResult([move]) : none();
  },
  dropSlots(state, selection) {
    const s = state as SpiderState;
    if (!selection) return [];
    const first = hitSpider(s, selection.cards[0]);
    if (!first) return [];
    return s.columns
      .map((_, index) => index)
      .filter((index) => index !== first.column)
      .map((index) => `spider-column-${index}`)
      .filter((slot) => !!spiderMove(s, first.column, selection.cards.length, Number(slot.split('-')[2])));
  },
  hintSlotIds(state, hint) {
    if (!hint?.target) return [];
    const t = hint.target;
    if (t.zone === 'spider-column' && t.index !== undefined) return [`spider-column-${t.index}`];
    if (t.zone === 'spider-stock') return ['spider-stock'];
    return [];
  },
};

// ---------------------------------------------------------------------------
// FreeCell
// ---------------------------------------------------------------------------

interface FreeCellHit {
  zone: 'tableau' | 'freecell' | 'foundation';
  index: number;
  pileIndex: number;
  pile: { card: Card; faceUp: boolean }[];
  slot: string;
}

function hitFreeCell(state: FreeCellState, cardId: CardId): FreeCellHit | null {
  for (let col = 0; col < state.columns.length; col++) {
    const pile = state.columns[col];
    const index = pile.findIndex((c) => c.card.id === cardId);
    if (index >= 0) {
      return { zone: 'tableau', index: col, pileIndex: index, pile, slot: `freecell-column-${col}` };
    }
  }
  for (let cell = 0; cell < state.freeCells.length; cell++) {
    const item = state.freeCells[cell];
    if (item?.card.id === cardId) {
      return {
        zone: 'freecell',
        index: cell,
        pileIndex: 0,
        pile: [item],
        slot: `freecell-cell-${cell}`,
      };
    }
  }
  for (let f = 0; f < state.foundations.length; f++) {
    const pile = state.foundations[f];
    const index = pile.findIndex((c) => c.card.id === cardId);
    if (index >= 0) {
      return {
        zone: 'foundation',
        index: f,
        pileIndex: index,
        pile,
        slot: `freecell-foundation-${f}`,
      };
    }
  }
  return null;
}

function freecellSuffix(state: FreeCellState, hit: FreeCellHit): CardId[] | null {
  if (hit.zone !== 'tableau') {
    if (hit.pileIndex !== hit.pile.length - 1) return null;
    return [hit.pile[hit.pileIndex].card.id];
  }
  if (!hit.pile[hit.pileIndex]?.faceUp) return null;
  for (let i = hit.pileIndex; i < hit.pile.length; i++) {
    if (!hit.pile[i].faceUp) return null;
    if (i > hit.pileIndex) {
      const prev = hit.pile[i - 1].card;
      const cur = hit.pile[i].card;
      if (cur.rank !== prev.rank - 1 || !isOppositeColor(cur, prev)) return null;
    }
  }
  return hit.pile.slice(hit.pileIndex).map((c) => c.card.id);
}

function freecellSource(slot: string, count: number): FreeCellLocation | null {
  const column = /^freecell-column-(\d+)$/.exec(slot);
  if (column) return { zone: 'tableau', index: Number(column[1]) };
  const cell = /^freecell-cell-(\d+)$/.exec(slot);
  if (cell) return { zone: 'freecell', index: Number(cell[1]) };
  const foundation = /^freecell-foundation-(\d+)$/.exec(slot);
  if (foundation) return { zone: 'foundation', index: Number(foundation[1]) };
  void count;
  return null;
}

function freecellTarget(slot: string): FreeCellLocation | null {
  return freecellSource(slot, 1);
}

function freecellBuildMove(
  state: FreeCellState,
  sourceSlot: string,
  cards: CardId[],
  targetSlot: string,
): FreeCellMove | null {
  const from = freecellSource(sourceSlot, cards.length);
  const to = freecellTarget(targetSlot);
  if (!from || !to) return null;
  // В базовую стопку всегда уходит только верхняя карта, даже если
  // игрок выбрал целую последовательность.
  const count = to.zone === 'foundation' ? 1 : cards.length;
  const move: FreeCellMove = { type: 'move', from, to, count };
  return tryApply({ applyMove: applyFreeCellMove }, state, move) ? move : null;
}

function freecellClickCard(
  state: FreeCellState,
  cardId: CardId,
  selection: Selection | null,
): InteractionResult {
  const hit = hitFreeCell(state, cardId);
  if (!hit) return none();
  if (selection?.cards.includes(cardId)) return { type: 'clear' };
  if (selection) {
    const isTop = hit.pileIndex === hit.pile.length - 1;
    if (isTop && (hit.zone === 'tableau' || hit.zone === 'foundation')) {
      const move = freecellBuildMove(state, selection.slot, selection.cards, hit.slot);
      if (move) return movesResult([move]);
    }
  }
  const cards = freecellSuffix(state, hit);
  if (!cards) return { type: 'error', message: 'Эту карту нельзя переместить' };
  return { type: 'select', cards, slot: hit.slot };
}

export const freecellAdapter: BoardAdapter = {
  draggable: true,
  locate(state, cardId) {
    const hit = hitFreeCell(state as FreeCellState, cardId);
    if (!hit) return null;
    return { slot: hit.slot, available: !!freecellSuffix(state as FreeCellState, hit) };
  },
  selectCards(state, cardId) {
    const hit = hitFreeCell(state as FreeCellState, cardId);
    if (!hit) return null;
    const cards = freecellSuffix(state as FreeCellState, hit);
    return cards ? { cards, slot: hit.slot } : null;
  },
  clickCard(state, cardId, selection) {
    return freecellClickCard(state as FreeCellState, cardId, selection);
  },
  doubleClick(state, cardId) {
    const s = state as FreeCellState;
    const hit = hitFreeCell(s, cardId);
    if (!hit || hit.pileIndex !== hit.pile.length - 1) return none();
    const card = hit.pile[hit.pileIndex].card;
    const sourceSlot = hit.slot;
    const f = freeCellFoundationIndex(s, card);
    if (f !== null) {
      const move = freecellBuildMove(s, sourceSlot, [card.id], `freecell-foundation-${f}`);
      if (move) return movesResult([move]);
    }
    // Из базовой стопки карту автоматически не убираем: это почти всегда
    // ухудшает позицию. Из столбца — можно, в свободную ячейку.
    if (hit.zone === 'tableau') {
      const freeCell = s.freeCells.findIndex((c) => c === null);
      if (freeCell >= 0) {
        const move = freecellBuildMove(s, sourceSlot, [card.id], `freecell-cell-${freeCell}`);
        if (move) return movesResult([move]);
      }
    }
    const options = legalFreeCellMoves(s).filter(
      (m) =>
        m.from.zone === hit.zone &&
        m.from.index === hit.index &&
        m.count === 1 &&
        m.to.zone === 'tableau',
    );
    return options.length ? movesResult([options[0]]) : none();
  },
  clickSlot(state, slotId, selection) {
    const s = state as FreeCellState;
    if (!selection) {
      if (slotId.startsWith('freecell-cell-')) {
        const idx = Number(slotId.split('-')[2]);
        const item = s.freeCells[idx];
        if (item) return { type: 'select', cards: [item.card.id], slot: slotId };
      }
      if (slotId.startsWith('freecell-foundation-')) {
        const idx = Number(slotId.split('-')[2]);
        const top = s.foundations[idx]?.at(-1);
        if (top) return { type: 'select', cards: [top.card.id], slot: slotId };
      }
      return none();
    }
    const move = freecellBuildMove(s, selection.slot, selection.cards, slotId);
    if (move) return movesResult([move]);
    return { type: 'error', message: 'Сюда нельзя положить эти карты' };
  },
  drop(state, cards, slotId) {
    const s = state as FreeCellState;
    if (!cards.length) return none();
    const first = hitFreeCell(s, cards[0]);
    if (!first) return none();
    const move = freecellBuildMove(s, first.slot, cards, slotId);
    return move ? movesResult([move]) : none();
  },
  dropSlots(state, selection) {
    const s = state as FreeCellState;
    if (!selection) return [];
    const slots: string[] = [
      ...s.columns.map((_, i) => `freecell-column-${i}`),
      ...s.freeCells.map((_, i) => `freecell-cell-${i}`),
      ...s.foundations.map((_, i) => `freecell-foundation-${i}`),
    ];
    return slots.filter((slot) => !!freecellBuildMove(s, selection.slot, selection.cards, slot));
  },
  hintSlotIds(state, hint) {
    if (!hint?.target) return [];
    const t = hint.target;
    if (t.index === undefined) return [];
    if (t.zone === 'tableau') return [`freecell-column-${t.index}`];
    if (t.zone === 'freecell') return [`freecell-cell-${t.index}`];
    if (t.zone === 'foundation') return [`freecell-foundation-${t.index}`];
    return [];
  },
};

// ---------------------------------------------------------------------------
// Пирамида
// ---------------------------------------------------------------------------

function hitPyramid(
  state: PyramidState,
  cardId: CardId,
): { ref: PyramidRef; card: Card; slot: string } | null {
  for (const ref of availablePyramidRefs(state)) {
    const card = cardAtRef(state, ref);
    if (card?.id === cardId && ref.zone === 'pyramid') {
      return { ref, card, slot: `pyramid-${ref.row}-${ref.col}` };
    }
  }
  const waste = state.waste.at(-1);
  if (waste?.card.id === cardId) {
    return { ref: { zone: 'waste' }, card: waste.card, slot: 'pyramid-waste' };
  }
  return null;
}

function pyramidRemove(ref: PyramidRef, other?: PyramidRef): PyramidMove {
  return { type: 'remove', a: ref, b: other };
}

function pyramidSelect(cardId: CardId, slot: string): InteractionResult {
  return { type: 'select', cards: [cardId], slot };
}

function pyramidClick(
  state: PyramidState,
  cardId: CardId,
  selection: Selection | null,
): InteractionResult {
  const hit = hitPyramid(state, cardId);
  if (!hit) return none();
  if (selection?.cards.includes(cardId)) return { type: 'clear' };

  if (hit.card.rank === 13) {
    const move = pyramidRemove(hit.ref);
    return tryApply({ applyMove: applyPyramidMove }, state, move)
      ? movesResult([move])
      : none();
  }

  if (selection) {
    const first = hitPyramid(state, selection.cards[0]);
    if (first) {
      if (first.card.rank + hit.card.rank === 13) {
        const move = pyramidRemove(first.ref, hit.ref);
        if (tryApply({ applyMove: applyPyramidMove }, state, move)) {
          return movesResult([move]);
        }
      }
    }
  }
  return pyramidSelect(cardId, hit.slot);
}

export const pyramidAdapter: BoardAdapter = {
  draggable: false,
  locate(state, cardId) {
    const hit = hitPyramid(state as PyramidState, cardId);
    return hit ? { slot: hit.slot, available: true } : null;
  },
  selectCards(state, cardId) {
    const hit = hitPyramid(state as PyramidState, cardId);
    if (!hit || hit.card.rank === 13) return null;
    return { cards: [cardId], slot: hit.slot };
  },
  clickCard(state, cardId, selection) {
    return pyramidClick(state as PyramidState, cardId, selection);
  },
  doubleClick(state, cardId) {
    const s = state as PyramidState;
    const hit = hitPyramid(s, cardId);
    if (!hit) return none();
    if (hit.card.rank === 13) {
      const move = pyramidRemove(hit.ref);
      return movesResult([move]);
    }
    // Сначала пробуем верх сброса, затем открытые карты пирамиды.
    const waste = s.waste.at(-1);
    if (waste && hit.ref.zone === 'pyramid' && hit.card.rank + waste.card.rank === 13) {
      const move = pyramidRemove(hit.ref, { zone: 'waste' });
      if (tryApply({ applyMove: applyPyramidMove }, s, move)) return movesResult([move]);
    }
    for (const ref of availablePyramidRefs(s)) {
      if (ref.zone !== 'pyramid') continue;
      if (hit.ref.zone === 'pyramid' && ref.row === hit.ref.row && ref.col === hit.ref.col) continue;
      const card = pyramidCardAt(s, ref.row, ref.col);
      if (card && card.rank + hit.card.rank === 13) {
        const move = pyramidRemove(hit.ref, ref);
        if (tryApply({ applyMove: applyPyramidMove }, s, move)) return movesResult([move]);
      }
    }
    return none();
  },
  clickSlot(state, slotId, selection) {
    const s = state as PyramidState;
    if (slotId === 'pyramid-stock') {
      if (s.stock.length > 0) return movesResult([{ type: 'draw' } as PyramidMove]);
      if (s.waste.length > 0) return movesResult([{ type: 'recycle' } as PyramidMove]);
      return { type: 'error', message: 'Колода и сброс пусты' };
    }
    if (slotId === 'pyramid-waste') {
      if (selection) {
        const first = hitPyramid(s, selection.cards[0]);
        const waste = s.waste.at(-1);
        // Выбор игрока важнее: сначала пробуем составить пару. Король
        // убирается кликом по сбросу только без выбранной карты, иначе
        // случайное снятие короля ломало бы задуманный ход.
        if (first && waste && first.ref.zone === 'waste') {
          return waste.card.rank === 13
            ? movesResult([pyramidRemove({ zone: 'waste' })])
            : { type: 'clear' };
        }
        if (first && waste && first.card.rank + waste.card.rank === 13) {
          const move = pyramidRemove(first.ref, { zone: 'waste' });
          if (tryApply({ applyMove: applyPyramidMove }, s, move)) return movesResult([move]);
        }
        return { type: 'clear' };
      }
      const waste = s.waste.at(-1);
      if (!waste) return none();
      if (waste.card.rank === 13) {
        return movesResult([pyramidRemove({ zone: 'waste' })]);
      }
      return pyramidSelect(waste.card.id, 'pyramid-waste');
    }
    return none();
  },
  drop(state, cards, slotId) {
    const s = state as PyramidState;
    if (!cards.length) return none();
    const hit = hitPyramid(s, cards[0]);
    if (!hit) return none();
    let move: PyramidMove | null = null;
    if (slotId === 'pyramid-waste') {
      if (hit.ref.zone !== 'pyramid') return none();
      const waste = s.waste.at(-1);
      if (!waste || hit.card.rank + waste.card.rank !== 13) return none();
      move = pyramidRemove(hit.ref, { zone: 'waste' });
    } else {
      const m = /^pyramid-(\d+)-(\d+)$/.exec(slotId);
      if (!m) return none();
      const ref: PyramidRef = { zone: 'pyramid', row: Number(m[1]), col: Number(m[2]) };
      if (hit.ref.zone === 'pyramid' && hit.ref.row === ref.row && hit.ref.col === ref.col) {
        return none();
      }
      const target = pyramidCardAt(s, ref.row, ref.col);
      if (!target || target.rank + hit.card.rank !== 13) return none();
      move = pyramidRemove(hit.ref, ref);
    }
    return tryApply({ applyMove: applyPyramidMove }, s, move)
      ? movesResult([move])
      : none();
  },
  dropSlots(state, selection) {
    const s = state as PyramidState;
    if (!selection) return [];
    const hit = hitPyramid(s, selection.cards[0]);
    if (!hit) return [];
    const slots: string[] = [];
    const waste = s.waste.at(-1);
    if (hit.ref.zone === 'pyramid' && waste && hit.card.rank + waste.card.rank === 13) {
      slots.push('pyramid-waste');
    }
    for (const ref of availablePyramidRefs(s)) {
      if (ref.zone !== 'pyramid') continue;
      if (hit.ref.zone === 'pyramid' && ref.row === hit.ref.row && ref.col === hit.ref.col) continue;
      const card = pyramidCardAt(s, ref.row, ref.col);
      if (card && card.rank + hit.card.rank === 13) {
        slots.push(`pyramid-${ref.row}-${ref.col}`);
      }
    }
    return slots;
  },
  hintSlotIds(state, hint) {
    if (!hint) return [];
    const move = hint.move as PyramidMove;
    if (move.type === 'draw') return ['pyramid-stock'];
    if (move.type === 'recycle') return ['pyramid-waste'];
    if (move.type !== 'remove') return [];
    const ids: string[] = [];
    const push = (ref: PyramidRef) => {
      ids.push(ref.zone === 'waste' ? 'pyramid-waste' : `pyramid-${ref.row}-${ref.col}`);
    };
    push(move.a);
    if (move.b) push(move.b);
    return ids;
  },
};

const ADAPTERS: Record<GameId, BoardAdapter> = {
  klondike: klondikeAdapter,
  spider: spiderAdapter,
  freecell: freecellAdapter,
  pyramid: pyramidAdapter,
};

export function getBoardAdapter(gameId: GameId): BoardAdapter {
  return ADAPTERS[gameId];
}

export { tryApply };
