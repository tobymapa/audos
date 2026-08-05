/**
 * THE BRAND REFERENCE LAYER — verified quality makers Beau can lean on when
 * he reasons (the Beau intelligence overhaul).
 *
 * This is a REFERENCE layer, not a catalogue and not a whitelist. Every
 * entry is a maker whose quality signals we can state with confidence, so
 * when Beau recommends a piece he can name what makes it worth the money
 * (Goodyear welt, full-grain calf, Shetland spun in Scotland) instead of
 * gesturing at "good quality".
 *
 * IT NEVER LIMITS BEAU. The Layer 2 prompt is explicit: if a verified entry
 * exists, use its quality signals in the rationale; if none exists, draw on
 * general knowledge. Beau can recommend any brand in the world.
 *
 * Why this lives in code rather than WorkspaceDB: every WorkspaceDB table in
 * this space is per-visitor session-scoped, so a shared reference table
 * would have to be re-seeded for every new visitor. The visitor-specific
 * layer that DOES belong in the database — the brands he already knows and
 * trusts — is merged in from the trusted_brands table by
 * buildBrandReferenceLayer().
 */

import { fetchTrustedBrands } from './profile-data';

export interface BrandReferenceEntry {
  brand: string;
  category: string;
  qualitySignals: string;
  archetypeFit: string[];
  /** 'accessible' | 'mid' | 'upper-mid' | 'luxury' */
  priceRange: string;
  /** Set when the entry came from the user's own trusted-brands list. */
  userTrusted?: boolean;
  /** The user's note on why he trusts this maker. */
  userNote?: string;
  /** Makers who cut short/petite sizing — surfaced for shorter frames. */
  shortSizing?: boolean;
}

// ---------------------------------------------------------------------------
// The verified reference set
// ---------------------------------------------------------------------------

