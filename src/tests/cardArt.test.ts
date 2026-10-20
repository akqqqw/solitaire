// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  CARD_BACKS,
  TILE_PADDING,
  atlasFrameIds,
  backFrameId,
  drawCardTile,
  faceFrameId,
  type CardTileSpec,
} from '../game/cardArt';
import { chooseLayout } from '../game/cardAtlas';
import { RANK_LABEL, SUITS, type Rank, type Suit } from '../core/cards/Card';

interface Call {
  name: string;
  args: number[];
}

interface Recorder {
  ctx: CanvasRenderingContext2D;
  calls: Call[];
  texts: string[];
}

/**
 * Заглушка 2D-контекста, которая запоминает вызовы.
 * Любая координата NaN — сразу ошибка: именно так «уезжают» подписи и тени.
 */
function recorder(): Recorder {
  const calls: Call[] = [];
  const texts: string[] = [];
  const state: Record<string, unknown> = {
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    globalAlpha: 1,
    font: '10px serif',
    textAlign: 'left',
    textBaseline: 'top',
  };
  function check(name: string, args: number[]): void {
    for (const value of args) {
      if (typeof value === 'number' && !Number.isFinite(value)) {
        throw new Error(`${name}: нечисловой аргумент (${value})`);
      }
    }
    calls.push({ name, args });
  }
  const methods = [
    'save',
    'restore',
    'translate',
    'rotate',
    'scale',
    'setTransform',
    'clearRect',
    'fillRect',
    'beginPath',
    'moveTo',
    'lineTo',
    'arcTo',
    'arc',
    'closePath',
    'fill',
    'stroke',
  ];
  const ctx = new Proxy(state, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      if (prop === 'fillText') {
        return (value: string, ...rest: number[]) => {
          check('fillText', rest);
          texts.push(value);
        };
      }
      if (methods.includes(prop)) {
        return (...args: number[]) => check(prop, args);
      }
      return () => undefined;
    },
    set(target, prop: string, value) {
      target[prop] = value;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, texts };
}

const TILE_SPEC: CardTileSpec = {
  width: 78,
  height: 112,
  padding: TILE_PADDING,
  ratio: 2,
  suit: 'hearts',
  rank: 1,
  faceUp: true,
  back: 'emerald',
};

const face = (suit: Suit, rank: Rank): CardTileSpec => ({ ...TILE_SPEC, suit, rank });
const back = (id: (typeof CARD_BACKS)[number]): CardTileSpec => ({
  ...TILE_SPEC,
  faceUp: false,
  back: id,
});

/** Координаты всех фигур после смещения на поля плитки. */
function shapePoints(calls: Call[], padding: number): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  for (const call of calls) {
    const args = call.args;
    if (call.name === 'arc' || call.name === 'fillText' || call.name === 'arcTo') {
      points.push([args[0] + padding, args[1] + padding]);
    } else if (call.name === 'moveTo' || call.name === 'lineTo') {
      points.push([args[0] + padding, args[1] + padding]);
    } else if (call.name === 'arcTo') {
      points.push([args[2] + padding, args[3] + padding]);
    }
  }
  return points;
}

