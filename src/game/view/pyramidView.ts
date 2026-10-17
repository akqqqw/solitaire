import { isPyramidCardAvailable, type PyramidState } from '../../core/games/pyramid/Pyramid';
import {
  selectedIdSet,
  type BoardView,
  type PresentOptions,
  type ViewCard,
} from './types';
import { clamp } from '../../ui/utils';

export function presentPyramid(state: PyramidState, options: PresentOptions): BoardView {
  const { width: W, height: H } = options;
  const margin = clamp(W * 0.02, 8, 24);
  const widthFit = (W - margin * 2) / 4.3;
  const heightFit = (H - margin * 2) / 8;
  const cardW = Math.max(22, Math.min(112, widthFit, heightFit));
  const cardH = cardW * 1.42;
  const stepX = cardW * 0.55;
  const stepY = cardH * 0.56;
  const centerX = W / 2;
  const bottomGap = cardH * 0.25;
  const pyramidHeight = stepY * 6 + cardH;
  const groupHeight = pyramidHeight + bottomGap + cardH;
  // Пирамида широкая и на высоких экранах оставляет место снизу:
  // центрируем всю группу по вертикали вместо жёсткой привязки к верху.
  const topY = margin + Math.max(0, (H - margin * 2 - groupHeight) / 2);
  const stockY = topY + pyramidHeight + bottomGap;
  const bottomW = cardW * 2 + cardW * 0.35;
  const stockX = centerX - bottomW / 2;
  const wasteX = stockX + cardW + cardW * 0.35;
  const selected = selectedIdSet(options.selected);
  const hintIds = new Set(options.hint?.cards ?? []);
  const cards: ViewCard[] = [];
  const slots = [];

  slots.push({
    id: 'pyramid-stock',
    kind: 'stock' as const,
    x: stockX,
    y: stockY,
    width: cardW,
    height: cardH,
    label: 'Колода',
    badge: state.stock.length ? String(state.stock.length) : '',
    interactive: true,
  });
  slots.push({
    id: 'pyramid-waste',
    kind: 'waste' as const,
    x: wasteX,
    y: stockY,
    width: cardW,
    height: cardH,
    label: 'Сброс',
    badge: state.stock.length === 0 && state.waste.length > 0 ? '↻' : '',
    interactive: true,
  });

  state.stock.forEach((item, index) => {
    cards.push({
      id: item.card.id,
      suit: item.card.suit,
      rank: item.card.rank,
      faceUp: false,
      x: stockX,
      y: stockY,
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
      x: wasteX,
      y: stockY,
      width: cardW,
      height: cardH,
      depth: 300 + index,
      interactive: index === wasteTop,
      draggable: index === wasteTop && item.card.rank !== 13,
    });
  });

  state.pyramid.forEach((row, rowIndex) => {
    row.forEach((item, colIndex) => {
      if (state.removed[rowIndex][colIndex]) return;
      const available = isPyramidCardAvailable(state, rowIndex, colIndex);
      const x = centerX - cardW / 2 + (colIndex - rowIndex / 2) * stepX;
      const y = topY + rowIndex * stepY;
      cards.push({
        id: item.card.id,
        suit: item.card.suit,
        rank: item.card.rank,
        faceUp: true,
        x,
        y,
        width: cardW,
        height: cardH,
        depth: 100 + rowIndex * 30 + colIndex,
        interactive: available,
        draggable: available && item.card.rank !== 13,
      });
      if (available) {
        // Невидимая цель для перетаскивания и подсветки: сама карта
        // рисуется отдельно, а зона нужна только для поиска пары.
        slots.push({
          id: `pyramid-${rowIndex}-${colIndex}`,
          kind: 'pyramid' as const,
          x,
          y,
          width: cardW,
          height: cardH,
          interactive: false,
        });
      }
    });
  });

  return {
    gameId: 'pyramid',
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
