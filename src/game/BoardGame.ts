import Phaser from 'phaser';
import { BoardScene, type BoardController } from './BoardScene';
import type { BoardView } from './view/types';

/** Счётчик FPS для проверки плавности: включается через ?fps=1. */
function wantsFpsMeter(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('fps') === '1';
  } catch {
    return false;
  }
}

export class BoardGameManager {
  readonly scene: BoardScene;
  readonly game: Phaser.Game;
  private fpsBadge: HTMLDivElement | null = null;
  private fpsTimer: number | null = null;

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
        // 'low-power' просил у браузера интегрированный GPU: на ноутбуках это
        // давало заметно меньший FPS при перетаскивании карт.
        powerPreference: 'high-performance',
      },
      scene: [this.scene],
      // target влияет только на сглаживание счётчика FPS, а вот `limit: 60`
      // на 60-герцовом экране режет частоту вдвое: дельта кадра 16,6 мс
      // не проходит порог 16,67 мс. Поэтому лимит не ставим.
      fps: { target: 60, smoothStep: true },
      banner: false,
    });

    if (wantsFpsMeter()) this.mountFpsMeter(parent);
  }

  private mountFpsMeter(parent: HTMLElement): void {
    if (typeof document === 'undefined') return;
    const badge = document.createElement('div');
    badge.className = 'fps-badge';
    badge.textContent = '— fps';
    parent.appendChild(badge);
    this.fpsBadge = badge;
    const update = () => {
      const fps = Math.round(this.game.loop.actualFps);
      badge.textContent = `${fps} fps`;
      badge.dataset.fps = String(fps);
    };
    this.fpsTimer = window.setInterval(update, 500);
    update();
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
    if (this.fpsTimer !== null) window.clearInterval(this.fpsTimer);
    this.fpsTimer = null;
    this.fpsBadge?.remove();
    this.fpsBadge = null;
    this.game.destroy(true);
  }
}
