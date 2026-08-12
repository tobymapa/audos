/**
 * THE INDEX · PIECES — the temperature-anchored reference (full restart).
 *
 * One flat view, no deeper navigation. Three filter tiers stacked at the
 * top — category (single-select), sub-category (the tailor's runs of the
 * selected category, multi-select), and formality register (multi-select)
 * — with one Reset that clears all three at once.
 *
 * Below them, the reference table: a fixed vertical temperature scale on
 * the left (cold at the top, warm at the bottom — the eight apparent-
 * temperature bands of temperature-bands.ts), and to its right every
 * visible garment type as a row: its name and a solid horizontal bar
 * spanning the temperatures it answers, drawn against one shared °C track
 * so cold-weather pieces, all-season pieces and hot-weather pieces read at
 * a glance. Types the reader owns draw solid; types they don't draw
 * outlined. The scale itself never changes — filters only decide which
 * rows appear beside it.
 *
 * Data is untouched: garment-types.ts (the canon), garment-type-runs.ts
 * (the runs), temperature-bands.ts (the bands), index-model.ts (spans,
 * ownership, climate).
 */
import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import type { Register } from './brands';
import { findGarmentType, type GarmentCategoryId, type GarmentType } from './garment-types';
import { TEMPERATURE_BANDS, type TemperatureBand } from './temperature-bands';
import {
  FIELD_REGISTER_LABELS,
  RULER_HI,
  RULER_LO,
  isBandedCategory,
  spanLabel,
  spanOf,
  type IndexModel,
} from './index-model';
import {
  ACCENT_DEEP,
  FAINT,
  FAINTER,
  HAIRLINE,
  INK,
  RULE,
  SECONDARY,
  WALNUT,
  body,
  mono,
  serif,
  type IndexNav,
} from './index-chrome';
import { usePlexMono } from './mono-type';

// The three tiers' option sets. Tier 3 is the extended register union, in
// the brief's order.
const REGISTER_OPTIONS: Register[] = ['Casual', 'Smart-Casual', 'Business', 'Formal', 'Black-Tie', 'Outdoor-Work'];

// The shared °C track — one axis for every bar.
const pctOf = (deg: number) => ((deg - RULER_LO) / (RULER_HI - RULER_LO)) * 100;
const TRACK_MARKS = [-10, 0, 10, 20, 30];

// ---------------------------------------------------------------------------
// Chips — clean lozenges, one treatment for all three tiers.
// ---------------------------------------------------------------------------

