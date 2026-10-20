import Phaser from 'phaser';
import { RANK_LABEL, SUIT_SYMBOL, type Card, type Suit } from '../core/cards/Card';
import type { CardBackId } from '../store/profile';
import type { BoardView, ViewCard, ViewSlot } from './view/types';

export interface BoardController {
  onClickCard(cardId: string): void;
  onDoubleClickCard(cardId: string): void;
  onSlotClick(slotId: string): void;
  getDragCards(cardId: string): string[] | null;
  getDropSlots(cards: string[]): string[];
  onDrop(cards: string[], slotId: string | null): boolean;
}

const BACKS: Record<
  CardBackId,
  { deep: number; accent: number; line: number }
> = {
  emerald: { deep: 0x123c2d, accent: 0xc8a85a, line: 0x1f5a44 },
  midnight: { deep: 0x1b2742, accent: 0xb9c6dd, line: 0x2c3f63 },
  burgundy: { deep: 0x4a1d26, accent: 0xe2b177, line: 0x6c2c39 },
  sapphire: { deep: 0x143453, accent: 0xa9c7e8, line: 0x205074 },
};

const RED = 0xb12637;
const BLACK = 0x1d2328;
const GOLD = 0xc8a85a;
const CARD_FACE = 0xfaf7ee;

function hexColor(value: number): string {
  return `#${value.toString(16).padStart(6, '0')}`;
}

