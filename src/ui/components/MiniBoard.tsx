import type { GameId } from '../../core/games/types';
import type { Rank, Suit } from '../../core/cards/Card';
import { CardArt } from './CardArt';

interface MiniCard {
  suit: Suit;
  rank: Rank;
  left: number;
  top: number;
  rotate?: number;
  faceUp?: boolean;
}

const KLONDIKE: MiniCard[] = [
  { suit: 'spades', rank: 13, left: 2, top: 46 },
  { suit: 'hearts', rank: 12, left: 12, top: 56 },
  { suit: 'clubs', rank: 9, left: 24, top: 43 },
  { suit: 'diamonds', rank: 7, left: 34, top: 56, rotate: 2 },
  { suit: 'hearts', rank: 5, left: 46, top: 43 },
  { suit: 'spades', rank: 4, left: 56, top: 54 },
  { suit: 'clubs', rank: 6, left: 68, top: 46 },
  { suit: 'hearts', rank: 1, left: 76, top: 12, rotate: 5 },
  { suit: 'spades', rank: 1, left: 64, top: 10, rotate: -4 },
  { suit: 'diamonds', rank: 1, left: 88, top: 10, rotate: 8 },
];

const SPIDER: MiniCard[] = [0, 1, 2, 3, 4, 5, 6].flatMap((i) => [
  {
    suit: (['spades', 'hearts', 'clubs', 'diamonds'] as Suit[])[i % 4],
    rank: (12 - i) as Rank,
    left: 3 + i * 13.5,
    top: 30,
    faceUp: false,
  },
  {
    suit: (['spades', 'hearts', 'clubs', 'diamonds'] as Suit[])[(i + 2) % 4],
    rank: (11 - i) as Rank,
    left: 3 + i * 13.5,
    top: 44,
  },
]);

const FREECELL: MiniCard[] = [
  { suit: 'spades', rank: 1, left: 4, top: 10 },
  { suit: 'hearts', rank: 2, left: 4, top: 52 },
  { suit: 'clubs', rank: 8, left: 4, top: 62, faceUp: false },
  { suit: 'diamonds', rank: 13, left: 24, top: 10, faceUp: false },
  { suit: 'hearts', rank: 11, left: 24, top: 52 },
  { suit: 'clubs', rank: 7, left: 24, top: 62, faceUp: false },
  { suit: 'spades', rank: 12, left: 44, top: 10, faceUp: false },
  { suit: 'diamonds', rank: 9, left: 44, top: 52 },
  { suit: 'spades', rank: 6, left: 44, top: 62, faceUp: false },
  { suit: 'clubs', rank: 3, left: 64, top: 52 },
  { suit: 'hearts', rank: 6, left: 64, top: 62, faceUp: false },
  { suit: 'diamonds', rank: 4, left: 84, top: 52, faceUp: false },
];

const PYRAMID: MiniCard[] = [0, 1, 2, 3, 4].flatMap((row) =>
  Array.from({ length: row + 1 }, (_, col) => ({
    suit: (['spades', 'hearts', 'diamonds', 'clubs'] as Suit[])[(row + col) % 4],
    rank: ((row * 3 + col * 2) % 10 + 2) as Rank,
    left: 50 - (row * 10) / 2 + col * 10,
    top: 12 + row * 14,
    faceUp: true,
  })),
);

const DECKS: Record<GameId, MiniCard[]> = {
  klondike: KLONDIKE,
  spider: SPIDER,
  freecell: FREECELL,
  pyramid: PYRAMID,
};

export function MiniBoard({ game }: { game: GameId }) {
  const cards = DECKS[game];
  return (
    <div className={`mini-board mini-${game}`} aria-hidden="true">
      <div className="mini-glow" />
      {cards.map((card, index) => (
        <CardArt
          key={`${game}-${index}`}
          suit={card.suit}
          rank={card.rank}
          faceUp={card.faceUp !== false}
          className="mini-card"
          style={{
            left: `${card.left}%`,
            top: `${card.top}%`,
            transform: `rotate(${card.rotate ?? 0}deg)`,
            zIndex: index,
          }}
        />
      ))}
    </div>
  );
}
