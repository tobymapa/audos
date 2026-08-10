/**
 * ADD A PIECE — rebuilt to the corrected design handoff, screen 23a
 * ("Adding a piece · read from the code, not the screenshots"). ONE
 * photograph-led flow feeding wardrobe_pieces:
 *
 *  · The HEADER row: "Add a piece" (Cormorant 42px) + the one-line brief,
 *    with the [ Photograph ] [ Search ] pills at the right edge, all closed
 *    by a walnut hairline.
 *  · The PHOTO column (300px): the photo on an #e6d9c4 mat — a dashed
 *    "browse files" placeholder until one is chosen — with the
 *    YOUR PHOTO · UPLOADED / RETAKE line and the accent-ruled best-results
 *    note beneath.
 *  · The CARD: opens the MOMENT a photo is chosen; the upload and Beau's
 *    read fill in behind it and nothing already corrected is overwritten.
 *    The read-back is a SENTENCE, not a form — "Beau reads it as a light
 *    blue cotton oxford button-down shirt", three underlined tappable
 *    phrases (colour · material · type), each correction opening inline.
 *    Only THREE fields surface prominently (type · colour · maker); the
 *    other five read as one line behind "Show all eight fields". Nothing
 *    left the data model — this only changes what surfaces here.
 *  · The MAKER is the one explicit question — the only field Beau cannot
 *    see in the photo — with explicit permission to skip.
 *  · SAVE IT · SAVE AND ADD ANOTHER · DISCARD, with "appears in The Ledger
 *    immediately" at the right; the duplicate check reads back as its own
 *    hairline bar beneath.
 *  · THE COUNTER STOPS AT FIVE: "Three logged — two more and the map turns
 *    on", a 3px progress rule, visible from the first piece and gone at
 *    five. A wardrobe is never a percentage.
 *
 * Mechanics preserved from the previous passes: client-side compression
 * (max 1200px, JPEG 0.85) before anything touches the network; the upload
 * and AI read run behind the open card and never overwrite a corrected
 * field; Save is optimistic and returns at once; Photoroom runs after save.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { Image as ImageIcon, Loader2 } from 'lucide-react';
import { tw, typography } from '../../lib/colors';
import { SearchPieceFlow } from './search-piece';
import {
  OCCASION_TAGS,
  PATTERN_OPTIONS,
  SEASON_OPTIONS,
  WARDROBE_CATEGORIES,
  categoryById,
  defaultOccasions,
  defaultSeasons,
  findLikelyDuplicate,
  formatColorName,
  generatePieceName,
  insertPieces,
  swatchFor,
  type NewPiece,
  type WardrobePiece,
} from './profile-data';
import { BrandField, ColorSelector, MaterialSelector, PatternSelector, SizeSelector } from './input-fields';
import { queueWardrobeReassessment } from './reassess-queue';
import { identifyGarmentFromUrl } from './wardrobe-ai';
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

/** The emphasised value inside the "he also filled in" line — regular
 * weight, walnut, exactly as the reference sets its <strong>. */
function V({ children }: { children: React.ReactNode }) {
  return <strong style={{ fontWeight: 400, color: WALNUT }}>{children}</strong>;
}

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

/** One tappable phrase of the read-back sentence (23a) — underlined with
 * the accent rule; tapping opens the inline correction beneath. */
