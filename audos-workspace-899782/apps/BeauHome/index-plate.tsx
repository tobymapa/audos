/**
 * THE INDEX · L1 · THE CATEGORY PLATE (26b) — all of one category as rows,
 * each with its own span drawn on the ruler. The screen that finds gaps
 * without being asked. Up: the root. Down: a type.
 *
 * Copy columns (29b): the runs, their counts and each run's one-line
 * description are FIX; the whole coverage strip — the reader's pieces'
 * bands drawn on the ruler, the holes found by subtracting that union from
 * the city's curve, “N of M owned”, the verdict column, which rows carry a
 * dashed band — is FIT, arithmetic not judgement; the one hole-summary
 * SENTENCE is GEN (slot, ships absent — the drawn strip carries the fact).
 */
import { useMemo, useState } from 'react';
import type React from 'react';
import { findGarmentType, type GarmentCategoryId, type GarmentType } from './garment-types';
import { RULER_HI, RULER_LO, daysInSpan, spanLabel, spanOf, verdictFor, type IndexModel, type TempSpan } from './index-model';
import {
  ACCENT,
  ACCENT_DEEP,
  BackLink,
  Breadcrumb,
  FAINT,
  FAINTER,
  GapTag,
  GenSlot,
  HAIRLINE,
  INK,
  NameLink,
  PAPER,
  ReadingSwitch,
  RULE,
  SECONDARY,
  UpDownOut,
  VerdictMark,
  WALNUT,
  body,
  mono,
  serif,
  type IndexNav,
} from './index-chrome';
import { usePlexMono } from './mono-type';

const RANGE = RULER_HI - RULER_LO;
const pct = (v: number) => `${(((v - RULER_LO) / RANGE) * 100).toFixed(2)}%`;
const widthPct = (s: TempSpan) => `${(((s.hi - s.lo) / RANGE) * 100).toFixed(2)}%`;

function RulerTicks() {
  return (
    <div style={{ position: 'relative', height: '14px' }}>
      {[0, 10, 20, 30].map((t) => (
        <span key={t} style={{ ...mono(8, FAINTER), position: 'absolute', left: pct(t), transform: 'translateX(-50%)' }}>
          {t}°
        </span>
      ))}
    </div>
  );
}

/** One type's span drawn on the shared scale. */
function SpanBar({ span, kind }: { span: TempSpan | null; kind: 'owned' | 'gap' | 'plain' }) {
  if (!span) return <div style={{ height: '10px' }} />;
  const styleByKind: Record<string, React.CSSProperties> = {
    owned: { background: WALNUT },
    gap: { border: `1.5px dashed ${ACCENT_DEEP}`, background: 'rgba(168,113,44,0.12)' },
    plain: { background: 'rgba(59,43,29,0.28)' },
  };
  return (
    <div style={{ position: 'relative', height: '10px' }}>
      <div style={{ position: 'absolute', top: '3.5px', left: 0, right: 0, height: '1px', background: 'rgba(59,43,29,0.12)' }} />
      <div style={{ position: 'absolute', top: kind === 'gap' ? '0px' : '1.5px', left: pct(span.lo), width: widthPct(span), height: kind === 'gap' ? '8px' : '6px', ...styleByKind[kind] }} />
    </div>
  );
}

/** The holes — stretches the city asks for that no owned span covers. FIT. */
export function holesOf(model: IndexModel, catId: GarmentCategoryId): TempSpan[] {
  if (!model.climate.bands) return [];
  const cat = model.categories.find((c) => c.id === catId);
  if (!cat || !cat.banded) return [];
  const ownedSpans = cat.runs
    .flatMap((r) => r.typeIds)
    .filter((id) => model.ownership.swatches.has(id))
    .map((id) => {
      const type = findGarmentType(id);
      return type ? spanOf(type) : null;
    })
    .filter(Boolean) as TempSpan[];
  // Degree-by-degree walk of the stretch the city spends real days in.
  const holes: TempSpan[] = [];
  let open: number | null = null;
  for (let deg = RULER_LO; deg <= RULER_HI; deg += 1) {
    const days = daysInSpan(model.climate, { lo: deg, hi: deg + 1 }) || 0;
    const asked = days >= 1.5;
    const covered = ownedSpans.some((s) => deg >= s.lo && deg < s.hi);
    if (asked && !covered) {
      if (open == null) open = deg;
    } else if (open != null) {
      if (deg - open >= 4) holes.push({ lo: open, hi: deg });
      open = null;
    }
  }
  if (open != null && RULER_HI - open >= 4) holes.push({ lo: open, hi: RULER_HI });
  return holes.slice(0, 3);
}

