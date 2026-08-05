/**
 * Travel mode (Pass Twenty-Seven) — "Plan a trip" on the Scout tab.
 *
 * A simple form (destination · duration · season) → Beau cross-references the
 * trip against the OWNED wardrobe and returns:
 *   · "You already have" — owned pieces relevant to the trip
 *   · "You'll need" — the gaps, each a tappable card that kicks off a Scout
 *     search for exactly that piece
 * With an empty wardrobe Beau skips the cross-reference and gives a general
 * packing recommendation for the destination and season.
 *
 * Same AI infrastructure as Scout search: the platform OpenAI proxy — no
 * SDKs, no keys in the browser.
 */
import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { beauDarkRoom, tw, typography } from '../../lib/colors';
import {
  categoryLabel,
  fetchMaterials,
  materialFor,
  type StyleProfile,
  type WardrobePiece,
} from './profile-data';
import { CanonicalGarment } from './canonical-garment';

// ---------------------------------------------------------------------------
// AI call — same pattern as style-today / scout-ai
// ---------------------------------------------------------------------------

export interface TripGap {
  name: string;
  why: string;
  searchQuery: string;
}

export interface TripPlan {
  intro: string;
  youHaveIds: number[];
  youNeed: TripGap[];
}

function extractJson(text: string): any {
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

const TRIP_SYSTEM = `You are Beau, Ethaion's menswear valet, packing a man for a trip. You are given the destination, duration, season, and his OWNED wardrobe pieces (each with an id). Cross-reference what he owns against what the trip demands.

Respond ONLY with strict JSON (no markdown):
{
  "intro": string,        // ONE sentence, e.g. "For 3 months in Barcelona in summer, here's what you'll need\u2026"
  "youHaveIds": number[], // ids of HIS OWNED pieces genuinely relevant to this trip — only ids from the list provided, best 8 at most
  "youNeed": [            // the gaps — 3\u20136 pieces he should acquire for this trip, most consequential first
    {
      "name": string,        // the piece, e.g. "Lightweight linen shirt"
      "why": string,         // ONE short sentence in Beau's warm, direct voice — why THIS trip demands it
      "searchQuery": string  // a ready-to-run product search, e.g. "lightweight linen shirt white menswear"
    }
  ]
}

Rules: reason from the destination's climate in that season and the trip length; never invent ids — if his wardrobe list is empty, return youHaveIds: [] and make youNeed a general packing recommendation for the destination and season; classic, timeless menswear only; keep every string tight; JSON only.`;

async function planTrip(
  destination: string,
  duration: string,
  season: string,
  pieces: WardrobePiece[],
  materials: Record<number, string>,
  profile: StyleProfile | null,
): Promise<TripPlan> {
  const pieceLine = (p: WardrobePiece) => {
    const material = materialFor(p, materials);
    return [
      `id ${p.id}: ${p.name}`,
      `[${categoryLabel(p.category)}]`,
      material ? `material: ${material}` : null,
      (p.colors || []).length > 0 ? `colours: ${(p.colors || []).join(',')}` : null,
    ].filter(Boolean).join(' ');
  };
  const res = await fetch('/proxy/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: TRIP_SYSTEM },
        {
          role: 'user',
          content: [
            `TRIP: ${duration.trim() || 'a trip'} in ${destination.trim()}, ${season.toLowerCase()}.`,
            profile && Array.isArray(profile.archetypes) && profile.archetypes.length > 0
              ? `HIS DIRECTION: ${profile.archetypes.join(', ')}`
              : null,
            pieces.length > 0
              ? `HIS WARDROBE (only these ids):\n${pieces.map(pieceLine).join('\n')}`
              : 'HIS WARDROBE: empty — nothing logged yet. Skip the cross-reference and give a general packing recommendation.',
          ].filter(Boolean).join('\n\n'),
        },
      ],
      max_tokens: 900,
      temperature: 0.6,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error('Beau is unreachable right now — try again in a moment.');
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  const parsed = typeof content === 'string' ? extractJson(content) : null;
  if (!parsed) throw new Error('Beau lost his train of thought — try again.');
  const validIds = new Set(pieces.map((p) => p.id));
  const youHaveIds = Array.isArray(parsed.youHaveIds)
    ? parsed.youHaveIds.map(Number).filter((id: number) => validIds.has(id)).slice(0, 8)
    : [];
  const youNeed: TripGap[] = (Array.isArray(parsed.youNeed) ? parsed.youNeed : [])
    .map((g: any) => ({
      name: typeof g?.name === 'string' ? g.name.trim() : '',
      why: typeof g?.why === 'string' ? g.why.trim() : '',
      searchQuery: typeof g?.searchQuery === 'string' && g.searchQuery.trim() ? g.searchQuery.trim() : (typeof g?.name === 'string' ? `${g.name.trim()} menswear` : ''),
    }))
    .filter((g: TripGap) => g.name)
    .slice(0, 6);
  if (youNeed.length === 0 && youHaveIds.length === 0) throw new Error('Beau couldn\u2019t plan that one — check the destination and try again.');
  return {
    intro: typeof parsed.intro === 'string' && parsed.intro.trim()
      ? parsed.intro.trim()
      : `For ${duration.trim() || 'your trip'} in ${destination.trim()} in ${season.toLowerCase()}, here\u2019s what you\u2019ll need\u2026`,
    youHaveIds,
    youNeed,
  };
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];

export function TripPlanner({
  pieces,
  profile,
  onScout,
}: {
  pieces: WardrobePiece[];
  profile: StyleProfile | null;
  /** Kick off a Scout "find" search for a gap Beau identified. */
  onScout: (query: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // Materials live in the piece_materials companion table — loaded once the
  // planner opens so the trip prompt can describe each piece properly.
  const [materials, setMaterials] = useState<Record<number, string>>({});
  useEffect(() => {
    if (open) fetchMaterials().then(setMaterials).catch(() => undefined);
  }, [open, pieces.length]);
  const [destination, setDestination] = useState('');
  const [duration, setDuration] = useState('');
  const [season, setSeason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<TripPlan | null>(null);

  const byId = useMemo(() => new Map(pieces.map((p) => [p.id, p])), [pieces]);
  const matched = plan ? plan.youHaveIds.map((id) => byId.get(id)).filter(Boolean) as WardrobePiece[] : [];

  const submit = async () => {
    if (busy) return;
    if (!destination.trim()) {
      setError('Where are you headed? Type a destination.');
      return;
    }
    if (!season) {
      setError('Tap a season so Beau can pack for the weather.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setPlan(await planTrip(destination, duration, season, pieces, materials, profile));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Trip planning failed — try again.');
    } finally {
      setBusy(false);
    }
  };

  // Pass Forty-One: this is the SECOND of the app's three walnut bands — a
  // full-bleed #241a12 band on the Scout screen, immediately below the two
  // input panels. Collapsed it is copy + a tappable "Scout a trip ›" text
  // row; opened, the form unfolds inside the same dark room.
  if (!open) {
    return (
      <section aria-label="Scout your trip" className="px-6 sm:px-10">
        {/* Contained walnut band (HTML reference): kicker · 28px heading ·
            body left, the "Plan a trip" button right. */}
        <div
          className="max-w-[1180px] mx-auto grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] items-center gap-6 sm:gap-12"
          style={{ background: '#241a12', color: '#f6f0e5', padding: '36px 40px' }}
        >
          <div>
            <p
              className="uppercase"
              style={{ fontFamily: 'var(--space-font-heading)', fontSize: '12px', letterSpacing: '0.16em', color: '#e3c184', marginBottom: '8px' }}
            >
              Beau · trip scout
            </p>
            <h4 style={{ fontFamily: 'var(--space-font-heading)', fontWeight: 400, fontSize: '28px', lineHeight: 1.15, color: '#f6f0e5', marginBottom: '8px' }}>
              Going somewhere? Give me the dates and I’ll pack you.
            </h4>
            <p style={{ fontFamily: 'var(--space-font-family)', fontSize: '15px', lineHeight: 1.6, color: '#f6f0e5', opacity: 0.78, maxWidth: '60ch' }}>
              Destination, duration, season and what it’s for — Beau checks what you already own against what the
              trip demands, and only then scouts the gaps.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="justify-self-start sm:justify-self-end whitespace-nowrap px-5 min-h-[46px] rounded text-[15px] bg-transparent border transition-colors hover:bg-[rgba(246,240,229,0.08)]"
            style={{ borderColor: '#cb9d51', color: '#f6f0e5', fontFamily: 'var(--space-font-family)' }}
          >
            Plan a trip
          </button>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Scout your trip" className="px-6 sm:px-10">
      <div className="max-w-[1180px] mx-auto" style={{ ...beauDarkRoom, padding: '36px 40px 40px' }}>
      <div className="flex items-baseline justify-between gap-2">
        <h4 style={{ fontFamily: 'var(--space-font-heading)', fontWeight: 400, fontSize: '28px', lineHeight: 1.15, color: '#f6f0e5' }}>
          Going somewhere? Give me the dates and I’ll pack you.
        </h4>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="hover:underline flex-shrink-0"
          style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px', color: '#c5b193' }}
          aria-label="Close trip planner"
        >
          Close
        </button>
      </div>
      <p className="mt-2" style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', lineHeight: 1.55, color: '#f6f0e5', opacity: 0.78 }}>
        Beau cross-references your wardrobe against the trip — what you already have, and what you’ll need.
      </p>

      <div className="grid sm:grid-cols-2 gap-2.5 mt-3">
        <label className={`${typography.size.xs} ${typography.color.muted}`}>Destination
          <input
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="e.g. Barcelona"
            className={`${tw.input.base} ${tw.input.default} ${typography.size.sm} mt-1`}
            aria-label="Trip destination"
          />
        </label>
        <label className={`${typography.size.xs} ${typography.color.muted}`}>Duration
          <input
            type="text"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder='e.g. "1 week" or "3 months"'
            className={`${tw.input.base} ${tw.input.default} ${typography.size.sm} mt-1`}
            aria-label="Trip duration"
          />
        </label>
      </div>
      <div className="mt-2.5">
        <p className={`${typography.size.xs} ${typography.color.muted} mb-1.5`}>Season</p>
        <div className="flex flex-wrap gap-1.5">
          {SEASONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSeason(season === s ? '' : s)}
              aria-pressed={season === s}
              className={`px-3 py-1.5 rounded-full border ${typography.size.xs} transition-colors ${
                season === s
                  ? 'bg-[var(--space-surface-accent-soft)] text-[var(--space-brand-primary-700)] border-[var(--space-brand-primary)]'
                  : 'bg-[var(--space-surface-card)] border-[var(--space-border-default)] text-[var(--space-text-secondary)] hover:border-[var(--space-border-strong)]'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 mt-4">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          className={`px-4 min-h-[44px] rounded text-[14px] inline-flex items-center gap-1.5 ${tw.button.primary} disabled:opacity-50`}
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          {busy ? 'Packing\u2026' : plan ? 'Plan it again' : 'Build my packing list'}
        </button>
      </div>
      {error && <p className={`${typography.size.xs} text-[var(--space-semantic-warning)] mt-2`}>{error}</p>}

      {plan && !busy && (
        <div className="mt-5 space-y-4">
          <p className={`${typography.size.sm} ${typography.color.primary} leading-relaxed`}>
            {plan.intro}
          </p>

          {matched.length > 0 && (
            <div>
              <p className={`${typography.size.xs} uppercase tracking-[0.18em] ${typography.weight.medium} ${typography.color.secondary} mb-2`}>
                You already have
              </p>
              <div className="divide-y divide-[var(--space-border-default)] border-t border-b border-[var(--space-border-default)]">
                {matched.map((piece) => (
                  <div key={piece.id} className="flex items-center gap-2.5 py-2">
                    <CanonicalGarment
                      fields={{ name: piece.name, category: piece.category, slot: piece.slot, colors: piece.colors, brand: piece.brand }}
                      photoUrl={piece.photo_url || null}
                      pieceId={piece.id}
                      title={piece.name}
                      className="w-9 aspect-[3/4] rounded-lg flex-shrink-0"
                    />
                    <div className="min-w-0">
                      <p className={`${typography.size.sm} ${typography.weight.medium} ${typography.color.primary} truncate`}>{piece.name}</p>
                      <p className={`${typography.size.xs} ${typography.color.muted}`}>{categoryLabel(piece.category)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {plan.youNeed.length > 0 && (
            <div>
              <p className={`${typography.size.xs} uppercase tracking-[0.18em] ${typography.weight.medium} ${typography.color.secondary} mb-2`}>
                You’ll need
              </p>
              <div className="divide-y divide-[var(--space-border-default)] border-t border-b border-[var(--space-border-default)]">
                {plan.youNeed.map((gap) => (
                  <button
                    key={gap.name}
                    type="button"
                    onClick={() => onScout(gap.searchQuery || gap.name)}
                    className="w-full grid grid-cols-[minmax(0,1fr)_18px] items-center gap-3 text-left py-[14px] group"
                    title={`Scout for: ${gap.searchQuery || gap.name}`}
                  >
                    <span className="min-w-0">
                      <span className={`block ${typography.size.sm} ${typography.weight.medium} ${typography.color.primary}`}>{gap.name}</span>
                      {gap.why && <span className={`block ${typography.size.xs} ${typography.color.muted} mt-0.5 leading-snug`}>{gap.why}</span>}
                    </span>
                    <span
                      className="justify-self-end text-[var(--space-text-muted)] group-hover:translate-x-0.5 transition-transform"
                      style={{ fontFamily: 'var(--space-font-heading)', fontSize: '17px', lineHeight: 1 }}
                      aria-hidden="true"
                    >
                      ›
                    </span>
                  </button>
                ))}
              </div>
              <p className={`${typography.size.xs} ${typography.color.muted} mt-1.5`} style={{ fontSize: '10px' }}>
                Tap a gap and Beau hunts the market for it — the result lands below with his usual reasoning.
              </p>
            </div>
          )}
        </div>
      )}
      </div>
    </section>
  );
}
