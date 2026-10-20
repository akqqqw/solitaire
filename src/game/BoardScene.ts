import Phaser from 'phaser';
import type { CardBackId } from '../store/profile';
import { CardSprite } from './CardSprite';
import { CardAtlasCache } from './cardAtlas';
import type { BoardView, ViewCard, ViewSlot } from './view/types';

export interface BoardController {
  onClickCard(cardId: string): void;
  onDoubleClickCard(cardId: string): void;
  onSlotClick(slotId: string): void;
  getDragCards(cardId: string): string[] | null;
  getDropSlots(cards: string[]): string[];
  onDrop(cards: string[], slotId: string | null): boolean;
}

const GOLD = 0xc8a85a;

export class BoardScene extends Phaser.Scene {
  private controller: BoardController;
  private created = false;
  private pendingView: BoardView | null = null;
  private currentView: BoardView | null = null;
  private sprites = new Map<string, CardSprite>();
  private cardData = new Map<string, ViewCard>();
  private slotZones = new Map<string, Phaser.GameObjects.Zone>();
  private slotLabels: Phaser.GameObjects.GameObject[] = [];
  private badgeTexts = new Map<string, Phaser.GameObjects.Text>();
  private slotSignature = '';
  private badgeSignature = '';
  private slotLayer!: Phaser.GameObjects.Graphics;
  private badgeLayer!: Phaser.GameObjects.Graphics;
  private fxLayer!: Phaser.GameObjects.Graphics;
  private atlas: CardAtlasCache | null = null;
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
  /** Последний сдвиг пальца; применяем его раз в кадр, а не на каждый pointermove. */
  private dragOffset: { x: number; y: number } | null = null;
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

