import type { Rank, Suit } from '../../core/cards/Card';
import type { GameId, Hint } from '../../core/games/types';
import type { Selection } from '../adapters/interactions';
import type { CardBackId } from '../../store/profile';

export type SlotKind =
  | 'stock'
  | 'waste'
  | 'foundation'
  | 'tableau'
  | 'freecell'
  | 'completed'
  | 'pyramid';

export interface ViewCard {
  id: string;
  suit: Suit;
  rank: Rank;
  faceUp: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
  interactive: boolean;
  draggable: boolean;
}

export interface ViewSlot {
  id: string;
  kind: SlotKind;
  x: number;
  y: number;
  width: number;
  height: number;
  hitHeight?: number;
  label?: string;
  badge?: string;
  interactive?: boolean;
}

export interface BoardView {
  gameId: GameId;
  width: number;
  height: number;
  cardWidth: number;
  cardHeight: number;
  cards: ViewCard[];
  slots: ViewSlot[];
  selectedIds: string[];
  hintIds: string[];
  hintSlotIds: string[];
  dropSlotIds: string[];
  cardBack: CardBackId;
  dealKey: string;
  animations: boolean;
}

export interface PresentOptions {
  width: number;
  height: number;
  selected: Selection | null;
  hint: Hint | null;
  hintSlotIds: string[];
  dropSlotIds: string[];
  cardBack: CardBackId;
  animations: boolean;
}

export function selectedIdSet(selected: Selection | null): Set<string> {
  return new Set(selected?.cards ?? []);
}

export function computeFan(
  count: number,
  cardHeight: number,
  availableHeight: number,
  gapForIndex: (index: number) => number,
): { gaps: number[]; scale: number } {
  if (count <= 1) return { gaps: [], scale: 1 };
  const raw: number[] = [];
  for (let i = 0; i < count - 1; i++) raw.push(gapForIndex(i));
  const total = raw.reduce((a, b) => a + b, 0);
  const maxGaps = Math.max(0, availableHeight - cardHeight);
  const scale = total > maxGaps ? (total > 0 ? maxGaps / total : 0) : 1;
  return { gaps: raw.map((g) => Math.max(2, g * scale)), scale };
}
