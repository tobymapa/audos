/**
 * THE HUNT — the consolidated candidate pipeline (design handoff §Hunt,
 * screens 7a · 12a · M5). Rail / Hunt / Reserve as separate surfaces are
 * retired; a candidate is ONE record (radar_items) with ONE stage, and this
 * screen shows the whole funnel:
 *
 *   SPOTTED  — noted, not yet evaluated
 *   WEIGHED  — under consideration (max FOUR at once — a fifth candidate
 *              drops the oldest back to Spotted, stated when it happens)
 *   HELD     — decided; waiting on size, sale or season
 *
 * Two ways out, both reversible, drawn apart (12a):
 *   PASSED   — an opinion, with an optional reason — Beau won't re-raise it
 *   ARCHIVED — silence: untouched ninety days, off the shelf, not deleted
 *
 * Stage + origin + reason live in the candidate_meta companion table
 * (radar_items cannot gain a column). Rows with no meta yet derive their
 * stage from the old model: price/restock-watched → Held, else Spotted.
 *
 * The add entry point takes a PASTED PRODUCT URL and parses maker + piece
 * (candidate-url.ts — asphalte.com/products/the-fishermans-jacket files
 * maker "Asphalte", piece "The Fisherman's Jacket"); when parsing can't
 * read the page, the manual form is right there — nothing wrong is saved
 * silently. Every candidate card carries HOW IT GOT HERE (origin · date)
 * and the reason it exists — a recommendation without a reason is an advert.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ExternalLink, Link2, Loader2, RotateCcw, X } from 'lucide-react';
import { typography } from '../../lib/colors';
import {
  RESERVE_CHANGED_EVENT,
  categoryLabel,
  fetchStyleMeasurements,
  insertRadarItem,
  radarToWardrobe,
  type RadarItem,
  type StyleMeasurements,
  type WardrobePiece,
} from './profile-data';
import { parseCandidateUrl } from './candidate-url';
import { findCatalogBrand, beauRating, normalizeBeauRating, type BeauRating, type DirectoryBrandRow } from './brands';
import { fetchProductImage } from './og-image';
import { MONO, capWord, numberWord, usePlexMono } from './mono-type';
import { ViewToggle } from './view-toggle';
import { HuntWeighedMap, type HuntMapCandidate } from './hunt-map';
import { requestFittingRoomTryOn } from './fitting-room-state';

// window.__workspaceDb is auto-injected by the platform compiler when it sees
// this literal token in app source.
function db(): any {
  return (window as any).__workspaceDb;
}

// ---------------------------------------------------------------------------
// The model — one candidate = radar row + stage meta.
// ---------------------------------------------------------------------------

export type CandidateStage = 'spotted' | 'weighed' | 'held' | 'passed' | 'archived';

interface CandidateMetaRow {
  id: number;
  radar_id: number;
  stage: string;
  origin: string | null;
  reason: string | null;
  passed_reason: string | null;
  stage_changed_at: string | null;
  created_at?: string;
}

export interface Candidate {
  item: RadarItem;
  meta: CandidateMetaRow | null;
  stage: CandidateStage;
  /** True when the stage was derived by the ninety-day rule, not stored. */
  autoArchived: boolean;
  origin: string;
  originDate: string | null;
  reason: string | null;
  /** Whole days since the candidate was last touched — drives the eighty-day
   * warning and the ninety-day auto-archive (12a). */
  daysUntouched: number;
}



const DAY_MS = 24 * 60 * 60 * 1000;
const NINETY_DAYS_MS = 90 * DAY_MS;
/** The warning shows from day eighty — ten days before the silence. */
const AUTO_ARCHIVE_WARN_DAYS = 80;
const AUTO_ARCHIVE_REASON = 'No activity for 90 days';
const WEIGHED_CAP = 4;

// ---------------------------------------------------------------------------
// WEIGHED — the deep-comparison facts (7a · 19a). The Weighed stage IS the
// comparison view (founder's correction — the separate Compare / Matrix
// sub-tabs are retired): a desktop table of the decisive rows per candidate,
// and a second view that PLOTS them — two axes, one dot per candidate.
// Everything below derives from records the app already holds; where a fact
// is genuinely unknown the row says so honestly instead of guessing.
// ---------------------------------------------------------------------------

