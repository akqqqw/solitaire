import { describe, expect, it } from 'vitest';
import { freecellFixture } from '../../../tests/helpers';
import {
  applyFreeCellMove,
  countEmptyColumns,
  countFreeCells,
  createFreeCellGame,
  freecellModule,
  legalFreeCellMoves,
  maxMovableCards,
  type FreeCellState,
} from './FreeCell';

describe('Свободная ячейка: раздача', () => {
  it('раскладывает 52 открытые карты в восемь столбцов', () => {
    const state = createFreeCellGame({ seed: 'fc-1' });
    expect(state.columns).toHaveLength(8);
    expect(state.columns.map((c) => c.length)).toEqual([7, 7, 7, 7, 6, 6, 6, 6]);
    expect(state.columns.flat().every((c) => c.faceUp)).toBe(true);
    expect(state.freeCells).toHaveLength(4);
    expect(state.freeCells.every((c) => c === null)).toBe(true);
    expect(state.foundations).toHaveLength(4);
    expect(state.columns.flat()).toHaveLength(52);
    expect(new Set(state.columns.flat().map((c) => c.card.id)).size).toBe(52);
    expect(countFreeCells(state)).toBe(4);
    expect(countEmptyColumns(state)).toBe(0);
  });

  it('одинаковый seed воспроизводит расклад', () => {
    const a = createFreeCellGame({ seed: 'fc-same' });
    const b = createFreeCellGame({ seed: 'fc-same' });
    expect(a.columns).toEqual(b.columns);
    const c = createFreeCellGame({ seed: 'fc-other' });
    expect(a.columns).not.toEqual(c.columns);
  });

  it('корректно считает лимит переноса по формуле FreeCell', () => {
    const state = createFreeCellGame({ seed: 'fc-math' });
    expect(maxMovableCards(state, false)).toBe(5);
    expect(maxMovableCards(state, true)).toBe(5);
    const modified = structuredClone(state) as FreeCellState;
    modified.columns[0] = [];
    modified.columns[1] = [];
    modified.freeCells = [null, null, null, null];
    expect(countEmptyColumns(modified)).toBe(2);
    expect(maxMovableCards(modified, false)).toBe((4 + 1) * 4);
    expect(maxMovableCards(modified, true)).toBe((4 + 1) * 2);
    modified.freeCells = [null, null, null, modified.columns[2][0]];
    expect(maxMovableCards(modified, false)).toBe((3 + 1) * 4);
  });
});

