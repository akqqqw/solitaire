/**
 * Базовая карточная модель. Не зависит от Phaser и React.
 */

export const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'] as const;
export type Suit = (typeof SUITS)[number];

export const RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] as const;
export type Rank = (typeof RANKS)[number];

export type SuitColor = 'red' | 'black';

/**
 * Уникальный идентификатор карты внутри физической колоды.
 * Формат: "suit-rank-copy", например "hearts-13-0".
 * copy позволяет различать одинаковые карты в двухколодном Пауке.
 */
export type CardId = string;

export interface Card {
  readonly id: CardId;
  readonly suit: Suit;
  readonly rank: Rank;
  /** Номер физической копии (0 — первая колода, 1 — вторая). */
  readonly copy: number;
}

export interface CardStack {
  readonly cards: readonly Card[];
  /** Открыта ли верхняя карта. Для стопок пирамиды имеет смысл только here. */
  readonly faceUp: boolean;
}

export const SUIT_SYMBOL: Record<Suit, string> = {
  clubs: '♣',
  diamonds: '♦',
  hearts: '♥',
  spades: '♠',
};

export const SUIT_NAME_RU: Record<Suit, string> = {
  clubs: 'Трефы',
  diamonds: 'Бубны',
  hearts: 'Черви',
  spades: 'Пики',
};

export const RANK_LABEL: Record<Rank, string> = {
  1: 'A',
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'J',
  12: 'Q',
  13: 'K',
};

export function cardId(suit: Suit, rank: Rank, copy = 0): CardId {
  return `${suit}-${rank}-${copy}`;
}

export function createCard(suit: Suit, rank: Rank, copy = 0): Card {
  return { id: cardId(suit, rank, copy), suit, rank, copy };
}

export function suitColor(suit: Suit): SuitColor {
  return suit === 'hearts' || suit === 'diamonds' ? 'red' : 'black';
}

export function isRed(card: Card): boolean {
  return suitColor(card.suit) === 'red';
}

export function isOppositeColor(a: Card, b: Card): boolean {
  return suitColor(a.suit) !== suitColor(b.suit);
}

export function cardLabel(card: Card): string {
  return `${RANK_LABEL[card.rank]}${SUIT_SYMBOL[card.suit]}`;
}

/** Значение карты для Пирамиды. */
export function pyramidValue(card: Card): number {
  return card.rank;
}

export function assertUniqueCards(cards: readonly Card[], copiesPerDeck = 1): void {
  const seen = new Set<string>();
  for (const card of cards) {
    if (card.copy < 0 || card.copy >= copiesPerDeck) {
      throw new Error(`Некорректная копия карты: ${card.id}`);
    }
    if (seen.has(card.id)) throw new Error(`Дублирующаяся карта: ${card.id}`);
    seen.add(card.id);
  }
}
