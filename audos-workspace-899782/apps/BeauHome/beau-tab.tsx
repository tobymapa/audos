/**
 * THE EDIT — Beau's live intelligent assessment of the wardrobe (the Beau
 * intelligence overhaul, Layer 2's home; tab id 'beau', label "The Edit").
 *
 * Beau's reasoning on this screen comes from ONE live model call
 * (beau-assessment.ts): his overall verdict (the joint foundation — tops,
 * bottoms AND shoes together — first, then outerwear, knitwear, formalwear,
 * accessories — read live against the semantically tagged wardrobe, never
 * by regex rules), the current priority, what to acquire next, and
 * per-archetype essentials coverage. The old "foundation, in order" ladder
 * is retired from this screen (Milestones overhaul, Part 3a).
 * He reasons with the full context: measurements, complexion, budget,
 * lifestyle, the taste memory of everything the user has passed on, and the
 * verified brand reference layer.
 *
 * Below "what to acquire next" sits THE BRIEFING (briefing.tsx) — a
 * SECOND, deeper reasoning pass over the same gap data. Where the list is
 * atomic and live, the Briefing is synthesis and memory: it names the
 * throughline running through this season's gaps, and it compares the read
 * to the last Briefing it wrote ("the footwear gap flagged last season is
 * closed") from the snapshot stored in the briefings table. Both it and the
 * free list above it are ACCORDIONS — header always visible, body closed
 * until tapped — and expanding the Briefing is what asks Beau to write it;
 * there is no generate button. It never replaces the free list above it.
 *
 * Three things on the screen cost nothing extra: THE COVERAGE MAP
 * (coverage-map.tsx — registers × categories, drawn straight from Layer 1's
 * semantic tags), COMPLETE THE LOOK (complete-look.tsx — occasion outfit
 * slots over the same tags + the cached assessment), and WHAT YOU'VE
 * PASSED ON, the taste memory (taste-memory.ts), where a dismissal is
 * reversible. Tapping a gap anywhere routes to The Rail, pre-filtered.
 *
 * The result is CACHED — the model re-runs only when the wardrobe,
 * archetypes or profile change, when a recommendation is dismissed or put
 * back in play (a piece logged elsewhere re-assesses automatically,
 * debounced so Layer 1's tags land first), or on the explicit "Re-assess"
 * button. Never on mere renders.
 *
 * Owned pieces are always quoted by the user's own label — "M43" stays
 * "M43" everywhere on this screen.
 *
 * Design system: oatmeal ground, paper cards, walnut verdict band,
 * Cormorant headings, Lora body, hairline rules, no box-shadows.
 */
import { useEffect, useState } from 'react';
import { ChevronRight, Loader2, RefreshCw, RotateCcw, X } from 'lucide-react';
import { tw, typography } from '../../lib/colors';
import {
  goToTab,
  type CategoryBudget,
  type StylePrefs,
  type StyleProfile,
  type WardrobePiece,
} from './profile-data';
import { type AssessmentRecommendation } from './beau-assessment';
import { useBeauAssessment } from './beau-assessment-context';
import { useBeauReveal } from './beau-reveal';
import { HairlineRowsSkeleton } from './skeleton';
import { CoverageMap } from './coverage-map';
import { CompleteTheLook } from './complete-look';
import { Briefing } from './briefing.tsx';
import {
  dismissRecommendation,
  fetchDismissedRecommendations,
  restoreRecommendation,
  TASTE_MEMORY_EVENT,
  type DismissedRecommendation,
} from './taste-memory';

// ---------------------------------------------------------------------------
// The accordion — shared by "What to acquire next" and the Briefing below it.
// ---------------------------------------------------------------------------

/**
 * A collapsible section of The Edit: the header (rule, title, standfirst and
 * any right-hand link) is always visible; the body is closed until it is
 * tapped. The 0fr → 1fr grid row is what animates the open smoothly without
 * measuring the content first.
 *
 * For the Briefing the expand is also the TRIGGER — the caller mounts the
 * body only once the section has been opened, and mounting is what starts
 * Beau writing. Nothing else asks for it.
 */
