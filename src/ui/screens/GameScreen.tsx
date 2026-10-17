import { useEffect, useMemo, useState } from 'react';
import { useGameStore, FREE_HINTS } from '../../store/gameStore';
import { Board } from '../components/Board';
import { GameGlyph } from '../components/GameGlyph';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { GAME_META } from '../gameMeta';
import { formatDuration, pluralize } from '../utils';
import type { NewGameOptions } from '../../core/games/types';
import { getChallenge } from '../../services/dailyChallenges';

function variantLabel(state: unknown): string {
  const s = state as { gameId: string; drawCount?: number; suitCount?: number };
  if (s.gameId === 'klondike') return s.drawCount === 3 ? 'По три карты' : 'По одной карте';
  if (s.gameId === 'spider') {
    if (s.suitCount === 1) return 'Одна масть · лёгкий';
    if (s.suitCount === 2) return 'Две масти · средний';
    return 'Четыре масти · сложный';
  }
  if (s.gameId === 'freecell') {
    const seed = (s as { seed?: string }).seed;
    return seed ? `Расклад № ${seed}` : 'Классический расклад';
  }
  return 'Пары на сумму 13';
}

function progressLabel(state: unknown): string {
  const s = state as {
    gameId: string;
    completed?: unknown[];
    removed?: boolean[][];
    foundations?: { length: number }[];
    freeCells?: (unknown | null)[];
    columns?: { length: number }[];
  };
  if (s.gameId === 'spider') return `Собрано ${s.completed?.length ?? 0} из 8`;
  if (s.gameId === 'pyramid') {
    const removed = s.removed?.flat().filter(Boolean).length ?? 0;
    return `Убрано ${removed} из 28`;
  }
  if (s.gameId === 'freecell') {
    const total = s.foundations?.reduce((sum, pile) => sum + pile.length, 0) ?? 0;
    const free = s.freeCells?.filter((cell) => cell === null).length ?? 4;
    const empty = s.columns?.filter((col) => col.length === 0).length ?? 0;
    return `В базах ${total} из 52 · свободных ячеек ${free}/4 · пустых столбцов ${empty}`;
  }
  return 'Классические правила';
}

