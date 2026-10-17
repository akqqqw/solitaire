import Phaser from 'phaser';
import { BoardScene, type BoardController } from './BoardScene';
import type { BoardView } from './view/types';

export class BoardGameManager {
  readonly scene: BoardScene;
  readonly game: Phaser.Game;

  constructor(parent: HTMLElement, controller: BoardController) {
    this.scene = new BoardScene(controller);
    const width = Math.max(200, parent.clientWidth || 400);
    const height = Math.max(200, parent.clientHeight || 500);
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      transparent: true,
      scale: {
        mode: Phaser.Scale.RESIZE,
        width,
        height,
      },
      render: {
        antialias: true,
        roundPixels: false,
        transparent: true,
        powerPreference: 'low-power',
      },
      scene: [this.scene],
      fps: { target: 60, forceSetTimeOut: false },
      banner: false,
    });
  }

  render(view: BoardView): void {
    this.scene.render(view);
  }

  resize(width: number, height: number): void {
    if (!Number.isFinite(width) || !Number.isFinite(height)) return;
    const w = Math.max(200, Math.round(width));
    const h = Math.max(200, Math.round(height));
    if (Math.abs(this.game.scale.width - w) > 1 || Math.abs(this.game.scale.height - h) > 1) {
      this.game.scale.resize(w, h);
    }
  }

  destroy(): void {
    this.game.destroy(true);
  }
}