class CardSprite extends Phaser.GameObjects.Container {
  private gfx: Phaser.GameObjects.Graphics;
  private dynamic: Phaser.GameObjects.GameObject[] = [];
  private hitZone: Phaser.GameObjects.Zone | null = null;
  private cw = 1;
  private ch = 1;
  private back: CardBackId;
  readonly card: Card;
  faceUp: boolean;
  interactiveCard: boolean;
  /** Твины держим раздельно: движение не должно убивать переворот и наоборот. */
  dealTween: Phaser.Tweens.Tween | null = null;
  moveTween: Phaser.Tweens.Tween | null = null;
  flipTween: Phaser.Tweens.Tween | null = null;
  flipTarget: boolean;
  private onDown: (pointer: Phaser.Input.Pointer) => void;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    data: ViewCard,
    back: CardBackId,
    onDown: (pointer: Phaser.Input.Pointer) => void,
  ) {
    super(scene, x, y);
    this.card = {
      id: data.id,
      suit: data.suit,
      rank: data.rank,
      copy: 0,
    };
    this.faceUp = data.faceUp;
    this.flipTarget = data.faceUp;
    this.interactiveCard = data.interactive;
    this.back = back;
    this.cw = data.width;
    this.ch = data.height;
    this.onDown = onDown;
    this.gfx = new Phaser.GameObjects.Graphics(scene);
    this.add(this.gfx);
    scene.add.existing(this);
    this.draw();
    this.createHitArea();
  }

  setFace(faceUp: boolean): void {
    if (this.faceUp === faceUp) return;
    this.faceUp = faceUp;
    this.draw();
  }

  redraw(back: CardBackId): void {
    this.back = back;
    this.draw();
  }

  /** Завершает анимацию раздачи, чтобы карта не осталась прозрачной. */
  stopDeal(): void {
    if (this.dealTween) {
      this.dealTween.stop();
      this.dealTween = null;
      this.setAlpha(1);
    }
    if (!this.flipTween) this.setScale(1, 1);
  }

  stopMove(): void {
    if (this.moveTween) {
      this.moveTween.stop();
      this.moveTween = null;
    }
  }

  stopFlip(): void {
    if (this.flipTween) {
      this.flipTween.stop();
      this.flipTween = null;
    }
    if (this.faceUp !== this.flipTarget) this.setFace(this.flipTarget);
    this.setScale(1, 1);
  }

  setCardInteractive(enabled: boolean): void {
    this.interactiveCard = enabled;
    if (this.hitZone) {
      if (enabled) this.hitZone.setInteractive({ useHandCursor: true });
      else this.hitZone.disableInteractive();
    }
  }

  private clearDynamic(): void {
    for (const child of this.dynamic) child.destroy();
    this.dynamic = [];
  }

  private text(
    x: number,
    y: number,
    value: string,
    size: number,
    color: number,
    options: { bold?: boolean; angle?: number; alpha?: number; originX?: number; originY?: number } = {},
  ): Phaser.GameObjects.Text {
    const text = new Phaser.GameObjects.Text(this.scene, x, y, value, {
      fontFamily: '"Georgia", "Times New Roman", serif',
      fontSize: `${Math.max(6, Math.round(size))}px`,
      color: hexColor(color),
      fontStyle: options.bold === false ? 'normal' : 'bold',
      align: 'center',
    });
    text.setOrigin(options.originX ?? 0, options.originY ?? 0);
    if (options.angle) text.setAngle(options.angle);
    if (options.alpha !== undefined) text.setAlpha(options.alpha);
    this.add(text);
    this.dynamic.push(text);
    return text;
  }

  private draw(): void {
    const w = this.cw;
    const h = this.ch;
    const radius = Math.max(3, w * 0.065);
    this.gfx.clear();
    this.clearDynamic();
    this.gfx.fillStyle(0x000000, 0.22);
    this.gfx.fillRoundedRect(2.5, 4, w, h, radius);
    if (this.faceUp) this.drawFace(w, h, radius);
    else this.drawBack(w, h, radius);
  }

  private drawFace(w: number, h: number, radius: number): void {
    const suit = this.card.suit;
    const color = suit === 'hearts' || suit === 'diamonds' ? RED : BLACK;
    const g = this.gfx;
    g.fillStyle(CARD_FACE, 1);
    g.fillRoundedRect(0, 0, w, h, radius);
    g.lineStyle(1, 0xc9c1af, 0.95);
    g.strokeRoundedRect(0.5, 0.5, w - 1, h - 1, radius);
    g.lineStyle(0.8, GOLD, 0.25);
    g.strokeRoundedRect(w * 0.055, h * 0.04, w * 0.89, h * 0.92, radius * 0.7);

    const rank = RANK_LABEL[this.card.rank];
    const corner = Math.max(8, w * 0.24);
    this.text(w * 0.09, h * 0.045, rank, corner, color);
    this.text(w * 0.09, h * 0.045 + corner * 1.05, SUIT_SYMBOL[suit], corner * 0.9, color);
    this.text(
      w * 0.91,
      h * 0.955,
      `${rank}\n${SUIT_SYMBOL[suit]}`,
      corner * 0.72,
      color,
      { angle: 180, originX: 1, originY: 1, bold: true },
    );

    const faceCard = this.card.rank > 10;
    if (faceCard) {
      const inset = w * 0.2;
      g.lineStyle(Math.max(0.8, w * 0.008), GOLD, 0.55);
      g.strokeRoundedRect(inset, h * 0.22, w - inset * 2, h * 0.56, radius * 0.6);
      g.lineStyle(Math.max(0.5, w * 0.005), color, 0.18);
      g.strokeRoundedRect(inset + 2, h * 0.22 + 2, w - inset * 2 - 4, h * 0.56 - 4, radius * 0.5);
      this.text(w / 2, h * 0.47, rank, w * 0.4, color, {
        originX: 0.5,
        originY: 0.5,
      });
      this.text(w / 2, h * 0.69, SUIT_SYMBOL[suit], w * 0.2, color, {
        originX: 0.5,
        originY: 0.5,
        alpha: 0.8,
      });
      this.text(w / 2, h * 0.3, '◆', w * 0.09, GOLD, {
        originX: 0.5,
        originY: 0.5,
        alpha: 0.85,
      });
    } else {
      this.text(w / 2, h * 0.53, SUIT_SYMBOL[suit], w * 0.55, color, {
        originX: 0.5,
        originY: 0.5,
        alpha: 0.92,
      });
      if (this.card.rank !== 1) {
        this.text(w / 2, h * 0.23, SUIT_SYMBOL[suit], w * 0.14, color, {
          originX: 0.5,
          originY: 0.5,
          alpha: 0.25,
        });
        this.text(w / 2, h * 0.82, SUIT_SYMBOL[suit], w * 0.14, color, {
          originX: 0.5,
          originY: 0.5,
          alpha: 0.25,
        });
      }
    }
  }

  private drawBack(w: number, h: number, radius: number): void {
    const theme = BACKS[this.back] ?? BACKS.emerald;
    const g = this.gfx;
    g.fillStyle(theme.deep, 1);
    g.fillRoundedRect(0, 0, w, h, radius);
    g.lineStyle(1, 0x0a1712, 0.55);
    g.strokeRoundedRect(0.5, 0.5, w - 1, h - 1, radius);
    g.lineStyle(Math.max(0.8, w * 0.012), theme.accent, 0.8);
    g.strokeRoundedRect(w * 0.07, h * 0.055, w * 0.86, h * 0.89, radius * 0.7);
    g.lineStyle(Math.max(0.5, w * 0.006), theme.accent, 0.28);
    g.strokeRoundedRect(w * 0.1, h * 0.075, w * 0.8, h * 0.85, radius * 0.6);

    const step = Math.max(7, w * 0.16);
    const insetX = w * 0.17;
    const insetY = h * 0.16;
    g.lineStyle(Math.max(0.5, w * 0.007), theme.line, 0.9);
    for (let y = insetY; y < h - insetY; y += step) {
      for (let x = insetX; x < w - insetX; x += step) {
        const s = step * 0.25;
        g.beginPath();
        g.moveTo(x, y - s);
        g.lineTo(x + s, y);
        g.lineTo(x, y + s);
        g.lineTo(x - s, y);
        g.closePath();
        g.strokePath();
      }
    }
    g.lineStyle(Math.max(1, w * 0.014), theme.accent, 0.8);
    g.strokeCircle(w / 2, h / 2, w * 0.2);
    g.lineStyle(Math.max(0.6, w * 0.007), theme.accent, 0.5);
    g.strokeCircle(w / 2, h / 2, w * 0.16);
    this.text(w / 2, h / 2, 'SC', w * 0.15, theme.accent, {
      originX: 0.5,
      originY: 0.5,
      bold: true,
    });
  }

  private createHitArea(): void {
    if (this.hitZone) this.hitZone.destroy();
    const zone = new Phaser.GameObjects.Zone(this.scene, this.cw / 2, this.ch / 2, this.cw, this.ch);
    this.add(zone);
    zone.setInteractive({ useHandCursor: true });
    zone.on(
      'pointerdown',
      (
        pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation();
        if (this.interactiveCard) this.onDown(pointer);
      },
    );
    this.hitZone = zone;
    this.setCardInteractive(this.interactiveCard);
  }
}

