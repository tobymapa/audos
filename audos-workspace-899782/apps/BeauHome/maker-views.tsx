/**
 * THE INDEX · MAKERS — the maker directory's three readings (design handoff
 * screens 9a · 21a · M13, and the founder's fix for the missing makers):
 *
 *   · AS A LIST — the FULL maker directory (the verified seed catalog +
 *     user-added + Beau-recommended rows), the same table The Hunt's
 *     Discover surface renders. This is the fix for the founder's report
 *     that makers had gone missing from The Index: the Makers sub-tab used
 *     to show only the personal brand_index ledger (a couple of rows) — it
 *     now shows the whole directory, with the personal ledger's favourites
 *     and notes folded in.
 *   · ON A MAP — price × Beau's tier (21a): where quality stops climbing
 *     with price. The dashed band — excellent and affordable — is where
 *     Beau's picks come from.
 *   · AS A QUADRANT — price × fit-to-you (21a): quality is a fact about a
 *     maker; being YOU is a fact about the pair of you. Fit-to-you reads
 *     the overlap between the maker's archetypes and the directions in the
 *     dossier.
 *
 * All three views read the SAME records — a maker you add lands in every
 * view at once. Tapping a dot opens the shared brand dossier.
 */
import { useEffect, useMemo, useState } from 'react';
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
import type { StyleProfile } from './profile-data';

type MakerView = 'list' | 'map' | 'quadrant';

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
}

function usePlotted(rows: DirectoryBrandRow[] | null, archetypes: string[]): PlottedMaker[] {
  return useMemo(() => {
    const entries = mergeDirectory(rows || []);
    return entries.map((entry) => {
      const bandIdx = Math.max(0, PRICE_BAND_ORDER.indexOf(entry.profile.priceBand));
      return {
        entry,
        px: (bandIdx + 0.5) / PRICE_BAND_ORDER.length,
        tier: (TIER_RANK[entry.rating] ?? 1) / 3,
        fit: fitToYou(entry, archetypes),
      };
    });
  }, [rows, archetypes]);
}

/** Narrow-viewport check — the plot thins below 640px (Mobile spec M13:
 * “the plot keeps eight points, not eighteen”). */
function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 639px)').matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener ? mq.addEventListener('change', onChange) : mq.addListener(onChange);
    return () => {
      mq.removeEventListener ? mq.removeEventListener('change', onChange) : mq.removeListener(onChange);
    };
  }, []);
  return narrow;
}

