import type { KlondikeState } from '../../core/games/klondike/Klondike';
import { SUIT_SYMBOL } from '../../core/cards/Card';
import {
  computeFan,
  selectedIdSet,
  type BoardView,
  type PresentOptions,
  type ViewCard,
  type ViewSlot,
} from './types';
import { clamp } from '../../ui/utils';

export function presentKlondike(
  state: KlondikeState,
  options: PresentOptions,
): BoardView {
  const { width: W, height: H } = options;
  const margin = clamp(W * 0.018, 6, 18);
  const gap = clamp(W * 0.012, 3, 12);
  const columnW = Math.max(18, (W - margin * 2 - gap * 6) / 7);
  const cardW = Math.min(columnW, 118);
  const cardH = cardW * 1.43;
  const rowW = cardW * 7 + gap * 6;
  const startX = (W - rowW) / 2;
  const colX = (i: number) => startX + i * (cardW + gap);
  const topY = margin;
  const tableauY = topY + cardH + clamp(cardH * 0.24, 16, 34);
  const available = Math.max(cardH + 10, H - tableauY - 8);
  const selected = selectedIdSet(options.selected);
  const hintIds = new Set(options.hint?.cards ?? []);
  const cards: ViewCard[] = [];
  const slots: ViewSlot[] = [];

  slots.push({
    id: 'stock',
    kind: 'stock',
    x: colX(0),
    y: topY,
    width: cardW,
    height: cardH,
    label: 'Колода',
    badge: state.stock.length ? String(state.stock.length) : '',
    interactive: true,
  });
  slots.push({
    id: 'waste',
    kind: 'waste',
    x: colX(1),
    y: topY,
    width: cardW,
    height: cardH,
    label: 'Сброс',
    badge: state.stock.length === 0 && state.waste.length > 0 ? '↻' : '',
    interactive: true,
  });
  for (let i = 0; i < 4; i++) {
    slots.push({
      id: `foundation-${i}`,
      kind: 'foundation',
      x: colX(3 + i),
      y: topY,
      width: cardW,
      height: cardH,
      label: 'A',
      interactive: true,
    });
  }
  for (let i = 0; i < 7; i++) {
    slots.push({
      id: `tableau-${i}`,
      kind: 'tableau',
      x: colX(i),
      y: tableauY,
      width: cardW,
      height: cardH,
      hitHeight: available,
      interactive: true,
    });
  }

  state.stock.forEach((item, index) => {
    cards.push({
      id: item.card.id,
      suit: item.card.suit,
      rank: item.card.rank,
      faceUp: false,
      x: colX(0),
      y: topY,
      width: cardW,
      height: cardH,
      depth: 10 + index,
      interactive: false,
      draggable: false,
    });
  });

  const wasteTop = state.waste.length - 1;
  state.waste.forEach((item, index) => {
    cards.push({
      id: item.card.id,
      suit: item.card.suit,
      rank: item.card.rank,
      faceUp: true,
      x: colX(1),
      y: topY,
      width: cardW,
      height: cardH,
      depth: 300 + index,
      interactive: index === wasteTop,
      draggable: index === wasteTop,
    });
  });

  state.foundations.forEach((pile, fi) => {
    pile.forEach((item, index) => {
      cards.push({
        id: item.card.id,
        suit: item.card.suit,
        rank: item.card.rank,
        faceUp: true,
        x: colX(3 + fi),
        y: topY,
        width: cardW,
        height: cardH,
        depth: 500 + fi * 30 + index,
        interactive: index === pile.length - 1,
        draggable: index === pile.length - 1,
      });
    });
  });

  state.tableau.forEach((pile, col) => {
    const { gaps } = computeFan(pile.length, cardH, available, (i) =>
      pile[i].faceUp ? cardH * 0.3 : cardH * 0.16,
    );
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
        depth: 900 + col * 60 + index,
        interactive: true,
        draggable: item.faceUp,
      });
    });
  });

  state.foundations.forEach((pile, fi) => {
    const top = pile.at(-1);
    if (top) {
      const slot = slots.find((s) => s.id === `foundation-${fi}`);
      if (slot) slot.label = SUIT_SYMBOL[top.card.suit];
    }
  });

  return {
    gameId: 'klondike',
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
