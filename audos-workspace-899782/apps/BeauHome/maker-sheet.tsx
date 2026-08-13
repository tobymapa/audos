/**
 * THE MAKER SHEET — the app-wide maker detail popout (August 2026).
 *
 * Click a maker's NAME anywhere — the Index's makers table, a piece detail
 * page's makers field, a Ledger row, a Hunt pick — and this sheet slides in
 * from the right with the house's file: where they are and since when, what
 * they're known for (cut, materials, price positioning), the piece types
 * they cut, the price range, and Beau's own note on whether the house is
 * right for THIS reader.
 *
 * · `openMakerSheet(name)` — the one way in, from any surface. It fires an
 *   event; the host below (mounted once in App.tsx) does the rest.
 * · Data comes from the merged maker record: the verified catalog
 *   (BRAND_DIRECTORY via findCatalogBrand) first, then the reader's own
 *   hunt_directory_brands additions (their stored dossier JSON). A maker
 *   with no file at all still opens — Beau writes a short read from what
 *   he knows, cached, with a quiet deterministic line until it lands.
 * · RESTYLED to the founder's screenshot (August 2026): MAKER · COUNTRY
 *   top bar with an ×, the name in large serif, CITY · SINCE · tier line,
 *   the tagline and description, the BEAU'S READ tinted callout with its
 *   type tag, four data cells (RUNS IT CUTS · PRICE, NEW · YOUR LEDGER ·
 *   STOCKED), the PIECES THEY CUT pills, and SEND TO THE HUNT · BACK TO
 *   THE LIST. It closes on the ×, on Escape and on a backdrop tap — no
 *   dead-end overlay (founder's rule).
 *
 * Every colour and type helper is the shared warm-editorial set
 * (index-style.tsx); nothing here sets a palette of its own.
 */
import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import {
  PRICE_BAND_LABELS,
  PRICE_BAND_SYMBOL,
  findCatalogBrand,
  parseDirectoryRow,
  verifiedBrandWebsiteUrl,
  type BrandProfile,
  type DirectoryBrandRow,
} from './brands';
import { garmentTypesForMaker } from './garment-types';
import { categoryName } from './index-model';
import { openInAskBeau, openInTheIndex } from './edit-links';
import { CLAUDE_HAIKU, callModel } from './claude';
import type { StyleProfile, WardrobePiece } from './profile-data';
import {
  ACCENT_DEEP,
  FAINT,
  HAIRLINE,
  INK,
  MUTED,
  PAPER,
  RULE,
  SECONDARY,
  TINT_SOFT,
  WALNUT,
  body,
  mono,
  serif,
} from './index-style';

export const MAKER_SHEET_EVENT = 'ethaion:open-maker';

/** Open the maker sheet from anywhere in the app. */
export function openMakerSheet(name: string): void {
  const clean = (name || '').trim();
  if (!clean) return;
  window.dispatchEvent(new CustomEvent(MAKER_SHEET_EVENT, { detail: { name: clean } }));
}

// window.__workspaceDb is auto-injected by the platform compiler when it
// sees this literal token in app source.
function db(): any {
  return (window as any).__workspaceDb;
}

// ---------------------------------------------------------------------------
// Beau's note — one short cached read per maker, per reader's facts.
// ---------------------------------------------------------------------------

function fingerprint(value: unknown): string {
  const text = JSON.stringify(value);
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function readCache(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeCache(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable — the session state still shows it */
  }
}

function parseJson(raw: string | null): any {
  if (!raw) return null;
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  } catch {
    return null;
  }
}

function fallbackNote(name: string, profile: BrandProfile | null, ownsIt: boolean): string {
  if (ownsIt) return `Already proven on your ledger — you know how ${name} fits you, which is worth more than any review.`;
  if (!profile) return `Not fully on file yet — Beau adds the dossier as he learns the house.`;
  const price = PRICE_BAND_LABELS[profile.priceBand] || '';
  const make = profile.construction && profile.construction !== '—' ? profile.construction.toLowerCase() : 'honest make';
  return `${make.charAt(0).toUpperCase()}${make.slice(1)} at ${price.toLowerCase() || 'a fair price'} — sound for the money; read the sizing note before you buy.`;
}

