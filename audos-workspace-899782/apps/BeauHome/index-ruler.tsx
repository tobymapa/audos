/**
 * THE INDEX · READING · THE RULER (27a) — by temperature, at category
 * scope. Eight bands from freezing to hot, one row of names per band. A
 * type sits ONCE, in the band it is FOR; the bands at the edge of its
 * reach carry it in the lighter tone — nothing is listed twice, so the
 * counts can be trusted. The ruler is never the whole Index: always one
 * category (density, solved by scope).
 *
 * Copy columns: the names, bands and reach are FIX; the day counts for
 * your city, the you-own marks and covered/gap/thin are FIT; the coverage
 * paragraph (G6) and the empty-band sentence (G5) are GEN — shipped
 * absent, except the one BY-NATURE fact that is category truth, not
 * reader truth.
 */
import { useEffect, useMemo, useRef } from 'react';
import { promoteToScout } from './profile-data';
import { findGarmentType, type GarmentCategoryId, type GarmentType } from './garment-types';
import { TEMPERATURE_BANDS, type TemperatureBand } from './temperature-bands';
import { daysInBand, reachBands, verdictFor, type IndexModel } from './index-model';
import {
  ACCENT_DEEP,
  BackLink,
  Breadcrumb,
  ControlLink,
  FAINT,
  FAINTER,
  GapTag,
  GenSlot,
  HAIRLINE,
  INK,
  NameLink,
  ReadingSwitch,
  RULE,
  SECONDARY,
  UpDownOut,
  WALNUT,
  body,
  mono,
  serif,
  type IndexNav,
} from './index-chrome';
import { usePlexMono } from './mono-type';

const BAND_TITLES: Record<TemperatureBand, string> = {
  'below-0': '0 °C and under · Deep cold',
  '0-5': '0 – 5 °C · Hard cold',
  '5-10': '5 – 10 °C · Cold',
  '10-15': '10 – 15 °C · Cool',
  '15-20': '15 – 20 °C · Mild',
  '20-25': '20 – 25 °C · Warm',
  '25-30': '25 – 30 °C · Hot',
  'above-30': '30 °C and over · Very hot',
};

/** The category-truth sentences for bands a category never reaches — FIX,
 * a fact about the category, never a hole in the wardrobe (27a). */
const BY_NATURE: Partial<Record<GarmentCategoryId, Partial<Record<TemperatureBand, string>>>> = {
  outerwear: { 'above-30': 'No outerwear centres above 30 °C — and that is a fact about the category, not a hole in the Index. Above thirty the outer layer is something you carry.' },
  knitwear: { 'above-30': 'No knitwear centres above 30 °C — the category ends where the yarn does.', '25-30': undefined },
  formalwear: { 'above-30': 'Formalwear stops before 30 °C — past that the register itself surrenders the jacket.' },
  sweatshirts: { 'above-30': 'No sweatshirt centres above 30 °C — loopback cotton is a mid-layer, and there is nothing to be mid of.' },
};