export class BoardScene extends Phaser.Scene {
  private controller: BoardController;
  private created = false;
  private pendingView: BoardView | null = null;
  private currentView: BoardView | null = null;
  private sprites = new Map<string, CardSprite>();
  private cardData = new Map<string, ViewCard>();
  private slotZones = new Map<string, Phaser.GameObjects.Zone>();
  private slotLabels: Phaser.GameObjects.GameObject[] = [];
  private badgeLabels: Phaser.GameObjects.GameObject[] = [];
  private slotLayer!: Phaser.GameObjects.Graphics;
  private badgeLayer!: Phaser.GameObjects.Graphics;
  private fxLayer!: Phaser.GameObjects.Graphics;
  private lastBack: CardBackId = 'emerald';
  private lastDealKey = '';
  private lastCardW = 0;
  private lastCardH = 0;
  private pressed: {
    cardId: string;
    pointerId: number;
    startX: number;
    startY: number;
    cards: string[];
    origins: Map<string, { x: number; y: number }>;
    dragging: boolean;
  } | null = null;
  private lastClick: { id: string; time: number } | null = null;
  private suppressSlotUntil = 0;
  private dragAllowed = new Set<string>();

  constructor(controller: BoardController) {
    super({ key: 'BoardScene' });
    this.controller = controller;
  }

  create(): void {
    this.created = true;
    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');
    this.slotLayer = this.add.graphics().setDepth(-20);
    this.badgeLayer = this.add.graphics().setDepth(6000);
    this.fxLayer = this.add.graphics().setDepth(9000);
    this.input.topOnly = true;
    this.input.on('pointermove', this.handlePointerMove, this);
    this.input.on('pointerup', this.handlePointerUp, this);
    this.input.on('pointerupoutside', this.handlePointerUp, this);
    if (this.pendingView) this.render(this.pendingView);
  }

