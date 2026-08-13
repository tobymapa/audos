/**
 * THE PIECE DETAIL PAGE — the full, routable page one garment type opens
 * into (August 2026, to the founder's screenshots). Reached from ANYWHERE a
 * piece is named: an Index row, a Ledger row's info control, a Hunt pick,
 * an Edit gap row — all of them land here through the Index's Pieces face.
 *
 * The sections, in the screenshots' own order:
 *   1 · the head — name, the also-known-as line, the intro paragraph;
 *       AGAINST YOUR LEDGER at the right with the two calls to action
 *       (HUNT FOR ONE · LOG ONE I OWN) and Beau's reco control.
 *   2 · the temperature band — the big range, the shared ruler with the
 *       band as a hatched block, the reader's YEAR plotted month by month
 *       on the same scale, and the day-count arithmetic beside it.
 *   3 · REGISTERS IT CARRIES · COLOURS TO BUY IT IN — two columns.
 *   4 · WHERE IT SUITS — the reader's city first, then the places his
 *       trips have logged, each with a verdict headline and Beau's line.
 *   5 · the CUTS — one card per cut, each with its own flat-lay upload.
 *   6 · WHO MAKES IT — the maker table, REF marked, priced, every name
 *       opening the maker sheet.
 *   7 · WHAT ELSE ANSWERS THIS BAND — the neighbours, bars on the same
 *       scale, one line each on why this piece is different.
 *   8 · BEAU, READING THIS PAGE AGAINST YOUR LEDGER — the walnut panel.
 *
 * Everything written is Beau's, from ONE cached call (piece-detail-ai.ts)
 * with a deterministic fallback per slot; everything counted is arithmetic
 * over the reader's own record. Design register is the shared Index set
 * (index-style.tsx) — nothing here sets a colour of its own.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { Loader2 } from 'lucide-react';
import { findGarmentType, type GarmentCategoryId, type GarmentType } from './garment-types';
import { runOfType } from './garment-type-runs';
import type { TemperatureBand } from './temperature-bands';
import {
  FIELD_REGISTERS,
  FIELD_REGISTER_LABELS,
  RULER_HI,
  RULER_LO,
  categoryName,
  daysInSpan,
  neighboursOf,
  spanLabel,
  spanOf,
  type IndexModel,
  type TempSpan,
} from './index-model';
import { findCatalogBrand, verifiedBrandWebsiteUrl, type BrandProfile } from './brands';
import { warmthFor, type PieceWarmth } from './warmth-model';
import { fetchDossierDetails } from './dossier-details';
import { openInBeausPicks, openInAskBeau } from './edit-links';
import { openMakerSheet } from './maker-sheet';
import { CrumbHeader, goToEthaionTab } from './crumb-trail';
import { usePieceDetailCopy, type DetailPlaceInput } from './piece-detail-ai';
import { compressImage, uploadGarmentPhotoFast } from './photo-enhance';
import { swatchFor, type StyleProfile, type WardrobePiece } from './profile-data';
import { loadHuntCallsMirror } from './hunt-model';
import { usePlexMono } from './mono-type';
import {
  ACCENT,
  ACCENT_DEEP,
  FAINT,
  FAINTER,
  HAIRLINE,
  INK,
  MUTED,
  ON_WALNUT,
  ON_WALNUT_GOLD,
  PAPER,
  RULE,
  SECONDARY,
  WALNUT,
  body,
  mono,
  serif,
} from './index-style';

const MIDDOT = '\u00b7';
const OXBLOOD = '#8c3a2b';
const HATCH_BAND = 'repeating-linear-gradient(45deg, rgba(168,113,44,0.55) 0 4px, rgba(168,113,44,0.14) 4px 8px)';
const ROW_HAIRLINE = '1px solid rgba(59,43,29,0.12)';

function pct(deg: number): number {
  return ((deg - RULER_LO) / (RULER_HI - RULER_LO)) * 100;
}

function SectionHead({ title, note }: { title: string; note?: string }) {
  return (
    <div className="flex items-baseline flex-wrap" style={{ gap: '4px 14px', paddingBottom: '8px', borderBottom: `1px solid ${RULE}`, marginTop: '34px' }}>
      <span style={serif(20)}>{title}</span>
      {note && <span style={mono(8, FAINT)}>{note}</span>}
    </div>
  );
}

function OutlinedControl({ children, onClick, solid = false }: { children: React.ReactNode; onClick: () => void; solid?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="transition-colors hover:border-[#a8712c]"
      style={{
        ...mono(8.5, solid ? WALNUT : ACCENT_DEEP),
        background: solid ? 'rgba(168,113,44,0.12)' : 'transparent',
        border: `1px solid ${solid ? ACCENT : RULE}`,
        padding: '8px 13px',
        whiteSpace: 'nowrap',
        borderRadius: 0,
      }}
    >
      {children}
    </button>
  );
}

function ControlLink({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="hover:underline text-left" style={{ ...mono(8.5, ACCENT_DEEP), background: 'transparent', padding: 0, border: 'none' }}>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// The ruler and the year — the same scale the Index draws its bars on.
// ---------------------------------------------------------------------------

const AXIS_MARKS = [-10, 0, 10, 20, 30];
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Approximate monthly mean apparent temperatures from the 8-band day
 * histogram — the histogram's own days, laid over the shape of a year
 * (coldest around January in the north, July in the south). Deterministic,
 * and honest: it never invents days the histogram doesn't hold. */
