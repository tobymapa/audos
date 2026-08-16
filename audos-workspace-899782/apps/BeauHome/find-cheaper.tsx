/**
 * “FIND IT CHEAPER” — the secondary action on a Rail product card.
 *
 * The card's primary action goes to the piece's OFFICIAL product page. This
 * is the other half of the decision: the same specific piece, hunted across
 * the secondhand and multi-brand marketplaces (eBay, Grailed, Vinted,
 * Vestiaire) and returned as REAL listings — title, price, condition and a
 * link straight to that item. Never a list of shops.
 *
 * It is deliberately a thin wrapper: the searching, ranking and honest
 * empty-handed note all belong to ./listing-search (the Beau Real Search
 * engine). This file only
 * turns a brand and a product name into a brief, and draws the result in the
 * compact register a card can carry — hairline rows inline beneath it, no
 * modal, no navigation away from the rail.
 */
import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { typography } from '../../lib/colors';
import {
  parseFindQuery,
  runListingSearch,
  type ListingSearchOutcome,
} from './listing-search';

/** How many listings a card shows. */
const MAX_ON_CARD = 5;

function Chip({ label }: { label: string }) {
  if (!label) return null;
  return (
    <span
      className="uppercase text-[var(--color-neutral-700,#634e38)]"
      style={{
        fontFamily: 'var(--space-font-heading)',
        fontSize: 'max(var(--eth-serif, 0px), 9.5px)',
        letterSpacing: '0.12em',
        border: '1px solid var(--color-divider,rgba(59,43,29,0.18))',
        padding: '2px 5px',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

/**
 * The secondary action itself: hairline border, walnut text, no fill — it
 * must never compete with the card's primary product-page link. Tapping it
 * runs the search once and unfolds the results in place; tapping again folds
 * them away without re-running anything.
 */
export function FindCheaperAction({
  brand,
  name,
  /** Passed through from style prefs — a customer who has said he will not
   * buy secondhand still gets the multi-brand sweep, never a bedroom-floor
   * eBay photo. */
  allowSecondhand = true,
}: {
  brand: string;
  name: string;
  allowSecondhand?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('');
  const [outcome, setOutcome] = useState<ListingSearchOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  const label = `${brand} ${name}`.trim();

  useEffect(() => {
    // A new piece on the same card slot forgets the last hunt.
    ran.current = false;
    setOpen(false);
    setOutcome(null);
    setError(null);
  }, [label]);

  const run = async () => {
    if (ran.current || busy) return;
    ran.current = true;
    setBusy(true);
    setError(null);
    try {
      // “secondhand” is what makes this a used-condition brief, which is what
      // sends the engine to the marketplaces rather than the retailers.
      const params = parseFindQuery(`${label} secondhand`);
      setOutcome(await runListingSearch(params, { allowSecondhand, onPhase: setPhase }));
    } catch (e) {
      console.warn('[Ethaion] find-it-cheaper search failed:', e);
      ran.current = false;
      setError('Couldn\u2019t reach the marketplaces just now — try again in a moment.');
    } finally {
      setBusy(false);
      setPhase('');
    }
  };

  const listings = (outcome?.listings || []).slice(0, MAX_ON_CARD);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) void run();
        }}
        aria-expanded={open}
        className="px-3 min-h-[40px] inline-flex items-center gap-1.5 bg-transparent transition-colors hover:bg-[var(--color-accent-100,#fbf1de)]"
        style={{
          fontFamily: 'var(--space-font-family)',
          fontSize: 'max(var(--eth-body, 0px), 13px)',
          borderRadius: 0,
          border: '1px solid var(--color-divider,rgba(59,43,29,0.34))',
          color: '#241a12',
        }}
        title={`Beau searches the secondhand market for a ${label}`}
      >
        {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {open ? 'Hide cheaper' : 'Find it cheaper'}
        <span aria-hidden="true" style={{ fontSize: 'max(var(--eth-label, 0px), 11px)', lineHeight: 1 }}>
          {open ? '↑' : '→'}
        </span>
      </button>

      {open && (
        <div
          className="w-full"
          style={{ marginTop: '10px', borderTop: '1px solid var(--color-divider,rgba(59,43,29,0.18))' }}
          aria-label={`Cheaper listings for ${label}`}
        >
          {busy && (
            <p
              className="text-[var(--color-neutral-600,#856c51)]"
              style={{ fontFamily: 'var(--space-font-family)', fontSize: 'max(var(--eth-label, 0px), 12px)', paddingTop: '8px' }}
              aria-live="polite"
            >
              {phase || 'Beau is sweeping the marketplaces…'}
            </p>
          )}

          {!busy && error && (
            <p
              className="text-[var(--space-semantic-danger)]"
              style={{ fontFamily: 'var(--space-font-family)', fontSize: 'max(var(--eth-label, 0px), 12px)', paddingTop: '8px' }}
            >
              {error}
            </p>
          )}

          {!busy && !error && listings.length === 0 && outcome && (
            <p
              className="text-[var(--color-neutral-700,#634e38)]"
              style={{ fontFamily: 'var(--space-font-family)', fontSize: 'max(var(--eth-label, 0px), 12.5px)', lineHeight: 1.55, paddingTop: '8px', maxWidth: '54ch' }}
            >
              {outcome.note}
            </p>
          )}

          {listings.length > 0 && (
            <div className="divide-y divide-[var(--color-divider,rgba(59,43,29,0.18))]">
              {listings.map((listing) => (
                <a
                  key={listing.id}
                  href={listing.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-start gap-3 py-2.5 group"
                  aria-label={`${listing.title} — ${listing.priceDisplay} on ${listing.source}, open the listing`}
                >
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block ${typography.color.primary} group-hover:underline`}
                      style={{
                        fontFamily: 'var(--space-font-family)',
                        fontSize: 'max(var(--eth-label, 0px), 12.5px)',
                        lineHeight: 1.45,
                        display: '-webkit-box',
                        WebkitLineClamp: '2',
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {listing.title}
                    </span>
                    <span className="flex items-center gap-1.5 flex-wrap" style={{ marginTop: '4px' }}>
                      <Chip label={listing.condition} />
                      {listing.sizeText && <Chip label={`Size ${listing.sizeText}`} />}
                      <span
                        className="text-[var(--color-neutral-600,#856c51)]"
                        style={{ fontFamily: 'var(--space-font-family)', fontSize: 'max(var(--eth-label, 0px), 11px)' }}
                      >
                        {listing.source}
                      </span>
                    </span>
                  </span>
                  <span
                    className={typography.color.primary}
                    style={{ fontFamily: 'var(--space-font-heading)', fontSize: '17px', whiteSpace: 'nowrap' }}
                  >
                    {listing.priceDisplay}
                  </span>
                </a>
              ))}
            </div>
          )}

          {!busy && listings.length > 0 && (
            <p
              className={`${typography.color.muted}`}
              style={{ fontFamily: 'var(--space-font-family)', fontSize: 'max(var(--eth-micro, 0px), 10px)', lineHeight: 1.5, paddingTop: '8px', maxWidth: '54ch' }}
            >
              Live from {(outcome?.sourcesTried || []).join(' · ') || 'the open market'}. Prices, sizes and conditions are
              the seller&rsquo;s own — open the listing before you commit.
            </p>
          )}
        </div>
      )}
    </>
  );
}
