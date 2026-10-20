// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import '../tests/phaserCanvas';
import Phaser from 'phaser';
import { BoardScene, type BoardController } from './BoardScene';
import { presentBoard } from './view';
import {
  applyKlondikeMove,
  createKlondikeGame,
  type KlondikeState,
} from '../core/games/klondike/Klondike';
import { createFreeCellGame } from '../core/games/freecell/FreeCell';
import { createPyramidGame } from '../core/games/pyramid/Pyramid';
import { applySpiderMove, createSpiderGame } from '../core/games/spider/Spider';
import { applyFreeCellMove, type FreeCellState } from '../core/games/freecell/FreeCell';
import { applyPyramidMove, type PyramidState } from '../core/games/pyramid/Pyramid';
import { klondikeFixture } from '../tests/helpers';

Object.defineProperty(document, 'hidden', { value: false, configurable: true });
Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function bootScene() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const controller: BoardController = {
    onClickCard: () => undefined,
    onDoubleClickCard: () => undefined,
    onSlotClick: () => undefined,
    getDragCards: () => null,
    getDropSlots: () => [],
    onDrop: () => false,
  };
  const scene = new BoardScene(controller);
  const game = new Phaser.Game({
    type: Phaser.HEADLESS,
    parent: host,
    width: 390,
    height: 700,
    audio: { noAudio: true },
    scene: [scene],
    banner: false,
  });
  const textures = game.textures as unknown as {
    createCanvas: (key: string, w: number, h: number) => unknown;
    emit: (e: string) => void;
  };
  textures.createCanvas('__DEFAULT', 32, 32);
  textures.createCanvas('__MISSING', 32, 32);
  textures.createCanvas('__WHITE', 32, 32);
  textures.emit(Phaser.Textures.Events.READY);
  return { scene, game };
}

const view = (gameId: string, state: unknown, animations = true) =>
  presentBoard(gameId as never, state as never, {
    width: 390,
    height: 700,
    selected: null,
    hint: null,
    hintSlotIds: [],
    dropSlotIds: [],
    cardBack: 'emerald',
    animations,
  });

function audit(scene: BoardScene, v: ReturnType<typeof view>, label: string) {
  const sprites = (scene as unknown as { sprites: Map<string, any> }).sprites;
  const problems: string[] = [];
  for (const card of v.cards) {
    const sprite = sprites.get(card.id);
    if (!sprite) {
      problems.push(`${card.id}: нет спрайта`);
      continue;
    }
    if (sprite.faceUp !== card.faceUp) {
      problems.push(
        `${card.id}: спрайт ${sprite.faceUp ? 'лицом' : 'рубашкой'}, а должен ${card.faceUp ? 'лицом' : 'рубашкой'}`,
      );
    }
    if (sprite.alpha < 0.9) problems.push(`${card.id}: alpha ${sprite.alpha.toFixed(2)}`);
    if (sprite.scaleX < 0.9) problems.push(`${card.id}: scaleX ${sprite.scaleX.toFixed(2)}`);
  }
  if (problems.length) {
    console.log(`=== ${label}: ${problems.length} проблем`);
    console.log(problems.slice(0, 10).join('\n'));
  }
  return problems;
}

