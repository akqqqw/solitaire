import { useMemo, useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import { PageShell } from '../components/PageShell';
import {
  ACHIEVEMENTS,
  achievementProgress,
  type AchievementDef,
} from '../../core/achievements/achievements';
import { formatDate } from '../utils';

type Filter = 'all' | 'unlocked' | 'locked';

const TIER_LABEL = { bronze: 'Бронза', silver: 'Серебро', gold: 'Золото' } as const;

export function AchievementsScreen() {
  const career = useGameStore((s) => s.career);
  const login = useGameStore((s) => s.login);
  const unlocked = useGameStore((s) => s.achievements);
  const [filter, setFilter] = useState<Filter>('all');
  const context = { career, loginStreak: login.streak };
  const unlockedCount = ACHIEVEMENTS.filter((def) => unlocked[def.id]).length;
  const percent = Math.round((unlockedCount / ACHIEVEMENTS.length) * 100);

  const items = useMemo(
    () =>
      ACHIEVEMENTS.filter((def) => {
        if (filter === 'unlocked') return Boolean(unlocked[def.id]);
        if (filter === 'locked') return !unlocked[def.id];
        return true;
      }),
    [filter, unlocked],
  );

  return (
    <PageShell
      eyebrow="Коллекция клуба"
      title="Достижения"
      subtitle="Знаки отличия за настоящие партии. Открытое сохраняется навсегда."
    >
      <section className="ach-summary">
        <div className="ach-summary-mark">
          <span>{unlockedCount}</span>
          <small>из {ACHIEVEMENTS.length}</small>
        </div>
        <div className="ach-summary-copy">
          <span className="eyebrow">Ваша коллекция</span>
          <h2>
            {unlockedCount === 0
              ? 'Первый знак ещё впереди'
              : unlockedCount >= ACHIEVEMENTS.length
                ? 'Коллекция собрана полностью'
                : `Открыто ${percent}% коллекции`}
          </h2>
          <div className="ach-progress">
            <span style={{ width: `${Math.max(2, percent)}%` }} />
          </div>
        </div>
        <div className="ach-summary-tiers">
          {(['bronze', 'silver', 'gold'] as const).map((tier) => (
            <span key={tier} className={`tier tier-${tier}`}>
              {TIER_LABEL[tier]}: {ACHIEVEMENTS.filter((a) => a.tier === tier && unlocked[a.id]).length}/
              {ACHIEVEMENTS.filter((a) => a.tier === tier).length}
            </span>
          ))}
        </div>
      </section>

      <div className="ach-tabs" role="tablist">
        {(
          [
            ['all', 'Все'],
            ['unlocked', 'Открытые'],
            ['locked', 'Закрытые'],
          ] as [Filter, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={filter === key}
            className={`tab ${filter === key ? 'active' : ''}`}
            onClick={() => setFilter(key)}
          >
            {label}
            <span>
              {key === 'all'
                ? ACHIEVEMENTS.length
                : key === 'unlocked'
                  ? unlockedCount
                  : ACHIEVEMENTS.length - unlockedCount}
            </span>
          </button>
        ))}
      </div>

      <section className="ach-grid">
        {items.map((def) => (
          <AchievementCard
            key={def.id}
            def={def}
            unlockedAt={unlocked[def.id]}
            progress={achievementProgress(def, context)}
          />
        ))}
      </section>
      {items.length === 0 ? (
        <div className="empty-state glass">
          <span className="empty-mark">◇</span>
          <h3>{filter === 'locked' ? 'Закрытых достижений не осталось' : 'Пока ничего не открыто'}</h3>
          <p className="muted">Сыграйте партию — клуб уже приготовил первый знак отличия.</p>
        </div>
      ) : null}
    </PageShell>
  );
}

function AchievementCard({
  def,
  unlockedAt,
  progress,
}: {
  def: AchievementDef;
  unlockedAt?: number;
  progress: number;
}) {
  const isUnlocked = Boolean(unlockedAt);
  const pct = Math.round((progress / def.target) * 100);
  return (
    <article className={`ach-card ${isUnlocked ? 'is-unlocked' : 'is-locked'}`}>
      <div className={`ach-medal tier-${def.tier}`}>
        <span>{def.icon}</span>
        {isUnlocked ? <i className="ach-check">✓</i> : null}
      </div>
      <div className="ach-copy">
        <div className="ach-title-row">
          <h3>{def.title}</h3>
          <span className={`tier tier-${def.tier}`}>{TIER_LABEL[def.tier]}</span>
        </div>
        <p>{def.description}</p>
        {isUnlocked ? (
          <span className="ach-date">Открыто {formatDate(unlockedAt)}</span>
        ) : def.target > 1 ? (
          <div className="ach-card-progress">
            <div className="progress-line">
              <span style={{ width: `${pct}%` }} />
            </div>
            <span>
              {Math.round(progress)} / {def.target}
            </span>
          </div>
        ) : (
          <span className="ach-date muted">Условие пока не выполнено</span>
        )}
      </div>
    </article>
  );
}
