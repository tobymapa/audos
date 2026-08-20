/**
 * THE SEARCH · THE WATCHLIST · THE WATCH CONTROL — the one button every face
 * of The Search puts a piece on watch with, and the one hook behind it.
 *
 * It sits in THREE places (Beau's Picks' ten-pick rows, an Ask Beau result
 * card, a Your Calls row) and it is the SAME control in all three, so a piece
 * watched on one reads as watched on the others the instant it is written.
 * The eye is hollow when the piece is not watched and filled — on the accent
 * wash, with the accent rule — when it is, exactly as Save and Favourite fill
 * their own icons.
 *
 * TAPPING IT AGAIN TAKES THE PIECE OFF (watchlist-model.ts archives the row),
 * so nothing here is a one-way door either.
 *
 * `target` may be a FUNCTION rather than an object: a card whose photograph
 * resolves after the first paint holds the url on a ref, and a function lets
 * the tap carry the photograph that actually painted onto the row.
 *
 * THREE SIZES, so it can sit in a row of controls it did not design: `card`
 * (the shared action row's own measurements), `row` (the ten-pick page's
 * smaller call buttons) and `icon` (a table row — the eye alone, the piece's
 * name carried by its aria-label and its tooltip).
 *
 * AND THE MAKER, UNDER IT. `WatchBrandLink` is the second, quieter half of the
 * same idea: watch the HOUSE rather than the piece, so Beau reads its new
 * arrivals instead of one product page. It is deliberately a text link rather
 * than a button — a card offers one obvious action and one aside, not two
 * competing ones — and it takes the brand already named on the card, so there
 * is nothing to type. The page it watches is worked out from the piece's own
 * retailer link (watchlist-model.ts); where only the maker's domain can be
 * had, the watch is still filed and the Watchlist row asks for the real
 * new-arrivals link rather than refusing the tap.
 */
import { useCallback, useEffect, useState } from 'react';
import { Eye, Loader2 } from 'lucide-react';
import { ACCENT_DEEP, FAINTER, HAIRLINE, SECONDARY, TINT, mono } from './index-style';
import {
  WATCHLIST_EVENT,
  brandWatchKey,
  ensureWatchlistLoaded,
  inferBrandArrivalsUrl,
  loadWatchlistMirror,
  toggleWatch,
  unwatchPiece,
  watchBrand,
  watchKeyFor,
  type WatchTarget,
  type WatchedPiece,
} from './watchlist-model';

/**
 * The Watchlist as it stands. Reads the local mirror for the first frame, the
 * table once per page load however many buttons ask, and re-reads the mirror
 * whenever anything on the tab writes a watch.
 */
export function useWatchlist(): { items: WatchedPiece[]; loading: boolean } {
  const [items, setItems] = useState<WatchedPiece[]>(() => loadWatchlistMirror());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    ensureWatchlistLoaded()
      .then((rows) => {
        if (!alive) return;
        setItems(rows);
        setLoading(false);
      })
      .catch(() => {
        if (alive) setLoading(false);
      });
    const onChanged = () => setItems(loadWatchlistMirror());
    window.addEventListener(WATCHLIST_EVENT, onChanged);
    return () => {
      alive = false;
      window.removeEventListener(WATCHLIST_EVENT, onChanged);
    };
  }, []);

  return { items, loading };
}

/** The measurements each surface's own controls already use. */
const SIZES = {
  card: { type: 8.5, padding: '8px 12px', minHeight: '40px' },
  row: { type: 8, padding: '7px 10px', minHeight: undefined as string | undefined },
  icon: { type: 8, padding: '7px 8px', minHeight: '34px' },
};

