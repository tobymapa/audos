/**
 * THE HUNT (v7 — Recommendation Engine overhaul) — the brand and piece
 * intelligence hub. Exactly FOUR internal sub-tabs on a horizontal chip
 * bar (see the root component at the bottom):
 *
 *   Find · Discover · Compare · Matrix
 *
 *  - Find: the UNIFIED search (./hunt-find) — the old Find, the AI
 *    Matchmaker and Judge merged into ONE input; Beau reads the intent and
 *    answers with recommendations, a brand dossier or a quality judgement.
 *    Every query is logged to Your Hunt History with its full result set —
 *    and the FULL history (filterable, tag/note-able, RE-RUNNABLE) lives
 *    right beneath the input on this same sub-tab. The old separate
 *    "Your Hunt History" sub-tab is RETIRED.
 *  - Discover: the maker directory as a TABLE (./hunt-discover) — filter
 *    chips, Beau ratings, source tags, Add to Compare / Add to Matrix,
 *    "Don't see a maker?" at the top.
 *  - Compare / Matrix: the brand-intelligence layer (./brands seed catalog,
 *    ./hunt-ai models, ./hunt-tools components, the shared Brand Dossier).
 *
 * "Plan a Trip" left this tab entirely — it lives on The Ledger now
 * (App.tsx renders ./travel there; a tapped gap hands back to Find here).
 *
 * A PROFILE TOGGLE at the top (above the sub-tab bar) persists for the
 * session and applies to every sub-tab: ON, Beau reasons with the full user
 * context; OFF, general knowledge only.
 */
import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  ExternalLink,
  LayoutList,
  Loader2,
  StickyNote,
  Table2,
  Trash2,
  X,
} from 'lucide-react';
import { tw, typography } from '../../lib/colors';
import { smartTitle } from '../../lib/smart-title';
import {
  WARDROBE_CATEGORIES,
  categoryLabel,
  consumeScoutPrefill,
  insertRadarItem,
  openApp,
  type CategoryBudget,
  type StylePrefs,
  type StyleProfile,
  type WardrobePiece,
} from './profile-data';
import { fetchFeedPhoto } from './wardrobe-ai';
import { fetchProductImage } from './og-image';
import {
  parseScoutResult,
  type FindRecommendation,
  type FindResult,
  type ReviewResult,
  type ScoutHuntRow,
} from './scout-ai';
import { HairlineRowsSkeleton, ShimmerDefs, Skeleton } from './skeleton';
import {
  addToCompare,
  addToMatrix,
  clearCompare,
  clearMatrix,
  consumeHuntSubTabHandoff,
  readCompareSession,
  readMatrixSession,
  readProfileToggle,
  removeFromCompare,
  removeFromMatrix,
  writeProfileToggle,
} from './brands';
import { BrandDetailSheet, DiscoverSubTab } from './hunt-discover';
import { CompareSubTab, MatrixSubTab } from './hunt-tools';
import { SubTabs } from './sub-tabs';
import { FindSubTab, UnifiedResultView, parseUnifiedResult, unifiedRowMeta } from './hunt-find';
import { HuntStages } from './hunt-stages';

function formatDate(iso?: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// Tags & notes — per-scouted-item research metadata (persists in WorkspaceDB)
// ---------------------------------------------------------------------------

export interface ScoutMetaRow {
  id: number;
  hunt_id: number;
  tag: string | null;
  note: string | null;
  created_at?: string;
}

export type ScoutTag = 'favourite' | 'maybe' | 'no';

const TAGS: Array<{ id: ScoutTag; label: string; cls: string; idleCls: string }> = [
  {
    id: 'favourite',
    label: 'Favourite',
    cls: 'bg-[color-mix(in_srgb,var(--space-semantic-success)_16%,var(--space-surface-card))] text-[var(--space-semantic-success)] border-[var(--space-semantic-success)]',
    idleCls: 'border-[var(--space-border-default)] text-[var(--space-text-muted)] hover:border-[var(--space-border-strong)]',
  },
  {
    id: 'maybe',
    label: 'Maybe',
    cls: 'bg-[color-mix(in_srgb,var(--space-semantic-warning)_16%,var(--space-surface-card))] text-[var(--space-semantic-warning)] border-[var(--space-semantic-warning)]',
    idleCls: 'border-[var(--space-border-default)] text-[var(--space-text-muted)] hover:border-[var(--space-border-strong)]',
  },
  {
    id: 'no',
    label: 'No',
    cls: 'bg-[color-mix(in_srgb,var(--space-semantic-danger)_16%,var(--space-surface-card))] text-[var(--space-semantic-danger)] border-[var(--space-semantic-danger)]',
    idleCls: 'border-[var(--space-border-default)] text-[var(--space-text-muted)] hover:border-[var(--space-border-strong)]',
  },
];

function TagBadge({ tag }: { tag: string | null | undefined }) {
  const def = TAGS.find((t) => t.id === tag);
  if (!def) return null;
  return <span className={`${tw.badge.default} border ${def.cls}`} style={{ fontSize: '10px' }}>{def.label}</span>;
}

/** Tap-to-tag pills: Favourite / Maybe / No (tap the active one to clear). */
function TagPicker({
  value,
  onChange,
  compact = false,
}: {
  value: string | null;
  onChange: (tag: ScoutTag | null) => void;
  compact?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      {TAGS.map((t) => {
        const active = value === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(active ? null : t.id)}
            className={`rounded-full border transition-colors ${compact ? 'px-2 py-0.5' : 'px-2.5 py-1'} ${typography.size.xs} ${active ? t.cls : t.idleCls}`}
            style={compact ? { fontSize: '10px' } : undefined}
            title={active ? `Untag ${t.label}` : `Tag as ${t.label}`}
          >
            {t.label}
          </button>
        );
      })}
    </span>
  );
}

