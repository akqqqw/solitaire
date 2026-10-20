import { useGameStore } from '../../store/gameStore';
import { GAME_META, GAME_ORDER } from '../gameMeta';
import { MiniBoard } from '../components/MiniBoard';
import { GameGlyph } from '../components/GameGlyph';
import { Brand, CoinChip, HintChip } from '../components/Brand';
import { Icon } from '../components/Icon';
import { CardArt } from '../components/CardArt';
import { formatDuration, formatCoins, percent, pluralize } from '../utils';
import { ACHIEVEMENTS } from '../../core/achievements/achievements';
import {
  getChallenge,
  isChallengeComplete,
  isLoginRewardClaimable,
  loginRewardDay,
} from '../../services/dailyChallenges';
import { GAME_MODULES } from '../../core/games/registry';

export function MenuScreen() {
  const stats = useGameStore((s) => s.stats);
  const career = useGameStore((s) => s.career);
  const sessions = useGameStore((s) => s.sessions);
  const daily = useGameStore((s) => s.daily);
  const login = useGameStore((s) => s.login);
  const achievements = useGameStore((s) => s.achievements);
  const coins = useGameStore((s) => s.coins);
  const hints = useGameStore((s) => s.hints);
  const openGame = useGameStore((s) => s.openGame);
  const openScreen = useGameStore((s) => s.openScreen);

  const unlocked = Object.keys(achievements).length;
  const completedDaily = daily.ids.filter((id) => {
    const def = getChallenge(id);
    return def ? isChallengeComplete(daily, def) : false;
  }).length;
  const claimableDaily = daily.ids.filter((id) => {
    const def = getChallenge(id);
    return def && isChallengeComplete(daily, def) && !daily.claimed.includes(id);
  }).length;
  const loginClaimable = isLoginRewardClaimable(login);
  const winRate = percent(career.totalWins, career.totalPlayed);
  const strongest = GAME_ORDER.reduce(
    (best, id) => (stats[id].wins > stats[best].wins ? id : best),
    GAME_ORDER[0],
  );

  return (
    <div className="menu-screen">
      <header className="menu-header">
        <Brand />
        <div className="menu-header-actions">
          <HintChip hints={hints} />
          <CoinChip coins={coins} />
          <button
            className="icon-btn"
            onClick={() => openScreen('shop')}
            aria-label="Магазин"
            title="Магазин"
          >
            <Icon name="shop" size={21} />
          </button>
          <button
            className={`icon-btn ${loginClaimable ? 'has-dot' : ''}`}
            onClick={() => openScreen('daily')}
            aria-label="Ежедневное испытание"
            title="Ежедневное испытание"
          >
            <Icon name="calendar" size={21} />
          </button>
          <button
            className="icon-btn"
            onClick={() => openScreen('settings')}
            aria-label="Настройки"
            title="Настройки"
          >
            <Icon name="settings" size={21} />
          </button>
        </div>
      </header>

      <main className="menu-main screen-enter">
        <section className="menu-hero">
          <div className="hero-copy">
            <span className="eyebrow">Четыре классики · один клуб</span>
            <h1>
              Пасьянс <span className="gold-text">Клуб</span>
            </h1>
            <p className="hero-lead">
              Спокойная роскошь карточного стола. Играйте в любимые пасьянсы,
              собирайте достижения и возвращайтесь к сохранённым партиям.
            </p>
            <div className="hero-actions">
              <button className="btn btn-primary" onClick={() => openScreen('daily')}>
                <Icon name="calendar" size={18} />
                {loginClaimable ? 'Забрать награду дня' : 'Ежедневное испытание'}
              </button>
              <button className="btn btn-ghost" onClick={() => openScreen('achievements')}>
                <Icon name="trophy" size={18} />
                Достижения
              </button>
            </div>
            <div className="hero-metrics">
              <div>
                <strong>{career.totalWins}</strong>
                <span>{pluralize(career.totalWins, 'победа', 'победы', 'побед')}</span>
              </div>
              <div>
                <strong>{career.totalPlayed ? `${winRate}%` : '—'}</strong>
                <span>процент побед</span>
              </div>
              <div>
                <strong>{unlocked}<small>/{ACHIEVEMENTS.length}</small></strong>
                <span>достижений</span>
              </div>
            </div>
          </div>
          <div className="hero-visual" aria-hidden="true">
            <div className="hero-halo" />
            <CardArt suit="spades" rank={1} className="hero-card hero-card-back" />
            <CardArt suit="hearts" rank={12} className="hero-card hero-card-left" />
            <CardArt suit="diamonds" rank={13} className="hero-card hero-card-front" />
            <div className="hero-seal">
              <span>SC</span>
              <small>с 2026 года</small>
            </div>
          </div>
        </section>

        <section className="daily-banner">
          <div className="daily-banner-icon">
            <Icon name="calendar" size={26} />
          </div>
          <div className="daily-banner-copy">
            <span className="eyebrow">Ежедневное испытание · {daily.date.split('-').reverse().join('.')}</span>
            <strong>
              {completedDaily > 0
                ? `Выполнено ${completedDaily} из 3 заданий`
                : 'Три новых задания каждый день'}
            </strong>
            <span className="muted">
              День {loginRewardDay(login)} из 7 в календаре наград · серия входов {login.streak}
            </span>
          </div>
          <div className="daily-banner-progress">
            {daily.ids.map((id) => {
              const def = getChallenge(id);
              const done = def ? isChallengeComplete(daily, def) : false;
              const claimed = daily.claimed.includes(id);
              return (
                <span
                  key={id}
                  className={`daily-dot ${done ? 'is-done' : ''} ${claimed ? 'is-claimed' : ''}`}
                  title={def?.title}
                />
              );
            })}
          </div>
          <button className="btn btn-gold" onClick={() => openScreen('daily')}>
            {claimableDaily > 0 ? `Забрать ${claimableDaily}` : 'Открыть'}
            <Icon name="chevron" size={16} />
          </button>
        </section>

        <section className="modes-section">
          <div className="section-head">
            <div>
              <span className="eyebrow">Коллекция</span>
              <h2>Выберите пасьянс</h2>
            </div>
            <button className="text-btn" onClick={() => openScreen('stats')}>
              Вся статистика
              <Icon name="chevron" size={15} />
            </button>
          </div>
          <div className="mode-grid">
            {GAME_ORDER.map((id) => {
              const meta = GAME_META[id];
              const gameStats = stats[id];
              const hasSession = Boolean(sessions[id]);
              const module = GAME_MODULES[id];
              const rate = percent(gameStats.wins, gameStats.played);
              return (
                <article className="mode-card" key={id}>
                  <div className={`mode-art mode-art-${id}`}>
                    <MiniBoard game={id} />
                    <span className="mode-tag">{meta.tag}</span>
                  </div>
                  <div className="mode-content">
                    <div className="mode-title-row">
                      <span className="mode-glyph">
                        <GameGlyph game={id} />
                      </span>
                      <div>
                        <h3>{meta.title}</h3>
                        <span>{meta.tagline}</span>
                      </div>
                    </div>
                    <p>{meta.description}</p>
                    <div className="mode-stats">
                      <span>
                        Победы <b>{gameStats.played ? `${rate}%` : '—'}</b>
                      </span>
                      <span>
                        Лучшее <b>{formatDuration(gameStats.bestTimeMs)}</b>
                      </span>
                    </div>
                    <button
                      className={`btn ${hasSession ? 'btn-gold' : 'btn-secondary'} mode-play`}
                      onClick={() => openGame(id)}
                    >
                      <Icon name={hasSession ? 'cards' : 'play'} size={17} />
                      {hasSession ? 'Продолжить партию' : 'Играть'}
                      {hasSession ? (
                        <span className="mode-continue-dot" title="Есть сохранённая партия" />
                      ) : null}
                    </button>
                  </div>
                  <span className="mode-corner" aria-hidden="true">
                    {id === 'spider' ? '3 уровня' : id === 'klondike' ? '1 / 3 карты' : id === 'freecell' ? '52 открыты' : 'сумма 13'}
                  </span>
                  <span className="sr-only">{module.description}</span>
                </article>
              );
            })}
          </div>
        </section>

        <section className="menu-quick">
          <button className="quick-card" onClick={() => openScreen('stats')}>
            <Icon name="stats" size={23} />
            <span>
              <strong>Статистика</strong>
              <small>
                {career.totalPlayed
                  ? `${career.totalPlayed} ${pluralize(career.totalPlayed, 'партия', 'партии', 'партий')}`
                  : 'Пока нет партий'}
              </small>
            </span>
            <Icon name="chevron" size={16} />
          </button>
          <button className="quick-card" onClick={() => openScreen('achievements')}>
            <Icon name="trophy" size={23} />
            <span>
              <strong>Достижения</strong>
              <small>{unlocked} из {ACHIEVEMENTS.length} открыто</small>
            </span>
            <Icon name="chevron" size={16} />
          </button>
          <button className="quick-card" onClick={() => openScreen('shop')}>
            <Icon name="shop" size={23} />
            <span>
              <strong>Магазин</strong>
              <small>Рубашки, сукно и монеты</small>
            </span>
            <Icon name="chevron" size={16} />
          </button>
          <button className="quick-card" onClick={() => openScreen('settings')}>
            <Icon name="settings" size={23} />
            <span>
              <strong>Настройки</strong>
              <small>Рубашки, звук и оформление</small>
            </span>
            <Icon name="chevron" size={16} />
          </button>
        </section>

        <section className="club-note">
          <div>
            <span className="club-note-mark">♠</span>
            <div>
              <strong>{strongest === 'klondike' ? 'Косынка' : GAME_META[strongest].title} ждёт вас</strong>
              <p className="muted">
                {career.totalPlayed > 0
                  ? `Лучшая серия — ${career.maxStreak} побед подряд. Продолжайте в том же духе.`
                  : 'Сыграйте первую партию — прогресс, статистика и достижения сохранятся автоматически.'}
              </p>
            </div>
          </div>
          <button className="club-note-coins" onClick={() => openScreen('shop')}>
            {formatCoins(coins)} <Icon name="coin" size={15} />
          </button>
        </section>
      </main>

      <footer className="menu-footer">
        <span>Работает офлайн</span>
        <span className="dot-sep">·</span>
        <span>Прогресс сохраняется на устройстве</span>
        <span className="dot-sep">·</span>
        <span>Готово к Яндекс Играм</span>
      </footer>
    </div>
  );
}
