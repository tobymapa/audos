/**
 * Outfit builder v2 (Pass Fifteen, Track H) — the purchase-confidence surface:
 * “I want to buy this coat — does it go with what I already own?”
 *
 * Opened from any Curated pick (“Build an outfit with this”), it combines
 * pieces from BOTH sides of the wardrobe line:
 *  - Your wardrobe — pieces actually owned (photos or illustrated tiles).
 *  - Curated picks — Beau's recommendations being considered.
 *
 * Selected pieces render as clean, equal, side-by-side tiles — no stacking,
 * no overlap — each with its image, name and brand. Beau reads the
 * combination and gives one brief compatibility note: a concrete blessing
 * (“navy and camel is a classic pairing”) or a frank flag (“slim trousers
 * with an oversized coat reads sloppy”). Tap to add, tap to remove — that's
 * the whole interaction; it slides up as a bottom sheet so the user never
 * leaves the picks page.
 */
import { useEffect, useRef, useState } from 'react';
import { Check, Layers, Sparkles, X } from 'lucide-react';
import { typography } from '../../lib/colors';
import { type WardrobePiece } from './profile-data';
import { Illo } from './illustrations';
import { CanonicalGarment } from './canonical-garment';
import { fetchProductImage } from './og-image';
import { Skeleton } from './skeleton';

// ---------------------------------------------------------------------------
// Candidates — one shape for owned pieces and curated picks
// ---------------------------------------------------------------------------

export interface OutfitCandidate {
  key: string;
  name: string;
  brand: string | null;
  /** Product page URL (curated picks) — the og:image resolves lazily. */
  productUrl?: string | null;
  /** Direct photo URL (owned pieces with product photos). */
  photoUrl?: string | null;
  slot?: string | null;
  category?: string | null;
  colors?: string[];
  pattern?: string | null;
  source: 'wardrobe' | 'curated';
}

export function candidateFromPiece(piece: WardrobePiece): OutfitCandidate {
  return {
    key: `own-${piece.id}`,
    name: piece.name,
    brand: piece.brand || null,
    photoUrl: piece.photo_url || null,
    slot: piece.slot || null,
    category: piece.category,
    colors: piece.colors || [],
    pattern: (piece as WardrobePiece & { pattern?: string | null }).pattern || null,
    source: 'wardrobe',
  };
}

// ---------------------------------------------------------------------------
// Thumbnail — owned pieces always render through the two-mode pipeline
// (CanonicalGarment); curated picks show their og:image, falling back to the
// neutral illustrated tile. Never a broken image.
// ---------------------------------------------------------------------------

