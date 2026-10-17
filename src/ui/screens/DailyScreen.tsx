import { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import { PageShell } from '../components/PageShell';
import { Icon } from '../components/Icon';
import {
  LOGIN_REWARDS,
  challengeProgress,
  dateKey,
  getChallenge,
  isChallengeComplete,
  isLoginRewardClaimable,
  loginRewardDay,
  type ChallengeDef,
} from '../../services/dailyChallenges';
import { formatCoins, pluralize } from '../utils';

function timeToMidnight(now = new Date()): string {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  const diff = Math.max(0, next.getTime() - now.getTime());
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return `${h} ч ${String(m).padStart(2, '0')} мин`;
}

export function DailyScreen() {
  const daily = useGameStore((s) => s.daily);
  const login = useGameStore((s) => s.login);
  const coins = useGameStore((s) => s.coins);
  const claimChallenge = useGameStore((s) => s.claimDailyChallenge);
  const claimLogin = useGameStore((s) => s.claimDailyLogin);
  const refreshDate = useGameStore((s) => s.refreshDate);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
      if (dateKey() !== useGameStore.getState().daily.date) refreshDate();
    }, 30_000);
    return () => clearInterval(timer);
  }, [refreshDate]);

  const dayNumber = loginRewardDay(login);
  const loginClaimable = isLoginRewardClaimable(login);
  const todayLabel = useMemo(
    () =>
      new Intl.DateTimeFormat('ru-RU', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }).format(new Date()),
    [now],
  );

  const challengeItems = daily.ids.map((id) => {
    const def = getChallenge(id);
    return def ? { def, progress: challengeProgress(daily, def) } : null;
  }).filter(Boolean) as { def: ChallengeDef; progress: number }[];
  const claimable = challengeItems.filter(
    ({ def }) => isChallengeComplete(daily, def) && !daily.claimed.includes(def.id),
  ).length;

  return (
    <PageShell
      eyebrow="Ежедневный ритуал"
      title="Испытание дня"
      subtitle={todayLabel.charAt(0).toUpperCase() + todayLabel.slice(1)}
      actions={
        <span className="pill pill-soft">До сброса: {timeToMidnight(now)}</span>
      }
    >
      <section className="daily-login glass">
        <div className="daily-login-head">
          <div>
            <span className="eyebrow">Календарь клуба</span>
            <h2>Награда за вход</h2>
            <p className="muted">
              Серия посещений: {login.streak}{' '}
              {pluralize(login.streak, 'день', 'дня', 'дней')}. Чем дольше серия, тем ценнее награда.
            </p>
          </div>
          <button
            className={`btn ${loginClaimable ? 'btn-gold' : 'btn-secondary'}`}
            onClick={claimLogin}
            disabled={!loginClaimable}
          >
            <Icon name="calendar" size={18} />
            {loginClaimable
              ? `Забрать ${LOGIN_REWARDS[dayNumber - 1]} монет`
              : 'Награда получена'}
          </button>
        </div>
        <div className="login-days">
          {LOGIN_REWARDS.map((reward, index) => {
            const day = index + 1;
            const isToday = day === dayNumber && loginClaimable;
            const isClaimed = day === dayNumber && !loginClaimable;
            const isPast = day < dayNumber;
            return (
              <div
                key={day}
                className={`login-day ${isToday ? 'is-today' : ''} ${
                  isClaimed || isPast ? 'is-done' : ''
                }`}
              >
                <span className="login-day-num">День {day}</span>
                <span className="login-day-coin">
                  <Icon name="coin" size={20} />
                  {reward}
                </span>
                {isClaimed || isPast ? <span className="login-day-check">✓</span> : null}
              </div>
            );
          })}
        </div>
        <div className="login-foot">
          <span className="muted">
            {login.lastClaimDate === dateKey()
              ? 'Сегодняшняя награда уже в кошельке.'
              : 'Заходите каждый день, чтобы не потерять серию.'}
          </span>
          <span className="coin-inline">
            <Icon name="coin" size={16} /> {formatCoins(coins)}
          </span>
        </div>
      </section>

      <section className="daily-challenges">
        <div className="section-head compact">
          <div>
            <span className="eyebrow">Три задания на сегодня</span>
            <h2>Испытания</h2>
          </div>
          <span className="pill">
            {claimable > 0 ? `${claimable} награды ждут` : 'Задания создаются по дате'}
          </span>
        </div>
        <div className="challenge-list">
          {challengeItems.map(({ def, progress }) => {
            const complete = isChallengeComplete(daily, def);
            const claimed = daily.claimed.includes(def.id);
            const pct = Math.min(100, Math.round((progress / def.target) * 100));
            return (
              <article
                key={def.id}
                className={`challenge-card ${complete ? 'is-complete' : ''} ${
                  claimed ? 'is-claimed' : ''
                }`}
              >
                <div className="challenge-mark">
                  {claimed ? '✓' : complete ? '★' : '◇'}
                </div>
                <div className="challenge-copy">
                  <div className="challenge-title-row">
                    <h3>{def.title}</h3>
                    <span className="challenge-reward">
                      <Icon name="coin" size={15} /> +{def.reward}
                    </span>
                  </div>
                  <p>{def.description}</p>
                  <div className="challenge-progress">
                    <div className="progress-line">
                      <span style={{ width: `${complete ? 100 : Math.max(2, pct)}%` }} />
                    </div>
                    <span>
                      {Math.min(progress, def.target)} / {def.target}
                    </span>
                  </div>
                </div>
                <button
                  className={`btn ${complete && !claimed ? 'btn-gold' : 'btn-secondary'} challenge-claim`}
                  disabled={!complete || claimed}
                  onClick={() => claimChallenge(def.id)}
                >
                  {claimed ? 'Получено' : complete ? 'Забрать' : 'В процессе'}
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <section className="daily-info glass">
        <div>
          <strong>Задания одинаковы для всех партий этого дня</strong>
          <p className="muted">
            Набор испытаний детерминированно зависит от даты, поэтому перезапуск игры не меняет
            задания. Прогресс сбрасывается в полночь по местному времени.
          </p>
        </div>
        <div className="daily-tips">
          <span><Icon name="spark" size={17} /> Подсказки не обязательны</span>
          <span><Icon name="cards" size={17} /> Прогресс сохраняется</span>
        </div>
      </section>
    </PageShell>
  );
}
