/**
 * THE INDEX · THE MAKERS FACE — the other face of the same graph.
 *
 *  · L0′ · THE MAKERS ROOT (29c · new): every maker ordered BY PLACE —
 *    because a maker is mostly a consequence of one — with REFERENCE FOR
 *    as the second read. All shown, no counts, no pagination: the only
 *    root in the tab that can afford to be exhaustive. Each row carries
 *    its claim: what the maker is the reference for, and the year.
 *  · L1′ · THE MAKER PAGE (26d): deliberately shallow — one level, no
 *    children — because its job is to hand you back to a type. Everything
 *    on it is a way back into pieces, which is why makers are a toggle,
 *    not a separate tab.
 *
 * Copy columns (29b): names, cities, years and reference-for lines are
 * FIX (editorial, the most expensive column to maintain); the ordering
 * within place and “nearest to you” are FIT; the top-three annotations
 * (G10) and the ledger verdict are GEN — shipped absent.
 */
import { useMemo, useState } from 'react';
import { promoteToScout } from './profile-data';
import {
  BRAND_DIRECTORY,
  PRICE_BAND_LABELS,
  PRICE_BAND_ORDER,
  brandCategory,
  verifiedBrandWebsiteUrl,
  type BrandProfile,
} from './brands';
import { garmentTypesForMaker } from './garment-types';
import { spanLabel, spanOf, verdictFor, type IndexModel } from './index-model';
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

type MakerRead = 'place' | 'reference' | 'craft' | 'price';

const READS: Array<{ id: MakerRead; label: string }> = [
  { id: 'place', label: 'By place' },
  { id: 'reference', label: 'Reference for' },
  { id: 'craft', label: 'By craft' },
  { id: 'price', label: 'By price' },
];

function placeGroup(b: BrandProfile): string {
  const country = (b.country || '').toLowerCase();
  if (country.includes('scotland')) return 'Scotland';
  if (country.includes('england')) return b.city === 'London' ? 'London' : 'England';
  if (country.includes('guernsey') || country.includes('ireland')) return 'The islands';
  if (country.includes('usa')) return 'United States';
  if (country.includes('italy')) return 'Italy';
  if (country.includes('france')) return 'France';
  if (country.includes('spain')) return 'Spain & Mallorca';
  if (country.includes('japan')) return 'Japan';
  return b.country || 'Elsewhere';
}

