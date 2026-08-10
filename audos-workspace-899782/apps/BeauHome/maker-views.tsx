/**
 * THE INDEX · MAKERS — the maker directory's three readings (design handoff
 * screens 9a · 21a · M13, and the founder's fix for the missing makers):
 *
 *   · AS A LIST — the FULL maker directory (the verified seed catalog +
 *     user-added + Beau-recommended rows), the same table The Hunt's
 *     Discover surface renders.
 *   · ON A MAP — price × Beau's tier (21a): where quality stops climbing
 *     with price. The dashed band — excellent and affordable — is where
 *     Beau's picks come from. FILLED dots are makers you own something
 *     from; RINGED dots are makers you're weighing in The Hunt.
 *   · AS A QUADRANT — price × fit-to-you (21a): quality is a fact about a
 *     maker; being YOU is a fact about the pair of you. The four corners
 *     are named and counted, and PASSED makers stay visible as ghost dots
 *     — showing where a rejection landed is how you check the reasoning.
 *     “Dear and not you” is the corner Beau prunes from your list.
 *
 * All three views read the SAME records — a maker you add lands in every
 * view at once. Tapping a dot opens the shared brand dossier; hovering (or
 * long-pressing) names the maker, Beau's tier and the price bracket.
 * Mobile (M13): the plot keeps eight points, the axes and the dashed value
 * band stay, and the rest is pinch-to-zoom (plot-zoom.ts).
 */
import { useMemo, useState } from 'react';
import type React from 'react';
import { typography } from '../../lib/colors';
import {
  PRICE_BAND_ORDER,
  PRICE_BAND_SYMBOL,
  mergeDirectory,
  type BeauRating,
  type DirectoryBrandRow,
  type DirectoryEntry,
} from './brands';
import { BrandDetailSheet, DiscoverSubTab } from './hunt-discover';
import type { StyleProfile, WardrobePiece } from './profile-data';
import { useIsNarrow, usePinchZoom } from './plot-zoom';

type MakerView = 'list' | 'map' | 'quadrant';

/** How the wearer relates to a maker — read from the wardrobe (owned) and
 * The Hunt's pipeline records (weighing · held · passed). */
type MakerStatus = 'owned' | 'held' | 'weighing' | 'passed' | 'neither';

const STATUS_WEIGHT: Record<MakerStatus, number> = { owned: 4, held: 3, weighing: 2, passed: 1, neither: 0 };

const TIER_RANK: Record<BeauRating, number> = { Excellent: 3, Reliable: 2, Inconsistent: 1, Avoid: 0 };
const TIER_LABELS: Array<{ rank: number; label: string }> = [
  { rank: 3, label: 'Excellent' },
  { rank: 2, label: 'Reliable' },
  { rank: 1, label: 'Inconsistent' },
  { rank: 0, label: 'Avoid' },
];

/** Deterministic tiny jitter so co-located dots never sit exactly on top of
 * each other — keyed on the name, so the plot is stable between renders. */
function jitterOf(name: string): { dx: number; dy: number } {
  let h = 2166136261;
  for (let i = 0; i < name.length; i += 1) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const a = ((h >>> 0) % 100) / 100;
  const b = ((h >>> 8) % 100) / 100;
  return { dx: (a - 0.5) * 26, dy: (b - 0.5) * 22 };
}

/** How closely a maker matches the wearer — the share of the dossier's
 * chosen directions this maker serves (0..1). With no directions chosen the
 * axis reads 0.5 for everyone and the view says why. */
function fitToYou(entry: DirectoryEntry, archetypes: string[]): number {
  if (archetypes.length === 0) return 0.5;
  const served = new Set((entry.profile.archetypes || []).map((a) => a.toLowerCase()));
  const hits = archetypes.filter((a) => served.has(a.toLowerCase())).length;
  return hits / archetypes.length;
}

interface PlottedMaker {
  entry: DirectoryEntry;
  /** 0..1 across — price band position. */
  px: number;
  /** 0..1 up — tier (map) or fit (quadrant). */
  tier: number;
  fit: number;
  status: MakerStatus;
}

