/**
 * The ONE piece editor (Pass Fourteen) — shared by the Rail edit sheet, the
 * wardrobe tracker's item cards and Build a Look's detail view, so every
 * surface edits a piece the same way:
 *
 *  - Progressive disclosure: Name, Brand and Category above the fold; colours,
 *    pattern, material, size, tags and notes under a "More details" expander
 *    whose open state is remembered for the rest of the session.
 *  - Clean inputs by construction: colours, pattern and material are
 *    tap-to-select structured pickers (input-fields.tsx) — no free text.
 *  - Machine-generated names: [Colour] [Material] [Item Type], regenerated
 *    live as the structured fields change. Typing a name of your own flags it
 *    name_is_custom; one tap restores the auto name.
 *  - Image thumbnail at the top: the piece's canonical image — the user's
 *    own photo of the garment with the background removed, on a clean
 *    #fbf8f1 paper 3:4 frame (deterministic, no AI generation — Pass
 *    Forty-Six B). A replaced photo re-runs the
 *    clean-up from the new original; the previous image stays visible until
 *    the new one is ready.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Check, ChevronRight, Loader2, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { tw, typography } from '../../lib/colors';
import {
  CURRENCY_SELECT_OPTIONS,
  MATERIAL_CHOICES,
  OCCASION_TAGS,
  SEASON_OPTIONS,
  WARDROBE_CATEGORIES,
  categoryById,
  costPerWearLabel,
  deletePiece,
  getCurrency,
  savePrefs,
  setActiveCurrency,
  fetchPieceAttributes,
  fetchPieceConditions,
  fetchPieceDetails,
  fetchPieceSources,
  fetchPieceValues,
  generatePieceName,
  incrementWear,
  matchColorOption,
  setPieceCondition,
  setPieceDetails,
  setPieceSource,
  setPieceValue,
  slotLabel as canonicalSlotLabel,
  updatePiece,
  type PieceSource,
  type PieceValue,
  type WardrobePiece,
} from './profile-data';
import { BrandField, ColorSelector, MaterialSelector, PatternSelector, SizeSelector } from './input-fields';
import {
  PIECE_ENRICHED_EVENT,
  enrichPiece,
  fetchPieceEnrichment,
  isEnriching,
  type PieceEnrichment,
} from './beau-enrichment';
import { MONO } from './mono-type';
import { CanonicalGarment } from './canonical-garment';
import { queueWardrobeReassessment } from './reassess-queue';
import { analyzeGarmentPhoto } from './wardrobe-ai';
import { inferWarmth } from './warmth-model';
import {
  fetchPhotoMeta,
  garmentFieldsFromPiece,
  isRegenerating,
  isSettledPhotoSource,
  onRegenChange,
  regeneratePieceImage,
  setPhotoOriginal,
  type PhotoSource,
} from './photo-enhance';

// ---------------------------------------------------------------------------
// "Looks it has been in" (16a · M3): the saved boards this piece appears on,
// most recently worn first. The piece's life is the relationship between
// records, not the record alone — so the detail view reads the boards
// straight off saved_outfits + look_meta; nothing keeps its own copy.
// ---------------------------------------------------------------------------

// window.__workspaceDb is auto-injected by the platform compiler when it sees
// this literal token in app source.
function workspaceDb(): any {
  return (window as any).__workspaceDb;
}

interface LookIn {
  id: number;
  name: string;
  timesWorn: number;
  lastWornAt: string | null;
  /** Holds at least one piece the user doesn't own — a proposal. */
  proposal: boolean;
}

/** Whether a saved outfit's pieces JSON contains this owned piece — and
 * whether the board holds anything NOT owned (which makes it a proposal). */
function lookHoldsPiece(pieces: unknown, pieceId: number): { holds: boolean; proposal: boolean } {
  let list: any[] = [];
  try {
    const parsed = typeof pieces === 'string' ? JSON.parse(pieces) : pieces;
    if (Array.isArray(parsed)) list = parsed;
    else if (parsed && Array.isArray((parsed as any).pieces)) list = (parsed as any).pieces;
  } catch { /* unreadable board JSON — reads as empty */ }
  let holds = false;
  let proposal = false;
  for (const slot of list) {
    const key = String((slot as any)?.key || '');
    if (key === `owned-${pieceId}`) holds = true;
    if (key && !key.startsWith('owned-')) proposal = true;
  }
  return { holds, proposal };
}