/** Free-text research note with an explicit save. */
function NoteEditor({
  value,
  onSave,
  compact = false,
}: {
  value: string;
  onSave: (note: string) => Promise<void>;
  compact?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onSave(draft.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } finally {
      setBusy(false);
    }
  };

  const dirty = draft.trim() !== (value || '').trim();

  return (
    <div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Your note — e.g. “people say this shrinks — should I size up?”"
        rows={compact ? 2 : 3}
        className={`${tw.input.base} ${tw.input.default} ${typography.size.sm} resize-none`}
      />
      <div className="flex items-center gap-2 mt-1.5">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || !dirty}
          className={`px-3 py-1.5 rounded-lg ${typography.size.xs} inline-flex items-center gap-1.5 ${tw.button.primary} disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <StickyNote className="w-3 h-3" />}
          Save note
        </button>
        {saved && <span className={`${typography.size.xs} text-[var(--space-semantic-success)]`}>Saved</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Result views
// ---------------------------------------------------------------------------

function RecPhoto({
  cacheId,
  query,
  alt,
  productUrl,
}: {
  cacheId: string;
  query: string;
  alt: string;
  /** The result's product page — its og:image is preferred over stock photography. */
  productUrl?: string | null;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setFailed(false);
    void (async () => {
      // Pass Fourteen: the REAL product photo first — the og:image from the
      // linked page, the same mechanic Curated uses. Cached per URL (memory +
      // localStorage) so reopening the same result never re-fetches. Stock
      // photography is the fallback; the labelled tile the final one — never
      // a broken-image icon.
      if (productUrl && productUrl.trim()) {
        const clean = productUrl.trim().startsWith('http') ? productUrl.trim() : `https://${productUrl.trim()}`;
        const img = await fetchProductImage(clean);
        if (cancelled) return;
        if (img) {
          setUrl(img);
          return;
        }
      }
      const u = await fetchFeedPhoto(cacheId, query);
      if (cancelled) return;
      if (u) setUrl(u);
      else setFailed(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [cacheId, query, productUrl]);

  if (url) {
    return <img src={url} alt={alt} className="hab-plate w-full h-36 object-contain bg-[var(--color-paper,#fbf8f1)]" loading="lazy" width={300} height={144} onError={() => setFailed(true)} />;
  }
  return (
    <div className="w-full h-36 bg-[var(--space-surface-muted)] flex items-center justify-center">
      {failed ? (
        <span className={`${typography.size.xs} ${typography.color.muted} px-3 text-center`}>{alt}</span>
      ) : (
        /* Shimmer while the photo resolves — never a generic spinner */
        <>
          <ShimmerDefs />
          <Skeleton className="w-full h-full" />
        </>
      )}
    </div>
  );
}

/** "On the Radar" save for one recommendation — the Scout → Radar bridge. */
function RadarSaveButton({ row, rec }: { row: ScoutHuntRow; rec: FindRecommendation }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const save = async () => {
    if (state !== 'idle') return;
    setState('busy');
    try {
      await insertRadarItem({
        name: rec.name,
        brand: rec.brand || null,
        category: row.category || null,
        price_seen: rec.price || null,
        product_url: rec.link || null,
        watch_price: !!rec.link,
        source: 'scout',
        notes: rec.whyForYou || null,
      });
      setState('done');
    } catch {
      setState('idle');
    }
  };
  return (
    <button
      type="button"
      onClick={() => void save()}
      disabled={state !== 'idle'}
      className={`inline-flex items-center gap-1 mt-2 px-2.5 py-1 rounded-full border ${typography.size.xs} transition-colors ${
        state === 'done'
          ? 'bg-[var(--space-surface-accent-soft)] border-[var(--space-brand-primary-200)] text-[var(--space-text-brand)]'
          : 'border-[var(--space-border-default)] text-[var(--space-text-secondary)] hover:border-[var(--space-border-strong)]'
      }`}
      title="Convinced but not buying yet? Park it on the Reserve — add your size there."
    >
      {state === 'busy' ? <Loader2 className="w-3 h-3 animate-spin" /> : state === 'done' ? <Check className="w-3 h-3" /> : null}
      On the Reserve
    </button>
  );
}

