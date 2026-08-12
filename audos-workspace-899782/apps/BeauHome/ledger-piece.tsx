/**
 * THE LEDGER · THE PIECE SHEET (the reference design's modal).
 *
 * Opening a piece is not a detail view — it is the one place the man
 * CORRECTS Beau, and everything on it writes straight through to the record:
 *
 *   · What it is, the maker, the cloth, the colour → wardrobe_pieces (and
 *     piece_materials for the cloth), the same writes every other edit
 *     surface makes, so a correction here re-tags the piece and re-derives
 *     its temperature band exactly as it would anywhere else.
 *   · The temperature band → piece_warmth, marked as HIS override rather
 *     than the app's inference, because he is the one wearing it.
 *   · The condition → piece_condition.
 *   · How it fits, how he feels in it, where he actually wears it, what has
 *     been altered, and anything Beau should know → piece_ledger
 *     (ledger-notes.ts). Those four are what put a piece in — or keep it out
 *     of — “What Beau would cut”.
 *
 * Nothing is behind a Save: every answer saves itself as it is given (on
 * blur, on Enter, on tap), the sheet says so, and Done just closes it. A
 * correction that changes what the piece MEANS queues Beau's re-read the
 * same way every other save does — it never blocks the sheet.
 *
 * The two ways out are the design's own: this piece's own entry in The Index,
 * and Beau's picks for its slot in The Hunt.
 */
import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import { Loader2 } from 'lucide-react';
import { deletePiece, setPieceCondition, updatePiece } from './profile-data';
import {
  ACCENT,
  ACCENT_DEEP,
  FAINT,
  INK,
  MUTED,
  PAPER,
  SECONDARY,
  WALNUT,
  body,
  mono,
  serif,
} from './index-style';
import { findGarmentType, matchGarmentTypeId, pieceIndexCategory } from './index-model';
import { openInBeausPicks, openInTheIndex } from './edit-links';
import { queueWardrobeReassessment } from './reassess-queue';
import { inferWarmth, savePieceWarmth } from './warmth-model';
import {
  attachAndSettleProductPhoto,
  compressImage,
  garmentFieldsFromPiece,
  uploadGarmentPhotoFast,
} from './photo-enhance';
import {
  LEDGER_FEELINGS,
  LEDGER_FITS,
  LEDGER_WEAR_CONTEXTS,
  emptyLedgerNote,
  setLedgerNote,
  type LedgerNote,
  type LedgerNotePatch,
} from './ledger-notes';
import { READ_INK, UNREAD_CLOTH, type LedgerPieceRow } from './ledger-model';

/** The hatched frame a piece with no photograph shows — the design's own. */
const HATCH = 'repeating-linear-gradient(45deg,rgba(59,43,29,0.07) 0 5px,rgba(59,43,29,0) 5px 10px)';

const MIDDOT = '\u00b7';

// ---------------------------------------------------------------------------
// The furniture: one square chip, one hairline field. Square corners, no
// shadows, no radius — the reference sets every control this way.
// ---------------------------------------------------------------------------

function Choice({
  label,
  active,
  onClick,
  small = false,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="transition-colors hover:border-[#a8712c]"
      style={{
        ...mono(9.5, active ? WALNUT : SECONDARY),
        border: `1px solid ${active ? ACCENT : 'rgba(59,43,29,0.28)'}`,
        background: active ? 'rgba(168,113,44,0.14)' : 'transparent',
        padding: small ? '5px 12px' : '6px 13px',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}

const INPUT_STYLE: React.CSSProperties = {
  padding: '8px 11px',
  border: '1px solid rgba(59,43,29,0.3)',
  background: PAPER,
  fontFamily: 'var(--space-font-family)',
  fontSize: '13.5px',
  color: WALNUT,
  outline: 'none',
  borderRadius: 0,
  width: '100%',
  boxSizing: 'border-box',
};

function Field({
  label,
  value,
  hint,
  onCommit,
}: {
  label?: string;
  value: string;
  hint: string;
  onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const committed = useRef(value);
  useEffect(() => {
    // A value that changed underneath the sheet (the band re-derived after a
    // cloth correction) lands — but never over what he is typing.
    if (value !== committed.current && draft === committed.current) {
      committed.current = value;
      setDraft(value);
    }
  }, [value, draft]);
  const commit = () => {
    const next = draft.trim();
    if (next === committed.current.trim()) return;
    committed.current = next;
    onCommit(next);
  };
  return (
    <label className="flex flex-col" style={{ gap: '5px' }}>
      {label ? <span style={mono(8.5, MUTED)}>{label}</span> : null}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        }}
        placeholder={hint}
        style={INPUT_STYLE}
      />
    </label>
  );
}

function SheetSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid rgba(59,43,29,0.2)' }}>
      <div style={mono(9, FAINT)}>{label}</div>
      {children}
    </div>
  );
}

