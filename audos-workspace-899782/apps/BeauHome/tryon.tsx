/**
 * Ethaion — “Try this on”.
 *
 * The core promise: see a piece you're considering — a Hunt candidate, a
 * Beau recommendation, or something from your own rail — laid out against
 * what you already own before spending money.
 *
 * TryOnButton is the ghost “Try this on” action on candidate cards, Hunt
 * rows, What-to-wear pieces and owned-piece cards. Tapping it hands the
 * piece to The Fitting (fitting-room-state.ts), where it lands on the
 * flat-lay board — drawn DASHED when it isn't yours, so a board holding it
 * saves as a proposal.
 *
 * THE AVATAR BUILDER IS DELETED (design handoff §dead-code): the flat lay
 * replaced the try-on figure. The face-photo / skin-tone profile section
 * and the lib/tryon provider seam are gone with it.
 */
import { PersonStanding } from 'lucide-react';
import { typography } from '../../lib/colors';
import { requestFittingRoomTryOn } from './fitting-room-state';

// ---------------------------------------------------------------------------
// The piece being tried on — everything The Fitting needs about it.
// ---------------------------------------------------------------------------

export interface TryOnPiece {
  name: string;
  brand?: string | null;
  /** Wardrobe category — lets The Fitting place the piece in its zone. */
  category?: string | null;
  /** A short Beau line about the piece — reuse the card's existing
   * recommendation copy when available. */
  note?: string | null;
  /** Direct garment image URL, when the card already has one. */
  garmentImageUrl?: string | null;
  /** Product page URL — resolved to its og:image when no direct image. */
  productUrl?: string | null;
  /** The card's existing CTA, carried into The Fitting's fallback. */
  ctaLabel?: string | null;
  ctaUrl?: string | null;
}

// ---------------------------------------------------------------------------
// The “Try this on” button — walnut text in a hairline-bordered ghost pill,
// always a SECONDARY action. Tapping it opens The Fitting with the piece
// landing on the flat-lay board.
// ---------------------------------------------------------------------------

export function TryOnButton({
  piece,
  className = '',
  plain = false,
}: {
  piece: TryOnPiece;
  className?: string;
  /** Text-link presentation (list rows) instead of the bordered pill. */
  plain?: boolean;
}) {
  // 44px touch floor on mobile; the desktop presentation stays compact.
  const buttonCls = plain
    ? `inline-flex items-center gap-1.5 min-h-[44px] sm:min-h-0 ${typography.size.xs} text-[var(--color-text,#241a12)] hover:text-[var(--color-accent-700,#7c4a17)] hover:underline transition-colors`
    : `px-3 py-1.5 min-h-[44px] sm:min-h-0 rounded-lg ${typography.size.xs} inline-flex items-center gap-1.5 bg-transparent border border-[var(--color-divider,rgba(59,43,29,0.18))] text-[var(--color-text,#241a12)] hover:border-[var(--space-border-strong)] transition-colors`;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        requestFittingRoomTryOn({
          key: `piece-${(piece.garmentImageUrl || piece.productUrl || `${piece.brand || ''}-${piece.name}`).trim()}`,
          name: piece.name,
          brand: piece.brand || null,
          category: piece.category || null,
          garmentImageUrl: piece.garmentImageUrl || null,
          productUrl: piece.productUrl || null,
          note: piece.note || null,
          ctaLabel: piece.ctaLabel || null,
          ctaUrl: piece.ctaUrl || null,
        });
      }}
      className={`${buttonCls} ${className}`}
      title="Lay it out with the rest of your look before you spend a penny — opens The Fitting"
    >
      <PersonStanding className="w-3.5 h-3.5" />
      Try this on
    </button>
  );
}

/** The avatar profile section is deleted — kept as a null component so any
 * stale import renders nothing rather than crashing. */
export function TryOnPhotoSection(_props: { className?: string }) {
  return null;
}
