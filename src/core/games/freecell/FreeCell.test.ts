import { describe, expect, it } from 'vitest';
import { freecellFixture } from '../../../tests/helpers';
import { freecellAdapter } from '../../../game/adapters/interactions';
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

describe('Свободная ячейка: номера раскладов, ячейки и адаптер', () => {
  it('каждый новый расклад получает числовой номер, а номер повторяет расклад', () => {
    const first = createFreeCellGame();
    const second = createFreeCellGame();
    expect(first.seed).toMatch(/^\d+$/);
    expect(second.seed).toMatch(/^\d+$/);
    expect(first.seed).not.toBe(second.seed);

    const a = createFreeCellGame({ seed: '482913' });
    const b = createFreeCellGame({ seed: '482913' });
    const c = createFreeCellGame({ seed: '482914' });
    expect(a.seed).toBe('482913');
    expect(a.columns).toEqual(b.columns);
    expect(a.columns).not.toEqual(c.columns);
  });

  it('завершённая партия не считается зависшей', () => {
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const suits = ['s', 'h', 'd', 'c'];
    const state = freecellFixture({
      foundations: suits.map((suit) => ranks.map((rank) => `${rank}${suit}`)),
    });
    expect(freecellModule.isWon(state)).toBe(true);
    expect(freecellModule.isStuck(state)).toBe(false);
    expect(freecellModule.hint(state)).toBeNull();
  });

  it('адаптер выделяет последовательность и учитывает лимит перекладывания', () => {
    const state = freecellFixture({
      columns: [['6h', '5s', '4d'], ['7c'], ['2d'], ['3d'], ['4c'], ['5c'], ['8d'], ['9d']],
    });
    const run = freecellAdapter.selectCards(state, 'hearts-6-0');
    expect(run?.cards).toEqual(['hearts-6-0', 'spades-5-0', 'diamonds-4-0']);
    expect(freecellAdapter.dropSlots(state, run)).toContain('freecell-column-1');

    const packed = freecellFixture({
      columns: [['6h', '5s', '4d'], ['7c'], ['2d'], ['3d'], ['4c'], ['5c'], ['8d'], ['9d']],
      freeCells: ['2h', '3h', '2s', '3s'],
    });
    expect(maxMovableCards(packed, false)).toBe(1);
    expect(freecellAdapter.dropSlots(packed, freecellAdapter.selectCards(packed, 'hearts-6-0'))).not.toContain(
      'freecell-column-1',
    );
  });

  it('адаптер переносит карту в ячейку и возвращает её двойным кликом', () => {
    const state = freecellFixture({ columns: [['6h'], ['As'], ['2d'], ['3d'], ['4c'], ['5c'], ['8d'], ['9d']] });
    const selected = freecellAdapter.selectCards(state, 'hearts-6-0');
    expect(selected?.slot).toBe('freecell-column-0');
    const toCell = freecellAdapter.clickSlot(state, 'freecell-cell-0', selected);
    expect(toCell.type).toBe('moves');
    if (toCell.type !== 'moves') return;
    const nextState = applyFreeCellMove(state, toCell.moves[0] as never);
    expect(nextState.freeCells[0]?.card.id).toBe('hearts-6-0');
    const back = freecellAdapter.doubleClick(nextState, 'hearts-6-0');
    expect(back.type).toBe('moves');
    if (back.type === 'moves') {
      expect(back.moves[0]).toMatchObject({
        from: { zone: 'freecell', index: 0 },
        to: { zone: 'tableau' },
      });
    }
  });

  it('из выбранной последовательности в базу уходит только верхняя карта', () => {
    const state = freecellFixture({
      columns: [
        ['4d', '3s', '2h', 'Ac'],
        ['5c'],
        ['2d'],
        ['3d'],
        ['4c'],
        ['8d'],
        ['9d'],
        ['10d'],
      ],
    });
    const selection = freecellAdapter.selectCards(state, 'diamonds-4-0');
    expect(selection?.cards).toHaveLength(4);
    const result = freecellAdapter.clickSlot(state, 'freecell-foundation-0', selection);
    expect(result.type).toBe('moves');
    if (result.type === 'moves') {
      expect(result.moves[0]).toMatchObject({ count: 1, to: { zone: 'foundation', index: 0 } });
      const next = applyFreeCellMove(state, result.moves[0] as never);
      expect(next.foundations[0].at(-1)?.card.id).toBe('clubs-1-0');
      expect(next.columns[0]).toHaveLength(3);
    }
  });

  it('двойной клик отправляет туза в базу, а не в ячейку', () => {
    const state = freecellFixture({ columns: [['As'], ['2d'], ['3d'], ['4c'], ['5c'], ['8d'], ['9d'], ['10d']] });
    const result = freecellAdapter.doubleClick(state, 'spades-1-0');
    expect(result.type).toBe('moves');
    if (result.type === 'moves') {
      expect(result.moves[0]).toMatchObject({
        from: { zone: 'tableau', index: 0 },
        to: { zone: 'foundation' },
      });
    }
  });

  it('автосборка через сессию убирает доступные базовые карты', async () => {
    const { GameSession } = await import('../../session/GameSession');
    const state = freecellFixture({
      columns: [['As'], ['Ah'], ['Ad'], ['Ac'], ['2d'], ['3d'], ['4c'], ['5c']],
    });
    const session = GameSession.restore(freecellModule, {
      gameId: 'freecell',
      state,
      undo: [],
      elapsedMs: 0,
      resultRecorded: false,
      hintsUsed: 0,
      savedAt: 0,
    });
    expect(session).not.toBeNull();
    const moved = session!.autoCollect();
    const afterAuto = session!.state as FreeCellState;
    expect(moved).toBe(6);
    // Четыре туза, затем двойка и тройка бубен поверх туза бубен.
    expect(afterAuto.foundations.map((pile) => pile.length)).toEqual([1, 1, 3, 1]);
    expect(session!.canUndo).toBe(true);
    session!.undo();
    const afterUndo = session!.state as FreeCellState;
    expect(afterUndo.foundations.every((pile) => pile.length === 0)).toBe(true);
  });
});