  render(view: BoardView): void {
    if (!this.created) {
      this.pendingView = view;
      return;
    }
    this.currentView = view;
    const sizeChanged =
      Math.abs(view.cardWidth - this.lastCardW) > 0.5 ||
      Math.abs(view.cardHeight - this.lastCardH) > 0.5;
    const dealChanged = view.dealKey !== this.lastDealKey;
    const backChanged = view.cardBack !== this.lastBack;

    if (dealChanged) {
      this.destroyAllSprites();
      this.lastDealKey = view.dealKey;
    } else if (sizeChanged) {
      this.destroyAllSprites();
    }

    if (sizeChanged) {
      this.lastCardW = view.cardWidth;
      this.lastCardH = view.cardHeight;
    }
    this.lastBack = view.cardBack;

    this.cardData = new Map(view.cards.map((card) => [card.id, card]));
    const seen = new Set<string>();
    const dealOrder: ViewCard[] = [];

    for (const data of view.cards) {
      seen.add(data.id);
      let sprite = this.sprites.get(data.id);
      if (!sprite) {
        sprite = this.createSprite(data, view, dealChanged && view.animations);
        this.sprites.set(data.id, sprite);
        if (dealChanged && view.animations) dealOrder.push(data);
      } else {
        if (backChanged && !data.faceUp) sprite.redraw(view.cardBack);
        if (sprite.faceUp !== data.faceUp) {
          if (view.animations) this.flip(sprite, data.faceUp);
          else sprite.setFace(data.faceUp);
        }
        sprite.setCardInteractive(data.interactive);
        sprite.setDepth(data.depth);
        this.moveSprite(sprite, data, view.animations);
      }
    }

    for (const [id, sprite] of this.sprites) {
      if (seen.has(id)) continue;
      this.sprites.delete(id);
      if (view.animations) {
        sprite.stopFlip();
        sprite.stopDeal();
        sprite.stopMove();
        this.tweens.add({
          targets: sprite,
          alpha: 0,
          scaleX: 0.9,
          scaleY: 0.9,
          duration: 180,
          ease: 'Cubic.In',
          onComplete: () => sprite.destroy(),
        });
      } else {
        sprite.destroy();
      }
    }

    if (dealChanged && view.animations && dealOrder.length) {
      // Лёгкая волна при раздаче.
      dealOrder.forEach((data, index) => {
        const sprite = this.sprites.get(data.id);
        if (!sprite) return;
        sprite.dealTween = this.tweens.add({
          targets: sprite,
          x: data.x,
          y: data.y,
          alpha: { from: 0, to: 1 },
          scaleX: { from: 0.92, to: 1 },
          scaleY: { from: 0.92, to: 1 },
          duration: 220,
          delay: Math.min(700, index * 9),
          ease: 'Quad.Out',
          onComplete: () => {
            sprite.dealTween = null;
          },
        });
      });
    }

    this.buildSlots(view);
    this.drawHighlights(view);
  }

  private createSprite(data: ViewCard, view: BoardView, animateDeal: boolean): CardSprite {
    const sprite = new CardSprite(
      this,
      data.x,
      data.y,
      data,
      view.cardBack,
      (pointer) => this.handleCardPointerDown(data.id, pointer),
    );
    sprite.setDepth(data.depth);
    if (animateDeal) {
      sprite.setAlpha(0);
      sprite.setPosition(view.width / 2 - data.width / 2, -data.height * 0.7);
    }
    return sprite;
  }

  private moveSprite(sprite: CardSprite, data: ViewCard, animate: boolean): void {
    const x = data.x;
    const y = data.y;
    // Раздача завершается сразу: иначе при быстром клике карта может
    // остаться с нулевой прозрачностью и выглядеть отсутствующей.
    sprite.stopDeal();
    if (Math.abs(sprite.x - x) < 0.4 && Math.abs(sprite.y - y) < 0.4) return;
    sprite.stopMove();
    if (!animate) {
      sprite.setPosition(x, y);
      return;
    }
    sprite.moveTween = this.tweens.add({
      targets: sprite,
      x,
      y,
      duration: 165,
      ease: 'Cubic.Out',
    });
  }

