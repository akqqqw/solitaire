/**
 * Рисование карт на обычном 2D-холсте.
 *
 * Зачем: раньше каждая карта на сцене Phaser состояла из Graphics и 5–6 объектов
 * Text. У каждого Text — своя текстура, а смена текстуры в WebGL-батче означает
 * отдельный вызов отрисовки. В «Свободной ячейке» это давало ~370 draw call
 * на кадр и просаживало FPS, особенно при перетаскивании.
 *
 * Теперь все лица и рубашки рисуются один раз в общий атлас, а карта на сцене —
 * один Image, ссылающийся на кадр атласа. Модуль не зависит от Phaser, поэтому
 * его можно отрисовать и проверить в Node (см. cardArt.test.ts).
 */
import { RANK_LABEL, SUIT_SYMBOL, SUITS, type Rank, type Suit } from '../core/cards/Card';
import type { CardBackId } from '../store/profile';

export const CARD_BACKS: readonly CardBackId[] = [
  'emerald',
  'midnight',
  'burgundy',
  'sapphire',
  'onyx',
  'royal',
  'frost',
  'aurum',
];

/** Поля вокруг карты: в них помещается тень, чтобы она ехала вместе с картой. */
export const TILE_PADDING = 6;

const RED = '#b12637';
const BLACK = '#1d2328';
const GOLD = '#c8a85a';
const CARD_FACE = '#faf7ee';

interface BackPalette {
  deep: string;
  accent: string;
  line: string;
}

const BACKS: Record<CardBackId, BackPalette> = {
  emerald: { deep: '#123c2d', accent: '#c8a85a', line: '#1f5a44' },
  midnight: { deep: '#1b2742', accent: '#b9c6dd', line: '#2c3f63' },
  burgundy: { deep: '#4a1d26', accent: '#e2b177', line: '#6c2c39' },
  sapphire: { deep: '#143453', accent: '#a9c7e8', line: '#205074' },
  onyx: { deep: '#1a1a1e', accent: '#d9c27a', line: '#2e2e36' },
  royal: { deep: '#3a1d50', accent: '#e0c07a', line: '#553074' },
  frost: { deep: '#1f3d4d', accent: '#cfe6f2', line: '#2f5b70' },
  aurum: { deep: '#2b2113', accent: '#f0d08a', line: '#4a3820' },
};

const SERIF = '"Georgia", "Times New Roman", serif';
const SANS = '"Trebuchet MS", "Segoe UI", sans-serif';

export function faceFrameId(suit: Suit, rank: number): string {
  return `face-${suit}-${rank}`;
}

export function backFrameId(back: CardBackId): string {
  return `back-${back}`;
}

/** Все кадры атласа: 52 лица + 4 рубашки. */
export function atlasFrameIds(): string[] {
  const ids: string[] = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 13; rank += 1) ids.push(faceFrameId(suit, rank));
  }
  for (const back of CARD_BACKS) ids.push(backFrameId(back));
  return ids;
}

