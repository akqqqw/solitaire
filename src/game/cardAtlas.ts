import type Phaser from 'phaser';
import {
  CARD_BACKS,
  TILE_PADDING,
  atlasFrameIds,
  backFrameId,
  drawCardTile,
  faceFrameId,
} from './cardArt';
import { SUITS, type Suit } from '../core/cards/Card';

/** Бюджет пикселей атласа: на слабых телефонах не раздуваем текстуру. */
const MAX_ATLAS_PIXELS = 6_000_000;
/** Если рендерер не сообщил лимит, считаем его консервативно-безопасным. */
const FALLBACK_MAX_TEXTURE = 2048;
/** Насколько должна измениться карта, чтобы перерисовывать атлас. */
const SIZE_TOLERANCE = 3;

export interface CardAtlasInfo {
  key: string;
  /** Размер плитки (карта + поля под тень) в CSS-пикселях. */
  tileWidth: number;
  tileHeight: number;
  /** Во сколько раз плитка крупнее в пикселях растра. */
  ratio: number;
  width: number;
  height: number;
}

export interface AtlasLayout {
  columns: number;
  rows: number;
  /** Размер атласа в пикселях растра. */
  width: number;
  height: number;
}

/**
 * Подбирает раскладку так, чтобы атлас влез в лимит текстуры GPU.
 * На части телефонов максимум — 2048 px, поэтому «8 в ряд на глаз» не годится.
 */
export function chooseLayout(
  frames: number,
  tileWidth: number,
  tileHeight: number,
  maxSize: number,
): AtlasLayout | null {
  let best: AtlasLayout | null = null;
  for (let columns = 4; columns <= frames; columns += 1) {
    const rows = Math.ceil(frames / columns);
    const width = columns * tileWidth;
    const height = rows * tileHeight;
    if (width > maxSize || height > maxSize) continue;
    const worst = Math.max(width, height);
    const bestWorst = best ? Math.max(best.width, best.height) : Number.POSITIVE_INFINITY;
    if (!best || worst < bestWorst) best = { columns, rows, width, height };
  }
  return best;
}

/**
 * Держит один общий атлас карт: 52 лица и 4 рубашки в одной текстуре.
 * Благодаря этому все карты на сцене рисуются одним батчем, а не сотнями
 * отдельных текстур (по одной на каждый объект Text старой реализации).
 */
export class CardAtlasCache {
  private readonly scene: Phaser.Scene;
  private info: CardAtlasInfo | null = null;
  private serial = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  get(cardWidth: number, cardHeight: number): CardAtlasInfo {
    const width = Math.max(24, Math.round(cardWidth));
    const height = Math.max(32, Math.round(cardHeight));
    const current = this.info;
    if (
      current &&
      Math.abs(current.width - width) <= SIZE_TOLERANCE &&
      Math.abs(current.height - height) <= SIZE_TOLERANCE
    ) {
      return current;
    }

    const previousKey = current?.key ?? null;
    const frames = atlasFrameIds();
    const tileWidth = width + TILE_PADDING * 2;
    const tileHeight = height + TILE_PADDING * 2;
    const dpr =
      typeof window !== 'undefined' && Number.isFinite(window.devicePixelRatio)
        ? window.devicePixelRatio
        : 1;
    const maxSize = Math.min(
      4096,
      Math.max(
        FALLBACK_MAX_TEXTURE,
        (this.scene.game.renderer as unknown as { maxTextureSize?: number } | null)?.maxTextureSize ??
          FALLBACK_MAX_TEXTURE,
      ),
    );

    let ratio = Math.min(2, Math.max(1, dpr));
    let tilePxW = 0;
    let tilePxH = 0;
    let layout: AtlasLayout | null = null;
    while (ratio >= 1) {
      tilePxW = Math.ceil(tileWidth * ratio);
      tilePxH = Math.ceil(tileHeight * ratio);
      layout = chooseLayout(frames.length, tilePxW, tilePxH, maxSize);
      if (layout && layout.width * layout.height <= MAX_ATLAS_PIXELS) break;
      if (ratio === 1) break;
      ratio = Math.max(1, Math.round((ratio - 0.25) * 100) / 100);
    }
    if (!layout) {
      // Совсем маленький лимит у GPU: рисуем атлас в один столбец.
      layout = {
        columns: 1,
        rows: frames.length,
        width: tilePxW,
        height: tilePxH * frames.length,
      };
    }
    const key = `card-atlas-${this.serial += 1}`;

    const texture = this.scene.textures.createCanvas(key, layout.width, layout.height);
    if (!texture) {
      if (current) return current;
      throw new Error('Не удалось создать текстуру атласа карт');
    }

    const ctx = texture.context as CanvasRenderingContext2D | null;
    if (ctx) {
      const spec = { width, height, padding: TILE_PADDING, ratio };
      frames.forEach((frame, index) => {
        const column = index % layout.columns;
        const row = Math.floor(index / layout.columns);
        const originX = column * tilePxW;
        const originY = row * tilePxH;
        if (frame.startsWith('face-')) {
          const [, suit, rank] = frame.split('-');
          drawCardTile(
            ctx,
            {
              ...spec,
              suit: suit as Suit,
              rank: Number(rank) as never,
              faceUp: true,
              back: 'emerald',
            },
            originX,
            originY,
          );
        } else {
          const back = frame.slice('back-'.length) as (typeof CARD_BACKS)[number];
          drawCardTile(
            ctx,
            {
              ...spec,
              suit: SUITS[0],
              rank: 1 as never,
              faceUp: false,
              back,
            },
            originX,
            originY,
          );
        }
      });
    }

    frames.forEach((frame, index) => {
      const column = index % layout.columns;
      const row = Math.floor(index / layout.columns);
      texture.add(frame, 0, column * tilePxW, row * tilePxH, tilePxW, tilePxH);
    });

    try {
      texture.refresh();
    } catch {
      // В headless-режиме (тесты) рендерера нет — обновлять нечего.
    }

    // CanvasTexture держит полную копию пикселей для пиксельных API.
    // Для атласа 1800×2100 это лишние ~15 МБ — освобождаем.
    const disposable = texture as unknown as {
      imageData: unknown;
      data: unknown;
      pixels: unknown;
    };
    disposable.imageData = null;
    disposable.data = null;
    disposable.pixels = null;

    const info: CardAtlasInfo = {
      key,
      tileWidth,
      tileHeight,
      ratio,
      width,
      height,
    };
    this.info = info;

    if (previousKey) this.scene.textures.remove(previousKey);
    return info;
  }

  /** Принудительно пересобрать атлас (например, при смене плотности пикселей). */
  invalidate(): void {
    this.info = null;
  }

  destroy(): void {
    if (this.info) {
      this.scene.textures.remove(this.info.key);
      this.info = null;
    }
  }
}

export { backFrameId, faceFrameId };
