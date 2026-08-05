/**
 * Ethaion wardrobe UI (v7) — THE LEDGER: the category grid, the category
 * sub-pages (owned pieces as a clean photo-tile grid, guarded delete, a
 * camera-led empty state), and the per-category budget DEFAULTS editor
 * (rendered in Your Style; the Curated tab holds the session price filter).
 * Logging a piece requires a photo (Pass Thirty-Three) — the text quick-add
 * below is retired from the UI.
 *
 * ILLUSTRATIONS AND COLOUR (Recommendation Engine overhaul, Parts 1 & 2):
 * the category grid carries ONE generic illustration per CATEGORY, to the
 * left of the category name; the individual piece entries beneath it carry
 * no illustration and no colour treatment at all. Categories run in the
 * app's ONE canonical menswear order (category-order.ts).
 *
 * Wardrobe piece cards render through the canonical image pipeline
 * (canonical-garment.tsx): the user's own photograph of the garment,
 * background removed and normalised. Raw uploads are never the card image,
 * and no card is ever tinted to the piece's colour.
 */
import { Fragment, memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  Check,
  ChevronRight,
  Copy,
  FileUp,
  Loader2,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import { tw, typography } from '../../lib/colors';
import {
  OWN_SUGGESTIONS,
  WARDROBE_CATEGORIES,
  categoryById,
  categoryLabel,
  costPerWearLabel,
  currencySymbol,
  dupePairKey,
  fetchPieceValues,
  findExistingDuplicatePairs,
  findLikelyDuplicate,
  formatBudget,
  goToTab,
  insertPieces,
  materialFor,
  mergePieces,
  occasionTagLabel,
  patternLabel,
  radarToWardrobe,
  saveCategoryBudget,
  seasonLabel,
  type CategoryBudget,
  type NewPiece,
  type PieceAttributes,
  type PieceDetails,
  type PieceValue,
  type ProportionBullets,
  type PurchaseFeedback,
  type RadarItem,
  type WardrobeCategory,
  type WardrobePiece,
} from './profile-data';
import { parseBulkText } from './wardrobe-ai';
import { documentToText } from './discovery-ai';
import { BrandField, SizeSelector } from './input-fields';
import { Illo } from './illustrations';
import { ledgerIllustration } from './illustration-assets';
import { CanonicalGarment } from './canonical-garment';
import { TryOnButton } from './tryon';
import { CarePanel, FabricLabel } from './care';
import { pieceBrandType, pieceMetaType, pieceNameType } from './piece-typography';
import { FeedbackNote, PurchaseFeedbackPrompt } from './feedback';
import { PieceEditForm, PieceEditSheet } from './piece-edit';
import { fetchSemanticTags, type SemanticTags } from './semantic-tags';

// ---------------------------------------------------------------------------
// Small atoms
// ---------------------------------------------------------------------------

function TagPill({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'brand' }) {
  return (
    <span
      className={`${tw.badge.default} ${tone === 'brand' ? tw.badge.primary : tw.badge.neutral}`}
      style={{ fontSize: '10px' }}
    >
      {children}
    </span>
  );
}

/** A piece's logged colourways, NAMED rather than swatched: pieces carry no
 * colour treatment anywhere they are listed (Recommendation Engine overhaul,
 * Part 2). The colours themselves still read as swatches inside a piece's
 * own detail view, where they are the record being edited. */
function ColorNames({ colors }: { colors: string[] }) {
  if (!colors || colors.length === 0) return null;
  return (
    <span className={`${typography.size.xs} ${typography.color.muted} capitalize`} style={{ fontSize: '10px' }}>
      {colors.slice(0, 5).join(' · ')}
    </span>
  );
}

/** Concise what-suits-your-frame bullets: works / look for / avoid (v3). */
export function ProportionBulletsList({ bullets }: { bullets: ProportionBullets }) {
  const groups = [
    { key: 'works', label: 'Works for you', items: bullets.works, marker: 'check' as const },
    { key: 'look', label: 'Look for', items: bullets.lookFor, marker: 'dot' as const },
    { key: 'avoid', label: 'Avoid', items: bullets.avoid, marker: 'x' as const },
  ].filter((g) => g.items.length > 0);
  if (groups.length === 0) return null;
  return (
    <div className="grid sm:grid-cols-3 gap-3">
      {groups.map((g) => (
        <div key={g.key}>
          <p className={`${typography.size.xs} uppercase tracking-wide ${typography.weight.medium} ${typography.color.muted} mb-1`}>
            {g.label}
          </p>
          <ul className="space-y-1">
            {g.items.map((item) => (
              <li key={item} className={`${typography.size.xs} ${typography.color.secondary} leading-snug flex items-start gap-1.5`}>
                {g.marker === 'check' && <Check className="w-3 h-3 mt-0.5 flex-shrink-0 text-[var(--space-semantic-success)]" />}
                {g.marker === 'dot' && <span className="w-1.5 h-1.5 mt-1.5 rounded-full bg-[var(--space-brand-primary)] flex-shrink-0" />}
                {g.marker === 'x' && <X className="w-3 h-3 mt-0.5 flex-shrink-0 text-[var(--space-semantic-danger)]" />}
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-category budget editor
// ---------------------------------------------------------------------------

export function BudgetEditor({
  category,
  budget,
  onSaved,
}: {
  category: WardrobeCategory;
  budget: CategoryBudget | undefined;
  onSaved: (budgets: Record<string, CategoryBudget>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [minVal, setMinVal] = useState<string>(budget?.min_price != null ? String(budget.min_price) : '');
  const [maxVal, setMaxVal] = useState<string>(budget?.max_price != null ? String(budget.max_price) : '');
  const [busy, setBusy] = useState(false);

  const openEditor = () => {
    setMinVal(budget?.min_price != null ? String(budget.min_price) : '');
    setMaxVal(budget?.max_price != null ? String(budget.max_price) : '');
    setEditing(true);
  };

  const save = async (clear = false) => {
    setBusy(true);
    try {
      const min = clear ? null : minVal.trim() === '' ? null : Math.max(0, parseInt(minVal, 10) || 0);
      const max = clear ? null : maxVal.trim() === '' ? null : Math.max(0, parseInt(maxVal, 10) || 0);
      const fresh = await saveCategoryBudget(category.id, min, max);
      onSaved(fresh);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  const hasBudget = budget && (budget.min_price != null || budget.max_price != null);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={openEditor}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${typography.size.xs} border transition-colors ${
          hasBudget
            ? 'bg-[var(--space-surface-accent-soft)] border-[var(--space-brand-primary-200)] text-[var(--space-text-brand)]'
            : 'border-dashed border-[var(--space-border-strong)] text-[var(--space-text-muted)] hover:text-[var(--space-text-primary)]'
        }`}
        title={`Set your ${category.label.toLowerCase()} budget`}
      >
        <SlidersHorizontal className="w-3 h-3" />
        {hasBudget ? formatBudget(budget) : 'Set budget'}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <span className={`${typography.size.xs} ${typography.color.muted}`}>{currencySymbol()}</span>
      <input
        type="number"
        min={0}
        value={minVal}
        onChange={(e) => setMinVal(e.target.value)}
        placeholder="min"
        className={`w-16 px-2 py-1 rounded-lg border border-[var(--space-border-default)] bg-[var(--space-surface-card)] ${typography.size.xs} focus:outline-none focus:ring-1 focus:ring-[var(--space-brand-primary)]`}
      />
      <span className={`${typography.size.xs} ${typography.color.muted}`}>– {currencySymbol()}</span>
      <input
        type="number"
        min={0}
        value={maxVal}
        onChange={(e) => setMaxVal(e.target.value)}
        placeholder="max"
        className={`w-16 px-2 py-1 rounded-lg border border-[var(--space-border-default)] bg-[var(--space-surface-card)] ${typography.size.xs} focus:outline-none focus:ring-1 focus:ring-[var(--space-brand-primary)]`}
      />
      <button
        type="button"
        onClick={() => void save(false)}
        disabled={busy}
        className={`px-2.5 py-1 rounded-lg ${typography.size.xs} ${tw.button.primary} disabled:opacity-50 inline-flex items-center gap-1`}
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
        Save
      </button>
      {(budget?.min_price != null || budget?.max_price != null) && (
        <button
          type="button"
          onClick={() => void save(true)}
          disabled={busy}
          className={`px-2 py-1 rounded-lg ${typography.size.xs} ${tw.button.ghost} border border-[var(--space-border-default)]`}
        >
          Clear
        </button>
      )}
      <button
        type="button"
        onClick={() => setEditing(false)}
        className={`p-1 rounded-lg ${tw.button.ghost}`}
        aria-label="Cancel"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </span>
  );
}

/** The home-screen filters panel: one budget row per clothing category. */
export function BudgetFilters({
  budgets,
  onSaved,
}: {
  budgets: Record<string, CategoryBudget>;
  onSaved: (budgets: Record<string, CategoryBudget>) => void;
}) {
  const [open, setOpen] = useState(false);
  const setCount = WARDROBE_CATEGORIES.filter(
    (c) => budgets[c.id] && (budgets[c.id].min_price != null || budgets[c.id].max_price != null),
  ).length;

  return (
    <div className={`${tw.card.default} rounded-2xl`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left"
      >
        <span className="flex items-center gap-2 min-w-0">
          <SlidersHorizontal className={`w-4 h-4 ${tw.icon.primary} flex-shrink-0`} />
          <span className="min-w-0">
            <span className={`block ${typography.size.base} ${typography.weight.semibold} ${typography.color.primary}`}>
              Price filter defaults — by category
            </span>
            <span className={`block ${typography.size.xs} ${typography.color.muted} mt-0.5`}>
              Jacket budget isn’t shirt budget. {setCount > 0 ? `${setCount} set — ` : 'Set a range per category — '}The Rail’s picks start from these and can be adjusted per session there.
            </span>
          </span>
        </span>
        <ChevronRight className={`w-4 h-4 text-[var(--space-text-muted)] flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-[var(--space-border-default)]">
          <div className="divide-y divide-[var(--space-border-default)]">
            {WARDROBE_CATEGORIES.map((cat) => (
              <div key={cat.id} className="py-2.5 flex items-center justify-between gap-3 flex-wrap">
                <span className={`${typography.size.sm} ${typography.color.primary} min-w-[7rem]`}>{cat.label}</span>
                <BudgetEditor category={cat} budget={budgets[cat.id]} onSaved={onSaved} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Category grid (home) — tap a category to open its sub-page
// ---------------------------------------------------------------------------

// React.memo (Pass Forty-Six): the category list re-rendered on every parent
// state change (photo-sweep ticks, search keystrokes) — its props are the
// memoised pieces array and a stable setter, so memoising keeps the Wardrobe
// screen snappy as the wardrobe grows.
export const CategoryGrid = memo(function CategoryGrid({
  pieces,
  onOpen,
}: {
  pieces: WardrobePiece[];
  onOpen: (categoryId: string) => void;
}) {
  // A CLEAN INVENTORY, nothing more. One hairline row per category the user
  // actually owns something in: ONE generic category illustration, the
  // category name and the pieces filed under it, in their own words. No
  // owned-of-target counts, no progress bars, no gap labels, no "not
  // started" — coverage is Beau's judgement and it lives in The Edit tab's
  // Coverage Map, not in the user's own inventory.
  //
  // Categories run in the app's canonical menswear order and pieces carry
  // NO colour treatment — illustration and colouring are category-level
  // signposts, never per-piece decoration.
  const filled = WARDROBE_CATEGORIES.map((cat) => ({
    cat,
    catPieces: pieces.filter((p) => p.category === cat.id),
  })).filter(({ catPieces }) => catPieces.length > 0);

  if (filled.length === 0) {
    return (
      <p className={`${typography.size.sm} ${typography.color.secondary} py-6`} style={{ maxWidth: '52ch' }}>
        Nothing logged yet. Photograph a piece or search for it above and it’ll be filed here, under its category,
        with the name you gave it.
      </p>
    );
  }

  return (
    <div className="divide-y divide-[var(--color-divider,rgba(59,43,29,0.18))] border-b border-[var(--color-divider,rgba(59,43,29,0.18))]">
      {filled.map(({ cat, catPieces }) => (
        <button
          key={cat.id}
          type="button"
          onClick={() => onOpen(cat.id)}
          className="w-full min-h-[44px] text-left transition-colors hover:bg-[var(--color-paper,#fbf8f1)] group grid items-baseline gap-x-6 grid-cols-[minmax(0,1fr)_auto_18px]"
          style={{ padding: '15px 4px' }}
        >
          <span className="min-w-0">
            {/* ONE generic illustration per CATEGORY, to the LEFT of the
                category name and vertically centred against it — a shoe
                beside Shoes, a trouser beside Bottoms. It represents the
                category, never a specific piece, and it is uncoloured.

                It is a real ligne claire plate (illustration-assets.ts), not
                the coded SVG: the plates are keyed by CATEGORY here, because
                asking for one by slot id never matched anything and left
                every row on the drawing.

                The plate is drawn 1.5× the size of its 36px LAYOUT box — the
                artwork ships with a generous white margin, so enlarging it is
                the only way the drawing itself reads at this size — and the
                enlargement is done with NEGATIVE INSETS, never a transform.
                That is not a style preference: a transform makes the element a
                stacking context, which isolates the plate's own
                `mix-blend-mode: multiply` inside it, so the white ground had
                nothing to multiply into and every row showed a white square on
                the beige. With plain insets the blend reaches the page behind
                it, the white disappears on the FIRST paint, and the layout box
                — and therefore the row height — is unchanged either way. */}
            <span className="flex items-center gap-3 min-w-0">
              <span className="relative flex-shrink-0 w-9 h-9" aria-hidden="true">
                <span
                  className="absolute block"
                  style={{ top: '-25%', left: '-25%', width: '150%', height: '150%' }}
                >
                  <Illo
                    id={cat.coverIllo}
                    src={ledgerIllustration(cat.id)}
                    title={cat.label}
                    showLabel={false}
                    blendWithGround
                    className="w-full h-full"
                  />
                </span>
              </span>
              <span className={`block truncate ${typography.color.primary}`} style={{ fontFamily: 'var(--space-font-heading)', fontSize: '19px', fontWeight: 400, lineHeight: 1.2 }}>
                {cat.label}
              </span>
            </span>
            {/* The pieces filed under it — their labels and nothing else. No
                per-piece illustration, no colour treatment: the category's
                single drawing above carries the whole visual load. */}
            <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5" style={{ marginTop: '8px', paddingLeft: '48px' }}>
              {catPieces.map((p, i) => (
                <Fragment key={p.id}>
                  {/* The interpunct between pieces — the house separator, not
                      a plain space. Its own element so it never sticks to a
                      name when the list wraps. */}
                  {i > 0 && (
                    <span
                      aria-hidden="true"
                      className="text-[var(--color-neutral-500,#a68e70)]"
                      style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px', lineHeight: 1.5 }}
                    >
                      ·
                    </span>
                  )}
                  <span
                    className="text-[var(--color-neutral-700,#634e38)] min-w-0"
                    style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px', lineHeight: 1.5 }}
                  >
                    {p.name}
                  </span>
                </Fragment>
              ))}
            </span>
          </span>
          {/* A simple raw count of what's owned — never a fraction, never an
              "x / y needed" target (Milestones overhaul, Part 2b). */}
          <span
            className="justify-self-end self-center text-[var(--color-neutral-600,#856c51)] tabular-nums whitespace-nowrap"
            style={{ fontFamily: 'var(--space-font-family)', fontSize: '12px' }}
          >
            {catPieces.length} piece{catPieces.length === 1 ? '' : 's'}
          </span>
          <span
            className="justify-self-end self-center text-[var(--color-neutral-500,#a68e70)] group-hover:translate-x-0.5 transition-transform"
            style={{ fontFamily: 'var(--space-font-heading)', fontSize: '17px', lineHeight: 1 }}
            aria-hidden="true"
          >
            ›
          </span>
        </button>
      ))}
    </div>
  );
});

// ---------------------------------------------------------------------------
// SEE ALL PIECES (Milestones overhaul, Part 2b) — the full view of every
// owned piece, organised by category (same top-to-bottom sequence as the
// main Ledger list), each category's pieces laid out as a horizontal ROW of
// tiles rather than a vertical list. Filters on top: by category AND by the
// sub-type tags from each piece's Layer 1 semantic data (Field Jacket,
// Chino, Oxford…). Tapping a piece opens the shared edit sheet.
// ---------------------------------------------------------------------------

function SeeAllTile({
  piece,
  material,
  subType,
  onEdit,
}: {
  piece: WardrobePiece;
  material: string;
  subType: string | null;
  onEdit: () => void;
}) {
  const sub = [subType || categoryLabel(piece.category), material || null].filter(Boolean).join(' · ');
  return (
    <button
      type="button"
      onClick={onEdit}
      className="w-[150px] sm:w-[168px] flex-shrink-0 bg-[var(--color-paper,#fbf8f1)] text-left flex flex-col group focus:outline-none focus:ring-1 focus:ring-inset focus:ring-[var(--color-accent,#a8712c)]"
      style={{ padding: '8px 8px 12px', gap: '7px', border: '1px solid var(--color-divider,rgba(59,43,29,0.18))' }}
      title={`Edit ${piece.name}`}
    >
      <CanonicalGarment
        fields={{ name: piece.name, category: piece.category, slot: piece.slot, colors: piece.colors, pattern: (piece as WardrobePiece & { pattern?: string | null }).pattern, brand: piece.brand }}
        photoUrl={piece.photo_url || null}
        pieceId={piece.id}
        title={piece.name}
        className="w-full aspect-[4/5]"
      />
      <span className="block min-w-0">
        <span className="block" style={pieceNameType}>
          {piece.name}
        </span>
        {piece.brand && (
          <span className="block truncate" style={{ ...pieceBrandType, marginTop: '2px' }}>
            {piece.brand}
          </span>
        )}
        <span className="block truncate" style={{ ...pieceMetaType, marginTop: '2px' }}>
          {sub || '\u2014'}
        </span>
      </span>
    </button>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`px-3 py-1.5 min-h-[36px] rounded-full ${typography.size.xs} border transition-colors whitespace-nowrap ${
        active
          ? 'bg-[var(--space-surface-accent-soft)] text-[var(--space-brand-primary-700)] border-[var(--space-brand-primary)]'
          : 'border-[var(--space-border-default)] text-[var(--space-text-secondary)] hover:border-[var(--space-border-strong)]'
      }`}
    >
      {children}
    </button>
  );
}

export function SeeAllPieces({
  pieces,
  materials = {},
  onBack,
  onChanged,
}: {
  pieces: WardrobePiece[];
  materials?: Record<number, string>;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [tags, setTags] = useState<Record<number, SemanticTags>>({});
  const [catFilter, setCatFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const editingPiece = editingId != null ? pieces.find((p) => p.id === editingId) || null : null;

  useEffect(() => {
    let live = true;
    const load = () => {
      void fetchSemanticTags().then((next) => {
        if (live) setTags(next);
      });
    };
    load();
    window.addEventListener('ethaion:semantics-updated', load);
    return () => {
      live = false;
      window.removeEventListener('ethaion:semantics-updated', load);
    };
  }, [pieces.length]);

  // The sub-type filter options — every distinct tag on an owned piece.
  const subTypes = useMemo(() => {
    const seen: string[] = [];
    for (const piece of pieces) {
      const t = tags[piece.id]?.subType;
      if (t && !seen.includes(t)) seen.push(t);
    }
    return seen.sort((a, b) => a.localeCompare(b));
  }, [pieces, tags]);

  const visible = useMemo(
    () =>
      pieces.filter(
        (p) =>
          (!catFilter || p.category === catFilter) &&
          (!typeFilter || (tags[p.id]?.subType || '') === typeFilter),
      ),
    [pieces, catFilter, typeFilter, tags],
  );

  // Category sections — same top-to-bottom sequence as the main Ledger list.
  const sections = WARDROBE_CATEGORIES.map((cat) => ({
    cat,
    catPieces: visible.filter((p) => p.category === cat.id),
  })).filter(({ catPieces }) => catPieces.length > 0);

  const ownedCategories = WARDROBE_CATEGORIES.filter((cat) => pieces.some((p) => p.category === cat.id));

  return (
    <div className="px-6 sm:px-10 py-8 max-w-[1180px] mx-auto w-full pb-28">
      <button
        type="button"
        onClick={onBack}
        className={`inline-flex items-center gap-1.5 ${typography.size.xs} ${typography.color.brand} hover:underline`}
      >
        <ArrowLeft className="w-3.5 h-3.5" /> The Ledger
      </button>

      <h3 className={`hab-page-title ${typography.color.primary} mt-3`} style={{ marginBottom: '10px' }}>
        All pieces
      </h3>
      <p className={typography.color.primary} style={{ fontFamily: 'var(--space-font-family)', fontSize: '15px', lineHeight: 1.6, maxWidth: '62ch', marginBottom: '20px' }}>
        Everything you own, category by category. Filter by category or by the kind of piece — tap any piece to edit
        it.
      </p>

      {/* Filters — category, then sub-type (the Layer 1 semantic tags). */}
      <div className="space-y-2.5 mb-7">
        <div className="flex gap-1.5 flex-wrap">
          <FilterChip active={catFilter === null} onClick={() => setCatFilter(null)}>
            All categories
          </FilterChip>
          {ownedCategories.map((cat) => (
            <FilterChip key={cat.id} active={catFilter === cat.id} onClick={() => setCatFilter(catFilter === cat.id ? null : cat.id)}>
              {cat.label}
            </FilterChip>
          ))}
        </div>
        {subTypes.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            <FilterChip active={typeFilter === null} onClick={() => setTypeFilter(null)}>
              All types
            </FilterChip>
            {subTypes.map((t) => (
              <FilterChip key={t} active={typeFilter === t} onClick={() => setTypeFilter(typeFilter === t ? null : t)}>
                {t}
              </FilterChip>
            ))}
          </div>
        )}
      </div>

      {sections.length === 0 && (
        <p className={`${typography.size.sm} ${typography.color.secondary} py-8`}>
          Nothing matches those filters — clear one and the rail refills.
        </p>
      )}

      <div className="space-y-10">
        {sections.map(({ cat, catPieces }) => (
          <section key={cat.id} aria-label={cat.label}>
            <div className="flex items-baseline justify-between gap-3 pb-2.5 border-b border-[var(--color-text,#3b2b1d)] mb-4">
              <h4 className={`hab-section-head ${typography.color.primary}`}>{cat.label}</h4>
              <span className="hab-kicker text-[var(--color-neutral-600,#856c51)] tabular-nums" style={{ letterSpacing: '0.14em' }}>
                {catPieces.length} piece{catPieces.length === 1 ? '' : 's'}
              </span>
            </div>
            {/* Horizontal ROW of tiles — scrolls sideways, never a vertical list. */}
            <div className="flex gap-2.5 overflow-x-auto pb-2" style={{ WebkitOverflowScrolling: 'touch' }}>
              {catPieces.map((piece) => (
                <SeeAllTile
                  key={piece.id}
                  piece={piece}
                  material={materialFor(piece, materials)}
                  subType={tags[piece.id]?.subType || null}
                  onEdit={() => setEditingId(piece.id)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {editingPiece && (
        <PieceEditSheet
          piece={editingPiece}
          material={materialFor(editingPiece, materials)}
          onClose={() => setEditingId(null)}
          onChanged={onChanged}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Item card — colour reveal on click/hover, tags, guarded delete
// ---------------------------------------------------------------------------

const ItemCard = memo(function ItemCard({
  piece,
  material = '',
  details,
  feedback,
  value,
  onDelete,
  onChanged,
}: {
  piece: WardrobePiece;
  /** Material(s) display string — shown in lighter text below the header, never in it. */
  material?: string;
  details?: PieceDetails;
  /** Post-purchase rating logged when this piece moved off the Radar. */
  feedback?: PurchaseFeedback;
  /** Cost-per-wear record (piece_value companion table, Pass Fifteen). */
  value?: PieceValue;
  onDelete: (id: number) => Promise<void>;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const colors = piece.colors || [];
  const seasons = piece.seasons || [];
  const occasions = piece.occasions || [];

  const doDelete = async () => {
    setDeleting(true);
    try {
      await onDelete(piece.id);
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  };

  return (
    <div
      className={`${tw.card.default} rounded-2xl overflow-hidden group transition-all ${expanded ? 'ring-2 ring-[var(--space-brand-primary-200)]' : ''}`}
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full text-left"
        title={expanded ? 'Close item details' : 'View and edit item details'}
      >
        {/* Mockup-matching tile (Pass Thirty-Three): the photo leads — the
            canonical white-card image full-width on top, caption below, so a
            category page reads as a clean grid of owned pieces. */}
        <CanonicalGarment
          fields={{ name: piece.name, category: piece.category, slot: piece.slot, colors: piece.colors, pattern: (piece as WardrobePiece & { pattern?: string | null }).pattern, brand: piece.brand }}
          photoUrl={piece.photo_url || null}
          pieceId={piece.id}
          title={piece.name}
          showConfirmation
          className="w-full aspect-square"
        />
        <div className="p-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              {/* Three-tier piece typography (piece-typography.ts): name leads,
                  brand follows in accent, fabric stays muted. The initials-box
                  mark stays retired app-wide — plain text only. */}
              <p className="leading-snug" style={pieceNameType}>
                {piece.name}
              </p>
              {piece.brand && (
                <p className="truncate" style={{ ...pieceBrandType, marginTop: '2px' }}>{piece.brand}</p>
              )}
              {material && (
                <span className="block mt-0.5" style={pieceMetaType}>
                  <FabricLabel material={material} />
                </span>
              )}
              {costPerWearLabel(value) && (
                <p className={`${typography.size.xs} ${typography.color.muted} mt-0.5`} style={{ fontSize: '10px' }}>
                  {costPerWearLabel(value)}
                </p>
              )}
            </div>
            {/* No colour indicator on a piece row — pieces are uncoloured
                everywhere they are listed; the recorded colourways read as
                named swatches inside the piece's own detail view. */}
          </div>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {seasons.map((s) => (
              <TagPill key={s}>{seasonLabel(s)}</TagPill>
            ))}
            {occasions.map((o) => (
              <TagPill key={o} tone="brand">{occasionTagLabel(o)}</TagPill>
            ))}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-3 border-t border-[var(--space-border-default)] bg-[var(--space-surface-muted)] space-y-3">
          {!editing ? (
            <>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="space-y-1.5">
                  {/* The logged colourways, NAMED — a piece is never given a
                      colour swatch or fill anywhere it is displayed; the
                      coloured chips belong to the colour PICKER, where the
                      user is choosing one (Recommendation Engine overhaul,
                      Part 2). */}
                  {colors.length > 0 ? (
                    <p className={`${typography.size.xs} ${typography.color.primary} capitalize`}>
                      {colors.join(' · ')}
                    </p>
                  ) : <p className={`${typography.size.xs} ${typography.color.muted}`}>No colour logged yet.</p>}
                  {(details?.size || details?.notes) && (
                    <p className={`${typography.size.xs} ${typography.color.secondary}`}>
                      {details?.size ? `Size ${details.size}` : ''}{details?.size && details?.notes ? ' · ' : ''}{details?.notes || ''}
                    </p>
                  )}
                  <FeedbackNote feedback={feedback} />
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${typography.size.xs} ${tw.button.secondary}`}
                  >
                    Edit every detail
                  </button>
                  {/* See it on YOU — opens the Fitting Room with this piece. */}
                  {(piece.photo_url || '').trim() && (
                    <TryOnButton
                      piece={{
                        name: piece.name,
                        brand: piece.brand,
                        category: piece.category,
                        garmentImageUrl: piece.photo_url,
                      }}
                    />
                  )}
                </div>
              </div>
              <CarePanel piece={piece} material={material} />
            </>
          ) : (
            <div className="rounded-xl border border-[var(--space-border-default)] bg-[var(--space-surface-card)] p-3">
              {/* The ONE shared editor (Pass Fourteen): structured colour /
                  pattern / material / size selectors, progressive disclosure,
                  auto-generated name, photo thumbnail with replace. */}
              <PieceEditForm
                piece={piece}
                material={material}
                onSaved={onChanged}
                onClose={() => setEditing(false)}
                allowDelete={false}
              />
              <button type="button" onClick={() => setEditing(false)} className={`mt-2 px-3 py-1.5 rounded-lg ${typography.size.xs} ${tw.button.ghost}`}>
                Cancel
              </button>
            </div>
          )}
          <div className="flex justify-end">
            {!confirming ? (
              <button type="button" onClick={() => setConfirming(true)} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg ${typography.size.xs} ${tw.button.ghost} border border-[var(--space-border-default)]`}>
                <Trash2 className="w-3 h-3" /> Remove
              </button>
            ) : (
              <span className="inline-flex items-center gap-2">
                <span className={`${typography.size.xs} ${typography.color.primary}`}>Remove “{piece.name}”?</span>
                <button type="button" onClick={doDelete} disabled={deleting} className={`px-2.5 py-1 rounded-lg ${typography.size.xs} ${tw.button.danger} inline-flex items-center gap-1 disabled:opacity-50`}>
                  {deleting && <Loader2 className="w-3 h-3 animate-spin" />} Yes, remove
                </button>
                <button type="button" onClick={() => setConfirming(false)} className={`px-2.5 py-1 rounded-lg ${typography.size.xs} ${tw.button.ghost} border border-[var(--space-border-default)]`}>Keep</button>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Category sub-page
// ---------------------------------------------------------------------------

export function CategoryPage({
  categoryId,
  pieces,
  materials = {},
  details = {},
  onBack,
  onDelete,
  onAdded,
  addPanel,
}: {
  categoryId: string;
  pieces: WardrobePiece[];
  /** piece id → material display string (piece_materials companion table). */
  materials?: Record<number, string>;
  details?: Record<number, PieceDetails>;
  onBack: () => void;
  onDelete: (id: number) => Promise<void>;
  onAdded: () => void;
  /** The unified add hub (photo-required since Pass Thirty-Three) — injected
   * by App so this category's “Add a piece” runs the same photograph →
   * AI-extract → confirm flow as the main wardrobe log. */
  addPanel?: React.ReactNode;
}) {
  const [movingId, setMovingId] = useState<number | null>(null);
  // Close-the-loop: set when a Radar entry is marked owned from this page.
  const [feedbackFor, setFeedbackFor] = useState<WardrobePiece | null>(null);
  // Radar entries in this category — the convinced-but-not-bought pieces are
  // shown alongside the owned ones, so a category page is the full picture.
  const { data: radarRows, refresh: refreshRadar } = window.useWorkspaceDB<RadarItem>('radar_items', {
    orderBy: { column: 'created_at', direction: 'desc' },
    limit: 100,
  });
  // Post-purchase ratings — shown on each piece's detail ("You rated this…").
  const { data: feedbackRows, refresh: refreshFeedback } = window.useWorkspaceDB<PurchaseFeedback>('purchase_feedback', {
    orderBy: { column: 'created_at', direction: 'asc' },
    limit: 200,
  });
  const feedbackMap = useMemo(() => {
    const map: Record<number, PurchaseFeedback> = {};
    for (const row of feedbackRows || []) if (row.piece_id != null) map[Number(row.piece_id)] = row;
    return map;
  }, [feedbackRows]);
  // Cost-per-wear records (Pass Fifteen) — shown on each piece card.
  const [values, setValues] = useState<Record<number, PieceValue>>({});
  useEffect(() => {
    fetchPieceValues().then(setValues).catch(() => undefined);
  }, [pieces.length]);
  const cat = categoryById(categoryId);
  if (!cat) return null;
  const catPieces = pieces.filter((p) => p.category === cat.id);
  const catRadar = (radarRows || []).filter((r) => r.category === cat.id);

  const ownRadarItem = async (item: RadarItem) => {
    if (movingId != null) return;
    setMovingId(item.id);
    try {
      const created = await radarToWardrobe(item);
      refreshRadar();
      onAdded();
      // Close the loop: "You got it — how was it?"
      if (created) setFeedbackFor(created);
    } finally {
      setMovingId(null);
    }
  };

  return (
    <div className="px-6 py-8 space-y-8 max-w-5xl mx-auto w-full pb-28">
      <div>
        <button
          type="button"
          onClick={onBack}
          className={`inline-flex items-center gap-1.5 ${typography.size.xs} ${typography.color.brand} hover:underline`}
        >
          <ArrowLeft className="w-3.5 h-3.5" /> All categories
        </button>
        <div className="flex items-end justify-between gap-3 mt-2 flex-wrap">
          <div>
            <h3 className={`${typography.size['2xl']} ${typography.weight.semibold} ${typography.color.primary}`}>
              {cat.label}
            </h3>
            <p className={`${typography.size.xs} ${typography.color.muted} mt-0.5`}>
              {catPieces.length > 0
                ? 'Tap a card to view, edit or care for a piece.'
                : 'Nothing filed here yet — photograph a piece or search for it below.'}
            </p>
          </div>
          {/* Price filters moved out of the Wardrobe tab — they live in Curated
              (per session) and Your Style (the defaults). The old "Add a
              piece" toggle button is retired (Pass Forty-Seven): the two-pill
              tab switcher below is always visible. */}
        </div>
      </div>

      {/* Purchase close-the-loop — appears right after "I own it now" */}
      {feedbackFor && (
        <PurchaseFeedbackPrompt
          piece={feedbackFor}
          onDone={() => {
            setFeedbackFor(null);
            refreshFeedback();
          }}
        />
      )}

      {/* Category-scoped add flow (Pass Forty-Seven) — the SAME two-pill
          tab switcher as the Wardrobe screen and The Rail, always visible at
          the top of the category view: Photograph opens the camera directly,
          Search (now present here too) shows the keyword/URL input. */}
      {addPanel}

      {/* The old greyscale "staples" board (owned = colour, unowned = a gap
          to fill) is gone from the inventory: coverage is Beau's judgement
          and it lives in The Edit tab's Coverage Map. */}

      {/* On the Radar in this category — decided on, not bought yet */}
      {catRadar.length > 0 && (
        <div>
          <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
            <p className={`${typography.size.xs} uppercase tracking-wide ${typography.weight.medium} ${typography.color.secondary}`}>
              On the Reserve · {catRadar.length}
            </p>
            <button
              type="button"
              onClick={() => goToTab('radar')}
              className={`${typography.size.xs} ${typography.color.brand} hover:underline`}
            >
              Open the Reserve →
            </button>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {catRadar.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-dashed border-[var(--space-border-strong)] bg-[var(--space-surface-card)] p-3 flex items-start gap-3"
              >
                <div className="w-20 h-20 bg-[#eadfcb] flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {/* Uncoloured — pieces carry no colour treatment anywhere. */}
                  <Illo
                    id={item.slot || item.category || 'generic'}
                    name={item.name}
                    title={item.name}
                    showLabel={false}
                    className="w-16 h-16"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  {/* Three-tier piece typography: name · brand. */}
                  <p className="leading-snug" style={pieceNameType}>
                    {item.name}
                  </p>
                  {item.brand && (
                    <p className="truncate" style={{ ...pieceBrandType, marginTop: '2px' }}>
                      {item.brand}
                    </p>
                  )}
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    <span className={`${tw.badge.default} ${tw.badge.primary} inline-flex items-center gap-1`} style={{ fontSize: '10px' }}>
                      Watching
                    </span>
                    {item.color && <TagPill>{item.color}</TagPill>}
                    {item.size && <TagPill>Size {item.size}</TagPill>}
                    {item.price_seen && <TagPill>{item.price_seen}</TagPill>}
                  </div>
                  <button
                    type="button"
                    onClick={() => void ownRadarItem(item)}
                    disabled={movingId != null}
                    className={`mt-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg ${typography.size.xs} ${tw.button.primary} disabled:opacity-50`}
                    title="Bought it — file it into the wardrobe tracker"
                  >
                    {movingId === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                    I own it now
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Logged pieces */}
      <div>
        <p className={`${typography.size.xs} uppercase tracking-wide ${typography.weight.medium} ${typography.color.secondary} mb-2`}>
          Your pieces
        </p>
        {catPieces.length > 0 ? (
          /* Mockup grid (Pass Thirty-Five): owned pieces render 2 per row as
             square cards with rounded corners. */
          <div className="grid grid-cols-2 gap-3">
            {catPieces.map((piece) => (
              <ItemCard
                key={piece.id}
                piece={piece}
                material={materialFor(piece, materials)}
                details={details[piece.id]}
                feedback={feedbackMap[piece.id]}
                value={values[piece.id]}
                onDelete={onDelete}
                onChanged={onAdded}
              />
            ))}
          </div>
        ) : (
          /* Empty state (Pass Forty-Seven) — the Photograph | Search pills
             at the top of this page are the way in, so this is a quiet,
             non-interactive hint rather than a second button. */
          <div className="w-full rounded-2xl border border-dashed border-[var(--space-border-strong)] bg-[var(--space-surface-card)] px-6 py-10 text-center">
            <span className="mx-auto w-12 h-12 rounded-full bg-[var(--space-surface-accent-soft)] flex items-center justify-center">
              <Camera className="w-5 h-5 text-[var(--space-text-brand)]" />
            </span>
            <span className={`block ${typography.size.sm} ${typography.weight.medium} ${typography.color.primary} mt-3`}>
              Nothing logged here yet
            </span>
            <span className={`block ${typography.size.xs} ${typography.color.muted} mt-1`}>
              Use Photograph or Search at the top of this page — Beau fills in the details and you just confirm.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Duplicate review — likely duplicates among entries ALREADY logged, shown
// side by side; the user decides which details to keep (never auto-merged).
// Exact-name copies are auto-merged by the load-time audit before this runs.
// ---------------------------------------------------------------------------

const DUPE_DISMISSED_KEY = 'brummell_dupe_dismissed';

function loadDismissedPairs(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(DUPE_DISMISSED_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function DupeSide({
  piece,
  material,
  busy,
  onKeep,
}: {
  piece: WardrobePiece;
  material?: string;
  busy: boolean;
  onKeep: () => void;
}) {
  return (
    <div className="flex-1 min-w-[12rem] rounded-xl border border-[var(--space-border-default)] bg-[var(--space-surface-card)] p-3">
      <div className="flex items-start gap-2.5">
        <CanonicalGarment
          fields={{ name: piece.name, category: piece.category, slot: piece.slot, colors: piece.colors, pattern: (piece as WardrobePiece & { pattern?: string | null }).pattern, brand: piece.brand }}
          photoUrl={piece.photo_url || null}
          pieceId={piece.id}
          title={piece.name}
          showConfirmation
          className="w-16 aspect-[3/4] rounded-lg flex-shrink-0"
        />
        <div className="min-w-0">
          {/* Three-tier piece typography: name · brand · fabric. */}
          <p className="leading-snug" style={pieceNameType}>
            {piece.name}
          </p>
          {piece.brand && (
            <p className="truncate" style={{ ...pieceBrandType, marginTop: '2px' }}>
              {piece.brand}
            </p>
          )}
          {material && (
            <span className="block" style={pieceMetaType}>
              <FabricLabel material={material} />
            </span>
          )}
          <div className="flex flex-wrap gap-1 mt-1">
            {(piece.seasons || []).map((s) => (
              <TagPill key={s}>{seasonLabel(s)}</TagPill>
            ))}
            {(piece.occasions || []).map((o) => (
              <TagPill key={o} tone="brand">{occasionTagLabel(o)}</TagPill>
            ))}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={onKeep}
        disabled={busy}
        className={`mt-2.5 w-full px-3 py-1.5 rounded-lg ${typography.size.xs} ${tw.button.secondary} disabled:opacity-50 inline-flex items-center justify-center gap-1.5`}
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
        Keep this one’s details
      </button>
    </div>
  );
}

/**
 * Surfaces one likely-duplicate pair at a time with both entries side by
 * side. "Keep this one's details" merges the other into it (union of tags
 * and colours, brand kept); "They're different" dismisses the pair for good.
 */
export function DuplicateReviewCard({
  pieces,
  materials = {},
  onChanged,
}: {
  pieces: WardrobePiece[];
  materials?: Record<number, string>;
  onChanged: () => void;
}) {
  const [dismissed, setDismissed] = useState<string[]>(loadDismissedPairs);
  const [busy, setBusy] = useState(false);

  const pairs = useMemo(
    () => findExistingDuplicatePairs(pieces).filter((p) => !dismissed.includes(dupePairKey(p.a, p.b))),
    [pieces, dismissed],
  );
  if (pairs.length === 0) return null;
  const pair = pairs[0];
  const key = dupePairKey(pair.a, pair.b);

  const dismiss = () => {
    const next = [...dismissed, key];
    setDismissed(next);
    try {
      localStorage.setItem(DUPE_DISMISSED_KEY, JSON.stringify(next));
    } catch { /* storage unavailable */ }
  };

  const merge = async (keep: WardrobePiece, remove: WardrobePiece) => {
    if (busy) return;
    setBusy(true);
    try {
      await mergePieces(keep, remove, materials);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`${tw.card.default} rounded-2xl p-4 border-[var(--space-brand-primary-200)]`}>
      <div className="flex items-center gap-2">
        <Copy className={`w-4 h-4 ${tw.icon.primary}`} />
        <h3 className={`${typography.size.base} ${typography.weight.semibold} ${typography.color.primary}`}>
          These two look like the same piece
        </h3>
      </div>
      <p className={`${typography.size.xs} ${typography.color.muted} mt-0.5`}>
        Pick which entry’s details to keep — the tags and colours of both are folded together either way.
        {pairs.length > 1 ? ` ${pairs.length - 1} more pair${pairs.length > 2 ? 's' : ''} to review after this one.` : ''}
      </p>
      <div className="flex gap-3 mt-3 flex-wrap">
        <DupeSide piece={pair.a} material={materialFor(pair.a, materials)} busy={busy} onKeep={() => void merge(pair.a, pair.b)} />
        <DupeSide piece={pair.b} material={materialFor(pair.b, materials)} busy={busy} onKeep={() => void merge(pair.b, pair.a)} />
      </div>
      <div className="flex justify-end mt-2.5">
        <button
          type="button"
          onClick={dismiss}
          disabled={busy}
          className={`px-3 py-1.5 rounded-lg ${typography.size.xs} ${tw.button.ghost} border border-[var(--space-border-default)]`}
        >
          They’re different — keep both
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add what you own — bulk text (AI-parsed) + list import. RETIRED from the
// logging UI in Pass Thirty-Three: logging an owned piece now requires a
// photograph (see ./add-piece). No surface renders this any more; it is kept
// only as an unused reference implementation.
// ---------------------------------------------------------------------------

/** One parsed piece awaiting confirmation, with its duplicate check. */
export interface PreviewEntry {
  /** Stable identity for React keys — NEVER the (editable) name: name-based
   * keys remounted the card on every keystroke, dismissing the keyboard
   * after the first character (the Pass Fourteen keyboard bug). */
  uid: number;
  piece: NewPiece;
  /** Existing tracker piece this probably duplicates, if any. */
  duplicateOf: WardrobePiece | null;
  /** Set once the user answers the duplicate prompt (“it's different”). */
  duplicateDismissed: boolean;
}

let previewEntryUid = 0;

function PreviewCard({
  entry,
  onChange,
  onRemove,
}: {
  entry: PreviewEntry;
  onChange: (next: PreviewEntry) => void;
  onRemove: () => void;
}) {
  const [showCats, setShowCats] = useState(false);
  const { piece } = entry;
  const showDupePrompt = !!entry.duplicateOf && !entry.duplicateDismissed;
  const onChangeCategory = (categoryId: string) =>
    onChange({ ...entry, piece: { ...piece, category: categoryId, slot: null } });
  return (
    <div className="rounded-xl border border-[var(--space-border-default)] bg-[var(--space-surface-card)] p-2.5">
      <div className="flex items-start gap-2.5">
        <CanonicalGarment
          fields={{ name: piece.name, category: piece.category, slot: piece.slot, colors: piece.colors, pattern: piece.pattern, brand: piece.brand }}
          title={piece.name}
          showConfirmation
          className="w-12 aspect-[3/4] rounded-lg flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          {/* Three-tier piece typography: name · brand · fabric. */}
          <p className="leading-snug" style={pieceNameType}>
            {piece.name}
          </p>
          {piece.brand && (
            <p className="truncate" style={{ ...pieceBrandType, marginTop: '2px' }}>
              {piece.brand}
            </p>
          )}
          {piece.material && (
            <span className="block" style={pieceMetaType}>
              <FabricLabel material={piece.material} />
            </span>
          )}
          <div className="flex items-center flex-wrap gap-1.5 mt-1">
            <button
              type="button"
              onClick={() => setShowCats((s) => !s)}
              className={`${tw.badge.default} ${tw.badge.primary} inline-flex items-center gap-1`}
              style={{ fontSize: '10px' }}
              title="Change category"
            >
              {categoryLabel(piece.category)}
            </button>
            <ColorNames colors={piece.colors || []} />
            {(piece.seasons || []).map((s) => (
              <TagPill key={s}>{seasonLabel(s)}</TagPill>
            ))}
          </div>
          {showCats && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {WARDROBE_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    onChangeCategory(c.id);
                    setShowCats(false);
                  }}
                  className={`px-2 py-0.5 rounded-full border transition-colors ${typography.size.xs} ${
                    piece.category === c.id
                      ? 'bg-[var(--space-surface-accent-soft)] text-[var(--space-brand-primary-700)] border-[var(--space-brand-primary)]'
                      : 'border-[var(--space-border-default)] text-[var(--space-text-secondary)] hover:border-[var(--space-border-strong)]'
                  }`}
                  style={{ fontSize: '10px' }}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
          {/* Edit-before-saving essentials (Pass Twelve): brand and size are
              always present on the confirm card. */}
          <div className="grid sm:grid-cols-2 gap-2 mt-2">
            <label className={`${typography.size.xs} ${typography.color.muted}`} style={{ fontSize: '10px' }}>
              Brand
              <div className="mt-0.5">
                <BrandField
                  value={piece.brand || ''}
                  onChange={(next) => onChange({ ...entry, piece: { ...piece, brand: next || null } })}
                  placeholder="e.g. Barbour"
                  ariaLabel={`Brand for ${piece.name}`}
                />
              </div>
            </label>
            <label className={`${typography.size.xs} ${typography.color.muted}`} style={{ fontSize: '10px' }}>
              Size
              <div className="mt-0.5">
                <SizeSelector
                  value={piece.size || ''}
                  onChange={(next) => onChange({ ...entry, piece: { ...piece, size: next || null } })}
                  ariaLabel={`Size for ${piece.name}`}
                />
              </div>
            </label>
          </div>
          {/* Proactive dedup: a merge prompt, never silent duplication */}
          {showDupePrompt && entry.duplicateOf && (
            <div className="mt-2 rounded-lg bg-[var(--space-surface-accent-soft)] px-2.5 py-2">
              <p className={`${typography.size.xs} ${typography.color.secondary}`}>
                This looks like “{entry.duplicateOf.name}” — do you already have this logged?
              </p>
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={onRemove}
                  className={`px-2 py-1 rounded-lg ${typography.size.xs} ${tw.button.secondary}`}
                >
                  Merge — keep the existing one
                </button>
                <button
                  type="button"
                  onClick={() => onChange({ ...entry, duplicateDismissed: true })}
                  className={`px-2 py-1 rounded-lg ${typography.size.xs} ${tw.button.ghost} border border-[var(--space-border-default)]`}
                >
                  Keep both — it’s different
                </button>
              </div>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="p-1 rounded-lg hover:bg-[var(--space-surface-muted)] text-[var(--space-text-muted)] flex-shrink-0"
          aria-label={`Remove ${piece.name} from the list`}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export function AddWhatYouOwn({
  onAdded,
  categoryId,
  pieces = [],
}: {
  onAdded: () => void;
  categoryId?: string;
  /** Already-owned pieces, for the proactive duplicate check. */
  pieces?: WardrobePiece[];
}) {
  const scopedCat = categoryId ? categoryById(categoryId) : null;
  const [text, setText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<PreviewEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // CSV / Excel import (Pass Eleven restoration) — previously-tracked lists
  // flow through the SAME parse-preview-confirm pipeline as typed text.
  const listInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const onListPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (listInputRef.current) listInputRef.current.value = '';
    if (!file || importing || parsing) return;
    setImporting(true);
    setError(null);
    try {
      const lower = (file.name || '').toLowerCase();
      if (lower.endsWith('.pdf') || file.type === 'application/pdf') {
        setError('For wardrobe imports use CSV or Excel (.xlsx) — export the PDF as one of those and try again.');
        return;
      }
      const fileText = await documentToText(file);
      if (!fileText || !fileText.trim()) {
        setError('Couldn\u2019t read that file — CSV and Excel (.xlsx) work best.');
        return;
      }
      const { pieces: parsed } = await parseBulkText(fileText.slice(0, 6000));
      if (parsed.length === 0) {
        setError('Couldn\u2019t make out any garments in that file — check it lists one piece per row.');
        return;
      }
      const scoped = scopedCat
        ? parsed.map((p) => (p.category === 'other' ? { ...p, category: scopedCat.id } : p))
        : parsed;
      setPreview((cur) => [
        ...cur,
        ...scoped.map((piece) => ({
          uid: ++previewEntryUid,
          piece,
          duplicateOf: findLikelyDuplicate(piece, pieces),
          duplicateDismissed: false,
        })),
      ]);
    } catch (err) {
      console.error('[Ethaion] wardrobe list import failed:', err);
      setError('That file didn\u2019t import — try CSV or Excel (.xlsx).');
    } finally {
      setImporting(false);
    }
  };

  const parse = async () => {
    if (!text.trim() || parsing) return;
    setParsing(true);
    setError(null);
    try {
      const { pieces: parsed } = await parseBulkText(text);
      if (parsed.length === 0) {
        setError('Couldn\u2019t make out any garments — try naming the pieces, e.g. \u201cnavy chinos brown loafers\u201d.');
      } else {
        // Category-scoped flow: anything the parser couldn't place is filed here.
        const scoped = scopedCat
          ? parsed.map((p) => (p.category === 'other' ? { ...p, category: scopedCat.id } : p))
          : parsed;
        setPreview((cur) => [
          ...cur,
          ...scoped.map((piece) => ({
            uid: ++previewEntryUid,
            piece,
            duplicateOf: findLikelyDuplicate(piece, pieces),
            duplicateDismissed: false,
          })),
        ]);
        setText('');
      }
    } finally {
      setParsing(false);
    }
  };

  const addAll = async () => {
    if (preview.length === 0 || saving) return;
    setSaving(true);
    try {
      // Text-added pieces carry no photo — the card renders its recoloured
      // category template; distinctive pieces get a product-photo lookup on
      // the next wardrobe load.
      await insertPieces(preview.map(({ piece }) => ({ ...piece, photo_url: null })));
      setPreview([]);
      onAdded();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`${tw.card.default} rounded-2xl p-4`}>
      <h3 className={`${typography.size.base} ${typography.weight.semibold} ${typography.color.primary}`}>
        {scopedCat ? `Quick add to ${scopedCat.label}` : 'Quick add'}
      </h3>
      <p className={`${typography.size.xs} ${typography.color.muted} mt-0.5`}>
        {scopedCat
          ? `Type the piece${scopedCat.slots.length > 0 ? ` — e.g. \u201c${scopedCat.slots[0].label.toLowerCase()}\u201d` : ''}; correct the card before adding.`
          : 'Type it all in one go, just as it comes to mind — Ethaion tidies it up. “ocbd blue white pink barbour bedale navy chinos” becomes clean, categorised cards. Tracked your wardrobe elsewhere? Upload the CSV or Excel file and it imports the same way.'}
      </p>

      <div className="flex gap-2 mt-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void parse();
            }
          }}
          placeholder="e.g. ocbd blue white pink john partridge wax jacket navy chinos"
          rows={2}
          className={`${tw.input.base} ${tw.input.default} ${typography.size.sm} flex-1 resize-none`}
        />
      </div>
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <button
          type="button"
          onClick={() => void parse()}
          disabled={!text.trim() || parsing}
          className={`px-4 py-2 rounded-lg ${typography.size.sm} flex items-center gap-1.5 ${tw.button.primary} disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          {parsing && <Loader2 className="w-4 h-4 animate-spin" />}
          {parsing ? 'Reading\u2026' : 'Sort it out'}
        </button>
        <button
          type="button"
          onClick={() => listInputRef.current?.click()}
          disabled={parsing || importing}
          className={`px-3 py-2 rounded-lg ${typography.size.sm} flex items-center gap-1.5 ${tw.button.secondary} disabled:opacity-40`}
          title="Import a previously-tracked wardrobe list — CSV or Excel (.xlsx)"
        >
          {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
          {importing ? 'Reading your list\u2026' : 'Upload a list'}
        </button>
        <input
          ref={listInputRef}
          type="file"
          accept=".csv,.tsv,.txt,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => void onListPicked(e)}
          className="hidden"
          aria-label="Upload a wardrobe list — CSV or Excel"
        />
      </div>

      {error && (
        <p className={`${typography.size.xs} text-[var(--space-semantic-warning)] mt-2`}>{error}</p>
      )}

      {!text.trim() && preview.length === 0 && !scopedCat && (
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {OWN_SUGGESTIONS.slice(0, 3).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setText(s)}
              className={`px-2 py-0.5 rounded-full ${typography.size.xs} border border-[var(--space-border-default)] ${typography.color.muted} hover:border-[var(--space-border-strong)] hover:text-[var(--space-text-primary)] transition-colors`}
            >
              + {s}
            </button>
          ))}
        </div>
      )}

      {/* Parsed preview — clean cards, not a raw text dump */}
      {preview.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className={`${typography.size.xs} ${typography.color.secondary}`}>
            Here’s how I’d file {preview.length === 1 ? 'it' : 'them'} — correct anything before adding:
          </p>
          {preview.map((entry, idx) => (
            <PreviewCard
              key={entry.uid}
              entry={entry}
              onChange={(next) => setPreview((cur) => cur.map((e, i) => (i === idx ? next : e)))}
              onRemove={() => setPreview((cur) => cur.filter((_, i) => i !== idx))}
            />
          ))}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => void addAll()}
              disabled={saving}
              className={`px-4 py-2 rounded-lg ${typography.size.sm} flex items-center gap-1.5 ${tw.button.primary} disabled:opacity-50`}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add {preview.length} piece{preview.length === 1 ? '' : 's'} to my wardrobe
            </button>
            <button
              type="button"
              onClick={() => setPreview([])}
              className={`px-3 py-2 rounded-lg ${typography.size.xs} ${tw.button.ghost} border border-[var(--space-border-default)]`}
            >
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Keyword search across the wardrobe (Pass Fourteen, Track J) — a search bar
// on the wardrobe home. Matches name, brand, category, colour(s), material
// and pattern; filters in real time, in place: while a query is typed the
// category grid (passed as children) is swapped for the matching pieces.
// ---------------------------------------------------------------------------

export function WardrobeSearch({
  pieces,
  materials = {},
  details = {},
  attributes = {},
  onDelete,
  onChanged,
  children,
}: {
  pieces: WardrobePiece[];
  materials?: Record<number, string>;
  details?: Record<number, PieceDetails>;
  /** piece id → pattern / name provenance (piece_attributes companion table). */
  attributes?: Record<number, PieceAttributes>;
  onDelete: (id: number) => Promise<void>;
  onChanged: () => void;
  /** The normal wardrobe content (category grid) — shown when not searching. */
  children: React.ReactNode;
}) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  const matches = useMemo(() => {
    if (!q) return [];
    const tokens = q.split(/\s+/).filter(Boolean);
    return pieces.filter((piece) => {
      const haystack = [
        piece.name,
        piece.brand || '',
        categoryLabel(piece.category),
        piece.category,
        (piece.colors || []).join(' '),
        materialFor(piece, materials),
        patternLabel(attributes[piece.id]?.pattern),
        attributes[piece.id]?.pattern || '',
      ]
        .join(' ')
        .toLowerCase();
      return tokens.every((t) => haystack.includes(t));
    });
  }, [q, pieces, materials, attributes]);

  return (
    <div>
      {pieces.length > 0 && (
        <div className="relative mb-3">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--space-text-muted)] pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your wardrobe — name, brand, colour, material, pattern…"
            className={`${tw.input.base} ${tw.input.default} ${typography.size.sm} pl-9 pr-9`}
            aria-label="Search your wardrobe"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-lg text-[var(--space-text-muted)] hover:text-[var(--space-text-primary)]"
              aria-label="Clear the search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {!q ? (
        children
      ) : matches.length > 0 ? (
        <div>
          <p className={`${typography.size.xs} ${typography.color.muted} mb-2`}>
            {matches.length} piece{matches.length === 1 ? '' : 's'} match{matches.length === 1 ? 'es' : ''} “{query.trim()}”
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {matches.map((piece) => (
              <ItemCard
                key={piece.id}
                piece={piece}
                material={materialFor(piece, materials)}
                details={details[piece.id]}
                onDelete={onDelete}
                onChanged={onChanged}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-8">
          <Search className="w-6 h-6 mx-auto text-[var(--space-text-muted)]" />
          <p className={`${typography.size.sm} ${typography.color.primary} font-medium mt-2`}>
            No pieces match “{query.trim()}”
          </p>
          <button
            type="button"
            onClick={() => setQuery('')}
            className={`mt-2 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg ${typography.size.xs} ${tw.button.secondary}`}
          >
            <X className="w-3 h-3" /> Clear the search
          </button>
        </div>
      )}
    </div>
  );
}