/** “8–16°”, “8 to 16”, “−2 – 14 C” — the two numbers, whichever way round. */
function parseBand(raw: string): { min: number; max: number } | null {
  const numbers = (raw.match(/-?\d+(?:\.\d+)?/g) || []).map(Number).filter((n) => Number.isFinite(n));
  if (numbers.length < 2) return null;
  const min = Math.round(Math.min(numbers[0], numbers[1]));
  const max = Math.round(Math.max(numbers[0], numbers[1]));
  return max - min < 1 ? null : { min, max };
}

// ---------------------------------------------------------------------------
// The sheet
// ---------------------------------------------------------------------------

export function LedgerPieceSheet({
  row,
  onClose,
  onChanged,
  onNote,
}: {
  row: LedgerPieceRow;
  onClose: () => void;
  /** The record moved — the tab re-reads the pieces and their companions. */
  onChanged: () => void;
  /** A correction to piece_ledger, handed back so the tab paints it at once. */
  onNote: (note: LedgerNote) => void;
}) {
  const [photoBusy, setPhotoBusy] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [note, setNote] = useState<LedgerNote>(() => ({
    ...emptyLedgerNote(row.id),
    fit: row.fit,
    feel: row.feel,
    wearContexts: row.wearContexts,
    tailoring: row.tailoring,
    note: row.ownNote,
    call: row.call,
  }));

  // Escape closes the sheet, as every overlay in the app does.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const said = (message: string) => {
    setFlash(message);
    window.setTimeout(() => setFlash(null), 2200);
  };

  const saveNote = (patch: LedgerNotePatch) => {
    const next: LedgerNote = {
      ...note,
      ...(patch.fit !== undefined ? { fit: patch.fit } : {}),
      ...(patch.feel !== undefined ? { feel: patch.feel } : {}),
      ...(patch.wearContexts !== undefined ? { wearContexts: patch.wearContexts } : {}),
      ...(patch.tailoring !== undefined ? { tailoring: patch.tailoring } : {}),
      ...(patch.note !== undefined ? { note: patch.note } : {}),
      ...(patch.call !== undefined ? { call: patch.call } : {}),
    };
    setNote(next);
    onNote(next);
    void setLedgerNote(row.id, patch, next).then(() =>
      queueWardrobeReassessment('the ledger sheet: how it fits, feels or where it is worn'),
    );
  };

  const savePiece = (patch: Parameters<typeof updatePiece>[1], message: string) => {
    void updatePiece(row.id, patch)
      .then(() => {
        said(message);
        onChanged();
        queueWardrobeReassessment('the ledger sheet: what the piece is');
      })
      .catch((e) => console.warn('[Ethaion] ledger correction failed (non-fatal):', e));
  };

  const onPhoto = async (file: File | null | undefined) => {
    if (!file || photoBusy) return;
    setPhotoBusy(true);
    setLocalPreview(URL.createObjectURL(file));
    try {
      const compressed = await compressImage(file);
      const { url } = await uploadGarmentPhotoFast(compressed, true);
      if (url) {
        await attachAndSettleProductPhoto(
          row.id,
          url,
          garmentFieldsFromPiece(
            {
              name: row.name,
              category: row.piece.category,
              slot: row.piece.slot,
              colors: row.piece.colors || [],
              brand: row.piece.brand,
            },
            row.cloth === UNREAD_CLOTH ? null : row.cloth,
            (row.piece as { pattern?: string | null }).pattern || null,
          ),
        );
        onChanged();
        said('Photograph replaced.');
      }
    } catch (e) {
      console.warn('[Ethaion] photograph replace failed (non-fatal):', e);
    } finally {
      setLocalPreview(null);
      setPhotoBusy(false);
    }
  };

  const remove = () => {
    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    void deletePiece(row.id)
      .then(() => {
        onChanged();
        queueWardrobeReassessment('a piece removed from the ledger');
        onClose();
      })
      .catch((e) => console.warn('[Ethaion] remove from the ledger failed:', e));
  };

  // The two ways out — this piece's own entry in The Index, and Beau's picks
  // for its slot in The Hunt.
  const typeId = matchGarmentTypeId({ name: row.name, slot: row.piece.slot, category: row.piece.category });
  const type = typeId ? findGarmentType(typeId) : null;
  const indexCategory = pieceIndexCategory(row.piece);
  const huntLabel =
    row.read === 'Worn out' || row.read === 'Wrong register' ? 'Replace it in the Hunt' : "Beau's picks for this slot";

  const saveNoteLine = [
    'Saved as you answer',
    note.wearContexts.length > 0
      ? `${note.wearContexts.length} ${note.wearContexts.length === 1 ? 'place' : 'places'} you wear it`
      : 'no places set yet',
    (note.fit || 'fit not set').toLowerCase(),
  ].join(` ${MIDDOT} `);

  const photo = localPreview || row.photo;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={row.name}
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-auto"
      style={{ background: 'rgba(36,26,18,0.55)', padding: '56px 24px' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full"
        style={{
          maxWidth: '1020px',
          maxHeight: '82vh',
          overflow: 'auto',
          background: 'var(--space-surface-page, #efe7d9)',
          border: `1px solid ${WALNUT}`,
          boxShadow: '0 24px 60px rgba(36,26,18,0.35)',
        }}
      >
        {/* The header — what it is, and the way out. */}
        <div
          className="flex items-baseline justify-between flex-wrap sticky top-0"
          style={{ gap: '20px', padding: '16px 24px', borderBottom: `1px solid ${INK}`, background: PAPER }}
        >
          <div className="flex items-baseline flex-wrap" style={{ gap: '12px' }}>
            <span style={mono(9, ACCENT_DEEP)}>{`${row.categoryName} ${MIDDOT} ${row.sub}`}</span>
            <span style={{ ...serif(25, WALNUT), lineHeight: 1.1 }}>{row.name}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="transition-colors hover:border-[#a8712c]"
            style={{ ...mono(9, SECONDARY), border: '1px solid rgba(59,43,29,0.35)', padding: '6px 13px' }}
          >
            Close ×
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[250px_minmax(0,1fr)]">
          {/* THE PHOTOGRAPH, HIS READ, AND THE TWO WAYS OUT. */}
          <div style={{ padding: '22px 22px 24px', borderRight: '1px solid rgba(59,43,29,0.2)' }}>
            <div
              className="flex items-center justify-center overflow-hidden"
              style={{
                height: '280px',
                border: '1px solid rgba(59,43,29,0.28)',
                background: photo ? PAPER : HATCH,
              }}
            >
              {photo ? (
                <img src={photo} alt={row.name} className="w-full h-full" style={{ objectFit: 'contain' }} />
              ) : (
                <span style={mono(8, FAINT)}>No photograph yet</span>
              )}
            </div>
            <label
              className="block text-center transition-colors hover:border-[#a8712c] cursor-pointer"
              style={{
                ...mono(9, SECONDARY),
                marginTop: '10px',
                padding: '8px 12px',
                border: '1px solid rgba(59,43,29,0.35)',
              }}
            >
              {photoBusy ? (
                <span className="inline-flex items-center" style={{ gap: '6px' }}>
                  <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> Reading it
                </span>
              ) : row.photo ? (
                'Replace photograph'
              ) : (
                'Add a photograph'
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  void onPhoto(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>

            <div style={{ marginTop: '18px', paddingTop: '14px', borderTop: '1px solid rgba(59,43,29,0.2)' }}>
              <div style={mono(9, READ_INK[row.read])}>{row.read}</div>
              <p style={{ ...body(13, SECONDARY), margin: '7px 0 0', lineHeight: 1.5 }}>{row.note}</p>
            </div>

            <div className="flex flex-col" style={{ marginTop: '16px', gap: '7px' }}>
              <button
                type="button"
                title={type ? `Open “${type.name}” in the Index` : 'Look this piece up in the Index'}
                onClick={() => {
                  if (typeId) openInTheIndex({ typeId });
                  else window.dispatchEvent(new CustomEvent('ethaion:navigate', { detail: { tab: 'index' } }));
                }}
                className="transition-colors hover:border-[#a8712c]"
                style={{
                  ...mono(9, SECONDARY),
                  padding: '8px 12px',
                  border: '1px solid rgba(59,43,29,0.35)',
                  textAlign: 'center',
                }}
              >
                {type ? 'In the Index →' : 'Look it up in the Index →'}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (indexCategory) openInBeausPicks({ categoryId: indexCategory, subCategory: row.sub });
                  else window.dispatchEvent(new CustomEvent('ethaion:navigate', { detail: { tab: 'hunt' } }));
                }}
                style={{
                  ...mono(9, WALNUT),
                  padding: '8px 12px',
                  border: `1px solid ${ACCENT}`,
                  background: 'rgba(168,113,44,0.12)',
                  textAlign: 'center',
                }}
              >
                {`${huntLabel} \u2192`}
              </button>
            </div>
          </div>

          {/* WHAT IT IS — and everything he can correct. */}
          <div style={{ padding: '22px 24px 26px' }}>
            <div style={mono(9, FAINT)}>{`What it is ${MIDDOT} correct anything Beau got wrong`}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2" style={{ marginTop: '12px', gap: '14px 20px' }}>
              <Field
                label="What it is"
                value={row.name}
                hint="wool overshirt, olive"
                onCommit={(next) => {
                  if (next) savePiece({ name: next, name_is_custom: true }, 'Noted — your label, kept as you wrote it.');
                }}
              />
              <Field
                label="Maker"
                value={row.maker}
                hint="who made it"
                onCommit={(next) => savePiece({ brand: next || null }, 'Maker noted.')}
              />
              <Field
                label="Cloth"
                value={row.cloth === UNREAD_CLOTH ? '' : row.cloth}
                hint="600g wool, brushed cotton"
                onCommit={(next) => savePiece({ material: next || null }, 'Cloth noted — the band follows it.')}
              />
              <Field
                label="Colour"
                value={row.colour}
                hint="charcoal, olive, tobacco"
                onCommit={(next) => {
                  const rest = (row.piece.colors || []).slice(1);
                  savePiece({ colors: next ? [next, ...rest] : rest }, 'Colour noted.');
                }}
              />
              <Field
                label="Temperature band"
                value={row.bandMin != null && row.bandMax != null ? `${row.bandMin}\u2013${row.bandMax}\u00b0` : ''}
                hint={`8\u201316\u00b0`}
                onCommit={(next) => {
                  const parsed = parseBand(next);
                  if (!parsed) return;
                  const inferred = inferWarmth(
                    {
                      category: row.piece.category,
                      slot: row.piece.slot,
                      name: row.name,
                      seasons: row.piece.seasons,
                    },
                    row.cloth === UNREAD_CLOTH ? null : row.cloth,
                  );
                  void savePieceWarmth(
                    row.id,
                    { ...inferred, min_comfortable_temp_c: parsed.min, max_comfortable_temp_c: parsed.max },
                    'user',
                  ).then(() => {
                    said('Band noted — Beau dresses you by yours, not his.');
                    onChanged();
                  });
                }}
              />
              <Field
                label="Condition"
                value={row.condition || ''}
                hint="new, good, fair, tired"
                onCommit={(next) => {
                  void setPieceCondition(row.id, { condition_note: next || null }).then(() => {
                    said('Condition noted.');
                    onChanged();
                  });
                }}
              />
            </div>

            <SheetSection label="How it fits you">
              <div className="flex flex-wrap" style={{ marginTop: '9px', gap: '6px' }}>
                {LEDGER_FITS.map((fit) => (
                  <Choice
                    key={fit}
                    label={fit}
                    active={note.fit === fit}
                    onClick={() => saveNote({ fit: note.fit === fit ? null : fit })}
                  />
                ))}
              </div>
            </SheetSection>

            <SheetSection label="Where you actually wear it">
              <div className="flex flex-wrap" style={{ marginTop: '9px', gap: '6px' }}>
                {LEDGER_WEAR_CONTEXTS.map((place) => {
                  const on = note.wearContexts.includes(place);
                  return (
                    <Choice
                      key={place}
                      label={place}
                      small
                      active={on}
                      onClick={() =>
                        saveNote({
                          wearContexts: on
                            ? note.wearContexts.filter((p) => p !== place)
                            : [...note.wearContexts, place],
                        })
                      }
                    />
                  );
                })}
              </div>
            </SheetSection>

            <div
              className="grid grid-cols-1 sm:grid-cols-2"
              style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid rgba(59,43,29,0.2)', gap: '18px' }}
            >
              <div>
                <div style={mono(9, FAINT)}>How you feel in it</div>
                <div className="flex flex-wrap" style={{ marginTop: '9px', gap: '6px' }}>
                  {LEDGER_FEELINGS.map((feeling) => (
                    <Choice
                      key={feeling}
                      label={feeling}
                      small
                      active={note.feel === feeling}
                      onClick={() => saveNote({ feel: note.feel === feeling ? null : feeling })}
                    />
                  ))}
                </div>
              </div>
              <div>
                <div style={mono(9, FAINT)}>Altered or repaired</div>
                <div style={{ marginTop: '9px' }}>
                  <Field
                    value={note.tailoring || ''}
                    hint="sleeves −1.5cm, waist taken in"
                    onCommit={(next) => saveNote({ tailoring: next || null })}
                  />
                </div>
              </div>
            </div>

            <SheetSection label={`Anything Beau should know ${MIDDOT} he reads this before he recommends`}>
              <textarea
                rows={3}
                defaultValue={note.note || ''}
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  if (next !== (note.note || '')) saveNote({ note: next || null });
                }}
                placeholder="what you like about it, what stops you reaching for it, what you would change"
                style={{ ...INPUT_STYLE, marginTop: '9px', padding: '10px 12px', resize: 'vertical', lineHeight: 1.5 }}
              />
            </SheetSection>

            <div
              className="flex items-center justify-between flex-wrap"
              style={{ marginTop: '18px', paddingTop: '14px', borderTop: `1px solid ${INK}`, gap: '16px' }}
            >
              <span aria-live="polite" style={mono(9, ACCENT_DEEP)}>
                {flash || saveNoteLine}
              </span>
              <div className="flex" style={{ gap: '8px' }}>
                <button
                  type="button"
                  onClick={remove}
                  className="transition-colors hover:border-[#a8712c]"
                  style={{
                    ...mono(9, confirmRemove ? WALNUT : MUTED),
                    padding: '9px 15px',
                    border: `1px solid ${confirmRemove ? ACCENT_DEEP : 'rgba(59,43,29,0.3)'}`,
                  }}
                >
                  {confirmRemove ? 'Tap again to remove it' : 'Remove from the Ledger'}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    fontFamily: 'var(--space-font-heading)',
                    fontSize: '13px',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    padding: '9px 18px',
                    background: WALNUT,
                    color: '#f6f0e5',
                    border: 'none',
                    borderRadius: 0,
                  }}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