const axisType: React.CSSProperties = {
  fontFamily: 'var(--space-font-heading)',
  fontSize: '10px',
  letterSpacing: '0.14em',
  fill: 'var(--color-neutral-600,#856c51)',
};

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
  /** Quadrant mode draws the two midlines and names the four corners. */
  quadrant?: boolean;
  archetypesChosen: boolean;
}) {
  // MOBILE (M13): a map is legible on a phone only if it's thinned — the
  // plot keeps EIGHT points at 390pt, your own makers first, then Beau's
  // best tiers. The list view always has the full set.
  const narrow = useIsNarrow();
  const shown = useMemo(() => {
    if (!narrow || plotted.length <= 8) return plotted;
    const ranked = [...plotted].sort((a, b) => {
      const aYours = a.entry.source !== 'catalog' ? 1 : 0;
      const bYours = b.entry.source !== 'catalog' ? 1 : 0;
      if (aYours !== bYours) return bYours - aYours;
      if (a.tier !== b.tier) return b.tier - a.tier;
      return a.px - b.px;
    });
    return ranked.slice(0, 8);
  }, [narrow, plotted]);

  const W = 760;
  const H = 520;
  const PAD = { top: 34, right: 30, bottom: 46, left: 40 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (v: number) => PAD.left + v * plotW;
  const y = (v: number) => H - PAD.bottom - v * plotH;
  const corners = [
    { label: 'Your lane', sub: 'Affordable · your taste', cx: PAD.left + plotW * 0.25, cy: PAD.top + 16 },
    { label: 'Worth saving for', sub: 'Dear · your taste', cx: PAD.left + plotW * 0.75, cy: PAD.top + 16 },
    { label: 'Cheap, not you', sub: 'Affordable · not your taste', cx: PAD.left + plotW * 0.25, cy: H - PAD.bottom - 10 },
    { label: 'Dear and not you', sub: 'He\u2019ll stop showing these', cx: PAD.left + plotW * 0.75, cy: H - PAD.bottom - 10 },
  ];
  return (
    <div className="mt-6 border border-[var(--color-divider,rgba(59,43,29,0.18))] bg-[var(--color-paper,#fbf8f1)] p-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`Makers plotted — price across, ${yCaption.toLowerCase()} up`}>
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
                where Beau's picks come from. */}
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
                <text x={c.cx} y={c.cy + 13} textAnchor="middle" style={axisType}>{c.sub.toUpperCase()}</text>
              </g>
            ))}
          </>
        )}

        {shown.map((m) => {
          const j = jitterOf(m.entry.profile.brand);
          const cx = Math.max(PAD.left + 10, Math.min(W - PAD.right - 10, x(m.px) + j.dx));
          const cy = Math.max(PAD.top + 10, Math.min(H - PAD.bottom - 10, y(yOf(m)) + j.dy));
          const yours = m.entry.source !== 'catalog';
          return (
            <g
              key={m.entry.profile.brand}
              onClick={() => onOpenBrand(m.entry.profile.brand)}
              style={{ cursor: 'pointer' }}
              role="button"
              aria-label={`${m.entry.profile.brand} — open the maker's entry`}
            >
              <circle
                cx={cx}
                cy={cy}
                r="6.5"
                fill={yours ? 'var(--color-accent,#a8712c)' : 'var(--color-paper,#fbf8f1)'}
                stroke="var(--color-text,#241a12)"
                strokeWidth="1.4"
              />
              <text x={cx + 10} y={cy + 4} style={{ fontFamily: 'var(--space-font-family)', fontSize: '11.5px', fill: 'var(--color-text,#241a12)' }}>
                {m.entry.profile.brand}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="mt-2 text-[var(--color-neutral-600,#856c51)]" style={{ fontFamily: 'var(--space-font-family)', fontSize: '11.5px', lineHeight: 1.5 }}>
        {shown.length < plotted.length
          ? `${shown.length} of ${plotted.length} makers at this width — the rest are one tap away in the list. `
          : ''}
        {quadrant
          ? archetypesChosen
            ? 'Fit-to-you reads the overlap between a maker\u2019s directions and the ones in your dossier — your lane is top-left. A filled dot is a maker you (or Beau) added; tap any dot for the maker\u2019s entry.'
            : 'Choose your style directions in The Dossier and the vertical axis becomes yours — until then every maker sits on the midline. Tap any dot for the maker\u2019s entry.'
          : 'Above the middle, quality flattens and price keeps climbing — the dashed band is excellent and affordable, where Beau\u2019s picks come from. A filled dot is a maker you (or Beau) added; tap any dot for the maker\u2019s entry.'}
      </p>
    </div>
  );
}

export function MakersIndex({ profile }: { profile: StyleProfile | null }) {
  const [view, setView] = useState<MakerView>('list');
  const [openBrandName, setOpenBrandName] = useState<string | null>(null);
  const { data: addedRows } = (window as any).useWorkspaceDB('hunt_directory_brands', {
    orderBy: { column: 'created_at', direction: 'desc' },
    limit: 200,
  });
  const archetypes = (profile?.archetypes || []).filter(Boolean);
  const plotted = usePlotted((addedRows || []) as DirectoryBrandRow[], archetypes);

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
        <MakerScatter
          plotted={plotted}
          yOf={(m) => m.tier}
          yCaption="Beau's tier"
          onOpenBrand={setOpenBrandName}
          archetypesChosen={archetypes.length > 0}
        />
      )}
      {view === 'quadrant' && (
        <MakerScatter
          plotted={plotted}
          yOf={(m) => m.fit}
          yCaption="Fit to you"
          onOpenBrand={setOpenBrandName}
          quadrant
          archetypesChosen={archetypes.length > 0}
        />
      )}

      {openBrandName && (
        <BrandDetailSheet brandName={openBrandName} onClose={() => setOpenBrandName(null)} />
      )}
    </div>
  );
}