function FindResultView({ row, result }: { row: ScoutHuntRow; result: FindResult }) {
  return (
    <div className="space-y-3">
      {result.intro && (
        <p className={`${typography.size.sm} ${typography.color.secondary}`}>
          {result.intro}
        </p>
      )}
      <div className="grid sm:grid-cols-2 gap-3">
        {result.recommendations.map((rec, idx) => (
          <div key={`${rec.name}-${idx}`} className={`${tw.card.default} rounded-2xl overflow-hidden flex flex-col`}>
            <div className="relative">
              <RecPhoto cacheId={`scout-${row.id}-${idx}`} query={rec.photoQuery} alt={`${rec.brand} ${rec.name}`} productUrl={rec.link} />
              {rec.secondhand && (
                <span
                  className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-[var(--space-surface-card)] border border-[var(--space-border-strong)] text-[var(--space-text-primary)] font-medium shadow-sm"
                  style={{ fontSize: '10px' }}
                >
                  {rec.secondhand}
                </span>
              )}
            </div>
            <div className="p-3.5 flex flex-col flex-1">
              {rec.brand && (
                <p className={`${typography.size.xs} uppercase tracking-[0.15em] ${typography.color.muted}`}>{rec.brand}</p>
              )}
              <p className={`${typography.size.sm} ${typography.weight.semibold} ${typography.color.primary} mt-0.5`}>{rec.name}</p>
              {rec.price && <p className={`${typography.size.xs} ${typography.color.secondary} mt-0.5`}>{rec.price}</p>}
              {rec.secondhand && rec.condition && (
                <p className={`${typography.size.xs} ${typography.color.secondary} mt-0.5 italic`} style={{ fontSize: '10px' }}>
                  Condition: {rec.condition}
                </p>
              )}
              <p className={`${typography.size.xs} ${typography.color.muted} mt-2 leading-relaxed flex-1`}>
                {rec.whyForYou}
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                {rec.link && (
                  <a
                    href={rec.link.startsWith('http') ? rec.link : `https://${rec.link}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-1 mt-2 ${typography.size.xs} ${typography.color.brand} hover:underline`}
                  >
                    View <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                <RadarSaveButton row={row} rec={rec} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className={`${typography.size.xs} ${typography.color.muted}`} style={{ fontSize: '10px' }}>
        Photography is representative of the piece, not the exact retail listing.
      </p>
    </div>
  );
}

// Explicit tints from the base semantic tokens — this theme doesn't define
// the -100/-700 semantic scale the shared badge classes expect.
const VERDICT_STYLE: Record<ReviewResult['verdict'], { label: string; cls: string }> = {
  buy: { label: 'Buy it', cls: 'bg-[color-mix(in_srgb,var(--space-semantic-success)_14%,var(--space-surface-card))] text-[var(--space-semantic-success)]' },
  skip: { label: 'Skip it', cls: 'bg-[color-mix(in_srgb,var(--space-semantic-danger)_14%,var(--space-surface-card))] text-[var(--space-semantic-danger)]' },
  conditional: { label: 'Buy, but\u2026', cls: 'bg-[color-mix(in_srgb,var(--space-semantic-warning)_14%,var(--space-surface-card))] text-[var(--space-semantic-warning)]' },
};

function ReviewResultView({ result }: { result: ReviewResult }) {
  const verdict = VERDICT_STYLE[result.verdict] || VERDICT_STYLE.conditional;
  const rows = [
    { k: 'Fit', v: result.fit },
    { k: 'Quality', v: result.quality },
    { k: 'Your wardrobe', v: result.wardrobe },
    { k: 'Value', v: result.value },
  ].filter((r) => r.v);

  return (
    <div className={`${tw.card.default} rounded-2xl p-4 space-y-3`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`${tw.badge.default} ${verdict.cls}`}>{verdict.label}</span>
        <p className={`${typography.size.base} ${typography.weight.semibold} ${typography.color.primary}`}>{result.headline}</p>
      </div>
      <dl className="divide-y divide-[var(--space-border-default)]">
        {rows.map((r) => (
          <div key={r.k} className="py-2.5 first:pt-0 last:pb-0">
            <dt className={`${typography.size.xs} uppercase tracking-wide ${typography.color.muted}`}>{r.k}</dt>
            <dd className={`${typography.size.sm} ${typography.color.secondary} mt-0.5 leading-relaxed`}>{r.v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hunt detail — the sub-page for one persisted hunt/review (+ tags & notes)
// ---------------------------------------------------------------------------

function HuntDetail({
  row,
  meta,
  onBack,
  onDelete,
  onSaveMeta,
  onRerun,
  onOpenBrand,
  compareList,
  onToggleCompare,
}: {
  row: ScoutHuntRow;
  meta: ScoutMetaRow | undefined;
  onBack: () => void;
  onDelete: (id: number) => void;
  onSaveMeta: (huntId: number, patch: { tag?: ScoutTag | null; note?: string }) => Promise<void>;
  /** Re-run this hunt's query through the unified Find (re-runnable history). */
  onRerun: (row: ScoutHuntRow) => void;
  onOpenBrand: (brandName: string) => void;
  compareList: string[];
  onToggleCompare: (brand: string) => void;
}) {
  const unified = parseUnifiedResult(row);
  const result = parseScoutResult(row);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className={`inline-flex items-center gap-1.5 ${typography.size.xs} ${typography.color.brand} hover:underline`}
        >
          <ArrowLeft className="w-3.5 h-3.5" /> The Hunt
        </button>
        <span className="inline-flex items-center gap-2">
          {(row.query || row.title) && (
            <button
              type="button"
              onClick={() => onRerun(row)}
              className="px-3 py-1.5 rounded-full border border-[var(--space-border-default)] text-[var(--space-text-secondary)] hover:border-[var(--space-border-strong)] hover:text-[var(--space-text-primary)] transition-colors"
              style={{ fontFamily: 'var(--space-font-family)', fontSize: '12px' }}
              title="Run this hunt again through Find"
            >
              Run again
            </button>
          )}
          <button
            type="button"
            onClick={() => onDelete(row.id)}
            className={`p-1.5 rounded-lg ${tw.button.ghost} text-[var(--space-semantic-danger)]`}
            aria-label="Delete this hunt"
            title="Delete this hunt"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </span>
      </div>

      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`${tw.badge.default} ${row.mode === 'find' ? tw.badge.primary : tw.badge.accent}`}>
            {row.mode === 'find' ? 'Hunt' : 'Review'}
          </span>
          {row.category && <span className={`${tw.badge.default} ${tw.badge.neutral}`}>{categoryLabel(row.category)}</span>}
          <TagBadge tag={meta?.tag} />
          <span className={`${typography.size.xs} ${typography.color.muted}`}>{formatDate(row.created_at)}</span>
        </div>
        <h3 className={`${typography.size.xl} ${typography.weight.semibold} ${typography.color.primary} mt-1.5`}>
          {huntRowTitle(row, 'Scout result')}
        </h3>
        {(row.query || row.link_url) && (
          <p className={`${typography.size.xs} ${typography.color.muted} mt-1`}>
            {row.query}
            {row.link_url && (
              <>
                {row.query ? ' \u00b7 ' : ''}
                <a href={row.link_url} target="_blank" rel="noopener noreferrer" className="underline break-all">
                  {row.link_url}
                </a>
              </>
            )}
          </p>
        )}
      </div>

      {row.photo_url && (
        <img
          src={row.photo_url}
          alt="The piece in question"
          className="w-28 h-28 rounded-xl object-cover border border-[var(--space-border-default)]"
          loading="lazy"
          width={112}
          height={112}
        />
      )}

      {row.status === 'error' ? (
        <div className={`${tw.card.flat} rounded-2xl p-4`}>
          <p className={`${typography.size.sm} text-[var(--space-semantic-danger)]`}>
            This one failed: {row.error_message || 'something went wrong.'} Run it again from the entry points above.
          </p>
        </div>
      ) : unified ? (
        <UnifiedResultView
          result={unified.result}
          profileOn={unified.profileOn}
          onOpenBrand={onOpenBrand}
          compareList={compareList}
          onToggleCompare={onToggleCompare}
        />
      ) : result?.kind === 'find' ? (
        <FindResultView row={row} result={result} />
      ) : result?.kind === 'review' ? (
        <ReviewResultView result={result} />
      ) : (
        <p className={`${typography.size.sm} ${typography.color.muted}`}>Beau is still working on this one…</p>
      )}

      {/* Research workspace: tag + note, persisted between sessions */}
      <div className={`${tw.card.default} rounded-2xl p-4`}>
        <h4 className={`${typography.size.base} ${typography.weight.semibold} ${typography.color.primary} flex items-center gap-1.5`}>
          <StickyNote className={`w-4 h-4 ${tw.icon.primary}`} />
          Your research notes
        </h4>
        <p className={`${typography.size.xs} ${typography.color.muted} mt-0.5 mb-3`}>
          Tag it and jot your thinking — both are kept for next time.
        </p>
        <TagPicker value={meta?.tag ?? null} onChange={(tag) => void onSaveMeta(row.id, { tag })} />
        <div className="mt-3">
          <NoteEditor value={meta?.note || ''} onSave={(note) => onSaveMeta(row.id, { note })} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// History helpers
// ---------------------------------------------------------------------------

/** History-row summary + status (HTML reference): "4 picks · saved to history"
 * left of an uppercase status word — Reviewed for hunts, Verdict for reviews. */
function huntRowMeta(row: ScoutHuntRow): { detail: string; status: string } {
  if (row.status === 'pending') return { detail: 'Beau is on it…', status: 'Working' };
  if (row.status === 'error') return { detail: row.error_message || 'Didn’t complete — open to retry', status: 'Failed' };
  // Unified Find rows (the merged Find/Match/Judge) carry their own meta.
  const unified = parseUnifiedResult(row);
  if (unified) return unifiedRowMeta(unified);
  const result = parseScoutResult(row);
  if (result?.kind === 'find') {
    const n = result.recommendations.length;
    return { detail: `${n} pick${n === 1 ? '' : 's'} from Beau`, status: 'Reviewed' };
  }
  if (result?.kind === 'review') {
    const label = VERDICT_STYLE[result.verdict]?.label || 'Weighed up';
    return { detail: `Verdict: ${label.toLowerCase()}`, status: 'Verdict' };
  }
  return { detail: '', status: row.status === 'complete' ? 'Closed' : '' };
}

/** Display title for a history row — smart, descriptive, Claude-style.
 * Older rows stored the RAW query as their title, so the smart title is
 * derived at render time from the stored content (which retroactively
 * upgrades existing entries with no migration); rows the summariser cannot
 * improve keep their stored text. Search and "Run again" still use the raw
 * `query`/`title` fields — only the display name changes. */
function huntRowTitle(row: ScoutHuntRow, fallback: string = 'Scout request'): string {
  return smartTitle(row.title || row.query || '') || row.title || row.query || fallback;
}

/** Best-effort brand for the sheet view: first recommendation's brand on hunts. */
function huntBrand(row: ScoutHuntRow): string {
  const result = parseScoutResult(row);
  if (result?.kind === 'find' && result.recommendations.length > 0) {
    return result.recommendations[0].brand || '';
  }
  return '';
}

function matchesKeyword(row: ScoutHuntRow, meta: ScoutMetaRow | undefined, keyword: string): boolean {
  const q = keyword.trim().toLowerCase();
  if (!q) return true;
  const haystack = [row.title, row.query, row.link_url, meta?.note, huntBrand(row), categoryLabel(row.category)]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

// Your Hunt History carries NO illustration — not in its empty state and not
// in its rows. A drawing here stood in for a record that does not exist yet,
// which is exactly what illustrations are not for; the words carry it.
function ScoutEmptyState() {
  return (
    <div className="text-center py-10">
      <p className={`${typography.size.sm} ${typography.color.primary} font-medium`}>Nothing hunted yet</p>
      <p className={`${typography.size.xs} ${typography.color.muted} mt-1 max-w-xs mx-auto`}>
        Ask Beau anything on the Find sub-tab — every hunt, dossier and verdict is kept here.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// History — list view (grouped by category)
// ---------------------------------------------------------------------------

function HistoryList({
  rows,
  metaByHunt,
  onOpen,
  onDelete,
  onRerun,
}: {
  rows: ScoutHuntRow[];
  metaByHunt: Map<number, ScoutMetaRow>;
  onOpen: (id: number) => void;
  /** Remove one hunt/review from the history (Pass Forty-Four). */
  onDelete: (id: number) => Promise<void>;
  /** Re-run a row's query through the unified Find (re-runnable history). */
  onRerun: (row: ScoutHuntRow) => void;
}) {
  const groups = useMemo(() => {
    const byCat = new Map<string, ScoutHuntRow[]>();
    for (const row of rows) {
      const key = row.category || 'other';
      const list = byCat.get(key) || [];
      list.push(row);
      byCat.set(key, list);
    }
    const ordered: Array<{ id: string; label: string; rows: ScoutHuntRow[] }> = [];
    for (const cat of WARDROBE_CATEGORIES) {
      const list = byCat.get(cat.id);
      if (list && list.length > 0 && cat.id !== 'other') {
        ordered.push({ id: cat.id, label: cat.label, rows: list });
        byCat.delete(cat.id);
      }
    }
    for (const [key, list] of byCat) {
      ordered.push({ id: key, label: key === 'other' ? 'Other' : categoryLabel(key), rows: list });
    }
    return ordered;
  }, [rows]);

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.id}>
          <p className={`${typography.size.xs} uppercase tracking-wide ${typography.weight.medium} ${typography.color.secondary} mb-1.5`}>
            {group.label}
          </p>
          <ul className="space-y-1.5">
            {group.rows.map((row) => {
              const meta = metaByHunt.get(row.id);
              return (
                <li key={row.id}>
                  <div className={`w-full ${tw.card.default} rounded-xl px-3.5 py-2.5 flex items-center gap-3 group`}>
                    <button
                      type="button"
                      onClick={() => onOpen(row.id)}
                      className="flex-1 min-w-0 flex items-center gap-3 text-left"
                    >
                      <span className={`${tw.badge.default} ${row.mode === 'find' ? tw.badge.primary : tw.badge.accent} flex-shrink-0`}>
                        {row.mode === 'find' ? 'Hunt' : 'Review'}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className={`block ${typography.size.sm} ${typography.weight.medium} ${typography.color.primary} truncate`}>
                          {huntRowTitle(row)}
                        </span>
                        <span className={`block ${typography.size.xs} ${typography.color.muted} truncate`}>
                          {formatDate(row.created_at)}
                          {row.status === 'error' ? ' \u00b7 failed' : row.status === 'pending' ? ' \u00b7 in progress' : ''}
                          {meta?.note ? ' \u00b7 has note' : ''}
                        </span>
                      </span>
                    </button>
                    <TagBadge tag={meta?.tag} />
                    {/* Run again — the re-runnable history (Recommendation
                        Engine overhaul): fires the same query through Find. */}
                    {(row.query || row.title) && (
                      <button
                        type="button"
                        onClick={() => onRerun(row)}
                        className="flex-shrink-0 text-[var(--color-accent-700,#7c4a17)] hover:underline"
                        style={{ fontFamily: 'var(--space-font-family)', fontSize: '12px' }}
                        aria-label={`Run “${row.title || row.query || 'this hunt'}” again`}
                      >
                        Run again
                      </button>
                    )}
                    {/* Remove — plain Lora 12px text link (Pass Forty-Four) */}
                    <button
                      type="button"
                      onClick={() => void onDelete(row.id)}
                      className="flex-shrink-0 text-[var(--color-neutral-500,#a68e70)] hover:text-[var(--color-accent-700,#7c4a17)] hover:underline"
                      style={{ fontFamily: 'var(--space-font-family)', fontSize: '12px' }}
                      aria-label={`Remove “${row.title || row.query || 'Scout request'}” from history`}
                    >
                      Remove
                    </button>
                    <button type="button" onClick={() => onOpen(row.id)} aria-label="Open" className="flex-shrink-0">
                      <ChevronRight className="w-4 h-4 text-[var(--space-text-muted)] group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// History — sheet view (structured table; read + tag/note editing only)
// ---------------------------------------------------------------------------

function SheetView({
  rows,
  metaByHunt,
  onOpen,
  onSaveMeta,
}: {
  rows: ScoutHuntRow[];
  metaByHunt: Map<number, ScoutMetaRow>;
  onOpen: (id: number) => void;
  onSaveMeta: (huntId: number, patch: { tag?: ScoutTag | null; note?: string }) => Promise<void>;
}) {
  const [noteRowId, setNoteRowId] = useState<number | null>(null);

  // Category order mirrors the wardrobe tracker.
  const ordered = useMemo(() => {
    const rank = new Map<string, number>(WARDROBE_CATEGORIES.map((c, i) => [c.id, i]));
    return [...rows].sort((a, b) => {
      const ra = rank.get(a.category || 'other') ?? 99;
      const rb = rank.get(b.category || 'other') ?? 99;
      if (ra !== rb) return ra - rb;
      return (b.created_at || '').localeCompare(a.created_at || '');
    });
  }, [rows]);

  return (
    <div className={`${tw.card.default} rounded-2xl overflow-hidden`}>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse" style={{ minWidth: '640px' }}>
          <thead>
            <tr className="border-b border-[var(--space-border-default)] bg-[var(--space-surface-muted)]">
              {['Item', 'Brand', 'Category', 'Tag', 'Scouted', ''].map((h, i) => (
                <th key={i} className={`px-3 py-2 ${typography.size.xs} uppercase tracking-wide ${typography.weight.medium} ${typography.color.muted} whitespace-nowrap`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--space-border-default)]">
            {ordered.map((row) => {
              const meta = metaByHunt.get(row.id);
              const noteOpen = noteRowId === row.id;
              return (
                <Fragment key={row.id}>
                  <tr className="align-top">
                    <td className="px-3 py-2.5 max-w-[220px]">
                      <button
                        type="button"
                        onClick={() => onOpen(row.id)}
                        className={`${typography.size.sm} ${typography.weight.medium} ${typography.color.primary} hover:underline text-left leading-snug`}
                        title="Open this hunt"
                      >
                        {huntRowTitle(row)}
                      </button>
                      <span className={`block ${typography.size.xs} ${typography.color.muted}`} style={{ fontSize: '10px' }}>
                        {row.mode === 'find' ? 'Hunt' : 'Review'}
                      </span>
                    </td>
                    <td className={`px-3 py-2.5 ${typography.size.xs} ${typography.color.secondary} whitespace-nowrap`}>
                      {huntBrand(row) || '\u2014'}
                    </td>
                    <td className={`px-3 py-2.5 ${typography.size.xs} ${typography.color.secondary} whitespace-nowrap`}>
                      {categoryLabel(row.category) || 'Other'}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <TagPicker compact value={meta?.tag ?? null} onChange={(tag) => void onSaveMeta(row.id, { tag })} />
                    </td>
                    <td className={`px-3 py-2.5 ${typography.size.xs} ${typography.color.muted} whitespace-nowrap`}>
                      {formatDate(row.created_at)}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setNoteRowId(noteOpen ? null : row.id)}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg ${typography.size.xs} border transition-colors ${
                          meta?.note
                            ? 'border-[var(--space-brand-primary-200)] bg-[var(--space-surface-accent-soft)] text-[var(--space-text-brand)]'
                            : 'border-[var(--space-border-default)] text-[var(--space-text-muted)] hover:border-[var(--space-border-strong)]'
                        }`}
                        title={meta?.note ? 'Edit note' : 'Add note'}
                      >
                        <StickyNote className="w-3 h-3" />
                        {meta?.note ? 'Note' : 'Add'}
                      </button>
                    </td>
                  </tr>
                  {noteOpen && (
                    <tr>
                      <td colSpan={6} className="px-3 pb-3 pt-0 bg-[var(--space-surface-muted)]">
                        <div className="pt-2.5 max-w-lg">
                          <NoteEditor compact value={meta?.note || ''} onSave={(note) => onSaveMeta(row.id, { note })} />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// History sub-page — filters + list/sheet toggle
// ---------------------------------------------------------------------------

function ScoutHistory({
  rows,
  metaByHunt,
  onOpen,
  onSaveMeta,
  onDelete,
  onRerun,
  clearControl,
}: {
  rows: ScoutHuntRow[];
  metaByHunt: Map<number, ScoutMetaRow>;
  onOpen: (id: number) => void;
  onSaveMeta: (huntId: number, patch: { tag?: ScoutTag | null; note?: string }) => Promise<void>;
  /** Remove one hunt/review from the history (Pass Forty-Four). */
  onDelete: (id: number) => Promise<void>;
  /** Re-run a row's query through the unified Find. */
  onRerun: (row: ScoutHuntRow) => void;
  /** The "Clear history" affordance, rendered in the header row. */
  clearControl?: React.ReactNode;
}) {
  const [layout, setLayout] = useState<'list' | 'sheet'>('list');
  const [catFilter, setCatFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [keyword, setKeyword] = useState('');

  const filtered = useMemo(
    () =>
      rows.filter((row) => {
        if (catFilter !== 'all' && (row.category || 'other') !== catFilter) return false;
        const meta = metaByHunt.get(row.id);
        if (tagFilter !== 'all' && (meta?.tag || '') !== tagFilter) return false;
        return matchesKeyword(row, meta, keyword);
      }),
    [rows, metaByHunt, catFilter, tagFilter, keyword],
  );

  const usedCategories = useMemo(() => {
    const ids = new Set(rows.map((r) => r.category || 'other'));
    return WARDROBE_CATEGORIES.filter((c) => ids.has(c.id));
  }, [rows]);

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h3 className={`hab-section-head ${typography.color.primary}`}>
              Your Hunt History
            </h3>
            <p className={`${typography.size.xs} ${typography.color.muted} mt-0.5`}>
              Every hunt and verdict, kept with your tags and notes — research that builds over time.
            </p>
          </div>
          <span className="inline-flex items-center gap-4 flex-wrap">
          {clearControl}
          {rows.length > 0 && (
            <div className="inline-flex rounded-lg border border-[var(--space-border-default)] overflow-hidden">
              {([
                { id: 'list', label: 'List', Icon: LayoutList },
                { id: 'sheet', label: 'Sheet', Icon: Table2 },
              ] as const).map(({ id, label: viewLabel, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setLayout(id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 ${typography.size.xs} transition-colors ${
                    layout === id
                      ? 'bg-[var(--space-surface-accent-soft)] text-[var(--space-brand-primary-700)] font-medium ring-1 ring-inset ring-[var(--space-brand-primary)]'
                      : 'bg-[var(--space-surface-card)] text-[var(--space-text-secondary)] hover:bg-[var(--space-surface-muted)]'
                  }`}
                  aria-pressed={layout === id}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {viewLabel}
                </button>
              ))}
            </div>
          )}
          </span>
        </div>
      </div>

      {rows.length === 0 ? (
        <ScoutEmptyState />
      ) : (
        <>
          {/* Filters: category, tag, keyword */}
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value)}
              className={`px-2.5 py-1.5 rounded-lg border border-[var(--space-border-default)] bg-[var(--space-surface-card)] ${typography.size.xs} text-[var(--space-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--space-brand-primary)]`}
              aria-label="Filter by category"
            >
              <option value="all">All categories</option>
              {usedCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
            <span className="inline-flex items-center gap-1">
              <button
                type="button"
                onClick={() => setTagFilter('all')}
                className={`px-2.5 py-1 rounded-full border ${typography.size.xs} transition-colors ${
                  tagFilter === 'all'
                    ? 'bg-[var(--space-surface-accent-soft)] text-[var(--space-brand-primary-700)] border-[var(--space-brand-primary)]'
                    : 'border-[var(--space-border-default)] text-[var(--space-text-muted)] hover:border-[var(--space-border-strong)]'
                }`}
              >
                All tags
              </button>
              {TAGS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTagFilter(tagFilter === t.id ? 'all' : t.id)}
                  className={`px-2.5 py-1 rounded-full border ${typography.size.xs} transition-colors ${tagFilter === t.id ? t.cls : t.idleCls}`}
                >
                  {t.label}
                </button>
              ))}
            </span>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Search hunts, notes, brands…"
              className={`flex-1 min-w-[160px] px-3 py-1.5 rounded-lg border border-[var(--space-border-default)] bg-[var(--space-surface-card)] ${typography.size.xs} focus:outline-none focus:ring-1 focus:ring-[var(--space-brand-primary)]`}
              aria-label="Search scout history"
            />
          </div>

          {filtered.length === 0 ? (
            <p className={`${typography.size.sm} ${typography.color.muted} py-6 text-center`}>
              Nothing matches those filters — clear one and try again.
            </p>
          ) : layout === 'list' ? (
            <HistoryList rows={filtered} metaByHunt={metaByHunt} onOpen={onOpen} onDelete={onDelete} onRerun={onRerun} />
          ) : (
            <SheetView rows={filtered} metaByHunt={metaByHunt} onOpen={onOpen} onSaveMeta={onSaveMeta} />
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The Hunt root — the brand & piece intelligence hub (Recommendation
// Engine overhaul): ONE profile toggle at the top, then exactly FOUR
// internal sub-tabs on a horizontal chip bar:
//   Find · Discover · Compare · Matrix
//  - Find: the unified search (hunt-find) — Find + Match + Judge merged;
//    Beau reads the intent and answers in the right form. The FULL Hunt
//    History (filters, list/sheet, re-runnable) lives beneath the input —
//    the old separate history sub-tab is retired.
//  - Discover: the maker directory table with filter chips (hunt-discover).
//  - Compare: 2–3 brands side by side + Beau's verdict (hunt-tools).
//  - Matrix: the quality/longevity scatter, built from Discover (hunt-tools).
// "Plan a Trip" moved to The Ledger (App.tsx). The old Match and Judge
// sub-tabs merged into Find — their deep links normalise to it.
// The PROFILE TOGGLE persists for the session (brands.ts) and applies
// across every sub-tab: ON, Beau reasons with the full user context
// (archetypes, budget, skin tone, measurements, wardrobe); OFF, general
// knowledge only — nothing personal is read.
// ---------------------------------------------------------------------------

type HuntSubTab = 'find' | 'discover' | 'compare' | 'matrix';

const HUNT_SUB_TABS: Array<{ id: HuntSubTab; label: string; tourAnchor?: string }> = [
  // The first-run walkthrough (onboarding-tour.tsx) rings Find and Discover.
  { id: 'find', label: 'Find', tourAnchor: 'tour-hunt-find' },
  { id: 'discover', label: 'Discover', tourAnchor: 'tour-hunt-discover' },
  { id: 'compare', label: 'Compare' },
  { id: 'matrix', label: 'Matrix' },
];

/** Normalise a requested sub-tab, mapping retired ids to their new homes:
 * 'match' and 'judge' merged into the unified Find; 'trip' moved to The
 * Ledger; 'history' now lives INSIDE Find — so a stale deep link lands on
 * Find rather than a dead end. */
function normalizeHuntSubTab(value: string | null | undefined): HuntSubTab | null {
  if (!value) return null;
  if (HUNT_SUB_TABS.some((t) => t.id === value)) return value as HuntSubTab;
  if (value === 'match' || value === 'judge' || value === 'trip' || value === 'history') return 'find';
  return null;
}

export function ScoutTab({
  profile,
  budgets,
  pieces,
  prefs = null,
}: {
  profile: StyleProfile | null;
  budgets: Record<string, CategoryBudget>;
  pieces: WardrobePiece[];
  prefs?: StylePrefs | null;
}) {
  const { data: rows, loading: rowsLoading, refresh } = window.useWorkspaceDB<ScoutHuntRow>('scout_hunts', {
    orderBy: { column: 'created_at', direction: 'desc' },
    limit: 60,
  });
  const { data: metaRows, refresh: refreshMeta } = window.useWorkspaceDB<ScoutMetaRow>('scout_item_meta', {
    orderBy: { column: 'created_at', direction: 'desc' },
    limit: 100,
  });

  // Optimistic tag overlay: the sheet-view pills confirm INSTANTLY on tap,
  // while the WorkspaceDB write + refresh happen in the background.
  const [optimisticTags, setOptimisticTags] = useState<Record<number, string | null>>({});

  const metaByHunt = useMemo(() => {
    const map = new Map<number, ScoutMetaRow>();
    // Rows come newest-first; keep the FIRST (latest) row per hunt.
    for (const m of metaRows || []) {
      if (!map.has(m.hunt_id)) map.set(m.hunt_id, m);
    }
    for (const [huntIdStr, tag] of Object.entries(optimisticTags)) {
      const huntId = Number(huntIdStr);
      const existing = map.get(huntId);
      map.set(huntId, existing ? { ...existing, tag } : ({ id: -huntId, hunt_id: huntId, tag, note: null } as ScoutMetaRow));
    }
    return map;
  }, [metaRows, optimisticTags]);

  // The sub-tab on show — a handoff (The Rail's "Compare makers") can land
  // The Hunt on a specific sub-tab.
  const [subTab, setSubTab] = useState<HuntSubTab>(() => {
    const handoff = normalizeHuntSubTab(consumeHuntSubTabHandoff());
    return handoff ?? 'find';
  });

  // The PROFILE TOGGLE — session-persistent, applies to every sub-tab.
  const [profileOn, setProfileOn] = useState<boolean>(() => readProfileToggle());
  const setProfileToggle = (on: boolean) => {
    setProfileOn(on);
    writeProfileToggle(on);
  };

  // The Compare queue (max 3 brands) — session storage + live event.
  const [compareList, setCompareList] = useState<string[]>(() => readCompareSession());
  useEffect(() => {
    const onCompare = (e: Event) => {
      const brands = (e as CustomEvent).detail?.brands;
      setCompareList(Array.isArray(brands) ? brands : readCompareSession());
    };
    const onSubTab = (e: Event) => {
      const wanted = normalizeHuntSubTab((e as CustomEvent).detail?.subTab as string | undefined);
      if (wanted) {
        setSubTab(wanted);
        setSelectedId(null);
      }
    };
    window.addEventListener('ethaion:compare-changed', onCompare);
    window.addEventListener('ethaion:hunt-subtab', onSubTab);
    return () => {
      window.removeEventListener('ethaion:compare-changed', onCompare);
      window.removeEventListener('ethaion:hunt-subtab', onSubTab);
    };
  }, []);

  const toggleCompare = (brand: string) => {
    const queued = compareList.some((b) => b.toLowerCase() === brand.toLowerCase());
    setCompareList(queued ? removeFromCompare(brand) : addToCompare(brand));
  };

  // The Matrix selection — "Add to Matrix" on Discover rows builds a custom
  // Matrix view (session store + live event, same mechanics as Compare).
  const [matrixList, setMatrixList] = useState<string[]>(() => readMatrixSession());
  useEffect(() => {
    const onMatrix = (e: Event) => {
      const brands = (e as CustomEvent).detail?.brands;
      setMatrixList(Array.isArray(brands) ? brands : readMatrixSession());
    };
    window.addEventListener('ethaion:matrix-changed', onMatrix);
    return () => window.removeEventListener('ethaion:matrix-changed', onMatrix);
  }, []);

  const toggleMatrix = (brand: string) => {
    const queued = matrixList.some((b) => b.toLowerCase() === brand.toLowerCase());
    setMatrixList(queued ? removeFromMatrix(brand) : addToMatrix(brand));
  };

  // The shared Brand Dossier page — opened from Find, Discover, Compare and
  // Matrix (and the "Don't see a maker?" addition flow).
  const [openBrandName, setOpenBrandName] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  // Re-runnable history: a "Run again" tap hands the row's query to Find.
  const [rerunReq, setRerunReq] = useState<{ query: string; token: number } | null>(null);
  // Saved-tab promotions land here — either queued before The Hunt mounted,
  // or dispatched live while it's open. They always land on Find.
  const [findPrefill, setFindPrefill] = useState<string>(() => consumeScoutPrefill() || '');

  useEffect(() => {
    const onPrefill = (e: Event) => {
      const text = (e as CustomEvent).detail?.text as string | undefined;
      if (text) {
        setFindPrefill(text);
        setSubTab('find');
        setSelectedId(null);
      }
    };
    window.addEventListener('ethaion:scout-prefill', onPrefill);
    return () => window.removeEventListener('ethaion:scout-prefill', onPrefill);
  }, []);

  const selected = (rows || []).find((r) => r.id === selectedId) || null;


  const saveMeta = async (huntId: number, patch: { tag?: ScoutTag | null; note?: string }) => {
    // Tags confirm instantly (optimistic); notes keep their explicit save flow.
    if ('tag' in patch) setOptimisticTags((cur) => ({ ...cur, [huntId]: patch.tag ?? null }));
    const existing = metaByHunt.get(huntId);
    const fields: Record<string, unknown> = {};
    if ('tag' in patch) fields.tag = patch.tag ?? null;
    if ('note' in patch) fields.note = patch.note ?? null;
    try {
      if (existing && existing.id > 0) {
        await window.__workspaceDb.from('scout_item_meta').update(existing.id, fields);
      } else {
        await window.__workspaceDb.from('scout_item_meta').insert({
          hunt_id: huntId,
          tag: 'tag' in patch ? patch.tag ?? null : metaByHunt.get(huntId)?.tag ?? null,
          note: 'note' in patch ? patch.note ?? null : null,
        });
      }
    } catch (e) {
      // Roll the optimistic tag back on failure so the UI never lies.
      if ('tag' in patch) {
        setOptimisticTags((cur) => {
          const next = { ...cur };
          delete next[huntId];
          return next;
        });
      }
      throw e;
    }
    refreshMeta();
  };

  /** Re-run a history row's query through the unified Find (re-runnable
   * Hunt History — Recommendation Engine overhaul). */
  const rerunHunt = (row: ScoutHuntRow) => {
    const q = (row.query || row.title || '').trim();
    if (!q) return;
    setSelectedId(null);
    setSubTab('find');
    setRerunReq({ query: q, token: Date.now() });
  };

  const deleteHunt = async (id: number) => {
    await window.__workspaceDb.from('scout_hunts').delete(id);
    const meta = metaByHunt.get(id);
    if (meta) {
      try {
        await window.__workspaceDb.from('scout_item_meta').delete(meta.id);
      } catch { /* non-fatal */ }
      refreshMeta();
    }
    if (selectedId === id) setSelectedId(null);
    refresh();
  };

  // Clear history (Pass Forty-Four) — removes every hunt/review and its
  // tags/notes. A plain inline confirm, never a modal.
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);
  const [clearingHistory, setClearingHistory] = useState(false);
  const clearHistory = async () => {
    if (clearingHistory) return;
    setClearingHistory(true);
    try {
      for (const row of rows || []) {
        try {
          await window.__workspaceDb.from('scout_hunts').delete(row.id);
        } catch { /* one failed row shouldn't stop the sweep */ }
      }
      for (const m of metaRows || []) {
        try {
          await window.__workspaceDb.from('scout_item_meta').delete(m.id);
        } catch { /* non-fatal */ }
      }
      setSelectedId(null);
      refresh();
      refreshMeta();
    } finally {
      setClearingHistory(false);
      setConfirmClearHistory(false);
    }
  };

  // Sub-page: one persisted hunt/review (opened from Find, Judge or the
  // history) — takes over the whole tab until closed.
  if (selected) {
    return (
      <div className="px-5 py-5 max-w-3xl mx-auto w-full pb-24">
        <HuntDetail
          row={selected}
          meta={metaByHunt.get(selected.id)}
          onBack={() => setSelectedId(null)}
          onDelete={deleteHunt}
          onSaveMeta={saveMeta}
          onRerun={rerunHunt}
          onOpenBrand={setOpenBrandName}
          compareList={compareList}
          onToggleCompare={toggleCompare}
        />
      </div>
    );
  }

  const huntCount = (rows || []).length;

  // The "Clear history" affordance — a plain accent text link with a plain
  // inline confirm (Pass Forty-Four), rendered inside the embedded history's
  // header row on Find.
  const clearHistoryControl = huntCount > 0 ? (
    !confirmClearHistory ? (
      <button
        type="button"
        onClick={() => setConfirmClearHistory(true)}
        className="hover:underline"
        style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px', color: 'var(--color-accent,#a8712c)' }}
      >
        Clear history ›
      </button>
    ) : (
      <span className="inline-flex items-baseline gap-3" style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px' }}>
        <span className="text-[var(--color-neutral-700,#634e38)]">Clear every hunt and review?</span>
        <button
          type="button"
          onClick={() => void clearHistory()}
          disabled={clearingHistory}
          className="hover:underline disabled:opacity-50"
          style={{ color: 'var(--color-accent,#a8712c)' }}
        >
          {clearingHistory ? 'Clearing…' : 'Yes, clear it'}
        </button>
        <button
          type="button"
          onClick={() => setConfirmClearHistory(false)}
          disabled={clearingHistory}
          className="text-[var(--color-neutral-600,#856c51)] hover:underline disabled:opacity-50"
        >
          Keep
        </button>
      </span>
    )
  ) : null;

  return (
    <div className="pb-24">
      {/* Page heading row: heading + standfirst left, the PROFILE TOGGLE
          right (above the sub-tab bar — it applies to every sub-tab and
          persists for the session). */}
      <div className="px-6 sm:px-10 pt-[52px] pb-8 border-b border-[var(--color-divider,rgba(59,43,29,0.18))]">
        <div className="max-w-[1180px] mx-auto flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div className="min-w-0">
            <h3 className={`hab-page-title ${typography.color.primary}`} style={{ marginBottom: '14px' }}>The Hunt</h3>
            <p className={typography.color.primary} style={{ fontFamily: 'var(--space-font-family)', fontSize: '16px', lineHeight: 1.55, maxWidth: '54ch' }}>
              Everything you’re considering, in the order you’re considering it — spotted, weighed, held. Nothing
              here is yours yet; the research tools below help you decide.
            </p>
          </div>
          <div className="flex flex-col items-start sm:items-end gap-1.5 flex-shrink-0">
            <div className="flex" role="group" aria-label="Profile toggle">
              {([
                { on: true, label: 'Profile on' },
                { on: false, label: 'Profile off' },
              ] as const).map(({ on, label: toggleLabel }, i) => {
                const active = profileOn === on;
                return (
                  <button
                    key={toggleLabel}
                    type="button"
                    onClick={() => setProfileToggle(on)}
                    aria-pressed={active}
                    className={`uppercase h-[40px] px-4 grid place-items-center whitespace-nowrap transition-colors ${
                      active
                        ? 'border border-[var(--color-accent,#a8712c)] bg-[var(--color-accent-100,#fbf1de)] text-[var(--color-accent-800,#5c3413)]'
                        : 'border border-[var(--color-divider,rgba(59,43,29,0.18))] text-[var(--color-neutral-700,#634e38)] hover:text-[var(--space-text-primary)]'
                    } ${i > 0 ? 'border-l-0' : ''}`}
                    style={{ fontFamily: 'var(--space-font-heading)', fontSize: '12px', letterSpacing: '0.12em' }}
                  >
                    {toggleLabel}
                  </button>
                );
              })}
            </div>
            <span className={`${typography.size.xs} ${typography.color.muted} sm:text-right max-w-[34ch]`}>
              {profileOn
                ? 'Beau reasons with your full profile — archetypes, budget, skin tone, measurements, wardrobe.'
                : 'General knowledge only — nothing personal is read.'}
            </span>
          </div>
        </div>
      </div>

      {/* THE PIPELINE — Spotted · Weighed · Held on ONE screen (7a): the
          Rail / Hunt / Reserve funnel consolidated. A candidate is one
          record at one stage; every count below derives from it. */}
      <div className="px-6 sm:px-10 py-8 border-b border-[var(--color-divider,rgba(59,43,29,0.18))]">
        <div className="max-w-[1180px] mx-auto">
          <HuntStages />
        </div>
      </div>

      {/* The sub-tab bar — the SHARED component (sub-tabs.tsx), identical to
          The Rail's: same font, weight, active/inactive treatment, spacing
          and colour, horizontally scrollable on mobile. */}
      <div className="border-b border-[var(--color-divider,rgba(59,43,29,0.18))]">
        <SubTabs
          items={HUNT_SUB_TABS.map(({ id, label: subLabel, tourAnchor }) => ({
            id,
            label: subLabel,
            suffix: id === 'compare' && compareList.length > 0 ? ` · ${compareList.length}` : undefined,
            tourAnchor,
          }))}
          active={subTab}
          onChange={(id) => {
            setSubTab(id);
            setSelectedId(null);
          }}
          ariaLabel="The Hunt sections"
          className="max-w-[1180px] mx-auto px-6 sm:px-10 py-3"
        />
      </div>

      {/* FIND — the unified search (Find + Match + Judge merged): one input,
          Beau routes the intent; recent hunts listed beneath. */}
      {subTab === 'find' && (
        <div className="px-6 sm:px-10 py-8 max-w-[1180px] mx-auto w-full">
          <FindSubTab
            profileOn={profileOn}
            profile={profile}
            budgets={budgets}
            pieces={pieces}
            prefs={prefs}
            prefill={findPrefill}
            rerun={rerunReq}
            onLogged={refresh}
            onOpenBrand={setOpenBrandName}
            compareList={compareList}
            onToggleCompare={toggleCompare}
          />

          {/* YOUR HUNT HISTORY — the full filterable, RE-RUNNABLE record,
              embedded right beneath the input: hunt history lives HERE,
              inside Find (the separate history sub-tab is retired). */}
          <section aria-label="Your Hunt History" className="mt-10">
            {rowsLoading && huntCount === 0 ? (
              /* History loading — shimmer hairline rows, never a blank area */
              <HairlineRowsSkeleton rows={4} />
            ) : (
              <ScoutHistory
                rows={rows || []}
                metaByHunt={metaByHunt}
                onOpen={setSelectedId}
                onSaveMeta={saveMeta}
                onDelete={deleteHunt}
                onRerun={rerunHunt}
                clearControl={clearHistoryControl}
              />
            )}
          </section>

          <div className="flex justify-end mt-4">
            <button
              type="button"
              onClick={() => openApp('maker-scout')}
              className={`${typography.size.xs} ${typography.color.brand} hover:underline`}
              title="Structured artisan-maker discovery with cost-per-wear analysis"
            >
              Prefer a structured maker hunt? →
            </button>
          </div>
        </div>
      )}

      {/* DISCOVER — the maker directory table: chip filters, source tags,
          Beau ratings, Add to Compare / Add to Matrix. */}
      {subTab === 'discover' && (
        <div className="px-6 sm:px-10 py-8 max-w-[1180px] mx-auto w-full">
          <DiscoverSubTab
            profileOn={profileOn}
            profile={profile}
            onOpenBrand={setOpenBrandName}
            compareList={compareList}
            onToggleCompare={toggleCompare}
            matrixList={matrixList}
            onToggleMatrix={toggleMatrix}
          />
        </div>
      )}

      {/* COMPARE — side-by-side brand comparison + Beau's verdict. */}
      {subTab === 'compare' && (
        <div className="px-6 sm:px-10 py-8 max-w-[1180px] mx-auto w-full">
          <CompareSubTab
            profileOn={profileOn}
            profile={profile}
            budgets={budgets}
            pieces={pieces}
            prefs={prefs}
            compareList={compareList}
            onRemove={(brand) => setCompareList(removeFromCompare(brand))}
            onClear={() => {
              clearCompare();
              setCompareList([]);
            }}
            onOpenBrand={setOpenBrandName}
            onGoDiscover={() => setSubTab('discover')}
          />
        </div>
      )}

      {/* MATRIX — the quality/longevity scatter, built from Discover. */}
      {subTab === 'matrix' && (
        <div className="px-6 sm:px-10 py-8 max-w-[1180px] mx-auto w-full">
          <MatrixSubTab
            onOpenBrand={setOpenBrandName}
            matrixList={matrixList}
            onToggleMatrix={toggleMatrix}
            onClearMatrix={() => {
              clearMatrix();
              setMatrixList([]);
            }}
            onGoDiscover={() => setSubTab('discover')}
          />
        </div>
      )}

      {/* The shared Brand Dossier page — full-screen overlay. */}
      {openBrandName && (
        <BrandDetailSheet
          brandName={openBrandName}
          onClose={() => setOpenBrandName(null)}
          compareList={compareList}
          onToggleCompare={toggleCompare}
        />
      )}
    </div>
  );
}