function useBeauMakerNote(
  name: string | null,
  profile: BrandProfile | null,
  reader: { profile: StyleProfile | null; pieces: WardrobePiece[] },
): string | null {
  const ownsIt = useMemo(
    () => !!name && reader.pieces.some((p) => (p.brand || '').trim().toLowerCase() === name.trim().toLowerCase()),
    [name, reader.pieces],
  );
  const key = useMemo(() => {
    if (!name) return null;
    const fp = fingerprint({
      name: name.toLowerCase(),
      ownsIt,
      archetypes: reader.profile?.archetypes || [],
      build: reader.profile?.build || null,
      city: reader.profile?.lifestyle?.city || null,
    });
    return `ethaion:maker-note:v1:${fp}`;
  }, [name, ownsIt, reader.profile]);
  const [note, setNote] = useState<string | null>(() => (key ? readCache(key) : null));

  useEffect(() => {
    if (!name || !key) return;
    const cached = readCache(key);
    if (cached) {
      setNote(cached);
      return;
    }
    setNote(null);
    let alive = true;
    const facts = profile
      ? `Where: ${[profile.city, profile.country].filter(Boolean).join(', ') || 'unknown'}${profile.founded ? ` · since ${profile.founded}` : ''}. `
        + `Price: ${PRICE_BAND_LABELS[profile.priceBand] || 'unknown'}${profile.priceRangeLabel && profile.priceRangeLabel !== '—' ? ` (${profile.priceRangeLabel})` : ''}. `
        + `Construction: ${profile.construction || 'unknown'} · ${profile.constructionQuality || ''}. `
        + `Known for: ${(profile.signaturePieces || []).slice(0, 4).join(', ') || profile.referenceFor || 'unknown'}. `
        + `Sizing: ${profile.sizingNote || 'unknown'}.`
      : 'No dossier on file — write only what you are confident of about this house, and say so when you are not.';
    const who = [
      reader.profile?.build ? `build: ${reader.profile.build}` : null,
      reader.profile?.skin_tone ? `colouring: ${reader.profile.skin_tone}` : null,
      (reader.profile?.archetypes || []).length > 0 ? `style directions: ${(reader.profile?.archetypes || []).join(', ')}` : null,
      reader.profile?.lifestyle?.city ? `city: ${reader.profile.lifestyle.city}` : null,
      ownsIt ? `already owns a piece by ${name}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    void callModel({
      model: CLAUDE_HAIKU,
      second: null,
      system: [
        {
          text:
            'You are Beau, the valet voice of a classic-menswear wardrobe app. Register: quiet, knowing, concrete, lightly British; short declarative sentences; no exclamation marks, no emoji. Write TO the wearer (“you”). Return STRICT JSON only: {"note": "..."} — 2–3 short sentences (max 320 characters) saying whether THIS maker is right for THIS wearer and why: weigh the price positioning against a considered budget, the cut against his frame, the register against his life. Never invent facts about the maker.',
          cache: true,
        },
      ],
      user: `The maker: ${name}.\n${facts}\nThe wearer — ${who || 'no dossier on file yet'}.`,
      maxTokens: 260,
      temperature: 0.5,
    })
      .then((raw) => {
        const text = typeof parseJson(raw)?.note === 'string' ? String(parseJson(raw).note).trim() : '';
        if (!alive || !text) return;
        writeCache(key, text);
        setNote(text);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!name) return null;
  return note || fallbackNote(name, profile, ownsIt);
}

// ---------------------------------------------------------------------------
// The host — mounted once in App.tsx; every surface opens it by event.
// ---------------------------------------------------------------------------

/** One data cell of the founder's layout — the label above, the value
 * beneath it, set in columns. */
function DataCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '12px 0', borderBottom: '1px solid rgba(59,43,29,0.12)' }}>
      <span className="block" style={mono(8, FAINT)}>
        {label}
      </span>
      <span className="block" style={{ ...body(13, INK), marginTop: '5px', lineHeight: 1.5 }}>
        {children}
      </span>
    </div>
  );
}

export function MakerSheetHost({
  profile,
  pieces,
}: {
  profile: StyleProfile | null;
  pieces: WardrobePiece[];
}) {
  const [name, setName] = useState<string | null>(null);
  const [addedRows, setAddedRows] = useState<DirectoryBrandRow[]>([]);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const wanted = String((e as CustomEvent).detail?.name || '').trim();
      if (wanted) setName(wanted);
    };
    window.addEventListener(MAKER_SHEET_EVENT, onOpen);
    return () => window.removeEventListener(MAKER_SHEET_EVENT, onOpen);
  }, []);

  // The reader's own directory additions — read once the sheet first opens,
  // so a maker Beau discovered in the Hunt opens with its stored dossier.
  useEffect(() => {
    if (!name || addedRows.length > 0) return;
    let alive = true;
    db()
      ?.from('hunt_directory_brands')
      .orderBy('created_at', 'desc')
      .limit(500)
      .get()
      .then(({ data }: { data: DirectoryBrandRow[] }) => {
        if (alive && Array.isArray(data)) setAddedRows(data);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  // Escape closes — the same rule every overlay in the app follows.
  useEffect(() => {
    if (!name) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setName(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [name]);

  const brandProfile = useMemo<BrandProfile | null>(() => {
    if (!name) return null;
    const catalog = findCatalogBrand(name);
    if (catalog) return catalog;
    const key = name.toLowerCase();
    for (const row of addedRows) {
      if ((row.brand || '').toLowerCase() !== key) continue;
      const entry = parseDirectoryRow(row);
      if (entry) return entry.profile;
    }
    return null;
  }, [name, addedRows]);

  const types = useMemo(() => (name ? garmentTypesForMaker(name) : []), [name]);
  const note = useBeauMakerNote(name, brandProfile, { profile, pieces });

  if (!name) return null;

  const p = brandProfile;
  const site = p?.websiteUrl || verifiedBrandWebsiteUrl(name);
  const close = () => setName(null);

  // The dossier, read into the founder's layout (August 2026 restyle):
  // MAKER · COUNTRY · the name · city · since · tier · the tagline · the
  // description · BEAU'S READ · the four data cells · the piece pills · the
  // two calls to action. Nothing is invented: a house not fully on file
  // says so, cell by cell.
  const country = p?.country && p.country !== '—' ? p.country : null;
  const subLine =
    [
      p?.city && p.city !== '—' ? p.city : null,
      p?.founded ? `Since ${p.founded}` : null,
      p ? PRICE_BAND_SYMBOL[p.priceBand] : null,
    ]
      .filter(Boolean)
      .join(' · ') || 'Not fully on file yet';
  const signature = (p?.signaturePieces || [])[0] || null;
  const tagline = p?.referenceFor
    ? `The reference for ${p.referenceFor.toLowerCase()}.`
    : signature
      ? `Known for the ${signature.toLowerCase()}.`
      : p?.construction && p.construction !== '—'
        ? `${p.construction} — honest make, properly done.`
        : 'Not fully on file yet — Beau adds the dossier as he learns the house.';
  const readTag = !p
    ? 'Special case'
    : p.referenceFor
      ? 'Benchmark'
      : p.priceBand === 'accessible' || p.priceBand === 'mid'
        ? 'Sleeper'
        : 'Special case';
  const runsItCuts = (() => {
    const cats: string[] = [];
    for (const t of types) {
      const label = categoryName(t.category);
      if (label && !cats.includes(label)) cats.push(label);
    }
    return cats.slice(0, 2).join(' · ') || '—';
  })();
  const priceNew = (() => {
    if (!p) return '—';
    const label = (p.priceRangeLabel || '').trim();
    const bracket = label.match(/\(([^)]+)\)/);
    const range = bracket ? bracket[1] : label && label !== '—' ? label : PRICE_BAND_LABELS[p.priceBand];
    return `${range} · ${PRICE_BAND_SYMBOL[p.priceBand]}`;
  })();
  const ownedCount = pieces.filter((x) => (x.brand || '').trim().toLowerCase() === name.trim().toLowerCase()).length;
  const yourLedger = ownedCount > 0 ? `${ownedCount} piece${ownedCount === 1 ? '' : 's'} of theirs` : '—';
  const stocked = site ? 'Online' : p?.city && p.city !== '—' ? 'Travel to buy' : '—';
  const sendToHunt = () => {
    close();
    openInAskBeau(`Hunt ${name} for me — which of their pieces is right for my wardrobe, and at what price?`);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${name} — the maker's file`}
      className="fixed inset-0 z-[70] flex justify-end"
      style={{ background: 'rgba(36,26,18,0.45)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className="h-full w-full overflow-y-auto"
        style={{
          maxWidth: 'min(480px, 94vw)',
          background: PAPER,
          borderLeft: `1px solid ${WALNUT}`,
          boxShadow: '-18px 0 48px rgba(36,26,18,0.3)',
        }}
      >
        {/* The top bar — MAKER · COUNTRY, the × at the right. */}
        <div
          className="flex items-center justify-between sticky top-0"
          style={{ padding: '14px 22px', borderBottom: `1px solid ${HAIRLINE}`, background: PAPER, zIndex: 2 }}
        >
          <span style={mono(8.5, MUTED)}>Maker{country ? ` · ${country}` : ''}</span>
          <button
            type="button"
            onClick={close}
            aria-label="Close the maker's file"
            className="hover:opacity-70 transition-opacity"
            style={{ ...serif(22, SECONDARY), lineHeight: 1, background: 'transparent', border: 'none', padding: '0 2px' }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: '20px 22px 30px' }}>
          {/* The name, and the city · since · price-tier line. */}
          <h3 style={{ ...serif(0), fontSize: 'clamp(28px, 6vw, 34px)', lineHeight: 1.08, margin: 0, color: WALNUT }}>{name}</h3>
          <div style={{ ...mono(8.5, MUTED), marginTop: '9px' }}>{subLine}</div>

          <div aria-hidden="true" style={{ marginTop: '16px', borderTop: `1px solid ${RULE}` }} />

          {/* Beau's one line on what the house is known for, then his fuller
              read of what to buy them for and what to watch. */}
          <h4 style={{ ...serif(19, WALNUT), fontStyle: 'italic', margin: '16px 0 0', lineHeight: 1.35 }}>{tagline}</h4>
          {p?.description && (
            <p style={{ ...body(13.5, INK), margin: '10px 0 0', lineHeight: 1.6, maxWidth: '58ch' }}>{p.description}</p>
          )}

          {/* BEAU'S READ — the tinted callout, tagged with how to read the
              house: BENCHMARK · SLEEPER · SPECIAL CASE. */}
          <div style={{ marginTop: '18px', background: TINT_SOFT, border: `1px solid ${HAIRLINE}`, padding: '14px 16px 15px' }}>
            <div className="flex items-baseline justify-between" style={{ gap: '12px' }}>
              <span style={mono(8.5, ACCENT_DEEP)}>Beau's read</span>
              <span style={{ ...mono(8, MUTED), border: `1px solid ${RULE}`, padding: '2px 7px', whiteSpace: 'nowrap' }}>{readTag}</span>
            </div>
            <p style={{ ...body(13, INK), margin: '9px 0 0', lineHeight: 1.6 }}>{note}</p>
          </div>

          <div aria-hidden="true" style={{ marginTop: '18px', borderTop: `1px solid ${RULE}` }} />

          {/* The data rows — label above, value below, in columns. */}
          <div className="grid grid-cols-2" style={{ gap: '0 18px' }}>
            <DataCell label="Runs it cuts">{runsItCuts}</DataCell>
            <DataCell label="Price, new">{priceNew}</DataCell>
            <DataCell label="Your ledger">{yourLedger}</DataCell>
            <DataCell label="Stocked">{stocked}</DataCell>
          </div>

          <div aria-hidden="true" style={{ marginTop: '18px', borderTop: `1px solid ${RULE}` }} />

          {/* The piece types they cut — each pill crosses to its own page
              in The Index. */}
          <div style={{ ...mono(8.5, ACCENT_DEEP), marginTop: '18px' }}>
            Pieces they cut — {types.length} piece{types.length === 1 ? '' : 's'}
          </div>
          {types.length > 0 ? (
            <div className="flex flex-wrap" style={{ gap: '8px', marginTop: '12px' }}>
              {types.slice(0, 12).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    close();
                    openInTheIndex({ typeId: t.id });
                  }}
                  title={`${t.name} — its page in The Index`}
                  className="transition-colors hover:border-[#a8712c]"
                  style={{
                    ...serif(14.5, WALNUT),
                    background: 'transparent',
                    border: `1px solid ${RULE}`,
                    borderRadius: '999px',
                    padding: '7px 14px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t.name} →
                </button>
              ))}
            </div>
          ) : (
            <p style={{ ...body(12.5, FAINT), margin: '10px 0 0' }}>
              No verified type mapping yet — Beau adds it as the directory learns the house.
            </p>
          )}

          {/* The two ways on — hand the house to The Hunt, or step back. */}
          <div className="flex flex-wrap" style={{ gap: '8px', marginTop: '24px' }}>
            <button
              type="button"
              onClick={sendToHunt}
              title="Hand this maker to The Hunt — Ask Beau opens with the brief filled in"
              className="hover:opacity-90 transition-opacity"
              style={{ ...mono(9, '#f6f0e5'), background: WALNUT, border: `1px solid ${WALNUT}`, padding: '12px 18px', whiteSpace: 'nowrap' }}
            >
              Send to the Hunt
            </button>
            <button
              type="button"
              onClick={close}
              className="transition-colors hover:border-[#a8712c]"
              style={{ ...mono(9, SECONDARY), background: 'transparent', border: `1px solid ${RULE}`, padding: '12px 18px', whiteSpace: 'nowrap' }}
            >
              Back to the list
            </button>
          </div>

          {site && (
            <a
              href={site}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block hover:opacity-70 transition-opacity"
              style={{ ...mono(8.5, ACCENT_DEEP), marginTop: '16px' }}
            >
              The maker's own site →
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
