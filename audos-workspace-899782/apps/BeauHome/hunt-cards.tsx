/**
 * THE HUNT · THE CARD — the one product card both Beau's Picks and Ask Beau
 * render, and the one action row they share.
 *
 * THE ORDER IS THE DESIGN (the founder's screens): the photograph first, then
 * the piece in Cormorant, the maker beneath it in mono small-caps, the
 * retailer link, then the price line with the call it carries on the right,
 * a hairline, Beau's reason in Lora, and the actions last. Paper ground,
 * hairline rules, square corners, no shadow anywhere. Nothing here invents a
 * colour — every value comes from the shared tokens (index-style.tsx), so
 * the tab inherits a brand change with the rest of the app.
 *
 * THE PHOTOGRAPH is the product's own: the page's og:image when the card came
 * from a real link, otherwise the shared resolver's best pack shot for that
 * maker and piece (product-images.ts — the same sourcing The Rail and The
 * Fitting use, so a piece looks the same wherever it appears). Nothing
 * resolves for a piece no shop photographs; the frame then holds its space
 * quietly rather than showing a broken image.
 *
 * THE ACTIONS, in one place so the two sub-tabs can never drift:
 *   · SAVE — files the piece on Your Calls as saved.
 *   · FAVOURITE — the same, tagged higher.
 *   · PASS — a no, recorded: the card leaves the shelf and Beau reasons
 *     around it next time he draws.
 *   · REPLACE — Beau's Picks only: clears this card away and draws a
 *     different answer for the same category, leaving its siblings alone.
 * Tapping the tag a card already carries removes it — a call is never a
 * one-way door.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { Bookmark, Heart, Loader2, RefreshCw, X } from 'lucide-react';
import {
  ACCENT_DEEP,
  FAINT,
  FAINTER,
  HAIRLINE,
  INK,
  ON_WALNUT,
  PAPER,
  RULE,
  SECONDARY,
  TINT,
  WALNUT,
  body,
  mono,
  serif,
} from './index-style';
import {
  cappedImageUrl,
  peekProductImageCandidate,
  resolveProductImageCandidates,
  type ProductImageCandidate,
} from './product-images';
import {
  HUNT_CALLS_EVENT,
  HUNT_TAG_LABELS,
  clearHuntTag,
  fetchHuntCalls,
  huntCardKey,
  loadHuntCallsMirror,
  setHuntTag,
  type HuntCall,
  type HuntTag,
  type HuntTaggable,
} from './hunt-model';

// ---------------------------------------------------------------------------
// THE TAG STATE — one hook behind every card on the tab, so a piece saved in
// Beau's Picks reads as saved in an Ask Beau result and on Your Calls the
// moment it is tagged.
// ---------------------------------------------------------------------------

export interface HuntCallsState {
  calls: HuntCall[];
  /** The tag one card carries, or null when it is untagged. */
  tagOf: (item: HuntTaggable) => HuntTag | null;
  /** Apply a tag — or REMOVE it, when the card already carries that same tag. */
  toggleTag: (item: HuntTaggable, tag: HuntTag) => Promise<void>;
  /** Drop a tag by card key — what Your Calls' remove does. */
  removeTag: (cardKey: string) => Promise<void>;
  /** The card key currently being written, so its row can show it. */
  writingKey: string | null;
  /** True until the first read of the table lands. */
  loading: boolean;
}