// The Hunt's pipeline rows — the same records pass-signals.ts reads.
interface RadarRowLite {
  id: number;
  brand: string | null;
  watch_price?: boolean | null;
  watch_restock?: boolean | null;
}
interface MetaRowLite {
  id: number;
  radar_id: number;
  stage: string;
}

/** Per-maker pipeline status from radar_items + candidate_meta — the newest
 * meta row per candidate wins (the same rule The Hunt applies), and the
 * strongest stage across a maker's candidates wins for the maker. */
function pipelineStatusByMaker(radarRows: RadarRowLite[], metaRows: MetaRowLite[]): Map<string, MakerStatus> {
  const stageByRadar = new Map<number, MetaRowLite>();
  for (const m of metaRows) {
    const existing = stageByRadar.get(Number(m.radar_id));
    if (!existing || Number(m.id) > Number(existing.id)) stageByRadar.set(Number(m.radar_id), m);
  }
  const out = new Map<string, MakerStatus>();
  const upgrade = (key: string, status: MakerStatus) => {
    const cur = out.get(key);
    if (!cur || STATUS_WEIGHT[status] > STATUS_WEIGHT[cur]) out.set(key, status);
  };
  for (const item of radarRows) {
    const key = (item.brand || '').trim().toLowerCase();
    if (!key) continue;
    const meta = stageByRadar.get(Number(item.id));
    // Legacy rows without meta read as The Hunt derives them: watching → held.
    const stage = meta?.stage || (item.watch_price || item.watch_restock ? 'held' : 'spotted');
    if (stage === 'held') upgrade(key, 'held');
    else if (stage === 'weighed') upgrade(key, 'weighing');
    else if (stage === 'passed') upgrade(key, 'passed');
  }
  return out;
}

function usePlotted(
  rows: DirectoryBrandRow[] | null,
  archetypes: string[],
  pieces: WardrobePiece[],
  radarRows: RadarRowLite[],
  metaRows: MetaRowLite[],
): PlottedMaker[] {
  return useMemo(() => {
    const entries = mergeDirectory(rows || []);
    const pipeline = pipelineStatusByMaker(radarRows, metaRows);
    const ownedMakers = new Set(
      pieces.map((p) => (p.brand || '').trim().toLowerCase()).filter(Boolean),
    );
    return entries.map((entry) => {
      const bandIdx = Math.max(0, PRICE_BAND_ORDER.indexOf(entry.profile.priceBand));
      const key = entry.profile.brand.trim().toLowerCase();
      // OWNED beats the pipeline: a maker you have a piece from draws filled
      // even if you also passed one of their candidates.
      const status: MakerStatus = ownedMakers.has(key) ? 'owned' : pipeline.get(key) || 'neither';
      return {
        entry,
        px: (bandIdx + 0.5) / PRICE_BAND_ORDER.length,
        tier: (TIER_RANK[entry.rating] ?? 1) / 3,
        fit: fitToYou(entry, archetypes),
        status,
      };
    });
  }, [rows, archetypes, pieces, radarRows, metaRows]);
}

const axisType: React.CSSProperties = {
  fontFamily: 'var(--space-font-heading)',
  fontSize: '10px',
  letterSpacing: '0.14em',
  fill: 'var(--color-neutral-600,#856c51)',
};

const WALNUT = 'var(--color-text,#241a12)';
const ACCENT = 'var(--color-accent,#a8712c)';
const PAPER = 'var(--color-paper,#fbf8f1)';
const GHOST = 'var(--color-neutral-500,#a68e70)';

/** One dot, drawn by status — filled = owned · accent-filled = held ·
 * ringed = weighing · hollow = neither · ghost = passed (21a). */
function StatusDot({ cx, cy, status }: { cx: number; cy: number; status: MakerStatus }) {
  if (status === 'weighing') {
    return <circle cx={cx} cy={cy} r="6.5" fill={PAPER} stroke={ACCENT} strokeWidth="2.4" />;
  }
  if (status === 'passed') {
    return <circle cx={cx} cy={cy} r="6" fill="none" stroke={GHOST} strokeWidth="1.3" opacity="0.75" />;
  }
  return (
    <circle
      cx={cx}
      cy={cy}
      r="6.5"
      fill={status === 'owned' ? WALNUT : status === 'held' ? ACCENT : PAPER}
      stroke={WALNUT}
      strokeWidth="1.4"
    />
  );
}

