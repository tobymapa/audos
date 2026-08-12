/**
 * Ethaion — On the Radar (v8, Pass Forty-Two — back on the tab bar).
 *
 * The watch-list stage before Wardrobe (owned):
 * the "convinced but not buying yet" layer. Each entry is a SPECIFIC piece —
 * exact model name, colour, size — with notes, an optional product URL and
 * last-seen price, and price-drop / restock watch flags.
 *
 * The Radar is a TABLE, not a card grid. Columns (Pass Forty-Two):
 * Piece · Brand · Price · Change · Added · › — the Change column shows the
 * last recorded price move as a delta figure (oxblood for an increase,
 * green for a drop). Tapping a row opens an expanded detail area with the
 * category, size, notes, watch toggles and the pipeline moves.
 *
 * Movement:
 *  - "I own it now"  → files the piece into the wardrobe tracker (owned).
 *
 * Watching: with a product URL on file, entries with a watch toggle on are
 * re-checked automatically when the Radar opens (stale ones first, a few per
 * visit) and on demand via "Check it now". Price moves and restocks surface
 * in the Price drops strip at the top of the tab.
 */
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { HairlineRowsSkeleton } from './skeleton';
import { tw, typography } from '../../lib/colors';
import { pieceBrandType, pieceMetaType, pieceNameType } from './piece-typography';
import {
  RESERVE_CHANGED_EVENT,
  WARDROBE_CATEGORIES,
  categoryLabel,
  deleteRadarItem,
  insertRadarItem,
  radarToWardrobe,
  updateRadarItem,
  type RadarItem,
  type WardrobePiece,
} from './profile-data';
import { extractFromUrl } from './discovery-ai';
import { isTransparentCutout, prepareProductPhoto } from './photo-enhance';
import { BrandField, ColorSelector, SizeSelector } from './input-fields';
import { PurchaseFeedbackPrompt } from './feedback';
import { TryOnButton } from './tryon';

