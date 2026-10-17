import { isOppositeColor, suitColor, type Card } from './Card';

/** Можно ли положить card на табличку с верхней картой target. */
export function canStackDescendingAlternating(card: Card, target: Card): boolean {
  return card.rank === target.rank - 1 && isOppositeColor(card, target);
}

export function canStackDescendingSameSuit(card: Card, target: Card): boolean {
  return card.rank === target.rank - 1 && suitColor(card.suit) === suitColor(target.suit);
}

export function isDescendingRun(cards: readonly Card[], sameSuit = false): boolean {
  for (let i = 1; i < cards.length; i++) {
    const prev = cards[i - 1];
    const cur = cards[i];
    if (cur.rank !== prev.rank - 1) return false;
    if (sameSuit ? cur.suit !== prev.suit : isOppositeColor(cur, prev) === false) return false;
  }
  return true;
}

/** Полная возрастающая последовательность одной масти от A до K (для базовых стопок). */
export function canPlaceOnFoundation(card: Card, top: Card | undefined): boolean {
  if (!top) return card.rank === 1;
  return top.suit === card.suit && card.rank === top.rank + 1;
}

export function isCompleteSuitRun(cards: readonly Card[]): boolean {
  if (cards.length !== 13) return false;
  const suit = cards[0]?.suit;
  for (let i = 0; i < 13; i++) {
    if (cards[i].suit !== suit || cards[i].rank !== i + 1) return false;
  }
  return true;
}

export function sameCard(a: Card | undefined, b: Card | undefined): boolean {
  return !!a && !!b && a.id === b.id;
}
