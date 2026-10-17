import { describe, expect, it } from 'vitest';
import { allCards, klondikeFixture } from '../../../tests/helpers';
import {
  applyKlondikeMove,
  createKlondikeGame,
  klondikeModule,
  legalKlondikeMoves,
  type KlondikeState,
} from './Klondike';

describe('Косынка: раздача', () => {
  it('раздаёт 7 столбцов 1..7, открывает верхние карты и оставляет 24 в колоде', () => {
    const state = createKlondikeGame({ seed: 'deal-1' });
    expect(state.tableau).toHaveLength(7);
    state.tableau.forEach((pile, i) => {
      expect(pile).toHaveLength(i + 1);
      expect(pile[pile.length - 1].faceUp).toBe(true);
      for (let j = 0; j < pile.length - 1; j++) expect(pile[j].faceUp).toBe(false);
    });
    expect(state.stock).toHaveLength(24);
    expect(state.waste).toHaveLength(0);
    const ids = [
      ...state.tableau.flat(),
      ...state.stock,
      ...state.waste,
      ...state.foundations.flat(),
    ].map((p) => p.card.id);
    expect(new Set(ids).size).toBe(52);
    expect(ids).toHaveLength(52);
  });

  it('одинаковый seed даёт одинаковую раздачу, разный — разную', () => {
    const a = createKlondikeGame({ seed: 'same' });
    const b = createKlondikeGame({ seed: 'same' });
    expect(a.tableau).toEqual(b.tableau);
    expect(a.stock).toEqual(b.stock);
    const c = createKlondikeGame({ seed: 'other' });
    expect(a.tableau).not.toEqual(c.tableau);
  });
});

describe('Косынка: перебор колоды', () => {
  it('в режиме по одной открывает карты по одной и переворачивает сброс', () => {
    let state = createKlondikeGame({ seed: 'draw', drawCount: 1 });
    const stockBefore = state.stock.map((c) => c.card.id);
    state = applyKlondikeMove(state, { type: 'draw' });
    expect(state.waste).toHaveLength(1);
    expect(state.waste[0].card.id).toBe(stockBefore[stockBefore.length - 1]);
    expect(state.stock).toHaveLength(23);
    expect(state.moves).toBe(1);

    for (let i = 0; i < 23; i++) state = applyKlondikeMove(state, { type: 'draw' });
    expect(state.stock).toHaveLength(0);
    expect(state.waste).toHaveLength(24);
    expect(() => applyKlondikeMove(state, { type: 'draw' })).toThrow();

    state = applyKlondikeMove(state, { type: 'recycle' });
    expect(state.stock).toHaveLength(24);
    expect(state.waste).toHaveLength(0);
    expect(state.stock.every((c) => c.faceUp === false)).toBe(true);
    state = applyKlondikeMove(state, { type: 'draw' });
    expect(state.waste[0].card.id).toBe(stockBefore[23]);
  });

  it('в режиме по три открывает ровно три карты, а остаток — сколько есть', () => {
    let state = createKlondikeGame({ seed: 'draw3', drawCount: 3 });
    const stockBefore = state.stock.map((c) => c.card.id);
    state = applyKlondikeMove(state, { type: 'draw' });
    expect(state.waste).toHaveLength(3);
    expect(state.waste.map((c) => c.card.id)).toEqual(stockBefore.slice(-3).reverse());
    for (let i = 0; i < 7; i++) state = applyKlondikeMove(state, { type: 'draw' });
    expect(state.stock).toHaveLength(0);
    expect(state.waste).toHaveLength(24);
  });
});

