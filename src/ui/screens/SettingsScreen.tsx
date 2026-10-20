import { useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import { PageShell } from '../components/PageShell';
import { Modal } from '../components/Modal';
import { CardArt } from '../components/CardArt';
import { Icon } from '../components/Icon';
import { CARD_BACKS, TABLE_THEMES, isCosmeticOwned } from '../../store/profile';
import { formatCoins } from '../utils';
import { platform } from '../../services/platform';

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <div className="setting-row">
      <div>
        <strong>{label}</strong>
        <p className="muted">{description}</p>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`switch ${checked ? 'is-on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </div>
  );
}

export function SettingsScreen() {
  const settings = useGameStore((s) => s.settings);
  const owned = useGameStore((s) => s.owned);
  const updateSettings = useGameStore((s) => s.updateSettings);
  const openScreen = useGameStore((s) => s.openScreen);
  const resetProgress = useGameStore((s) => s.resetProgress);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  const handleReset = async () => {
    setResetting(true);
    await resetProgress();
    setResetting(false);
    setConfirmReset(false);
  };

  return (
    <PageShell
      eyebrow="Ваш стол"
      title="Настройки"
      subtitle="Оформление, звук и данные — всё хранится на устройстве."
    >
      <section className="settings-section glass">
        <div className="settings-head">
          <div>
            <span className="eyebrow">Рубашки карт</span>
            <h2>Выберите характер колоды</h2>
          </div>
          <span className="pill">{CARD_BACKS.length} варианта</span>
        </div>
        <div className="card-back-grid">
          {CARD_BACKS.map((back) => {
            const unlocked = isCosmeticOwned(owned, back.id);
            return (
              <button
                key={back.id}
                className={`card-back-option ${settings.cardBack === back.id ? 'is-active' : ''} ${
                  unlocked ? '' : 'is-locked'
                }`}
                onClick={() =>
                  unlocked ? updateSettings({ cardBack: back.id }) : openScreen('shop')
                }
                aria-pressed={settings.cardBack === back.id}
                title={unlocked ? back.label : `Купить за ${back.price} монет`}
              >
                <span className={`card-back-preview ${unlocked ? '' : 'is-locked-art'}`}>
                  <CardArt suit="spades" rank={1} faceUp={false} back={back.id} />
                </span>
                <span>{back.label}</span>
                {unlocked ? (
                  settings.cardBack === back.id ? (
                    <i>✓</i>
                  ) : null
                ) : (
                  <i className="style-price">
                    <Icon name="coin" size={12} /> {formatCoins(back.price)}
                  </i>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <section className="settings-section glass">
        <div className="settings-head">
          <div>
            <span className="eyebrow">Сукно стола</span>
            <h2>Атмосфера клуба</h2>
          </div>
        </div>
        <div className="theme-grid">
          {TABLE_THEMES.map((theme) => {
            const unlocked = isCosmeticOwned(owned, theme.id);
            return (
              <button
                key={theme.id}
                className={`theme-option theme-${theme.id} ${
                  settings.tableTheme === theme.id ? 'is-active' : ''
                } ${unlocked ? '' : 'is-locked'}`}
                onClick={() =>
                  unlocked ? updateSettings({ tableTheme: theme.id }) : openScreen('shop')
                }
                aria-pressed={settings.tableTheme === theme.id}
                title={unlocked ? theme.label : `Купить за ${theme.price} монет`}
              >
                <span className={`theme-swatch ${unlocked ? '' : 'is-locked-art'}`}>
                  <span className="theme-swatch-card" />
                  <span className="theme-swatch-card second" />
                </span>
                <span>{theme.label}</span>
                {unlocked ? (
                  settings.tableTheme === theme.id ? (
                    <i>✓</i>
                  ) : null
                ) : (
                  <i className="style-price">
                    <Icon name="coin" size={12} /> {formatCoins(theme.price)}
                  </i>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <p className="settings-shop-hint muted">
        Замок и цена означают, что стиль ещё не куплен — открыть коллекцию можно в{' '}
        <button className="text-btn" onClick={() => openScreen('shop')}>
          магазине
          <Icon name="chevron" size={14} />
        </button>
      </p>

      <section className="settings-section glass">
        <div className="settings-head">
          <div>
            <span className="eyebrow">Поведение</span>
            <h2>Анимации и звук</h2>
          </div>
        </div>
        <Toggle
          checked={settings.animations}
          onChange={(animations) => updateSettings({ animations })}
          label="Анимации карт"
          description="Плавные перемещения, перевороты и раздача. Можно отключить на слабых устройствах."
        />
        <Toggle
          checked={settings.sounds}
          onChange={(sounds) => updateSettings({ sounds })}
          label="Звуки"
          description="Мягкие синтезированные эффекты: шорох карт по сукну, тихие ходы и победа."
        />
        <Toggle
          checked={settings.targetHints}
          onChange={(targetHints) => updateSettings({ targetHints })}
          label="Подсветка мест"
          description="Показывать зелёным, куда можно положить взятую карту. Выключено — стол остаётся спокойным, а подсказка по кнопке работает как раньше."
        />
      </section>

      <section className="settings-section glass">
        <div className="settings-head">
          <div>
            <span className="eyebrow">Платформа</span>
            <h2>Сохранения и интеграции</h2>
          </div>
          <span className={`pill ${platform.available ? 'pill-live' : ''}`}>
            {platform.available ? 'Яндекс Игры подключены' : 'Офлайн-режим'}
          </span>
        </div>
        <ul className="settings-list">
          <li>
            <Icon name="cards" size={18} />
            <div>
              <strong>Локальные сохранения</strong>
              <p className="muted">IndexedDB с резервной копией в localStorage. Версионирование и проверка данных.</p>
            </div>
          </li>
          <li>
            <Icon name="spark" size={18} />
            <div>
              <strong>Облачная синхронизация</strong>
              <p className="muted">При запуске в Яндекс Играх прогресс сравнивается по времени изменения — побеждает более свежая версия.</p>
            </div>
          </li>
          <li>
            <Icon name="trophy" size={18} />
            <div>
              <strong>Реклама и лидерборды</strong>
              <p className="muted">Межстраничная реклама только после завершённой партии и не чаще раза в 3,5 минуты. Rewarded Video даёт подсказки. Монеты — только за реальную покупку. Вне платформы рекламы нет.</p>
            </div>
          </li>
        </ul>
        <div className="settings-version">
          <span>Пасьянс Клуб 0.1.0</span>
          <span className="muted">Схема сохранений v2 · офлайн-кэш PWA</span>
        </div>
      </section>

      <section className="settings-danger glass">
        <div>
          <strong>Сбросить прогресс</strong>
          <p className="muted">
            Удаляются статистика, достижения, ежедневные задания, купленные стили, монеты и все
            сохранённые партии. Это действие нельзя отменить.
          </p>
        </div>
        <button className="btn btn-danger" onClick={() => setConfirmReset(true)}>
          <Icon name="reset" size={18} />
          Сбросить всё
        </button>
      </section>

      <Modal
        open={confirmReset}
        title="Сбросить прогресс?"
        subtitle="Статистика и сохранённые партии будут удалены без возможности восстановления."
        onClose={() => setConfirmReset(false)}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setConfirmReset(false)}>
              Отмена
            </button>
            <button className="btn btn-danger" onClick={handleReset} disabled={resetting}>
              {resetting ? 'Сбрасываем…' : 'Да, сбросить'}
            </button>
          </>
        }
      >
        <p className="modal-text">
          Настройки вернутся к стандартным. Если вы играете в Яндекс Играх, локальная копия будет
          заменена новой; облачная — обновится при следующем сохранении.
        </p>
      </Modal>
    </PageShell>
  );
}
