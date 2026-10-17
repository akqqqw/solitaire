import type { BoardView, PresentOptions } from './types';
import type { KlondikeState } from '../../core/games/klondike/Klondike';
import type { SpiderState } from '../../core/games/spider/Spider';
import type { FreeCellState } from '../../core/games/freecell/FreeCell';
import type { PyramidState } from '../../core/games/pyramid/Pyramid';
import { presentKlondike } from './klondikeView';
import { presentSpider } from './spiderView';
import { presentFreeCell } from './freecellView';
import { presentPyramid } from './pyramidView';
import type { GameId } from '../../core/games/types';

export function presentBoard(
  gameId: GameId,
  state: unknown,
  options: PresentOptions,
): BoardView {
  switch (gameId) {
    case 'klondike':
      return presentKlondike(state as KlondikeState, options);
    case 'spider':
      return presentSpider(state as SpiderState, options);
    case 'freecell':
      return presentFreeCell(state as FreeCellState, options);
    case 'pyramid':
      return presentPyramid(state as PyramidState, options);
  }
}

export * from './types';