export const BRAND_REFERENCE: BrandReferenceEntry[] = [
  // Shoes
  {
    brand: 'Berwick',
    category: 'Shoes',
    qualitySignals: 'Goodyear welt, full-grain calf leather, bespoke-grade craft at mid-market prices',
    archetypeFit: ['Continental', 'Classic Ivy', 'British Country'],
    priceRange: 'mid',
  },
  {
    brand: 'Loake 1880',
    category: 'Shoes',
    qualitySignals: 'Goodyear-welted in Kettering, calf uppers, resoleable for decades',
    archetypeFit: ['Classic Ivy', 'British Country', 'Smart Casual'],
    priceRange: 'mid',
  },
  {
    brand: 'Crockett & Jones',
    category: 'Shoes',
    qualitySignals: 'Northampton Goodyear welt, closed-channel soles on the Handgrade line, lasts that hold shape for years',
    archetypeFit: ['Classic Ivy', 'British Country', 'Continental'],
    priceRange: 'upper-mid',
  },
  {
    brand: 'Carmina',
    category: 'Shoes',
    qualitySignals: 'Mallorcan Goodyear welt, shell cordovan and museum calf, elegant Spanish lasts',
    archetypeFit: ['Continental', 'Classic Ivy'],
    priceRange: 'upper-mid',
  },
  {
    brand: 'Meermin',
    category: 'Shoes',
    qualitySignals: 'Goodyear-welted calf and suede at the entry end of proper shoemaking — the honest first good pair',
    archetypeFit: ['Continental', 'Classic Ivy', 'Smart Casual'],
    priceRange: 'accessible',
  },
  {
    brand: 'Sanders',
    category: 'Shoes',
    qualitySignals: 'Northampton-made chukkas and military derbies, crepe and Dainite soles, honest suede',
    archetypeFit: ['Military/Utility', 'British Country', 'Workwear'],
    priceRange: 'mid',
  },
  {
    brand: 'Solovair',
    category: 'Shoes',
    qualitySignals: 'Goodyear-welted English work boots, resoleable, the original Northamptonshire construction',
    archetypeFit: ['Workwear', 'American Outdoors', 'Military/Utility'],
    priceRange: 'mid',
  },
  {
    brand: 'Common Projects',
    category: 'Shoes',
    qualitySignals: 'Italian-made full-grain leather sneaker, blake-stitched, minimal enough to wear with tailoring',
    archetypeFit: ['Smart Casual', 'Continental'],
    priceRange: 'upper-mid',
  },
  {
    brand: 'Veja',
    category: 'Shoes',
    qualitySignals: 'Clean low-profile sneaker in chrome-free leather, traceable supply chain, holds its shape',
    archetypeFit: ['Smart Casual', 'Coastal/Nautical'],
    priceRange: 'accessible',
  },
  {
    brand: 'Astorflex',
    category: 'Shoes',
    qualitySignals: 'Italian suede chukkas on natural crepe, vegetable-tanned, made by one family since 1816',
    archetypeFit: ['Smart Casual', 'American Outdoors', 'Mediterranean/Riviera'],
    priceRange: 'accessible',
  },
  {
    brand: 'Rancourt & Co.',
    category: 'Shoes',
    qualitySignals: 'Hand-sewn Maine moccasin construction, Horween leathers, camp mocs and boat shoes built to be resoled',
    archetypeFit: ['Classic Ivy', 'Coastal/Nautical', 'American Outdoors'],
    priceRange: 'mid',
  },

  // Outerwear
  {
    brand: 'Barbour',
    category: 'Outerwear',
    qualitySignals: 'Sylkoil and Thornproof waxed cotton, rewaxable and repairable for life, cut for layering over knitwear',
    archetypeFit: ['British Country', 'American Outdoors', 'Military/Utility'],
    priceRange: 'mid',
  },
  {
    brand: 'Private White V.C.',
    category: 'Outerwear',
    qualitySignals: 'Made in one Manchester factory, Ventile and British Millerain cloth, bar-tacked stress points',
    archetypeFit: ['British Country', 'Military/Utility', 'Smart Casual'],
    priceRange: 'luxury',
  },
  {
    brand: 'Universal Works',
    category: 'Outerwear',
    qualitySignals: 'Nottingham-designed chore coats and bakers jackets in honest cotton twill and wool, unfussy cuts',
    archetypeFit: ['Workwear', 'Smart Casual', 'Military/Utility'],
    priceRange: 'mid',
    shortSizing: true,
  },
  {
    brand: 'Le Laboureur',
    category: 'Outerwear',
    qualitySignals: 'French moleskin and cotton drill work jackets, made in Digoin, softens with every wear',
    archetypeFit: ['Workwear', 'American Outdoors'],
    priceRange: 'accessible',
  },
  {
    brand: 'Alpha Industries',
    category: 'Outerwear',
    qualitySignals: 'Original US military contractor patterns — M-65, MA-1 — in the specified nylon and sateen weights',
    archetypeFit: ['Military/Utility', 'American Outdoors'],
    priceRange: 'accessible',
  },
  {
    brand: 'Mackintosh',
    category: 'Outerwear',
    qualitySignals: 'Hand-glued bonded cotton raincoats made in Scotland, genuinely waterproof, no seam stitching',
    archetypeFit: ['Continental', 'British Country', 'Smart Casual'],
    priceRange: 'luxury',
  },
  {
    brand: 'Valstar',
    category: 'Outerwear',
    qualitySignals: 'The original Italian Valstarino suede blouson, unlined and cut short — flattering on a shorter frame',
    archetypeFit: ['Continental', 'Smart Casual'],
    priceRange: 'luxury',
    shortSizing: true,
  },
  {
    brand: 'Grenfell',
    category: 'Outerwear',
    qualitySignals: 'Densely woven Grenfell cotton cloth, made in England, weatherproof without a technical look',
    archetypeFit: ['British Country', 'Classic Ivy', 'Smart Casual'],
    priceRange: 'upper-mid',
  },

  // Knitwear
  {
    brand: 'Jamieson\u2019s of Shetland',
    category: 'Knitwear',
    qualitySignals: 'Pure Shetland wool spun and knitted on the islands, crew necks that soften into shape',
    archetypeFit: ['British Country', 'Classic Ivy', 'American Outdoors'],
    priceRange: 'accessible',
  },
  {
    brand: 'Harley of Scotland',
    category: 'Knitwear',
    qualitySignals: 'Geelong lambswool and Shetland knitted in Peebles, fully fashioned, honest weight',
    archetypeFit: ['British Country', 'Classic Ivy'],
    priceRange: 'accessible',
  },
  {
    brand: 'John Smedley',
    category: 'Knitwear',
    qualitySignals: 'Sea Island cotton and extra-fine merino knitted in Derbyshire since 1784 — the fine-gauge reference',
    archetypeFit: ['Continental', 'Smart Casual', 'Classic Ivy'],
    priceRange: 'upper-mid',
  },
  {
    brand: 'Le Tricoteur',
    category: 'Knitwear',
    qualitySignals: 'Guernsey knitted in worsted oiled wool on the island — weatherproof, the original fisherman\u2019s sweater',
    archetypeFit: ['Coastal/Nautical', 'British Country'],
    priceRange: 'accessible',
  },
  {
    brand: 'Inis Me\u00e1in',
    category: 'Knitwear',
    qualitySignals: 'Aran knitting from the island itself in linen, alpaca and merino — traditional stitches, modern proportions',
    archetypeFit: ['British Country', 'Coastal/Nautical', 'Continental'],
    priceRange: 'luxury',
  },
  {
    brand: 'Colhay\u2019s',
    category: 'Knitwear',
    qualitySignals: 'Scottish-spun cashmere and lambswool, mid-century proportions, high armholes cut for layering',
    archetypeFit: ['Continental', 'Classic Ivy', 'British Country'],
    priceRange: 'upper-mid',
  },

  // Tops
  {
    brand: 'Kamakura Shirts',
    category: 'Tops',
    qualitySignals: 'Japanese-made oxford cloth button-downs, unfused collars with a proper roll, mother-of-pearl buttons',
    archetypeFit: ['Classic Ivy', 'Smart Casual'],
    priceRange: 'mid',
    shortSizing: true,
  },
  {
    brand: 'Gitman Vermont',
    category: 'Tops',
    qualitySignals: 'Made in Ashland, Pennsylvania — the American OCBD with a soft unlined collar and single-needle seams',
    archetypeFit: ['Classic Ivy', 'Workwear'],
    priceRange: 'mid',
  },
  {
    brand: 'Drake\u2019s',
    category: 'Tops',
    qualitySignals: 'Heavy oxford and chambray, generous collar roll, cut with the room the fabric wants',
    archetypeFit: ['Classic Ivy', 'British Country', 'Smart Casual'],
    priceRange: 'upper-mid',
  },
  {
    brand: 'Sunspel',
    category: 'Tops',
    qualitySignals: 'Long-staple Supima and Sea Island cotton knitted in Long Eaton — the reference plain tee and riviera polo',
    archetypeFit: ['Smart Casual', 'Mediterranean/Riviera', 'Coastal/Nautical'],
    priceRange: 'mid',
  },
  {
    brand: 'Saint James',
    category: 'Tops',
    qualitySignals: 'The Breton knitted in Normandy since 1889, dense combed cotton that holds its shape for years',
    archetypeFit: ['Coastal/Nautical', 'Continental'],
    priceRange: 'accessible',
  },
  {
    brand: '100Hands',
    category: 'Tops',
    qualitySignals: 'Hand-finished shirting — hand-attached collars, hand-sewn buttonholes, Italian and Swiss cloth',
    archetypeFit: ['Continental', 'Classic Ivy'],
    priceRange: 'luxury',
  },

  // Bottoms
  {
    brand: 'Rota',
    category: 'Bottoms',
    qualitySignals: 'Roman-made trousers, high rise, proper waistband construction — the cut that lengthens a shorter leg',
    archetypeFit: ['Continental', 'Classic Ivy', 'Smart Casual'],
    priceRange: 'upper-mid',
    shortSizing: true,
  },
  {
    brand: 'Berg & Berg',
    category: 'Bottoms',
    qualitySignals: 'Italian-milled cotton and wool trousers cut clean and high, sewn in small Portuguese and Italian workshops',
    archetypeFit: ['Continental', 'Smart Casual'],
    priceRange: 'mid',
    shortSizing: true,
  },
  {
    brand: 'Bhode',
    category: 'Bottoms',
    qualitySignals: 'British-made corduroy and moleskin trousers, honest weights, short inseams offered as standard',
    archetypeFit: ['British Country', 'Workwear', 'Smart Casual'],
    priceRange: 'accessible',
    shortSizing: true,
  },
  {
    brand: 'Rogue Territory',
    category: 'Bottoms',
    qualitySignals: 'Los Angeles-sewn selvedge denim and duck canvas, chainstitched hems, cut for real wear',
    archetypeFit: ['Workwear', 'American Outdoors'],
    priceRange: 'mid',
  },
  {
    brand: 'Full Count',
    category: 'Bottoms',
    qualitySignals: 'Zimbabwe-cotton selvedge denim woven on shuttle looms in Japan — fades honestly, no factory distressing',
    archetypeFit: ['Workwear', 'American Outdoors'],
    priceRange: 'upper-mid',
  },
  {
    brand: 'Uniqlo',
    category: 'Bottoms',
    qualitySignals: 'Not heritage, but the reliable stopgap: cotton chinos with a clean line and genuinely short inseams',
    archetypeFit: ['Smart Casual', 'Classic Ivy'],
    priceRange: 'accessible',
    shortSizing: true,
  },

  // Formalwear
  {
    brand: 'Boglioli',
    category: 'Formalwear',
    qualitySignals: 'The K-Jacket — unlined, unstructured, garment-dyed; a blazer that never overwhelms a smaller frame',
    archetypeFit: ['Continental', 'Smart Casual'],
    priceRange: 'luxury',
    shortSizing: true,
  },
  {
    brand: 'Suitsupply',
    category: 'Formalwear',
    qualitySignals: 'Half-canvassed as standard, Italian mills, in-house alterations — the honest first proper jacket',
    archetypeFit: ['Smart Casual', 'Continental'],
    priceRange: 'mid',
    shortSizing: true,
  },
  {
    brand: 'Spier & Mackay',
    category: 'Formalwear',
    qualitySignals: 'Full and half-canvassed jackets at mid prices, several fits including a short cut, Italian cloth',
    archetypeFit: ['Classic Ivy', 'Continental', 'Smart Casual'],
    priceRange: 'mid',
    shortSizing: true,
  },
  {
    brand: 'Cordings',
    category: 'Formalwear',
    qualitySignals: 'House tweeds rewoven rather than redesigned — country jackets with real Piccadilly provenance',
    archetypeFit: ['British Country'],
    priceRange: 'upper-mid',
  },

  // Accessories and bags
  {
    brand: 'Equus Leather',
    category: 'Accessories',
    qualitySignals: 'Hand-stitched English bridle leather belts, solid brass buckles, made to your measurement',
    archetypeFit: ['British Country', 'Classic Ivy', 'Workwear'],
    priceRange: 'mid',
  },
  {
    brand: 'Begg x Co',
    category: 'Accessories',
    qualitySignals: 'Ayrshire-woven cashmere and lambswool scarves, teasel-raised finish, extraordinarily soft handle',
    archetypeFit: ['British Country', 'Continental'],
    priceRange: 'luxury',
  },
  {
    brand: 'Sam Hober',
    category: 'Accessories',
    qualitySignals: 'Grenadine ties handmade to order — one workshop, sewn to your length',
    archetypeFit: ['Classic Ivy', 'Continental'],
    priceRange: 'mid',
  },
  {
    brand: 'Bennett Winch',
    category: 'Bags',
    qualitySignals: 'British-made bonded cotton canvas and bridle leather, brass hardware, guaranteed for life',
    archetypeFit: ['British Country', 'Smart Casual'],
    priceRange: 'luxury',
  },
];

