/**
 * THE RAIL'S CATEGORY SPINE (The Rail overhaul, Part 2).
 *
 * The Rail is no longer a flat list of whatever the live engine happened to
 * return. It is a SECTIONED rail: one labelled section per wardrobe gap
 * category, ordered by essentialness (most → least), so every gap the
 * coverage map can show has somewhere to land.
 *
 * Two things live here:
 *
 *  1. RAIL_CATEGORIES — the ten sections, in order, with everything needed
 *     to route a gap tapped in The Edit to the right section and to file a
 *     live recommendation under it.
 *  2. SEEDED_RAIL_PICKS — Beau-curated fallback recommendations, 3–5 per
 *     category. The live engine returns 5–8 picks in total, so most
 *     categories would otherwise be empty; these top each section up to a
 *     usable three. They are real, classic, natural-material pieces with
 *     real makers and honest price guides — never placeholder text.
 *
 * Product imagery: each seeded pick carries an `imageQuery`, resolved
 * through the platform's stock-photo endpoint and cached (memory +
 * localStorage), so a card always shows a real photograph rather than an
 * empty box. A pick whose photo cannot be resolved falls back to the house
 * garment illustration, never to a blank plate.
 */
import { sortByCategoryOrder } from './category-order';

export interface RailCategory {
  id: string;
  /** Section label — Cormorant, walnut ink, tobacco-gold hairline below. */
  label: string;
  /** One line under the label. */
  blurb: string;
  /** Wardrobe category ids that belong to this section. */
  categoryIds: string[];
  /** Coverage-map canonical rows that route here when tapped as a gap. */
  coverageRows: string[];
  /** Words that file a live recommendation into this section. */
  keywords: string[];
  /** The price guide shown when a live pick carries no price of its own. */
  typicalPrice: string;
}

/** Declared in file-of-record order; RAIL_CATEGORIES below hands them out
 * in the app's ONE canonical order (category-order.ts). */
const RAIL_CATEGORIES_UNORDERED: RailCategory[] = [
  {
    id: 'tops',
    label: 'Tops',
    blurb: 'Shirts, polos and turtlenecks — the layer everything else is built around.',
    categoryIds: ['tops'],
    coverageRows: ['Tops'],
    keywords: ['shirt', 'oxford', 'ocbd', 'polo', 'turtleneck', 'rollneck', 'tee', 't-shirt', 'overshirt', 'top', 'chambray', 'flannel shirt'],
    typicalPrice: '£90–£190',
  },
  {
    id: 'bottoms',
    label: 'Trousers & bottoms',
    blurb: 'Chinos, wool trousers, denim and cord — half of every outfit you own.',
    categoryIds: ['bottoms'],
    coverageRows: ['Bottoms'],
    keywords: ['trouser', 'chino', 'jean', 'denim', 'bottom', 'cord', 'corduroy', 'moleskin', 'short', 'slack'],
    typicalPrice: '£150–£320',
  },
  {
    id: 'shoes',
    label: 'Shoes',
    blurb: 'Oxford, loafer, boot, clean sneaker — the thing people notice last and judge first.',
    categoryIds: ['shoes'],
    coverageRows: ['Shoes'],
    keywords: ['shoe', 'oxford shoe', 'derby', 'brogue', 'loafer', 'boot', 'chukka', 'chelsea', 'sneaker', 'trainer', 'espadrille', 'sandal'],
    typicalPrice: '£245–£395',
  },
  {
    id: 'outerwear',
    label: 'Outerwear',
    blurb: 'The jacket or coat that decides what the whole outfit reads as.',
    categoryIds: ['outerwear'],
    coverageRows: ['Outerwear'],
    keywords: ['jacket', 'coat', 'outerwear', 'parka', 'mac', 'raincoat', 'trench', 'anorak', 'chore', 'harrington', 'peacoat', 'gilet'],
    typicalPrice: '£145–£795',
  },
  {
    id: 'knitwear',
    label: 'Knitwear',
    blurb: 'Jumpers and cardigans — the mid-layer that carries three seasons.',
    categoryIds: ['knitwear'],
    coverageRows: ['Knitwear'],
    keywords: ['knit', 'jumper', 'sweater', 'cardigan', 'shetland', 'lambswool', 'merino', 'cashmere', 'aran', 'zip-neck'],
    typicalPrice: '£115–£395',
  },
  {
    id: 'sweatshirts',
    label: 'Sweatshirts',
    blurb: 'Hoodies, crewneck sweatshirts and fleece pullovers — the off-duty mid-layer, done properly.',
    categoryIds: ['sweatshirts'],
    coverageRows: ['Sweatshirts'],
    keywords: ['sweatshirt', 'hoodie', 'hooded sweatshirt', 'crewneck sweatshirt', 'loopwheel', 'reverse weave', 'fleece pullover', 'snap-t'],
    typicalPrice: '£75–£195',
  },
  {
    id: 'formalwear',
    label: 'Formalwear',
    blurb: 'Blazer and suit — the register you cannot improvise on the day.',
    categoryIds: ['formalwear'],
    coverageRows: ['Formalwear'],
    keywords: ['blazer', 'suit', 'sports jacket', 'sport coat', 'dinner jacket', 'tuxedo', 'formal', 'waistcoat'],
    typicalPrice: '£499–£995',
  },
  {
    id: 'base-layers',
    label: 'Base layers',
    blurb: 'The quiet layer nobody sees — and everybody feels all day.',
    categoryIds: ['base-layers'],
    coverageRows: [],
    keywords: ['base layer', 'vest', 'undershirt', 'thermal', 'boxer', 'underwear', 'sock'],
    typicalPrice: '£38–£90',
  },
  {
    id: 'accessories',
    label: 'Accessories',
    blurb: 'Belt, watch, tie, pocket square — the details that finish a look.',
    categoryIds: ['accessories'],
    coverageRows: ['Accessories'],
    keywords: ['belt', 'watch', 'tie', 'pocket square', 'scarf', 'glove', 'accessory', 'braces', 'cufflink', 'wallet'],
    typicalPrice: '£45–£425',
  },
  {
    id: 'bags',
    label: 'Bags',
    blurb: 'What you carry says as much as what you wear.',
    categoryIds: ['bags'],
    coverageRows: [],
    keywords: ['bag', 'holdall', 'briefcase', 'rucksack', 'backpack', 'weekender', 'tote', 'washbag'],
    typicalPrice: '£160–£850',
  },
  {
    id: 'hats',
    label: 'Hats & headwear',
    blurb: 'Last in the queue, and only ever when the rest is covered.',
    categoryIds: ['hats'],
    coverageRows: [],
    keywords: ['hat', 'cap', 'beanie', 'headwear', 'panama', 'watch cap', 'flat cap'],
    typicalPrice: '£75–£180',
  },
];

