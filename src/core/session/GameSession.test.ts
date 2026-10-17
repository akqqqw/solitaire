import { describe, expect, it } from 'vitest';
import { GameSession } from './GameSession';
import { createKlondikeGame, klondikeModule } from '../games/klondike/Klondike';
import {
  applyPyramidMove,
  createPyramidGame,
  pyramidModule,
  type PyramidState,
} from '../games/pyramid/Pyramid';
import { pyramidFixture } from '../../tests/helpers';

describe('GameSession', () => {
  it('создаёт партию, сериализует и восстанавливает её без потерь', () => {
    const session = GameSession.create(klondikeModule, { seed: 'session-1', drawCount: 3 });
    session.perform({ type: 'draw' } as never);
    session.hintsUsed = 2;
    expect(session.canUndo).toBe(true);
    expect(session.state.moves).toBe(1);

    const snapshot = session.serialize();
    const restored = GameSession.restore(klondikeModule, snapshot);
    expect(restored).not.toBeNull();
    expect(restored!.state).toEqual(session.state);
    expect(restored!.canUndo).toBe(true);
    expect(restored!.hintsUsed).toBe(2);
    expect(restored!.gameId).toBe('klondike');
  });

  it('не восстанавливает сохранение чужого режима или битое состояние', () => {
    const session = GameSession.create(pyramidModule, { seed: 'session-2' });
    const snapshot = session.serialize();
    expect(GameSession.restore(klondikeModule, snapshot)).toBeNull();
    expect(
      GameSession.restore(pyramidModule, { ...snapshot, state: { broken: true } }),
    ).toBeNull();
  });

  it('применяет цепочку ходов как одно действие и откатывает её целиком', () => {
    const session = GameSession.create(pyramidModule, { seed: 'session-3' });
    const before = session.state;
    expect(session.undoStack).toHaveLength(0);
    expect(() =>
      session.applyMoves([{ type: 'draw' }, { type: 'draw' }] as never[]),
    ).not.toThrow();
    expect(session.state.moves).toBe(2);
    expect(session.undoStack).toHaveLength(1);

    const afterOne = session.state;
    expect(() =>
      session.applyMoves([
        { type: 'draw' },
        { type: 'remove', a: { zone: 'waste' }, b: { zone: 'waste' } },
      ] as never[]),
    ).toThrow(/сброса/);
    expect(session.state).toBe(afterOne);
    expect(session.undoStack).toHaveLength(1);

    expect(session.undo()).toBe(true);
    expect(session.state).toBe(before);
    expect(session.canUndo).toBe(false);
    expect(session.undo()).toBe(false);
  });

  it('ограничивает историю отмен сорока шагами', () => {
    const session = GameSession.create(pyramidModule, { seed: 'session-4' });
    for (let i = 0; i < 49; i += 1) {
      const stock = (session.state as ReturnType<typeof createPyramidGame>).stock;
      session.perform({ type: stock.length > 0 ? 'draw' : 'recycle' } as never);
    }
    expect(session.undoStack).toHaveLength(40);
    for (let i = 0; i < 40; i += 1) expect(session.undo()).toBe(true);
    expect(session.canUndo).toBe(false);
  });

  it('восстанавливает партию Пирамиды после снятия карты из сброса', () => {
    const start = pyramidFixture({
      waste: ['7h'],
      pyramid: [null, null, null, null, null, null, ['6s', '2c', '3c', '4c', '5c', '6c', '7c']],
    });
    const state = applyPyramidMove(start, {
      type: 'remove',
      a: { zone: 'pyramid', row: 6, col: 0 },
      b: { zone: 'waste' },
    });
    expect(state.discard).toHaveLength(1);
    const session = new GameSession(pyramidModule, state);
    const restored = GameSession.restore(pyramidModule, session.serialize());
    expect(restored).not.toBeNull();
    expect((restored!.state as PyramidState).discard).toHaveLength(1);
    expect(restored!.state.moves).toBe(1);
  });

  it('хранит снимок независимо от текущего состояния', () => {
    const session = GameSession.create(klondikeModule, { seed: 'session-5' });
    const snapshot = session.serialize();
    (snapshot.state as ReturnType<typeof createKlondikeGame>).moves = 99;
    expect(session.state.moves).toBe(0);
  });

  it('подсказка и автосборка не меняют состояние без ходов', () => {
    const session = GameSession.create(klondikeModule, { seed: 'session-6' });
    const hint = session.hint();
    expect(hint).not.toBeNull();
    const before = session.state;
    expect(session.autoCollect()).toBe(0);
    expect(session.state).toBe(before);
    expect(session.canUndo).toBe(false);
  });

  it('ставит таймер на паузу и не запускает его для завершённой партии', () => {
    const session = GameSession.create(pyramidModule, { seed: 'session-7' });
    expect(session.isRunning).toBe(true);
    session.pause();
    expect(session.isRunning).toBe(false);
    session.resume();
    expect(session.isRunning).toBe(true);

    const wonState = { ...pyramidFixture(), won: true } as PyramidState;
    const finished = new GameSession(pyramidModule, wonState);
    expect(finished.isRunning).toBe(false);
    expect(finished.state.won).toBe(true);
  });
});
