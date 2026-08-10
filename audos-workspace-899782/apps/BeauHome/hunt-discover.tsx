/**
 * THE HUNT — Discover sub-tab (Recommendation Engine overhaul, Part 4) +
 * the shared BRAND DOSSIER page.
 *
 * Discover is the maker directory as a TABLE — one row per brand:
 * a FAVOURITE star (the ONE per-row user control — stored as 'trusted' on
 * the shared brand_index ledger so favourites keep feeding Beau's
 * trusted-brand signal), name (with its source tag: Catalog · You added
 * this · Beau recommended, plus the stored logo), country of origin, price
 * tier (Budget / Mid / Premium / Luxury), primary material signal, "Known
 * for" (Beau's own line — never user-editable, marked with his tag),
 * "Your note" (the one free-text field the user owns), archetype-fit
 * tags, Beau's colour-coded rating (Excellent / Reliable / Inconsistent /
 * Avoid — the label stays one word; the copy under it on tap/hover says
 * why THIS maker earned it) and the "Add to Compare" / "Add to Matrix"
 * actions. Tapping anywhere on a row opens the Brand Dossier. The old
 * Trusted / Curious / Avoided status chips are RETIRED.
 *
 * "Add a maker" sits at the TOP — above the filter chips and the table —
 * with TWO ways in on one toggle (smart-input overhaul):
 *   · ONE SMART INPUT — type a NAME and Beau generates the full dossier
 *     (claude-3-5-haiku, cached), persists it to `hunt_directory_brands`
 *     and opens the file; paste a URL into the SAME box and it is
 *     auto-detected — the brand's name and logo read off its own page
 *     (OG image, favicon fallback — hunt-brand-import.ts) before the
 *     dossier is filed. One box, two behaviours.
 *   · UPLOAD A FILE — a .txt (one entry per line) or .xlsx (first column
 *     of data rows) bulk-adds makers as stub rows; Beau files each full
 *     dossier the first time it is opened.
 * An optional "Your note" rides along on the shared brand_index ledger.
 *
 * FILTERS (two tiers per row — the category label in its own left column,
 * the chips indented in a second column, so wrapped chips align to the chip
 * column and never back to the label). EVERY row carries a label — nothing
 * floats alone. The block mirrors the table's column order, left to
 * right — every column has its filter, top to bottom in the same order:
 *   Row 1 — "Favourite": the favourites-only toggle chip
 *   Row 2 — "Origin": the country chips (multi)
 *   Row 3 — "Price": the price tier chips
 *   Row 4 — "Material": the individual material chips only (Leather, Wool,
 *           Merino, Cashmere, Cotton, Linen, Silk). There is NO "Natural
 *           materials only" umbrella toggle (Recommendation Engine
 *           overhaul, Part 8) — it was a parent concept standing as a peer
 *           of its own children, and Ethaion's positioning already implies
 *           natural fibres.
 *   Row 5 — "Known for": a text filter over Beau's known-for line
 *   Row 6 — "Style": the archetype multi-select
 *   Row 7 — "Rating": Beau's four tiers (Excellent / Reliable /
 *           Inconsistent / Avoid, multi)
 *   Row 8 — "Your note": a text filter over the user's own notes — LAST,
 *           because its column is now the table's rightmost
 *   then, past one hairline — Category · Construction · Register (facets
 *   without a column of their own).
 * Every MULTI-SELECT filter renders as a DROPDOWN (a checkbox panel), never
 * an inline chip row; single-choice facets are native selects.
 * The MAKER NAME SEARCH sits on its own, DIRECTLY above the table, with the
 * four-tier RATING LEGEND between it and the table.
 * Every chip is the same height and padding: active = walnut fill with paper
 * text, inactive = paper fill with a walnut hairline. No sustainability
 * filter, no colour surprises.
 *
 * PROFILE TOGGLE behaviour (fixed — it used to only nudge the sort):
 *   ON  — the table filters to makers serving the user's selected
 *         archetypes, ranked by relevance to the profile (archetype
 *         overlap, budget fit, quality); everything else stays reachable
 *         in a "Beyond your archetypes" section below.
 *   OFF — the full directory, alphabetical, no personalisation.
 *
 * BrandDetailSheet is the SHARED dossier surface used across Find,
 * Discover, Compare and Matrix: a full-screen page in the ticket-frame /
 * spec-sheet language — construction table, "Why Beau rates it" (the full
 * argument behind the mark: how it's made, what of, whether it lasts, what
 * that costs, and what the tier itself means), sizing note, archetype fit.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2, Star, Trash2, Upload, X } from 'lucide-react';
import { typography } from '../../lib/colors';
import {
  BRAND_INDEX_CHANGED_EVENT,
  RESERVE_CHANGED_EVENT,
  addBrandIndexEntry,
  fetchBrandIndex,
  updateBrandIndexEntry,
  type BrandIndexEntry,
  type BrandIndexStatus,
  type StyleProfile,
} from './profile-data';
import { EMPTY_PASS_SIGNALS, MAKER_DEMOTION_PASSES, fetchPassSignals, type PassSignals } from './pass-signals';
import { TicketFrame } from './ticket-frame';
import {
  ARCHETYPE_LABELS,
  BEAU_RATINGS,
  BRAND_SOURCE_LABELS,
  CONSTRUCTION_METHODS,
  DISCOVER_CATEGORIES,
  DISCOVER_MATERIALS,
  MAX_COMPARE,
  MAX_MATRIX,
  PRICE_BAND_ORDER,
  PRICE_BAND_SYMBOL,
  PRICE_TIER_LABELS,
  REGISTERS,
  archetypeLabel,
  beauRatingEvidence,
  beauRatingFromQuality,
  beauRatingSummary,
  beauRatingTierMeaning,
  brandCategory,
  brandWebsiteUrl,
  verifiedBrandWebsiteUrl,
  brandMatchesDiscoverMaterial,
  constructionMethod,
  longevitySignal,
  mergeDirectory,
  primaryMaterialSignal,
  type BeauRating,
  type BrandProfile,
  type DirectoryBrandRow,
  type DirectoryEntry,
  type PriceBand,
  type Register,
} from './brands';
import { DISCOVER_BRANDS_EVENT, addDirectoryBrandStubs, addUserDirectoryBrand, getBrandProfile } from './hunt-ai';
import {
  faviconFor,
  fetchSiteMeta,
  looksAmbiguousMakerName,
  looksLikeUrl,
  normalizeSiteUrl,
  parseBrandImportFile,
  type BrandImportEntry,
} from './hunt-brand-import';
import { useProgressiveReveal } from './progressive-list';
import { MONO, usePlexMono } from './mono-type';

/** One-shot guard for the retroactive logo backfill — module-level so tab
 * remounts within a session never restart a sweep already under way. */
let logoBackfillStarted = false;

// ---------------------------------------------------------------------------
// Small shared atoms
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// FILTER CHIPS — restyled to the Piece index's filter language (13a), so
// the Makers reading of The Index matches the Pieces reading exactly: small
// uppercase mono chips, walnut fill when active, hairline border when not.
// Each filter category is a two-tier row: the label in its own left column,
// the chips indented in a second column — so a chip that wraps to a new line
// aligns to the chip column, never back to the label.
// ---------------------------------------------------------------------------

const CHIP_BASE: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: '9px',
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  lineHeight: 1.35,
  borderRadius: 0,
  padding: '4px 10px',
  whiteSpace: 'nowrap',
};

function chipStyle(active: boolean): React.CSSProperties {
  return active
    ? { ...CHIP_BASE, background: '#241a12', color: '#f6f0e5', border: '1px solid #241a12' }
    : {
        ...CHIP_BASE,
        background: 'transparent',
        color: '#634e38',
        border: '1px solid rgba(59,43,29,0.3)',
      };
}

function FilterChip({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className="inline-flex items-center justify-center transition-colors"
      style={chipStyle(active)}
    >
      {children}
    </button>
  );
}

/** One filter category: label tier on the left, chip tier indented right —
 * the same row grid, label register and hairline the Piece index uses. */
function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      className="grid grid-cols-[86px_minmax(0,1fr)] sm:grid-cols-[104px_minmax(0,1fr)] items-baseline"
      style={{ gap: '14px', padding: '9px 0', borderBottom: '1px solid rgba(59,43,29,0.14)' }}
    >
      <span style={{ fontFamily: MONO, fontSize: '9px', letterSpacing: '0.06em', textTransform: 'uppercase', color: '#a68e70' }}>
        {label}
      </span>
      <div className="flex flex-wrap min-w-0" style={{ gap: '7px' }}>{children}</div>
    </div>
  );
}

/**
 * ONE MULTI-SELECT FILTER AS A DROPDOWN (Discover filter overhaul — the
 * founder's fix): a chip-styled trigger summarising the selection, opening
 * a compact checkbox panel. Replaces the inline chip rows for every
 * multi-select column filter, so a long option list (countries, styles)
 * never becomes a wall of chips.
 */