/**
 * The sections in the canonical menswear order shared with The Ledger,
 * the Coverage Map and World of Menswear: Tops · Knitwear · Sweatshirts ·
 * Outerwear · Bottoms · Formalwear · Base Layers · Shoes · Accessories ·
 * Bags · Hats & Headwear.
 */
export const RAIL_CATEGORIES: RailCategory[] = sortByCategoryOrder(
  RAIL_CATEGORIES_UNORDERED,
  (cat) => cat.id,
);

export const RAIL_CATEGORY_IDS = RAIL_CATEGORIES.map((c) => c.id);

export function railCategory(id: string): RailCategory | null {
  return RAIL_CATEGORIES.find((c) => c.id === id) || null;
}

/**
 * The section a gap tapped in The Edit belongs to. The coverage map's rows
 * are broader than The Rail's sections (its "Accessories" row covers bags
 * and hats too, its "Tops" row covers base layers), so the row name is
 * matched first and the free text second.
 */
export function railCategoryForGap(gapCategory: string | null | undefined): string | null {
  const raw = (gapCategory || '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  for (const cat of RAIL_CATEGORIES) {
    if (cat.coverageRows.some((row) => row.toLowerCase() === lower)) return cat.id;
  }
  for (const cat of RAIL_CATEGORIES) {
    if (cat.id === lower || cat.label.toLowerCase() === lower) return cat.id;
  }
  for (const cat of RAIL_CATEGORIES) {
    if (cat.keywords.some((k) => lower.includes(k))) return cat.id;
  }
  return null;
}

/**
 * File a live recommendation under one of the ten sections: its derived
 * wardrobe category id first (most reliable), then its own words.
 */
