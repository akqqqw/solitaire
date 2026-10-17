import type { FreeCellState } from '../../core/games/freecell/FreeCell';
import { SUIT_SYMBOL } from '../../core/cards/Card';
import {
  computeFan,
  selectedIdSet,
  type BoardView,
  type PresentOptions,
  type ViewCard,
} from './types';
import { clamp } from '../../ui/utils';

export function presentFreeCell(state: FreeCellState, options: PresentOptions): BoardView {
  const { width: W, height: H } = options;
  const margin = clamp(W * 0.018, 6, 18);
  const gap = clamp(W * 0.012, 3, 12);
  const columnW = Math.max(20, (W - margin * 2 - gap * 7) / 8);
  const cardW = Math.min(columnW, 116);
  const cardH = cardW * 1.43;
  const rowW = cardW * 8 + gap * 7;
  const startX = (W - rowW) / 2;
  const colX = (i: number) => startX + i * (cardW + gap);
  const topY = margin;
  const tableauY = topY + cardH + clamp(cardH * 0.26, 16, 34);
  const available = Math.max(cardH + 10, H - tableauY - 8);
  const selected = selectedIdSet(options.selected);
  const hintIds = new Set(options.hint?.cards ?? []);
  const cards: ViewCard[] = [];
  const slots = [];

  for (let i = 0; i < 4; i++) {
    const item = state.freeCells[i];
    slots.push({
      id: `freecell-cell-${i}`,
      kind: 'freecell' as const,
      x: colX(i),
      y: topY,
      width: cardW,
      height: cardH,
      label: '＋',
      interactive: true,
      badge: item ? '' : '',
    });
    if (item) {
      cards.push({
        id: item.card.id,
        suit: item.card.suit,
        rank: item.card.rank,
        faceUp: true,
        x: colX(i),
        y: topY,
        width: cardW,
        height: cardH,
        depth: 300 + i,
        interactive: true,
        draggable: true,
      });
    }
  }
  for (let i = 0; i < 4; i++) {
    const pile = state.foundations[i];
    const top = pile.at(-1);
    slots.push({
      id: `freecell-foundation-${i}`,
      kind: 'foundation' as const,
      x: colX(4 + i),
      y: topY,
      width: cardW,
      height: cardH,
      label: top ? SUIT_SYMBOL[top.card.suit] : 'A',
      interactive: true,
    });
    pile.forEach((item, index) => {
      cards.push({
        id: item.card.id,
        suit: item.card.suit,
        rank: item.card.rank,
        faceUp: true,
        x: colX(4 + i),
        y: topY,
        width: cardW,
        height: cardH,
        depth: 500 + i * 30 + index,
        interactive: index === pile.length - 1,
        draggable: index === pile.length - 1,
      });
    });
  }
  for (let i = 0; i < 8; i++) {
    slots.push({
      id: `freecell-column-${i}`,
      kind: 'tableau' as const,
      x: colX(i),
      y: tableauY,
      width: cardW,
      height: cardH,
      hitHeight: available,
      interactive: true,
    });
  }

  state.columns.forEach((pile, col) => {
    const { gaps } = computeFan(pile.length, cardH, available, () => cardH * 0.31);
    let y = tableauY;
    pile.forEach((item, index) => {
      if (index > 0) y += gaps[index - 1] ?? 0;
      cards.push({
        id: item.card.id,
        suit: item.card.suit,
        rank: item.card.rank,
        faceUp: item.faceUp,
        x: colX(col),
        y,
        width: cardW,
        height: cardH,
        depth: 900 + col * 70 + index,
        interactive: item.faceUp,
        draggable: item.faceUp,
      });
    });
  });

  return {
    gameId: 'freecell',
    width: W,
    height: H,
    cardWidth: cardW,
    cardHeight: cardH,
    cards,
    slots,
    selectedIds: [...selected],
    hintIds: [...hintIds],
    hintSlotIds: options.hintSlotIds,
    dropSlotIds: options.dropSlotIds,
    cardBack: options.cardBack,
    dealKey: `${state.seed}:${state.createdAt}`,
    animations: options.animations,
  };
}