// ---------------------------------------------------------------------------
// Selection — keep the layer relevant and the prompt small
// ---------------------------------------------------------------------------

/** How a stated budget maps onto the reference set's price bands. */
function bandsForBudget(budget: string | null | undefined): Set<string> | null {
  const b = (budget || '').toLowerCase();
  if (!b) return null;
  if (/luxur|premium|no limit|top end/.test(b)) return new Set(['mid', 'upper-mid', 'luxury']);
  if (/mid-range|mid range|considered|invest/.test(b)) return new Set(['accessible', 'mid', 'upper-mid']);
  if (/budget|affordable|entry|starting out|value|accessible/.test(b)) return new Set(['accessible', 'mid']);
  return null;
}

export interface BrandLayerOptions {
  /** The user's selected archetypes, in the prompt's naming. */
  archetypes?: string[];
  /** The stated budget range, e.g. "mid-range". */
  budgetRange?: string | null;
  /** True when the frame is short — short-sizing makers are pulled forward. */
  prefersShortSizing?: boolean;
  /** Cap on entries handed to the model. */
  limit?: number;
}

/**
 * The reference layer for THIS user: verified makers weighted towards his
 * archetypes and budget, with the brands he already trusts merged in and
 * marked. Never exhaustive by design — Beau recommends outside it freely.
 */
