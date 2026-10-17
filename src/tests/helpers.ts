import type { Card, Suit } from '../core/cards/Card';
import { buildDeck } from '../core/cards/Deck';
import type { PlacedCard } from '../core/cards/Pile';
import type { KlondikeState } from '../core/games/klondike/Klondike';

const SUIT_BY_LETTER: Record<string, Suit> = {
  c: 'clubs',
  d: 'diamonds',
  h: 'hearts',
  s: 'spades',
};

const RANK_SHORT: Record<number, string> = {
  1: 'A',
  11: 'J',
  12: 'Q',
  13: 'K',
};

export function allCards(): Map<string, Card> {
  const map = new Map<string, Card>();
  for (const card of buildDeck()) {
    const rank = RANK_SHORT[card.rank] ?? String(card.rank);
    const short = `${rank}${card.suit[0]}`;
    map.set(short, card);
    map.set(short.toLowerCase(), card);
    map.set(card.id, card);
  }
  return map;
}

/** "7h" — открытая карта, "_7h" — закрытая. */
export function parseCardToken(token: string, pool: Map<string, Card>): Card {
  const id = token.replace(/^_/, '');
  const card = pool.get(id) ?? pool.get(id.toLowerCase());
  if (!card) throw new Error(`Нет карты ${token}`);
  return card;
}

export function makePlaced(token: string, pool: Map<string, Card>): PlacedCard {
  const faceUp = !token.startsWith('_');
  return { card: parseCardToken(token, pool), faceUp };
}

export interface KlondikeFixture {
  tableau?: string[][];
  stock?: string[];
  waste?: string[];
  foundations?: string[][];
  drawCount?: 1 | 3;
}

/** Собирает валидное состояние Косынки из коротких обозначений; остаток — в колоде. */
export function klondikeFixture(fixture: KlondikeFixture): KlondikeState {
  const pool = allCards();
  const used = new Set<string>();
  const take = (token: string): PlacedCard => {
    const pc = makePlaced(token, pool);
    if (used.has(pc.card.id)) throw new Error(`Карта использована дважды: ${token}`);
    used.add(pc.card.id);
    return pc;
  };
  const tableau = Array.from({ length: 7 }, (_, i) =>
    (fixture.tableau?.[i] ?? []).map(take),
  );
  const waste = (fixture.waste ?? []).map(take);
  const foundations = Array.from({ length: 4 }, (_, i) =>
    (fixture.foundations?.[i] ?? []).map((t) => ({ ...take(t), faceUp: true })),
  );
  const stock: PlacedCard[] = [];
  for (const token of fixture.stock ?? []) stock.push({ ...take(token), faceUp: false });
  const usedIds = new Set(used);
  for (const card of buildDeck()) {
    if (usedIds.has(card.id)) continue;
    if (used.size >= 52) break;
    if (stock.some((s) => s.card.id === card.id)) continue;
    used.add(card.id);
    stock.push({ card, faceUp: false });
  }
  if (used.size !== 52) throw new Error(`Задействовано ${used.size} карт вместо 52`);
  return {
    gameId: 'klondike',
    seed: 'test',
    drawCount: fixture.drawCount ?? 1,
    moves: 0,
    score: 0,
    won: false,
    createdAt: 0,
    tableau,
    stock,
    waste,
    foundations,
    stockPasses: 0,
  };
}

export function cardToken(id: string): string {
  const [suit, rank] = id.split('-');
  return `${rank}${(SUIT_BY_LETTER as Record<string, string>)[suit] ?? suit[0]}`;
}

// ---------------------------------------------------------------------------
// Общие фикстуры для Паука, FreeCell и Пирамиды
// ---------------------------------------------------------------------------

import { RANK_LABEL, SUITS, type Suit as SuitType } from '../core/cards/Card';
import { buildSpiderDeck, type SpiderSuitCount } from '../core/cards/Deck';
import type { SpiderState } from '../core/games/spider/Spider';
import type { FreeCellState } from '../core/games/freecell/FreeCell';
import type { PyramidState } from '../core/games/pyramid/Pyramid';

export function cardTokenFull(card: Card): string {
  const rank = RANK_LABEL[card.rank] ?? String(card.rank);
  return `${rank}${card.suit[0]}#${card.copy}`;
}

export function buildTokenPool(cards: readonly Card[]): Map<string, Card> {
  const map = new Map<string, Card>();
  for (const card of cards) {
    const rank = RANK_LABEL[card.rank] ?? String(card.rank);
    map.set(`${rank}${card.suit[0]}#${card.copy}`.toLowerCase(), card);
    map.set(`${rank}${card.suit[0]}`.toLowerCase(), card);
    map.set(card.id.toLowerCase(), card);
  }
  return map;
}

function resolveToken(token: string, pool: Map<string, Card>): Card {
  const clean = token.replace(/^_/, '');
  const card = pool.get(clean.toLowerCase());
  if (!card) throw new Error(`Нет карты ${token}`);
  return card;
}

export interface SpiderFixture {
  suitCount?: SpiderSuitCount;
  columns?: string[][];
  stock?: string[];
  completed?: string[][];
}

