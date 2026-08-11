/**
 * ADD A PIECE — the 23a surface, refined (add-piece refinements pass):
 *
 *  · TWO DIRECT ACTIONS in the header — [ Photograph ] opens the camera /
 *    file picker THE MOMENT it is tapped (no sub-box, no second click);
 *    [ Search ] opens the search input focused and ready to type into.
 *    There is no intermediate step between choosing a way in and starting.
 *  · ALL EIGHT FIELDS VISIBLE the moment the card opens — no "show all",
 *    no hidden sections. This supersedes the earlier sentence-read-back /
 *    three-tappable-phrases pattern.
 *  · FIELD ORDER FOLLOWS THE NAME. The machine name reads
 *    [colour] [material] [type] ("light blue cotton oxford shirt by X"),
 *    so the card runs colour → material → type → maker, then pattern →
 *    size → season → occasion → notes.
 *  · ONE VISUAL REGISTER for every row: IBM Plex Mono small-caps label in
 *    the left column, the control on the right — walnut pills for choices,
 *    hairline inputs and selects for typed values. No field is styled
 *    differently from its neighbours.
 *  · AFTER SAVE, Beau reads up on the piece online (beau-enrichment.ts —
 *    the platform web-search integration + a Haiku distillation) and the
 *    piece card in The Ledger shows what he found.
 *
 * Mechanics preserved from the previous passes: client-side compression
 * (max 1200px, JPEG 0.85) before anything touches the network; the upload
 * and AI read run behind the open card and never overwrite a corrected
 * field; Save is optimistic and returns at once; Photoroom runs after save;
 * the counter stops at five.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { Loader2 } from 'lucide-react';
import { typography } from '../../lib/colors';
import { SearchPieceFlow } from './search-piece';
import {
  COLOR_OPTIONS,
  MATERIAL_CHOICES,
  MAX_PIECE_COLORS,
  OCCASION_TAGS,
  PATTERN_OPTIONS,
  SEASON_OPTIONS,
  SIZE_TYPES,
  WARDROBE_CATEGORIES,
  categoryById,
  composeSize,
  defaultOccasions,
  defaultSeasons,
  findLikelyDuplicate,
  formatColorName,
  generatePieceName,
  insertPieces,
  parseSize,
  slotLabel as canonicalSlotLabel,
  swatchFor,
  type NewPiece,
  type WardrobePiece,
} from './profile-data';
import { BrandField } from './input-fields';
import { queueWardrobeReassessment } from './reassess-queue';
import { identifyGarmentFromUrl } from './wardrobe-ai';
import { enrichPiece } from './beau-enrichment';
import { attachPreparedProductPhoto, compressImage, prepareProductPhoto, uploadGarmentPhotoFast } from './photo-enhance';
import { MONO, capWord, numberWord, sentenceCase, usePlexMono } from './mono-type';

// ---------------------------------------------------------------------------
// The 23a type registers — Cormorant for names and buttons, Lora for prose,
// IBM Plex Mono small caps for every working label.
// ---------------------------------------------------------------------------

const SERIF = 'var(--space-font-heading)';
const BODY = 'var(--space-font-family)';
const WALNUT = '#241a12';
const INK = '#3b2b1d';
const SECONDARY = '#634e38';
const MUTED = '#856c51';
const FAINT = '#a68e70';
const ACCENT = '#a8712c';
const ACCENT_DEEP = '#7c4a17';
const PAPER = '#fbf8f1';

function monoLabel(size = 9): React.CSSProperties {
  return { fontFamily: MONO, fontSize: `${size}px`, letterSpacing: '0.06em', textTransform: 'uppercase' };
}

const pillBase: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: '9.5px',
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  padding: '6px 12px',
  whiteSpace: 'nowrap',
};
const pillDark: React.CSSProperties = { ...pillBase, background: WALNUT, color: PAPER, border: `1px solid ${WALNUT}` };
const pillOutline: React.CSSProperties = {
  ...pillBase,
  background: 'transparent',
  color: SECONDARY,
  border: '1px solid rgba(59,43,29,0.3)',
};

/** The ONE hairline input/select treatment every typed field on the card
 * uses — same border, same type, same padding, no rounding. */
const hairlineControl: React.CSSProperties = {
  fontFamily: BODY,
  fontSize: '14px',
  color: INK,
  background: 'transparent',
  border: '1px solid rgba(59,43,29,0.34)',
  borderRadius: 0,
  padding: '9px 12px',
};

interface ConfirmDraft {
  category: string;
  slot: string | null;
  colors: string[];
  pattern: string;
  material: string;
  size: string;
  brand: string;
  /** True when Beau read a brand off the photo itself. */
  brandFromPhoto: boolean;
  seasons: string[];
  occasions: string[];
  name: string;
  nameIsCustom: boolean;
  /** Free-text notes — provenance, fit, condition. Stored in piece_details.notes. */
  description: string;
}

// ---------------------------------------------------------------------------
// The uniform field row — mono small-caps label left, the control right.
// Every one of the eight fields uses exactly this treatment.
// ---------------------------------------------------------------------------

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <div style={{ paddingTop: '4px' }}>
        <span style={{ ...monoLabel(9), color: FAINT }}>{label}</span>
      </div>
      <div className="min-w-0">{children}</div>
    </>
  );
}

