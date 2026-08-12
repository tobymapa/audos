/**
 * THE INDEX · MAKERS — the maker reference list (full layout rebuild,
 * August 2026).
 *
 * The same shape as the Pieces face: stacked filter rows over one flat
 * reference list. No maker pages, no quadrant, no drill-down — rows are
 * not tappable; the list is read, filtered and left.
 *
 *   · Row 1 — register chips (the six registers). Multi-select.
 *   · Row 2 — price band chips (Accessible · Mid-range · Premium ·
 *     Luxury — the four bands of brands.ts). Multi-select.
 *   · Row 3 — country chips, built dynamically from the maker data.
 *     Multi-select.
 *   · Reset at the top right clears all three rows.
 *
 * The list merges every maker source: BRAND_DIRECTORY (the verified
 * catalog — full records), BRAND_REFERENCE (the quality reference layer —
 * partial records render what they can assert and withhold the rest) and
 * the reader's own trusted makers (marked “Added by you”). Each row:
 * name · country · price band · register chips · quality score when known ·
 * up to three signature pieces. Alphabetical, always.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  BRAND_DIRECTORY,
  PRICE_BAND_ORDER,
  PRICE_BAND_SYMBOL,
  type PriceBand,
  type Register,
} from './brands';
import { BRAND_REFERENCE } from './brand-reference';
import { fetchTrustedBrands } from './profile-data';
import { FIELD_REGISTER_LABELS } from './index-model';
import {
  ACCENT_DEEP,
  Chip,
  FAINT,
  FAINTER,
  HAIRLINE,
  INK,
  ResetButton,
  SECONDARY,
  TierLabel,
  WALNUT,
  body,
  mono,
} from './index-style';
import { usePlexMono } from './mono-type';

// ---------------------------------------------------------------------------
// Filter option sets.
// ---------------------------------------------------------------------------

const REGISTER_OPTIONS: Register[] = ['Casual', 'Smart-Casual', 'Business', 'Formal', 'Outdoor-Work', 'Black-Tie'];

/** Compact price-band chip labels over the four bands of brands.ts. */
const PRICE_SHORT: Record<PriceBand, string> = {
  accessible: 'Accessible',
  mid: 'Mid-range',
  'upper-mid': 'Premium',
  luxury: 'Luxury',
};

// ---------------------------------------------------------------------------
// The merged maker record — one row shape whatever the source. A field the
// source cannot assert is null and simply doesn't render.
// ---------------------------------------------------------------------------

interface MakerRecord {
  name: string;
  country: string | null;
  city: string | null;
  priceBand: PriceBand | null;
  registers: Register[];
  quality: number | null;
  signature: string[];
  userAdded: boolean;
}

const PRICE_IDS: PriceBand[] = ['accessible', 'mid', 'upper-mid', 'luxury'];

function referencePriceBand(raw: string): PriceBand | null {
  return (PRICE_IDS as string[]).includes(raw) ? (raw as PriceBand) : null;
}

/** The static merge — the verified directory first, then reference-layer
 * makers the directory doesn't already hold. */