function EditAccordion({
  id,
  title,
  standfirst,
  open,
  onToggle,
  aside,
  children,
}: {
  id: string;
  title: string;
  standfirst: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  /** A sibling of the toggle, never inside it — a button cannot nest. */
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="mt-10">
      <div className="flex items-end justify-between gap-3 flex-wrap pb-3 border-b border-[var(--color-text,#3b2b1d)]">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          className="flex items-start gap-2.5 text-left min-w-0 flex-1 min-h-[44px]"
        >
          <ChevronRight
            className={`w-4 h-4 flex-shrink-0 transition-transform duration-300 ${open ? 'rotate-90' : ''}`}
            strokeWidth={1.5}
            aria-hidden="true"
            style={{ marginTop: '8px' }}
          />
          <span className="min-w-0">
            <span className={`block hab-section-head ${typography.color.primary}`} style={{ marginBottom: '6px' }}>
              {title}
            </span>
            <span
              className={`block ${typography.color.primary}`}
              style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', lineHeight: 1.6, maxWidth: '62ch' }}
            >
              {standfirst}
            </span>
          </span>
        </button>
        {aside}
      </div>
      <div
        id={`${id}-panel`}
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden min-h-0">{children}</div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Recommendations — what to acquire next, straight from the same reasoning
// pass. Product hunting lives on The Rail; this layer is the WHY.
// (The old "foundation, in order" ladder is removed — Part 3a.)
// ---------------------------------------------------------------------------

function DismissControl({ rec, onDismissed }: { rec: AssessmentRecommendation; onDismissed: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await dismissRecommendation({
        pieceName: rec.pieceName,
        subType: rec.subType || null,
        category: rec.category || null,
        archetypesServed: rec.archetypesServed,
        reason: reason.trim() || null,
        source: 'edit',
      });
      setOpen(false);
      setReason('');
      onDismissed();
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[var(--color-neutral-600,#856c51)] hover:text-[var(--space-text-primary)] transition-colors underline underline-offset-2 decoration-dotted"
        style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px' }}
      >
        Not for me
      </button>
    );
  }

  return (
    <div className="w-full mt-1">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder="Why not? Optional — it makes his alternative sharper"
          disabled={saving}
          className={`${tw.input.base} ${tw.input.default} ${typography.size.sm} flex-1 min-w-[220px]`}
          aria-label={`Why the ${rec.pieceName} is not for you`}
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={saving}
          className={`px-3 py-2 rounded-lg ${typography.size.sm} ${tw.button.primary} inline-flex items-center gap-1.5 disabled:opacity-50`}
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          {saving ? 'Noting it\u2026' : 'Tell Beau'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={saving}
          className={`p-2 rounded-lg ${tw.button.ghost}`}
          aria-label="Keep this recommendation"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <p className={`${typography.size.xs} ${typography.color.muted} mt-1.5`}>
        Beau will stop offering this piece and find another way to close the same gap.
      </p>
    </div>
  );
}

function RecommendationRow({ rec, onDismissed }: { rec: AssessmentRecommendation; onDismissed: () => void }) {
  return (
    <div className="py-6">
      {rec.replacesDismissed && (
        <p className="uppercase text-[var(--color-accent-700,#7c4a17)]" style={{ fontFamily: 'var(--space-font-heading)', fontSize: '11px', letterSpacing: '0.12em', marginBottom: '6px' }}>
          Instead of the {rec.replacesDismissed} you passed on
        </p>
      )}
      <p className={typography.color.primary} style={{ fontFamily: 'var(--space-font-heading)', fontWeight: 500, fontSize: '23px', lineHeight: 1.2 }}>
        {rec.pieceName}
      </p>
      {(rec.subType || rec.category) && (
        <p className="uppercase text-[var(--color-neutral-600,#856c51)]" style={{ fontFamily: 'var(--space-font-family)', fontSize: '11px', letterSpacing: '0.14em', marginTop: '4px' }}>
          {rec.subType || rec.category}
        </p>
      )}
      {rec.whyNow && (
        <p className={typography.color.primary} style={{ fontFamily: 'var(--space-font-family)', fontSize: '15px', lineHeight: 1.6, maxWidth: '58ch', marginTop: '10px' }}>
          {rec.whyNow}
        </p>
      )}
      {rec.qualitySignals && (
        <p
          className="text-[var(--color-neutral-800,#453325)]"
          style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', lineHeight: 1.6, maxWidth: '58ch', paddingLeft: '16px', borderLeft: '2px solid var(--color-accent,#a8712c)', marginTop: '12px' }}
        >
          <em
            className="block uppercase not-italic text-[var(--color-accent-700,#7c4a17)]"
            style={{ fontFamily: 'var(--space-font-heading)', fontSize: '12px', letterSpacing: '0.12em', marginBottom: '5px' }}
          >
            What to look for
          </em>
          {rec.qualitySignals}
        </p>
      )}
      {rec.fitNote && (
        <p className={typography.color.secondary} style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', lineHeight: 1.6, maxWidth: '58ch', marginTop: '10px' }}>
          {rec.fitNote}
        </p>
      )}
      <div className="flex items-center gap-4 flex-wrap" style={{ marginTop: '12px' }}>
        {rec.exampleBrand && (
          <span className="text-[var(--color-neutral-700,#634e38)]" style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px', fontStyle: 'italic' }}>
            One maker who does this well: {rec.exampleBrand}
          </span>
        )}
        {rec.archetypesServed.length > 0 && (
          <span className="text-[var(--color-accent-700,#7c4a17)]" style={{ fontFamily: 'var(--space-font-family)', fontSize: '12px', fontStyle: 'italic' }}>
            Serves your {rec.archetypesServed.join(' and ')} side{rec.archetypesServed.length > 1 ? 's' : ''}
          </span>
        )}
        <span className="flex-1" />
        <DismissControl rec={rec} onDismissed={onDismissed} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Taste memory — what he has turned down, and the way back.
// ---------------------------------------------------------------------------

function TasteMemory({ items, onRestored }: { items: DismissedRecommendation[]; onRestored: () => void }) {
  const [busyId, setBusyId] = useState<number | null>(null);
  if (items.length === 0) return null;

  const restore = async (id: number) => {
    if (busyId != null) return;
    setBusyId(id);
    try {
      await restoreRecommendation(id);
      onRestored();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section aria-label="What you have passed on" className="mt-10">
      <div className="pb-3 border-b border-[var(--color-text,#3b2b1d)]">
        <h3 className={`hab-section-head ${typography.color.primary}`} style={{ marginBottom: '6px' }}>What you’ve passed on</h3>
        <p className={typography.color.primary} style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', lineHeight: 1.6, maxWidth: '62ch' }}>
          Beau remembers. He won’t offer these again in the same form — where the gap is still real he looks for
          another way to close it. Put one back in play any time.
        </p>
      </div>
      <div className="divide-y divide-[var(--space-border-default)] border-b border-[var(--space-border-default)]">
        {items.map((item) => (
          <div key={item.id} className="py-4 flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <p className={typography.color.primary} style={{ fontFamily: 'var(--space-font-heading)', fontSize: '17px', fontWeight: 400, lineHeight: 1.25 }}>
                {item.pieceName}
              </p>
              <p className={typography.color.secondary} style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px', lineHeight: 1.5, marginTop: '3px' }}>
                {item.reason ? `“${item.reason}”` : 'No reason given — just not for you.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void restore(item.id)}
              disabled={busyId != null}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[44px] sm:min-h-0 rounded-full ${typography.size.xs} border border-[var(--space-border-default)] text-[var(--space-text-secondary)] hover:border-[var(--space-border-strong)] hover:text-[var(--space-text-primary)] transition-colors disabled:opacity-60`}
            >
              {busyId === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
              Put back in play
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The tab root
// ---------------------------------------------------------------------------

export function BeauTab({
  profile,
  budgets,
  pieces,
  prefs,
}: {
  profile: StyleProfile;
  budgets: Record<string, CategoryBudget>;
  pieces: WardrobePiece[];
  prefs: StylePrefs | null;
}) {
  // App-level assessment state (The Edit caching fix): the result lives in
  // BeauAssessmentProvider at the app root, so it survives tab switches —
  // returning to this tab paints the cached read instantly.
  const { result, loading, reassessing, busy, phase, error, ensure, reassess } = useBeauAssessment();
  const [dismissed, setDismissed] = useState<DismissedRecommendation[]>([]);
  // NOTHING IS COLLAPSED (build brief rule 7): “What to acquire next” — the
  // payoff of the whole screen — arrives OPEN. The Briefing alone stays
  // closed because expanding it is what asks Beau to write it.
  // `briefingOpened` latches on the first expand: it is what mounts the
  // Briefing, and it stays true afterwards so collapsing never throws the
  // document away.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ 'acquire-next': true });
  const [briefingOpened, setBriefingOpened] = useState(false);
  const toggleAccordion = (id: string) => setOpenSections((cur) => ({ ...cur, [id]: !cur[id] }));

  const loadDismissed = () => {
    void fetchDismissedRecommendations().then(setDismissed).catch(() => undefined);
  };

  // Opening the tab guarantees ONE validated load per session — the cached
  // result answers instantly on later visits, and tab navigation alone
  // never re-runs the model. Invalidation (wardrobe / archetype / profile
  // changes, dismissals, Layer 1 tags landing) lives in the app-level
  // provider, not here.
  useEffect(() => {
    ensure();
  }, [ensure]);

  // The taste memory — loaded on open, and kept in step with dismissals made
  // anywhere else in the app.
  useEffect(() => {
    loadDismissed();
    window.addEventListener(TASTE_MEMORY_EVENT, loadDismissed);
    return () => window.removeEventListener(TASTE_MEMORY_EVENT, loadDismissed);
  }, []);

  // A dismissal (or a restore) is one of Beau's re-assessment triggers: the
  // taste-memory event moves the assessment fingerprint, so the app-level
  // provider re-reasons with the gap still open. Here we only refresh the
  // visible list.
  const onTasteMemoryChanged = () => {
    loadDismissed();
  };

  const assessment = result?.assessment || null;
  const showSkeleton = loading && !assessment;
  // Beau "typing" (Part 3.2): a FRESH verdict types on progressively; the
  // cached verdict present at first paint shows instantly.
  const verdictShown = useBeauReveal(assessment?.verdict || '');

  return (
    <div>
      {/* The standard tab masthead — title + one-line standfirst, sharing
          height, type and indentation with every other primary tab. */}
      <div className="px-6 sm:px-10 pt-[52px] pb-8 border-b border-[var(--color-divider,rgba(59,43,29,0.18))]">
        <div className="max-w-[1180px] mx-auto">
          <h3 className={`hab-page-title ${typography.color.primary}`} style={{ marginBottom: '10px' }}>
            The Edit
          </h3>
          <p className={`hab-standfirst ${typography.color.secondary}`} style={{ margin: 0 }}>
            Beau’s live read of your wardrobe — and what deserves your money next.
          </p>
        </div>
      </div>

      <div className="px-6 sm:px-10 py-8 max-w-[1180px] mx-auto w-full">

      {/* Status line + the explicit Re-assess — the ONLY manual trigger.

          A QUEUED pass (one a save asked for) is reported here as a small
          indicator and nothing more: the verdict, the coverage map and
          Complete the Look below stay on screen and readable throughout, and
          each re-renders in place the moment the new read lands. Nothing is
          replaced by a spinner, and no save ever waited for this. */}
      <div className="flex items-center justify-between gap-2 mb-5 flex-wrap">
        <p aria-live="polite" className={`${typography.size.xs} ${typography.color.muted}`} style={{ fontFamily: 'var(--space-font-family)' }}>
          {loading
            ? phase
            : reassessing
              ? 'Beau is re-assessing your wardrobe — carry on; this updates itself.'
              : result
                ? result.fromCache
                  ? 'From Beau\u2019s last assessment — he re-assesses when your wardrobe or profile changes.'
                  : 'Beau assessed your wardrobe just now.'
                : ''}
        </p>
        <button
          type="button"
          onClick={reassess}
          disabled={busy}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[44px] sm:min-h-0 rounded-full ${typography.size.xs} border border-[var(--space-border-default)] text-[var(--space-text-secondary)] hover:border-[var(--space-border-strong)] hover:text-[var(--space-text-primary)] transition-colors disabled:opacity-60`}
          title="Ask Beau to re-read your wardrobe from scratch"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {busy ? 'Assessing\u2026' : 'Re-assess'}
        </button>
      </div>

      {/* Pieces still being catalogued — the read sharpens as tags land. */}
      {!loading && result && result.untaggedCount > 0 && (
        <p className="text-[var(--color-neutral-600,#856c51)]" style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px', lineHeight: 1.6, marginBottom: '16px' }}>
          Beau is still cataloguing {result.untaggedCount} of your piece{result.untaggedCount === 1 ? '' : 's'} — his
          read sharpens automatically as he finishes.
        </p>
      )}

      {showSkeleton && <HairlineRowsSkeleton rows={6} />}

      {!showSkeleton && error && !assessment && (
        <div className="py-10 text-center">
          <p className={`${typography.size.sm} ${typography.color.secondary}`}>{error}</p>
          <button
            type="button"
            onClick={reassess}
            className="mt-3 px-4 min-h-[44px] rounded text-[14px] bg-transparent border border-[var(--color-accent,#a8712c)] text-[var(--color-accent-700,#7c4a17)] hover:bg-[var(--color-accent-100,#fbf1de)] transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {assessment && (
        <div>
          {/* THE VERDICT — the walnut band, Beau's overall read. */}
          {assessment.verdict && (
            <section
              aria-label="Beau's verdict"
              className="-mx-6 sm:-mx-10 px-6 sm:px-10"
              style={{ background: '#241a12', paddingTop: '44px', paddingBottom: '48px' }}
            >
              <div className="max-w-[1180px] mx-auto">
                <p className="uppercase flex items-center gap-2 flex-wrap" style={{ fontFamily: 'var(--space-font-heading)', fontSize: '12px', letterSpacing: '0.16em', color: '#e3c184', marginBottom: '8px' }}>
                  Beau · his verdict
                  {/* The quiet mark that a queued pass is running. The verdict
                      underneath stays exactly where it is. */}
                  {reassessing && (
                    <span className="inline-flex items-center gap-1.5 normal-case" style={{ fontFamily: 'var(--space-font-family)', fontSize: '11px', letterSpacing: '0.02em', opacity: 0.85 }}>
                      <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
                      Re-reading your wardrobe…
                    </span>
                  )}
                </p>
                <p aria-live="polite" style={{ fontFamily: 'var(--space-font-heading)', fontWeight: 400, fontSize: '26px', lineHeight: 1.35, color: '#f6f0e5', maxWidth: '58ch' }}>
                  {verdictShown}
                </p>
                {assessment.currentPriority && (assessment.currentPriority.headline || assessment.currentPriority.why) && (
                  <p className="mt-5" style={{ fontFamily: 'var(--space-font-family)', fontSize: '15px', lineHeight: 1.6, color: '#f6f0e5', opacity: 0.82, maxWidth: '56ch' }}>
                    <span className="uppercase" style={{ fontFamily: 'var(--space-font-heading)', fontSize: '11px', letterSpacing: '0.14em', color: '#e3c184', display: 'block', marginBottom: '4px' }}>
                      The priority right now
                    </span>
                    {assessment.currentPriority.headline}
                    {assessment.currentPriority.headline && assessment.currentPriority.why ? ' — ' : ''}
                    {assessment.currentPriority.why}
                  </p>
                )}
              </div>
            </section>
          )}

          {/* THE COVERAGE MAP — registers × foundation categories, built
              from the Layer 1 semantic tags (no extra model call). The
              archetype layer sits inside the same map. */}
          <CoverageMap profile={profile} pieces={pieces} />

          {/* COMPLETE THE LOOK — occasion outfit slots over the same
              semantic data + the cached assessment. Not a separate AI call. */}
          <CompleteTheLook pieces={pieces} assessment={assessment} />

          {/* WHAT TO ACQUIRE NEXT — an accordion: the header always reads,
              the list itself opens on a tap. */}
          {assessment.recommendations.length > 0 && (
            <EditAccordion
              id="acquire-next"
              title="What to acquire next"
              standfirst="In priority order, from the same reasoning pass. Each one leads into The Hunt, where the candidates that answer it live."
              open={!!openSections['acquire-next']}
              onToggle={() => toggleAccordion('acquire-next')}
              aside={
                <button
                  type="button"
                  onClick={() => goToTab('scout')}
                  className="inline-flex items-center gap-1.5 group whitespace-nowrap"
                  style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', color: 'var(--color-accent,#a8712c)' }}
                >
                  Take these to The Hunt
                  <span className="group-hover:translate-x-0.5 transition-transform" style={{ fontFamily: 'var(--space-font-heading)', fontSize: '17px', lineHeight: 1 }} aria-hidden="true">
                    ›
                  </span>
                </button>
              }
            >
              <div className="divide-y divide-[var(--space-border-default)] border-b border-[var(--space-border-default)]">
                {assessment.recommendations.map((rec, i) => (
                  <RecommendationRow key={`${rec.pieceName}-${i}`} rec={rec} onDismissed={onTasteMemoryChanged} />
                ))}
              </div>
            </EditAccordion>
          )}

          {/* THE BRIEFING — the synthesis pass over the same gaps, with
              season-over-season memory. Directly below the free list, which
              is visibly its input, and on the same accordion. Expanding it is
              the trigger: the body mounts on the first open and Beau either
              shows the Briefing he has already written or writes one. */}
          <EditAccordion
            id="briefing"
            title="Briefing"
            standfirst="The list above is the gaps, one at a time. The Briefing is what they add up to — written once a season, and measured against the last one."
            open={!!openSections.briefing}
            onToggle={() => {
              setBriefingOpened(true);
              toggleAccordion('briefing');
            }}
          >
            <div style={{ paddingTop: '20px' }}>
              {briefingOpened && <Briefing assessment={assessment} profile={profile} pieces={pieces} />}
            </div>
          </EditAccordion>

          {/* WHAT HE HAS PASSED ON — the taste memory Beau reasons against. */}
          <TasteMemory items={dismissed} onRestored={onTasteMemoryChanged} />

          {/* A soft error over a stale assessment — the old read stays useful. */}
          {error && (
            <p className={`${typography.size.xs} text-[var(--space-semantic-warning)] mt-4`}>{error}</p>
          )}

          <p className={`${typography.size.xs} ${typography.color.muted} mt-6`} style={{ fontSize: '10px' }}>
            Beau assesses live — no fixed formulas. He reads your measurements, your complexion, your budget and your
            life alongside every piece you own, and he re-assesses automatically when you log or remove a piece, change
            your style directions, update your profile or pass on a recommendation; Re-assess forces a fresh pass any
            time. Pieces keep the exact names you gave them — Beau classifies each one behind the scenes (its type, the
            directions it serves, its formality, colour and season) and reasons from that, but never renames anything.
          </p>
        </div>
      )}
      </div>
    </div>
  );
}
