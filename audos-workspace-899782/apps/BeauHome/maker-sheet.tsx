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
 * · The sheet always carries a visible ← CLOSE control, closes on Escape
 *   and on a backdrop tap — no dead-end overlay (founder's rule).
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
import { FIELD_REGISTER_LABELS } from './index-model';
import { openInTheIndex } from './edit-links';
import { CLAUDE_HAIKU, callModel } from './claude';
import type { StyleProfile, WardrobePiece } from './profile-data';
import {
  ACCENT_DEEP,
  FAINT,
  FAINTER,
  HAIRLINE,
  INK,
  MUTED,
  PAPER,
  RULE,
  SECONDARY,
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

function FactRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid rgba(59,43,29,0.12)' }}>
      <span className="block" style={mono(8, FAINT)}>
        {label}
      </span>
      <span className="block" style={{ ...body(13, INK), marginTop: '4px', lineHeight: 1.55 }}>
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
  const where = p ? [p.city, p.country].filter((v) => v && v !== '—').join(', ') : '';
  const close = () => setName(null);

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
        {/* The head — the way out first, then the name. */}
        <div
          className="flex items-center justify-between sticky top-0"
          style={{ padding: '14px 22px', borderBottom: `1px solid ${HAIRLINE}`, background: PAPER, zIndex: 2 }}
        >
          <span style={mono(8.5, FAINT)}>The maker's file</span>
          <button
            type="button"
            onClick={close}
            className="transition-colors hover:border-[#a8712c]"
            style={{ ...mono(9, SECONDARY), border: `1px solid ${RULE}`, background: 'transparent', padding: '6px 13px', borderRadius: 0 }}
          >
            ← Close
          </button>
        </div>

        <div style={{ padding: '20px 22px 30px' }}>
          <h3 style={{ ...serif(0), fontSize: 'clamp(26px, 6vw, 32px)', lineHeight: 1.1, margin: 0, color: WALNUT }}>{name}</h3>
          <div style={{ ...mono(8.5, MUTED), marginTop: '8px' }}>
            {[where || null, p?.founded ? `Since ${p.founded}` : null].filter(Boolean).join(' · ') || 'Not fully on file yet'}
          </div>

          {p?.description && <p style={{ ...body(14, INK), margin: '14px 0 0', maxWidth: '58ch' }}>{p.description}</p>}

          <div style={{ marginTop: '16px', borderTop: `1px solid ${RULE}` }}>
            <FactRow label="Known for">
              {p
                ? [p.referenceFor, ...(p.signaturePieces || [])].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).slice(0, 4).join(' · ') || '—'
                : '—'}
            </FactRow>
            <FactRow label="Cut & construction">
              {p && p.construction && p.construction !== '—' ? `${p.construction} · ${p.constructionQuality}` : '—'}
            </FactRow>
            <FactRow label="Materials">{(p?.materials || []).join(' · ') || '—'}</FactRow>
            <FactRow label="Registers">
              {(p?.registers || []).map((r) => FIELD_REGISTER_LABELS[r] || r).join(' · ') || '—'}
            </FactRow>
            <FactRow label="Price">
              {p
                ? `${PRICE_BAND_SYMBOL[p.priceBand]} ${PRICE_BAND_LABELS[p.priceBand]}${p.priceRangeLabel && p.priceRangeLabel !== '—' && p.priceRangeLabel !== PRICE_BAND_LABELS[p.priceBand] ? ` · ${p.priceRangeLabel}` : ''}`
                : '—'}
            </FactRow>
            <FactRow label="Sizing">{p?.sizingNote || '—'}</FactRow>
          </div>

          {/* The piece types they cut — each name crosses to its own page. */}
          <div style={{ marginTop: '18px' }}>
            <div style={{ ...mono(8.5, ACCENT_DEEP), paddingBottom: '8px', borderBottom: `1px solid ${RULE}` }}>
              What they cut · {types.length > 0 ? `${types.length} type${types.length === 1 ? '' : 's'} on file` : 'not yet mapped'}
            </div>
            {types.length > 0 ? (
              <div className="flex flex-col">
                {types.slice(0, 10).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      close();
                      openInTheIndex({ typeId: t.id });
                    }}
                    className="text-left hover:underline"
                    style={{
                      ...serif(15.5, WALNUT),
                      background: 'transparent',
                      padding: '9px 0',
                      borderBottom: '1px solid rgba(59,43,29,0.1)',
                      border: 'none',
                      borderRadius: 0,
                    }}
                  >
                    {t.name} <span style={mono(7.5, FAINTER)}>its page →</span>
                  </button>
                ))}
              </div>
            ) : (
              <p style={{ ...body(12.5, FAINT), margin: '10px 0 0' }}>
                No verified type mapping yet — Beau adds it as the directory learns the house.
              </p>
            )}
          </div>

          {/* Beau's read — for this reader, never a stock line. */}
          <div style={{ marginTop: '20px', background: WALNUT, padding: '18px 20px 20px' }}>
            <div style={{ ...mono(8.5, '#e3c184') }}>Beau · for you</div>
            <p style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', lineHeight: 1.6, color: '#fbf1de', margin: '9px 0 0' }}>
              {note}
            </p>
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
