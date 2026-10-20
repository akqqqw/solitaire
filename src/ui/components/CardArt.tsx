import { useId } from 'react';
import type { Rank, Suit } from '../../core/cards/Card';
import { RANK_LABEL, SUIT_SYMBOL } from '../../core/cards/Card';
import type { CardBackId } from '../../store/profile';

const BACK_COLORS: Record<CardBackId, { deep: string; accent: string; line: string }> = {
  emerald: { deep: '#123c2d', accent: '#c8a85a', line: '#1f5a44' },
  midnight: { deep: '#1b2742', accent: '#b9c6dd', line: '#2c3f63' },
  burgundy: { deep: '#4a1d26', accent: '#e2b177', line: '#6c2c39' },
  sapphire: { deep: '#143453', accent: '#a9c7e8', line: '#205074' },
  onyx: { deep: '#1a1a1e', accent: '#d9c27a', line: '#2e2e36' },
  royal: { deep: '#3a1d50', accent: '#e0c07a', line: '#553074' },
  frost: { deep: '#1f3d4d', accent: '#cfe6f2', line: '#2f5b70' },
  aurum: { deep: '#2b2113', accent: '#f0d08a', line: '#4a3820' },
};

const RED = '#b12637';
const BLACK = '#1d2328';

interface CardArtProps {
  suit: Suit;
  rank: Rank;
  faceUp?: boolean;
  back?: CardBackId;
  className?: string;
  style?: React.CSSProperties;
}

export function CardArt({
  suit,
  rank,
  faceUp = true,
  back = 'emerald',
  className,
  style,
}: CardArtProps) {
  const color = suit === 'hearts' || suit === 'diamonds' ? RED : BLACK;
  const theme = BACK_COLORS[back];
  const patternId = useId().replace(/:/g, '');
  const label = RANK_LABEL[rank];
  const symbol = SUIT_SYMBOL[suit];
  const isFace = rank > 10;
  return (
    <svg
      viewBox="0 0 120 168"
      className={className}
      style={style}
      role="img"
      aria-label={faceUp ? `${label} ${symbol}` : 'Рубашка карты'}
    >
      <defs>
        <linearGradient id={`face-${patternId}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fffdf6" />
          <stop offset="1" stopColor="#f1ebda" />
        </linearGradient>
        <pattern id={`dots-${patternId}`} width="18" height="18" patternUnits="userSpaceOnUse">
          <path d="M9 2 L16 9 L9 16 L2 9 Z" fill="none" stroke={theme.line} strokeWidth="1.1" />
        </pattern>
      </defs>
      <rect x="2" y="4" width="116" height="162" rx="10" fill="rgba(0,0,0,.28)" />
      {faceUp ? (
        <>
          <rect x="1" y="1" width="118" height="166" rx="10" fill={`url(#face-${patternId})`} stroke="#c9c1af" />
          <rect x="8" y="8" width="104" height="152" rx="7" fill="none" stroke="#c8a85a" strokeOpacity=".28" />
          <text x="13" y="31" fontFamily="Georgia, serif" fontWeight="700" fontSize="22" fill={color}>
            {label}
          </text>
          <text x="14" y="48" fontFamily="Georgia, serif" fontSize="17" fill={color}>
            {symbol}
          </text>
          <g transform="rotate(180 60 84)">
            <text x="107" y="31" textAnchor="end" fontFamily="Georgia, serif" fontWeight="700" fontSize="22" fill={color}>
              {label}
            </text>
            <text x="107" y="48" textAnchor="end" fontFamily="Georgia, serif" fontSize="17" fill={color}>
              {symbol}
            </text>
          </g>
          {isFace ? (
            <>
              <rect x="27" y="42" width="66" height="84" rx="8" fill="none" stroke="#c8a85a" strokeOpacity=".65" />
              <text x="60" y="85" textAnchor="middle" fontFamily="Georgia, serif" fontWeight="700" fontSize="40" fill={color}>
                {label}
              </text>
              <text x="60" y="112" textAnchor="middle" fontFamily="Georgia, serif" fontSize="22" fill={color} opacity=".8">
                {symbol}
              </text>
              <text x="60" y="54" textAnchor="middle" fontFamily="Georgia, serif" fontSize="10" fill="#b08d3f">
                ◆
              </text>
            </>
          ) : (
            <>
              <text x="60" y="105" textAnchor="middle" fontFamily="Georgia, serif" fontSize="60" fill={color} opacity=".92">
                {symbol}
              </text>
              <text x="60" y="43" textAnchor="middle" fontFamily="Georgia, serif" fontSize="15" fill={color} opacity=".25">
                {symbol}
              </text>
              <text x="60" y="135" textAnchor="middle" fontFamily="Georgia, serif" fontSize="15" fill={color} opacity=".25">
                {symbol}
              </text>
            </>
          )}
        </>
      ) : (
        <>
          <rect x="1" y="1" width="118" height="166" rx="10" fill={theme.deep} stroke="#0a1712" />
          <rect x="8" y="7" width="104" height="154" rx="7" fill={`url(#dots-${patternId})`} stroke={theme.accent} strokeOpacity=".8" />
          <circle cx="60" cy="84" r="25" fill={theme.deep} stroke={theme.accent} strokeOpacity=".85" />
          <circle cx="60" cy="84" r="19" fill="none" stroke={theme.accent} strokeOpacity=".4" />
          <text x="60" y="91" textAnchor="middle" fontFamily="Georgia, serif" fontWeight="700" fontSize="19" fill={theme.accent}>
            SC
          </text>
        </>
      )}
    </svg>
  );
}
