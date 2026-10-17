import type { GameId } from '../core/games/types';
import { GAME_MODULES } from '../core/games/registry';

export const GAME_META: Record<
  GameId,
  { title: string; tagline: string; description: string; tag: string }
> = {
  klondike: {
    title: GAME_MODULES.klondike.title,
    tagline: 'Классика Windows',
    description: 'Семь столбцов, четыре масти и знакомый с детства расклад.',
    tag: 'Классика',
  },
  spider: {
    title: GAME_MODULES.spider.title,
    tagline: 'Три уровня сложности',
    description: 'Соберите восемь последовательностей от короля до туза.',
    tag: 'Логика',
  },
  freecell: {
    title: GAME_MODULES.freecell.title,
    tagline: 'Стратегия без случайностей',
    description: 'Все карты открыты. Четыре ячейки и восемь столбцов в вашем распоряжении.',
    tag: 'Стратегия',
  },
  pyramid: {
    title: GAME_MODULES.pyramid.title,
    tagline: 'Пары на сумму 13',
    description: 'Разберите пирамиду, убирая пары карт с суммой тринадцать.',
    tag: 'Спокойствие',
  },
};

export const GAME_ORDER: GameId[] = ['klondike', 'spider', 'freecell', 'pyramid'];
