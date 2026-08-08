/**
 * Unified wardrobe logging (Pass Twelve, rebuilt in Pass Fourteen; photo
 * REQUIRED since Pass Thirty-Three; photo-ONLY since Pass Forty-Four — no
 * text entry, no pile scan, no list import) — ONE photograph-led flow
 * feeding wardrobe_pieces:
 *
 *  - Photograph (REQUIRED): the tap-to-confirm flow. Take or upload a photo,
 *    Beau pre-fills Category, Colour(s), Pattern, Material and Item Type from
 *    it, and the user taps to confirm or correct each field from structured
 *    selectors — never a blank form. The name is machine-generated from the
 *    confirmed fields ([Colour] [Material] [Item Type]); brand gets ONE
 *    targeted “Which brand is this?” prompt only when it isn't visible in the
 *    photo. Photo shows instantly (local preview), uploads in the background
 *    and is kept as the piece's permanent anchor; client-side background
 *    removal swaps the canonical white-card version in silently when it lands.
 *
 * Pass Forty-Eight (speed + photo fix):
 *  - The photo is COMPRESSED client-side (max 1200px, JPEG 0.85) before
 *    anything touches the network — sub-second uploads on every device.
 *  - The confirmation card appears the MOMENT a photo is chosen; the upload
 *    and Beau's AI read run behind it and the fields fill in as they land —
 *    fields the user has already corrected are never overwritten. Save works
 *    immediately with the original image; Photoroom runs after save.
 *  - The Photograph tab no longer auto-fires the picker and the file input
 *    carries NO capture attribute: the tab shows a camera icon, a “Take
 *    Photo or Upload from Library” descriptor and a “Choose Photo” button —
 *    tapping THAT opens the standard system sheet (Take Photo / Photo
 *    Library / Browse on iOS; the file picker on desktop).
 *
 * The text-only quick add and the manual detailed form were retired in Pass
 * Thirty-Three — logging an owned piece now requires a photo of the garment.
 * Editing and deleting already-logged pieces is unchanged.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Check, Loader2, RotateCcw, Sparkles, X } from 'lucide-react';
import { tw, typography } from '../../lib/colors';
import { SearchPieceFlow } from './search-piece';
import {
  OCCASION_TAGS,
  SEASON_OPTIONS,
  WARDROBE_CATEGORIES,
  categoryById,
  defaultOccasions,
  defaultSeasons,
  findLikelyDuplicate,
  generatePieceName,
  insertPieces,
  type NewPiece,
  type WardrobePiece,
} from './profile-data';
import { BrandField, ColorSelector, MaterialSelector, PatternSelector, SizeSelector } from './input-fields';
import { CanonicalGarment } from './canonical-garment';
import { queueWardrobeReassessment } from './reassess-queue';
import { identifyGarmentFromUrl } from './wardrobe-ai';
import { attachPreparedProductPhoto, compressImage, prepareProductPhoto, uploadGarmentPhotoFast } from './photo-enhance';

// ---------------------------------------------------------------------------
// Photo tap-to-confirm flow (Track C) — the photo drives the form, the user
// only confirms or corrects. The blank form never appears.
// ---------------------------------------------------------------------------

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
}

export function PhotoConfirmFlow({
  pieces,
  onAdded,
  categoryId,
}: {
  pieces: WardrobePiece[];
  onAdded: () => void;
  categoryId?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [draft, setDraft] = useState<ConfirmDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dupeDismissed, setDupeDismissed] = useState(false);
  // The uploaded photo URL — kept in a ref because the background clean-up
  // can swap it while the user is still confirming fields.
  const photoUrlRef = useRef<string>('');
  // The in-flight background upload — Save awaits it briefly when the user
  // is faster than the (compressed, sub-second) upload.
  const uploadRef = useRef<Promise<string> | null>(null);
  // Stale-merge guard: a Discard/new pick invalidates in-flight AI merges.
  const pickSeqRef = useRef(0);

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
  });

  // Pass Forty-Eight: the confirmation card appears the MOMENT the photo is
  // chosen — compression is instant, and the upload + Beau's AI read run
  // BEHIND the open card, filling fields in as they land. Nothing blocks the
  // form, and nothing blocks Save.
  const onPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (inputRef.current) inputRef.current.value = '';
    if (!file) return;
    const seq = ++pickSeqRef.current;
    setError(null);
    setSavedFlash(null);
    setDupeDismissed(false);
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
      if (seq === pickSeqRef.current) photoUrlRef.current = url;
      return url;
    });
    uploadRef.current = upload.catch(() => '');

    // 4. Beau's AI read — merged into the open card when it lands, but NEVER
    //    over a field the user has already corrected. When Beau can't read
    //    the garment (AI error, timeout, malformed JSON) the blank form
    //    simply stays — no crash, no error message (Pass Twenty-Eight rule).
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
      console.warn('[Ethaion] photo read failed — the blank form stays:', err);
    } finally {
      if (seq === pickSeqRef.current) setAnalysing(false);
    }
  };

  // The machine-generated name follows the confirmed fields until overridden.
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

  const reset = () => {
    pickSeqRef.current += 1; // invalidate any in-flight AI merge
    setDraft(null);
    setLocalPreview(null);
    setError(null);
    setDupeDismissed(false);
    setAnalysing(false);
    photoUrlRef.current = '';
    uploadRef.current = null;
  };

  const save = async () => {
    if (!draft || !draft.name.trim() || saving) return;
    setSaving(true);
    setError(null);
    // Auto-uppercase on save (Pass Forty-Six) — free-typed fields only.
    const finalName = draft.name.trim().toUpperCase();
    const finalBrand = draft.brand.trim().toUpperCase();
    let fastUrl = photoUrlRef.current;
    // Keep the upload promise even if the four-second optimistic race loses;
    // the inserted row can still receive and clean the image when it lands.
    const pendingUpload = uploadRef.current;
    // Optimistic UI (Pass Forty-Six): the new piece appears in the wardrobe
    // immediately, faint, while the write is in flight.
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
      }
      window.dispatchEvent(new CustomEvent('ethaion:piece-add-settled', { detail: { tempId } }));
      // The write has landed — that is the whole of what the user waited on.
      // Beau's re-read of the wardrobe is a SEPARATE operation: queued here,
      // never awaited, and reported by its own status while it runs
      // (reassess-queue.ts). The Save button returns at once.
      queueWardrobeReassessment('piece logged');
      setSavedFlash(finalName);
      reset();
      onAdded();
      window.setTimeout(() => setSavedFlash(null), 3000);
    } catch (err) {
      // Failed save: remove the optimistic row and surface an inline error —
      // the draft stays so one more tap retries.
      console.error('[Ethaion] photo-flow save failed:', err);
      window.dispatchEvent(new CustomEvent('ethaion:piece-add-failed', { detail: { tempId } }));
      setError('That didn\u2019t save — check your connection and tap Save again.');
    } finally {
      setSaving(false);
    }
  };

  const labelCls = `${typography.size.xs} ${typography.color.muted}`;
  const slots = draft ? categoryById(draft.category)?.slots || [] : [];
  const chip = (active: boolean) =>
    `px-2 py-1 rounded-full border transition-colors ${typography.size.xs} ${
      active
        ? 'bg-[var(--space-surface-accent-soft)] text-[var(--space-brand-primary-700)] border-[var(--space-brand-primary)]'
        : 'border-[var(--space-border-default)] text-[var(--space-text-secondary)] hover:border-[var(--space-border-strong)]'
    }`;

  return (
    // The "Photograph a piece" PANEL (HTML reference): --paper ground, square
    // corners, heading + one-line brief left, the accent-ruled "Best results"
    // aside right.
    <div className="bg-[var(--color-paper,#fbf8f1)] border border-[var(--color-divider,rgba(59,43,29,0.18))]" style={{ padding: '30px 32px 32px' }}>
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_300px] items-start gap-6 md:gap-[52px]">
        <div>
          {/* No "Photograph a piece" header — the Photograph pill the user
              just tapped already communicates the context. */}
          <p className={typography.color.primary} style={{ fontFamily: 'var(--space-font-family)', fontSize: '15px', lineHeight: 1.6, maxWidth: '58ch' }}>
            Snap it — Beau pre-fills the card. Your photo is the anchor: the background is stripped and the real
            garment sits on a clean card — same photo, just cleaned up — in one consistent crop.
          </p>
        </div>
        <p
          className="text-[var(--color-neutral-800,#453325)]"
          style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px', lineHeight: 1.6, paddingLeft: '18px', borderLeft: '2px solid var(--color-accent,#a8712c)' }}
        >
          <em
            className="block uppercase not-italic text-[var(--color-accent-700,#7c4a17)]"
            style={{ fontFamily: 'var(--space-font-heading)', fontSize: '11px', letterSpacing: '0.12em', marginBottom: '5px' }}
          >
            Best results
          </em>
          One piece at a time, laid flat on a clean surface, daylight if you have it.
        </p>
      </div>

      {savedFlash && (
        <p className={`${typography.size.xs} text-[var(--space-semantic-success)] mt-2`}>
          “{savedFlash}” logged — in The Ledger, under Your pieces. Cleaning up your photo…
        </p>
      )}

      {/* The Photograph interface (Pass Forty-Eight): a camera icon, the
          “Take Photo or Upload from Library” descriptor (Lora 14px), and the
          tappable “Choose Photo” button. NOTHING fires until the user taps
          the button — then iOS shows its standard sheet (Take Photo / Photo
          Library / Browse) and desktop opens the file picker. */}
      {!draft && (
        <div className="mt-5 flex items-center gap-4 flex-wrap">
          <span className="inline-flex items-center gap-2.5">
            <Camera className="w-5 h-5 text-[var(--color-accent-700,#7c4a17)]" aria-hidden="true" />
            <span
              className="text-[var(--color-neutral-700,#634e38)]"
              style={{ fontFamily: 'var(--space-font-family)', fontSize: '14px', lineHeight: 1.5 }}
            >
              Take a photo or upload from your library
            </span>
          </span>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="px-4 min-h-[44px] rounded text-[15px] inline-flex items-center gap-1.5 bg-transparent border border-[var(--color-accent,#a8712c)] text-[var(--color-accent-700,#7c4a17)] hover:bg-[var(--color-accent-100,#fbf1de)] transition-colors"
          >
            Choose photo
          </button>
        </div>
      )}

      {error && <p className={`${typography.size.xs} text-[var(--space-semantic-warning)] mt-2`}>{error}</p>}

      {draft && (
        <div className="mt-3">
          {/* The pre-filled confirmation card — tap to confirm or correct */}
          <div className="rounded-xl border border-[var(--space-border-default)] bg-[var(--space-surface-card)] p-3">
            <div className="flex items-start gap-3">
              <CanonicalGarment
                fields={{ name: draft.name, category: draft.category, slot: draft.slot, colors: draft.colors, pattern: draft.pattern, brand: draft.brand }}
                photoUrl={localPreview}
                title={draft.name || 'Garment preview'}
                showConfirmation
                showOriginal
                className="w-20 aspect-[3/4] rounded-xl border border-[var(--space-border-default)] flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                {analysing ? (
                  <p className={`${typography.size.xs} ${typography.color.secondary}`}>
                    <Loader2 className="w-3 h-3 inline mr-1 -mt-0.5 animate-spin text-[var(--space-text-brand)]" />
                    Beau is reading your garment — the details fill in as he goes. Correct anything, any time.
                  </p>
                ) : (
                  <p className={`${typography.size.xs} ${typography.color.secondary}`}>
                    <Sparkles className="w-3 h-3 inline mr-1 -mt-0.5 text-[var(--space-text-brand)]" />
                    Here’s how Beau read it — tap anything to correct it.
                  </p>
                )}
                <input
                  value={draft.name}
                  onChange={(e) => patch({ name: e.target.value, nameIsCustom: e.target.value.trim().toUpperCase() !== autoName.trim().toUpperCase() })}
                  onBlur={() => patch({ name: draft.name.toUpperCase() })}
                  placeholder="Name"
                  className={`${tw.input.base} ${tw.input.default} ${typography.size.sm} ${typography.weight.semibold} mt-1.5`}
                  aria-label="Piece name"
                />
                <span className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className={labelCls} style={{ fontSize: '10px' }}>
                    {draft.nameIsCustom ? 'Your own name — kept as typed.' : 'Auto-named from the confirmed fields.'}
                  </span>
                  {draft.nameIsCustom && autoName && (
                    <button
                      type="button"
                      onClick={() => patch({ name: autoName, nameIsCustom: false })}
                      className={`inline-flex items-center gap-1 ${typography.color.brand} hover:underline`}
                      style={{ fontSize: '10px' }}
                    >
                      <RotateCcw className="w-2.5 h-2.5" /> Use “{autoName}”
                    </button>
                  )}
                </span>
              </div>
            </div>

            <div className="mt-3 space-y-2.5">
              <div>
                <p className={`${labelCls} mb-1`}>Category</p>
                <div className="flex flex-wrap gap-1">
                  {WARDROBE_CATEGORIES.map((c) => (
                    <button key={c.id} type="button" onClick={() => patch({ category: c.id, slot: null })} className={chip(draft.category === c.id)} style={{ fontSize: '10px' }}>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-2.5">
                <label className={labelCls}>Item type
                  <select
                    value={draft.slot || ''}
                    onChange={(e) => patch({ slot: e.target.value || null })}
                    className={`${tw.input.base} ${tw.input.default} ${typography.size.sm} mt-1`}
                  >
                    <option value="">Other / not specified</option>
                    {slots.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                </label>
                <label className={labelCls}>Material
                  <div className="mt-1">
                    <MaterialSelector value={draft.material} onChange={(m) => patch({ material: m })} ariaLabel="Material" />
                  </div>
                </label>
              </div>
              <div>
                <p className={`${labelCls} mb-1`}>Colour(s) — up to 3, first is primary</p>
                <ColorSelector value={draft.colors} onChange={(c) => patch({ colors: c })} ariaLabel="Colours" />
              </div>
              <div>
                <p className={`${labelCls} mb-1`}>Pattern</p>
                <PatternSelector value={draft.pattern} onChange={(p) => patch({ pattern: p })} ariaLabel="Pattern" />
              </div>

              {/* Brand — ONE targeted prompt only when it isn't in the photo */}
              {draft.brandFromPhoto ? (
                <label className={labelCls}>Brand — read off the photo, correct it if wrong
                  <div className="mt-1">
                    <BrandField value={draft.brand} onChange={(b) => patch({ brand: b })} ariaLabel="Brand" />
                  </div>
                </label>
              ) : (
                <div className="rounded-lg bg-[var(--space-surface-accent-soft)] px-2.5 py-2">
                  <p className={`${typography.size.xs} ${typography.color.primary} ${typography.weight.medium}`}>
                    Which brand is this?
                  </p>
                  <p className={labelCls} style={{ fontSize: '10px' }}>
                    Couldn’t see a label in the photo — leave it blank if you’d rather not say.
                  </p>
                  <div className="mt-1.5">
                    <BrandField value={draft.brand} onChange={(b) => patch({ brand: b })} ariaLabel="Which brand is this?" />
                  </div>
                </div>
              )}

              <label className={labelCls}>Size (optional)
                <div className="mt-1">
                  <SizeSelector value={draft.size} onChange={(s) => patch({ size: s })} ariaLabel="Size" />
                </div>
              </label>

              <div className="flex flex-wrap gap-3">
                <div>
                  <p className={`${labelCls} mb-1`}>Season</p>
                  <div className="flex flex-wrap gap-1">
                    {SEASON_OPTIONS.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => patch({ seasons: draft.seasons.includes(o.id) ? draft.seasons.filter((s) => s !== o.id) : [...draft.seasons, o.id] })}
                        className={chip(draft.seasons.includes(o.id))}
                        style={{ fontSize: '10px' }}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className={`${labelCls} mb-1`}>Occasion</p>
                  <div className="flex flex-wrap gap-1">
                    {OCCASION_TAGS.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => patch({ occasions: draft.occasions.includes(o.id) ? draft.occasions.filter((s) => s !== o.id) : [...draft.occasions, o.id] })}
                        className={chip(draft.occasions.includes(o.id))}
                        style={{ fontSize: '10px' }}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {duplicateOf && !dupeDismissed && (
                <div className="rounded-lg bg-[var(--space-surface-accent-soft)] px-2.5 py-2">
                  <p className={`${typography.size.xs} ${typography.color.secondary}`}>
                    This looks like “{duplicateOf.name}”, already logged — same piece?
                  </p>
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <button type="button" onClick={reset} className={`px-2 py-1 rounded-lg ${typography.size.xs} ${tw.button.secondary}`}>
                      Yes — keep the existing one
                    </button>
                    <button type="button" onClick={() => setDupeDismissed(true)} className={`px-2 py-1 rounded-lg ${typography.size.xs} ${tw.button.ghost} border border-[var(--space-border-default)]`}>
                      No — it’s different
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* One final Save tap */}
          <div className="flex items-center gap-2 mt-3">
            <button
              type="button"
              onClick={() => void save()}
              disabled={!draft.name.trim() || saving}
              className={`px-4 py-2 rounded-lg ${typography.size.sm} inline-flex items-center gap-1.5 ${tw.button.primary} disabled:opacity-40`}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Save to my wardrobe
            </button>
            <button
              type="button"
              onClick={reset}
              className={`px-3 py-2 rounded-lg ${typography.size.xs} ${tw.button.ghost} border border-[var(--space-border-default)] inline-flex items-center gap-1`}
            >
              <X className="w-3.5 h-3.5" /> Discard
            </button>
          </div>
        </div>
      )}

      {/* NO capture attribute (Pass Forty-Eight): capture="environment" was
          auto-launching the camera AND locking out the photo library. With
          accept="image/*" alone, iOS shows its standard sheet (Take Photo /
          Photo Library / Browse) and desktop opens the file picker. */}
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
// The hub — ONE entry point, photo REQUIRED (Pass Thirty-Three). Every owned
// piece is logged from a photograph: Beau reads the garment, pre-fills the
// details, and the user confirms or corrects before saving. The text-only
// quick add and the manual detailed form are retired.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// "Add a piece" two-pill tab switcher (Pass Forty-Seven) — replaces the Pass
// Forty-Six grouped header + indented sub-rows EVERYWHERE pieces can be
// added: the Wardrobe screen, The Rail tab, and each category view. Two
// pills side by side, no "Add a piece" header above (the pills are
// self-explanatory):
//   · active pill — walnut fill #241a12, Cormorant 16px white label
//   · inactive pill — no fill, 1px divider hairline, Cormorant 16px ink
//   · 4px radius (the sanctioned pill/button radius)
// Pass Forty-Eight: the Photograph tab shows its INTERFACE (camera icon +
// descriptor + "Choose Photo" button) — the picker fires only when the user
// taps "Choose Photo", never on the tab click itself. Search shows the
// search/URL input immediately. Tapping the active pill again collapses it.
// ---------------------------------------------------------------------------

function AddPiecePill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="transition-colors"
      style={{
        fontFamily: 'var(--space-font-heading)',
        fontSize: '16px',
        fontWeight: 400,
        lineHeight: 1,
        borderRadius: '4px',
        padding: '13px 26px',
        minHeight: '44px',
        ...(active
          ? { background: '#241a12', color: '#ffffff', border: '1px solid #241a12' }
          : {
              background: 'transparent',
              color: 'var(--color-text,#3b2b1d)',
              border: '1px solid var(--color-divider,rgba(59,43,29,0.18))',
            }),
      }}
    >
      {label}
    </button>
  );
}

/**
 * The "Add a piece" tab switcher — [ Photograph ] [ Search ] pills with the
 * selected flow unfolding beneath. Used verbatim on the Wardrobe screen,
 * The Rail tab, and (via AddPieceHub) every category view.
 */
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
  const [mode, setMode] = useState<'photograph' | 'search' | null>(null);
  return (
    <section aria-label="Add a piece">
      {/* The two pills — no section header above them */}
      <div className="flex items-center gap-3 flex-wrap" role="tablist" aria-label="How to add a piece">
        <AddPiecePill
          label="Photograph"
          active={mode === 'photograph'}
          onClick={() => setMode((m) => (m === 'photograph' ? null : 'photograph'))}
        />
        <AddPiecePill
          label="Search"
          active={mode === 'search'}
          onClick={() => setMode((m) => (m === 'search' ? null : 'search'))}
        />
      </div>

      {/* Photograph — shows its interface; the user taps "Choose Photo" and
          only THEN does the system picker fire (Pass Forty-Eight). */}
      {mode === 'photograph' && (
        <div className="pt-5">
          <PhotoConfirmFlow pieces={pieces} onAdded={onAdded} categoryId={categoryId} />
        </div>
      )}

      {/* Search — the input shows immediately below the pills */}
      {mode === 'search' && (
        <div className="pt-5">
          <SearchPieceFlow pieces={pieces} onAdded={onAdded} />
        </div>
      )}
    </section>
  );
}

/**
 * The category-view add area (Pass Forty-Seven) — the SAME two-pill tab
 * switcher as the Wardrobe screen and The Rail: Photograph shows its
 * interface (the picker fires on "Choose Photo", never automatically),
 * Search shows the keyword/URL input. No "Add a piece" header row — the
 * pills are self-explanatory.
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