  private flip(sprite: CardSprite, faceUp: boolean): void {
    if (!sprite.active) return;
    sprite.flipTarget = faceUp;
    // Переворот уже идёт: просто запоминаем новую цель.
    if (sprite.flipTween) return;
    sprite.stopDeal();
    // Анимируем отдельный счётчик, а не сам контейнер: иначе твин движения
    // или удаления карты (`killTweensOf`) обрывал переворот на середине,
    // и карта навсегда оставалась рубашкой.
    const counter = { v: 0 };
    sprite.flipTween = this.tweens.add({
      targets: counter,
      v: 1,
      duration: 180,
      ease: 'Sine.InOut',
      onUpdate: () => {
        if (!sprite.active) return;
        const v = counter.v;
        if (v < 0.5) {
          sprite.setScale(Math.max(0.01, 1 - v * 2), 1);
        } else {
          if (sprite.faceUp !== sprite.flipTarget) sprite.setFace(sprite.flipTarget);
          sprite.setScale(Math.max(0.01, (v - 0.5) * 2), 1);
        }
      },
      onComplete: () => {
        sprite.flipTween = null;
        if (!sprite.active) return;
        if (sprite.faceUp !== sprite.flipTarget) sprite.setFace(sprite.flipTarget);
        sprite.setScale(1, 1);
      },
    });
  }

  private destroyAllSprites(): void {
    for (const sprite of this.sprites.values()) {
      sprite.stopFlip();
      sprite.stopDeal();
      sprite.stopMove();
      this.tweens.killTweensOf(sprite);
      sprite.destroy();
    }
    this.sprites.clear();
  }

  private buildSlots(view: BoardView): void {
    for (const zone of this.slotZones.values()) zone.destroy();
    this.slotZones.clear();
    for (const label of [...this.slotLabels, ...this.badgeLabels]) label.destroy();
    this.slotLabels = [];
    this.badgeLabels = [];
    this.slotLayer.clear();
    this.badgeLayer.clear();

    for (const slot of view.slots) {
      this.drawSlotBase(slot);
      if (slot.interactive !== false) {
        const height = slot.hitHeight ?? slot.height;
        const zone = this.add
          .zone(slot.x + slot.width / 2, slot.y + height / 2, slot.width, height)
          .setDepth(-10)
          .setInteractive({ useHandCursor: true });
        zone.on('pointerup', () => {
          if (performance.now() < this.suppressSlotUntil) return;
          this.controller.onSlotClick(slot.id);
        });
        this.slotZones.set(slot.id, zone);
      }
      if (slot.badge) {
        this.drawBadge(slot, slot.badge);
      }
    }
  }

  private slotRadius(slot: ViewSlot): number {
    return Math.max(3, slot.width * 0.065);
  }

  private drawSlotBase(slot: ViewSlot): void {
    // Зоны-карты Пирамиды не рисуют подложку: карта уже занимает это место.
    if (slot.kind === 'pyramid') return;
    const radius = this.slotRadius(slot);
    this.slotLayer.fillStyle(0x000000, slot.kind === 'tableau' || slot.kind === 'freecell' ? 0.12 : 0.18);
    this.slotLayer.fillRoundedRect(slot.x, slot.y, slot.width, slot.height, radius);
    const goldish = slot.kind === 'foundation' || slot.kind === 'completed';
    this.slotLayer.lineStyle(1.2, goldish ? GOLD : 0xffffff, goldish ? 0.34 : 0.17);
    this.slotLayer.strokeRoundedRect(slot.x, slot.y, slot.width, slot.height, radius);
    if (slot.label) {
      const isSymbol =
        slot.kind === 'foundation' ||
        slot.kind === 'completed' ||
        slot.label.length <= 2;
      const size = isSymbol ? slot.width * 0.36 : Math.max(7, Math.min(12, slot.width * 0.17));
      const text = this.add.text(slot.x + slot.width / 2, slot.y + slot.height / 2, slot.label, {
        fontFamily: '"Georgia", "Times New Roman", serif',
        fontSize: `${Math.round(size)}px`,
        color: goldish ? '#d8bd7a' : '#d9d1bd',
        align: 'center',
      });
      text.setOrigin(0.5);
      text.setAlpha(0.5);
      text.setDepth(-5);
      this.slotLabels.push(text);
    }
  }