function MakerRow({ b, nav }: { b: BrandProfile; nav: IndexNav }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline" style={{ gap: '16px', padding: '7.5px 0', borderBottom: '1px solid rgba(59,43,29,0.12)' }}>
      <span>
        <NameLink onClick={() => nav.goMaker(b.brand)} size={15}>{b.brand}</NameLink>
        <span style={{ ...body(12.5, SECONDARY), marginLeft: '10px' }}>{b.referenceFor || b.signaturePieces[0] || ''}</span>
      </span>
      <span style={mono(8, FAINT)}>
        {[b.city, b.founded ? String(b.founded) : null].filter(Boolean).join(' · ')}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// L0′ · the makers root
// ---------------------------------------------------------------------------

export function MakersRoot({ model, nav }: { model: IndexModel; nav: IndexNav }) {
  usePlexMono();
  const [read, setRead] = useState<MakerRead>('place');
  const makers = BRAND_DIRECTORY;

  const groups = useMemo(() => {
    const byKey = new Map<string, BrandProfile[]>();
    const push = (key: string, b: BrandProfile) => byKey.set(key, [...(byKey.get(key) || []), b]);
    if (read === 'place') for (const b of makers) push(placeGroup(b), b);
    if (read === 'reference') for (const b of makers) push(brandCategory(b.brand), b);
    if (read === 'craft') for (const b of makers) push(b.construction.split(',')[0] || 'Other craft', b);
    if (read === 'price') for (const b of makers) push(PRICE_BAND_LABELS[b.priceBand], b);
    const entries = [...byKey.entries()];
    if (read === 'price') {
      const order = PRICE_BAND_ORDER.map((p) => PRICE_BAND_LABELS[p]);
      entries.sort((a, z) => order.indexOf(a[0]) - order.indexOf(z[0]));
    } else {
      entries.sort((a, z) => z[1].length - a[1].length);
    }
    for (const [, list] of entries) {
      if (read === 'reference') list.sort((a, z) => (a.referenceFor || '').localeCompare(z.referenceFor || ''));
      else list.sort((a, z) => (a.founded || 9999) - (z.founded || 9999));
    }
    return entries;
  }, [makers, read]);

  return (
    <div>
      {/* ——— the face header — the toggle sits above the strip (29a) */}
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-5 md:gap-10 md:items-end" style={{ paddingBottom: '18px', borderBottom: `1px solid ${INK}` }}>
        <div>
          <div style={mono(8.5, FAINT)}>The makers face · root</div>
          <h3 style={{ ...serif(0), fontSize: 'clamp(28px, 3.8vw, 40px)', lineHeight: 1.08, margin: '8px 0 0' }}>
            {makers.length} makers, by where they are
          </h3>
          <p style={{ ...body(15), margin: '10px 0 0', maxWidth: '66ch' }}>
            Place first, because a maker is mostly a consequence of one — a mill, a port, a climate, a trade that
            stayed. The second read reverses it: not where they are but what they are the reference for, which is the
            only ordering that tells you why the Index bothered listing them.
          </p>
        </div>
        <div className="flex flex-col items-start md:items-end" style={{ gap: '9px' }}>
          <div className="flex" role="group" aria-label="What the list is of">
            <button type="button" onClick={nav.goRoot} className="transition-colors hover:bg-[rgba(168,113,44,0.06)]" style={{ ...mono(9, SECONDARY), background: 'transparent', border: `1px solid ${HAIRLINE}`, padding: '7px 14px' }}>
              Pieces · {model.typeTotal}
            </button>
            <button type="button" aria-pressed style={{ ...mono(9, '#5c3413'), background: 'rgba(168,113,44,0.12)', border: `1px solid ${ACCENT_DEEP}`, borderLeftWidth: 0, padding: '7px 14px' }}>
              Makers · {makers.length}
            </button>
          </div>
          <button type="button" onClick={nav.openJump} className="hover:underline" style={{ ...mono(8, FAINT), background: 'transparent', padding: 0 }}>
            Search the Index — a type, a cut, a maker · ⌘K
          </button>
        </div>
      </div>

      {/* ——— the makers face's own reading switch */}
      <div className="flex flex-wrap items-baseline" style={{ gap: '6px 18px', padding: '14px 0', borderBottom: `1px solid ${HAIRLINE}` }}>
        {READS.map((r) => {
          const on = r.id === read;
          return (
            <button key={r.id} type="button" onClick={() => setRead(r.id)} aria-pressed={on} style={{ ...mono(9, on ? WALNUT : SECONDARY), background: 'transparent', padding: '0 0 2px', borderBottom: on ? `1px solid ${ACCENT_DEEP}` : '1px solid transparent' }}>
            {r.label}
            </button>
          );
        })}
      </div>

      {/* GEN · G10 — “why this maker, for you” on the top three rows only;
          ships absent. Three annotations, never sixty-one. */}
      <GenSlot slot="G10" scope="makers-root" style={{ marginTop: '14px' }} />

      {groups.map(([label, list]) => (
        <section key={label} style={{ padding: '20px 0 8px' }}>
          <div className="flex items-baseline" style={{ gap: '12px' }}>
            <span style={serif(19)}>{label}</span>
            <span style={mono(8.5, FAINT)}>{list.length} maker{list.length === 1 ? '' : 's'}</span>
          </div>
          <div style={{ marginTop: '8px' }}>
            {list.map((b) => (
              <MakerRow key={b.brand} b={b} nav={nav} />
            ))}
          </div>
        </section>
      ))}

      <div style={{ ...mono(8.5, FAINT), paddingTop: '14px' }}>
        {makers.length} of {makers.length} shown · {groups.length} {read === 'place' ? 'places' : 'groups'} ·{' '}
        <ControlLink onClick={() => setRead(read === 'reference' ? 'place' : 'reference')}>
          {read === 'reference' ? 'Read them by place again →' : 'Reverse the read: what they define →'}
        </ControlLink>
      </div>

      <UpDownOut
        up={<>Nothing — this is the top of the makers face. The toggle returns to pieces.</>}
        down={<>Any maker's name → their page, and from there straight back into type pages — the crossover.</>}
        out={<><ControlLink onClick={() => promoteToScout('makers worth buying from')}>Hunt a maker →</ControlLink></>}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// L1′ · the maker page — and the crossover
// ---------------------------------------------------------------------------

export function MakerPage({ model, name, nav }: { model: IndexModel; name: string; nav: IndexNav }) {
  usePlexMono();
  const maker = useMemo(() => BRAND_DIRECTORY.find((b) => b.brand.toLowerCase() === name.toLowerCase()) || null, [name]);
  const types = useMemo(() => garmentTypesForMaker(name), [name]);
  if (!maker) return null;
  const site = verifiedBrandWebsiteUrl(maker.brand);
  const refWord = (maker.referenceFor || '').toLowerCase().split(' ').slice(-1)[0];

  return (
    <div>
      <BackLink label={nav.backLabel} onClick={nav.back} />
      <div style={{ marginTop: '10px' }}>
        <Breadcrumb segs={[{ label: 'The Index', onClick: nav.goRoot }, { label: `Makers · ${BRAND_DIRECTORY.length}`, onClick: nav.goMakers }, { label: maker.brand }]} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px]" style={{ gap: '20px 48px', marginTop: '16px', paddingBottom: '22px', borderBottom: `1px solid ${INK}` }}>
        <div>
          <h3 style={{ ...serif(0), fontSize: 'clamp(28px, 3.6vw, 38px)', lineHeight: 1.08, margin: 0 }}>{maker.brand}</h3>
          <div style={{ ...mono(8.5, FAINT), marginTop: '10px' }}>
            {[maker.city, maker.country, maker.founded ? `founded ${maker.founded}` : null].filter(Boolean).join(' · ')}
            {maker.referenceFor ? ` · reference for the ${maker.referenceFor.toLowerCase()}` : ''}
          </div>
          <p style={{ ...body(15), margin: '12px 0 0', maxWidth: '64ch' }}>{maker.description}</p>
        </div>
        <div style={{ border: `1px solid ${RULE}`, background: PAPER, padding: '14px 16px' }}>
          <div style={mono(8.5, ACCENT_DEEP)}>The record</div>
          {[
            ['Where', [maker.city, maker.country].filter(Boolean).join(' · ')],
            ['Price band', maker.priceRangeLabel],
            ['Registers', maker.registers.join(' · ')],
            ['How it\u2019s made', maker.construction],
            ['Expected life', `${maker.longevity.expectedYears}+ years`],
          ].map(([k, v]) => (
            <div key={k as string} className="grid grid-cols-[92px_minmax(0,1fr)] items-baseline" style={{ gap: '12px', padding: '7px 0', borderBottom: '1px solid rgba(59,43,29,0.12)' }}>
              <span style={mono(8, FAINT)}>{k}</span>
              <span style={{ ...body(12.5, INK) }}>{v}</span>
            </div>
          ))}
          {site && (
            <div style={{ paddingTop: '10px' }}>
              <a href={site} target="_blank" rel="noreferrer" style={{ ...mono(8, ACCENT_DEEP) }} className="hover:underline">
                Their own site →
              </a>
            </div>
          )}
          {/* GEN · the ledger verdict (“above your band, mostly”); absent. */}
          <GenSlot slot="maker-ledger" scope={`maker:${maker.brand}`} />
        </div>
      </div>

      {/* ——— what they make — every name a way back into the pieces face */}
      <section>
        <div className="flex items-baseline flex-wrap" style={{ gap: '4px 12px', paddingBottom: '8px', borderBottom: `1px solid ${RULE}`, marginTop: '28px' }}>
          <span style={serif(19)}>What they make</span>
          <span style={mono(8, FAINT)}>every name here is a way back into the pieces face · {types.length} type{types.length === 1 ? '' : 's'}</span>
        </div>
        {types.length > 0 ? (
          <div style={{ marginTop: '6px' }}>
            {types.map((t) => {
              const ref = refWord && t.name.toLowerCase().includes(refWord);
              const owned = model.ownership.swatches.has(t.id);
              return (
                <div key={t.id} className="grid grid-cols-[minmax(0,5fr)_auto_auto] items-baseline" style={{ gap: '18px', padding: '9px 0', borderBottom: '1px solid rgba(59,43,29,0.12)' }}>
                  <span>
                    {ref && <span style={{ ...mono(7.5, '#5c3413'), background: 'rgba(168,113,44,0.16)', border: '1px solid rgba(168,113,44,0.6)', padding: '1.5px 5px', marginRight: '8px' }}>Ref</span>}
                    <NameLink onClick={() => nav.goType(t.id)} size={15} color={owned ? WALNUT : INK}>{t.name}</NameLink>
                  </span>
                  <span style={{ textAlign: 'right' }}>
                    {owned ? <span style={mono(8.5, SECONDARY)}>You own one</span> : <VerdictMark verdict={verdictFor(model.climate, t, model.gaps.has(t.id))} />}
                  </span>
                  <span style={{ ...mono(8.5, SECONDARY), minWidth: '52px', textAlign: 'right' }}>{spanLabel(spanOf(t))}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <p style={{ ...body(13.5, SECONDARY), margin: '10px 0 0', maxWidth: '60ch' }}>
            Their signature pieces — {maker.signaturePieces.join(', ')} — sit outside the typed canon for now; the Hunt
            still finds them by name.
          </p>
        )}
      </section>

      {/* ——— the fixed record's remaining lines */}
      <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: '16px 40px', marginTop: '24px' }}>
        <div>
          <div style={mono(8.5, SECONDARY)}>What that costs over time</div>
          <p style={{ ...body(13.5, INK), margin: '7px 0 0' }}>{maker.costPerYearNote}</p>
        </div>
        <div>
          <div style={mono(8.5, SECONDARY)}>Sizing</div>
          <p style={{ ...body(13.5, INK), margin: '7px 0 0' }}>{maker.sizingNote}</p>
        </div>
      </div>

      <UpDownOut
        up={<><ControlLink onClick={nav.goMakers}>Makers · {BRAND_DIRECTORY.length}</ControlLink>, or flip the toggle to pieces.</>}
        down={<>Any type they make → its page. The crossover, and the reason there's one toggle.</>}
        out={<><ControlLink onClick={() => promoteToScout(maker.brand)}>Hunt this maker →</ControlLink> — their pieces in your size, new and secondhand.</>}
      />
    </div>
  );
}