function formatDate(iso?: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// RESERVE DATA CACHE (tab-switch performance fix) — the last fetched rows
// live at MODULE level with a timestamp, so returning to this tab (or
// remounting it) paints the watch list INSTANTLY from cache — no loading
// state when data already exists. A background refresh runs only when the
// data is STALE (older than 60 seconds) or a mutation has occurred; the
// mutation paths below already call refresh() themselves.
// ---------------------------------------------------------------------------

const RESERVE_STALE_MS = 60_000;
let reserveCache: { rows: RadarItem[]; at: number } | null = null;

export function reserveCacheIsFresh(): boolean {
  return !!reserveCache && Date.now() - reserveCache.at < RESERVE_STALE_MS;
}

/**
 * Re-read one watched entry's product page and record the outcome.
 * Detects price moves against price_seen and restocks (a price reappearing
 * after a "possibly sold out" check). Returns the recorded note.
 */
async function checkRadarItem(item: RadarItem): Promise<string> {
  const { draft } = await extractFromUrl(item.product_url as string, null);
  const now = new Date().toISOString();
  const wasOut = !!item.last_check_note && /sold out|no price visible/i.test(item.last_check_note);
  let note: string;
  if (!draft) {
    note = 'Couldn\u2019t read the page \u2014 it may be down or blocking readers. Ask Beau in chat to double-check.';
  } else if (draft.price && wasOut) {
    note = `Back in stock at ${draft.price} (checked ${new Date().toLocaleDateString()})`;
  } else if (draft.price && item.price_seen && draft.price.trim() !== item.price_seen.trim()) {
    note = `Price moved: ${item.price_seen} \u2192 ${draft.price} (checked ${new Date().toLocaleDateString()})`;
  } else if (draft.price) {
    note = `Still ${draft.price} \u2014 no change.`;
  } else {
    note = 'Page read, but no price visible \u2014 possibly sold out. Restock watch is worth keeping on.';
  }
  await updateRadarItem(item.id, {
    last_checked_at: now,
    last_check_note: note,
    ...(draft?.price ? { price_seen: draft.price } : {}),
  });
  return note;
}

/** True when a recorded check note is worth shouting about. */
function isAlertNote(note?: string | null): boolean {
  return !!note && /price moved|back in stock/i.test(note);
}

/**
 * The Change column (Pass Forty-Two): parse the last recorded
 * "Price moved: £249 → £189 (checked …)" note into a signed delta figure.
 * Returns null when no price move is on record.
 */
function priceChange(item: RadarItem): { text: string; up: boolean } | null {
  const match = (item.last_check_note || '').match(/price moved:\s*([^\u2192]+)\u2192([^(]+)/i);
  if (!match) return null;
  const num = (s: string) => {
    const cleaned = s.replace(/[^0-9.]/g, '');
    return cleaned ? parseFloat(cleaned) : NaN;
  };
  const from = num(match[1]);
  const to = num(match[2]);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return null;
  const currency = (match[2].match(/[\u00a3$\u20ac]/) || match[1].match(/[\u00a3$\u20ac]/) || [''])[0];
  const delta = to - from;
  const size = Math.abs(delta) % 1 === 0 ? String(Math.abs(delta)) : Math.abs(delta).toFixed(2);
  return { text: `${delta > 0 ? '+' : '\u2212'}${currency}${size}`, up: delta > 0 };
}

const STALE_CHECK_MS = 12 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Add form — specific model, specific colour, specific size
// ---------------------------------------------------------------------------

function AddRadarForm({ onAdded, onClose }: { onAdded: () => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [color, setColor] = useState('');
  const [size, setSize] = useState('');
  const [notes, setNotes] = useState('');
  const [priceSeen, setPriceSeen] = useState('');
  const [productUrl, setProductUrl] = useState('');
  const [category, setCategory] = useState<string>('');
  const [saving, setSaving] = useState(false);

  // URL AUTO-FILL (founder's feature): paste a product page link and Beau
  // reads it — Open Graph tags, structured data and the page text, via the
  // shared server-side extraction (discovery-ai extractFromUrl) — and
  // pre-fills the form. Every field stays editable before saving, and the
  // product image is run through THE ONE background-removal pipeline
  // (prepareProductPhoto) exactly like a manually uploaded photo, so the
  // piece lands in the Reserve with a clean cutout already stored.
  const [urlDraft, setUrlDraft] = useState('');
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetchNote, setFetchNote] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState('');
  const [imageCleaning, setImageCleaning] = useState(false);

  const fetchFromUrl = async () => {
    let url = urlDraft.trim();
    if (!url || fetching) return;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    setFetching(true);
    setFetchError(null);
    setFetchNote(null);
    try {
      const { draft, pageBlocked } = await extractFromUrl(url, null);
      setProductUrl(url);
      if (!draft) {
        setFetchError(
          pageBlocked
            ? 'Couldn\u2019t reach that page \u2014 it may be down or blocking readers. The link is kept; fill the details in yourself below.'
            : 'Couldn\u2019t read a product off that page. The link is kept; fill the details in yourself below.',
        );
        return;
      }
      if (draft.name) setName(draft.name);
      if (draft.brand) setBrand(draft.brand);
      if (draft.category) setCategory(draft.category);
      if (draft.price) setPriceSeen(draft.price);
      setFetchNote('Here\u2019s what Beau read off the page \u2014 correct anything before saving.');
      if (draft.image_url) {
        // The listing's product image, through the SAME ingestion pipeline a
        // manually uploaded photo takes — the stored cutout is keyed by this
        // URL, so the Reserve shelf and the Fitting board reuse it.
        setPreviewImage(draft.image_url);
        setImageCleaning(true);
        void prepareProductPhoto(draft.image_url)
          .then((prepared) => {
            if (prepared.cleaned && prepared.cleanedUrl) setPreviewImage(prepared.cleanedUrl);
          })
          .catch(() => undefined)
          .finally(() => setImageCleaning(false));
      }
    } catch (e) {
      console.warn('[Ethaion] Reserve URL read failed:', e);
      setFetchError('Couldn\u2019t read that page \u2014 fill the details in yourself below.');
    } finally {
      setFetching(false);
    }
  };

  const save = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await insertRadarItem({
        name: name.trim(),
        brand: brand.trim() || null,
        color: color.trim() || null,
        size: size.trim() || null,
        notes: notes.trim() || null,
        price_seen: priceSeen.trim() || null,
        product_url: productUrl.trim() || null,
        category: category || null,
        watch_price: !!productUrl.trim(),
        source: 'manual',
      });
      onAdded();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, value: string, set: (v: string) => void, placeholder: string, span2 = false) => (
    <div className={span2 ? 'sm:col-span-2' : ''}>
      <p className={`${typography.size.xs} uppercase tracking-wide ${typography.color.muted} mb-1`}>{label}</p>
      <input
        type="text"
        value={value}
        onChange={(e) => set(e.target.value)}
        placeholder={placeholder}
        className={`${tw.input.base} ${tw.input.default} ${typography.size.sm}`}
        aria-label={label}
      />
    </div>
  );

  return (
    // A PANEL: --color-paper ground, square corners, 1px divider border.
    <div className="bg-[var(--color-paper,#fbf8f1)] border border-[var(--color-divider,rgba(59,43,29,0.18))] p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className={`hab-section-head ${typography.color.primary}`}>
          Put a piece on the Reserve
        </h4>
        <button
          type="button"
          onClick={onClose}
          className="text-[var(--color-neutral-600,#856c51)] hover:underline flex-shrink-0"
          style={{ fontSize: '13px' }}
        >
          Close
        </button>
      </div>
      <p className={`${typography.size.xs} ${typography.color.muted} mt-0.5`}>
        Be specific — the exact model, the exact colour, YOUR size. That’s what makes the Reserve useful.
      </p>

      {/* Paste a product URL — Beau reads the page and pre-fills the form. */}
      <div className="mt-3 pb-3 border-b border-[var(--color-divider,rgba(59,43,29,0.18))]">
        <p className={`${typography.size.xs} uppercase tracking-wide ${typography.color.muted} mb-1`}>
          Paste a product URL — Beau fills the form in
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="url"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void fetchFromUrl();
              }
            }}
            placeholder="https://… (the product page)"
            className={`flex-1 min-w-[14rem] ${tw.input.base} ${tw.input.default} ${typography.size.sm}`}
            aria-label="Product page URL"
          />
          <button
            type="button"
            onClick={() => void fetchFromUrl()}
            disabled={!urlDraft.trim() || fetching}
            className="px-3.5 min-h-[40px] rounded text-[13px] inline-flex items-center gap-1.5 bg-transparent border border-[var(--color-accent,#a8712c)] text-[var(--color-accent-700,#7c4a17)] hover:bg-[var(--color-accent-100,#fbf1de)] transition-colors disabled:opacity-40"
          >
            {fetching && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {fetching ? 'Reading the page…' : 'Fetch the details'}
          </button>
        </div>
        {fetchError && (
          <p className={`${typography.size.xs} mt-1.5`} style={{ color: 'var(--space-semantic-danger,#7d2a24)' }}>
            {fetchError}
          </p>
        )}
        {fetchNote && !fetchError && (
          <p className={`${typography.size.xs} ${typography.color.secondary} mt-1.5`}>{fetchNote}</p>
        )}
        {(previewImage || imageCleaning) && (
          <div className="flex items-center gap-2.5 mt-2">
            {/* Universal transparency rule: only the GENUINE cutout renders
                bare; while the pipeline works, the quiet tile holds its place
                — never the raw retail photograph. */}
            <span
              className="relative inline-flex w-16 h-20 items-center justify-center overflow-hidden flex-shrink-0"
              style={{ background: previewImage && isTransparentCutout(previewImage) ? 'transparent' : '#eadfcb' }}
              role="img"
              aria-label={name ? `${name} — product image` : 'Product image'}
            >
              {previewImage && isTransparentCutout(previewImage) && (
                <img src={previewImage} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              )}
            </span>
            <span className={`${typography.size.xs} ${typography.color.muted}`}>
              {imageCleaning
                ? 'Cleaning up the product image — it\u2019ll be ready by the time you save.'
                : previewImage && isTransparentCutout(previewImage)
                  ? 'Image cleaned — saved with the piece.'
                  : 'The image stays with the listing — Beau shows it from the link.'}
            </span>
          </div>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-3 mt-3">
        {field('Model name', name, setName, 'e.g. Bedale Waxed Jacket', true)}
        <div>
          <p className={`${typography.size.xs} uppercase tracking-wide ${typography.color.muted} mb-1`}>Brand</p>
          <BrandField value={brand} onChange={setBrand} placeholder="e.g. Barbour" ariaLabel="Brand" />
        </div>
        <div>
          <p className={`${typography.size.xs} uppercase tracking-wide ${typography.color.muted} mb-1`}>Colour</p>
          {/* Structured selector (Pass Fourteen) — no free-typed colours anywhere. */}
          <ColorSelector value={color ? [color] : []} onChange={(next) => setColor(next[0] || '')} max={1} ariaLabel="Colour" />
        </div>
        <div>
          <p className={`${typography.size.xs} uppercase tracking-wide ${typography.color.muted} mb-1`}>Size</p>
          <SizeSelector value={size} onChange={setSize} ariaLabel="Size" />
        </div>
        {field('Price seen', priceSeen, setPriceSeen, 'e.g. \u00a3249')}
        {field('Product link (for price & restock watching)', productUrl, setProductUrl, 'https://\u2026', true)}
      </div>
      <div className="mt-3">
        <p className={`${typography.size.xs} uppercase tracking-wide ${typography.color.muted} mb-1`}>Category</p>
        <div className="flex flex-wrap gap-1">
          {WARDROBE_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(category === c.id ? '' : c.id)}
              className={`px-2 py-0.5 rounded border transition-colors ${typography.size.xs} ${
                category === c.id
                  ? 'bg-[var(--color-accent-100,#fbf1de)] text-[var(--color-accent-700,#7c4a17)] border-[var(--color-accent,#a8712c)]'
                  : 'border-[var(--color-divider,rgba(59,43,29,0.18))] text-[var(--space-text-secondary)] hover:border-[var(--space-border-strong)]'
              }`}
              style={{ fontSize: '10px' }}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3">
        <p className={`${typography.size.xs} uppercase tracking-wide ${typography.color.muted} mb-1`}>Notes</p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. wait for the autumn sale — and double-check the pit-to-pit against my Beaufort"
          rows={2}
          className={`${tw.input.base} ${tw.input.default} ${typography.size.sm} resize-none`}
        />
      </div>
      <button
        type="button"
        onClick={() => void save()}
        disabled={!name.trim() || saving}
        className={`mt-3 px-4 min-h-[44px] rounded ${typography.size.sm} inline-flex items-center gap-1.5 ${tw.button.primary} disabled:opacity-40`}
      >
        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
        Add to the Reserve
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One table row + its expandable detail
// ---------------------------------------------------------------------------

// Brand + price cells — Lora 14px neutral-600 (Pass Forty-Two spec).
const CELL_TEXT: React.CSSProperties = { fontFamily: 'var(--space-font-family)', fontSize: '14px' };

function RadarTableRow({
  item,
  onChanged,
  onRemoved,
  onOwned,
}: {
  item: RadarItem;
  onChanged: () => void;
  onRemoved: () => void;
  /** Fired with the freshly created wardrobe piece after "I own it now". */
  onOwned: (piece: WardrobePiece | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  // Row-level remove (Pass Forty-Four) — the subtle × trailing the row.
  const [rowConfirm, setRowConfirm] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState(item.notes || '');
  const [sizeDraft, setSizeDraft] = useState(item.size || '');
  const [editingSize, setEditingSize] = useState(false);
  // Optimistic watch flags — instant visual confirmation, write in background.
  const [watchPrice, setWatchPrice] = useState(!!item.watch_price);
  const [watchRestock, setWatchRestock] = useState(!!item.watch_restock);

  const run = async (key: string, job: () => Promise<void>) => {
    if (busy) return;
    setBusy(key);
    try {
      await job();
    } finally {
      setBusy(null);
    }
  };

  const toggleWatch = (kind: 'price' | 'restock') => {
    const next = kind === 'price' ? !watchPrice : !watchRestock;
    if (kind === 'price') setWatchPrice(next);
    else setWatchRestock(next);
    void updateRadarItem(item.id, kind === 'price' ? { watch_price: next } : { watch_restock: next }).catch(() => {
      if (kind === 'price') setWatchPrice(!next);
      else setWatchRestock(!next);
    });
  };

  const checkNow = () =>
    run('check', async () => {
      if (!item.product_url) return;
      await checkRadarItem(item);
      onChanged();
    });

  const own = () =>
    run('own', async () => {
      const created = await radarToWardrobe(item);
      onRemoved();
      onOwned(created);
    });

  const remove = () =>
    run('delete', async () => {
      await deleteRadarItem(item.id);
      onRemoved();
    });

  // Watch toggles — tag pills: 1px stroke, accent-100 tint only when selected.
  const watchPill = (active: boolean, label: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`px-2.5 py-1 rounded border ${typography.size.xs} transition-colors ${
        active
          ? 'bg-[var(--color-accent-100,#fbf1de)] border-[var(--color-accent,#a8712c)] text-[var(--color-accent-700,#7c4a17)]'
          : 'border-[var(--color-divider,rgba(59,43,29,0.18))] text-[var(--space-text-muted)] hover:border-[var(--space-border-strong)]'
      }`}
      title={item.product_url ? undefined : 'Add a product link so Beau has a page to watch'}
    >
      {label}
    </button>
  );

  const change = priceChange(item);

  return (
    <Fragment>
      <tr
        className="align-middle cursor-pointer hover:bg-[var(--color-paper,#fbf8f1)] transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        {/* Piece — the three-tier typography (piece-typography.ts): name in
            Cormorant, brand in accent Lora, colour · size muted below. */}
        <td className="py-4 pr-3 max-w-[260px]">
          {/* The piece name links straight to its product page when one is
              stored (Buy Links overhaul, Part 2.3); pieces without a URL
              skip the link gracefully — never a broken button. */}
          {item.product_url ? (
            <a
              href={item.product_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="block truncate hover:underline"
              style={pieceNameType}
              title={`View the product page — ${item.name}`}
              aria-label={`${item.name} — view the product page`}
            >
              {item.name}
            </a>
          ) : (
            <span className="block truncate" style={pieceNameType}>
              {item.name}
            </span>
          )}
          {item.brand && (
            <span className="block truncate" style={{ ...pieceBrandType, marginTop: '1px' }}>
              {item.brand}
            </span>
          )}
          {(item.color || item.size) && (
            <span className="block truncate" style={{ ...pieceMetaType, marginTop: '1px' }}>
              {[item.color, item.size].filter(Boolean).join(' · ')}
            </span>
          )}
        </td>
        {/* Beau's note — the last watch outcome, or the saved note */}
        <td className="py-4 pr-3 text-[var(--color-neutral-800,#453325)]" style={{ ...CELL_TEXT, lineHeight: 1.55, minWidth: '180px' }}>
          <span
            style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}
          >
            {item.last_check_note || item.notes || '\u2014'}
          </span>
        </td>
        {/* Fills — the wardrobe gap this piece would close */}
        <td className="py-4 pr-3 whitespace-nowrap text-[var(--color-neutral-700,#634e38)]" style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px' }}>
          {item.category ? `${categoryLabel(item.category)} gap` : '\u2014'}
        </td>
        {/* Price — Cormorant 20px tabular, delta beneath (accent for a drop) */}
        <td className="py-4 pr-3 whitespace-nowrap text-right">
          <span
            className={`block tabular-nums ${typography.color.primary}`}
            style={{ fontFamily: 'var(--space-font-heading)', fontSize: '20px', fontWeight: 400, lineHeight: 1.2 }}
          >
            {item.price_seen || '\u2014'}
          </span>
          <span
            className="block tabular-nums"
            style={{
              fontFamily: 'var(--space-font-family)',
              fontSize: '13px',
              color: change
                ? change.up
                  ? 'var(--space-semantic-danger,#7d2a24)'
                  : 'var(--color-accent-700,#7c4a17)'
                : 'var(--color-neutral-600,#856c51)',
            }}
          >
            {change ? change.text : '\u2014'}
          </span>
        </td>
        {/* Since — monospace date */}
        <td className="py-4 pr-3 whitespace-nowrap text-right" style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '11px', color: 'var(--color-neutral-600,#856c51)' }}>
          {formatDate(item.created_at) || '\u2014'}
        </td>
        <td className="py-4 text-right whitespace-nowrap">
          {!rowConfirm ? (
            <span className="inline-flex items-center gap-2.5">
              {/* Subtle × remove control, trailing the row (Pass Forty-Four) */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setRowConfirm(true);
                }}
                className="text-[var(--color-neutral-500,#a68e70)] hover:text-[var(--color-accent-700,#7c4a17)] transition-colors"
                style={{ fontFamily: 'var(--space-font-family)', fontSize: '12px', lineHeight: 1 }}
                aria-label={`Remove ${item.name} from the Reserve`}
                title="Remove from the Reserve"
              >
                ×
              </button>
              <span
                className={`inline-block text-[var(--color-neutral-500,#a68e70)] transition-transform ${open ? 'rotate-90' : ''}`}
                style={{ fontFamily: 'var(--space-font-heading)', fontSize: '17px', lineHeight: 1 }}
                aria-hidden="true"
              >
                ›
              </span>
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-2"
              onClick={(e) => e.stopPropagation()}
              style={{ fontFamily: 'var(--space-font-family)', fontSize: '12px' }}
            >
              <span className="text-[var(--color-neutral-700,#634e38)]">Remove?</span>
              <button
                type="button"
                onClick={() => void remove()}
                disabled={!!busy}
                className="hover:underline disabled:opacity-50"
                style={{ color: 'var(--color-accent,#a8712c)' }}
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setRowConfirm(false)}
                className="text-[var(--color-neutral-600,#856c51)] hover:underline"
              >
                Keep
              </button>
            </span>
          )}
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6} className="pb-[18px] pt-1">
            <div className="space-y-3">
              {/* Details line — all text. Pieces carry NO colour treatment
                  anywhere in the app: the colour is NAMED, never swatched. */}
              <div className="flex items-center gap-3 flex-wrap" style={{ ...CELL_TEXT, fontSize: '13px' }}>
                {item.category && (
                  <span className="text-[var(--color-neutral-600,#856c51)]">{categoryLabel(item.category)}</span>
                )}
                {item.size && (
                  <span className="text-[var(--color-neutral-600,#856c51)] tabular-nums">Size {item.size}</span>
                )}
                {item.last_checked_at && (
                  <span className="text-[var(--color-neutral-600,#856c51)]">Checked {formatDate(item.last_checked_at)}</span>
                )}
                {item.color && (
                  <span className="text-[var(--color-neutral-700,#634e38)]">{item.color}</span>
                )}
                <span className="text-[var(--color-neutral-600,#856c51)]">On the Reserve since {formatDate(item.created_at)}</span>
                {!editingSize ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSizeDraft(item.size || '');
                      setEditingSize(true);
                    }}
                    className="text-[var(--color-accent-700,#7c4a17)] hover:underline"
                    style={{ fontSize: '12px' }}
                  >
                    {item.size ? `Edit size (${item.size})` : 'Add a size'}
                  </button>
                ) : (
                  <span className="inline-flex items-start gap-1.5 flex-wrap">
                    <span className="min-w-[13rem]">
                      <SizeSelector value={sizeDraft} onChange={setSizeDraft} ariaLabel="Size" />
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        void run('size', async () => {
                          await updateRadarItem(item.id, { size: sizeDraft.trim() || null });
                          setEditingSize(false);
                          onChanged();
                        })
                      }
                      className={`px-2.5 py-1 rounded ${typography.size.xs} ${tw.button.primary}`}
                    >
                      Save size
                    </button>
                  </span>
                )}
              </div>

              {/* Notes */}
              {!editingNotes ? (
                <button
                  type="button"
                  onClick={() => {
                    setNotesDraft(item.notes || '');
                    setEditingNotes(true);
                  }}
                  className={`block text-left ${typography.size.xs} ${item.notes ? typography.color.secondary : typography.color.muted} hover:underline`}
                >
                  {item.notes || 'Add a note\u2026'}
                </button>
              ) : (
                <div className="max-w-lg">
                  <textarea
                    value={notesDraft}
                    onChange={(e) => setNotesDraft(e.target.value)}
                    rows={2}
                    className={`${tw.input.base} ${tw.input.default} ${typography.size.xs} resize-none`}
                    aria-label="Notes"
                  />
                  <div className="flex items-center gap-1.5 mt-1">
                    <button
                      type="button"
                      onClick={() =>
                        void run('notes', async () => {
                          await updateRadarItem(item.id, { notes: notesDraft.trim() || null });
                          setEditingNotes(false);
                          onChanged();
                        })
                      }
                      className={`px-2.5 py-1 rounded ${typography.size.xs} ${tw.button.primary}`}
                    >
                      Save note
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingNotes(false)}
                      className={`px-2 py-1 rounded ${typography.size.xs} ${tw.button.ghost} border border-[var(--space-border-default)]`}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Watching */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {watchPill(watchPrice, 'Price drops', () => toggleWatch('price'))}
                {watchPill(watchRestock, 'Restock', () => toggleWatch('restock'))}
                {item.product_url && (
                  <>
                    <button
                      type="button"
                      onClick={() => void checkNow()}
                      disabled={!!busy}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded border border-[var(--color-divider,rgba(59,43,29,0.18))] ${typography.size.xs} ${typography.color.secondary} hover:border-[var(--space-border-strong)] disabled:opacity-50`}
                      title="Re-read the product page and compare the price"
                    >
                      {busy === 'check' && <Loader2 className="w-3 h-3 animate-spin" />}
                      Check it now
                    </button>
                    <a
                      href={item.product_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${typography.size.xs} ${typography.color.brand} hover:underline`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      View the listing →
                    </a>
                    {/* Virtual try-on — see yourself in it while you're still
                        deciding (lib/tryon; garment image read from the listing). */}
                    <TryOnButton
                      piece={{
                        name: item.name,
                        brand: item.brand,
                        note: item.notes,
                        productUrl: item.product_url,
                        ctaLabel: 'View the listing',
                        ctaUrl: item.product_url,
                      }}
                    />
                  </>
                )}
              </div>
              {item.last_check_note && (
                <p
                  className={`${typography.size.xs} inline-flex items-center gap-1.5 ${
                    isAlertNote(item.last_check_note)
                      ? 'text-[var(--space-text-brand)] font-medium'
                      : typography.color.secondary
                  }`}
                >
                  {isAlertNote(item.last_check_note) && (
                    <span className="inline-block w-3 h-[3px] bg-[var(--color-accent,#a8712c)] flex-shrink-0" aria-hidden="true" />
                  )}
                  {item.last_check_note}
                </p>
              )}

              {/* Pipeline moves */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => void own()}
                  disabled={!!busy}
                  className={`px-3 py-1.5 rounded ${typography.size.xs} inline-flex items-center gap-1.5 ${tw.button.primary} disabled:opacity-50`}
                  title="Bought it — file it into the wardrobe tracker"
                >
                  {busy === 'own' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  I own it now
                </button>
                <span className="flex-1" />
                {!confirming ? (
                  <button
                    type="button"
                    onClick={() => setConfirming(true)}
                    className="text-[var(--color-neutral-600,#856c51)] hover:underline"
                    style={{ fontSize: '12px' }}
                    title="Passed on it — remove from the Reserve"
                  >
                    Passed on it
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void remove()}
                      disabled={!!busy}
                      className={`px-2.5 py-1 rounded ${typography.size.xs} ${tw.button.danger} inline-flex items-center gap-1 disabled:opacity-50`}
                    >
                      {busy === 'delete' && <Loader2 className="w-3 h-3 animate-spin" />}
                      Passed — remove
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(false)}
                      className={`px-2.5 py-1 rounded ${typography.size.xs} ${tw.button.ghost} border border-[var(--space-border-default)]`}
                    >
                      Keep
                    </button>
                  </span>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

// ---------------------------------------------------------------------------
// The Reserve — ONE surface now: the watch table (price drops & restocks).
// The old sub-tab bar is gone: "Brand Index" is retired (brand tracking
// lives in The Index → Makers), and with only the watch list left, "The
// Watchlist" chip went with it — no tab chrome for a single view.
// ---------------------------------------------------------------------------

export function RadarTab() {
  return (
    <div className="px-6 sm:px-10 pt-[52px] pb-24 max-w-[1180px] mx-auto w-full">
      <h3 className={`hab-page-title ${typography.color.primary}`} style={{ marginBottom: '20px' }}>
        The Reserve
      </h3>
      <ReserveWatchlist />
    </div>
  );
}

// ---------------------------------------------------------------------------
// The Watchlist sub-tab root (the original Radar tab, unchanged in logic)
// ---------------------------------------------------------------------------

// Pass Forty-Three columns (HTML reference): Piece · Beau's note · Fills ·
// Price · Since · ›
const TABLE_HEADERS: Array<{ label: string; align?: 'right' }> = [
  { label: 'Piece' },
  { label: 'Beau\u2019s note' },
  { label: 'Fills' },
  { label: 'Price', align: 'right' },
  { label: 'Since saved', align: 'right' },
  { label: '' },
];

function ReserveWatchlist() {
  const { data: rows, loading: rowsLoading, refresh } = window.useWorkspaceDB<RadarItem>('radar_items', {
    orderBy: { column: 'created_at', direction: 'desc' },
    limit: 100,
  });
  const [adding, setAdding] = useState(false);
  const [autoChecking, setAutoChecking] = useState(false);
  // Clear all (Pass Forty-Four) — empties the whole watch list, plain inline
  // confirm, never a modal.
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);
  // Bottom actions (HTML reference): bulk drop alerts + the bought sweep.
  const [bulkNote, setBulkNote] = useState<string | null>(null);
  const [alertingAll, setAlertingAll] = useState(false);
  const [clearingBought, setClearingBought] = useState(false);
  // Close-the-loop: the piece that just moved Radar → Wardrobe, awaiting a rating.
  const [feedbackFor, setFeedbackFor] = useState<WardrobePiece | null>(null);
  const autoCheckRan = useRef(false);

  // Keep the module cache in step with every fetch (initial load, manual
  // refresh, mutation refreshes) — the cache is only ever REAL rows.
  useEffect(() => {
    if (!rowsLoading && rows) reserveCache = { rows, at: Date.now() };
  }, [rows, rowsLoading]);

  // Cached rows answer instantly while a (re)fetch is still in flight — the
  // user sees content immediately, never a spinner over data that exists.
  const items = rowsLoading && (!rows || rows.length === 0) && reserveCache ? reserveCache.rows : rows || [];

  // Automatic watching: when the Radar opens, quietly re-check the watched
  // entries that haven't been looked at recently (a few per visit, oldest
  // first) so price drops and restocks surface without a manual tap.
  useEffect(() => {
    if (autoCheckRan.current || !rows || rows.length === 0) return;
    const stale = rows
      .filter(
        (r) =>
          (r.watch_price || r.watch_restock) &&
          r.product_url &&
          (!r.last_checked_at || Date.now() - new Date(r.last_checked_at).getTime() > STALE_CHECK_MS),
      )
      .sort((a, b) => (a.last_checked_at || '').localeCompare(b.last_checked_at || ''))
      .slice(0, 3);
    if (stale.length === 0) return;
    autoCheckRan.current = true;
    setAutoChecking(true);
    void (async () => {
      for (const item of stale) {
        try {
          await checkRadarItem(item);
        } catch { /* one failed page shouldn't stop the sweep */ }
      }
      setAutoChecking(false);
      refresh();
    })();
  }, [rows, refresh]);

  // The Reserve stays mounted when the user switches tabs (tab-switch
  // performance). Re-activation shows the cached rows IMMEDIATELY and only
  // refreshes in the background when the data is stale (older than 60s) —
  // never a re-fetch, and never a spinner, on every tab switch.
  useEffect(() => {
    const onActivated = (event: Event) => {
      if ((event as CustomEvent).detail?.tab !== 'radar') return;
      if (!reserveCacheIsFresh()) refresh();
    };
    window.addEventListener('ethaion:tab-activated', onActivated);
    return () => window.removeEventListener('ethaion:tab-activated', onActivated);
  }, [refresh]);

  // A mutation anywhere (chat, The Rail, The Fitting's "Add to Reserve")
  // invalidates the cache and refreshes — the ONLY other thing besides the
  // 60-second staleness window that triggers a re-fetch.
  useEffect(() => {
    const onChanged = () => {
      reserveCache = null;
      refresh();
    };
    window.addEventListener(RESERVE_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(RESERVE_CHANGED_EVENT, onChanged);
  }, [refresh]);

  const alerts = items.filter((r) => isAlertNote(r.last_check_note));

  // One flat table, ordered by the tracker's category order then recency.
  const sorted = useMemo(() => {
    const rank = new Map<string, number>(WARDROBE_CATEGORIES.map((c, i) => [c.id, i]));
    return [...items].sort((a, b) => {
      const ra = rank.get(a.category || 'other') ?? 99;
      const rb = rank.get(b.category || 'other') ?? 99;
      if (ra !== rb) return ra - rb;
      return (b.created_at || '').localeCompare(a.created_at || '');
    });
  }, [items]);

  return (
    <div>
      {/* Heading row (HTML reference): standfirst left, the WATCHING stat
          block right — the page title lives above the sub-tab bar. */}
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_320px] items-end gap-8 sm:gap-16">
        <div>
          <p className={typography.color.primary} style={{ fontFamily: 'var(--space-font-family)', fontSize: '16px', lineHeight: 1.55, maxWidth: '54ch' }}>
            Pieces you’ve saved and pieces Beau is keeping an eye on. He watches price, stock and size — and
            tells you when waiting stops being clever.
          </p>
        </div>
        {/* data-tour: the first-run walkthrough's Reserve stop rings this
            Watching block (onboarding-tour.tsx). */}
        <div className="w-full" data-tour="tour-reserve-watch">
          <div className="flex items-baseline justify-between gap-3 pb-2 border-b border-[var(--color-text,#3b2b1d)]">
            <span
              className="uppercase text-[var(--color-neutral-700,#634e38)]"
              style={{ fontFamily: 'var(--space-font-heading)', fontSize: '12px', letterSpacing: '0.14em' }}
            >
              Watching
            </span>
            <span
              className={`tabular-nums ${typography.color.primary}`}
              style={{ fontFamily: 'var(--space-font-heading)', fontWeight: 500, fontSize: '30px', lineHeight: 1 }}
            >
              {items.length}
            </span>
          </div>
          <p className="mt-2.5 text-[var(--color-neutral-700,#634e38)]" style={{ fontFamily: 'var(--space-font-family)', fontSize: '12px' }}>
            {alerts.length > 0
              ? `${alerts.length === 1 ? 'One' : alerts.length} moved in price or stock recently.`
              : 'Beau re-checks watched pieces each time you visit.'}
          </p>
          {/* "Add to Radar" — a plain text link with the › chevron, never a
              filled button. */}
          <button
            type="button"
            onClick={() => setAdding((a) => !a)}
            className="mt-2 inline-flex items-center gap-1.5 group hover:underline"
            style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', color: 'var(--color-accent,#a8712c)' }}
          >
            {adding ? 'Close' : 'Add to the Reserve'}
            <span
              className="group-hover:translate-x-0.5 transition-transform"
              style={{ fontFamily: 'var(--space-font-heading)', fontSize: '17px', lineHeight: 1 }}
              aria-hidden="true"
            >
              ›
            </span>
          </button>
        </div>
      </div>

      {adding && (
        <div className="mt-6">
          <AddRadarForm onAdded={refresh} onClose={() => setAdding(false)} />
        </div>
      )}

      {/* Purchase close-the-loop — "You got it — how was it?" */}
      {feedbackFor && (
        <div className="mt-6">
          <PurchaseFeedbackPrompt piece={feedbackFor} onDone={() => setFeedbackFor(null)} />
        </div>
      )}

      {/* Price drops — movement Beau spotted on watched entries (price moves
          and restocks), presented as hairline rows flagged with an accent tick. */}
      {alerts.length > 0 && (
        <section aria-label="Price drops" className="mt-10">
          <div className="flex items-baseline justify-between gap-3 pb-2.5 border-b border-[var(--color-text,#3b2b1d)]">
            <h4 className={`hab-section-head ${typography.color.primary}`}>Price drops</h4>
          </div>
          <div className="divide-y divide-[var(--color-divider,rgba(59,43,29,0.18))] border-b border-[var(--color-divider,rgba(59,43,29,0.18))]">
            {alerts.map((a) => (
              <div key={a.id} className="py-2.5 flex items-start gap-2.5">
                <span className="mt-2 w-4 h-[3px] flex-shrink-0 bg-[var(--color-accent,#a8712c)]" aria-hidden="true" />
                <div className="min-w-0">
                  <p className={`hab-row-title ${typography.color.primary}`}>{a.name}</p>
                  <p className={`${typography.size.xs} ${typography.color.secondary} mt-0.5`}>{a.last_check_note}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      {autoChecking && (
        <p className={`${typography.size.xs} ${typography.color.muted} inline-flex items-center gap-1.5 mt-4`}>
          <Loader2 className="w-3 h-3 animate-spin" />
          Beau is re-checking your watched pieces…
        </p>
      )}

      {rowsLoading && items.length === 0 ? (
        /* Radar loading (Pass Forty-Six) — shimmer hairline rows in the
           shape of the watch table: never a blank area or a spinner. */
        <div className="mt-8">
          <HairlineRowsSkeleton rows={4} />
        </div>
      ) : items.length === 0 && !adding ? (
        /* Empty state — plain centred text, Lora 16px neutral-600 (Pass
           Forty-Two exact copy). */
        <div className="text-center py-12">
          <p
            className="max-w-md mx-auto"
            style={{ fontFamily: 'var(--space-font-family)', fontSize: '16px', lineHeight: 1.55, color: 'var(--color-neutral-600,#856c51)' }}
          >
            Nothing on your Reserve yet. Ask Beau to watch a piece and it appears here.
          </p>
        </div>
      ) : items.length > 0 ? (
        /* THE TABLE — not a card grid. Hairline-parted rows; tap a row to
           open its detail. Header: Lora 12px uppercase neutral-600 over a
           1px divider rule, no background fill. */
        <div className="overflow-x-auto mt-8">
          {/* Clear all — plain Lora 13px accent text link, top-right of the
              table, with a plain inline confirm (Pass Forty-Four). */}
          <div className="flex justify-end items-baseline gap-3 mb-2" style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px' }}>
            {!confirmClearAll ? (
              <button
                type="button"
                onClick={() => setConfirmClearAll(true)}
                className="hover:underline"
                style={{ color: 'var(--color-accent,#a8712c)' }}
              >
                Clear all ›
              </button>
            ) : (
              <span className="inline-flex items-baseline gap-3">
                <span className="text-[var(--color-neutral-700,#634e38)]">Remove every watched piece?</span>
                <button
                  type="button"
                  onClick={() =>
                    void (async () => {
                      if (clearingAll) return;
                      setClearingAll(true);
                      try {
                        for (const r of items) {
                          try {
                            await deleteRadarItem(r.id);
                          } catch { /* one failed row shouldn't stop the sweep */ }
                        }
                        refresh();
                      } finally {
                        setClearingAll(false);
                        setConfirmClearAll(false);
                      }
                    })()
                  }
                  disabled={clearingAll}
                  className="hover:underline disabled:opacity-50"
                  style={{ color: 'var(--color-accent,#a8712c)' }}
                >
                  {clearingAll ? 'Clearing…' : 'Yes, clear all'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(false)}
                  disabled={clearingAll}
                  className="text-[var(--color-neutral-600,#856c51)] hover:underline disabled:opacity-50"
                >
                  Keep
                </button>
              </span>
            )}
          </div>
          <table className="w-full text-left border-collapse" style={{ minWidth: '760px' }}>
            <thead>
              <tr className="border-b border-[var(--color-text,#3b2b1d)]">
                {TABLE_HEADERS.map((h, i) => (
                  <th
                    key={i}
                    className={`pb-2.5 pr-3 uppercase text-[var(--color-neutral-700,#634e38)] whitespace-nowrap font-normal ${h.align === 'right' ? 'text-right' : ''}`}
                    style={{ fontFamily: 'var(--space-font-heading)', fontSize: '12px', letterSpacing: '0.14em' }}
                  >
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-divider,rgba(59,43,29,0.18))] border-b border-[var(--color-divider,rgba(59,43,29,0.18))]">
              {sorted.map((item) => (
                <RadarTableRow
                  key={item.id}
                  item={item}
                  onChanged={refresh}
                  onRemoved={refresh}
                  onOwned={setFeedbackFor}
                />
              ))}
            </tbody>
          </table>

          {/* Bottom actions (HTML reference): bulk price-drop alerts and the
              bought sweep — stroke-only buttons, never a fill. */}
          <div className="flex items-center gap-3 mt-7 flex-wrap">
            <button
              type="button"
              onClick={() =>
                void (async () => {
                  if (alertingAll) return;
                  setAlertingAll(true);
                  try {
                    const watchable = items.filter((r) => r.product_url && !r.watch_price);
                    for (const r of watchable) {
                      await updateRadarItem(r.id, { watch_price: true });
                    }
                    setBulkNote(
                      watchable.length > 0
                        ? `Done — Beau is watching prices on ${watchable.length} more piece${watchable.length === 1 ? '' : 's'}.`
                        : 'Every piece with a product link is already being watched. Add links to the rest and Beau can watch those too.',
                    );
                    refresh();
                  } finally {
                    setAlertingAll(false);
                  }
                })()
              }
              disabled={alertingAll}
              className="px-4 min-h-[42px] rounded text-[15px] inline-flex items-center gap-1.5 bg-transparent border border-[var(--color-accent,#a8712c)] text-[var(--color-accent-700,#7c4a17)] hover:bg-[var(--color-accent-100,#fbf1de)] transition-colors disabled:opacity-50"
            >
              {alertingAll && <Loader2 className="w-4 h-4 animate-spin" />}
              Alert me on drops
            </button>
            <button
              type="button"
              onClick={() => setClearingBought((o) => !o)}
              className="px-2 min-h-[42px] text-[15px] text-[var(--color-neutral-700,#634e38)] hover:text-[var(--color-accent-700,#7c4a17)] hover:underline transition-colors"
            >
              {clearingBought ? 'Done clearing' : 'Clear what I\u2019ve bought'}
            </button>
          </div>
          {bulkNote && (
            <p className={`${typography.size.xs} ${typography.color.secondary} mt-2`}>{bulkNote}</p>
          )}
          {clearingBought && (
            <div className="mt-4 bg-[var(--color-paper,#fbf8f1)] border border-[var(--color-divider,rgba(59,43,29,0.18))] p-4">
              <p className={`${typography.size.sm} ${typography.color.primary}`}>
                Tap the pieces you’ve bought — each files into your wardrobe tracker and leaves the Radar.
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                {sorted.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() =>
                      void (async () => {
                        const created = await radarToWardrobe(item);
                        refresh();
                        setFeedbackFor(created);
                      })()
                    }
                    className={`px-3 py-1.5 rounded border border-[var(--color-divider,rgba(59,43,29,0.18))] ${typography.size.xs} ${typography.color.secondary} hover:border-[var(--color-accent,#a8712c)] hover:text-[var(--color-accent-700,#7c4a17)] transition-colors`}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