/** A parsed numeric price from the free-text price_seen ("€189", "£85.00"). */
function parsePrice(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const match = String(raw).replace(/[,\s]/g, '').match(/(\d+(?:\.\d+)?)/);
  const value = match ? Number(match[1]) : NaN;
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Which owned categories a candidate of this category pairs with — the
 * basis of the "what it finishes" read. */
const PAIRS_WITH: Record<string, string[]> = {
  shoes: ['tops', 'bottoms', 'knitwear'],
  bottoms: ['tops', 'shoes', 'knitwear'],
  tops: ['bottoms', 'shoes', 'outerwear', 'knitwear'],
  knitwear: ['bottoms', 'shoes', 'tops'],
  sweatshirts: ['bottoms', 'shoes'],
  outerwear: ['tops', 'bottoms', 'knitwear'],
  formalwear: ['bottoms', 'shoes', 'tops'],
  accessories: ['tops', 'bottoms', 'shoes', 'outerwear'],
};

function worksWithCount(category: string | null | undefined, pieces: WardrobePiece[]): number {
  const partners = PAIRS_WITH[(category || '').toLowerCase()] || ['tops', 'bottoms', 'shoes'];
  return pieces.filter((p) => partners.includes((p.category || '').toLowerCase())).length;
}

/** The fit row, read from the dossier's sizes — and honest when they are
 * missing (14a: a missing size is the difference between advice and a
 * guess). */
function fitNoteFor(category: string | null | undefined, m: StyleMeasurements | null): string {
  const cat = (category || '').toLowerCase();
  if (cat === 'shoes') {
    return m?.shoe_size
      ? `Judged against your usual ${m.shoe_size}${m.shoe_size_system ? ` ${m.shoe_size_system}` : ''}.`
      : 'No shoe size in The Dossier yet — this row is guesswork until you add it.';
  }
  if (cat === 'bottoms') {
    return m?.waist_cm
      ? `Against your ${m.waist_cm} waist${m.inseam_cm ? ` · ${m.inseam_cm} inseam` : ''}.`
      : 'No trouser waist in The Dossier yet — add it and this row gets specific.';
  }
  return m?.clothing_size
    ? `Against your usual ${m.clothing_size}.`
    : 'No sizes in The Dossier yet — add them and this row stops being guesswork.';
}

interface WeighedFacts {
  candidate: Candidate;
  price: number | null;
  tier: BeauRating | null;
  tierNote: string;
  fit: string;
  finishes: number;
  make: string;
  boards: number;
}

/** Beau's tier for the candidate's maker — the persisted directory rating
 * first, the verified catalog next, honestly blank for an unrated maker. */
function tierFor(brand: string | null | undefined, directoryRows: DirectoryBrandRow[]): { tier: BeauRating | null; note: string } {
  const name = (brand || '').trim().toLowerCase();
  if (!name) return { tier: null, note: '' };
  const row = directoryRows.find((r) => (r.brand || '').trim().toLowerCase() === name);
  const fromRow = normalizeBeauRating(row?.rating);
  if (fromRow) return { tier: fromRow, note: row?.rating_note || '' };
  const catalog = findCatalogBrand(name);
  if (catalog) {
    const { rating, note } = beauRating(catalog);
    return { tier: rating, note };
  }
  return { tier: null, note: '' };
}

/** How a legacy row (no meta) reads: watching → held, else spotted. */
function derivedStage(item: RadarItem): CandidateStage {
  return item.watch_price || item.watch_restock ? 'held' : 'spotted';
}

function originFor(item: RadarItem, meta: CandidateMetaRow | null): string {
  if (meta?.origin) return meta.origin;
  const source = (item.source || '').toLowerCase();
  if (source.includes('beau') || source.includes('pick') || source.includes('curated') || source.includes('rail')) return "Beau's pick";
  if (source.includes('fitting') || source.includes('board')) return 'From a board';
  if (source.includes('edit') || source.includes('gap')) return 'From The Edit';
  if (source.includes('paste') || source.includes('url') || source.includes('link')) return 'You pasted it';
  return 'You added it';
}

function composeCandidates(items: RadarItem[], metas: CandidateMetaRow[]): Candidate[] {
  const metaByRadar = new Map<number, CandidateMetaRow>();
  for (const m of metas) {
    const existing = metaByRadar.get(m.radar_id);
    if (!existing || m.id > existing.id) metaByRadar.set(m.radar_id, m);
  }
  const now = Date.now();
  return items.map((item) => {
    const meta = metaByRadar.get(item.id) || null;
    let stage = (meta?.stage as CandidateStage) || derivedStage(item);
    let autoArchived = false;
    const touched = meta?.stage_changed_at || meta?.created_at || item.created_at;
    const touchedMs = touched ? new Date(touched).getTime() : now;
    const daysUntouched = Math.max(0, Math.floor((now - touchedMs) / DAY_MS));
    // The ninety-day rule (12a): an untouched spotted/weighed candidate goes
    // quiet — no opinion recorded, off the shelf, never deleted.
    if (stage === 'spotted' || stage === 'weighed') {
      if (now - touchedMs > NINETY_DAYS_MS) {
        stage = 'archived';
        autoArchived = true;
      }
    }
    return {
      item,
      meta,
      stage,
      autoArchived,
      origin: originFor(item, meta),
      originDate: meta?.created_at || item.created_at || null,
      reason: meta?.reason || item.notes || null,
      daysUntouched,
    };
  });
}

/** Write a candidate's stage (insert-or-update its meta row). Exported so
 * other surfaces (the Fitting's "file in The Hunt", The Edit's gap links)
 * move the SAME record instead of keeping copies. */
export async function setCandidateStage(
  radarId: number,
  stage: CandidateStage,
  patch: { origin?: string | null; reason?: string | null; passed_reason?: string | null } = {},
): Promise<void> {
  const now = new Date().toISOString();
  try {
    const { data } = await db().from('candidate_meta').orderBy('created_at', 'desc').limit(200).get();
    const existing = (data || []).find((row: CandidateMetaRow) => Number(row.radar_id) === Number(radarId));
    if (existing) {
      await db().from('candidate_meta').update(existing.id, {
        stage,
        stage_changed_at: now,
        ...(patch.origin !== undefined ? { origin: patch.origin } : {}),
        ...(patch.reason !== undefined ? { reason: patch.reason } : {}),
        ...(patch.passed_reason !== undefined ? { passed_reason: patch.passed_reason } : {}),
      });
    } else {
      await db().from('candidate_meta').insert({
        radar_id: radarId,
        stage,
        stage_changed_at: now,
        origin: patch.origin ?? null,
        reason: patch.reason ?? null,
        passed_reason: patch.passed_reason ?? null,
      });
    }
    window.dispatchEvent(new CustomEvent(RESERVE_CHANGED_EVENT));
  } catch (e) {
    console.warn('[Ethaion] writing the candidate stage failed:', e);
  }
}

/** File a brand-new candidate at Spotted — the one intake for pasted links,
 * board pieces and manual entries alike. */
export async function fileCandidate({
  name,
  brand,
  price,
  productUrl,
  category,
  origin,
  reason,
  source,
}: {
  name: string;
  brand?: string | null;
  price?: string | null;
  productUrl?: string | null;
  category?: string | null;
  origin: string;
  reason?: string | null;
  source?: string | null;
}): Promise<void> {
  await insertRadarItem({
    name,
    brand: brand || null,
    price_seen: price || null,
    product_url: productUrl || null,
    category: category || null,
    notes: reason || null,
    source: source || 'hunt',
  });
  // The freshest row is the one just inserted — bind its stage meta.
  try {
    const { data } = await db().from('radar_items').orderBy('created_at', 'desc').limit(1).get();
    const id = Number(data?.[0]?.id || 0);
    if (id) await setCandidateStage(id, 'spotted', { origin, reason: reason ?? null });
  } catch (e) {
    console.warn('[Ethaion] binding the new candidate stage failed:', e);
  }
}

// ---------------------------------------------------------------------------
// Presentation bits — warm editorial register: hairlines, no shadows.
// ---------------------------------------------------------------------------

const kicker: React.CSSProperties = {
  fontFamily: 'var(--space-font-heading)',
  fontSize: '11px',
  letterSpacing: '0.14em',
};

const bodyFont: React.CSSProperties = { fontFamily: 'var(--space-font-family)', fontSize: '13px', lineHeight: 1.5 };

function formatDate(iso?: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function textAction(label: string, onClick: () => void, options: { accent?: boolean; title?: string } = {}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-[44px] sm:min-h-[36px] px-1.5 hover:underline whitespace-nowrap"
      style={{ ...bodyFont, color: options.accent ? 'var(--color-accent,#a8712c)' : 'var(--color-text,#241a12)' }}
      title={options.title}
    >
      {label}
    </button>
  );
}

function CandidateCard({
  candidate,
  onStage,
  onPass,
  onArchive,
  onOwned,
}: {
  candidate: Candidate;
  onStage: (stage: CandidateStage) => void;
  onPass: () => void;
  onArchive: () => void;
  onOwned: () => void;
}) {
  const { item, stage } = candidate;
  return (
    <div className="border border-[var(--color-divider,rgba(59,43,29,0.18))] bg-[var(--color-paper,#fbf8f1)] p-4 flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0">
          {item.brand && (
            <span className="block uppercase text-[var(--color-accent-700,#7c4a17)]" style={kicker}>
              {item.brand}
            </span>
          )}
          <span className={`block ${typography.color.primary}`} style={{ fontFamily: 'var(--space-font-heading)', fontSize: '19px', fontWeight: 400, lineHeight: 1.2 }}>
            {item.name}
          </span>
        </span>
        {item.price_seen && (
          <span className="flex-shrink-0 tabular-nums text-[var(--color-neutral-700,#634e38)]" style={{ ...bodyFont, fontSize: '14px' }}>
            {item.price_seen}
          </span>
        )}
      </div>

      {/* HOW IT GOT HERE — origin · date, on every candidate (7a). */}
      <p className="text-[var(--color-neutral-600,#856c51)]" style={{ ...bodyFont, fontSize: '11.5px' }}>
        {candidate.origin}
        {candidate.originDate ? ` · ${formatDate(candidate.originDate)}` : ''}
        {item.category ? ` · ${categoryLabel(item.category)}` : ''}
      </p>

      {/* The reason it exists — a pick with no stated reason isn't shown as
          one; user-added candidates carry their own note here. */}
      {candidate.reason && (
        <p className={typography.color.primary} style={bodyFont}>
          {candidate.reason}
        </p>
      )}

      {/* THE EIGHTY-DAY WARNING (12a): ten days before the silence, the card
          says so — any stage move resets the clock. */}
      {(stage === 'spotted' || stage === 'weighed') && candidate.daysUntouched >= AUTO_ARCHIVE_WARN_DAYS && (
        <p style={{ ...bodyFont, fontSize: '12px', color: 'var(--color-accent-2,#7d2a24)' }}>
          Untouched {candidate.daysUntouched} days — it auto-archives at ninety (“{AUTO_ARCHIVE_REASON}”). Weigh it,
          hold it or pass and the clock resets.
        </p>
      )}

      <div className="flex items-center gap-1 flex-wrap pt-1 border-t border-[var(--color-divider,rgba(59,43,29,0.12))]">
        {stage === 'spotted' && (
          <>
            {textAction('Weigh it', () => onStage('weighed'), { accent: true, title: 'Move it into the comparison' })}
            {textAction('Hold it', () => onStage('held'))}
            {textAction('Pass', onPass, { title: 'An opinion — records a reason, teaches Beau' })}
            {textAction('Archive', onArchive, { title: 'Silence — off the shelf, no opinion recorded' })}
          </>
        )}
        {stage === 'weighed' && (
          <>
            {textAction('Hold it', () => onStage('held'), { accent: true, title: 'Decided — watch for size, sale or season' })}
            {textAction('Pass', onPass, { title: 'An opinion — records a reason, teaches Beau' })}
            {textAction('Archive', onArchive, { title: 'Silence — off the shelf, no opinion recorded' })}
            {textAction('Back to Spotted', () => onStage('spotted'))}
          </>
        )}
        {stage === 'held' && (
          <>
            {textAction('Bought it', onOwned, { accent: true, title: 'It becomes a piece in The Ledger; the boards it sat on stop being proposals' })}
            {textAction('Pass', onPass, { title: 'An opinion — records a reason, teaches Beau' })}
            {textAction('Archive', onArchive, { title: 'Silence — off the shelf, no opinion recorded' })}
            {textAction('Back to Spotted', () => onStage('spotted'))}
          </>
        )}
        <span className="flex-1" />
        {item.product_url && (
          <a
            href={item.product_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 min-h-[44px] sm:min-h-[36px] px-1.5 hover:underline"
            style={{ ...bodyFont, color: 'var(--color-neutral-600,#856c51)' }}
          >
            <ExternalLink className="w-3 h-3" aria-hidden="true" /> The listing
          </a>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The add entry — paste a link (parsed), or the manual form when it fails.
// ---------------------------------------------------------------------------

export function AddCandidate({ onAdded }: { onAdded: () => void }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualBrand, setManualBrand] = useState('');
  const [manualPrice, setManualPrice] = useState('');
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 4000);
    return () => window.clearTimeout(t);
  }, [flash]);

  const submit = async () => {
    const input = value.trim();
    if (!input || busy) return;
    setBusy(true);
    try {
      if (/^(https?:\/\/|www\.)|\.[a-z]{2,}\//i.test(input)) {
        const parsed = parseCandidateUrl(input);
        if (parsed.name || parsed.brand) {
          await fileCandidate({
            name: parsed.name || parsed.brand || 'Unnamed piece',
            brand: parsed.brand,
            productUrl: parsed.url,
            origin: 'You pasted it',
            source: 'pasted-link',
          });
          setValue('');
          setFlash(`Filed as Spotted — ${[parsed.brand, parsed.name].filter(Boolean).join(' · ')}. Correct anything on the card.`);
          onAdded();
        } else {
          // Parsing failed — fall back to the manual form, URL carried over.
          setManual(true);
          setFlash('Couldn\u2019t read a maker or piece off that link — fill the two fields and it files with the URL attached.');
        }
      } else {
        // A typed name — files as-is.
        await fileCandidate({ name: input, origin: 'You added it', source: 'typed' });
        setValue('');
        setFlash(`Filed as Spotted — ${input}.`);
        onAdded();
      }
    } finally {
      setBusy(false);
    }
  };

  const submitManual = async () => {
    const name = manualName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const parsed = parseCandidateUrl(value.trim());
      await fileCandidate({
        name,
        brand: manualBrand.trim() || null,
        price: manualPrice.trim() || null,
        productUrl: parsed.url,
        origin: 'You added it',
        source: 'manual',
      });
      setManual(false);
      setValue('');
      setManualName('');
      setManualBrand('');
      setManualPrice('');
      setFlash(`Filed as Spotted — ${name}.`);
      onAdded();
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    'px-3 min-h-[44px] border border-[var(--color-divider,rgba(59,43,29,0.18))] bg-[var(--color-paper,#fbf8f1)] text-[var(--color-text,#241a12)] focus:outline-none focus:border-[var(--color-accent,#a8712c)]';

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="relative flex-1 min-w-[220px]">
          <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-neutral-500,#a68e70)]" aria-hidden="true" />
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void submit();
              }
            }}
            placeholder="A maker, a piece, or paste a product link…"
            aria-label="Add a candidate — a name or a product link"
            className={`w-full pl-9 ${inputCls}`}
            style={{ ...bodyFont, fontSize: '14px', borderRadius: 0 }}
          />
        </span>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !value.trim()}
          className="px-4 min-h-[44px] inline-flex items-center gap-1.5 border border-[var(--color-accent,#a8712c)] text-[var(--color-accent-700,#7c4a17)] hover:bg-[var(--color-accent-100,#fbf1de)] transition-colors disabled:opacity-40"
          style={{ ...bodyFont, fontSize: '14px', borderRadius: 0 }}
        >
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Add a candidate
        </button>
      </div>
      <p className="mt-1.5 text-[var(--color-neutral-600,#856c51)]" style={{ ...bodyFont, fontSize: '11px' }}>
        A pasted product page files itself — maker and piece read off the URL. Adding a maker to the directory is a
        different act and lives in The Index.
      </p>
      {flash && (
        <p className="mt-1.5" style={{ ...bodyFont, fontSize: '12px', color: 'var(--color-accent-700,#7c4a17)' }}>
          {flash}
        </p>
      )}
      {manual && (
        <div className="mt-3 border border-[var(--color-divider,rgba(59,43,29,0.18))] p-3 grid gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.7fr)_auto]">
          <input type="text" value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="The piece — e.g. The Fisherman’s Jacket" aria-label="Piece name" className={inputCls} style={{ ...bodyFont, fontSize: '14px', borderRadius: 0 }} />
          <input type="text" value={manualBrand} onChange={(e) => setManualBrand(e.target.value)} placeholder="The maker — e.g. Asphalte" aria-label="Maker" className={inputCls} style={{ ...bodyFont, fontSize: '14px', borderRadius: 0 }} />
          <input type="text" value={manualPrice} onChange={(e) => setManualPrice(e.target.value)} placeholder="Price seen" aria-label="Price seen" className={inputCls} style={{ ...bodyFont, fontSize: '14px', borderRadius: 0 }} />
          <button
            type="button"
            onClick={() => void submitManual()}
            disabled={busy || !manualName.trim()}
            className="px-4 min-h-[44px] border border-[var(--color-accent,#a8712c)] text-[var(--color-accent-700,#7c4a17)] hover:bg-[var(--color-accent-100,#fbf1de)] transition-colors disabled:opacity-40"
            style={{ ...bodyFont, fontSize: '14px', borderRadius: 0 }}
          >
            File it
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// WEIGHED · the deep comparison table — rebuilt to 7a: candidates as
// columns under their MAKER's name, the decisive facts as mono-labelled
// rows: the piece (its photograph) · how it got here · Beau's tier · fit,
// for you · what it finishes · price tier · make · tried on · Beau,
// briefly (his verdict, with Hold · Drop right on the column — his pick's
// Hold is the one boxed control). Four columns is the ceiling; on a phone
// it scrolls sideways (M5).
// ---------------------------------------------------------------------------

/** The 7a price tiers, read off the seen price — honestly blank without
 * a recorded price. */
function priceTierOf(price: number | null): string | null {
  if (price == null) return null;
  if (price < 120) return 'Budget · ££';
  if (price < 350) return 'Mid · £££';
  if (price < 700) return 'Premium · ££££';
  return 'Luxury · £££££';
}

/** THE PIECE cell — the listing's photograph when one can be read, the
 * dashed named plate otherwise (7a). */
function CandidateImage({ item }: { item: RadarItem }) {
  const [src, setSrc] = useState('');
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setSrc('');
    setBroken(false);
    if (item.product_url) {
      fetchProductImage(item.product_url)
        .then((url) => {
          if (!cancelled && url) setSrc(url);
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [item.product_url]);
  return (
    <span
      className="block w-full overflow-hidden"
      style={{ aspectRatio: '5 / 4', maxWidth: '190px', border: '1px dashed rgba(59,43,29,0.4)', background: 'var(--color-bg,#efe7d9)' }}
    >
      {src && !broken ? (
        <img src={src} alt={item.name} className="w-full h-full object-cover" loading="lazy" onError={() => setBroken(true)} />
      ) : (
        <span className="w-full h-full flex flex-col items-center justify-center text-center px-2">
          <span style={{ fontFamily: 'var(--space-font-heading)', fontSize: '13px', color: 'var(--color-neutral-700,#634e38)' }}>
            {categoryLabel(item.category || '') || item.name}
          </span>
          <span style={{ fontFamily: MONO, fontSize: '8px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-neutral-500,#a68e70)', marginTop: '4px' }}>
            Its photograph comes off the listing
          </span>
        </span>
      )}
    </span>
  );
}

/** The bordered tier mark — EXCELLENT · RELIABLE, as 7a boxes it. */
function TierMark({ tier }: { tier: BeauRating }) {
  return (
    <span
      className="inline-block"
      style={{
        fontFamily: MONO,
        fontSize: '8.5px',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'var(--color-neutral-700,#634e38)',
        border: '1px solid rgba(59,43,29,0.34)',
        background: 'var(--color-paper,#fbf8f1)',
        padding: '5px 10px',
      }}
    >
      {tier}
    </span>
  );
}

function WeighedTable({
  facts,
  onHold,
  onDrop,
  onBoard,
}: {
  facts: WeighedFacts[];
  onHold: (c: Candidate) => void;
  onDrop: (c: Candidate) => void;
  /** "PUT IT ON THE BOARD" — hands the candidate to The Fitting's canvas. */
  onBoard: (c: Candidate) => void;
}) {
  usePlexMono();
  const monoLabel: React.CSSProperties = {
    fontFamily: MONO,
    fontSize: '8.5px',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--color-neutral-500,#a68e70)',
    fontWeight: 400,
  };
  const rowHead: React.CSSProperties = {
    ...monoLabel,
    padding: '13px 14px 13px 0',
    verticalAlign: 'top',
    whiteSpace: 'nowrap',
    borderTop: '1px solid var(--color-divider,rgba(59,43,29,0.14))',
    width: '112px',
  };
  const cell: React.CSSProperties = {
    fontFamily: 'var(--space-font-family)',
    fontSize: '13px',
    lineHeight: 1.5,
    padding: '13px 16px 13px 0',
    verticalAlign: 'top',
    borderTop: '1px solid var(--color-divider,rgba(59,43,29,0.14))',
    minWidth: '176px',
  };
  const row = (label: string, sub: string | null, render: (f: WeighedFacts) => React.ReactNode) => (
    <tr>
      <th scope="row" className="text-left" style={rowHead}>
        <span className="block" style={{ whiteSpace: 'normal', maxWidth: '104px' }}>{label}</span>
        {sub && (
          <span className="block normal-case" style={{ fontFamily: 'var(--space-font-family)', fontSize: '10.5px', letterSpacing: 0, textTransform: 'none', color: 'var(--color-neutral-500,#a68e70)', marginTop: '3px' }}>
            {sub}
          </span>
        )}
      </th>
      {facts.map((f) => (
        <td key={f.candidate.item.id} className={typography.color.primary} style={cell}>{render(f)}</td>
      ))}
    </tr>
  );
  const hisPick = (f: WeighedFacts) => /beau/i.test(f.candidate.origin);
  return (
    <div className="overflow-x-auto mt-4 border border-[var(--color-divider,rgba(59,43,29,0.3))] bg-[var(--color-paper,#fbf8f1)] px-4 pb-4">
      <table className="w-full border-collapse" style={{ minWidth: `${140 + facts.length * 200}px` }}>
        <thead>
          <tr>
            <th style={{ ...rowHead, borderTop: 'none' }} aria-hidden="true" />
            {facts.map((f) => (
              <th key={f.candidate.item.id} className="text-left" style={{ ...cell, borderTop: 'none', paddingTop: '16px' }}>
                <span className="block" style={{ fontFamily: 'var(--space-font-heading)', fontSize: '17px', fontWeight: 400, lineHeight: 1.15, color: 'var(--color-text,#241a12)' }}>
                  {f.candidate.item.brand || f.candidate.item.name}
                </span>
                <span className="block" style={{ ...monoLabel, marginTop: '4px', color: 'var(--color-neutral-600,#856c51)' }}>
                  {f.candidate.item.brand ? f.candidate.item.name : categoryLabel(f.candidate.item.category || '') || '—'}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {row('The piece', null, (f) => (
            <CandidateImage item={f.candidate.item} />
          ))}
          {row('How it got here', null, (f) => (
            <span>
              <span className="block" style={{ ...monoLabel, color: 'var(--color-accent-700,#7c4a17)' }}>{f.candidate.origin}</span>
              <span className="block" style={{ marginTop: '3px' }}>
                {f.candidate.reason ? `${f.candidate.reason}` : 'No note recorded'}
                {f.candidate.originDate ? ` · ${formatDate(f.candidate.originDate)}` : ''}
              </span>
            </span>
          ))}
          {row('Beau’s tier', null, (f) =>
            f.tier ? <TierMark tier={f.tier} /> : <span style={{ color: 'var(--color-neutral-600,#856c51)' }}>Unrated — Beau hasn’t read this maker yet.</span>,
          )}
          {row('Fit, for you', 'From your sizes', (f) => f.fit)}
          {row('What it finishes', 'Of what you own', (f) =>
            f.finishes > 0 ? `Works with ${f.finishes} piece${f.finishes === 1 ? '' : 's'} you own.` : 'Nothing logged yet for it to finish.',
          )}
          {row('Price tier', null, (f) => (
            <span>
              <span className="block" style={{ fontFamily: MONO, fontSize: '11px', letterSpacing: '0.05em', color: 'var(--color-text,#241a12)' }}>
                {priceTierOf(f.price) || '—'}
              </span>
              {f.candidate.item.price_seen && (
                <span className="block" style={{ marginTop: '2px', fontSize: '12px', color: 'var(--color-neutral-600,#856c51)' }}>
                  Seen at {f.candidate.item.price_seen}
                </span>
              )}
            </span>
          ))}
          {row('Make', null, (f) => f.make || '—')}
          {row('Tried on', 'Boards it has sat on', (f) => (
            <span>
              <span className="block">
                {f.boards > 0 ? `${capWord(numberWord(f.boards))} board${f.boards === 1 ? '' : 's'} — it keeps being reached for.` : 'Never — not on a board yet.'}
              </span>
              <button
                type="button"
                onClick={() => onBoard(f.candidate)}
                className="hover:underline text-left"
                style={{ ...monoLabel, color: 'var(--color-accent-700,#7c4a17)', marginTop: '4px', background: 'transparent' }}
              >
                Put it on the board →
              </button>
            </span>
          ))}
          {row('Beau, briefly', null, (f) => (
            <span>
              {hisPick(f) && (
                <span className="block" style={{ ...monoLabel, color: 'var(--color-accent-2,#7d2a24)' }}>His pick</span>
              )}
              <span className="block" style={{ marginTop: hisPick(f) ? '3px' : 0 }}>
                {f.tierNote || f.candidate.reason || 'Nothing to add — the rows above are the whole argument.'}
              </span>
              <span className="flex items-center gap-3 flex-wrap" style={{ marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => onHold(f.candidate)}
                  className="hover:opacity-80"
                  style={
                    hisPick(f)
                      ? { fontFamily: 'var(--space-font-family)', fontSize: '13px', color: 'var(--color-accent-800,#5c3413)', border: '1px solid var(--color-accent,#a8712c)', padding: '6px 14px', background: 'transparent' }
                      : { fontFamily: 'var(--space-font-family)', fontSize: '13px', color: 'var(--color-text,#241a12)', background: 'transparent', textDecoration: 'underline', textUnderlineOffset: '3px' }
                  }
                  title="Decided — watch for size, sale or season"
                >
                  Hold
                </button>
                <button
                  type="button"
                  onClick={() => onDrop(f.candidate)}
                  className="hover:underline"
                  style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px', color: 'var(--color-neutral-600,#856c51)', background: 'transparent' }}
                  title="An opinion — records a reason, teaches Beau"
                >
                  Drop
                </button>
              </span>
            </span>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// THE STAGES — the 7a left rail: the funnel as a vertical list of filters
// (Spotted · Weighed · Held with live counts). Desktop only; narrow screens
// keep the chip rail.
// ---------------------------------------------------------------------------

const railMono: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: '8.5px',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--color-neutral-500,#a68e70)',
};

function StageSidebar({
  stages,
  byStage,
  activeStage,
  onStage,
}: {
  stages: Array<{ id: CandidateStage; label: string; sub: string }>;
  byStage: Record<CandidateStage, Candidate[]>;
  activeStage: CandidateStage;
  onStage: (id: CandidateStage) => void;
}) {
  usePlexMono();
  return (
    <aside className="hidden lg:block" aria-label="The Hunt — stages and history">
      <div style={railMono}>The stages</div>
      <div className="flex flex-col" style={{ marginTop: '6px' }} role="tablist" aria-label="Candidate stages">
        {stages.map(({ id, label, sub }) => {
          const active = activeStage === id;
          const count = (byStage[id] || []).length;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onStage(id)}
              className="text-left transition-colors"
              style={{
                padding: '10px 12px 11px',
                margin: '0 -12px',
                borderBottom: '1px solid var(--color-divider,rgba(59,43,29,0.14))',
                background: active ? 'var(--color-paper,#fbf8f1)' : 'transparent',
                borderLeft: active ? '2px solid var(--color-accent,#a8712c)' : '2px solid transparent',
              }}
            >
              <span className="flex items-baseline justify-between gap-3">
                <span style={{ fontFamily: 'var(--space-font-heading)', fontSize: '16.5px', fontWeight: 400, color: 'var(--color-text,#241a12)' }}>{label}</span>
                <span className="tabular-nums" style={{ fontFamily: MONO, fontSize: '11px', color: 'var(--color-neutral-700,#634e38)' }}>{count}</span>
              </span>
              <span className="block" style={{ ...bodyFont, fontSize: '11px', color: 'var(--color-neutral-600,#856c51)', marginTop: '2px' }}>
                {sub}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// HELD · the strip under the Weighed comparison (7a): the decided-on
// candidates as context, each with the way to buy and the way back.
// ---------------------------------------------------------------------------

function HeldStrip({
  held,
  onBackToSpotted,
}: {
  held: Candidate[];
  onBackToSpotted: (c: Candidate) => void;
}) {
  if (held.length === 0) return null;
  return (
    <div style={{ marginTop: '34px', paddingTop: '16px', borderTop: '1px solid var(--color-text,#3b2b1d)' }}>
      <div className="flex items-baseline justify-between gap-4">
        <span style={{ fontFamily: 'var(--space-font-heading)', fontSize: '21px', fontWeight: 400, color: 'var(--color-text,#241a12)' }}>
          Held · {held.length}
        </span>
        <span style={railMono}>Beau re-checks price and stock each visit</span>
      </div>
      {held.map((c) => (
        <div
          key={c.item.id}
          className="grid grid-cols-1 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_auto] gap-2 sm:gap-6 sm:items-baseline"
          style={{ padding: '12px 0', borderBottom: '1px solid var(--color-divider,rgba(59,43,29,0.14))' }}
        >
          <span>
            <span className="block" style={{ fontFamily: 'var(--space-font-heading)', fontSize: '16px', fontWeight: 400, color: 'var(--color-text,#241a12)' }}>
              {c.item.name}
            </span>
            {c.item.brand && (
              <span className="block" style={{ ...railMono, marginTop: '2px' }}>{c.item.brand}</span>
            )}
          </span>
          <span style={{ ...bodyFont, fontSize: '12.5px', color: 'var(--color-neutral-700,#634e38)' }}>
            {c.reason || 'Decided — watching for size, sale or season.'}{' '}
            {c.daysUntouched > 0 ? `Held ${c.daysUntouched === 1 ? 'a day' : `${numberWord(Math.min(99, c.daysUntouched))} days`}.` : ''}
          </span>
          <span className="flex items-baseline gap-4 flex-wrap">
            {c.item.product_url && (
              <a
                href={c.item.product_url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
                style={{ ...bodyFont, fontSize: '12.5px', color: 'var(--color-accent,#a8712c)' }}
              >
                Where to buy
              </a>
            )}
            <button
              type="button"
              onClick={() => onBackToSpotted(c)}
              className="hover:underline"
              style={{ ...bodyFont, fontSize: '12.5px', color: 'var(--color-neutral-600,#856c51)', background: 'transparent' }}
            >
              Back to spotted
            </button>
          </span>
        </div>
      ))}
      <p style={{ ...bodyFont, fontSize: '11.5px', color: 'var(--color-neutral-600,#856c51)', marginTop: '10px', maxWidth: '64ch' }}>
        Held sits under the comparison rather than behind a tab: the thing you’ve already decided on is context for
        the thing you’re deciding now.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PASSED & ARCHIVED — the dedicated decision-history screen (12a · M12).
// “A pass is an opinion. An archive is silence.” Every row: the piece's
// image (its listing's photograph when one can be read, an initial tile
// otherwise), the maker, the reason recorded, the date — and the way back.
// ---------------------------------------------------------------------------

/** The row's image — the listing's photograph when the candidate carries a
 * product URL (cached og:image read), the piece's initial otherwise. */
function ExitImage({ item }: { item: RadarItem }) {
  const [src, setSrc] = useState('');
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setSrc('');
    setBroken(false);
    if (item.product_url) {
      fetchProductImage(item.product_url)
        .then((url) => {
          if (!cancelled && url) setSrc(url);
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [item.product_url]);
  return (
    <span
      className="flex-shrink-0 w-[52px] h-[64px] border border-[var(--color-divider,rgba(59,43,29,0.18))] bg-[var(--color-paper,#fbf8f1)] overflow-hidden flex items-center justify-center"
      aria-hidden="true"
    >
      {src && !broken ? (
        <img src={src} alt="" className="w-full h-full object-cover" loading="lazy" onError={() => setBroken(true)} />
      ) : (
        <span style={{ fontFamily: 'var(--space-font-heading)', fontSize: '22px', color: 'var(--color-neutral-500,#a68e70)', lineHeight: 1 }}>
          {(item.name || '?').trim().charAt(0).toUpperCase() || '?'}
        </span>
      )}
    </span>
  );
}

function ExitRow({
  candidate,
  onBringBack,
  busy,
}: {
  candidate: Candidate;
  onBringBack: () => void;
  busy: boolean;
}) {
  const { item, meta } = candidate;
  const exitDate = meta?.stage_changed_at || meta?.created_at || item.created_at || null;
  return (
    <div className="flex items-start gap-3.5 py-3.5 border-b border-[var(--color-divider,rgba(59,43,29,0.12))]">
      <ExitImage item={item} />
      <div className="min-w-0 flex-1">
        {item.brand && (
          <p className="uppercase text-[var(--color-accent-700,#7c4a17)]" style={kicker}>
            {item.brand}
          </p>
        )}
        <p className={typography.color.primary} style={{ fontFamily: 'var(--space-font-heading)', fontSize: '17px', lineHeight: 1.2 }}>
          {item.name}
        </p>
        {meta?.passed_reason && (
          <p className="text-[var(--color-neutral-700,#634e38)] italic" style={{ ...bodyFont, fontSize: '12.5px', marginTop: '2px' }}>
            “{meta.passed_reason}”
          </p>
        )}
        <p className="text-[var(--color-neutral-600,#856c51)]" style={{ ...bodyFont, fontSize: '11.5px', marginTop: '2px' }}>
          {candidate.origin}
          {exitDate ? ` · ${formatDate(exitDate)}` : ''}
        </p>
        <button
          type="button"
          onClick={onBringBack}
          disabled={busy}
          className="inline-flex items-center gap-1 mt-1.5 min-h-[36px] hover:underline disabled:opacity-50"
          style={{ ...bodyFont, fontSize: '12.5px', color: 'var(--color-accent,#a8712c)' }}
        >
          <RotateCcw className="w-3 h-3" aria-hidden="true" /> Bring back
        </button>
      </div>
    </div>
  );
}

function PassedArchivedScreen({
  passed,
  archived,
  onBringBack,
  onClose,
}: {
  passed: Candidate[];
  archived: Candidate[];
  onBringBack: (candidate: Candidate) => Promise<void>;
  onClose: () => void;
}) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const bringBack = async (candidate: Candidate) => {
    if (busyId != null) return;
    setBusyId(candidate.item.id);
    try {
      await onBringBack(candidate);
    } finally {
      setBusyId(null);
    }
  };
  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      style={{ background: 'var(--color-bg,#efe7d9)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Passed and archived — the decision history"
    >
      <div className="max-w-[880px] mx-auto px-5 sm:px-10 py-8 pb-24">
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 min-h-[44px] hover:underline"
            style={{ ...bodyFont, fontSize: '13px', color: 'var(--color-neutral-700,#634e38)' }}
          >
            <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> Back to The Hunt
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 flex items-center justify-center border border-[var(--color-divider,rgba(59,43,29,0.18))] bg-[var(--color-paper,#fbf8f1)] text-[var(--color-neutral-600,#856c51)] hover:text-[var(--color-accent-700,#7c4a17)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <h3 className={typography.color.primary} style={{ fontFamily: 'var(--space-font-heading)', fontWeight: 400, fontSize: '34px', lineHeight: 1.1, marginTop: '18px' }}>
          Passed & archived
        </h3>
        <p className={typography.color.primary} style={{ ...bodyFont, fontSize: '14.5px', marginTop: '8px', maxWidth: '54ch' }}>
          A pass is an opinion. An archive is silence. Neither shows on the shelf — and nothing is ever deleted.
          Bring anything back, any time.
        </p>

        <div className="grid gap-8 sm:grid-cols-2 mt-8">
          <section aria-label="Passed candidates">
            <p className="uppercase text-[var(--color-neutral-700,#634e38)] pb-2 border-b border-[var(--color-text,#3b2b1d)]" style={kicker}>
              Passed · {passed.length}
            </p>
            <p className="text-[var(--color-neutral-600,#856c51)] py-2" style={{ ...bodyFont, fontSize: '12px' }}>
              You said no, with a reason — Beau won’t put these up again in the same form.
            </p>
            {passed.map((c) => (
              <ExitRow key={c.item.id} candidate={c} onBringBack={() => void bringBack(c)} busy={busyId === c.item.id} />
            ))}
            {passed.length === 0 && (
              <p className="py-4 text-[var(--color-neutral-600,#856c51)]" style={{ ...bodyFont, fontSize: '12.5px' }}>
                Nothing passed. A pass records a reason and teaches Beau — it’s the cheapest signal in the product.
              </p>
            )}
          </section>
          <section aria-label="Archived candidates">
            <p className="uppercase text-[var(--color-neutral-700,#634e38)] pb-2 border-b border-[var(--color-text,#3b2b1d)]" style={kicker}>
              Archived · {archived.length}
            </p>
            <p className="text-[var(--color-neutral-600,#856c51)] py-2" style={{ ...bodyFont, fontSize: '12px' }}>
              Quiet, not judged — archived by hand, or untouched for ninety days.
            </p>
            {archived.map((c) => (
              <ExitRow key={c.item.id} candidate={c} onBringBack={() => void bringBack(c)} busy={busyId === c.item.id} />
            ))}
            {archived.length === 0 && (
              <p className="py-4 text-[var(--color-neutral-600,#856c51)]" style={{ ...bodyFont, fontSize: '12.5px' }}>
                Nothing archived. Anything untouched ninety days drops here — off the shelf, never deleted.
              </p>
            )}
          </section>
        </div>

        <p className="mt-8 pt-3 border-t border-[var(--color-divider,rgba(59,43,29,0.18))] text-[var(--color-neutral-600,#856c51)]" style={{ ...bodyFont, fontSize: '12px', maxWidth: '60ch' }}>
          Two passes on a maker move it down your index; three passes on a type stop Beau proposing that type for the
          gap. Both undo themselves the moment you bring one back.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The pipeline root.
// ---------------------------------------------------------------------------

export function HuntStages({
  pieces = [],
  spottedLead,
  spottedExtras,
  hideAdd = false,
}: {
  /** The owned wardrobe — feeds the “what it finishes” row. */
  pieces?: WardrobePiece[];
  /** THE PRIMARY ENTRY POINT (type-to-search overhaul): the natural-language
   * search — describe a piece or paste a product URL — rendered ABOVE the
   * Spotted cards, so finding candidates leads the stage and what Beau
   * brings back lands directly beneath it. */
  spottedLead?: React.ReactNode;
  /** FIND & DISCOVER LIVE INSIDE SPOTTED (founder's correction — the
   * standalone Find / Discover sub-tabs are gone): rendered beneath the
   * Spotted cards — the hunt history and secondary tools. */
  spottedExtras?: React.ReactNode;
  /** True when the host page renders <AddCandidate> in its own header
   * (7a: the field sits opposite the page title). */
  hideAdd?: boolean;
} = {}) {
  const { data: radarRows, refresh: refreshRadar } = (window as any).useWorkspaceDB('radar_items', {
    orderBy: { column: 'created_at', direction: 'desc' },
    limit: 200,
  });
  const { data: metaRows, refresh: refreshMeta } = (window as any).useWorkspaceDB('candidate_meta', {
    orderBy: { column: 'created_at', direction: 'desc' },
    limit: 200,
  });
  // The Weighed comparison's supporting records — directory ratings for the
  // tier row, saved outfits for the boards-it-sat-on row.
  const { data: directoryRows } = (window as any).useWorkspaceDB('hunt_directory_brands', {
    orderBy: { column: 'created_at', direction: 'desc' },
    limit: 200,
  });
  const { data: outfitRows } = (window as any).useWorkspaceDB('saved_outfits', {
    orderBy: { column: 'created_at', direction: 'desc' },
    limit: 100,
  });
  const [activeStage, setActiveStage] = useState<CandidateStage>('spotted');
  // WEIGHED has two readings (7a · 19a): AS A TABLE answers “what is true
  // of each one”, ON A MAP answers “how they relate”. One record set.
  const [weighedView, setWeighedView] = useState<'table' | 'map'>('table');
  const [measurements, setMeasurements] = useState<StyleMeasurements | null>(null);
  useEffect(() => {
    fetchStyleMeasurements().then(setMeasurements).catch(() => undefined);
  }, []);
  // The dedicated Passed & Archived screen (12a · M12) — the full decision
  // history, opened from the row under the pipeline.
  const [exitsOpen, setExitsOpen] = useState(false);
  const [passingId, setPassingId] = useState<number | null>(null);
  const [passReason, setPassReason] = useState('');
  // ARCHIVE is its own act (build brief rule 9): silence, not an opinion —
  // but it still records a reason and stays reversible.
  const [archivingId, setArchivingId] = useState<number | null>(null);
  const [archiveReason, setArchiveReason] = useState('');
  const [flash, setFlash] = useState<string | null>(null);
  // UNDO, immediately after a pass (12a): the flash carries the way back.
  const [undoPass, setUndoPass] = useState<{ id: number; prevStage: CandidateStage } | null>(null);

  const refreshAll = () => {
    refreshRadar();
    refreshMeta();
  };

  useEffect(() => {
    const onChanged = () => refreshAll();
    window.addEventListener(RESERVE_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(RESERVE_CHANGED_EVENT, onChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!flash) return;
    // A flash carrying an undo stays up longer — the way back should not
    // vanish while the hand is still over the card.
    const t = window.setTimeout(() => {
      setFlash(null);
      setUndoPass(null);
    }, undoPass ? 9000 : 4500);
    return () => window.clearTimeout(t);
  }, [flash, undoPass]);

  const candidates = useMemo(
    () => composeCandidates((radarRows || []) as RadarItem[], (metaRows || []) as CandidateMetaRow[]),
    [radarRows, metaRows],
  );

  // PERSIST THE NINETY-DAY RULE: a derived auto-archive becomes a STORED
  // stage with its reason (“No activity for 90 days”), so the decision
  // history lives in WorkspaceDB — never recomputed, never lost. Each id is
  // written once per mount; the write itself refreshes the records.
  const persistedAutoArchive = useRef<Set<number>>(new Set());
  useEffect(() => {
    for (const c of candidates) {
      if (!c.autoArchived || persistedAutoArchive.current.has(c.item.id)) continue;
      persistedAutoArchive.current.add(c.item.id);
      void setCandidateStage(c.item.id, 'archived', { passed_reason: AUTO_ARCHIVE_REASON });
    }
  }, [candidates]);

  const byStage = useMemo(() => {
    const groups: Record<CandidateStage, Candidate[]> = { spotted: [], weighed: [], held: [], passed: [], archived: [] };
    for (const c of candidates) groups[c.stage].push(c);
    return groups;
  }, [candidates]);

  // The Weighed facts — derived, never stored (one source for every count).
  const weighedFacts = useMemo<WeighedFacts[]>(() => {
    const dirRows = (directoryRows || []) as DirectoryBrandRow[];
    const boardsFor = (item: RadarItem): number => {
      let count = 0;
      for (const row of (outfitRows || []) as Array<{ pieces: unknown }>) {
        try {
          const parsed = typeof row.pieces === 'string' ? JSON.parse(row.pieces) : row.pieces;
          if (!Array.isArray(parsed)) continue;
          const onBoard = parsed.some(
            (p: any) =>
              p?.key === `radar-${item.id}` ||
              (typeof p?.name === 'string' && p.name === item.name && (p?.brand || null) === (item.brand || null)),
          );
          if (onBoard) count += 1;
        } catch { /* an unreadable saved board never breaks the row */ }
      }
      return count;
    };
    return byStage.weighed.map((candidate) => {
      const { tier, note } = tierFor(candidate.item.brand, dirRows);
      const catalog = findCatalogBrand((candidate.item.brand || '').trim());
      const make = [catalog?.construction, catalog?.materials?.[0], categoryLabel(candidate.item.category || '') || null]
        .filter(Boolean)
        .join(' · ');
      return {
        candidate,
        price: parsePrice(candidate.item.price_seen),
        tier,
        tierNote: note,
        fit: fitNoteFor(candidate.item.category, measurements),
        finishes: worksWithCount(candidate.item.category, pieces),
        make,
        boards: boardsFor(candidate.item),
      };
    });
  }, [byStage.weighed, directoryRows, outfitRows, measurements, pieces]);

  const moveStage = async (candidate: Candidate, stage: CandidateStage) => {
    // FOUR IS THE CEILING (7a): a fifth weighed candidate stops being a
    // comparison — the earliest-added drops back to Spotted, stated here.
    if (stage === 'weighed' && byStage.weighed.length >= WEIGHED_CAP && candidate.stage !== 'weighed') {
      const oldest = [...byStage.weighed].sort(
        (a, b) => new Date(a.meta?.stage_changed_at || a.item.created_at || 0).getTime() - new Date(b.meta?.stage_changed_at || b.item.created_at || 0).getTime(),
      )[0];
      if (oldest) {
        await setCandidateStage(oldest.item.id, 'spotted');
        setFlash(`Four is the ceiling for a comparison — “${oldest.item.name}\u201d dropped back to Spotted.`);
      }
    }
    await setCandidateStage(candidate.item.id, stage);
    refreshAll();
  };

  const confirmPass = async (candidate: Candidate) => {
    const prevStage: CandidateStage =
      candidate.stage === 'passed' || candidate.stage === 'archived' ? 'spotted' : candidate.stage;
    await setCandidateStage(candidate.item.id, 'passed', { passed_reason: passReason.trim() || null });
    setPassingId(null);
    setPassReason('');
    setUndoPass({ id: candidate.item.id, prevStage });
    setFlash(`Passed — Beau won\u2019t put “${candidate.item.name}\u201d up again.`);
    refreshAll();
  };

  const confirmArchive = async (candidate: Candidate) => {
    await setCandidateStage(candidate.item.id, 'archived', { passed_reason: archiveReason.trim() || null });
    setArchivingId(null);
    setArchiveReason('');
    setFlash(`Archived — “${candidate.item.name}\u201d is off the shelf, not deleted. Bring it back any time under Passed & archived.`);
    refreshAll();
  };

  const undoLastPass = async () => {
    if (!undoPass) return;
    await setCandidateStage(undoPass.id, undoPass.prevStage);
    setUndoPass(null);
    setFlash('Undone — the candidate is back where it was.');
    refreshAll();
  };

  const markOwned = async (candidate: Candidate) => {
    await radarToWardrobe(candidate.item);
    setFlash(`“${candidate.item.name}\u201d is yours — it\u2019s in The Ledger now.`);
    refreshAll();
  };

  const stages: Array<{ id: CandidateStage; label: string; sub: string }> = [
    { id: 'spotted', label: 'Spotted', sub: 'Saved, unjudged' },
    { id: 'weighed', label: 'Weighed', sub: 'As a table' },
    { id: 'held', label: 'Held', sub: 'Decided, watching price' },
  ];

  const shown = byStage[activeStage] || [];

  return (
    <section aria-label="The Hunt — the candidate pipeline">
      {!hideAdd && <AddCandidate onAdded={refreshAll} />}

      <div className="lg:grid lg:items-start lg:grid-cols-[176px_minmax(0,1fr)] lg:gap-x-9 mt-1">

      <StageSidebar
        stages={stages}
        byStage={byStage}
        activeStage={activeStage}
        onStage={setActiveStage}
      />

      <div className="min-w-0">

      <div className="flex items-stretch gap-1.5 mt-5 flex-wrap lg:hidden" role="tablist" aria-label="Candidate stages">
        {stages.map(({ id, label, sub }) => {
          const active = activeStage === id;
          const count = (byStage[id] || []).length;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveStage(id)}
              className={`flex-1 min-w-[104px] min-h-[52px] px-3 py-2 text-left transition-colors ${
                active
                  ? 'border border-[var(--color-accent,#a8712c)] bg-[var(--color-accent-100,#fbf1de)]'
                  : 'border border-[var(--color-divider,rgba(59,43,29,0.18))] hover:border-[var(--color-accent,#a8712c)]'
              }`}
            >
              <span className="flex items-baseline gap-2">
                <span className={`uppercase ${active ? 'text-[var(--color-accent-800,#5c3413)]' : 'text-[var(--color-neutral-700,#634e38)]'}`} style={kicker}>
                  {label}
                </span>
                <span className={`tabular-nums ${typography.color.primary}`} style={{ fontFamily: 'var(--space-font-heading)', fontSize: '19px', lineHeight: 1 }}>
                  {count}
                </span>
              </span>
              <span className="block text-[var(--color-neutral-600,#856c51)]" style={{ ...bodyFont, fontSize: '10.5px' }}>
                {sub}
              </span>
            </button>
          );
        })}
      </div>

      {flash && (
        <p className="mt-2.5 flex items-baseline gap-3 flex-wrap" style={{ ...bodyFont, fontSize: '12.5px', color: 'var(--color-accent-700,#7c4a17)' }}>
          <span>{flash}</span>
          {undoPass && (
            <button
              type="button"
              onClick={() => void undoLastPass()}
              className="inline-flex items-center gap-1 hover:underline"
              style={{ ...bodyFont, fontSize: '12.5px', color: 'var(--color-accent,#a8712c)' }}
            >
              <RotateCcw className="w-3 h-3" aria-hidden="true" /> Undo the pass
            </button>
          )}
        </p>
      )}

      {/* TYPE-TO-SEARCH LEADS SPOTTED: the one input — a natural-language
          brief or a pasted product URL — sits at the top of the stage its
          results land in. */}
      {activeStage === 'spotted' && spottedLead && <div className="mt-5 lg:mt-4">{spottedLead}</div>}

      {/* THE STAGE HEADING (7a) — “Weighed · four candidates” with the
          AS A TABLE · ON A MAP toggle at the right edge. The table answers
          “what is true of each”; the map “how do they relate” (19a). */}
      <div className="flex items-end justify-between gap-4 flex-wrap mt-5 lg:mt-4">
        <div style={{ maxWidth: '68ch' }}>
          <h4 style={{ margin: 0, fontFamily: 'var(--space-font-heading)', fontSize: '25px', fontWeight: 400, lineHeight: 1.15, color: 'var(--color-text,#241a12)' }}>
            {activeStage === 'spotted' && `Spotted · ${byStage.spotted.length === 0 ? 'nothing yet' : `${numberWord(Math.min(99, byStage.spotted.length))} candidate${byStage.spotted.length === 1 ? '' : 's'}`}`}
            {activeStage === 'weighed' && `Weighed · ${byStage.weighed.length === 0 ? 'nothing yet' : `${numberWord(byStage.weighed.length)} candidate${byStage.weighed.length === 1 ? '' : 's'}`}`}
            {activeStage === 'held' && `Held · ${byStage.held.length === 0 ? 'nothing yet' : numberWord(byStage.held.length)}`}
          </h4>
        </div>
        {activeStage === 'weighed' && byStage.weighed.length > 0 && (
          <ViewToggle
            items={[
              { id: 'table' as const, label: 'As a table' },
              { id: 'map' as const, label: 'On a map' },
            ]}
            active={weighedView}
            onChange={(id) => setWeighedView(id)}
            ariaLabel="Weighed views"
          />
        )}
      </div>

      {activeStage === 'weighed' && weighedView === 'table' && byStage.weighed.length > 0 && (
        <>
          <WeighedTable
            facts={weighedFacts}
            onHold={(c) => void moveStage(c, 'held')}
            onDrop={(c) => {
              setPassingId(c.item.id);
              setArchivingId(null);
              setPassReason('');
            }}
            onBoard={(c) =>
              requestFittingRoomTryOn({
                key: `radar-${c.item.id}`,
                name: c.item.name,
                brand: c.item.brand || null,
                category: c.item.category || null,
                productUrl: c.item.product_url || null,
                note: c.reason || null,
              })
            }
          />
          {(() => {
            const passing = byStage.weighed.find((c) => c.item.id === passingId);
            if (!passing) return null;
            return (
              <div className="border border-t-0 border-[var(--color-divider,rgba(59,43,29,0.18))] bg-[var(--color-accent-100,#fbf1de)] p-3">
                <p className={typography.color.primary} style={{ ...bodyFont, fontSize: '12.5px' }}>
                  Dropping “{passing.item.name}” — why the pass? Optional, but it’s the most useful thing you can tell Beau.
                </p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <input
                    type="text"
                    value={passReason}
                    onChange={(e) => setPassReason(e.target.value)}
                    placeholder="e.g. too heavy for the shoes I actually reach for"
                    aria-label="Reason for passing"
                    className="flex-1 min-w-[180px] px-3 min-h-[44px] border border-[var(--color-divider,rgba(59,43,29,0.18))] bg-[var(--color-paper,#fbf8f1)] focus:outline-none focus:border-[var(--color-accent,#a8712c)]"
                    style={{ ...bodyFont, fontSize: '13px', borderRadius: 0 }}
                  />
                  {textAction('Pass it', () => void confirmPass(passing), { accent: true })}
                  {textAction('Keep it', () => setPassingId(null))}
                </div>
              </div>
            );
          })()}
          <p style={{ ...bodyFont, fontSize: '11.5px', color: 'var(--color-neutral-600,#856c51)', marginTop: '10px', maxWidth: '68ch' }}>
            Four columns is the ceiling — a fifth stops being a comparison and starts being a list. Add a fifth and
            the earliest-added drops back to Spotted, stated at the moment it happens.
          </p>
        </>
      )}
      {activeStage === 'weighed' && weighedView === 'map' && byStage.weighed.length > 0 && (
        <HuntWeighedMap
          candidates={weighedFacts.map(
            (f): HuntMapCandidate => ({
              id: f.candidate.item.id,
              brand: f.candidate.item.brand || null,
              name: f.candidate.item.name,
              price: f.price,
              finishes: f.finishes,
              tier: f.tier,
              isPick: /beau/i.test(f.candidate.origin),
              reason: f.tierNote || f.candidate.reason || null,
            }),
          )}
          onOpenTable={() => setWeighedView('table')}
        />
      )}

      {/* HELD · under the comparison (7a) — context, not another tab. */}
      {activeStage === 'weighed' && byStage.weighed.length > 0 && (
        <HeldStrip held={byStage.held} onBackToSpotted={(c) => void moveStage(c, 'spotted')} />
      )}

      {/* THE STAGE'S CANDIDATES — cards (one per candidate: image-less but
          scannable — maker, piece, price, origin · date, the reason).
          Cards, not a table, so the same layout serves 390pt (M5). */}
      {(activeStage !== 'weighed' || byStage.weighed.length === 0) && (
      <div className="grid gap-3 mt-4 sm:grid-cols-2">
        {shown.map((candidate) => (
          <div key={candidate.item.id}>
            <CandidateCard
              candidate={candidate}
              onStage={(stage) => void moveStage(candidate, stage)}
              onPass={() => {
                setPassingId(candidate.item.id);
                setArchivingId(null);
                setPassReason('');
              }}
              onArchive={() => {
                setArchivingId(candidate.item.id);
                setPassingId(null);
                setArchiveReason('');
              }}
              onOwned={() => void markOwned(candidate)}
            />
            {passingId === candidate.item.id && (
              <div className="border border-t-0 border-[var(--color-divider,rgba(59,43,29,0.18))] bg-[var(--color-accent-100,#fbf1de)] p-3">
                <p className={typography.color.primary} style={{ ...bodyFont, fontSize: '12.5px' }}>
                  Why the pass? Optional — but it’s the most useful thing you can tell Beau.
                </p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <input
                    type="text"
                    value={passReason}
                    onChange={(e) => setPassReason(e.target.value)}
                    placeholder="e.g. too heavy for the shoes I actually reach for"
                    aria-label="Reason for passing"
                    className="flex-1 min-w-[180px] px-3 min-h-[44px] border border-[var(--color-divider,rgba(59,43,29,0.18))] bg-[var(--color-paper,#fbf8f1)] focus:outline-none focus:border-[var(--color-accent,#a8712c)]"
                    style={{ ...bodyFont, fontSize: '13px', borderRadius: 0 }}
                  />
                  {textAction('Pass it', () => void confirmPass(candidate), { accent: true })}
                  {textAction('Keep it', () => setPassingId(null))}
                </div>
              </div>
            )}
            {archivingId === candidate.item.id && (
              <div className="border border-t-0 border-[var(--color-divider,rgba(59,43,29,0.18))] bg-[var(--color-paper,#fbf8f1)] p-3">
                <p className={typography.color.primary} style={{ ...bodyFont, fontSize: '12.5px' }}>
                  A pass is an opinion. An archive is silence — off the shelf, no opinion recorded, nothing deleted.
                  Note why, if you like.
                </p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <input
                    type="text"
                    value={archiveReason}
                    onChange={(e) => setArchiveReason(e.target.value)}
                    placeholder="e.g. parking it until autumn"
                    aria-label="Reason for archiving"
                    className="flex-1 min-w-[180px] px-3 min-h-[44px] border border-[var(--color-divider,rgba(59,43,29,0.18))] bg-[var(--color-paper,#fbf8f1)] focus:outline-none focus:border-[var(--color-accent,#a8712c)]"
                    style={{ ...bodyFont, fontSize: '13px', borderRadius: 0 }}
                  />
                  {textAction('Archive it', () => void confirmArchive(candidate), { accent: true })}
                  {textAction('Keep it', () => setArchivingId(null))}
                </div>
              </div>
            )}
          </div>
        ))}
        {shown.length === 0 && activeStage !== 'spotted' && (
          /* ONE register for every empty-state line in the pipeline — the
             same face, size and colour as the body copy elsewhere. Spotted
             carries no empty-state line: the search that fills it renders
             directly above, so the way in is already on screen. */
          <p className="sm:col-span-2 py-3 text-[var(--color-neutral-700,#634e38)]" style={{ ...bodyFont, fontSize: '13px' }}>
            {activeStage === 'weighed' && 'Nothing being weighed — move a spotted candidate in and compare up to four at once.'}
            {activeStage === 'held' && 'Nothing held — a held candidate is one you\u2019ve decided on and are waiting to buy.'}
          </p>
        )}
      </div>
      )}

      {/* FIND · SEARCH · DISCOVER — folded INTO the Spotted stage
          (founder's correction: the standalone Find / Discover sub-tabs are
          deleted; finding new candidates happens where they land). */}
      {activeStage === 'spotted' && spottedExtras && <div className="mt-6">{spottedExtras}</div>}

      {activeStage === 'weighed' && byStage.weighed.length >= WEIGHED_CAP && (
        <p className="mt-2 text-[var(--color-neutral-600,#856c51)]" style={{ ...bodyFont, fontSize: '11.5px' }}>
          Four is the ceiling — a fifth stops being a comparison. Adding another drops the earliest back to Spotted.
        </p>
      )}

      {/* The way into the decision history (12a · M12) — all widths. */}
      <div className="mt-6 border-t border-[var(--color-divider,rgba(59,43,29,0.18))] pt-3">
        <button
          type="button"
          onClick={() => setExitsOpen(true)}
          className="min-h-[44px] hover:underline text-left"
          style={{ ...bodyFont, fontSize: '13px', color: 'var(--color-neutral-700,#634e38)' }}
        >
          Passed & archived — {byStage.passed.length} passed · {byStage.archived.length} archived ›
        </button>
        <p className="text-[var(--color-neutral-600,#856c51)]" style={{ ...bodyFont, fontSize: '11.5px' }}>
          A pass is an opinion. An archive is silence. The full decision history — reasons, dates, and the way back
          — lives there.
        </p>
      </div>

      </div>

      </div>

      {exitsOpen && (
        <PassedArchivedScreen
          passed={byStage.passed}
          archived={byStage.archived}
          onBringBack={async (c) => {
            await moveStage(c, 'spotted');
          }}
          onClose={() => setExitsOpen(false)}
        />
      )}
    </section>
  );
}
