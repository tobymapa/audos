/**
 * THE LEDGER · WHAT HE TELLS BEAU ABOUT A PIECE (the `piece_ledger`
 * companion table).
 *
 * wardrobe_pieces cannot gain a column, and four of the piece sheet's
 * answers are not facts about the garment — they are facts about the man
 * WEARING it, which is exactly what makes them worth storing:
 *
 *   · FIT — how it actually sits on him, not how it is cut. MULTI-SELECT
 *     (founder's correction): a jacket can be snug AND wrong in the
 *     shoulder at once, so the answers are held as a list. The `fit`
 *     column stays one text field — a JSON array — and a legacy row
 *     holding a bare single answer still reads as a one-item list.
 *   · FEEL — whether he reaches for it, tolerates it, or never quite feels
 *     right in it. This is the single strongest signal on the tab: it is
 *     what puts a piece in “What Beau would cut”, and no amount of good
 *     cloth overrules it.
 *   · WHERE HE WEARS IT — the real occasions, in the words the sheet uses.
 *     Deliberately NOT the register tags on wardrobe_pieces (casual /
 *     smart-casual / business / formal): those drive the coverage map, and
 *     writing “City walking” into them would corrupt every read that
 *     depends on them.
 *   · ALTERED OR REPAIRED, and anything else Beau should know before he
 *     recommends.
 *
 * The call made in the cut table (keep / retire / sell) lives here too, so
 * an override survives the session — the override is part of the record.
 *
 * Nothing here throws: a companion row that will not read simply means the
 * sheet opens with empty answers.
 */

/** How it fits him — the sheet's five answers, in the sheet's order.
 * Multi-select: he can hold more than one at a time. */
export const LEDGER_FITS = [
  'Fits as it should',
  'Snug',
  'Loose',
  'Wrong shoulder',
  'Too short in the body',
];

/** How he feels in it — four answers, and the second is not a failure.
 * 'Altered or repaired' says the piece earned work to keep it — the free-text
 * field beside it records exactly what was done. */
export const LEDGER_FEELINGS = ['Reach for it', 'Fine, unremarkable', 'Never quite right', 'Altered or repaired'];

/** Where he actually wears it. */
export const LEDGER_WEAR_CONTEXTS = [
  'Work',
  'Client meetings',
  'City walking',
  'Restaurants',
  'Weekends',
  'Travel',
  'Weddings',
  'Indoors only',
];

export type LedgerCall = 'keep' | 'retire' | 'sell';

export interface LedgerNote {
  pieceId: number;
  /** How it fits him — zero or more of LEDGER_FITS. */
  fits: string[];
  feel: string | null;
  wearContexts: string[];
  tailoring: string | null;
  note: string | null;
  call: LedgerCall | null;
}

export interface LedgerNotePatch {
  fits?: string[];
  feel?: string | null;
  wearContexts?: string[];
  tailoring?: string | null;
  note?: string | null;
  call?: LedgerCall | null;
}

/** Raised after a correction lands, so every open surface re-reads. */
export const LEDGER_NOTES_EVENT = 'ethaion:ledger-notes';

export function emptyLedgerNote(pieceId: number): LedgerNote {
  return { pieceId, fits: [], feel: null, wearContexts: [], tailoring: null, note: null, call: null };
}

// window.__workspaceDb is auto-injected by the platform compiler when it
// sees this literal token in app source.
function ws(): any {
  return (window as any).__workspaceDb;
}

function contextsOf(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((v) => typeof v === 'string');
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((v) => typeof v === 'string');
    } catch {
      /* a malformed value is simply no answer */
    }
  }
  return [];
}

/** The fit column, whichever era wrote it: a JSON array (multi-select), or
 * the single bare answer older rows hold — read as a one-item list. */
function fitsOf(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((v) => typeof v === 'string');
  if (typeof raw === 'string' && raw.trim()) {
    const text = raw.trim();
    if (text.startsWith('[')) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return parsed.filter((v) => typeof v === 'string');
      } catch {
        /* fall through to the legacy single-answer read */
      }
    }
    return [text];
  }
  return [];
}

function callOf(raw: unknown): LedgerCall | null {
  return raw === 'keep' || raw === 'retire' || raw === 'sell' ? raw : null;
}

function rowToNote(row: any): LedgerNote | null {
  const pieceId = Number(row?.piece_id);
  if (!Number.isFinite(pieceId) || pieceId <= 0) return null;
  return {
    pieceId,
    fits: fitsOf(row.fit),
    feel: row.feel || null,
    wearContexts: contextsOf(row.wear_contexts),
    tailoring: row.tailoring || null,
    note: row.note || null,
    call: callOf(row.call),
  };
}

/** Every correction on file, keyed by piece id. */
export async function fetchLedgerNotes(): Promise<Record<number, LedgerNote>> {
  try {
    const { data } = await ws().from('piece_ledger').orderBy('created_at', 'asc').limit(500).get();
    const out: Record<number, LedgerNote> = {};
    for (const row of data || []) {
      const note = rowToNote(row);
      if (note) out[note.pieceId] = note;
    }
    return out;
  } catch (e) {
    console.warn('[Ethaion] ledger corrections fetch failed (non-fatal):', e);
    return {};
  }
}

function fieldsOf(patch: LedgerNotePatch): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  if (patch.fits !== undefined) fields.fit = patch.fits.length > 0 ? JSON.stringify(patch.fits) : null;
  if (patch.feel !== undefined) fields.feel = patch.feel || null;
  if (patch.wearContexts !== undefined) fields.wear_contexts = JSON.stringify(patch.wearContexts);
  if (patch.tailoring !== undefined) fields.tailoring = (patch.tailoring || '').trim() || null;
  if (patch.note !== undefined) fields.note = (patch.note || '').trim() || null;
  if (patch.call !== undefined) fields.call = patch.call || null;
  return fields;
}

/**
 * Upsert one piece's corrections. Returns the row as it now stands so the
 * sheet can hold it without a re-read, and raises LEDGER_NOTES_EVENT so the
 * rest of the tab (the per-piece read, the cut table) follows.
 */
export async function setLedgerNote(
  pieceId: number,
  patch: LedgerNotePatch,
  current?: LedgerNote | null,
): Promise<LedgerNote> {
  const merged: LedgerNote = {
    ...(current || emptyLedgerNote(pieceId)),
    ...(patch.fits !== undefined ? { fits: patch.fits } : {}),
    ...(patch.feel !== undefined ? { feel: patch.feel } : {}),
    ...(patch.wearContexts !== undefined ? { wearContexts: patch.wearContexts } : {}),
    ...(patch.tailoring !== undefined ? { tailoring: patch.tailoring } : {}),
    ...(patch.note !== undefined ? { note: patch.note } : {}),
    ...(patch.call !== undefined ? { call: patch.call } : {}),
    pieceId,
  };
  const fields = fieldsOf(patch);
  if (Object.keys(fields).length === 0) return merged;
  try {
    const { data } = await ws().from('piece_ledger').eq('piece_id', pieceId).limit(2).get();
    const existing = data?.[0];
    if (existing) await ws().from('piece_ledger').update(existing.id, fields);
    else await ws().from('piece_ledger').insert({ piece_id: pieceId, ...fields });
    window.dispatchEvent(new CustomEvent(LEDGER_NOTES_EVENT, { detail: { pieceId } }));
  } catch (e) {
    console.warn('[Ethaion] ledger correction save failed (non-fatal):', e);
  }
  return merged;
}
