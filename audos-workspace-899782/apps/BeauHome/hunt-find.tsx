/**
 * THE HUNT — the unified FIND sub-tab (Recommendation Engine overhaul,
 * Part 3): Find, the AI Matchmaker and Judge merged into ONE intelligent
 * interface.
 *
 * One text input ("What are you hunting for? Ask Beau anything.") — Beau
 * reads the intent from the query and routes internally:
 *   · a NAMED PIECE with filters → REAL LISTINGS. “a Grenfell Golfer, size
 *     36, secondhand, under €200” is a search, so Beau searches (see
 *     ./listing-search) and comes back with actual items — title, price,
 *     condition, marketplace, a link straight to that listing. Never a list
 *     of shops the customer could have found himself.
 *   · open-ended piece query     → 3–5 structured recommendations
 *   · brand query                → a structured brand dossier
 *   · quality assessment query   → a quality judgement with rationale
 *   · style matchmaker query     → full profile-aware recommendations
 *   · a hybrid of the first two  → Beau's answer, with the listings beneath
 * There is NO mode selector — the old Auto / Recommendations / Brand file /
 * Quality verdict chips are gone. Beau reads the intent from the natural
 * language itself; the four bullet lines above the box orient the user.
 *
 * Every query is logged to Your Hunt History (`scout_hunts`) with the full
 * result set, timestamp and whether profile was on or off — and history
 * rows are re-runnable from there.
 *
 * Makers Beau surfaces in a recommendations result are folded into the
 * Discover directory with the "Beau recommended" source tag (hunt-ai
 * recordBeauRecommendedBrands — fire-and-forget).
 */
import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { typography } from '../../lib/colors';
import { smartTitle } from '../../lib/smart-title';
import { LiveTalkButton, VoiceButton } from '../../lib/voice';
import { logBrand, type CategoryBudget, type StylePrefs, type StyleProfile, type WardrobePiece } from './profile-data';
import type { ScoutHuntRow } from './scout-ai';
import { HairlineRowsSkeleton } from './skeleton';
import { TicketFrame } from './ticket-frame';
import {
  recordBeauRecommendedBrands,
  runUnifiedFind,
  type UnifiedFindMode,
  type UnifiedFindResult,
} from './hunt-ai';
import { describeParams, type ListingResult, type ListingSearchOutcome } from './listing-search';
import { ArchetypeTag, BeauRatingTag, CompareAction } from './hunt-discover';
import { useBeauReveal } from './beau-reveal';

// ---------------------------------------------------------------------------
// History (de)serialisation — unified rows persist in scout_hunts with
// result_json kind 'unified', alongside the legacy 'find'/'review' rows.
// ---------------------------------------------------------------------------

export interface UnifiedHistoryPayload {
  kind: 'unified';
  profileOn: boolean;
  forcedMode: UnifiedFindMode;
  result: UnifiedFindResult;
}

export function parseUnifiedResult(row: ScoutHuntRow): UnifiedHistoryPayload | null {
  if (!row.result_json) return null;
  try {
    const parsed = JSON.parse(row.result_json);
    if (parsed && parsed.kind === 'unified' && parsed.result && typeof parsed.result.type === 'string') {
      return parsed as UnifiedHistoryPayload;
    }
    return null;
  } catch {
    return null;
  }
}

/** One-line summary + status word for history rows (unified results). */
export function unifiedRowMeta(payload: UnifiedHistoryPayload): { detail: string; status: string } {
  const profileBit = payload.profileOn ? 'profile on' : 'profile off';
  if (payload.result.type === 'listings') {
    const { listings, params } = payload.result.search;
    const brief = describeParams(params);
    if (listings.length === 0) return { detail: `Nothing live matching ${brief}`, status: 'No match' };
    return {
      detail: `${listings.length} live listing${listings.length === 1 ? '' : 's'} · ${brief}`,
      status: 'Listings',
    };
  }
  if (payload.result.type === 'recommendations') {
    const n = payload.result.results.length;
    return { detail: `${n} option${n === 1 ? '' : 's'} from Beau · ${profileBit}`, status: 'Reviewed' };
  }
  if (payload.result.type === 'brandDossier') {
    return { detail: `Brand dossier · ${payload.result.brand.name} · ${profileBit}`, status: 'Dossier' };
  }
  return { detail: `${payload.result.verdict} · ${profileBit}`, status: 'Verdict' };
}