function baseMakers(): MakerRecord[] {
  const rows: MakerRecord[] = BRAND_DIRECTORY.map((b) => ({
    name: b.brand,
    country: b.country || null,
    city: b.city || null,
    priceBand: b.priceBand,
    registers: b.registers,
    quality: Number.isFinite(b.qualityScore) ? b.qualityScore : null,
    signature: (b.signaturePieces || []).slice(0, 3),
    userAdded: false,
  }));
  const seen = new Set(rows.map((r) => r.name.toLowerCase()));
  for (const entry of BRAND_REFERENCE) {
    const key = entry.brand.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      name: entry.brand,
      country: null,
      city: null,
      priceBand: referencePriceBand(entry.priceRange),
      registers: [],
      quality: null,
      signature: entry.category && entry.category !== 'Any' ? [entry.category] : [],
      userAdded: false,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// One maker row — reference only, nothing opens.
// ---------------------------------------------------------------------------

function MakerRow({ m }: { m: MakerRecord }) {
  return (
    <div style={{ padding: '9px 0', borderBottom: '1px solid rgba(59,43,29,0.10)' }}>
      <div className="flex items-baseline flex-wrap" style={{ gap: '4px 12px' }}>
        <span style={{ fontFamily: 'var(--space-font-heading)', fontSize: '15.5px', fontWeight: 400, lineHeight: 1.3, color: WALNUT }}>
          {m.name}
        </span>
        {m.userAdded && <span style={{ ...mono(7.5, '#5c3413'), background: 'rgba(168,113,44,0.14)', border: '1px solid rgba(168,113,44,0.5)', padding: '1.5px 6px', borderRadius: '999px' }}>Added by you</span>}
        {m.country && <span style={mono(8, FAINT)}>{[m.city, m.country].filter(Boolean).join(', ')}</span>}
        {m.priceBand && (
          <span title={PRICE_SHORT[m.priceBand]} style={mono(8, SECONDARY)}>
            {PRICE_BAND_SYMBOL[m.priceBand]} · {PRICE_SHORT[m.priceBand]}
          </span>
        )}
        {m.quality != null && (
          <span title="Quality score" style={{ ...mono(8, ACCENT_DEEP), marginLeft: 'auto', whiteSpace: 'nowrap' }}>
            {m.quality}/10
          </span>
        )}
      </div>
      {(m.registers.length > 0 || m.signature.length > 0) && (
        <div className="flex items-center flex-wrap" style={{ gap: '5px 8px', marginTop: '5px' }}>
          {m.registers.map((reg) => (
            <span
              key={reg}
              style={{ ...mono(7, SECONDARY), border: `1px solid ${HAIRLINE}`, borderRadius: '999px', padding: '1.5px 7px', whiteSpace: 'nowrap' }}
            >
              {FIELD_REGISTER_LABELS[reg] || reg}
            </span>
          ))}
          {m.signature.length > 0 && (
            <span style={{ ...body(12, INK), opacity: 0.85 }}>{m.signature.join(' · ')}</span>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The view.
// ---------------------------------------------------------------------------

export function IndexMakers() {
  usePlexMono();
  const [regs, setRegs] = useState<Register[]>([]);
  const [bands, setBands] = useState<PriceBand[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [userMakers, setUserMakers] = useState<MakerRecord[]>([]);

  // The reader's own makers — merged in when not already on the list.
  useEffect(() => {
    let alive = true;
    fetchTrustedBrands()
      .then((rows) => {
        if (!alive) return;
        const known = new Set([...BRAND_DIRECTORY.map((b) => b.brand.toLowerCase()), ...BRAND_REFERENCE.map((e) => e.brand.toLowerCase())]);
        setUserMakers(
          rows
            .map((r) => (r.brand || '').trim())
            .filter((name) => name && !known.has(name.toLowerCase()))
            .map((name) => ({
              name,
              country: null,
              city: null,
              priceBand: null,
              registers: [],
              quality: null,
              signature: [],
              userAdded: true,
            })),
        );
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const allMakers = useMemo(() => {
    const merged = [...baseMakers(), ...userMakers];
    return merged.sort((a, b) => a.name.localeCompare(b.name));
  }, [userMakers]);

  const countryOptions = useMemo(
    () => [...new Set(allMakers.map((m) => m.country).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b)),
    [allMakers],
  );

  const toggleIn = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const reset = () => {
    setRegs([]);
    setBands([]);
    setCountries([]);
  };

  // OR within each row, AND between rows. A maker missing the filtered
  // field is excluded while that row has an active selection.
  const shown = useMemo(
    () =>
      allMakers.filter((m) => {
        if (regs.length > 0 && !m.registers.some((r) => regs.includes(r))) return false;
        if (bands.length > 0 && (!m.priceBand || !bands.includes(m.priceBand))) return false;
        if (countries.length > 0 && (!m.country || !countries.includes(m.country))) return false;
        return true;
      }),
    [allMakers, regs, bands, countries],
  );

  const filtersActive = regs.length > 0 || bands.length > 0 || countries.length > 0;

  return (
    <div>
      {/* ─── the filter bar: three rows stacked, Reset at the top right */}
      <div style={{ padding: '2px 0 14px', borderBottom: `1px solid ${HAIRLINE}` }}>
        {/* Row 1 · register — multi-select */}
        <div className="flex items-start" style={{ gap: '12px' }}>
          <TierLabel>Register</TierLabel>
          <div className="flex overflow-x-auto min-w-0 flex-1" style={{ gap: '8px', paddingBottom: '4px' }}>
            {REGISTER_OPTIONS.map((reg) => (
              <Chip key={reg} active={regs.includes(reg)} onClick={() => setRegs((cur) => toggleIn(cur, reg))}>
                {FIELD_REGISTER_LABELS[reg] || reg}
              </Chip>
            ))}
          </div>
          <ResetButton active={filtersActive} onClick={reset} />
        </div>

        {/* Row 2 · price band — multi-select */}
        <div className="flex items-start" style={{ gap: '12px', marginTop: '10px' }}>
          <TierLabel>Price band</TierLabel>
          <div className="flex flex-wrap min-w-0 flex-1" style={{ gap: '8px' }}>
            {PRICE_BAND_ORDER.map((band) => (
              <Chip key={band} active={bands.includes(band)} onClick={() => setBands((cur) => toggleIn(cur, band))}>
                {PRICE_BAND_SYMBOL[band]} {PRICE_SHORT[band]}
              </Chip>
            ))}
          </div>
        </div>

        {/* Row 3 · country — built from the maker data, multi-select */}
        <div className="flex items-start" style={{ gap: '12px', marginTop: '10px' }}>
          <TierLabel>Country</TierLabel>
          <div className="flex flex-wrap min-w-0 flex-1" style={{ gap: '8px' }}>
            {countryOptions.map((country) => (
              <Chip key={country} active={countries.includes(country)} onClick={() => setCountries((cur) => toggleIn(cur, country))}>
                {country}
              </Chip>
            ))}
          </div>
        </div>
      </div>

      {/* ─── the count line */}
      <div style={{ ...mono(8, FAINT), padding: '12px 0 4px' }}>
        {shown.length} of {allMakers.length} makers
      </div>

      {/* ─── the list — flat, alphabetical, reference only */}
      {shown.length === 0 ? (
        <p style={{ ...mono(8.5, SECONDARY), padding: '18px 0' }}>No maker answers this combination — Reset to see everyone.</p>
      ) : (
        <div>
          {shown.map((m) => (
            <MakerRow key={m.name} m={m} />
          ))}
        </div>
      )}

      <p style={{ ...mono(7.5, FAINTER), paddingTop: '14px' }}>
        Makers you add yourself join the list as Beau learns about them.
      </p>
    </div>
  );
}
