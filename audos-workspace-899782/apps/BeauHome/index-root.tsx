/**
 * THE INDEX · L0 · THE ROOT (26a — “the root, with rows you can judge”).
 *
 * One page, four READINGS of the same taxonomy under the READ IT control:
 *  · BY CATEGORY — each category heads a row with its counts and its SAMPLE
 *    RUN in four columns of names. Down: a type name. Sideways: the plate
 *    (the category NAME goes to the plate — “this is the button you were
 *    looking for — it is not a button”).
 *  · BY TEMPERATURE — the same category, one column so the bands line up,
 *    verdicts against the reader's city; “N of M shown · continue on the
 *    plate →”.
 *  · BY OCCASION — grouped by the six registers, so a type appears in every
 *    register it genuinely carries.
 *  · BY PLACE — sorted by the suitability verdict for the reader's city.
 *
 * Copy columns (29b): the taxonomy, sample runs and counts are FIX; the
 * “you own N” figures, band fills and verdicts are FIT (zero renders as
 * “—”, never an empty cell); NOTHING on this level is generated — a list is
 * for scanning, not reading.
 */
import { useMemo, useRef, useState } from 'react';
import { promoteToScout, type WardrobePiece } from './profile-data';
import { catalogDirectoryEntries } from './brands';
import { findGarmentType, type GarmentCategoryId, type GarmentType } from './garment-types';
import {
  FIELD_REGISTERS,
  FIELD_REGISTER_LABELS,
  daysInSpan,
  spanLabel,
  spanOf,
  useRegisterDays,
  verdictFor,
  type IndexModel,
} from './index-model';
import {
  ACCENT_DEEP,
  BODY,
  ControlLink,
  FAINT,
  FAINTER,
  GapTag,
  HAIRLINE,
  INK,
  NameLink,
  OutlinedControl,
  RULE,
  SECONDARY,
  SwatchRow,
  UpDownOut,
  VerdictMark,
  WALNUT,
  Withheld,
  body,
  mono,
  serif,
  type IndexNav,
} from './index-chrome';
import { usePlexMono } from './mono-type';

export type RootLens = 'category' | 'temperature' | 'occasion' | 'place';

const LENSES: Array<{ id: RootLens; label: string }> = [
  { id: 'category', label: 'By category' },
  { id: 'temperature', label: 'By temperature' },
  { id: 'occasion', label: 'By occasion' },
  { id: 'place', label: 'By place' },
];

function typesOfCategory(model: IndexModel, id: GarmentCategoryId): GarmentType[] {
  const cat = model.categories.find((c) => c.id === id);
  if (!cat) return [];
  return cat.runs.flatMap((r) => r.typeIds.map((t) => findGarmentType(t)).filter(Boolean) as GarmentType[]);
}

/** Four columns of names, column-major, the tailor's own order. */
function NameColumns({ types, model, nav, columns = 4 }: { types: GarmentType[]; model: IndexModel; nav: IndexNav; columns?: number }) {
  const rows = Math.max(1, Math.ceil(types.length / columns));
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gridAutoFlow: 'column',
        gridTemplateRows: `repeat(${rows}, auto)`,
        columnGap: '26px',
      }}
    >
      {types.map((t) => {
        const owned = model.ownership.swatches.has(t.id);
        const gap = model.gaps.has(t.id);
        return (
          <span key={t.id} style={{ padding: '3.5px 0' }}>
            {gap && <GapTag />}
            <NameLink onClick={() => nav.goType(t.id)} size={14.5} color={owned ? WALNUT : INK} title={`${t.name} — open its page`}>
              {t.name}
            </NameLink>
            {owned && <SwatchRow colours={model.ownership.swatches.get(t.id)} />}
          </span>
        );
      })}
    </div>
  );
}

