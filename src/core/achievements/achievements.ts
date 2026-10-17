import type { CareerStats } from '../statistics/stats';

export interface AchievementContext {
  career: CareerStats;
  loginStreak: number;
}

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  icon: string;
  target: number;
  tier: 'bronze' | 'silver' | 'gold';
  progress(ctx: AchievementContext): number;
}

const winsIn = (ctx: AchievementContext, game: keyof CareerStats['winsByGame']) =>
  ctx.career.winsByGame[game];

const playedIn = (ctx: AchievementContext, game: keyof CareerStats['playedByGame']) =>
  ctx.career.playedByGame[game];

const distinctWins = (ctx: AchievementContext) =>
  Object.values(ctx.career.winsByGame).filter((n) => n > 0).length;

const distinctPlayed = (ctx: AchievementContext) =>
  Object.values(ctx.career.playedByGame).filter((n) => n > 0).length;

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first_win',
    title: 'Первая победа',
    description: 'Выиграйте первую партию',
    icon: '★',
    target: 1,
    tier: 'bronze',
    progress: (c) => c.career.totalWins,
  },
  {
    id: 'wins_50',
    title: 'Полсотни',
    description: 'Одержите 50 побед',
    icon: '✦',
    target: 50,
    tier: 'silver',
    progress: (c) => c.career.totalWins,
  },
  {
    id: 'wins_200',
    title: 'Гроссмейстер',
    description: 'Одержите 200 побед',
    icon: '♛',
    target: 200,
    tier: 'gold',
    progress: (c) => c.career.totalWins,
  },
  {
    id: 'klondike_10',
    title: 'Десятка Косынки',
    description: 'Выиграйте 10 партий в Косынке',
    icon: '♠',
    target: 10,
    tier: 'bronze',
    progress: (c) => winsIn(c, 'klondike'),
  },
  {
    id: 'klondike_25',
    title: 'Мастер Косынки',
    description: 'Выиграйте 25 партий в Косынке',
    icon: '♠',
    target: 25,
    tier: 'gold',
    progress: (c) => winsIn(c, 'klondike'),
  },
  {
    id: 'klondike_draw3',
    title: 'Тройной перебор',
    description: 'Выиграйте Косынку в режиме по три карты',
    icon: '♦',
    target: 1,
    tier: 'silver',
    progress: (c) => c.career.draw3KlondikeWins,
  },
  {
    id: 'spider_10',
    title: 'Ловец пауков',
    description: 'Выиграйте 10 партий в Пауке',
    icon: '♣',
    target: 10,
    tier: 'bronze',
    progress: (c) => winsIn(c, 'spider'),
  },
  {
    id: 'spider_25',
    title: 'Повелитель пауков',
    description: 'Выиграйте 25 партий в Пауке',
    icon: '♣',
    target: 25,
    tier: 'gold',
    progress: (c) => winsIn(c, 'spider'),
  },
  {
    id: 'spider_four_suits',
    title: 'Четыре масти',
    description: 'Выиграйте Паука на сложном уровне',
    icon: '✷',
    target: 1,
    tier: 'gold',
    progress: (c) => c.career.fourSuitSpiderWins,
  },
  {
    id: 'freecell_10',
    title: 'Стратег',
    description: 'Выиграйте 10 партий в Свободной ячейке',
    icon: '♥',
    target: 10,
    tier: 'silver',
    progress: (c) => winsIn(c, 'freecell'),
  },
  {
    id: 'freecell_25',
    title: 'Архитектор',
    description: 'Выиграйте 25 партий в Свободной ячейке',
    icon: '♥',
    target: 25,
    tier: 'gold',
    progress: (c) => winsIn(c, 'freecell'),
  },
  {
    id: 'pyramid_10',
    title: 'Археолог',
    description: 'Выиграйте 10 партий в Пирамиде',
    icon: '▲',
    target: 10,
    tier: 'silver',
    progress: (c) => winsIn(c, 'pyramid'),
  },
  {
    id: 'pyramid_25',
    title: 'Хранитель пирамид',
    description: 'Выиграйте 25 партий в Пирамиде',
    icon: '▲',
    target: 25,
    tier: 'gold',
    progress: (c) => winsIn(c, 'pyramid'),
  },
  {
    id: 'all_modes',
    title: 'Универсал',
    description: 'Победите во всех четырёх режимах',
    icon: '✦',
    target: 4,
    tier: 'gold',
    progress: (c) => distinctWins(c),
  },
  {
    id: 'explorer',
    title: 'Испытатель',
    description: 'Сыграйте во всех четырёх режимах',
    icon: '✧',
    target: 4,
    tier: 'bronze',
    progress: (c) => distinctPlayed(c),
  },
  {
    id: 'speed_3min',
    title: 'Скорость',
    description: 'Победите менее чем за 3 минуты',
    icon: '⚡',
    target: 1,
    tier: 'silver',
    progress: (c) =>
      c.career.fastestWinMs !== null && c.career.fastestWinMs <= 180_000 ? 1 : 0,
  },
  {
    id: 'speed_90s',
    title: 'Молния',
    description: 'Победите менее чем за 90 секунд',
    icon: '⚡',
    target: 1,
    tier: 'gold',
    progress: (c) =>
      c.career.fastestWinMs !== null && c.career.fastestWinMs <= 90_000 ? 1 : 0,
  },
  {
    id: 'marathon_100',
    title: 'Марафонец',
    description: 'Сыграйте 100 партий',
    icon: '◈',
    target: 100,
    tier: 'silver',
    progress: (c) => c.career.totalPlayed,
  },
  {
    id: 'marathon_500',
    title: 'Легенда клуба',
    description: 'Сыграйте 500 партий',
    icon: '◈',
    target: 500,
    tier: 'gold',
    progress: (c) => c.career.totalPlayed,
  },
  {
    id: 'streak_5',
    title: 'Серия побед',
    description: 'Выиграйте 5 партий подряд',
    icon: '↑',
    target: 5,
    tier: 'silver',
    progress: (c) => c.career.maxStreak,
  },
  {
    id: 'streak_10',
    title: 'Непобедимый',
    description: 'Выиграйте 10 партий подряд',
    icon: '↑',
    target: 10,
    tier: 'gold',
    progress: (c) => c.career.maxStreak,
  },
  {
    id: 'no_hints',
    title: 'Без подсказок',
    description: 'Выиграйте партию, ни разу не попросив подсказку',
    icon: '◇',
    target: 1,
    tier: 'bronze',
    progress: (c) => c.career.winsWithoutHints,
  },
  {
    id: 'no_hints_10',
    title: 'Самостоятельный',
    description: 'Выиграйте 10 партий без подсказок',
    icon: '◇',
    target: 10,
    tier: 'gold',
    progress: (c) => c.career.winsWithoutHints,
  },
  {
    id: 'moves_1000',
    title: 'Тысяча ходов',
    description: 'Сделайте 1000 ходов',
    icon: '⟳',
    target: 1000,
    tier: 'silver',
    progress: (c) => c.career.totalMoves,
  },
  {
    id: 'moves_5000',
    title: 'Машина времени',
    description: 'Сделайте 5000 ходов',
    icon: '⟳',
    target: 5000,
    tier: 'gold',
    progress: (c) => c.career.totalMoves,
  },
  {
    id: 'daily_1',
    title: 'Первое испытание',
    description: 'Выполните ежедневное задание',
    icon: '☀',
    target: 1,
    tier: 'bronze',
    progress: (c) => c.career.dailyCompleted,
  },
  {
    id: 'daily_10',
    title: 'Дисциплина',
    description: 'Выполните 10 ежедневных заданий',
    icon: '☀',
    target: 10,
    tier: 'silver',
    progress: (c) => c.career.dailyCompleted,
  },
  {
    id: 'daily_30',
    title: 'Хранитель календаря',
    description: 'Выполните 30 ежедневных заданий',
    icon: '☀',
    target: 30,
    tier: 'gold',
    progress: (c) => c.career.dailyCompleted,
  },
  {
    id: 'login_7',
    title: 'Верность клубу',
    description: 'Заходите 7 дней подряд',
    icon: '♡',
    target: 7,
    tier: 'silver',
    progress: (c) => c.loginStreak,
  },
];