export function GameScreen() {
  const session = useGameStore((s) => s.session);
  const state = useGameStore((s) => s.gameState);
  const hint = useGameStore((s) => s.hint);
  const canUndo = useGameStore((s) => s.canUndo);
  const isWon = useGameStore((s) => s.isWon);
  const isStuck = useGameStore((s) => s.isStuck);
  const hintsUsed = useGameStore((s) => s.hintsUsed);
  const busy = useGameStore((s) => s.busy);
  const modal = useGameStore((s) => s.modal);
  const stats = useGameStore((s) => s.stats);
  const daily = useGameStore((s) => s.daily);
  const settings = useGameStore((s) => s.settings);
  const openModal = useGameStore((s) => s.openModal);
  const closeModal = useGameStore((s) => s.closeModal);
  const closeGame = useGameStore((s) => s.closeGame);
  const openScreen = useGameStore((s) => s.openScreen);
  const newGame = useGameStore((s) => s.newGame);
  const undo = useGameStore((s) => s.undo);
  const requestHint = useGameStore((s) => s.requestHint);
  const dismissHint = useGameStore((s) => s.dismissHint);
  const autoCollect = useGameStore((s) => s.autoCollect);
  const [clock, setClock] = useState(() => Date.now());
  const [winDismissed, setWinDismissed] = useState(false);
  const [drawCount, setDrawCount] = useState<1 | 3>(1);
  const [suitCount, setSuitCount] = useState<1 | 2 | 4>(1);
  const [seedInput, setSeedInput] = useState('');

  const gameId = session?.gameId ?? null;
  const gameKey = session ? `${session.gameId}:${(session.state as { seed: string }).seed}:${(session.state as { createdAt: number }).createdAt}` : '';
  const module = session?.module ?? null;

  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setWinDismissed(false);
    setSeedInput('');
  }, [gameKey]);

  useEffect(() => {
    if (!session) return;
    const s = session.state as { drawCount?: 1 | 3; suitCount?: 1 | 2 | 4 };
    if (s.drawCount) setDrawCount(s.drawCount);
    if (s.suitCount) setSuitCount(s.suitCount);
  }, [gameKey, session]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      if (modal) return;
      const key = event.key.toLowerCase();
      if (key === 'z' || key === 'u' || (key === 'z' && (event.ctrlKey || event.metaKey))) {
        void useGameStore.getState().undo();
      } else if (key === 'h') {
        void useGameStore.getState().requestHint();
      } else if (key === 'n') {
        useGameStore.getState().openModal('new-game');
      } else if (key === 'escape') {
        useGameStore.getState().openModal('pause');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [modal]);

  const challengeItems = useMemo(
    () =>
      daily.ids
        .map((id) => getChallenge(id))
        .filter((def): def is NonNullable<typeof def> => Boolean(def))
        .slice(0, 3),
    [daily.ids],
  );

  if (!session || !state || !gameId || !module) return null;
  void clock;

  const elapsed = session.elapsedMs;
  const meta = GAME_META[gameId];
  const gameStats = stats[gameId];
  const canAuto = gameId === 'klondike' || gameId === 'freecell';
  const freeHintsLeft = Math.max(0, FREE_HINTS - hintsUsed);
  const hintText = hint?.text ?? null;
  const dealIsWon = isWon && !winDismissed;

  const startNew = (options: NewGameOptions) => {
    newGame(options);
  };

  return (
    <div className={`game-screen game-${gameId}`}>
      <header className="game-topbar">
        <div className="game-top-left">
          <button className="back-btn game-back" onClick={closeGame} aria-label="В главное меню">
            <Icon name="back" size={19} />
            <span>Меню</span>
          </button>
          <div className="game-title">
            <span className="mode-glyph small">
              <GameGlyph game={gameId} />
            </span>
            <div>
              <h1>{meta.title}</h1>
              <span>{variantLabel(state)} · {progressLabel(state)}</span>
            </div>
          </div>
        </div>
        <div className="game-metrics">
          <div className="game-metric">
            <span>Время</span>
            <strong>{formatDuration(elapsed)}</strong>
          </div>
          <div className="game-metric">
            <span>Ходы</span>
            <strong>{state.moves}</strong>
          </div>
          <div className="game-metric">
            <span>Счёт</span>
            <strong>{state.score}</strong>
          </div>
        </div>
        <button className="icon-btn game-pause" onClick={() => openModal('pause')} aria-label="Пауза и меню">
          <Icon name="pause" size={21} />
        </button>
      </header>

      <div className="game-main">
        <div className={`felt felt-${settings.tableTheme}`}>
          <div className="felt-texture" aria-hidden="true" />
          <div className="felt-vignette" aria-hidden="true" />
          <Board />
        </div>
      </div>

      {hintText ? (
        <div className="hint-bar" role="status">
          <span className="hint-bar-icon"><Icon name="hint" size={18} /></span>
          <span className="hint-bar-text">{hintText}</span>
          <span className="hint-bar-note">
            {freeHintsLeft > 0 ? `Осталось бесплатных: ${freeHintsLeft}` : 'Дополнительная подсказка'}
          </span>
          <button className="hint-bar-close" onClick={dismissHint} aria-label="Скрыть подсказку">
            <Icon name="close" size={16} />
          </button>
        </div>
      ) : null}

      {isStuck && !isWon ? (
        <div className="stuck-bar" role="status">
          <span>Ходов больше нет — можно отменить ход или начать заново.</span>
          <div>
            {canUndo ? (
              <button className="btn btn-ghost btn-small" onClick={() => void undo()}>
                Отменить
              </button>
            ) : null}
            <button className="btn btn-gold btn-small" onClick={() => openModal('new-game')}>
              Новая игра
            </button>
          </div>
        </div>
      ) : null}

      <footer className="game-bottom">
        <div className="game-actions">
          <button className="action-btn" onClick={() => openModal('new-game')}>
            <span className="action-icon"><Icon name="cards" size={21} /></span>
            <span>Новая</span>
          </button>
          <button className="action-btn" disabled={!canUndo} onClick={() => void undo()}>
            <span className="action-icon"><Icon name="undo" size={21} /></span>
            <span>Отменить</span>
          </button>
          <button className="action-btn" onClick={() => void requestHint()} disabled={busy}>
            <span className="action-icon"><Icon name="hint" size={21} /></span>
            <span>Подсказка</span>
            {freeHintsLeft > 0 ? <span className="action-badge">{freeHintsLeft}</span> : null}
          </button>
          {canAuto ? (
            <button className="action-btn" onClick={autoCollect}>
              <span className="action-icon"><Icon name="auto" size={21} /></span>
              <span>Автосборка</span>
            </button>
          ) : (
            <span className="action-spacer" aria-hidden="true" />
          )}
          <button className="action-btn" onClick={() => openModal('pause')}>
            <span className="action-icon"><Icon name="menu" size={21} /></span>
            <span>Меню</span>
          </button>
        </div>
      </footer>

      <Modal
        open={modal === 'pause'}
        title="Пауза"
        subtitle="Таймер остановлен. Партия сохранена на устройстве."
        onClose={closeModal}
        wide
        footer={
          <button className="btn btn-primary" onClick={closeModal}>
            <Icon name="play" size={17} />
            Продолжить игру
          </button>
        }
      >
        <div className="pause-panel">
          <div className="pause-game">
            <span className="mode-glyph"><GameGlyph game={gameId} /></span>
            <div>
              <h3>{meta.title}</h3>
              <p className="muted">{variantLabel(state)}</p>
            </div>
          </div>
          <div className="pause-metrics">
            <div><span>Время</span><strong>{formatDuration(elapsed)}</strong></div>
            <div><span>Ходы</span><strong>{state.moves}</strong></div>
            <div><span>Счёт</span><strong>{state.score}</strong></div>
            <div><span>Побед</span><strong>{gameStats.wins}</strong></div>
          </div>
          <div className="pause-actions">
            <button className="menu-action" onClick={() => openModal('rules')}>
              <Icon name="hint" size={19} />
              <span><strong>Правила</strong><small>Как играть в {meta.title.toLowerCase()}</small></span>
              <Icon name="chevron" size={16} />
            </button>
            <button className="menu-action" onClick={() => openModal('new-game')}>
              <Icon name="cards" size={19} />
              <span><strong>Новая партия</strong><small>Сменить расклад или сложность</small></span>
              <Icon name="chevron" size={16} />
            </button>
            <button className="menu-action" onClick={() => openScreen('stats')}>
              <Icon name="stats" size={19} />
              <span><strong>Статистика</strong><small>Результаты и рекорды</small></span>
              <Icon name="chevron" size={16} />
            </button>
            <button className="menu-action" onClick={() => openScreen('achievements')}>
              <Icon name="trophy" size={19} />
              <span><strong>Достижения</strong><small>Коллекция клуба</small></span>
              <Icon name="chevron" size={16} />
            </button>
            <button className="menu-action" onClick={() => openScreen('settings')}>
              <Icon name="settings" size={19} />
              <span><strong>Настройки</strong><small>Звук, анимации и рубашки</small></span>
              <Icon name="chevron" size={16} />
            </button>
            <button className="menu-action danger" onClick={closeGame}>
              <Icon name="back" size={19} />
              <span><strong>В главное меню</strong><small>Партия останется в сохранениях</small></span>
              <Icon name="chevron" size={16} />
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={modal === 'rules'}
        title={meta.title}
        subtitle="Краткие правила и управление"
        onClose={closeModal}
        wide
      >
        <div className="rules-grid">
          <ol className="rules-list">
            {module.rules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ol>
          <div className="rules-side">
            <div className="rules-tip">
              <Icon name="hint" size={18} />
              <p>Нажмите на карту, чтобы выбрать её, затем нажмите на цель. Двойной клик отправит карту в подходящую базовую стопку.</p>
            </div>
            <div className="rules-tip">
              <Icon name="undo" size={18} />
              <p>История отмены хранит до 40 действий, включая перевороты и автосборку.</p>
            </div>
            <div className="rules-tip">
              <Icon name="auto" size={18} />
              <p>Подсказка показывает возможный ход, но не обещает, что он гарантированно ведёт к победе.</p>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={modal === 'new-game'}
        title="Новая партия"
        subtitle="Выберите расклад и подтвердите начало"
        onClose={closeModal}
        footer={
          <>
            <button className="btn btn-ghost" onClick={closeModal}>Отмена</button>
            <button
              className="btn btn-primary"
              onClick={() => {
                if (gameId === 'klondike') startNew({ drawCount });
                else if (gameId === 'spider') startNew({ suitCount });
                else if (gameId === 'freecell') startNew({ seed: seedInput || undefined });
                else startNew({});
              }}
            >
              <Icon name="play" size={17} />
              Начать партию
            </button>
          </>
        }
      >
        <div className="newgame-form">
          {gameId === 'klondike' ? (
            <div className="choice-group">
              <span className="choice-label">Открывать из колоды</span>
              <div className="choices">
                <button className={`choice ${drawCount === 1 ? 'is-active' : ''}`} onClick={() => setDrawCount(1)}>
                  <strong>По одной</strong>
                  <small>Классический вариант</small>
                </button>
                <button className={`choice ${drawCount === 3 ? 'is-active' : ''}`} onClick={() => setDrawCount(3)}>
                  <strong>По три</strong>
                  <small>Сложнее и динамичнее</small>
                </button>
              </div>
            </div>
          ) : null}
          {gameId === 'spider' ? (
            <div className="choice-group">
              <span className="choice-label">Сложность</span>
              <div className="choices three">
                <button className={`choice ${suitCount === 1 ? 'is-active' : ''}`} onClick={() => setSuitCount(1)}>
                  <strong>Одна масть</strong>
                  <small>Лёгкий</small>
                </button>
                <button className={`choice ${suitCount === 2 ? 'is-active' : ''}`} onClick={() => setSuitCount(2)}>
                  <strong>Две масти</strong>
                  <small>Средний</small>
                </button>
                <button className={`choice ${suitCount === 4 ? 'is-active' : ''}`} onClick={() => setSuitCount(4)}>
                  <strong>Четыре масти</strong>
                  <small>Сложный</small>
                </button>
              </div>
            </div>
          ) : null}
          {gameId === 'freecell' ? (
            <label className="seed-field">
              <span className="choice-label">Номер расклада</span>
              <input
                className="text-input"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={9}
                placeholder="Например, 482913"
                value={seedInput}
                onChange={(event) =>
                  setSeedInput(event.target.value.replace(/\D/g, '').slice(0, 9))
                }
              />
              <small className="muted">
                Введите номер, чтобы повторить знакомый расклад, или оставьте поле пустым —
                клуб выдаст новый.
              </small>
            </label>
          ) : null}
          {gameId === 'pyramid' ? (
            <div className="newgame-note">
              <span className="mode-glyph"><GameGlyph game={gameId} /></span>
              <div>
                <strong>{variantLabel(state)}</strong>
                <p className="muted">
                  Колода открывается по одной карте. Сброс можно переворачивать без ограничений.
                </p>
              </div>
            </div>
          ) : null}
          {state.moves > 0 && !state.won ? (
            <p className="newgame-warning">
              Текущая партия будет завершена и учтена в статистике как поражение. Если хотите
              вернуться позже, выберите «Отмена» — она сохранится автоматически.
            </p>
          ) : (
            <p className="newgame-note-text muted">Новая партия начнётся сразу. Таймер запустится с нуля.</p>
          )}
          <div className="daily-inline">
            <Icon name="calendar" size={16} />
            <span>
              Сегодняшние испытания: {challengeItems.map((c) => c.title).join(' · ')}
            </span>
          </div>
        </div>
      </Modal>

      {dealIsWon ? (
        <div className="win-overlay">
          <div className="confetti" aria-hidden="true">
            {Array.from({ length: 28 }, (_, index) => (
              <span
                key={index}
                className={`confetti-piece piece-${index % 4}`}
                style={{
                  left: `${(index * 37) % 100}%`,
                  animationDelay: `${(index % 10) * 0.18}s`,
                  animationDuration: `${2.6 + (index % 5) * 0.35}s`,
                }}
              />
            ))}
          </div>
          <div className="win-card">
            <span className="win-suit" aria-hidden="true">♠</span>
            <span className="eyebrow">Партия завершена</span>
            <h2>Победа!</h2>
            <p className="win-sub">
              {meta.title} · {variantLabel(state)}
            </p>
            <div className="win-metrics">
              <div><span>Время</span><strong>{formatDuration(elapsed)}</strong></div>
              <div><span>Ходы</span><strong>{state.moves}</strong></div>
              <div><span>Счёт</span><strong>{state.score}</strong></div>
            </div>
            <div className="win-records">
              <span>
                Побед в режиме: <b>{gameStats.wins}</b>
              </span>
              <span>
                Лучшее время: <b>{formatDuration(gameStats.bestTimeMs)}</b>
              </span>
              <span>
                Серия: <b>{gameStats.currentStreak}</b>{' '}
                {pluralize(gameStats.currentStreak, 'победа', 'победы', 'побед')}
              </span>
            </div>
            <div className="win-actions">
              <button className="btn btn-primary" onClick={() => openModal('new-game')}>
                <Icon name="play" size={17} />
                Ещё партия
              </button>
              <button className="btn btn-ghost" onClick={() => setWinDismissed(true)}>
                Посмотреть поле
              </button>
              <button className="btn btn-gold" onClick={closeGame}>
                В меню
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {busy ? (
        <div className="busy-overlay">
          <span className="spinner" />
          <span>Готовим подсказку…</span>
        </div>
      ) : null}
    </div>
  );
}