function ReadbackPhrase({
  label,
  active,
  onTap,
  ariaLabel,
}: {
  label: string;
  active: boolean;
  onTap: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={ariaLabel}
      aria-expanded={active}
      className="hover:opacity-80 transition-opacity align-baseline"
      style={{
        fontFamily: BODY,
        fontSize: '14.5px',
        lineHeight: 1.55,
        color: active ? ACCENT_DEEP : INK,
        borderBottom: `1px solid ${ACCENT}`,
        background: 'transparent',
        padding: 0,
      }}
    >
      {label}
    </button>
  );
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
  // THE REST IS STATED, NOT SHOWN (23a): eight fields on the record, three
  // surfaced prominently (type · colour · maker); the other five read as one
  // line behind "Show all eight fields".
  const [showAll, setShowAll] = useState(false);
  // Which phrase of the read-back sentence is being corrected, if any.
  const [correcting, setCorrecting] = useState<'type' | 'colour' | 'material' | null>(null);
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
    setCorrecting(null);
    setShowAll(false);
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
    setShowAll(false);
    setCorrecting(null);
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

  const openPicker = () => inputRef.current?.click();

  const labelCls = `${typography.size.xs} ${typography.color.muted}`;
  const slots = draft ? categoryById(draft.category)?.slots || [] : [];
  const currentSlot = draft ? slots.find((s) => s.id === draft.slot) || null : null;
  // The type phrase of the read-back sentence — the slot's label first, the
  // category as the honest fallback, blank while Beau hasn't read one yet.
  const slotLabel = draft
    ? currentSlot?.label || (draft.category !== 'other' ? categoryById(draft.category)?.label || '' : '')
    : '';
  const chip = (active: boolean) =>
    `px-2 py-1 rounded-full border transition-colors ${typography.size.xs} ${
      active
        ? 'bg-[var(--space-surface-accent-soft)] text-[var(--space-brand-primary-700)] border-[var(--space-brand-primary)]'
        : 'border-[var(--space-border-default)] text-[var(--space-text-secondary)] hover:border-[var(--space-border-strong)]'
    }`;

  // The card title — named from the fields below (23a), sentence case.
  const cardName = draft
    ? (autoName || draft.name).trim()
      ? sentenceCase(autoName || draft.name)
      : analysing
        ? 'Reading your photo…'
        : 'Your new piece'
    : '';

  const seasonsText =
    draft && draft.seasons.length === 4
      ? 'all four seasons'
      : draft && draft.seasons.length > 0
        ? draft.seasons.length === 1
          ? 'one season'
          : `${numberWord(draft.seasons.length)} seasons`
        : 'the seasons';
  const occasionsText =
    draft && draft.occasions.length > 0
      ? draft.occasions
          .map((id) => OCCASION_TAGS.find((o) => o.id === id)?.label || id)
          .join(' · ')
          .toLowerCase()
      : 'the occasions';
  const patternText = draft && draft.pattern
    ? (PATTERN_OPTIONS.find((o) => o.id === draft.pattern)?.label || draft.pattern).toLowerCase()
    : 'the pattern';

  // The inline correction panel — one at a time, opening under its row.
  const correctionPanel = (content: React.ReactNode) => (
    <div style={{ gridColumn: '1 / -1' }}>
      <div style={{ border: '1px solid rgba(59,43,29,0.28)', padding: '10px 12px' }}>{content}</div>
    </div>
  );

  return (
    <div>
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
              ) : (
                <button
                  type="button"
                  onClick={openPicker}
                  className="w-full h-full flex flex-col items-center justify-center gap-2 transition-colors hover:opacity-90"
                  style={{ border: '1px dashed rgba(59,43,29,0.45)', background: 'transparent', padding: '16px' }}
                  aria-label="Take a photo or browse files"
                >
                  <ImageIcon className="w-5 h-5" style={{ color: MUTED }} aria-hidden="true" />
                  <span style={{ fontFamily: BODY, fontSize: '14px', lineHeight: 1.45, color: SECONDARY, textAlign: 'center' }}>
                    Your photo of the piece
                  </span>
                  <span style={{ fontFamily: BODY, fontSize: '12.5px', color: ACCENT_DEEP, textDecoration: 'underline', textUnderlineOffset: '2px' }}>
                    or browse files
                  </span>
                </button>
              )}
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
          {savedFlash && (
            <p className={`${typography.size.xs} text-[var(--space-semantic-success)]`} style={{ marginTop: '10px' }}>
              “{savedFlash}” logged — in The Ledger, under Your pieces. Cleaning up your photo…
            </p>
          )}
        </div>

        {/* ------------------------------------------------- the card column */}
        <div>
          {!draft ? (
            /* Before a photo: the card's ground, waiting — the flow never
               shows a blank form. */
            <div style={{ border: '1px dashed rgba(59,43,29,0.3)', padding: '22px 24px' }}>
              <span style={{ fontFamily: SERIF, fontSize: '26px', lineHeight: 1.1, color: FAINT }}>Beau’s card opens here</span>
              <p style={{ margin: '9px 0 0', maxWidth: '62ch', fontFamily: BODY, fontSize: '14.5px', lineHeight: 1.55, color: SECONDARY }}>
                Choose a photo on the left and the card opens the moment you do — the upload and his read fill in
                behind it, and nothing you have already corrected is overwritten.
              </p>
            </div>
          ) : (
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

                {/* THE READ-BACK IS A SENTENCE, NOT A FORM (23a). */}
                <p style={{ margin: '9px 0 0', maxWidth: '62ch', fontFamily: BODY, fontSize: '14.5px', lineHeight: 1.55, color: INK }}>
                  Beau reads it as a{' '}
                  <ReadbackPhrase
                    label={draft.colors.length > 0 ? draft.colors.map((c) => formatColorName(c)).join(' and ').toLowerCase() : 'colour — tap to set'}
                    active={correcting === 'colour'}
                    onTap={() => setCorrecting((c) => (c === 'colour' ? null : 'colour'))}
                    ariaLabel="Correct the colour"
                  />{' '}
                  <ReadbackPhrase
                    label={draft.material ? draft.material.toLowerCase() : 'material — tap to set'}
                    active={correcting === 'material'}
                    onTap={() => setCorrecting((c) => (c === 'material' ? null : 'material'))}
                    ariaLabel="Correct the material"
                  />{' '}
                  <ReadbackPhrase
                    label={slotLabel ? slotLabel.toLowerCase() : 'piece — tap to set'}
                    active={correcting === 'type'}
                    onTap={() => setCorrecting((c) => (c === 'type' ? null : 'type'))}
                    ariaLabel="Correct the piece type"
                  />
                  . Tap any of those three to correct it.
                </p>

                {/* THREE FIELDS SURFACE PROMINENTLY — type · colour · maker. */}
                <div
                  style={{
                    marginTop: '18px',
                    display: 'grid',
                    gridTemplateColumns: '110px minmax(0,1fr)',
                    gap: '14px 18px',
                    alignItems: 'baseline',
                  }}
                >
                  <div><span style={{ ...monoLabel(9), color: FAINT }}>Type</span></div>
                  <div className="flex flex-wrap items-center" style={{ gap: '7px' }}>
                    {currentSlot && (
                      <button type="button" style={pillDark} onClick={() => setCorrecting((c) => (c === 'type' ? null : 'type'))}>
                        {currentSlot.label}
                      </button>
                    )}
                    {slots
                      .filter((s) => s.id !== draft.slot)
                      .slice(0, 3)
                      .map((s) => (
                        <button key={s.id} type="button" style={pillOutline} onClick={() => patch({ slot: s.id })} className="hover:opacity-80 transition-opacity">
                          {s.label}
                        </button>
                      ))}
                    <button
                      type="button"
                      style={pillOutline}
                      className="hover:opacity-80 transition-opacity"
                      onClick={() => setCorrecting((c) => (c === 'type' ? null : 'type'))}
                      aria-expanded={correcting === 'type'}
                    >
                      Something else
                    </button>
                  </div>
                  {correcting === 'type' &&
                    correctionPanel(
                      <div className="space-y-2">
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
                        <label className={labelCls}>Piece type
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
                      </div>,
                    )}

                  <div><span style={{ ...monoLabel(9), color: FAINT }}>Colour</span></div>
                  <div className="flex flex-wrap items-center" style={{ gap: '9px' }}>
                    {draft.colors.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCorrecting((cur) => (cur === 'colour' ? null : 'colour'))}
                        className="inline-flex items-center hover:opacity-90 transition-opacity"
                        style={{
                          gap: '7px',
                          padding: '5px 11px',
                          background: WALNUT,
                          color: PAPER,
                          fontFamily: MONO,
                          fontSize: '9.5px',
                          letterSpacing: '0.05em',
                          textTransform: 'uppercase',
                        }}
                      >
                        <span
                          style={{
                            width: '9px',
                            height: '9px',
                            borderRadius: '50%',
                            background: swatchFor(c),
                            border: '1px solid rgba(246,240,229,0.5)',
                            display: 'inline-block',
                          }}
                        />
                        {formatColorName(c)}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setCorrecting((cur) => (cur === 'colour' ? null : 'colour'))}
                      className="hover:underline"
                      style={{ ...monoLabel(9), color: ACCENT_DEEP, background: 'transparent' }}
                      aria-expanded={correcting === 'colour'}
                    >
                      {draft.colors.length === 0 ? 'Pick a colour' : draft.colors.length === 1 ? 'Add a second' : 'Change'}
                    </button>
                  </div>
                  {correcting === 'colour' &&
                    correctionPanel(
                      <div>
                        <p className={`${labelCls} mb-1`}>Colour(s) — up to 3, first is primary</p>
                        <ColorSelector value={draft.colors} onChange={(c) => patch({ colors: c })} ariaLabel="Colours" />
                      </div>,
                    )}

                  {correcting === 'material' && (
                    <>
                      <div><span style={{ ...monoLabel(9), color: FAINT }}>Material</span></div>
                      <div style={{ maxWidth: '340px' }}>
                        <MaterialSelector value={draft.material} onChange={(m) => patch({ material: m })} ariaLabel="Material" />
                      </div>
                    </>
                  )}

                  {/* THE MAKER IS THE ONE QUESTION (23a): the only field Beau
                      genuinely cannot see, with permission to skip. */}
                  <div><span style={{ ...monoLabel(9), color: FAINT }}>Maker</span></div>
                  <div>
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
                  </div>
                </div>

                {/* THE REST IS STATED, NOT SHOWN — one line, eight fields a
                    link away. Right in almost every case. */}
                <div style={{ marginTop: '20px', paddingTop: '14px', borderTop: '1px solid rgba(59,43,29,0.18)' }}>
                  {!showAll ? (
                    <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] items-baseline" style={{ gap: '10px 24px' }}>
                      <div style={{ fontFamily: BODY, fontSize: '13px', lineHeight: 1.55, color: SECONDARY }}>
                        He also filled in <V>{draft.material ? draft.material.toLowerCase() : 'the material'}</V>,{' '}
                        <V>{patternText}</V>, <V>{seasonsText}</V> and <V>{occasionsText}</V>. Right in almost every
                        case, and correctable later from the piece itself.
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowAll(true)}
                        className="justify-self-start sm:justify-self-end hover:underline whitespace-nowrap"
                        style={{ ...monoLabel(9.5), color: ACCENT_DEEP, background: 'transparent' }}
                      >
                        Show all eight fields
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid sm:grid-cols-2 gap-2.5">
                        <label className={labelCls}>Material
                          <div className="mt-1">
                            <MaterialSelector value={draft.material} onChange={(m) => patch({ material: m })} ariaLabel="Material" />
                          </div>
                        </label>
                        <label className={labelCls}>Size
                          <div className="mt-1">
                            <SizeSelector value={draft.size} onChange={(s) => patch({ size: s })} ariaLabel="Size" />
                          </div>
                        </label>
                      </div>
                      <div>
                        <p className={`${labelCls} mb-1`}>Pattern</p>
                        <PatternSelector value={draft.pattern} onChange={(p) => patch({ pattern: p })} ariaLabel="Pattern" />
                      </div>
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
                      <label className={labelCls}>Anything worth noting (optional)
                        <textarea
                          value={draft.description}
                          onChange={(e) => patch({ description: e.target.value })}
                          placeholder="e.g. bought in Pamplona · collar wears at the fold · runs slim"
                          rows={2}
                          className={`${tw.input.base} ${tw.input.default} ${typography.size.sm} mt-1 resize-none`}
                          aria-label="Anything worth noting about this piece"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowAll(false)}
                        className="hover:underline"
                        style={{ ...monoLabel(9.5), color: MUTED, background: 'transparent' }}
                      >
                        Hide the extra fields
                      </button>
                    </div>
                  )}
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
// "Add a piece" — the whole 23a surface: header + pills, the selected flow,
// and the five-piece counter with the "other way in" aside. Used verbatim on
// the Wardrobe screen, The Rail tab, and (via AddPieceHub) category views.
// ---------------------------------------------------------------------------

