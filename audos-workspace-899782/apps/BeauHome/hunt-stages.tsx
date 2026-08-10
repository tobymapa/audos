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
import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Link2, Loader2, RotateCcw } from 'lucide-react';
import { typography } from '../../lib/colors';
import {
  RESERVE_CHANGED_EVENT,
  categoryLabel,
  insertRadarItem,
  radarToWardrobe,
  type RadarItem,
} from './profile-data';
import { parseCandidateUrl } from './candidate-url';

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
}

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const WEIGHED_CAP = 4;

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
    // The ninety-day rule (12a): an untouched spotted/weighed candidate goes
    // quiet — no opinion recorded, off the shelf, never deleted.
    if (stage === 'spotted' || stage === 'weighed') {
      const touched = meta?.stage_changed_at || meta?.created_at || item.created_at;
      const touchedMs = touched ? new Date(touched).getTime() : now;
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
  onOwned,
}: {
  candidate: Candidate;
  onStage: (stage: CandidateStage) => void;
  onPass: () => void;
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

      <div className="flex items-center gap-1 flex-wrap pt-1 border-t border-[var(--color-divider,rgba(59,43,29,0.12))]">
        {stage === 'spotted' && (
          <>
            {textAction('Weigh it', () => onStage('weighed'), { accent: true, title: 'Move it into the comparison' })}
            {textAction('Hold it', () => onStage('held'))}
            {textAction('Pass', onPass)}
          </>
        )}
        {stage === 'weighed' && (
          <>
            {textAction('Hold it', () => onStage('held'), { accent: true, title: 'Decided — watch for size, sale or season' })}
            {textAction('Pass', onPass)}
            {textAction('Back to Spotted', () => onStage('spotted'))}
          </>
        )}
        {stage === 'held' && (
          <>
            {textAction('Bought it', onOwned, { accent: true, title: 'It becomes a piece in The Ledger; the boards it sat on stop being proposals' })}
            {textAction('Pass', onPass)}
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

function AddCandidate({ onAdded }: { onAdded: () => void }) {
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
// The pipeline root.
// ---------------------------------------------------------------------------

export function HuntStages() {
  const { data: radarRows, refresh: refreshRadar } = (window as any).useWorkspaceDB('radar_items', {
    orderBy: { column: 'created_at', direction: 'desc' },
    limit: 200,
  });
  const { data: metaRows, refresh: refreshMeta } = (window as any).useWorkspaceDB('candidate_meta', {
    orderBy: { column: 'created_at', direction: 'desc' },
    limit: 200,
  });
  const [activeStage, setActiveStage] = useState<CandidateStage>('spotted');
  const [showExits, setShowExits] = useState(false);
  const [passingId, setPassingId] = useState<number | null>(null);
  const [passReason, setPassReason] = useState('');
  const [flash, setFlash] = useState<string | null>(null);

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
    const t = window.setTimeout(() => setFlash(null), 4500);
    return () => window.clearTimeout(t);
  }, [flash]);

  const candidates = useMemo(
    () => composeCandidates((radarRows || []) as RadarItem[], (metaRows || []) as CandidateMetaRow[]),
    [radarRows, metaRows],
  );

  const byStage = useMemo(() => {
    const groups: Record<CandidateStage, Candidate[]> = { spotted: [], weighed: [], held: [], passed: [], archived: [] };
    for (const c of candidates) groups[c.stage].push(c);
    return groups;
  }, [candidates]);

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
    await setCandidateStage(candidate.item.id, 'passed', { passed_reason: passReason.trim() || null });
    setPassingId(null);
    setPassReason('');
    setFlash(`Passed — Beau won\u2019t put “${candidate.item.name}\u201d up again. Undo any time under Passed & archived.`);
    refreshAll();
  };

  const markOwned = async (candidate: Candidate) => {
    await radarToWardrobe(candidate.item);
    setFlash(`“${candidate.item.name}\u201d is yours — it\u2019s in The Ledger now.`);
    refreshAll();
  };

  const stages: Array<{ id: CandidateStage; label: string; sub: string }> = [
    { id: 'spotted', label: 'Spotted', sub: 'Saved, unjudged' },
    { id: 'weighed', label: 'Weighed', sub: 'Being compared' },
    { id: 'held', label: 'Held', sub: 'Decided · watching' },
  ];

  const shown = byStage[activeStage] || [];

  return (
    <section aria-label="The Hunt — the candidate pipeline">
      <AddCandidate onAdded={refreshAll} />

      {/* THE STAGE RAIL — the funnel as filters on one screen, never tabs to
          another. Counts derive from the records; nothing stores its own. */}
      <div className="flex items-stretch gap-1.5 mt-5 flex-wrap" role="tablist" aria-label="Candidate stages">
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
        <p className="mt-2.5" style={{ ...bodyFont, fontSize: '12.5px', color: 'var(--color-accent-700,#7c4a17)' }}>
          {flash}
        </p>
      )}

      {/* THE STAGE'S CANDIDATES — cards (one per candidate: image-less but
          scannable — maker, piece, price, origin · date, the reason).
          Cards, not a table, so the same layout serves 390pt (M5). */}
      <div className="grid gap-3 mt-4 sm:grid-cols-2">
        {shown.map((candidate) => (
          <div key={candidate.item.id}>
            <CandidateCard
              candidate={candidate}
              onStage={(stage) => void moveStage(candidate, stage)}
              onPass={() => {
                setPassingId(candidate.item.id);
                setPassReason('');
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
          </div>
        ))}
        {shown.length === 0 && (
          <p className="sm:col-span-2 py-6 text-[var(--color-neutral-600,#856c51)]" style={{ ...bodyFont, fontSize: '14px' }}>
            {activeStage === 'spotted' && 'Nothing spotted yet — paste a product link above, or put a piece up from a board or the index.'}
            {activeStage === 'weighed' && 'Nothing being weighed — move a spotted candidate in and compare up to four at once.'}
            {activeStage === 'held' && 'Nothing held — a held candidate is one you\u2019ve decided on and are waiting to buy.'}
          </p>
        )}
      </div>

      {activeStage === 'weighed' && byStage.weighed.length >= WEIGHED_CAP && (
        <p className="mt-2 text-[var(--color-neutral-600,#856c51)]" style={{ ...bodyFont, fontSize: '11.5px' }}>
          Four is the ceiling — a fifth stops being a comparison. Adding another drops the earliest back to Spotted.
        </p>
      )}

      {/* OUT OF THE WAY — passed & archived, drawn apart (12a): a pass is an
          opinion, an archive is silence. Both reversible; nothing deleted. */}
      <div className="mt-6 border-t border-[var(--color-divider,rgba(59,43,29,0.18))] pt-3">
        <button
          type="button"
          onClick={() => setShowExits((v) => !v)}
          className="min-h-[44px] hover:underline text-left"
          style={{ ...bodyFont, fontSize: '13px', color: 'var(--color-neutral-700,#634e38)' }}
          aria-expanded={showExits}
        >
          Passed {byStage.passed.length} · Archived {byStage.archived.length} — {showExits ? 'hide' : 'show'} ›
        </button>
        {showExits && (
          <div className="grid gap-5 sm:grid-cols-2 mt-2">
            <div>
              <p className="uppercase text-[var(--color-neutral-700,#634e38)] pb-1.5 border-b border-[var(--color-divider,rgba(59,43,29,0.18))]" style={kicker}>
                Passed · {byStage.passed.length} — you said no; Beau won’t put these up again
              </p>
              {byStage.passed.map((c) => (
                <div key={c.item.id} className="py-2.5 border-b border-[var(--color-divider,rgba(59,43,29,0.12))]">
                  <p className={typography.color.primary} style={{ ...bodyFont, fontSize: '14px' }}>
                    {[c.item.brand, c.item.name].filter(Boolean).join(' · ')}
                  </p>
                  {c.meta?.passed_reason && (
                    <p className="text-[var(--color-neutral-700,#634e38)] italic" style={{ ...bodyFont, fontSize: '12px' }}>
                      “{c.meta.passed_reason}”
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => void moveStage(c, 'spotted')}
                    className="inline-flex items-center gap-1 mt-1 min-h-[36px] hover:underline"
                    style={{ ...bodyFont, fontSize: '12px', color: 'var(--color-accent,#a8712c)' }}
                  >
                    <RotateCcw className="w-3 h-3" aria-hidden="true" /> Undo the pass
                  </button>
                </div>
              ))}
              {byStage.passed.length === 0 && (
                <p className="py-3 text-[var(--color-neutral-600,#856c51)]" style={{ ...bodyFont, fontSize: '12.5px' }}>
                  Nothing passed. A pass records a reason and teaches Beau — it’s the cheapest signal in the product.
                </p>
              )}
            </div>
            <div>
              <p className="uppercase text-[var(--color-neutral-700,#634e38)] pb-1.5 border-b border-[var(--color-divider,rgba(59,43,29,0.18))]" style={kicker}>
                Archived · {byStage.archived.length} — untouched ninety days; no opinion recorded
              </p>
              {byStage.archived.map((c) => (
                <div key={c.item.id} className="py-2.5 border-b border-[var(--color-divider,rgba(59,43,29,0.12))]">
                  <p className={typography.color.primary} style={{ ...bodyFont, fontSize: '14px' }}>
                    {[c.item.brand, c.item.name].filter(Boolean).join(' · ')}
                  </p>
                  <button
                    type="button"
                    onClick={() => void moveStage(c, 'spotted')}
                    className="inline-flex items-center gap-1 mt-1 min-h-[36px] hover:underline"
                    style={{ ...bodyFont, fontSize: '12px', color: 'var(--color-accent,#a8712c)' }}
                  >
                    <RotateCcw className="w-3 h-3" aria-hidden="true" /> Bring it back
                  </button>
                </div>
              ))}
              {byStage.archived.length === 0 && (
                <p className="py-3 text-[var(--color-neutral-600,#856c51)]" style={{ ...bodyFont, fontSize: '12.5px' }}>
                  Nothing archived. Anything untouched ninety days drops here — off the shelf, never deleted.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
