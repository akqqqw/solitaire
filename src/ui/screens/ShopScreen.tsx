import { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import { PageShell } from '../components/PageShell';
import { Icon } from '../components/Icon';
import { CardArt } from '../components/CardArt';
import { COIN_PACKS } from '../../services/iap';
import { rewardedCooldownLeft } from '../../services/adPolicy';
import { CARD_BACKS, TABLE_THEMES, isCosmeticOwned, REWARDED_HINTS } from '../../store/profile';
import { formatCoins, pluralize } from '../utils';

function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function ShopScreen() {
  const coins = useGameStore((s) => s.coins);
  const hints = useGameStore((s) => s.hints);
  const owned = useGameStore((s) => s.owned);
  const settings = useGameStore((s) => s.settings);
  const ads = useGameStore((s) => s.ads);
  const busy = useGameStore((s) => s.busy);
  const payments = useGameStore((s) => s.payments);
  const catalog = useGameStore((s) => s.catalog);
  const buying = useGameStore((s) => s.buyCosmetic);
  const equip = useGameStore((s) => s.equipCosmetic);
  const purchaseCoins = useGameStore((s) => s.purchaseCoins);
  const claimRewarded = useGameStore((s) => s.claimRewardedHints);
  const now = useNow();

  const cooldown = useMemo(() => rewardedCooldownLeft(ads, now), [ads, now]);
  const freeStyles =
    CARD_BACKS.filter((item) => item.price === 0).length +
    TABLE_THEMES.filter((item) => item.price === 0).length;
  const totalStyles = CARD_BACKS.length + TABLE_THEMES.length;

  return (
    <PageShell
      eyebrow="Витрина клуба"
      title="Магазин"
      subtitle="Стили карт и стола покупаются за монеты. Монеты пополняются только покупкой — в игре их не заработать."
    >
      <section className="shop-balance glass">
        <div>
          <span className="eyebrow">Клубный счёт</span>
          <div className="shop-balance-value">
            <Icon name="coin" size={26} />
            <strong>{formatCoins(coins)}</strong>
            <span>{pluralize(coins, 'монета', 'монеты', 'монет')}</span>
          </div>
          <p className="muted">
            Монеты — премиальная валюта. Их нельзя выиграть в партии или получить за вход:
            только купить. Купленные стили остаются навсегда.
          </p>
        </div>
        <div className="shop-balance-side">
          <span className="pill">
            <Icon name="hint" size={15} /> {hints} запас
          </span>
          <span className="muted">
            Открыто стилей: {freeStyles + owned.length} из {totalStyles}
          </span>
        </div>
      </section>

      <section className="shop-section">
        <div className="section-head compact">
          <div>
            <span className="eyebrow">Пополнение</span>
            <h2>Наборы монет</h2>
          </div>
          <span className={`pill ${payments ? 'pill-live' : ''}`}>
            {payments ? 'Оплата через Яндекс Игры' : 'Офлайн-режим'}
          </span>
        </div>
        {!payments ? (
          <p className="shop-note muted">
            Покупки работают в Яндекс Играх. Вне платформы игра полностью доступна, но кошелёк
            пополнить нельзя — это требование площадки к платежам.
          </p>
        ) : null}
        <div className="shop-packs">
          {COIN_PACKS.map((pack) => {
            const price = catalog.find((item) => item.id === pack.id)?.price ?? pack.fallbackPrice;
            return (
              <article className="shop-pack glass" key={pack.id}>
                <div className="shop-pack-head">
                  <span className="shop-pack-icon">
                    <Icon name="coin" size={22} />
                  </span>
                  {pack.badge ? <span className="shop-pack-badge">{pack.badge}</span> : null}
                </div>
                <strong className="shop-pack-coins">
                  {formatCoins(pack.coins)} <small>монет</small>
                </strong>
                <h3>{pack.title}</h3>
                <p className="muted">{pack.subtitle}</p>
                <button
                  className="btn btn-gold shop-buy"
                  disabled={!payments || busy}
                  onClick={() => void purchaseCoins(pack.id)}
                  title={payments ? undefined : 'Покупки доступны в Яндекс Играх'}
                >
                  {busy ? 'Открываем оплату…' : `Купить · ${price}`}
                </button>
              </article>
            );
          })}
        </div>
        <p className="shop-fineprint faint">
          Цены приходят из каталога Яндекс Игр, оплата — в платёжной форме площадки. Начисление
          происходит сразу после оплаты; незавершённая покупка восстанавливается при следующем
          запуске.
        </p>
      </section>

      <section className="shop-section">
        <div className="section-head compact">
          <div>
            <span className="eyebrow">Без денег</span>
            <h2>Подсказки за ролик</h2>
          </div>
        </div>
        <div className="shop-reward glass">
          <div className="shop-reward-icon">
            <Icon name="hint" size={26} />
          </div>
          <div className="shop-reward-copy">
            <strong>Rewarded Video · +{REWARDED_HINTS} подсказки</strong>
            <p className="muted">
              Один короткий ролик — {REWARDED_HINTS}{' '}
              {pluralize(REWARDED_HINTS, 'подсказка', 'подсказки', 'подсказок')} в запас. Награда
              не чаще раза в две минуты, монеты за видео не начисляются.
            </p>
          </div>
          <button
            className="btn btn-secondary"
            disabled={!payments || busy || cooldown > 0}
            onClick={() => void claimRewarded()}
            title={payments ? undefined : 'Видео доступно в Яндекс Играх'}
          >
            {cooldown > 0
              ? `Через ${cooldown} с`
              : payments
                ? 'Смотреть видео'
                : 'Только в Яндекс Играх'}
          </button>
        </div>
      </section>

      <section className="shop-section">
        <div className="section-head compact">
          <div>
            <span className="eyebrow">Коллекция</span>
            <h2>Рубашки карт</h2>
          </div>
          <span className="pill">{owned.length} куплено</span>
        </div>
        <div className="shop-styles">
          {CARD_BACKS.map((back) => {
            const isOwned = isCosmeticOwned(owned, back.id);
            const isActive = settings.cardBack === back.id;
            return (
              <article
                key={back.id}
                className={`shop-style glass ${isActive ? 'is-active' : ''}`}
              >
                <span className="shop-style-preview">
                  <CardArt suit="spades" rank={1} faceUp={false} back={back.id} />
                </span>
                <strong>{back.label}</strong>
                <span className="shop-style-price">
                  {isOwned ? (
                    isActive ? (
                      <span className="pill pill-live">На столе</span>
                    ) : (
                      <span className="muted">Куплено</span>
                    )
                  ) : (
                    <>
                      <Icon name="coin" size={15} /> {formatCoins(back.price)}
                    </>
                  )}
                </span>
                {isOwned ? (
                  <button
                    className="btn btn-secondary shop-style-btn"
                    disabled={isActive}
                    onClick={() => equip(back.id)}
                  >
                    {isActive ? 'Выбрано' : 'Надеть'}
                  </button>
                ) : (
                  <button
                    className="btn btn-gold shop-style-btn"
                    disabled={coins < back.price}
                    onClick={() => buying(back.id)}
                  >
                    {coins < back.price
                      ? `Не хватает ${formatCoins(back.price - coins)}`
                      : 'Купить'}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section className="shop-section">
        <div className="section-head compact">
          <div>
            <span className="eyebrow">Коллекция</span>
            <h2>Сукно стола</h2>
          </div>
        </div>
        <div className="shop-styles">
          {TABLE_THEMES.map((theme) => {
            const isOwned = isCosmeticOwned(owned, theme.id);
            const isActive = settings.tableTheme === theme.id;
            return (
              <article
                key={theme.id}
                className={`shop-style glass theme-${theme.id} ${
                  isActive ? 'is-active' : ''
                }`}
              >
                <span className="theme-swatch shop-style-felt">
                  <span className="theme-swatch-card" />
                  <span className="theme-swatch-card second" />
                </span>
                <strong>{theme.label}</strong>
                <span className="shop-style-price">
                  {isOwned ? (
                    isActive ? (
                      <span className="pill pill-live">На столе</span>
                    ) : (
                      <span className="muted">Куплено</span>
                    )
                  ) : (
                    <>
                      <Icon name="coin" size={15} /> {formatCoins(theme.price)}
                    </>
                  )}
                </span>
                {isOwned ? (
                  <button
                    className="btn btn-secondary shop-style-btn"
                    disabled={isActive}
                    onClick={() => equip(theme.id)}
                  >
                    {isActive ? 'Выбрано' : 'Надеть'}
                  </button>
                ) : (
                  <button
                    className="btn btn-gold shop-style-btn"
                    disabled={coins < theme.price}
                    onClick={() => buying(theme.id)}
                  >
                    {coins < theme.price
                      ? `Не хватает ${formatCoins(theme.price - coins)}`
                      : 'Купить'}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </PageShell>
  );
}
