import type { SpiderState } from '../../core/games/spider/Spider';
import { SUIT_SYMBOL } from '../../core/cards/Card';
import {
  computeFan,
  selectedIdSet,
  type BoardView,
  type PresentOptions,
  type ViewCard,
} from './types';
import { clamp } from '../../ui/utils';

export function presentSpider(state: SpiderState, options: PresentOptions): BoardView {
  const { width: W, height: H } = options;
  const margin = clamp(W * 0.012, 4, 16);
  const gap = clamp(W * 0.008, 2, 10);
  const columnW = Math.max(16, (W - margin * 2 - gap * 9) / 10);
  const cardW = Math.min(columnW, 110);
  const cardH = cardW * 1.43;
  const rowW = cardW * 10 + gap * 9;
  const startX = (W - rowW) / 2;
  const colX = (i: number) => startX + i * (cardW + gap);
  const topY = margin;
  const tableauY = topY + cardH + clamp(cardH * 0.22, 14, 30);
  const available = Math.max(cardH + 10, H - tableauY - 8);
  const selected = selectedIdSet(options.selected);
  const hintIds = new Set(options.hint?.cards ?? []);
  const cards: ViewCard[] = [];
  const slots = [];

  slots.push({
    id: 'spider-stock',
    kind: 'stock' as const,
    x: colX(0),
    y: topY,
    width: cardW,
    height: cardH,
    label: 'Колода',
    badge: state.stock.length ? String(state.stock.length) : '',
    interactive: true,
  });
  for (let i = 0; i < 8; i++) {
    const run = state.completed[i];
    slots.push({
      id: `spider-completed-${i}`,
      kind: 'completed' as const,
      x: colX(2 + i),
      y: topY,
      width: cardW,
      height: cardH,
      label: run ? SUIT_SYMBOL[run[0].suit] : 'K–A',
      badge: run ? '13' : '',
      interactive: false,
    });
  }
  for (let i = 0; i < 10; i++) {
    slots.push({
      id: `spider-column-${i}`,
      kind: 'tableau' as const,
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

  state.columns.forEach((pile, col) => {
    const { gaps } = computeFan(pile.length, cardH, available, (i) =>
      pile[i].faceUp ? cardH * 0.27 : cardH * 0.13,
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
        depth: 500 + col * 80 + index,
        interactive: item.faceUp,
        draggable: item.faceUp,
      });
    });
  });

  return {
    gameId: 'spider',
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
    dealKey: `${state.seed}:${state.createdAt}:${state.suitCount}`,
    animations: options.animations,
  };
}
