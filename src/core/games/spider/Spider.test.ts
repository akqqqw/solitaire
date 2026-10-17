import { describe, expect, it } from 'vitest';
import { spiderAdapter } from '../../../game/adapters/interactions';
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

describe('Паук: раздачи, удаление и подсчёт', () => {
  it('разрешает ровно пять раздач, затем колода пуста', () => {
    let state = createSpiderGame({ seed: 'five-deals', suitCount: 4 });
    for (let deal = 0; deal < 5; deal += 1) {
      expect(legalSpiderMoves(state).some((m) => m.type === 'deal')).toBe(true);
      state = applySpiderMove(state, { type: 'deal' });
    }
    expect(state.stock).toHaveLength(0);
    expect(state.columns.every((col) => col.length >= 10)).toBe(true);
    expect(legalSpiderMoves(state).some((m) => m.type === 'deal')).toBe(false);
    expect(() => applySpiderMove(state, { type: 'deal' })).toThrow(/недостаточно/);
    expect(spiderModule.isValidState(state)).toBe(true);
  });

  it('не убирает 13 карт, если последовательность смешана по мастям', () => {
    const mixed = ['Ks#3', 'Qh#2', 'Js#3', '10h#2', '9s#3', '8h#2', '7s#3', '6h#2', '5s#3', '4h#2', '3s#3', '2h#2'];
    const state = spiderFixture({ suitCount: 4, columns: [mixed, ['As#7']] });
    const next = applySpiderMove(state, { type: 'move', from: 1, to: 0, count: 1 });
    expect(next.completed).toHaveLength(0);
    expect(next.won).toBe(false);
    expect(next.score).toBe(499);
  });

  it('убирает короля—туза одной масти и начисляет 100 очков', () => {
    const run = ['Ks#2', 'Qs#2', 'Js#2', '10s#2', '9s#2', '8s#2', '7s#2', '6s#2', '5s#2', '4s#2', '3s#2', '2s#2'];
    const state = spiderFixture({ suitCount: 1, columns: [run, ['As#3']] });
    const next = applySpiderMove(state, { type: 'move', from: 1, to: 0, count: 1 });
    expect(next.completed).toHaveLength(1);
    expect(next.score).toBe(599);
  });

  it('последняя восьмая последовательность завершает партию победой', () => {
    const runTokens = (copy: number) =>
      ['K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2', 'A'].map(
        (rank) => `${rank}s#${copy}`,
      );
    const completed = Array.from({ length: 7 }, (_, copy) => runTokens(copy));
    const state = spiderFixture({
      suitCount: 1,
      completed,
      columns: [runTokens(7).slice(0, 12), ['As#7']],
    });
    const next = applySpiderMove(state, { type: 'move', from: 1, to: 0, count: 1 });
    expect(next.completed).toHaveLength(8);
    expect(next.won).toBe(true);
    expect(spiderModule.isWon(next)).toBe(true);
    // 500 стартовых − 1 ход + 100 за убранную последнюю последовательность.
    expect(next.score).toBe(599);
    expect(spiderModule.hint(next)).toBeNull();
  });

  it('каждая подсказка применима, а состояние остаётся валидным', () => {
    for (const suitCount of [1, 2, 4] as const) {
      for (const seed of ['hint-a', 'hint-b', 'hint-c', 'hint-d']) {
        let state = createSpiderGame({ seed, suitCount });
        for (let step = 0; step < 30; step += 1) {
          const hint = spiderModule.hint(state);
          if (!hint) break;
          const next = applySpiderMove(state, hint.move);
          expect(next.moves).toBe(state.moves + 1);
          expect(spiderModule.isValidState(next)).toBe(true);
          state = next;
          if (state.won) break;
        }
        expect(spiderModule.isValidState(state)).toBe(true);
      }
    }
  });

  it('после победы не предлагает ходы и не считает партию зависшей', () => {
    const completed = Array.from({ length: 8 }, (_, copy) =>
      ['K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2', 'A'].map(
        (rank) => `${rank}s#${copy}`,
      ),
    );
    const state = spiderFixture({ suitCount: 1, completed });
    expect(spiderModule.isWon(state)).toBe(true);
    expect(spiderModule.isStuck(state)).toBe(false);
    expect(spiderModule.hint(state)).toBeNull();
  });
});

describe('Паук: адаптер доски', () => {
  it('выделяет только последовательность одной масти и предлагает верную цель', () => {
    const state = spiderFixture({
      suitCount: 4,
      columns: [
        ['7s#3', '6s#3'],
        ['8s#7'],
        ['5h#2'],
      ],
    });
    const selection = spiderAdapter.selectCards(state, 'spades-7-3');
    expect(selection?.cards).toEqual(['spades-7-3', 'spades-6-3']);
    expect(selection?.slot).toBe('spider-column-0');
    const slots = spiderAdapter.dropSlots(state, selection);
    expect(slots).toContain('spider-column-1');
    const result = spiderAdapter.drop(state, selection!.cards, 'spider-column-1');
    expect(result.type).toBe('moves');
    expect(spiderAdapter.hintSlotIds(state, spiderModule.hint(state))).toHaveLength(1);
  });

  it('объясняет запрет раздачи при пустом столбце', () => {
    const state = spiderFixture({ columns: [['7s#0']] });
    const result = spiderAdapter.clickSlot(state, 'spider-stock', null);
    expect(result.type).toBe('error');
    if (result.type === 'error') {
      expect(result.message).toMatch(/пустые столбцы/);
    }
  });

  it('двойной клик отправляет допустимую карту в подходящий столбец', () => {
    const state = spiderFixture({
      suitCount: 1,
      columns: [['9s#0', '2s#1'], ['3s#2']],
    });
    const result = spiderAdapter.doubleClick(state, 'spades-2-1');
    expect(result.type).toBe('moves');
    if (result.type === 'moves') {
      expect(result.moves[0]).toMatchObject({ from: 0, to: 1, count: 1 });
    }
  });
});
