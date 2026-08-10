/**
 * THE INDEX · MAKERS — rebuilt to the corrected design handoff, screen 21a
 * ("Makers · on a map, and in a quadrant") and mobile M13. The directory's
 * three readings under ONE header row, with the AS A LIST · ON A MAP · AS A
 * QUADRANT toggle at the header's RIGHT edge:
 *
 *  · AS A LIST — the FULL maker directory (the verified seed catalog +
 *    user-added + Beau-recommended rows), the same table The Hunt's
 *    Discover surface renders.
 *  · ON A MAP — the whole 21a page: what they charge across, Beau's tier
 *    up; the five-state legend (you own something · weighing · held ·
 *    neither · passed); the DASHED VALUE BAND — excellent, and affordable ·
 *    where you should be shopping; the WHY A MAP HERE note and OTHER AXES
 *    table in the 300px right rail — then, below a rule, the fit-to-you
 *    quadrant section exactly as the reference stacks it.
 *  · AS A QUADRANT — price against whether they're YOU: the four corners
 *    named IN the plot (Your lane · Worth saving for · Cheap, not you ·
 *    Dear and not you), counts in the WHAT EACH CORNER HOLDS rail, passed
 *    makers kept visible as ghost dots, and "dear and not you" flagged as
 *    the corner Beau prunes.
 *
 * All three views read the SAME records — a maker you add lands in every
 * view at once. Tapping a dot opens the shared brand dossier; the tooltip
 * names the maker, Beau's tier and the price bracket. Mobile (M13): the
 * plot keeps eight points, the axes and the dashed band stay, and the rest
 * is pinch-to-zoom (plot-zoom.ts).
 */
import { useMemo, useState } from 'react';
import type React from 'react';
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
import { MONO, capWord, numberWord, usePlexMono } from './mono-type';
import { ViewToggle } from './view-toggle';
import { AccentNote, CornerRow, OtherAxes, PlotBox } from './piece-map';

type MakerView = 'list' | 'map' | 'quadrant';

/** How the wearer relates to a maker — read from the wardrobe (owned) and
 * The Hunt's pipeline records (weighing · held · passed). */
type MakerStatus = 'owned' | 'held' | 'weighing' | 'passed' | 'neither';

const STATUS_WEIGHT: Record<MakerStatus, number> = { owned: 4, held: 3, weighing: 2, passed: 1, neither: 0 };

const TIER_RANK: Record<BeauRating, number> = { Excellent: 3, Reliable: 2, Inconsistent: 1, Avoid: 0 };

// The 21a palette and type registers.
const SERIF = 'var(--space-font-heading)';
const BODY = 'var(--space-font-family)';
const WALNUT = '#241a12';
const INK = '#3b2b1d';
const MUTED = '#856c51';
const FAINT = '#a68e70';
const FAINTER = '#bfae96';
const LABEL_BROWN = '#7a6349';
const ACCENT = '#a8712c';
const ACCENT_DEEP = '#7c4a17';

// Plot geometry — 880-wide plot, 30/40/34/62 padding as the reference draws
// the makers page; the viewBox bakes the padding in so the corner captions
// sit outside the plot.
const PLOT_W = 880;
const MAP_H = 420;
const QUAD_H = 400;
const PAD_L = 62;
const PAD_T = 30;
const PAD_R = 40;
const PAD_B = 34;
const VIEW_W = PAD_L + PLOT_W + PAD_R;
const MAP_VIEW_H = PAD_T + MAP_H + PAD_B;
const QUAD_VIEW_H = PAD_T + QUAD_H + PAD_B;

function svgMono(size = 8.5, fill = FAINT): React.CSSProperties {
  return { fontFamily: MONO, fontSize: `${size}px`, letterSpacing: '0.06em', fill };
}

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

// ---------------------------------------------------------------------------
// Dots and legend — the five states, drawn to the reference.
// ---------------------------------------------------------------------------

/** filled walnut = you own something · ringed accent = weighing · accent
 * fill = held · hollow = neither · faint hollow = passed (the ghost). */