export function spiderFixture(fixture: SpiderFixture = {}): SpiderState {
  const suitCount = fixture.suitCount ?? 1;
  const cards = buildSpiderDeck(suitCount);
  const pool = buildTokenPool(cards);
  const used = new Set<string>();
  const take = (token: string): PlacedCard => {
    const card = resolveToken(token, pool);
    if (used.has(card.id)) throw new Error(`Карта использована дважды: ${token}`);
    used.add(card.id);
    return { card, faceUp: !token.startsWith('_') };
  };
  const columns = Array.from({ length: 10 }, (_, i) =>
    (fixture.columns?.[i] ?? []).map(take),
  );
  const stock: PlacedCard[] = (fixture.stock ?? []).map((t) => ({
    ...take(t),
    faceUp: false,
  }));
  const completed: Card[][] = (fixture.completed ?? []).map((run) =>
    run.map((token) => take(token).card),
  );
  for (const card of cards) {
    if (used.has(card.id)) continue;
    used.add(card.id);
    stock.push({ card, faceUp: false });
  }
  if (used.size !== cards.length) throw new Error('Не все карты распределены');
  return {
    gameId: 'spider',
    seed: 'test',
    suitCount,
    columns,
    stock,
    completed,
    moves: 0,
    score: 500,
    won: false,
    createdAt: 0,
  };
}

export interface FreeCellFixture {
  columns?: string[][];
  freeCells?: (string | null)[];
  foundations?: string[][];
}

export function freecellFixture(fixture: FreeCellFixture = {}): FreeCellState {
  const pool = allCards();
  const used = new Set<string>();
  const take = (token: string): PlacedCard => {
    const card = resolveToken(token, pool);
    if (used.has(card.id)) throw new Error(`Карта использована дважды: ${token}`);
    used.add(card.id);
    return { card, faceUp: true };
  };
  const columns = Array.from({ length: 8 }, (_, i) =>
    (fixture.columns?.[i] ?? []).map(take),
  );
  const freeCells: (PlacedCard | null)[] = Array.from({ length: 4 }, (_, i) => {
    const token = fixture.freeCells?.[i];
    return token ? take(token) : null;
  });
  const foundations = Array.from({ length: 4 }, (_, i) =>
    (fixture.foundations?.[i] ?? []).map((t) => ({ ...take(t), faceUp: true })),
  );
  for (const card of buildDeck()) {
    if (used.has(card.id)) continue;
    used.add(card.id);
    columns[7].unshift({ card, faceUp: true });
  }
  if (used.size !== 52) throw new Error(`Задействовано ${used.size} карт вместо 52`);
  return {
    gameId: 'freecell',
    seed: 'test',
    columns,
    freeCells,
    foundations,
    moves: 0,
    score: 0,
    won: false,
    createdAt: 0,
  };
}

export interface PyramidFixture {
  pyramid?: ((string | null)[] | null)[];
  removed?: boolean[][];
  stock?: string[];
  waste?: string[];
}

/** Незаполненные ячейки пирамиды заполняются оставшимися картами. */
export function pyramidFixture(fixture: PyramidFixture = {}): PyramidState {
  const pool = allCards();
  const used = new Set<string>();
  const take = (token: string): PlacedCard => {
    const card = resolveToken(token, pool);
    if (used.has(card.id)) throw new Error(`Карта использована дважды: ${token}`);
    used.add(card.id);
    return { card, faceUp: true };
  };
  const pyramidTokens: string[][] = Array.from({ length: 7 }, (_, row) =>
    Array.from({ length: row + 1 }, (_, col) => fixture.pyramid?.[row]?.[col] ?? ''),
  );
  // Сначала резервируем заданные карты.
  const placed: (PlacedCard | null)[][] = Array.from({ length: 7 }, (_, row) =>
    Array.from({ length: row + 1 }, (_, col) => {
      const token = pyramidTokens[row][col];
      return token ? take(token) : null;
    }),
  );
  const remaining = buildDeck().filter((card) => !used.has(card.id));
  let cursor = 0;
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col <= row; col++) {
      if (!placed[row][col]) {
        const card = remaining[cursor++];
        placed[row][col] = { card, faceUp: true };
        used.add(card.id);
      }
    }
  }
  const waste: PlacedCard[] = (fixture.waste ?? []).map((token) => ({
    ...take(token),
    faceUp: true,
  }));
  const stockTokens = fixture.stock ?? [];
  const stock: PlacedCard[] = stockTokens.map((token) => ({
    ...take(token),
    faceUp: false,
  }));
  for (const card of buildDeck()) {
    if (used.has(card.id)) continue;
    used.add(card.id);
    stock.push({ card, faceUp: false });
  }
  const removed = Array.from({ length: 7 }, (_, row) =>
    Array.from({ length: row + 1 }, (_, col) => fixture.removed?.[row]?.[col] ?? false),
  );
  return {
    gameId: 'pyramid',
    seed: 'test',
    pyramid: placed as PlacedCard[][],
    removed,
    stock,
    waste,
    moves: 0,
    score: 0,
    won: false,
    createdAt: 0,
    cycles: 0,
  };
}