  /** Позиции перетаскиваемых карт обновляем один раз за кадр. */
  update(): void {
    const offset = this.dragOffset;
    if (!offset || !this.pressed) return;
    this.dragOffset = null;
    const { cards, origins } = this.pressed;
    for (let i = 0; i < cards.length; i += 1) {
      const sprite = this.sprites.get(cards[i]);
      const origin = origins.get(cards[i]);
      if (sprite && origin) sprite.setPosition(origin.x + offset.x, origin.y + offset.y);
    }
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

    if (!this.atlas) this.atlas = new CardAtlasCache(this);
    const atlas = this.atlas.get(view.cardWidth, view.cardHeight);

    this.cardData = new Map(view.cards.map((card) => [card.id, card]));
    const seen = new Set<string>();
    const dealOrder: ViewCard[] = [];

    for (const data of view.cards) {
      seen.add(data.id);
      let sprite = this.sprites.get(data.id);
      if (!sprite) {
        sprite = this.createSprite(data, view, atlas, dealChanged && view.animations);
        this.sprites.set(data.id, sprite);
        if (dealChanged && view.animations) dealOrder.push(data);
      } else {
        if (backChanged) sprite.setBack(view.cardBack);
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

  private createSprite(
    data: ViewCard,
    view: BoardView,
    atlas: ReturnType<CardAtlasCache['get']>,
    animateDeal: boolean,
  ): CardSprite {
    const sprite = new CardSprite(
      this,
      data.x,
      data.y,
      data,
      atlas,
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

  /**
   * Подложки и зоны пересобираем только когда меняется их геометрия.
   * Раньше это происходило на каждый render — то есть на каждый ход.
   */
  private buildSlots(view: BoardView): void {
    const signature = view.slots
      .map((slot) =>
        [
          slot.id,
          slot.kind,
          slot.x,
          slot.y,
          slot.width,
          slot.height,
          slot.hitHeight ?? '',
          slot.label ?? '',
          slot.interactive === false ? 0 : 1,
        ].join(':'),
      )
      .join('|');
    if (signature !== this.slotSignature) {
      this.slotSignature = signature;
      this.rebuildSlotBases(view);
    }
    this.updateBadges(view);
  }

  private rebuildSlotBases(view: BoardView): void {
    for (const zone of this.slotZones.values()) zone.destroy();
    this.slotZones.clear();
    for (const label of this.slotLabels) label.destroy();
    this.slotLabels = [];
    this.slotLayer.clear();
    // Геометрия изменилась — бейджи нужно пересчитать и перерисовать.
    this.badgeSignature = '<reset>';

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
      if (slot.label) this.drawSlotLabel(slot, slot.label);
    }
  }

  private updateBadges(view: BoardView): void {
    const signature = view.slots.map((slot) => `${slot.id}=${slot.badge ?? ''}`).join('|');
    if (signature === this.badgeSignature) return;
    this.badgeSignature = signature;
    this.badgeLayer.clear();

    const seen = new Set<string>();
    for (const slot of view.slots) {
      if (!slot.badge) continue;
      seen.add(slot.id);
      const height = Math.max(13, slot.height * 0.2);
      const width = Math.max(height, slot.badge.length * height * 0.66 + height * 0.5);
      const x = slot.x + slot.width - width * 0.8;
      const y = slot.y + slot.height - height * 0.65;
      this.badgeLayer.fillStyle(0x0a1712, 0.9);
      this.badgeLayer.fillRoundedRect(x, y, width, height, height / 2);
      this.badgeLayer.lineStyle(1, GOLD, 0.6);
      this.badgeLayer.strokeRoundedRect(x, y, width, height, height / 2);

      let text = this.badgeTexts.get(slot.id);
      if (!text) {
        text = this.add.text(0, 0, slot.badge, {
          fontFamily: '"Trebuchet MS", "Segoe UI", sans-serif',
          fontSize: `${Math.max(8, Math.round(height * 0.62))}px`,
          color: '#efdfb8',
          fontStyle: 'bold',
        });
        text.setOrigin(0.5);
        text.setDepth(6001);
        this.badgeTexts.set(slot.id, text);
      }
      text.setText(slot.badge);
      text.setFontSize(Math.max(8, Math.round(height * 0.62)));
      text.setPosition(x + width / 2, y + height / 2);
    }

    for (const [id, text] of this.badgeTexts) {
      if (seen.has(id)) continue;
      text.destroy();
      this.badgeTexts.delete(id);
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
  }

  private drawSlotLabel(slot: ViewSlot, label: string): void {
    const goldish = slot.kind === 'foundation' || slot.kind === 'completed';
    const isSymbol =
      slot.kind === 'foundation' || slot.kind === 'completed' || label.length <= 2;
    const size = isSymbol ? slot.width * 0.36 : Math.max(7, Math.min(12, slot.width * 0.17));
    const text = this.add.text(slot.x + slot.width / 2, slot.y + slot.height / 2, label, {
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

  private drawHighlights(view: BoardView): void {
    this.fxLayer.clear();
    const slotById = new Map(view.slots.map((s) => [s.id, s]));
    // Подсветка целей: яркая при перетаскивании и мягкая после выбора
    // карты нажатием, чтобы tap-to-select работал так же наглядно.
    const softTargets = new Set(this.dragAllowed.size === 0 ? view.dropSlotIds : []);
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
    this.dragOffset = null;
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
      this.startDrag();
    }
    // Только запоминаем позицию: применяем её в update() один раз за кадр.
    // На мышах с частотой опроса 1000 Гц это убирает 15 лишних пересчётов на кадр.
    this.dragOffset = { x: dx, y: dy };
  }

  private startDrag(): void {
    if (!this.pressed) return;
    this.pressed.dragging = true;
    this.suppressSlotUntil = performance.now() + 250;
    this.dragAllowed = new Set(this.controller.getDropSlots(this.pressed.cards));
    const cards = this.pressed.cards;
    for (let i = 0; i < cards.length; i += 1) {
      const sprite = this.sprites.get(cards[i]);
      if (sprite) sprite.setDepth(20000 + i);
    }
    if (this.currentView) this.drawHighlights(this.currentView);
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    if (!this.pressed) return;
    if (pointer.id !== this.pressed.pointerId) return;
    const pressed = this.pressed;
    this.pressed = null;
    this.dragOffset = null;
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