describe('BoardScene: карты показываются правильной стороной', () => {
  it('Косынка: раздача, добор, новая партия', async () => {
    const { scene, game } = bootScene();
    let state: KlondikeState = createKlondikeGame({ seed: 'probe-k', drawCount: 1 });
    let v = view('klondike', state);
    scene.render(v);
    await wait(1100);
    expect(audit(scene, v, 'klondike/deal')).toEqual([]);

    state = applyKlondikeMove(state, { type: 'draw' });
    v = view('klondike', state);
    scene.render(v);
    await wait(300);
    expect(audit(scene, v, 'klondike/draw')).toEqual([]);

    const next = createKlondikeGame({ seed: 'probe-k2', drawCount: 3 });
    v = view('klondike', next);
    scene.render(v);
    await wait(1100);
    const problems = audit(scene, v, 'klondike/new-deal');
    game.destroy(true);
    expect(problems).toEqual([]);
  }, 20000);

  it('Рубашка меняется, открытые карты остаются лицом', async () => {
    const { scene, game } = bootScene();
    const state = createKlondikeGame({ seed: 'probe-back', drawCount: 1 });
    const v = view('klondike', state);
    scene.render(v);
    await wait(1100);
    const sapphire = { ...v, cardBack: 'sapphire' as const };
    scene.render(sapphire);
    await wait(200);
    expect(audit(scene, sapphire, 'klondike/back-change')).toEqual([]);
    game.destroy(true);
  }, 20000);

  it('Свободная ячейка, Пирамида и Паук: раздача лицом', async () => {
    const { scene, game } = bootScene();
    for (const [id, state] of [
      ['freecell', createFreeCellGame({ seed: '123456' })],
      ['pyramid', createPyramidGame({ seed: 'probe-p' })],
      ['spider', createSpiderGame({ seed: 'probe-s', suitCount: 2 })],
    ] as const) {
      const v = view(id, state);
      scene.render(v);
      await wait(1100);
      expect(audit(scene, v, `${id}/deal`)).toEqual([]);
    }
    game.destroy(true);
  }, 30000);

  it('повторный рендер во время раздачи не оставляет карты рубашкой', async () => {
    const { scene, game } = bootScene();
    let state = createKlondikeGame({ seed: 'probe-fast', drawCount: 1 });
    scene.render(view('klondike', state));
    await wait(60);
    state = applyKlondikeMove(state, { type: 'draw' });
    const v = view('klondike', state);
    scene.render(v);
    await wait(120);
    scene.render(v);
    await wait(120);
    scene.render(v);
    await wait(1200);
    const problems = audit(scene, v, 'klondike/fast-draw');
    game.destroy(true);
    expect(problems).toEqual([]);
  }, 20000);

  it('каждая карта, открытая из колоды, сразу показана лицом', async () => {
    const { scene, game } = bootScene();
    let state: KlondikeState = createKlondikeGame({ seed: 'probe-draws', drawCount: 1 });
    scene.render(view('klondike', state));
    await wait(1100);
    let problems: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      state = applyKlondikeMove(state, { type: 'draw' });
      const v = view('klondike', state);
      scene.render(v);
      await wait(260);
      problems = problems.concat(audit(scene, v, `klondike/draw-${i + 1}`));
    }
    const v = view('klondike', state);
    problems = problems.concat(audit(scene, v, 'klondike/draws-final'));
    const top = state.waste[state.waste.length - 1];
    const sprites = (scene as unknown as { sprites: Map<string, any> }).sprites;
    expect(sprites.get(top.card.id).faceUp).toBe(true);
    game.destroy(true);
    expect(problems).toEqual([]);
  }, 20000);

  it('снятая карта открывает нижнюю и та переворачивается лицом', async () => {
    const { scene, game } = bootScene();
    const start = klondikeFixture({
      tableau: [['_9s', 'Kd'], [], [], [], [], [], []],
    });
    scene.render(view('klondike', start));
    await wait(1100);

    const state = applyKlondikeMove(start, {
      type: 'move',
      from: { zone: 'tableau', index: 0 },
      to: { zone: 'tableau', index: 1 },
      count: 1,
    });
    const v = view('klondike', state);
    scene.render(v);
    await wait(90);
    // Середина переворота: карта ещё не должна показываться закрытой после его окончания.
    await wait(260);
    const problems = audit(scene, v, 'klondike/reveal');
    const sprites = (scene as unknown as { sprites: Map<string, any> }).sprites;
    const revealed = state.tableau[0][state.tableau[0].length - 1];
    expect(revealed.faceUp).toBe(true);
    expect(sprites.get(revealed.card.id).faceUp).toBe(true);
    game.destroy(true);
    expect(problems).toEqual([]);
  }, 20000);

  it('Паук, Свободная ячейка и Пирамида: ходы оставляют правильные стороны', async () => {
    const { scene, game } = bootScene();
    const problems: string[] = [];

    let spider = createSpiderGame({ seed: 'probe-spider-move', suitCount: 1 });
    scene.render(view('spider', spider));
    await wait(1100);
    spider = applySpiderMove(spider, { type: 'deal' });
    let v = view('spider', spider);
    scene.render(v);
    await wait(320);
    problems.push(...audit(scene, v, 'spider/deal'));

    let freecell = createFreeCellGame({ seed: '246810' }) as FreeCellState;
    scene.render(view('freecell', freecell));
    await wait(1100);
    const fromColumn = freecell.columns.findIndex((col) => col.length > 0);
    freecell = applyFreeCellMove(freecell, {
      type: 'move',
      from: { zone: 'tableau', index: fromColumn },
      to: { zone: 'freecell', index: 0 },
      count: 1,
    });
    v = view('freecell', freecell);
    scene.render(v);
    await wait(320);
    problems.push(...audit(scene, v, 'freecell/to-cell'));

    let pyramid = createPyramidGame({ seed: 'probe-pyramid-move' }) as PyramidState;
    scene.render(view('pyramid', pyramid));
    await wait(1100);
    pyramid = applyPyramidMove(pyramid, { type: 'draw' });
    v = view('pyramid', pyramid);
    scene.render(v);
    await wait(320);
    problems.push(...audit(scene, v, 'pyramid/draw'));

    game.destroy(true);
    expect(problems).toEqual([]);
  }, 30000);
});
