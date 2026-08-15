/**
 * THE INDEX — full rebuild from the founder's reference screenshots,
 * personalised end to end (August 2026 overhaul).
 *
 * One page, two FACES under one toggle (top right):
 *
 *  · PIECES — the garment-type reference read BY TEMPERATURE. A category
 *    strip (the eleven canonical categories, counts beside the names, one
 *    non-scrolling row), the temperature-band selector with the reader's
 *    own piece count under every band and COLDEST/WARMEST poles, a Find
 *    line with Formality / Occasion / Run drop-downs, and the reading:
 *    a left rail carrying the category name and BEAU'S OWN VERDICT for
 *    this reader (generated from their ledger, profile and gaps — never a
 *    stock line), then one row per type — the NAME opens the type's inline
 *    entry; the ARROW hands off to the Makers face filtered to the houses
 *    that make that type.
 *
 *  · MAKERS — BEAU'S FIFTY: the houses Beau would send this reader to
 *    first, chosen against their profile, ledger and named gaps, each with
 *    a one-line justification — then the reader's own additions (a name or
 *    a pasted link auto-researches into a full dossier), then the rest of
 *    the directory on demand. ADD YOUR OWN MAKER sits in its own section
 *    directly under the find row; every row says who filed it (SOURCE —
 *    Beau or you) and the source control reads either alone. Every column
 *    head sorts. Favourites, the five-verdict legend and the
 *    select-to-compare flow carry over.
 *
 * Everything on the page is REAL, PER-READER data: the taxonomy
 * (garment-types.ts + garment-type-runs.ts), spans and verdicts
 * (index-model.ts against the dossier's climate), ownership, gaps and
 * per-band piece counts (the reader's own ledger), the maker directory
 * (brands.ts merged with hunt_directory_brands), favourites (brand_index)
 * and Beau's generated verdicts (index-tab-copy.ts — model-written against
 * the reader's facts, with deterministic per-reader fallbacks).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import {
  BRAND_DIRECTORY,
  PRICE_BAND_ORDER,
  brandCategoryIds,
  mergeDirectory,
  verifiedBrandWebsiteUrl,
  type BrandProfile,
  type DirectoryBrandRow,
  type DirectoryEntry,
  type Register,
} from './brands';
import { INDEX_GARMENT_TYPES, findGarmentType, type GarmentCategoryId, type GarmentType } from './garment-types';
import { runOfType } from './garment-type-runs';
import { TEMPERATURE_BAND_ORDER, temperatureBandLabel, temperatureBandRange, temperatureBandRank, type TemperatureBand } from './temperature-bands';
import {
  FIELD_REGISTER_LABELS,
  RULER_HI,
  RULER_LO,
  VERDICT_TEXT,
  categoryName,
  computeCategoryBandCounts,
  daysInSpan,
  matchGarmentTypeId,
  hideIndexMaker,
  restoreHiddenIndex,
  spanOf,
  useIndexModel,
  verdictFor,
  type IndexModel,
  type TempSpan,
} from './index-model';
import {
  ACCENT,
  ACCENT_DEEP,
  FAINT,
  FAINTER,
  HAIRLINE,
  INK,
  PAPER,
  RULE,
  SECONDARY,
  WALNUT,
  body,
  mono,
  serif,
} from './index-style';
import { useBeauFifty, useCategoryVerdicts, usePieceBeauRead, type BeauPick } from './index-tab-copy';
import { DISCOVER_BRANDS_EVENT, addDirectoryBrandStubs, backfillDirectoryBrandStubs } from './hunt-ai';
import { looksLikeUrl, nameFromUrl, normalizeSiteUrl, parseBrandImportFile } from './hunt-brand-import';
import {
  BRAND_INDEX_CHANGED_EVENT,
  addBrandIndexEntry,
  fetchMaterials,
  updateBrandIndexEntry,
  type BrandIndexEntry,
  type BrandIndexStatus,
  type StyleProfile,
  type WardrobePiece,
} from './profile-data';
import { fetchPieceWarmth, type PieceWarmth } from './warmth-model';
import { usePlexMono } from './mono-type';
import { SubTabs } from './sub-tabs';
import { TabHeader } from './tab-header';
import { CrumbPublisher, goToEthaionTab } from './crumb-trail';
import {
  INDEX_OPEN_MAKERS_EVENT,
  INDEX_OPEN_TYPE_EVENT,
  peekIndexMakersTarget,
  peekIndexTarget,
  takeIndexMakersTarget,
  takeIndexTarget,
  type IndexTarget,
} from './edit-links';
import { findNewMakers } from './maker-search';
import { PieceDetailPage } from './piece-detail-page';
import { openMakerSheet } from './maker-sheet';

// ---------------------------------------------------------------------------
// Shared furniture
// ---------------------------------------------------------------------------

const DEEP = '#5c3413';
const GAP_TINT = 'rgba(168,113,44,0.07)';
const ROW_HAIRLINE = '1px solid rgba(59,43,29,0.12)';

/** Deep link into the app's own tabs — the Dossier holds the city. */
function goToDossier(): void {
  window.dispatchEvent(new CustomEvent('ethaion:navigate', { detail: { tab: 'your-style' } }));
}

