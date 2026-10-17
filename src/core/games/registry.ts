import type { GameId, GameModule, NewGameOptions } from './types';
import { klondikeModule } from './klondike/Klondike';
import { spiderModule } from './spider/Spider';
import { freecellModule } from './freecell/FreeCell';
import { pyramidModule } from './pyramid/Pyramid';

export const GAME_MODULES: Record<GameId, GameModule<any, any>> = {
  klondike: klondikeModule,
  spider: spiderModule,
  freecell: freecellModule,
  pyramid: pyramidModule,
};

export function getGameModule(gameId: GameId): GameModule<any, any> {
  const module = GAME_MODULES[gameId];
  if (!module) throw new Error(`Неизвестный режим: ${gameId}`);
  return module;
}

export function createNewGameState(gameId: GameId, options: NewGameOptions = {}) {
  return getGameModule(gameId).createGame(options);
}

export function isValidGameId(value: unknown): value is GameId {
  return (
    value === 'klondike' || value === 'spider' || value === 'freecell' || value === 'pyramid'
  );
}