function MultiSelectDropdown({
  label,
  options,
  selected,
  onToggle,
  onClear,
}: {
  label: string;
  options: Array<{ id: string; label: string }>;
  selected: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (hostRef.current && !hostRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const summary =
    selected.length === 0
      ? 'Any'
      : selected.length <= 2
        ? selected.map((id) => options.find((o) => o.id === id)?.label || id).join(', ')
        : `${selected.length} selected`;
  return (
    <div ref={hostRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((cur) => !cur)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`${label} filter`}
        className="inline-flex items-center gap-1.5 transition-colors"
        style={chipStyle(selected.length > 0)}
      >
        <span className="max-w-[24ch] truncate">{summary}</span>
        <ChevronDown
          className="w-3.5 h-3.5 flex-shrink-0"
          aria-hidden="true"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 160ms ease' }}
        />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={label}
          aria-multiselectable="true"
          className="absolute left-0 top-full z-30 mt-1 overflow-y-auto bg-[var(--color-paper,#fbf8f1)]"
          style={{
            minWidth: '220px',
            maxHeight: '280px',
            border: '1px solid var(--color-divider,rgba(59,43,29,0.35))',
            boxShadow: '0 10px 26px rgba(36,26,18,0.16)',
            padding: '4px 0',
          }}
        >
          {selected.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="w-full text-left uppercase text-[var(--color-neutral-600,#8A7F70)] hover:bg-[var(--color-accent-100,#fbf1de)] transition-colors"
              style={{ fontFamily: 'var(--space-font-heading)', fontSize: '10.5px', letterSpacing: '0.12em', padding: '8px 14px', borderBottom: '1px solid var(--color-divider,rgba(59,43,29,0.18))' }}
            >
              Clear {label.toLowerCase()}
            </button>
          )}
          {options.map((o) => {
            const active = selected.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => onToggle(o.id)}
                className="w-full flex items-center gap-2.5 text-left hover:bg-[var(--color-accent-100,#fbf1de)] transition-colors"
                style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px', lineHeight: 1.3, padding: '8px 14px', color: 'var(--color-text,#3b2b1d)' }}
              >
                <span
                  aria-hidden="true"
                  className="inline-flex items-center justify-center flex-shrink-0"
                  style={{
                    width: '15px',
                    height: '15px',
                    border: '1px solid var(--color-divider,rgba(59,43,29,0.45))',
                    background: active ? '#241a12' : 'var(--color-paper,#fbf8f1)',
                  }}
                >
                  {active && <Check className="w-3 h-3" style={{ color: '#fbf8f1' }} />}
                </span>
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** One single-choice filter as a native dropdown — the same register as the
 * multi-select trigger, for facets that only ever hold one value. */
function SingleSelectDropdown({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ id: string; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={`${label} filter`}
      className="hab-input"
      style={{ height: '26px', paddingTop: 0, paddingBottom: 0, fontSize: '12px', width: 'min(100%, 220px)' }}
    >
      <option value="">Any</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** One archetype as a chip — hairline border, paper ground, walnut text.
 * Chips wrap inside their column; they are never truncated to a count. */
export function ArchetypeTag({ id }: { id: string }) {
  return (
    <span
      className="inline-block px-2 py-0.5 text-[9px] rounded"
      style={{
        fontFamily: 'var(--space-font-family)',
        lineHeight: 1.6,
        border: '1px solid #D9CFBE',
        background: 'var(--color-paper,#fbf8f1)',
        color: 'var(--color-text,#3b2b1d)',
        whiteSpace: 'nowrap',
      }}
    >
      {archetypeLabel(id)}
    </span>
  );
}

/** The "££" price indicator — filled symbols to the band, faint the rest. */
export function PriceIndicator({ band }: { band: PriceBand }) {
  const filled = PRICE_BAND_SYMBOL[band];
  const max = '££££';
  return (
    <span style={{ fontFamily: 'var(--space-font-family)', fontSize: '12px', letterSpacing: '0.06em' }} title={band}>
      <span className="text-[var(--color-accent-700,#7c4a17)]">{filled}</span>
      <span className="text-[var(--color-neutral-400,#c9b696)]" aria-hidden="true">{max.slice(filled.length)}</span>
    </span>
  );
}

/** Beau's rating — the small colour-coded tag; the one-line rationale shows
 * on hover (title) and on tap (inline, so mobile gets it too). */
export function BeauRatingTag({ rating, note }: { rating: BeauRating; note?: string }) {
  const [open, setOpen] = useState(false);
  const cls =
    rating === 'Excellent'
      ? 'bg-[color-mix(in_srgb,var(--space-semantic-success)_14%,var(--space-surface-card))] text-[var(--space-semantic-success)] border-[var(--space-semantic-success)]'
      : rating === 'Reliable'
        ? 'bg-[var(--color-accent-100,#fbf1de)] text-[var(--color-accent-800,#5c3413)] border-[var(--color-accent,#a8712c)]'
        : rating === 'Inconsistent'
          ? 'bg-[color-mix(in_srgb,var(--space-semantic-warning)_14%,var(--space-surface-card))] text-[var(--space-semantic-warning)] border-[var(--space-semantic-warning)]'
          : 'bg-[#EDE8DF] text-[#8A857C] border-[#CCC7BD]';
  return (
    /* max-w-full keeps the tag + its opened rationale inside the table
       cell (fixed column widths) — the note wraps instead of spilling
       over the neighbouring column. */
    <span className="inline-block max-w-full align-top">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (note) setOpen((cur) => !cur);
        }}
        title={note || rating}
        aria-label={note ? `${rating} — ${note}` : rating}
        className={`px-2 py-0.5 rounded-full border whitespace-nowrap ${cls}`}
        style={{ fontFamily: 'var(--space-font-family)', fontSize: '10px', lineHeight: 1.6 }}
      >
        {rating}
      </button>
      {open && note && (
        <span
          className="block text-[var(--color-neutral-700,#634e38)] mt-1 normal-case"
          style={{ fontFamily: 'var(--space-font-family)', fontSize: '11px', lineHeight: 1.5, maxWidth: 'min(30ch, 100%)', whiteSpace: 'normal', textAlign: 'left' }}
        >
          {note}
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// FAVOURITE — the ONE per-row user control (the old Trusted / Curious /
// Avoided status chips are retired). A favourite is stored as status
// 'trusted' on the shared brand_index ledger (profile-data.ts), so
// favourites keep feeding Beau's trustedBrands signal exactly as Trusted
// entries used to; unfavouriting returns the row to the neutral 'curious'.
// ---------------------------------------------------------------------------

export function isFavourite(meta: BrandIndexEntry | null | undefined): boolean {
  return meta?.status === 'trusted';
}

/** The favourite star — oxblood and filled when set, muted outline when not. */
export function FavouriteToggle({
  active,
  onToggle,
  brand,
}: {
  active: boolean;
  onToggle: () => void;
  brand: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-pressed={active}
      className="inline-flex items-center justify-center min-w-[36px] min-h-[36px] transition-opacity hover:opacity-75"
      title={
        active
          ? `${brand} is a favourite — tap to remove. Favourites feed Beau's recommendations.`
          : `Mark ${brand} as a favourite — Beau checks favourites first when hunting your gaps.`
      }
      aria-label={active ? `Remove ${brand} from favourites` : `Mark ${brand} as a favourite`}
    >
      <Star
        className="w-[18px] h-[18px]"
        style={{ color: active ? '#8B3A3A' : '#8A7F70', fill: active ? '#8B3A3A' : 'transparent' }}
        aria-hidden="true"
      />
    </button>
  );
}

/** The small "Beau" provenance tag — marks a field Beau writes himself
 * (never the user): the Known for column and its dossier counterpart. */
export function BeauTag() {
  return (
    <span
      className="uppercase inline-flex items-center flex-shrink-0 align-middle"
      title="Written by Beau — not editable"
      style={{
        fontFamily: 'var(--space-font-heading)',
        fontSize: '9px',
        letterSpacing: '0.14em',
        color: '#8B3A3A',
        border: '1px solid rgba(139,58,58,0.35)',
        borderRadius: '2px',
        padding: '1px 5px',
      }}
    >
      Beau
    </span>
  );
}

/** Beau's "known for" line for a maker — HIS read (the signature pieces off
 * the brand file), never a user field. Legacy user-typed known_for rows only
 * backfill makers whose file carries nothing. */
export function beauKnownFor(profile: BrandProfile, meta?: BrandIndexEntry | null): string {
  return profile.signaturePieces.join(', ') || (meta?.known_for || '').trim();
}

// ---------------------------------------------------------------------------
// RATING LEGEND — Beau's four tiers, spelled out once at the top of Discover.
// ---------------------------------------------------------------------------

const RATING_LEGEND: Array<{ tier: BeauRating; line: string }> = [
  { tier: 'Excellent', line: 'Buy with confidence — Beau surfaces these actively.' },
  { tier: 'Reliable', line: 'Solid quality, worth it — Beau includes but doesn\u2019t prioritise.' },
  { tier: 'Inconsistent', line: 'Hit or miss — Beau flags this.' },
  { tier: 'Avoid', line: 'Quality doesn\u2019t hold up — Beau filters these out.' },
];

function RatingLegend() {
  return (
    /* Equal padding on every side at phone widths (16px), widening at sm —
       the legend sits inside the safe content area with even margins. */
    <div className="bg-[var(--color-paper,#FBF8F1)] border border-[var(--color-divider,#D9CFBE)] p-4 sm:pt-3.5 sm:px-[18px] sm:pb-4">
      <p
        className="uppercase text-[var(--color-neutral-600,#8A7F70)]"
        style={{ fontFamily: 'var(--space-font-heading)', fontSize: '11px', letterSpacing: '0.14em', marginBottom: '10px' }}
      >
        Beau&rsquo;s rating — how to read the four tiers
      </p>
      <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
        {RATING_LEGEND.map(({ tier, line }) => (
          <span key={tier} className="flex items-baseline gap-2.5 min-w-0">
            {/* Fixed-width tag holder — the four pills differ in length, so
                without it each explainer line starts at a different x and
                the legend reads unevenly. */}
            <span className="flex-shrink-0 w-[88px]">
              <BeauRatingTag rating={tier} />
            </span>
            <span className="text-[var(--color-neutral-800,#453325)] min-w-0" style={{ fontFamily: 'var(--space-font-family)', fontSize: '12.5px', lineHeight: 1.5 }}>
              {line}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Initials for the placeholder plate — "Crockett & Jones" → "CJ". */
function brandInitials(name: string): string {
  const words = (name || '').trim().split(/\s+/).filter((w) => /[a-z0-9]/i.test(w));
  const letters = words.map((w) => (w.match(/[a-z0-9]/i) || [''])[0]).filter(Boolean);
  return (letters.length >= 2 ? letters[0] + letters[letters.length - 1] : letters[0] || '·').toUpperCase();
}

/** The brand mark on a small paper plate. Shows the stored / derived logo
 * when one resolves, and falls back to a clean initials plate when there is
 * no logo URL or the image fails to load — never a broken-image icon and
 * never an empty gap, so pre-seeded catalog makers read like added ones. */
function BrandMark({ name, logoUrl }: { name: string; logoUrl?: string | null }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [logoUrl]);
  const showImage = Boolean(logoUrl) && !broken;
  return (
    <span
      className="inline-flex items-center justify-center overflow-hidden flex-shrink-0 border border-[var(--color-divider,rgba(59,43,29,0.18))] bg-[var(--color-paper,#fbf8f1)]"
      style={{ width: 34, height: 34 }}
      aria-hidden="true"
      title={name}
    >
      {showImage ? (
        <img src={logoUrl as string} alt="" style={{ maxWidth: '82%', maxHeight: '82%', objectFit: 'contain' }} onError={() => setBroken(true)} loading="lazy" />
      ) : (
        <span
          className="text-[var(--color-neutral-600,#856c51)]"
          style={{ fontFamily: 'var(--space-font-heading)', fontSize: '12px', letterSpacing: '0.06em', fontWeight: 500 }}
        >
          {brandInitials(name)}
        </span>
      )}
    </span>
  );
}

/** "Compare" queue action — RETIRED with the Compare sub-tab (founder's
 * correction: the Weighed stage IS the comparison view). Kept exported for
 * API compatibility; it renders NOTHING unless a caller still wires the
 * retired queue in. */
export function CompareAction({
  brand,
  compareList,
  onToggleCompare,
  size = 'sm',
}: {
  brand: string;
  compareList?: string[];
  onToggleCompare?: (brand: string) => void;
  size?: 'sm' | 'md';
}) {
  if (!onToggleCompare || !compareList) return null;
  const queued = compareList.some((b) => b.toLowerCase() === brand.toLowerCase());
  const full = !queued && compareList.length >= MAX_COMPARE;
  const pad = size === 'md' ? 'px-4 min-h-[44px]' : 'px-2.5 py-1.5';
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (!full) onToggleCompare(brand);
      }}
      disabled={full}
      className={`${pad} rounded text-[13px] border transition-colors disabled:opacity-40 whitespace-nowrap ${
        queued
          ? 'border-[var(--color-accent,#a8712c)] bg-[var(--color-accent-100,#fbf1de)] text-[var(--color-accent-800,#5c3413)]'
          : 'border-[var(--color-divider,rgba(59,43,29,0.18))] text-[var(--color-neutral-700,#634e38)] hover:border-[var(--color-accent,#a8712c)] hover:text-[var(--color-accent-700,#7c4a17)]'
      }`}
      style={{ fontFamily: 'var(--space-font-family)' }}
      title={
        queued
          ? 'Queued for Compare — tap to remove'
          : full
            ? `Compare holds ${MAX_COMPARE} brands at once — remove one first`
            : 'Add this brand to the Compare sub-tab'
      }
    >
      {queued ? 'Queued ✓' : 'Compare'}
    </button>
  );
}

/** "Add to Matrix" action — RETIRED with the Matrix sub-tab (founder's
 * correction: comparison-matrix logic folded into the Weighed stage). Kept
 * exported for API compatibility; renders NOTHING without the retired
 * queue wired in. */
export function MatrixAction({
  brand,
  matrixList,
  onToggleMatrix,
  size = 'sm',
}: {
  brand: string;
  matrixList?: string[];
  onToggleMatrix?: (brand: string) => void;
  size?: 'sm' | 'md';
}) {
  if (!onToggleMatrix || !matrixList) return null;
  const queued = matrixList.some((b) => b.toLowerCase() === brand.toLowerCase());
  const full = !queued && matrixList.length >= MAX_MATRIX;
  const pad = size === 'md' ? 'px-4 min-h-[44px]' : 'px-2.5 py-1.5';
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (!full) onToggleMatrix(brand);
      }}
      disabled={full}
      className={`${pad} rounded text-[13px] border transition-colors disabled:opacity-40 whitespace-nowrap ${
        queued
          ? 'border-[var(--color-accent,#a8712c)] bg-[var(--color-accent-100,#fbf1de)] text-[var(--color-accent-800,#5c3413)]'
          : 'border-[var(--color-divider,rgba(59,43,29,0.18))] text-[var(--color-neutral-700,#634e38)] hover:border-[var(--color-accent,#a8712c)] hover:text-[var(--color-accent-700,#7c4a17)]'
      }`}
      style={{ fontFamily: 'var(--space-font-family)' }}
      title={
        queued
          ? 'On your Matrix — tap to remove'
          : full
            ? `The custom Matrix holds ${MAX_MATRIX} makers — remove one first`
            : 'Plot this maker on the Matrix sub-tab'
      }
    >
      {queued ? 'In Matrix ✓' : 'Matrix'}
    </button>
  );
}

// ---------------------------------------------------------------------------
// BRAND DOSSIER — the shared full-screen page
// ---------------------------------------------------------------------------

function DetailRow({ term, detail }: { term: string; detail: string }) {
  return (
    <tr>
      <th
        scope="row"
        className="text-left uppercase text-[var(--color-neutral-600,#856c51)]"
        style={{ fontFamily: 'var(--space-font-heading)', fontSize: '11px', letterSpacing: '0.12em', fontWeight: 400, padding: '9px 14px 9px 0', verticalAlign: 'top', borderTop: '1px solid var(--color-divider,rgba(59,43,29,0.18))', whiteSpace: 'nowrap' }}
      >
        {term}
      </th>
      <td
        className={typography.color.primary}
        style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', lineHeight: 1.55, padding: '9px 0', verticalAlign: 'top', borderTop: '1px solid var(--color-divider,rgba(59,43,29,0.18))' }}
      >
        {detail}
      </td>
    </tr>
  );
}

export function BrandDetailContent({
  brand,
  compareList,
  onToggleCompare,
}: {
  brand: BrandProfile;
  compareList?: string[];
  onToggleCompare?: (brand: string) => void;
}) {
  const ratingForBrand = beauRatingFromQuality(brand.constructionQuality, brand.qualityScore);
  const ratingEvidence = beauRatingEvidence(brand);
  return (
    <div>
      <p
        className="uppercase text-[var(--color-neutral-600,#856c51)]"
        style={{ fontFamily: 'var(--space-font-heading)', fontSize: '11px', letterSpacing: '0.16em', marginBottom: '6px' }}
      >
        Brand file{brand.generated ? ' · Beau\u2019s read' : ''}
      </p>
      <h3 className={typography.color.primary} style={{ fontFamily: 'var(--space-font-heading)', fontWeight: 500, fontSize: '30px', lineHeight: 1.1 }}>
        {brand.brand}
      </h3>
      <p className={typography.color.primary} style={{ fontFamily: 'var(--space-font-family)', fontSize: '15px', lineHeight: 1.6, maxWidth: '58ch', marginTop: '8px' }}>
        {brand.description}
      </p>
      <p className="text-[var(--color-neutral-700,#634e38)]" style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px', marginTop: '4px' }}>
        {brand.country}
        {brand.founded ? ` · est. ${brand.founded}` : ''}
      </p>

      {/* Construction table — the same ticket-frame spec-sheet language as
          The Rail's piece spec sheets. */}
      <TicketFrame className="mt-5" padding="22px">
        <table className="w-full border-collapse" style={{ borderBottom: '1px solid var(--color-divider,rgba(59,43,29,0.18))' }}>
          <tbody>
            <DetailRow term="Construction" detail={brand.construction || '—'} />
            <DetailRow term="Primary materials" detail={brand.materials.length > 0 ? brand.materials.join(' / ') : '—'} />
            <DetailRow term="Origin" detail={brand.country || '—'} />
            <DetailRow term="Register" detail={brand.registers.join(' / ') || '—'} />
            <DetailRow term="Price range" detail={brand.priceRangeLabel || '—'} />
            <DetailRow term="Longevity signal" detail={longevitySignal(brand)} />
          </tbody>
        </table>

        {/* WHY BEAU RATES IT WHAT HE DOES (Recommendation Engine overhaul,
            Part 9). The tag in the table carries the word; this is the whole
            argument behind it — the maker's own construction, materials,
            repairability and cost over time, itemised, with what the tier
            itself means underneath so the mark is never read as a verdict on
            the brand as a whole. */}
        <div className="mt-5" style={{ paddingLeft: '16px', borderLeft: '2px solid var(--color-accent,#a8712c)' }}>
          <p
            className="uppercase text-[var(--color-accent-700,#7c4a17)]"
            style={{ fontFamily: 'var(--space-font-heading)', fontSize: '12px', letterSpacing: '0.12em', marginBottom: '5px' }}
          >
            Why Beau rates it · {ratingForBrand}
          </p>
          <p
            className="text-[var(--color-neutral-800,#453325)]"
            style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', lineHeight: 1.6, maxWidth: '58ch' }}
          >
            {beauRatingSummary(brand)}
          </p>
          {ratingEvidence.length > 0 && (
            <table className="w-full border-collapse" style={{ marginTop: '12px', maxWidth: '58ch' }}>
              <tbody>
                {ratingEvidence.map((row) => (
                  <DetailRow key={row.label} term={row.label} detail={row.detail} />
                ))}
              </tbody>
            </table>
          )}
          <p
            className="text-[var(--color-neutral-700,#634e38)]"
            style={{ fontFamily: 'var(--space-font-family)', fontSize: '12.5px', lineHeight: 1.55, maxWidth: '58ch', marginTop: '12px' }}
          >
            {beauRatingTierMeaning(ratingForBrand)}
          </p>
        </div>
      </TicketFrame>

      {/* Sizing note — one sentence, particularly length/cut characteristics. */}
      {brand.sizingNote && (
        <p
          className="text-[var(--color-neutral-800,#453325)] mt-5"
          style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', lineHeight: 1.6, maxWidth: '58ch', paddingLeft: '16px', borderLeft: '2px solid var(--color-accent,#a8712c)' }}
        >
          <em
            className="block uppercase not-italic text-[var(--color-accent-700,#7c4a17)]"
            style={{ fontFamily: 'var(--space-font-heading)', fontSize: '12px', letterSpacing: '0.12em', marginBottom: '5px' }}
          >
            Sizing
          </em>
          {brand.sizingNote}
        </p>
      )}

      {/* Value over time + signature pieces. */}
      <div className="mt-5 space-y-2">
        {brand.costPerYearNote && (
          <p className={typography.color.primary} style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', lineHeight: 1.6 }}>
            <span className="uppercase text-[var(--color-neutral-600,#856c51)]" style={{ fontFamily: 'var(--space-font-heading)', fontSize: '11px', letterSpacing: '0.12em', marginRight: '10px' }}>
              Value over time
            </span>
            {brand.costPerYearNote}
          </p>
        )}
        {brand.signaturePieces.length > 0 && (
          <p className={typography.color.primary} style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', lineHeight: 1.6 }}>
            <span className="uppercase text-[var(--color-neutral-600,#856c51)]" style={{ fontFamily: 'var(--space-font-heading)', fontSize: '11px', letterSpacing: '0.12em', marginRight: '10px' }}>
              Signature pieces
            </span>
            {brand.signaturePieces.join(' · ')}
          </p>
        )}
      </div>

      {/* Archetype fit — which of the nine directions this brand serves. */}
      {brand.archetypes.length > 0 && (
        <div className="mt-5">
          <p
            className="uppercase text-[var(--color-neutral-600,#856c51)]"
            style={{ fontFamily: 'var(--space-font-heading)', fontSize: '11px', letterSpacing: '0.12em', marginBottom: '8px' }}
          >
            Archetype fit
          </p>
          <div className="flex flex-wrap gap-1.5">
            {brand.archetypes.map((a) => (
              <ArchetypeTag key={a} id={a} />
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 flex items-center gap-4 flex-wrap">
        <a
          href={brandWebsiteUrl(brand.brand)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 hover:underline"
          style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px', color: 'var(--color-accent,#a8712c)' }}
        >
          Visit the official site <span aria-hidden="true" style={{ fontSize: '11px', lineHeight: 1 }}>↗</span>
        </a>
      </div>

      {/* YOUR FILE — the personal read on this maker: status (Trusted and
          Avoided steer Beau), known for, specialisations, signature pieces
          and a note — stored on the shared brand_index ledger. */}
      <BrandPersonalFile brandName={brand.brand} />

      {brand.generated && (
        <p className={`${typography.size.xs} ${typography.color.muted} mt-4`} style={{ fontSize: '10px' }}>
          This brand is outside Beau&rsquo;s verified directory — the profile above is his best structured read, generated
          on demand. Treat specifics (founding year, exact prices) as approximate.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// YOUR FILE — the personal read on a maker, editable from the dossier. Two
// things belong to the user now: the FAVOURITE star (stored as status
// 'trusted' on the shared brand_index ledger, feeding Beau's positive
// signal) and the free-text note. "Known for" is Beau's own line — shown
// with his tag in the Discover table, never editable here.
// ---------------------------------------------------------------------------

export function BrandPersonalFile({ brandName }: { brandName: string }) {
  const [entryId, setEntryId] = useState<number | null>(null);
  const [favourite, setFavourite] = useState(false);
  const [note, setNote] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setSavedNote(null);
    fetchBrandIndex()
      .then((rows) => {
        if (cancelled) return;
        const hit = rows.find((r) => (r.name || '').trim().toLowerCase() === brandName.toLowerCase()) || null;
        setEntryId(hit ? hit.id : null);
        setFavourite(hit?.status === 'trusted');
        setNote(hit?.note || '');
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [brandName]);

  const save = async () => {
    if (saving || !loaded) return;
    setSaving(true);
    setSavedNote(null);
    try {
      const payload = {
        name: brandName,
        status: (favourite ? 'trusted' : 'curious') as BrandIndexStatus,
        note: note.trim() || null,
      };
      if (entryId != null) {
        await updateBrandIndexEntry(entryId, payload);
      } else {
        const fresh = await addBrandIndexEntry({ ...payload, url: null, logo_url: null, known_for: null, specialisations: null, signature_pieces: null });
        const hit = fresh.find((r) => (r.name || '').trim().toLowerCase() === brandName.toLowerCase());
        if (hit) setEntryId(hit.id);
      }
      setSavedNote('Saved — favourites reach Beau immediately.');
    } catch {
      setSavedNote('That didn’t save — try again in a moment.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-6 border-t border-[var(--color-divider,rgba(59,43,29,0.18))] pt-5">
      <p className="uppercase text-[var(--color-neutral-600,#856c51)]" style={{ fontFamily: 'var(--space-font-heading)', fontSize: '11px', letterSpacing: '0.16em', marginBottom: '4px' }}>
        Your file
      </p>
      <p className="text-[var(--color-neutral-700,#634e38)]" style={{ fontFamily: 'var(--space-font-family)', fontSize: '12.5px', lineHeight: 1.5, maxWidth: '58ch' }}>
        Star a favourite and Beau checks that maker first when hunting your gaps. The note is yours alone.
      </p>
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setFavourite((cur) => !cur)}
          aria-pressed={favourite}
          className="uppercase inline-flex items-center gap-2 min-h-[40px] px-3.5 rounded border transition-colors"
          style={{
            fontFamily: 'var(--space-font-heading)',
            fontSize: '11.5px',
            letterSpacing: '0.1em',
            fontWeight: favourite ? 500 : 400,
            color: favourite ? '#8B3A3A' : 'var(--color-neutral-700,#634e38)',
            borderColor: favourite ? 'rgba(139,58,58,0.55)' : 'var(--color-divider,rgba(59,43,29,0.18))',
            background: favourite ? 'rgba(139,58,58,0.08)' : 'transparent',
          }}
        >
          <Star className="w-4 h-4" style={{ fill: favourite ? '#8B3A3A' : 'transparent' }} aria-hidden="true" />
          {favourite ? 'Favourite' : 'Mark as favourite'}
        </button>
      </div>
      <div className="grid gap-3 mt-4">
        <label className="block">
          <span className="block uppercase text-[var(--color-neutral-600,#856c51)]" style={{ fontFamily: 'var(--space-font-heading)', fontSize: '10.5px', letterSpacing: '0.12em', marginBottom: '4px' }}>
            Your note
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. sizing runs slim — order a size up in knitwear"
            rows={2}
            className="hab-input w-full resize-none"
            style={{ paddingTop: '8px', paddingBottom: '8px' }}
            aria-label="Your note"
          />
        </label>
      </div>
      <div className="flex items-center gap-3 mt-3 flex-wrap">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !loaded}
          className="px-4 min-h-[40px] rounded text-[13px] inline-flex items-center gap-1.5 bg-transparent border border-[var(--color-accent,#a8712c)] text-[var(--color-accent-700,#7c4a17)] hover:bg-[var(--color-accent-100,#fbf1de)] transition-colors disabled:opacity-40"
        >
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {saving ? 'Saving…' : 'Save your file'}
        </button>
        {savedNote && (
          <span className="text-[var(--color-neutral-600,#856c51)]" style={{ fontFamily: 'var(--space-font-family)', fontSize: '12px' }}>
            {savedNote}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * The Brand Dossier HOST — a full-screen overlay page. Given a brand NAME it
 * resolves the profile (seed catalog instantly; persisted directory rows;
 * AI generation for the rest) and renders the shared detail content.
 */
export function BrandDetailSheet({
  brandName,
  onClose,
  compareList,
  onToggleCompare,
}: {
  brandName: string;
  onClose: () => void;
  compareList?: string[];
  onToggleCompare?: (brand: string) => void;
}) {
  const [profile, setProfile] = useState<BrandProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setProfile(null);
    setError(null);
    getBrandProfile(brandName)
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Beau couldn\u2019t open that brand file.');
      });
    return () => {
      cancelled = true;
    };
  }, [brandName]);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-[rgba(36,26,18,0.45)]" role="dialog" aria-modal="true" aria-label={`${brandName} — brand dossier`}>
      <div className="w-full max-w-3xl bg-[var(--space-surface-page)] overflow-y-auto" style={{ padding: '28px 28px 60px' }}>
        <div className="flex items-center justify-between gap-3 pb-4 border-b border-[var(--color-divider,rgba(59,43,29,0.18))] mb-6">
          <span className="uppercase text-[var(--color-neutral-600,#856c51)]" style={{ fontFamily: 'var(--space-font-heading)', fontSize: '12px', letterSpacing: '0.16em' }}>
            The Hunt · brand dossier
          </span>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 text-[var(--color-neutral-700,#634e38)] hover:text-[var(--color-accent-700,#7c4a17)] hover:underline min-h-[44px] px-2"
            style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px' }}
            aria-label="Close brand dossier"
          >
            Close <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {!profile && !error && (
          <p className={`${typography.size.sm} ${typography.color.secondary} flex items-center gap-2`}>
            <Loader2 className="w-4 h-4 animate-spin text-[var(--space-text-brand)]" />
            Beau is pulling the file on {brandName}…
          </p>
        )}
        {error && <p className={`${typography.size.sm} text-[var(--space-semantic-warning)]`}>{error}</p>}
        {profile && <BrandDetailContent brand={profile} compareList={compareList} onToggleCompare={onToggleCompare} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Discover — the maker directory table
// ---------------------------------------------------------------------------

function toggleIn<T extends string>(list: T[], value: T, set: (v: T[]) => void) {
  set(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
}

/**
 * The directory table — rendered PROGRESSIVELY (progressive-list.ts). Every
 * row here carries archetype chips, a price indicator, a rating tag and two
 * action buttons, so the whole directory at once is a few thousand elements
 * built and laid out before the customer has read the first ten. The first
 * page renders, and the next appends a viewport ahead of the scroll — which
 * looks identical and costs one page instead of all of them.
 *
 * The reveal lives INSIDE the table rather than at its two call sites, so
 * "matched to you" and "beyond your archetypes" cannot drift apart.
 */
function BrandTable({
  entries,
  metaMap,
  onToggleFavourite,
  onOpenBrand,
  compareList,
  onToggleCompare,
  matrixList,
  onToggleMatrix,
  onDeleteBrand,
  passCounts,
}: {
  entries: DirectoryEntry[];
  /** brand (lowercase) → the personal brand_index row (favourite, logo, note). */
  metaMap: Map<string, BrandIndexEntry>;
  onToggleFavourite: (brand: string) => void;
  onOpenBrand: (brandName: string) => void;
  compareList?: string[];
  onToggleCompare?: (brand: string) => void;
  matrixList?: string[];
  onToggleMatrix?: (brand: string) => void;
  /** Per-row delete (founder's fix) — removes the maker from the list. */
  onDeleteBrand: (brand: string) => void;
  /** Lower-cased maker → pass count — rows at two-plus carry the demotion
   * note under their name (build brief rule 9). */
  passCounts?: Record<string, number>;
}) {
  // The identity of THIS set of rows: a filter change (or the profile toggle
  // re-splitting the directory) starts the reveal over; Beau filing a new
  // maker onto the end of the same set does not.
  const resetKey = `${entries.length}\u241f${entries[0]?.profile.brand || ''}\u241f${entries[entries.length - 1]?.profile.brand || ''}`;
  const { count, sentinelRef, done } = useProgressiveReveal(entries.length, { initial: 30, step: 30, resetKey });
  const visible = count >= entries.length ? entries : entries.slice(0, count);
  const head = `px-3 py-2 text-left uppercase whitespace-nowrap`;
  const headStyle: React.CSSProperties = {
    fontFamily: 'var(--space-font-heading)',
    fontSize: '11px',
    letterSpacing: '0.12em',
    fontWeight: 400,
    color: 'var(--color-neutral-600,#856c51)',
  };
  return (
    <div className="overflow-x-auto border border-[var(--color-divider,rgba(59,43,29,0.18))] bg-[var(--color-paper,#fbf8f1)]">
      <table className="w-full border-collapse" style={{ minWidth: '1240px' }}>
        {/* Columns are sized by the CONTENT they hold, not in equal shares:
            Archetype fit carries several chips and takes the lion's share,
            while Favourite, Price and Origin need only their few characters.
            Beau's rating gets 9% — at the table's 1240px minimum that is the
            room the widest nowrap pill ("Inconsistent") needs to sit inside
            its own cell instead of running over "Your note". Column order
            matches the filter rows top→bottom. */}
        <colgroup>
          <col style={{ width: '4%' }} />
          <col style={{ width: '14%' }} />
          <col style={{ width: '7%' }} />
          <col style={{ width: '9%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '14%' }} />
          <col style={{ width: '16%' }} />
          <col style={{ width: '9%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '5%' }} />
        </colgroup>
        <thead>
          <tr className="border-b border-[var(--color-text,#3b2b1d)]">
            <th className={head} style={headStyle} title="Favourite" aria-label="Favourite">★</th>
            <th className={head} style={headStyle}>Maker</th>
            <th className={head} style={headStyle}>Origin</th>
            <th className={head} style={headStyle}>Price tier</th>
            <th className={head} style={headStyle}>Material signal</th>
            <th className={head} style={headStyle}>Known for</th>
            <th className={head} style={headStyle}>Archetype fit</th>
            <th className={head} style={headStyle}>Beau&rsquo;s rating</th>
            {/* YOUR NOTE is the LAST data column (founder's fix) — its filter
                sits last in the filter list to match. */}
            <th className={head} style={headStyle}>Your note</th>
            <th className={`${head} text-right`} style={headStyle} aria-label="Actions" />
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-divider,rgba(59,43,29,0.18))]">
          {visible.map(({ profile: b, source, rating, ratingNote }) => {
            const meta = metaMap.get(b.brand.toLowerCase()) || null;
            return (
            <tr
              key={b.brand}
              onClick={() => onOpenBrand(b.brand)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onOpenBrand(b.brand);
              }}
              tabIndex={0}
              role="button"
              aria-label={`${b.brand} — open the brand dossier`}
              className="cursor-pointer align-top hover:bg-[var(--color-accent-100,#fbf1de)] focus:outline-none focus:bg-[var(--color-accent-100,#fbf1de)] transition-colors"
            >
              {/* FAVOURITE — the one per-row user control; feeds Beau. */}
              <td className="px-2 py-3">
                <FavouriteToggle active={isFavourite(meta)} onToggle={() => onToggleFavourite(b.brand)} brand={b.brand} />
              </td>
              <td className="px-3 py-3 min-w-[180px]">
                <span className="flex items-start gap-2.5">
                  {/* The brand mark — the stored logo when the ledger holds
                      one (URL-pasted / imported / backfilled rows), else the
                      favicon off the maker's VERIFIED official site (the
                      same favicon-service read a file import uses — this is
                      what gives every pre-seeded catalog maker its mark),
                      else a clean initials plate. Never a broken image,
                      never a blank cell. */}
                  <BrandMark
                    name={b.brand}
                    logoUrl={meta?.logo_url || faviconFor(verifiedBrandWebsiteUrl(b.brand) || meta?.url || '')}
                  />
                  <span className="min-w-0">
                    {/* The maker's NAME is a live link to their official site
                        (Buy Links overhaul, Part 2.1) — the rest of the row
                        still opens the dossier. */}
                    <a
                      href={brandWebsiteUrl(b.brand)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className={`block ${typography.color.primary} hover:underline`}
                      style={{ fontFamily: 'var(--space-font-heading)', fontWeight: 500, fontSize: '17px', lineHeight: 1.2 }}
                      title={`Visit the ${b.brand} official site`}
                      aria-label={`${b.brand} — visit the official site`}
                    >
                      {b.brand}
                    </a>
                    {/* Beau-initiated rows carry his voice colour — oxblood
                        (Part 5); user-added rows stay on the structural gold. */}
                    <span
                      className={`block mt-0.5 ${source === 'catalog' ? 'text-[var(--color-neutral-500,#a68e70)]' : source === 'beau' ? 'text-[var(--color-accent-2,#7d2a24)]' : 'text-[var(--color-accent-700,#7c4a17)]'}`}
                      style={{ fontFamily: 'var(--space-font-family)', fontSize: '10px', letterSpacing: '0.06em' }}
                    >
                      {BRAND_SOURCE_LABELS[source]}
                    </span>
                    {/* DEMOTED (rule 9): two passes on a maker move it down
                        the index — the row says so, and why. */}
                    {passCounts && (passCounts[b.brand.trim().toLowerCase()] || 0) >= MAKER_DEMOTION_PASSES && (
                      <span className="block mt-0.5 text-[var(--color-accent-2,#7d2a24)]" style={{ fontFamily: 'var(--space-font-family)', fontSize: '10px' }}>
                        Moved down — you’ve passed on {passCounts[b.brand.trim().toLowerCase()]} of theirs
                      </span>
                    )}
                  </span>
                </span>
              </td>
              <td className="px-3 py-3 whitespace-nowrap" style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px', color: 'var(--color-neutral-700,#634e38)' }}>
                {b.country}
              </td>
              <td className="px-3 py-3 whitespace-nowrap">
                <span className={typography.color.primary} style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px' }}>
                  {PRICE_TIER_LABELS[b.priceBand]}
                </span>{' '}
                <PriceIndicator band={b.priceBand} />
              </td>
              <td className="px-3 py-3 min-w-[140px]" style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px', color: 'var(--color-neutral-800,#453325)' }}>
                {primaryMaterialSignal(b)}
              </td>
              {/* KNOWN FOR — Beau's own line, never user-editable. */}
              <td className="px-3 py-3 min-w-[160px]">
                {beauKnownFor(b, meta) ? (
                  <span style={{ fontFamily: 'var(--space-font-family)', fontSize: '12px', lineHeight: 1.5, color: 'var(--color-neutral-800,#453325)' }}>
                    {beauKnownFor(b, meta)} <BeauTag />
                  </span>
                ) : (
                  <span className={`${typography.size.xs} ${typography.color.muted}`}>—</span>
                )}
              </td>
              <td className="px-3 py-3">
                {/* Every direction this maker serves, as wrapping chips — no
                    comma list, no truncation. */}
                <span className="flex flex-wrap gap-1">
                  {b.archetypes.map((a) => (
                    <ArchetypeTag key={a} id={a} />
                  ))}
                  {b.archetypes.length === 0 && <span className={`${typography.size.xs} ${typography.color.muted}`}>—</span>}
                </span>
              </td>
              <td className="px-3 py-3">
                <BeauRatingTag rating={rating} note={ratingNote} />
              </td>
              {/* YOUR NOTE — the one free-text field the user owns; the LAST
                  data column (founder's fix), mirroring its filter's bottom
                  position in the filter list. */}
              <td className="px-3 py-3 min-w-[140px]">
                {meta?.note ? (
                  <span style={{ fontFamily: 'var(--space-font-family)', fontSize: '12px', lineHeight: 1.5, color: 'var(--color-neutral-700,#634e38)' }}>
                    {meta.note}
                  </span>
                ) : (
                  <span className={`${typography.size.xs} ${typography.color.muted}`}>—</span>
                )}
              </td>
              <td className="px-3 py-3">
                <span className="flex items-center justify-end gap-1.5">
                  {/* Compare / Matrix queue actions RETIRED (founder's
                      correction) — the Weighed stage in The Hunt is the one
                      comparison surface now. */}
                  <CompareAction brand={b.brand} compareList={compareList} onToggleCompare={onToggleCompare} />
                  <MatrixAction brand={b.brand} matrixList={matrixList} onToggleMatrix={onToggleMatrix} />
                  {/* DELETE (founder's fix) — a quiet trash action per row;
                      confirmation happens in the handler, so a stray tap
                      never silently drops a maker. */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteBrand(b.brand);
                    }}
                    className="inline-flex items-center justify-center min-w-[36px] min-h-[36px] rounded transition-colors text-[var(--color-neutral-600,#856c51)] hover:text-[#8B3A3A]"
                    title={`Remove ${b.brand} from your directory`}
                    aria-label={`Remove ${b.brand} from your directory`}
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </span>
              </td>
            </tr>
            );
          })}
          {/* The reveal sentinel — a hairline-thin row after the last rendered
              maker. Reaching within a viewport of it appends the next page,
              so nothing visible ever changes. */}
          {!done && (
            // `border: none` because the tbody's divide-y would otherwise
            // hang a stray hairline off a row that is not a maker.
            <tr aria-hidden="true" style={{ border: 'none' }}>
              <td colSpan={10} style={{ padding: 0, border: 'none' }}>
                <span ref={sentinelRef} className="block" style={{ height: '1px' }} />
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function DiscoverSubTab({
  profileOn,
  profile,
  onOpenBrand,
  compareList,
  onToggleCompare,
  matrixList,
  onToggleMatrix,
}: {
  profileOn: boolean;
  profile: StyleProfile | null;
  onOpenBrand: (brandName: string) => void;
  /** RETIRED queues (the Compare / Matrix sub-tabs are gone) — optional so
   * legacy callers compile; the row actions render nothing without them. */
  compareList?: string[];
  onToggleCompare?: (brand: string) => void;
  matrixList?: string[];
  onToggleMatrix?: (brand: string) => void;
}) {
  // The Piece-index mono register the filter rows are set in (13a).
  usePlexMono();
  // Persisted directory additions (user-added / Beau-recommended / imported).
  const { data: addedRows, refresh } = window.useWorkspaceDB<DirectoryBrandRow>('hunt_directory_brands', {
    orderBy: { column: 'created_at', direction: 'desc' },
    limit: 200,
  });
  useEffect(() => {
    const onChanged = () => refresh();
    window.addEventListener(DISCOVER_BRANDS_EVENT, onChanged);
    return () => window.removeEventListener(DISCOVER_BRANDS_EVENT, onChanged);
  }, [refresh]);

  // The personal per-brand files — favourite (status 'trusted') / logo /
  // note — from the shared brand_index ledger. Favourites feed Beau's
  // trusted-brands signal; the Reserve's old Brand Index sub-tab is retired
  // and this table is now the one brand-tracking surface.
  const { data: metaRows, refresh: refreshMeta } = window.useWorkspaceDB<BrandIndexEntry>('brand_index', {
    orderBy: { column: 'created_at', direction: 'desc' },
    limit: 200,
  });
  useEffect(() => {
    const onChanged = () => refreshMeta();
    window.addEventListener(BRAND_INDEX_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(BRAND_INDEX_CHANGED_EVENT, onChanged);
  }, [refreshMeta]);

  // HIDDEN CATALOG MAKERS (founder's fix — the per-row delete): a maker
  // from the static catalog cannot be deleted from the seed itself, so a
  // `hunt_hidden_brands` row filters it out of the table instead.
  // User-added / Beau-recommended rows delete their hunt_directory_brands
  // row directly and never appear here.
  const { data: hiddenRows, refresh: refreshHidden } = window.useWorkspaceDB<{ id: number; brand: string }>('hunt_hidden_brands', {
    orderBy: { column: 'created_at', direction: 'desc' },
    limit: 500,
  });

  // RETROACTIVE LOGO BACKFILL — one-time sweep on mount: every ledger row
  // filed with a site `url` but NO stored `logo_url` gets its mark fetched
  // (OG image first, favicon fallback — the same read a fresh URL paste
  // gets) and written back, so older entries show in the table exactly like
  // newly-added ones. Rows that already carry a logo are NEVER re-fetched —
  // and since every successful fetch stores at least the favicon, the sweep
  // finds nothing to do on later visits. Sequential, one row at a time, and
  // every write fires BRAND_INDEX_CHANGED_EVENT so the table updates live.
  useEffect(() => {
    if (logoBackfillStarted) return;
    const missing = (metaRows || []).filter(
      (row) => (row.url || '').trim() && !(row.logo_url || '').trim(),
    );
    if (missing.length === 0) return;
    logoBackfillStarted = true;
    void (async () => {
      for (const row of missing) {
        try {
          const meta = await fetchSiteMeta(row.url as string);
          const logo = meta.logoUrl || faviconFor(row.url as string);
          if (logo) await updateBrandIndexEntry(row.id, { logo_url: logo });
        } catch (e) {
          console.warn('[Ethaion] brand logo backfill failed (non-fatal):', row.name, e);
        }
      }
    })();
  }, [metaRows]);

  // Optimistic status overrides — a tapped chip recolours instantly while
  // the ledger write settles.
  const [statusOverrides, setStatusOverrides] = useState<Record<string, BrandIndexStatus>>({});

  const metaMap = useMemo(() => {
    const map = new Map<string, BrandIndexEntry>();
    // Rows arrive newest-first — keep the newest row per name.
    for (const row of metaRows || []) {
      const key = (row.name || '').trim().toLowerCase();
      if (key && !map.has(key)) map.set(key, row);
    }
    for (const [key, status] of Object.entries(statusOverrides)) {
      const existing = map.get(key);
      map.set(
        key,
        existing
          ? { ...existing, status }
          : ({ id: -1, name: key, url: null, logo_url: null, status, note: null, known_for: null, specialisations: null, signature_pieces: null } as BrandIndexEntry),
      );
    }
    return map;
  }, [metaRows, statusOverrides]);

  /** Persist a status; creates the brand's ledger row when none exists. */
  const setBrandStatus = async (brand: string, status: BrandIndexStatus) => {
    setStatusOverrides((cur) => ({ ...cur, [brand.toLowerCase()]: status }));
    try {
      const existing = (metaRows || []).find((r) => (r.name || '').trim().toLowerCase() === brand.toLowerCase());
      if (existing) await updateBrandIndexEntry(existing.id, { status });
      else await addBrandIndexEntry({ name: brand, url: null, logo_url: null, status, note: null, known_for: null, specialisations: null, signature_pieces: null });
    } catch (e) {
      console.warn('[Ethaion] brand status save failed:', e);
    } finally {
      refreshMeta();
    }
  };

  /** Favourite on/off — 'trusted' keeps feeding Beau's positive signal;
   * unfavouriting returns the ledger row to the neutral 'curious'. */
  const toggleFavourite = (brand: string) => {
    const fav = isFavourite(metaMap.get(brand.toLowerCase()));
    void setBrandStatus(brand, fav ? 'curious' : 'trusted');
  };

  /** DELETE A ROW (founder's fix): remove a maker from the directory table,
   * behind a confirmation prompt so a stray tap never drops one. A
   * user-added / Beau-recommended maker deletes its hunt_directory_brands
   * row; a catalog maker is hidden via a hunt_hidden_brands row instead
   * (the static seed itself cannot lose entries). */
  const deleteBrand = async (brand: string) => {
    const clean = brand.trim();
    if (!clean) return;
    if (!window.confirm(`Remove ${clean} from your Discover directory?`)) return;
    try {
      const key = clean.toLowerCase();
      const row = (addedRows || []).find((r) => (r.brand || '').trim().toLowerCase() === key);
      if (row) {
        await (window as any).__workspaceDb.from('hunt_directory_brands').delete(row.id);
        window.dispatchEvent(new CustomEvent(DISCOVER_BRANDS_EVENT));
        refresh();
      } else {
        await (window as any).__workspaceDb.from('hunt_hidden_brands').insert({ brand: clean });
        refreshHidden();
      }
    } catch (e) {
      console.warn('[Ethaion] brand removal failed:', e);
    }
  };

  /** RE-ADD RESTORES (the delete's counterpart): adding a maker back — by
   * name, URL or file import — clears any hunt_hidden_brands row holding
   * it out of the table, so a removed catalog maker is never a dead end. */
  const unhideBrand = async (brand: string) => {
    const key = brand.trim().toLowerCase();
    if (!key) return;
    const rows = (hiddenRows || []).filter((r) => (r.brand || '').trim().toLowerCase() === key);
    if (rows.length === 0) return;
    try {
      for (const row of rows) {
        await (window as any).__workspaceDb.from('hunt_hidden_brands').delete(row.id);
      }
      refreshHidden();
    } catch (e) {
      console.warn('[Ethaion] could not restore the removed maker (non-fatal):', e);
    }
  };

  // "Add a maker" — the TOP element of Discover: ONE smart input (a name
  // or a URL, auto-detected per keystroke) plus the file upload, on one
  // toggle.
  const [addMode, setAddMode] = useState<'entry' | 'file'>('entry');
  const [formInput, setFormInput] = useState('');
  const [formNote, setFormNote] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const inputIsUrl = looksLikeUrl(formInput.trim());

  // File import state — KNOWN and NEW rows process silently; only the
  // AMBIGUOUS rows wait on the user (import resolution).
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [ambiguousEntries, setAmbiguousEntries] = useState<Array<{ entry: BrandImportEntry; why: string }>>([]);
  const [importFileName, setImportFileName] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [importReport, setImportReport] = useState<string | null>(null);
  const [ambiguousBusy, setAmbiguousBusy] = useState<string | null>(null);

  // PASS SIGNALS (build brief rule 9): two passes on a maker demote it —
  // it sorts to the foot of its group with the reason stated on the row.
  const [passSignals, setPassSignals] = useState<PassSignals>(EMPTY_PASS_SIGNALS);
  useEffect(() => {
    const load = () => {
      void fetchPassSignals().then(setPassSignals).catch(() => undefined);
    };
    load();
    window.addEventListener(RESERVE_CHANGED_EVENT, load);
    return () => window.removeEventListener(RESERVE_CHANGED_EVENT, load);
  }, []);

  const resetForm = () => {
    setFormInput('');
    setFormNote('');
  };

  /** ONE SMART INPUT (founder's fix): a name or a URL, auto-detected — and
   * BOTH roads end at the same place (dossier-parity fix): the brand's name
   * and logo read off its own site, and Beau files his full dossier
   * (knownFor, rating, construction, the lot). A pasted URL reads the site
   * first and then generates; a typed name generates first and then reads
   * the site Beau named for the maker. Same output either way. */
  const submitAdd = async () => {
    const raw = formInput.trim();
    if (!raw || addBusy) return;
    setAddBusy(true);
    setAddError(null);
    try {
      let name = raw;
      let cleanUrl: string | null = null;
      let logo: string | null = null;
      if (looksLikeUrl(raw)) {
        cleanUrl = normalizeSiteUrl(raw);
        if (!cleanUrl) throw new Error('That URL couldn\u2019t be read — check it and try again.');
        const meta = await fetchSiteMeta(cleanUrl);
        name = meta.name || raw;
        logo = meta.logoUrl || faviconFor(cleanUrl);
      }
      const added = await addUserDirectoryBrand(name);
      // A maker previously removed from the table comes back the moment it
      // is added again — without this, re-adding a deleted catalog maker
      // would silently change nothing.
      await unhideBrand(added.brand);
      // NAME ENTRY GETS THE SITE READ TOO (dossier-parity fix): the dossier
      // generation names the maker's official site (websiteUrl), with the
      // verified catalog URL as the fallback — its logo is read exactly as
      // a pasted URL's would be, so a typed name never lands with less.
      if (!cleanUrl) {
        const verified = brandWebsiteUrl(added.brand);
        const site = normalizeSiteUrl(
          added.websiteUrl || (verified && !/duckduckgo\.com/i.test(verified) ? verified : '') || '',
        );
        if (site) {
          cleanUrl = site;
          const meta = await fetchSiteMeta(site).catch(() => ({ name: '', logoUrl: null }));
          logo = meta.logoUrl || faviconFor(site);
        }
      }
      // The ledger row rides along when there is anything to keep — the
      // site + its logo (URL adds) and/or the user's own note.
      if (cleanUrl || formNote.trim()) {
        const existing = (metaRows || []).find((r) => (r.name || '').trim().toLowerCase() === added.brand.toLowerCase());
        if (existing) {
          await updateBrandIndexEntry(existing.id, {
            ...(cleanUrl ? { url: cleanUrl, logo_url: logo } : {}),
            ...(formNote.trim() ? { note: formNote.trim() } : {}),
          });
        } else {
          await addBrandIndexEntry({
            name: added.brand,
            url: cleanUrl,
            logo_url: logo,
            status: 'curious',
            note: formNote.trim() || null,
            known_for: null,
            specialisations: null,
            signature_pieces: null,
          });
        }
        refreshMeta();
      }
      resetForm();
      refresh();
      onOpenBrand(added.brand);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Beau couldn\u2019t build that file — check the spelling and try again.');
    } finally {
      setAddBusy(false);
    }
  };

  /** File a batch of parsed entries silently — directory stubs, hidden-row
   * restores, and a Curious ledger row for URL entries (site + favicon). */
  const fileImportEntries = async (entries: BrandImportEntry[]) => {
    const { added, skipped } = await addDirectoryBrandStubs(entries.map((entry) => entry.name));
    // Imported names also restore makers previously removed from the table
    // (catalog rows land in `skipped`, so the stub call alone would leave
    // them hidden).
    for (const entry of entries) await unhideBrand(entry.name);
    for (const entry of entries) {
      if (!entry.url) continue;
      const key = entry.name.toLowerCase();
      if ((metaRows || []).some((r) => (r.name || '').trim().toLowerCase() === key)) continue;
      try {
        await addBrandIndexEntry({ name: entry.name, url: entry.url, logo_url: entry.logoUrl, status: 'curious', note: null, known_for: null, specialisations: null, signature_pieces: null });
      } catch { /* one row never blocks the rest */ }
    }
    return { added, skipped };
  };

  /** File mode (import resolution): parse the picked .txt / .csv / .xlsx,
   * AUTO-CATEGORISE each row — KNOWN (already in the maker database) and
   * NEW (a confident name, auto-created) process silently; only AMBIGUOUS
   * rows are held for the user to confirm, with the reason stated. */
  const onFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = (e.target.files || [])[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;
    setAddError(null);
    setImportReport(null);
    setAmbiguousEntries([]);
    setImportFileName(file.name || '');
    setImportBusy(true);
    try {
      const entries = await parseBrandImportFile(file);
      if (entries.length === 0) {
        setAddError('Nothing readable in that file — one brand name or URL per line (.txt), or in the first column (.csv / .xlsx).');
        return;
      }
      const confident: BrandImportEntry[] = [];
      const held: Array<{ entry: BrandImportEntry; why: string }> = [];
      for (const entry of entries) {
        const check = looksAmbiguousMakerName(entry);
        if (check.ambiguous) held.push({ entry, why: check.why });
        else confident.push(entry);
      }
      const { added, skipped } =
        confident.length > 0 ? await fileImportEntries(confident) : { added: [] as string[], skipped: [] as string[] };
      const bits: string[] = [`Added ${added.length} maker${added.length === 1 ? '' : 's'}.`];
      if (skipped.length > 0) bits.push(`${skipped.length} already in the directory.`);
      if (held.length > 0) bits.push(`${held.length} need${held.length === 1 ? 's' : ''} your confirmation.`);
      setImportReport(bits.join(' '));
      setAmbiguousEntries(held);
      refresh();
      refreshMeta();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'That file couldn\u2019t be read.');
    } finally {
      setImportBusy(false);
    }
  };

  /** Confirm one held row as a maker — it files exactly like a confident
   * one; Skip simply drops it from the review list. */
  const confirmAmbiguous = async (entry: BrandImportEntry) => {
    if (ambiguousBusy) return;
    setAmbiguousBusy(entry.name);
    try {
      await fileImportEntries([entry]);
      setAmbiguousEntries((cur) => cur.filter((row) => row.entry.name !== entry.name));
      refresh();
      refreshMeta();
    } catch { /* leave it in the list — the user can retry */ } finally {
      setAmbiguousBusy(null);
    }
  };

  const skipAmbiguous = (entry: BrandImportEntry) => {
    setAmbiguousEntries((cur) => cur.filter((row) => row.entry.name !== entry.name));
  };

  // Filters — the labelled rows. The FIRST block mirrors the table's column
  // order left→right (Favourite · Origin · Price · Material · Known for ·
  // Style · Rating · Your note); Category / Construction / Register follow
  // past the hairline as facets without a column of their own.
  const [nameQuery, setNameQuery] = useState('');
  const [favesOnly, setFavesOnly] = useState(false);
  const [knownForQuery, setKnownForQuery] = useState('');
  const [noteQuery, setNoteQuery] = useState('');
  const [category, setCategory] = useState<string>('');
  const [priceBand, setPriceBand] = useState<PriceBand | ''>('');
  const [countries, setCountries] = useState<string[]>([]);
  const [construction, setConstruction] = useState<string>('');
  const [materials, setMaterials] = useState<string[]>([]);
  const [registers, setRegisters] = useState<string[]>([]);
  const [archetypes, setArchetypes] = useState<string[]>([]);
  const [ratings, setRatings] = useState<BeauRating[]>([]);

  const entries = useMemo(() => {
    const hidden = new Set(
      (hiddenRows || []).map((r) => (r.brand || '').trim().toLowerCase()).filter(Boolean),
    );
    const all = mergeDirectory(addedRows);
    return hidden.size === 0 ? all : all.filter((e) => !hidden.has(e.profile.brand.toLowerCase()));
  }, [addedRows, hiddenRows]);

  const countryOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const e of entries) {
      if (e.profile.country && e.profile.country !== '—') seen.add(e.profile.country);
    }
    return [...seen].sort();
  }, [entries]);

  const filtered = useMemo(
    () =>
      entries.filter((entry) => {
        const b = entry.profile;
        const meta = metaMap.get(b.brand.toLowerCase());
        if (nameQuery.trim()) {
          const q = nameQuery.trim().toLowerCase();
          if (!b.brand.toLowerCase().includes(q)) return false;
        }
        if (favesOnly && !isFavourite(meta)) return false;
        if (knownForQuery.trim() && !beauKnownFor(b, meta).toLowerCase().includes(knownForQuery.trim().toLowerCase())) return false;
        if (noteQuery.trim() && !(meta?.note || '').toLowerCase().includes(noteQuery.trim().toLowerCase())) return false;
        if (countries.length > 0 && !countries.includes(b.country)) return false;
        if (priceBand && b.priceBand !== priceBand) return false;
        if (materials.length > 0 && !materials.some((m) => brandMatchesDiscoverMaterial(b, m))) return false;
        if (archetypes.length > 0 && !archetypes.some((a) => b.archetypes.includes(a))) return false;
        if (ratings.length > 0 && !ratings.includes(entry.rating)) return false;
        if (category && brandCategory(b.brand) !== category) return false;
        if (construction && constructionMethod(b) !== construction) return false;
        if (registers.length > 0 && !registers.some((r) => b.registers.includes(r as Register))) return false;
        return true;
      }),
    [entries, metaMap, nameQuery, favesOnly, knownForQuery, noteQuery, category, priceBand, countries, construction, materials, registers, archetypes, ratings],
  );

  // PROFILE TOGGLE behaviour — the fix: ON actually filters and ranks.
  const userArchetypes = useMemo(
    () => new Set((profileOn && Array.isArray(profile?.archetypes) ? profile?.archetypes || [] : []).map((a) => a.toLowerCase())),
    [profileOn, profile],
  );

  const { matched, beyond } = useMemo(() => {
    // MAKER DEMOTION (build brief rule 9 · 9a): two passes on a maker move
    // it to the foot of its group — a stable partition, so everything else
    // keeps its ranking. Bringing a pass back undoes it automatically.
    const demoted = (entry: DirectoryEntry) =>
      (passSignals.makerPassCounts[entry.profile.brand.trim().toLowerCase()] || 0) >= MAKER_DEMOTION_PASSES;
    const withDemotion = (list: DirectoryEntry[]) => [...list.filter((e) => !demoted(e)), ...list.filter(demoted)];
    if (userArchetypes.size === 0) {
      return {
        matched: withDemotion([...filtered].sort((a, b) => a.profile.brand.localeCompare(b.profile.brand))),
        beyond: [] as DirectoryEntry[],
      };
    }
    const inMatch: DirectoryEntry[] = [];
    const outMatch: DirectoryEntry[] = [];
    for (const e of filtered) {
      if (e.profile.archetypes.some((a) => userArchetypes.has(a))) inMatch.push(e);
      else outMatch.push(e);
    }
    // Relevance to the profile: archetype overlap first, then budget fit
    // (mid-range budget → accessible/mid tiers ahead), then build quality.
    const budgetScore = (band: PriceBand) => (band === 'accessible' || band === 'mid' ? 2 : band === 'upper-mid' ? 1 : 0);
    inMatch.sort((a, b) => {
      const oa = a.profile.archetypes.filter((x) => userArchetypes.has(x)).length;
      const ob = b.profile.archetypes.filter((x) => userArchetypes.has(x)).length;
      if (oa !== ob) return ob - oa;
      const ba = budgetScore(a.profile.priceBand);
      const bb = budgetScore(b.profile.priceBand);
      if (ba !== bb) return bb - ba;
      if (a.profile.qualityScore !== b.profile.qualityScore) return b.profile.qualityScore - a.profile.qualityScore;
      return a.profile.brand.localeCompare(b.profile.brand);
    });
    outMatch.sort((a, b) => a.profile.brand.localeCompare(b.profile.brand));
    return { matched: withDemotion(inMatch), beyond: withDemotion(outMatch) };
  }, [filtered, userArchetypes, passSignals]);

  const anyFilter =
    nameQuery.trim() !== '' ||
    favesOnly ||
    knownForQuery.trim() !== '' ||
    noteQuery.trim() !== '' ||
    ratings.length > 0 ||
    category !== '' ||
    priceBand !== '' ||
    countries.length > 0 ||
    construction !== '' ||
    materials.length > 0 ||
    registers.length > 0 ||
    archetypes.length > 0;

  const clearFilters = () => {
    setNameQuery('');
    setFavesOnly(false);
    setKnownForQuery('');
    setNoteQuery('');
    setCategory('');
    setPriceBand('');
    setCountries([]);
    setConstruction('');
    setMaterials([]);
    setRegisters([]);
    setArchetypes([]);
    setRatings([]);
  };

  return (
    <div className="space-y-5">
      {/* —— ADD A MAKER — above filters and table. ONE smart input (name
          or URL, auto-detected) plus the file upload. */}
      <div className="bg-[var(--color-paper,#fbf8f1)] border-t border-t-[var(--color-text,#3b2b1d)] border-b border-b-[var(--color-divider,rgba(59,43,29,0.18))] p-4 sm:pt-6 sm:px-[26px] sm:pb-[26px]">
        <p className="uppercase text-[var(--color-accent-700,#7c4a17)]" style={{ fontFamily: 'var(--space-font-heading)', fontSize: '12px', letterSpacing: '0.16em', marginBottom: '6px' }}>
          Add a maker
        </p>
        <p className={typography.color.primary} style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', lineHeight: 1.6, maxWidth: '58ch' }}>
          One box, two ways in — type a maker&rsquo;s name or paste their site URL. Either way the name and logo read
          off the brand&rsquo;s own site and Beau files his full dossier. Whole lists upload as a file.
        </p>

        <div className="flex flex-wrap gap-1.5 mt-4" role="group" aria-label="How to add the brand">
          {([
            { id: 'entry' as const, label: 'Name or URL' },
            { id: 'file' as const, label: 'Upload a file' },
          ]).map(({ id, label }) => (
            <FilterChip
              key={id}
              active={addMode === id}
              onClick={() => {
                setAddMode(id);
                setAddError(null);
              }}
            >
              {label}
            </FilterChip>
          ))}
        </div>

        {addMode !== 'file' ? (
          <form
            className="mt-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submitAdd();
            }}
          >
            {/* ONE SMART INPUT — a name or a URL, detected as you type. */}
            <div className="flex items-stretch gap-2 flex-wrap">
              <input
                type="text"
                value={formInput}
                onChange={(e) => setFormInput(e.target.value)}
                placeholder="e.g. Orslow, Anglo-Italian… — or paste the brand's site URL"
                className="hab-input flex-1 min-w-[200px]"
                style={{ paddingTop: '10px', paddingBottom: '10px' }}
                disabled={addBusy}
                aria-label="Brand name or site URL"
              />
              <button
                type="submit"
                disabled={addBusy || !formInput.trim()}
                className="px-4 min-h-[44px] rounded text-[14px] inline-flex items-center gap-1.5 bg-transparent border border-[var(--color-accent,#a8712c)] text-[var(--color-accent-700,#7c4a17)] hover:bg-[var(--color-accent-100,#fbf1de)] transition-colors disabled:opacity-40"
              >
                {addBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                {addBusy ? (inputIsUrl ? 'Reading the site…' : 'Building the file…') : 'Add the maker'}
              </button>
            </div>
            <p className={`${typography.size.xs} ${inputIsUrl ? 'text-[var(--color-accent-700,#7c4a17)]' : typography.color.muted} mt-1.5`}>
              {inputIsUrl
                ? 'URL detected — name and logo off the site, plus Beau’s full dossier.'
                : 'Name or URL — the same result either way: name and logo off the site, plus Beau’s full dossier.'}
            </p>
            <textarea
              value={formNote}
              onChange={(e) => setFormNote(e.target.value)}
              placeholder="Your note (optional) — e.g. sizing runs slim, order a size up"
              rows={2}
              className="hab-input w-full resize-none mt-3"
              style={{ paddingTop: '8px', paddingBottom: '8px' }}
              disabled={addBusy}
              aria-label="Your note"
            />
          </form>
        ) : (
          /* FILE MODE — a .txt (one entry per line) or .xlsx (first column). */
          <div className="mt-4">
            <p className={typography.color.primary} style={{ fontFamily: 'var(--space-font-family)', fontSize: '13.5px', lineHeight: 1.6, maxWidth: '58ch' }}>
              A <strong>.txt</strong> reads one brand per line; a <strong>.csv</strong> or <strong>.xlsx</strong> reads
              the first column. Makers already known and confident new names file <em>silently</em> — only rows that
              don&rsquo;t clearly read as a maker wait for your confirmation. Everything lands as <em>Curious</em>;
              Beau files each full dossier the first time you open it.
            </p>
            <div className="flex items-center gap-2.5 mt-3 flex-wrap">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={importBusy}
                className="px-4 min-h-[44px] rounded text-[14px] inline-flex items-center gap-1.5 bg-transparent border border-[var(--color-accent,#a8712c)] text-[var(--color-accent-700,#7c4a17)] hover:bg-[var(--color-accent-100,#fbf1de)] transition-colors disabled:opacity-40"
              >
                <Upload className="w-4 h-4" />
                Choose a file
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.csv,.xlsx,.xls,text/plain,text/csv"
                onChange={(e) => void onFilePicked(e)}
                className="hidden"
                aria-label="Upload a maker list (.txt, .csv or .xlsx)"
              />
              {importBusy && (
                <span className={`${typography.size.xs} ${typography.color.muted} inline-flex items-center gap-1.5`}>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Reading {importFileName || 'the file'}…
                </span>
              )}
              {importFileName && !importBusy && !importReport && (
                <span className={`${typography.size.xs} ${typography.color.muted}`}>{importFileName}</span>
              )}
            </div>
            {importReport && <p className={`${typography.size.xs} text-[var(--color-accent-700,#7c4a17)] mt-2.5`}>{importReport}</p>}
            {ambiguousEntries.length > 0 && (
              /* THE REVIEW PANEL (import resolution): only the rows the
                 categoriser couldn't confidently file — each with the reason
                 it was held, and a one-tap way either way. */
              <div className="mt-3 border border-[var(--color-divider,rgba(59,43,29,0.18))]">
                <p className="uppercase text-[var(--color-neutral-700,#634e38)] px-3 py-2 border-b border-[var(--color-divider,rgba(59,43,29,0.18))]" style={{ fontFamily: 'var(--space-font-heading)', fontSize: '11px', letterSpacing: '0.14em' }}>
                  Needs your eye · {ambiguousEntries.length}
                </p>
                {ambiguousEntries.map(({ entry, why }) => (
                  <div key={entry.name} className="flex items-center gap-3 flex-wrap px-3 py-2.5 border-b border-[var(--color-divider,rgba(59,43,29,0.12))] last:border-b-0">
                    <span className="min-w-0 flex-1">
                      <span className={`block ${typography.color.primary}`} style={{ fontFamily: 'var(--space-font-heading)', fontSize: '15px', lineHeight: 1.25 }}>
                        {entry.name}
                      </span>
                      <span className="block text-[var(--color-neutral-600,#856c51)]" style={{ fontFamily: 'var(--space-font-family)', fontSize: '11.5px' }}>
                        {why}
                      </span>
                    </span>
                    <span className="flex items-center gap-2 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => void confirmAmbiguous(entry)}
                        disabled={ambiguousBusy != null}
                        className="min-h-[38px] px-3 inline-flex items-center gap-1.5 border border-[var(--color-accent,#a8712c)] text-[var(--color-accent-700,#7c4a17)] hover:bg-[var(--color-accent-100,#fbf1de)] transition-colors disabled:opacity-40"
                        style={{ fontFamily: 'var(--space-font-family)', fontSize: '12.5px', borderRadius: 0 }}
                      >
                        {ambiguousBusy === entry.name && <Loader2 className="w-3 h-3 animate-spin" />}
                        It’s a maker — add it
                      </button>
                      <button
                        type="button"
                        onClick={() => skipAmbiguous(entry)}
                        disabled={ambiguousBusy != null}
                        className="min-h-[38px] px-2 hover:underline text-[var(--color-neutral-600,#856c51)] disabled:opacity-40"
                        style={{ fontFamily: 'var(--space-font-family)', fontSize: '12.5px' }}
                      >
                        Skip
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {addError && <p className={`${typography.size.xs} text-[var(--space-semantic-warning)] mt-2`}>{addError}</p>}
      </div>

      <p className={typography.color.primary} style={{ fontFamily: 'var(--space-font-family)', fontSize: '15px', lineHeight: 1.6, maxWidth: '62ch' }}>
        The maker directory — every brand Beau trusts enough to name, plus the ones you and he have added, filterable
        by what matters. Tap a row for the full brand dossier.
      </p>

      {/* —— THE FILTERS — every row carries its category label in the left
          column, its control indented in the second. Multi-selects are
          DROPDOWNS (founder's fix), never inline chip rows. The first block
          mirrors the table's column order, left to right — Favourite ·
          Origin · Price · Material · Known for · Style · Rating · Your note
          — then one hairline, then the column-less facets. */}
      <div>
        {anyFilter ? (
          <div className="flex justify-end" style={{ paddingTop: '4px' }}>
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 text-[var(--color-neutral-600,#856c51)] hover:underline"
              style={{ fontFamily: MONO, fontSize: '9px', letterSpacing: '0.05em', textTransform: 'uppercase' }}
            >
              <X className="w-3 h-3" /> Clear filters
            </button>
          </div>
        ) : null}
        {/* COLUMN FILTERS — dropdowns, never inline chip rows (founder's
            fix). Top→bottom mirrors the table's columns left→right:
            Favourite · Origin · Price · Material · Known for · Style ·
            Rating · Your note (LAST, matching the rightmost column). */}
        <div>
          <FilterRow label="Favourite">
            <FilterChip
              active={favesOnly}
              onClick={() => setFavesOnly((cur) => !cur)}
              title="Show only the makers you've starred — favourites feed Beau's recommendations"
            >
              ★ Favourites only
            </FilterChip>
          </FilterRow>
          <FilterRow label="Origin">
            <MultiSelectDropdown
              label="Origin"
              options={countryOptions.map((c) => ({ id: c, label: c }))}
              selected={countries}
              onToggle={(c) => toggleIn(countries, c, setCountries)}
              onClear={() => setCountries([])}
            />
          </FilterRow>
          <FilterRow label="Price">
            <SingleSelectDropdown
              label="Price tier"
              value={priceBand}
              onChange={(v) => setPriceBand(v as PriceBand | '')}
              options={PRICE_BAND_ORDER.map((b) => ({ id: b, label: `${PRICE_TIER_LABELS[b]} · ${PRICE_BAND_SYMBOL[b]}` }))}
            />
          </FilterRow>
          <FilterRow label="Material">
            <MultiSelectDropdown
              label="Material"
              options={DISCOVER_MATERIALS.map((m) => ({ id: m, label: m }))}
              selected={materials}
              onToggle={(m) => toggleIn(materials, m, setMaterials)}
              onClear={() => setMaterials([])}
            />
          </FilterRow>
          <FilterRow label="Known for">
            <input
              type="search"
              value={knownForQuery}
              onChange={(e) => setKnownForQuery(e.target.value)}
              placeholder="e.g. Oxford shirts, loafers…"
              className="hab-input"
              style={{ height: '26px', paddingTop: 0, paddingBottom: 0, width: 'min(100%, 260px)', fontSize: '12px' }}
              aria-label="Filter by what a maker is known for"
            />
          </FilterRow>
          <FilterRow label="Style">
            <MultiSelectDropdown
              label="Style"
              options={Object.keys(ARCHETYPE_LABELS).map((id) => ({ id, label: ARCHETYPE_LABELS[id] }))}
              selected={archetypes}
              onToggle={(id) => toggleIn(archetypes, id, setArchetypes)}
              onClear={() => setArchetypes([])}
            />
          </FilterRow>
          <FilterRow label="Rating">
            <MultiSelectDropdown
              label="Rating"
              options={BEAU_RATINGS.map((r) => ({ id: r, label: r }))}
              selected={ratings}
              onToggle={(r) => toggleIn(ratings, r as BeauRating, setRatings)}
              onClear={() => setRatings([])}
            />
          </FilterRow>
          {/* YOUR NOTE — the LAST filter (founder's fix), because its column
              is now the table's rightmost: filter order top→bottom = column
              order left→right. */}
          <FilterRow label="Your note">
            <input
              type="search"
              value={noteQuery}
              onChange={(e) => setNoteQuery(e.target.value)}
              placeholder="Search your own notes…"
              className="hab-input"
              style={{ height: '26px', paddingTop: 0, paddingBottom: 0, width: 'min(100%, 260px)', fontSize: '12px' }}
              aria-label="Filter by your note"
            />
          </FilterRow>
        </div>

        {/* Facets without a column of their own — dropdowns too. (Every row
            carries its own hairline now, so no extra separator.) */}
        <div>
          <FilterRow label="Category">
            <SingleSelectDropdown
              label="Category"
              value={category}
              onChange={setCategory}
              options={DISCOVER_CATEGORIES.map((c) => ({ id: c, label: c }))}
            />
          </FilterRow>
          <FilterRow label="Construction">
            <SingleSelectDropdown
              label="Construction"
              value={construction}
              onChange={setConstruction}
              options={CONSTRUCTION_METHODS.map((m) => ({ id: m, label: m }))}
            />
          </FilterRow>
          <FilterRow label="Register">
            <MultiSelectDropdown
              label="Register"
              options={REGISTERS.map((r) => ({ id: r, label: r }))}
              selected={registers}
              onToggle={(r) => toggleIn(registers, r, setRegisters)}
              onClear={() => setRegisters([])}
            />
          </FilterRow>
        </div>
      </div>

      {/* —— THE MAKER SEARCH — its own input, DIRECTLY above the table
          (founder's fix): find a brand by name without touching filters. */}
      <div>
        <input
          type="search"
          value={nameQuery}
          onChange={(e) => setNameQuery(e.target.value)}
          placeholder="Search makers by name…"
          className="hab-input w-full"
          style={{ paddingTop: '10px', paddingBottom: '10px', maxWidth: '360px' }}
          aria-label="Search makers by name"
        />
      </div>

      {/* —— RATING LEGEND — Beau's four tiers, DIRECTLY above the table and
          below the maker search (founder's fix), so every rating tag in the
          rows beneath reads itself. */}
      <RatingLegend />

      {/* —— THE TABLE(S). Profile ON: matched-to-you first, the rest below. */}
      {matched.length === 0 && beyond.length === 0 ? (
        <p className={`${typography.size.sm} ${typography.color.muted} py-6 text-center`}>
          No makers match those filters — loosen one and try again.
        </p>
      ) : (
        <>
          {userArchetypes.size > 0 && (
            <p className={`${typography.size.xs} ${typography.color.muted}`}>
              Matched to your archetypes and ranked for your profile — budget fit and build quality first.
            </p>
          )}
          {matched.length > 0 ? (
            <BrandTable
              entries={matched}
              metaMap={metaMap}
              onToggleFavourite={toggleFavourite}
              onOpenBrand={onOpenBrand}
              compareList={compareList}
              onToggleCompare={onToggleCompare}
              matrixList={matrixList}
              onToggleMatrix={onToggleMatrix}
              onDeleteBrand={(b) => void deleteBrand(b)}
              passCounts={passSignals.makerPassCounts}
            />
          ) : (
            userArchetypes.size > 0 && (
              <p className={`${typography.size.sm} ${typography.color.muted} py-4 text-center`}>
                Nothing inside your archetypes matches those filters — the wider directory is below.
              </p>
            )
          )}

          {beyond.length > 0 && (
            <section aria-label="Beyond your archetypes" className="pt-2">
              <div className="pb-2 border-b border-[var(--color-divider,rgba(59,43,29,0.18))] mb-3">
                <h4 className={`hab-section-head ${typography.color.primary}`} style={{ fontSize: '18px' }}>Beyond your archetypes</h4>
                <p className={`${typography.size.xs} ${typography.color.muted} mt-0.5`}>
                  Makers outside your selected directions — still worth knowing, ranked alphabetically.
                </p>
              </div>
              <BrandTable
                entries={beyond}
                metaMap={metaMap}
                onToggleFavourite={toggleFavourite}
                onOpenBrand={onOpenBrand}
                compareList={compareList}
                onToggleCompare={onToggleCompare}
                matrixList={matrixList}
                onToggleMatrix={onToggleMatrix}
                onDeleteBrand={(b) => void deleteBrand(b)}
                passCounts={passSignals.makerPassCounts}
              />
            </section>
          )}
        </>
      )}
    </div>
  );
}
