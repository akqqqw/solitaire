import { useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import { PageShell } from '../components/PageShell';
import { Modal } from '../components/Modal';
import { CardArt } from '../components/CardArt';
import { Icon } from '../components/Icon';
import { CARD_BACKS, TABLE_THEMES } from '../../store/profile';
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
  const updateSettings = useGameStore((s) => s.updateSettings);
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
          {CARD_BACKS.map((back) => (
            <button
              key={back.id}
              className={`card-back-option ${settings.cardBack === back.id ? 'is-active' : ''}`}
              onClick={() => updateSettings({ cardBack: back.id })}
              aria-pressed={settings.cardBack === back.id}
            >
              <span className="card-back-preview">
                <CardArt suit="spades" rank={1} faceUp={false} back={back.id} />
              </span>
              <span>{back.label}</span>
              {settings.cardBack === back.id ? <i>✓</i> : null}
            </button>
          ))}
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
          {TABLE_THEMES.map((theme) => (
            <button
              key={theme.id}
              className={`theme-option theme-${theme.id} ${
                settings.tableTheme === theme.id ? 'is-active' : ''
              }`}
              onClick={() => updateSettings({ tableTheme: theme.id })}
              aria-pressed={settings.tableTheme === theme.id}
            >
              <span className="theme-swatch">
                <span className="theme-swatch-card" />
                <span className="theme-swatch-card second" />
              </span>
              <span>{theme.label}</span>
              {settings.tableTheme === theme.id ? <i>✓</i> : null}
            </button>
          ))}
        </div>
      </section>

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
              <p className="muted">Межстраничная реклама между партиями и Rewarded Video за дополнительные подсказки. Вне платформы всё работает без рекламы.</p>
            </div>
          </li>
        </ul>
        <div className="settings-version">
          <span>Пасьянс Клуб 0.1.0</span>
          <span className="muted">Схема сохранений v1 · офлайн-кэш PWA</span>
        </div>
      </section>

      <section className="settings-danger glass">
        <div>
          <strong>Сбросить прогресс</strong>
          <p className="muted">
            Удаляются статистика, достижения, ежедневные задания, монеты и все сохранённые партии.
            Это действие нельзя отменить.
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