export function IndexRuler({ model, catId, band, nav }: { model: IndexModel; catId: GarmentCategoryId; band?: string; nav: IndexNav }) {
  usePlexMono();
  const bandRefs = useRef<Record<string, HTMLElement | null>>({});
  const cat = model.categories.find((c) => c.id === catId);

  const rows = useMemo(() => {
    if (!cat || !cat.banded) return [];
    const types = cat.runs.flatMap((r) => r.typeIds).map((id) => findGarmentType(id)).filter(Boolean) as GarmentType[];
    return TEMPERATURE_BANDS.map((def) => {
      const centred = types.filter((t) => t.band === def.id);
      const reaching = types.filter((t) => t.band !== def.id && reachBands(t).includes(def.id));
      const owned = centred.filter((t) => model.ownership.swatches.has(t.id)).length;
      const gapsHere = centred.filter((t) => model.gaps.has(t.id)).length;
      const state = centred.length === 0 ? 'by nature' : owned > 0 ? 'covered' : gapsHere > 0 ? 'gap' : centred.length <= 2 ? 'thin' : 'gap';
      return { def, centred, reaching, owned, state };
    });
  }, [cat, model]);

  // A band chip on a type page opens the ruler already scrolled to that band.
  useEffect(() => {
    if (band) bandRefs.current[band]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [band]);

  if (!cat) return null;
  const total = cat.total;
  const bandsUsed = rows.filter((r) => r.centred.length > 0).length;

  return (
    <div>
      <BackLink label="the Index" onClick={nav.back} />
      <div style={{ marginTop: '10px' }}>
        <Breadcrumb segs={[{ label: 'The Index', onClick: nav.goRoot }, { label: 'Reading · by temperature' }, { label: cat.name }]} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto]" style={{ gap: '16px 40px', marginTop: '16px', paddingBottom: '18px', borderBottom: `1px solid ${INK}`, alignItems: 'end' }}>
        <div>
          <h3 style={{ ...serif(0), fontSize: 'clamp(26px, 3.4vw, 36px)', lineHeight: 1.1, margin: 0 }}>
            {cat.name} <span style={{ color: FAINT }}>on one ruler</span>
          </h3>
          <p style={{ ...body(14.5), margin: '10px 0 0', maxWidth: '66ch' }}>
            Eight bands from freezing to hot, and one row of names per band. A type sits once, in the band it is for;
            the bands at the edge of its reach carry it in the lighter tone. Nothing is listed twice, so the counts can
            be trusted.
          </p>
          <div style={{ ...mono(8.5, FAINT), marginTop: '10px' }}>
            {total} types · {bandsUsed} bands used of 8 · {model.ownership.swatches.size > 0 ? `you own ${rows.reduce((n, r) => n + r.owned, 0)}` : 'you own —'}
            {model.climate.city ? ` · ${model.climate.city} · your city` : ''}
          </div>
        </div>
        <ReadingSwitch active="ruler" onChange={(r) => { if (r === 'list') nav.goPlate(cat.id); if (r === 'matrix') nav.goMatrix(); if (r === 'field') nav.goField(); }} />
      </div>

      {/* GEN · G6 — “your coverage, read off the ruler”; ships absent. */}
      <GenSlot slot="G6" scope={`ruler:${cat.id}`} style={{ marginTop: '16px' }} />

      {rows.map(({ def, centred, reaching, owned, state }) => {
        const days = daysInBand(model.climate, def.id);
        const byNature = centred.length === 0;
        const natureLine = BY_NATURE[cat.id]?.[def.id];
        return (
          <section
            key={def.id}
            ref={(el) => { bandRefs.current[def.id] = el; }}
            aria-label={BAND_TITLES[def.id]}
            style={{ padding: '18px 0 14px', borderBottom: `1px solid ${HAIRLINE}`, scrollMarginTop: '72px' }}
          >
            <div className="grid grid-cols-[150px_minmax(0,1fr)_auto] items-start" style={{ gap: '10px 26px' }}>
              <div>
                <div style={serif(16)}>{BAND_TITLES[def.id].split(' · ')[0]}</div>
                <div style={{ ...mono(8, FAINT), marginTop: '3px' }}>
                  {BAND_TITLES[def.id].split(' · ')[1]}
                  {days != null ? ` · ${days} days` : ''}
                </div>
              </div>
              <div>
                {byNature ? (
                  <p style={{ ...body(13.5, SECONDARY), margin: 0, maxWidth: '62ch' }}>
                    {natureLine || 'Nothing in this category centres here — a fact about the category, not a gap in the wardrobe.'}
                  </p>
                ) : (
                  <>
                    <div className="flex flex-wrap" style={{ gap: '4px 20px' }}>
                      {centred.map((t) => {
                        const ownedHere = model.ownership.swatches.has(t.id);
                        const gap = model.gaps.has(t.id);
                        return (
                          <span key={t.id}>
                            {gap && <GapTag />}
                            <NameLink onClick={() => nav.goType(t.id)} size={14.5} color={ownedHere ? WALNUT : INK} title={ownedHere ? `${t.name} — you own it` : `${t.name} — centres here`}>
                              {t.name}
                            </NameLink>
                          </span>
                        );
                      })}
                    </div>
                    {reaching.length > 0 && (
                      <div className="flex flex-wrap" style={{ gap: '4px 20px', marginTop: '7px' }}>
                        {reaching.map((t) => (
                          <NameLink key={t.id} onClick={() => nav.goType(t.id)} size={13.5} color={FAINTER} title={`${t.name} — reaches here; centres elsewhere`}>
                            {t.name}
                          </NameLink>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={mono(9, WALNUT)}>
                  {centred.length} · {byNature ? '—' : `you ${owned}`}
                </div>
                <div style={{ ...mono(8, state === 'covered' ? SECONDARY : state === 'by nature' ? FAINTER : ACCENT_DEEP), marginTop: '3px' }}>{state}</div>
              </div>
            </div>
            {/* GEN · G5 — why an empty band holds nothing, per band; absent
                (the BY-NATURE line above is FIX category truth, not GEN). */}
            {byNature && !natureLine && <GenSlot slot="G5" scope={`ruler:${cat.id}:${def.id}`} />}
          </section>
        );
      })}

      <div style={{ ...mono(8.5, FAINT), paddingTop: '14px' }}>
        All {total} shown · 0 repeated ·{' '}
        <ControlLink onClick={() => nav.goMatrix()}>See all eleven categories on this ruler →</ControlLink>
      </div>

      <UpDownOut
        up={<>The Index root — the breadcrumb, always top left.</>}
        down={<>Any name in a band row, muted ones included — a muted name is a reach, not a different kind of thing.</>}
        out={
          <>
            <ControlLink onClick={() => promoteToScout(`${cat.name.toLowerCase()} for the cold end`)}>Ask Beau to fill the cold end →</ControlLink>
          </>
        }
      />
    </div>
  );
}