export function achievementProgress(def: AchievementDef, ctx: AchievementContext): number {
  const value = def.progress(ctx);
  return Number.isFinite(value) ? Math.max(0, Math.min(def.target, value)) : 0;
}

export function isAchievementUnlocked(def: AchievementDef, ctx: AchievementContext): boolean {
  return def.progress(ctx) >= def.target;
}

export interface UnlockedAchievements {
  unlocked: Record<string, number>;
  newlyUnlocked: AchievementDef[];
}

export function unlockAchievements(
  ctx: AchievementContext,
  unlocked: Record<string, number>,
  now = Date.now(),
): UnlockedAchievements {
  const next: Record<string, number> = { ...unlocked };
  const newlyUnlocked: AchievementDef[] = [];
  for (const def of ACHIEVEMENTS) {
    if (next[def.id]) continue;
    if (isAchievementUnlocked(def, ctx)) {
      next[def.id] = now;
      newlyUnlocked.push(def);
    }
  }
  return { unlocked: next, newlyUnlocked };
}

export function sanitizeUnlocked(raw: unknown): Record<string, number> {
  const result: Record<string, number> = {};
  if (!raw || typeof raw !== 'object') return result;
  const source = raw as Record<string, unknown>;
  for (const def of ACHIEVEMENTS) {
    const value = source[def.id];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      result[def.id] = value;
    }
  }
  return result;
}

export function achievementById(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}
