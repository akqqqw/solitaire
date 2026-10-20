import { describe, expect, it } from 'vitest';
import { GAME_IDS, type GameId } from '../../core/games/types';
import { GAME_MODULES } from '../../core/games/registry';
import { presentBoard } from './index';
import { pyramidFixture } from '../../tests/helpers';
import { getBoardAdapter } from '../adapters/interactions';
import type { PyramidState } from '../../core/games/pyramid/Pyramid';

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

describe('presentPyramid — открытые карты и цели перетаскивания', () => {
  const options = {
    width: 390,
    height: 700,
    selected: null,
    hint: null,
    hintSlotIds: [],
    dropSlotIds: [],
    cardBack: 'emerald' as const,
    animations: false,
  };

  it('показывает 28 карт пирамиды и открывает только нижний ряд', () => {
    const module = GAME_MODULES.pyramid;
    const state = module.createGame({ seed: 'view-pyramid' }) as PyramidState;
    const view = presentBoard('pyramid', state, options);
    expect(view.cards).toHaveLength(52);
    const interactive = view.cards.filter((c) => c.interactive);
    expect(interactive).toHaveLength(7);
    expect(view.slots.filter((s) => s.kind === 'pyramid')).toHaveLength(7);
    expect(view.slots.filter((s) => s.kind === 'pyramid').every((s) => s.interactive === false)).toBe(
      true,
    );
    const bottomRow = state.pyramid[6].map((item) => item.card);
    for (const card of bottomRow) {
      const sprite = view.cards.find((c) => c.id === card.id)!;
      expect(sprite.interactive).toBe(true);
      expect(sprite.draggable).toBe(card.rank !== 13);
    }
    expect(view.cards.filter((c) => c.faceUp)).toHaveLength(28);
    expect(view.cards.filter((c) => !c.faceUp)).toHaveLength(24);
  });

  it('после снятия нижнего ряда открывает следующий и убирает снятые карты', () => {
    const state = pyramidFixture();
    state.removed[6] = state.removed[6].map(() => true);
    const view = presentBoard('pyramid', state, options);
    // 21 оставшаяся карта пирамиды + 24 колоды.
    expect(view.cards).toHaveLength(45);
    expect(view.cards.filter((c) => c.interactive)).toHaveLength(6);
    const slots = view.slots.filter((s) => s.kind === 'pyramid').map((s) => s.id);
    expect(slots).toContain('pyramid-5-0');
    expect(slots).toContain('pyramid-5-5');
    expect(slots).not.toContain('pyramid-6-0');
  });

  it('подсвечивает карты подсказки и открытую колоду', () => {
    const state = pyramidFixture({ waste: ['7h'] });
    const top = state.pyramid[6][0].card;
    const hint = {
      move: { type: 'remove' as const, a: { zone: 'pyramid' as const, row: 6, col: 0 } },
      cards: [top.id],
      text: 'Уберите пару',
    };
    const view = presentBoard('pyramid', state, {
      ...options,
      hint: hint as never,
      hintSlotIds: ['pyramid-6-0', 'pyramid-waste'],
    });
    expect(view.hintIds).toEqual([top.id]);
    expect(view.hintSlotIds).toEqual(['pyramid-6-0', 'pyramid-waste']);
  });
});

describe('Цели перетаскивания совпадают со слотами раскладки', () => {
  const options = {
    width: 390,
    height: 700,
    selected: null,
    hint: null,
    hintSlotIds: [],
    dropSlotIds: [],
    cardBack: 'emerald' as const,
    animations: false,
  };

  for (const gameId of GAME_IDS) {
    it(`${gameId}: каждый dropSlot существует в раскладке`, () => {
      const module = GAME_MODULES[gameId];
      const adapter = getBoardAdapter(gameId);
      let checked = 0;
      for (let index = 0; index < 10; index += 1) {
        let state = module.createGame({ seed: `${gameId}-targets-${index}` });
        for (let step = 0; step < 6; step += 1) {
          const moves = module.legalMoves(state);
          if (!moves.length) break;
          state = module.applyMove(state, moves[step % moves.length]);
        }
        const view = presentBoard(gameId, state, options);
        const slotIds = new Set(view.slots.map((slot) => slot.id));
        for (const card of view.cards) {
          const selection = adapter.selectCards(state, card.id);
          if (!selection) continue;
          for (const slot of adapter.dropSlots(state, selection)) {
            expect(slotIds.has(slot)).toBe(true);
            checked += 1;
          }
        }
      }
      expect(checked).toBeGreaterThan(0);
    });
  }
});