function Chip({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className="transition-colors flex-shrink-0"
      style={{
        ...mono(9, active ? '#5c3413' : SECONDARY),
        background: active ? 'rgba(168,113,44,0.14)' : 'transparent',
        border: `1px solid ${active ? ACCENT_DEEP : HAIRLINE}`,
        borderRadius: '999px',
        padding: '8px 15px',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

function TierLabel({ children }: { children: string }) {
  return <span style={{ ...mono(8, FAINT), flexShrink: 0, width: '74px', paddingTop: '10px' }}>{children}</span>;
}

// ---------------------------------------------------------------------------
// The bar track — shared gridlines, one bar per row.
// ---------------------------------------------------------------------------

function BarTrack({ span, owned }: { span: { lo: number; hi: number }; owned: boolean }) {
  const left = pctOf(span.lo);
  const width = Math.max(1.5, pctOf(span.hi) - pctOf(span.lo));
  return (
    <div aria-hidden style={{ position: 'relative', height: '14px', minWidth: 0 }}>
      {TRACK_MARKS.map((deg) => (
        <span key={deg} style={{ position: 'absolute', left: `${pctOf(deg)}%`, top: 0, bottom: 0, width: '1px', background: 'rgba(59,43,29,0.12)' }} />
      ))}
      <span
        style={{
          position: 'absolute',
          left: `${left}%`,
          width: `${width}%`,
          top: '2px',
          bottom: '2px',
          background: owned ? WALNUT : 'rgba(59,43,29,0.07)',
          border: owned ? `1px solid ${WALNUT}` : `1px solid ${RULE}`,
        }}
      />
    </div>
  );
}

/** The °C header the bars anchor to — sticky, so the axis never scrolls
 * out from under the bars. */
function TrackHeader() {
  return (
    <div
      aria-hidden
      style={{ position: 'relative', height: '22px', borderBottom: `1px solid ${RULE}` }}
    >
      {TRACK_MARKS.map((deg) => (
        <span
          key={deg}
          style={{
            ...mono(7.5, FAINT),
            position: 'absolute',
            left: `${pctOf(deg)}%`,
            bottom: '4px',
            transform: deg === RULER_LO ? 'none' : 'translateX(-50%)',
            whiteSpace: 'nowrap',
          }}
        >
          {deg}°
        </span>
      ))}
      <span style={{ ...mono(7.5, FAINT), position: 'absolute', right: 0, bottom: '4px' }}>{RULER_HI}°C</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One reference row — name · bar · span. Owned reads solid and carries the
// word; a type the reader doesn't own draws outlined, a shade lighter.
// ---------------------------------------------------------------------------

function TypeRow({ type, owned }: { type: GarmentType; owned: boolean }) {
  const span = spanOf(type);
  return (
    <div
      id={`index-type-${type.id}`}
      className="grid grid-cols-[minmax(120px,220px)_minmax(0,1fr)_52px] items-center"
      style={{ gap: '14px', padding: '8.5px 0', borderBottom: '1px solid rgba(59,43,29,0.1)', scrollMarginTop: '96px' }}
    >
      <span className="min-w-0">
        <span style={{ fontFamily: 'var(--space-font-heading)', fontSize: '14.5px', fontWeight: 400, lineHeight: 1.3, color: owned ? WALNUT : INK }}>
          {type.name}
        </span>
        {owned && <span style={{ ...mono(7.5, FAINT), marginLeft: '8px', whiteSpace: 'nowrap' }}>Owned</span>}
      </span>
      {span ? <BarTrack span={span} owned={owned} /> : <span style={mono(8.5, FAINTER)}>—</span>}
      <span style={{ ...mono(8, SECONDARY), textAlign: 'right' }}>{spanLabel(span)}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The view.
// ---------------------------------------------------------------------------

export function IndexPieces({
  model,
  nav,
  focusTypeId,
  onFocusHandled,
}: {
  model: IndexModel;
  nav: IndexNav;
  /** A type another surface (the jump, a maker page) asked to land on. */
  focusTypeId?: string | null;
  onFocusHandled?: () => void;
}) {
  usePlexMono();
  const [cat, setCat] = useState<GarmentCategoryId | null>(null);
  const [runsSel, setRunsSel] = useState<string[]>([]);
  const [regs, setRegs] = useState<Register[]>([]);

  const reset = () => {
    setCat(null);
    setRunsSel([]);
    setRegs([]);
  };

  const pickCategory = (next: GarmentCategoryId | null) => {
    setCat(next);
    setRunsSel([]); // tier 2 is contextual to tier 1
  };

  const toggleRun = (label: string) =>
    setRunsSel((cur) => (cur.includes(label) ? cur.filter((l) => l !== label) : [...cur, label]));

  const toggleReg = (reg: Register) =>
    setRegs((cur) => (cur.includes(reg) ? cur.filter((r) => r !== reg) : [...cur, reg]));

  // Landing on a type from elsewhere: show everything, then scroll to it.
  useEffect(() => {
    if (!focusTypeId) return;
    reset();
    const timer = window.setTimeout(() => {
      const el = document.getElementById(`index-type-${focusTypeId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        try {
          el.animate(
            [{ backgroundColor: 'rgba(168,113,44,0.22)' }, { backgroundColor: 'rgba(168,113,44,0)' }],
            { duration: 1800 },
          );
        } catch { /* older engines skip the flash */ }
      }
      onFocusHandled?.();
    }, 380);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTypeId]);

  const runsOfCat = useMemo(
    () => (cat ? (model.categories.find((c) => c.id === cat)?.runs || []).map((r) => r.label) : []),
    [model, cat],
  );

  // The filtered set, in one pass over the model.
  const { byBand, unbanded, shownTotal } = useMemo(() => {
    const byBand = new Map<TemperatureBand, GarmentType[]>();
    const unbanded: GarmentType[] = [];
    let shownTotal = 0;
    for (const c of model.categories) {
      if (cat && c.id !== cat) continue;
      for (const run of c.runs) {
        if (cat && runsSel.length > 0 && !runsSel.includes(run.label)) continue;
        for (const id of run.typeIds) {
          const t = findGarmentType(id);
          if (!t) continue;
          if (regs.length > 0 && !t.reach.some((r) => regs.includes(r))) continue;
          shownTotal += 1;
          if (isBandedCategory(t.category)) {
            byBand.set(t.band, [...(byBand.get(t.band) || []), t]);
          } else {
            unbanded.push(t);
          }
        }
      }
    }
    for (const list of byBand.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    unbanded.sort((a, b) => a.name.localeCompare(b.name));
    return { byBand, unbanded, shownTotal };
  }, [model, cat, runsSel, regs]);

  const filtersActive = cat != null || runsSel.length > 0 || regs.length > 0;

  return (
    <div>
      {/* ——— header: title + standfirst left, the face toggle right */}
      <div
        className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-5 md:gap-10 md:items-end"
        style={{ paddingBottom: '18px', borderBottom: `1px solid ${INK}` }}
      >
        <div>
          <h3 style={{ ...serif(0, WALNUT), fontSize: 'clamp(30px, 4vw, 42px)', lineHeight: 1.08, letterSpacing: '-0.012em', margin: 0 }}>
            The Index
          </h3>
          <p style={{ ...body(15), margin: '10px 0 0', maxWidth: '62ch' }}>
            Every piece type, set against the temperatures it answers. Solid bars you own; outlined bars you don’t.
          </p>
        </div>
        <div className="flex flex-col items-start md:items-end" style={{ gap: '9px' }}>
          <div className="flex" role="group" aria-label="What the list is of">
            <button
              type="button"
              aria-pressed
              style={{ ...mono(9, '#5c3413'), background: 'rgba(168,113,44,0.12)', border: `1px solid ${ACCENT_DEEP}`, padding: '7px 14px' }}
            >
              Pieces · {model.typeTotal}
            </button>
            <button
              type="button"
              onClick={() => nav.goMakers()}
              className="transition-colors hover:bg-[rgba(168,113,44,0.06)]"
              style={{ ...mono(9, SECONDARY), background: 'transparent', border: `1px solid ${HAIRLINE}`, borderLeftWidth: 0, padding: '7px 14px' }}
            >
              Makers
            </button>
          </div>
          <button
            type="button"
            onClick={nav.openJump}
            className="hover:underline"
            style={{ ...mono(8, FAINT), background: 'transparent', padding: 0 }}
          >
            Find a type or a maker · ⌘K
          </button>
        </div>
      </div>

      {/* ——— the filter bar: three tiers stacked, Reset at the top right */}
      <div style={{ padding: '16px 0 14px', borderBottom: `1px solid ${HAIRLINE}` }}>
        {/* Tier 1 · category — single-select, horizontally scrollable */}
        <div className="flex items-start" style={{ gap: '12px' }}>
          <TierLabel>Category</TierLabel>
          <div className="flex overflow-x-auto min-w-0 flex-1" style={{ gap: '8px', paddingBottom: '4px' }}>
            <Chip active={cat == null} onClick={() => pickCategory(null)}>All</Chip>
            {model.categories.map((c) => (
              <Chip key={c.id} active={cat === c.id} onClick={() => pickCategory(cat === c.id ? null : c.id)}>
                {c.name}
              </Chip>
            ))}
          </div>
          <button
            type="button"
            onClick={reset}
            title="Clear all three filter tiers"
            className="transition-colors flex-shrink-0 hover:bg-[rgba(168,113,44,0.06)]"
            style={{
              ...mono(8.5, filtersActive ? ACCENT_DEEP : FAINTER),
              background: 'transparent',
              border: `1px solid ${filtersActive ? ACCENT_DEEP : HAIRLINE}`,
              borderRadius: '999px',
              padding: '8px 14px',
              whiteSpace: 'nowrap',
            }}
          >
            Reset ×
          </button>
        </div>

        {/* Tier 2 · sub-category — the selected category's runs */}
        {cat != null && runsOfCat.length > 0 && (
          <div className="flex items-start" style={{ gap: '12px', marginTop: '10px' }}>
            <TierLabel>Group</TierLabel>
            <div className="flex flex-wrap min-w-0 flex-1" style={{ gap: '8px' }}>
              {runsOfCat.map((label) => (
                <Chip key={label} active={runsSel.includes(label)} onClick={() => toggleRun(label)}>
                  {label}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {/* Tier 3 · formality register — always visible, multi-select */}
        <div className="flex items-start" style={{ gap: '12px', marginTop: '10px' }}>
          <TierLabel>Occasion</TierLabel>
          <div className="flex flex-wrap min-w-0 flex-1" style={{ gap: '8px' }}>
            {REGISTER_OPTIONS.map((reg) => (
              <Chip key={reg} active={regs.includes(reg)} onClick={() => toggleReg(reg)}>
                {FIELD_REGISTER_LABELS[reg] || reg}
              </Chip>
            ))}
          </div>
        </div>
      </div>

      {/* ——— the count line */}
      <div style={{ ...mono(8, FAINT), padding: '12px 0 2px' }}>
        {shownTotal} of {model.typeTotal} types{model.ownedTotal > 0 ? ` · you own ${model.ownedTotal}` : ''}
        {shownTotal === 0 ? ' — nothing answers this combination; Reset to see everything' : ''}
      </div>

      {/* ——— the temperature-anchored table */}
      <div>
        {/* the °C header the bars anchor to — mirrors the row grid */}
        <div
          className="grid grid-cols-[64px_minmax(120px,220px)_minmax(0,1fr)_52px] items-end"
          style={{ gap: '0 14px', position: 'sticky', top: 0, zIndex: 3, background: 'var(--color-bg,#efe7d9)', paddingTop: '6px' }}
        >
          <span style={{ ...mono(7.5, FAINT), paddingBottom: '6px' }}>°C</span>
          <span aria-hidden style={{ borderBottom: `1px solid ${RULE}`, height: '22px' }} />
          <TrackHeader />
          <span aria-hidden style={{ borderBottom: `1px solid ${RULE}`, height: '22px' }} />
        </div>

        {/* eight bands, coldest at the top — the scale is FIXED: every band
            stays on the rail whatever the filters show beside it */}
        {TEMPERATURE_BANDS.map((band) => {
          const rows = byBand.get(band.id) || [];
          return (
            <section
              key={band.id}
              aria-label={`${band.label} — ${rows.length} types`}
              className="grid grid-cols-[64px_minmax(0,1fr)]"
              style={{ gap: '0 14px', borderBottom: `1px solid ${HAIRLINE}` }}
            >
              {/* the scale cell — the left column's vertical thermometer */}
              <div style={{ borderRight: `1px solid ${RULE}`, padding: '12px 8px 12px 0' }}>
                <div style={mono(8.5, WALNUT)}>{band.tempMin == null ? `< ${band.tempMax}°` : band.tempMax == null ? `> ${band.tempMin}°` : `${band.tempMin}–${band.tempMax}°`}</div>
                <div style={{ ...mono(7.5, FAINT), marginTop: '3px' }}>{band.label}</div>
              </div>
              {/* the rows whose home this band is */}
              <div style={{ padding: '4px 0 6px' }}>
                {rows.length > 0 ? (
                  rows.map((t) => <TypeRow key={t.id} type={t} owned={model.ownership.swatches.has(t.id)} />)
                ) : (
                  <div style={{ ...mono(8, FAINTER), padding: '10px 0' }}>—</div>
                )}
              </div>
            </section>
          );
        })}

        {/* accessories & bags carry no band — judged by material and place */}
        {unbanded.length > 0 && (
          <section
            aria-label="No temperature band"
            className="grid grid-cols-[64px_minmax(0,1fr)]"
            style={{ gap: '0 14px', borderBottom: `1px solid ${HAIRLINE}` }}
          >
            <div style={{ borderRight: `1px solid ${RULE}`, padding: '12px 8px 12px 0' }}>
              <div style={mono(8.5, WALNUT)}>No band</div>
              <div style={{ ...mono(7.5, FAINT), marginTop: '3px' }}>Any season</div>
            </div>
            <div style={{ padding: '4px 0 6px' }}>
              <div style={{ ...mono(7.5, FAINT), padding: '8px 0 2px' }}>Judged by material and place, not temperature</div>
              {unbanded.map((t) => (
                <TypeRow key={t.id} type={t} owned={model.ownership.swatches.has(t.id)} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
