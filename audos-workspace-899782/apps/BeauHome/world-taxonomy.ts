/**
 * WORLD OF MENSWEAR — the assembled taxonomy + lookup helpers.
 *
 * The full reference lives in four entry files (world-entries-1..4.ts);
 * this module concatenates them in browse order, and provides the search,
 * per-category and wardrobe-ownership helpers the surface
 * (world-of-menswear.tsx) consumes.
 */
import { WORLD_CATEGORIES, type WorldCategoryId, type WorldEntry } from './world-types';
import { WORLD_ENTRIES_TOPS_BOTTOMS } from './world-entries-1';
import { WORLD_ENTRIES_SHOES_OUTERWEAR } from './world-entries-2';
import { WORLD_ENTRIES_KNIT_FORMAL_BASE } from './world-entries-3';
import { WORLD_ENTRIES_ACC_BAGS_HATS } from './world-entries-4';

export { WORLD_CATEGORIES };
export type { WorldCategoryId, WorldEntry };

/** Every entry, in file order. Category browse re-orders via WORLD_CATEGORIES. */
export const WORLD_ENTRIES: WorldEntry[] = [
  ...WORLD_ENTRIES_TOPS_BOTTOMS,
  ...WORLD_ENTRIES_SHOES_OUTERWEAR,
  ...WORLD_ENTRIES_KNIT_FORMAL_BASE,
  ...WORLD_ENTRIES_ACC_BAGS_HATS,
];

export function worldEntry(id: string | null | undefined): WorldEntry | null {
  if (!id) return null;
  return WORLD_ENTRIES.find((e) => e.id === id) || null;
}

export function worldEntriesFor(categoryId: WorldCategoryId): WorldEntry[] {
  return WORLD_ENTRIES.filter((e) => e.categoryId === categoryId);
}

/** Real-time search across name + description (+ keywords), case-insensitive.
 * Name matches rank first, then description/keyword matches — stable within
 * each band so browse order is preserved. */
export function searchWorldEntries(query: string): WorldEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const nameHits: WorldEntry[] = [];
  const bodyHits: WorldEntry[] = [];
  for (const entry of WORLD_ENTRIES) {
    if (entry.name.toLowerCase().includes(q)) {
      nameHits.push(entry);
    } else if (
      entry.what.toLowerCase().includes(q) ||
      entry.keywords.some((k) => k.includes(q) || q.includes(k))
    ) {
      bodyHits.push(entry);
    }
  }
  return nameHits.concat(bodyHits);
}

/** The wardrobe piece (if any) that covers this entry — keyword match on the
 * piece's own name/category text, longest keyword winning across entries'
 * shared words ("tie" vs "tie bar"). Used for Beau's "You have this covered"
 * note on the detail view. */
export function ownedPieceForEntry(
  entry: WorldEntry,
  pieces: Array<{ name: string; category?: string | null }>,
): { name: string } | null {
  const terms = [entry.name.toLowerCase(), ...entry.keywords.map((k) => k.toLowerCase())];
  for (const piece of pieces) {
    const text = `${piece.name || ''} ${piece.category || ''}`.toLowerCase();
    if (!text.trim()) continue;
    for (const term of terms) {
      if (term.length >= 3 && text.includes(term)) return { name: piece.name };
    }
  }
  return null;
}
