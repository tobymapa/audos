/**
 * THE INDEX · L2 · THE TYPE PAGE (24a) — where the walk lands. Seven
 * fields, and every type carries all seven: band · registers & occasions ·
 * place · colours · cuts · makers · neighbours. Up: the plate. Down: a cut.
 * Across: a maker. Out: the Ledger — the tab's only exit.
 *
 * Field sets by category (25a): the unbanded categories (accessories,
 * bags) drop band and place — an empty field is worse than an absent one,
 * so the page is simply shorter.
 *
 * Copy columns (29b): fields 1, 2, 5, 6 are FIX; field 4's order and
 * field 7's neighbours are FIT; the verdict paragraph and per-place
 * reasoning are GEN slots G1–G3 — shipped ABSENT (Task 3 wires them), and
 * the page reads correctly without them by design.
 */
import { useMemo } from 'react';
import type { StyleProfile, WardrobePiece } from './profile-data';
import { PieceBrandPicks } from './piece-recommendations';
import { findCatalogBrand, verifiedBrandWebsiteUrl, PRICE_BAND_SYMBOL, type BrandProfile } from './brands';
import { findGarmentType, type GarmentType } from './garment-types';
import { runOfType } from './garment-type-runs';
import { temperatureBandLabel, temperatureBandRange } from './temperature-bands';
import {
  categoryName,
  daysInBand,
  daysInSpan,
  isBandedCategory,
  neighboursOf,
  spanLabel,
  spanOf,
  verdictFor,
  FIELD_REGISTER_LABELS,
  type IndexModel,
} from './index-model';
import {
  ACCENT_DEEP,
  BackLink,
  Breadcrumb,
  ControlLink,
  FAINT,
  FAINTER,
  GenSlot,
  HAIRLINE,
  INK,
  NameLink,
  OutlinedControl,
  PAPER,
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

function FieldHead({ n, title, note }: { n: number; title: string; note?: string }) {
  return (
    <div className="flex items-baseline flex-wrap" style={{ gap: '4px 12px', paddingBottom: '8px', borderBottom: `1px solid ${RULE}`, marginTop: '30px' }}>
      <span style={mono(8, FAINTER)}>{String(n).padStart(2, '0')}</span>
      <span style={serif(19)}>{title}</span>
      {note && <span style={mono(8, FAINT)}>{note}</span>}
    </div>
  );
}

/** Maker rows for one type — the catalog's own facts, REF marked. FIX. */
function makerRows(type: GarmentType): Array<{ name: string; profile: BrandProfile | null; ref: boolean }> {
  return type.makers.map((name) => {
    const profile = findCatalogBrand(name);
    const ref = !!profile?.referenceFor && type.name.toLowerCase().includes(profile.referenceFor.toLowerCase().split(' ').slice(-1)[0]);
    return { name, profile, ref };
  });
}

export function IndexTypePage({
  model,
  typeId,
  nav,
  profile = null,
  pieces = [],
}: {
  model: IndexModel;
  typeId: string;
  nav: IndexNav;
  profile?: StyleProfile | null;
  pieces?: WardrobePiece[];
}) {
  usePlexMono();
  const type = findGarmentType(typeId);
  const home = useMemo(() => (type ? runOfType(type.id) : null), [type]);
  if (!type) return null;

  const banded = isBandedCategory(type.category);
  const span = spanOf(type);
  const owned = model.ownership.swatches.has(type.id);
  const ownedNames = model.ownership.names.get(type.id) || [];
  const gapRank = model.gaps.get(type.id) || null;
  const verdict = verdictFor(model.climate, type, !!gapRank);
  const days = daysInSpan(model.climate, span);
  const bandDays = daysInBand(model.climate, type.band);
  const makers = makerRows(type);
  const neighbours = neighboursOf(type);
  const cat = model.categories.find((c) => c.id === type.category) || null;
  const catTotal = cat?.total || 0;

  // Forward/back — the arrows step piece-to-piece through the category, in
  // the plate's own run order, skipping rows the reader removed.
  const catTypeIds = cat ? cat.runs.flatMap((r) => r.typeIds) : [];
  const at = catTypeIds.indexOf(type.id);
  const prevType = at > 0 ? findGarmentType(catTypeIds[at - 1]) : null;
  const nextType = at >= 0 && at < catTypeIds.length - 1 ? findGarmentType(catTypeIds[at + 1]) : null;

  return (
    <div>
      <div className="flex items-baseline justify-between flex-wrap" style={{ gap: '8px 24px' }}>
        <BackLink label={nav.backLabel} onClick={nav.back} />
        {at >= 0 && (
          <span className="inline-flex items-baseline flex-wrap" style={{ gap: '6px 18px' }}>
            {prevType && <ControlLink onClick={() => nav.goType(prevType.id)}>← {prevType.name}</ControlLink>}
            <span style={mono(8, FAINTER)}>{at + 1} of {catTypeIds.length}</span>
            {nextType && <ControlLink onClick={() => nav.goType(nextType.id)}>{nextType.name} →</ControlLink>}
          </span>
        )}
      </div>
      <div style={{ marginTop: '10px' }}>
        <Breadcrumb
          segs={[
            { label: 'The Index', onClick: nav.goRoot },
            { label: `${categoryName(type.category)} · ${catTotal}`, onClick: () => nav.goPlate(type.category) },
            ...(home ? [{ label: `${home.run.label} · ${home.run.typeIds.length}`, onClick: () => nav.goPlate(type.category) }] : []),
            { label: type.name },
          ]}
        />
      </div>

      {/* ——— the head: name left, the ledger panel right */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px]" style={{ gap: '20px 48px', marginTop: '16px', paddingBottom: '22px', borderBottom: `1px solid ${INK}` }}>
        <div>
          <h3 style={{ ...serif(0), fontSize: 'clamp(28px, 3.6vw, 38px)', lineHeight: 1.08, margin: 0 }}>{type.name}</h3>
          <div style={{ ...mono(8.5, FAINT), marginTop: '10px' }}>
            {categoryName(type.category)}{home ? ` · ${home.run.label}` : ''}{banded ? ` · centres at ${temperatureBandLabel(type.band).toLowerCase()} (${temperatureBandRange(type.band)})` : ' · no temperature band'}
          </div>
          {/* GEN · G1 — whether this type earns a place; ships absent. */}
          <GenSlot slot="G1" scope={`type:${type.id}`} style={{ marginTop: '12px' }} />
        </div>
        <div style={{ border: `1px solid ${RULE}`, background: PAPER, padding: '14px 16px' }}>
          <div style={mono(8.5, ACCENT_DEEP)}>Against your ledger</div>
          <div style={{ ...serif(18), marginTop: '9px' }}>
            {owned ? `You own ${ownedNames.length === 1 ? 'one' : String(ownedNames.length)}.` : gapRank ? `A gap your board names — #${gapRank}.` : 'You own none.'}
          </div>
          {ownedNames.length > 0 && <div style={{ ...body(13, SECONDARY), marginTop: '6px' }}>{ownedNames.join(' · ')}</div>}
          {cat && (
            <div style={{ ...mono(8, FAINT), marginTop: '8px' }}>
              {categoryName(type.category)} coverage · {model.ownedTotal > 0 ? `${cat.ownedCount} of ${cat.total} types owned` : '—'}
            </div>
          )}
          <div className="flex flex-wrap" style={{ gap: '8px 10px', marginTop: '14px' }}>
            <OutlinedControl onClick={() => window.dispatchEvent(new CustomEvent('ethaion:add-piece', { detail: { name: type.name } }))}>Log one I own</OutlinedControl>
          </div>
        </div>
      </div>

      {/* ——— field 1 · temperature band (banded categories only) */}
      {banded && span && (
        <section>
          <FieldHead n={1} title="Temperature band" note={model.climate.city ? `${model.climate.city} · reads your city, set in the Dossier` : 'set a city in the Dossier and the days fill in'} />
          <div className="grid grid-cols-1 md:grid-cols-[auto_minmax(0,1fr)]" style={{ gap: '14px 44px', marginTop: '14px', alignItems: 'baseline' }}>
            <div>
              <div style={{ ...serif(30) }}>{spanLabel(span)}C</div>
              <div style={{ ...mono(8.5, FAINT), marginTop: '4px' }}>centres in {temperatureBandLabel(type.band).toLowerCase()} · {temperatureBandRange(type.band)}</div>
            </div>
            <div>
              <div style={{ ...body(14) }}>
                <span style={mono(8.5, ACCENT_DEEP)}>What the band buys you · </span>
                {days != null ? (
                  <>
                    {days} days a year{model.climate.city ? ` in ${model.climate.city}` : ''} sit inside {spanLabel(span)} — {bandDays != null ? `${bandDays} of them in its centre band.` : '.'}
                  </>
                ) : (
                  <>the count arrives when a city is set — the band still orders without it.</>
                )}
              </div>
              <div className="flex flex-wrap" style={{ gap: '8px 12px', marginTop: '12px' }}>
                <ControlLink onClick={() => nav.goRuler(type.category, type.band)}>Index by temperature →</ControlLink>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ——— field 2 · registers it carries — FIX; an em dash is not a gap */}
      <section>
        <FieldHead n={banded ? 2 : 1} title="Registers it carries" />
        <div style={{ marginTop: '6px' }}>
          {(['Black-Tie', 'Formal', 'Business', 'Smart-Casual', 'Casual', 'Outdoor-Work'] as const).map((reg) => {
            const carries = type.reach.includes(reg);
            return (
              <div key={reg} className="grid grid-cols-[130px_minmax(0,1fr)] items-baseline" style={{ gap: '18px', padding: '8px 0', borderBottom: `1px solid rgba(59,43,29,0.12)` }}>
                <span style={mono(8.5, carries ? WALNUT : FAINTER)}>{FIELD_REGISTER_LABELS[reg]}</span>
                <span style={{ ...body(13.5, carries ? INK : FAINTER) }}>{carries ? 'It carries this one.' : '—'}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* ——— field 3 · where it suits — GEN per city; the slot ships absent */}
      {banded && (
        <section>
          <FieldHead n={3} title="Where it suits" note="your city first — places from the Dossier" />
          <div style={{ marginTop: '12px' }}>
            {model.climate.city ? (
              <div className="grid grid-cols-[minmax(0,1fr)_auto]" style={{ gap: '18px', padding: '10px 0', borderBottom: `1px solid rgba(59,43,29,0.12)`, alignItems: 'baseline' }}>
                <span style={{ ...serif(16) }}>{model.climate.city} <span style={mono(8, FAINT)}>your city</span></span>
                <VerdictMark verdict={verdict} />
              </div>
            ) : (
              <p style={{ ...body(13.5, SECONDARY), margin: 0, maxWidth: '58ch' }}>
                Set your city in the Dossier and this field reads the type against it — a verdict plus its argument, never
                a badge.
              </p>
            )}
            {/* GEN · G2 — the reasoning line per city; ships absent. */}
            <GenSlot slot="G2" scope={`type:${type.id}`} />
          </div>
        </section>
      )}

      {/* ——— field 4 · colours — the set is FIX; the ORDER is fitted */}
      <section>
        <FieldHead n={banded ? 4 : 2} title="Colours to buy it in" note="the set is fixed · the order is ranked for your ledger" />
        <div style={{ marginTop: '6px' }}>
          {type.colours.map((colour, i) => {
            const ownedHere = (model.ownership.swatches.get(type.id) || []).length > 0 && i === 0;
            return (
              <div key={colour} className="grid grid-cols-[26px_minmax(0,1fr)]" style={{ gap: '14px', padding: '8px 0', borderBottom: `1px solid rgba(59,43,29,0.12)`, alignItems: 'baseline' }}>
                <span style={mono(8, FAINTER)}>{String(i + 1).padStart(2, '0')}</span>
                <span style={{ ...body(14, i === 0 ? WALNUT : INK) }}>
                  {colour}
                  {ownedHere && <span style={{ ...mono(7.5, FAINT), marginLeft: '10px' }}>You own it in this</span>}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* ——— field 5 · cuts — each a type in its own right (down to L3) */}
      {type.cuts.length > 0 && (
        <section>
          <FieldHead n={banded ? 5 : 3} title={`${type.cuts.length === 1 ? 'One cut' : `${type.cuts.length} cuts`}, and they are not interchangeable`} />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" style={{ gap: '14px 28px', marginTop: '14px' }}>
            {type.cuts.map((cut) => (
              <div key={cut} style={{ border: `1px solid ${HAIRLINE}`, padding: '12px 14px' }}>
                <NameLink onClick={() => nav.goCut(type.id, cut)} size={16.5}>{cut}</NameLink>
                <div style={{ ...mono(8, FAINT), marginTop: '6px' }}>Its own entry →</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ——— field 6 · makers — the pick for YOU first (photograph and the
          maker's own page for this piece, then the next four), and beneath
          it the directory rows that cross to the makers face */}
      <section>
        <FieldHead n={banded ? 6 : 4} title="Who makes it" note={makers.length > 0 ? `${makers.length} maker${makers.length === 1 ? '' : 's'} in the directory` : 'no verified maker in the directory — never guessed'} />
        <PieceBrandPicks
          typeName={type.name}
          categoryName={categoryName(type.category)}
          keywords={type.cuts}
          profile={profile}
          pieces={pieces}
          fallbackBrands={type.makers}
        />
        {makers.length > 0 ? (
          <div style={{ marginTop: '18px' }}>
            <div style={{ ...mono(8.5, SECONDARY), padding: '0 0 4px' }}>In the Index’s directory — each name crosses to the makers face</div>
            {makers.map(({ name, profile, ref }) => (
              <div key={name} className="grid grid-cols-[minmax(0,5fr)_minmax(0,4fr)_auto] items-baseline" style={{ gap: '18px', padding: '9px 0', borderBottom: `1px solid rgba(59,43,29,0.12)` }}>
                <span>
                  {ref && <span style={{ ...mono(7.5, '#5c3413'), background: 'rgba(168,113,44,0.16)', border: '1px solid rgba(168,113,44,0.6)', padding: '1.5px 5px', marginRight: '8px' }}>Ref</span>}
                  <NameLink onClick={() => nav.goMaker(name)} size={15}>{name}</NameLink>
                </span>
                <span style={{ ...body(12.5, SECONDARY) }}>{profile ? [profile.city, profile.country].filter(Boolean).join(' · ') : verifiedBrandWebsiteUrl(name) ? 'In the wider directory' : '—'}</span>
                <span style={mono(8.5, SECONDARY)}>{profile ? PRICE_BAND_SYMBOL[profile.priceBand] : ''}</span>
              </div>
            ))}
            <p style={{ ...body(12, FAINT), margin: '8px 0 0', maxWidth: '72ch' }}>
              Ref means the maker defines the piece, not that it's the best one for you — a fact about the garment's
              history. The ranked picks above are the “for you” read; these rows are the record.
            </p>
          </div>
        ) : null}
      </section>

      {/* ——— field 7 · neighbours — computed from the band, never authored */}
      {banded && neighbours.length > 0 && (
        <section>
          <FieldHead n={7} title="What else answers this band" note="computed from the band, never authored per type" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" style={{ gap: '10px 28px', marginTop: '12px' }}>
            {neighbours.map((n) => (
              <div key={n.id} style={{ padding: '8px 0', borderBottom: `1px solid rgba(59,43,29,0.12)` }}>
                <NameLink onClick={() => nav.goType(n.id)} size={15} color={model.ownership.swatches.has(n.id) ? WALNUT : INK}>{n.name}</NameLink>
                <div style={{ ...mono(8, FAINT), marginTop: '3px' }}>
                  {categoryName(n.category)} · {spanLabel(spanOf(n))}
                  {model.gaps.has(n.id) ? ' · your other flagged gap' : ''}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* GEN · G3 — the case for and against; ships absent. */}
      <GenSlot slot="G3" scope={`type:${type.id}`} style={{ marginTop: '26px' }} />

      <UpDownOut
        up={
          <>
            <ControlLink onClick={() => nav.goPlate(type.category)}>{categoryName(type.category)}</ControlLink> — the plate, and the breadcrumb above.
          </>
        }
        down={type.cuts.length > 0 ? <>A cut in field {banded ? 'five' : 'three'} → its own page. The only way to L3.</> : <>Nothing — this type carries no separate cuts.</>}
        out={
          <>
            <ControlLink onClick={() => window.dispatchEvent(new CustomEvent('ethaion:add-piece', { detail: { name: type.name } }))}>Add to the Ledger</ControlLink> — it carries the type as context.
          </>
        }
      />
    </div>
  );
}
