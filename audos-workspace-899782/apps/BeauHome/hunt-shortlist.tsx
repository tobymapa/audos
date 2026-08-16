/**
 * THE HUNT · BEAU'S PICKS — the sub-category shortlist rows and the TEN-PICK
 * page behind each one (August 2026 redesign, to the founder's screens).
 *
 *  · HuntSubRows — the three sub-category rows an unfolded category shows:
 *    name + season tag, status word, Beau's one-line reason, YOU OWN [n] and
 *    the 10 PICKS → control.
 *  · HuntTenPicksPage — the full page one of those controls opens: the
 *    breadcrumb, the header with Beau's summary and longer explanation, the
 *    BEAU IS PICKING AGAINST sidebar (every value read from the dossier —
 *    never authored), and the numbered list of ten researched picks with
 *    PUT BY · WANT IT · PASS · WATCH · REMOVE against each, and WATCH BRAND as
 *    a text link under them. Removing a pick promotes the next one up from
 *    Beau's bench, and the bench refills itself quietly when it runs low.
 *    WATCH is the standing instruction rather than a call: the piece goes onto
 *    the Watchlist face and Beau re-reads its page on every open. WATCH BRAND
 *    is the same instruction widened to the maker — its new arrivals rather
 *    than this one page.
 *
 * Design register is The Index's (index-style.ts): oatmeal ground, paper,
 * hairline rules, Cormorant headings, Lora body, IBM Plex Mono small-caps
 * labels, square corners, no shadows. Nothing here sets a colour of its own
 * beyond the shared tokens.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { Info } from 'lucide-react';
import {
  ACCENT,
  ACCENT_DEEP,
  FAINT,
  FAINTER,
  HAIRLINE,
  INK,
  MUTED,
  PAPER,
  RULE,
  SECONDARY,
  TINT,
  WALNUT,
  body,
  mono,
  serif,
} from './index-style';
import { HuntPhoto, HuntQuietLine, type HuntCallsState } from './hunt-cards';
import { WatchBrandLink, WatchButton } from './watchlist-watch';
import { huntCardKey, type HuntCategory, type HuntTag, type HuntTaggable } from './hunt-model';
import { hostLabel, type HuntReader } from './hunt-reader';
import { openInTheIndex } from './edit-links';
import { HairlineRowsSkeleton } from './skeleton';
import { label as profileLabel } from './profile-data';
import { hairColourLabel } from './dossier-details';
import { REGISTER_FREQUENCY_LABELS, type RegisterFrequency } from './coverage-prefs';
import { FIELD_REGISTER_LABELS, matchGarmentTypeId } from './index-model';
import { openMakerSheet } from './maker-sheet';
import { CrumbHeader, goToEthaionTab } from './crumb-trail';
import {
  budgetLine,
  drawBenchRefill,
  drawTenPicks,
  getCategoryBudget,
  holdTenPicksSheet,
  peekLatestTenPicks,
  type HuntPickQuality,
  type HuntSubPick,
  type HuntSubStatus,
  type HuntTenPick,
  type HuntTenPicksSheet,
} from './hunt-shortlist-ai';
import type { CategoryBudget } from './profile-data';

const MIDDOT = '\u00b7';
const OXBLOOD = '#8c3a2b';

/** The ink each status word carries. */
const STATUS_TONE: Record<HuntSubStatus, string> = {
  COVERED: SECONDARY,
  THIN: ACCENT_DEEP,
  CLOSED: FAINT,
  GAP: OXBLOOD,
  'WHY HERE': ACCENT_DEEP,
  'WHY NOW': ACCENT_DEEP,
};

const QUALITY_TONE: Record<HuntPickQuality, string> = {
  SOUND: SECONDARY,
  'BUY FIRST': ACCENT_DEEP,
  'NOT FOR YOU': OXBLOOD,
  'SPECIAL CASE': MUTED,
};

// ---------------------------------------------------------------------------
// THE SUB-CATEGORY ROWS — what an unfolded category shows.
// ---------------------------------------------------------------------------

