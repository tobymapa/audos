/**
 * Ethaion virtual wardrobe store (v6).
 *
 *  - WardrobePhotoCard: the ONE entry point for photographing clothes, with
 *    two sub-modes feeding the same wardrobe database:
 *      · Quick scan — photograph a pile (slightly messy, partial overlap OK).
 *        Vision AI identifies what it can; the user corrects the cards.
 *      · Precise add — one item per photo for clean, high-confidence
 *        identification and categorisation.
 *  - Photo → catalogue-image pipeline: the uploaded photo is preserved as
 *    each piece's permanent anchor; client-side background removal presents
 *    the REAL garment on a canonical white 3:4 card — deterministic, no AI
 *    image generation of any kind.
 *  - WardrobeStore: owned pieces shop-style; Mix & match stacks selected
 *    pieces as a real outfit in anatomical order (hat → jacket → knit →
 *    shirt → trousers → shoes), live as you tap.
 */
import { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  Check,
  Images,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Shirt,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { tw, typography } from '../../lib/colors';
import {
  WARDROBE_CATEGORIES,
  categoryLabel,
  findLikelyDuplicate,
  generatePieceName,
  insertPieces,
  materialFor,
  outfitLayer,
  type PieceDetails,
  type WardrobePiece,
} from './profile-data';
import { analyzeGarmentPhoto, scanWardrobePhoto, type ScannedPiece } from './wardrobe-ai';
import { BrandField, SizeSelector } from './input-fields';
import { Illo } from './illustrations';
import { BrandMark, CanonicalGarment } from './canonical-garment';
import { CarePanel, FabricLabel } from './care';
import { PieceEditForm } from './piece-edit';
import { garmentFieldsFromPiece, settleProductPhoto } from './photo-enhance';

export { findLikelyDuplicate } from './profile-data';

/** A piece's logged colourways, NAMED rather than swatched: pieces are never
 * colour-coded anywhere they are listed (Recommendation Engine overhaul,
 * Part 2). Colour still reads as swatches inside the shared piece editor,
 * where it is the record being changed. */
function ColorNames({ colors }: { colors: string[] }) {
  if (!colors || colors.length === 0) return null;
  return (
    <span className={`${typography.size.xs} ${typography.color.muted} capitalize`} style={{ fontSize: '10px' }}>
      {colors.slice(0, 5).join(' · ')}
    </span>
  );
}

/** The piece's catalogue image — the canonical pipeline visual in a
 * consistent 3:4 white box: the user's own photo, cleaned and normalised. */
function PieceIllo({ piece, className }: { piece: WardrobePiece | ScannedPiece; className?: string }) {
  return (
    <CanonicalGarment
      fields={{
        name: piece.name,
        category: (piece as WardrobePiece).category,
        slot: (piece as WardrobePiece).slot,
        colors: (piece as WardrobePiece).colors,
        pattern: (piece as WardrobePiece & { pattern?: string | null }).pattern,
        brand: (piece as WardrobePiece).brand,
      }}
      photoUrl={(piece as WardrobePiece).photo_url || null}
      pieceId={(piece as WardrobePiece).id ?? null}
      title={piece.name}
      showConfirmation
      className={className}
    />
  );
}

// ---------------------------------------------------------------------------
// Scan flow — preview entries the user corrects before adding
// ---------------------------------------------------------------------------

interface ScanEntry {
  /** Stable identity for React keys — NEVER derived from the (editable) name.
   * Keying these cards by name remounted them on every keystroke, which
   * dismissed the keyboard after the first character (the Pass Fourteen
   * keyboard bug). */
  uid: number;
  piece: ScannedPiece;
  /** Existing tracker piece this probably duplicates, if any. */
  duplicateOf: WardrobePiece | null;
  /** Set once the user answers the duplicate prompt (“it's different”). */
  duplicateDismissed: boolean;
  /** True once the user typed their own name — auto-generation stops following. */
  nameTouched: boolean;
}

let scanEntryUid = 0;

function ScanEntryCard({
  entry,
  onChange,
  onRemove,
}: {
  entry: ScanEntry;
  onChange: (next: ScanEntry) => void;
  onRemove: () => void;
}) {
  const [showCats, setShowCats] = useState(false);
  const { piece } = entry;
  const needsName = !piece.confident;
  const showDupePrompt = !!entry.duplicateOf && !entry.duplicateDismissed;

  return (
    <div
      className={`rounded-xl border bg-[var(--space-surface-card)] p-2.5 ${
        needsName ? 'border-[var(--space-semantic-warning)]' : 'border-[var(--space-border-default)]'
      }`}
    >
      <div className="flex items-start gap-2.5">
        <PieceIllo piece={piece} className="w-12 aspect-[3/4] rounded-lg flex-shrink-0" />
        <div className="flex-1 min-w-0">
          {needsName && (
            <p className={`${typography.size.xs} text-[var(--space-semantic-warning)] mb-1`} style={{ fontSize: '10px' }}>
              Couldn’t confidently identify this one — name it yourself:
            </p>
          )}
          <input
            type="text"
            value={piece.name}
            onChange={(e) => onChange({ ...entry, piece: { ...piece, name: e.target.value }, nameTouched: true })}
            placeholder="e.g. M65 Field Jacket"
            className={`w-full px-2 py-1 rounded-lg border border-[var(--space-border-default)] bg-[var(--space-surface-card)] ${typography.size.sm} ${typography.weight.medium} focus:outline-none focus:ring-1 focus:ring-[var(--space-brand-primary)]`}
            aria-label="Item name"
          />
          {piece.material && (
            <FabricLabel material={piece.material} className={`${typography.size.xs} ${typography.color.muted} mt-0.5`} />
          )}
          <div className="flex items-center flex-wrap gap-1.5 mt-1.5">
            <button
              type="button"
              onClick={() => setShowCats((s) => !s)}
              className={`${tw.badge.default} ${tw.badge.primary} inline-flex items-center gap-1`}
              style={{ fontSize: '10px' }}
              title="Change category"
            >
              {categoryLabel(piece.category)} <Pencil className="w-2.5 h-2.5" />
            </button>
            {/* The colourways read as NAMES, never as coloured dots — pieces
                carry no colour treatment anywhere they are listed
                (Recommendation Engine overhaul, Part 2). */}
            <ColorNames colors={piece.colors || []} />
          </div>
          {showCats && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {WARDROBE_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    const nextName = entry.nameTouched
                      ? piece.name
                      : generatePieceName({ colors: piece.colors || [], material: piece.material, slot: null, category: c.id }) || piece.name;
                    onChange({ ...entry, piece: { ...piece, category: c.id, slot: null, name: nextName } });
                    setShowCats(false);
                  }}
                  className={`px-2 py-0.5 rounded-full border transition-colors ${typography.size.xs} ${
                    piece.category === c.id
                      ? 'bg-[var(--space-surface-accent-soft)] text-[var(--space-brand-primary-700)] border-[var(--space-brand-primary)]'
                      : 'border-[var(--space-border-default)] text-[var(--space-text-secondary)] hover:border-[var(--space-border-strong)]'
                  }`}
                  style={{ fontSize: '10px' }}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
          {/* Edit-before-saving essentials (Pass Twelve): brand and size are
              always present on the confirm card. */}
          <div className="grid sm:grid-cols-2 gap-2 mt-2">
            <label className={`${typography.size.xs} ${typography.color.muted}`} style={{ fontSize: '10px' }}>
              Brand
              <div className="mt-0.5">
                <BrandField
                  value={piece.brand || ''}
                  onChange={(next) => onChange({ ...entry, piece: { ...piece, brand: next || null } })}
                  placeholder="e.g. Barbour"
                  ariaLabel={`Brand for ${piece.name || 'this piece'}`}
                />
              </div>
            </label>
            <label className={`${typography.size.xs} ${typography.color.muted}`} style={{ fontSize: '10px' }}>
              Size
              <div className="mt-0.5">
                <SizeSelector
                  value={piece.size || ''}
                  onChange={(next) => onChange({ ...entry, piece: { ...piece, size: next || null } })}
                  ariaLabel={`Size for ${piece.name || 'this piece'}`}
                />
              </div>
            </label>
          </div>
          {showDupePrompt && entry.duplicateOf && (
            <div className="mt-2 rounded-lg bg-[var(--space-surface-accent-soft)] px-2.5 py-2">
              <p className={`${typography.size.xs} ${typography.color.secondary}`}>
                This looks like “{entry.duplicateOf.name}” — do you already have this logged?
              </p>
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={onRemove}
                  className={`px-2 py-1 rounded-lg ${typography.size.xs} ${tw.button.secondary}`}
                >
                  Merge — keep the existing one
                </button>
                <button
                  type="button"
                  onClick={() => onChange({ ...entry, duplicateDismissed: true })}
                  className={`px-2 py-1 rounded-lg ${typography.size.xs} ${tw.button.ghost} border border-[var(--space-border-default)]`}
                >
                  Keep both — it’s different
                </button>
              </div>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="p-1 rounded-lg hover:bg-[var(--space-surface-muted)] text-[var(--space-text-muted)] flex-shrink-0"
          aria-label={`Remove ${piece.name} from the scan`}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The ONE photo entry point — quick scan + precise add
// ---------------------------------------------------------------------------

type PhotoMode = 'quick' | 'precise';

export function WardrobePhotoCard({ pieces, onAdded }: { pieces: WardrobePiece[]; onAdded: () => void }) {
  const [mode, setMode] = useState<PhotoMode>('quick');
  const [entries, setEntries] = useState<ScanEntry[]>([]);
  const [scanning, setScanning] = useState(false);
  const [phase, setPhase] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pushEntries = (found: ScannedPiece[]) =>
    setEntries((cur) => [
      ...cur,
      ...found.map((piece) => {
        // The name defaults to the machine-generated [Colour] [Material]
        // [Item Type]; vision's own name is the fallback. Unidentified
        // pieces stay blank so the user is asked to name them.
        const autoName = piece.confident !== false
          ? generatePieceName({ colors: piece.colors || [], material: piece.material, slot: piece.slot || null, category: piece.category })
          : '';
        const named = { ...piece, name: autoName || piece.name };
        return {
          uid: ++scanEntryUid,
          piece: named,
          duplicateOf: findLikelyDuplicate(named, pieces),
          duplicateDismissed: false,
          nameTouched: false,
        };
      }),
    ]);

  const onPhotosPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (files.length === 0 || scanning) return;
    setScanning(true);
    setError(null);
    setNotice(null);
    let found = 0;
    let obscured = 0;
    let failures = 0;
    try {
      for (let i = 0; i < files.length; i += 1) {
        setPhase(
          files.length > 1 ? `Photo ${i + 1} of ${files.length}\u2026` : 'Reading your photo\u2026',
        );
        try {
          if (mode === 'quick') {
            const scan = await scanWardrobePhoto(files[i]);
            obscured += scan.obscuredCount;
            found += scan.pieces.length;
            pushEntries(scan.pieces);
          } else {
            const { piece, photoUrl, enhanced } = await analyzeGarmentPhoto(files[i]);
            // Keep the upload as the confirmation preview. Generation starts
            // after insertion so the finished URL and cache metadata can be
            // attached to the newly created wardrobe row exactly once.
            void enhanced;
            if (piece) {
              found += 1;
              pushEntries([{ ...piece, photo_url: photoUrl, confident: true }]);
            } else {
              // Couldn't identify it — keep the photo, ask the user to name it.
              pushEntries([
                {
                  name: '',
                  brand: null,
                  category: 'other',
                  slot: null,
                  colors: [],
                  seasons: ['year-round'],
                  occasions: ['casual'],
                  photo_url: photoUrl,
                  confident: false,
                },
              ]);
            }
          }
        } catch (err) {
          console.error('[Ethaion] wardrobe photo failed for one photo:', err);
          failures += 1;
        }
      }
      if (found === 0 && failures === 0 && entries.length === 0) {
        setError(
          mode === 'quick'
            ? 'No garments found in that photo \u2014 try laying the pieces out a little flatter, with less overlap.'
            : 'Couldn\u2019t identify that garment \u2014 name the card below, or try a clearer photo.',
        );
      } else {
        const parts: string[] = [];
        if (found > 0) parts.push(`Found ${found} piece${found === 1 ? '' : 's'} \u2014 check the cards below before adding.`);
        if (obscured > 0) parts.push(`${obscured} more ${obscured === 1 ? 'garment was' : 'garments were'} too covered to make out \u2014 spread those out and scan again.`);
        if (failures > 0) parts.push(`${failures} photo${failures === 1 ? '' : 's'} couldn\u2019t be read \u2014 try those again.`);
        if (parts.length > 0) setNotice(parts.join(' '));
      }
    } finally {
      setScanning(false);
      setPhase('');
    }
  };

  const addAll = async () => {
    if (entries.length === 0 || saving) return;
    setSaving(true);
    try {
      const queued = entries.map(({ piece, nameTouched }) => {
        const name = piece.name.trim() || 'Unnamed piece';
        return {
          ...piece,
          name,
          name_is_custom: nameTouched,
          // A precise upload stays visible while the pipeline cleans it;
          // text/group-scan entries begin with the quiet placeholder.
          photo_url: piece.photo_url || null,
        };
      });
      await insertPieces(queued);
      void (async () => {
        for (const piece of queued) {
          if (!piece.photo_url) continue;
          await settleProductPhoto(
            piece.photo_url,
            Promise.resolve(null),
            garmentFieldsFromPiece(
              { name: piece.name, category: piece.category, slot: piece.slot, colors: piece.colors || [], brand: piece.brand || null },
              piece.material,
              piece.pattern || null,
            ),
          );
        }
      })();
      setEntries([]);
      setNotice(null);
      onAdded();
    } finally {
      setSaving(false);
    }
  };

  const modeButton = (id: PhotoMode, title: string, sub: string) => (
    <button
      type="button"
      onClick={() => setMode(id)}
      aria-pressed={mode === id}
      className={`flex-1 min-w-[10rem] text-left rounded-xl border-2 px-3 py-2.5 transition-all ${
        mode === id
          ? 'border-[var(--space-brand-primary)] bg-[var(--space-surface-accent-soft)]'
          : 'border-[var(--space-border-default)] hover:border-[var(--space-border-strong)]'
      }`}
    >
      <span className={`block ${typography.size.sm} ${typography.weight.semibold} ${typography.color.primary}`}>{title}</span>
      <span className={`block ${typography.size.xs} ${typography.color.muted} mt-0.5 leading-snug`}>{sub}</span>
    </button>
  );

  return (
    <div className={`${tw.card.default} rounded-2xl p-4`}>
      <div className="flex items-center gap-2">
        <Camera className={`w-4 h-4 ${tw.icon.primary}`} />
        <h3 className={`${typography.size.base} ${typography.weight.semibold} ${typography.color.primary}`}>
          Photograph your clothes
        </h3>
      </div>
      <p className={`${typography.size.xs} ${typography.color.muted} mt-0.5`}>
        One camera, two ways in — both feed the same wardrobe. Your photo is each piece’s anchor: the background
        is stripped and the real garment is shown on a clean white card — same photo, just cleaned up — in one
        consistent 3:4 crop.
      </p>

      <div className="flex gap-2 mt-3 flex-wrap">
        {modeButton('quick', 'Quick scan', 'A pile or spread — several pieces per photo. Faster; tap to correct anything wrong.')}
        {modeButton('precise', 'Precise add', 'One item per photo — clean, high-confidence identification.')}
      </div>

      <div className="flex items-center gap-2 mt-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={scanning}
          className={`px-4 py-2 rounded-lg ${typography.size.sm} flex items-center gap-1.5 ${tw.button.primary} disabled:opacity-40`}
        >
          {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
          {scanning
            ? phase || 'Scanning\u2026'
            : entries.length > 0
              ? 'Add another photo'
              : mode === 'quick'
                ? 'Photograph the pile'
                : 'Photograph one piece'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={onPhotosPicked}
          className="hidden"
          aria-label="Upload wardrobe photos"
        />
      </div>

      {error && <p className={`${typography.size.xs} text-[var(--space-semantic-warning)] mt-2`}>{error}</p>}
      {notice && !error && <p className={`${typography.size.xs} ${typography.color.secondary} mt-2`}>{notice}</p>}

      {entries.length > 0 && (
        <div className="mt-3 space-y-2">
          {entries.map((entry, idx) => (
            <ScanEntryCard
              key={entry.uid}
              entry={entry}
              onChange={(next) => setEntries((cur) => cur.map((e, i) => (i === idx ? next : e)))}
              onRemove={() => setEntries((cur) => cur.filter((_, i) => i !== idx))}
            />
          ))}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => void addAll()}
              disabled={saving}
              className={`px-4 py-2 rounded-lg ${typography.size.sm} flex items-center gap-1.5 ${tw.button.primary} disabled:opacity-50`}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add {entries.length} piece{entries.length === 1 ? '' : 's'} to my wardrobe
            </button>
            <button
              type="button"
              onClick={() => {
                setEntries([]);
                setNotice(null);
              }}
              className={`px-3 py-2 rounded-lg ${typography.size.xs} ${tw.button.ghost} border border-[var(--space-border-default)]`}
            >
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Back-compat alias — older imports use the previous name. */
export const WardrobeScanCard = WardrobePhotoCard;

// ---------------------------------------------------------------------------
// Photo log — the raw uploads, separate from the illustrated wardrobe
// ---------------------------------------------------------------------------

export function PhotoLog({
  pieces,
  onBack,
  onDelete,
  onChanged,
}: {
  pieces: WardrobePiece[];
  onBack: () => void;
  onDelete: (id: number) => Promise<void>;
  onChanged: () => void;
}) {
  const withPhotos = pieces;
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const doDelete = async (id: number) => {
    setDeletingId(id);
    try {
      await onDelete(id);
      onChanged();
    } finally {
      setDeletingId(null);
      setConfirmingId(null);
    }
  };

  return (
    <div className="px-6 py-8 space-y-8 max-w-4xl mx-auto w-full pb-28">
      <div>
        <button
          type="button"
          onClick={onBack}
          className={`inline-flex items-center gap-1.5 ${typography.size.xs} ${typography.color.brand} hover:underline`}
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Wardrobe
        </button>
        <h3 className={`hab-section-head ${typography.color.primary} mt-2`}>
          Catalogue images
        </h3>
        <p className={`${typography.size.xs} ${typography.color.muted} mt-0.5 max-w-md`}>
          Consistent catalogue imagery for every wardrobe entry — the same white background and 3:4 portrait crop
          throughout, each image cleaned from your own photo of the piece.
        </p>
      </div>

      {withPhotos.length === 0 ? (
        <div className="text-center py-10">
          <Images className="w-8 h-8 mx-auto text-[var(--space-text-muted)]" />
          <p className={`${typography.size.sm} ${typography.color.primary} font-medium mt-2`}>No pieces logged yet</p>
          <p className={`${typography.size.xs} ${typography.color.muted} mt-1 max-w-xs mx-auto`}>
            Add a piece and its catalogue image will appear here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {withPhotos.map((piece) => (
            <div key={piece.id} className={`${tw.card.default} rounded-2xl overflow-hidden`}>
              <PieceIllo piece={piece} className="w-full aspect-[3/4]" />
              <div className="p-2.5">
                <p className={`${typography.size.sm} ${typography.weight.medium} ${typography.color.primary} leading-snug truncate`}>
                  {piece.name}
                </p>
                <p className={`${typography.size.xs} ${typography.color.muted} mt-0.5`}>{categoryLabel(piece.category)}</p>
                {confirmingId !== piece.id ? (
                  <button
                    type="button"
                    onClick={() => setConfirmingId(piece.id)}
                    className={`mt-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg ${typography.size.xs} ${tw.button.ghost} border border-[var(--space-border-default)]`}
                  >
                    <Trash2 className="w-3 h-3" /> Remove piece
                  </button>
                ) : (
                  <div className="mt-2 space-y-1">
                    <p className={`${typography.size.xs} ${typography.color.primary}`} style={{ fontSize: '10px' }}>
                      Removes “{piece.name}” from your wardrobe and The Rail.
                    </p>
                    <span className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void doDelete(piece.id)}
                        disabled={deletingId === piece.id}
                        className={`px-2.5 py-1 rounded-lg ${typography.size.xs} ${tw.button.danger} inline-flex items-center gap-1 disabled:opacity-50`}
                      >
                        {deletingId === piece.id && <Loader2 className="w-3 h-3 animate-spin" />}
                        Remove piece
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingId(null)}
                        className={`px-2.5 py-1 rounded-lg ${typography.size.xs} ${tw.button.ghost} border border-[var(--space-border-default)]`}
                      >
                        Keep
                      </button>
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Store view — owned pieces, shop-style (illustrated tiles only)
// ---------------------------------------------------------------------------

function StoreItemVisual({ piece, size = 'md' }: { piece: WardrobePiece; size?: 'md' | 'sm' }) {
  // The aspect ratio lives on the plate ITSELF (width + aspect-ratio), never
  // on a wrapper with a percentage-height child inside — that pattern
  // collapses to zero height on some desktop engines (older Safari/WebKit).
  const box = size === 'sm' ? 'w-16' : 'w-full';
  return (
    <span className={`${box} block p-2`}>
      <PieceIllo piece={piece} className="w-full aspect-[3/4]" />
    </span>
  );
}

function StoreItemDetail({
  piece,
  material,
  onBack,
  onChanged,
}: {
  piece: WardrobePiece;
  material: string;
  onBack: () => void;
  onChanged: () => void;
}) {
  // Pass Fourteen: the ONE shared piece editor — structured colours, pattern,
  // material and size selectors, progressive disclosure, auto-generated name,
  // photo thumbnail with replace.
  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className={`inline-flex items-center gap-1.5 ${typography.size.xs} ${typography.color.brand} hover:underline`}
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Build a look
      </button>

      <div className={`${tw.card.default} rounded-2xl overflow-hidden`}>
        <div className="flex items-center justify-center p-4">
          <PieceIllo piece={piece} className="w-full aspect-[3/4] max-h-[32rem]" />
        </div>
        <div className="p-4 space-y-3">
          <div style={{ fontFamily: 'var(--space-font-family)' }}>
            <span className="block text-[var(--color-neutral-500,#a68e70)]" style={{ fontSize: '12px', lineHeight: 1.35 }}>
              Brand
            </span>
            <span
              className="block text-[var(--color-text,#3b2b1d)]"
              style={{ fontSize: piece.brand?.trim() ? '14px' : '12px', lineHeight: 1.45 }}
            >
              {piece.brand?.trim() ? piece.brand.trim().toUpperCase() : '—'}
            </span>
          </div>
          <PieceEditForm piece={piece} material={material} onSaved={onChanged} onClose={onBack} />
          <CarePanel piece={piece} material={material} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Outfit stack — selected pieces layered in anatomical order, live
// ---------------------------------------------------------------------------

export function OutfitStack({
  pieces,
  onSelect,
}: {
  pieces: WardrobePiece[];
  /** When provided, each tile becomes a tap target (opens the piece's detail view). */
  onSelect?: (piece: WardrobePiece) => void;
}) {
  const ordered = useMemo(() => [...pieces].sort((a, b) => outfitLayer(a) - outfitLayer(b)), [pieces]);

  return (
    <div className="w-full overflow-x-auto pb-1">
      <div className="flex min-w-max items-stretch justify-center gap-3 px-1">
        {ordered.map((piece) => {
          const inner = (
            <>
              {/* Fixed width AND fixed height on the plate — no aspect-ratio
                  dependence at all: an aspect-derived 3:4 box collapsed to
                  zero height on some desktop engines, which left the What to
                  Wear piece images visible on mobile but missing on desktop.
                  85px ≈ 64px × 4/3, so the plate keeps its 3:4 proportions. */}
              <PieceIllo piece={piece} className="w-16 h-[85px]" />
              <span className="mt-2 line-clamp-2 min-h-8 w-full text-center text-[11px] font-medium leading-4 text-[var(--space-text-primary)]">
                {piece.name}
              </span>
            </>
          );
          const tileCls = 'flex w-28 flex-shrink-0 flex-col items-center rounded-2xl border border-[var(--space-border-default)] bg-[var(--space-surface-card)] p-3';
          return onSelect ? (
            <button
              key={piece.id}
              type="button"
              onClick={() => onSelect(piece)}
              className={`${tileCls} transition-all hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[var(--space-brand-primary)]`}
              title={`Open ${piece.name}`}
              aria-label={`Open ${piece.name} — details, price paid and wear count`}
            >
              {inner}
            </button>
          ) : (
            <div key={piece.id} className={tileCls}>
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function WardrobeStore({
  pieces,
  materials = {},
  details = {},
  onBack,
  onDelete,
  onChanged,
}: {
  pieces: WardrobePiece[];
  /** piece id → material display string (piece_materials companion table). */
  materials?: Record<number, string>;
  details?: Record<number, PieceDetails>;
  onBack: () => void;
  onDelete: (id: number) => Promise<void>;
  onChanged: () => void;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mixMode, setMixMode] = useState(false);
  const [mixIds, setMixIds] = useState<number[]>([]);

  const groups = useMemo(() => {
    const byCat = new Map<string, WardrobePiece[]>();
    for (const p of pieces) {
      const list = byCat.get(p.category) || [];
      list.push(p);
      byCat.set(p.category, list);
    }
    return WARDROBE_CATEGORIES
      .filter((cat) => (byCat.get(cat.id) || []).length > 0)
      .map((cat) => ({ id: cat.id, label: cat.label, pieces: byCat.get(cat.id) as WardrobePiece[] }));
  }, [pieces]);

  const selected = pieces.find((p) => p.id === selectedId) || null;
  const mixPieces = mixIds.map((id) => pieces.find((p) => p.id === id)).filter(Boolean) as WardrobePiece[];

  const isSuit = (piece?: WardrobePiece) =>
    !!piece && piece.category === 'formalwear' && (piece.slot === 'suit' || piece.slot === 'dinner-suit');

  const toggleMix = (id: number) => {
    const nextPiece = pieces.find((piece) => piece.id === id);
    if (!nextPiece) return;
    setMixIds((current) => {
      if (current.includes(id)) return current.filter((currentId) => currentId !== id);
      // One selection per category: tapping another shirt, shoe, jacket, etc.
      // swaps it into the outfit instead of stacking two equivalent pieces.
      let next = current.filter((currentId) => pieces.find((piece) => piece.id === currentId)?.category !== nextPiece.category);
      // A suit is ONE unit (jacket + trousers): selecting one clears separate
      // trousers and jackets — and selecting trousers or a jacket clears a suit.
      if (isSuit(nextPiece)) {
        next = next.filter((currentId) => {
          const piece = pieces.find((p) => p.id === currentId);
          return piece?.category !== 'bottoms' && piece?.category !== 'outerwear';
        });
      } else if (nextPiece.category === 'bottoms' || nextPiece.category === 'outerwear') {
        next = next.filter((currentId) => !isSuit(pieces.find((p) => p.id === currentId)));
      }
      return [...next, id];
    });
  };

  if (selected) {
    return (
      <div className="px-6 py-8 max-w-3xl mx-auto w-full pb-28">
        <StoreItemDetail
          piece={selected}
          material={materialFor(selected, materials)}
          onBack={() => setSelectedId(null)}
          onChanged={onChanged}
        />
      </div>
    );
  }

  return (
    <div className="px-6 py-8 space-y-8 max-w-5xl mx-auto w-full pb-28">
      <div>
        <button
          type="button"
          onClick={onBack}
          className={`inline-flex items-center gap-1.5 ${typography.size.xs} ${typography.color.brand} hover:underline`}
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Wardrobe
        </button>
        <div className="flex items-end justify-between gap-3 mt-2 flex-wrap">
          <div>
            <h3 className={`hab-section-head ${typography.color.primary}`}>
              Build a look
            </h3>
            <p className={`${typography.size.xs} ${typography.color.muted} mt-0.5`}>
              Your pieces on the rails, in their true colours. Tap a piece to rename or remove it
              {pieces.length > 1 ? ' — or switch to Mix & match and tap pieces to build an outfit.' : '.'}
            </p>
          </div>
          {pieces.length > 1 && (
            <button
              type="button"
              onClick={() => {
                setMixMode((m) => !m);
                setMixIds([]);
              }}
              aria-pressed={mixMode}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full ${typography.size.xs} border transition-colors ${
                mixMode
                  ? 'bg-[var(--space-surface-accent-soft)] text-[var(--space-brand-primary-700)] border-[var(--space-brand-primary)]'
                  : 'border-[var(--space-border-default)] text-[var(--space-text-secondary)] hover:border-[var(--space-border-strong)]'
              }`}
            >
              <Shirt className="w-3.5 h-3.5" />
              Mix &amp; match{mixMode ? ' — on' : ''}
            </button>
          )}
        </div>
      </div>

      {pieces.length === 0 && (
        <div className="text-center py-10">
          <span className="inline-block w-16 h-16 rounded-xl bg-[var(--space-surface-muted)] overflow-hidden">
            <Illo id="generic" muted title="Empty wardrobe" className="w-full h-full" />
          </span>
          <p className={`${typography.size.sm} ${typography.color.primary} font-medium mt-2`}>Nothing on the rails yet</p>
          <p className={`${typography.size.xs} ${typography.color.muted} mt-1 max-w-xs mx-auto`}>
            Photograph a piece from the Wardrobe screen’s “Photograph a piece” row and it’ll appear here, shop-style.
          </p>
        </div>
      )}

      {groups.map((group) => (
        <div key={group.id}>
          <p className={`${typography.size.xs} uppercase tracking-[0.18em] ${typography.weight.medium} ${typography.color.secondary} mb-2`}>
            {group.label} · {group.pieces.length}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {group.pieces.map((piece) => {
              const inMix = mixIds.includes(piece.id);
              const material = materialFor(piece, materials);
              return (
                <button
                  key={piece.id}
                  type="button"
                  onClick={() => (mixMode ? toggleMix(piece.id) : setSelectedId(piece.id))}
                  className={`${tw.card.default} rounded-2xl overflow-hidden text-left transition-all hover:-translate-y-0.5 hover:shadow-md relative ${
                    inMix ? 'ring-2 ring-[var(--space-brand-primary)]' : ''
                  }`}
                  title={mixMode ? (inMix ? 'Remove from the outfit' : 'Add to the outfit') : `Open ${piece.name}`}
                >
                  {mixMode && inMix && (
                    <span className="absolute top-2 right-2 z-10 w-5 h-5 rounded-full bg-[var(--space-brand-primary)] flex items-center justify-center">
                      <Check className="w-3 h-3 text-[var(--space-text-on-primary)]" />
                    </span>
                  )}
                  <StoreItemVisual piece={piece} />
                  <div className="p-2.5">
                    {piece.brand && (
                      <BrandMark brand={piece.brand} className={`${typography.size.xs} uppercase tracking-[0.12em] ${typography.color.muted} max-w-full`} />
                    )}
                    <p className={`${typography.size.sm} ${typography.weight.medium} ${typography.color.primary} leading-snug truncate`}>
                      {piece.name}
                    </p>
                    {material && (
                      <FabricLabel material={material} className={`${typography.size.xs} ${typography.color.muted} truncate`} />
                    )}
                    {/* The extra colourways, NAMED and uncoloured — a piece
                        tile never carries a colour indicator. */}
                    {(piece.colors || []).length > 1 && (
                      <span className="block mt-1">
                        <ColorNames colors={(piece.colors as string[]).slice(1)} />
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* Mix & match tray — selected pieces shown as clean side-by-side tiles. */}
      {mixMode && (
        <div className="sticky bottom-3 z-20">
          <div className={`${tw.card.default} rounded-2xl p-3.5 shadow-[0_10px_34px_rgba(0,0,0,0.14)] max-h-[60vh] overflow-y-auto`}>
            {mixPieces.length < 1 ? (
              <p className={`${typography.size.xs} ${typography.color.muted}`}>
                <Sparkles className="w-3.5 h-3.5 inline mr-1 -mt-0.5 text-[var(--space-text-brand)]" />
                Tap pieces above and they’ll appear here as equal, side-by-side outfit tiles.
              </p>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className={`${typography.size.sm} ${typography.weight.semibold} ${typography.color.primary} inline-flex items-center gap-1.5`}>
                    <Layers className="w-4 h-4 text-[var(--space-text-brand)]" />
                    The outfit
                  </p>
                  <button
                    type="button"
                    onClick={() => setMixIds([])}
                    className={`${typography.size.xs} ${typography.color.muted} hover:underline`}
                  >
                    Clear
                  </button>
                </div>
                <OutfitStack pieces={mixPieces} />
                <p className={`${typography.size.xs} ${typography.color.muted} mt-2 text-center`}>
                  {mixPieces
                    .slice()
                    .sort((a, b) => outfitLayer(a) - outfitLayer(b))
                    .map((p) => p.name)
                    .join(' + ')}
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
