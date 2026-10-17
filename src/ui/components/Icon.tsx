export type IconName =
  | 'back'
  | 'play'
  | 'undo'
  | 'hint'
  | 'auto'
  | 'menu'
  | 'stats'
  | 'trophy'
  | 'settings'
  | 'calendar'
  | 'close'
  | 'sound'
  | 'spark'
  | 'reset'
  | 'chevron'
  | 'pause'
  | 'cards'
  | 'coin';

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (name) {
    case 'back':
      return (
        <svg {...common}>
          <path d="M15 5l-7 7 7 7" />
        </svg>
      );
    case 'play':
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <path d="M8 5.5v13l10-6.5-10-6.5z" />
        </svg>
      );
    case 'undo':
      return (
        <svg {...common}>
          <path d="M4 9h10a5 5 0 0 1 0 10H9" />
          <path d="M8 5L4 9l4 4" />
        </svg>
      );
    case 'hint':
      return (
        <svg {...common}>
          <path d="M9 18h6M10 21h4" />
          <path d="M8.4 14.5a6 6 0 1 1 7.2 0c-.9.7-1.4 1.5-1.6 2.5H9.9c-.2-1-.7-1.8-1.5-2.5z" />
          <path d="M12 4v1M5 7l.8.8M19 7l-.8.8" />
        </svg>
      );
    case 'auto':
      return (
        <svg {...common}>
          <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
          <path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z" />
        </svg>
      );
    case 'menu':
      return (
        <svg {...common}>
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      );
    case 'stats':
      return (
        <svg {...common}>
          <path d="M5 20V10M12 20V4M19 20v-7" />
          <path d="M3 20h18" />
        </svg>
      );
    case 'trophy':
      return (
        <svg {...common}>
          <path d="M8 4h8v5a4 4 0 0 1-8 0V4z" />
          <path d="M8 6H4v2a4 4 0 0 0 4 4M16 6h4v2a4 4 0 0 1-4 4M12 13v5M8 21h8M9 18h6" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3v-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3h4v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1v4H21a1.7 1.7 0 0 0-1.6 1z" />
        </svg>
      );
    case 'calendar':
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4M8 14h2M14 14h2M8 17h2" />
        </svg>
      );
    case 'close':
      return (
        <svg {...common}>
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      );
    case 'sound':
      return (
        <svg {...common}>
          <path d="M4 9v6h4l5 4V5L8 9H4z" />
          <path d="M17 9a4 4 0 0 1 0 6M19.5 6.5a8 8 0 0 1 0 11" />
        </svg>
      );
    case 'spark':
      return (
        <svg {...common}>
          <path d="M12 3l1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3z" />
        </svg>
      );
    case 'reset':
      return (
        <svg {...common}>
          <path d="M4 10a8 8 0 1 1 2 7" />
          <path d="M4 4v6h6" />
        </svg>
      );
    case 'chevron':
      return (
        <svg {...common}>
          <path d="M9 6l6 6-6 6" />
        </svg>
      );
    case 'pause':
      return (
        <svg {...common}>
          <path d="M8 5v14M16 5v14" />
        </svg>
      );
    case 'cards':
      return (
        <svg {...common}>
          <rect x="7" y="4" width="12" height="16" rx="2" transform="rotate(8 13 12)" />
          <rect x="4" y="5" width="12" height="16" rx="2" transform="rotate(-6 10 13)" />
          <path d="M10 11l1.4 1.8L10 14.6l-1.4-1.8L10 11z" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'coin':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M9.5 8.8h3.2a2 2 0 0 1 0 4H11a2 2 0 0 0 0 4h3.5" />
          <path d="M12 6.8v10.4" opacity=".6" />
        </svg>
      );
    default:
      return null;
  }
}