describe('Косынка: допустимые ходы', () => {
  it('разрешает по убыванию с чередованием цвета и запрещает иное', () => {
    const state = klondikeFixture({
      tableau: [['_2c'], ['7h'], ['8s'], ['8d'], []],
    });
    const deck = allCards();
    const seven = deck.get('7h')!;
    expect(state.tableau[2][0].card.id).toBe('spades-8-0');

    const valid = applyKlondikeMove(state, {
      type: 'move',
      from: { zone: 'tableau', index: 1 },
      to: { zone: 'tableau', index: 2 },
      count: 1,
    });
    // На самом деле 7♥ на 8♠ допустимо, хотя фикстура кладёт 7♥ в отдельный столбец
    expect(valid.tableau[2].at(-1)?.card.id).toBe(seven.id);

    expect(() =>
      applyKlondikeMove(state, {
        type: 'move',
        from: { zone: 'tableau', index: 2 },
        to: { zone: 'tableau', index: 3 },
        count: 1,
      }),
    ).toThrow(/подходит/);
  });

  it('переносит полную последовательность и запрещает неполную', () => {
    const state = klondikeFixture({
      tableau: [['_2c'], ['7h', '6s'], ['8c'], ['_3d'], []],
    });
    const next = applyKlondikeMove(state, {
      type: 'move',
      from: { zone: 'tableau', index: 1 },
      to: { zone: 'tableau', index: 2 },
      count: 2,
    });
    expect(next.tableau[2].map((c) => c.card.id)).toEqual([
      'clubs-8-0',
      'hearts-7-0',
      'spades-6-0',
    ]);

    const bad = klondikeFixture({ tableau: [['_2c'], ['7h', '6d'], ['8c'], []] });
    expect(() =>
      applyKlondikeMove(bad, {
        type: 'move',
        from: { zone: 'tableau', index: 1 },
        to: { zone: 'tableau', index: 2 },
        count: 2,
      }),
    ).toThrow();
  });

  it('на пустой столбец кладёт только короля', () => {
    const state = klondikeFixture({ tableau: [['Kd'], ['7h'], []] });
    expect(() =>
      applyKlondikeMove(state, {
        type: 'move',
        from: { zone: 'tableau', index: 1 },
        to: { zone: 'tableau', index: 2 },
        count: 1,
      }),
    ).toThrow(/только короля/);
    const next = applyKlondikeMove(state, {
      type: 'move',
      from: { zone: 'tableau', index: 0 },
      to: { zone: 'tableau', index: 2 },
      count: 1,
    });
    expect(next.tableau[2][0].card.id).toBe('diamonds-13-0');
  });

  it('нельзя переносить закрытую карту и брать больше одной из сброса', () => {
    const state = klondikeFixture({
      tableau: [['Ac', '_2d']],
      waste: ['5h', '_6d'],
    });
    expect(() =>
      applyKlondikeMove(state, {
        type: 'move',
        from: { zone: 'tableau', index: 0 },
        to: { zone: 'tableau', index: 1 },
        count: 1,
      }),
    ).toThrow();
    expect(() =>
      applyKlondikeMove(state, {
        type: 'move',
        from: { zone: 'waste' },
        to: { zone: 'tableau', index: 0 },
        count: 2,
      }),
    ).toThrow();
  });

  it('переносит туза в базовую стопку и строит её по порядку', () => {
    const state = klondikeFixture({ tableau: [['As'], [], [], []] });
    const withAce = applyKlondikeMove(state, {
      type: 'move',
      from: { zone: 'tableau', index: 0 },
      to: { zone: 'foundation', index: 0 },
      count: 1,
    });
    expect(withAce.foundations[0].map((c) => c.card.id)).toEqual(['spades-1-0']);
    expect(withAce.score).toBeGreaterThan(0);

    const withTwo = klondikeFixture({
      tableau: [['2s']],
      foundations: [['As']],
    });
    const next = applyKlondikeMove(withTwo, {
      type: 'move',
      from: { zone: 'tableau', index: 0 },
      to: { zone: 'foundation', index: 0 },
      count: 1,
    });
    expect(next.foundations[0].map((c) => c.card.id)).toEqual([
      'spades-1-0',
      'spades-2-0',
    ]);

    const hidden = klondikeFixture({
      tableau: [['_2s']],
      foundations: [['As']],
    });
    expect(() =>
      applyKlondikeMove(hidden, {
        type: 'move',
        from: { zone: 'tableau', index: 0 },
        to: { zone: 'foundation', index: 0 },
        count: 1,
      }),
    ).toThrow(/открытые/);
  });

  it('открывает карту под перенесённой и начисляет очки', () => {
    const state = klondikeFixture({ tableau: [['_2c', '7h'], ['8s'], [], []] });
    const next = applyKlondikeMove(state, {
      type: 'move',
      from: { zone: 'tableau', index: 0 },
      to: { zone: 'tableau', index: 1 },
      count: 1,
    });
    expect(next.tableau[0][0].faceUp).toBe(true);
    expect(next.score).toBeGreaterThanOrEqual(5);
  });
});

describe('Косынка: победа и подсказки', () => {
  it('определяет победу, когда все четыре базовые стопки собраны', () => {
    const suits = ['spades', 'hearts', 'diamonds', 'clubs'];
    const foundations = suits.map((suit) =>
      ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q'].map((r) => `${r}${suit[0]}`),
    );
    // Короли остаются на столе, их перенос завершит партию.
    const state = klondikeFixture({
      tableau: suits.map((suit) => [`K${suit[0]}`]),
      foundations,
    });
    let next = state;
    for (let i = 0; i < 4; i++) {
      next = applyKlondikeMove(next, {
        type: 'move',
        from: { zone: 'tableau', index: i },
        to: { zone: 'foundation', index: i },
        count: 1,
      });
    }
    expect(next.won).toBe(true);
    expect(klondikeModule.isWon(next)).toBe(true);
  });

  it('генерирует допустимые ходы и подсказку, не меняя состояние', () => {
    const state = createKlondikeGame({ seed: 'hint' });
    const snapshot = structuredClone(state);
    const moves = legalKlondikeMoves(state);
    expect(moves.length).toBeGreaterThan(0);
    const hint = klondikeModule.hint(state);
    expect(hint?.text.length).toBeGreaterThan(3);
    expect(state).toEqual(snapshot);
    if (hint) {
      const next = applyKlondikeMove(state, hint.move);
      expect(next.moves).toBe(1);
    }
  });

  it('валидация состояния отсекает повреждённые сохранения', () => {
    const state = createKlondikeGame({ seed: 'valid' });
    expect(klondikeModule.isValidState(state)).toBe(true);
    expect(klondikeModule.isValidState({ ...state, tableau: [] })).toBe(false);
    const broken = structuredClone(state) as KlondikeState;
    broken.stock.pop();
    expect(klondikeModule.isValidState(broken)).toBe(false);
  });
});