  private drawBadge(slot: ViewSlot, badge: string): void {
    const height = Math.max(13, slot.height * 0.2);
    const width = Math.max(height, badge.length * height * 0.66 + height * 0.5);
    const x = slot.x + slot.width - width * 0.8;
    const y = slot.y + slot.height - height * 0.65;
    this.badgeLayer.fillStyle(0x0a1712, 0.9);
    this.badgeLayer.fillRoundedRect(x, y, width, height, height / 2);
    this.badgeLayer.lineStyle(1, GOLD, 0.6);
    this.badgeLayer.strokeRoundedRect(x, y, width, height, height / 2);
    const text = this.add.text(x + width / 2, y + height / 2, badge, {
      fontFamily: '"Trebuchet MS", "Segoe UI", sans-serif',
      fontSize: `${Math.max(8, Math.round(height * 0.62))}px`,
      color: '#efdfb8',
      fontStyle: 'bold',
    });
    text.setOrigin(0.5);
    text.setDepth(6001);
    this.badgeLabels.push(text);
  }

  private drawHighlights(view: BoardView): void {
    this.fxLayer.clear();
    const slotById = new Map(view.slots.map((s) => [s.id, s]));
    // Подсветка целей: яркая при перетаскивании и мягкая после выбора
    // карты нажатием, чтобы tap-to-select работал так же наглядно.
    const softTargets = new Set(
      this.dragAllowed.size === 0 ? view.dropSlotIds : [],
    );
    if (this.dragAllowed.size > 0) {
      for (const id of this.dragAllowed) {
        const slot = slotById.get(id);
        if (!slot) continue;
        const r = this.slotRadius(slot);
        this.fxLayer.fillStyle(0x8fdc9e, 0.12);
        this.fxLayer.fillRoundedRect(slot.x, slot.y, slot.width, slot.height, r);
        this.fxLayer.lineStyle(2.5, 0x9ae6a8, 0.9);
        this.fxLayer.strokeRoundedRect(slot.x, slot.y, slot.width, slot.height, r);
      }
    }
    for (const id of softTargets) {
      if (view.hintSlotIds.includes(id)) continue;
      const slot = slotById.get(id);
      if (!slot) continue;
      const r = this.slotRadius(slot);
      this.fxLayer.fillStyle(0x8fdc9e, 0.07);
      this.fxLayer.fillRoundedRect(slot.x, slot.y, slot.width, slot.height, r);
      this.fxLayer.lineStyle(1.6, 0x9ae6a8, 0.45);
      this.fxLayer.strokeRoundedRect(slot.x, slot.y, slot.width, slot.height, r);
    }
    for (const id of view.hintSlotIds) {
      if (this.dragAllowed.has(id)) continue;
      const slot = slotById.get(id);
      if (!slot) continue;
      const r = this.slotRadius(slot);
      this.fxLayer.fillStyle(GOLD, 0.12);
      this.fxLayer.fillRoundedRect(slot.x, slot.y, slot.width, slot.height, r);
      this.fxLayer.lineStyle(2.4, 0xf0d48c, 0.95);
      this.fxLayer.strokeRoundedRect(slot.x, slot.y, slot.width, slot.height, r);
    }
    const dataById = this.cardData;
    const outline = (id: string, color: number, alpha: number) => {
      const data = dataById.get(id);
      if (!data) return;
      const r = Math.max(3, data.width * 0.065);
      this.fxLayer.lineStyle(2.4, color, alpha);
      this.fxLayer.strokeRoundedRect(data.x - 1.5, data.y - 1.5, data.width + 3, data.height + 3, r);
      this.fxLayer.lineStyle(5, color, alpha * 0.18);
      this.fxLayer.strokeRoundedRect(data.x - 3, data.y - 3, data.width + 6, data.height + 6, r + 2);
    };
    for (const id of view.selectedIds) outline(id, 0x9ae6a8, 0.9);
    for (const id of view.hintIds) outline(id, 0xf0d48c, 0.95);
  }