/** The small square-cornered mono control (RESET FILTERS, UPLOAD A LIST…). */
function MonoButton({
  children,
  onClick,
  solid = false,
  dim = false,
  disabled = false,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  solid?: boolean;
  dim?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="transition-colors flex-shrink-0"
      style={{
        ...mono(8.5, solid ? '#f6f0e5' : dim ? FAINTER : SECONDARY),
        background: solid ? WALNUT : 'transparent',
        border: `1px solid ${solid ? WALNUT : dim ? HAIRLINE : RULE}`,
        padding: '8px 13px',
        whiteSpace: 'nowrap',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {children}
    </button>
  );
}

/** One drop-down filter — a mono button opening a checkbox list. */
function FilterMenu({
  label,
  options,
  active,
  onToggle,
}: {
  label: string;
  options: Array<{ id: string; label: string }>;
  active: string[];
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const held = active.length > 0;
  return (
    <div style={{ position: 'relative' }} className="flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="transition-colors"
        style={{
          ...mono(8.5, held ? DEEP : SECONDARY),
          background: held ? 'rgba(168,113,44,0.12)' : 'transparent',
          border: `1px solid ${held ? ACCENT_DEEP : RULE}`,
          padding: '8px 12px',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
        {held ? ` · ${active.length}` : ''} <span style={{ color: FAINTER, letterSpacing: 0 }}>⌄</span>
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} aria-hidden />
          <div
            role="listbox"
            style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              left: 0,
              zIndex: 41,
              background: PAPER,
              border: `1px solid ${RULE}`,
              boxShadow: '0 12px 30px rgba(43,30,20,0.18)',
              minWidth: '196px',
              maxHeight: '300px',
              overflowY: 'auto',
              padding: '5px 0',
            }}
          >
            {options.map((o) => {
              const on = active.includes(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => onToggle(o.id)}
                  className="w-full text-left hover:bg-[rgba(168,113,44,0.07)] transition-colors"
                  style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '7.5px 13px', background: 'transparent' }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: '11px',
                      height: '11px',
                      flexShrink: 0,
                      border: `1px solid ${on ? ACCENT_DEEP : RULE}`,
                      background: on ? ACCENT_DEEP : 'transparent',
                    }}
                  />
                  <span style={mono(8.5, on ? DEEP : SECONDARY)}>{o.label}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/** The FIND line — a bordered input with the mono prefix. */
function FindLine({
  value,
  onChange,
  placeholder,
  maxWidth = '460px',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  maxWidth?: string;
}) {
  return (
    <label
      className="flex items-center min-w-0 flex-1"
      style={{ gap: '13px', border: `1px solid ${RULE}`, padding: '9px 13px', maxWidth, background: 'transparent' }}
    >
      <span style={mono(8.5, FAINT)}>Find</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent outline-none"
        style={{ ...body(14, INK), lineHeight: 1.3 }}
      />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label="Clear the search" style={{ ...mono(9, FAINT), background: 'transparent' }}>
          ×
        </button>
      )}
    </label>
  );
}

/** The filter-state line — “NO FILTERS HELD — …” + RESET FILTERS. */
function StateLine({ text, active, onReset }: { text: string; active: boolean; onReset: () => void }) {
  return (
    <div className="flex items-center justify-between flex-wrap" style={{ gap: '8px 16px', padding: '13px 0' }}>
      <span style={mono(8, FAINT)}>{text}</span>
      <MonoButton onClick={onReset} dim={!active}>
        Reset filters
      </MonoButton>
    </div>
  );
}

const toggleIn = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

// ---------------------------------------------------------------------------
// PIECES FACE — the temperature reading.
// ---------------------------------------------------------------------------

const REGISTER_OPTIONS: Register[] = ['Casual', 'Smart-Casual', 'Business', 'Formal', 'Outdoor-Work', 'Black-Tie'];

/** Occasions — each a deterministic read of a type's own record. */
const SPORT_RX = /track|sweat|gym|rugby|baseball|tennis|runner|trainer|sneaker|swim|hiking|cycling|boat-shoe|deck-/;
const TRAVEL_RX = /travel|holdall|weekender|dopp|garment-bag|car-coat|driving|messenger|rucksack|field-satchel/;

const OCCASIONS: Array<{ id: string; label: string; test: (t: GarmentType) => boolean }> = [
  { id: 'weekend', label: 'Weekend', test: (t) => t.reach.includes('Casual') },
  { id: 'work', label: 'Work', test: (t) => t.reach.includes('Business') || t.reach.includes('Smart-Casual') },
  { id: 'evening', label: 'Evening', test: (t) => t.reach.includes('Formal') || t.reach.includes('Black-Tie') },
  {
    id: 'travel',
    label: 'Travel',
    test: (t) => t.category === 'bags' || TRAVEL_RX.test(t.id) || (t.reach.includes('Casual') && t.reach.includes('Smart-Casual')),
  },
  { id: 'sport', label: 'Sport', test: (t) => t.category === 'sweatshirts' || SPORT_RX.test(t.id) },
  { id: 'outdoor', label: 'Outdoor', test: (t) => t.reach.includes('Outdoor-Work') },
];

const BAND_CELL_LABELS: Record<TemperatureBand, string> = {
  'below-0': '≤ 0°',
  '0-5': '0–5°',
  '5-10': '5–10°',
  '10-15': '10–15°',
  '15-20': '15–20°',
  '20-25': '20–25°',
  '25-30': '25–30°',
  'above-30': '30°+',
};

/** Percent from the COLD end — cold left, hot right, the whole track. */
const pct = (c: number) => ((c - RULER_LO) / (RULER_HI - RULER_LO)) * 100;
const AXIS_MARKS = [0, 10, 20, 30];

function pieceVerdictColor(v: string | null): string {
  if (v === 'essential') return ACCENT_DEEP;
  if (v === 'works') return SECONDARY;
  if (v === 'wrong tool') return '#8a3a2e';
  return FAINT; // niche · unweighted
}

/** The temperature-band selector — click a band to hold it. Every band
 * carries the count of the reader's OWN pieces IN THIS CATEGORY that
 * answer it — live arithmetic over the ledger, each piece read from its
 * stored warmth row or the same inference the Today pre-filter runs
 * (category + material + make); a piece with no inferrable range joins no
 * band. COLDEST sits at the far left, WARMEST at the far right. */
function BandStrip({
  counts,
  pieceCounts,
  categoryTotal,
  categoryLabel,
  ownedBands,
  held,
  onHold,
  city,
}: {
  counts: Record<string, number>;
  pieceCounts: Record<TemperatureBand, number>;
  /** Every ledger piece the held category holds — the denominator. */
  categoryTotal: number;
  categoryLabel: string;
  ownedBands: Set<TemperatureBand>;
  held: TemperatureBand | null;
  onHold: (b: TemperatureBand | null) => void;
  city: string | null;
}) {
  const max = Math.max(1, ...TEMPERATURE_BAND_ORDER.map((b) => counts[b] || 0));
  return (
    <div style={{ paddingBottom: '16px' }}>
      <div className="flex items-baseline justify-between flex-wrap" style={{ gap: '4px 16px', paddingBottom: '7px' }}>
        {/* The numbers are apparent temperature in °C — said plainly, so a
            band reads as a temperature range and not an unexplained pair. */}
        <span style={mono(9.5, FAINT)}>Temperature range in °C · click a band to hold it</span>
        {city ? (
          <span style={mono(7.5, ACCENT_DEEP)}>{city}</span>
        ) : (
          <button
            type="button"
            onClick={goToDossier}
            className="hover:opacity-70 transition-opacity"
            style={{ ...mono(7.5, ACCENT_DEEP), background: 'transparent', textDecoration: 'underline', textUnderlineOffset: '3px' }}
          >
            Set your city in the Dossier →
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <div style={{ minWidth: '780px' }}>
          <div
            className="grid"
            style={{ gridTemplateColumns: `repeat(${TEMPERATURE_BAND_ORDER.length}, minmax(90px, 1fr))`, border: `1px solid ${RULE}` }}
          >
            {TEMPERATURE_BAND_ORDER.map((band, i) => {
              const count = counts[band] || 0;
              const yours = pieceCounts[band] || 0;
              const isHeld = held === band;
              const owned = ownedBands.has(band);
              return (
                <button
                  key={band}
                  type="button"
                  onClick={() => onHold(isHeld ? null : band)}
                  aria-pressed={isHeld}
                  title={isHeld ? 'Release the band' : `Hold ${BAND_CELL_LABELS[band]}`}
                  className="text-left transition-colors hover:bg-[rgba(168,113,44,0.06)]"
                  style={{
                    padding: '10px 12px 12px',
                    borderLeft: i === 0 ? 'none' : `1px solid ${HAIRLINE}`,
                    background: isHeld ? 'rgba(168,113,44,0.14)' : 'transparent',
                  }}
                >
                  <span style={{ ...mono(10, count > 0 ? SECONDARY : FAINTER), display: 'block', whiteSpace: 'nowrap' }}>{BAND_CELL_LABELS[band]}</span>
                  <span
                    style={{
                      ...serif(24, count > 0 ? WALNUT : FAINTER),
                      display: 'block',
                      lineHeight: 1.15,
                      marginTop: '3px',
                      fontFeatureSettings: "'onum' 1",
                    }}
                  >
                    {count}
                  </span>
                  <span
                    aria-hidden
                    style={{
                      display: 'block',
                      marginTop: '6px',
                      height: '3px',
                      width: count > 0 ? `${Math.max(12, (count / max) * 100)}%` : '0%',
                      background: owned ? ACCENT_DEEP : 'rgba(168,113,44,0.45)',
                    }}
                  />
                  <span
                    title={
                      categoryTotal > 0
                        ? `${yours} of your ${categoryTotal} ${categoryLabel.toLowerCase()} pieces suit ${BAND_CELL_LABELS[band]} — read from each piece's own category, material and make`
                        : `No ${categoryLabel.toLowerCase()} on your rail yet`
                    }
                    style={{ ...mono(6.5, yours > 0 ? ACCENT_DEEP : FAINTER), display: 'block', marginTop: '6px', whiteSpace: 'nowrap' }}
                  >
                    {categoryTotal > 0 ? `${yours} of your ${categoryTotal}` : 'none logged yet'}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between" style={{ paddingTop: '6px' }}>
            <span style={mono(7.5, FAINT)}>coldest</span>
            <span style={mono(7.5, FAINT)}>warmest</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** One type's span drawn on the shared track. */
function SpanBar({ span, owned, gap }: { span: TempSpan; owned: boolean; gap: boolean }) {
  const left = pct(span.lo);
  const width = Math.max(2, pct(span.hi) - pct(span.lo));
  return (
    <div aria-hidden style={{ position: 'relative', height: '16px', minWidth: 0 }}>
      {AXIS_MARKS.map((deg) => (
        <span key={deg} style={{ position: 'absolute', left: `${pct(deg)}%`, top: 0, bottom: 0, width: '1px', background: 'rgba(59,43,29,0.09)' }} />
      ))}
      {gap ? (
        <span
          style={{
            position: 'absolute',
            left: `${left}%`,
            width: `${width}%`,
            top: '3px',
            height: '10px',
            border: `1.5px dashed ${ACCENT}`,
            background: 'rgba(168,113,44,0.08)',
          }}
        />
      ) : (
        <span
          style={{
            position: 'absolute',
            left: `${left}%`,
            width: `${width}%`,
            top: '5px',
            height: '6px',
            background: owned ? '#2e2115' : 'rgba(59,43,29,0.30)',
          }}
        />
      )}
    </div>
  );
}

/** The degree header the bars hang from — mirrors the row grid. */
const PIECE_GRID = 'grid grid-cols-[minmax(148px,220px)_14px_minmax(0,1fr)_78px_72px_30px]';

function PieceAxisHeader() {
  return (
    <>
      {/* MOBILE (founder's correction, August 2026): the degree scale alone,
          full width over the stacked rows — the six-column header belongs to
          the wide grid and is hidden on a phone. */}
      <div aria-hidden className="sm:hidden" style={{ position: 'relative', height: '18px' }}>
        {AXIS_MARKS.map((deg) => (
          <span
            key={deg}
            style={{ ...mono(9, FAINT), position: 'absolute', left: `${pct(deg)}%`, bottom: '2px', transform: 'translateX(-50%)', whiteSpace: 'nowrap' }}
          >
            {deg}°
          </span>
        ))}
      </div>
      <div className={`${PIECE_GRID} items-end hidden sm:grid`} style={{ gap: '0 14px' }}>
      <span aria-hidden style={{ height: '20px' }} />
      <span aria-hidden style={{ height: '20px' }} />
      <div aria-hidden style={{ position: 'relative', height: '20px' }}>
        {AXIS_MARKS.map((deg) => (
          <span
            key={deg}
            style={{ ...mono(10, FAINT), position: 'absolute', left: `${pct(deg)}%`, bottom: '3px', transform: 'translateX(-50%)', whiteSpace: 'nowrap' }}
          >
            {deg}°
          </span>
        ))}
      </div>
      <span aria-hidden style={{ height: '20px' }} />
      {/* The column the range figures fall under — named in °C. */}
      <span style={{ ...mono(9.5, FAINT), height: '20px', display: 'block', textAlign: 'right', whiteSpace: 'nowrap' }}>Temp °C</span>
      <span aria-hidden style={{ height: '20px' }} />
      </div>
    </>
  );
}

/** The type's own inline entry — opened by its NAME. Beau's read leads:
 * model-written for this reader (deterministic per-reader fallback while
 * the call settles), then the fixed facts under their static labels. */
function PieceEntry({ type, model, profile }: { type: GarmentType; model: IndexModel; profile: StyleProfile | null }) {
  const beauRead = usePieceBeauRead(type, model, profile);
  const span = spanOf(type);
  const days = daysInSpan(model.climate, span);
  const run = runOfType(type.id);
  const ownedNames = model.ownership.names.get(type.id) || [];
  const facts: Array<{ label: string; value: string }> = [
    { label: 'Run', value: run ? run.run.label : '—' },
    { label: 'Answers', value: span ? `${span.lo}–${span.hi}° apparent` : 'Judged by material and place' },
    { label: 'Registers', value: type.reach.map((r) => FIELD_REGISTER_LABELS[r] || r).join(' · ') || '—' },
    { label: 'Cuts', value: type.cuts.join(' · ') || '—' },
    { label: 'Colours', value: type.colours.join(' · ') || '—' },
    { label: 'Makers', value: type.makers.slice(0, 6).join(' · ') || 'No verified maker on file' },
  ];
  if (days != null) facts.push({ label: model.climate.city ? `Days a year · ${model.climate.city}` : 'Days a year', value: `about ${days}` });
  if (ownedNames.length > 0) facts.push({ label: 'On your rail', value: ownedNames.join(' · ') });
  return (
    <div style={{ padding: '12px 6px 16px', borderBottom: ROW_HAIRLINE, background: 'rgba(251,248,241,0.6)' }}>
      {beauRead && (
        <div style={{ margin: '0 0 12px', maxWidth: '64ch' }}>
          <span style={{ ...mono(7, ACCENT_DEEP), display: 'block', marginBottom: '3px' }}>Beau's read</span>
          <p style={{ ...body(13.5, INK), margin: 0 }}>{beauRead}</p>
        </div>
      )}
      {run?.run.note && <p style={{ ...body(13, SECONDARY), margin: '0 0 10px', maxWidth: '64ch' }}>{run.run.note}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" style={{ gap: '9px 26px' }}>
        {facts.map((f) => (
          <div key={f.label}>
            <span style={{ ...mono(7.5, FAINT), display: 'block', marginBottom: '2px' }}>{f.label}</span>
            <span style={body(13.5, INK)}>{f.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PiecesFace({
  model,
  pieces,
  profile,
  warmth,
  materials,
  onMakersForType,
}: {
  model: IndexModel;
  pieces: WardrobePiece[];
  profile: StyleProfile | null;
  warmth: Record<number, PieceWarmth>;
  materials: Record<number, string>;
  onMakersForType: (t: GarmentType) => void;
}) {
  const firstBanded = model.categories.find((c) => c.banded)?.id || model.categories[0]?.id || 'tops';
  const [cat, setCat] = useState<GarmentCategoryId>(firstBanded as GarmentCategoryId);
  const [heldBand, setHeldBand] = useState<TemperatureBand | null>(null);
  const [regs, setRegs] = useState<string[]>([]);
  const [occs, setOccs] = useState<string[]>([]);
  const [runs, setRuns] = useState<string[]>([]);
  const [find, setFind] = useState('');
  const [openType, setOpenType] = useState<string | null>(null);
  /** THE PIECE DETAIL PAGE — a type opened as its own routable page. Every
   * piece-name click in the app lands here (the Ledger's and Hunt's info
   * controls, The Edit's gap rows, this face's own rows). */
  const [detail, setDetail] = useState<string | null>(null);

  /**
   * THE WAY IN FROM EVERYWHERE. A deep link asks for ONE garment type by id
   * (The Edit's gap rows, a Ledger row's info control, a Hunt pick): the
   * face lands on its category with every filter cleared and the type's
   * FULL PAGE open. The request arrives as an event when the tab is already
   * mounted, or parked when it is being loaded for the first time — both
   * land here.
   */
  const jumpRef = useRef<(target: IndexTarget | null) => void>(() => undefined);
  jumpRef.current = (target) => {
    const type = target ? findGarmentType(target.typeId) : null;
    if (!type || type.category === 'other') return;
    setCat(type.category as GarmentCategoryId);
    setHeldBand(null);
    setRegs([]);
    setOccs([]);
    setRuns([]);
    setFind('');
    setOpenType(null);
    setDetail(type.id);
  };

  useEffect(() => {
    jumpRef.current(takeIndexTarget());
    const onOpen = (e: Event) => jumpRef.current(((e as CustomEvent).detail || null) as IndexTarget | null);
    window.addEventListener(INDEX_OPEN_TYPE_EVENT, onOpen);
    return () => window.removeEventListener(INDEX_OPEN_TYPE_EVENT, onOpen);
  }, []);

  // Tapping The Index's tab label comes back to the face's own home: the
  // piece page closes, the unfolds and every filter clear.
  useEffect(() => {
    const onTabHome = (e: Event) => {
      if ((e as CustomEvent).detail?.tab !== 'index') return;
      setDetail(null);
      setOpenType(null);
      setHeldBand(null);
      setRegs([]);
      setOccs([]);
      setRuns([]);
      setFind('');
    };
    window.addEventListener('ethaion:tab-home', onTabHome);
    return () => window.removeEventListener('ethaion:tab-home', onTabHome);
  }, []);

  // The URL reflects the open page (#index/piece/<id>) — a reload or a
  // shared link lands back on it, and clearing the hash closes it.
  useEffect(() => {
    const fromHash = () => {
      const m = window.location.hash.match(/^#index\/piece\/([a-z0-9-]+)/i);
      if (m && findGarmentType(m[1].toLowerCase())) setDetail(m[1].toLowerCase());
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, []);
  useEffect(() => {
    try {
      if (detail) {
        window.history.replaceState(null, '', `#index/piece/${detail}`);
      } else if (window.location.hash.startsWith('#index/piece/')) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    } catch {
      /* history unavailable — the page still opens */
    }
  }, [detail]);

  const category = model.categories.find((c) => c.id === cat) || model.categories[0];
  const banded = !!category?.banded;

  // Beau's verdict for every category — generated against THIS reader's
  // ledger, profile and gaps; a per-reader computed line until it lands.
  const catVerdicts = useCategoryVerdicts(profile, model, pieces);

  // The reader's own pieces OF THIS CATEGORY bucketed into the eight bands
  // — live arithmetic over the ledger and each piece's real temperature
  // range (stored warmth row, or the deterministic category + material
  // inference), so the counts move as pieces are added or removed and can
  // never disagree with the category copy below.
  const bandLedger = useMemo(
    () => computeCategoryBandCounts(pieces, banded ? cat : null, warmth, materials),
    [pieces, cat, banded, warmth, materials],
  );

  const pickCategory = (id: GarmentCategoryId) => {
    setCat(id);
    setHeldBand(null);
    setRuns([]);
    setOpenType(null);
  };

  const reset = () => {
    setHeldBand(null);
    setRegs([]);
    setOccs([]);
    setRuns([]);
    setFind('');
  };

  // The category's types with every filter EXCEPT the held band — the
  // histogram counts read from this set, so holding a band never empties
  // its own strip.
  const preBand = useMemo(() => {
    if (!category) return [] as GarmentType[];
    const q = find.trim().toLowerCase();
    const occTests = OCCASIONS.filter((o) => occs.includes(o.id));
    const kept: GarmentType[] = [];
    for (const run of category.runs) {
      if (runs.length > 0 && !runs.includes(run.label)) continue;
      for (const id of run.typeIds) {
        const t = INDEX_GARMENT_TYPES.find((x) => x.id === id);
        if (!t) continue;
        if (q && !t.name.toLowerCase().includes(q)) continue;
        if (regs.length > 0 && !t.reach.some((r) => regs.includes(r))) continue;
        if (occTests.length > 0 && !occTests.some((o) => o.test(t))) continue;
        kept.push(t);
      }
    }
    return kept;
  }, [category, find, regs, occs, runs]);

  const bandCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of preBand) counts[t.band] = (counts[t.band] || 0) + 1;
    return counts;
  }, [preBand]);

  const ownedBands = useMemo(() => {
    const set = new Set<TemperatureBand>();
    for (const t of preBand) if (model.ownership.swatches.has(t.id)) set.add(t.band);
    return set;
  }, [preBand, model.ownership]);

  const shown = useMemo(() => {
    const list = heldBand ? preBand.filter((t) => t.band === heldBand) : [...preBand];
    if (!banded) return list.sort((a, b) => a.name.localeCompare(b.name));
    return list.sort((a, b) => {
      const sa = spanOf(a);
      const sb = spanOf(b);
      if (sa && sb) return sa.lo - sb.lo || sa.hi - sb.hi || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
  }, [preBand, heldBand, banded]);

  const filtersHeld = (heldBand ? 1 : 0) + regs.length + occs.length + runs.length + (find.trim() ? 1 : 0);
  const catName = (category?.name || '').toUpperCase();
  const runOptions = (category?.runs || []).map((r) => ({ id: r.label, label: r.label }));

  // The piece's own page stands in front of the list while it is open —
  // the list (filters, scroll, category) is exactly as he left it beneath.
  if (detail) {
    return (
      <PieceDetailPage
        typeId={detail}
        model={model}
        pieces={pieces}
        profile={profile}
        warmth={warmth}
        materials={materials}
        onBack={() => setDetail(null)}
        onOpenType={(id) => setDetail(id)}
        onMakersForType={(t) => {
          setDetail(null);
          onMakersForType(t);
        }}
        onIndexByBand={(catId, band) => {
          setDetail(null);
          if (catId !== 'other') {
            setCat(catId as GarmentCategoryId);
            setHeldBand(band);
          }
        }}
      />
    );
  }

  return (
    <div>
      {/* ——— the category strip — every category on one compact row, never a
          scroll (founder's correction: the count strip must not scroll) */}
      <div className="flex flex-wrap" style={{ gap: '4px 18px', borderBottom: `1px solid ${HAIRLINE}`, paddingBottom: '9px' }}>
        {model.categories.map((c) => {
          const active = c.id === cat;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => pickCategory(c.id)}
              aria-pressed={active}
              className="flex-shrink-0 transition-colors"
              style={{
                ...mono(8, active ? DEEP : SECONDARY),
                fontWeight: active ? 500 : 400,
                background: 'transparent',
                padding: '0 0 5px',
                borderBottom: active ? `2px solid ${ACCENT}` : '2px solid transparent',
                whiteSpace: 'nowrap',
              }}
            >
              {c.name} <span style={{ color: FAINTER }}>{c.total}</span>
            </button>
          );
        })}
      </div>

      {/* ——— the filter-state line */}
      <StateLine
        text={
          filtersHeld === 0
            ? `No filters held — the whole category, ${banded ? 'coldest first' : 'alphabetical'}`
            : `${filtersHeld} filter${filtersHeld === 1 ? '' : 's'} held — ${shown.length} of ${category?.total || 0} ${catName} types`
        }
        active={filtersHeld > 0}
        onReset={reset}
      />

      {/* ——— the temperature bands (banded categories only) */}
      {banded && (
        <BandStrip
          counts={bandCounts}
          pieceCounts={bandLedger.counts}
          categoryTotal={bandLedger.categoryTotal}
          categoryLabel={category?.name || 'pieces'}
          ownedBands={ownedBands}
          held={heldBand}
          onHold={setHeldBand}
          city={model.climate.city}
        />
      )}

      {/* ——— the find line + drop-downs */}
      <div className="flex items-center flex-wrap" style={{ gap: '10px 12px', paddingBottom: '22px' }}>
        <FindLine value={find} onChange={setFind} placeholder='a piece — try “teba”, “raglan”, “overshirt”' maxWidth="400px" />
        <FilterMenu
          label="Formality"
          options={REGISTER_OPTIONS.map((r) => ({ id: r, label: FIELD_REGISTER_LABELS[r] || r }))}
          active={regs}
          onToggle={(id) => setRegs((cur) => toggleIn(cur, id))}
        />
        <FilterMenu label="Occasion" options={OCCASIONS.map((o) => ({ id: o.id, label: o.label }))} active={occs} onToggle={(id) => setOccs((cur) => toggleIn(cur, id))} />
        {runOptions.length > 1 && <FilterMenu label="Run" options={runOptions} active={runs} onToggle={(id) => setRuns((cur) => toggleIn(cur, id))} />}
      </div>

      {/* ——— the reading: rail left, rows right */}
      <div className="grid grid-cols-1 lg:grid-cols-[188px_minmax(0,1fr)]" style={{ gap: '18px 34px' }}>
        <aside>
          <div className="lg:sticky" style={{ top: '84px' }}>
            {/* The category name alone heads the rail; Beau's verdict for
                THIS reader sits directly under it — never a stock line. */}
            <h4 style={{ ...serif(25, WALNUT), lineHeight: 1.15, margin: 0 }}>{category?.name}</h4>
            <p style={{ ...body(13.5, SECONDARY), margin: '9px 0 0', maxWidth: '30ch' }}>
              {catVerdicts.verdicts[category?.id || ''] || ''}
            </p>
          </div>
        </aside>

        <div className="min-w-0">
          {shown.length === 0 ? (
            <p style={{ ...body(14, SECONDARY), padding: '22px 0' }}>
              Nothing in {category?.name || 'this category'} answers this combination — reset the filters to see the whole run.
            </p>
          ) : (
            <div className="sm:overflow-x-auto">
              {/* MOBILE (founder's correction, August 2026): no sideways
                  scroll — below sm each row stacks (name + arrow, the bar at
                  full width, then verdict · range); the six-column grid and
                  its 560px floor apply from sm up only. */}
              <div className="sm:min-w-[560px]">
                {banded && <PieceAxisHeader />}
                <div style={{ borderTop: `1px solid ${RULE}` }}>
                  {shown.map((t) => {
                    const owned = model.ownership.swatches.has(t.id);
                    const gap = model.gaps.has(t.id);
                    const span = spanOf(t);
                    const verdict = verdictFor(model.climate, t, gap);
                    const open = openType === t.id;
                    return (
                      <div key={t.id} id={`index-type-${t.id}`}>
                        {/* The stacked MOBILE row — same facts, readable size. */}
                        <div
                          className="sm:hidden"
                          style={{ padding: '10px 0', borderBottom: ROW_HAIRLINE, background: gap ? GAP_TINT : 'transparent' }}
                        >
                          <div className="flex items-center" style={{ gap: '10px' }}>
                            <span className="min-w-0 flex-1 flex items-baseline" style={{ gap: '8px' }}>
                              {gap && <span style={{ ...mono(6.5, ACCENT_DEEP), flexShrink: 0 }}>Gap</span>}
                              <button
                                type="button"
                                onClick={() => setDetail(t.id)}
                                className="text-left hover:opacity-70 transition-opacity min-w-0"
                                title={`${t.name} — open its page`}
                                style={{ ...serif(16, owned ? WALNUT : INK), background: 'transparent', lineHeight: 1.3, padding: 0 }}
                              >
                                {t.name}
                              </button>
                              {owned && (
                                <span title="On your rail" style={{ width: '6px', height: '6px', borderRadius: '999px', background: '#2e2115', flexShrink: 0, alignSelf: 'center' }} />
                              )}
                            </span>
                            <button
                              type="button"
                              onClick={() => onMakersForType(t)}
                              aria-label={`See the makers of ${t.name}`}
                              title={`Makers of ${t.name} →`}
                              className="transition-colors hover:border-[var(--color-accent,#a8712c)]"
                              style={{
                                width: '32px',
                                height: '32px',
                                flexShrink: 0,
                                border: `1px solid ${HAIRLINE}`,
                                background: 'transparent',
                                color: SECONDARY,
                                fontSize: '13px',
                                lineHeight: 1,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              →
                            </button>
                          </div>
                          {span ? (
                            <div style={{ marginTop: '7px' }}>
                              <SpanBar span={span} owned={owned} gap={gap} />
                            </div>
                          ) : (
                            <div style={{ ...mono(7.5, FAINTER), marginTop: '7px' }}>Judged by material and place</div>
                          )}
                          <div className="flex items-baseline justify-between" style={{ marginTop: '5px' }}>
                            <span style={{ ...mono(8, pieceVerdictColor(verdict)), whiteSpace: 'nowrap' }}>
                              {verdict ? VERDICT_TEXT[verdict] : '—'}
                            </span>
                            <span style={{ ...mono(11, SECONDARY), whiteSpace: 'nowrap' }}>{span ? `${span.lo}–${span.hi}°` : '—'}</span>
                          </div>
                        </div>
                        {/* The six-column run row — sm and up, unchanged. */}
                        <div
                          className={`${PIECE_GRID} items-center hidden sm:grid`}
                          style={{ gap: '0 14px', padding: '8.5px 0', borderBottom: ROW_HAIRLINE, background: gap ? GAP_TINT : 'transparent' }}
                        >
                          <span className="min-w-0 flex items-baseline" style={{ gap: '8px' }}>
                            {gap && <span style={{ ...mono(6.5, ACCENT_DEEP), flexShrink: 0 }}>Gap</span>}
                            <button
                              type="button"
                              onClick={() => setDetail(t.id)}
                              className="text-left hover:opacity-70 transition-opacity min-w-0"
                              title={`${t.name} — open its page`}
                              style={{
                                ...serif(15, owned ? WALNUT : INK),
                                background: 'transparent',
                                lineHeight: 1.3,
                                padding: 0,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {t.name}
                            </button>
                          </span>
                          <span className="flex justify-center" aria-hidden>
                            {owned && <span title="On your rail" style={{ width: '6px', height: '6px', borderRadius: '999px', background: '#2e2115', display: 'block' }} />}
                          </span>
                          {span ? (
                            <SpanBar span={span} owned={owned} gap={gap} />
                          ) : (
                            <span style={mono(7.5, FAINTER)}>Judged by material and place</span>
                          )}
                          <span style={{ ...mono(7.5, pieceVerdictColor(verdict)), textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {verdict ? VERDICT_TEXT[verdict] : '—'}
                          </span>
                          <span style={{ ...mono(10.5, SECONDARY), textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {span ? `${span.lo}–${span.hi}°` : '—'}
                          </span>
                          {/* The arrow hands off to the MAKERS face, filtered to
                              the houses known to make this type. */}
                          <button
                            type="button"
                            onClick={() => onMakersForType(t)}
                            aria-label={`See the makers of ${t.name}`}
                            title={`Makers of ${t.name} →`}
                            className="justify-self-end transition-colors hover:border-[var(--color-accent,#a8712c)]"
                            style={{
                              width: '24px',
                              height: '24px',
                              border: `1px solid ${HAIRLINE}`,
                              background: 'transparent',
                              color: SECONDARY,
                              fontSize: '12px',
                              lineHeight: 1,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            →
                          </button>
                        </div>
                        {open && <PieceEntry type={t} model={model} profile={profile} />}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ——— the foot line */}
          <div className="flex items-baseline justify-between flex-wrap" style={{ gap: '4px 16px', padding: '12px 0 0' }}>
            <span style={mono(7.5, FAINT)}>
              {shown.length} of {category?.total || 0} {catName} types shown · {filtersHeld === 0 ? 'no filters held' : `${filtersHeld} filter${filtersHeld === 1 ? '' : 's'} held`}
            </span>
            <span className="hidden sm:inline" style={mono(7.5, FAINTER)}>
              A name opens the piece's page · the arrow lists its makers
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MAKERS FACE — Beau's fifty, the reader's own additions, the full file.
// ---------------------------------------------------------------------------

type MakerRead = 'buy-first' | 'sound' | 'special-case' | 'not-for-you' | 'unread';

const READ_ORDER: MakerRead[] = ['buy-first', 'sound', 'special-case', 'not-for-you', 'unread'];

const READ_LABELS: Record<MakerRead, string> = {
  'buy-first': 'Buy first',
  sound: 'Sound',
  'special-case': 'Special case',
  'not-for-you': 'Not for you',
  unread: 'Unread',
};

const READ_BLURBS: Record<MakerRead, string> = {
  'buy-first': 'The house to go to before the others',
  sound: 'Will not disappoint; not the sharpest answer for you',
  'special-case': 'Right for one piece or one occasion only',
  'not-for-you': 'Wrong price, cut or climate for your wardrobe',
  unread: 'Added but not yet assessed',
};

const READ_COLORS: Record<MakerRead, string> = {
  'buy-first': ACCENT_DEEP,
  sound: SECONDARY,
  'special-case': '#96631f',
  'not-for-you': '#8a3a2e',
  unread: FAINT,
};

/** A stub row — imported but Beau hasn't pulled the file yet. */
function isStubProfile(p: BrandProfile): boolean {
  return (p.priceRangeLabel === '—' || !p.priceRangeLabel) && (p.materials || []).length === 0;
}

function readOf(entry: DirectoryEntry): MakerRead {
  if (isStubProfile(entry.profile)) return 'unread';
  switch (entry.rating) {
    case 'Excellent':
      return 'buy-first';
    case 'Reliable':
      return 'sound';
    case 'Inconsistent':
      return 'special-case';
    case 'Avoid':
      return 'not-for-you';
    default:
      return 'unread';
  }
}

/** “Mid (£150–400)” → “£150–400”; a bespoke label passes through whole. */
function priceNewOf(p: BrandProfile): string {
  const label = (p.priceRangeLabel || '').trim();
  if (!label || label === '—') return '—';
  const m = label.match(/\(([^)]+)\)/);
  return m ? m[1] : label;
}

function stockedOf(p: BrandProfile): 'ships-online' | 'travel' {
  return p.websiteUrl || verifiedBrandWebsiteUrl(p.brand) ? 'ships-online' : 'travel';
}

const STOCKED_LABELS: Record<'ships-online' | 'travel', string> = {
  'ships-online': 'Ships online',
  travel: 'Travel to buy',
};

// ---------------------------------------------------------------------------
// SOURCE — who put the row on the list. A house the reader named himself (or
// imported from a list) reads YOU; everything else on file is Beau's own
// recommendation against the reader's profile and ledger.
// ---------------------------------------------------------------------------

type MakerSource = 'beau' | 'you';

const SOURCE_LABELS: Record<MakerSource, string> = { beau: 'Beau', you: 'You' };

const SOURCE_TITLES: Record<MakerSource, string> = {
  beau: "Beau's own recommendation, read against your profile",
  you: 'Added by you — Beau researched the row and filled it in',
};

function sourceOf(entry: DirectoryEntry): MakerSource {
  return entry.source === 'user' ? 'you' : 'beau';
}

/** The SOURCE control — All · Beau · You, one segmented chip that sits with
 * the other filters above the table. */
function SourceChips({ held, onChange }: { held: MakerSource | 'all'; onChange: (next: MakerSource | 'all') => void }) {
  const options: Array<{ id: MakerSource | 'all'; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'beau', label: 'Beau' },
    { id: 'you', label: 'You' },
  ];
  return (
    <span className="inline-flex items-center flex-shrink-0" style={{ gap: '9px' }}>
      <span style={mono(8, FAINT)}>Source</span>
      <span className="inline-flex" role="group" aria-label="Who put the maker on the list">
        {options.map((o, i) => {
          const on = held === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onChange(o.id)}
              aria-pressed={on}
              className="transition-colors"
              style={{
                ...mono(8.5, on ? DEEP : SECONDARY),
                background: on ? 'rgba(168,113,44,0.12)' : 'transparent',
                border: `1px solid ${on ? ACCENT_DEEP : RULE}`,
                borderLeftWidth: i > 0 ? 0 : 1,
                padding: '8px 12px',
                whiteSpace: 'nowrap',
              }}
            >
              {o.label}
            </button>
          );
        })}
      </span>
    </span>
  );
}

/** maker name (lowercased) → the categories on file: the canon's own
 * type→maker links merged with the catalog's per-brand category map, so a
 * category filter always finds the full bench of verified makers. */
const MAKER_CATEGORIES: Map<string, Set<GarmentCategoryId>> = (() => {
  const map = new Map<string, Set<GarmentCategoryId>>();
  const add = (name: string, cat: GarmentCategoryId) => {
    const key = name.toLowerCase();
    const set = map.get(key) || new Set<GarmentCategoryId>();
    set.add(cat);
    map.set(key, set);
  };
  for (const t of INDEX_GARMENT_TYPES) {
    for (const m of t.makers) add(m, t.category);
  }
  for (const b of BRAND_DIRECTORY) {
    for (const id of brandCategoryIds(b.brand)) add(b.brand, id as GarmentCategoryId);
  }
  return map;
})();

/** The categories ONE maker is on file for — the merged map first; a maker
 * outside it (a reader's own addition, a Beau discovery) is read from its
 * own dossier: the reference piece and signature pieces are matched to the
 * garment-type canon. Cached per brand once a non-empty answer exists. */
const MAKER_CATS_CACHE = new Map<string, Set<GarmentCategoryId>>();
function makerCategorySet(p: BrandProfile): Set<GarmentCategoryId> {
  const key = p.brand.toLowerCase();
  const cached = MAKER_CATS_CACHE.get(key);
  if (cached) return cached;
  const set = new Set<GarmentCategoryId>(MAKER_CATEGORIES.get(key) || []);
  if (set.size === 0) {
    for (const text of [p.referenceFor || '', ...(p.signaturePieces || [])]) {
      if (!text) continue;
      const typeId = matchGarmentTypeId({ name: text });
      const t = typeId ? findGarmentType(typeId) : null;
      if (t && t.category !== 'other') set.add(t.category);
    }
  }
  // An empty read is never cached — a stub row gains its dossier later and
  // should gain its categories with it.
  if (set.size > 0) MAKER_CATS_CACHE.set(key, set);
  return set;
}

// ---------------------------------------------------------------------------
// FILTER BY PIECE — the hierarchical selector at the top of the Makers face
// (founder's request, August 2026): the same clothing categories The Hunt
// and The Ledger carry, each unfolding into the temperature ranges inside
// it, each of those unfolding into the individual piece types in
// alphabetical order. Multi-select at every level; any selection filters
// the maker rows to the houses that cut the selected pieces.
// ---------------------------------------------------------------------------

interface MakerTreeBand {
  band: TemperatureBand;
  types: GarmentType[];
}

interface MakerTreeCat {
  id: GarmentCategoryId;
  bands: MakerTreeBand[];
}

/** The canon read into the three-level tree once — categories in the app's
 * canonical order, bands coldest first, types alphabetical. */
const MAKER_TREE: MakerTreeCat[] = (() => {
  const order: GarmentCategoryId[] = [];
  const byCat = new Map<GarmentCategoryId, Map<TemperatureBand, GarmentType[]>>();
  for (const t of INDEX_GARMENT_TYPES) {
    if (!byCat.has(t.category)) {
      byCat.set(t.category, new Map());
      order.push(t.category);
    }
    const bands = byCat.get(t.category)!;
    const list = bands.get(t.band) || [];
    list.push(t);
    bands.set(t.band, list);
  }
  return order.map((id) => ({
    id,
    bands: [...byCat.get(id)!.entries()]
      .sort((a, b) => temperatureBandRank(a[0]) - temperatureBandRank(b[0]))
      .map(([band, types]) => ({ band, types: [...types].sort((a, b) => a.name.localeCompare(b.name)) })),
  }));
})();

function TreePill({
  on,
  label,
  onClick,
  quiet = false,
  size = 8.5,
}: {
  on: boolean;
  label: string;
  onClick: () => void;
  quiet?: boolean;
  /** The temperature pills carry the larger type — a range is a figure the
   * reader has to read, not a whisper. */
  size?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className="transition-colors flex-shrink-0"
      style={{
        ...mono(size, on ? '#5c3413' : quiet ? FAINT : SECONDARY),
        background: on ? 'rgba(168,113,44,0.14)' : 'transparent',
        border: `1px solid ${on ? ACCENT_DEEP : HAIRLINE}`,
        borderRadius: '999px',
        padding: '5px 11px',
        whiteSpace: 'nowrap',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

function TreeUnfold({ open, onClick, label }: { open: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-label={label}
      title={label}
      className="flex-shrink-0 hover:opacity-70 transition-opacity"
      style={{ ...mono(11, ACCENT), background: 'transparent', border: 'none', padding: '2px 4px', cursor: 'pointer', letterSpacing: 0 }}
    >
      {open ? '\u2212' : '+'}
    </button>
  );
}

function MakerTreeFilter({
  cats,
  bands,
  types,
  onCats,
  onBands,
  onTypes,
}: {
  cats: string[];
  bands: string[];
  types: string[];
  onCats: (next: string[]) => void;
  onBands: (next: string[]) => void;
  onTypes: (next: string[]) => void;
}) {
  const [openCats, setOpenCats] = useState<string[]>([]);
  const [openBands, setOpenBands] = useState<string[]>([]);
  const active = cats.length + bands.length + types.length > 0;
  return (
    <div style={{ padding: '10px 0 12px', borderBottom: `1px solid ${HAIRLINE}`, marginBottom: '14px' }}>
      <div className="flex items-baseline justify-between flex-wrap" style={{ gap: '6px 16px' }}>
        <span style={mono(8, FAINT)}>Filter by piece · category → temperature → type · multi-select</span>
        {active && (
          <button
            type="button"
            onClick={() => {
              onCats([]);
              onBands([]);
              onTypes([]);
            }}
            className="hover:opacity-70 transition-opacity"
            style={{ ...mono(8, ACCENT_DEEP), background: 'transparent', textDecoration: 'underline', textUnderlineOffset: '3px' }}
          >
            Clear the piece filter ×
          </button>
        )}
      </div>
      <div className="flex items-center flex-wrap" style={{ gap: '6px 8px', marginTop: '9px' }}>
        {MAKER_TREE.map((cat) => (
          <span key={cat.id} className="inline-flex items-center" style={{ gap: '2px' }}>
            <TreePill on={cats.includes(cat.id)} label={categoryName(cat.id)} onClick={() => onCats(toggleIn(cats, cat.id))} />
            <TreeUnfold
              open={openCats.includes(cat.id)}
              onClick={() => setOpenCats((cur) => toggleIn(cur, cat.id))}
              label={`${openCats.includes(cat.id) ? 'Fold' : 'Unfold'} ${categoryName(cat.id)} — its temperature ranges`}
            />
          </span>
        ))}
      </div>
      {MAKER_TREE.filter((cat) => openCats.includes(cat.id)).map((cat) => (
        <div key={cat.id} style={{ margin: '9px 0 0 14px', paddingLeft: '12px', borderLeft: `1px solid ${HAIRLINE}` }}>
          <span style={mono(9.5, FAINT)}>{categoryName(cat.id)} · by temperature range in °C</span>
          <div className="flex items-center flex-wrap" style={{ gap: '6px 8px', marginTop: '6px' }}>
            {cat.bands.map((b) => {
              const key = `${cat.id}|${b.band}`;
              return (
                <span key={key} className="inline-flex items-center" style={{ gap: '2px' }}>
                  <TreePill
                    on={bands.includes(key)}
                    quiet
                    size={10.5}
                    label={`${temperatureBandLabel(b.band)} · ${temperatureBandRange(b.band)}`}
                    onClick={() => onBands(toggleIn(bands, key))}
                  />
                  <TreeUnfold
                    open={openBands.includes(key)}
                    onClick={() => setOpenBands((cur) => toggleIn(cur, key))}
                    label={`${openBands.includes(key) ? 'Fold' : 'Unfold'} ${temperatureBandLabel(b.band)} — its piece types`}
                  />
                </span>
              );
            })}
          </div>
          {cat.bands
            .filter((b) => openBands.includes(`${cat.id}|${b.band}`))
            .map((b) => (
              <div key={`${cat.id}|${b.band}|types`} className="flex items-center flex-wrap" style={{ gap: '5px 6px', margin: '7px 0 2px 14px' }}>
                {b.types.map((t) => (
                  <TreePill key={t.id} on={types.includes(t.id)} quiet label={t.name} onClick={() => onTypes(toggleIn(types, t.id))} />
                ))}
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}

const MAKER_GRID = 'grid grid-cols-[26px_22px_20px_minmax(128px,190px)_minmax(88px,118px)_minmax(0,1fr)_96px_88px_84px_58px_20px]';

function FavStar({ active, onToggle, brand }: { active: boolean; onToggle: () => void; brand: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      aria-label={active ? `Unfavourite ${brand}` : `Favourite ${brand}`}
      title={active ? 'A favourite — tap to release' : 'Mark a favourite'}
      className="transition-opacity hover:opacity-70"
      style={{ background: 'transparent', padding: 0, fontSize: '13px', lineHeight: 1, color: active ? ACCENT_DEEP : FAINTER }}
    >
      {active ? '★' : '☆'}
    </button>
  );
}

function TickBox({ on, disabled, onToggle, brand }: { on: boolean; disabled: boolean; onToggle: () => void; brand: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled && !on}
      aria-pressed={on}
      aria-label={`${on ? 'Drop' : 'Hold'} ${brand} for comparison`}
      className="transition-colors"
      style={{
        width: '13px',
        height: '13px',
        border: `1px solid ${on ? ACCENT_DEEP : RULE}`,
        background: on ? ACCENT_DEEP : 'transparent',
        opacity: disabled && !on ? 0.4 : 1,
        padding: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {on && <span style={{ color: '#f6f0e5', fontSize: '9px', lineHeight: 1 }}>✓</span>}
    </button>
  );
}

/** The maker's full entry, opened inline by its name. */
function MakerEntry({ entry, categories, pick }: { entry: DirectoryEntry; categories: string[]; pick: BeauPick | null }) {
  const p = entry.profile;
  const site = p.websiteUrl || verifiedBrandWebsiteUrl(p.brand);
  const facts: Array<{ label: string; value: React.ReactNode }> = [
    { label: 'Makes', value: categories.length > 0 ? categories.join(' · ') : '—' },
    { label: 'Registers', value: p.registers.map((r) => FIELD_REGISTER_LABELS[r] || r).join(' · ') || '—' },
    { label: 'Materials', value: (p.materials || []).join(' · ') || '—' },
    { label: 'Construction', value: p.construction && p.construction !== '—' ? `${p.construction} · ${p.constructionQuality}` : '—' },
    { label: 'Quality', value: Number.isFinite(p.qualityScore) && !isStubProfile(p) ? `${p.qualityScore}/10` : '—' },
    { label: 'Signature pieces', value: (p.signaturePieces || []).slice(0, 4).join(' · ') || '—' },
    { label: 'Price', value: p.priceRangeLabel && p.priceRangeLabel !== '—' ? p.priceRangeLabel : '—' },
    { label: 'Sizing', value: p.sizingNote || '—' },
  ];
  return (
    <div style={{ padding: '12px 6px 16px', borderBottom: ROW_HAIRLINE, background: 'rgba(251,248,241,0.6)' }}>
      {pick && (
        <div style={{ margin: '0 0 10px', maxWidth: '70ch' }}>
          <span style={{ ...mono(7, ACCENT_DEEP), display: 'block', marginBottom: '3px' }}>Why Beau lists it · #{pick.rank}</span>
          <p style={{ ...body(13.5, INK), margin: 0 }}>{pick.why}</p>
        </div>
      )}
      {p.description && !isStubProfile(p) && <p style={{ ...body(13.5, INK), margin: '0 0 10px', maxWidth: '70ch' }}>{p.description}</p>}
      {entry.ratingNote && <p style={{ ...body(12.5, SECONDARY), margin: '0 0 10px', maxWidth: '70ch' }}>{entry.ratingNote}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" style={{ gap: '9px 26px' }}>
        {facts.map((f) => (
          <div key={f.label}>
            <span style={{ ...mono(7.5, FAINT), display: 'block', marginBottom: '2px' }}>{f.label}</span>
            <span style={body(13, INK)}>{f.value}</span>
          </div>
        ))}
      </div>
      {site && (
        <a href={site} target="_blank" rel="noreferrer" className="inline-block hover:opacity-70 transition-opacity" style={{ ...mono(8, ACCENT_DEEP), marginTop: '11px' }}>
          The maker's own site →
        </a>
      )}
    </div>
  );
}

/** The side-by-side reading of the held makers. */
function CompareSheet({
  entries,
  ledger,
  onClose,
}: {
  entries: DirectoryEntry[];
  ledger: Set<string>;
  onClose: () => void;
}) {
  const rows: Array<{ label: string; of: (e: DirectoryEntry) => string }> = [
    { label: 'Where', of: (e) => [e.profile.city, e.profile.country].filter((v) => v && v !== '—').join(', ') || '—' },
    { label: 'Since', of: (e) => (e.profile.founded ? String(e.profile.founded) : '—') },
    { label: 'What defines them', of: (e) => (isStubProfile(e.profile) ? '—' : e.profile.description || '—') },
    { label: 'Price, new', of: (e) => priceNewOf(e.profile) },
    { label: 'Stocked', of: (e) => STOCKED_LABELS[stockedOf(e.profile)] },
    { label: "Beau's read", of: (e) => READ_LABELS[readOf(e)] },
    { label: 'Source', of: (e) => SOURCE_LABELS[sourceOf(e)] },
    { label: 'Quality', of: (e) => (Number.isFinite(e.profile.qualityScore) && !isStubProfile(e.profile) ? `${e.profile.qualityScore}/10` : '—') },
    { label: 'Signature pieces', of: (e) => (e.profile.signaturePieces || []).slice(0, 3).join(' · ') || '—' },
    { label: 'On your rail', of: (e) => (ledger.has(e.profile.brand.toLowerCase()) ? 'Yes' : '—') },
  ];
  return (
    <div>
      <div className="flex items-center justify-between flex-wrap" style={{ gap: '8px 16px', padding: '4px 0 14px' }}>
        <span style={mono(8, FAINT)}>
          {entries.length} makers, side by side — the columns hold still so the rows can disagree
        </span>
        <MonoButton onClick={onClose}>← Back to the list</MonoButton>
      </div>
      <div className="overflow-x-auto">
        <div
          className="grid"
          style={{ gridTemplateColumns: `118px repeat(${entries.length}, minmax(170px, 1fr))`, minWidth: `${118 + entries.length * 170}px`, borderTop: `1px solid ${RULE}` }}
        >
          <span aria-hidden style={{ borderBottom: ROW_HAIRLINE, padding: '12px 8px 10px' }} />
          {entries.map((e) => (
            <span key={e.profile.brand} style={{ ...serif(19, WALNUT), borderBottom: ROW_HAIRLINE, padding: '12px 10px 10px', lineHeight: 1.2 }}>
              {e.profile.brand}
            </span>
          ))}
          {rows.map((row) => (
            <div key={row.label} className="contents">
              <span style={{ ...mono(7.5, FAINT), borderBottom: ROW_HAIRLINE, padding: '10px 8px' }}>{row.label}</span>
              {entries.map((e) => (
                <span key={e.profile.brand} style={{ ...body(13, INK), borderBottom: ROW_HAIRLINE, padding: '10px 10px', lineHeight: 1.45 }}>
                  {row.of(e)}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ——— column sorting — every head sorts, ascending then descending.

type SortCol = 'rank' | 'maker' | 'where' | 'defines' | 'price' | 'stocked' | 'read' | 'source';
interface SortState {
  col: SortCol;
  dir: 1 | -1;
}

function SortHead({
  label,
  col,
  sort,
  onSort,
}: {
  label: string;
  col: SortCol;
  sort: SortState;
  onSort: (col: SortCol) => void;
}) {
  const active = sort.col === col;
  return (
    <button
      type="button"
      onClick={() => onSort(col)}
      title={`Sort by ${label.toLowerCase()}`}
      className="text-left hover:opacity-70 transition-opacity"
      style={{ ...mono(7.5, active ? ACCENT_DEEP : FAINT), background: 'transparent', padding: 0, whiteSpace: 'nowrap' }}
    >
      {label}
      {active ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
    </button>
  );
}

function MakersFace({
  entries,
  metaRows,
  refreshMeta,
  model,
  pieces,
  profile,
  typeFilter,
  onClearTypeFilter,
  namesFilter,
  onClearNamesFilter,
}: {
  entries: DirectoryEntry[];
  metaRows: BrandIndexEntry[];
  refreshMeta: () => void;
  model: IndexModel;
  pieces: WardrobePiece[];
  profile: StyleProfile | null;
  typeFilter: GarmentType | null;
  onClearTypeFilter: () => void;
  /** “Ask Beau to find makers” lands here — the face opens filtered to
   * exactly the makers Beau just filed. Null when no hand-off is held. */
  namesFilter: string[] | null;
  onClearNamesFilter: () => void;
}) {
  const [find, setFind] = useState('');
  const [favesOnly, setFavesOnly] = useState(false);
  const [places, setPlaces] = useState<string[]>([]);
  const [bands, setBands] = useState<string[]>([]);
  const [makes, setMakes] = useState<string[]>([]);
  const [reads, setReads] = useState<string[]>([]);
  const [stocked, setStocked] = useState<string[]>([]);
  // SOURCE — the whole file, Beau's own recommendations, or your additions.
  const [sourceHeld, setSourceHeld] = useState<MakerSource | 'all'>('all');
  const [held, setHeld] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const [openMaker, setOpenMaker] = useState<string | null>(null);
  const [addValue, setAddValue] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showRest, setShowRest] = useState(false);
  const [sort, setSort] = useState<SortState>({ col: 'rank', dir: 1 });
  const fileRef = useRef<HTMLInputElement | null>(null);

  // FILTER BY PIECE — the three-level tree's selections (category ids,
  // `${categoryId}|${band}` keys, garment type ids).
  const [treeCats, setTreeCats] = useState<string[]>([]);
  const [treeBands, setTreeBands] = useState<string[]>([]);
  const [treeTypes, setTreeTypes] = useState<string[]>([]);

  // FIND 5 MORE MAKERS — the persistent search control (founder's request,
  // August 2026): every press asks Beau for five houses NOT yet on file and
  // files them in. The note under the toolbar says how it went.
  const [findingMore, setFindingMore] = useState(false);
  const [findNote, setFindNote] = useState<string | null>(null);
  const findMore = () => {
    if (findingMore) return;
    setFindingMore(true);
    setFindNote('Beau is out finding five more makers against your record\u2026');
    void findNewMakers({ profile, pieces })
      .then(({ added }) => {
        if (added.length > 0) {
          setFindNote(`${added.length} new maker${added.length === 1 ? '' : 's'} filed — ${added.join(' · ')}. Beau's note sits on each row.`);
        } else {
          setFindNote('Beau could not reach his references just now — try again in a moment.');
        }
      })
      .catch(() => setFindNote('Beau could not reach his references just now — try again in a moment.'))
      .finally(() => setFindingMore(false));
  };

  /** The makers the tree selection points at — null while nothing is held. */
  const treeSelection = useMemo(() => {
    if (treeCats.length + treeBands.length + treeTypes.length === 0) return null;
    const makerKeys = new Set<string>();
    const catSel = new Set(treeCats);
    const addTypes = (list: GarmentType[]) => {
      for (const t of list) for (const m of t.makers) makerKeys.add(m.toLowerCase());
    };
    for (const cat of MAKER_TREE) {
      if (catSel.has(cat.id)) for (const b of cat.bands) addTypes(b.types);
      for (const b of cat.bands) {
        if (treeBands.includes(`${cat.id}|${b.band}`)) addTypes(b.types);
      }
    }
    for (const id of treeTypes) {
      const t = findGarmentType(id);
      if (t) addTypes([t]);
    }
    return { makerKeys, cats: catSel };
  }, [treeCats, treeBands, treeTypes]);

  // BEAU'S FIFTY — the shortlist chosen for THIS reader (model-written,
  // with a deterministic per-reader ranking until the call lands).
  const fifty = useBeauFifty(profile, pieces, model, entries);
  const pickMap = useMemo(() => {
    const map = new Map<string, BeauPick>();
    for (const p of fifty.picks) map.set(p.brand.toLowerCase(), p);
    return map;
  }, [fifty]);

  // Optimistic favourite overrides — the star recolours while the ledger
  // write settles.
  const [favOverrides, setFavOverrides] = useState<Record<string, BrandIndexStatus>>({});

  const metaMap = useMemo(() => {
    const map = new Map<string, BrandIndexEntry>();
    for (const row of metaRows || []) {
      const key = (row.name || '').trim().toLowerCase();
      if (key && !map.has(key)) map.set(key, row);
    }
    return map;
  }, [metaRows]);

  const isFav = (brand: string): boolean => {
    const key = brand.toLowerCase();
    const override = favOverrides[key];
    if (override) return override === 'trusted';
    return metaMap.get(key)?.status === 'trusted';
  };

  const toggleFav = async (brand: string) => {
    const key = brand.toLowerCase();
    const next: BrandIndexStatus = isFav(brand) ? 'curious' : 'trusted';
    setFavOverrides((cur) => ({ ...cur, [key]: next }));
    try {
      const existing = (metaRows || []).find((r) => (r.name || '').trim().toLowerCase() === key);
      if (existing) await updateBrandIndexEntry(existing.id, { status: next });
      else await addBrandIndexEntry({ name: brand, url: null, logo_url: null, status: next, note: null, known_for: null, specialisations: null, signature_pieces: null });
    } catch (e) {
      console.warn('[Ethaion] favourite save failed (non-fatal):', e);
    } finally {
      refreshMeta();
    }
  };

  const ledgerBrands = useMemo(() => {
    const set = new Set<string>();
    for (const p of pieces) {
      const b = (p.brand || '').trim().toLowerCase();
      if (b) set.add(b);
    }
    return set;
  }, [pieces]);

  const placeOptions = useMemo(
    () =>
      [...new Set(entries.map((e) => e.profile.country).filter((c) => c && c !== '—') as string[])]
        .sort((a, b) => a.localeCompare(b))
        .map((c) => ({ id: c, label: c })),
    [entries],
  );

  const makesOptions = useMemo(() => model.categories.map((c) => ({ id: c.id, label: c.name })), [model.categories]);

  const favCount = useMemo(() => entries.filter((e) => isFav(e.profile.brand)).length, [entries, metaMap, favOverrides]);

  // The makers the held TYPE points at — the canon's verified makers when
  // it names any, its whole category otherwise.
  const typeMakerKeys = useMemo(() => {
    if (!typeFilter) return null;
    const keys = new Set(typeFilter.makers.map((m) => m.toLowerCase()));
    return keys;
  }, [typeFilter]);

  const namesFilterKeys = useMemo(
    () => (namesFilter && namesFilter.length > 0 ? new Set(namesFilter.map((n) => n.trim().toLowerCase())) : null),
    [namesFilter],
  );

  const shown = useMemo(() => {
    const q = find.trim().toLowerCase();
    return entries.filter((e) => {
      const p = e.profile;
      const key = p.brand.toLowerCase();
      if (namesFilterKeys && !namesFilterKeys.has(key)) return false;
      if (treeSelection) {
        const inTree =
          treeSelection.makerKeys.has(key) ||
          [...makerCategorySet(p)].some((c) => treeSelection.cats.has(c));
        if (!inTree) return false;
      }
      if (typeFilter) {
        // The arrow filters to the piece's CATEGORY — the canon's exact
        // type→maker names count as well, so a house named on the type's own
        // record is never dropped.
        const exact = typeMakerKeys ? typeMakerKeys.has(key) : false;
        if (!exact && !makerCategorySet(p).has(typeFilter.category)) return false;
      }
      if (favesOnly && !isFav(p.brand)) return false;
      if (q) {
        const hay = `${p.brand} ${p.city || ''} ${p.country || ''} ${p.description || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (places.length > 0 && (!p.country || !places.includes(p.country))) return false;
      if (bands.length > 0 && !bands.includes(p.priceBand)) return false;
      if (makes.length > 0) {
        const cats = makerCategorySet(p);
        if (!makes.some((m) => cats.has(m as GarmentCategoryId))) return false;
      }
      if (reads.length > 0 && !reads.includes(readOf(e))) return false;
      if (stocked.length > 0 && !stocked.includes(stockedOf(p))) return false;
      if (sourceHeld !== 'all' && sourceOf(e) !== sourceHeld) return false;
      return true;
    });
  }, [entries, find, favesOnly, places, bands, makes, reads, stocked, sourceHeld, metaMap, favOverrides, typeFilter, typeMakerKeys, treeSelection, namesFilterKeys]);

  const treeHeld = treeCats.length + treeBands.length + treeTypes.length;
  const filtersHeld =
    (favesOnly ? 1 : 0) + places.length + bands.length + makes.length + reads.length + stocked.length + (sourceHeld === 'all' ? 0 : 1) + (find.trim() ? 1 : 0) + treeHeld;

  // A held search, filter or type hand-off reads the WHOLE file, not just
  // the shortlist — nobody expects a search to miss a maker Beau didn't pick.
  const searchingWholeFile = filtersHeld > 0 || !!typeFilter || !!namesFilterKeys;

  const rankOf = (e: DirectoryEntry): number => {
    const pick = pickMap.get(e.profile.brand.toLowerCase());
    if (pick) return pick.rank;
    if (e.source === 'user') return 500;
    return 1000;
  };

  const comparatorOf = (col: SortCol) => {
    const whereOf = (e: DirectoryEntry) => `${e.profile.country && e.profile.country !== '—' ? e.profile.country : ''} ${e.profile.city || ''}`.trim();
    switch (col) {
      case 'maker':
        return (a: DirectoryEntry, b: DirectoryEntry) => a.profile.brand.localeCompare(b.profile.brand);
      case 'where':
        return (a: DirectoryEntry, b: DirectoryEntry) => whereOf(a).localeCompare(whereOf(b));
      case 'defines':
        return (a: DirectoryEntry, b: DirectoryEntry) => (a.profile.description || '').localeCompare(b.profile.description || '');
      case 'price':
        return (a: DirectoryEntry, b: DirectoryEntry) => PRICE_BAND_ORDER.indexOf(a.profile.priceBand) - PRICE_BAND_ORDER.indexOf(b.profile.priceBand);
      case 'stocked':
        return (a: DirectoryEntry, b: DirectoryEntry) => stockedOf(a.profile).localeCompare(stockedOf(b.profile));
      case 'read':
        return (a: DirectoryEntry, b: DirectoryEntry) => READ_ORDER.indexOf(readOf(a)) - READ_ORDER.indexOf(readOf(b));
      case 'source':
        return (a: DirectoryEntry, b: DirectoryEntry) => sourceOf(a).localeCompare(sourceOf(b));
      default:
        return (a: DirectoryEntry, b: DirectoryEntry) => rankOf(a) - rankOf(b);
    }
  };

  const onSort = (col: SortCol) => {
    setSort((cur) => (cur.col === col ? { col, dir: cur.dir === 1 ? -1 : 1 } : { col, dir: 1 }));
  };

  // The three readings of the filtered file: the shortlist, the reader's
  // own additions, and the rest of the directory (on demand).
  const picksShown = useMemo(
    () => shown.filter((e) => e.source !== 'user' && pickMap.has(e.profile.brand.toLowerCase())),
    [shown, pickMap],
  );
  const userShown = useMemo(() => shown.filter((e) => e.source === 'user'), [shown]);
  const restShown = useMemo(
    () => shown.filter((e) => e.source !== 'user' && !pickMap.has(e.profile.brand.toLowerCase())),
    [shown, pickMap],
  );

  // Grouped (shortlist · yours · the rest) only in the default rank order;
  // any other sort reads the visible rows as ONE flat sorted table.
  const grouped = sort.col === 'rank' && !searchingWholeFile;
  const flatRows = useMemo(() => {
    const base = grouped ? [] : [...picksShown, ...userShown, ...(searchingWholeFile || showRest ? restShown : [])];
    const cmp = comparatorOf(sort.col);
    return base.sort((a, b) => sort.dir * cmp(a, b) || a.profile.brand.localeCompare(b.profile.brand));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grouped, picksShown, userShown, restShown, searchingWholeFile, showRest, sort, pickMap]);

  const sortedPicks = useMemo(() => {
    const list = [...picksShown].sort((a, b) => rankOf(a) - rankOf(b));
    return sort.dir === -1 && sort.col === 'rank' ? list.reverse() : list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picksShown, sort, pickMap]);

  const reset = () => {
    setFind('');
    setFavesOnly(false);
    setPlaces([]);
    setBands([]);
    setMakes([]);
    setReads([]);
    setStocked([]);
    setSourceHeld('all');
    setTreeCats([]);
    setTreeBands([]);
    setTreeTypes([]);
    onClearTypeFilter();
    onClearNamesFilter();
  };

  const toggleHeld = (brand: string) => {
    setHeld((cur) => {
      if (cur.includes(brand)) return cur.filter((b) => b !== brand);
      if (cur.length >= 4) return cur;
      return [...cur, brand];
    });
  };

  const heldEntries = useMemo(() => held.map((b) => entries.find((e) => e.profile.brand === b)).filter(Boolean) as DirectoryEntry[], [held, entries]);

  /** ADD YOUR OWN — a name or a pasted link; files instantly, and Beau's
   * research pass (web-grounded) fills country, speciality, price point
   * and the rest of the dossier in behind it. */
  const addMaker = async () => {
    const raw = addValue.trim();
    if (!raw || addBusy) return;
    const name = looksLikeUrl(raw) ? nameFromUrl(normalizeSiteUrl(raw) || raw) : raw;
    if (!name) {
      setNotice('That didn\u2019t read as a maker\u2019s name or link — try again.');
      return;
    }
    setAddBusy(true);
    setNotice(null);
    try {
      const { added, skipped } = await addDirectoryBrandStubs([name]);
      if (added.length > 0) {
        setNotice(`${added[0]} added — Beau is researching the maker and filling the row in.`);
        void backfillDirectoryBrandStubs().catch(() => undefined);
      } else if (skipped.length > 0) {
        setNotice(`${name} is already on the list.`);
      }
      setAddValue('');
    } catch (e) {
      console.warn('[Ethaion] add maker failed:', e);
      setNotice('That maker could not be added — try again in a moment.');
    } finally {
      setAddBusy(false);
    }
  };

  /** UPLOAD A LIST — .csv / .xlsx / .txt, first column read as names. */
  const onFile = async (file: File | null) => {
    if (!file) return;
    setAddBusy(true);
    setNotice(null);
    try {
      const parsed = await parseBrandImportFile(file);
      if (parsed.length === 0) {
        setNotice('Nothing readable in that file — one maker per line, or in the first column.');
      } else {
        const { added, skipped } = await addDirectoryBrandStubs(parsed.map((e) => e.name));
        setNotice(`${added.length} added${skipped.length > 0 ? ` · ${skipped.length} already on the list` : ''} — Beau is pulling the files.`);
        if (added.length > 0) void backfillDirectoryBrandStubs().catch(() => undefined);
      }
    } catch (e: any) {
      setNotice(e?.message || 'That file could not be read.');
    } finally {
      setAddBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const renderRow = (e: DirectoryEntry) => {
    const p = e.profile;
    const key = p.brand.toLowerCase();
    const read = readOf(e);
    const src = sourceOf(e);
    const onLedger = ledgerBrands.has(key);
    const open = openMaker === p.brand;
    const pick = pickMap.get(key) || null;
    const cats = [...makerCategorySet(p)].map((c) => model.categories.find((mc) => mc.id === c)?.name || c);
    return (
      <div key={p.brand}>
        <div className={`${MAKER_GRID} items-center`} style={{ gap: '0 12px', padding: '11px 0', borderBottom: ROW_HAIRLINE }}>
          <span style={{ ...mono(8, pick ? ACCENT_DEEP : FAINTER), whiteSpace: 'nowrap' }}>
            {pick ? pick.rank : ''}
          </span>
          <TickBox on={held.includes(p.brand)} disabled={held.length >= 4} onToggle={() => toggleHeld(p.brand)} brand={p.brand} />
          <FavStar active={isFav(p.brand)} onToggle={() => void toggleFav(p.brand)} brand={p.brand} />
          <span className="min-w-0">
            <button
              type="button"
              onClick={() => openMakerSheet(p.brand)}
              title={`${p.brand} — open the maker's file`}
              className="text-left hover:opacity-70 transition-opacity"
              style={{ ...serif(16, WALNUT), background: 'transparent', padding: 0, lineHeight: 1.25, textDecoration: 'underline', textDecorationColor: RULE, textUnderlineOffset: '3.5px' }}
            >
              {p.brand}
            </button>
            {onLedger && <span style={{ ...mono(6.5, ACCENT_DEEP), display: 'block', marginTop: '3px' }}>On your rail</span>}
          </span>
          <span className="min-w-0">
            <span style={{ ...body(13, INK), display: 'block', lineHeight: 1.3 }}>{p.city || (p.country !== '—' ? p.country : '—') || '—'}</span>
            {p.founded && <span style={{ ...mono(6.5, FAINT), display: 'block', marginTop: '3px' }}>Since {p.founded}</span>}
          </span>
          <span className="min-w-0">
            <span style={{ ...body(13.5, INK), display: 'block', lineHeight: 1.4 }}>
              {isStubProfile(p) ? <span style={{ color: FAINT }}>Beau is pulling the file on this maker.</span> : p.description}
            </span>
            {/* Beau's own justification — written for THIS reader. */}
            {pick && (
              <span style={{ ...body(12.5, ACCENT_DEEP), display: 'block', marginTop: '3px', lineHeight: 1.4, fontStyle: 'italic' }}>
                {pick.why}
              </span>
            )}
          </span>
          <span style={{ ...mono(8, SECONDARY), whiteSpace: 'nowrap' }}>{priceNewOf(p)}</span>
          <span style={body(12.5, SECONDARY)}>{STOCKED_LABELS[stockedOf(p)]}</span>
          <span style={mono(7.5, READ_COLORS[read])}>{READ_LABELS[read]}</span>
          <span title={SOURCE_TITLES[src]} style={{ ...mono(7.5, src === 'you' ? ACCENT_DEEP : SECONDARY), whiteSpace: 'nowrap' }}>
            {SOURCE_LABELS[src]}
          </span>
          <button
            type="button"
            onClick={() => hideIndexMaker(p.brand)}
            aria-label={`Remove ${p.brand} from the list`}
            title="Remove from the list — restorable below"
            className="justify-self-end hover:opacity-70 transition-opacity"
            style={{ ...mono(9, FAINTER), background: 'transparent', padding: '2px 4px' }}
          >
            ×
          </button>
        </div>
        {open && <MakerEntry entry={e} categories={cats} pick={pick} />}
      </div>
    );
  };

  const sectionHead = (label: string, sub?: string) => (
    <div className="flex items-baseline justify-between flex-wrap" style={{ gap: '4px 16px', padding: '16px 0 8px', borderBottom: `1px solid ${RULE}` }}>
      <span style={mono(8, ACCENT_DEEP)}>{label}</span>
      {sub && <span style={mono(7.5, FAINTER)}>{sub}</span>}
    </div>
  );

  /** ADD YOUR OWN MAKER — its own section, set off from the find row above
   * it: the label on the left, the two ways in side by side (a name or a
   * pasted link; a whole list uploaded at once), the descriptor under them,
   * and the status line while Beau is out researching. */
  const addMakerSection = (
    <section
      aria-label="Add your own maker"
      style={{
        border: `1px solid ${HAIRLINE}`,
        borderLeft: `2px solid ${ACCENT_DEEP}`,
        background: 'rgba(168,113,44,0.045)',
        padding: '14px 16px 15px',
        marginBottom: '6px',
      }}
    >
      <div className="grid grid-cols-1 md:grid-cols-[146px_minmax(0,1fr)]" style={{ gap: '9px 18px' }}>
        <span style={{ ...mono(8, ACCENT_DEEP), paddingTop: '11px' }}>Add your own maker</span>
        <div className="min-w-0">
          <div className="flex items-center flex-wrap" style={{ gap: '10px 12px' }}>
            <label
              className="flex items-center min-w-0 flex-1"
              style={{ border: `1px solid ${RULE}`, padding: '9px 13px', maxWidth: '360px', background: PAPER }}
            >
              <input
                type="text"
                value={addValue}
                onChange={(e) => setAddValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void addMaker();
                }}
                placeholder='a name, or paste a link — “Sartoria Ripense”, “drakes.com”'
                className="min-w-0 flex-1 bg-transparent outline-none"
                style={{ ...body(14, INK), lineHeight: 1.3 }}
              />
            </label>
            <MonoButton solid disabled={addBusy || !addValue.trim()} onClick={() => void addMaker()}>
              {addBusy ? 'Adding…' : 'Add to the list'}
            </MonoButton>
            <MonoButton disabled={addBusy} onClick={() => fileRef.current?.click()} title="One maker per line, or in the first column">
              Upload a list · CSV, XLSX, TXT
            </MonoButton>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls,.txt,text/plain,text/csv"
              className="hidden"
              onChange={(e) => void onFile(e.target.files?.[0] || null)}
            />
          </div>
          <p style={{ ...body(12.5, FAINT), margin: '9px 0 0', maxWidth: '74ch' }}>
            Name a maker or paste their link and Beau researches them — country, speciality, price point, what they're known for — and files the full row himself.
          </p>
          {notice && (
            <div
              aria-live="polite"
              className="inline-flex items-center"
              style={{
                ...mono(8, DEEP),
                gap: '9px',
                marginTop: '11px',
                border: `1px solid ${ACCENT_DEEP}`,
                background: 'rgba(168,113,44,0.12)',
                padding: '7px 11px',
                lineHeight: 1.5,
              }}
            >
              <span aria-hidden style={{ width: '5px', height: '5px', borderRadius: '999px', background: ACCENT_DEEP, flexShrink: 0 }} />
              {notice}
            </div>
          )}
        </div>
      </div>
    </section>
  );

  const columnHeads = (
    <div className={`${MAKER_GRID} items-end`} style={{ gap: '0 12px', borderBottom: `1px solid ${RULE}`, paddingBottom: '6px' }}>
      <SortHead label="#" col="rank" sort={sort} onSort={onSort} />
      <span aria-hidden />
      <span aria-hidden />
      <SortHead label="Maker" col="maker" sort={sort} onSort={onSort} />
      <SortHead label="Where" col="where" sort={sort} onSort={onSort} />
      <SortHead label="What defines them" col="defines" sort={sort} onSort={onSort} />
      <SortHead label="Price, new" col="price" sort={sort} onSort={onSort} />
      <SortHead label="Stocked" col="stocked" sort={sort} onSort={onSort} />
      <SortHead label="Beau's read" col="read" sort={sort} onSort={onSort} />
      <SortHead label="Source" col="source" sort={sort} onSort={onSort} />
      <span aria-hidden />
    </div>
  );

  return (
    <div>
      {/* ——— FILTER BY PIECE — the three-level selector at the top:
          category → temperature range → piece type, multi-select. */}
      <MakerTreeFilter
        cats={treeCats}
        bands={treeBands}
        types={treeTypes}
        onCats={setTreeCats}
        onBands={setTreeBands}
        onTypes={setTreeTypes}
      />

      {/* ——— the “Ask Beau to find makers” landing — the list is filtered
          to exactly the houses Beau just filed. */}
      {namesFilter && namesFilter.length > 0 && (
        <div
          className="flex items-center justify-between flex-wrap"
          style={{ gap: '8px 16px', padding: '10px 13px', marginBottom: '4px', border: `1px solid ${ACCENT_DEEP}`, background: 'rgba(168,113,44,0.08)' }}
        >
          <span style={mono(8, DEEP)}>
            Beau's new makers — {namesFilter.length} just filed · {namesFilter.join(' · ')}
          </span>
          <button
            type="button"
            onClick={onClearNamesFilter}
            className="hover:opacity-70 transition-opacity"
            style={{ ...mono(8, ACCENT_DEEP), background: 'transparent', textDecoration: 'underline', textUnderlineOffset: '3px' }}
          >
            Show every maker ×
          </button>
        </div>
      )}

      {/* ——— the hand-off banner — a piece's arrow filtered this list */}
      {typeFilter && (
        <div
          className="flex items-center justify-between flex-wrap"
          style={{ gap: '8px 16px', padding: '10px 13px', marginBottom: '4px', border: `1px solid ${ACCENT_DEEP}`, background: 'rgba(168,113,44,0.08)' }}
        >
          <span style={mono(8, DEEP)}>
            Makers of {(model.categories.find((c) => c.id === typeFilter.category)?.name || typeFilter.category).toLowerCase()} — via the{' '}
            {typeFilter.name} · {shown.length} on file
          </span>
          <button
            type="button"
            onClick={onClearTypeFilter}
            className="hover:opacity-70 transition-opacity"
            style={{ ...mono(8, ACCENT_DEEP), background: 'transparent', textDecoration: 'underline', textUnderlineOffset: '3px' }}
          >
            Clear ×
          </button>
        </div>
      )}

      {/* ——— the filter-state line */}
      <StateLine
        text={
          filtersHeld === 0 && !typeFilter
            ? `Beau's fifty, chosen for you — ${entries.length} makers on file behind them`
            : `${filtersHeld + (typeFilter ? 1 : 0)} filter${filtersHeld + (typeFilter ? 1 : 0) === 1 ? '' : 's'} held — ${shown.length} of ${entries.length} makers`
        }
        active={filtersHeld > 0 || !!typeFilter}
        onReset={reset}
      />

      {/* ——— the find line + drop-downs */}
      <div className="flex items-center flex-wrap" style={{ gap: '10px 12px', paddingBottom: '16px' }}>
        <FindLine value={find} onChange={setFind} placeholder='a maker — “Rubinacci”, “Naples”' maxWidth="320px" />
        <button
          type="button"
          onClick={() => setFavesOnly((f) => !f)}
          aria-pressed={favesOnly}
          className="transition-colors flex-shrink-0"
          style={{
            ...mono(8.5, favesOnly ? DEEP : SECONDARY),
            background: favesOnly ? 'rgba(168,113,44,0.12)' : 'transparent',
            border: `1px solid ${favesOnly ? ACCENT_DEEP : RULE}`,
            padding: '8px 12px',
            whiteSpace: 'nowrap',
          }}
        >
          ★ Favourites {favCount > 0 ? favCount : ''}
        </button>
        <FilterMenu label="Place" options={placeOptions} active={places} onToggle={(id) => setPlaces((cur) => toggleIn(cur, id))} />
        <FilterMenu
          label="Price"
          options={[
            { id: 'accessible', label: '£ Accessible' },
            { id: 'mid', label: '££ Mid-range' },
            { id: 'upper-mid', label: '£££ Premium' },
            { id: 'luxury', label: '££££ Luxury' },
          ]}
          active={bands}
          onToggle={(id) => setBands((cur) => toggleIn(cur, id))}
        />
        <FilterMenu label="Makes" options={makesOptions} active={makes} onToggle={(id) => setMakes((cur) => toggleIn(cur, id))} />
        <FilterMenu label="Beau's read" options={READ_ORDER.map((r) => ({ id: r, label: READ_LABELS[r] }))} active={reads} onToggle={(id) => setReads((cur) => toggleIn(cur, id))} />
        <FilterMenu
          label="Stocked"
          options={[
            { id: 'ships-online', label: 'Ships online' },
            { id: 'travel', label: 'Travel to buy' },
          ]}
          active={stocked}
          onToggle={(id) => setStocked((cur) => toggleIn(cur, id))}
        />
        {/* SOURCE — the whole file, Beau's own picks, or your own additions. */}
        <SourceChips held={sourceHeld} onChange={setSourceHeld} />
      </div>

      {/* ——— ADD YOUR OWN MAKER — its own section, directly under the find
          row: a name or a link, or a whole list at once. */}
      {addMakerSection}

      {/* ——— the verdict legend */}
      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
        style={{ gap: '9px 30px', padding: '14px 0 16px', borderTop: `1px solid ${HAIRLINE}`, borderBottom: `1px solid ${HAIRLINE}` }}
      >
        {READ_ORDER.map((r) => (
          <div key={r} className="flex items-baseline" style={{ gap: '12px' }}>
            <span style={{ ...mono(7.5, READ_COLORS[r]), flexShrink: 0, minWidth: '76px' }}>{READ_LABELS[r]}</span>
            <span style={body(13, SECONDARY)}>{READ_BLURBS[r]}</span>
          </div>
        ))}
      </div>

      {/* ——— the count + compare toolbar */}
      <div className="flex items-center justify-between flex-wrap" style={{ gap: '8px 16px', padding: '13px 0' }}>
        <span style={mono(7.5, FAINT)}>
          {grouped
            ? `${sortedPicks.length} chosen · ${userShown.length} of your own · ${restShown.length} more on file`
            : `${flatRows.length} makers shown`}
          {' · column heads sort'}
        </span>
        <span className="flex items-center flex-wrap" style={{ gap: '8px 14px' }}>
          <MonoButton solid disabled={findingMore} onClick={findMore}>
            {findingMore ? 'Beau is searching…' : 'Find 5 more makers'}
          </MonoButton>
          <span style={mono(7.5, FAINTER)}>
            Select up to four · {held.length} held
          </span>
          {held.length > 0 && (
            <button type="button" onClick={() => { setHeld([]); setComparing(false); }} className="hover:opacity-70 transition-opacity" style={{ ...mono(7.5, SECONDARY), background: 'transparent', textDecoration: 'underline' }}>
              Clear selection
            </button>
          )}
          {!comparing && (
            <MonoButton disabled={held.length < 2} onClick={() => setComparing(true)}>
              {held.length >= 2 ? `Compare ${held.length} makers` : 'Select two or more to compare'}
            </MonoButton>
          )}
        </span>
      </div>

      {findNote && (
        <p aria-live="polite" style={{ ...body(12.5, ACCENT_DEEP), margin: '0 0 10px', maxWidth: '90ch' }}>
          {findNote}
        </p>
      )}

      {comparing && heldEntries.length >= 2 ? (
        <CompareSheet entries={heldEntries} ledger={ledgerBrands} onClose={() => setComparing(false)} />
      ) : shown.length === 0 ? (
        <p style={{ ...body(14, SECONDARY), padding: '20px 0' }}>No maker on file answers this combination — reset the filters to see every house.</p>
      ) : (
        <div className="overflow-x-auto">
          <div style={{ minWidth: '960px' }}>
            {grouped ? (
              <>
                {/* ——— BEAU'S FIFTY — the shortlist, strongest first */}
                {sectionHead(
                  `Beau's fifty · chosen against your profile and your rail`,
                  fifty.generated ? 'Written by Beau for you — re-drawn when your wardrobe or dossier changes' : 'Drawn from your record — Beau is refining the order',
                )}
                {columnHeads}
                {sortedPicks.length === 0 ? (
                  <p style={{ ...body(13.5, SECONDARY), padding: '14px 0' }}>None of the fifty answer the held filters — the rest of the file is below.</p>
                ) : (
                  sortedPicks.map(renderRow)
                )}

                {/* ——— YOUR OWN ADDITIONS — filed by the section at the top */}
                {sectionHead('Your makers', 'Added by you — Beau researches each one and fills the row')}
                {userShown.length > 0 ? (
                  userShown.map(renderRow)
                ) : (
                  <p style={{ ...body(13.5, SECONDARY), padding: '13px 0' }}>
                    None of your own yet — name a maker in ADD YOUR OWN MAKER at the top of the page and Beau files the row.
                  </p>
                )}

                {/* ——— THE REST OF THE FILE — on demand */}
                {restShown.length > 0 && (
                  <div style={{ padding: '16px 0 0' }}>
                    <MonoButton onClick={() => setShowRest((s) => !s)} dim={!showRest}>
                      {showRest ? 'Hide the rest of the file ↑' : `The rest of the file · ${restShown.length} more makers ↓`}
                    </MonoButton>
                    {showRest && <div style={{ paddingTop: '10px' }}>{[...restShown].sort((a, b) => a.profile.brand.localeCompare(b.profile.brand)).map(renderRow)}</div>}
                  </div>
                )}
              </>
            ) : (
              <>
                {columnHeads}
                {flatRows.map(renderRow)}
              </>
            )}
          </div>
        </div>
      )}

      {/* ——— removed rows stay restorable, always */}
      {model.hiddenMakers.size > 0 && !comparing && (
        <div style={{ ...mono(7.5, FAINT), paddingTop: '13px' }}>
          {model.hiddenMakers.size} maker{model.hiddenMakers.size === 1 ? '' : 's'} removed by you ·{' '}
          <button type="button" onClick={() => restoreHiddenIndex('makers')} className="hover:opacity-70 transition-opacity" style={{ ...mono(7.5, ACCENT_DEEP), background: 'transparent', textDecoration: 'underline' }}>
            Restore them →
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// THE TAB — one header, two faces.
// ---------------------------------------------------------------------------

export function IndexTab({ pieces, profile }: { pieces: WardrobePiece[]; profile: StyleProfile | null }) {
  usePlexMono();
  const model = useIndexModel(pieces);
  // Each piece's REAL temperature range — the stored piece_warmth rows and
  // the materials they were inferred from — feeds the band ledger, so the
  // per-band counts are read from the pieces themselves, never authored.
  const [warmth, setWarmth] = useState<Record<number, PieceWarmth>>({});
  const [materials, setMaterials] = useState<Record<number, string>>({});
  useEffect(() => {
    let alive = true;
    fetchPieceWarmth()
      .then((rows) => {
        if (alive) setWarmth(rows);
      })
      .catch(() => undefined);
    fetchMaterials()
      .then((rows) => {
        if (alive) setMaterials(rows);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [pieces]);
  const [face, setFace] = useState<'pieces' | 'makers'>('pieces');
  // The Pieces→Makers hand-off: a piece row's arrow holds its type here so
  // the Makers face opens filtered to the houses that make it.
  const [typeFilter, setTypeFilter] = useState<GarmentType | null>(null);

  const onMakersForType = (t: GarmentType) => {
    setTypeFilter(t);
    setFace('makers');
  };

  // “Ask Beau to find makers” (piece detail page) lands HERE: the Makers
  // face comes forward filtered to exactly the houses Beau just filed.
  // Dispatched AND parked like the other deep links, so a lazy Index still
  // catches it on first mount.
  const [makerNamesFilter, setMakerNamesFilter] = useState<string[] | null>(null);
  useEffect(() => {
    const applyTarget = (names: string[] | null | undefined) => {
      const clean = (names || []).map((n) => String(n || '').trim()).filter(Boolean);
      setFace('makers');
      setMakerNamesFilter(clean.length > 0 ? clean : null);
    };
    const parked = peekIndexMakersTarget();
    if (parked) {
      takeIndexMakersTarget();
      applyTarget(parked.names);
    }
    const onOpen = (e: Event) => {
      takeIndexMakersTarget();
      applyTarget(((e as CustomEvent).detail?.names || []) as string[]);
    };
    window.addEventListener(INDEX_OPEN_MAKERS_EVENT, onOpen);
    return () => window.removeEventListener(INDEX_OPEN_MAKERS_EVENT, onOpen);
  }, []);

  // The Edit's “→ The Index” deep link always lands on the Pieces face; the
  // face itself opens the type's entry (PiecesFace above).
  useEffect(() => {
    if (peekIndexTarget()) setFace('pieces');
    const onOpen = () => setFace('pieces');
    window.addEventListener(INDEX_OPEN_TYPE_EVENT, onOpen);
    return () => window.removeEventListener(INDEX_OPEN_TYPE_EVENT, onOpen);
  }, []);

  // Tapping the tab label returns to the Pieces face — the tab's home —
  // and drops any maker filter a hand-off left behind.
  useEffect(() => {
    const onTabHome = (e: Event) => {
      if ((e as CustomEvent).detail?.tab !== 'index') return;
      setFace('pieces');
      setTypeFilter(null);
      setMakerNamesFilter(null);
    };
    window.addEventListener('ethaion:tab-home', onTabHome);
    return () => window.removeEventListener('ethaion:tab-home', onTabHome);
  }, []);

  // The maker directory — the catalog seed merged with persisted additions.
  // The limit reads well past any realistic file so no row is ever dropped.
  const { data: addedRows, refresh } = window.useWorkspaceDB<DirectoryBrandRow>('hunt_directory_brands', {
    orderBy: { column: 'created_at', direction: 'desc' },
    limit: 500,
  });
  useEffect(() => {
    const onChanged = () => refresh();
    window.addEventListener(DISCOVER_BRANDS_EVENT, onChanged);
    return () => window.removeEventListener(DISCOVER_BRANDS_EVENT, onChanged);
  }, [refresh]);

  // The personal per-brand files — favourites live here (status 'trusted').
  const { data: metaRows, refresh: refreshMeta } = window.useWorkspaceDB<BrandIndexEntry>('brand_index', {
    orderBy: { column: 'created_at', direction: 'desc' },
    limit: 500,
  });
  useEffect(() => {
    const onChanged = () => refreshMeta();
    window.addEventListener(BRAND_INDEX_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(BRAND_INDEX_CHANGED_EVENT, onChanged);
  }, [refreshMeta]);

  // Imported stubs get their full dossiers filled in quietly.
  useEffect(() => {
    void backfillDirectoryBrandStubs().catch(() => undefined);
  }, [addedRows]);

  const entries = useMemo(
    () => mergeDirectory(addedRows).filter((e) => !model.hiddenMakers.has(e.profile.brand.toLowerCase())),
    [addedRows, model.hiddenMakers],
  );

  return (
    <div>
      {/* The floating breadcrumb's read of this tab — ETHAION / THE INDEX /
          [face]. A piece's own detail page publishes its deeper trail
          through its CrumbHeader and wins over this while it is open. */}
      <CrumbPublisher
        segs={[
          { label: 'Ethaion', onClick: () => goToEthaionTab('wardrobe') },
          { label: 'The Index', onClick: () => setFace('pieces') },
          { label: face === 'pieces' ? 'Pieces' : 'Makers' },
        ]}
      />

      {/* ——— the shared tab masthead (tab-header.tsx), with the face toggle
          in its aside — the same block, indentation and rule every other
          primary tab carries. */}
      <TabHeader
        title="The Index"
        standfirst={
          face === 'pieces'
            ? `Every garment type, read against ${model.climate.city ? `your ${model.climate.city} climate` : 'your climate'}.`
            : 'The houses Beau would send you to first, read against your record.'
        }
        aside={
          <SubTabs
            items={[
              { id: 'pieces' as const, label: `Pieces · ${model.typeTotal} types` },
              { id: 'makers' as const, label: `Makers · ${entries.length} on file` },
            ]}
            active={face}
            onChange={setFace}
            ariaLabel="What the list is of"
            variant="sub-tab--index-face"
            className="max-w-full"
          />
        }
      />

      <div className="px-6 sm:px-10 py-8 max-w-[1180px] mx-auto w-full pb-28">
        {/* Both faces stay mounted — filters, selections and scroll survive
            the toggle; only one shows. */}
        <div style={{ display: face === 'pieces' ? undefined : 'none' }}>
          <PiecesFace model={model} pieces={pieces} profile={profile} warmth={warmth} materials={materials} onMakersForType={onMakersForType} />
        </div>
        <div style={{ display: face === 'makers' ? undefined : 'none' }}>
          <MakersFace
            entries={entries}
            metaRows={metaRows || []}
            refreshMeta={refreshMeta}
            model={model}
            pieces={pieces}
            profile={profile}
            typeFilter={typeFilter}
            onClearTypeFilter={() => setTypeFilter(null)}
            namesFilter={makerNamesFilter}
            onClearNamesFilter={() => setMakerNamesFilter(null)}
          />
        </div>
      </div>
    </div>
  );
}
