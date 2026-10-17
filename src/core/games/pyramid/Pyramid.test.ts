import { describe, expect, it } from 'vitest';
import { pyramidFixture } from '../../../tests/helpers';
import {
  applyPyramidMove,
  createPyramidGame,
  isPyramidCardAvailable,
  legalPyramidMoves,
  pyramidModule,
  type PyramidState,
} from './Pyramid';

const emptyRemoved = (except?: { row: number; col: number }) =>
  Array.from({ length: 7 }, (_, row) =>
    Array.from({ length: row + 1 }, (_, col) => !(except && except.row === row && except.col === col)),
  );

describe('Пирамида: раздача', () => {
  it('выкладывает 28 карт пирамидой и оставляет 24 в колоде', () => {
    const state = createPyramidGame({ seed: 'pyr-1' });
    expect(state.pyramid.map((row) => row.length)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(state.pyramid.flat()).toHaveLength(28);
    expect(state.stock).toHaveLength(24);
    expect(state.waste).toHaveLength(0);
    const ids = [...state.pyramid.flat(), ...state.stock, ...state.waste].map(
      (p) => p.card.id,
    );
    expect(ids).toHaveLength(52);
    expect(new Set(ids).size).toBe(52);
    expect(state.pyramid.flat().every((c) => c.faceUp)).toBe(true);
    expect(state.stock.every((c) => c.faceUp === false)).toBe(true);
  });

  it('одинаковый seed даёт одинаковую раздачу', () => {
    const a = createPyramidGame({ seed: 'pyr-same' });
    const b = createPyramidGame({ seed: 'pyr-same' });
    expect(a.pyramid).toEqual(b.pyramid);
    expect(a.stock).toEqual(b.stock);
  });
});

describe('Пирамида: доступность карт', () => {
  it('верхняя карта закрыта, пока не убраны обе карты под ней', () => {
    const state = pyramidFixture({
      pyramid: [['Ks'], null, null],
      removed: [
        [false],
        [false, false],
        [false, false, false],
      ],
    });
    expect(isPyramidCardAvailable(state, 0, 0)).toBe(false);
    expect(isPyramidCardAvailable(state, 6, 0)).toBe(true);
    state.removed[1][0] = true;
    expect(isPyramidCardAvailable(state, 0, 0)).toBe(false);
    state.removed[1][1] = true;
    expect(isPyramidCardAvailable(state, 0, 0)).toBe(true);
  });
});

describe('Пирамида: удаление карт', () => {
  it('убирает короля отдельно', () => {
    const state = pyramidFixture({
      pyramid: [null, null, null, null, null, null, [null, null, null, null, null, null, 'Ks']],
    });
    const next = applyPyramidMove(state, {
      type: 'remove',
      a: { zone: 'pyramid', row: 6, col: 6 },
    });
    expect(next.removed[6][6]).toBe(true);
    expect(next.moves).toBe(1);
    expect(next.score).toBe(10);
  });

  it('убирает пару с суммой 13 и отклоняет неверную сумму', () => {
    const state = pyramidFixture({
      pyramid: [null, null, null, null, null, null, ['6h', '7s', null, null, null, null, null]],
    });
    const next = applyPyramidMove(state, {
      type: 'remove',
      a: { zone: 'pyramid', row: 6, col: 0 },
      b: { zone: 'pyramid', row: 6, col: 1 },
    });
    expect(next.removed[6][0]).toBe(true);
    expect(next.removed[6][1]).toBe(true);
    expect(next.score).toBe(20);

    const bad = pyramidFixture({
      pyramid: [null, null, null, null, null, null, ['6h', '8s', null, null, null, null, null]],
    });
    expect(() =>
      applyPyramidMove(bad, {
        type: 'remove',
        a: { zone: 'pyramid', row: 6, col: 0 },
        b: { zone: 'pyramid', row: 6, col: 1 },
      }),
    ).toThrow(/13/);
  });

  it('нельзя убрать пару из двух карт сброса', () => {
    const state = pyramidFixture({ waste: ['6h', '7s'] });
    expect(() =>
      applyPyramidMove(state, {
        type: 'remove',
        a: { zone: 'waste' },
        b: { zone: 'waste' },
      }),
    ).toThrow(/сброса/);
  });

  it('разрешает пару «верх сброса + открытая карта пирамиды»', () => {
    const state = pyramidFixture({
      waste: ['7h'],
      pyramid: [null, null, null, null, null, null, ['6s', null, null, null, null, null, null]],
    });
    const next = applyPyramidMove(state, {
      type: 'remove',
      a: { zone: 'pyramid', row: 6, col: 0 },
      b: { zone: 'waste' },
    });
    expect(next.removed[6][0]).toBe(true);
    expect(next.waste).toHaveLength(0);
    expect(next.score).toBe(10);
  });

  it('запрещает брать закрытую карту пирамиды', () => {
    const state = pyramidFixture({
      waste: ['7h'],
      pyramid: [['6s'], null, null],
    });
    expect(() =>
      applyPyramidMove(state, {
        type: 'remove',
        a: { zone: 'pyramid', row: 0, col: 0 },
        b: { zone: 'waste' },
      }),
    ).toThrow(/недоступна/);
  });
});

describe('Пирамида: колода и сброс', () => {
  it('открывает по одной карте и переворачивает сброс', () => {
    let state = pyramidFixture();
    const initialStock = state.stock.length;
    expect(initialStock).toBeGreaterThan(0);
    const lastId = state.stock[state.stock.length - 1].card.id;
    state = applyPyramidMove(state, { type: 'draw' });
    expect(state.stock).toHaveLength(initialStock - 1);
    expect(state.waste).toHaveLength(1);
    expect(state.waste[0].faceUp).toBe(true);
    for (let i = 1; i < initialStock; i++) state = applyPyramidMove(state, { type: 'draw' });
    expect(state.stock).toHaveLength(0);
    expect(state.waste).toHaveLength(initialStock);
    state = applyPyramidMove(state, { type: 'recycle' });
    expect(state.stock).toHaveLength(initialStock);
    expect(state.waste).toHaveLength(0);
    expect(state.cycles).toBe(1);
    expect(state.stock.every((c) => !c.faceUp)).toBe(true);
    state = applyPyramidMove(state, { type: 'draw' });
    expect(state.waste[0].card.id).toBe(lastId);
  });
});

describe('Пирамида: победа, подсказки, валидация', () => {
  it('определяет победу после удаления последней карты', () => {
    const state = pyramidFixture({
      pyramid: [null, null, null, null, null, null, [null, null, null, null, null, null, 'Ks']],
      removed: emptyRemoved({ row: 6, col: 6 }),
    });
    expect(pyramidModule.isWon(state)).toBe(false);
    const next = applyPyramidMove(state, {
      type: 'remove',
      a: { zone: 'pyramid', row: 6, col: 6 },
    });
    expect(next.won).toBe(true);
    expect(pyramidModule.isWon(next)).toBe(true);
    expect(next.score).toBe(380);
  });

  it('подсказка не меняет состояние и предлагает валидный ход', () => {
    const state = createPyramidGame({ seed: 'pyr-hint' });
    const snapshot = structuredClone(state);
    const hint = pyramidModule.hint(state);
    expect(hint).not.toBeNull();
    if (hint) {
      const next = applyPyramidMove(state, hint.move);
      expect(next.moves).toBe(1);
    }
    expect(state).toEqual(snapshot);
    expect(legalPyramidMoves(state).length).toBeGreaterThan(0);
  });

  it('отсекает повреждённые сохранения', () => {
    const state = createPyramidGame({ seed: 'pyr-valid' });
    expect(pyramidModule.isValidState(state)).toBe(true);
    const broken = structuredClone(state) as PyramidState;
    broken.stock.pop();
    expect(pyramidModule.isValidState(broken)).toBe(false);
    const dup = structuredClone(state) as PyramidState;
    dup.stock[0] = dup.pyramid[0][0];
    expect(pyramidModule.isValidState(dup)).toBe(false);
  });
});