function StatusDot({ cx, cy, status }: { cx: number; cy: number; status: MakerStatus }) {
  if (status === 'owned') return <circle cx={cx} cy={cy} r="5.5" fill={INK} stroke={INK} strokeWidth="1.5" />;
  if (status === 'weighing') return <circle cx={cx} cy={cy} r="6" fill="none" stroke={ACCENT} strokeWidth="1.5" />;
  if (status === 'held') return <circle cx={cx} cy={cy} r="5.5" fill={ACCENT} stroke={ACCENT_DEEP} strokeWidth="1.5" />;
  if (status === 'passed') return <circle cx={cx} cy={cy} r="4" fill="none" stroke="rgba(59,43,29,0.28)" strokeWidth="1.5" />;
  return <circle cx={cx} cy={cy} r="4.5" fill="none" stroke="rgba(59,43,29,0.55)" strokeWidth="1.5" />;
}

const legendText: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: '9px',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: LABEL_BROWN,
};

function Legend({ zoomed, onReset }: { zoomed: boolean; onReset: () => void }) {
  const item = (status: MakerStatus, label: string) => (
    <span className="inline-flex items-center" style={{ gap: '8px' }}>
      <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true" className="inline-block">
        <StatusDot cx={7.5} cy={7.5} status={status} />
      </svg>
      <span style={legendText}>{label}</span>
    </span>
  );
  return (
    <div className="flex flex-wrap items-center" style={{ gap: '22px', paddingBottom: '14px' }}>
      {item('owned', 'You own something')}
      {item('weighing', 'Weighing')}
      {item('held', 'Held')}
      {item('neither', 'Neither')}
      {item('passed', 'Passed')}
      {zoomed && (
        <button type="button" onClick={onReset} className="hover:underline" style={{ ...legendText, color: ACCENT, background: 'transparent' }}>
          Reset zoom
        </button>
      )}
    </div>
  );
}

