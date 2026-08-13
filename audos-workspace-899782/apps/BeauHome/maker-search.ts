/**
 * MAKER SEARCH — "Ask Beau to find makers" (August 2026).
 *
 * ONE engine behind two controls:
 *  · the piece detail page's WHO MAKES IT section — Beau searches for the
 *    five best makers of THAT piece type, cross-referenced against the
 *    reader's own record (frame, colouring, budget, city, climate, style
 *    directions), and files each one into the maker directory;
 *  · the Index → Makers face's persistent "Find 5 more makers" control —
 *    the same search with no piece type held, five new houses per press.
 *
 * ONLY NEW NAMES land: everything already on file — the verified catalog
 * (BRAND_DIRECTORY), the reference layer (BRAND_REFERENCE) and every
 * persisted hunt_directory_brands row — is excluded from the ask AND
 * filtered from the answer, so a press can never duplicate a row.
 *
 * Each found maker is inserted as a FULL hunt_directory_brands row (source
 * 'beau'): name, country, city, price tier, what they are known for, and
 * Beau's own note on why the house suits THIS reader — the same dossier
 * shape every other directory addition carries, so the Makers table, the
 * maker sheet and Beau's Fifty all read it without special cases.
 * DISCOVER_BRANDS_EVENT fires afterwards so live surfaces re-read.
 */
import { CLAUDE_HAIKU, CLAUDE_SONNET, callModel, type ClaudeSystemBlock } from './claude';
import { BRAND_DIRECTORY, beauRatingFromQuality, findCatalogBrand, type BrandProfile, type PriceBand, type Register } from './brands';
import { BRAND_REFERENCE } from './brand-reference';
import { DISCOVER_BRANDS_EVENT } from './hunt-ai';
import { huntReaderBrief, loadHuntReader } from './hunt-reader';
import { loadHuntCallsMirror } from './hunt-model';
import type { GarmentType } from './garment-types';
import type { StyleProfile, WardrobePiece } from './profile-data';

function db(): any {
  return (window as any).__workspaceDb;
}

/** How many new makers one press asks for. */
export const MAKER_SEARCH_COUNT = 5;

const PRICE_IDS: PriceBand[] = ['accessible', 'mid', 'upper-mid', 'luxury'];
const REGISTER_IDS: Register[] = ['Casual', 'Smart-Casual', 'Business', 'Formal', 'Outdoor-Work', 'Black-Tie'];

