import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { Brand, CoinChip } from './Brand';
import { useGameStore } from '../../store/gameStore';

interface PageShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
  eyebrow?: string;
}

export function PageShell({ title, subtitle, children, actions, eyebrow }: PageShellProps) {
  const openScreen = useGameStore((s) => s.openScreen);
  const coins = useGameStore((s) => s.coins);
  return (
    <div className="page-shell">
      <header className="page-top">
        <button className="back-btn" onClick={() => openScreen('menu')}>
          <Icon name="back" size={19} />
          <span>Меню</span>
        </button>
        <Brand compact />
        <div className="page-top-actions">
          {actions}
          <CoinChip coins={coins} />
        </div>
      </header>
      <main className="page-content screen-enter">
        <div className="page-heading">
          {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
          <h1>{title}</h1>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {children}
      </main>
      <footer className="page-footer">
        <span className="faint">Пасьянс Клуб · прогресс сохраняется автоматически</span>
      </footer>
    </div>
  );
}