function monthlyMeans(bands: number[], southern: boolean): number[] | null {
  const mids = [-4, 2.5, 7.5, 12.5, 17.5, 22.5, 27.5, 32];
  const temps: number[] = [];
  bands.forEach((d, i) => {
    for (let k = 0; k < Math.max(0, Math.round(d)); k += 1) temps.push(mids[i]);
  });
  if (temps.length < 12) return null;
  temps.sort((a, b) => a - b);
  const order = MONTH_ABBR.map((_, m) => ({
    m,
    cold: Math.cos(((m - 0.25) / 12) * 2 * Math.PI) * (southern ? -1 : 1),
  })).sort((a, b) => b.cold - a.cold);
  const out = new Array(12).fill(0);
  const per = temps.length / 12;
  order.forEach(({ m }, rank) => {
    const start = Math.floor(rank * per);
    const end = Math.max(Math.floor((rank + 1) * per), start + 1);
    const slice = temps.slice(start, end);
    out[m] = slice.reduce((a, b) => a + b, 0) / slice.length;
  });
  return out;
}

function BandRuler({ span }: { span: TempSpan }) {
  return (
    <div aria-hidden style={{ position: 'relative', height: '30px' }}>
      {AXIS_MARKS.map((deg) => (
        <span key={deg} style={{ position: 'absolute', left: `${pct(deg)}%`, top: '12px', bottom: 0, width: '1px', background: 'rgba(59,43,29,0.14)' }} />
      ))}
      {AXIS_MARKS.map((deg) => (
        <span key={`l-${deg}`} style={{ ...mono(7, FAINT), position: 'absolute', left: `${pct(deg)}%`, top: 0, transform: 'translateX(-50%)', whiteSpace: 'nowrap' }}>
          {`${deg}\u00b0`}
        </span>
      ))}
      <span style={{ position: 'absolute', left: 0, right: 0, top: '19px', height: '1px', background: RULE }} />
      <span
        style={{
          position: 'absolute',
          left: `${pct(span.lo)}%`,
          width: `${Math.max(2, pct(span.hi) - pct(span.lo))}%`,
          top: '13px',
          height: '13px',
          background: HATCH_BAND,
          border: `1px solid ${ACCENT}`,
        }}
      />
    </div>
  );
}

