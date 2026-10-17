import { createCard, SUITS, type Card, type Rank, type Suit } from './Card';
import { RANKS } from './Card';

/** Одна стандартная колода из 52 карт. */
export function buildDeck(copiesPerSuit = 1): Card[] {
  const cards: Card[] = [];
  for (let copy = 0; copy < copiesPerSuit; copy++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push(createCard(suit, rank, copy));
      }
    }
  }
  return cards;
}

/** Колода Паука: 104 карты (две колоды) или ограниченный набор мастей. */
export function buildSpiderDeck(suitCount: 1 | 2 | 4): Card[] {
  const suits =
    suitCount === 1
      ? (['spades'] as const)
      : suitCount === 2
        ? (['spades', 'hearts'] as const)
        : SUITS;
  const copies = suitCount === 1 ? 8 : suitCount === 2 ? 4 : 2;
  const cards: Card[] = [];
  let copy = 0;
  for (let d = 0; d < copies; d++) {
    for (const suit of suits) {
      for (const rank of RANKS) {
        cards.push(createCard(suit, rank, copy));
      }
      copy++;
    }
  }
  return cards;
}

export type SpiderSuitCount = 1 | 2 | 4;

export function parseRank(value: number): Rank {
  if (!Number.isInteger(value) || value < 1 || value > 13) {
    throw new Error(`Некорректный номинал: ${value}`);
  }
  return value as Rank;
}

export function isSuit(value: string): value is Suit {
  return (SUITS as readonly string[]).includes(value);
}
