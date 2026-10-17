import { useGameStore } from '../../store/gameStore';
import { PageShell } from '../components/PageShell';
import { GameGlyph } from '../components/GameGlyph';
import { GAME_META, GAME_ORDER } from '../gameMeta';
import { formatDuration, formatDurationLong, percent, pluralize } from '../utils';
import { ACHIEVEMENTS } from '../../core/achievements/achievements';
import type { GameId } from '../../core/games/types';

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

export function StatsScreen() {
  const stats = useGameStore((s) => s.stats);
  const career = useGameStore((s) => s.career);
  const coins = useGameStore((s) => s.coins);
  const achievements = useGameStore((s) => s.achievements);
  const openScreen = useGameStore((s) => s.openScreen);
  const rate = percent(career.totalWins, career.totalPlayed);
  const losses = Math.max(0, career.totalPlayed - career.totalWins);
  const maxWins = Math.max(1, ...GAME_ORDER.map((id) => stats[id].wins));
  const bestOverall = Math.min(
    ...GAME_ORDER.map((id) => stats[id].bestTimeMs ?? Number.POSITIVE_INFINITY),
  );
  const bestLabel = Number.isFinite(bestOverall) ? formatDuration(bestOverall) : '—';

  return (
    <PageShell
      eyebrow="Клубный архив"
      title="Статистика"
      subtitle="Только фактические результаты партий — без накрученных цифр."
    >
      <section className="stats-overview">
        <div className="stats-hero">
          <div className="stats-ring" style={{ ['--pct' as string]: `${rate}%` }}>
            <div className="stats-ring-inner">
              <strong>{career.totalPlayed ? `${rate}%` : '—'}</strong>
              <span>побед</span>
            </div>
          </div>
          <div className="stats-hero-copy">
            <span className="eyebrow">Карьера в клубе</span>
            <h2>
              {career.totalWins} {pluralize(career.totalWins, 'победа', 'победы', 'побед')}{' '}
              в {career.totalPlayed} {pluralize(career.totalPlayed, 'партии', 'партиях', 'партиях')}
            </h2>
            <p className="muted">
              Общее время за столом — {formatDurationLong(career.totalTimeMs)}. Лучшая серия —{' '}
              {career.maxStreak} {pluralize(career.maxStreak, 'победа', 'победы', 'побед')} подряд.
            </p>
            <div className="stats-hero-badges">
              <span className="pill">Лучшее время: {bestLabel}</span>
              <span className="pill">Без подсказок: {career.winsWithoutHints}</span>
              <span className="pill">
                Достижения: {Object.keys(achievements).length}/{ACHIEVEMENTS.length}
              </span>
            </div>
          </div>
        </div>
        <div className="metrics-grid">
          <Metric label="Сыграно" value={String(career.totalPlayed)} hint="завершённые и прерванные партии" />
          <Metric label="Побед" value={String(career.totalWins)} hint={`${losses} без победы`} />
          <Metric label="Ходов" value={String(career.totalMoves)} hint="за всё время" />
          <Metric label="Серия" value={String(career.currentStreak)} hint={`рекорд — ${career.maxStreak}`} />
          <Metric label="Монеты" value={String(coins)} hint="за ежедневные награды" />
          <Metric label="Дни клуба" value={String(career.dailyCompleted)} hint="ежедневных заданий выполнено" />
        </div>
      </section>

      <section className="stats-games">
        <div className="section-head compact">
          <div>
            <span className="eyebrow">По режимам</span>
            <h2>Четыре дисциплины</h2>
          </div>
        </div>
        <div className="stats-game-grid">
          {GAME_ORDER.map((id: GameId) => {
            const game = stats[id];
            const gameRate = percent(game.wins, game.played);
            return (
              <article className={`stats-game stats-game-${id}`} key={id}>
                <header>
                  <span className="mode-glyph small">
                    <GameGlyph game={id} />
                  </span>
                  <div>
                    <h3>{GAME_META[id].title}</h3>
                    <span>{GAME_META[id].tagline}</span>
                  </div>
                  <strong className="stats-game-rate">{game.played ? `${gameRate}%` : '—'}</strong>
                </header>
                <div className="stats-bar" aria-hidden="true">
                  <span style={{ width: `${Math.round((game.wins / maxWins) * 100)}%` }} />
                </div>
                <dl className="stats-list">
                  <div>
                    <dt>Сыграно</dt>
                    <dd>{game.played}</dd>
                  </div>
                  <div>
                    <dt>Побед</dt>
                    <dd>{game.wins}</dd>
                  </div>
                  <div>
                    <dt>Лучшее время</dt>
                    <dd>{formatDuration(game.bestTimeMs)}</dd>
                  </div>
                  <div>
                    <dt>Минимум ходов</dt>
                    <dd>{game.minMoves ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>Серия</dt>
                    <dd>
                      {game.currentStreak} / {game.maxStreak}
                    </dd>
                  </div>
                  <div>
                    <dt>Время</dt>
                    <dd>{formatDurationLong(game.totalTimeMs)}</dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
      </section>

      <section className="stats-footnote glass">
        <div>
          <strong>Как считается процент побед</strong>
          <p className="muted">
            Проигранной считается партия, в которой был сделан хотя бы один ход и затем начата
            новая игра. Сохранённая незавершённая партия не считается поражением — к ней можно
            вернуться.
          </p>
        </div>
        <button className="btn btn-ghost" onClick={() => openScreen('achievements')}>
          Смотреть достижения
        </button>
      </section>
    </PageShell>
  );
}