export function IndexRoot({ model, pieces, nav }: { model: IndexModel; pieces: WardrobePiece[]; nav: IndexNav }) {
  usePlexMono();
  const [lens, setLens] = useState<RootLens>('category');
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const registerDays = useRegisterDays();
  const hasLedger = pieces.length > 0;
  const makerTotal = useMemo(() => catalogDirectoryEntries().length, []);

  const jumpTo = (id: string) => sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // BY PLACE — the whole taxonomy sorted into verdict shelves for the city.
  const placeShelves = useMemo(() => {
    const shelves: Record<string, GarmentType[]> = { essential: [], works: [], niche: [], 'wrong tool': [] };
    if (!model.climate.weighted) return shelves;
    for (const cat of model.categories) {
      if (!cat.banded) continue;
      for (const t of typesOfCategory(model, cat.id)) {
        const v = verdictFor(model.climate, t, model.gaps.has(t.id));
        if (v) shelves[v].push(t);
      }
    }
    return shelves;
  }, [model]);

  return (
    <div>
      {/* ——— the 26a header: title + standfirst left, the face toggle right */}
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-5 md:gap-10 md:items-end" style={{ paddingBottom: '18px', borderBottom: `1px solid ${INK}` }}>
        <div>
          <h3 style={{ ...serif(0, WALNUT), fontSize: 'clamp(30px, 4vw, 42px)', lineHeight: 1.08, letterSpacing: '-0.012em', margin: 0 }}>The Index</h3>
          <p style={{ ...body(15.5), margin: '10px 0 0', maxWidth: '62ch' }}>
            {model.typeTotal} garment types and {makerTotal} makers — one body of reference. Names are links; everything on a row is
            there so you can decide whether to open it.
          </p>
        </div>
        <div className="flex flex-col items-start md:items-end" style={{ gap: '9px' }}>
          <div className="flex" role="group" aria-label="What the list is of">
            <button type="button" aria-pressed className="transition-colors" style={{ ...mono(9, '#5c3413'), background: 'rgba(168,113,44,0.12)', border: `1px solid ${ACCENT_DEEP}`, padding: '7px 14px' }}>
              Pieces · {model.typeTotal}
            </button>
            <button type="button" onClick={() => nav.goMakers()} className="transition-colors hover:bg-[rgba(168,113,44,0.06)]" style={{ ...mono(9, SECONDARY), background: 'transparent', border: `1px solid ${HAIRLINE}`, borderLeftWidth: 0, padding: '7px 14px' }}>
              Makers · {makerTotal}
            </button>
          </div>
          <span style={{ ...mono(8, FAINT), whiteSpace: 'nowrap' }}>· One page · The toggle changes what the list is of ·</span>
        </div>
      </div>

      {/* ——— the find line (opens the jump · 29d) + READ IT */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] items-center" style={{ gap: '12px 28px', padding: '16px 0' }}>
        <button
          type="button"
          onClick={nav.openJump}
          className="flex items-center text-left hover:border-[var(--color-accent,#a8712c)] transition-colors"
          style={{ gap: '14px', border: `1px solid ${RULE}`, padding: '10px 14px', maxWidth: '520px', background: 'transparent' }}
          aria-label="Search the Index — a type, a cut, a maker"
        >
          <span style={mono(8.5, FAINT)}>Find</span>
          <span style={{ ...body(14, FAINT), flex: 1 }}>a type or a maker — try “teba”, “raglan”, “Rubinacci”</span>
          <span style={mono(8.5, FAINTER)}>⌘K</span>
        </button>
        <div className="flex flex-wrap items-baseline" style={{ gap: '6px 18px' }}>
          <span style={mono(8.5, FAINT)}>Read it</span>
          {LENSES.map((l) => {
            const on = l.id === lens;
            return (
              <button key={l.id} type="button" onClick={() => setLens(l.id)} aria-pressed={on} style={{ ...mono(9, on ? WALNUT : SECONDARY), background: 'transparent', padding: '0 0 2px', borderBottom: on ? `1px solid ${ACCENT_DEEP}` : '1px solid transparent' }}>
                {l.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ——— the category strip — counts, each a jump to its section */}
      {(lens === 'category' || lens === 'temperature') && (
        <div className="flex flex-wrap" style={{ gap: '6px 20px', paddingBottom: '10px', borderBottom: `1px solid ${HAIRLINE}` }}>
          {model.categories.map((cat) => (
            <button key={cat.id} type="button" onClick={() => jumpTo(cat.id)} className="hover:underline" style={{ ...mono(8.5, SECONDARY), background: 'transparent', padding: 0 }}>
              {cat.name} <span style={{ color: FAINTER }}>{cat.total}</span>
            </button>
          ))}
        </div>
      )}

      {/* ——— BY CATEGORY · each category heads a row with its sample run */}
      {lens === 'category' &&
        model.categories.map((cat) => {
          const sample = cat.runs[0];
          const sampleTypes = (sample?.typeIds || []).map((t) => findGarmentType(t)).filter(Boolean) as GarmentType[];
          return (
            <section key={cat.id} ref={(el) => { sectionRefs.current[cat.id] = el; }} aria-label={cat.name} style={{ padding: '26px 0 10px', borderBottom: `1px solid ${HAIRLINE}`, scrollMarginTop: '72px' }}>
              <div className="flex items-end justify-between flex-wrap" style={{ gap: '10px 24px' }}>
                <div className="flex items-baseline flex-wrap" style={{ gap: '4px 14px' }}>
                  <NameLink onClick={() => nav.goPlate(cat.id)} size={25} title={`Open the ${cat.name} plate`}>
                    {cat.name}
                  </NameLink>
                  <span style={mono(8.5, FAINT)}>
                    {cat.total} types · {hasLedger ? `you own ${cat.ownedCount}` : 'you own —'}
                  </span>
                </div>
                {cat.banded && <OutlinedControl onClick={() => nav.goRuler(cat.id)}>All {cat.total} on one ruler →</OutlinedControl>}
              </div>
              {sample && (
                <div style={{ marginTop: '14px' }}>
                  <div style={{ ...mono(8.5, FAINT), marginBottom: '8px' }}>
                    {sample.label} · {sample.typeIds.length} <span style={{ color: FAINTER, textTransform: 'none', letterSpacing: '0.02em' }}>— the sample run; the plate holds all {cat.total}</span>
                  </div>
                  <NameColumns types={sampleTypes} model={model} nav={nav} />
                </div>
              )}
            </section>
          );
        })}

      {/* ——— BY TEMPERATURE · one column so the bands line up */}
      {lens === 'temperature' &&
        model.categories.map((cat) => {
          if (!cat.banded) {
            return (
              <section key={cat.id} ref={(el) => { sectionRefs.current[cat.id] = el; }} style={{ padding: '24px 0 10px', borderBottom: `1px solid ${HAIRLINE}`, scrollMarginTop: '72px' }}>
                <div className="flex items-baseline" style={{ gap: '14px' }}>
                  <NameLink onClick={() => nav.goPlate(cat.id)} size={22}>{cat.name}</NameLink>
                  <span style={{ ...body(13, FAINT) }}>No temperature band — judged by material and place.</span>
                </div>
              </section>
            );
          }
          const types = typesOfCategory(model, cat.id)
            .slice()
            .sort((a, b) => (spanOf(a)?.lo ?? 99) - (spanOf(b)?.lo ?? 99));
          const shown = types.slice(0, 17);
          return (
            <section key={cat.id} ref={(el) => { sectionRefs.current[cat.id] = el; }} style={{ padding: '24px 0 12px', borderBottom: `1px solid ${HAIRLINE}`, scrollMarginTop: '72px' }}>
              <div className="flex items-baseline flex-wrap" style={{ gap: '6px 14px' }}>
                <NameLink onClick={() => nav.goPlate(cat.id)} size={22}>{cat.name}</NameLink>
                <span style={mono(8.5, FAINT)}>coldest first{model.climate.city ? ` · verdicts are for ${model.climate.city}` : model.climate.weighted ? '' : ' · set a city and the verdicts fill in'}</span>
              </div>
              <div style={{ marginTop: '10px', borderTop: `1px solid ${HAIRLINE}` }}>
                {shown.map((t) => {
                  const owned = model.ownership.swatches.has(t.id);
                  const gap = model.gaps.has(t.id);
                  return (
                    <div key={t.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline" style={{ gap: '16px', padding: '7px 6px', borderBottom: `1px solid rgba(59,43,29,0.12)`, background: gap ? 'rgba(168,113,44,0.07)' : 'transparent' }}>
                      <span>
                        {gap && <GapTag />}
                        <NameLink onClick={() => nav.goType(t.id)} size={14.5} color={owned ? WALNUT : INK}>{t.name}</NameLink>
                        {owned && <SwatchRow colours={model.ownership.swatches.get(t.id)} />}
                      </span>
                      <VerdictMark verdict={verdictFor(model.climate, t, gap)} />
                      <span style={{ ...mono(8.5, SECONDARY), minWidth: '52px', textAlign: 'right' }}>{spanLabel(spanOf(t))}</span>
                    </div>
                  );
                })}
              </div>
              {types.length > shown.length && (
                <div style={{ paddingTop: '9px' }}>
                  <ControlLink onClick={() => nav.goPlate(cat.id)}>
                    {shown.length} of {types.length} shown · continue on the plate →
                  </ControlLink>
                </div>
              )}
            </section>
          );
        })}

      {/* ——— BY OCCASION · the six registers */}
      {lens === 'occasion' &&
        FIELD_REGISTERS.map((reg) => {
          const types = model.categories.flatMap((cat) => typesOfCategory(model, cat.id)).filter((t) => t.reach.includes(reg));
          const shown = types.slice(0, 24);
          const days = registerDays[reg];
          return (
            <section key={reg} style={{ padding: '24px 0 12px', borderBottom: `1px solid ${HAIRLINE}` }}>
              <div className="flex items-baseline flex-wrap" style={{ gap: '6px 14px' }}>
                <span style={serif(22)}>{FIELD_REGISTER_LABELS[reg]}</span>
                <span style={mono(8.5, FAINT)}>
                  {types.length} types {days != null ? `· about ${days} days of your year` : ''}
                </span>
              </div>
              <div style={{ marginTop: '10px' }}>
                <NameColumns types={shown} model={model} nav={nav} />
              </div>
              {types.length > shown.length && <div style={{ ...mono(8, FAINT), paddingTop: '8px' }}>{shown.length} of {types.length} shown · the plates hold the rest</div>}
            </section>
          );
        })}

      {/* ——— BY PLACE · sorted into the suitability verdict for your city */}
      {lens === 'place' &&
        (model.climate.weighted ? (
          (['essential', 'works', 'niche', 'wrong tool'] as const).map((shelf) => {
            const types = placeShelves[shelf] || [];
            const shown = types.slice(0, 28);
            return (
              <section key={shelf} style={{ padding: '24px 0 12px', borderBottom: `1px solid ${HAIRLINE}` }}>
                <div className="flex items-baseline flex-wrap" style={{ gap: '6px 14px' }}>
                  <span style={serif(22)}>{shelf === 'wrong tool' ? 'Wrong tool' : shelf.charAt(0).toUpperCase() + shelf.slice(1)}</span>
                  <span style={mono(8.5, FAINT)}>
                    {types.length} types{model.climate.city ? ` · for ${model.climate.city}` : ''}
                  </span>
                </div>
                <div style={{ marginTop: '10px' }}>
                  <NameColumns types={shown} model={model} nav={nav} />
                </div>
                {types.length > shown.length && <div style={{ ...mono(8, FAINT), paddingTop: '8px' }}>{shown.length} of {types.length} shown</div>}
              </section>
            );
          })
        ) : (
          <p style={{ ...body(14, SECONDARY), padding: '26px 0', maxWidth: '58ch' }}>
            This reading sorts every banded type into essential · works · wrong tool for the city you live in — set your
            city in the Dossier and it weights itself. Until then the bands still order and still name; they simply
            aren't weighed.
          </p>
        ))}

      {/* ——— the root's own footer controls (26a: one matrix door per root) */}
      <div className="flex flex-wrap" style={{ gap: '10px 14px', marginTop: '26px' }}>
        <OutlinedControl onClick={() => nav.goMatrix()}>The whole Index, counted →</OutlinedControl>
        <OutlinedControl onClick={() => nav.goField()}>Your year, by weather and occasion →</OutlinedControl>
      </div>

      <UpDownOut
        up={<>Nothing — this is the top of the Index.</>}
        down={
          <>
            A type name → the piece. A category name → the plate. The toggle →{' '}
            <ControlLink onClick={() => nav.goMakers()}>makers</ControlLink>.
          </>
        }
        out={
          <>
            A saved filter becomes a search in{' '}
            <ControlLink onClick={() => promoteToScout('classic menswear')}>the Hunt</ControlLink>.
          </>
        }
      />
    </div>
  );
}