export function HuntSubRows({
  subs,
  onTenPicks,
}: {
  subs: HuntSubPick[];
  onTenPicks: (sub: HuntSubPick) => void;
}) {
  return (
    <div>
      {subs.map((sub) => {
        const infoTypeId = matchGarmentTypeId({ name: sub.subName });
        return (
        <div
          key={sub.subName}
          className="flex items-start justify-between gap-x-5 gap-y-2 flex-wrap md:flex-nowrap"
          style={{ padding: '14px 0', borderBottom: '1px solid rgba(59,43,29,0.12)' }}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline flex-wrap" style={{ gap: '11px' }}>
              <span style={{ ...serif(20, WALNUT), lineHeight: 1.15 }}>{sub.subName}</span>
              <span style={mono(8.5, MUTED)}>{sub.seasonTag}</span>
              <span style={mono(8.5, STATUS_TONE[sub.status] || ACCENT_DEEP)}>{sub.status}</span>
            </div>
            {sub.reason && (
              <p style={{ ...body(13, SECONDARY), margin: '5px 0 0', lineHeight: 1.5, maxWidth: '62ch' }}>{sub.reason}</p>
            )}
          </div>
          <div className="flex items-center flex-shrink-0" style={{ gap: '16px', paddingTop: '5px' }}>
            <span style={mono(8.5, FAINT)}>You own {sub.youOwn}</span>
            {infoTypeId && (
              <button
                type="button"
                onClick={() => openInTheIndex({ typeId: infoTypeId })}
                aria-label={`About ${sub.subName} — its page in the Index`}
                title="About this piece — its page in the Index"
                className="transition-colors hover:border-[#a8712c] flex items-center justify-center"
                style={{ width: '31px', height: '31px', border: `1px solid ${RULE}`, background: 'transparent', color: SECONDARY, borderRadius: 0 }}
              >
                <Info className="w-3.5 h-3.5" strokeWidth={1.6} aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              onClick={() => onTenPicks(sub)}
              className="transition-colors hover:border-[#a8712c]"
              style={{
                ...mono(9, ACCENT_DEEP),
                border: `1px solid ${RULE}`,
                background: 'transparent',
                padding: '9px 14px',
                whiteSpace: 'nowrap',
              }}
            >
              10 picks →
            </button>
          </div>
        </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BEAU IS PICKING AGAINST — the sidebar, read entirely from the dossier.
// ---------------------------------------------------------------------------

/** The coverage-map's register ids, keyed as FIELD_REGISTER_LABELS holds
 * them — the same mapping hunt-reader.ts uses for the brief. */
const REGISTER_ID_TO_KEY: Record<string, string> = {
  casual: 'Casual',
  'smart-casual': 'Smart-Casual',
  formal: 'Formal',
  business: 'Business',
  'black-tie': 'Black-Tie',
  'outdoor-work': 'Outdoor-Work',
};

const BAND_LABELS = ['below 0\u00b0', '0\u20135\u00b0', '5\u201310\u00b0', '10\u201315\u00b0', '15\u201320\u00b0', '20\u201325\u00b0', '25\u201330\u00b0', 'above 30\u00b0'];

function sidebarRows(reader: HuntReader, budget: CategoryBudget | null): Array<{ label: string; value: string }> {
  const { profile, details, measurements, avatar, prefs } = reader;

  const freqLines = Object.entries(reader.registerFrequencies)
    .filter(([, freq]) => freq && freq !== 'never')
    .map(([reg, freq]) => {
      const regLabel = FIELD_REGISTER_LABELS[REGISTER_ID_TO_KEY[reg] || reg] || reg;
      const freqLabel = REGISTER_FREQUENCY_LABELS[freq as RegisterFrequency] || freq;
      return `${regLabel} ${String(freqLabel).toLowerCase()}`;
    })
    .slice(0, 3);
  const archetypes = (profile?.archetypes || []).filter(Boolean).map((a) => profileLabel.archetype(a)).slice(0, 3);
  const register =
    freqLines.length > 0
      ? freqLines.join(` ${MIDDOT} `)
      : archetypes.length > 0
        ? archetypes.join(` ${MIDDOT} `)
        : 'Nothing set yet \u2014 Beau keeps it classic';

  const money = budgetLine(budget) || 'No budget set for this category yet';

  const bodyParts: string[] = [];
  if (avatar.heightCm) bodyParts.push(`${avatar.heightCm} cm`);
  else if (profile?.height_range) bodyParts.push(profileLabel.height(profile.height_range));
  if (avatar.weightKg) bodyParts.push(`${avatar.weightKg} kg`);
  const build = avatar.bodyType || profileLabel.build(profile?.build);
  if (build) bodyParts.push(`${String(build).toLowerCase()} build`);
  if (measurements?.chest_cm) bodyParts.push(`chest ${measurements.chest_cm}`);
  if (measurements?.waist_cm) bodyParts.push(`waist ${measurements.waist_cm}`);
  if (measurements?.inseam_cm) bodyParts.push(`inseam ${measurements.inseam_cm}`);
  if (measurements?.clothing_size) bodyParts.push(`size ${measurements.clothing_size}`);
  const bodyValue = bodyParts.length > 0 ? bodyParts.join(` ${MIDDOT} `) : 'No measurements on file yet';

  const colourParts: string[] = [];
  if (profile?.skin_tone) colourParts.push(profileLabel.skinTone(profile.skin_tone));
  if (details?.hairColour) colourParts.push(`${hairColourLabel(details.hairColour).toLowerCase()} hair`);
  if (details?.paletteNotes) colourParts.push(`\u201c${details.paletteNotes}\u201d`);
  const colour = colourParts.length > 0 ? colourParts.join(` ${MIDDOT} `) : 'No colouring on file yet';

  const climateParts: string[] = [];
  const city = details?.city || null;
  if (city) climateParts.push(city);
  if (details?.climateBands) {
    const ranked = details.climateBands
      .map((days, i) => ({ days: Math.round(days), label: BAND_LABELS[i] }))
      .filter((b) => b.days > 0)
      .sort((a, b) => b.days - a.days)
      .slice(0, 3);
    for (const band of ranked) climateParts.push(`${band.days} days ${band.label}`);
  }
  const climate = climateParts.length > 0 ? climateParts.join(` ${MIDDOT} `) : 'No climate set yet';

  const rows = [
    { label: 'Register', value: register },
    { label: 'Money', value: money },
    { label: 'Body', value: bodyValue },
    { label: 'Colour', value: colour },
    { label: 'Climate', value: climate },
  ];
  if (prefs?.secondhand === 'no') rows.push({ label: 'Market', value: 'New pieces only' });
  return rows;
}

function PickingAgainst({ reader, budget }: { reader: HuntReader; budget: CategoryBudget | null }) {
  const rows = sidebarRows(reader, budget);
  return (
    <aside
      aria-label="Beau is picking against"
      style={{ border: `1px solid ${RULE}`, background: PAPER, padding: '16px 18px 14px', alignSelf: 'start' }}
    >
      <div style={{ ...mono(9, WALNUT), paddingBottom: '10px', borderBottom: `1px solid ${RULE}` }}>
        Beau is picking against
      </div>
      {rows.map((row) => (
        <div key={row.label} style={{ padding: '10px 0', borderBottom: '1px solid rgba(59,43,29,0.12)' }}>
          <span className="block" style={mono(8, FAINT)}>{row.label}</span>
          <span className="block" style={{ ...body(12.5, INK), marginTop: '4px', lineHeight: 1.5 }}>{row.value}</span>
        </div>
      ))}
      <div style={{ ...mono(8, ACCENT_DEEP), paddingTop: '12px', lineHeight: 1.6 }}>
        Remove any pick and Beau fills the tenth slot
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// The call buttons — PUT BY · WANT IT · PASS on one line, REMOVE beneath.
// ---------------------------------------------------------------------------

function CallButton({
  children,
  active,
  busy,
  onClick,
  title,
}: {
  children: React.ReactNode;
  active?: boolean;
  busy?: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title={title}
      aria-pressed={active}
      className="transition-colors hover:border-[#a8712c]"
      style={{
        ...mono(8, active ? ACCENT_DEEP : SECONDARY),
        border: `1px solid ${active ? ACCENT_DEEP : 'rgba(59,43,29,0.3)'}`,
        background: active ? TINT : 'transparent',
        padding: '7px 10px',
        whiteSpace: 'nowrap',
        cursor: busy ? 'default' : 'pointer',
        opacity: busy ? 0.55 : 1,
      }}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// One pick row
// ---------------------------------------------------------------------------

const ROW_GRID =
  'grid grid-cols-[30px_78px_minmax(0,1fr)] md:grid-cols-[34px_84px_minmax(0,1.1fr)_120px_minmax(0,1.3fr)_196px] gap-x-4 gap-y-3';

function PickRow({
  index,
  pick,
  categoryId,
  subName,
  calls,
  onRemove,
}: {
  index: number;
  pick: HuntTenPick;
  categoryId: string;
  subName: string;
  calls: HuntCallsState;
  onRemove: () => void;
}) {
  const photo = useRef<string | null>(null);
  const taggable = useMemo<HuntTaggable>(
    () => ({
      pieceName: pick.pieceName,
      categoryId,
      subCategory: subName,
      source: 'picks',
      maker: pick.maker || null,
      priceGuide: pick.price || null,
      note: pick.why || null,
      productUrl: pick.retailerUrl || null,
    }),
    [pick, categoryId, subName],
  );
  const tag = calls.tagOf(taggable);
  const busy = calls.writingKey === huntCardKey(taggable);
  const setTag = (next: HuntTag) => {
    void calls.toggleTag({ ...taggable, imageUrl: photo.current }, next);
  };

  return (
    <div className={`${ROW_GRID} items-start`} style={{ padding: '16px 0', borderBottom: '1px solid rgba(59,43,29,0.12)' }}>
      <span style={{ ...mono(11, ACCENT), letterSpacing: 0, paddingTop: '2px' }}>{String(index + 1).padStart(2, '0')}</span>

      <div style={{ width: '100%' }}>
        <HuntPhoto
          pieceName={pick.pieceName}
          maker={pick.maker}
          productUrl={pick.retailerUrl}
          aspectRatio="1 / 1"
          onResolved={(url) => {
            photo.current = url;
          }}
        />
      </div>

      <div className="min-w-0">
        <div style={{ ...serif(18, WALNUT), lineHeight: 1.2 }}>{pick.pieceName}</div>
        {pick.maker && (
          <div style={{ marginTop: '4px' }}>
            <button
              type="button"
              onClick={() => openMakerSheet(pick.maker)}
              title={`${pick.maker} — the maker's file`}
              className="hover:underline"
              style={{ ...mono(8.5, MUTED), background: 'transparent', border: 'none', padding: 0 }}
            >
              {pick.maker}
            </button>
          </div>
        )}
        <div className="flex items-baseline flex-wrap" style={{ gap: '12px', marginTop: '6px' }}>
          {pick.retailerUrl && (
            <a
              href={pick.retailerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
              style={{ ...mono(8, ACCENT_DEEP), textDecoration: 'none' }}
            >
              {hostLabel(pick.retailerUrl) || 'the listing'} →
            </a>
          )}
          {pick.garmentTypeId && (
            <button
              type="button"
              onClick={() => openInTheIndex({ typeId: pick.garmentTypeId! })}
              title="About this piece — its full page in the Index"
              className="hover:underline inline-flex items-center gap-1"
              style={{ ...mono(8, SECONDARY), background: 'transparent', border: 'none', padding: 0 }}
            >
              <Info className="w-3 h-3" strokeWidth={1.6} aria-hidden="true" /> The piece's page →
            </button>
          )}
        </div>
        {pick.tags.length > 0 && (
          <div className="flex flex-wrap" style={{ gap: '4px', marginTop: '8px' }}>
            {pick.tags.map((t) => (
              <span key={t} style={{ ...mono(7.5, SECONDARY), border: '1px solid rgba(59,43,29,0.22)', padding: '2px 7px' }}>
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="col-span-3 md:col-span-1">
        <div style={{ ...body(15, WALNUT) }}>{pick.price || 'Price not stated'}</div>
        <div style={{ ...mono(7.5, ACCENT_DEEP), marginTop: '4px' }}>{pick.priceTier}</div>
      </div>

      <div className="col-span-3 md:col-span-1 min-w-0">
        <div style={mono(8, QUALITY_TONE[pick.quality] || SECONDARY)}>{pick.quality}</div>
        <p style={{ ...body(12.5, INK), margin: '5px 0 0', lineHeight: 1.55 }}>{pick.why}</p>
      </div>

      <div className="col-span-3 md:col-span-1 flex flex-col md:items-end" style={{ gap: '6px' }}>
        <div className="flex" style={{ gap: '5px' }}>
          <CallButton
            active={tag === 'saved'}
            busy={busy}
            title={tag === 'saved' ? 'Remove the save' : 'Put it by \u2014 filed on Your Calls'}
            onClick={() => setTag('saved')}
          >
            Put by
          </CallButton>
          <CallButton
            active={tag === 'favourite'}
            busy={busy}
            title={tag === 'favourite' ? 'Remove the favourite' : 'Want it \u2014 filed as a favourite'}
            onClick={() => setTag('favourite')}
          >
            Want it
          </CallButton>
          <CallButton
            active={tag === 'passed'}
            busy={busy}
            title={tag === 'passed' ? 'Undo the pass' : 'A recorded no \u2014 Beau stops offering it in this form'}
            onClick={() => setTag('passed')}
          >
            Pass
          </CallButton>
        </div>
        <div className="flex" style={{ gap: '5px' }}>
          {/* Read at the tap: the photograph resolves after the first paint
              and is held on a ref, so the row can carry it onto the row the
              Watchlist files. */}
          <WatchButton
            size="row"
            target={() => ({
              pieceName: pick.pieceName,
              brand: pick.maker || null,
              retailerUrl: pick.retailerUrl || null,
              imageUrl: photo.current,
              price: pick.price || null,
              verdict: pick.why || null,
              source: 'beaus_picks',
            })}
          />
          <CallButton title={'Take it off the page \u2014 the next comes up from Beau\u2019s bench'} onClick={onRemove}>
            Remove
          </CallButton>
        </div>
        {/* The maker itself, one step wider than the piece — quiet on purpose. */}
        <WatchBrandLink
          target={() => ({
            pieceName: pick.pieceName,
            brand: pick.maker || null,
            retailerUrl: pick.retailerUrl || null,
            imageUrl: photo.current,
            price: pick.price || null,
            verdict: pick.why || null,
            source: 'beaus_picks',
          })}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// THE TEN-PICK PAGE
// ---------------------------------------------------------------------------

export function HuntTenPicksPage({
  reader,
  calls,
  category,
  sub,
  onBack,
}: {
  reader: HuntReader;
  calls: HuntCallsState;
  category: HuntCategory;
  sub: HuntSubPick;
  onBack: () => void;
}) {
  const [sheet, setSheet] = useState<HuntTenPicksSheet | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [budget, setBudget] = useState<CategoryBudget | null>(null);
  const removed = useRef<string[]>([]);
  const refilling = useRef(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    rootRef.current?.scrollIntoView({ block: 'start' });
  }, []);

  useEffect(() => {
    let alive = true;
    getCategoryBudget(category.id)
      .then((b) => {
        if (alive) setBudget(b);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [category.id]);

  useEffect(() => {
    let alive = true;
    // STALE-WHILE-REVALIDATE (performance pass, August 2026): the last sheet
    // this sub-category ever produced paints the page instantly; the current
    // record's own draw replaces it the moment it lands. The engine's
    // fingerprint cache still answers immediately when the record has not
    // moved — this only covers the genuine re-draws.
    const stale = peekLatestTenPicks(category.id, sub.subName);
    if (stale) setSheet(stale);
    setLoading(true);
    setFailed(false);
    drawTenPicks(reader, category.id, sub)
      .then((next) => {
        if (!alive) return;
        setLoading(false);
        if (next && next.picks.length > 0) {
          setSheet(next);
          setFailed(false);
        } else {
          // The draw did not land — keep the last-known sheet on the page
          // rather than blanking it; only a page with nothing reads empty.
          setFailed(!stale);
        }
      })
      .catch(() => {
        if (!alive) return;
        setLoading(false);
        setFailed(!stale);
      });
    return () => {
      alive = false;
    };
    // The sub-category's identity stands in for the draw's inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category.id, sub.subName]);

  /** Take one pick off the page; the bench's first comes up in its place,
   * and the bench refills itself quietly when it runs low. */
  const remove = useCallback(
    (pick: HuntTenPick) => {
      setSheet((cur) => {
        if (!cur) return cur;
        removed.current = [...removed.current, pick.pieceName];
        const bench = [...cur.bench];
        const promoted = bench.shift() || null;
        const picks = cur.picks.flatMap((p) =>
          p.pieceName === pick.pieceName ? (promoted ? [promoted] : []) : [p],
        );
        const next: HuntTenPicksSheet = { ...cur, picks, bench };
        holdTenPicksSheet(reader, category.id, sub, next);
        if (bench.length <= 1 && !refilling.current) {
          refilling.current = true;
          const exclude = [
            ...picks.map((p) => p.pieceName),
            ...bench.map((p) => p.pieceName),
            ...removed.current,
          ];
          void drawBenchRefill({ reader, categoryId: category.id, sub, exclude })
            .then((extra) => {
              refilling.current = false;
              if (extra.length === 0) return;
              setSheet((now) => {
                if (!now) return now;
                const names = new Set(
                  [...now.picks, ...now.bench].map((p) => p.pieceName.toLowerCase()),
                );
                const fresh = extra.filter((p) => !names.has(p.pieceName.toLowerCase()));
                if (fresh.length === 0) return now;
                const topped: HuntTenPicksSheet = { ...now, bench: [...now.bench, ...fresh] };
                holdTenPicksSheet(reader, category.id, sub, topped);
                return topped;
              });
            })
            .catch(() => {
              refilling.current = false;
            });
        }
        return next;
      });
    },
    [category.id, reader, sub],
  );

  return (
    <div ref={rootRef} style={{ scrollMarginTop: '80px' }}>
      {/* Where you are, and the way back — published to the app's ONE
          floating chrome row rather than drawn again here. The rule that
          used to sit under a local back button went with it. */}
      <CrumbHeader
        backLabel="Beau's Picks"
        onBack={onBack}
        segs={[
          { label: 'Ethaion', onClick: () => goToEthaionTab('wardrobe') },
          { label: 'The Search', onClick: onBack },
          { label: "Beau's Picks", onClick: onBack },
          { label: category.name, onClick: onBack },
          { label: sub.subName },
        ]}
      />

      {/* The header — the sub-category and what Beau is picking against. */}
      <div className="md:grid md:grid-cols-[minmax(0,1fr)_300px] md:gap-9">
        <div className="min-w-0">
          <div className="flex items-baseline flex-wrap" style={{ gap: '13px' }}>
            <h3 style={{ ...serif(31, WALNUT), margin: 0, lineHeight: 1.08 }}>{sub.subName}</h3>
            <span style={mono(9, MUTED)}>{sub.seasonTag}</span>
            <span style={mono(9, STATUS_TONE[sub.status] || ACCENT_DEEP)}>{sub.status}</span>
          </div>
          <p style={{ ...body(14.5, INK), margin: '13px 0 0', maxWidth: '62ch', lineHeight: 1.6 }}>
            {sheet?.summary || sub.reason}
          </p>
          {sheet?.explanation && (
            <p style={{ ...body(13, SECONDARY), margin: '10px 0 0', maxWidth: '62ch', lineHeight: 1.6 }}>
              {sheet.explanation}
            </p>
          )}
        </div>
        <div className="mt-6 md:mt-0">
          <PickingAgainst reader={reader} budget={budget} />
        </div>
      </div>

      {/* The ten picks. */}
      <div style={{ marginTop: '28px' }}>
        <div
          className={`${ROW_GRID} items-baseline hidden md:grid`}
          style={{ padding: '8px 0', borderBottom: '1px solid rgba(59,43,29,0.24)' }}
        >
          <span />
          <span className="md:col-span-2" style={mono(8.5, FAINT)}>The pick</span>
          <span style={mono(8.5, FAINT)}>Price</span>
          <span style={mono(8.5, FAINT)}>Why this one</span>
          <span className="md:justify-self-end" style={mono(8.5, FAINT)}>Your call</span>
        </div>

        {loading && !sheet ? (
          <div role="status" aria-label="Beau is picking" style={{ paddingTop: '6px' }}>
            <HairlineRowsSkeleton rows={6} />
          </div>
        ) : failed || !sheet ? (
          <HuntQuietLine>Nothing on this shelf just now — step back and open it again.</HuntQuietLine>
        ) : (
          <>
            {loading && (
              <p aria-live="polite" style={{ ...mono(8, FAINT), margin: '8px 0 0' }}>
                Beau is bringing these up to date…
              </p>
            )}
            {sheet.picks.map((pick, i) => (
              <PickRow
                key={pick.pieceName}
                index={i}
                pick={pick}
                categoryId={category.id}
                subName={sub.subName}
                calls={calls}
                onRemove={() => remove(pick)}
              />
            ))}
            <div
              className="flex items-baseline justify-between gap-x-5 gap-y-2 flex-wrap"
              style={{ paddingTop: '14px' }}
            >
              <span style={{ ...mono(8.5, FAINT), lineHeight: 1.7 }}>
                {'Ten picks, held at ten \u2014 remove one and the next comes up from Beau\u2019s bench'}
              </span>
              <span style={mono(8.5, ACCENT_DEEP)}>
                {sheet.bench.length} more on the bench
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