function str(v: unknown, max = 300): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function parseJson(raw: string | null): any {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** Every maker name already on file, lowercased — the exclusion list. */
async function existingMakerNames(): Promise<Set<string>> {
  const names = new Set<string>();
  for (const b of BRAND_DIRECTORY) names.add(b.brand.toLowerCase());
  for (const e of BRAND_REFERENCE) names.add(e.brand.toLowerCase());
  try {
    const { data } = await db().from('hunt_directory_brands').orderBy('created_at', 'desc').limit(500).get();
    for (const row of data || []) {
      const name = String(row?.brand || '').trim().toLowerCase();
      if (name) names.add(name);
    }
  } catch {
    /* the static lists still guard against most duplicates */
  }
  return names;
}

const VOICE: ClaudeSystemBlock = {
  text:
    'You are Beau, the valet voice of Ethaion — a classic-menswear wardrobe app for a man building an intentional, quality wardrobe. You are SCOUTING MAKERS: real menswear houses, workshops and labels that genuinely exist and genuinely make the pieces named. '
    + 'THE THESIS, applied without exception: natural or genuinely good materials, considered construction, timeless design. Fast fashion never appears — no Zara, H&M, ASOS, Shein, Temu, Primark or Boohoo. Name REAL makers only; never invent a house, and when you are not certain a maker exists, choose one you are certain of. '
    + 'Every choice must be earned from the FACTS you are given about the man — his frame, colouring, budget, city, climate, style directions and what is on his ledger. '
    + 'Return STRICT JSON only — no markdown fences, no prose around it.',
  cache: true,
};

export interface FoundMaker {
  name: string;
  country: string;
  city: string | null;
  priceBand: PriceBand;
  knownFor: string;
  note: string;
}

function sanitizeFound(raw: any): FoundMaker | null {
  const name = str(raw?.name ?? raw?.brand, 60);
  if (!name) return null;
  const bandRaw = str(raw?.priceBand ?? raw?.price_tier ?? raw?.priceTier, 20).toLowerCase();
  const priceBand = (PRICE_IDS as string[]).includes(bandRaw)
    ? (bandRaw as PriceBand)
    : /lux/.test(bandRaw)
      ? 'luxury'
      : /premium|upper/.test(bandRaw)
        ? 'upper-mid'
        : /access|entry|afford/.test(bandRaw)
          ? 'accessible'
          : 'mid';
  return {
    name,
    country: str(raw?.country, 40) || '—',
    city: str(raw?.city, 40) || null,
    priceBand,
    knownFor: str(raw?.knownFor ?? raw?.known_for ?? raw?.description, 200),
    note: str(raw?.note ?? raw?.why ?? raw?.beausNote, 260),
  };
}

/** The found maker as a full directory profile, so every surface reads it. */
function toProfile(found: FoundMaker, raw: any): BrandProfile {
  const registers = Array.isArray(raw?.registers)
    ? (raw.registers.map((r: unknown) => str(r, 20)).filter((r: string) => (REGISTER_IDS as string[]).includes(r)) as Register[])
    : [];
  const materials = Array.isArray(raw?.materials) ? raw.materials.map((m: unknown) => str(m, 40)).filter(Boolean).slice(0, 4) : [];
  const signature = Array.isArray(raw?.signaturePieces)
    ? raw.signaturePieces.map((s: unknown) => str(s, 50)).filter(Boolean).slice(0, 3)
    : found.knownFor
      ? [found.knownFor.split(/[,;·]/)[0].trim()].filter(Boolean)
      : [];
  const score = Number(raw?.qualityScore);
  return {
    brand: found.name,
    description: found.knownFor || 'A maker Beau found for you.',
    country: found.country,
    city: found.city || undefined,
    founded: Number.isFinite(Number(raw?.founded)) ? Number(raw.founded) : null,
    priceBand: found.priceBand,
    priceRangeLabel: str(raw?.priceRangeLabel, 40) || '—',
    materials,
    construction: str(raw?.construction, 60) || '—',
    constructionQuality: raw?.constructionQuality === 'Excellent' ? 'Excellent' : raw?.constructionQuality === 'Adequate' ? 'Adequate' : 'Good',
    constructionNote: found.note,
    registers,
    longevity: { resoleable: raw?.resoleable === true, mendable: raw?.mendable !== false, expectedYears: 8, note: '' },
    costPerYearNote: '',
    signaturePieces: signature,
    archetypes: [],
    sizingNote: str(raw?.sizingNote, 140),
    qualityScore: Number.isFinite(score) ? Math.min(10, Math.max(1, Math.round(score))) : 7,
    naturalMaterials: raw?.naturalMaterials !== false,
    websiteUrl: /^https?:\/\/\S+$/i.test(str(raw?.websiteUrl, 200)) ? str(raw?.websiteUrl, 200) : null,
    generated: true,
  };
}

export interface MakerSearchResult {
  /** The names actually inserted, in Beau's order. */
  added: string[];
}

/**
 * Ask Beau for five NEW makers and file them into the directory. When
 * `pieceType` is given the search is anchored to that garment type; without
 * one it scouts against the whole record. Returns the inserted names —
 * empty when every transport failed or nothing new came back.
 */
export async function findNewMakers(input: {
  profile: StyleProfile | null;
  pieces: WardrobePiece[];
  pieceType?: GarmentType | null;
  count?: number;
}): Promise<MakerSearchResult> {
  const count = input.count || MAKER_SEARCH_COUNT;
  const [reader, existing] = await Promise.all([
    loadHuntReader({ profile: input.profile, pieces: input.pieces, prefs: null, calls: loadHuntCallsMirror() }),
    existingMakerNames(),
  ]);

  // The exclusion list, capped so the prompt stays honest but bounded — the
  // answer is ALSO filtered against the full set below, so a name past the
  // cap still cannot land twice.
  const excludeList = [...existing].sort().slice(0, 420);

  const target = input.pieceType
    ? `THE PIECE: ${input.pieceType.name} (category: ${input.pieceType.category}). Every maker you name must GENUINELY make this piece type, and make it well.`
    : 'No single piece is held — scout across the categories his record says he needs most.';

  const user = [
    `THE MAN:\n${huntReaderBrief(reader)}`,
    target,
    `ALREADY IN HIS MAKER DATABASE — never name any of these, in any spelling:\n${excludeList.join('; ')}`,
    `Find the ${count} BEST makers NOT already in his database${input.pieceType ? ` for the ${input.pieceType.name.toLowerCase()}` : ''} — cross-referenced against his frame, colouring, budget, city, climate and the way he actually dresses. `
      + 'Prefer houses a knowledgeable buyer would respect: independent workshops, heritage makers, strong specialists — spread across price tiers where his budget allows. '
      + `Return JSON: {"makers": [ … ]} — EXACTLY ${count} entries, each with exactly these keys: `
      + '"name" (the maker, verbatim), '
      + '"country", '
      + '"city" (or null), '
      + '"priceBand" (one of accessible, mid, upper-mid, luxury), '
      + '"knownFor" (ONE line, max 120 chars — what the house is known for: the piece, the cloth, the make), '
      + '"note" (1–2 short sentences, max 220 chars, written TO him — why THIS house for THIS man; name the fact in his profile it answers), '
      + '"registers" (array from: Casual, Smart-Casual, Business, Formal, Outdoor-Work, Black-Tie), '
      + '"materials" (up to 3), "construction" (short phrase), "constructionQuality" (Excellent | Good | Adequate), '
      + '"signaturePieces" (up to 3), "qualityScore" (1–10), "priceRangeLabel" (e.g. "Mid (£150–400)"), '
      + '"founded" (year or null), "websiteUrl" (the maker\u2019s own https address ONLY when you are certain of it; else null).',
  ].join('\n\n');

  const raw = await callModel({
    model: CLAUDE_SONNET,
    second: CLAUDE_HAIKU,
    system: [VOICE],
    user,
    maxTokens: 2600,
    temperature: 0.6,
  });
  const parsed = parseJson(raw);
  const list: any[] = Array.isArray(parsed?.makers) ? parsed.makers : Array.isArray(parsed) ? parsed : [];
  if (list.length === 0) return { added: [] };

  const added: string[] = [];
  for (const entry of list) {
    if (added.length >= count) break;
    const found = sanitizeFound(entry);
    if (!found) continue;
    const key = found.name.toLowerCase();
    if (existing.has(key) || findCatalogBrand(found.name)) continue;
    existing.add(key);
    const profile = toProfile(found, entry);
    try {
      const { data: dupe } = await db().from('hunt_directory_brands').eq('brand', found.name).limit(1).get();
      if (dupe && dupe.length > 0) continue;
      await db().from('hunt_directory_brands').insert({
        brand: found.name,
        source: 'beau',
        profile_json: JSON.stringify(profile),
        rating: beauRatingFromQuality(profile.constructionQuality, profile.qualityScore),
        rating_note: found.note || null,
        context: input.pieceType
          ? `Found by Beau for the ${input.pieceType.name.toLowerCase()}`
          : 'Found by Beau against your profile',
      });
      added.push(found.name);
    } catch (e) {
      console.warn('[Ethaion] could not file a found maker (non-fatal):', e);
    }
  }

  if (added.length > 0) window.dispatchEvent(new CustomEvent(DISCOVER_BRANDS_EVENT));
  return { added };
}