export function WatchButton({
  target,
  size = 'card',
}: {
  target: WatchTarget | (() => WatchTarget);
  size?: keyof typeof SIZES;
}) {
  const { items } = useWatchlist();
  const [busy, setBusy] = useState(false);
  const measure = SIZES[size];

  const resolve = useCallback(() => (typeof target === 'function' ? target() : target), [target]);
  const watching = items.some((p) => p.watchKey === watchKeyFor(resolve()));

  const title = watching
    ? 'Watching \u2014 tap to take it off your Watchlist'
    : 'Watch it \u2014 Beau checks the price and whether it is still there';

  return (
    <button
      type="button"
      disabled={busy}
      aria-pressed={watching}
      aria-label={watching ? `Stop watching ${resolve().pieceName}` : `Watch ${resolve().pieceName}`}
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        if (busy) return;
        setBusy(true);
        // The photograph is read at the tap, not at the render — see the note
        // at the top of this file.
        void toggleWatch(resolve(), watching).finally(() => setBusy(false));
      }}
      className="transition-colors flex items-center gap-1.5 flex-shrink-0 hover:bg-[rgba(168,113,44,0.06)]"
      style={{
        ...mono(measure.type, watching ? ACCENT_DEEP : SECONDARY),
        background: watching ? TINT : 'transparent',
        border: `1px solid ${watching ? ACCENT_DEEP : HAIRLINE}`,
        padding: measure.padding,
        minHeight: measure.minHeight,
        whiteSpace: 'nowrap',
        cursor: busy ? 'default' : 'pointer',
        opacity: busy ? 0.55 : 1,
      }}
    >
      {busy ? (
        <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
      ) : (
        <Eye className="w-3 h-3" strokeWidth={1.6} fill={watching ? 'currentColor' : 'none'} aria-hidden="true" />
      )}
      {size !== 'icon' && (watching ? 'Watching' : 'Watch')}
    </button>
  );
}

/**
 * WATCH THE BRAND — the text link that sits under (or beside) the eye on every
 * card that carries one. Renders nothing when the card cannot name a maker:
 * there is no brand to watch, and an offer with no subject is worse than none.
 */
export function WatchBrandLink({ target }: { target: WatchTarget | (() => WatchTarget) }) {
  const { items } = useWatchlist();
  const [busy, setBusy] = useState(false);
  const resolve = useCallback(() => (typeof target === 'function' ? target() : target), [target]);

  const resolved = resolve();
  const brand = (resolved.brand || '').trim();
  const watching = !!brand && items.some((p) => p.watchType === 'brand' && p.watchKey === brandWatchKey(brand));
  if (!brand) return null;

  const guess = inferBrandArrivalsUrl(resolved.retailerUrl);
  const title = watching
    ? `Watching ${brand} \u2014 tap to stop watching the maker`
    : guess.kind === 'arrivals'
      ? `Watch ${brand} \u2014 Beau reads its new arrivals for you about once a day`
      : `Watch ${brand} \u2014 Beau reads the maker's site; you can give him its new arrivals link on the Watchlist`;

  return (
    <button
      type="button"
      disabled={busy}
      aria-pressed={watching}
      aria-label={watching ? `Stop watching ${brand}` : `Watch the brand ${brand}`}
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        if (busy) return;
        setBusy(true);
        const now = resolve();
        const page = inferBrandArrivalsUrl(now.retailerUrl);
        const write = watching
          ? unwatchPiece(brandWatchKey(brand))
          : watchBrand(brand, page.url, now.source);
        void write.finally(() => setBusy(false));
      }}
      className="transition-colors flex items-center gap-1 flex-shrink-0 hover:opacity-70"
      style={{
        ...mono(7.5, watching ? ACCENT_DEEP : FAINTER),
        background: 'transparent',
        border: 'none',
        padding: '4px 2px',
        textDecoration: 'underline',
        textUnderlineOffset: '2px',
        whiteSpace: 'nowrap',
        cursor: busy ? 'default' : 'pointer',
        opacity: busy ? 0.55 : 1,
      }}
    >
      {busy && <Loader2 className="w-2.5 h-2.5 animate-spin" aria-hidden="true" />}
      {watching ? 'Watching brand' : 'Watch brand'}
    </button>
  );
}
