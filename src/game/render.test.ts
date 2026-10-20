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

/** Считает объекты сцены по типам: каждый Text — отдельная текстура и вызов отрисовки. */
function countByType(game: Phaser.Game): Map<string, number> {
  const counts = new Map<string, number>();
  const walk = (list: Phaser.GameObjects.GameObject[]) => {
    for (const child of list) {
      counts.set(child.type, (counts.get(child.type) ?? 0) + 1);
      const container = child as unknown as { list?: Phaser.GameObjects.GameObject[] };
      if (Array.isArray(container.list)) walk(container.list);
    }
  };
  walk((game.scene.getScene('BoardScene') as Phaser.Scene).children.list);
  return counts;
}

describe('BoardScene: карты рисуются атласом', () => {
  it('на каждую карту приходится один объект, а не пачка текстов', async () => {
    const cases = [
      ['klondike', createKlondikeGame({ seed: 'draw-budget-k', drawCount: 1 })],
      ['spider', createSpiderGame({ seed: 'draw-budget-s', suitCount: 4 })],
      ['freecell', createFreeCellGame({ seed: '123456' })],
      ['pyramid', createPyramidGame({ seed: 'draw-budget-p' })],
    ] as const;

    const { scene, game } = bootScene();
    for (const [id, state] of cases) {
      const v = view(id, state);
      scene.render(v);
      await wait(80);
      const counts = countByType(game);
      const images = counts.get('Image') ?? 0;
      const texts = counts.get('Text') ?? 0;
      const sprites = (scene as unknown as { sprites: Map<string, unknown> }).sprites;
      expect(images).toBe(sprites.size);
      expect(sprites.size).toBe(v.cards.length);
      // Раньше в «Свободной ячейке» было 312 текстов — по 6 на карту.
      expect(texts).toBeLessThanOrEqual(12);
      expect(counts.get('Graphics') ?? 0).toBeLessThanOrEqual(4);
    }
    // Один атлас на все карты: 52 лица и 4 рубашки в одной текстуре.
    const keys = game.textures.getTextureKeys();
    expect(keys.length).toBeLessThanOrEqual(12);
    const atlasKey = keys.find((key) => key.startsWith('card-atlas'));
    expect(atlasKey).toBeTruthy();
    const atlasCanvas = game.textures.get(atlasKey as string).getSourceImage() as HTMLCanvasElement;
    // Лимит текстур старых телефонов: атлас обязан в него помещаться.
    expect(atlasCanvas.width).toBeLessThanOrEqual(2048);
    expect(atlasCanvas.height).toBeLessThanOrEqual(2048);
    game.destroy(true);
  }, 30000);

  it('атлас пересобирается при смене размера карт', async () => {
    const { scene, game } = bootScene();
    const state = createKlondikeGame({ seed: 'atlas-resize', drawCount: 1 });
    scene.render(view('klondike', state));
    await wait(120);
    const texturesAfterFirst = game.textures.getTextureKeys().length;

    const small = presentBoard('klondike' as never, state as never, {
      width: 320,
      height: 560,
      selected: null,
      hint: null,
      hintSlotIds: [],
      dropSlotIds: [],
      cardBack: 'emerald',
      animations: false,
    });
    scene.render(small);
    await wait(120);
    const sprites = (scene as unknown as { sprites: Map<string, any> }).sprites;
    const card = small.cards[0];
    const image = sprites.get(card.id).list[0] as Phaser.GameObjects.Image;
    expect(image.frame.width).toBeGreaterThan(0);
    expect(small.cardWidth).toBeLessThanOrEqual(78);
    // Старый атлас удаляется, новый занимает его место: утечки текстур нет.
    expect(game.textures.getTextureKeys().length).toBeLessThanOrEqual(texturesAfterFirst + 1);
    game.destroy(true);
  }, 30000);
});

describe('BoardScene: подсветка допустимых мест отключается настройкой', () => {
  /**
   * Следит за цветами заливки слоя подсветки. Считать команды Graphics нельзя:
   * один скруглённый прямоугольник разворачивается в десяток команд пути.
   */
  function watchHighlights(scene: BoardScene): { cells: () => number; gold: () => number; reset: () => void } {
    const layer = (scene as unknown as { fxLayer: Phaser.GameObjects.Graphics }).fxLayer;
    const original = layer.fillStyle.bind(layer);
    let cells = 0;
    let gold = 0;
    layer.fillStyle = ((color: number, alpha?: number) => {
      // 0x8fdc9e — мягкая/яркая подсветка целей, GOLD — явная подсказка.
      if (color === 0x8fdc9e) cells += 1;
      if (color === 0xc8a85a) gold += 1;
      return original(color, alpha as number);
    }) as typeof layer.fillStyle;
    return {
      cells: () => cells,
      gold: () => gold,
      reset: () => {
        cells = 0;
        gold = 0;
      },
    };
  }

  it('по умолчанию не рисует зелёные цели ни после выбора, ни после взятия карты', async () => {
    const { scene, game } = bootScene();
    const watch = watchHighlights(scene);
    const state = createKlondikeGame({ seed: 'hints-off', drawCount: 1 });
    const base = view('klondike', state);
    const card = base.cards.find((item) => item.faceUp);
    expect(card).toBeTruthy();

    // Даже если раскладка предлагает цели, сцена их игнорирует.
    scene.render({
      ...base,
      selectedIds: [card!.id],
      dropSlotIds: base.slots.map((slot) => slot.id),
    });
    await wait(60);
    expect(watch.cells()).toBe(0);
    game.destroy(true);
  }, 20000);

  it('после включения настройки цели снова подсвечиваются', async () => {
    const { scene, game } = bootScene();
    const watch = watchHighlights(scene);
    const state = createKlondikeGame({ seed: 'hints-on', drawCount: 1 });
    const base = view('klondike', state);
    const card = base.cards.find((item) => item.faceUp);

    scene.setTargetHints(true);
    scene.render({
      ...base,
      selectedIds: card ? [card.id] : [],
      dropSlotIds: ['foundation-0', 'tableau-1'],
    });
    await wait(60);
    expect(watch.cells()).toBeGreaterThan(0);

    watch.reset();
    scene.setTargetHints(false);
    expect(watch.cells()).toBe(0);
    game.destroy(true);
  }, 20000);

  it('явная подсказка по кнопке рисуется даже с выключенной подсветкой целей', async () => {
    const { scene, game } = bootScene();
    const watch = watchHighlights(scene);
    const state = createKlondikeGame({ seed: 'hints-explicit', drawCount: 1 });
    const base = view('klondike', state);
    const card = base.cards.find((item) => item.faceUp);
    scene.render({
      ...base,
      selectedIds: [],
      hintIds: card ? [card.id] : [],
      hintSlotIds: ['stock'],
      dropSlotIds: ['tableau-0'],
    });
    await wait(60);
    // Подсказка — это заказ игрока, она не зависит от настройки подсветки.
    expect(watch.gold()).toBeGreaterThan(0);
    expect(watch.cells()).toBe(0);
    game.destroy(true);
  }, 20000);
});