const legendTextStyle: React.CSSProperties = {
  fontFamily: 'var(--space-font-heading)',
  fontSize: '10px',
  letterSpacing: '0.13em',
  color: 'var(--color-neutral-700,#634e38)',
};

function Legend({ zoomed, onReset }: { zoomed: boolean; onReset: () => void }) {
  const item = (status: MakerStatus, label: string) => (
    <span className="inline-flex items-center gap-1.5">
      <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true" className="inline-block">
        <StatusDot cx={7.5} cy={7.5} status={status} />
      </svg>
      <span style={legendTextStyle}>{label}</span>
    </span>
  );
  return (
    <div className="flex items-center gap-4 flex-wrap mt-3">
      {item('owned', 'YOU OWN SOMETHING')}
      {item('weighing', 'WEIGHING')}
      {item('held', 'HELD')}
      {item('neither', 'NEITHER')}
      {item('passed', 'PASSED')}
      {zoomed && (
        <button type="button" onClick={onReset} className="hover:underline" style={{ ...legendTextStyle, color: ACCENT }}>
          RESET ZOOM
        </button>
      )}
    </div>
  );
}

function MakerScatter({
  plotted,
  yOf,
  yCaption,
  onOpenBrand,
  quadrant = false,
  archetypesChosen,
}: {
  plotted: PlottedMaker[];
  yOf: (m: PlottedMaker) => number;
  yCaption: string;
  onOpenBrand: (brand: string) => void;
  /** Quadrant mode draws the two midlines and names + counts the corners. */
  quadrant?: boolean;
  archetypesChosen: boolean;
}) {
  // THE PLOT IS THE MAKERS YOU'VE INTERACTED WITH (21a: “eighteen of the
  // sixty-one, placed”): owned · weighing · held · passed always draw, and
  // the catalog's best-rated makers fill the picture up to eighteen dots so
  // the value question stays readable. The list view always has the full
  // set. MOBILE (M13): the plot keeps EIGHT points, pinch-to-zoom for the
  // rest.
  const narrow = useIsNarrow();
  const shown = useMemo(() => {
    const cap = narrow ? 8 : 18;
    if (plotted.length <= cap) return plotted;
    const ranked = [...plotted].sort((a, b) => {
      const aw = STATUS_WEIGHT[a.status] > 0 ? 1 : 0;
      const bw = STATUS_WEIGHT[b.status] > 0 ? 1 : 0;
      if (aw !== bw) return bw - aw;
      if (a.tier !== b.tier) return b.tier - a.tier;
      return a.px - b.px;
    });
    return ranked.slice(0, cap);
  }, [narrow, plotted]);

  const W = 760;
  const H = 520;
  const PAD = { top: 34, right: 30, bottom: 46, left: 40 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (v: number) => PAD.left + v * plotW;
  const y = (v: number) => H - PAD.bottom - v * plotH;

  const zoom = usePinchZoom(W, H);

  // WHAT EACH CORNER HOLDS (21a) — the four regions, counted over the shown
  // dots. Passed makers are counted where their ghost lands; “dear and not
  // you” is the corner Beau prunes.
  const corners = useMemo(() => {
    if (!quadrant) return [];
    const inCorner = (left: boolean, top: boolean) =>
      shown.filter((m) => (left ? m.px < 0.5 : m.px >= 0.5) && (top ? yOf(m) >= 0.5 : yOf(m) < 0.5));
    const yourLane = inCorner(true, true);
    const worthSaving = inCorner(false, true);
    const cheapNotYou = inCorner(true, false);
    const dearNotYou = inCorner(false, false);
    const passedIn = (list: PlottedMaker[]) => list.filter((m) => m.status === 'passed').length;
    const countText = (list: PlottedMaker[], note?: string) => {
      if (list.length === 0) return 'None';
      const passed = passedIn(list);
      const bits = [`${list.length} maker${list.length === 1 ? '' : 's'}`];
      if (passed > 0) bits.push(passed === list.length ? (passed === 2 ? 'both passed' : 'all passed') : `${passed} passed`);
      if (note) bits.push(note);
      return bits.join(' · ');
    };
    return [
      { label: 'Your lane', sub: 'Affordable · your taste', counts: countText(yourLane), cx: PAD.left + plotW * 0.25, cy: PAD.top + 16 },
      { label: 'Worth saving for', sub: 'Dear · your taste', counts: countText(worthSaving), cx: PAD.left + plotW * 0.75, cy: PAD.top + 16 },
      { label: 'Cheap, not you', sub: 'Affordable · not your taste', counts: countText(cheapNotYou), cx: PAD.left + plotW * 0.25, cy: H - PAD.bottom - 22 },
      { label: 'Dear and not you', sub: 'He\u2019ll stop showing these', counts: countText(dearNotYou), cx: PAD.left + plotW * 0.75, cy: H - PAD.bottom - 22 },
    ];
  }, [quadrant, shown, yOf, plotW, plotH]);

  const statusLine = (m: PlottedMaker) =>
    m.status === 'owned'
      ? 'you own something of theirs'
      : m.status === 'weighing'
        ? 'weighing in The Hunt'
        : m.status === 'held'
          ? 'held in The Hunt'
          : m.status === 'passed'
            ? 'passed'
            : null;

  return (
    <div className="mt-4">
      <Legend zoomed={zoom.zoomed} onReset={zoom.reset} />
      <div className="mt-3 border border-[var(--color-divider,rgba(59,43,29,0.18))] bg-[var(--color-paper,#fbf8f1)] p-4">
        <svg
          ref={zoom.svgRef}
          viewBox={zoom.viewBox}
          {...zoom.handlers}
          className="w-full h-auto"
          style={{ touchAction: zoom.touchAction }}
          role="img"
          aria-label={`Makers plotted — price across, ${yCaption.toLowerCase()} up`}
        >
          <line x1={PAD.left} y1={H - PAD.bottom} x2={W - PAD.right} y2={H - PAD.bottom} stroke="var(--color-divider,rgba(59,43,29,0.3))" strokeWidth="1" />
          <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={H - PAD.bottom} stroke="var(--color-divider,rgba(59,43,29,0.3))" strokeWidth="1" />
          <text x={PAD.left} y={H - 14} style={axisType}>ACROSS · WHAT THEY CHARGE →</text>
          <text x={PAD.left} y={PAD.top - 12} style={axisType}>UP · {yCaption.toUpperCase()}</text>
          <text x={PAD.left + 4} y={H - PAD.bottom + 16} style={axisType}>{PRICE_BAND_SYMBOL[PRICE_BAND_ORDER[0]]}</text>
          <text x={W - PAD.right} y={H - PAD.bottom + 16} textAnchor="end" style={axisType}>{PRICE_BAND_SYMBOL[PRICE_BAND_ORDER[PRICE_BAND_ORDER.length - 1]]}</text>

          {!quadrant && (
            <>
              {/* Tier rungs — quiet horizontal guides with their names. */}
              {TIER_LABELS.map(({ rank, label }) => (
                <g key={label}>
                  <line x1={PAD.left} y1={y(rank / 3)} x2={W - PAD.right} y2={y(rank / 3)} stroke="var(--color-divider,rgba(59,43,29,0.14))" strokeWidth="1" />
                  <text x={W - PAD.right} y={y(rank / 3) - 4} textAnchor="end" style={axisType}>{label.toUpperCase()}</text>
                </g>
              ))}
              {/* THE DASHED VALUE BAND (21a · M13) — excellent and affordable:
                  where Beau's picks come from. It stays at every width. */}
              <rect
                x={x(0)}
                y={y(1) - 8}
                width={plotW * 0.5}
                height={plotH / 3 + 8}
                fill="none"
                stroke="var(--color-accent,#a8712c)"
                strokeWidth="1.5"
                strokeDasharray="6 5"
              />
              <text x={x(0) + 8} y={y(1) + 8} style={{ ...axisType, fill: 'var(--color-accent-700,#7c4a17)' }}>
                EXCELLENT, AND AFFORDABLE · WHERE YOU SHOULD BE SHOPPING
              </text>
            </>
          )}

          {quadrant && (
            <>
              <line x1={x(0.5)} y1={PAD.top} x2={x(0.5)} y2={H - PAD.bottom} stroke="var(--color-divider,rgba(59,43,29,0.25))" strokeWidth="1" strokeDasharray="4 4" />
              <line x1={PAD.left} y1={y(0.5)} x2={W - PAD.right} y2={y(0.5)} stroke="var(--color-divider,rgba(59,43,29,0.25))" strokeWidth="1" strokeDasharray="4 4" />
              {corners.map((c) => (
                <g key={c.label}>
                  <text x={c.cx} y={c.cy} textAnchor="middle" style={{ ...axisType, fill: 'var(--color-accent-700,#7c4a17)' }}>{c.label.toUpperCase()}</text>
                  <text x={c.cx} y={c.cy + 12} textAnchor="middle" style={axisType}>{c.sub.toUpperCase()}</text>
                  <text x={c.cx} y={c.cy + 24} textAnchor="middle" style={{ ...axisType, fill: WALNUT }}>{c.counts.toUpperCase()}</text>
                </g>
              ))}
            </>
          )}

          {shown.map((m) => {
            const j = jitterOf(m.entry.profile.brand);
            const cx = Math.max(PAD.left + 10, Math.min(W - PAD.right - 10, x(m.px) + j.dx));
            const cy = Math.max(PAD.top + 10, Math.min(H - PAD.bottom - 10, y(yOf(m)) + j.dy));
            const passed = m.status === 'passed';
            const sub = statusLine(m);
            const priceSymbol = PRICE_BAND_SYMBOL[m.entry.profile.priceBand] || '';
            return (
              <g
                key={m.entry.profile.brand}
                onClick={() => onOpenBrand(m.entry.profile.brand)}
                style={{ cursor: 'pointer' }}
                role="button"
                aria-label={`${m.entry.profile.brand} — ${m.entry.rating} · ${priceSymbol}${sub ? ` · ${sub}` : ''} — open the maker's entry`}
              >
                {/* The tooltip — maker + tier + price bracket (21a). */}
                <title>{`${m.entry.profile.brand} — ${m.entry.rating} · ${priceSymbol}${sub ? ` · ${sub}` : ''}`}</title>
                <StatusDot cx={cx} cy={cy} status={m.status} />
                <text
                  x={cx + 10}
                  y={cy + 4}
                  style={{ fontFamily: 'var(--space-font-family)', fontSize: '11.5px', fill: passed ? GHOST : WALNUT }}
                >
                  {m.entry.profile.brand}
                </text>
                {(m.status === 'weighing' || m.status === 'held' || passed) && (
                  <text x={cx + 10} y={cy + 15} style={{ ...axisType, fill: passed ? GHOST : 'var(--color-accent-700,#7c4a17)' }}>
                    {m.status.toUpperCase()}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        <p className="mt-2 text-[var(--color-neutral-600,#856c51)]" style={{ fontFamily: 'var(--space-font-family)', fontSize: '11.5px', lineHeight: 1.5 }}>
          {shown.length < plotted.length
            ? `${shown.length} of ${plotted.length} makers at this width — ${narrow ? 'pinch to zoom; ' : ''}the rest are one tap away in the list. `
            : ''}
          {quadrant
            ? archetypesChosen
              ? 'Fit-to-you reads the overlap between a maker\u2019s directions and the ones in your dossier — your lane is top-left, and the ghost dots are makers you passed, kept visible so the reasoning stays checkable. Tap any dot for the maker\u2019s entry.'
              : 'Choose your style directions in The Dossier and the vertical axis becomes yours — until then every maker sits on the midline. Tap any dot for the maker\u2019s entry.'
            : 'Above the middle, quality flattens and price keeps climbing — the dashed band is excellent and affordable, where Beau\u2019s picks come from. Tap any dot for the maker\u2019s entry.'}
        </p>
      </div>
    </div>
  );
}

export function MakersIndex({ profile, pieces = [] }: { profile: StyleProfile | null; pieces?: WardrobePiece[] }) {
  const [view, setView] = useState<MakerView>('list');
  const [openBrandName, setOpenBrandName] = useState<string | null>(null);
  const { data: addedRows } = (window as any).useWorkspaceDB('hunt_directory_brands', {
    orderBy: { column: 'created_at', direction: 'desc' },
    limit: 200,
  });
  // The Hunt's pipeline — the same records pass-signals.ts reads: which
  // makers are being weighed, held or have been passed on.
  const { data: radarRows } = (window as any).useWorkspaceDB('radar_items', {
    orderBy: { column: 'created_at', direction: 'desc' },
    limit: 200,
  });
  const { data: metaRows } = (window as any).useWorkspaceDB('candidate_meta', {
    orderBy: { column: 'created_at', direction: 'desc' },
    limit: 200,
  });
  const archetypes = (profile?.archetypes || []).filter(Boolean);
  const plotted = usePlotted(
    (addedRows || []) as DirectoryBrandRow[],
    archetypes,
    pieces,
    (radarRows || []) as RadarRowLite[],
    (metaRows || []) as MetaRowLite[],
  );

  return (
    <div>
      {/* The three readings — list · map · quadrant (21a). */}
      <div className="flex" role="group" aria-label="Maker views">
        {([
          { id: 'list' as const, label: 'As a list' },
          { id: 'map' as const, label: 'On a map' },
          { id: 'quadrant' as const, label: 'As a quadrant' },
        ]).map(({ id, label }, i) => {
          const active = view === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              aria-pressed={active}
              className={`uppercase min-h-[44px] px-4 grid place-items-center whitespace-nowrap transition-colors ${
                active
                  ? 'border border-[var(--color-accent,#a8712c)] bg-[var(--color-accent-100,#fbf1de)] text-[var(--color-accent-800,#5c3413)]'
                  : 'border border-[var(--color-divider,rgba(59,43,29,0.18))] text-[var(--color-neutral-700,#634e38)] hover:text-[var(--space-text-primary)]'
              } ${i > 0 ? 'border-l-0' : ''}`}
              style={{ fontFamily: 'var(--space-font-heading)', fontSize: '11px', letterSpacing: '0.12em' }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {view === 'list' && (
        <div className="mt-6">
          {/* The FULL directory — catalog + added makers, favourites and
              notes folded in (the founder's missing-makers fix). */}
          <DiscoverSubTab profileOn profile={profile} onOpenBrand={setOpenBrandName} />
        </div>
      )}
      {view === 'map' && (
        <div className="mt-6">
          <p className={typography.color.primary} style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', lineHeight: 1.6, maxWidth: '64ch' }}>
            Where the makers sit — placed by what they charge and how Beau rates them. Filled dots you already own
            something from; ringed ones you’re weighing. The line to look for is where the rating stops climbing
            with the price.
          </p>
          <MakerScatter
            plotted={plotted}
            yOf={(m) => m.tier}
            yCaption="Beau's tier"
            onOpenBrand={setOpenBrandName}
            archetypesChosen={archetypes.length > 0}
          />
        </div>
      )}
      {view === 'quadrant' && (
        <div className="mt-6">
          <p className={typography.color.primary} style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', lineHeight: 1.6, maxWidth: '64ch' }}>
            Price against whether they’re you — the quadrant swaps quality for fit-to-you: how closely a maker
            matches the archetypes, cuts and colours you actually wear. Passed makers stay visible as ghost dots,
            so a rejection’s reasoning stays legible.
          </p>
          <MakerScatter
            plotted={plotted}
            yOf={(m) => m.fit}
            yCaption="Fit to you"
            onOpenBrand={setOpenBrandName}
            quadrant
            archetypesChosen={archetypes.length > 0}
          />
        </div>
      )}

      {openBrandName && (
        <BrandDetailSheet brandName={openBrandName} onClose={() => setOpenBrandName(null)} />
      )}
    </div>
  );
}