export function useHuntCalls(): HuntCallsState {
  // The local mirror paints the first frame; the table read reconciles.
  const [calls, setCalls] = useState<HuntCall[]>(() => loadHuntCallsMirror());
  const [loading, setLoading] = useState(true);
  const [writingKey, setWritingKey] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      fetchHuntCalls()
        .then((rows) => {
          if (!alive) return;
          setCalls(rows);
          setLoading(false);
        })
        .catch(() => {
          if (alive) setLoading(false);
        });
    };
    load();
    // Any tag written anywhere in the tab re-reads here.
    const onChanged = () => setCalls(loadHuntCallsMirror());
    window.addEventListener(HUNT_CALLS_EVENT, onChanged);
    return () => {
      alive = false;
      window.removeEventListener(HUNT_CALLS_EVENT, onChanged);
    };
  }, []);

  const byKey = useMemo(() => {
    const map = new Map<string, HuntTag>();
    for (const call of calls) map.set(call.cardKey, call.tag);
    return map;
  }, [calls]);

  const tagOf = useCallback((item: HuntTaggable) => byKey.get(huntCardKey(item)) || null, [byKey]);

  const toggleTag = useCallback(
    async (item: HuntTaggable, tag: HuntTag) => {
      const key = huntCardKey(item);
      setWritingKey(key);
      try {
        if (byKey.get(key) === tag) await clearHuntTag(key);
        else await setHuntTag(item, tag);
        setCalls(loadHuntCallsMirror());
      } finally {
        setWritingKey(null);
      }
    },
    [byKey],
  );

  const removeTag = useCallback(async (cardKey: string) => {
    setWritingKey(cardKey);
    try {
      await clearHuntTag(cardKey);
      setCalls(loadHuntCallsMirror());
    } finally {
      setWritingKey(null);
    }
  }, []);

  return { calls, tagOf, toggleTag, removeTag, writingKey, loading };
}

// ---------------------------------------------------------------------------
// THE PHOTOGRAPH
// ---------------------------------------------------------------------------

/** The hatched rectangle a piece with no photography anywhere falls back to —
 * hairline diagonals on paper, the design's own placeholder, never a stock
 * substitute and never a broken image. */
const HATCH = `repeating-linear-gradient(135deg, transparent 0 7px, ${HAIRLINE} 7px 8px)`;

/** Roughly how wide the plate paints — the file is asked for at about twice
 * it rather than at press size. */
const PLATE_WIDTH = 900;