export async function buildBrandReferenceLayer(options: BrandLayerOptions = {}): Promise<BrandReferenceEntry[]> {
  const { archetypes = [], budgetRange = null, prefersShortSizing = false, limit = 26 } = options;
  const wanted = new Set(archetypes.map((a) => a.toLowerCase()));
  const bands = bandsForBudget(budgetRange);

  const scored = BRAND_REFERENCE.map((entry) => {
    let score = 0;
    score += entry.archetypeFit.filter((a) => wanted.has(a.toLowerCase())).length * 3;
    if (wanted.size === 0) score += 1; // no archetypes chosen yet — keep the set broad
    if (bands) score += bands.has(entry.priceRange) ? 2 : -2;
    if (prefersShortSizing && entry.shortSizing) score += 2;
    return { entry, score };
  })
    .filter(({ score }) => score > -2)
    .sort((a, b) => b.score - a.score);

  // Cap per category so no step of the foundation ladder is left without a
  // reference point, and no single category eats the whole layer.
  const perCategory: Record<string, number> = {};
  const chosen: BrandReferenceEntry[] = [];
  for (const { entry } of scored) {
    const used = perCategory[entry.category] || 0;
    if (used >= 5) continue;
    perCategory[entry.category] = used + 1;
    chosen.push({ ...entry });
    if (chosen.length >= limit) break;
  }

  // The visitor's own trusted makers — the most personal part of the layer.
  try {
    const trusted = await fetchTrustedBrands();
    for (const row of trusted) {
      const name = (row.brand || '').trim();
      if (!name) continue;
      const existing = chosen.find((e) => e.brand.toLowerCase() === name.toLowerCase());
      if (existing) {
        existing.userTrusted = true;
        if (row.note) existing.userNote = row.note;
        continue;
      }
      chosen.push({
        brand: name,
        category: 'Any',
        qualitySignals: row.note || 'The user already knows and trusts this maker.',
        archetypeFit: [],
        priceRange: 'unknown',
        userTrusted: true,
        userNote: row.note || undefined,
      });
    }
  } catch {
    /* trusted brands are a bonus — never block the assessment */
  }

  return chosen;
}

/** A signature of the layer, for the assessment cache fingerprint. */
export function brandLayerSignature(entries: BrandReferenceEntry[]): string {
  return entries
    .map((e) => `${e.brand}${e.userTrusted ? '*' : ''}`)
    .sort()
    .join(',');
}
