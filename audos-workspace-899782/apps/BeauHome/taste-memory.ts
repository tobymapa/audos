/**
 * TASTE MEMORY — what Beau remembers the user has turned down.
 *
 * The Curated feed's "Not feeling this?" sheet retunes the CURRENT SESSION
 * only. Taste memory is the permanent half: when the user dismisses one of
 * Beau's recommendations outright ("Not for me"), the piece, its semantic
 * sub-type and his reason are written to the dismissed_recommendations
 * table and passed into every future Layer 2 assessment.
 *
 * The rule Beau follows (stated in his assessment prompt): never resurface a
 * dismissed piece in the same form. If the user dismissed a white OCBD, the
 * gap is still real — Beau acknowledges it and offers chambray or linen
 * instead.
 *
 * Dismissals are reversible: The Edit tab lists them and one tap puts a
 * piece back in play, which invalidates the assessment cache so Beau
 * re-reasons with it available again.
 */

// window.__workspaceDb is auto-injected by the platform compiler when it
// sees this literal token in app source.
function ws(): any {
  return (window as any).__workspaceDb;
}

export interface DismissedRecommendation {
  id: number;
  pieceName: string;
  subType: string | null;
  category: string | null;
  archetypesServed: string[];
  reason: string | null;
  source: string | null;
  dismissedAt: string | null;
}

export interface DismissInput {
  pieceName: string;
  subType?: string | null;
  category?: string | null;
  archetypesServed?: string[];
  reason?: string | null;
  /** 'edit' (The Edit tab), 'curated', or 'chat'. */
  source?: string;
}

/** Fired whenever the taste memory changes, so live surfaces can refresh. */
export const TASTE_MEMORY_EVENT = 'ethaion:taste-memory-updated';

function parseArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string');
  if (typeof v === 'string' && v.trim()) {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed.filter((x: unknown) => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }
  return [];
}

function rowToDismissal(row: any): DismissedRecommendation {
  return {
    id: Number(row.id),
    pieceName: row.piece_name || '',
    subType: row.sub_type || null,
    category: row.category || null,
    archetypesServed: parseArray(row.archetypes_served),
    reason: row.reason || null,
    source: row.source || null,
    dismissedAt: row.dismissed_at || row.created_at || null,
  };
}

/** Everything this visitor has turned down, newest first. */
export async function fetchDismissedRecommendations(): Promise<DismissedRecommendation[]> {
  try {
    const { data } = await ws().from('dismissed_recommendations').orderBy('created_at', 'desc').limit(60).get();
    return (data || []).map(rowToDismissal).filter((d: DismissedRecommendation) => d.pieceName);
  } catch (e) {
    console.warn('[Ethaion] taste memory fetch failed (non-fatal):', e);
    return [];
  }
}

/**
 * Remember that the user turned this recommendation down. Idempotent on
 * piece name: dismissing the same piece twice updates the reason instead of
 * stacking rows.
 */
export async function dismissRecommendation(input: DismissInput): Promise<DismissedRecommendation | null> {
  const pieceName = (input.pieceName || '').trim();
  if (!pieceName) return null;
  const fields = {
    piece_name: pieceName,
    sub_type: input.subType || null,
    category: input.category || null,
    archetypes_served: JSON.stringify(input.archetypesServed || []),
    reason: (input.reason || '').trim() || null,
    source: input.source || 'edit',
    dismissed_at: new Date().toISOString(),
  };
  try {
    const { data } = await ws().from('dismissed_recommendations').eq('piece_name', pieceName).limit(5).get();
    const existing = data?.[0] || null;
    if (existing) {
      await ws().from('dismissed_recommendations').update(existing.id, fields);
      window.dispatchEvent(new CustomEvent(TASTE_MEMORY_EVENT));
      return rowToDismissal({ ...existing, ...fields });
    }
    await ws().from('dismissed_recommendations').insert(fields);
    window.dispatchEvent(new CustomEvent(TASTE_MEMORY_EVENT));
    // Read the row back for its id, so a restore tap works immediately.
    const { data: fresh } = await ws().from('dismissed_recommendations').eq('piece_name', pieceName).limit(1).get();
    return rowToDismissal(fresh?.[0] || { id: 0, ...fields });
  } catch (e) {
    console.warn('[Ethaion] could not record the dismissal:', e);
    return null;
  }
}

/** Put a dismissed piece back in play. */
export async function restoreRecommendation(id: number): Promise<boolean> {
  try {
    await ws().from('dismissed_recommendations').delete(id);
    window.dispatchEvent(new CustomEvent(TASTE_MEMORY_EVENT));
    return true;
  } catch (e) {
    console.warn('[Ethaion] could not restore the dismissed piece:', e);
    return false;
  }
}

/** The payload shape Beau's Layer 2 assessment receives. */
export function dismissalsForPrompt(list: DismissedRecommendation[]): Array<Record<string, unknown>> {
  return list.slice(0, 30).map((d) => ({
    pieceName: d.pieceName,
    subType: d.subType,
    category: d.category,
    dismissedAt: d.dismissedAt,
    reason: d.reason,
  }));
}

/** A signature of the taste memory, for the assessment cache fingerprint. */
export function dismissalSignature(list: DismissedRecommendation[]): string {
  return list
    .map((d) => `${d.id}:${d.pieceName}:${d.reason || ''}`)
    .sort()
    .join('|');
}
