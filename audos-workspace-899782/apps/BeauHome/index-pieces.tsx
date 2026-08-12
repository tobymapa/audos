/**
 * THE INDEX · PIECES — the temperature-anchored reference table (full
 * layout rebuild, August 2026).
 *
 * One flat view. No drill-down, no detail panels, no tappable rows — the
 * table is read, filtered and left. Three stacked filter rows at the top:
 *
 *   · Row 1 — category chips: the eleven canonical categories
 *     (category-order.ts, minus 'other'). Single-select; tapping the active
 *     chip returns to all. Selecting one populates Row 2.
 *   · Row 2 — sub-category chips: the selected category's runs
 *     (garment-type-runs.ts). Multi-select. Hidden when no category is set.
 *   · Row 3 — formality (the six registers) and occasions. Multi-select;
 *     OR within each group, AND between groups.
 *
 * One Reset at the top right clears all three rows at once.
 *
 * Below, the reference table: a vertical temperature scale on the left —
 * hot at the top, cold at the bottom, in the reader's preferred unit (°C
 * by default, a °C/°F switch above the scale) — and one row per garment
 * type on the right: the name, a subtle owned count, and a thin horizontal
 * bar spanning the temperatures it answers on one shared track, warm
 * colour at the hot end, cool at the cold end. Rows group under category
 * headers when every category shows, run flat when one is selected, and
 * sort hottest-to-coldest, then alphabetically.
 *
 * Data untouched: garment-types.ts · garment-type-runs.ts ·
 * temperature-bands.ts · index-model.ts (spans, ownership).
 */
import { useEffect, useMemo, useState } from 'react';
import type { Register } from './brands';
import { findGarmentType, type GarmentCategoryId, type GarmentType } from './garment-types';
import {
  FIELD_REGISTER_LABELS,
  RULER_HI,
  RULER_LO,
  isBandedCategory,
  spanOf,
  type IndexModel,
  type TempSpan,
} from './index-model';
import {
  ACCENT_DEEP,
  Chip,
  FAINT,
  FAINTER,
  HAIRLINE,
  INK,
  ResetButton,
  RULE,
  SECONDARY,
  TierLabel,
  WALNUT,
  mono,
  serif,
  tempColor,
} from './index-style';
import { usePlexMono } from './mono-type';

// ---------------------------------------------------------------------------
// The filter option sets.
// ---------------------------------------------------------------------------

/** The six registers, in the brief's order. */
const REGISTER_OPTIONS: Register[] = ['Casual', 'Smart-Casual', 'Business', 'Formal', 'Outdoor-Work', 'Black-Tie'];

/** Occasions — each one a deterministic read of a type's own record (its
 * register reach, category and id), never a stored label. */
interface OccasionDef {
  id: string;
  label: string;
  test: (t: GarmentType) => boolean;
}

const SPORT_RX = /track|sweat|gym|rugby|baseball|tennis|runner|trainer|sneaker|swim|hiking|cycling|boat-shoe|deck-/;
const TRAVEL_RX = /travel|holdall|weekender|dopp|garment-bag|car-coat|driving|messenger|rucksack|field-satchel/;

const OCCASIONS: OccasionDef[] = [
  { id: 'weekend', label: 'Weekend', test: (t) => t.reach.includes('Casual') },
  { id: 'work', label: 'Work', test: (t) => t.reach.includes('Business') || t.reach.includes('Smart-Casual') },
  { id: 'evening', label: 'Evening', test: (t) => t.reach.includes('Formal') || t.reach.includes('Black-Tie') },
  {
    id: 'travel',
    label: 'Travel',
    test: (t) => t.category === 'bags' || TRAVEL_RX.test(t.id) || (t.reach.includes('Casual') && t.reach.includes('Smart-Casual')),
  },
  { id: 'sport', label: 'Sport', test: (t) => t.category === 'sweatshirts' || SPORT_RX.test(t.id) },
  { id: 'formal-event', label: 'Formal Event', test: (t) => t.reach.includes('Black-Tie') || t.reach.includes('Formal') },
  { id: 'outdoor', label: 'Outdoor', test: (t) => t.reach.includes('Outdoor-Work') },
];

// ---------------------------------------------------------------------------
// The temperature track — ONE calibration for the vertical scale on the
// left and every horizontal bar on the right: hot at the top of the scale,
// hot at the left of the bars, −10…36°C end to end.
// ---------------------------------------------------------------------------

type TempUnit = 'c' | 'f';
const UNIT_KEY = 'ethaion:index-temp-unit';

function loadUnit(): TempUnit {
  try {
    return window.localStorage.getItem(UNIT_KEY) === 'f' ? 'f' : 'c';
  } catch {
    return 'c';
  }
}

