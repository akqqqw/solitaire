import Phaser from 'phaser';
import type { Card } from '../core/cards/Card';
import type { CardBackId } from '../store/profile';
import { backFrameId, faceFrameId } from './cardArt';
import type { CardAtlasInfo } from './cardAtlas';
import type { ViewCard } from './view/types';

/**
 * Карта на сцене: один Image из общего атласа + зона нажатия.
 * Раньше это были Graphics и 5–6 объектов Text, то есть до 7 вызовов
 * отрисовки на карту; теперь — один.
 */
export class CardSprite extends Phaser.GameObjects.Container {
  private image: Phaser.GameObjects.Image;
  private hitZone: Phaser.GameObjects.Zone | null = null;
  private cw: number;
  private ch: number;
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
    atlas: CardAtlasInfo,
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

    this.image = new Phaser.GameObjects.Image(
      scene,
      this.cw / 2,
      this.ch / 2,
      atlas.key,
      data.faceUp ? faceFrameId(data.suit, data.rank) : backFrameId(back),
    );
    this.image.setDisplaySize(atlas.tileWidth, atlas.tileHeight);
    this.add(this.image);

    scene.add.existing(this);
    this.createHitArea();
  }

  setFace(faceUp: boolean): void {
    if (this.faceUp === faceUp) return;
    this.faceUp = faceUp;
    this.applyFrame();
  }

  setBack(back: CardBackId): void {
    if (this.back === back) return;
    this.back = back;
    if (!this.faceUp) this.applyFrame();
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

  private applyFrame(): void {
    this.image.setFrame(this.faceUp ? faceFrameId(this.card.suit, this.card.rank) : backFrameId(this.back));
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
