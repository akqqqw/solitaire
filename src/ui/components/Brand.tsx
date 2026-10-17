import { Icon } from './Icon';
import { useGameStore } from '../../store/gameStore';

export function Brand({ compact = false }: { compact?: boolean }) {
  const openScreen = useGameStore((s) => s.openScreen);
  return (
    <button
      className={`brand ${compact ? 'brand-compact' : ''}`}
      onClick={() => openScreen('menu')}
      aria-label="Пасьянс Клуб — в главное меню"
    >
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 48 48" fill="none">
          <rect x="8" y="10" width="20" height="29" rx="4" transform="rotate(-10 18 24)" fill="#f3ead7" stroke="#c8a85a" />
          <rect x="20" y="8" width="20" height="29" rx="4" transform="rotate(6 30 22)" fill="#0f2e23" stroke="#d6b86d" />
          <path d="M30 15l2.7 3.4L30 21.8l-2.7-3.4L30 15z" fill="#d6b86d" />
          <path d="M30 21.8V26" stroke="#d6b86d" />
        </svg>
      </span>
      <span className="brand-text">
        <span className="brand-title">Пасьянс</span>
        <span className="brand-sub">Клуб · Solitaire Club</span>
      </span>
      {!compact ? null : <span className="brand-chevron"><Icon name="chevron" size={16} /></span>}
    </button>
  );
}

export function CoinChip({ coins }: { coins: number }) {
  return (
    <span className="coin-chip" title="Клубные монеты">
      <Icon name="coin" size={17} />
      <span>{new Intl.NumberFormat('ru-RU').format(coins)}</span>
    </span>
  );
}