function lookAgoLabel(iso: string | null): string {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${Math.floor(days / 7) === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** The saved looks holding this piece, most recently worn first — never
 * throws; a failed read shows nothing rather than an error. */
async function fetchLooksHolding(pieceId: number): Promise<LookIn[]> {
  try {
    const [{ data: outfitRows }, { data: metaRows }] = await Promise.all([
      workspaceDb().from('saved_outfits').orderBy('created_at', 'desc').limit(100).get(),
      workspaceDb().from('look_meta').orderBy('created_at', 'desc').limit(200).get(),
    ]);
    const metaByLook = new Map<number, { id: number; times_worn: number; last_worn_at: string | null }>();
    for (const m of (metaRows || []) as Array<{ id: number; look_id: number; times_worn: number; last_worn_at: string | null }>) {
      const existing = metaByLook.get(Number(m.look_id));
      if (!existing || Number(m.id) > Number(existing.id)) metaByLook.set(Number(m.look_id), m);
    }
    const looks: LookIn[] = [];
    for (const row of (outfitRows || []) as Array<{ id: number; name: string; pieces: unknown; mode?: string | null }>) {
      const { holds, proposal } = lookHoldsPiece(row.pieces, pieceId);
      if (!holds) continue;
      const meta = metaByLook.get(Number(row.id)) || null;
      looks.push({
        id: Number(row.id),
        name: row.name || 'Saved look',
        timesWorn: meta?.times_worn || 0,
        lastWornAt: meta?.last_worn_at || null,
        proposal: row.mode === 'proposal' || proposal,
      });
    }
    // Most recently worn first; never-worn sink (the M3/M7 sort rule).
    looks.sort(
      (a, b) =>
        (b.lastWornAt ? new Date(b.lastWornAt).getTime() : 0) -
        (a.lastWornAt ? new Date(a.lastWornAt).getTime() : 0),
    );
    return looks;
  } catch (e) {
    console.warn('[Ethaion] looks-it-has-been-in read failed (non-fatal):', e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// "Edit details" open state (add-piece refinements pass): the editable
// fields live behind a foldable section that ALWAYS opens collapsed — the
// card leads with the record (photo, Beau's enrichment, the piece's life),
// and editing is one tap away. Edits inside save themselves on blur/Enter.
// ---------------------------------------------------------------------------

/** The mono small-caps working-label register (16a) for the Beau panel. */
const monoLabelStyle: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 'max(var(--eth-micro, 0px), 9px)',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
};

// ---------------------------------------------------------------------------
// Item-type inference for legacy pieces without a canonical slot: the
// existing name minus colour and material words is the clothing type
// ("Thick Cotton Jacket" → "Thick Jacket").
// ---------------------------------------------------------------------------

function inferItemType(name: string): string {
  const materialWords = new Set(MATERIAL_CHOICES.flatMap((m) => m.toLowerCase().split(/\s+/)));
  const kept = name
    .split(/\s+/)
    .filter((word) => {
      const w = word.toLowerCase().replace(/[^a-z-]/g, '');
      if (!w) return false;
      if (materialWords.has(w)) return false;
      return matchColorOption(w) == null;
    })
    .join(' ')
    .trim();
  return kept;
}

// ---------------------------------------------------------------------------
// The form
// ---------------------------------------------------------------------------

export function PieceEditForm({
  piece,
  material,
  onSaved,
  onClose,
  allowDelete = true,
  showPhotoTools = true,
}: {
  piece: WardrobePiece;
  /** Current material display string (piece_materials companion row or slot default). */
  material: string;
  /** Called after any successful write so the caller can refresh. */
  onSaved: () => void;
  /** When provided, the form closes after saving or deleting. */
  onClose?: () => void;
  allowDelete?: boolean;
  showPhotoTools?: boolean;
}) {
  // --- drafts -------------------------------------------------------------
  const [nameDraft, setNameDraft] = useState(piece.name);
  const [nameIsCustom, setNameIsCustom] = useState(true); // corrected once attributes load
  const [brandDraft, setBrandDraft] = useState(piece.brand || '');
  const [categoryDraft, setCategoryDraft] = useState(piece.category);
  const [slotDraft, setSlotDraft] = useState(piece.slot || '');
  const [colorsDraft, setColorsDraft] = useState<string[]>((piece.colors || []).map((c) => c.toLowerCase()));
  const [patternDraft, setPatternDraft] = useState('');
  const [materialDraft, setMaterialDraft] = useState(material);
  const [sizeDraft, setSizeDraft] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
  const [seasonsDraft, setSeasonsDraft] = useState<string[]>(piece.seasons || []);
  const [occasionsDraft, setOccasionsDraft] = useState<string[]>(piece.occasions || []);
  const [detailsLoaded, setDetailsLoaded] = useState(false);
  const initialDetails = useRef<{ size: string; notes: string }>({ size: '', notes: '' });
  const initialPattern = useRef('');
  // "Edit details" — ALWAYS opens collapsed; the record leads, the form is
  // one tap away (add-piece refinements pass).
  const [moreOpen, setMoreOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Photo replace (Track K + L): local preview immediately, fast upload, the
  // white-background clean-up swaps in silently when it lands.
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  // Photo provenance controls caching. Structured visual-field edits always
  // queue a fresh generated image, regardless of the previous image source.
  const [photoSource, setPhotoSourceState] = useState<PhotoSource | null>(null);
  // "Updating photo…" while the product image regenerates from edited fields.
  const [, setRegenTick] = useState(0);
  useEffect(() => onRegenChange(() => setRegenTick((t) => t + 1)), []);
  const regenerating = isRegenerating(piece.id);

  // Source link (Pass Forty-Six B) — present only for pieces logged via the
  // Search/URL flow; photo-logged pieces have no row and show nothing.
  const [source, setSource] = useState<PieceSource | null>(null);
  const [sourceEditing, setSourceEditing] = useState(false);
  const [sourceDraft, setSourceDraft] = useState('');
  const [sourceBusy, setSourceBusy] = useState(false);

  // Cost-per-wear (Pass Fifteen, Track G): price paid + wear counter.
  const [value, setValue] = useState<PieceValue | null>(null);
  const [priceDraft, setPriceDraft] = useState('');
  const [wearBusy, setWearBusy] = useState(false);
  // Condition & care (piece-detail enhancements): freeform notes, edited
  // in place — they save themselves on blur/Enter, never behind the Save
  // button.
  const [conditionDraft, setConditionDraft] = useState('');
  const [careDraft, setCareDraft] = useState('');
  const initialCondition = useRef<{ condition: string; care: string }>({ condition: '', care: '' });
  const [noteFlash, setNoteFlash] = useState<string | null>(null);
  // "Looks it has been in" (16a · M3) — the saved boards holding this piece.
  const [looksIn, setLooksIn] = useState<LookIn[]>([]);
  useEffect(() => {
    let cancelled = false;
    void fetchLooksHolding(piece.id).then((looks) => {
      if (!cancelled) setLooksIn(looks);
    });
    return () => {
      cancelled = true;
    };
  }, [piece.id]);

  // BEAU, ON THIS PIECE (16a): the details Beau pulled from an online
  // lookup after the piece was saved — composition, construction, care,
  // sizing. Loaded here; a piece with no stored row (logged before this
  // pass, or the lookup never ran) kicks one off now, fire-and-forget.
  const [enrichment, setEnrichment] = useState<PieceEnrichment | null>(null);
  const [enrichPending, setEnrichPending] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setEnrichment(null);
    setEnrichPending(true);
    const load = () =>
      fetchPieceEnrichment(piece.id).then((row) => {
        if (!cancelled) {
          setEnrichment(row);
          setEnrichPending(isEnriching(piece.id));
        }
        return row;
      });
    void load().then((row) => {
      if (cancelled || row || isEnriching(piece.id)) return;
      setEnrichPending(true);
      void enrichPiece({
        pieceId: piece.id,
        name: piece.name,
        brand: piece.brand,
        typeLabel: canonicalSlotLabel(piece.slot) || categoryById(piece.category)?.label || '',
        material: material || null,
      }).then(() => {
        if (!cancelled) void load();
      });
    });
    const onEnriched = (e: Event) => {
      if ((e as CustomEvent).detail?.pieceId === piece.id) void load();
    };
    window.addEventListener(PIECE_ENRICHED_EVENT, onEnriched);
    return () => {
      cancelled = true;
      window.removeEventListener(PIECE_ENRICHED_EVENT, onEnriched);
    };
  }, [piece.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Currency selector (Pass Forty-Six) — inline next to the price field;
  // GBP default; selecting persists the app-wide display currency.
  const [currencyId, setCurrencyId] = useState<string>(() => getCurrency().id);
  const changeCurrency = (id: string) => {
    setCurrencyId(id);
    setActiveCurrency(id);
    void savePrefs({ currency: id }).catch(() => undefined);
  };

  const slots = categoryById(categoryDraft)?.slots || [];
  // Legacy type words for pieces without a canonical slot, so the auto name
  // keeps reading like a garment ("Thick Jacket"), not a category.
  const itemTypeFallback = useMemo(() => (piece.slot ? '' : inferItemType(piece.name)), [piece.slot, piece.name]);

  // The warmth/weather band the daily candidate filter reads. Derived from the
  // LIVE drafts rather than the stored row, so correcting the material or the
  // season shows its effect on Beau's reasoning immediately.
  const warmthRead = useMemo(
    () =>
      inferWarmth(
        { category: categoryDraft, slot: slotDraft || null, name: nameDraft, seasons: seasonsDraft },
        materialDraft || null,
      ),
    [categoryDraft, slotDraft, nameDraft, seasonsDraft, materialDraft],
  );

  // Companion rows (size/notes + pattern/name provenance + photo provenance
  // + cost-per-wear) load once on open.
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchPieceDetails(), fetchPieceAttributes(), fetchPhotoMeta(), fetchPieceValues(), fetchPieceSources(), fetchPieceConditions()])
      .then(([detailsMap, attrMap, photoMap, valueMap, sourceMap, conditionMap]) => {
        if (cancelled) return;
        const d = detailsMap[piece.id];
        const a = attrMap[piece.id];
        const size = d?.size ?? '';
        const notes = d?.notes ?? '';
        initialDetails.current = { size, notes };
        setSizeDraft(size);
        setNotesDraft(notes);
        const loadedPattern = a?.pattern ?? '';
        initialPattern.current = loadedPattern;
        setPatternDraft(loadedPattern);
        setNameIsCustom(a ? a.name_is_custom !== false : true);
        setPhotoSourceState(photoMap[piece.id]?.source ?? null);
        setSource(sourceMap[piece.id] ?? null);
        const v = valueMap[piece.id] ?? null;
        setValue(v);
        setPriceDraft(v?.price_paid != null ? String(v.price_paid) : '');
        const cond = conditionMap[piece.id] ?? null;
        initialCondition.current = { condition: cond?.condition_note || '', care: cond?.care_note || '' };
        setConditionDraft(cond?.condition_note || '');
        setCareDraft(cond?.care_note || '');
        setDetailsLoaded(true);
      })
      .catch(() => setDetailsLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [piece.id]);

  // The live machine-generated name — recomputed as structured fields change.
  const autoName = useMemo(
    () =>
      generatePieceName({
        colors: colorsDraft,
        material: materialDraft,
        slot: slotDraft || null,
        category: categoryDraft,
        itemType: slotDraft ? null : itemTypeFallback,
      }),
    [colorsDraft, materialDraft, slotDraft, categoryDraft, itemTypeFallback],
  );

  // While the name is machine-generated, it follows the structured fields.
  useEffect(() => {
    if (!nameIsCustom && autoName) setNameDraft(autoName);
  }, [autoName, nameIsCustom]);

  const onNameTyped = (next: string) => {
    setNameDraft(next);
    setNameIsCustom(next.trim().toUpperCase() !== autoName.trim().toUpperCase());
  };

  // Auto-uppercase on blur (Pass Forty-Six): the user types normally; the
  // value converts once focus leaves the field — never mid-typing.
  const onNameBlur = () => setNameDraft((cur) => cur.toUpperCase());

  const resetToAutoName = () => {
    if (!autoName) return;
    setNameDraft(autoName);
    setNameIsCustom(false);
  };

  // EDITS SAVE THEMSELVES (add-piece refinements): any change inside the
  // Edit details fold persists on blur / Enter / change — debounced and
  // silent. The Save button remains as the explicit "done": it also
  // refreshes the cleaned image and closes the sheet.
  const [autoSaved, setAutoSaved] = useState(false);
  const draftSig = JSON.stringify([
    nameDraft, brandDraft, categoryDraft, slotDraft, colorsDraft, patternDraft,
    materialDraft, sizeDraft, notesDraft, seasonsDraft, occasionsDraft,
  ]);
  const savedSigRef = useRef<string | null>(null);
  const saveSilently = async () => {
    const finalName = nameDraft.trim().toUpperCase();
    if (!finalName || saving) return;
    piece.name = finalName;
    piece.brand = brandDraft.trim() || null;
    piece.category = categoryDraft;
    piece.slot = slotDraft || null;
    piece.colors = colorsDraft;
    piece.seasons = seasonsDraft;
    piece.occasions = occasionsDraft;
    (piece as WardrobePiece & { pattern?: string | null }).pattern = patternDraft || null;
    window.dispatchEvent(new CustomEvent('ethaion:piece-optimistic', { detail: { piece: { ...piece } } }));
    try {
      await Promise.all([
        updatePiece(piece.id, {
          name: finalName,
          brand: brandDraft.trim() || null,
          category: categoryDraft,
          slot: slotDraft || null,
          colors: colorsDraft,
          seasons: seasonsDraft,
          occasions: occasionsDraft,
          material: materialDraft.trim() || null,
          pattern: patternDraft || null,
          name_is_custom: nameIsCustom,
        }),
        setPieceDetails(piece.id, { size: sizeDraft.trim() || null, notes: notesDraft.trim() || null }),
      ]);
      initialDetails.current = { size: sizeDraft, notes: notesDraft };
      onSaved();
      queueWardrobeReassessment('piece edited');
      setAutoSaved(true);
      window.setTimeout(() => setAutoSaved(false), 1800);
    } catch (e) {
      console.warn('[Ethaion] in-place save failed (non-fatal) — the Save button still works:', e);
    }
  };
  useEffect(() => {
    if (!detailsLoaded) return;
    // The first pass after the companion rows load is the baseline, not an edit.
    if (savedSigRef.current === null) {
      savedSigRef.current = draftSig;
      return;
    }
    if (savedSigRef.current === draftSig) return;
    const t = window.setTimeout(() => {
      savedSigRef.current = draftSig;
      void saveSilently();
    }, 900);
    return () => window.clearTimeout(t);
  }, [draftSig, detailsLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleMore = () => setMoreOpen((open) => !open);

  const toggleTag = (values: string[], id: string, set: (next: string[]) => void) =>
    set(values.includes(id) ? values.filter((v) => v !== id) : [...values, id]);

  // --- photo replace / remove ---------------------------------------------
  const onPhotoPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (photoInputRef.current) photoInputRef.current.value = '';
    if (!file || photoBusy) return;
    // Optimistic UI: the local preview appears instantly, before any upload.
    const preview = URL.createObjectURL(file);
    setLocalPreview(preview);
    setPhotoBusy(true);
    try {
      const { piece: readPiece, photoUrl } = await analyzeGarmentPhoto(file);
      // The new upload becomes the piece's permanent original anchor; vision
      // refreshes the structured drafts. The current image stays visible
      // until the pipeline's cleaned version lands.
      if (photoUrl) await setPhotoOriginal(piece.id, photoUrl);
      if (readPiece) {
        setNameDraft(readPiece.name || nameDraft);
        setNameIsCustom(false);
        setBrandDraft(readPiece.brand || brandDraft);
        setCategoryDraft(readPiece.category || categoryDraft);
        setSlotDraft(readPiece.slot || '');
        setColorsDraft(readPiece.colors || []);
        setPatternDraft(readPiece.pattern || '');
        setMaterialDraft(readPiece.material || '');
        setSeasonsDraft(readPiece.seasons || seasonsDraft);
        setOccasionsDraft(readPiece.occasions || occasionsDraft);
      }
      if (photoUrl) {
        regenerateFromFields({
          colors: readPiece?.colors || colorsDraft,
          material: readPiece?.material || materialDraft,
          slot: readPiece?.slot || slotDraft,
          category: readPiece?.category || categoryDraft,
        });
      }
      setLocalPreview(null);
    } catch (err) {
      console.error('[Ethaion] photo replace failed:', err);
      setLocalPreview(null);
    } finally {
      setPhotoBusy(false);
    }
  };

  // Regenerate the product image from the CURRENT structured fields — used
  // automatically after field edits, and manually via "Regenerate photo".
  const regenerateFromFields = (fields: { colors: string[]; material: string; slot: string; category: string }) => {
    const garment = garmentFieldsFromPiece(
      {
        name: itemTypeFallback || nameDraft,
        category: fields.category,
        slot: fields.slot || null,
        colors: fields.colors,
      },
      fields.material,
      patternDraft || null,
    );
    void regeneratePieceImage(piece.id, garment).then((url) => {
      if (url) {
        piece.photo_url = url;
        setPhotoSourceState('pipeline');
        window.dispatchEvent(new CustomEvent('ethaion:piece-optimistic', { detail: { piece: { ...piece } } }));
      }
      setLocalPreview(null);
      onSaved();
    });
  };

  // Cost-per-wear actions (Track G).
  const savePrice = async () => {
    const trimmed = priceDraft.trim();
    const num = trimmed === '' ? null : Math.max(0, Number(trimmed) || 0);
    if ((value?.price_paid ?? null) === num) return;
    try {
      setValue(await setPieceValue(piece.id, { price_paid: num }));
    } catch (e) {
      console.warn('[Ethaion] price save failed (non-fatal):', e);
    }
  };

  const addWear = async () => {
    if (wearBusy) return;
    setWearBusy(true);
    try {
      setValue(await incrementWear(piece.id, value));
    } catch (e) {
      console.warn('[Ethaion] wear increment failed (non-fatal):', e);
    } finally {
      setWearBusy(false);
    }
  };

  // Condition & care save themselves in place — on blur or Enter, never
  // behind a separate form (piece-detail enhancements).
  const saveConditionNotes = async () => {
    const condition = conditionDraft.trim();
    const care = careDraft.trim();
    if (condition === initialCondition.current.condition.trim() && care === initialCondition.current.care.trim()) return;
    try {
      await setPieceCondition(piece.id, { condition_note: condition || null, care_note: care || null });
      initialCondition.current = { condition, care };
      setNoteFlash('Noted.');
      window.setTimeout(() => setNoteFlash(null), 1800);
    } catch (e) {
      console.warn('[Ethaion] condition/care save failed (non-fatal):', e);
    }
  };

  // Source link change (Pass Forty-Six B): point the piece at a different
  // product page — or clear the link entirely by saving an empty field.
  const saveSourceLink = async () => {
    if (sourceBusy) return;
    setSourceBusy(true);
    try {
      let clean = sourceDraft.trim();
      if (clean && !/^https?:\/\//i.test(clean)) clean = `https://${clean}`;
      const fresh = await setPieceSource(piece.id, clean || null, brandDraft || piece.brand);
      setSource(fresh);
      setSourceEditing(false);
    } catch (e) {
      console.warn('[Ethaion] source link save failed (non-fatal):', e);
    } finally {
      setSourceBusy(false);
    }
  };

  // --- save / delete -------------------------------------------------------
  const save = async () => {
    if (!nameDraft.trim() || saving) return;
    setSaving(true);
    // Auto-uppercase on save (Pass Forty-Six) — free-typed fields only;
    // price and currency stay exactly as entered.
    const finalName = nameDraft.trim().toUpperCase();

    const previousPiece = {
      ...piece,
      colors: [...(piece.colors || [])],
      seasons: [...(piece.seasons || [])],
      occasions: [...(piece.occasions || [])],
      pattern: (piece as WardrobePiece & { pattern?: string | null }).pattern || null,
    };
    const previousBrand = piece.brand || '';
    const nextBrand = brandDraft.trim() || null;
    const brandChanged = previousBrand.trim().toUpperCase() !== (nextBrand || '').toUpperCase();
    const fieldsChanged =
      JSON.stringify(piece.colors || []) !== JSON.stringify(colorsDraft) ||
      (piece.slot || '') !== slotDraft ||
      piece.category !== categoryDraft ||
      initialPattern.current !== patternDraft ||
      material.trim().toLowerCase() !== materialDraft.trim().toLowerCase();

    // Optimistic update: mutate the shared row before closing the sheet. The
    // parent re-render caused by close reflects every edit immediately; DB
    // writes and the canonical-image save continue in the background.
    piece.name = finalName;
    piece.brand = nextBrand;
    piece.category = categoryDraft;
    piece.slot = slotDraft || null;
    piece.colors = colorsDraft;
    piece.seasons = seasonsDraft;
    piece.occasions = occasionsDraft;
    (piece as WardrobePiece & { pattern?: string | null }).pattern = patternDraft || null;

    window.dispatchEvent(new CustomEvent('ethaion:piece-optimistic', { detail: { piece: { ...piece } } }));

    if (brandChanged) {
      // A renamed maker must never inherit a stale cached mark.
      try {
        localStorage.removeItem(`brummell_brand_logo_${previousBrand.trim().toUpperCase()}`);
        localStorage.removeItem(`brummell_brand_logo_${(nextBrand || '').toUpperCase()}`);
      } catch { /* storage unavailable */ }
      window.dispatchEvent(new CustomEvent('ethaion:brand-changed', { detail: { pieceId: piece.id, brand: nextBrand } }));
    }

    try {
      // ONE combined write covers every wardrobe_pieces field (tags included)
      // plus the material/pattern/name-provenance companion rows — the fast
      // path the sheet-close depends on.
      const detailsChanged =
        detailsLoaded &&
        (sizeDraft.trim() !== initialDetails.current.size.trim() ||
          notesDraft.trim() !== initialDetails.current.notes.trim());
      // The details row is a separate table from everything updatePiece
      // touches, so it need not queue behind it. Previously this was a fourth
      // serial round-trip the user waited through before the sheet closed.
      await Promise.all([
        updatePiece(piece.id, {
          name: finalName,
          brand: nextBrand,
          category: categoryDraft,
          slot: slotDraft || null,
          colors: colorsDraft,
          seasons: seasonsDraft,
          occasions: occasionsDraft,
          material: materialDraft.trim() || null,
          pattern: patternDraft || null,
          name_is_custom: nameIsCustom,
        }),
        detailsChanged
          ? setPieceDetails(piece.id, { size: sizeDraft.trim() || null, notes: notesDraft.trim() || null })
          : Promise.resolve(),
      ]);
      onSaved();
      // The write has landed — the only thing the user waited on. Beau's
      // re-read is queued as a separate background operation and is never
      // awaited here (reassess-queue.ts).
      queueWardrobeReassessment('piece edited');
      // Saving NEVER navigates (founder's fix): the edit form simply closes
      // in place and the user stays exactly where they were — same page,
      // same category view. The optimistic events above already refreshed
      // every mounted surface, so nothing needs a tab change.
      onClose?.();
      if (fieldsChanged || brandChanged || !isSettledPhotoSource(photoSource)) {
        // Colour, category, brand or item-type changes regenerate the image
        // from the stored original photo with the UPDATED field description.
        // This runs in the background — the save itself never waits on it,
        // and the previous image stays visible until the new one is ready.
        void regeneratePieceImage(piece.id, garmentFieldsFromPiece(piece, materialDraft, patternDraft || null)).then((resolvedUrl) => {
          if (resolvedUrl) {
            piece.photo_url = resolvedUrl;
            setPhotoSourceState('pipeline');
            window.dispatchEvent(new CustomEvent('ethaion:piece-optimistic', { detail: { piece: { ...piece } } }));
            onSaved();
          }
        });
      }
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('ethaion:piece-settled', { detail: { pieceId: piece.id } }));
      }, 800);
    } catch (error) {
      console.error('[Ethaion] piece save failed:', error);
      Object.assign(piece, previousPiece);
      window.dispatchEvent(new CustomEvent('ethaion:piece-rollback', { detail: { piece: { ...previousPiece } } }));
      try {
        await updatePiece(piece.id, {
          name: previousPiece.name,
          brand: previousPiece.brand || null,
          category: previousPiece.category,
          slot: previousPiece.slot || null,
          colors: previousPiece.colors,
          seasons: previousPiece.seasons,
          occasions: previousPiece.occasions,
          material: material.trim() || null,
          pattern: initialPattern.current || null,
        });
        await setPieceDetails(piece.id, {
          size: initialDetails.current.size || null,
          notes: initialDetails.current.notes || null,
        });
      } catch { /* persistence is unavailable; local rollback still applies */ }
      onSaved();
      window.alert('That change could not be saved. Your previous piece details have been restored.');
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await deletePiece(piece.id);
      onSaved();
      queueWardrobeReassessment('piece removed');
      onClose?.();
    } finally {
      setDeleting(false);
    }
  };

  const photoSrc = localPreview || piece.photo_url || null;
  const labelCls = `${typography.size.xs} ${typography.color.muted}`;
  const inputCls = `${tw.input.base} ${tw.input.default} ${typography.size.sm} mt-1`;
  const chip = (active: boolean) =>
    `px-2.5 py-1 rounded-full border text-xs transition-colors ${
      active
        ? 'bg-[var(--space-surface-accent-soft)] text-[var(--space-brand-primary-700)] border-[var(--space-brand-primary)]'
        : 'border-[var(--space-border-default)] text-[var(--space-text-secondary)] hover:border-[var(--space-border-strong)]'
    }`;

  return (
    <div>
      {/* Photo thumbnail (Track K) / live-tinted illustration (Track I) */}
      {showPhotoTools && (
        <div className="flex items-center gap-3 mb-3">
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            disabled={photoBusy}
            className="relative w-20 aspect-[3/4] rounded-xl overflow-hidden border border-[var(--space-border-default)] bg-[#fbf8f1] flex items-center justify-center flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-[var(--space-brand-primary)]"
            title={photoSrc ? 'Tap to replace the photo' : 'Tap to add a photo'}
            aria-label={photoSrc ? `Replace the photo of ${piece.name}` : `Add a photo of ${piece.name}`}
          >
            <CanonicalGarment
              fields={{ name: nameDraft, category: categoryDraft, slot: slotDraft || null, colors: colorsDraft, pattern: patternDraft, brand: brandDraft }}
              photoUrl={photoSrc}
              pieceId={piece.id}
              title={nameDraft}
              showConfirmation
              showOriginal
              className="absolute inset-0"
            />
            {/* Dark overlay only while a new photo uploads; pipeline regeneration
                shows CanonicalGarment's subtle corner badge so the previous image
                stays clearly visible underneath. */}
            {photoBusy && (
              <span className="absolute inset-0 bg-[var(--space-shell-shadow-strong)] flex items-center justify-center">
                <Loader2 className="w-4 h-4 animate-spin text-white" />
              </span>
            )}
          </button>
          <div className="min-w-0">
            <p className={`${typography.size.xs} ${typography.color.secondary}`}>
              {regenerating
                ? 'Cleaning up your photo…'
                : 'Your own photo is the anchor: the background is stripped and the real garment sits on a clean paper card — same photo, just cleaned up. No AI redraw, ever.'}
            </p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                disabled={photoBusy}
                className={`inline-flex items-center gap-1 ${typography.size.xs} ${typography.color.brand} hover:underline disabled:opacity-50`}
              >
                <Camera className="w-3 h-3" /> Add reference photo
              </button>

              {!regenerating && (
                <button
                  type="button"
                  onClick={() => regenerateFromFields({ colors: colorsDraft, material: materialDraft, slot: slotDraft, category: categoryDraft })}
                  className={`inline-flex items-center gap-1 ${typography.size.xs} ${typography.color.muted} hover:underline`}
                  title="Re-run the image clean-up for these details"
                >
                  <RotateCcw className="w-3 h-3" /> Refresh image
                </button>
              )}
            </div>
          </div>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => void onPhotoPicked(e)}
            className="hidden"
            aria-label={`Upload a photo of ${piece.name}`}
          />
        </div>
      )}

      {/* BEAU, ON THIS PIECE (16a): what Beau found about this piece online
          after it was saved — his one-line reading, then composition,
          construction, care and sizing when the search turned them up, and
          the page he leaned on. A miss reads as one quiet informational
          line — never an error. */}
      <div style={{ borderLeft: '2px solid #a8712c', background: '#fbf8f1', padding: '14px 16px 15px', marginBottom: '4px' }}>
        <p style={{ ...monoLabelStyle, color: '#856c51', margin: 0 }}>Beau, on this piece</p>
        {enrichment?.status === 'found' ? (
          <div>
            {enrichment.summary && (
              <p style={{ margin: '8px 0 0', fontFamily: 'var(--space-font-family)', fontSize: 'max(var(--eth-body, 0px), 13.5px)', lineHeight: 1.6, color: '#3b2b1d', maxWidth: '76ch' }}>
                {enrichment.summary}
              </p>
            )}
            <div style={{ marginTop: enrichment.summary ? '10px' : '8px' }}>
              {([
                ['Composition', enrichment.composition],
                ['Construction', enrichment.construction],
                ['Care', enrichment.care],
                ['Sizing', enrichment.sizing],
              ] as Array<[string, string | null]>)
                .filter(([, v]) => !!v)
                .map(([label, v], i, rows) => (
                  <div
                    key={label}
                    className="grid grid-cols-[92px_minmax(0,1fr)] gap-3 items-baseline"
                    style={{ padding: '7px 0', borderBottom: i < rows.length - 1 ? '1px solid rgba(59,43,29,0.14)' : 'none' }}
                  >
                    <span style={{ ...monoLabelStyle, color: '#7a6349' }}>{label}</span>
                    <span style={{ fontFamily: 'var(--space-font-family)', fontSize: 'max(var(--eth-body, 0px), 13px)', lineHeight: 1.5, color: '#241a12' }}>{v}</span>
                  </div>
                ))}
            </div>
            {enrichment.source_url && (
              <a
                href={enrichment.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block hover:underline"
                style={{ ...monoLabelStyle, fontSize: 'max(var(--eth-micro, 0px), 9.5px)', color: '#7c4a17', marginTop: '10px' }}
              >
                {enrichment.source_title ? `From ${enrichment.source_title.slice(0, 60)}` : 'The page he leaned on'} →
              </a>
            )}
          </div>
        ) : enrichPending ? (
          <p style={{ margin: '8px 0 0', fontFamily: 'var(--space-font-family)', fontSize: 'max(var(--eth-body, 0px), 13px)', lineHeight: 1.55, color: '#856c51' }}>
            Beau is reading up on this piece…
          </p>
        ) : (
          <p style={{ margin: '8px 0 0', fontFamily: 'var(--space-font-family)', fontSize: 'max(var(--eth-body, 0px), 13px)', lineHeight: 1.55, color: '#856c51' }}>
            Beau couldn’t find details for this piece — an unfamiliar maker, or not enough to go on. Everything you
            log below still counts.
          </p>
        )}
      </div>

      {/* Source link (Pass Forty-Six B) — beneath the main fields, only for
          pieces logged via the Search/URL flow. "See on {retailer}" when the
          retailer is detectable, plain "View source" otherwise; "Change"
          opens a small inline field to point it at a different page. */}
      {source && !sourceEditing && (
        <div className="flex items-baseline gap-3 flex-wrap" style={{ marginTop: '12px' }}>
          <a
            href={source.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
            style={{ fontFamily: 'var(--space-font-family)', fontSize: 'max(var(--eth-body, 0px), 13px)', color: 'var(--color-accent,#a8712c)' }}
          >
            {source.label ? `See on ${source.label}` : 'View source'} ›
          </a>
          <button
            type="button"
            onClick={() => {
              setSourceDraft(source.source_url);
              setSourceEditing(true);
            }}
            className="hover:underline"
            style={{ fontFamily: 'var(--space-font-family)', fontSize: 'max(var(--eth-label, 0px), 12px)', color: 'var(--color-neutral-500,#a68e70)' }}
          >
            Change ›
          </button>
        </div>
      )}
      {source && sourceEditing && (
        <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: '12px' }}>
          <input
            type="url"
            value={sourceDraft}
            onChange={(e) => setSourceDraft(e.target.value)}
            placeholder="https://…"
            className="flex-1 min-w-[12rem] focus:outline-none focus:border-[var(--color-accent,#a8712c)] text-[var(--space-text-primary)] placeholder:text-[var(--color-neutral-500,#a68e70)]"
            style={{
              fontFamily: 'var(--space-font-family)',
              fontSize: 'max(var(--eth-body, 0px), 13px)',
              border: '1px solid var(--color-divider,rgba(59,43,29,0.18))',
              borderRadius: 0,
              background: '#fbf8f1',
              padding: '6px 10px',
            }}
            aria-label="Source link"
          />
          <button
            type="button"
            onClick={() => void saveSourceLink()}
            disabled={sourceBusy}
            className="hover:underline disabled:opacity-50"
            style={{ fontFamily: 'var(--space-font-family)', fontSize: 'max(var(--eth-body, 0px), 13px)', color: 'var(--color-accent,#a8712c)' }}
          >
            {sourceBusy ? 'Saving…' : 'Save ›'}
          </button>
          <button
            type="button"
            onClick={() => setSourceEditing(false)}
            disabled={sourceBusy}
            className="hover:underline disabled:opacity-50"
            style={{ fontFamily: 'var(--space-font-family)', fontSize: 'max(var(--eth-label, 0px), 12px)', color: 'var(--color-neutral-500,#a68e70)' }}
          >
            Keep as is
          </button>
        </div>
      )}

      {/* EDIT DETAILS — the foldable section holding every editable field
          that came in on first upload. ALWAYS opens collapsed; expanded, the
          fields sit inline and save themselves on blur or Enter. */}
      <button
        type="button"
        onClick={toggleMore}
        aria-expanded={moreOpen}
        className={`mt-3 w-full flex items-center justify-between gap-2 rounded-xl border border-[var(--space-border-default)] px-3 py-2 ${typography.size.sm} ${typography.color.secondary} hover:border-[var(--space-border-strong)] transition-colors`}
      >
        <span className={`${typography.weight.medium}`}>{moreOpen ? 'Edit details' : '↓ Edit details'}</span>
        <span className="flex items-center gap-1.5 min-w-0">
          {autoSaved && (
            <span className={`${typography.size.xs} flex-shrink-0`} style={{ color: 'var(--color-accent-700,#7c4a17)' }} aria-live="polite">
              Saved.
            </span>
          )}
          {!moreOpen && (
            <span className={`${typography.size.xs} ${typography.color.muted} truncate`} style={{ fontSize: 'max(var(--eth-micro, 0px), 10px)' }}>
              colour · material · type · maker · pattern · size · seasons · occasions
            </span>
          )}
          <ChevronRight className={`w-4 h-4 flex-shrink-0 transition-transform ${moreOpen ? 'rotate-90' : ''}`} />
        </span>
      </button>

      {moreOpen && (
        <div className="mt-3 space-y-3">
          <p className={`${typography.size.xs} ${typography.color.muted}`} style={{ fontSize: 'max(var(--eth-micro, 0px), 10px)' }}>
            The details from first upload — review and correct anything here. Edits save themselves on blur or
            Enter; there is nothing to submit.
          </p>
          <label className={labelCls}>Name
            <input
              value={nameDraft}
              onChange={(e) => onNameTyped(e.target.value)}
              onBlur={onNameBlur}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className={inputCls}
              aria-label="Name — saves when you leave the field"
            />
            <span className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={labelCls} style={{ fontSize: 'max(var(--eth-micro, 0px), 10px)' }}>
                {nameIsCustom ? 'Your own name — kept as typed.' : 'Auto-named from colour, material and type.'}
              </span>
              {nameIsCustom && autoName && autoName.trim() !== nameDraft.trim() && (
                <button
                  type="button"
                  onClick={resetToAutoName}
                  className={`inline-flex items-center gap-1 ${typography.color.brand} hover:underline`}
                  style={{ fontSize: 'max(var(--eth-micro, 0px), 10px)' }}
                >
                  <RotateCcw className="w-2.5 h-2.5" /> Use “{autoName}”
                </button>
              )}
            </span>
          </label>
          {/* The fields run in the order the piece's name reads them:
              colour → material → type → maker — then pattern and size. */}
          <div>
            <p className={`${labelCls} mb-1`}>Colour(s) — tap to select, up to 3; the first is the primary</p>
            <ColorSelector value={colorsDraft} onChange={setColorsDraft} ariaLabel="Colours" />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className={labelCls}>Material
              <div className="mt-1">
                <MaterialSelector value={materialDraft} onChange={setMaterialDraft} ariaLabel="Material" />
              </div>
            </label>
            <label className={labelCls}>Clothing type
              <select value={slotDraft} onChange={(e) => setSlotDraft(e.target.value)} className={inputCls}>
                <option value="">Other / not specified</option>
                {slots.map((slot) => (
                  <option key={slot.id} value={slot.id}>{slot.label}</option>
                ))}
              </select>
            </label>
            <label className={labelCls}>Category
              <select
                value={categoryDraft}
                onChange={(e) => {
                  setCategoryDraft(e.target.value);
                  setSlotDraft('');
                }}
                className={inputCls}
              >
                {WARDROBE_CATEGORIES.map((category) => (
                  <option key={category.id} value={category.id}>{category.label}</option>
                ))}
              </select>
            </label>
            <label className={labelCls}>Maker / brand
              <div className="mt-1">
                <BrandField value={brandDraft} onChange={setBrandDraft} placeholder="Optional" ariaLabel="Brand" />
              </div>
            </label>
          </div>
          <div>
            <p className={`${labelCls} mb-1`}>Pattern</p>
            <PatternSelector value={patternDraft} onChange={setPatternDraft} ariaLabel="Pattern" />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className={labelCls}>Size
              <div className={`mt-1 ${detailsLoaded ? '' : 'opacity-60 pointer-events-none'}`}>
                <SizeSelector value={sizeDraft} onChange={setSizeDraft} ariaLabel="Size" />
              </div>
            </label>
            <label className={labelCls}>Notes
              <textarea
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                placeholder="Fit, alteration or provenance"
                rows={2}
                disabled={!detailsLoaded}
                className={`${inputCls} resize-none disabled:opacity-60`}
              />
            </label>
          </div>
          <div>
            <p className={`${labelCls} mb-1`}>Season</p>
            <div className="flex flex-wrap gap-1.5">
              {SEASON_OPTIONS.map((o) => (
                <button key={o.id} type="button" onClick={() => toggleTag(seasonsDraft, o.id, setSeasonsDraft)} className={chip(seasonsDraft.includes(o.id))}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className={`${labelCls} mb-1`}>Occasion</p>
            <div className="flex flex-wrap gap-1.5">
              {OCCASION_TAGS.map((o) => (
                <button key={o.id} type="button" onClick={() => toggleTag(occasionsDraft, o.id, setOccasionsDraft)} className={chip(occasionsDraft.includes(o.id))}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          {/* The warmth band Beau's daily filter judges this piece on. Read
              only and never asked for: it is worked out from the type, the
              fabric and the season above, and it updates as those are
              corrected — so "why didn't he suggest my wax jacket today?" has
              a visible answer. */}
          <div>
            <p className={`${labelCls} mb-1`}>Rated for</p>
            <p className={`${typography.size.xs} ${typography.color.secondary}`}>
              {warmthRead.min_comfortable_temp_c}–{warmthRead.max_comfortable_temp_c}°C · {warmthRead.warmth_level} warmth
              {warmthRead.weather_suited.length > 0 ? ` · suits ${warmthRead.weather_suited.join(', ')}` : ''}
            </p>
            <p className={`${labelCls} mt-0.5`} style={{ fontSize: 'max(var(--eth-micro, 0px), 10px)' }}>
              Worked out from the type, fabric and season — Beau leaves this piece out of a day it isn’t rated for.
            </p>
          </div>
        </div>
      )}

      {/* THE PIECE'S LIFE (piece-detail enhancements · 16a · M3): worn
          count leads, cost-per-wear follows — £200 over 100 wears is £2 a
          wear. No price logged reads “—”, never an error; zero wears reads
          “Not yet worn”. CPW moves live as the counter does. */}
      <div className="mt-4 rounded-xl border border-[var(--space-border-default)] px-4 py-3.5">
        <div className="flex items-end gap-6 flex-wrap">
          <span>
            <span className={`block ${typography.size.xs} uppercase tracking-[0.15em] ${typography.color.secondary}`}>Worn</span>
            <span className={`block tabular-nums ${typography.color.primary}`} style={{ fontFamily: 'var(--space-font-heading)', fontSize: '26px', lineHeight: 1.1 }}>
              {value?.times_worn ?? 0}×
            </span>
          </span>
          <span>
            <span className={`block ${typography.size.xs} uppercase tracking-[0.15em] ${typography.color.secondary}`}>Per wear</span>
            <span className={`block tabular-nums ${costPerWearLabel(value) ? typography.color.primary : typography.color.muted}`} style={{ fontFamily: 'var(--space-font-heading)', fontSize: '26px', lineHeight: 1.1 }}>
              {costPerWearLabel(value) || '\u2014'}
            </span>
          </span>
          {value?.last_worn_at && (
            <span>
              <span className={`block ${typography.size.xs} uppercase tracking-[0.15em] ${typography.color.secondary}`}>Last worn</span>
              <span className={`block ${typography.color.primary}`} style={{ fontFamily: 'var(--space-font-family)', fontSize: 'max(var(--eth-body, 0px), 14px)', lineHeight: 1.3, paddingTop: '6px' }}>
                {new Date(value.last_worn_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
            </span>
          )}
        </div>
        {!(value?.price_paid != null && value.price_paid > 0) && (
          <p className={`${typography.size.xs} ${typography.color.muted} mt-1`}>
            Log the price paid and cost per wear tracks itself.
          </p>
        )}
        <div className="flex items-center gap-3 mt-2.5 flex-wrap">
          <label className={`${labelCls} inline-flex items-center gap-1.5 flex-wrap`}>
            Price paid
            <span className="inline-flex items-center gap-1.5">
              {/* Currency selector (Pass Forty-Six) — plain select, hairline
                  aesthetic, inline next to the price. GBP default. */}
              <select
                value={currencyId}
                onChange={(e) => changeCurrency(e.target.value)}
                aria-label="Currency"
                className="focus:outline-none focus:border-[var(--color-accent,#a8712c)] text-[var(--space-text-primary)]"
                style={{
                  fontFamily: 'var(--space-font-family)',
                  fontSize: 'max(var(--eth-body, 0px), 14px)',
                  border: '1px solid var(--color-divider,rgba(59,43,29,0.18))',
                  borderRadius: 0,
                  background: '#fbf8f1',
                  padding: '6px 8px',
                }}
              >
                {CURRENCY_SELECT_OPTIONS.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                value={priceDraft}
                onChange={(e) => setPriceDraft(e.target.value)}
                onBlur={() => void savePrice()}
                placeholder="e.g. 200"
                disabled={!detailsLoaded}
                className={`w-24 px-2 py-1.5 rounded-lg border border-[var(--space-border-default)] bg-[var(--space-surface-card)] ${typography.size.sm} focus:outline-none focus:ring-1 focus:ring-[var(--space-brand-primary)] disabled:opacity-60`}
                aria-label="Price paid"
              />
            </span>
          </label>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => void addWear()}
            disabled={wearBusy || !detailsLoaded}
            className={`px-3 py-1.5 rounded-lg ${typography.size.xs} ${tw.button.secondary} inline-flex items-center gap-1 disabled:opacity-50`}
            title="Wore it today — add one wear"
          >
            {wearBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Wore it
          </button>
        </div>

        {/* CONDITION & CARE — freeform, edited in place: blur or Enter
            saves; there is no separate form for these. */}
        <div className="grid sm:grid-cols-2 gap-3 mt-3 pt-3 border-t border-[var(--space-border-default)]">
          <label className={`${typography.size.xs} ${typography.color.muted}`}>
            Condition
            <input
              type="text"
              value={conditionDraft}
              onChange={(e) => setConditionDraft(e.target.value)}
              onBlur={() => void saveConditionNotes()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  (e.target as HTMLInputElement).blur();
                }
              }}
              placeholder="e.g. excellent · collar fraying · needs resoling"
              disabled={!detailsLoaded}
              className={`mt-1 w-full px-3 py-2 rounded-lg border border-[var(--space-border-default)] bg-[var(--space-surface-card)] ${typography.size.sm} focus:outline-none focus:ring-1 focus:ring-[var(--space-brand-primary)] disabled:opacity-60`}
              aria-label="Condition note — saves when you leave the field"
            />
          </label>
          <label className={`${typography.size.xs} ${typography.color.muted}`}>
            Care instructions — yours
            <input
              type="text"
              value={careDraft}
              onChange={(e) => setCareDraft(e.target.value)}
              onBlur={() => void saveConditionNotes()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  (e.target as HTMLInputElement).blur();
                }
              }}
              placeholder="e.g. cold hand wash · cedar trees in · no tumble"
              disabled={!detailsLoaded}
              className={`mt-1 w-full px-3 py-2 rounded-lg border border-[var(--space-border-default)] bg-[var(--space-surface-card)] ${typography.size.sm} focus:outline-none focus:ring-1 focus:ring-[var(--space-brand-primary)] disabled:opacity-60`}
              aria-label="Your care instructions — saves when you leave the field"
            />
          </label>
          {noteFlash && (
            <p className={`${typography.size.xs} sm:col-span-2`} style={{ color: 'var(--color-accent-700,#7c4a17)' }} aria-live="polite">
              {noteFlash} Edits here save themselves — on blur or Enter.
            </p>
          )}
        </div>
      </div>

      {/* LOOKS IT HAS BEEN IN (16a · M3): the looks this piece has entered —
          worn line per look, proposals named as such. Absent entirely when
          the piece has never been on a saved board; never an error. */}
      {looksIn.length > 0 && (
        <div className="mt-4 rounded-xl border border-[var(--space-border-default)] px-4 py-3.5">
          <p className={`${typography.size.xs} uppercase tracking-[0.15em] ${typography.color.secondary}`}>
            Looks it has been in
          </p>
          <div className="divide-y divide-[var(--space-border-default)] mt-1">
            {looksIn.map((look) => (
              <div key={look.id} className="py-2 flex items-baseline justify-between gap-3 flex-wrap">
                <span className={`${typography.color.primary} min-w-0 truncate`} style={{ fontFamily: 'var(--space-font-heading)', fontSize: '15px', lineHeight: 1.3 }}>
                  {look.name}
                </span>
                <span className={`${typography.size.xs} ${typography.color.muted} flex-shrink-0`}>
                  {look.proposal
                    ? 'Proposal — holds a piece you don\u2019t own yet'
                    : look.timesWorn > 0
                      ? `Worn ${look.timesWorn}\u00d7 · ${lookAgoLabel(look.lastWornAt)}`
                      : 'Not yet worn'}
                </span>
              </div>
            ))}
          </div>
          <p className={`${typography.size.xs} ${typography.color.muted} mt-1.5`} style={{ fontSize: 'max(var(--eth-micro, 0px), 10px)' }}>
            “Wore it” on a saved look moves this piece’s counter too — cost per wear follows real life.
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 mt-4 flex-wrap">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !nameDraft.trim()}
          className={`px-4 py-2 rounded-lg ${typography.size.sm} inline-flex items-center gap-1.5 ${tw.button.primary} disabled:opacity-50`}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          Save changes
        </button>
        <div className="flex-1" />
        {allowDelete && (
          !confirmingDelete ? (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className={`px-3 py-2 rounded-lg ${typography.size.xs} ${tw.button.ghost} border border-[var(--space-border-default)] inline-flex items-center gap-1.5`}
            >
              <Trash2 className="w-3.5 h-3.5" /> Remove piece
            </button>
          ) : (
            <span className="inline-flex items-center gap-2">
              <span className={`${typography.size.xs} ${typography.color.primary}`}>From your whole wardrobe?</span>
              <button
                type="button"
                onClick={() => void doDelete()}
                disabled={deleting}
                className={`px-2.5 py-1.5 rounded-lg ${typography.size.xs} ${tw.button.danger} inline-flex items-center gap-1 disabled:opacity-50`}
              >
                {deleting && <Loader2 className="w-3 h-3 animate-spin" />} Yes, remove
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className={`px-2.5 py-1.5 rounded-lg ${typography.size.xs} ${tw.button.ghost} border border-[var(--space-border-default)]`}
              >
                Keep
              </button>
            </span>
          )
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal wrapper — the bottom sheet used by The Rail and the wardrobe tracker.
// ---------------------------------------------------------------------------

export function PieceEditSheet({
  piece,
  material,
  onClose,
  onChanged,
}: {
  piece: WardrobePiece;
  material: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  return (
    <div
      className="fixed left-0 right-0 bottom-0 top-[88px] sm:top-[104px] z-50 flex items-end sm:items-center justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Edit ${piece.name}`}
    >
      <span className="absolute inset-0 bg-[var(--space-shell-shadow-strong)]" aria-hidden="true" />
      <div
        className="relative w-full sm:max-w-md sm:mx-4 bg-[var(--space-surface-card)] rounded-t-2xl sm:rounded-2xl p-5 shadow-xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h4 className={`${typography.size.base} ${typography.weight.semibold} ${typography.color.primary} truncate`}>
              {piece.name}
            </h4>
            <p className={`${typography.size.xs} ${typography.color.muted}`}>
              Edits here update every view — same piece, one record.
            </p>
            <span className="block mt-2" style={{ fontFamily: 'var(--space-font-family)' }}>
              <span className="block text-[var(--color-neutral-500,#a68e70)]" style={{ fontSize: 'max(var(--eth-label, 0px), 12px)', lineHeight: 1.35 }}>
                Brand
              </span>
              <span
                className="block text-[var(--color-text,#3b2b1d)]"
                style={{ fontSize: piece.brand?.trim() ? 'max(var(--eth-body, 0px), 14px)' : 'max(var(--eth-label, 0px), 12px)', lineHeight: 1.45 }}
              >
                {piece.brand?.trim() ? piece.brand.trim().toUpperCase() : '—'}
              </span>
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`px-2 py-1 rounded-lg ${typography.size.xs} hover:bg-[var(--space-surface-muted)] text-[var(--space-text-muted)] flex-shrink-0`}
            aria-label="Close"
          >
            Close
          </button>
        </div>
        <PieceEditForm piece={piece} material={material} onSaved={onChanged} onClose={onClose} />
      </div>
    </div>
  );
}