const toF = (c: number) => Math.round((c * 9) / 5 + 32);

/** Scale labels — °C marks at 35/25/15/5/−5; °F at 90/70/50/30/14. Each
 * mark is stored as the °C position it sits at. */
const C_MARKS = [35, 25, 15, 5, -5];
const F_MARKS = [90, 70, 50, 30, 14].map((f) => ((f - 32) * 5) / 9);

function marksFor(unit: TempUnit): Array<{ atC: number; label: string }> {
  if (unit === 'f') return F_MARKS.map((atC) => ({ atC, label: `${toF(atC)}°` }));
  return C_MARKS.map((atC) => ({ atC, label: `${atC}°` }));
}

/** Percent from the HOT end (top of the scale, left of the bars). */
const pctFromHot = (c: number) => ((RULER_HI - c) / (RULER_HI - RULER_LO)) * 100;

function spanText(span: TempSpan, unit: TempUnit): string {
  if (unit === 'f') return `${toF(span.lo)}–${toF(span.hi)}°F`;
  return `${span.lo}–${span.hi}°C`;
}

// ---------------------------------------------------------------------------
// The vertical temperature scale — the left column. Hot at the top, cold
// at the bottom, labelled at the marks, sharing the bars' calibration.
// ---------------------------------------------------------------------------

function VerticalScale({ unit, onUnit }: { unit: TempUnit; onUnit: (u: TempUnit) => void }) {
  return (
    <div aria-label="Temperature scale">
      <div className="flex items-baseline" style={{ gap: '6px', marginBottom: '10px' }}>
        {(['c', 'f'] as TempUnit[]).map((u) => (
          <button
            key={u}
            type="button"
            onClick={() => onUnit(u)}
            aria-pressed={unit === u}
            style={{
              ...mono(8.5, unit === u ? '#5c3413' : FAINTER),
              background: 'transparent',
              padding: '0 0 2px',
              borderBottom: unit === u ? `1px solid ${ACCENT_DEEP}` : '1px solid transparent',
            }}
          >
            °{u.toUpperCase()}
          </button>
        ))}
      </div>
      <div style={{ position: 'relative', height: '300px', width: '100%' }}>
        {/* the rail — warm at the top, cool at the bottom, kept muted */}
        <span
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: '3px',
            borderRadius: '2px',
            background: `linear-gradient(to bottom, ${tempColor(RULER_HI, RULER_LO, RULER_HI)}, ${tempColor(RULER_LO, RULER_LO, RULER_HI)})`,
          }}
        />
        {marksFor(unit).map(({ atC, label }) => (
          <span key={label} style={{ position: 'absolute', left: '9px', top: `${pctFromHot(atC)}%`, transform: 'translateY(-50%)' }}>
            <span style={mono(8, SECONDARY)}>{label}</span>
          </span>
        ))}
        <span style={{ ...mono(7, FAINT), position: 'absolute', left: '9px', top: '-2px' }}>Hot</span>
        <span style={{ ...mono(7, FAINT), position: 'absolute', left: '9px', bottom: '-2px' }}>Cold</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The bar row — name · owned count · the span bar · the span figure.
// ---------------------------------------------------------------------------

const ROW_GRID = 'grid grid-cols-[minmax(124px,220px)_minmax(0,1fr)_64px]';

function BarTrack({ span }: { span: TempSpan }) {
  const left = pctFromHot(span.hi);
  const width = Math.max(1.5, pctFromHot(span.lo) - pctFromHot(span.hi));
  return (
    <div aria-hidden style={{ position: 'relative', height: '14px', minWidth: 0 }}>
      {C_MARKS.map((deg) => (
        <span
          key={deg}
          style={{ position: 'absolute', left: `${pctFromHot(deg)}%`, top: 0, bottom: 0, width: '1px', background: 'rgba(59,43,29,0.10)' }}
        />
      ))}
      <span
        style={{
          position: 'absolute',
          left: `${left}%`,
          width: `${width}%`,
          top: '5px',
          height: '4px',
          borderRadius: '2px',
          background: `linear-gradient(to right, ${tempColor(span.hi, RULER_LO, RULER_HI)}, ${tempColor(span.lo, RULER_LO, RULER_HI)})`,
        }}
      />
    </div>
  );
}

