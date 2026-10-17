import { describe, expect, it } from 'vitest';
import { GAME_IDS, type GameId } from '../../core/games/types';
import { GAME_MODULES } from '../../core/games/registry';
import { presentBoard } from './index';

const SIZES = [
  { width: 320, height: 480 },
  { width: 390, height: 700 },
  { width: 768, height: 620 },
  { width: 1440, height: 900 },
];

describe('presentBoard — раскладки всех режимов', () => {
  for (const gameId of GAME_IDS as GameId[]) {
    for (const size of SIZES) {
      it(`${gameId} ${size.width}×${size.height}: карты в пределах поля и без NaN`, () => {
        const module = GAME_MODULES[gameId];
        const state = module.createGame({});
        const view = presentBoard(gameId, state, {
          width: size.width,
          height: size.height,
          selected: null,
          hint: null,
          hintSlotIds: [],
          dropSlotIds: [],
          cardBack: 'emerald',
          animations: false,
        });

        expect(view.cards.length).toBeGreaterThan(0);
        expect(view.cardWidth).toBeGreaterThanOrEqual(20);
        expect(view.cardHeight).toBeGreaterThan(view.cardWidth);
        expect(Number.isFinite(view.cardWidth)).toBe(true);

        for (const card of view.cards) {
          expect(Number.isFinite(card.x)).toBe(true);
          expect(Number.isFinite(card.y)).toBe(true);
          expect(card.x).toBeGreaterThanOrEqual(-0.5);
          expect(card.y).toBeGreaterThanOrEqual(-0.5);
          expect(card.x + card.width).toBeLessThanOrEqual(size.width + 0.5);
          expect(card.y + card.height).toBeLessThanOrEqual(size.height + 0.5);
        }

        for (const slot of view.slots) {
          expect(Number.isFinite(slot.x)).toBe(true);
          expect(slot.x).toBeGreaterThanOrEqual(-0.5);
          expect(slot.x + slot.width).toBeLessThanOrEqual(size.width + 0.5);
        }
      });
    }
  }
});