const RUN_FOLD = 8;

export function IndexPlate({ model, catId, nav }: { model: IndexModel; catId: GarmentCategoryId; nav: IndexNav }) {
  usePlexMono();
  const [unfolded, setUnfolded] = useState<Set<string>>(new Set());
  const cat = model.categories.find((c) => c.id === catId);
  const holes = useMemo(() => holesOf(model, catId), [model, catId]);
  if (!cat) return null;

  const ownedIds = cat.runs.flatMap((r) => r.typeIds).filter((id) => model.ownership.swatches.has(id));
  const ownedTypes = ownedIds.map((id) => findGarmentType(id)).filter(Boolean) as GarmentType[];

  const toggleRun = (label: string) =>
    setUnfolded((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });

  return (
    <div>
      <BackLink label="the Index" onClick={nav.back} />
      <div style={{ marginTop: '10px' }}>
        <Breadcrumb segs={[{ label: 'The Index', onClick: nav.goRoot }, { label: `${cat.name} · ${cat.total}` }]} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px]" style={{ gap: '20px 48px', marginTop: '16px', paddingBottom: '20px', borderBottom: `1px solid ${INK}` }}>
        <div>
          <h3 style={{ ...serif(0), fontSize: 'clamp(28px, 3.6vw, 38px)', lineHeight: 1.08, margin: 0 }}>{cat.name}</h3>
          <p style={{ ...body(15), margin: '10px 0 0', maxWidth: '64ch' }}>
            {cat.total} types, {cat.runs.length} run{cat.runs.length === 1 ? '' : 's'}{cat.banded ? ', one ruler. Read down for what a run is; read across for what temperature it answers. Your own rack is drawn across the top in the same scale — the holes are where you have nothing to put on.' : '. No temperature band — this category is judged by material and place, so the plate is simply shorter.'}
          </p>
        </div>
        <div>
          <div className="flex items-start justify-between" style={{ gap: '12px' }}>
            <div style={mono(8.5, ACCENT_DEEP)}>This category, against your ledger</div>
            <ReadingSwitch active="list" onChange={(r) => { if (r === 'quadrant') nav.goQuadrant('pieces'); if (r === 'ruler') nav.goRuler(cat.id); if (r === 'matrix') nav.goMatrix(); if (r === 'field') nav.goField(); }} />
          </div>
          <div style={{ ...serif(19), marginTop: '10px' }}>
            {cat.ownedCount} of {cat.total} owned
          </div>
          {/* GEN · the one generated sentence on this level — ships absent. */}
          <GenSlot slot="plate-holes" scope={`category:${cat.id}`} />
          {cat.banded && (
            <div style={{ marginTop: '12px', border: `1px solid ${RULE}`, background: PAPER, padding: '12px 14px' }}>
              <div style={mono(8, FAINT)}>What you can already put on, on the same ruler</div>
              <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
                {ownedTypes.slice(0, 4).map((t) => (
                  <div key={t.id}>
                    <div className="flex items-baseline justify-between">
                      <span style={{ ...body(12, INK) }}>{t.name}</span>
                      <span style={mono(7.5, FAINT)}>{spanLabel(spanOf(t))}</span>
                    </div>
                    <SpanBar span={spanOf(t)} kind="owned" />
                  </div>
                ))}
                {ownedTypes.length === 0 && <div style={{ ...body(12.5, SECONDARY) }}>Nothing of this category in your ledger yet — the whole ruler is open.</div>}
                {holes.map((h) => (
                  <div key={`${h.lo}-${h.hi}`}>
                    <div className="flex items-baseline justify-between">
                      <span style={{ ...mono(7.5, ACCENT_DEEP) }}>Nothing at all · {h.lo}–{h.hi}°</span>
                    </div>
                    <SpanBar span={h} kind="gap" />
                  </div>
                ))}
                <RulerTicks />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ——— the column heads */}
      <div className="grid grid-cols-[minmax(0,5fr)_minmax(0,6fr)_minmax(0,2fr)] items-baseline" style={{ gap: '18px', padding: '12px 6px 8px', borderBottom: `1px solid ${RULE}` }}>
        <span style={mono(8.5, FAINT)}>Run · type</span>
        {cat.banded ? (
          <div>
            <RulerTicks />
          </div>
        ) : (
          <span style={mono(8.5, FAINTER)}>Band — none</span>
        )}
        <span style={{ ...mono(8.5, FAINT), textAlign: 'right' }}>Verdict</span>
      </div>

      {/* ——— the runs */}
      {cat.runs.map((run) => {
        const types = run.typeIds.map((id) => findGarmentType(id)).filter(Boolean) as GarmentType[];
        const open = unfolded.has(run.label);
        const shown = open || types.length <= RUN_FOLD + 2 ? types : types.slice(0, RUN_FOLD);
        const hidden = types.length - shown.length;
        const hiddenNames = hidden > 0 ? types.slice(RUN_FOLD).map((t) => t.name.split(' ').slice(-1)[0].toLowerCase()).slice(0, 6).join(', ') : '';
        return (
          <section key={run.label} aria-label={`${run.label} — the run`} style={{ padding: '4px 0 8px' }}>
            <div className="flex items-baseline flex-wrap" style={{ gap: '4px 12px', padding: '14px 6px 6px' }}>
              <span style={serif(17)}>{run.label}</span>
              <span style={mono(8.5, FAINT)}>{types.length}</span>
              <span style={{ ...body(12.5, SECONDARY) }}>{run.note}</span>
            </div>
            <div style={{ borderTop: `1px solid ${HAIRLINE}` }}>
              {shown.map((t) => {
                const owned = model.ownership.swatches.has(t.id);
                const gap = model.gaps.has(t.id);
                const kind = owned ? 'owned' : gap ? 'gap' : 'plain';
                return (
                  <div
                    key={t.id}
                    className="grid grid-cols-[minmax(0,5fr)_minmax(0,6fr)_minmax(0,2fr)] items-center"
                    style={{ gap: '18px', padding: '7px 6px', borderBottom: '1px solid rgba(59,43,29,0.12)', background: gap ? 'rgba(168,113,44,0.07)' : 'transparent' }}
                  >
                    <span>
                      {gap && <GapTag />}
                      <NameLink onClick={() => nav.goType(t.id)} size={14.5} color={INK}>{t.name}</NameLink>
                      {owned && <span style={{ ...mono(7.5, FAINT), marginLeft: '8px' }}>Owned</span>}
                    </span>
                    {cat.banded ? <SpanBar span={spanOf(t)} kind={kind} /> : <span />}
                    <span style={{ textAlign: 'right' }}>
                      {owned && !gap ? <span style={mono(8.5, SECONDARY)}>Owned</span> : <VerdictMark verdict={verdictFor(model.climate, t, gap)} />}
                    </span>
                  </div>
                );
              })}
            </div>
            {(hidden > 0 || (open && types.length > RUN_FOLD + 2)) && (
              <button type="button" onClick={() => toggleRun(run.label)} className="hover:underline text-left" style={{ ...mono(8, ACCENT_DEEP), background: 'transparent', padding: '8px 6px 0' }}>
                {open ? 'Fold the run ↑' : `${hidden} more — ${hiddenNames} ↓`}
              </button>
            )}
          </section>
        );
      })}

      <UpDownOut
        up={<>The Index root — the breadcrumb, always top left.</>}
        down={<>Any type name → its page. A dashed band → the same page, arriving at the gap.</>}
        out={
          holes.length > 0 ? (
            <>The {holes[0].lo}–{holes[0].hi}° hole is the gap worth closing first — ask Beau in the chat.</>
          ) : (
            <>Every band here is covered — ask Beau in the chat when one opens.</>
          )
        }
      />
    </div>
  );
}
