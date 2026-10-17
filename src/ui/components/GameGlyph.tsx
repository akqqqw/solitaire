import type { GameId } from '../../core/games/types';

export function GameGlyph({ game, className }: { game: GameId; className?: string }) {
  const common = {
    className,
    viewBox: '0 0 48 48',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  if (game === 'klondike') {
    return (
      <svg {...common} aria-hidden="true">
        <rect x="5" y="12" width="18" height="26" rx="3" transform="rotate(-9 14 25)" />
        <rect x="19" y="9" width="18" height="26" rx="3" transform="rotate(4 28 22)" />
        <path d="M28 17l2.6 3.4L28 23l-2.6-2.6L28 17z" fill="currentColor" stroke="none" />
        <path d="M28 23v4" />
        <path d="M38 8v10M33 13h10" opacity=".55" />
      </svg>
    );
  }
  if (game === 'spider') {
    return (
      <svg {...common} aria-hidden="true">
        <circle cx="24" cy="23" r="6" />
        <path d="M24 17V9M24 29v8M18 20l-7-5M30 20l7-5M18 26l-7 5M30 26l7 5" />
        <path d="M18 12l-4-1M30 12l4-1M18 34l-4 1M30 34l4 1" opacity=".6" />
        <rect x="9" y="30" width="8" height="12" rx="2" opacity=".5" />
        <rect x="31" y="30" width="8" height="12" rx="2" opacity=".5" />
      </svg>
    );
  }
  if (game === 'freecell') {
    return (
      <svg {...common} aria-hidden="true">
        <rect x="6" y="7" width="15" height="12" rx="2" />
        <rect x="27" y="7" width="15" height="12" rx="2" />
        <rect x="6" y="29" width="15" height="12" rx="2" />
        <rect x="27" y="29" width="15" height="12" rx="2" />
        <path d="M13.5 13.5h0M34.5 13.5h0M13.5 35.5h0M34.5 35.5h0" strokeWidth="3" />
      </svg>
    );
  }
  return (
    <svg {...common} aria-hidden="true">
      <path d="M24 5L43 40H5L24 5z" opacity=".7" />
      <rect x="16" y="31" width="16" height="12" rx="2" fill="currentColor" stroke="none" opacity=".18" />
      <path d="M24 12l3 4-3 3-3-3 3-4z" fill="currentColor" stroke="none" opacity=".7" />
      <path d="M8 41h32" opacity=".5" />
    </svg>
  );
}
