import type { Card } from './Card';

export interface PlacedCard {
  card: Card;
  faceUp: boolean;
}

export function placed(card: Card, faceUp: boolean): PlacedCard {
  return { card, faceUp };
}

export function topOf<T>(items: readonly T[]): T | undefined {
  return items.length ? items[items.length - 1] : undefined;
}

export function topPlaced(cards: readonly PlacedCard[]): PlacedCard | undefined {
  return topOf(cards);
}

export function cloneState<T>(state: T): T {
  if (typeof structuredClone === 'function') return structuredClone(state);
  return JSON.parse(JSON.stringify(state)) as T;
}

export function isPlacedCard(value: unknown): value is PlacedCard {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  const card = v.card as Record<string, unknown> | undefined;
  return (
    typeof v.faceUp === 'boolean' &&
    !!card &&
    typeof card.id === 'string' &&
    typeof card.suit === 'string' &&
    typeof card.rank === 'number'
  );
}

export function isCardLike(value: unknown): value is Card {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.id === 'string' &&
    typeof c.suit === 'string' &&
    typeof c.rank === 'number' &&
    c.rank >= 1 &&
    c.rank <= 13 &&
    typeof c.copy === 'number'
  );
}