  private handleCardPointerDown(cardId: string, pointer: Phaser.Input.Pointer): void {
    const data = this.cardData.get(cardId);
    if (!data || !data.interactive) return;
    const cards = data.draggable ? this.controller.getDragCards(cardId) : null;
    const origins = new Map<string, { x: number; y: number }>();
    if (cards) {
      for (const id of cards) {
        const sprite = this.sprites.get(id);
        if (sprite) origins.set(id, { x: sprite.x, y: sprite.y });
      }
    }
    this.pressed = {
      cardId,
      pointerId: pointer.id,
      startX: pointer.x,
      startY: pointer.y,
      cards: cards ?? [],
      origins,
      dragging: false,
    };
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.pressed || pointer.id !== this.pressed.pointerId) return;
    const dx = pointer.x - this.pressed.startX;
    const dy = pointer.y - this.pressed.startY;
    if (!this.pressed.dragging) {
      if (this.pressed.cards.length === 0) return;
      if (Math.hypot(dx, dy) < 7) return;
      this.pressed.dragging = true;
      this.suppressSlotUntil = performance.now() + 250;
      this.dragAllowed = new Set(this.controller.getDropSlots(this.pressed.cards));
      for (const id of this.pressed.cards) {
        const sprite = this.sprites.get(id);
        if (sprite) sprite.setDepth(20000 + this.pressed.cards.indexOf(id));
      }
      if (this.currentView) this.drawHighlights(this.currentView);
    }
    for (const id of this.pressed.cards) {
      const sprite = this.sprites.get(id);
      const origin = this.pressed.origins.get(id);
      if (sprite && origin) sprite.setPosition(origin.x + dx, origin.y + dy);
    }
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    if (!this.pressed) return;
    if (pointer.id !== this.pressed.pointerId) return;
    const pressed = this.pressed;
    this.pressed = null;
    this.suppressSlotUntil = performance.now() + 180;

    if (pressed.dragging) {
      const slotId = this.findDropSlot(pointer);
      let accepted = false;
      if (slotId) accepted = this.controller.onDrop(pressed.cards, slotId);
      if (!accepted) this.snapBack(pressed.cards);
      this.dragAllowed.clear();
      for (const id of pressed.cards) {
        const sprite = this.sprites.get(id);
        const data = this.cardData.get(id);
        if (sprite && data) sprite.setDepth(data.depth);
      }
      if (this.currentView) this.drawHighlights(this.currentView);
      return;
    }

    const now = performance.now();
    if (this.lastClick && this.lastClick.id === pressed.cardId && now - this.lastClick.time < 330) {
      this.lastClick = null;
      this.controller.onDoubleClickCard(pressed.cardId);
    } else {
      this.lastClick = { id: pressed.cardId, time: now };
      this.controller.onClickCard(pressed.cardId);
    }
  }

  private snapBack(cards: string[]): void {
    for (const id of cards) {
      const sprite = this.sprites.get(id);
      const data = this.cardData.get(id);
      if (!sprite || !data) continue;
      sprite.stopMove();
      if (!this.currentView?.animations) sprite.setPosition(data.x, data.y);
      else {
        sprite.moveTween = this.tweens.add({
          targets: sprite,
          x: data.x,
          y: data.y,
          duration: 150,
          ease: 'Cubic.Out',
        });
      }
    }
  }

  private findDropSlot(pointer: Phaser.Input.Pointer): string | null {
    if (!this.currentView || this.dragAllowed.size === 0) return null;
    let insideBest: { id: string; area: number } | null = null;
    let nearest: { id: string; distance: number; reach: number } | null = null;
    for (const slot of this.currentView.slots) {
      if (!this.dragAllowed.has(slot.id)) continue;
      const height = slot.hitHeight ?? slot.height;
      const inside =
        pointer.x >= slot.x &&
        pointer.x <= slot.x + slot.width &&
        pointer.y >= slot.y &&
        pointer.y <= slot.y + height;
      const cx = slot.x + slot.width / 2;
      const cy = slot.y + height / 2;
      const distance = Math.hypot(pointer.x - cx, pointer.y - cy);
      if (inside) {
        const area = slot.width * height;
        if (!insideBest || area < insideBest.area) insideBest = { id: slot.id, area };
      }
      const reach = Math.max(slot.width, slot.height) * 1.1;
      if (!nearest || distance < nearest.distance) {
        nearest = { id: slot.id, distance, reach };
      }
    }
    if (insideBest) return insideBest.id;
    return nearest && nearest.distance <= nearest.reach ? nearest.id : null;
  }
}
