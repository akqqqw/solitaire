import { describe, expect, it } from 'vitest';
import { pyramidFixture } from '../../../tests/helpers';
import { pyramidAdapter } from '../../../game/adapters/interactions';
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
    expect(next.discard).toHaveLength(1);
    expect(pyramidModule.isValidState(next)).toBe(true);
    expect(next.score).toBe(10);

    const fromKing = pyramidFixture({ waste: ['Qs', 'Kh'] });
    const kingNext = applyPyramidMove(fromKing, { type: 'remove', a: { zone: 'waste' } });
    expect(kingNext.discard.map((item) => item.card.id)).toEqual(['hearts-13-0']);
    expect(kingNext.waste.map((item) => item.card.id)).toEqual(['spades-12-0']);
    expect(pyramidModule.isValidState(kingNext)).toBe(true);
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
    const oldSave = structuredClone(state) as PyramidState;
    delete (oldSave as Partial<PyramidState>).discard;
    expect(pyramidModule.isValidState(oldSave)).toBe(false);
    const brokenDiscard = structuredClone(state) as PyramidState;
    brokenDiscard.discard.push({ card: { ...state.pyramid[0][0].card }, faceUp: true });
    expect(pyramidModule.isValidState(brokenDiscard)).toBe(false);
    const falseWin = structuredClone(state) as PyramidState;
    falseWin.removed = Array.from({ length: 7 }, (_, row) =>
      Array.from({ length: row + 1 }, () => true),
    );
    expect(pyramidModule.isValidState(falseWin)).toBe(false);
    falseWin.won = true;
    expect(pyramidModule.isValidState(falseWin)).toBe(true);
  });
});

describe('Пирамида: круги сброса, подсказки и адаптер', () => {
  const safeRow = ['6h', '7s', '2c', '3c', '4c', '5c', '2h'];
  const drawRow = ['2c', '3c', '4c', '5c', '6c', '2h', '3h'];

  it('позволяет переворачивать сброс несколько раз', () => {
    let state = pyramidFixture({ pyramid: [null, null, null, null, null, null, safeRow] });
    const total = state.stock.length;
    for (let round = 0; round < 2; round += 1) {
      for (let i = 0; i < total; i += 1) state = applyPyramidMove(state, { type: 'draw' });
      expect(state.stock).toHaveLength(0);
      state = applyPyramidMove(state, { type: 'recycle' });
      expect(state.waste).toHaveLength(0);
      expect(state.stock).toHaveLength(total);
    }
    expect(state.cycles).toBe(2);
  });

  it('после победы не предлагает ходов и не считает партию зависшей', () => {
    const state = pyramidFixture({
      pyramid: [null, null, null, null, null, null, [null, null, null, null, null, null, 'Ks']],
      removed: emptyRemoved({ row: 6, col: 6 }),
    });
    const next = applyPyramidMove(state, {
      type: 'remove',
      a: { zone: 'pyramid', row: 6, col: 6 },
    });
    expect(next.won).toBe(true);
    expect(next.stock.length).toBeGreaterThan(0);
    expect(legalPyramidMoves(next)).toEqual([]);
    expect(pyramidModule.hint(next)).toBeNull();
    expect(pyramidModule.isStuck(next)).toBe(false);
  });

  it('подсказка предпочитает снятие пары, а не новую карту из колоды', () => {
    const state = pyramidFixture({ pyramid: [null, null, null, null, null, null, safeRow] });
    const hint = pyramidModule.hint(state);
    expect(hint?.move.type).toBe('remove');
    expect(hint?.cards).toEqual(['hearts-6-0', 'spades-7-0']);
  });

  it('подсказка «открыть карту» подсвечивает верх колоды, а «перевернуть» — сброс', () => {
    const drawState = pyramidFixture({ pyramid: [null, null, null, null, null, null, drawRow] });
    const drawHint = pyramidModule.hint(drawState);
    expect(drawHint?.move.type).toBe('draw');
    expect(drawHint?.cards).toEqual([drawState.stock[drawState.stock.length - 1].card.id]);
    expect(pyramidAdapter.hintSlotIds(drawState, drawHint)).toEqual(['pyramid-stock']);

    const recycleState = pyramidFixture({
      pyramid: [null, null, null, null, null, null, drawRow],
      waste: ['Qs'],
    });
    recycleState.stock = [];
    const recycleHint = pyramidModule.hint(recycleState);
    expect(recycleHint?.move.type).toBe('recycle');
    expect(recycleHint?.cards).toEqual([]);
    expect(pyramidAdapter.hintSlotIds(recycleState, recycleHint)).toEqual(['pyramid-waste']);
  });

  it('адаптер не даёт выбрать закрытую карту и убирает короля из сброса', () => {
    const state = pyramidFixture({ pyramid: [['6s'], null, null] });
    expect(pyramidAdapter.selectCards(state, 'spades-6-0')).toBeNull();
    const wasteKing = pyramidFixture({ waste: ['Kh'] });
    const result = pyramidAdapter.clickSlot(wasteKing, 'pyramid-waste', null);
    expect(result.type).toBe('moves');
    if (result.type === 'moves') {
      expect(result.moves[0]).toEqual({ type: 'remove', a: { zone: 'waste' } });
    }
  });

  it('адаптер поддерживает перетаскивание и двойной клик по паре', () => {
    const state = pyramidFixture({
      pyramid: [null, null, null, null, null, null, ['6h', '7s', 'Kd', '2c', '3c', '4c', '5c']],
      waste: ['7h'],
    });
    const selection = pyramidAdapter.selectCards(state, 'hearts-6-0');
    expect(selection?.slot).toBe('pyramid-6-0');
    const slots = pyramidAdapter.dropSlots(state, selection);
    expect(slots).toContain('pyramid-6-1');
    expect(slots).toContain('pyramid-waste');

    const dropped = pyramidAdapter.drop(state, ['hearts-6-0'], 'pyramid-6-1');
    expect(dropped.type).toBe('moves');

    const wastePair = pyramidAdapter.drop(state, ['hearts-6-0'], 'pyramid-waste');
    expect(wastePair.type).toBe('moves');

    const double = pyramidAdapter.doubleClick(state, 'hearts-6-0');
    expect(double.type).toBe('moves');

    const king = pyramidAdapter.doubleClick(state, 'diamonds-13-0');
    expect(king.type).toBe('moves');
    if (king.type === 'moves') {
      expect(king.moves[0]).toEqual({ type: 'remove', a: { zone: 'pyramid', row: 6, col: 2 } });
    }
  });

  it('подсветка подсказки возвращает слоты обеих карт пары', () => {
    const state = pyramidFixture({ pyramid: [null, null, null, null, null, null, safeRow] });
    const hint = pyramidModule.hint(state);
    expect(pyramidAdapter.hintSlotIds(state, hint)).toEqual(['pyramid-6-0', 'pyramid-6-1']);
  });
});