/** Walnut pill toggle — the choice control every tag-like field shares. */
function PillToggle({
  label,
  active,
  onClick,
  swatch,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  swatch?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="inline-flex items-center hover:opacity-85 transition-opacity"
      style={{ ...(active ? pillDark : pillOutline), gap: swatch ? '7px' : undefined }}
    >
      {swatch && (
        <span
          style={{
            width: '9px',
            height: '9px',
            borderRadius: '50%',
            background: swatch,
            border: active ? '1px solid rgba(246,240,229,0.5)' : '1px solid rgba(59,43,29,0.35)',
            display: 'inline-block',
            flexShrink: 0,
          }}
        />
      )}
      {label}
    </button>
  );
}

export function PhotoConfirmFlow({
  pieces,
  onAdded,
  categoryId,
  openPickerRef,
}: {
  pieces: WardrobePiece[];
  onAdded: () => void;
  categoryId?: string;
  /** The header's [ Photograph ] button calls this to open the picker
   * directly — no sub-box, no second click. */
  openPickerRef?: React.MutableRefObject<(() => void) | null>;
}) {
  usePlexMono();
  const inputRef = useRef<HTMLInputElement>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [draft, setDraft] = useState<ConfirmDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dupeDismissed, setDupeDismissed] = useState(false);
  // The colour palette and the full type list open inline UNDER their rows
  // when asked for — the fields themselves are always visible.
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [typePanelOpen, setTypePanelOpen] = useState(false);
  // The uploaded photo URL — kept in a ref because the background clean-up
  // can swap it while the user is still confirming fields.
  const photoUrlRef = useRef<string>('');
  // The in-flight background upload — Save awaits it briefly when the user
  // is faster than the (compressed, sub-second) upload.
  const uploadRef = useRef<Promise<string> | null>(null);
  // Stale-merge guard: a Discard/new pick invalidates in-flight AI merges.
  const pickSeqRef = useRef(0);

  const openPicker = () => inputRef.current?.click();
  useEffect(() => {
    if (!openPickerRef) return;
    openPickerRef.current = openPicker;
    return () => {
      openPickerRef.current = null;
    };
  }, [openPickerRef]);

  const makeDefaultDraft = (): ConfirmDraft => ({
    category: categoryId || 'other',
    slot: null,
    colors: [],
    pattern: '',
    material: '',
    size: '',
    brand: '',
    brandFromPhoto: false,
    seasons: defaultSeasons(null),
    occasions: defaultOccasions(null),
    name: '',
    nameIsCustom: false,
    description: '',
  });

  // The card appears the MOMENT the photo is chosen — compression is
  // instant, and the upload + Beau's AI read run BEHIND the open card,
  // filling fields in as they land. Nothing blocks the form or Save.
  const onPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (inputRef.current) inputRef.current.value = '';
    if (!file) return;
    const seq = ++pickSeqRef.current;
    setError(null);
    setSavedFlash(null);
    setDupeDismissed(false);
    setPaletteOpen(false);
    setTypePanelOpen(false);
    setUploaded(false);
    photoUrlRef.current = '';
    uploadRef.current = null;

    // 1. Client-side compression FIRST (max 1200px, JPEG 0.85) — before the
    //    upload, before the AI read, before Photoroom, before storage.
    const compressed = await compressImage(file);
    if (seq !== pickSeqRef.current) return;
    setLocalPreview(URL.createObjectURL(compressed));

    // 2. The card shows IMMEDIATELY with the photo — blank fields for now.
    const defaults = makeDefaultDraft();
    setDraft(defaults);
    setAnalysing(true);

    // 3. Upload in the background — the URL becomes the piece's anchor.
    // `compressed` already went through compressImage above — say so, or it
    // gets decoded, redrawn and JPEG-encoded a second time for nothing.
    const upload = uploadGarmentPhotoFast(compressed, true).then(({ url }) => {
      if (seq === pickSeqRef.current) {
        photoUrlRef.current = url;
        setUploaded(true);
      }
      return url;
    });
    uploadRef.current = upload.catch(() => '');

    // 4. Beau's AI read — merged into the open card when it lands, but NEVER
    //    over a field the user has already corrected. When Beau can't read
    //    the garment (AI error, timeout, malformed JSON) the blank card
    //    simply stays — no crash, no error message.
    try {
      const url = await upload;
      const piece = await identifyGarmentFromUrl(url);
      if (seq !== pickSeqRef.current || !piece) return;
      setDraft((cur) => {
        if (!cur) return cur;
        const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
        const next: ConfirmDraft = { ...cur };
        if (same(cur.category, defaults.category) && same(cur.slot, defaults.slot)) {
          if (piece.category && piece.category !== 'other') next.category = piece.category;
          next.slot = piece.slot || null;
        }
        if (same(cur.colors, defaults.colors)) next.colors = piece.colors || [];
        if (same(cur.pattern, defaults.pattern)) next.pattern = piece.pattern || '';
        if (same(cur.material, defaults.material)) next.material = piece.material || '';
        if (same(cur.brand, defaults.brand)) {
          next.brand = piece.brand || '';
          next.brandFromPhoto = !!piece.brand;
        }
        if (same(cur.seasons, defaults.seasons)) next.seasons = piece.seasons || defaultSeasons(piece.slot || null);
        if (same(cur.occasions, defaults.occasions)) next.occasions = piece.occasions || defaultOccasions(piece.slot || null);
        if (!cur.nameIsCustom) {
          next.name =
            generatePieceName({ colors: next.colors, material: next.material, slot: next.slot, category: next.category }) ||
            piece.name ||
            cur.name;
        }
        return next;
      });
    } catch (err) {
      console.warn('[Ethaion] photo read failed — the blank card stays:', err);
    } finally {
      if (seq === pickSeqRef.current) setAnalysing(false);
    }
  };

  // The machine-generated name follows the confirmed fields — "named from
  // the fields below" (23a); there is no name input on the card.
  const autoName = useMemo(
    () =>
      draft
        ? generatePieceName({ colors: draft.colors, material: draft.material, slot: draft.slot, category: draft.category })
        : '',
    [draft?.colors, draft?.material, draft?.slot, draft?.category],
  );
  useEffect(() => {
    if (draft && !draft.nameIsCustom && autoName && draft.name !== autoName) {
      setDraft({ ...draft, name: autoName });
    }
  }, [autoName]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (p: Partial<ConfirmDraft>) => setDraft((cur) => (cur ? { ...cur, ...p } : cur));

  const duplicateOf = useMemo(
    () =>
      draft && draft.name.trim()
        ? findLikelyDuplicate({ name: draft.name, category: draft.category, slot: draft.slot, colors: draft.colors }, pieces)
        : null,
    [draft?.name, draft?.category, draft?.slot, draft?.colors, pieces],
  );
  const duplicateMonth = useMemo(() => {
    const stamp = (duplicateOf as (WardrobePiece & { created_at?: string }) | null)?.created_at;
    if (!stamp) return '';
    const date = new Date(stamp);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('en-GB', { month: 'long' });
  }, [duplicateOf]);

  const reset = () => {
    pickSeqRef.current += 1; // invalidate any in-flight AI merge
    setDraft(null);
    setLocalPreview(null);
    setError(null);
    setDupeDismissed(false);
    setPaletteOpen(false);
    setTypePanelOpen(false);
    setSizeTypeId('');
    setAnalysing(false);
    setUploaded(false);
    photoUrlRef.current = '';
    uploadRef.current = null;
  };

  const save = async (addAnother = false) => {
    if (!draft || !draft.name.trim() || saving) return;
    setSaving(true);
    setError(null);
    // Auto-uppercase on save — free-typed fields only.
    const finalName = draft.name.trim().toUpperCase();
    const finalBrand = draft.brand.trim().toUpperCase();
    // Captured before reset(): Beau's post-save online read-up needs them.
    const enrichTypeLabel = canonicalSlotLabel(draft.slot) || categoryById(draft.category)?.label || '';
    const enrichMaterial = draft.material.trim();
    let fastUrl = photoUrlRef.current;
    // Keep the upload promise even if the four-second optimistic race loses;
    // the inserted row can still receive and clean the image when it lands.
    const pendingUpload = uploadRef.current;
    // Optimistic UI: the new piece appears in the wardrobe immediately,
    // faint, while the write is in flight.
    const tempId = -Math.floor(Date.now() % 2147480000);
    window.dispatchEvent(
      new CustomEvent('ethaion:piece-add-optimistic', {
        detail: {
          piece: {
            id: tempId,
            name: finalName,
            brand: finalBrand || null,
            category: draft.category,
            slot: draft.slot,
            colors: draft.colors,
            seasons: draft.seasons,
            occasions: draft.occasions,
            photo_url: fastUrl || null,
            created_at: new Date().toISOString(),
          },
        },
      }),
    );
    try {
      // The compressed upload is sub-second — if the user beat it to Save,
      // wait briefly for the URL rather than saving the piece photo-less.
      if (!fastUrl && uploadRef.current) {
        fastUrl = await Promise.race([
          uploadRef.current,
          new Promise<string>((resolve) => window.setTimeout(() => resolve(''), 4000)),
        ]).catch(() => '');
        if (fastUrl) photoUrlRef.current = fastUrl;
      }
      // Start Photoroom/canonical preparation at the save boundary, in
      // parallel with the database write. The row still uses the raw image
      // optimistically, then swaps to this prepared URL when ready.
      const preparedPhoto = fastUrl
        ? prepareProductPhoto(fastUrl)
        : (pendingUpload || Promise.resolve('')).then((sourceUrl) => prepareProductPhoto(sourceUrl));
      const piece: NewPiece = {
        name: finalName,
        brand: finalBrand || null,
        category: draft.category,
        slot: draft.slot,
        colors: draft.colors,
        pattern: draft.pattern || null,
        material: draft.material.trim() || null,
        size: draft.size.trim() || null,
        notes: draft.description.trim() || null,
        seasons: draft.seasons,
        occasions: draft.occasions,
        // The upload stays visible while settleProductPhoto preserves it as
        // the permanent anchor and cleans it through the pipeline.
        photo_url: fastUrl || null,
        name_is_custom: draft.nameIsCustom,
      };
      await insertPieces([piece]);
      // Bind the pipeline to the row id, rather than rediscovering it later by
      // URL. This makes first-save cleanup durable even when the upload itself
      // finishes just after the database insert.
      const { data: insertedRows } = await (window as any).__workspaceDb
        .from('wardrobe_pieces')
        .orderBy('created_at', 'desc')
        .limit(1)
        .get();
      const insertedId = Number(insertedRows?.[0]?.id || 0);
      if (insertedId) {
        void preparedPhoto
          .then((prepared) => prepared.cleanedUrl ? attachPreparedProductPhoto(insertedId, prepared) : null)
          .catch((photoError) => console.warn('[Ethaion] first-save photo cleanup skipped:', photoError));
        // Beau reads up on the piece online — fire-and-forget; the result
        // lands on the piece card in The Ledger (beau-enrichment.ts).
        void enrichPiece({
          pieceId: insertedId,
          name: finalName,
          brand: finalBrand || null,
          typeLabel: enrichTypeLabel,
          material: enrichMaterial || null,
        });
      }
      window.dispatchEvent(new CustomEvent('ethaion:piece-add-settled', { detail: { tempId } }));
      // The write has landed — that is the whole of what the user waited on.
      // Beau's re-read of the wardrobe is a SEPARATE operation: queued here,
      // never awaited (reassess-queue.ts). The Save button returns at once.
      queueWardrobeReassessment('piece logged');
      setSavedFlash(finalName);
      reset();
      onAdded();
      window.setTimeout(() => setSavedFlash(null), 3000);
      // SAVE AND ADD ANOTHER (23a): wardrobes are logged in sittings, not
      // one piece at a time — the second button re-opens the picker at once.
      if (addAnother) window.setTimeout(() => inputRef.current?.click(), 200);
    } catch (err) {
      // Failed save: remove the optimistic row and surface an inline error —
      // the draft stays so one more tap retries.
      console.error('[Ethaion] photo-flow save failed:', err);
      window.dispatchEvent(new CustomEvent('ethaion:piece-add-failed', { detail: { tempId } }));
      setError('That didn’t save — check your connection and tap Save again.');
    } finally {
      setSaving(false);
    }
  };

  const slots = draft ? categoryById(draft.category)?.slots || [] : [];
  const currentSlot = draft ? slots.find((s) => s.id === draft.slot) || null : null;

  // The card title — named from the fields below (23a), sentence case.
  const cardName = draft
    ? (autoName || draft.name).trim()
      ? sentenceCase(autoName || draft.name)
      : analysing
        ? 'Reading your photo…'
        : 'Your new piece'
    : '';

  // Colour selection — same toggle rules as the shared ColorSelector: up to
  // three, the first is the primary; at the cap a new tap replaces the last.
  const toggleColor = (id: string) => {
    if (!draft) return;
    const selected = draft.colors.map((c) => c.toLowerCase().trim()).filter(Boolean);
    if (selected.includes(id)) {
      patch({ colors: selected.filter((c) => c !== id) });
      return;
    }
    if (selected.length >= MAX_PIECE_COLORS) {
      patch({ colors: [...selected.slice(0, MAX_PIECE_COLORS - 1), id] });
      return;
    }
    patch({ colors: [...selected, id] });
  };

  // Size — the structured type-first picker, in the card's own hairline
  // register (same rules as the shared SizeSelector).
  const parsedSize = draft ? parseSize(draft.size) : null;
  const [sizeTypeId, setSizeTypeId] = useState('');
  useEffect(() => {
    if (parsedSize) setSizeTypeId(parsedSize.typeId);
  }, [draft?.size]); // eslint-disable-line react-hooks/exhaustive-deps
  const sizeType = SIZE_TYPES.find((s) => s.id === sizeTypeId) || null;

  const materialIsLegacy = !!draft && !!draft.material.trim() && !MATERIAL_CHOICES.includes(draft.material.trim());

  return (
    <div>
      {/* Nothing renders below the header until a photo is chosen — the
          [ Photograph ] button opens the picker directly, and the card
          (with the photo beside it) appears the moment a photo lands. */}
      {savedFlash && !draft && (
        <p className={`${typography.size.xs} text-[var(--space-semantic-success)]`} style={{ marginTop: '14px' }}>
          “{savedFlash}” logged — in The Ledger, under Your pieces. Beau is reading up on it…
        </p>
      )}
      {draft && (
      <div className="grid grid-cols-1 md:grid-cols-[300px_minmax(0,1fr)] gap-8 md:gap-[44px] items-start" style={{ marginTop: '28px' }}>
        {/* ------------------------------------------------ the photo column */}
        <div>
          <div style={{ background: '#e6d9c4', padding: '14px' }}>
            <div style={{ aspectRatio: '3 / 4' }}>
              {localPreview ? (
                <img
                  src={localPreview}
                  alt="Your photo of the piece"
                  className="w-full h-full object-cover"
                  style={{ display: 'block' }}
                />
              ) : null}
            </div>
          </div>
          {draft && (
            <div className="flex items-baseline justify-between gap-2.5" style={{ marginTop: '9px' }}>
              <span style={{ ...monoLabel(9), color: MUTED }}>
                Your photo · {uploaded ? 'uploaded' : 'uploading…'}
              </span>
              <button type="button" onClick={openPicker} className="hover:underline" style={{ ...monoLabel(9), color: ACCENT_DEEP, background: 'transparent' }}>
                Retake
              </button>
            </div>
          )}
          <p
            style={{
              margin: '10px 0 0',
              paddingLeft: '12px',
              borderLeft: `2px solid ${ACCENT}`,
              fontFamily: BODY,
              fontSize: '12.5px',
              lineHeight: 1.5,
              color: SECONDARY,
            }}
          >
            One piece at a time, laid flat, daylight if you have it. The background comes off after you save — this
            photograph stays as the piece’s anchor either way.
          </p>
        </div>

        {/* ------------------------------------------------- the card column */}
        <div>
          {draft && (
            <>
              <div style={{ border: '1px solid rgba(59,43,29,0.28)', background: PAPER, padding: '22px 24px' }}>
                <div className="flex items-baseline justify-between gap-4 flex-wrap">
                  <span style={{ fontFamily: SERIF, fontSize: '26px', lineHeight: 1.1, color: (autoName || draft.name).trim() ? WALNUT : FAINT }}>
                    {cardName}
                  </span>
                  <span style={{ ...monoLabel(9), color: FAINT }}>
                    {analysing ? 'Beau is reading the photo…' : 'Named from the fields below'}
                  </span>
                </div>

                {/* ALL EIGHT FIELDS, visible at once, in the order the name
                    reads them: colour → material → type → maker, then
                    pattern → size → season → occasion → notes. One label
                    register, one control register — no row styled apart. */}
                <div
                  style={{
                    marginTop: '18px',
                    display: 'grid',
                    gridTemplateColumns: '110px minmax(0,1fr)',
                    gap: '15px 18px',
                    alignItems: 'start',
                  }}
                >
                  {/* 1 — COLOUR (the name reads it first). */}
                  <FieldRow label="Colour">
                    <div className="flex flex-wrap items-center" style={{ gap: '7px' }}>
                      {draft.colors.map((c) => (
                        <PillToggle key={c} label={formatColorName(c)} active swatch={swatchFor(c)} onClick={() => toggleColor(c.toLowerCase().trim())} />
                      ))}
                      <button
                        type="button"
                        onClick={() => setPaletteOpen((o) => !o)}
                        aria-expanded={paletteOpen}
                        className="hover:underline"
                        style={{ ...monoLabel(9), color: ACCENT_DEEP, background: 'transparent', padding: '6px 0' }}
                      >
                        {paletteOpen ? 'Done' : draft.colors.length === 0 ? 'Pick a colour' : draft.colors.length === 1 ? 'Add a second' : 'Change'}
                      </button>
                    </div>
                    {paletteOpen && (
                      <div className="flex flex-wrap" style={{ gap: '6px', marginTop: '9px', border: '1px solid rgba(59,43,29,0.22)', padding: '10px 12px' }}>
                        {COLOR_OPTIONS.map((id) => (
                          <PillToggle key={id} label={formatColorName(id)} active={draft.colors.includes(id)} swatch={swatchFor(id)} onClick={() => toggleColor(id)} />
                        ))}
                      </div>
                    )}
                  </FieldRow>

                  {/* 2 — MATERIAL. */}
                  <FieldRow label="Material">
                    <select
                      value={draft.material.trim()}
                      onChange={(e) => patch({ material: e.target.value })}
                      className="focus:outline-none focus:border-[var(--color-accent,#a8712c)]"
                      style={{ ...hairlineControl, maxWidth: '340px', width: '100%' }}
                      aria-label="Material"
                    >
                      <option value="">Material…</option>
                      {materialIsLegacy && <option value={draft.material.trim()}>{draft.material.trim()} (as logged)</option>}
                      {MATERIAL_CHOICES.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </FieldRow>

                  {/* 3 — TYPE. Beau's read leads; the likely alternatives sit
                      beside it; "something else" opens the full list inline. */}
                  <FieldRow label="Type">
                    <div className="flex flex-wrap items-center" style={{ gap: '7px' }}>
                      {currentSlot && <PillToggle label={currentSlot.label} active onClick={() => setTypePanelOpen((o) => !o)} />}
                      {slots
                        .filter((s) => s.id !== draft.slot)
                        .slice(0, 3)
                        .map((s) => (
                          <PillToggle key={s.id} label={s.label} active={false} onClick={() => patch({ slot: s.id })} />
                        ))}
                      <button
                        type="button"
                        onClick={() => setTypePanelOpen((o) => !o)}
                        aria-expanded={typePanelOpen}
                        className="hover:underline"
                        style={{ ...monoLabel(9), color: ACCENT_DEEP, background: 'transparent', padding: '6px 0' }}
                      >
                        {typePanelOpen ? 'Done' : 'Something else'}
                      </button>
                    </div>
                    {typePanelOpen && (
                      <div style={{ marginTop: '9px', border: '1px solid rgba(59,43,29,0.22)', padding: '10px 12px' }}>
                        <div className="flex flex-wrap" style={{ gap: '6px' }}>
                          {WARDROBE_CATEGORIES.map((c) => (
                            <PillToggle key={c.id} label={c.label} active={draft.category === c.id} onClick={() => patch({ category: c.id, slot: null })} />
                          ))}
                        </div>
                        <select
                          value={draft.slot || ''}
                          onChange={(e) => patch({ slot: e.target.value || null })}
                          className="focus:outline-none focus:border-[var(--color-accent,#a8712c)]"
                          style={{ ...hairlineControl, maxWidth: '340px', width: '100%', marginTop: '9px' }}
                          aria-label="Piece type"
                        >
                          <option value="">Other / not specified</option>
                          {slots.map((s) => (
                            <option key={s.id} value={s.id}>{s.label}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </FieldRow>

                  {/* 4 — MAKER: the one field Beau cannot see in the photo,
                      with explicit permission to skip. */}
                  <FieldRow label="Maker">
                    <div style={{ maxWidth: '340px' }}>
                      <BrandField
                        value={draft.brand}
                        onChange={(b) => patch({ brand: b })}
                        placeholder={draft.brandFromPhoto ? 'Read off the photo — correct it if wrong' : 'No label in the photo — who made it?'}
                        inputClassName="w-full bg-transparent border border-[rgba(59,43,29,0.34)] px-3 py-[9px] text-[14px] uppercase placeholder:normal-case placeholder:text-[#856c51] focus:outline-none focus:border-[var(--color-accent,#a8712c)]"
                        ariaLabel="Maker — who made it?"
                      />
                    </div>
                    <div style={{ marginTop: '5px', fontFamily: BODY, fontSize: '12.5px', color: MUTED }}>
                      Leave it blank if you’d rather not say. It only changes which makers he puts up.
                    </div>
                  </FieldRow>

                  {/* 5 — PATTERN. */}
                  <FieldRow label="Pattern">
                    <div className="flex flex-wrap" style={{ gap: '6px' }} role="group" aria-label="Pattern">
                      {PATTERN_OPTIONS.map((o) => (
                        <PillToggle key={o.id} label={o.label} active={draft.pattern === o.id} onClick={() => patch({ pattern: draft.pattern === o.id ? '' : o.id })} />
                      ))}
                    </div>
                  </FieldRow>

                  {/* 6 — SIZE: the structured type-first picker. */}
                  <FieldRow label="Size">
                    <div className="grid grid-cols-2" style={{ gap: '7px', maxWidth: '340px' }}>
                      <select
                        value={sizeTypeId}
                        onChange={(e) => {
                          const nextType = e.target.value;
                          setSizeTypeId(nextType);
                          if (!nextType) patch({ size: '' });
                        }}
                        className="focus:outline-none focus:border-[var(--color-accent,#a8712c)]"
                        style={hairlineControl}
                        aria-label="Size — sizing type"
                      >
                        <option value="">Size type…</option>
                        {SIZE_TYPES.map((s) => (
                          <option key={s.id} value={s.id}>{s.label}</option>
                        ))}
                      </select>
                      <select
                        value={parsedSize && parsedSize.typeId === sizeTypeId ? parsedSize.value : ''}
                        onChange={(e) => patch({ size: e.target.value ? composeSize(sizeTypeId, e.target.value) : '' })}
                        disabled={!sizeType}
                        className="focus:outline-none focus:border-[var(--color-accent,#a8712c)] disabled:opacity-50"
                        style={hairlineControl}
                        aria-label="Size — value"
                      >
                        <option value="">{sizeType ? 'Pick a size…' : 'Pick a type first'}</option>
                        {(sizeType?.values || []).map((v) => (
                          <option key={v} value={v}>{composeSize(sizeTypeId, v)}</option>
                        ))}
                      </select>
                    </div>
                    {draft.size.trim() && !parsedSize && (
                      <div style={{ marginTop: '5px', fontFamily: BODY, fontSize: '12.5px', color: MUTED }}>
                        Currently “{draft.size.trim()}” — pick a type and value above to replace it.
                      </div>
                    )}
                  </FieldRow>

                  {/* 7 — SEASON. */}
                  <FieldRow label="Season">
                    <div className="flex flex-wrap" style={{ gap: '6px' }} role="group" aria-label="Season">
                      {SEASON_OPTIONS.map((o) => (
                        <PillToggle
                          key={o.id}
                          label={o.label}
                          active={draft.seasons.includes(o.id)}
                          onClick={() => patch({ seasons: draft.seasons.includes(o.id) ? draft.seasons.filter((s) => s !== o.id) : [...draft.seasons, o.id] })}
                        />
                      ))}
                    </div>
                  </FieldRow>

                  {/* 8 — OCCASION. */}
                  <FieldRow label="Occasion">
                    <div className="flex flex-wrap" style={{ gap: '6px' }} role="group" aria-label="Occasion">
                      {OCCASION_TAGS.map((o) => (
                        <PillToggle
                          key={o.id}
                          label={o.label}
                          active={draft.occasions.includes(o.id)}
                          onClick={() => patch({ occasions: draft.occasions.includes(o.id) ? draft.occasions.filter((s) => s !== o.id) : [...draft.occasions, o.id] })}
                        />
                      ))}
                    </div>
                  </FieldRow>

                  {/* Notes — optional, after the eight. */}
                  <FieldRow label="Notes">
                    <textarea
                      value={draft.description}
                      onChange={(e) => patch({ description: e.target.value })}
                      placeholder="e.g. bought in Pamplona · collar wears at the fold · runs slim"
                      rows={2}
                      className="w-full resize-none focus:outline-none focus:border-[var(--color-accent,#a8712c)] placeholder:text-[#a68e70]"
                      style={{ ...hairlineControl }}
                      aria-label="Anything worth noting about this piece"
                    />
                  </FieldRow>
                </div>
              </div>

              {/* Save it · Save and add another · Discard — appears in The
                  Ledger immediately. */}
              <div className="flex items-center flex-wrap" style={{ marginTop: '14px', gap: '18px' }}>
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={!draft.name.trim() || saving}
                  className="inline-flex items-center gap-1.5 hover:bg-[var(--color-accent-100,#fbf1de)] transition-colors disabled:opacity-40"
                  style={{ padding: '11px 24px', border: `1px solid ${ACCENT}`, color: ACCENT_DEEP, fontFamily: SERIF, fontSize: '16px', whiteSpace: 'nowrap', background: 'transparent' }}
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save it
                </button>
                <button
                  type="button"
                  onClick={() => void save(true)}
                  disabled={!draft.name.trim() || saving}
                  className="inline-flex items-center transition-colors hover:border-[var(--space-border-strong)] disabled:opacity-40"
                  style={{ padding: '11px 20px', border: '1px solid rgba(59,43,29,0.3)', color: SECONDARY, fontFamily: SERIF, fontSize: '16px', whiteSpace: 'nowrap', background: 'transparent' }}
                  title="Save this piece and photograph the next one straight away"
                >
                  Save and add another
                </button>
                <button
                  type="button"
                  onClick={reset}
                  className="hover:underline"
                  style={{ ...monoLabel(9.5), color: MUTED, background: 'transparent' }}
                >
                  Discard
                </button>
                <span className="ml-auto hidden sm:inline" style={{ ...monoLabel(9), color: MUTED }}>
                  Appears in The Ledger immediately
                </span>
              </div>

              {error && <p className={`${typography.size.xs} text-[var(--space-semantic-warning)]`} style={{ marginTop: '8px' }}>{error}</p>}

              {/* The duplicate check — its own hairline bar (23a). */}
              {duplicateOf && !dupeDismissed && (
                <div
                  className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] items-center"
                  style={{ marginTop: '16px', padding: '13px 16px', border: '1px solid rgba(59,43,29,0.3)', gap: '10px 20px' }}
                >
                  <div style={{ fontFamily: BODY, fontSize: '13.5px', lineHeight: 1.5, color: INK }}>
                    This looks like <em>{duplicateOf.name}</em>
                    {duplicateMonth ? `, logged in ${duplicateMonth}` : ', already logged'} — same piece?
                  </div>
                  <div className="flex flex-wrap" style={{ gap: '10px' }}>
                    <button
                      type="button"
                      onClick={reset}
                      className="hover:opacity-80 transition-opacity"
                      style={{ ...pillOutline }}
                    >
                      Yes — keep that one
                    </button>
                    <button
                      type="button"
                      onClick={() => setDupeDismissed(true)}
                      className="hover:opacity-80 transition-opacity"
                      style={{ ...pillOutline }}
                    >
                      No, it’s different
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      )}

      {/* NO capture attribute: with accept="image/*" alone, iOS shows its
          standard sheet (Take Photo / Photo Library / Browse) and desktop
          opens the file picker. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={(e) => void onPicked(e)}
        className="hidden"
        aria-label="Take a photo or upload one from your library"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// "Add a piece" — the whole surface: header + the two DIRECT action buttons,
// the flows beneath, and the five-piece counter. Used verbatim on the
// Wardrobe screen, The Rail tab, and (via AddPieceHub) category views.
// ---------------------------------------------------------------------------

function ActionButton({
  label,
  primary = false,
  onClick,
}: {
  label: string;
  /** The lead action draws walnut-filled; the second reads as an outline.
   * Both are plain, always-live actions — never a toggle or a tab. */
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="transition-colors"
      style={{
        fontFamily: SERIF,
        fontSize: '16px',
        fontWeight: 400,
        lineHeight: 1,
        padding: '13px 26px',
        whiteSpace: 'nowrap',
        ...(primary
          ? { background: WALNUT, color: PAPER, border: `1px solid ${WALNUT}` }
          : { background: 'transparent', color: INK, border: '1px solid rgba(59,43,29,0.3)' }),
      }}
    >
      {label}
    </button>
  );
}

export function AddPieceSection({
  pieces,
  onAdded,
  categoryId,
}: {
  pieces: WardrobePiece[];
  onAdded: () => void;
  /** Category views pass their id so the photo flow files unplaced pieces there. */
  categoryId?: string;
}) {
  usePlexMono();
  // NO MODE, NO TOGGLE: both buttons are live at the same time.
  // [ Photograph ] opens the picker DIRECTLY — the flow stays mounted so
  // this call lands synchronously in the tap. [ Search ] opens the search
  // input focused and ready to type into. Neither hides the other.
  const openPhotoPicker = useRef<(() => void) | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  // The token bump tells the search flow to focus as it appears.
  const [searchFocusToken, setSearchFocusToken] = useState(0);
  // The Index's "Log one I own" / "Add to the Ledger" (ethaion:add-piece)
  // carries the type name: open the Search flow seeded with it. App.tsx
  // switches to The Ledger on the same event; this surface stays mounted,
  // so both land.
  const [searchSeed, setSearchSeed] = useState('');
  const sectionRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const onAddPiece = (e: Event) => {
      const name = String((e as CustomEvent).detail?.name || '').trim();
      if (name) setSearchSeed(name);
      setSearchOpen(true);
      setSearchFocusToken((t) => t + 1);
      window.setTimeout(() => sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    };
    window.addEventListener('ethaion:add-piece', onAddPiece);
    return () => window.removeEventListener('ethaion:add-piece', onAddPiece);
  }, []);
  const logged = pieces.length;
  const remaining = 5 - logged;

  const onPhotograph = () => {
    // Synchronous within the tap — the browser treats it as user-initiated.
    openPhotoPicker.current?.();
  };
  const onSearch = () => {
    setSearchOpen(true);
    setSearchFocusToken((t) => t + 1);
  };

  return (
    <section ref={sectionRef} aria-label="Add a piece">
      {/* The header — title + brief left, the two DIRECT action buttons
          right, closed by a walnut hairline. Tapping either one starts the
          action itself: no tabs, no sub-boxes, no second click. */}
      <div
        className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-5 md:gap-10 md:items-end"
        style={{ paddingBottom: '20px', borderBottom: '1px solid var(--color-text,#3b2b1d)' }}
      >
        <div>
          <h3 style={{ margin: 0, fontFamily: SERIF, fontSize: 'clamp(32px, 4.5vw, 42px)', fontWeight: 400, lineHeight: 1.08, letterSpacing: '-0.012em', color: WALNUT }}>
            Add a piece
          </h3>
          <p style={{ margin: '11px 0 0', maxWidth: '70ch', fontFamily: BODY, fontSize: '15.5px', lineHeight: 1.58, color: INK }}>
            Photograph it and Beau reads it — or search for it by name or link. Either button starts straight away;
            the card opens with every field visible, and nothing you have corrected is overwritten.
          </p>
        </div>
        <div className="flex gap-3" role="group" aria-label="How to add a piece">
          <ActionButton label="Photograph" primary onClick={onPhotograph} />
          <ActionButton label="Search" onClick={onSearch} />
        </div>
      </div>

      {/* BOTH ways in coexist — no switch between them. The photograph flow
          renders nothing until a photo is actually chosen (the picker is the
          entry); the search flow appears when [ Search ] is tapped. */}
      <PhotoConfirmFlow pieces={pieces} onAdded={onAdded} categoryId={categoryId} openPickerRef={openPhotoPicker} />
      {searchOpen && (
        <div style={{ marginTop: '28px' }}>
          <SearchPieceFlow pieces={pieces} onAdded={onAdded} focusToken={searchFocusToken} initialQuery={searchSeed} />
        </div>
      )}

      {/* THE COUNTER STOPS AT FIVE (23a): visible from the first piece,
          named for the one real threshold, gone at five and never back. */}
      {logged > 0 && logged < 5 && (
        <div
          className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_320px] gap-7 md:gap-[44px] md:items-center"
          style={{ marginTop: '38px', paddingTop: '20px', borderTop: '1px solid rgba(59,43,29,0.18)' }}
        >
          <div>
            <div className="flex items-baseline flex-wrap" style={{ gap: '14px' }}>
              <span style={{ fontFamily: SERIF, fontSize: '20px', color: WALNUT }}>
                {capWord(numberWord(logged))} logged
              </span>
              <span style={{ ...monoLabel(9), color: ACCENT_DEEP }}>
                {remaining === 1 ? 'One more' : `${capWord(numberWord(remaining))} more`} and the map turns on
              </span>
            </div>
            <div style={{ marginTop: '10px', height: '3px', background: 'rgba(59,43,29,0.16)' }}>
              <div style={{ width: `${(logged / 5) * 100}%`, height: '3px', background: ACCENT }} />
            </div>
            <p style={{ margin: '10px 0 0', maxWidth: '74ch', fontFamily: BODY, fontSize: '13px', lineHeight: 1.55, color: SECONDARY }}>
              The only counter in the flow, and it exists because five is the threshold where The Edit can say
              something honest. It is not a completion score — it disappears at five and never returns.
            </p>
          </div>
          <div style={{ borderLeft: '1px solid rgba(59,43,29,0.18)', paddingLeft: '24px' }}>
            <div style={{ ...monoLabel(9), color: FAINT }}>The other way in</div>
            <div style={{ marginTop: '7px', fontFamily: BODY, fontSize: '13.5px', lineHeight: 1.55, color: INK }}>
              The <em>Search</em> button takes a name or a product link and finds the maker’s own photography — for
              pieces you own but can’t easily photograph.
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * The category-view add area — the SAME surface as the Wardrobe screen
 * and The Rail, pointed at one category.
 */
export function AddPieceHub({
  pieces = [],
  onAdded,
  categoryId,
}: {
  pieces?: WardrobePiece[];
  onAdded: () => void;
  categoryId?: string;
}) {
  return <AddPieceSection pieces={pieces} onAdded={onAdded} categoryId={categoryId} />;
}