function AxisRow({ across, up }: { across: string; up: string }) {
  const wrap: React.CSSProperties = { fontFamily: MONO, fontSize: '9px', letterSpacing: '0.07em', textTransform: 'uppercase', color: LABEL_BROWN };
  const pick: React.CSSProperties = { color: WALNUT, borderBottom: '1px solid rgba(168,113,44,0.6)', paddingBottom: '1px' };
  return (
    <div className="flex flex-wrap items-baseline" style={{ gap: '26px', paddingBottom: '12px' }}>
      <span style={wrap}>Across · <span style={pick}>{across}&nbsp;⌄</span></span>
      <span style={wrap}>Up · <span style={pick}>{up}&nbsp;⌄</span></span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The dots layer — shared by both plots (only the vertical reading differs).
// ---------------------------------------------------------------------------

function MakerDots({
  shown,
  yOf,
  plotH,
  onOpenBrand,
}: {
  shown: PlottedMaker[];
  yOf: (m: PlottedMaker) => number;
  plotH: number;
  onOpenBrand: (brand: string) => void;
}) {
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
    <>
      {shown.map((m) => {
        const j = jitterOf(m.entry.profile.brand);
        const cx = PAD_L + Math.max(10, Math.min(PLOT_W - 10, m.px * PLOT_W + j.dx));
        const cy = PAD_T + Math.max(10, Math.min(plotH - 10, 20 + (1 - yOf(m)) * (plotH - 40) + j.dy));
        const passed = m.status === 'passed';
        const right = cx > PAD_L + PLOT_W * 0.75;
        const lx = right ? cx - 13 : cx + 13;
        const anchor = right ? 'end' : 'start';
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
            <text x={lx} y={cy + 4.5} textAnchor={anchor} style={{ fontFamily: SERIF, fontSize: '13.5px', fill: passed ? FAINT : WALNUT }}>
              {m.entry.profile.brand}
            </text>
            {(m.status === 'weighing' || m.status === 'held') && (
              <text x={lx} y={cy + 16} textAnchor={anchor} style={{ ...svgMono(8, ACCENT_DEEP) }}>
                {m.status.toUpperCase()}
              </text>
            )}
          </g>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// The map — price × Beau's tier, with the dashed value band.
// ---------------------------------------------------------------------------

function MakersMapSvg({ shown, onOpenBrand }: { shown: PlottedMaker[]; onOpenBrand: (brand: string) => void }) {
  const zoom = usePinchZoom(VIEW_W, MAP_VIEW_H);
  return (
    <div>
      <AxisRow across="What they charge" up="Beau's tier" />
      <Legend zoomed={zoom.zoomed} onReset={zoom.reset} />
      <PlotBox>
        <svg
          ref={zoom.svgRef}
          viewBox={zoom.viewBox}
          {...zoom.handlers}
          className="w-full h-auto block"
          style={{ touchAction: zoom.touchAction }}
          role="img"
          aria-label="Makers plotted — what they charge across, Beau's tier up"
        >
          {[220, 440, 660].map((gx) => (
            <line key={gx} x1={PAD_L + gx} y1={PAD_T} x2={PAD_L + gx} y2={PAD_T + MAP_H} stroke="rgba(59,43,29,0.1)" strokeWidth="1" />
          ))}
          {[105, 210, 315].map((gy) => (
            <line key={gy} x1={PAD_L} y1={PAD_T + gy} x2={PAD_L + PLOT_W} y2={PAD_T + gy} stroke="rgba(59,43,29,0.1)" strokeWidth="1" />
          ))}

          {/* THE DASHED VALUE BAND (21a · M13) — excellent, and affordable:
              where Beau's picks come from. It stays at every width. */}
          <rect
            x={PAD_L + 194}
            y={PAD_T + 25}
            width={387}
            height={126}
            fill="none"
            stroke="rgba(168,113,44,0.5)"
            strokeWidth="1"
            strokeDasharray="5 4"
          />
          <text x={PAD_L + 198} y={PAD_T + 14} style={{ ...svgMono(8.5, ACCENT_DEEP) }}>
            EXCELLENT, AND AFFORDABLE · WHERE YOU SHOULD BE SHOPPING
          </text>

          <text x={10} y={PAD_T + 4} style={svgMono()}>EXCELLENT</text>
          <text x={10} y={PAD_T + MAP_H + 2} style={svgMono()}>INTERESTING</text>
          <text x={PAD_L} y={PAD_T + MAP_H + 22} style={svgMono()}>{PRICE_BAND_SYMBOL[PRICE_BAND_ORDER[0]]}</text>
          <text x={PAD_L + PLOT_W} y={PAD_T + MAP_H + 22} textAnchor="end" style={svgMono()}>
            {PRICE_BAND_SYMBOL[PRICE_BAND_ORDER[PRICE_BAND_ORDER.length - 1]]}
          </text>

          <MakerDots shown={shown} yOf={(m) => m.tier} plotH={MAP_H} onOpenBrand={onOpenBrand} />
        </svg>
      </PlotBox>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The quadrant — price × fit-to-you, four named corners in the plot.
// ---------------------------------------------------------------------------

function MakersQuadrantSvg({ shown, onOpenBrand }: { shown: PlottedMaker[]; onOpenBrand: (brand: string) => void }) {
  const zoom = usePinchZoom(VIEW_W, QUAD_VIEW_H);
  const corner = (name: string, sub: string, h: 'l' | 'r', v: 't' | 'b', inset: number) => {
    const x = h === 'l' ? PAD_L + 14 : PAD_L + PLOT_W - 14;
    const anchor = h === 'l' ? 'start' : 'end';
    const nameY = v === 't' ? PAD_T + inset + 13 : PAD_T + QUAD_H - inset - 15;
    const subY = nameY + 15;
    return (
      <g key={name}>
        <text x={x} y={nameY} textAnchor={anchor} style={{ fontFamily: SERIF, fontSize: '17px', fill: FAINT }}>{name}</text>
        <text x={x} y={subY} textAnchor={anchor} style={{ ...svgMono(8.5, FAINTER) }}>{sub.toUpperCase()}</text>
      </g>
    );
  };
  return (
    <PlotBox>
      <svg
        ref={zoom.svgRef}
        viewBox={zoom.viewBox}
        {...zoom.handlers}
        className="w-full h-auto block"
        style={{ touchAction: zoom.touchAction }}
        role="img"
        aria-label="Makers plotted — price across, fit to you up, cut into four named quadrants"
      >
        <line x1={PAD_L + PLOT_W / 2} y1={PAD_T} x2={PAD_L + PLOT_W / 2} y2={PAD_T + QUAD_H} stroke="rgba(59,43,29,0.34)" strokeWidth="1" />
        <line x1={PAD_L} y1={PAD_T + QUAD_H / 2} x2={PAD_L + PLOT_W} y2={PAD_T + QUAD_H / 2} stroke="rgba(59,43,29,0.34)" strokeWidth="1" />

        {corner('Your lane', 'Affordable · your taste', 'l', 't', 26)}
        {corner('Worth saving for', 'Dear · your taste', 'r', 't', 12)}
        {corner('Cheap, not you', 'Affordable · not your taste', 'l', 'b', 26)}
        {corner('Dear and not you', 'Dear · not your taste', 'r', 'b', 12)}

        <text x={10} y={PAD_T + 4} style={svgMono()}>SQUARELY YOU</text>
        <text x={10} y={PAD_T + QUAD_H + 2} style={svgMono()}>NOT YOUR TASTE</text>
        <text x={PAD_L} y={PAD_T + QUAD_H + 22} style={svgMono()}>{PRICE_BAND_SYMBOL[PRICE_BAND_ORDER[0]]}</text>
        <text x={PAD_L + PLOT_W} y={PAD_T + QUAD_H + 22} textAnchor="end" style={svgMono()}>
          {PRICE_BAND_SYMBOL[PRICE_BAND_ORDER[PRICE_BAND_ORDER.length - 1]]}
        </text>

        <MakerDots shown={shown} yOf={(m) => m.fit} plotH={QUAD_H} onOpenBrand={onOpenBrand} />
      </svg>
    </PlotBox>
  );
}

// ---------------------------------------------------------------------------
// Corner counts + Beau's brief for the quadrant rail.
// ---------------------------------------------------------------------------

interface MakerCorner {
  list: PlottedMaker[];
  passed: number;
}

function makerCorners(shown: PlottedMaker[]) {
  const pick = (left: boolean, top: boolean): MakerCorner => {
    const list = shown.filter((m) => (m.px < 0.5) === left && (m.fit >= 0.5) === top);
    return { list, passed: list.filter((m) => m.status === 'passed').length };
  };
  return {
    yourLane: pick(true, true),
    worthSaving: pick(false, true),
    cheapNotYou: pick(true, false),
    dearNotYou: pick(false, false),
  };
}

function plainCount(c: MakerCorner): string {
  return c.list.length === 0 ? 'None' : `${c.list.length} maker${c.list.length === 1 ? '' : 's'}`;
}

function passedCount(c: MakerCorner): string {
  if (c.list.length === 0) return 'None';
  if (c.passed === 0) return plainCount(c);
  const passedNote = c.passed === c.list.length ? (c.passed === 2 ? 'both passed' : c.passed === 1 ? 'passed' : 'all passed') : `${c.passed} passed`;
  return `${c.list.length} · ${passedNote}`;
}

function makersBrief(
  corners: ReturnType<typeof makerCorners>,
  archetypesChosen: boolean,
): string {
  if (!archetypesChosen) {
    return 'Choose your style directions in The Dossier and the vertical axis becomes yours — until then every maker sits on the midline.';
  }
  const parts: string[] = [];
  const lane = corners.yourLane.list.length;
  if (lane > 0) {
    const ownedInLane = corners.yourLane.list.filter((m) => m.status === 'owned').length;
    parts.push(
      `Your lane is ${numberWord(lane)} maker${lane === 1 ? '' : 's'} deep${
        ownedInLane > 0 ? ` and you’ve bought from ${numberWord(ownedInLane)} of them` : ''
      }.`,
    );
  } else {
    parts.push('Nothing sits squarely in your lane yet — as the directory learns your taste, the top-left fills in.');
  }
  const dear = corners.dearNotYou.list[0];
  if (dear) {
    parts.push(
      `${dear.entry.profile.brand} is expensive and not you — so it drops off your list unless you tell me otherwise.`,
    );
  }
  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// The section root — header row with the toggle, then the selected reading.
// ---------------------------------------------------------------------------

export function MakersIndex({ profile, pieces = [] }: { profile: StyleProfile | null; pieces?: WardrobePiece[] }) {
  usePlexMono();
  const [view, setView] = useState<MakerView>('list');
  const [openBrandName, setOpenBrandName] = useState<string | null>(null);
  const narrow = useIsNarrow();
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

  // THE PLOT IS THE MAKERS YOU'VE INTERACTED WITH (21a: "eighteen of the
  // sixty-one, placed"): owned · weighing · held · passed always draw, and
  // the catalog's best-rated makers fill the picture up to eighteen dots so
  // the value question stays readable. The list always has the full set.
  // MOBILE (M13): the plot keeps EIGHT points, pinch-to-zoom for the rest.
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

  const corners = useMemo(() => makerCorners(shown), [shown]);

  const toggle = (
    <ViewToggle
      items={[
        { id: 'list' as const, label: 'As a list' },
        { id: 'map' as const, label: 'On a map' },
        { id: 'quadrant' as const, label: 'As a quadrant' },
      ]}
      active={view}
      onChange={(id) => setView(id)}
      ariaLabel="Maker views"
    />
  );

  const mapIntro =
    shown.length < plotted.length ? (
      <>
        {capWord(numberWord(shown.length))} of the {numberWord(plotted.length)}, placed by what they charge and how
        Beau rates them. Filled dots you already own something from; ringed ones you’re weighing. The line to look
        for is where the rating stops climbing with the price.
      </>
    ) : (
      <>
        The directory’s {numberWord(plotted.length)} makers, placed by what they charge and how Beau rates them.
        Filled dots you already own something from; ringed ones you’re weighing. The line to look for is where the
        rating stops climbing with the price.
      </>
    );

  const quadIntro = (
    <>
      The quadrant swaps quality for fit-to-you: how closely a maker matches the archetypes, cuts and colours you
      actually wear. Quality is a fact about a maker; being <em>you</em> is a fact about the pair of you, and it’s
      the one a tailored directory exists to hold.
    </>
  );

  // The quadrant rail — corner counts, Beau's brief, and the footnote that
  // both plots read the same records as the directory.
  const quadrantRail = (
    <div>
      <div style={{ fontFamily: MONO, fontSize: '9px', letterSpacing: '0.07em', textTransform: 'uppercase', color: LABEL_BROWN }}>
        What each corner holds
      </div>
      <div className="flex flex-col" style={{ marginTop: '12px' }}>
        <CornerRow name="Your lane" count={plainCount(corners.yourLane)} />
        <CornerRow name="Worth saving for" count={plainCount(corners.worthSaving)} />
        <CornerRow name="Cheap, not you" count={passedCount(corners.cheapNotYou)} tone={corners.cheapNotYou.passed > 0 ? MUTED : WALNUT} />
        <CornerRow
          name="Dear and not you"
          count={corners.dearNotYou.list.length === 0 ? 'None' : `${corners.dearNotYou.list.length} · he’ll stop showing these`}
          tone={MUTED}
          last
        />
      </div>
      <AccentNote title="Beau, briefly" style={{ marginTop: '20px' }}>
        {makersBrief(corners, archetypes.length > 0)}
      </AccentNote>
      <p style={{ margin: '16px 0 0', fontFamily: BODY, fontSize: '12.5px', lineHeight: 1.55, color: MUTED }}>
        Both plots read the same {numberWord(plotted.length)} records as the directory, including the ones you added.
        A maker you upload lands where its price and cut put it, unrated or not.
      </p>
    </div>
  );

  if (view === 'list') {
    return (
      <div>
        <div className="flex justify-end" style={{ marginBottom: '10px' }}>{toggle}</div>
        {/* The FULL directory — catalog + added makers, favourites and notes
            folded in. */}
        <DiscoverSubTab profileOn profile={profile} onOpenBrand={setOpenBrandName} />
        {openBrandName && <BrandDetailSheet brandName={openBrandName} onClose={() => setOpenBrandName(null)} />}
      </div>
    );
  }

  return (
    <div>
      {/* The 21a header — title + intro left, the toggle at the RIGHT edge,
          closed by a walnut hairline. */}
      <div
        className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-5 md:gap-10 md:items-end"
        style={{ paddingBottom: '20px', borderBottom: '1px solid var(--color-text,#3b2b1d)' }}
      >
        <div>
          <h3 style={{ margin: 0, fontFamily: SERIF, fontSize: 'clamp(30px, 4vw, 42px)', fontWeight: 400, lineHeight: 1.08, letterSpacing: '-0.012em', color: WALNUT }}>
            {view === 'map' ? 'Where the makers sit' : 'Price against whether they’re you'}
          </h3>
          <p style={{ margin: '11px 0 0', maxWidth: '74ch', fontFamily: BODY, fontSize: '15.5px', lineHeight: 1.58, color: INK }}>
            {view === 'map' ? mapIntro : quadIntro}
          </p>
        </div>
        {toggle}
      </div>

      {view === 'map' && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-8 lg:gap-[44px] items-start" style={{ marginTop: '26px' }}>
            <div>
              <MakersMapSvg shown={shown} onOpenBrand={setOpenBrandName} />
              <p style={{ margin: '18px 0 0', maxWidth: '86ch', fontFamily: BODY, fontSize: '14px', lineHeight: 1.6, color: INK }}>
                {shown.length < plotted.length
                  ? `${shown.length} of ${plotted.length} makers at this width — ${narrow ? 'pinch to zoom; ' : ''}the rest are one tap away in the list. `
                  : ''}
                Above the middle, quality flattens: the makers along the top rate the same while the price keeps
                climbing, and everything to the right of the band buys make and finish rather than a better answer to
                your gaps — which is the honest reason Beau keeps putting the mid-band up. Tap any dot for the
                maker’s entry.
              </p>
            </div>
            <div>
              <AccentNote title="Why a map here">
                A directory sorted by tier tells you who is good. Plotted against price, it tells you where good stops
                being worth paying for — which is the only question a directory is actually asked.
              </AccentNote>
              <OtherAxes
                rows={[
                  { label: 'Price · tier', note: 'Shown', accent: true },
                  { label: 'Price · how much you own', note: 'Your habits' },
                  { label: 'Tier · how long it lasts', note: 'Cost per year' },
                ]}
              />
            </div>
          </div>

          {/* PRICE AGAINST WHETHER THEY'RE YOU — stacked below the map,
              exactly as the reference lays the page out. */}
          <div
            className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-8 lg:gap-[44px] items-start"
            style={{ marginTop: '46px', paddingTop: '24px', borderTop: '1px solid var(--color-text,#3b2b1d)' }}
          >
            <div>
              <h4 style={{ margin: 0, fontFamily: SERIF, fontSize: '30px', fontWeight: 400, lineHeight: 1.14, color: WALNUT }}>
                Price against whether they’re you
              </h4>
              <p style={{ margin: '9px 0 0', maxWidth: '80ch', fontFamily: BODY, fontSize: '14.5px', lineHeight: 1.58, color: INK }}>{quadIntro}</p>
              <div style={{ marginTop: '20px' }}>
                <MakersQuadrantSvg shown={shown} onOpenBrand={setOpenBrandName} />
              </div>
            </div>
            {quadrantRail}
          </div>
        </>
      )}

      {view === 'quadrant' && (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-8 lg:gap-[44px] items-start" style={{ marginTop: '26px' }}>
          <div>
            <MakersQuadrantSvg shown={shown} onOpenBrand={setOpenBrandName} />
            <p style={{ margin: '18px 0 0', maxWidth: '86ch', fontFamily: BODY, fontSize: '14px', lineHeight: 1.6, color: INK }}>
              Passed makers stay visible as ghost dots — showing where a rejection landed is how you check the
              reasoning. Tap any dot for the maker’s entry.
            </p>
          </div>
          {quadrantRail}
        </div>
      )}

      {openBrandName && <BrandDetailSheet brandName={openBrandName} onClose={() => setOpenBrandName(null)} />}
    </div>
  );
}