function YearStrip({ months, span }: { months: number[] | null; span: TempSpan }) {
  if (!months) {
    return (
      <p style={{ ...body(12.5, FAINT), margin: '8px 0 0' }}>
        Set your city in the Dossier and your year plots itself on this ruler.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-12" style={{ gap: '3px', marginTop: '8px' }}>
      {months.map((t, m) => {
        const inBand = t >= span.lo && t <= span.hi;
        return (
          <div key={MONTH_ABBR[m]} title={`${MONTH_ABBR[m]} · ~${Math.round(t)}\u00b0 — ${inBand ? 'inside the band' : 'outside it'}`}>
            <div
              style={{
                height: '18px',
                background: inBand ? HATCH_BAND : 'rgba(59,43,29,0.08)',
                border: inBand ? `1px solid ${ACCENT}` : '1px solid transparent',
              }}
            />
            <div style={{ ...mono(6.5, inBand ? ACCENT_DEEP : FAINTER), textAlign: 'center', marginTop: '3px' }}>{MONTH_ABBR[m][0]}</div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cut cards — each with its own flat-lay upload zone.
// ---------------------------------------------------------------------------

const CUT_IMAGES_KEY = 'ethaion:cut-images:v1';

function loadCutImages(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(CUT_IMAGES_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function storeCutImage(key: string, url: string): void {
  try {
    window.localStorage.setItem(CUT_IMAGES_KEY, JSON.stringify({ ...loadCutImages(), [key]: url }));
  } catch {
    /* storage unavailable — the session state still shows it */
  }
}

function CutCard({
  typeId,
  cut,
  sub,
  note,
}: {
  typeId: string;
  cut: string;
  sub: string;
  note: string;
}) {
  const key = `${typeId}::${cut.toLowerCase()}`;
  const [url, setUrl] = useState<string | null>(() => loadCutImages()[key] || null);
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File | null | undefined) => {
    if (!file || busy) return;
    setBusy(true);
    try {
      const compressed = await compressImage(file);
      const { url: uploaded } = await uploadGarmentPhotoFast(compressed, true);
      if (uploaded) {
        storeCutImage(key, uploaded);
        setUrl(uploaded);
      }
    } catch (e) {
      console.warn('[Ethaion] cut flat-lay upload failed (non-fatal):', e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ border: `1px solid ${HAIRLINE}`, background: PAPER, padding: '14px 16px 18px' }}>
      <label
        className="flex flex-col items-center justify-center text-center cursor-pointer transition-colors hover:border-[#a8712c]"
        style={{
          minHeight: '150px',
          border: `1px dashed ${RULE}`,
          background: url ? 'transparent' : 'rgba(59,43,29,0.03)',
          overflow: 'hidden',
        }}
      >
        {url ? (
          <img src={url} alt={`${cut} — flat-lay`} className="w-full" style={{ maxHeight: '210px', objectFit: 'contain' }} loading="lazy" />
        ) : busy ? (
          <span className="inline-flex items-center" style={{ ...mono(8, MUTED), gap: '6px' }}>
            <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> Reading it
          </span>
        ) : (
          <span style={{ padding: '18px 14px' }}>
            <span className="block" style={mono(8, MUTED)}>A flat-lay of this cut</span>
            <span className="block" style={{ ...mono(7.5, ACCENT_DEEP), marginTop: '6px' }}>drop one here — or browse files</span>
          </span>
        )}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </label>
      <div style={{ ...serif(21, WALNUT), marginTop: '12px', lineHeight: 1.12 }}>{cut}</div>
      {sub && <div style={{ ...mono(7.5, MUTED), marginTop: '5px' }}>{sub}</div>}
      {note && <p style={{ ...body(12.5, SECONDARY), margin: '9px 0 0', lineHeight: 1.55 }}>{note}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Makers — by price, references marked.
// ---------------------------------------------------------------------------

interface MakerRow {
  name: string;
  profile: BrandProfile | null;
  ref: boolean;
}

function makerRowsOf(type: GarmentType): MakerRow[] {
  const rows = type.makers.map((name) => {
    const profile = findCatalogBrand(name);
    const ref = !!profile?.referenceFor && type.name.toLowerCase().includes(profile.referenceFor.toLowerCase().split(' ').slice(-1)[0]);
    return { name, profile, ref };
  });
  const priceRank = (r: MakerRow) => {
    const order = ['accessible', 'mid', 'upper-mid', 'luxury'];
    return r.profile ? order.indexOf(r.profile.priceBand) : 99;
  };
  return rows.sort((a, b) => priceRank(a) - priceRank(b) || a.name.localeCompare(b.name));
}

function priceNewOf(p: BrandProfile | null): string {
  const label = (p?.priceRangeLabel || '').trim();
  if (!label || label === '\u2014') return '\u2014';
  const m = label.match(/\(([^)]+)\)/);
  return m ? m[1] : label;
}

// ---------------------------------------------------------------------------
// Does The Hunt already hold recommendations for this type?
// ---------------------------------------------------------------------------

function huntHasPicksFor(type: GarmentType): boolean {
  const head = type.name.toLowerCase().split(' ').slice(-1)[0];
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i) || '';
      if (!key.startsWith('ethaion:hunt-tenpicks:v1:')) continue;
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const sheet = JSON.parse(raw);
      const picks: any[] = Array.isArray(sheet?.picks) ? sheet.picks : [];
      if (picks.some((p) => p?.garmentTypeId === type.id || String(p?.pieceName || '').toLowerCase().includes(head))) return true;
    }
  } catch {
    /* storage unavailable — fall through to the calls mirror */
  }
  return loadHuntCallsMirror().some(
    (c) => c.categoryId === type.category && (`${c.pieceName} ${c.subCategory || ''}`.toLowerCase().includes(head)),
  );
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

export function PieceDetailPage({
  typeId,
  model,
  pieces,
  profile,
  warmth,
  materials,
  onBack,
  onOpenType,
  onMakersForType,
  onIndexByBand,
}: {
  typeId: string;
  model: IndexModel;
  pieces: WardrobePiece[];
  profile: StyleProfile | null;
  warmth: Record<number, PieceWarmth>;
  materials: Record<number, string>;
  onBack: () => void;
  onOpenType: (id: string) => void;
  onMakersForType: (t: GarmentType) => void;
  onIndexByBand: (cat: GarmentCategoryId, band: TemperatureBand) => void;
}) {
  usePlexMono();
  const type = findGarmentType(typeId);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // The reader's places — the home city first, then trip destinations.
  const [places, setPlaces] = useState<DetailPlaceInput[]>([]);
  const [southern, setSouthern] = useState(false);
  useEffect(() => {
    let alive = true;
    const dbAny = (window as any).__workspaceDb;
    Promise.all([
      fetchDossierDetails().catch(() => null),
      dbAny
        ? dbAny.from('trips').orderBy('created_at', 'desc').limit(30).get().catch(() => ({ data: [] }))
        : Promise.resolve({ data: [] }),
    ]).then(([details, trips]: [any, any]) => {
      if (!alive) return;
      if (details?.cityLat != null) setSouthern(details.cityLat < 0);
      const counts = new Map<string, number>();
      for (const row of (trips?.data || []) as Array<{ destination?: string }>) {
        const name = String(row?.destination || '').trim();
        if (!name) continue;
        counts.set(name, (counts.get(name) || 0) + 1);
      }
      const city = details?.city || model.climate.city;
      const list: DetailPlaceInput[] = [];
      if (city) list.push({ name: city, trips: 0, home: true });
      for (const [name, tripCount] of counts) {
        if (city && name.toLowerCase() === city.toLowerCase()) continue;
        list.push({ name, trips: tripCount, home: false });
        if (list.length >= 5) break;
      }
      setPlaces(list);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeId]);

  useEffect(() => {
    rootRef.current?.scrollIntoView({ block: 'start' });
  }, [typeId]);

  const copy = usePieceDetailCopy(type, model, pieces, profile, places);

  const span = type ? spanOf(type) : null;
  const days = type ? daysInSpan(model.climate, span) : null;
  const months = useMemo(
    () => (model.climate.bands ? monthlyMeans(model.climate.bands, southern) : null),
    [model.climate.bands, southern],
  );

  // Pieces whose OWN range reaches into this band — real warmth rows first,
  // then the deterministic inference; a weather-neutral piece joins nothing.
  const reachingCount = useMemo(() => {
    if (!span) return 0;
    let n = 0;
    for (const piece of pieces) {
      const read = warmthFor(piece, materials, warmth);
      if (read.warmth_level === 'all-weather') continue;
      if (Math.min(read.max_comfortable_temp_c, span.hi) - Math.max(read.min_comfortable_temp_c, span.lo) >= 2) n += 1;
    }
    return n;
  }, [pieces, span, warmth, materials]);

  // The ledger's own covered range — the READING column's third line.
  const boardRange = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const piece of pieces) {
      const read = warmthFor(piece, materials, warmth);
      if (read.warmth_level === 'all-weather') continue;
      lo = Math.min(lo, read.min_comfortable_temp_c);
      hi = Math.max(hi, read.max_comfortable_temp_c);
    }
    return Number.isFinite(lo) && Number.isFinite(hi) && hi > lo ? { lo, hi } : null;
  }, [pieces, warmth, materials]);

  const hasPicks = useMemo(() => (type ? huntHasPicksFor(type) : false), [type]);

  if (!type || !copy) return null;

  const ownedNames = model.ownership.names.get(type.id) || [];
  const gapRank = model.gaps.get(type.id) || null;
  const makers = makerRowsOf(type);
  const neighbours = neighboursOf(type, 6);
  const cat = model.categories.find((c) => c.id === type.category) || null;
  const home = runOfType(type.id);
  const subCategory = home?.run.label || null;

  const huntThis = () => openInBeausPicks({ categoryId: type.category, subCategory });
  const logOne = () => window.dispatchEvent(new CustomEvent('ethaion:add-piece', { detail: { name: type.name } }));

  const toneInk = (tone: 'essential' | 'works' | 'wrong') =>
    tone === 'essential' ? ACCENT_DEEP : tone === 'wrong' ? FAINTER : SECONDARY;

  return (
    <div ref={rootRef} style={{ scrollMarginTop: '80px' }}>
      {/* ——— the way back, and where you are */}
      <CrumbHeader
        backLabel="The Index"
        onBack={onBack}
        segs={[
          { label: 'Ethaion', onClick: () => goToEthaionTab('wardrobe') },
          { label: 'The Index', onClick: onBack },
          { label: categoryName(type.category), onClick: onBack },
          { label: type.name },
        ]}
      />

      {/* ——— 1 · the head */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_350px]" style={{ gap: '22px 48px', marginTop: '20px', paddingBottom: '24px', borderBottom: `1px solid ${INK}` }}>
        <div className="min-w-0">
          <h3 style={{ ...serif(0), fontSize: 'clamp(30px, 4vw, 42px)', lineHeight: 1.06, margin: 0, color: WALNUT }}>{type.name}</h3>
          <div style={{ ...mono(8.5, MUTED), marginTop: '10px' }}>{copy.aka}</div>
          <p style={{ ...body(14.5, INK), margin: '14px 0 0', maxWidth: '62ch' }}>{copy.intro}</p>
        </div>

        {/* AGAINST YOUR LEDGER */}
        <div style={{ border: `1px solid ${RULE}`, background: PAPER, padding: '15px 17px 17px', alignSelf: 'start' }}>
          <div style={mono(8.5, ACCENT_DEEP)}>Against your ledger</div>
          <div style={{ ...serif(19), marginTop: '9px' }}>
            {ownedNames.length > 0
              ? `You own ${ownedNames.length === 1 ? 'one' : String(ownedNames.length)}.`
              : gapRank
                ? `You own none — a gap your board names, #${gapRank}.`
                : 'You own none.'}
          </div>
          {ownedNames.length > 0 && <div style={{ ...body(12.5, SECONDARY), marginTop: '6px' }}>{ownedNames.join(` ${MIDDOT} `)}</div>}
          <p style={{ ...body(12.5, SECONDARY), margin: '8px 0 0', lineHeight: 1.55 }}>{copy.ledgerNote}</p>
          {cat && (
            <div style={{ ...mono(7.5, FAINT), marginTop: '9px' }}>
              {categoryName(type.category)} coverage {MIDDOT} {cat.ownedCount} of {cat.total} types owned
            </div>
          )}
          <div className="flex flex-wrap" style={{ gap: '8px', marginTop: '14px' }}>
            <OutlinedControl solid onClick={huntThis}>Hunt for one →</OutlinedControl>
            <OutlinedControl onClick={logOne}>Log one I own</OutlinedControl>
          </div>
          <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: ROW_HAIRLINE }}>
            {hasPicks ? (
              <ControlLink onClick={huntThis}>See Beau's picks →</ControlLink>
            ) : (
              <ControlLink onClick={() => openInAskBeau(`Find me a ${type.name.toLowerCase()} — the right cut, cloth and maker for me`)}>
                Ask Beau to search →
              </ControlLink>
            )}
          </div>
        </div>
      </div>

      {/* ——— 2 · the temperature band */}
      {span && (
        <section>
          <SectionHead title="The temperature band" note={model.climate.city ? `reads your ${model.climate.city} year, set in the Dossier` : 'set a city in the Dossier and the days fill in'} />
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]" style={{ gap: '20px 52px', marginTop: '16px' }}>
            <div className="min-w-0">
              <div style={{ ...serif(0), fontSize: 'clamp(30px, 4vw, 40px)', lineHeight: 1, color: WALNUT }}>{spanLabel(span)}C</div>
              <div style={{ ...mono(8, MUTED), marginTop: '6px' }}>{copy.bandNote}</div>
              <div style={{ marginTop: '16px' }}>
                <BandRuler span={span} />
              </div>
              <div style={{ ...mono(8, ACCENT_DEEP), marginTop: '18px' }}>Your year, plotted on the same ruler</div>
              <YearStrip months={months} span={span} />
            </div>
            <div>
              <div style={{ borderTop: `1px solid ${RULE}` }}>
                <div style={{ padding: '11px 0', borderBottom: ROW_HAIRLINE }}>
                  <span style={{ ...serif(23, WALNUT) }}>{days != null ? days : '\u2014'}</span>
                  <span style={{ ...mono(8, SECONDARY), marginLeft: '10px' }}>
                    days a year{model.climate.city ? ` in ${model.climate.city}` : ''} sit inside {spanLabel(span)}
                  </span>
                </div>
                <div style={{ padding: '11px 0', borderBottom: ROW_HAIRLINE }}>
                  <span style={{ ...serif(23, WALNUT) }}>{reachingCount}</span>
                  <span style={{ ...mono(8, SECONDARY), marginLeft: '10px' }}>
                    piece{reachingCount === 1 ? '' : 's'} you own reach{reachingCount === 1 ? 'es' : ''} into this band
                  </span>
                </div>
              </div>
              <p style={{ ...body(12.5, SECONDARY), margin: '12px 0 0', lineHeight: 1.55 }}>
                The band is apparent temperature — what the day feels like, not what the thermometer says. The counts are
                arithmetic over your own record, never an opinion.
              </p>
              <div className="flex flex-wrap" style={{ gap: '10px 18px', marginTop: '14px' }}>
                <ControlLink onClick={() => onIndexByBand(type.category as GarmentCategoryId, type.band)}>Index by temperature →</ControlLink>
                <ControlLink onClick={huntThis}>Hunt this band →</ControlLink>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ——— 3 · registers · colours */}
      <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: '0 52px' }}>
        <section className="min-w-0">
          <SectionHead title="Registers it carries" />
          <div style={{ marginTop: '4px' }}>
            {FIELD_REGISTERS.map((reg) => {
              const carries = type.reach.includes(reg);
              const note = copy.registers[reg];
              return (
                <div key={reg} className="grid grid-cols-[118px_minmax(0,1fr)]" style={{ gap: '16px', padding: '10px 0', borderBottom: ROW_HAIRLINE, alignItems: 'baseline' }}>
                  <span style={mono(8.5, carries ? WALNUT : FAINTER)}>{FIELD_REGISTER_LABELS[reg]}</span>
                  <span className="min-w-0">
                    <span style={{ ...body(13, carries ? INK : FAINTER), display: 'block', lineHeight: 1.5 }}>
                      {carries ? note?.note || 'It carries this one.' : '\u2014 it does not reach this register; force it and the piece reads wrong.'}
                    </span>
                    {carries && (note?.occasions || []).length > 0 && (
                      <span style={{ ...mono(7, MUTED), display: 'block', marginTop: '4px' }}>{(note?.occasions || []).join(` ${MIDDOT} `)}</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="min-w-0">
          <SectionHead title="Colours to buy it in" note="ranked for your ledger" />
          <div style={{ marginTop: '4px' }}>
            {copy.colours.map((colour, i) => (
              <div key={colour.name} className="grid grid-cols-[22px_16px_minmax(0,1fr)]" style={{ gap: '10px', padding: '10px 0', borderBottom: ROW_HAIRLINE, alignItems: 'baseline' }}>
                <span style={mono(8, FAINTER)}>{String(i + 1).padStart(2, '0')}</span>
                <span
                  aria-hidden
                  style={{
                    width: '11px',
                    height: '11px',
                    borderRadius: '50%',
                    background: swatchFor(colour.name) || '#d5d3cd',
                    border: '1px solid rgba(59,43,29,0.3)',
                    display: 'inline-block',
                    transform: 'translateY(1px)',
                  }}
                />
                <span className="min-w-0">
                  <span style={{ ...body(14, i === 0 ? WALNUT : INK), display: 'block' }}>{colour.name}</span>
                  <span style={{ ...body(12, SECONDARY), display: 'block', marginTop: '2px', lineHeight: 1.5 }}>{colour.why}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ——— 4 · where it suits */}
      {places.length > 0 && (
        <section>
          <SectionHead title="Where it suits" note={`your city first, then everywhere you go ${MIDDOT} places from the Dossier`} />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" style={{ gap: '14px 20px', marginTop: '16px' }}>
            {copy.places.map((place) => (
              <div key={place.name} style={{ border: `1px solid ${HAIRLINE}`, background: PAPER, padding: '14px 16px 16px' }}>
                <div className="flex items-baseline justify-between" style={{ gap: '10px' }}>
                  <span style={{ ...serif(18, WALNUT) }}>{place.name}</span>
                  <span style={mono(7, FAINT)}>{place.home ? 'your city' : `${place.trips} trip${place.trips === 1 ? '' : 's'}`}</span>
                </div>
                <div style={{ ...mono(8.5, toneInk(place.tone)), marginTop: '8px' }}>{place.verdict}</div>
                <p style={{ ...body(12.5, SECONDARY), margin: '8px 0 0', lineHeight: 1.55 }}>{place.why}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ——— 5 · the cuts */}
      {type.cuts.length > 0 && (
        <section>
          <SectionHead title={copy.cutsHeading} />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" style={{ gap: '16px 20px', marginTop: '16px' }}>
            {copy.cuts.map((cut) => (
              <CutCard key={cut.name} typeId={type.id} cut={cut.name} sub={cut.sub} note={cut.note} />
            ))}
          </div>
        </section>
      )}

      {/* ——— 6 · who makes it */}
      <section>
        <div className="flex items-baseline justify-between flex-wrap" style={{ gap: '6px 18px', paddingBottom: '8px', borderBottom: `1px solid ${RULE}`, marginTop: '34px' }}>
          <span className="inline-flex items-baseline flex-wrap" style={{ gap: '4px 14px' }}>
            <span style={serif(20)}>Who makes it</span>
            <span style={mono(8, FAINT)}>by price, with the references marked</span>
          </span>
          <span className="inline-flex items-baseline" style={{ gap: '14px' }}>
            <span style={mono(8, SECONDARY)}>{makers.length} maker{makers.length === 1 ? '' : 's'} on file</span>
            <ControlLink onClick={() => onMakersForType(type)}>All makers who cut it →</ControlLink>
          </span>
        </div>
        {makers.length > 0 ? (
          <div style={{ marginTop: '4px' }}>
            <div className="hidden md:grid grid-cols-[44px_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.4fr)_110px] items-baseline" style={{ gap: '16px', padding: '9px 0', borderBottom: `1px solid ${RULE}` }}>
              <span />
              <span style={mono(8, FAINT)}>Maker</span>
              <span style={mono(8, FAINT)}>Where</span>
              <span style={mono(8, FAINT)}>What they cut it in</span>
              <span style={{ ...mono(8, FAINT), textAlign: 'right' }}>Price new</span>
            </div>
            {makers.map(({ name, profile: p, ref }) => (
              <div key={name} className="grid grid-cols-[44px_minmax(0,1fr)] md:grid-cols-[44px_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.4fr)_110px] items-baseline" style={{ gap: '8px 16px', padding: '10px 0', borderBottom: ROW_HAIRLINE }}>
                <span>
                  {ref && (
                    <span style={{ ...mono(7, '#5c3413'), background: 'rgba(168,113,44,0.16)', border: '1px solid rgba(168,113,44,0.6)', padding: '1.5px 5px' }}>Ref</span>
                  )}
                </span>
                <span className="min-w-0">
                  <button
                    type="button"
                    onClick={() => openMakerSheet(name)}
                    className="text-left hover:underline"
                    style={{ ...serif(15.5, WALNUT), color: ACCENT_DEEP, background: 'transparent', padding: 0, border: 'none', lineHeight: 1.3 }}
                  >
                    {name}
                  </button>
                </span>
                <span className="min-w-0" style={body(12.5, SECONDARY)}>
                  {p ? [p.city, p.country].filter((v) => v && v !== '\u2014').join(', ') : verifiedBrandWebsiteUrl(name) ? 'In the wider directory' : '\u2014'}
                </span>
                <span className="min-w-0" style={body(12.5, INK)}>{(p?.materials || []).slice(0, 3).join(` ${MIDDOT} `) || p?.construction || '\u2014'}</span>
                <span className="md:text-right" style={mono(8.5, SECONDARY)}>{priceNewOf(p)}</span>
              </div>
            ))}
            <p style={{ ...body(12, FAINT), margin: '10px 0 0', maxWidth: '78ch' }}>
              Ref means the maker defines the piece, not that it's the best one for you. Sorting is by price, because
              price is the only ranking that isn't an opinion.
            </p>
          </div>
        ) : (
          <p style={{ ...body(13, SECONDARY), margin: '12px 0 0' }}>No verified maker in the directory — never guessed.</p>
        )}
      </section>

      {/* ——— 7 · what else answers this band */}
      {span && neighbours.length > 0 && (
        <section>
          <SectionHead title="What else answers this band" note="computed from the band, never authored per type" />
          <div className="flex overflow-x-auto" style={{ gap: '14px', marginTop: '16px', paddingBottom: '8px', WebkitOverflowScrolling: 'touch' }}>
            {[{ id: type.id, name: type.name, current: true, span }, ...neighbours.map((n) => ({ id: n.id, name: n.name, current: false, span: spanOf(n) }))].map((entry) => (
              <div key={entry.id} className="flex-shrink-0" style={{ width: '190px', border: `1px solid ${entry.current ? INK : HAIRLINE}`, background: entry.current ? PAPER : 'transparent', padding: '12px 13px 14px' }}>
                {entry.current ? (
                  <span style={{ ...serif(15, WALNUT), display: 'block', lineHeight: 1.25 }}>{entry.name}</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onOpenType(entry.id)}
                    className="text-left hover:underline"
                    style={{ ...serif(15, WALNUT), background: 'transparent', padding: 0, border: 'none', lineHeight: 1.25 }}
                  >
                    {entry.name}
                  </button>
                )}
                <div aria-hidden style={{ position: 'relative', height: '8px', marginTop: '10px', background: 'rgba(59,43,29,0.06)' }}>
                  {entry.span && (
                    <span
                      style={{
                        position: 'absolute',
                        left: `${pct(entry.span.lo)}%`,
                        width: `${Math.max(2, pct(entry.span.hi) - pct(entry.span.lo))}%`,
                        top: entry.current ? 0 : '2px',
                        height: entry.current ? '8px' : '4px',
                        background: entry.current ? '#241a12' : 'rgba(59,43,29,0.35)',
                      }}
                    />
                  )}
                </div>
                <div style={{ ...mono(7, MUTED), marginTop: '5px' }}>{entry.span ? spanLabel(entry.span) : '\u2014'}</div>
                <p style={{ ...body(11.5, SECONDARY), margin: '8px 0 0', lineHeight: 1.5 }}>
                  {entry.current ? 'This page.' : copy.neighbours[entry.id] || ''}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ——— 8 · Beau's verdict */}
      <section style={{ marginTop: '36px', background: WALNUT, padding: '24px 26px 28px' }}>
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_230px]" style={{ gap: '20px 44px' }}>
          <div className="min-w-0">
            <div style={mono(8.5, ON_WALNUT_GOLD)}>Beau, reading this page against your ledger</div>
            <p style={{ fontFamily: 'var(--space-font-heading)', fontWeight: 400, fontSize: 'clamp(19px, 2.4vw, 24px)', lineHeight: 1.4, color: ON_WALNUT, margin: '12px 0 0', maxWidth: '54ch' }}>
              {`\u201c${copy.verdict}\u201d`}
            </p>
          </div>
          <div>
            <div style={{ ...mono(8, ON_WALNUT_GOLD), paddingBottom: '8px', borderBottom: '1px solid rgba(251,241,222,0.25)' }}>Reading</div>
            <div style={{ padding: '9px 0', borderBottom: '1px solid rgba(251,241,222,0.12)' }}>
              <span style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px', color: ON_WALNUT }}>
                {pieces.length} piece{pieces.length === 1 ? '' : 's'} on your ledger
              </span>
            </div>
            <div style={{ padding: '9px 0', borderBottom: '1px solid rgba(251,241,222,0.12)' }}>
              <span style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px', color: ON_WALNUT }}>
                {model.climate.city || 'No city set — the Dossier holds it'}
              </span>
            </div>
            <div style={{ padding: '9px 0', borderBottom: '1px solid rgba(251,241,222,0.12)' }}>
              <span style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px', color: ON_WALNUT }}>
                {boardRange ? `Your board covers ${Math.round(boardRange.lo)}\u2013${Math.round(boardRange.hi)}\u00b0` : 'No temperature reads yet'}
              </span>
            </div>
            <button
              type="button"
              onClick={huntThis}
              className="hover:underline text-left"
              style={{ ...mono(8.5, ON_WALNUT_GOLD), background: 'transparent', padding: '12px 0 0', border: 'none' }}
            >
              Hunt this piece →
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