export function railCategoryForPick(pick: {
  categoryId?: string | null;
  category?: string | null;
  subType?: string | null;
  pieceName?: string | null;
}): string {
  const categoryId = (pick.categoryId || '').toLowerCase();
  if (categoryId) {
    const byId = RAIL_CATEGORIES.find((c) => c.categoryIds.includes(categoryId));
    if (byId) return byId.id;
  }
  const text = `${pick.subType || ''} ${pick.pieceName || ''} ${pick.category || ''}`.toLowerCase();
  // Longest keyword wins, so "pocket square" beats "square" and "chore coat"
  // is not swallowed by "coat" appearing in another list.
  let best: { id: string; length: number } | null = null;
  for (const cat of RAIL_CATEGORIES) {
    for (const keyword of cat.keywords) {
      if (text.includes(keyword) && (!best || keyword.length > best.length)) {
        best = { id: cat.id, length: keyword.length };
      }
    }
  }
  return best?.id || 'tops';
}

// ---------------------------------------------------------------------------
// Beau's seeded picks — the classic, natural-material answer for each
// section, used to top a section up when the live engine has not spoken to
// it this pass. Real makers, honest price guides, one line of Beau's
// reasoning each.
// ---------------------------------------------------------------------------

export interface SeedPick {
  name: string;
  brand: string;
  price: string;
  /** Beau's justification — one sentence, his voice. */
  note: string;
  /** Canonical slot id for the house illustration fallback. */
  slotId: string;
  /** Stock-photo query used to resolve a real product photograph. */
  imageQuery: string;
}

