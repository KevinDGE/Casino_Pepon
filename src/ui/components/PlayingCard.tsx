import { cardAriaLabel, rankOf, suitOf, SUIT_SYMBOLS } from '../../core/cards';

const RANK_LABEL = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export interface CardProps {
  card: number | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  highlight?: boolean;
  dim?: boolean;
  /** Retraso de la animación de reparto (ms). */
  delay?: number;
  animate?: boolean;
  className?: string;
}

export function PlayingCard({ card, size = 'md', highlight, dim, delay = 0, animate = true, className = '' }: CardProps) {
  const style = animate ? { animationDelay: `${delay}ms` } : undefined;
  if (card === null) {
    return (
      <div className={`pcard pcard-${size} pcard-back ${animate ? 'deal-in' : ''} ${className}`} style={style} role="img" aria-label="Carta boca abajo">
        <span className="pcard-back-mark" aria-hidden="true">P</span>
      </div>
    );
  }
  const r = rankOf(card);
  const s = suitOf(card);
  const color = ['spade', 'heart', 'diamond', 'club'][s];
  return (
    <div
      className={`pcard pcard-${size} suit-${color} ${highlight ? 'pcard-hl' : ''} ${dim ? 'pcard-dim' : ''} ${animate ? 'deal-in' : ''} ${className}`}
      style={style}
      role="img"
      aria-label={cardAriaLabel(card)}
    >
      <span className="pcard-corner" aria-hidden="true">
        <b>{RANK_LABEL[r]}</b>
        <i>{SUIT_SYMBOLS[s]}</i>
      </span>
      <span className="pcard-pip" aria-hidden="true">{SUIT_SYMBOLS[s]}</span>
    </div>
  );
}

export function CardSlot({ size = 'md' }: { size?: CardProps['size'] }) {
  return <div className={`pcard pcard-${size} pcard-slot`} aria-hidden="true" />;
}
