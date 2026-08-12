/**
 * THE INDEX — full rebuild from the founder's reference screenshots
 * (August 2026).
 *
 * One page, two FACES under one toggle (top right):
 *
 *  · PIECES — the garment-type reference read BY TEMPERATURE. A category
 *    strip (the eleven canonical categories, counts beside the names), a
 *    temperature-band histogram (click a band to hold it), a Find line with
 *    Formality / Occasion / Run drop-downs, and the reading itself: a left
 *    rail explaining the column, then one row per type — name, ownership
 *    dot, its span drawn as a bar on one shared 0–30° track (filled dark =
 *    you own one, grey = you don't, dashed = a gap your board names), the
 *    verdict for your city, the span figure and an arrow that opens the
 *    type's own inline entry.
 *
 *  · MAKERS — every house on file as one table: MAKER · WHERE · WHAT
 *    DEFINES THEM · PRICE, NEW · STOCKED · BEAU'S READ. An Add-a-maker line
 *    (name or link, plus a CSV/XLSX/TXT list upload), a Find line with
 *    Favourites / Place / Price / Makes / Beau's read / Stocked filters,
 *    the five-verdict legend, and a select-to-compare flow (up to four,
 *    read side by side). A name opens the full entry inline; the × on a
 *    row removes it (restorable, never destructive).
 *
 * Everything on the page is REAL data: the taxonomy (garment-types.ts +
 * garment-type-runs.ts), spans and verdicts (index-model.ts against the
 * dossier's climate), ownership and gaps (the reader's own ledger), the
 * maker directory (brands.ts BRAND_DIRECTORY merged with the
 * hunt_directory_brands additions), favourites (the shared brand_index
 * ledger) and the import pipeline (hunt-brand-import.ts).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import {
  mergeDirectory,
  verifiedBrandWebsiteUrl,
  type BrandProfile,
  type DirectoryBrandRow,
  type DirectoryEntry,
  type Register,
} from './brands';
import { INDEX_GARMENT_TYPES, type GarmentCategoryId, type GarmentType } from './garment-types';
import { runOfType } from './garment-type-runs';
import { TEMPERATURE_BAND_ORDER, type TemperatureBand } from './temperature-bands';
import {
  FIELD_REGISTER_LABELS,
  RULER_HI,
  RULER_LO,
  VERDICT_TEXT,
  daysInSpan,
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
import { DISCOVER_BRANDS_EVENT, addDirectoryBrandStubs, backfillDirectoryBrandStubs } from './hunt-ai';
import { looksLikeUrl, nameFromUrl, normalizeSiteUrl, parseBrandImportFile } from './hunt-brand-import';
import {
  BRAND_INDEX_CHANGED_EVENT,
  addBrandIndexEntry,
  updateBrandIndexEntry,
  type BrandIndexEntry,
  type BrandIndexStatus,
  type StyleProfile,
  type WardrobePiece,
} from './profile-data';
import { usePlexMono } from './mono-type';

// ---------------------------------------------------------------------------
// Shared furniture
// ---------------------------------------------------------------------------

const DEEP = '#5c3413';
const GAP_TINT = 'rgba(168,113,44,0.07)';
const ROW_HAIRLINE = '1px solid rgba(59,43,29,0.12)';

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

/** The temperature-band histogram — click a band to hold it. */
function BandStrip({
  counts,
  ownedBands,
  held,
  onHold,
}: {
  counts: Record<string, number>;
  ownedBands: Set<TemperatureBand>;
  held: TemperatureBand | null;
  onHold: (b: TemperatureBand | null) => void;
}) {
  const max = Math.max(1, ...TEMPERATURE_BAND_ORDER.map((b) => counts[b] || 0));
  return (
    <div style={{ paddingBottom: '16px' }}>
      <div className="flex items-baseline justify-between flex-wrap" style={{ gap: '4px 16px', paddingBottom: '7px' }}>
        <span style={mono(7.5, FAINT)}>Temperature · click a band to hold it</span>
        <span className="hidden md:inline" style={mono(7.5, FAINTER)}>
          Types centring in each band · accent marks the bands you own into
        </span>
      </div>
      <div className="overflow-x-auto">
        <div
          className="grid"
          style={{ gridTemplateColumns: `repeat(${TEMPERATURE_BAND_ORDER.length}, minmax(74px, 1fr))`, border: `1px solid ${RULE}`, minWidth: '640px' }}
        >
          {TEMPERATURE_BAND_ORDER.map((band, i) => {
            const count = counts[band] || 0;
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
                <span style={{ ...mono(7.5, count > 0 ? SECONDARY : FAINTER), display: 'block' }}>{BAND_CELL_LABELS[band]}</span>
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
              </button>
            );
          })}
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
const PIECE_GRID = 'grid grid-cols-[minmax(148px,220px)_14px_minmax(0,1fr)_78px_54px_30px]';

function PieceAxisHeader() {
  return (
    <div className={`${PIECE_GRID} items-end`} style={{ gap: '0 14px' }}>
      <span aria-hidden style={{ height: '20px' }} />
      <span aria-hidden style={{ height: '20px' }} />
      <div aria-hidden style={{ position: 'relative', height: '20px' }}>
        {AXIS_MARKS.map((deg) => (
          <span
            key={deg}
            style={{ ...mono(7.5, FAINT), position: 'absolute', left: `${pct(deg)}%`, bottom: '3px', transform: 'translateX(-50%)', whiteSpace: 'nowrap' }}
          >
            {deg}°
          </span>
        ))}
      </div>
      <span aria-hidden style={{ height: '20px' }} />
      <span aria-hidden style={{ height: '20px' }} />
      <span aria-hidden style={{ height: '20px' }} />
    </div>
  );
}

/** The type's own inline entry — what “a row opens its piece page” opens. */
function PieceEntry({ type, model }: { type: GarmentType; model: IndexModel }) {
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
  if (ownedNames.length > 0) facts.push({ label: 'On your ledger', value: ownedNames.join(' · ') });
  return (
    <div style={{ padding: '12px 6px 16px', borderBottom: ROW_HAIRLINE, background: 'rgba(251,248,241,0.6)' }}>
      {run?.run.note && <p style={{ ...body(13.5, SECONDARY), margin: '0 0 10px', maxWidth: '64ch' }}>{run.run.note}</p>}
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

function PiecesFace({ model }: { model: IndexModel }) {
  const firstBanded = model.categories.find((c) => c.banded)?.id || model.categories[0]?.id || 'tops';
  const [cat, setCat] = useState<GarmentCategoryId>(firstBanded as GarmentCategoryId);
  const [heldBand, setHeldBand] = useState<TemperatureBand | null>(null);
  const [regs, setRegs] = useState<string[]>([]);
  const [occs, setOccs] = useState<string[]>([]);
  const [runs, setRuns] = useState<string[]>([]);
  const [find, setFind] = useState('');
  const [openType, setOpenType] = useState<string | null>(null);

  const category = model.categories.find((c) => c.id === cat) || model.categories[0];
  const banded = !!category?.banded;

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

  return (
    <div>
      {/* ——— the category strip */}
      <div className="flex overflow-x-auto" style={{ gap: '2px 22px', borderBottom: `1px solid ${HAIRLINE}`, paddingBottom: '9px' }}>
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
                ...mono(8.5, active ? DEEP : SECONDARY),
                fontWeight: active ? 500 : 400,
                background: 'transparent',
                padding: '0 0 5px',
                borderBottom: active ? `2px solid ${ACCENT}` : '2px solid transparent',
                marginBottom: '-10px',
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
      {banded && <BandStrip counts={bandCounts} ownedBands={ownedBands} held={heldBand} onHold={setHeldBand} />}

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
            <span style={mono(7.5, ACCENT_DEEP)}>Reading · by {banded ? 'temperature' : 'name'}</span>
            <h4 style={{ ...serif(25, WALNUT), lineHeight: 1.15, margin: '8px 0 0' }}>
              {category?.name}, {banded ? 'coldest first' : 'A to Z'}
            </h4>
            <p style={{ ...body(13.5, SECONDARY), margin: '9px 0 0', maxWidth: '30ch' }}>
              {banded
                ? `One column, so the bands line up — a band only reads against its neighbours. ${
                    model.climate.city ? `Verdicts are for ${model.climate.city}.` : model.climate.weighted ? 'Verdicts are for your climate.' : 'Set your city in the Dossier and the verdicts fill in.'
                  }`
                : 'No temperature band here — these are judged by material and place, so the column reads alphabetically.'}
            </p>
            <div style={{ borderTop: `1px solid ${HAIRLINE}`, margin: '14px 0 12px', maxWidth: '150px' }} />
            <div className="flex flex-col" style={{ gap: '7px' }}>
              <span className="flex items-center" style={{ gap: '9px' }}>
                <span aria-hidden style={{ width: '26px', height: '6px', background: '#2e2115', flexShrink: 0 }} />
                <span style={mono(7.5, SECONDARY)}>You own one</span>
              </span>
              <span className="flex items-center" style={{ gap: '9px' }}>
                <span aria-hidden style={{ width: '26px', height: '6px', background: 'rgba(59,43,29,0.30)', flexShrink: 0 }} />
                <span style={mono(7.5, SECONDARY)}>You don't</span>
              </span>
              <span className="flex items-center" style={{ gap: '9px' }}>
                <span aria-hidden style={{ width: '26px', height: '10px', border: `1.5px dashed ${ACCENT}`, flexShrink: 0 }} />
                <span style={mono(7.5, SECONDARY)}>A gap your board names</span>
              </span>
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          {shown.length === 0 ? (
            <p style={{ ...body(14, SECONDARY), padding: '22px 0' }}>
              Nothing in {category?.name || 'this category'} answers this combination — reset the filters to see the whole run.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <div style={{ minWidth: '560px' }}>
                {banded && <PieceAxisHeader />}
                <div style={{ borderTop: `1px solid ${RULE}` }}>
                  {shown.map((t) => {
                    const owned = model.ownership.swatches.has(t.id);
                    const gap = model.gaps.has(t.id);
                    const span = spanOf(t);
                    const verdict = verdictFor(model.climate, t, gap);
                    const open = openType === t.id;
                    const toggle = () => setOpenType(open ? null : t.id);
                    return (
                      <div key={t.id}>
                        <div
                          className={`${PIECE_GRID} items-center`}
                          style={{ gap: '0 14px', padding: '8.5px 0', borderBottom: ROW_HAIRLINE, background: gap ? GAP_TINT : 'transparent' }}
                        >
                          <span className="min-w-0 flex items-baseline" style={{ gap: '8px' }}>
                            {gap && <span style={{ ...mono(6.5, ACCENT_DEEP), flexShrink: 0 }}>Gap</span>}
                            <button
                              type="button"
                              onClick={toggle}
                              className="text-left hover:opacity-70 transition-opacity min-w-0"
                              title={`${t.name} — open its entry`}
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
                            {owned && <span title="On your ledger" style={{ width: '6px', height: '6px', borderRadius: '999px', background: '#2e2115', display: 'block' }} />}
                          </span>
                          {span ? (
                            <SpanBar span={span} owned={owned} gap={gap} />
                          ) : (
                            <span style={mono(7.5, FAINTER)}>Judged by material and place</span>
                          )}
                          <span style={{ ...mono(7.5, pieceVerdictColor(verdict)), textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {verdict ? VERDICT_TEXT[verdict] : '—'}
                          </span>
                          <span style={{ ...mono(8, SECONDARY), textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {span ? `${span.lo}–${span.hi}°` : '—'}
                          </span>
                          <button
                            type="button"
                            onClick={toggle}
                            aria-expanded={open}
                            aria-label={`${t.name} — ${open ? 'close' : 'open'} its entry`}
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
                            {open ? '↑' : '→'}
                          </button>
                        </div>
                        {open && <PieceEntry type={t} model={model} />}
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
              Names are links · a row opens its piece entry
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MAKERS FACE — every house on file.
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

/** maker name (lowercased) → the categories the canon says they make. */
const MAKER_CATEGORIES: Map<string, Set<GarmentCategoryId>> = (() => {
  const map = new Map<string, Set<GarmentCategoryId>>();
  for (const t of INDEX_GARMENT_TYPES) {
    for (const m of t.makers) {
      const key = m.toLowerCase();
      const set = map.get(key) || new Set<GarmentCategoryId>();
      set.add(t.category);
      map.set(key, set);
    }
  }
  return map;
})();

const MAKER_GRID = 'grid grid-cols-[22px_20px_minmax(128px,190px)_minmax(88px,118px)_minmax(0,1fr)_96px_88px_84px_20px]';

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
function MakerEntry({ entry, categories }: { entry: DirectoryEntry; categories: string[] }) {
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
    { label: 'Quality', of: (e) => (Number.isFinite(e.profile.qualityScore) && !isStubProfile(e.profile) ? `${e.profile.qualityScore}/10` : '—') },
    { label: 'Signature pieces', of: (e) => (e.profile.signaturePieces || []).slice(0, 3).join(' · ') || '—' },
    { label: 'On your ledger', of: (e) => (ledger.has(e.profile.brand.toLowerCase()) ? 'Yes' : '—') },
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

function MakersFace({
  entries,
  metaRows,
  refreshMeta,
  model,
  pieces,
}: {
  entries: DirectoryEntry[];
  metaRows: BrandIndexEntry[];
  refreshMeta: () => void;
  model: IndexModel;
  pieces: WardrobePiece[];
}) {
  const [find, setFind] = useState('');
  const [favesOnly, setFavesOnly] = useState(false);
  const [places, setPlaces] = useState<string[]>([]);
  const [bands, setBands] = useState<string[]>([]);
  const [makes, setMakes] = useState<string[]>([]);
  const [reads, setReads] = useState<string[]>([]);
  const [stocked, setStocked] = useState<string[]>([]);
  const [held, setHeld] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const [openMaker, setOpenMaker] = useState<string | null>(null);
  const [addValue, setAddValue] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

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

  const shown = useMemo(() => {
    const q = find.trim().toLowerCase();
    return entries
      .filter((e) => {
        const p = e.profile;
        const key = p.brand.toLowerCase();
        if (favesOnly && !isFav(p.brand)) return false;
        if (q) {
          const hay = `${p.brand} ${p.city || ''} ${p.country || ''} ${p.description || ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (places.length > 0 && (!p.country || !places.includes(p.country))) return false;
        if (bands.length > 0 && !bands.includes(p.priceBand)) return false;
        if (makes.length > 0) {
          const cats = MAKER_CATEGORIES.get(key);
          if (!cats || !makes.some((m) => cats.has(m as GarmentCategoryId))) return false;
        }
        if (reads.length > 0 && !reads.includes(readOf(e))) return false;
        if (stocked.length > 0 && !stocked.includes(stockedOf(p))) return false;
        return true;
      })
      .sort((a, b) => a.profile.brand.localeCompare(b.profile.brand));
  }, [entries, find, favesOnly, places, bands, makes, reads, stocked, metaMap, favOverrides]);

  const filtersHeld = (favesOnly ? 1 : 0) + places.length + bands.length + makes.length + reads.length + stocked.length + (find.trim() ? 1 : 0);

  const reset = () => {
    setFind('');
    setFavesOnly(false);
    setPlaces([]);
    setBands([]);
    setMakes([]);
    setReads([]);
    setStocked([]);
  };

  const toggleHeld = (brand: string) => {
    setHeld((cur) => {
      if (cur.includes(brand)) return cur.filter((b) => b !== brand);
      if (cur.length >= 4) return cur;
      return [...cur, brand];
    });
  };

  const heldEntries = useMemo(() => held.map((b) => entries.find((e) => e.profile.brand === b)).filter(Boolean) as DirectoryEntry[], [held, entries]);

  /** ADD TO THE LIST — a name or a pasted link; files instantly as an
   * Unread stub, and Beau's background pass fills the dossier in. */
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
        setNotice(`${added[0]} added — Beau is pulling the file.`);
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

  return (
    <div>
      {/* ——— the filter-state line */}
      <StateLine
        text={filtersHeld === 0 ? `No filters held — all ${entries.length} makers on file` : `${filtersHeld} filter${filtersHeld === 1 ? '' : 's'} held — ${shown.length} of ${entries.length} makers`}
        active={filtersHeld > 0}
        onReset={reset}
      />

      {/* ——— add a maker */}
      <div className="flex items-center flex-wrap" style={{ gap: '10px 12px', paddingBottom: '14px' }}>
        <span style={{ ...mono(8, FAINT), flexShrink: 0 }}>Add a maker</span>
        <label className="flex items-center min-w-0 flex-1" style={{ border: `1px solid ${RULE}`, padding: '9px 13px', maxWidth: '420px', background: 'transparent' }}>
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
        <MonoButton disabled={addBusy} onClick={() => fileRef.current?.click()}>
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
      {notice && <div style={{ ...mono(8, ACCENT_DEEP), paddingBottom: '12px' }}>{notice}</div>}

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
      </div>

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
          {shown.length} of {entries.length} makers shown
          {makes.length === 1 ? ` · ${(makesOptions.find((o) => o.id === makes[0])?.label || '').toUpperCase()} houses on file` : ' · every house on file'}
        </span>
        <span className="flex items-center flex-wrap" style={{ gap: '8px 14px' }}>
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

      {comparing && heldEntries.length >= 2 ? (
        <CompareSheet entries={heldEntries} ledger={ledgerBrands} onClose={() => setComparing(false)} />
      ) : shown.length === 0 ? (
        <p style={{ ...body(14, SECONDARY), padding: '20px 0' }}>No maker on file answers this combination — reset the filters to see every house.</p>
      ) : (
        <div className="overflow-x-auto">
          <div style={{ minWidth: '860px' }}>
            {/* the column heads */}
            <div className={`${MAKER_GRID} items-end`} style={{ gap: '0 12px', borderBottom: `1px solid ${RULE}`, paddingBottom: '6px' }}>
              <span aria-hidden />
              <span aria-hidden />
              <span style={mono(7.5, FAINT)}>Maker</span>
              <span style={mono(7.5, FAINT)}>Where</span>
              <span style={mono(7.5, FAINT)}>What defines them</span>
              <span style={mono(7.5, FAINT)}>Price, new</span>
              <span style={mono(7.5, FAINT)}>Stocked</span>
              <span style={mono(7.5, FAINT)}>Beau's read</span>
              <span aria-hidden />
            </div>
            {shown.map((e) => {
              const p = e.profile;
              const key = p.brand.toLowerCase();
              const read = readOf(e);
              const onLedger = ledgerBrands.has(key);
              const open = openMaker === p.brand;
              const cats = [...(MAKER_CATEGORIES.get(key) || [])].map((c) => model.categories.find((mc) => mc.id === c)?.name || c);
              return (
                <div key={p.brand}>
                  <div className={`${MAKER_GRID} items-center`} style={{ gap: '0 12px', padding: '11px 0', borderBottom: ROW_HAIRLINE }}>
                    <TickBox on={held.includes(p.brand)} disabled={held.length >= 4} onToggle={() => toggleHeld(p.brand)} brand={p.brand} />
                    <FavStar active={isFav(p.brand)} onToggle={() => void toggleFav(p.brand)} brand={p.brand} />
                    <span className="min-w-0">
                      <button
                        type="button"
                        onClick={() => setOpenMaker(open ? null : p.brand)}
                        title={`${p.brand} — open the full entry`}
                        className="text-left hover:opacity-70 transition-opacity"
                        style={{ ...serif(16, WALNUT), background: 'transparent', padding: 0, lineHeight: 1.25, textDecoration: 'underline', textDecorationColor: RULE, textUnderlineOffset: '3.5px' }}
                      >
                        {p.brand}
                      </button>
                      {onLedger && <span style={{ ...mono(6.5, ACCENT_DEEP), display: 'block', marginTop: '3px' }}>On your ledger</span>}
                    </span>
                    <span className="min-w-0">
                      <span style={{ ...body(13, INK), display: 'block', lineHeight: 1.3 }}>{p.city || (p.country !== '—' ? p.country : '—') || '—'}</span>
                      {p.founded && <span style={{ ...mono(6.5, FAINT), display: 'block', marginTop: '3px' }}>Since {p.founded}</span>}
                    </span>
                    <span className="min-w-0" style={{ ...body(13.5, INK), lineHeight: 1.4 }}>
                      {isStubProfile(p) ? <span style={{ color: FAINT }}>Beau is pulling the file on this maker.</span> : p.description}
                    </span>
                    <span style={{ ...mono(8, SECONDARY), whiteSpace: 'nowrap' }}>{priceNewOf(p)}</span>
                    <span style={body(12.5, SECONDARY)}>{STOCKED_LABELS[stockedOf(p)]}</span>
                    <span style={mono(7.5, READ_COLORS[read])}>{READ_LABELS[read]}</span>
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
                  {open && <MakerEntry entry={e} categories={cats} />}
                </div>
              );
            })}
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
  void profile; // the faces read the dossier through the model's own hooks
  const model = useIndexModel(pieces);
  const [face, setFace] = useState<'pieces' | 'makers'>('pieces');

  // The maker directory — the catalog seed merged with persisted additions.
  const { data: addedRows, refresh } = window.useWorkspaceDB<DirectoryBrandRow>('hunt_directory_brands', {
    orderBy: { column: 'created_at', direction: 'desc' },
    limit: 200,
  });
  useEffect(() => {
    const onChanged = () => refresh();
    window.addEventListener(DISCOVER_BRANDS_EVENT, onChanged);
    return () => window.removeEventListener(DISCOVER_BRANDS_EVENT, onChanged);
  }, [refresh]);

  // The personal per-brand files — favourites live here (status 'trusted').
  const { data: metaRows, refresh: refreshMeta } = window.useWorkspaceDB<BrandIndexEntry>('brand_index', {
    orderBy: { column: 'created_at', direction: 'desc' },
    limit: 200,
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
    <div className="px-5 sm:px-10 py-8 max-w-[1180px] mx-auto w-full pb-28">
      {/* ——— the masthead: kicker + title + standfirst left, the face toggle right */}
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] md:items-end" style={{ gap: '18px 40px', paddingBottom: '20px' }}>
        <div>
          {face === 'makers' && <span style={{ ...mono(7.5, ACCENT_DEEP), display: 'block', marginBottom: '7px' }}>The makers face</span>}
          <h2 style={{ ...serif(0, WALNUT), fontSize: 'clamp(32px, 4.4vw, 44px)', lineHeight: 1.06, letterSpacing: '-0.012em', margin: 0 }}>The Index</h2>
          <p style={{ ...body(15, INK), margin: '11px 0 0', maxWidth: '62ch' }}>
            {face === 'pieces'
              ? `${model.typeTotal} garment types and ${entries.length} makers — one body of reference. Set the filters and the table below narrows to exactly the types that answer them; every name opens its own entry.`
              : `Every house on file, with the few facts that separate them and Beau's read of each against your ledger. A name opens the full entry; tick two or more to read them side by side.`}
          </p>
        </div>
        <div className="flex md:justify-end">
          <div className="flex" role="group" aria-label="What the list is of">
            {(
              [
                { id: 'pieces' as const, label: `Pieces · ${model.typeTotal}` },
                { id: 'makers' as const, label: `Makers · ${entries.length} on file` },
              ]
            ).map(({ id, label }) => {
              const active = face === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFace(id)}
                  aria-pressed={active}
                  className="transition-colors"
                  style={{
                    ...mono(8.5, active ? '#f6f0e5' : SECONDARY),
                    background: active ? WALNUT : PAPER,
                    border: `1px solid ${active ? WALNUT : RULE}`,
                    padding: '9px 16px',
                    whiteSpace: 'nowrap',
                    marginLeft: id === 'makers' ? '-1px' : 0,
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Both faces stay mounted — filters, selections and scroll survive the
          toggle; only one shows. */}
      <div style={{ display: face === 'pieces' ? undefined : 'none' }}>
        <PiecesFace model={model} />
      </div>
      <div style={{ display: face === 'makers' ? undefined : 'none' }}>
        <MakersFace entries={entries} metaRows={metaRows || []} refreshMeta={refreshMeta} model={model} pieces={pieces} />
      </div>
    </div>
  );
}