export interface CardTileSpec {
  suit: Suit;
  rank: Rank;
  faceUp: boolean;
  back: CardBackId;
  /** Ширина и высота самой карты (без полей под тень), в CSS-пикселях. */
  width: number;
  height: number;
  padding: number;
  /** Во сколько раз увеличить растр атласа для чёткости на retina. */
  ratio: number;
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

interface TextOptions {
  bold?: boolean;
  alpha?: number;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
}

function drawText(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  value: string,
  size: number,
  color: string,
  options: TextOptions = {},
): void {
  ctx.save();
  ctx.font = `${options.bold === false ? 'normal' : 'bold'} ${Math.max(6, Math.round(size))}px ${SERIF}`;
  ctx.fillStyle = color;
  ctx.textAlign = options.align ?? 'left';
  ctx.textBaseline = options.baseline ?? 'top';
  if (options.alpha !== undefined) ctx.globalAlpha = options.alpha;
  ctx.fillText(value, x, y);
  ctx.restore();
}

function drawFace(ctx: CanvasRenderingContext2D, spec: CardTileSpec, w: number, h: number, radius: number): void {
  const suit = spec.suit;
  const color = suit === 'hearts' || suit === 'diamonds' ? RED : BLACK;
  const symbol = SUIT_SYMBOL[suit];
  const rank = RANK_LABEL[spec.rank as Rank];

  ctx.fillStyle = CARD_FACE;
  roundedRect(ctx, 0, 0, w, h, radius);
  ctx.fill();

  ctx.strokeStyle = 'rgba(201, 193, 175, 0.95)';
  ctx.lineWidth = 1;
  roundedRect(ctx, 0.5, 0.5, w - 1, h - 1, radius);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(200, 168, 90, 0.25)';
  ctx.lineWidth = 0.8;
  roundedRect(ctx, w * 0.055, h * 0.04, w * 0.89, h * 0.92, radius * 0.7);
  ctx.stroke();

  const corner = Math.max(8, w * 0.24);
  drawText(ctx, w * 0.09, h * 0.045, rank, corner, color);
  drawText(ctx, w * 0.09, h * 0.045 + corner * 1.05, symbol, corner * 0.9, color);

  // Угловая метка в правом нижнем углу, повёрнутая на 180°.
  // Рисуем её внутри карты: поворот вокруг точки привязки уводил текст за край.
  ctx.save();
  ctx.translate(w * 0.91, h * 0.955);
  ctx.rotate(Math.PI);
  const cornerSmall = Math.round(corner * 0.72);
  ctx.font = `bold ${cornerSmall}px ${SERIF}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(rank, 0, 0);
  ctx.fillText(symbol, 0, cornerSmall * 1.05);
  ctx.restore();

  if (spec.rank > 10) {
    const inset = w * 0.2;
    ctx.strokeStyle = 'rgba(200, 168, 90, 0.55)';
    ctx.lineWidth = Math.max(0.8, w * 0.008);
    roundedRect(ctx, inset, h * 0.22, w - inset * 2, h * 0.56, radius * 0.6);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.18;
    ctx.lineWidth = Math.max(0.5, w * 0.005);
    roundedRect(ctx, inset + 2, h * 0.22 + 2, w - inset * 2 - 4, h * 0.56 - 4, radius * 0.5);
    ctx.stroke();
    ctx.globalAlpha = 1;
    drawText(ctx, w / 2, h * 0.47, rank, w * 0.4, color, { align: 'center', baseline: 'middle' });
    drawText(ctx, w / 2, h * 0.69, symbol, w * 0.2, color, {
      align: 'center',
      baseline: 'middle',
      alpha: 0.8,
    });
    drawText(ctx, w / 2, h * 0.3, '◆', w * 0.09, GOLD, {
      align: 'center',
      baseline: 'middle',
      alpha: 0.85,
    });
  } else {
    drawText(ctx, w / 2, h * 0.53, symbol, w * 0.55, color, {
      align: 'center',
      baseline: 'middle',
      alpha: 0.92,
    });
    if (spec.rank !== 1) {
      drawText(ctx, w / 2, h * 0.23, symbol, w * 0.14, color, {
        align: 'center',
        baseline: 'middle',
        alpha: 0.25,
      });
      drawText(ctx, w / 2, h * 0.82, symbol, w * 0.14, color, {
        align: 'center',
        baseline: 'middle',
        alpha: 0.25,
      });
    }
  }
}

function drawBack(
  ctx: CanvasRenderingContext2D,
  back: CardBackId,
  w: number,
  h: number,
  radius: number,
): void {
  const theme = BACKS[back] ?? BACKS.emerald;

  ctx.fillStyle = theme.deep;
  roundedRect(ctx, 0, 0, w, h, radius);
  ctx.fill();

  ctx.strokeStyle = 'rgba(10, 23, 18, 0.55)';
  ctx.lineWidth = 1;
  roundedRect(ctx, 0.5, 0.5, w - 1, h - 1, radius);
  ctx.stroke();

  ctx.strokeStyle = theme.accent;
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = Math.max(0.8, w * 0.012);
  roundedRect(ctx, w * 0.07, h * 0.055, w * 0.86, h * 0.89, radius * 0.7);
  ctx.stroke();

  ctx.globalAlpha = 0.28;
  ctx.lineWidth = Math.max(0.5, w * 0.006);
  roundedRect(ctx, w * 0.1, h * 0.075, w * 0.8, h * 0.85, radius * 0.6);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Ромбическая сетка.
  const step = Math.max(7, w * 0.16);
  const insetX = w * 0.17;
  const insetY = h * 0.16;
  ctx.strokeStyle = theme.line;
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = Math.max(0.5, w * 0.007);
  ctx.beginPath();
  for (let y = insetY; y < h - insetY; y += step) {
    for (let x = insetX; x < w - insetX; x += step) {
      const s = step * 0.25;
      ctx.moveTo(x, y - s);
      ctx.lineTo(x + s, y);
      ctx.lineTo(x, y + s);
      ctx.lineTo(x - s, y);
      ctx.closePath();
    }
  }
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.strokeStyle = theme.accent;
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = Math.max(1, w * 0.014);
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, w * 0.2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = Math.max(0.6, w * 0.007);
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, w * 0.16, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  drawText(ctx, w / 2, h / 2, 'SC', w * 0.15, theme.accent, {
    align: 'center',
    baseline: 'middle',
  });
}

/**
 * Рисует одну плитку атласа.
 * `originX/originY` — положение плитки на общем холсте в CSS-пикселях.
 */
export function drawCardTile(
  ctx: CanvasRenderingContext2D,
  spec: CardTileSpec,
  originX = 0,
  originY = 0,
): void {
  const { width: w, height: h, padding: pad, ratio } = spec;
  const tileW = w + pad * 2;
  const tileH = h + pad * 2;
  ctx.save();
  ctx.setTransform(ratio, 0, 0, ratio, originX * ratio, originY * ratio);
  ctx.clearRect(0, 0, tileW, tileH);
  ctx.translate(pad, pad);

  const radius = Math.max(3, w * 0.065);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
  roundedRect(ctx, 2.5, 4, w, h, radius);
  ctx.fill();

  if (spec.faceUp) drawFace(ctx, spec, w, h, radius);
  else drawBack(ctx, spec.back, w, h, radius);

  ctx.restore();
}

/** Подписи на подложках пустых мест — тоже текст, но его всего несколько штук. */
export function overlayFont(size: number, sans = false): string {
  return `${Math.round(size)}px ${sans ? SANS : SERIF}`;
}