function TypeRow({ type, ownedCount, unit }: { type: GarmentType; ownedCount: number; unit: TempUnit }) {
  const span = spanOf(type);
  return (
    <div className={`${ROW_GRID} items-center`} style={{ gap: '14px', padding: '8px 0', borderBottom: '1px solid rgba(59,43,29,0.10)' }}>
      <span className="min-w-0">
        <span style={{ fontFamily: 'var(--space-font-heading)', fontSize: '14.5px', fontWeight: 400, lineHeight: 1.3, color: ownedCount > 0 ? WALNUT : INK }}>
          {type.name}
        </span>
        {ownedCount > 0 && (
          <span title={`You own ${ownedCount}`} style={{ ...mono(8, ACCENT_DEEP), marginLeft: '7px', whiteSpace: 'nowrap' }}>
            · {ownedCount}
          </span>
        )}
      </span>
      {span ? <BarTrack span={span} /> : <span style={mono(8, FAINTER)}>Any season</span>}
      <span style={{ ...mono(8, SECONDARY), textAlign: 'right', whiteSpace: 'nowrap' }}>{span ? spanText(span, unit) : '—'}</span>
    </div>
  );
}

/** The degree header the bars hang from — sticky, mirroring the row grid. */
function TrackHeader({ unit }: { unit: TempUnit }) {
  return (
    <div
      className={`${ROW_GRID} items-end`}
      style={{ gap: '0 14px', position: 'sticky', top: 0, zIndex: 3, background: 'var(--space-surface-page, #efe7d9)', paddingTop: '4px' }}
    >
      <span aria-hidden style={{ borderBottom: `1px solid ${RULE}`, height: '20px' }} />
      <div aria-hidden style={{ position: 'relative', height: '20px', borderBottom: `1px solid ${RULE}` }}>
        {marksFor(unit).map(({ atC, label }) => (
          <span
            key={label}
            style={{
              ...mono(7.5, FAINT),
              position: 'absolute',
              left: `${pctFromHot(atC)}%`,
              bottom: '3px',
              transform: 'translateX(-50%)',
              whiteSpace: 'nowrap',
            }}
          >
            {label}
          </span>
        ))}
      </div>
      <span aria-hidden style={{ borderBottom: `1px solid ${RULE}`, height: '20px' }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sorting — hottest applicable range first, then alphabetical. Unbanded
// types (accessories · bags) read alphabetically after the banded rows.
// ---------------------------------------------------------------------------

function sortTypes(list: GarmentType[]): GarmentType[] {
  return [...list].sort((a, b) => {
    const sa = spanOf(a);
    const sb = spanOf(b);
    if (sa && sb) return sb.hi - sa.hi || sb.lo - sa.lo || a.name.localeCompare(b.name);
    if (sa && !sb) return -1;
    if (!sa && sb) return 1;
    return a.name.localeCompare(b.name);
  });
}

// ---------------------------------------------------------------------------
// The view.
// ---------------------------------------------------------------------------

export function IndexPieces({ model }: { model: IndexModel }) {
  usePlexMono();
  const [cat, setCat] = useState<GarmentCategoryId | null>(null);
  const [subs, setSubs] = useState<string[]>([]);
  const [regs, setRegs] = useState<Register[]>([]);
  const [occs, setOccs] = useState<string[]>([]);
  const [unit, setUnit] = useState<TempUnit>(() => loadUnit());

  useEffect(() => {
    try {
      window.localStorage.setItem(UNIT_KEY, unit);
    } catch { /* preference simply doesn't persist */ }
  }, [unit]);

  const reset = () => {
    setCat(null);
    setSubs([]);
    setRegs([]);
    setOccs([]);
  };

  const pickCategory = (next: GarmentCategoryId | null) => {
    setCat(next);
    setSubs([]); // Row 2 is contextual to Row 1
  };

  const toggleIn = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const subsOfCat = useMemo(
    () => (cat ? (model.categories.find((c) => c.id === cat)?.runs || []).map((r) => r.label) : []),
    [model, cat],
  );

  // One pass over the model — the filtered types, grouped by category.
  const { groups, shownTotal } = useMemo(() => {
    const occTests = OCCASIONS.filter((o) => occs.includes(o.id));
    const groups: Array<{ id: GarmentCategoryId; name: string; types: GarmentType[] }> = [];
    let shownTotal = 0;
    for (const c of model.categories) {
      if (cat && c.id !== cat) continue;
      const kept: GarmentType[] = [];
      for (const run of c.runs) {
        if (cat && subs.length > 0 && !subs.includes(run.label)) continue;
        for (const id of run.typeIds) {
          const t = findGarmentType(id);
          if (!t) continue;
          if (regs.length > 0 && !t.reach.some((r) => regs.includes(r))) continue;
          if (occTests.length > 0 && !occTests.some((o) => o.test(t))) continue;
          kept.push(t);
        }
      }
      if (kept.length === 0) continue;
      shownTotal += kept.length;
      groups.push({ id: c.id, name: c.name, types: sortTypes(kept) });
    }
    return { groups, shownTotal };
  }, [model, cat, subs, regs, occs]);

  const filtersActive = cat != null || subs.length > 0 || regs.length > 0 || occs.length > 0;
  const grouped = cat == null; // category headers only when every category shows

  return (
    <div>
      {/* ─── the filter bar: three rows stacked, Reset at the top right */}
      <div style={{ padding: '2px 0 14px', borderBottom: `1px solid ${HAIRLINE}` }}>
        {/* Row 1 · category — single-select; the active chip deselects */}
        <div className="flex items-start" style={{ gap: '12px' }}>
          <TierLabel>Category</TierLabel>
          <div className="flex overflow-x-auto min-w-0 flex-1" style={{ gap: '8px', paddingBottom: '4px' }}>
            {model.categories.map((c) => (
              <Chip key={c.id} active={cat === c.id} onClick={() => pickCategory(cat === c.id ? null : c.id)}>
                {c.name}
              </Chip>
            ))}
          </div>
          <ResetButton active={filtersActive} onClick={reset} />
        </div>

        {/* Row 2 · sub-category — the selected category's runs, multi-select */}
        {cat != null && subsOfCat.length > 0 && (
          <div className="flex items-start" style={{ gap: '12px', marginTop: '10px' }}>
            <TierLabel>Sub-category</TierLabel>
            <div className="flex flex-wrap min-w-0 flex-1" style={{ gap: '8px' }}>
              {subsOfCat.map((label) => (
                <Chip key={label} active={subs.includes(label)} onClick={() => setSubs((cur) => toggleIn(cur, label))}>
                  {label}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {/* Row 3 · formality + occasions — always visible, multi-select */}
        <div className="flex items-start" style={{ gap: '12px', marginTop: '10px' }}>
          <TierLabel>Formality</TierLabel>
          <div className="flex flex-wrap min-w-0 flex-1" style={{ gap: '8px' }}>
            {REGISTER_OPTIONS.map((reg) => (
              <Chip key={reg} active={regs.includes(reg)} onClick={() => setRegs((cur) => toggleIn(cur, reg))}>
                {FIELD_REGISTER_LABELS[reg] || reg}
              </Chip>
            ))}
          </div>
        </div>
        <div className="flex items-start" style={{ gap: '12px', marginTop: '10px' }}>
          <TierLabel>Occasions</TierLabel>
          <div className="flex flex-wrap min-w-0 flex-1" style={{ gap: '8px' }}>
            {OCCASIONS.map((o) => (
              <Chip key={o.id} active={occs.includes(o.id)} onClick={() => setOccs((cur) => toggleIn(cur, o.id))}>
                {o.label}
              </Chip>
            ))}
          </div>
        </div>
      </div>

      {/* ─── the count line */}
      <div style={{ ...mono(8, FAINT), padding: '12px 0 4px' }}>
        {shownTotal} of {model.typeTotal} types{model.ownedTotal > 0 ? ` · you own ${model.ownedTotal}` : ''}
      </div>

      {shownTotal === 0 ? (
        <p style={{ ...mono(8.5, SECONDARY), padding: '18px 0' }}>Nothing answers this combination — Reset to see everything.</p>
      ) : (
        /* ─── the temperature-anchored table: the vertical scale on the
           left, the piece rows with their bars on the right */
        <div className="flex" style={{ gap: '20px' }}>
          <div style={{ width: '64px', flexShrink: 0 }} className="hidden sm:block">
            <div style={{ position: 'sticky', top: '84px', paddingTop: '28px' }}>
              <VerticalScale unit={unit} onUnit={setUnit} />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <TrackHeader unit={unit} />
            {groups.map((g) => (
              <section key={g.id} aria-label={`${g.name} — ${g.types.length} types`}>
                {grouped && (
                  <div className="flex items-baseline" style={{ gap: '12px', padding: '18px 0 4px' }}>
                    <span style={{ ...serif(18), fontWeight: 500 }}>{g.name}</span>
                    <span style={mono(8, FAINT)}>
                      {g.types.length} type{g.types.length === 1 ? '' : 's'}
                      {!isBandedCategory(g.id) ? ' · judged by material and place, not temperature' : ''}
                    </span>
                  </div>
                )}
                {!grouped && !isBandedCategory(g.id) && (
                  <div style={{ ...mono(8, FAINT), padding: '12px 0 2px' }}>Judged by material and place, not temperature</div>
                )}
                <div>
                  {g.types.map((t) => (
                    <TypeRow
                      key={t.id}
                      type={t}
                      ownedCount={(model.ownership.names.get(t.id) || []).length || (model.ownership.swatches.has(t.id) ? 1 : 0)}
                      unit={unit}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