export const SEEDED_RAIL_PICKS: Record<string, SeedPick[]> = {
  tops: [
    {
      name: 'Oxford button-down shirt',
      brand: 'Drake’s',
      price: '£145',
      note: 'The one shirt that goes under knitwear, under a blazer, or out on its own — buy it before anything else in this section.',
      slotId: 'ocbd',
      imageQuery: 'blue oxford button down shirt folded',
    },
    {
      name: 'Fine-gauge merino rollneck',
      brand: 'John Smedley',
      price: '£220',
      note: 'Does the job of a shirt and a tie at once, and reads sharper under a jacket than either.',
      slotId: 'rollneck',
      imageQuery: 'navy merino wool turtleneck sweater',
    },
    {
      name: 'Long-staple pique polo',
      brand: 'Sunspel',
      price: '£110',
      note: 'The warm-weather answer when a t-shirt is too little and a shirt too much — collar holds its shape all day.',
      slotId: 'polo',
      imageQuery: 'navy pique polo shirt product',
    },
    {
      name: 'Chambray work shirt',
      brand: 'Corridor NYC',
      price: '£160',
      note: 'Softens with every wash and bridges your smarter and rougher directions without trying.',
      slotId: 'chambray',
      imageQuery: 'chambray denim shirt hanging',
    },
  ],
  bottoms: [
    {
      name: 'Pleated cotton chino',
      brand: 'Berg & Berg',
      price: '£190',
      note: 'A single pleat gives room through the seat without volume at the hem — it flatters far more men than the flat front does.',
      slotId: 'chinos',
      imageQuery: 'beige cotton chino trousers folded',
    },
    {
      name: 'Mid-weight wool trouser',
      brand: 'Anglo-Italian',
      price: '£320',
      note: 'The piece that lets everything else in your wardrobe move up a register on demand.',
      slotId: 'wool-trousers',
      imageQuery: 'grey wool trousers menswear',
    },
    {
      name: 'Raw selvedge denim',
      brand: 'Blackhorse Lane Ateliers',
      price: '£150',
      note: 'Dark and unwashed reads far smarter than a distressed pair, and it will fade to your own shape.',
      slotId: 'raw-denim',
      imageQuery: 'raw selvedge denim jeans folded',
    },
    {
      name: 'Moleskin trouser',
      brand: 'Cordings',
      price: '£165',
      note: 'Warm, quiet and hard-wearing — the winter trouser that stops your cold-weather kit looking like a uniform.',
      slotId: 'moleskin',
      imageQuery: 'olive moleskin corduroy trousers',
    },
  ],
  shoes: [
    {
      name: 'Cap-toe Oxford',
      brand: 'Loake 1880',
      price: '£295',
      note: 'Goodyear-welted and resoleable — the smartest thing you can own, and the one shoe a suit genuinely needs.',
      slotId: 'oxfords',
      imageQuery: 'black leather oxford dress shoes',
    },
    {
      name: 'Penny loafer',
      brand: 'Morjas',
      price: '£245',
      note: 'Takes the formality out of a trouser without dropping to a sneaker — your most useful summer shoe.',
      slotId: 'loafers',
      imageQuery: 'brown leather penny loafers',
    },
    {
      name: 'Suede chukka boot',
      brand: 'Crockett & Jones',
      price: '£395',
      note: 'The bridge between your smart and casual halves — works with denim and with flannel, which almost nothing else does.',
      slotId: 'chukka',
      imageQuery: 'tan suede chukka desert boots',
    },
    {
      name: 'Minimal white leather sneaker',
      brand: 'CQP',
      price: '£250',
      note: 'One clean casual pair beats five — full-grain leather so it ages instead of yellowing.',
      slotId: 'sneakers',
      imageQuery: 'white leather minimal sneakers',
    },
  ],
  outerwear: [
    {
      name: 'Waxed field jacket',
      brand: 'Barbour (Bedale)',
      price: '£269',
      note: 'Re-waxable for life, and the one coat that looks better the harder you wear it.',
      slotId: 'wax-jacket',
      imageQuery: 'olive waxed cotton field jacket',
    },
    {
      name: 'Wool overcoat',
      brand: 'Private White V.C.',
      price: '£795',
      note: 'The piece that lifts everything under it — a coat is the only garment strangers judge from across a street.',
      slotId: 'overcoat',
      imageQuery: 'camel wool overcoat menswear',
    },
    {
      name: 'Chore coat',
      brand: 'Vetra',
      price: '£145',
      note: 'Cheap for what it is, and the most-worn layer in most wardrobes once it arrives.',
      slotId: 'chore-coat',
      imageQuery: 'navy french chore jacket workwear',
    },
    {
      name: 'Harrington jacket',
      brand: 'Baracuta G9',
      price: '£395',
      note: 'Covers the awkward months when a coat is too much and knitwear is not enough.',
      slotId: 'harrington',
      imageQuery: 'beige harrington jacket menswear',
    },
  ],
  sweatshirts: [
    {
      name: '346 Loopwheel sweatshirt',
      brand: 'Merz b. Schwanen',
      price: '£130',
      note: 'Loopwheeled on original machines — the crewneck sweatshirt that holds its shape for a decade.',
      slotId: 'sweatshirt',
      imageQuery: 'grey loopwheel cotton crewneck sweatshirt product',
    },
    {
      name: 'Heavyweight pullover hoodie',
      brand: 'Camber USA',
      price: '£110',
      note: 'Twelve-ounce US-made fleece — the hoodie that reads considered rather than gym-bound.',
      slotId: 'sweatshirt',
      imageQuery: 'heavyweight grey pullover hoodie menswear product',
    },
    {
      name: 'Synchilla Snap-T fleece pullover',
      brand: 'Patagonia',
      price: '£120',
      note: 'The original fleece pullover — an honest mid-layer with forty years of provenance.',
      slotId: 'sweatshirt',
      imageQuery: 'fleece snap t pullover menswear product',
    },
  ],
  knitwear: [
    {
      name: 'Shetland crew-neck',
      brand: 'Jamieson’s of Shetland',
      price: '£115',
      note: 'Undyed, hard-wearing wool that softens for years — the best value in menswear, full stop.',
      slotId: 'crew-knit',
      imageQuery: 'shetland wool crew neck sweater',
    },
    {
      name: 'Lambswool cardigan',
      brand: 'William Lockie',
      price: '£195',
      note: 'Does the work of a light jacket indoors — the layer that makes an outfit look considered rather than thrown on.',
      slotId: 'cardigan',
      imageQuery: 'brown lambswool cardigan knitwear',
    },
    {
      name: 'Aran fisherman jumper',
      brand: 'Inis Meáin',
      price: '£395',
      note: 'A statement knit with real provenance — wear it as the whole outfit and let the trousers stay plain.',
      slotId: 'aran',
      imageQuery: 'cream aran cable knit fisherman sweater',
    },
    {
      name: 'Merino zip-neck',
      brand: 'Sunspel',
      price: '£175',
      note: 'The quiet workhorse: opens for warmth, closes for a collar, and never creases in a bag.',
      slotId: 'zip-neck',
      imageQuery: 'grey merino zip neck sweater',
    },
  ],
  formalwear: [
    {
      name: 'Unstructured navy blazer',
      brand: 'Boglioli',
      price: '£790',
      note: 'Soft-shouldered so it wears like a cardigan and reads like tailoring — the most useful jacket you can own.',
      slotId: 'blazer',
      imageQuery: 'navy unstructured blazer jacket menswear',
    },
    {
      name: 'Worsted two-piece suit',
      brand: 'Suitsupply',
      price: '£499',
      note: 'One good mid-grey or navy suit covers every occasion that demands one — spend the rest on the alterations.',
      slotId: 'suit',
      imageQuery: 'navy wool suit on hanger',
    },
    {
      name: 'Hopsack sports jacket',
      brand: 'Anglo-Italian',
      price: '£750',
      note: 'Open-weave hopsack breathes, resists creasing and dresses down with denim — a suit jacket never will.',
      slotId: 'sports-jacket',
      imageQuery: 'brown hopsack sport coat blazer',
    },
  ],
  'base-layers': [
    {
      name: 'Loopwheeled crew-neck tee',
      brand: 'Merz b. Schwanen',
      price: '£75',
      note: 'Slow-knitted cotton that holds its shape through years of washing — the tee that stops being a base layer.',
      slotId: 'tee',
      imageQuery: 'white cotton crew neck t-shirt folded',
    },
    {
      name: 'Fine-rib cotton vest',
      brand: 'Sunspel',
      price: '£45',
      note: 'Keeps a shirt off your skin and its collar clean — invisible, and the difference is felt by six o’clock.',
      slotId: 'vest',
      imageQuery: 'white ribbed cotton undershirt vest',
    },
    {
      name: 'Merino long-sleeve base layer',
      brand: 'Smartwool',
      price: '£90',
      note: 'Warmth without bulk under a coat — the reason you can keep wearing the tailoring in January.',
      slotId: 'thermal',
      imageQuery: 'merino wool base layer long sleeve',
    },
  ],
  accessories: [
    {
      name: 'Bridle-leather belt',
      brand: 'Equus Leather',
      price: '£115',
      note: 'Match the leather to your shoes and it disappears — which is exactly what a belt should do.',
      slotId: 'belt',
      imageQuery: 'brown leather belt with brass buckle',
    },
    {
      name: 'Field watch on leather',
      brand: 'Hamilton Khaki',
      price: '£425',
      note: 'Legible, unshowy and correct with everything from a field jacket to a blazer.',
      slotId: 'watch',
      imageQuery: 'field watch leather strap menswear',
    },
    {
      name: 'Linen pocket square',
      brand: 'Drake’s',
      price: '£45',
      note: 'White linen, hand-rolled — never matched to the tie, and the cheapest way to finish a jacket properly.',
      slotId: 'pocket-square',
      imageQuery: 'white linen pocket square folded',
    },
    {
      name: 'Cashmere scarf',
      brand: 'Begg x Co',
      price: '£185',
      note: 'One warm neutral scarf outlasts a drawer of novelty ones and warms the colour by your face.',
      slotId: 'scarf',
      imageQuery: 'camel cashmere scarf folded',
    },
  ],
  bags: [
    {
      name: 'Waxed-canvas holdall',
      brand: 'Bennett Winch',
      price: '£595',
      note: 'Sized for a long weekend and built to be the last one you buy — leather ends take the wear.',
      slotId: 'holdall',
      imageQuery: 'waxed canvas leather weekend holdall bag',
    },
    {
      name: 'Leather briefcase',
      brand: 'Frank Clegg',
      price: '£850',
      note: 'A rucksack undoes tailoring at the shoulder; a flat briefcase keeps the line clean.',
      slotId: 'briefcase',
      imageQuery: 'brown leather briefcase satchel',
    },
    {
      name: 'Canvas rucksack',
      brand: 'Filson',
      price: '£295',
      note: 'For the days that are genuinely casual — heavyweight twill and bridle straps, nothing technical.',
      slotId: 'rucksack',
      imageQuery: 'olive canvas leather rucksack backpack',
    },
  ],
  hats: [
    {
      name: 'Donegal tweed flat cap',
      brand: 'Lock & Co.',
      price: '£110',
      note: 'Flecked tweed picks up the browns and olives already in your wardrobe — keep the crown low.',
      slotId: 'flat-cap',
      imageQuery: 'tweed flat cap hat menswear',
    },
    {
      name: 'Wool watch cap',
      brand: 'Heimat',
      price: '£95',
      note: 'Undyed heavy wool, a single fold — the honest winter hat, and the only one that suits a coat.',
      slotId: 'beanie',
      imageQuery: 'wool beanie watch cap knitted hat',
    },
    {
      name: 'Panama hat',
      brand: 'Lock & Co.',
      price: '£180',
      note: 'Hand-woven toquilla straw for real heat — buy it rollable and it survives the suitcase.',
      slotId: 'panama',
      imageQuery: 'straw panama hat product',
    },
  ],
};