describe('Свободная ячейка: правила', () => {
  it('разрешает убывание с чередованием и запрещает одинаковый цвет', () => {
    const state = freecellFixture({
      columns: [['6h'], ['7c'], ['7d'], []],
    });
    const valid = applyFreeCellMove(state, {
      type: 'move',
      from: { zone: 'tableau', index: 0 },
      to: { zone: 'tableau', index: 1 },
      count: 1,
    });
    expect(valid.columns[1].at(-1)?.card.id).toBe('hearts-6-0');
    expect(valid.moves).toBe(1);

    expect(() =>
      applyFreeCellMove(state, {
        type: 'move',
        from: { zone: 'tableau', index: 0 },
        to: { zone: 'tableau', index: 2 },
        count: 1,
      }),
    ).toThrow(/подходит/);
  });

  it('перекладывает одну карту в свободную ячейку и обратно', () => {
    const state = freecellFixture({ columns: [['6h'], ['7c'], []] });
    const inCell = applyFreeCellMove(state, {
      type: 'move',
      from: { zone: 'tableau', index: 0 },
      to: { zone: 'freecell', index: 0 },
      count: 1,
    });
    expect(inCell.freeCells[0]?.card.id).toBe('hearts-6-0');
    expect(inCell.columns[0]).toHaveLength(0);
    const back = applyFreeCellMove(inCell, {
      type: 'move',
      from: { zone: 'freecell', index: 0 },
      to: { zone: 'tableau', index: 1 },
      count: 1,
    });
    expect(back.freeCells[0]).toBeNull();
    expect(back.columns[1].at(-1)?.card.id).toBe('hearts-6-0');
    expect(() =>
      applyFreeCellMove(inCell, {
        type: 'move',
        from: { zone: 'tableau', index: 1 },
        to: { zone: 'freecell', index: 0 },
        count: 1,
      }),
    ).toThrow(/занята/);
  });

  it('строит базовую стопку от туза', () => {
    const state = freecellFixture({ columns: [['As'], ['2s'], ['4h']] });
    const withAce = applyFreeCellMove(state, {
      type: 'move',
      from: { zone: 'tableau', index: 0 },
      to: { zone: 'foundation', index: 0 },
      count: 1,
    });
    const withTwo = applyFreeCellMove(withAce, {
      type: 'move',
      from: { zone: 'tableau', index: 1 },
      to: { zone: 'foundation', index: 0 },
      count: 1,
    });
    expect(withTwo.foundations[0].map((c) => c.card.id)).toEqual([
      'spades-1-0',
      'spades-2-0',
    ]);
    expect(withTwo.score).toBe(20);
    expect(() =>
      applyFreeCellMove(withTwo, {
        type: 'move',
        from: { zone: 'foundation', index: 0 },
        to: { zone: 'tableau', index: 2 },
        count: 1,
      }),
    ).toThrow(/подходит/);
  });

  it('ограничивает перенос последовательности свободными ячейками и столбцами', () => {
    const blocked = freecellFixture({
      columns: [
        ['6h', '5s'],
        ['7c'],
        ['2d'],
        ['3d'],
        ['4d'],
        ['5d'],
        ['8d'],
        ['9d'],
      ],
      freeCells: ['2c', '3c', '4c', '5c'],
    });
    expect(countEmptyColumns(blocked)).toBe(0);
    expect(maxMovableCards(blocked, false)).toBe(1);
    expect(() =>
      applyFreeCellMove(blocked, {
        type: 'move',
        from: { zone: 'tableau', index: 0 },
        to: { zone: 'tableau', index: 1 },
        count: 2,
      }),
    ).toThrow(/Недостаточно/);

    const free = freecellFixture({
      columns: [
        ['6h', '5s'],
        ['7c'],
        ['2d'],
        ['3d'],
        ['4d'],
        ['5d'],
        ['8d'],
        ['9d'],
      ],
    });
    const next = applyFreeCellMove(free, {
      type: 'move',
      from: { zone: 'tableau', index: 0 },
      to: { zone: 'tableau', index: 1 },
      count: 2,
    });
    expect(next.columns[1].slice(-2).map((c) => c.card.id)).toEqual([
      'hearts-6-0',
      'spades-5-0',
    ]);
  });

  it('не позволяет перенести 6 карт при пустых ячейках и занятых столбцах', () => {
    const state = freecellFixture({
      columns: [
        ['6h', '5s', '4d', '3c', '2h', 'Ac'],
        ['7c'],
        ['2d'],
        ['3d'],
        ['5d'],
        ['8d'],
        ['9d'],
        ['10d'],
      ],
    });
    expect(maxMovableCards(state, false)).toBe(5);
    expect(() =>
      applyFreeCellMove(state, {
        type: 'move',
        from: { zone: 'tableau', index: 0 },
        to: { zone: 'tableau', index: 1 },
        count: 6,
      }),
    ).toThrow(/Недостаточно/);
  });
});

describe('Свободная ячейка: победа, подсказки, валидация', () => {
  it('определяет победу после сбора всех четырёх стопок', () => {
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q'];
    const suits = ['s', 'h', 'd', 'c'];
    const foundations = suits.map((suit) => ranks.map((r) => `${r}${suit}`));
    const kings = suits.map((suit) => `K${suit}`);
    const state = freecellFixture({
      columns: kings.map((k) => [k]),
      foundations,
    });
    let next = state;
    for (let i = 0; i < 4; i++) {
      next = applyFreeCellMove(next, {
        type: 'move',
        from: { zone: 'tableau', index: i },
        to: { zone: 'foundation', index: i },
        count: 1,
      });
    }
    expect(next.won).toBe(true);
    expect(freecellModule.isWon(next)).toBe(true);
    expect(next.score).toBe(620);
  });

  it('выдаёт допустимую подсказку, не меняя состояние', () => {
    const state = createFreeCellGame({ seed: 'fc-hint' });
    const snapshot = structuredClone(state);
    const hint = freecellModule.hint(state);
    expect(hint).not.toBeNull();
    if (hint) {
      const next = applyFreeCellMove(state, hint.move);
      expect(next.moves).toBe(1);
    }
    expect(state).toEqual(snapshot);
    expect(legalFreeCellMoves(state).length).toBeGreaterThan(0);
  });

  it('отсекает повреждённые сохранения', () => {
    const state = createFreeCellGame({ seed: 'fc-valid' });
    expect(freecellModule.isValidState(state)).toBe(true);
    const broken = structuredClone(state) as FreeCellState;
    broken.columns[0].pop();
    expect(freecellModule.isValidState(broken)).toBe(false);
    const dup = structuredClone(state) as FreeCellState;
    dup.freeCells[0] = dup.columns[1][0];
    expect(freecellModule.isValidState(dup)).toBe(false);
  });
});
