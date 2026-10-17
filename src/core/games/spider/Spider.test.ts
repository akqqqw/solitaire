import { describe, expect, it } from 'vitest';
import { spiderFixture } from '../../../tests/helpers';
import {
  applySpiderMove,
  createSpiderGame,
  legalSpiderMoves,
  spiderModule,
  type SpiderState,
} from './Spider';

describe('Паук: раздача', () => {
  it('раздаёт 54 карты в 10 столбцов и оставляет 50 в колоде', () => {
    const state = createSpiderGame({ seed: 'spider-1', suitCount: 4 });
    expect(state.columns).toHaveLength(10);
    expect(state.columns.map((c) => c.length)).toEqual([6, 6, 6, 6, 5, 5, 5, 5, 5, 5]);
    state.columns.forEach((col) => {
      expect(col[col.length - 1].faceUp).toBe(true);
      for (let i = 0; i < col.length - 1; i++) expect(col[i].faceUp).toBe(false);
    });
    expect(state.stock).toHaveLength(50);
    const all = [...state.columns.flat(), ...state.stock].map((p) => p.card.id);
    expect(all).toHaveLength(104);
    expect(new Set(all).size).toBe(104);
    expect(state.completed).toHaveLength(0);
  });

  it('одинаковый seed и уровень дают одинаковую раздачу', () => {
    const a = createSpiderGame({ seed: 'spider-same', suitCount: 2 });
    const b = createSpiderGame({ seed: 'spider-same', suitCount: 2 });
    expect(a.columns).toEqual(b.columns);
    expect(a.stock).toEqual(b.stock);
  });

  it('на лёгком уровне используются только пики', () => {
    const state = createSpiderGame({ seed: 'one-suit', suitCount: 1 });
    const cards = [...state.columns.flat(), ...state.stock].map((p) => p.card);
    expect(cards.every((c) => c.suit === 'spades')).toBe(true);
  });
});

describe('Паук: ходы', () => {
  it('переносит последовательность одной масти и запрещает смешанную', () => {
    const sameSuit = spiderFixture({
      suitCount: 1,
      columns: [['7s#0', '6s#0'], ['8s#0']],
    });
    const next = applySpiderMove(sameSuit, { type: 'move', from: 0, to: 1, count: 2 });
    expect(next.columns[1].slice(-2).map((c) => c.card.id)).toEqual([
      'spades-7-0',
      'spades-6-0',
    ]);

    const mixed = spiderFixture({
      suitCount: 4,
      columns: [['7h#2', '6s#3'], ['8d#1'], ['7c#0']],
    });
    expect(() =>
      applySpiderMove(mixed, { type: 'move', from: 0, to: 1, count: 2 }),
    ).toThrow(/одной масти/);
    const single = applySpiderMove(mixed, { type: 'move', from: 0, to: 2, count: 1 });
    expect(single.columns[2].at(-1)?.card.id).toBe('spades-6-3');
  });

  it('запрещает раздачу при пустом столбце и раздаёт по одной карте в каждый', () => {
    const blocked = spiderFixture({
      columns: [['7s#0'], [], [], [], [], [], [], [], [], []],
    });
    expect(() => applySpiderMove(blocked, { type: 'deal' })).toThrow(/пустом столбце/);

    const state = createSpiderGame({ seed: 'deal', suitCount: 1 });
    const next = applySpiderMove(state, { type: 'deal' });
    expect(next.stock).toHaveLength(40);
    expect(next.columns.every((c) => c.length >= 2)).toBe(true);
    expect(next.columns.every((c) => c.at(-1)?.faceUp)).toBe(true);
    expect(next.score).toBe(499);
  });

  it('открывает карту под перенесённой', () => {
    const state = spiderFixture({
      suitCount: 4,
      columns: [['_2s#3', '7h#2'], ['8s#7']],
    });
    const next = applySpiderMove(state, { type: 'move', from: 0, to: 1, count: 1 });
    expect(next.columns[0]).toHaveLength(1);
    expect(next.columns[0][0].faceUp).toBe(true);
  });

  it('автоматически убирает полную последовательность король—туз', () => {
    const run = ['K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'].map(
      (r) => `${r}s#0`,
    );
    const state = spiderFixture({
      suitCount: 1,
      columns: [run, ['As#0']],
    });
    const next = applySpiderMove(state, { type: 'move', from: 1, to: 0, count: 1 });
    expect(next.completed).toHaveLength(1);
    expect(next.completed[0]).toHaveLength(13);
    expect(next.completed[0].map((c) => c.rank)).toEqual([
      13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1,
    ]);
    expect(next.columns[0]).toHaveLength(0);
    expect(next.score).toBe(599);
    expect(next.moves).toBe(1);
  });
});

describe('Паук: победа, подсказки и валидация', () => {
  it('считает победу при восьми собранных последовательностях', () => {
    const completed = Array.from({ length: 8 }, (_, copy) =>
      ['K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2', 'A'].map(
        (r) => `${r}s#${copy}`,
      ),
    );
    const state = spiderFixture({ suitCount: 1, completed });
    expect(state.completed).toHaveLength(8);
    expect(spiderModule.isWon(state)).toBe(true);
    expect(spiderModule.isValidState(state)).toBe(true);
  });

  it('не меняет состояние при подсказке и предлагает допустимый ход', () => {
    const state = createSpiderGame({ seed: 'hint', suitCount: 2 });
    const snapshot = structuredClone(state);
    const hint = spiderModule.hint(state);
    expect(hint).not.toBeNull();
    if (hint) {
      const next = applySpiderMove(state, hint.move);
      expect(next.moves).toBe(1);
    }
    expect(state).toEqual(snapshot);
    expect(legalSpiderMoves(state).length).toBeGreaterThan(0);
  });

  it('отсекает повреждённое сохранение', () => {
    const state = createSpiderGame({ seed: 'valid', suitCount: 4 });
    expect(spiderModule.isValidState(state)).toBe(true);
    const broken = structuredClone(state) as SpiderState;
    broken.stock.pop();
    expect(spiderModule.isValidState(broken)).toBe(false);
    const duplicate = structuredClone(state) as SpiderState;
    duplicate.columns[1].push(duplicate.columns[0][0]);
    expect(spiderModule.isValidState(duplicate)).toBe(false);
  });
});