/** A maker-direct search link, so every seeded card can still be acted on. */
export function seedSearchUrl(pick: { brand: string; name: string }): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`${pick.brand} ${pick.name}`)}`;
}

// ---------------------------------------------------------------------------
// Product imagery — the platform stock-photo endpoint, cached hard so a
// section never re-fetches the same photograph twice.
// ---------------------------------------------------------------------------

const IMAGE_CACHE_PREFIX = 'ethaion_rail_img_';
const IMAGE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const imageMemory = new Map<string, string>();
const imageInflight = new Map<string, Promise<string>>();

/** Lookup MISSES are retried after a short pause — never remembered for 30
 * days. Persisted misses were the Fitting-shelf image blocker: one failed
 * lookup (a rate-limit blip, a network drop) wrote '' into localStorage and
 * every card for that query rendered as an empty named box for a month. */
const MISS_RETRY_MS = 5 * 60 * 1000;
const missAt = new Map<string, number>();

function readImageCache(query: string): string | null {
  const inMemory = imageMemory.get(query);
  if (inMemory) return inMemory;
  try {
    const raw = localStorage.getItem(IMAGE_CACHE_PREFIX + query);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { url: string; t: number };
    if (typeof parsed?.url !== 'string' || typeof parsed?.t !== 'number') return null;
    // '' rows are poisoned miss entries written by the old cache — ignore
    // them so the lookup runs again instead of blanking the card.
    if (!parsed.url) return null;
    if (Date.now() - parsed.t > IMAGE_TTL_MS) return null;
    imageMemory.set(query, parsed.url);
    return parsed.url;
  } catch {
    return null;
  }
}

function writeImageCache(query: string, url: string): void {
  if (!url) {
    // A miss: remember it briefly in memory (a busy shelf must not hammer
    // the endpoint), but never persist it — the next session retries.
    missAt.set(query, Date.now());
    imageMemory.delete(query);
    try {
      localStorage.removeItem(IMAGE_CACHE_PREFIX + query);
    } catch { /* storage unavailable — nothing stale to clear */ }
    return;
  }
  missAt.delete(query);
  imageMemory.set(query, url);
  try {
    localStorage.setItem(IMAGE_CACHE_PREFIX + query, JSON.stringify({ url, t: Date.now() }));
  } catch { /* storage unavailable — the memory cache still holds it */ }
}

/** Synchronous peek — lets a card paint its photo on first render. */
export function peekCatalogueImage(query: string): string {
  return readImageCache((query || '').trim()) || '';
}

/**
 * A real photograph for a recommendation. Returns '' when none can be
 * resolved — the card then draws the house garment illustration instead of
 * an empty box.
 */
export async function resolveCatalogueImage(query: string): Promise<string> {
  const clean = (query || '').trim();
  if (!clean) return '';
  const cached = readImageCache(clean);
  if (cached) return cached;
  const missed = missAt.get(clean);
  if (missed && Date.now() - missed < MISS_RETRY_MS) return '';
  const running = imageInflight.get(clean);
  if (running) return running;

  const job = (async () => {
    try {
      // A slightly wider pool than one result: niche menswear queries often
      // miss on the very first hit, and a portrait crop suits the 3:4 plate.
      const params = new URLSearchParams({ query: clean, perPage: '3', orientation: 'portrait' });
      const res = await fetch(`/api/stock-photos?${params.toString()}`);
      if (!res.ok) throw new Error(`stock photo lookup failed: ${res.status}`);
      const data = await res.json();
      const hit = Array.isArray(data?.results) ? data.results.find((r: any) => r?.urls?.small || r?.urls?.regular) : null;
      const url = hit?.urls?.small || hit?.urls?.regular || '';
      writeImageCache(clean, typeof url === 'string' ? url : '');
      return typeof url === 'string' ? url : '';
    } catch (e) {
      console.warn('[Ethaion] rail product image lookup failed:', e);
      // Cache the miss too — a failing query should not be hammered.
      writeImageCache(clean, '');
      return '';
    } finally {
      imageInflight.delete(clean);
    }
  })();
  imageInflight.set(clean, job);
  return job;
}

/** The stock-photo query for a LIVE recommendation, built from its own words. */
export function queryForLivePick(pick: { subType?: string | null; pieceName?: string | null; material?: string | null }): string {
  const words = [pick.subType || pick.pieceName || '', 'menswear product'].filter(Boolean).join(' ');
  return words.trim().toLowerCase();
}