describe('cardArt: отрисовка карт', () => {
  it('атлас содержит 52 лица и все рубашки, имена кадров уникальны', () => {
    const frames = atlasFrameIds();
    expect(frames).toHaveLength(52 + CARD_BACKS.length);
    expect(new Set(frames).size).toBe(52 + CARD_BACKS.length);
    for (const suit of SUITS) {
      for (let rank = 1; rank <= 13; rank += 1) {
        expect(frames).toContain(faceFrameId(suit, rank));
      }
    }
    for (const id of CARD_BACKS) {
      expect(frames).toContain(backFrameId(id));
    }
  });

  it('каждое лицо рисуется без нечисловых координат и с подписями ранга и масти', () => {
    for (const suit of SUITS) {
      for (let rank = 1; rank <= 13; rank += 1) {
        const { ctx, texts } = recorder();
        expect(() => drawCardTile(ctx, face(suit, rank as Rank))).not.toThrow();
        const label = RANK_LABEL[rank as Rank];
        expect(texts).toContain(label);
        expect(texts.some((text) => text.length === 1 && '♣♦♥♠'.includes(text))).toBe(true);
      }
    }
  });

  it('все четыре рубашки рисуются без ошибок и с вензелем SC', () => {
    for (const id of CARD_BACKS) {
      const { ctx, texts } = recorder();
      expect(() => drawCardTile(ctx, back(id))).not.toThrow();
      expect(texts).toContain('SC');
    }
  });

  it('плитка смещается на своё место в атласе, не раздувая координаты', () => {
    const { ctx, calls } = recorder();
    drawCardTile(ctx, face('spades', 7), 200, 100);
    const transform = calls.find((call) => call.name === 'setTransform');
    expect(transform?.args).toEqual([2, 0, 0, 2, 400, 200]);
  });

  it('лицо не вылезает за границы своей плитки (тень остаётся внутри полей)', () => {
    for (const suit of SUITS) {
      const { ctx, calls } = recorder();
      drawCardTile(ctx, face(suit, 10));
      const points = shapePoints(calls, TILE_PADDING);
      expect(points.length).toBeGreaterThan(20);
      // Тень смещена на (2.5, 4), поэтому её контур заходит за саму карту —
      // но обязан остаться внутри полей плитки, иначе её срежет атлас.
      for (const [x, y] of points) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(TILE_SPEC.width + TILE_SPEC.padding * 2);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(TILE_SPEC.height + TILE_SPEC.padding * 2);
      }
    }
  });

  it('при мелком масштабе подписи не схлопываются в ноль', () => {
    const { ctx, calls } = recorder();
    drawCardTile(ctx, { ...TILE_SPEC, width: 26, height: 38, ratio: 1 });
    const fonts = calls.filter((call) => call.name === 'fillText');
    expect(fonts.length).toBeGreaterThan(0);
  });

  const feasible = (frames: number, tw: number, th: number, maxSize: number): boolean => {
    for (let columns = 1; columns <= frames; columns += 1) {
      const rows = Math.ceil(frames / columns);
      if (columns * tw <= maxSize && rows * th <= maxSize) return true;
    }
    return false;
  };

  it('раскладка атласа помещается в лимит текстуры, если это вообще возможно', () => {
    const frames = 56;
    const tiles: Array<[number, number]> = [
      [60, 82],
      [90, 124],
      [130, 180],
    ];
    let checked = 0;
    for (const maxSize of [2048, 4096]) {
      for (const ratio of [1, 1.5, 2]) {
        for (const [w, h] of tiles) {
          const tw = Math.ceil(w * ratio);
          const th = Math.ceil(h * ratio);
          const layout = chooseLayout(frames, tw, th, maxSize);
          if (!feasible(frames, tw, th, maxSize)) {
            expect(layout).toBeNull();
            continue;
          }
          checked += 1;
          expect(layout).not.toBeNull();
          if (!layout) continue;
          expect(layout.width).toBeLessThanOrEqual(maxSize);
          expect(layout.height).toBeLessThanOrEqual(maxSize);
          expect(layout.columns * layout.rows).toBeGreaterThanOrEqual(frames);
        }
      }
    }
    // Большинство реальных сочетаний раскладываются без потери чёткости.
    expect(checked).toBeGreaterThanOrEqual(9);
  });

  it('атлас 90×124 при плотности 2 перестаёт влезать в лимит 2048', () => {
    // Именно этот размер ломался при жёсткой сетке 8×7 (1792×2128).
    expect(chooseLayout(56, 90 * 2, 124 * 2, 2048)).not.toBeNull();
    expect(chooseLayout(56, 130 * 2, 180 * 2, 2048)).toBeNull();
  });
});