export function HuntPhoto({
  pieceName,
  maker,
  /** A photograph already in hand (a pasted page's own og:image). */
  imageUrl,
  /** The product page, when the card has one — the plate taps through to it. */
  productUrl,
  /** The plate's shape. The card's is a wide letterbox, the bench's a square. */
  aspectRatio = '5 / 2',
  /** Report the photograph that actually painted, so a tag can carry it. */
  onResolved,
}: {
  pieceName: string;
  maker?: string | null;
  imageUrl?: string | null;
  productUrl?: string | null;
  aspectRatio?: string;
  onResolved?: (url: string) => void;
}) {
  const subject = useMemo(
    () => ({ name: pieceName, brand: maker || '', productUrl: productUrl || null }),
    [pieceName, maker, productUrl],
  );
  const subjectKey = `${maker || ''}\u241f${pieceName}\u241f${imageUrl || ''}`;
  const [candidates, setCandidates] = useState<ProductImageCandidate[]>(() => {
    if (imageUrl) return [{ url: imageUrl, page: productUrl || '' }];
    const settled = peekProductImageCandidate(subject);
    return settled ? [settled] : [];
  });
  const [idx, setIdx] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    setIdx(0);
    setLoaded(false);
    if (imageUrl) {
      setCandidates([{ url: imageUrl, page: productUrl || '' }]);
      return () => {
        alive = false;
      };
    }
    const settled = peekProductImageCandidate(subject);
    setCandidates(settled ? [settled] : []);
    void resolveProductImageCandidates(subject)
      .then((resolved) => {
        if (alive && resolved.length > 0) {
          setCandidates(resolved);
          setIdx(0);
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectKey]);

  const candidate = candidates[idx] || null;
  const src = candidate ? cappedImageUrl(candidate.url, PLATE_WIDTH) : '';
  const target = (candidate?.page || '').trim() || (productUrl || '').trim();

  const frame: React.CSSProperties = {
    aspectRatio,
    background: PAPER,
    border: `1px solid ${HAIRLINE}`,
    position: 'relative',
    overflow: 'hidden',
    display: 'block',
    width: '100%',
  };

  const inner = src ? (
    <img
      src={src}
      alt={`${maker || ''} ${pieceName}`.trim()}
      loading="lazy"
      decoding="async"
      style={{
        position: 'absolute',
        inset: '8px',
        width: 'calc(100% - 16px)',
        height: 'calc(100% - 16px)',
        objectFit: 'contain',
        opacity: loaded ? 1 : 0,
        transition: 'opacity 260ms ease',
      }}
      onLoad={() => {
        setLoaded(true);
        if (candidate) onResolved?.(candidate.url);
      }}
      onError={() => {
        setLoaded(false);
        setIdx((i) => i + 1);
      }}
    />
  ) : null;

  const hatch = (
    <span
      aria-hidden="true"
      className="absolute inset-0 flex items-center justify-center"
      style={{ background: HATCH, opacity: src && loaded ? 0 : 1, transition: 'opacity 200ms ease' }}
    >
      <span style={{ ...mono(8, FAINTER), background: PAPER, padding: '3px 7px' }}>Photo</span>
    </span>
  );

  if (!target) {
    return (
      <span style={frame}>
        {hatch}
        {inner}
      </span>
    );
  }
  return (
    <a
      href={target}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title={`${pieceName} — open the product page`}
      style={frame}
    >
      {hatch}
      {inner}
    </a>
  );
}

// ---------------------------------------------------------------------------
// The action row
// ---------------------------------------------------------------------------

function ActionButton({
  label,
  icon,
  active,
  busy,
  onClick,
  title,
}: {
  label: string;
  icon: React.ReactNode;
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
      aria-label={title}
      aria-pressed={active}
      className="transition-colors flex items-center gap-1.5 flex-shrink-0 hover:bg-[rgba(168,113,44,0.06)]"
      style={{
        ...mono(8.5, active ? ACCENT_DEEP : SECONDARY),
        background: active ? TINT : 'transparent',
        border: `1px solid ${active ? ACCENT_DEEP : HAIRLINE}`,
        padding: '8px 12px',
        minHeight: '40px',
        whiteSpace: 'nowrap',
        cursor: busy ? 'default' : 'pointer',
        opacity: busy ? 0.55 : 1,
      }}
    >
      {busy ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> : icon}
      {label}
    </button>
  );
}

export interface HuntCardActions {
  /** The tag this card currently carries, if any. */
  tag: HuntTag | null;
  /** Set (or, when the same tag is tapped again, clear) the card's tag. */
  onTag: (tag: HuntTag) => void;
  /** Present only on Beau's Picks — clear this card and draw another. */
  onReplace?: () => void;
  /** True while a tag write or a replacement draw is in flight. */
  busy?: boolean;
}

/** Save · Favourite · Pass, and Replace where the surface has it. */
export function HuntActionRow({ tag, onTag, onReplace, busy }: HuntCardActions) {
  return (
    <div className="flex items-center flex-wrap gap-1.5" style={{ marginTop: '15px' }}>
      <ActionButton
        label="Save"
        title={tag === 'saved' ? 'Remove the save' : 'Save this piece to Your Calls'}
        icon={<Bookmark className="w-3 h-3" strokeWidth={1.6} fill={tag === 'saved' ? 'currentColor' : 'none'} aria-hidden="true" />}
        active={tag === 'saved'}
        busy={busy}
        onClick={() => onTag('saved')}
      />
      <ActionButton
        label="Favourite"
        title={tag === 'favourite' ? 'Remove the favourite' : 'Mark this a favourite'}
        icon={<Heart className="w-3 h-3" strokeWidth={1.6} fill={tag === 'favourite' ? 'currentColor' : 'none'} aria-hidden="true" />}
        active={tag === 'favourite'}
        busy={busy}
        onClick={() => onTag('favourite')}
      />
      <ActionButton
        label="Pass"
        title={tag === 'passed' ? 'Undo the pass' : 'Not for you — Beau stops offering it in this form'}
        icon={<X className="w-3 h-3" strokeWidth={1.6} aria-hidden="true" />}
        active={tag === 'passed'}
        busy={busy}
        onClick={() => onTag('passed')}
      />
      {onReplace && (
        <ActionButton
          label="Replace"
          title="Delete this one and let Beau draw another in its place"
          icon={<RefreshCw className="w-3 h-3" strokeWidth={1.6} aria-hidden="true" />}
          busy={busy}
          onClick={onReplace}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The card
// ---------------------------------------------------------------------------

/** The small mono line under a card's reasoning — label left, fact right. */
function CardNote({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <p className="flex gap-2.5" style={{ marginTop: '9px' }}>
      <span style={{ ...mono(8, FAINT), flexShrink: 0, paddingTop: '3px', width: '52px' }}>{label}</span>
      <span style={{ ...body(13, SECONDARY), lineHeight: 1.5, margin: 0 }}>{children}</span>
    </p>
  );
}

export interface HuntCardProps {
  pieceName: string;
  /** The classic type it answers — the card's kicker, left. */
  garmentType?: string | null;
  maker?: string | null;
  priceGuide?: string | null;
  /** Beau's reason — the body of the card. */
  whyYou?: string | null;
  colourNote?: string | null;
  qualitySignals?: string | null;
  /** A real product or listing page, when this card came from one. */
  url?: string | null;
  retailer?: string | null;
  /** A photograph already in hand — a pasted page's own og:image. */
  imageUrl?: string | null;
  /** The photograph that painted, so the tag written from here carries it. */
  onPhoto?: (url: string) => void;
  actions: HuntCardActions;
}

/**
 * One recommended (or assessed) piece, in the founder's order: photograph,
 * name, maker, link, price and the call it carries, then the reasoning and
 * the actions.
 */
export function HuntCard({
  pieceName,
  garmentType,
  maker,
  priceGuide,
  whyYou,
  colourNote,
  qualitySignals,
  url,
  retailer,
  imageUrl,
  onPhoto,
  actions,
}: HuntCardProps) {
  return (
    <article
      style={{
        background: PAPER,
        border: `1px solid ${HAIRLINE}`,
        padding: '18px 19px 19px',
      }}
    >
      <HuntPhoto
        pieceName={pieceName}
        maker={maker}
        imageUrl={imageUrl}
        productUrl={url}
        onResolved={onPhoto}
      />

      <h4 style={{ ...serif(21, WALNUT), lineHeight: 1.22, margin: '15px 0 0' }}>{pieceName}</h4>

      <p style={{ ...mono(8.5, SECONDARY), margin: '7px 0 0' }}>{maker || garmentType || 'A piece'}</p>

      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block transition-colors hover:underline"
          style={{ ...mono(8.5, ACCENT_DEEP), margin: '7px 0 0', textDecoration: 'none' }}
        >
          {retailer || 'the listing'} →
        </a>
      )}

      {/* The price line, with the call this card carries on the right — the
          same place the design puts its standing. */}
      <div
        className="flex items-baseline justify-between gap-3"
        style={{ marginTop: '13px', paddingBottom: '11px', borderBottom: `1px solid ${HAIRLINE}` }}
      >
        <span style={{ ...body(15.5, WALNUT) }}>{priceGuide || 'Price not stated'}</span>
        {actions.tag && (
          <span
            style={{
              ...mono(8, ACCENT_DEEP),
              border: `1px solid ${ACCENT_DEEP}`,
              background: TINT,
              padding: '3px 7px',
              flexShrink: 0,
            }}
          >
            {HUNT_TAG_LABELS[actions.tag]}
          </span>
        )}
      </div>

      {whyYou && <p style={{ ...body(13.5, INK), margin: '12px 0 0', maxWidth: '52ch' }}>{whyYou}</p>}

      {(colourNote || qualitySignals) && (
        <div style={{ marginTop: '10px' }}>
          {colourNote && <CardNote label="Colour">{colourNote}</CardNote>}
          {qualitySignals && <CardNote label="Look for">{qualitySignals}</CardNote>}
        </div>
      )}

      <HuntActionRow {...actions} />
    </article>
  );
}

// ---------------------------------------------------------------------------
// Shared small furniture
// ---------------------------------------------------------------------------

/** The square-cornered mono control the whole tab uses for its own actions. */
export function HuntButton({
  children,
  onClick,
  solid = false,
  disabled = false,
  busy = false,
  title,
  type = 'button',
  full = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  solid?: boolean;
  disabled?: boolean;
  busy?: boolean;
  title?: string;
  type?: 'button' | 'submit';
  /** Fills its column — the ask box's two stacked controls. */
  full?: boolean;
}) {
  const off = disabled || busy;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={off}
      title={title}
      className={`transition-colors inline-flex items-center gap-1.5 ${full ? 'w-full justify-center' : 'flex-shrink-0'}`}
      style={{
        ...mono(9, solid ? ON_WALNUT : SECONDARY),
        background: solid ? WALNUT : 'transparent',
        border: `1px solid ${solid ? WALNUT : RULE}`,
        padding: '10px 15px',
        minHeight: '42px',
        whiteSpace: 'nowrap',
        cursor: off ? 'default' : 'pointer',
        opacity: off ? 0.55 : 1,
      }}
    >
      {busy && <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

/**
 * THE CARD, WAITING — the plate Beau's Picks paints while a draw is in
 * flight. The same paper card at the same proportions, with the photograph's
 * frame, the name, the maker line, the price rule, the reasoning and the
 * action row all standing as hairline blocks, so the shelf does not move when
 * the real cards land. Never any words: a skeleton that says something is a
 * message, and this surface has nothing to say until Beau has answered.
 */
function SkeletonBar({ width, height = 10, gap = 0 }: { width: string; height?: number; gap?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'block',
        width,
        height: `${height}px`,
        marginTop: `${gap}px`,
        background: HAIRLINE,
      }}
    />
  );
}

export function HuntCardSkeleton() {
  return (
    <article
      aria-hidden="true"
      className="animate-pulse"
      style={{ background: PAPER, border: `1px solid ${HAIRLINE}`, padding: '18px 19px 19px' }}
    >
      <span style={{ display: 'block', aspectRatio: '5 / 2', background: HATCH, border: `1px solid ${HAIRLINE}` }} />
      <SkeletonBar width="78%" height={16} gap={17} />
      <SkeletonBar width="34%" height={8} gap={11} />
      <div style={{ marginTop: '15px', paddingBottom: '11px', borderBottom: `1px solid ${HAIRLINE}` }}>
        <SkeletonBar width="28%" height={12} />
      </div>
      <SkeletonBar width="100%" height={9} gap={14} />
      <SkeletonBar width="92%" height={9} gap={7} />
      <SkeletonBar width="64%" height={9} gap={7} />
      <div className="flex items-center gap-1.5" style={{ marginTop: '16px' }}>
        {['62px', '82px', '58px', '74px'].map((width) => (
          <span
            key={width}
            style={{ display: 'block', width, height: '40px', border: `1px solid ${HAIRLINE}` }}
          />
        ))}
      </div>
    </article>
  );
}

/** The whole shelf, waiting — as many plates as the draw will bring back. */
export function HuntPicksSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div
      role="status"
      aria-label="Beau is choosing"
      className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
      style={{ gap: '15px' }}
    >
      {Array.from({ length: count }, (_, i) => (
        <HuntCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** A quiet, centred line — what a shelf says when it has nothing to show. */
export function HuntQuietLine({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ ...body(13, FAINTER), margin: 0, padding: '18px 0', maxWidth: '58ch' }}>{children}</p>
  );
}

/** The waiting line, with Beau's current phase — never a bare spinner. */
export function HuntWorkingLine({ phase }: { phase: string }) {
  return (
    <p aria-live="polite" className="flex items-center gap-2" style={{ ...mono(8.5, FAINT), margin: 0, padding: '18px 0' }}>
      <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
      {phase}
    </p>
  );
}