// ---------------------------------------------------------------------------
// Result views — shared by the Find surface and the history detail page.
// ---------------------------------------------------------------------------

const JUDGEMENT_STYLE: Record<string, string> = {
  'Worth it': 'bg-[color-mix(in_srgb,var(--space-semantic-success)_14%,var(--space-surface-card))] text-[var(--space-semantic-success)]',
  'Consider alternatives': 'bg-[color-mix(in_srgb,var(--space-semantic-warning)_14%,var(--space-surface-card))] text-[var(--space-semantic-warning)]',
  Pass: 'bg-[color-mix(in_srgb,var(--space-semantic-danger)_14%,var(--space-surface-card))] text-[var(--space-semantic-danger)]',
};

function DossierRow({ term, detail }: { term: string; detail: string }) {
  if (!detail) return null;
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

// ---------------------------------------------------------------------------
// LIVE LISTINGS — the result shape for a structured piece hunt.
//
// A brand recommendation and a listing are different objects and want
// different cards. This one leads with the photograph and the PRICE, because
// on a specific hunt the price is the decision, and every card ends in a link
// straight to that item — never a shop homepage.
// ---------------------------------------------------------------------------

function ListingChip({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'warning' }) {
  if (!label) return null;
  return (
    <span
      className={tone === 'warning' ? 'uppercase text-[var(--space-semantic-warning)]' : 'uppercase text-[var(--color-neutral-700,#634e38)]'}
      style={{
        fontFamily: 'var(--space-font-heading)',
        fontSize: '10px',
        letterSpacing: '0.12em',
        border: '1px solid var(--color-divider,rgba(59,43,29,0.18))',
        borderRadius: '2px',
        padding: '2px 6px',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

export function ListingResultCard({ listing }: { listing: ListingResult }) {
  return (
    <div className="py-5 flex gap-4 items-start">
      {listing.imageUrl ? (
        <a
          href={listing.url}
          target="_blank"
          rel="noopener noreferrer"
          className="hab-plate block flex-shrink-0"
          style={{ width: '104px' }}
          aria-label={`${listing.title} \u2014 open the listing`}
        >
          {/* The seller's own photograph at its own resolution — CSS caps the
              box, the file is never resized or re-encoded. */}
          <img
            src={listing.imageUrl}
            alt={listing.title}
            loading="lazy"
            decoding="async"
            style={{ maxWidth: '100%', height: 'auto', display: 'block' }}
          />
        </a>
      ) : (
        <span className="hab-plate-empty block flex-shrink-0" style={{ width: '104px', height: '104px' }} aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <span
            className={typography.color.primary}
            style={{
              fontFamily: 'var(--space-font-family)',
              fontSize: '15px',
              lineHeight: 1.45,
              maxWidth: '46ch',
              display: '-webkit-box',
              WebkitLineClamp: '2',
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {listing.title}
          </span>
          <span className={`hab-fig ${typography.color.primary}`} style={{ fontSize: '22px', whiteSpace: 'nowrap' }}>
            {listing.priceDisplay}
          </span>
        </div>
        <div className="flex items-center gap-x-2.5 gap-y-1.5 mt-2.5 flex-wrap">
          <ListingChip label={listing.condition} />
          {listing.sizeText && <ListingChip label={`Size ${listing.sizeText}`} />}
          {listing.overBudget && <ListingChip label="Just over your ceiling" tone="warning" />}
          <span className="text-[var(--color-neutral-600,#856c51)]" style={{ fontFamily: 'var(--space-font-family)', fontSize: '12px' }}>
            {[listing.source, listing.sellerLocation, listing.shippingNote].filter(Boolean).join(' \u00b7 ')}
          </span>
        </div>
        <a
          href={listing.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-baseline gap-1 mt-3 hover:underline"
          style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px', color: 'var(--color-accent,#a8712c)' }}
        >
          View listing
          <span aria-hidden="true" style={{ fontSize: '11px', lineHeight: 1 }}>↗</span>
        </a>
      </div>
    </div>
  );
}

export function ListingResultsSection({
  search,
  heading = 'Live listings',
  onRefine,
}: {
  search: ListingSearchOutcome;
  heading?: string;
  /** Present on the live Find surface — a relaxed brief re-runs the hunt. */
  onRefine?: (query: string) => void;
}) {
  const { params, listings, note, broaden, sourcesTried } = search;
  const brief = describeParams(params);
  return (
    <section aria-label="Live listings">
      <div className="flex items-baseline justify-between gap-3 pb-2 border-b border-[var(--color-text,#3b2b1d)]">
        <span className="hab-kicker text-[var(--color-accent-700,#7c4a17)]">
          {heading}
          {listings.length > 0 ? ` \u00b7 ${listings.length}` : ''}
        </span>
        {brief && (
          <span className="hab-kicker text-[var(--color-neutral-600,#856c51)] truncate max-w-[40ch]" style={{ letterSpacing: '0.14em' }}>
            {brief}
          </span>
        )}
      </div>

      {note && (
        <p
          className="hab-reason text-[var(--color-neutral-800,#453325)] mt-4"
          style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', lineHeight: 1.6, maxWidth: '62ch' }}
        >
          {note}
        </p>
      )}

      {listings.length > 0 && (
        <div className="divide-y divide-[var(--color-divider,rgba(59,43,29,0.18))] border-b border-[var(--color-divider,rgba(59,43,29,0.18))] mt-3">
          {listings.map((listing) => (
            <ListingResultCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}

      {onRefine && broaden.length > 0 && (
        <div className="mt-5">
          <p className="hab-kicker text-[var(--color-accent-700,#7c4a17)]" style={{ fontSize: '11px', marginBottom: '8px' }}>
            Widen the brief
          </p>
          <div className="flex flex-wrap gap-2">
            {broaden.map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => onRefine(option.query)}
                className="px-3 min-h-[38px] rounded text-[13px] bg-transparent border border-[var(--color-accent,#a8712c)] text-[var(--color-accent-700,#7c4a17)] hover:bg-[var(--color-accent-100,#fbf1de)] transition-colors"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {sourcesTried.length > 0 && (
        <p className={`${typography.size.xs} ${typography.color.muted} mt-3`} style={{ fontSize: '10px' }}>
          Swept live from {sourcesTried.join(' \u00b7 ')}. Prices, sizes and conditions are the seller&rsquo;s own — stock
          moves fast, so open the listing before you commit.
        </p>
      )}
    </section>
  );
}

export function UnifiedResultView({
  result,
  profileOn,
  onOpenBrand,
  compareList,
  onToggleCompare,
  onRefine,
  reveal = false,
}: {
  result: UnifiedFindResult;
  profileOn: boolean;
  onOpenBrand: (brandName: string) => void;
  /** RETIRED — the Compare sub-tab is gone (the Weighed stage is the one
   * comparison surface); optional so legacy history views compile. */
  compareList?: string[];
  onToggleCompare?: (brand: string) => void;
  /** Re-runs the hunt with a relaxed brief — live Find surface only. */
  onRefine?: (query: string) => void;
  /** true on the live Find surface — Beau's verdict prose types on
   * progressively (Part 3.2). History views keep it instant. */
  reveal?: boolean;
}) {
  // Hooks run unconditionally — the branches below pick what they need.
  const dossierVerdictShown = useBeauReveal(
    result.type === 'brandDossier' ? result.brand.beausVerdict : '',
    { animate: reveal },
  );
  const rationaleShown = useBeauReveal(
    result.type === 'qualityJudgement' ? result.rationale : '',
    { animate: reveal },
  );

  // A structured piece hunt IS the listing set — no brand directory in front
  // of it, because the customer asked for the piece, not for the shops.
  if (result.type === 'listings') {
    return <ListingResultsSection search={result.search} onRefine={onRefine} />;
  }

  if (result.type === 'recommendations') {
    return (
      <div>
        {/* Beau's honest word when the stated budget and the quality bar
            conflict (Part 3.3) — stretch slightly or go secondhand, never
            a compromised pick. */}
        {result.budgetNote && (
          <p
            className="text-[var(--color-neutral-800,#453325)] mb-5"
            style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', lineHeight: 1.6, maxWidth: '58ch', paddingLeft: '16px', borderLeft: '2px solid var(--color-accent,#a8712c)' }}
          >
            <em
              className="block uppercase not-italic text-[var(--color-accent-700,#7c4a17)]"
              style={{ fontFamily: 'var(--space-font-heading)', fontSize: '11px', letterSpacing: '0.12em', marginBottom: '4px' }}
            >
              Beau on the budget
            </em>
            {result.budgetNote}
          </p>
        )}
        <div className="divide-y divide-[var(--color-divider,rgba(59,43,29,0.18))] border-b border-[var(--color-divider,rgba(59,43,29,0.18))]">
          {result.results.map((rec, idx) => (
            <div key={`${rec.brandName}-${idx}`} className="py-6">
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <span className={typography.color.primary} style={{ fontFamily: 'var(--space-font-heading)', fontWeight: 500, fontSize: '23px', lineHeight: 1.15 }}>
                  {rec.brandName}
                </span>
                <span className="inline-flex items-baseline gap-3">
                  {rec.gapFilled && (
                    <span className="uppercase text-[var(--color-accent-700,#7c4a17)]" style={{ fontFamily: 'var(--space-font-heading)', fontSize: '11px', letterSpacing: '0.12em' }}>
                      Fills a gap
                    </span>
                  )}
                  {rec.priceRange && (
                    <span className="text-[var(--color-neutral-600,#856c51)]" style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px' }}>
                      {rec.priceRange}
                    </span>
                  )}
                </span>
              </div>
              {rec.whatTheyMake && (
                <p className="text-[var(--color-neutral-600,#856c51)] mt-0.5" style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px' }}>
                  {rec.whatTheyMake}
                </p>
              )}
              {rec.whyItFits && (
                <p className={`${typography.color.primary} mt-2.5`} style={{ fontFamily: 'var(--space-font-family)', fontSize: '15px', lineHeight: 1.6, maxWidth: '62ch' }}>
                  {rec.whyItFits}
                </p>
              )}
              {rec.profileNote && (
                <p
                  className="text-[var(--color-neutral-800,#453325)] mt-3"
                  style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', lineHeight: 1.6, maxWidth: '58ch', paddingLeft: '16px', borderLeft: '2px solid var(--color-accent,#a8712c)' }}
                >
                  <em className="block uppercase not-italic text-[var(--color-accent-700,#7c4a17)]" style={{ fontFamily: 'var(--space-font-heading)', fontSize: '11px', letterSpacing: '0.12em', marginBottom: '4px' }}>
                    For you
                  </em>
                  {rec.profileNote}
                </p>
              )}
              {rec.archetypeFit.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-3">
                  {rec.archetypeFit.slice(0, 4).map((a) => (
                    <ArchetypeTag key={a} id={a} />
                  ))}
                </div>
              )}
              {/* Direct buy links (Part 3.2) — 2–3 live product pages from
                  the market sweep, labelled by retailer. Secondhand
                  marketplaces read “View on …”, everything else “Buy at …”. */}
              {rec.buyLinks && rec.buyLinks.length > 0 && (
                <div className="flex items-center gap-x-5 gap-y-1.5 mt-3.5 flex-wrap" aria-label={`Where to buy — ${rec.brandName}`}>
                  {rec.buyLinks.slice(0, 3).map((link) => (
                    <a
                      key={link.url}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-baseline gap-1 hover:underline"
                      style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px', color: 'var(--color-accent,#a8712c)' }}
                    >
                      {link.kind === 'view' ? `View on ${link.retailer}` : `Buy at ${link.retailer}`}
                      <span aria-hidden="true" style={{ fontSize: '11px', lineHeight: 1 }}>↗</span>
                    </a>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2.5 mt-3.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => onOpenBrand(rec.brandName)}
                  className="px-3.5 min-h-[44px] rounded text-[14px] bg-transparent border border-[var(--color-accent,#a8712c)] text-[var(--color-accent-700,#7c4a17)] hover:bg-[var(--color-accent-100,#fbf1de)] transition-colors"
                >
                  View brand
                </button>
                <CompareAction brand={rec.brandName} compareList={compareList} onToggleCompare={onToggleCompare} size="md" />
              </div>
            </div>
          ))}
        </div>
        <p className={`${typography.size.xs} ${typography.color.muted} mt-3`} style={{ fontSize: '10px' }}>
          {profileOn
            ? 'Personalised to your measurements, skin tone, budget, archetypes and logged wardrobe. Every hunt is kept in Your Hunt History, below.'
            : 'From general menswear knowledge — no personalisation. Every hunt is kept in Your Hunt History, below.'}
        </p>
        {result.search && (
          <div className="mt-9">
            <ListingResultsSection search={result.search} onRefine={onRefine} />
          </div>
        )}
      </div>
    );
  }

  if (result.type === 'brandDossier') {
    const b = result.brand;
    return (
      <div>
        <p className="uppercase text-[var(--color-neutral-600,#856c51)]" style={{ fontFamily: 'var(--space-font-heading)', fontSize: '11px', letterSpacing: '0.16em', marginBottom: '6px' }}>
          Brand dossier · Beau’s read
        </p>
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h4 className={typography.color.primary} style={{ fontFamily: 'var(--space-font-heading)', fontWeight: 500, fontSize: '28px', lineHeight: 1.1 }}>
            {b.name}
          </h4>
          <BeauRatingTag rating={b.beausRating} note={b.beausVerdict} />
        </div>
        {b.overview && (
          <p className={`${typography.color.primary} mt-2`} style={{ fontFamily: 'var(--space-font-family)', fontSize: '15px', lineHeight: 1.6, maxWidth: '58ch' }}>
            {b.overview}
          </p>
        )}
        {b.heritage && (
          <p className="text-[var(--color-neutral-700,#634e38)] mt-2" style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', lineHeight: 1.6, maxWidth: '58ch' }}>
            {b.heritage}
          </p>
        )}
        <TicketFrame className="mt-5" padding="22px">
          <table className="w-full border-collapse" style={{ borderBottom: '1px solid var(--color-divider,rgba(59,43,29,0.18))' }}>
            <tbody>
              <DossierRow term="Construction" detail={b.construction} />
              <DossierRow term="Materials" detail={b.materials} />
              <DossierRow term="Origin" detail={b.origin} />
              <DossierRow term="Price range" detail={b.priceRange} />
              <DossierRow term="Sizing" detail={b.sizingNote} />
              <DossierRow term="Colourways" detail={b.colourwayTendency} />
              <DossierRow term="Longevity" detail={b.longevitySignal} />
            </tbody>
          </table>
        </TicketFrame>
        {b.beausVerdict && (
          <p
            className="text-[var(--color-neutral-800,#453325)] mt-5"
            style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', lineHeight: 1.6, maxWidth: '58ch', paddingLeft: '16px', borderLeft: '2px solid var(--color-accent,#a8712c)' }}
          >
            <em className="block uppercase not-italic text-[var(--color-accent-700,#7c4a17)]" style={{ fontFamily: 'var(--space-font-heading)', fontSize: '12px', letterSpacing: '0.12em', marginBottom: '5px' }}>
              Beau’s verdict · {b.beausRating}
            </em>
            <span aria-live="polite">{dossierVerdictShown}</span>
          </p>
        )}
        {b.archetypeFit.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-4">
            {b.archetypeFit.map((a) => (
              <ArchetypeTag key={a} id={a} />
            ))}
          </div>
        )}
        <div className="flex items-center gap-2.5 mt-5 flex-wrap">
          <button
            type="button"
            onClick={() => onOpenBrand(b.name)}
            className="px-3.5 min-h-[44px] rounded text-[14px] bg-transparent border border-[var(--color-accent,#a8712c)] text-[var(--color-accent-700,#7c4a17)] hover:bg-[var(--color-accent-100,#fbf1de)] transition-colors"
          >
            Open the full brand file
          </button>
          <CompareAction brand={b.name} compareList={compareList} onToggleCompare={onToggleCompare} size="md" />
        </div>
        {result.search && (
          <div className="mt-9">
            <ListingResultsSection search={result.search} onRefine={onRefine} />
          </div>
        )}
      </div>
    );
  }

  // Quality judgement
  return (
    <div>
      <div className="flex items-center gap-2.5 flex-wrap">
        <span className={`px-2.5 py-1 rounded-full ${typography.size.xs} font-medium ${JUDGEMENT_STYLE[result.verdict] || JUDGEMENT_STYLE['Consider alternatives']}`}>
          {result.verdict}
        </span>
        <span className="uppercase text-[var(--color-neutral-600,#856c51)]" style={{ fontFamily: 'var(--space-font-heading)', fontSize: '11px', letterSpacing: '0.14em' }}>
          Beau’s quality judgement
        </span>
      </div>
      {result.rationale && (
        <p className={`${typography.color.primary} mt-3`} aria-live="polite" style={{ fontFamily: 'var(--space-font-family)', fontSize: '15px', lineHeight: 1.65, maxWidth: '62ch' }}>
          {rationaleShown}
        </p>
      )}
      {result.alternatives.length > 0 && (
        <div className="mt-4">
          <p className="uppercase text-[var(--color-accent-700,#7c4a17)]" style={{ fontFamily: 'var(--space-font-heading)', fontSize: '11px', letterSpacing: '0.12em', marginBottom: '7px' }}>
            Worth considering instead
          </p>
          <ul className="space-y-1.5">
            {result.alternatives.map((alt, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="w-1 h-1 rounded-full mt-2.5 flex-shrink-0 bg-[var(--color-accent,#a8712c)]" aria-hidden="true" />
                <span className={typography.color.secondary} style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', lineHeight: 1.55 }}>{alt}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {result.search && (
        <div className="mt-9">
          <ListingResultsSection search={result.search} onRefine={onRefine} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The Find sub-tab root
// ---------------------------------------------------------------------------

export function FindSubTab({
  profileOn,
  profile,
  budgets,
  pieces,
  prefs,
  prefill = '',
  rerun = null,
  onLogged,
  onOpenBrand,
  compareList,
  onToggleCompare,
}: {
  profileOn: boolean;
  profile: StyleProfile | null;
  budgets: Record<string, CategoryBudget>;
  pieces: WardrobePiece[];
  prefs: StylePrefs | null;
  /** Text handed over from another surface (Saved promotions, Ledger trip gaps). */
  prefill?: string;
  /** A history "Run again" handoff — auto-submits when the token changes. */
  rerun?: { query: string; token: number } | null;
  /** Called after a history row lands so the parent list refreshes. */
  onLogged: () => void;
  onOpenBrand: (brandName: string) => void;
  /** RETIRED — the Compare queue left with its sub-tab. */
  compareList?: string[];
  onToggleCompare?: (brand: string) => void;
}) {
  const [query, setQuery] = useState(prefill);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<{ query: string; profileOn: boolean; result: UnifiedFindResult } | null>(null);
  const busyRef = useRef(false);
  const boxRef = useRef<HTMLTextAreaElement | null>(null);

  // The box is a conversation input, not a form field: it stands one line
  // tall and grows with the query — “something for rain” never reserves four
  // rows of empty paper, and a long brief is never cramped.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [query]);

  // A later prefill (promoting a Saved entry or a trip gap while The Hunt is
  // mounted) replaces whatever draft is sitting in the box.
  useEffect(() => {
    if (prefill) setQuery(prefill);
  }, [prefill]);

  const runQuery = async (text: string, forceMode: UnifiedFindMode) => {
    const q = text.trim();
    if (!q || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setPhase('');
    setError(null);
    let rowId: number | null = null;
    const db = (window as any).__workspaceDb;
    try {
      // Log first — every Find query lands in Your Hunt History, even if it
      // then fails (status 'error' keeps the record honest).
      await db.from('scout_hunts').insert({
        mode: 'find',
        query: q,
        link_url: null,
        photo_url: null,
        // SMART TITLE (local, no model call): the row is named like Claude /
        // ChatGPT name conversations — short, descriptive, from the query's
        // own words — with the raw query kept in `query` for search & re-run.
        title: smartTitle(q) || (q.length > 90 ? `${q.slice(0, 87)}\u2026` : q),
        category: null,
        status: 'pending',
      });
      const { data: latest } = await db.from('scout_hunts').orderBy('created_at', 'desc').limit(1).get();
      rowId = latest?.[0]?.id ?? null;
      onLogged();

      const result = await runUnifiedFind({ query: q, profileOn, profile, budgets, pieces, prefs, forceMode, onPhase: setPhase });

      const payload: UnifiedHistoryPayload = { kind: 'unified', profileOn, forcedMode: forceMode, result };
      if (rowId) {
        await db.from('scout_hunts').update(rowId, {
          status: 'complete',
          result_json: JSON.stringify(payload),
        });
      }
      setAnswer({ query: q, profileOn, result });

      // A structured hunt still teaches the brand log what he is drawn to,
      // even though the answer was listings rather than makers.
      if (result.type === 'listings' && result.search.params.brand) {
        logBrand({
          brand: result.search.params.brand,
          source: 'scout',
          item_name: result.search.params.itemType || null,
          category: null,
          url: null,
          context: q,
        });
      }

      // Brand intelligence: recommended makers flow into the cumulative log
      // AND into Discover with the "Beau recommended" source tag.
      if (result.type === 'recommendations') {
        for (const rec of result.results) {
          if (rec.brandName) {
            logBrand({ brand: rec.brandName, source: 'scout', item_name: rec.whatTheyMake || null, category: null, url: null, context: q });
          }
        }
        void recordBeauRecommendedBrands(result.results.map((r) => r.brandName), q).catch(() => undefined);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The hunt failed — try again.';
      if (rowId) {
        try {
          await db.from('scout_hunts').update(rowId, { status: 'error', error_message: message });
        } catch { /* non-fatal */ }
      }
      setError(message);
    } finally {
      busyRef.current = false;
      setBusy(false);
      setPhase('');
      onLogged();
    }
  };

  // No mode selection — Beau reads the intent from the words themselves.
  const submit = () => {
    void runQuery(query, 'auto');
    setQuery('');
  };

  // History "Run again": auto-submits the handed-over query.
  const lastRerunToken = useRef<number | null>(null);
  useEffect(() => {
    if (!rerun || rerun.token === lastRerunToken.current) return;
    lastRerunToken.current = rerun.token;
    setQuery('');
    void runQuery(rerun.query, 'auto');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rerun]);

  return (
    <div>
      {/* THE ONE INPUT — paper panel framed by the ink rule. */}
      <div className="border-t border-t-[var(--color-text,#3b2b1d)] border-b border-b-[var(--color-divider,rgba(59,43,29,0.18))]">
        <div className="bg-[var(--color-paper,#fbf8f1)] flex flex-col" style={{ padding: '32px 32px 34px' }}>
          <p className="uppercase text-[var(--color-accent-700,#7c4a17)]" style={{ fontFamily: 'var(--space-font-heading)', fontSize: '12px', letterSpacing: '0.16em', marginBottom: '8px' }}>
            Find
          </p>
          <h3 className={typography.color.primary} style={{ fontFamily: 'var(--space-font-heading)', fontWeight: 500, fontSize: '24px', lineHeight: 1.2, marginBottom: '8px' }}>
            Ask Beau anything
          </h3>
          {/* A brief orienter, never an explainer (Part 3.1): four short
              lines, no paragraph copy — the input below is the surface. */}
          <ul className="text-[var(--color-neutral-800,#453325)] space-y-1" style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', lineHeight: 1.5, maxWidth: '54ch' }}>
            {[
              'Name a piece with a size, condition or ceiling — Beau returns real listings',
              'Assess a brand or maker',
              'Get an “is it worth the money?” verdict',
              'Describe what you need — Beau reads the intent',
            ].map((line) => (
              <li key={line} className="flex items-start gap-2">
                <span className="w-1 h-1 rounded-full mt-2 flex-shrink-0 bg-[var(--color-accent,#a8712c)]" aria-hidden="true" />
                <span>{line}</span>
              </li>
            ))}
          </ul>

          <textarea
            ref={boxRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="What are you hunting for? Ask Beau anything."
            rows={1}
            disabled={busy}
            className="hab-input w-full resize-none mt-4 overflow-hidden"
            style={{ paddingTop: '11px', paddingBottom: '11px' }}
            aria-label="What are you hunting for?"
          />

          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <button
              type="button"
              onClick={submit}
              disabled={busy || !query.trim()}
              className="px-4 min-h-[44px] rounded text-[14px] inline-flex items-center gap-1.5 bg-transparent border border-[var(--color-accent,#a8712c)] text-[var(--color-accent-700,#7c4a17)] hover:bg-[var(--color-accent-100,#fbf1de)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {busy ? 'Beau is on it\u2026' : 'Send Beau hunting'}
            </button>
            <VoiceButton
              disabled={busy}
              onTranscript={(t) => setQuery((cur) => (cur.trim() ? `${cur.trim()} ${t}` : t))}
              title="Hold to talk — your words land in the box"
            />
            <LiveTalkButton
              disabled={busy}
              instructions="The customer is on The Hunt tab's unified Find. Help them sharpen the brief — a piece, a maker, a quality question or a style brief — then suggest they type the final version into the box and send Beau hunting."
            />
          </div>
          <p className={`${typography.size.xs} ${typography.color.muted} mt-2`} style={{ fontSize: '10px' }}>
            Try “a Grenfell Golfer, size 36, secondhand, under €200” · “find me a navy Oxford shirt under £100” ·
            “what do you know about Corridor NYC?” · “is this Loro Piana linen shirt worth the money?” · “something for
            British Country, mid-budget, for my colouring”.
          </p>
        </div>
      </div>

      {error && <p className={`${typography.size.xs} text-[var(--space-semantic-danger)] mt-2`}>{error}</p>}

      {busy && (
        <div className="mt-5">
          <p className={`${typography.size.xs} ${typography.color.muted} mb-1`} aria-live="polite">
            {phase || 'Beau is reading the brief and sweeping the live market…'}
          </p>
          <HairlineRowsSkeleton rows={4} />
        </div>
      )}

      {!busy && answer && (
        <section aria-label="Beau's answer" className="mt-8">
          <div className="flex items-baseline justify-between gap-3 pb-2.5 border-b border-[var(--color-text,#3b2b1d)]">
            <h4 className={`hab-section-head ${typography.color.primary}`}>Beau&rsquo;s answer</h4>
            <span className="hab-kicker text-[var(--color-neutral-600,#856c51)] truncate max-w-[40ch]" style={{ letterSpacing: '0.14em' }}>
              {answer.query}
            </span>
          </div>
          <div className="mt-4">
            <UnifiedResultView
              result={answer.result}
              profileOn={answer.profileOn}
              onOpenBrand={onOpenBrand}
              compareList={compareList}
              onToggleCompare={onToggleCompare}
              onRefine={(relaxed) => {
                setQuery('');
                void runQuery(relaxed, 'auto');
              }}
              reveal
            />
          </div>
        </section>
      )}
    </div>
  );
}
