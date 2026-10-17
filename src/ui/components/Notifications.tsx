import { useEffect } from 'react';
import { useGameStore, type AppNotification } from '../../store/gameStore';

function NotificationItem({ item }: { item: AppNotification }) {
  const dismiss = useGameStore((s) => s.dismissNotification);
  useEffect(() => {
    const timer = setTimeout(() => dismiss(item.id), 6500);
    return () => clearTimeout(timer);
  }, [dismiss, item.id]);
  return (
    <div className={`notification notification-${item.kind}`} role="status">
      <div className="notification-icon">{item.icon}</div>
      <div className="notification-content">
        <strong>{item.title}</strong>
        <span>{item.body}</span>
      </div>
      <button className="notification-close" onClick={() => dismiss(item.id)} aria-label="Скрыть">
        ×
      </button>
    </div>
  );
}

export function Notifications() {
  const items = useGameStore((s) => s.notifications);
  return (
    <div className="notifications" aria-live="polite">
      {items.map((item) => (
        <NotificationItem key={item.id} item={item} />
      ))}
    </div>
  );
}

export function Toast() {
  const toast = useGameStore((s) => s.toast);
  return toast ? (
    <div className="toast" role="status">
      {toast}
    </div>
  ) : null;
}
