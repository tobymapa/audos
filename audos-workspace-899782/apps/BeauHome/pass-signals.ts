/**
 * PASS SIGNALS — what the user's passes teach the rest of the app (build
 * brief rule 9: "a pass teaches; an archive doesn't", screens 12a · M12).
 *
 * A pass is the cheapest signal in the product, and it has CONSEQUENCES:
 *   · TWO passes on a maker demote that maker in The Index — it sorts to
 *     the foot of its group with the reason stated.
 *   · THREE passes on a type stop Beau proactively recommending that type
 *     — the suppressed types ride into the Layer 2 assessment prompt.
 *
 * Archives carry NO signal here on purpose: an archive is silence, never
 * an opinion. Everything below reads the shared candidate records
 * (radar_items + candidate_meta) — nothing keeps its own copy.
 */

// window.__workspaceDb is auto-injected by the platform compiler when it sees
// this literal token in app source.
function db(): any {
  return (window as any).__workspaceDb;
}

export const MAKER_DEMOTION_PASSES = 2;
export const TYPE_SUPPRESSION_PASSES = 3;

export interface PassSignals {
  /** Lower-cased maker name → how many of theirs the user has passed on. */
  makerPassCounts: Record<string, number>;
  /** Lower-cased type (slot, falling back to category) → pass count. */
  typePassCounts: Record<string, number>;
  /** Makers at or past the demotion threshold (2 passes). */
  demotedMakers: string[];
  /** Types at or past the suppression threshold (3 passes) — Beau stops
   * proactively recommending these. */
  suppressedTypes: string[];
}

export const EMPTY_PASS_SIGNALS: PassSignals = {
  makerPassCounts: {},
  typePassCounts: {},
  demotedMakers: [],
  suppressedTypes: [],
};

interface MetaRowLite {
  id: number;
  radar_id: number;
  stage: string;
}

interface RadarRowLite {
  id: number;
  brand: string | null;
  category: string | null;
  slot: string | null;
}

/**
 * Read the pass counts off the live records. Never throws — a failed read
 * returns the empty signal set, and nothing downstream breaks.
 */
export async function fetchPassSignals(): Promise<PassSignals> {
  try {
    const [{ data: metaRows }, { data: radarRows }] = await Promise.all([
      db().from('candidate_meta').orderBy('created_at', 'desc').limit(200).get(),
      db().from('radar_items').orderBy('created_at', 'desc').limit(200).get(),
    ]);
    // Newest meta row per candidate wins.
    const stageByRadar = new Map<number, MetaRowLite>();
    for (const m of (metaRows || []) as MetaRowLite[]) {
      const existing = stageByRadar.get(Number(m.radar_id));
      if (!existing || Number(m.id) > Number(existing.id)) stageByRadar.set(Number(m.radar_id), m);
    }
    const makerPassCounts: Record<string, number> = {};
    const typePassCounts: Record<string, number> = {};
    for (const item of (radarRows || []) as RadarRowLite[]) {
      const meta = stageByRadar.get(Number(item.id));
      if (!meta || meta.stage !== 'passed') continue;
      const maker = (item.brand || '').trim().toLowerCase();
      if (maker) makerPassCounts[maker] = (makerPassCounts[maker] || 0) + 1;
      const type = ((item.slot || item.category || '') as string).trim().toLowerCase();
      if (type) typePassCounts[type] = (typePassCounts[type] || 0) + 1;
    }
    return {
      makerPassCounts,
      typePassCounts,
      demotedMakers: Object.keys(makerPassCounts).filter((k) => makerPassCounts[k] >= MAKER_DEMOTION_PASSES),
      suppressedTypes: Object.keys(typePassCounts).filter((k) => typePassCounts[k] >= TYPE_SUPPRESSION_PASSES),
    };
  } catch (e) {
    console.warn('[Ethaion] pass-signal read failed (non-fatal):', e);
    return EMPTY_PASS_SIGNALS;
  }
}

/** A stable signature for cache fingerprints — moves when the pass ledger
 * moves in any way that matters. */
export function passSignalsSignature(signals: PassSignals): string {
  const makers = Object.entries(signals.makerPassCounts).map(([k, v]) => `${k}:${v}`).sort().join(',');
  const types = Object.entries(signals.typePassCounts).map(([k, v]) => `${k}:${v}`).sort().join(',');
  return `m[${makers}]t[${types}]`;
}
