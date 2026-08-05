/**
 * THE HUNT — Discover sub-tab (Recommendation Engine overhaul, Part 4) +
 * the shared BRAND DOSSIER page.
 *
 * Discover is the maker directory as a TABLE — one row per brand:
 * name (with its source tag: Catalog · You added this · Beau recommended),
 * country of origin, price tier (Budget / Mid / Premium / Luxury), primary
 * material signal, archetype-fit tags, Beau's colour-coded rating
 * (Excellent / Considered / Proceed with caution — the label stays one
 * word; the copy under it on tap/hover says why THIS maker earned it,
 * naming its construction, materials and lifespan)
 * and the "Add to Compare" / "Add to Matrix" actions. Tapping anywhere on
 * a row opens the Brand Dossier.
 *
 * "Don't see a maker?" sits at the TOP — above the filter chips and the
 * table: the user types ONLY the brand name and Beau generates the full
 * dossier (claude-3-5-haiku, cached), persists it to the
 * `hunt_directory_brands` WorkspaceDB table and opens the file.
 *
 * FILTERS (two tiers per row — the category label in its own left column,
 * the chips indented in a second column, so wrapped chips align to the chip
 * column and never back to the label). EVERY row carries a label — nothing
 * floats alone. Two blocks parted by one hairline:
 *   Row 1 — "Materials": the individual material chips only (Leather, Wool,
 *           Merino, Cashmere, Cotton, Linen, Silk). There is NO "Natural
 *           materials only" umbrella toggle (Recommendation Engine
 *           overhaul, Part 8) — it was a parent concept standing as a peer
 *           of its own children, and Ethaion's positioning already implies
 *           natural fibres.
 *   Row 2 — "Price": the price tier chips
 *   Row 3 — "Origin": the country chips (multi)
 *   Row 4 — "Style": the archetype chips (multi)
 *   then — Category · Construction · Register
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
import { useEffect, useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { typography } from '../../lib/colors';
import type { StyleProfile } from './profile-data';
import { TicketFrame } from './ticket-frame';
import {
  ARCHETYPE_LABELS,
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
import { DISCOVER_BRANDS_EVENT, addUserDirectoryBrand, getBrandProfile } from './hunt-ai';
import { useProgressiveReveal } from './progressive-list';

// ---------------------------------------------------------------------------
// Small shared atoms
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// FILTER CHIPS (Discover filter overhaul) — ONE chip look everywhere: the
// same height and padding on every row, square corners, no colour surprises.
//   active   = walnut fill, paper text
//   inactive = paper fill, walnut hairline border, walnut text
// Each filter category is a two-tier row: the label in its own left column,
// the chips indented in a second column — so a chip that wraps to a new line
// aligns to the chip column, never back to the label.
// ---------------------------------------------------------------------------

const CHIP_BASE: React.CSSProperties = {
  fontFamily: 'var(--space-font-family)',
  fontSize: '12.5px',
  lineHeight: 1,
  borderRadius: 0,
  padding: '0 12px',
  height: '32px',
  whiteSpace: 'nowrap',
};

function chipStyle(active: boolean): React.CSSProperties {
  return active
    ? { ...CHIP_BASE, background: '#241a12', color: '#fbf8f1', border: '1px solid #241a12' }
    : {
        ...CHIP_BASE,
        background: 'var(--color-paper,#fbf8f1)',
        color: 'var(--color-text,#3b2b1d)',
        border: '1px solid var(--color-divider,rgba(59,43,29,0.35))',
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

/** One filter category: label tier on the left, chip tier indented right. */
function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[92px_minmax(0,1fr)] sm:grid-cols-[132px_minmax(0,1fr)] gap-x-4 items-start" style={{ paddingTop: '7px', paddingBottom: '7px' }}>
      <span
        className="uppercase text-[var(--color-neutral-600,#856c51)]"
        style={{ fontFamily: 'var(--space-font-heading)', fontSize: '11px', letterSpacing: '0.12em', lineHeight: '32px' }}
      >
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5 min-w-0">{children}</div>
    </div>
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
      : rating === 'Considered'
        ? 'bg-[var(--color-accent-100,#fbf1de)] text-[var(--color-accent-800,#5c3413)] border-[var(--color-accent,#a8712c)]'
        : 'bg-[color-mix(in_srgb,var(--space-semantic-warning)_14%,var(--space-surface-card))] text-[var(--space-semantic-warning)] border-[var(--space-semantic-warning)]';
  return (
    <span className="inline-block">
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
          style={{ fontFamily: 'var(--space-font-family)', fontSize: '11px', lineHeight: 1.5, maxWidth: '30ch', whiteSpace: 'normal', textAlign: 'left' }}
        >
          {note}
        </span>
      )}
    </span>
  );
}