function ModePill({
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
        fontFamily: SERIF,
        fontSize: '16px',
        fontWeight: 400,
        lineHeight: 1,
        padding: '13px 26px',
        whiteSpace: 'nowrap',
        ...(active
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
  const [mode, setMode] = useState<'photograph' | 'search'>('photograph');
  const logged = pieces.length;
  const remaining = 5 - logged;

  return (
    <section aria-label="Add a piece">
      {/* The 23a header — title + brief left, the two pills right, closed by
          a walnut hairline. */}
      <div
        className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-5 md:gap-10 md:items-end"
        style={{ paddingBottom: '20px', borderBottom: '1px solid var(--color-text,#3b2b1d)' }}
      >
        <div>
          <h3 style={{ margin: 0, fontFamily: SERIF, fontSize: 'clamp(32px, 4.5vw, 42px)', fontWeight: 400, lineHeight: 1.08, letterSpacing: '-0.012em', color: WALNUT }}>
            Add a piece
          </h3>
          <p style={{ margin: '11px 0 0', maxWidth: '70ch', fontFamily: BODY, fontSize: '15.5px', lineHeight: 1.58, color: INK }}>
            Photograph it and Beau reads it. The card opens the moment you choose a photo — the upload and his read
            fill in behind it, and nothing you have already corrected is overwritten.
          </p>
        </div>
        <div className="flex gap-3" role="tablist" aria-label="How to add a piece">
          <ModePill label="Photograph" active={mode === 'photograph'} onClick={() => setMode('photograph')} />
          <ModePill label="Search" active={mode === 'search'} onClick={() => setMode('search')} />
        </div>
      </div>

      {mode === 'photograph' ? (
        <PhotoConfirmFlow pieces={pieces} onAdded={onAdded} categoryId={categoryId} />
      ) : (
        <div style={{ marginTop: '28px' }}>
          <SearchPieceFlow pieces={pieces} onAdded={onAdded} />
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
              The <em>Search</em> pill takes a name or a product link and finds the maker’s own photography — for
              pieces you own but can’t easily photograph.
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * The category-view add area — the SAME 23a surface as the Wardrobe screen
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