function CandidateThumb({ c, className = '' }: { c: OutfitCandidate; className?: string }) {
  const [src, setSrc] = useState<string>(c.source === 'curated' ? c.photoUrl || '' : '');
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    if (c.source !== 'curated') return;
    setBroken(false);
    if (c.photoUrl) {
      setSrc(c.photoUrl);
      return;
    }
    setSrc('');
    let active = true;
    if (c.productUrl) {
      void fetchProductImage(c.productUrl).then((img) => {
        if (active && img) setSrc(img);
      });
    }
    return () => {
      active = false;
    };
  }, [c.photoUrl, c.productUrl, c.source]);

  if (c.source === 'wardrobe') {
    return (
      <CanonicalGarment
        fields={{ name: c.name, category: c.category, slot: c.slot, colors: c.colors, pattern: c.pattern, brand: c.brand }}
        photoUrl={c.photoUrl || null}
        title={c.name}
        showConfirmation
        className={className}
      />
    );
  }
  if (src && !broken) {
    return (
      <span className={`bg-white flex items-center justify-center overflow-hidden ${className}`}>
        <img src={src} alt={c.name} className="w-full h-full object-contain" loading="lazy" onError={() => setBroken(true)} />
      </span>
    );
  }
  return (
    <span className={`bg-white flex items-center justify-center ${className}`}>
      <Illo id={c.slot || c.category || 'generic'} name={c.name} title={c.name} showLabel={false} className="w-3/4 h-3/4" />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Beau's compatibility note
// ---------------------------------------------------------------------------

function extractJson(text: string): any {
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

const NOTE_SYSTEM =
  'You are Beau, Ethaion\u2019s classic-menswear valet. A man shows you an outfit combination \u2014 some pieces he owns, some he is considering buying. Return STRICT JSON, no markdown: {"note": string}. The note is 1\u20132 short sentences in your warm, direct voice. If the combination works, say WHY concretely \u2014 the colour pairing, the register, the proportions (e.g. \u201cnavy and camel is a classic pairing\u201d). If something is off \u2014 clashing colours, mismatched formality, bad proportions \u2014 say so plainly and name the fix (e.g. \u201cslim trousers with an oversized coat reads sloppy \u2014 balance the volumes\u201d). Never hedge, never pad.';

async function beauOutfitNote(items: OutfitCandidate[]): Promise<string> {
  const lines = items
    .map((c) => `- ${c.name}${c.brand ? ` by ${c.brand}` : ''}${c.colors && c.colors.length > 0 ? ` (${c.colors.join(', ')})` : ''} — ${c.source === 'wardrobe' ? 'OWNED' : 'CONSIDERING BUYING (curated pick)'}`)
    .join('\n');
  const res = await fetch('/proxy/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: NOTE_SYSTEM },
        { role: 'user', content: `The proposed outfit:\n${lines}` },
      ],
      max_tokens: 140,
      temperature: 0.5,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`outfit note failed: ${res.status}`);
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  const parsed = typeof content === 'string' ? extractJson(content) : null;
  const note = typeof parsed?.note === 'string' ? parsed.note.trim() : '';
  if (!note) throw new Error('empty note');
  return note;
}

const FALLBACK_NOTE =
  'Beau couldn\u2019t weigh in just now \u2014 the classics still hold: keep it to two or three colours, one statement piece, and the same formality register across the outfit.';

// ---------------------------------------------------------------------------
// The bottom sheet
// ---------------------------------------------------------------------------

export function OutfitBuilderSheet({
  seed,
  pieces,
  curated,
  onClose,
}: {
  /** The pick that opened the builder — pre-selected. */
  seed: OutfitCandidate;
  /** The user's owned wardrobe. */
  pieces: WardrobePiece[];
  /** Other curated picks available to add (the seed may repeat; it's filtered). */
  curated: OutfitCandidate[];
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<OutfitCandidate[]>([seed]);
  const [note, setNote] = useState<string | null>(null);
  const [noteBusy, setNoteBusy] = useState(false);
  const noteSeq = useRef(0);

  const selectedKeys = new Set(selected.map((c) => c.key));
  const wardrobeOptions = pieces.map(candidateFromPiece);
  const curatedOptions = curated.filter((c) => c.key !== seed.key);

  const toggle = (c: OutfitCandidate) =>
    setSelected((cur) => (cur.some((x) => x.key === c.key) ? cur.filter((x) => x.key !== c.key) : [...cur, c]));

  // Beau's note — debounced, regenerated whenever the combination changes.
  useEffect(() => {
    const seq = ++noteSeq.current;
    if (selected.length < 2) {
      setNote(null);
      setNoteBusy(false);
      return;
    }
    setNoteBusy(true);
    const timer = window.setTimeout(() => {
      beauOutfitNote(selected)
        .catch(() => FALLBACK_NOTE)
        .then((n) => {
          if (seq === noteSeq.current) {
            setNote(n);
            setNoteBusy(false);
          }
        });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [selected.map((c) => c.key).join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  const chip = (c: OutfitCandidate) => {
    const active = selectedKeys.has(c.key);
    return (
      <button
        key={c.key}
        type="button"
        onClick={() => toggle(c)}
        aria-pressed={active}
        className={`inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full border transition-colors ${typography.size.xs} ${
          active
            ? 'bg-[var(--space-surface-accent-soft)] border-[var(--space-brand-primary)] text-[var(--space-text-brand)] font-medium'
            : 'border-[var(--space-border-default)] text-[var(--space-text-secondary)] hover:border-[var(--space-border-strong)]'
        }`}
        title={active ? `Remove ${c.name} from the outfit` : `Add ${c.name} to the outfit`}
      >
        <CandidateThumb c={c} className="w-6 h-6 rounded-full border border-[var(--space-border-default)] flex-shrink-0" />
        <span className="truncate max-w-[11rem]">{c.name}</span>
        {active && <Check className="w-3 h-3 flex-shrink-0" />}
      </button>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Build an outfit"
    >
      <span className="absolute inset-0 bg-[var(--space-shell-shadow-strong)]" aria-hidden="true" />
      <div
        className="relative w-full sm:max-w-2xl sm:mx-4 bg-[var(--space-surface-card)] rounded-t-2xl sm:rounded-2xl p-6 shadow-xl max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className={`${typography.size.lg} ${typography.weight.semibold} ${typography.color.primary} flex items-center gap-2`}>
              <Layers className="w-5 h-5 text-[var(--space-text-brand)]" />
              Build an outfit
            </h4>
            <p className={`${typography.size.xs} ${typography.color.muted} mt-1`}>
              Does it go with what you already own? Tap pieces to add or remove them — Beau weighs the combination.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`px-2 py-1 rounded-lg ${typography.size.xs} hover:bg-[var(--space-surface-muted)] text-[var(--space-text-muted)] flex-shrink-0`}
            aria-label="Close the outfit builder"
          >
            Close
          </button>
        </div>

        {/* The outfit — clean, equal, side-by-side tiles. No stacking. */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-5">
          {selected.map((c) => (
            <div key={c.key} className="rounded-2xl border border-[var(--space-border-default)] overflow-hidden relative">
              <button
                type="button"
                onClick={() => toggle(c)}
                className="absolute top-2 right-2 z-10 p-1 rounded-full bg-[var(--space-surface-card)] border border-[var(--space-border-default)] text-[var(--space-text-muted)] hover:text-[var(--space-text-primary)] shadow-sm"
                aria-label={`Remove ${c.name} from the outfit`}
                title="Remove from the outfit"
              >
                <X className="w-3 h-3" />
              </button>
              <CandidateThumb c={c} className="w-full aspect-[3/4]" />
              <div className="p-3">
                {c.brand && (
                  <p className={`${typography.size.xs} uppercase tracking-[0.15em] ${typography.color.muted} truncate`} style={{ fontSize: '9px' }}>
                    {c.brand}
                  </p>
                )}
                <p className={`${typography.size.xs} ${typography.weight.medium} ${typography.color.primary} leading-snug line-clamp-2`}>
                  {c.name}
                </p>
                <p className={`${typography.size.xs} ${c.source === 'wardrobe' ? typography.color.muted : typography.color.brand} mt-0.5`} style={{ fontSize: '9px' }}>
                  {c.source === 'wardrobe' ? 'Yours' : 'Beau’s pick'}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Beau's compatibility note */}
        <div className="mt-4 rounded-2xl bg-[var(--space-surface-accent-soft)] p-4">
          {selected.length < 2 ? (
            <p className={`${typography.size.xs} ${typography.color.secondary}`}>
              <Sparkles className="w-3.5 h-3.5 inline mr-1 -mt-0.5 text-[var(--space-text-brand)]" />
              Add a piece from your wardrobe below and Beau will tell you whether the pairing works.
            </p>
          ) : noteBusy || !note ? (
            <div className="space-y-2" aria-label="Beau is weighing the combination">
              <Skeleton className="h-3 w-11/12 rounded" />
              <Skeleton className="h-3 w-2/3 rounded" />
            </div>
          ) : (
            <p className={`${typography.size.sm} ${typography.color.primary} leading-relaxed`}>
              <Sparkles className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5 text-[var(--space-text-brand)]" />
              {note}
            </p>
          )}
        </div>

        {/* Add from your wardrobe */}
        <div className="mt-5">
          <p className={`${typography.size.xs} uppercase tracking-[0.18em] ${typography.weight.medium} ${typography.color.secondary} mb-2`}>
            Your wardrobe
          </p>
          {wardrobeOptions.length > 0 ? (
            <div className="flex flex-wrap gap-2 max-h-44 overflow-y-auto pr-1">{wardrobeOptions.map(chip)}</div>
          ) : (
            <p className={`${typography.size.xs} ${typography.color.muted}`}>
              Nothing logged yet — add pieces in The Rail and they'll appear here.
            </p>
          )}
        </div>

        {/* Add from Beau's picks */}
        {curatedOptions.length > 0 && (
          <div className="mt-4">
            <p className={`${typography.size.xs} uppercase tracking-[0.18em] ${typography.weight.medium} ${typography.color.secondary} mb-2`}>
              Beau's picks for this gap
            </p>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto pr-1">{curatedOptions.map(chip)}</div>
          </div>
        )}
      </div>
    </div>
  );
}