/** "Compare" queue action — shared by rows, Find results and the dossier. */
export function CompareAction({
  brand,
  compareList,
  onToggleCompare,
  size = 'sm',
}: {
  brand: string;
  compareList: string[];
  onToggleCompare: (brand: string) => void;
  size?: 'sm' | 'md';
}) {
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

/** "Add to Matrix" action — builds the custom Matrix view from Discover. */
export function MatrixAction({
  brand,
  matrixList,
  onToggleMatrix,
  size = 'sm',
}: {
  brand: string;
  matrixList: string[];
  onToggleMatrix: (brand: string) => void;
  size?: 'sm' | 'md';
}) {
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
  compareList: string[];
  onToggleCompare: (brand: string) => void;
}) {
  const ratingForBrand = beauRatingFromQuality(brand.constructionQuality);
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
        <CompareAction brand={brand.brand} compareList={compareList} onToggleCompare={onToggleCompare} size="md" />
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

      {brand.generated && (
        <p className={`${typography.size.xs} ${typography.color.muted} mt-4`} style={{ fontSize: '10px' }}>
          This brand is outside Beau&rsquo;s verified directory — the profile above is his best structured read, generated
          on demand. Treat specifics (founding year, exact prices) as approximate.
        </p>
      )}
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
  compareList: string[];
  onToggleCompare: (brand: string) => void;
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

function toggleIn(list: string[], value: string, set: (v: string[]) => void) {
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
  onOpenBrand,
  compareList,
  onToggleCompare,
  matrixList,
  onToggleMatrix,
}: {
  entries: DirectoryEntry[];
  onOpenBrand: (brandName: string) => void;
  compareList: string[];
  onToggleCompare: (brand: string) => void;
  matrixList: string[];
  onToggleMatrix: (brand: string) => void;
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
      <table className="w-full border-collapse" style={{ minWidth: '940px' }}>
        {/* Columns are sized by the CONTENT they hold, not in equal shares:
            Archetype fit carries several chips and takes the lion's share,
            while Price, Origin and the rating need only their few
            characters. */}
        <colgroup>
          <col style={{ width: '18%' }} />
          <col style={{ width: '11%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '13%' }} />
          <col style={{ width: '32%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '4%' }} />
        </colgroup>
        <thead>
          <tr className="border-b border-[var(--color-text,#3b2b1d)]">
            <th className={head} style={headStyle}>Maker</th>
            <th className={head} style={headStyle}>Origin</th>
            <th className={head} style={headStyle}>Price tier</th>
            <th className={head} style={headStyle}>Material signal</th>
            <th className={head} style={headStyle}>Archetype fit</th>
            <th className={head} style={headStyle}>Beau&rsquo;s rating</th>
            <th className={`${head} text-right`} style={headStyle} aria-label="Actions" />
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-divider,rgba(59,43,29,0.18))]">
          {visible.map(({ profile: b, source, rating, ratingNote }) => (
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
              <td className="px-3 py-3 min-w-[170px]">
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
              <td className="px-3 py-3">
                <span className="flex items-center justify-end gap-1.5">
                  <CompareAction brand={b.brand} compareList={compareList} onToggleCompare={onToggleCompare} />
                  <MatrixAction brand={b.brand} matrixList={matrixList} onToggleMatrix={onToggleMatrix} />
                </span>
              </td>
            </tr>
          ))}
          {/* The reveal sentinel — a hairline-thin row after the last rendered
              maker. Reaching within a viewport of it appends the next page,
              so nothing visible ever changes. */}
          {!done && (
            // `border: none` because the tbody's divide-y would otherwise
            // hang a stray hairline off a row that is not a maker.
            <tr aria-hidden="true" style={{ border: 'none' }}>
              <td colSpan={7} style={{ padding: 0, border: 'none' }}>
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
  compareList: string[];
  onToggleCompare: (brand: string) => void;
  matrixList: string[];
  onToggleMatrix: (brand: string) => void;
}) {
  // Persisted directory additions (user-added / Beau-recommended).
  const { data: addedRows, refresh } = window.useWorkspaceDB<DirectoryBrandRow>('hunt_directory_brands', {
    orderBy: { column: 'created_at', direction: 'desc' },
    limit: 100,
  });
  useEffect(() => {
    const onChanged = () => refresh();
    window.addEventListener(DISCOVER_BRANDS_EVENT, onChanged);
    return () => window.removeEventListener(DISCOVER_BRANDS_EVENT, onChanged);
  }, [refresh]);

  // "Don't see a maker?" — the TOP element of Discover.
  const [lookup, setLookup] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const submitAdd = async () => {
    const name = lookup.trim();
    if (!name || addBusy) return;
    setAddBusy(true);
    setAddError(null);
    try {
      const added = await addUserDirectoryBrand(name);
      setLookup('');
      refresh();
      onOpenBrand(added.brand);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Beau couldn\u2019t build that file — check the spelling and try again.');
    } finally {
      setAddBusy(false);
    }
  };

  // Filters — the clean chip bar (multi-select where applicable).
  const [category, setCategory] = useState<string>('');
  const [priceBand, setPriceBand] = useState<PriceBand | ''>('');
  const [countries, setCountries] = useState<string[]>([]);
  const [construction, setConstruction] = useState<string>('');
  const [materials, setMaterials] = useState<string[]>([]);
  const [registers, setRegisters] = useState<string[]>([]);
  const [archetypes, setArchetypes] = useState<string[]>([]);

  const entries = useMemo(() => mergeDirectory(addedRows), [addedRows]);

  const countryOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const e of entries) {
      if (e.profile.country && e.profile.country !== '—') seen.add(e.profile.country);
    }
    return [...seen].sort();
  }, [entries]);

  const filtered = useMemo(
    () =>
      entries.filter(({ profile: b }) => {
        if (category && brandCategory(b.brand) !== category) return false;
        if (priceBand && b.priceBand !== priceBand) return false;
        if (countries.length > 0 && !countries.includes(b.country)) return false;
        if (construction && constructionMethod(b) !== construction) return false;
        if (materials.length > 0 && !materials.some((m) => brandMatchesDiscoverMaterial(b, m))) return false;
        if (registers.length > 0 && !registers.some((r) => b.registers.includes(r as Register))) return false;
        if (archetypes.length > 0 && !archetypes.some((a) => b.archetypes.includes(a))) return false;
        return true;
      }),
    [entries, category, priceBand, countries, construction, materials, registers, archetypes],
  );

  // PROFILE TOGGLE behaviour — the fix: ON actually filters and ranks.
  const userArchetypes = useMemo(
    () => new Set((profileOn && Array.isArray(profile?.archetypes) ? profile?.archetypes || [] : []).map((a) => a.toLowerCase())),
    [profileOn, profile],
  );

  const { matched, beyond } = useMemo(() => {
    if (userArchetypes.size === 0) {
      return { matched: [...filtered].sort((a, b) => a.profile.brand.localeCompare(b.profile.brand)), beyond: [] as DirectoryEntry[] };
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
    return { matched: inMatch, beyond: outMatch };
  }, [filtered, userArchetypes]);

  const anyFilter =
    category || priceBand || countries.length > 0 || construction || materials.length > 0 || registers.length > 0 || archetypes.length > 0;

  const clearFilters = () => {
    setCategory('');
    setPriceBand('');
    setCountries([]);
    setConstruction('');
    setMaterials([]);
    setRegisters([]);
    setArchetypes([]);
  };

  return (
    <div className="space-y-5">
      {/* —— DON'T SEE A MAKER? — at the very top, above filters and table. */}
      <div className="bg-[var(--color-paper,#fbf8f1)] border-t border-t-[var(--color-text,#3b2b1d)] border-b border-b-[var(--color-divider,rgba(59,43,29,0.18))]" style={{ padding: '24px 26px 26px' }}>
        <p className="uppercase text-[var(--color-accent-700,#7c4a17)]" style={{ fontFamily: 'var(--space-font-heading)', fontSize: '12px', letterSpacing: '0.16em', marginBottom: '6px' }}>
          Don&rsquo;t see a maker?
        </p>
        <p className={typography.color.primary} style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', lineHeight: 1.6, maxWidth: '58ch' }}>
          Type the name — that&rsquo;s all Beau needs. He builds the full dossier himself and files the maker into this
          directory under “You added this”.
        </p>
        <form
          className="flex items-stretch gap-2 mt-3 flex-wrap"
          onSubmit={(e) => {
            e.preventDefault();
            void submitAdd();
          }}
        >
          <input
            type="text"
            value={lookup}
            onChange={(e) => setLookup(e.target.value)}
            placeholder="e.g. Orslow, Anglo-Italian, De Bonne Facture…"
            className="hab-input flex-1 min-w-[200px]"
            style={{ paddingTop: '10px', paddingBottom: '10px' }}
            disabled={addBusy}
            aria-label="Add a maker by name"
          />
          <button
            type="submit"
            disabled={addBusy || !lookup.trim()}
            className="px-4 min-h-[44px] rounded text-[14px] inline-flex items-center gap-1.5 bg-transparent border border-[var(--color-accent,#a8712c)] text-[var(--color-accent-700,#7c4a17)] hover:bg-[var(--color-accent-100,#fbf1de)] transition-colors disabled:opacity-40"
          >
            {addBusy && <Loader2 className="w-4 h-4 animate-spin" />}
            {addBusy ? 'Building the file…' : 'Add the maker'}
          </button>
        </form>
        {addError && <p className={`${typography.size.xs} text-[var(--space-semantic-warning)] mt-2`}>{addError}</p>}
      </div>

      <p className={typography.color.primary} style={{ fontFamily: 'var(--space-font-family)', fontSize: '15px', lineHeight: 1.6, maxWidth: '62ch' }}>
        The maker directory — every brand Beau trusts enough to name, plus the ones you and he have added, filterable
        by what matters. Tap a row for the full brand dossier.
      </p>

      {/* —— THE FILTERS — every chip row carries its category label in the
          left column, chips indented in the second column (wrapped chips
          align to the chip column, never back to the label). The Materials
          row is individual fibres only, no umbrella toggle. Two blocks
          parted by one hairline. */}
      <div>
        {anyFilter ? (
          <div className="flex justify-end" style={{ paddingTop: '4px' }}>
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 text-[var(--color-neutral-600,#856c51)] hover:underline"
              style={{ fontFamily: 'var(--space-font-family)', fontSize: '12px' }}
            >
              <X className="w-3 h-3" /> Clear filters
            </button>
          </div>
        ) : null}
        <div>
          <FilterRow label="Materials">
            {DISCOVER_MATERIALS.map((m) => (
              <FilterChip key={m} active={materials.includes(m)} onClick={() => toggleIn(materials, m, setMaterials)}>
                {m}
              </FilterChip>
            ))}
          </FilterRow>
          <FilterRow label="Price">
            <FilterChip active={priceBand === ''} onClick={() => setPriceBand('')}>Any</FilterChip>
            {PRICE_BAND_ORDER.map((b) => (
              <FilterChip key={b} active={priceBand === b} onClick={() => setPriceBand(priceBand === b ? '' : b)} title={PRICE_BAND_SYMBOL[b]}>
                {PRICE_TIER_LABELS[b]}
              </FilterChip>
            ))}
          </FilterRow>
          <FilterRow label="Origin">
            {countryOptions.map((c) => (
              <FilterChip key={c} active={countries.includes(c)} onClick={() => toggleIn(countries, c, setCountries)}>
                {c}
              </FilterChip>
            ))}
          </FilterRow>
          <FilterRow label="Style">
            {Object.keys(ARCHETYPE_LABELS).map((id) => (
              <FilterChip key={id} active={archetypes.includes(id)} onClick={() => toggleIn(archetypes, id, setArchetypes)}>
                {ARCHETYPE_LABELS[id]}
              </FilterChip>
            ))}
          </FilterRow>
        </div>

        {/* The row separator — one subtle hairline. */}
        <div style={{ borderTop: '1px solid var(--color-divider,rgba(59,43,29,0.18))', marginTop: '8px', marginBottom: '8px' }} aria-hidden="true" />

        <div>
          <FilterRow label="Category">
            <FilterChip active={category === ''} onClick={() => setCategory('')}>Any</FilterChip>
            {DISCOVER_CATEGORIES.map((c) => (
              <FilterChip key={c} active={category === c} onClick={() => setCategory(category === c ? '' : c)}>
                {c}
              </FilterChip>
            ))}
          </FilterRow>
          <FilterRow label="Construction">
            <FilterChip active={construction === ''} onClick={() => setConstruction('')}>Any</FilterChip>
            {CONSTRUCTION_METHODS.map((m) => (
              <FilterChip key={m} active={construction === m} onClick={() => setConstruction(construction === m ? '' : m)}>
                {m}
              </FilterChip>
            ))}
          </FilterRow>
          <FilterRow label="Register">
            {REGISTERS.map((r) => (
              <FilterChip key={r} active={registers.includes(r)} onClick={() => toggleIn(registers, r, setRegisters)}>
                {r}
              </FilterChip>
            ))}
          </FilterRow>
        </div>
      </div>

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
              onOpenBrand={onOpenBrand}
              compareList={compareList}
              onToggleCompare={onToggleCompare}
              matrixList={matrixList}
              onToggleMatrix={onToggleMatrix}
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
                onOpenBrand={onOpenBrand}
                compareList={compareList}
                onToggleCompare={onToggleCompare}
                matrixList={matrixList}
                onToggleMatrix={onToggleMatrix}
              />
            </section>
          )}
        </>
      )}
    </div>
  );
}
