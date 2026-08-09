/**
 * THE RAIL'S SUB-CATEGORY SPINE (Beau intelligence overhaul — two-tier Rail).
 *
 * The Rail is now TWO tiers:
 *   TIER 1 — categories in essentialness order, each holding illustrated
 *   sub-category cards (the house drawing language). Illustrations are
 *   NAVIGATION ONLY — they never stand in for a product photo.
 *   TIER 2 — tapping a sub-category opens its product recommendations:
 *   3–5 Beau-curated specific pieces, each with a REAL product photograph,
 *   maker, price, one line of Beau's reasoning and 2–3 direct buy links.
 *
 * Three things live here:
 *  1. RAIL_SUBCATEGORIES — the sub-categories under each of the ten
 *     rail categories (rail-catalogue.ts), with the illustration slot id
 *     for the Tier 1 card and the keywords that file gaps and live picks.
 *  2. SUBCATEGORY_SEEDS — Beau's standing recommendations, 3 per
 *     sub-category: real makers, honest price guides, one line of his
 *     reasoning, and a stock-photo query for the product plate. They top
 *     each Tier 2 page up so EVERY gap lands on real recommendations.
 *  3. retailLinksFor — the buy-link builder: brand-store search where the
 *     maker's own shop is known, then tightly filtered searches on real
 *     retailer sites (eBay, Grailed) — never a bare homepage, never an
 *     invented product URL that 404s.
 */

export interface RailSubcategory {
  id: string;
  /** Card label — e.g. "Chelsea Boot". */
  label: string;
  /** The rail category (rail-catalogue.ts RAIL_CATEGORIES id) it lives under. */
  categoryId: string;
  /** Illustration id for the Tier 1 card (illustrations.tsx). */
  slotId: string;
  /** Words that route a gap or a live pick to this sub-category. */
  keywords: string[];
}

export const RAIL_SUBCATEGORIES: Record<string, RailSubcategory[]> = {
  tops: [
    // Oxford Shirt is ONE card covering the full Oxford-cloth family —
    // spread/tab-collar AND button-down (OCBD) variants alike. NEVER a
    // separate OCBD card. The poplin/formal register lives under
    // "Other Tops →" as Dress Shirt.
    { id: 'oxford-shirt', label: 'Oxford Shirt', categoryId: 'tops', slotId: 'ocbd', keywords: ['oxford shirt', 'oxford cloth', 'ocbd', 'button-down', 'button down shirt', 'oxford button', 'spread collar', 'tab collar'] },
    { id: 'polo', label: 'Polo', categoryId: 'tops', slotId: 'polo', keywords: ['polo', 'pique'] },
    { id: 'turtleneck', label: 'Turtleneck', categoryId: 'tops', slotId: 'crewneck', keywords: ['turtleneck', 'rollneck', 'roll neck', 'polo neck'] },
    { id: 't-shirt', label: 'T-shirt', categoryId: 'tops', slotId: 'tee', keywords: ['t-shirt', 'tee', 'tshirt'] },
  ],
  bottoms: [
    { id: 'chinos', label: 'Chinos', categoryId: 'bottoms', slotId: 'chinos', keywords: ['chino', 'khaki'] },
    { id: 'dress-trousers', label: 'Dress Trousers', categoryId: 'bottoms', slotId: 'trousers', keywords: ['dress trouser', 'wool trouser', 'flannel trouser', 'formal trouser', 'trouser', 'slack', 'moleskin'] },
    { id: 'jeans', label: 'Jeans', categoryId: 'bottoms', slotId: 'jeans', keywords: ['jean', 'denim', 'selvedge'] },
    { id: 'shorts', label: 'Shorts', categoryId: 'bottoms', slotId: 'shorts', keywords: ['short'] },
  ],
  shoes: [
    { id: 'oxford-shoe', label: 'Oxford', categoryId: 'shoes', slotId: 'derbies', keywords: ['oxford shoe', 'cap-toe', 'cap toe', 'balmoral'] },
    { id: 'derby', label: 'Derby', categoryId: 'shoes', slotId: 'derbies', keywords: ['derby', 'blucher', 'brogue'] },
    { id: 'loafer', label: 'Loafer', categoryId: 'shoes', slotId: 'loafers', keywords: ['loafer', 'moccasin', 'suede buck'] },
    { id: 'chelsea-boot', label: 'Chelsea Boot', categoryId: 'shoes', slotId: 'boots', keywords: ['chelsea', 'boot'] },
    { id: 'sneaker', label: 'Sneaker', categoryId: 'shoes', slotId: 'sneakers', keywords: ['sneaker', 'trainer', 'plimsoll'] },
    { id: 'desert-boot', label: 'Desert Boot', categoryId: 'shoes', slotId: 'boots', keywords: ['desert boot', 'chukka'] },
  ],
  outerwear: [
    { id: 'harrington', label: 'Harrington', categoryId: 'outerwear', slotId: 'harrington', keywords: ['harrington', 'blouson', 'bomber'] },
    { id: 'field-jacket', label: 'Field Jacket', categoryId: 'outerwear', slotId: 'field-jacket', keywords: ['field jacket', 'm65', 'm-65', 'm43', 'm-43', 'chore', 'utility jacket', 'tweed'] },
    { id: 'overcoat', label: 'Overcoat', categoryId: 'outerwear', slotId: 'overcoat', keywords: ['overcoat', 'topcoat', 'wool coat'] },
    { id: 'raincoat', label: 'Raincoat', categoryId: 'outerwear', slotId: 'raincoat', keywords: ['raincoat', 'mac', 'mackintosh', 'trench', 'anorak', 'parka'] },
    { id: 'blazer-outer', label: 'Blazer', categoryId: 'outerwear', slotId: 'blazer', keywords: ['blazer', 'unstructured jacket'] },
  ],
  knitwear: [
    { id: 'crew-neck', label: 'Crew Neck Jumper', categoryId: 'knitwear', slotId: 'crewneck', keywords: ['crew neck', 'crew-neck', 'crewneck', 'shetland', 'guernsey', 'jumper', 'sweater', 'knit'] },
    { id: 'v-neck', label: 'V-Neck', categoryId: 'knitwear', slotId: 'crewneck', keywords: ['v-neck', 'v neck'] },
    { id: 'zip-neck', label: 'Zip Neck', categoryId: 'knitwear', slotId: 'crewneck', keywords: ['zip neck', 'zip-neck', 'quarter zip', 'half zip'] },
    { id: 'cardigan', label: 'Cardigan', categoryId: 'knitwear', slotId: 'cardigan', keywords: ['cardigan', 'shawl collar'] },
  ],
  sweatshirts: [
    { id: 'crewneck-sweatshirt', label: 'Crewneck Sweatshirt', categoryId: 'sweatshirts', slotId: 'sweatshirt', keywords: ['sweatshirt', 'crewneck sweatshirt', 'crew neck sweatshirt', 'loopwheel', 'reverse weave'] },
    { id: 'hoodie', label: 'Hoodie', categoryId: 'sweatshirts', slotId: 'sweatshirt', keywords: ['hoodie', 'hooded sweatshirt', 'zip hoodie', 'pullover hoodie'] },
    { id: 'fleece-pullover', label: 'Fleece Pullover', categoryId: 'sweatshirts', slotId: 'sweatshirt', keywords: ['fleece pullover', 'fleece jumper', 'snap-t', 'snap t', 'polar fleece'] },
  ],
  formalwear: [
    { id: 'suit', label: 'Suit', categoryId: 'formalwear', slotId: 'suit', keywords: ['suit', 'two-piece'] },
    { id: 'sport-coat', label: 'Sport Coat', categoryId: 'formalwear', slotId: 'blazer', keywords: ['sport coat', 'sports jacket', 'sport jacket', 'hopsack'] },
    { id: 'waistcoat', label: 'Waistcoat', categoryId: 'formalwear', slotId: 'suit', keywords: ['waistcoat', 'vest'] },
  ],
  'base-layers': [
    { id: 'undershirt', label: 'Undershirt', categoryId: 'base-layers', slotId: 'tee', keywords: ['undershirt', 'vest'] },
    { id: 'base-layer-top', label: 'Base Layer Top', categoryId: 'base-layers', slotId: 'thermal', keywords: ['base layer', 'thermal', 'merino base'] },
  ],
  accessories: [
    { id: 'belt', label: 'Belt', categoryId: 'accessories', slotId: 'belt', keywords: ['belt'] },
    { id: 'watch', label: 'Watch', categoryId: 'accessories', slotId: 'generic', keywords: ['watch'] },
    { id: 'pocket-square', label: 'Pocket Square', categoryId: 'accessories', slotId: 'generic', keywords: ['pocket square'] },
    { id: 'tie', label: 'Tie', categoryId: 'accessories', slotId: 'tie', keywords: ['tie', 'grenadine', 'necktie'] },
    { id: 'scarf', label: 'Scarf', categoryId: 'accessories', slotId: 'scarf', keywords: ['scarf'] },
  ],
  bags: [
    { id: 'tote', label: 'Tote', categoryId: 'bags', slotId: 'bag', keywords: ['tote'] },
    { id: 'weekender', label: 'Weekender', categoryId: 'bags', slotId: 'bag', keywords: ['weekender', 'holdall', 'duffle bag', 'duffel'] },
    { id: 'briefcase', label: 'Briefcase / Portfolio', categoryId: 'bags', slotId: 'briefcase', keywords: ['briefcase', 'portfolio'] },
  ],
  hats: [
    { id: 'cap', label: 'Cap', categoryId: 'hats', slotId: 'flat-cap', keywords: ['cap', 'flat cap', 'baseball'] },
    { id: 'beanie', label: 'Beanie', categoryId: 'hats', slotId: 'beanie', keywords: ['beanie', 'watch cap'] },
    { id: 'bucket-hat', label: 'Bucket Hat', categoryId: 'hats', slotId: 'brimmed-hat', keywords: ['bucket', 'brimmed'] },
  ],
};

// ---------------------------------------------------------------------------
// "Other [Category] →" — the less-common sub-types behind each category's
// plain-text row on Tier 1 (never illustrated cards). Tapping one opens the
// SAME Tier 2 product-recommendations page an illustrated card opens, so
// nothing is hidden: common types get drawings, everything else sits one
// tap away in a simple text list.
// ---------------------------------------------------------------------------

export const RAIL_OTHER_SUBCATEGORIES: Record<string, RailSubcategory[]> = {
  tops: [
    { id: 'dress-shirt', label: 'Dress Shirt', categoryId: 'tops', slotId: 'dress-shirt', keywords: ['dress shirt', 'poplin shirt', 'formal shirt', 'poplin'] },
    { id: 'flannel-shirt', label: 'Flannel Shirt', categoryId: 'tops', slotId: 'flannel', keywords: ['flannel shirt', 'brushed cotton shirt'] },
    { id: 'linen-shirt', label: 'Linen Shirt', categoryId: 'tops', slotId: 'casual-shirt', keywords: ['linen shirt'] },
    { id: 'chambray-shirt', label: 'Chambray / Work Shirt', categoryId: 'tops', slotId: 'casual-shirt', keywords: ['chambray', 'work shirt', 'denim shirt'] },
    { id: 'henley', label: 'Henley', categoryId: 'tops', slotId: 'tee', keywords: ['henley'] },
    { id: 'overshirt', label: 'Overshirt', categoryId: 'tops', slotId: 'chore-jacket', keywords: ['overshirt', 'shacket', 'shirt jacket'] },
  ],
  bottoms: [
    { id: 'corduroy-trousers', label: 'Corduroy Trousers', categoryId: 'bottoms', slotId: 'trousers', keywords: ['corduroy', 'cord trouser', 'cords', 'needlecord'] },
    { id: 'linen-trousers', label: 'Linen Trousers', categoryId: 'bottoms', slotId: 'trousers', keywords: ['linen trouser', 'linen pant'] },
    { id: 'fatigue-trousers', label: 'Fatigue / Cargo Trousers', categoryId: 'bottoms', slotId: 'trousers', keywords: ['fatigue', 'cargo trouser', 'cargo pant', 'military trouser'] },
    { id: 'swim-shorts', label: 'Swim Shorts', categoryId: 'bottoms', slotId: 'shorts', keywords: ['swim short', 'swim trunk', 'swimwear', 'board short'] },
  ],
  shoes: [
    { id: 'monk-strap', label: 'Monk Strap', categoryId: 'shoes', slotId: 'derbies', keywords: ['monk strap', 'monk shoe', 'double monk', 'single monk'] },
    { id: 'penny-loafer', label: 'Penny Loafer', categoryId: 'shoes', slotId: 'loafers', keywords: ['penny loafer', 'weejun'] },
    { id: 'mule', label: 'Mule', categoryId: 'shoes', slotId: 'loafers', keywords: ['mule', 'babouche'] },
    { id: 'espadrille', label: 'Espadrille', categoryId: 'shoes', slotId: 'espadrilles', keywords: ['espadrille', 'alpargata'] },
    { id: 'boat-shoe', label: 'Boat Shoe', categoryId: 'shoes', slotId: 'loafers', keywords: ['boat shoe', 'deck shoe', 'topsider'] },
  ],
  outerwear: [
    { id: 'peacoat', label: 'Peacoat', categoryId: 'outerwear', slotId: 'overcoat', keywords: ['peacoat', 'pea coat'] },
    { id: 'duffle-coat', label: 'Duffle Coat', categoryId: 'outerwear', slotId: 'overcoat', keywords: ['duffle coat', 'duffel coat', 'duffle', 'toggle coat'] },
    { id: 'waxed-jacket', label: 'Waxed Jacket', categoryId: 'outerwear', slotId: 'waxed-jacket', keywords: ['wax jacket', 'waxed jacket', 'waxed cotton', 'wax cotton'] },
    { id: 'gilet', label: 'Gilet', categoryId: 'outerwear', slotId: 'field-jacket', keywords: ['gilet', 'bodywarmer', 'body warmer', 'quilted vest'] },
  ],
  knitwear: [
    { id: 'aran-jumper', label: 'Aran Jumper', categoryId: 'knitwear', slotId: 'crewneck', keywords: ['aran', 'fisherman jumper', 'cable knit', 'cable-knit'] },
    { id: 'fair-isle', label: 'Fair Isle', categoryId: 'knitwear', slotId: 'crewneck', keywords: ['fair isle', 'fairisle'] },
    { id: 'knitted-polo', label: 'Knitted Polo', categoryId: 'knitwear', slotId: 'polo', keywords: ['knitted polo', 'knit polo', 'long sleeve polo'] },
    { id: 'slipover', label: 'Slipover', categoryId: 'knitwear', slotId: 'crewneck', keywords: ['slipover', 'sleeveless jumper', 'knitted vest'] },
  ],
  formalwear: [
    { id: 'dinner-suit', label: 'Dinner Suit (Black Tie)', categoryId: 'formalwear', slotId: 'dinner-suit', keywords: ['dinner suit', 'tuxedo', 'black tie', 'dinner jacket'] },
    { id: 'morning-suit', label: 'Morning Suit', categoryId: 'formalwear', slotId: 'suit', keywords: ['morning suit', 'morning dress', 'tailcoat'] },
  ],
  'base-layers': [
    { id: 'long-johns', label: 'Long Johns', categoryId: 'base-layers', slotId: 'long-johns', keywords: ['long johns', 'long underwear', 'thermal bottom'] },
    { id: 'boxers', label: 'Boxers & Briefs', categoryId: 'base-layers', slotId: 'generic', keywords: ['boxer', 'briefs', 'trunks'] },
    { id: 'socks', label: 'Socks', categoryId: 'base-layers', slotId: 'generic', keywords: ['sock'] },
  ],
  accessories: [
    { id: 'sunglasses', label: 'Sunglasses', categoryId: 'accessories', slotId: 'generic', keywords: ['sunglasses', 'shades', 'eyewear'] },
    { id: 'gloves', label: 'Gloves', categoryId: 'accessories', slotId: 'gloves', keywords: ['glove'] },
    { id: 'braces', label: 'Braces', categoryId: 'accessories', slotId: 'generic', keywords: ['braces', 'suspenders'] },
    { id: 'cufflinks', label: 'Cufflinks', categoryId: 'accessories', slotId: 'generic', keywords: ['cufflink'] },
    { id: 'wallet', label: 'Wallet', categoryId: 'accessories', slotId: 'generic', keywords: ['wallet', 'cardholder', 'card holder', 'billfold'] },
  ],
  bags: [
    { id: 'rucksack', label: 'Rucksack', categoryId: 'bags', slotId: 'backpack', keywords: ['rucksack', 'backpack', 'daypack'] },
    { id: 'messenger-bag', label: 'Messenger / Satchel', categoryId: 'bags', slotId: 'bag', keywords: ['messenger', 'satchel', 'crossbody', 'shoulder bag'] },
    { id: 'washbag', label: 'Washbag', categoryId: 'bags', slotId: 'bag', keywords: ['washbag', 'dopp kit', 'toiletry'] },
  ],
  hats: [
    { id: 'panama', label: 'Panama', categoryId: 'hats', slotId: 'brimmed-hat', keywords: ['panama', 'straw hat'] },
    { id: 'fedora', label: 'Fedora / Trilby', categoryId: 'hats', slotId: 'brimmed-hat', keywords: ['fedora', 'trilby', 'felt hat'] },
  ],
};

const ALL_SUBCATEGORIES: RailSubcategory[] = Object.keys(RAIL_SUBCATEGORIES)
  .reduce((acc: RailSubcategory[], key) => acc.concat(RAIL_SUBCATEGORIES[key]), [])
  .concat(
    Object.keys(RAIL_OTHER_SUBCATEGORIES).reduce(
      (acc: RailSubcategory[], key) => acc.concat(RAIL_OTHER_SUBCATEGORIES[key]),
      [],
    ),
  );

export function railSubcategory(id: string | null | undefined): RailSubcategory | null {
  if (!id) return null;
  return ALL_SUBCATEGORIES.find((s) => s.id === id) || null;
}

export function subcategoriesFor(categoryId: string): RailSubcategory[] {
  return RAIL_SUBCATEGORIES[categoryId] || [];
}

/** The less-common sub-types behind the "Other [Category] →" row — plain
 * text entries; each opens the same Tier 2 page an illustrated card does. */
export function otherSubcategoriesFor(categoryId: string): RailSubcategory[] {
  return RAIL_OTHER_SUBCATEGORIES[categoryId] || [];
}

/** The sub-category some free text (a gap label, a pick's own words) belongs
 * to — longest keyword wins, so "oxford shoe" beats "shoe" and "zip neck"
 * beats "neck". Returns null when nothing matches. */
export function subcategoryForText(text: string | null | undefined): RailSubcategory | null {
  const lower = (text || '').toLowerCase();
  if (!lower.trim()) return null;
  let best: { sub: RailSubcategory; length: number } | null = null;
  for (const sub of ALL_SUBCATEGORIES) {
    for (const keyword of sub.keywords) {
      if (lower.includes(keyword) && (!best || keyword.length > best.length)) {
        best = { sub, length: keyword.length };
      }
    }
    if (lower.includes(sub.label.toLowerCase()) && (!best || sub.label.length > best.length)) {
      best = { sub, length: sub.label.length };
    }
  }
  return best ? best.sub : null;
}

/** File a live engine recommendation under a sub-category. Falls back to the
 * lead sub-category of the pick's rail category. */
export function subcategoryForPick(pick: {
  subType?: string | null;
  pieceName?: string | null;
  category?: string | null;
}, railCategoryId: string): RailSubcategory | null {
  const matched = subcategoryForText(`${pick.subType || ''} ${pick.pieceName || ''} ${pick.category || ''}`);
  if (matched && matched.categoryId === railCategoryId) return matched;
  if (matched) return matched;
  const siblings = RAIL_SUBCATEGORIES[railCategoryId] || [];
  return siblings.length > 0 ? siblings[0] : null;
}

// ---------------------------------------------------------------------------
// Buy links — real URLs only: the maker's own store search where the shop is
// known, then tightly filtered searches on real retailer sites. Never a bare
// homepage, never an invented product path.
// ---------------------------------------------------------------------------

export interface RetailLink {
  retailer: string;
  url: string;
  /** 'view' for secondhand marketplaces ("View on Grailed"), 'buy' otherwise. */
  kind: 'buy' | 'view';
}

/** Maker-store search templates — only shops whose search URL is known good. */
const BRAND_STORES: Record<string, string> = {
  "drake's": 'https://drakes.com/search?q=',
  sunspel: 'https://www.sunspel.com/search?q=',
  'john smedley': 'https://www.johnsmedley.com/search?q=',
  "colhay's": 'https://colhays.com/search?q=',
  'berg & berg': 'https://bergbergstore.com/search?q=',
  'bennett winch': 'https://www.bennettwinch.com/search?q=',
  'lady white co.': 'https://www.ladywhiteco.com/search?q=',
  'blackhorse lane ateliers': 'https://blackhorselane.com/search?q=',
  morjas: 'https://www.morjas.com/search?q=',
  casatlantic: 'https://casatlantic.com/search?q=',
  filson: 'https://www.filson.com/search?q=',
  'luca faloni': 'https://lucafaloni.com/search?q=',
  'merz b. schwanen': 'https://www.merz-schwanen.com/search?q=',
  'gitman vintage': 'https://gitmanvintage.com/search?q=',
  'universal works': 'https://www.universalworks.co.uk/search?q=',
  'stan ray': 'https://www.stanrayusa.com/search?q=',
  'private white v.c.': 'https://www.privatewhitevc.com/search?q=',
};

function q(parts: Array<string | null | undefined>): string {
  return encodeURIComponent(parts.filter(Boolean).join(' ').trim());
}

/**
 * 2–3 direct buy links for a specific piece: the exact product page when one
 * is stored; otherwise the maker's own store search plus tightly filtered
 * searches on the secondhand market.
 */
export function retailLinksFor(
  brand: string | null | undefined,
  name: string | null | undefined,
  productUrl?: string | null,
): RetailLink[] {
  const links: RetailLink[] = [];
  const brandClean = (brand || '').trim();
  const query = q([brandClean, name]);
  if (productUrl && /^https?:\/\//i.test(productUrl)) {
    links.push({ retailer: brandClean || 'the maker', url: productUrl, kind: 'buy' });
  } else if (brandClean && BRAND_STORES[brandClean.toLowerCase()]) {
    links.push({ retailer: brandClean, url: `${BRAND_STORES[brandClean.toLowerCase()]}${q([name])}`, kind: 'buy' });
  }
  links.push({ retailer: 'eBay', url: `https://www.ebay.co.uk/sch/i.html?_nkw=${query}`, kind: 'view' });
  links.push({ retailer: 'Grailed', url: `https://www.grailed.com/shop?query=${query}`, kind: 'view' });
  return links.slice(0, 3);
}

/** The one URL to reach a piece by — its product page, or the best filtered
 * search. Never empty, so a Beau pick can always carry a buy link. */
export function primaryBuyUrl(
  brand: string | null | undefined,
  name: string | null | undefined,
  productUrl?: string | null,
): string {
  const links = retailLinksFor(brand, name, productUrl);
  return links[0].url;
}

// ---------------------------------------------------------------------------
// Beau's standing recommendations — 3 per sub-category, so every gap tapped
// in The Edit lands on real, specific pieces. Real makers, honest price
// guides, one line of his reasoning, and a stock-photo query for the plate.
// ---------------------------------------------------------------------------

export interface SubSeedPick {
  name: string;
  brand: string;
  price: string;
  /** Beau's justification — why this piece, why for this person. */
  note: string;
  /** Stock-photo query used to resolve a real product photograph. */
  imageQuery: string;
}

export const SUBCATEGORY_SEEDS: Record<string, SubSeedPick[]> = {
  // Oxford Shirt is ONE family — button-down (OCBD) and spread/tab collar
  // variants together on one page; the picks cover both registers.
  'oxford-shirt': [
    { name: 'Vintage Ivy OCBD', brand: 'Kamakura Shirts', price: '£90', note: 'The button-down at its best — the one shirt that goes under knitwear, under a blazer, or out on its own; buy it before anything else here.', imageQuery: 'blue oxford button down collar shirt product' },
    { name: 'Cotton Oxford Button-Down', brand: "Drake's", price: '£175', note: 'The benchmark OCBD — heavyweight cloth with real texture and a collar that rolls instead of standing to attention.', imageQuery: 'white oxford button down shirt product' },
    { name: 'Tokyo Classic Fit Spread Collar Oxford', brand: 'Kamakura Shirts', price: '£95', note: 'The same Oxford cloth under a proper spread collar — the dressier read of the family, correct under tailoring where a button-down reads campus.', imageQuery: 'blue oxford cloth spread collar shirt menswear product' },
    { name: 'Spread Collar Oxford Shirt', brand: 'Berg & Berg', price: '£150', note: 'Textured oxford with a clean spread collar — bridges dress trousers and denim without leaning Ivy.', imageQuery: 'white oxford spread collar shirt menswear product' },
  ],
  polo: [
    { name: 'Riviera Polo', brand: 'Sunspel', price: '£115', note: 'The open-weave Riviera cotton breathes in real heat and the collar never curls — the summer answer.', imageQuery: 'navy cotton polo shirt menswear product' },
    { name: 'Adrian Sea Island Cotton Polo', brand: 'John Smedley', price: '£165', note: 'A knitted polo reads a register above pique — this is the one that goes under a blazer.', imageQuery: 'knitted polo shirt menswear product' },
    { name: 'M12 Made in England Polo', brand: 'Fred Perry', price: '£95', note: 'The original English pique polo, still made in England — honest, correct, unkillable.', imageQuery: 'pique polo shirt menswear product' },
  ],
  turtleneck: [
    { name: 'Cherwell Merino Rollneck', brand: 'John Smedley', price: '£220', note: 'Does the job of a shirt and a tie at once, and reads sharper under a jacket than either.', imageQuery: 'navy merino wool turtleneck sweater product' },
    { name: 'Lambswool Rollneck', brand: "Colhay's", price: '£195', note: 'Scottish-spun lambswool with more body than merino — the winter version of the same idea.', imageQuery: 'grey lambswool rollneck sweater product' },
    { name: 'Merino Rollneck', brand: 'Sunspel', price: '£175', note: 'Fine-gauge and quiet — the rollneck that disappears under tailoring instead of bulking it.', imageQuery: 'black merino rollneck sweater menswear' },
  ],
  't-shirt': [
    { name: '215 Classic Crew Neck Tee', brand: 'Merz b. Schwanen', price: '£75', note: 'Loopwheeled cotton that holds its shape through years of washing — the tee that stops being a base layer.', imageQuery: 'white heavyweight cotton t-shirt product' },
    { name: 'Our T-Shirt', brand: 'Lady White Co.', price: '£55', note: 'LA-made single-jersey with a proper collar — the white tee that survives being the whole outfit.', imageQuery: 'white cotton t-shirt folded product' },
    { name: 'Riviera T-Shirt', brand: 'Sunspel', price: '£70', note: 'The dressed-up tee — open-weave cotton that reads considered rather than undershirt.', imageQuery: 'navy cotton t-shirt menswear product' },
  ],
  chinos: [
    { name: 'El Jadida High-Rise Chinos', brand: 'Casatlantic', price: '£150', note: 'A higher rise lengthens the leg line — the most flattering chino cut going, made in Morocco.', imageQuery: 'tan cotton chino trousers menswear product' },
    { name: 'Pleated Cotton Chino', brand: 'Berg & Berg', price: '£190', note: 'A single pleat gives room through the seat without volume at the hem — it flatters far more men than the flat front does.', imageQuery: 'beige pleated chino trousers folded' },
    { name: 'Flat Front Chino', brand: "Drake's", price: '£195', note: 'The sharper flat-front version for the days chinos are standing in for trousers.', imageQuery: 'olive cotton chino trousers menswear' },
  ],
  'dress-trousers': [
    { name: 'Grey Flannel Trousers', brand: 'Rota', price: '£240', note: 'Vitale Barberis flannel, made in Italy — the trouser that lets everything above it move up a register.', imageQuery: 'grey wool flannel trousers menswear product' },
    { name: 'Mid-Weight Wool Trousers', brand: 'Anglo-Italian', price: '£320', note: 'The London cut of the Neapolitan trouser — high rise, clean drape, no fuss.', imageQuery: 'brown wool trousers menswear tailoring' },
    { name: 'Dress Trousers', brand: 'Spier & Mackay', price: '£110', note: 'The honest entry point — proper cloth and a real rise at a price that leaves money for the shoes.', imageQuery: 'charcoal wool dress trousers product' },
  ],
  jeans: [
    { name: 'NW1 Slim Tapered Selvedge', brand: 'Blackhorse Lane Ateliers', price: '£150', note: 'London-made raw selvedge with free lifetime repairs — dark, unwashed, and it fades to your own shape.', imageQuery: 'raw selvedge denim jeans folded product' },
    { name: '105 Standard Selvedge', brand: 'orSlow', price: '£230', note: 'The Japanese standard-fit jean — straight, honest, and cut for actual bodies.', imageQuery: 'indigo selvedge jeans menswear product' },
    { name: '1108 Slim Straight', brand: 'Full Count', price: '£240', note: 'Zimbabwe cotton denim that starts soft — the raw jean for men who hate breaking jeans in.', imageQuery: 'dark indigo denim jeans product' },
  ],
  shorts: [
    { name: 'Cotton Twill Shorts', brand: 'Sunspel', price: '£95', note: 'Cut like trousers, not swimwear — the short that stays correct at dinner.', imageQuery: 'beige cotton twill shorts menswear' },
    { name: 'Bulldog Shorts', brand: 'Orlebar Brown', price: '£145', note: 'The tailored swim short that passes as a dry short — one pair covers the whole holiday.', imageQuery: 'navy tailored swim shorts product' },
    { name: 'Fatigue Shorts', brand: 'Stan Ray', price: '£70', note: 'Ripstop cotton, made honestly — the rough-end short for actual weekends.', imageQuery: 'olive fatigue shorts menswear product' },
  ],
  'oxford-shoe': [
    { name: 'Aldwych Cap-Toe Oxford', brand: 'Loake 1880', price: '£320', note: 'Goodyear-welted and resoleable — the smartest thing you can own, and the one shoe a suit genuinely needs.', imageQuery: 'black leather cap toe oxford shoes product' },
    { name: 'Connaught Cap-Toe Oxford', brand: 'Crockett & Jones', price: '£450', note: 'The Northampton benchmark — buy it once, resole it for decades.', imageQuery: 'dark brown oxford dress shoes product' },
    { name: 'Cap-Toe Oxford in Bordeaux', brand: 'Carmina', price: '£330', note: 'Spanish making at English quality — the bordeaux shade warms against your complexion where black flattens.', imageQuery: 'burgundy leather oxford shoes product' },
  ],
  derby: [
    { name: 'Chambord Derby', brand: 'Paraboot', price: '£360', note: 'Norwegian-welted and nearly weatherproof — the derby that works as hard as a boot.', imageQuery: 'brown leather derby shoes product' },
    { name: 'Chester Derby Brogue', brand: 'Loake 1880', price: '£320', note: 'The full country brogue — correct with flannel, tweed and denim alike.', imageQuery: 'tan leather brogue derby shoes' },
    { name: 'Plain Derby', brand: 'Meermin', price: '£210', note: 'Goodyear-welted at the friendliest price in the game — the sensible first smart shoe.', imageQuery: 'brown derby shoes menswear product' },
  ],
  loafer: [
    { name: 'The Penny Loafer', brand: 'Morjas', price: '£245', note: 'Takes the formality out of a trouser without dropping to a sneaker — your most useful summer shoe.', imageQuery: 'brown leather penny loafers product' },
    { name: 'Weejuns Larson Penny Loafer', brand: 'G.H. Bass', price: '£150', note: 'The original penny loafer, still the honest entry point to the whole idea.', imageQuery: 'burgundy penny loafers menswear product' },
    { name: 'Boston Tassel Loafer', brand: 'Crockett & Jones', price: '£420', note: 'The grown-up version — tassels read sharper than pennies once tailoring is involved.', imageQuery: 'dark brown tassel loafers product' },
  ],
  'chelsea-boot': [
    { name: 'Comfort Craftsman', brand: 'R.M. Williams', price: '£429', note: 'One-piece leather vamp, resoleable for life — the chelsea that outlives fashion cycles.', imageQuery: 'brown leather chelsea boots product' },
    { name: 'Chelsea 5 Boot', brand: 'Crockett & Jones', price: '£495', note: 'The refined English chelsea — clean enough for a suit, tough enough for the season.', imageQuery: 'dark brown suede chelsea boots product' },
    { name: 'Chelsea Boot', brand: 'Sanders', price: '£250', note: 'Northampton-made at the accessible end — the right first pair.', imageQuery: 'black leather chelsea boots menswear' },
  ],
  sneaker: [
    { name: 'Racquet Sr Sneaker', brand: 'CQP', price: '£250', note: 'One clean casual pair beats five — full-grain leather so it ages instead of yellowing.', imageQuery: 'white leather minimal sneakers product' },
    { name: 'Achilles Low', brand: 'Common Projects', price: '£320', note: 'The minimal sneaker the rest are copies of — Italian-made and worth the sting.', imageQuery: 'white leather low top sneakers product' },
    { name: 'Star Master', brand: 'Novesta', price: '£75', note: 'Canvas and natural rubber, made in Slovakia — the honest summer alternative.', imageQuery: 'white canvas sneakers menswear product' },
  ],
  'desert-boot': [
    { name: 'Greenflex Desert Boot', brand: 'Astorflex', price: '£125', note: 'Italian suede on a natural crepe sole — better made than the famous one, for less.', imageQuery: 'tan suede desert boots product' },
    { name: 'Desert Boot Made in England', brand: 'Clarks Originals', price: '£150', note: 'The original, in its England-made grade — the casual boot that goes with everything you own.', imageQuery: 'sand suede desert boots menswear' },
    { name: 'Chiltern Chukka', brand: 'Crockett & Jones', price: '£480', note: 'The bridge between your smart and casual halves — works with denim and with flannel, which almost nothing else does.', imageQuery: 'brown suede chukka boots product' },
  ],
  harrington: [
    { name: 'G9 Harrington', brand: 'Baracuta', price: '£395', note: 'The original — covers the awkward months when a coat is too much and knitwear is not enough.', imageQuery: 'beige harrington jacket menswear product' },
    { name: 'Ventile Harrington', brand: 'Private White V.C.', price: '£395', note: 'Weatherproof Ventile cotton, made in Manchester — the technical version with none of the technical look.', imageQuery: 'stone harrington jacket menswear' },
    { name: 'Harrington Jacket', brand: 'Grenfell', price: '£445', note: 'English cloth, English making — the quiet-luxury take on the same silhouette.', imageQuery: 'navy harrington jacket product' },
  ],
  'field-jacket': [
    { name: 'Bedale Waxed Jacket', brand: 'Barbour', price: '£269', note: 'Re-waxable for life, and the one coat that looks better the harder you wear it.', imageQuery: 'olive waxed cotton field jacket product' },
    { name: 'M-43 Field Jacket', brand: 'Buzz Rickson', price: '£395', note: 'The repro done properly — back-satin cotton to the original spec.', imageQuery: 'olive military field jacket menswear' },
    { name: 'Chore Coat', brand: 'Vetra', price: '£145', note: 'Cheap for what it is, and the most-worn layer in most wardrobes once it arrives.', imageQuery: 'navy french chore jacket workwear product' },
  ],
  overcoat: [
    { name: 'Wool Overcoat', brand: 'Private White V.C.', price: '£795', note: 'The piece that lifts everything under it — a coat is the only garment strangers judge from across a street.', imageQuery: 'camel wool overcoat menswear product' },
    { name: 'Monty Duffle Coat', brand: 'Gloverall', price: '£375', note: 'English wool and horn toggles — the casual-register overcoat.', imageQuery: 'camel duffle coat menswear product' },
    { name: 'Wool Topcoat', brand: 'Berg & Berg', price: '£640', note: 'Clean, unstructured and long enough to matter — the tailoring-adjacent option.', imageQuery: 'grey wool topcoat menswear product' },
  ],
  raincoat: [
    { name: 'Bonded Cotton Mac', brand: 'Mackintosh', price: '£595', note: 'Hand-bonded in Scotland — the rain layer that reads as tailoring, not hiking kit.', imageQuery: 'stone raincoat mac menswear product' },
    { name: 'Campbell Raincoat', brand: 'Grenfell', price: '£640', note: 'Grenfell cloth was built for exactly this weather — quiet, English, permanent.', imageQuery: 'beige raincoat menswear product' },
    { name: 'Stockholm Raincoat', brand: 'Stutterheim', price: '£195', note: 'Rubberised and honest about it — the true-downpour option that still has a clean line.', imageQuery: 'black rubber raincoat menswear' },
  ],
  'blazer-outer': [
    { name: 'K-Jacket Unstructured Blazer', brand: 'Boglioli', price: '£790', note: 'Soft-shouldered so it wears like a cardigan and reads like tailoring — the most useful jacket you can own.', imageQuery: 'navy unstructured blazer menswear product' },
    { name: 'Havana Unstructured Blazer', brand: 'Suitsupply', price: '£299', note: 'The accessible route to the same idea — half-canvassed and better than its price.', imageQuery: 'navy wool blazer jacket product' },
    { name: 'Balloon Wool Hopsack Blazer', brand: 'Ring Jacket', price: '£890', note: 'Open-weave hopsack breathes, resists creasing and dresses down with denim — a suit jacket never will.', imageQuery: 'brown hopsack blazer menswear' },
  ],
  'crew-neck': [
    { name: 'Shetland Crew Neck', brand: "Jamieson's of Shetland", price: '£125', note: 'Undyed, hard-wearing wool that softens for years — the best value in menswear, full stop.', imageQuery: 'shetland wool crew neck sweater product' },
    { name: 'Traditional Guernsey', brand: 'Le Tricoteur', price: '£120', note: 'Tight-spun worsted wool knitted in Guernsey — practically windproof, entirely permanent.', imageQuery: 'navy guernsey wool sweater product' },
    { name: 'Lambswool Crew Neck', brand: 'William Lockie', price: '£165', note: 'Scottish lambswool in the exact weight that works from October to April.', imageQuery: 'brown lambswool crew neck sweater' },
  ],
  'v-neck': [
    { name: 'Bobby V-Neck', brand: 'John Smedley', price: '£165', note: 'Fine merino, made in Derbyshire — the V-neck that layers over a collar without bulk.', imageQuery: 'navy merino v-neck sweater product' },
    { name: 'Lambswool V-Neck', brand: 'William Lockie', price: '£160', note: 'The warmer Scottish version for when the merino one is not enough.', imageQuery: 'grey lambswool v-neck sweater menswear' },
    { name: 'Geelong V-Neck', brand: 'Harley of Scotland', price: '£110', note: 'Featherweight Geelong wool — the underrated maker the knitwear trade buys from.', imageQuery: 'green wool v-neck jumper product' },
  ],
  'zip-neck': [
    { name: 'Merino Zip Neck', brand: 'Sunspel', price: '£175', note: 'The quiet workhorse: opens for warmth, closes for a collar, and never creases in a bag.', imageQuery: 'grey merino zip neck sweater product' },
    { name: 'Tapton Zip Neck', brand: 'John Smedley', price: '£190', note: 'Fine-gauge enough to sit under a blazer — the travel knit.', imageQuery: 'navy zip neck merino sweater menswear' },
    { name: 'Lambswool Half-Zip', brand: "Colhay's", price: '£225', note: 'The heavier Scottish take — a collar that stands properly when zipped.', imageQuery: 'brown lambswool half zip sweater' },
  ],
  'crewneck-sweatshirt': [
    { name: '346 Loopwheel Sweatshirt', brand: 'Merz b. Schwanen', price: '£130', note: 'Loopwheeled on original machines — dense, shape-holding cotton that outlasts five fast-fashion versions.', imageQuery: 'grey loopwheel cotton crewneck sweatshirt product' },
    { name: 'Cross-Knit Crewneck', brand: 'Camber USA', price: '£95', note: 'Twelve-ounce US-made fleece — the heavyweight standard the streetwear crowd rediscovered.', imageQuery: 'heavyweight grey crewneck sweatshirt menswear product' },
    { name: 'Athletic Sweatshirt', brand: 'Sunspel', price: '£145', note: 'The dressed-up cut — trimmer through the body, so it works under an overcoat.', imageQuery: 'navy cotton sweatshirt menswear product' },
  ],
  hoodie: [
    { name: 'Heavyweight Pullover Hoodie', brand: 'Camber USA', price: '£110', note: 'The hoodie that reads considered rather than gym-bound — dense fleece, a hood that actually stands.', imageQuery: 'heavyweight grey pullover hoodie menswear product' },
    { name: '3S48 Hooded Sweatshirt', brand: 'Merz b. Schwanen', price: '£165', note: 'Loopwheeled organic cotton — the quiet, unbranded hoodie for the high-low read.', imageQuery: 'plain grey hooded sweatshirt menswear product' },
    { name: 'Zip Hoodie', brand: 'Lady White Co.', price: '£150', note: 'LA-made fleece with a proper zip — the layering version that opens over a tee.', imageQuery: 'grey zip up hoodie menswear product' },
  ],
  'fleece-pullover': [
    { name: 'Synchilla Snap-T Pullover', brand: 'Patagonia', price: '£120', note: 'The original fleece pullover — forty years of provenance and it still looks right.', imageQuery: 'fleece snap t pullover menswear product' },
    { name: 'Retro Pile Fleece', brand: 'Patagonia', price: '£180', note: 'The deep-pile version — warmer than it weighs, honest outdoors heritage.', imageQuery: 'cream pile fleece pullover jacket menswear' },
    { name: 'Boa Fleece Pullover', brand: 'Snow Peak', price: '£190', note: 'The Japanese take — technical fleece cut clean enough for town.', imageQuery: 'fleece pullover menswear japanese product' },
  ],
  cardigan: [
    { name: 'Shawl Collar Cardigan', brand: 'William Lockie', price: '£195', note: 'Does the work of a light jacket indoors — the layer that makes an outfit look considered rather than thrown on.', imageQuery: 'navy shawl collar cardigan menswear product' },
    { name: 'Lambswool Shawl Cardigan', brand: "Colhay's", price: '£325', note: 'Scottish-spun and substantial — the fireside piece that still leaves the house.', imageQuery: 'brown shawl collar wool cardigan product' },
    { name: 'Fair Isle Cardigan', brand: "Jamieson's of Shetland", price: '£160', note: 'The character knit — wear it as the whole outfit and keep everything else plain.', imageQuery: 'fair isle wool cardigan menswear' },
  ],
  suit: [
    { name: 'Havana Wool Suit', brand: 'Suitsupply', price: '£499', note: 'One good mid-grey or navy suit covers every occasion that demands one — spend the rest on the alterations.', imageQuery: 'navy wool suit on hanger product' },
    { name: 'Half-Canvas Suit', brand: 'Spier & Mackay', price: '£450', note: 'Proper canvassing at an online-only price — the value pick of the category.', imageQuery: 'charcoal wool suit menswear product' },
    { name: 'Wool Flannel Suit', brand: 'Anglo-Italian', price: '£1,100', note: 'The investment version — flannel with real drape, cut to be worn as separates too.', imageQuery: 'grey flannel suit menswear tailoring' },
  ],
  'sport-coat': [
    { name: 'Balloon Wool Hopsack Jacket', brand: 'Ring Jacket', price: '£890', note: 'Japanese tailoring at its most useful — hopsack breathes and shrugs off creases.', imageQuery: 'brown hopsack sport coat product' },
    { name: 'K-Jacket Sport Coat', brand: 'Boglioli', price: '£790', note: 'The unstructured Italian standard — a sport coat that wears like knitwear.', imageQuery: 'green unstructured sport coat menswear' },
    { name: 'Wool Sport Coat', brand: 'Spier & Mackay', price: '£350', note: 'The accessible first sport coat — half-canvassed, honest cloth, correct proportions.', imageQuery: 'tweed sport coat jacket menswear product' },
  ],
  waistcoat: [
    { name: 'Merino Sleeveless Cardigan', brand: 'John Smedley', price: '£145', note: 'The knitted waistcoat — warmth under a jacket with no bulk at the arms.', imageQuery: 'navy merino sleeveless cardigan vest product' },
    { name: 'Tweed Waistcoat', brand: 'Cordings', price: '£149', note: 'The country version — correct with flannel and cords, never costume.', imageQuery: 'tweed waistcoat menswear product' },
    { name: 'Wool Waistcoat', brand: 'Suitsupply', price: '£119', note: 'Turns the suit into a three-piece for weddings without a second purchase later.', imageQuery: 'grey wool suit waistcoat product' },
  ],
  undershirt: [
    { name: 'Superfine Cotton Underwear Vest', brand: 'Sunspel', price: '£45', note: 'Keeps a shirt off your skin and its collar clean — invisible, and the difference is felt by six o\u2019clock.', imageQuery: 'white cotton undershirt vest product' },
    { name: 'Cotton Crew Undershirt', brand: 'Hanro', price: '£60', note: 'Swiss-made and genuinely invisible under a dress shirt.', imageQuery: 'white crew neck undershirt menswear' },
    { name: '2-Pack Loopwheeled Tee', brand: 'Merz b. Schwanen', price: '£120', note: 'The undershirt good enough to be the shirt — loopwheeled on original machines.', imageQuery: 'white cotton t-shirts folded stack product' },
  ],
  'base-layer-top': [
    { name: 'Merino 150 Base Layer', brand: 'Smartwool', price: '£90', note: 'Warmth without bulk under a coat — the reason you can keep wearing the tailoring in January.', imageQuery: 'merino wool base layer long sleeve product' },
    { name: 'Oasis 200 Long Sleeve', brand: 'Icebreaker', price: '£80', note: 'The alpine standard — merino that works a full day without complaint.', imageQuery: 'black merino base layer top product' },
    { name: 'Merino Base Layer', brand: 'Finisterre', price: '£75', note: 'B-Corp English surf brand doing honest merino — the value option.', imageQuery: 'navy merino base layer menswear' },
  ],
  belt: [
    { name: 'Bridle Leather Belt', brand: 'Equus Leather', price: '£115', note: 'Match the leather to your shoes and it disappears — which is exactly what a belt should do.', imageQuery: 'brown bridle leather belt brass buckle product' },
    { name: 'Woven Leather Belt', brand: "Anderson's", price: '£95', note: 'The woven Italian belt — forgiving of a waist that moves, correct with everything casual.', imageQuery: 'woven leather belt menswear product' },
    { name: 'Standard Belt', brand: 'Tanner Goods', price: '£120', note: 'American saddle leather with a lifetime of patina in it.', imageQuery: 'tan leather belt menswear product' },
  ],
  watch: [
    { name: 'Khaki Field Mechanical', brand: 'Hamilton', price: '£425', note: 'Legible, unshowy and correct with everything from a field jacket to a blazer.', imageQuery: 'field watch leather strap product' },
    { name: 'Marlin Hand-Wound', brand: 'Timex', price: '£189', note: 'The dress watch at an honest price — mid-century lines, wind it and go.', imageQuery: 'dress watch leather strap minimal product' },
    { name: '5 Sports Automatic', brand: 'Seiko', price: '£250', note: 'The everyday automatic — near-indestructible and never wrong.', imageQuery: 'automatic watch steel bracelet product' },
  ],
  'pocket-square': [
    { name: 'White Linen Pocket Square', brand: "Drake's", price: '£45', note: 'White linen, hand-rolled — never matched to the tie, and the cheapest way to finish a jacket properly.', imageQuery: 'white linen pocket square folded product' },
    { name: 'Printed Silk Pocket Square', brand: 'Rubinacci', price: '£95', note: 'The Neapolitan print for when the jacket is plain and the mood is not.', imageQuery: 'printed silk pocket square product' },
    { name: 'Cotton-Silk Pocket Square', brand: 'Simonnot Godard', price: '£75', note: 'The French maker the tailoring trade keeps to itself.', imageQuery: 'patterned pocket square menswear product' },
  ],
  tie: [
    { name: 'Grenadine Tie', brand: "Drake's", price: '£145', note: 'One navy grenadine outdresses a drawer of printed ties — texture does the work.', imageQuery: 'navy grenadine silk tie product' },
    { name: 'Grenadine Fina Tie', brand: 'Sam Hober', price: '£110', note: 'Hand-made to your exact length — the tie-nerd\u2019s answer at a fair price.', imageQuery: 'brown grenadine tie menswear product' },
    { name: 'Wool Challis Tie', brand: 'Shibumi Firenze', price: '£90', note: 'The matte wool tie that makes tailoring look easy in autumn.', imageQuery: 'wool tie menswear product' },
  ],
  scarf: [
    { name: 'Arran Cashmere Scarf', brand: 'Begg x Co', price: '£350', note: 'One warm neutral scarf outlasts a drawer of novelty ones and warms the colour by your face.', imageQuery: 'camel cashmere scarf folded product' },
    { name: 'Cashmere Scarf', brand: 'Johnstons of Elgin', price: '£120', note: 'Scottish cashmere at the sane end of the price range.', imageQuery: 'grey cashmere scarf menswear product' },
    { name: 'Lambswool Scarf', brand: "Colhay's", price: '£95', note: 'The everyday version — lambswool takes the weather so the cashmere doesn\u2019t have to.', imageQuery: 'brown lambswool scarf product' },
  ],
  tote: [
    { name: 'Canvas Tote', brand: 'Bennett Winch', price: '£225', note: 'English canvas with leather ends where the wear lands — the grown-up tote.', imageQuery: 'canvas leather tote bag menswear product' },
    { name: 'Rugged Twill Tote', brand: 'Filson', price: '£175', note: 'The American workhorse — oil-finish twill that shrugs off a decade.', imageQuery: 'tan twill tote bag product' },
    { name: 'Boat and Tote', brand: 'L.L.Bean', price: '£45', note: 'The original 1944 ice-carrier — honest, unkillable, and the best £45 in bags.', imageQuery: 'canvas boat tote bag product' },
  ],
  weekender: [
    { name: 'The Weekender', brand: 'Bennett Winch', price: '£595', note: 'Sized for a long weekend and built to be the last one you buy — leather ends take the wear.', imageQuery: 'canvas leather weekend holdall bag product' },
    { name: 'Small Duffle', brand: 'Filson', price: '£325', note: 'Bridle leather and twill — the carry-on that gets better with abuse.', imageQuery: 'tan canvas duffle bag leather product' },
    { name: 'Troutbeck Holdall', brand: 'Chapman Bags', price: '£260', note: 'Made in Cumbria from British materials — the quiet English option.', imageQuery: 'olive canvas holdall bag product' },
  ],
  briefcase: [
    { name: 'English Briefcase', brand: 'Frank Clegg', price: '£850', note: 'A rucksack undoes tailoring at the shoulder; a flat briefcase keeps the line clean.', imageQuery: 'brown leather briefcase product' },
    { name: 'Original Briefcase', brand: 'Filson', price: '£295', note: 'Twill and bridle leather — the briefcase that works with a wax jacket, not just a suit.', imageQuery: 'tan twill briefcase bag product' },
    { name: 'M/S Endeavour', brand: 'Mismo', price: '£495', note: 'The Danish middle path — structured enough for work, soft enough for the train.', imageQuery: 'navy canvas leather briefcase product' },
  ],
  cap: [
    { name: 'Gill Tweed Flat Cap', brand: 'Lock & Co.', price: '£110', note: 'Flecked tweed picks up the browns and olives already in your wardrobe — keep the crown low.', imageQuery: 'tweed flat cap menswear product' },
    { name: 'Hatteras Cap', brand: 'Stetson', price: '£75', note: 'The fuller newsboy shape — wool in winter, linen in summer.', imageQuery: 'wool newsboy cap menswear product' },
    { name: 'Cotton Baseball Cap', brand: 'Cableami', price: '£55', note: 'The Japanese take on the plain cap — clean lines, no logo shouting.', imageQuery: 'plain cotton baseball cap product' },
  ],
  beanie: [
    { name: 'Wool Watch Cap', brand: 'Heimat', price: '£95', note: 'Undyed heavy wool, a single fold — the honest winter hat, and the only one that suits a coat.', imageQuery: 'wool watch cap beanie knitted product' },
    { name: 'British Wool Watch Cap', brand: 'Highland 2000', price: '£40', note: 'The value version — English wool, made in England, forty pounds.', imageQuery: 'navy wool beanie hat product' },
    { name: 'Classic Beanie', brand: 'Le Bonnet', price: '£65', note: 'Lambswool-angora, and the exact right amount of slouch.', imageQuery: 'grey knitted beanie hat product' },
  ],
  'bucket-hat': [
    { name: 'Wax Sports Hat', brand: 'Barbour', price: '£45', note: 'The waxed bucket — rain kit that matches the Bedale instead of fighting it.', imageQuery: 'olive waxed bucket hat product' },
    { name: 'Naval Bucket Hat', brand: 'Universal Works', price: '£55', note: 'The casual cotton version for actual summer.', imageQuery: 'navy cotton bucket hat menswear product' },
    { name: 'Cotton Ripstop Bucket Hat', brand: 'Cableami', price: '£60', note: 'The Japanese take — clean lines, packable, no logo shouting.', imageQuery: 'beige cotton bucket hat menswear product' },
  ],

  // -------------------------------------------------------------------------
  // "Other [Category] →" sub-types — Beau's standing recommendations, 3 per
  // entry, so EVERY plain-text row lands on real product recommendations,
  // exactly like the illustrated cards do.
  // -------------------------------------------------------------------------
  'dress-shirt': [
    { name: 'Tokyo Slim Fit Broadcloth Shirt', brand: 'Kamakura Shirts', price: '£95', note: 'Japanese shirtmaking at a price that makes no sense — the collar holds its line all day under a jacket.', imageQuery: 'white broadcloth dress shirt menswear product' },
    { name: 'Poplin Dress Shirt', brand: "Drake's", price: '£165', note: 'Two-fold poplin with a proper spread collar — the shirt that carries a suit without a tie.', imageQuery: 'light blue poplin dress shirt product' },
    { name: 'Brescia Cotton Shirt', brand: 'Luca Faloni', price: '£140', note: 'Italian cotton with a softer collar roll — the dress shirt for the days the jacket stays on the chair.', imageQuery: 'white cotton dress shirt folded product' },
  ],
  'flannel-shirt': [
    { name: 'Teca Flannel Shirt', brand: 'Portuguese Flannel', price: '£95', note: 'Brushed Portuguese cotton from a family mill — the winter shirt that works alone or open over a tee.', imageQuery: 'plaid brushed flannel shirt menswear product' },
    { name: 'Board Shirt', brand: 'Pendleton', price: '£120', note: 'The 1924 original in umatilla wool — warmer than it looks and near-indestructible.', imageQuery: 'wool check flannel shirt menswear product' },
    { name: 'Work Shirt in Brushed Cotton', brand: 'Universal Works', price: '£89', note: 'The English take — quieter checks that sit happily under a wax jacket.', imageQuery: 'brushed cotton work shirt menswear' },
  ],
  'linen-shirt': [
    { name: 'Portofino Linen Shirt', brand: 'Luca Faloni', price: '£150', note: 'Heavyweight Italian linen that creases with grace instead of collapsing — the real-heat answer.', imageQuery: 'white linen shirt menswear product' },
    { name: 'Linen Summer Shirt', brand: "Drake's", price: '£185', note: 'Cut fuller for air, with a collar that still stands — reads considered, never beachwear.', imageQuery: 'blue linen shirt menswear product' },
    { name: 'Ridotto Linen Shirt', brand: 'Aspesi', price: '£160', note: 'The Italian standard — garment-washed so it looks right from the first wear.', imageQuery: 'olive linen shirt menswear product' },
  ],
  'chambray-shirt': [
    { name: 'Chambray Work Shirt', brand: 'Corridor NYC', price: '£160', note: 'Softens with every wash and bridges your smarter and rougher directions without trying.', imageQuery: 'chambray denim shirt hanging product' },
    { name: 'Selvedge Chambray Shirt', brand: 'orSlow', price: '£195', note: 'Japanese selvedge chambray to the vintage spec — the work shirt that outlives fashion.', imageQuery: 'blue selvedge chambray work shirt product' },
    { name: 'Chambray Shirt', brand: 'Gitman Vintage', price: '£165', note: 'US-made with real body to the cloth — correct under knitwear, honest on its own.', imageQuery: 'chambray shirt menswear folded product' },
  ],
  henley: [
    { name: '206 Henley', brand: 'Merz b. Schwanen', price: '£85', note: 'Loopwheeled on original machines — the henley that reads considered instead of underwear.', imageQuery: 'white cotton henley shirt menswear product' },
    { name: 'Long Sleeve Henley', brand: 'Sunspel', price: '£80', note: 'Fine long-staple cotton — the quiet layer under an overshirt or cardigan.', imageQuery: 'grey cotton henley long sleeve product' },
    { name: 'Harri Henley', brand: 'Hemen Biarritz', price: '£70', note: 'Organic cotton, made in the Basque country — the value pick of the category.', imageQuery: 'ecru cotton henley menswear product' },
  ],
  overshirt: [
    { name: 'Travail Overshirt', brand: 'Universal Works', price: '£125', note: 'The layer that does a jacket’s job indoors and a shirt’s outdoors — the most useful piece in the transitional months.', imageQuery: 'navy cotton overshirt menswear product' },
    { name: 'Labura Overshirt', brand: 'Portuguese Flannel', price: '£110', note: 'Portuguese cotton twill with clean patch pockets — wears over a tee or under a coat.', imageQuery: 'olive cotton overshirt menswear product' },
    { name: 'Wool Overshirt', brand: "Drake's", price: '£395', note: 'The elevated version — brushed wool that stands in for a blazer at the casual end.', imageQuery: 'check wool overshirt menswear product' },
  ],
  'corduroy-trousers': [
    { name: 'Corduroy Trousers', brand: 'Cordings', price: '£150', note: 'The English needlecord institution — warm, quiet colours that carry the whole autumn.', imageQuery: 'tan corduroy trousers menswear product' },
    { name: 'Games Cord Trousers', brand: "Drake's", price: '£225', note: 'A wider, higher-rise cut in fat 8-wale cord — the modern read of a country classic.', imageQuery: 'brown corduroy trousers menswear product' },
    { name: 'Loose Cord Pant', brand: 'Universal Works', price: '£115', note: 'The casual-register cord — sits as happily with a tee as with knitwear.', imageQuery: 'olive corduroy trousers menswear' },
  ],
  'linen-trousers': [
    { name: 'Positano Linen Trousers', brand: 'Luca Faloni', price: '£160', note: 'Heavyweight linen with a clean drape — the trouser that makes real heat civilised.', imageQuery: 'beige linen trousers menswear product' },
    { name: 'Pleated Linen Trousers', brand: 'Berg & Berg', price: '£200', note: 'A single pleat gives the room linen needs to hang straight — the smarter summer trouser.', imageQuery: 'olive pleated linen trousers menswear' },
    { name: 'Drawstring Linen Trousers', brand: 'Oliver Spencer', price: '£170', note: 'English-made, with a drawstring that keeps the holiday register honest.', imageQuery: 'natural linen drawstring trousers product' },
  ],
  'fatigue-trousers': [
    { name: 'OG Loose Fatigue Pant', brand: 'Stan Ray', price: '£85', note: 'The honest American fatigue — hard cotton sateen that only improves with work.', imageQuery: 'olive fatigue pants menswear product' },
    { name: 'US Army Fatigue Pants', brand: 'orSlow', price: '£185', note: 'The Japanese repro done properly — the baker pant to the original spec.', imageQuery: 'olive army baker fatigue trousers product' },
    { name: 'Fatigue Pant', brand: 'Universal Works', price: '£110', note: 'The softened English cut — military bones, civilian manners.', imageQuery: 'green cotton fatigue trousers menswear' },
  ],
  'swim-shorts': [
    { name: 'Setter Swim Shorts', brand: 'Orlebar Brown', price: '£150', note: 'Tailored like shorts, not swimwear — they pass at lunch without anyone knowing.', imageQuery: 'navy tailored swim shorts product' },
    { name: 'Classic Swim Shorts', brand: 'Frescobol Carioca', price: '£135', note: 'The Brazilian cut — quick-drying with a clean leg line and no surf branding.', imageQuery: 'green swim shorts menswear product' },
    { name: 'Original Swim Shorts', brand: 'CDLP', price: '£125', note: 'Made from recycled fibres with a quiet matte finish — the minimal option.', imageQuery: 'black swim shorts menswear product' },
  ],
  'monk-strap': [
    { name: 'Lowndes Double Monk', brand: 'Crockett & Jones', price: '£450', note: 'The reference double monk — sits between an Oxford and a loafer in formality, and outdresses both in character.', imageQuery: 'dark brown double monk strap shoes product' },
    { name: 'Double Monk Strap', brand: 'Meermin', price: '£230', note: 'Goodyear-welted at the accessible end — the sensible way into the style.', imageQuery: 'brown leather double monk shoes product' },
    { name: 'Single Monk in Suede', brand: 'Carmina', price: '£340', note: 'One buckle, snuff suede — quieter than the double and easier with flannel.', imageQuery: 'suede single monk strap shoes product' },
  ],
  'penny-loafer': [
    { name: 'Weejuns Larson Penny Loafer', brand: 'G.H. Bass', price: '£150', note: 'The original 1936 penny loafer — still the honest entry point to the whole idea.', imageQuery: 'burgundy penny loafers menswear product' },
    { name: 'The Penny Loafer', brand: 'Morjas', price: '£245', note: 'Goodyear-welted and resoleable — the penny that carries tailoring as easily as denim.', imageQuery: 'brown leather penny loafers product' },
    { name: 'Boston Penny Loafer', brand: 'Crockett & Jones', price: '£420', note: 'The Northampton grade — buy once, resole for decades.', imageQuery: 'dark brown penny loafers product' },
  ],
  mule: [
    { name: 'Boston Soft Footbed', brand: 'Birkenstock', price: '£135', note: 'The house-and-courtyard shoe — suede and cork that mould to you; honest, not fashion.', imageQuery: 'taupe suede clog mule product' },
    { name: 'Baba Leather Mule', brand: 'Sabah', price: '£190', note: 'Handmade in Turkey, breaks in like a glove — the elevated slip-on.', imageQuery: 'brown leather mule slip on shoes product' },
    { name: 'Suede Mule', brand: 'Mulo', price: '£125', note: 'The English take — a clean suede house shoe that survives the school run.', imageQuery: 'navy suede mule slippers menswear product' },
  ],
  espadrille: [
    { name: 'Pablo Espadrille', brand: 'Castañer', price: '£95', note: 'The Spanish original — jute soles, canvas upper, the only correct pool-to-dinner shoe.', imageQuery: 'navy canvas espadrilles menswear product' },
    { name: 'Classic Leather Espadrille', brand: 'Rivieras', price: '£110', note: 'The dressed-up French version — holds its shape where canvas slumps.', imageQuery: 'tan leather espadrilles menswear product' },
    { name: 'Traditional Alpargata', brand: 'La Manual Alpargatera', price: '£70', note: 'Handmade in Barcelona since 1941 — the real thing at the honest price.', imageQuery: 'beige espadrilles alpargata product' },
  ],
  'boat-shoe': [
    { name: 'Authentic Original Boat Shoe', brand: 'Sperry', price: '£110', note: 'The 1935 original — rawhide laces and a sole that actually grips wet teak.', imageQuery: 'brown leather boat shoes product' },
    { name: 'Barth Deck Shoe', brand: 'Paraboot', price: '£195', note: 'The French upgrade — stitched construction that takes resoling; a deck shoe for decades.', imageQuery: 'navy leather deck shoes menswear product' },
    { name: 'Portland Boat Shoe', brand: 'Yuketen', price: '£320', note: 'Hand-sewn in Maine tradition — the collector-grade version of the idea.', imageQuery: 'tan hand sewn boat shoes product' },
  ],
  peacoat: [
    { name: 'Original Peacoat', brand: 'Camplin', price: '£395', note: 'The Royal Navy’s own supplier — the double-breasted coat that flatters every build.', imageQuery: 'navy wool peacoat menswear product' },
    { name: '740 Peacoat', brand: 'Schott NYC', price: '£280', note: 'The US Navy contractor since 1913 — 32oz Melton wool that shrugs off wind.', imageQuery: 'navy melton wool peacoat product' },
    { name: 'Manchester Peacoat', brand: 'Private White V.C.', price: '£695', note: 'English-made with a clean, longer line — the tailored read of a working coat.', imageQuery: 'dark navy peacoat menswear product' },
  ],
  'duffle-coat': [
    { name: 'Monty Duffle Coat', brand: 'Gloverall', price: '£375', note: 'English wool and horn toggles — the casual-register overcoat, done by the originator.', imageQuery: 'camel duffle coat menswear product' },
    { name: 'Classic Duffle Coat', brand: 'Original Montgomery', price: '£250', note: 'The family firm that supplied the Navy — the honest-money version.', imageQuery: 'navy duffle coat toggle menswear product' },
    { name: 'London Duffle', brand: 'London Tradition', price: '£320', note: 'Made in London, heavier wool blend — the commuter’s duffle.', imageQuery: 'grey wool duffle coat menswear' },
  ],
  'waxed-jacket': [
    { name: 'Beaufort Waxed Jacket', brand: 'Barbour', price: '£279', note: 'The longer country cut — re-waxable for life, and better the harder you wear it.', imageQuery: 'olive barbour waxed jacket product' },
    { name: 'Trialmaster Panther', brand: 'Belstaff', price: '£450', note: 'The motorcycle lineage — four pockets, belted waist, real presence.', imageQuery: 'black waxed motorcycle jacket menswear product' },
    { name: 'Waxed Cotton Jacket', brand: 'Private White V.C.', price: '£545', note: 'Manchester-made in Halley Stevensons wax — the quiet-luxury version.', imageQuery: 'brown waxed cotton jacket menswear product' },
  ],
  gilet: [
    { name: 'Mickfield Quilted Gilet', brand: 'Lavenham', price: '£169', note: 'The English quilted original — warmth over knitwear without bulk at the arms.', imageQuery: 'olive quilted gilet menswear product' },
    { name: 'Down Vest', brand: 'Rocky Mountain Featherbed', price: '£350', note: 'The 1970s Wyoming pattern, made in Japan — the character piece of the category.', imageQuery: 'navy down vest leather yoke product' },
    { name: 'Quilted Waistcoat', brand: 'Barbour', price: '£120', note: 'The country workhorse — layers under the wax jacket in deep winter.', imageQuery: 'green quilted vest gilet menswear product' },
  ],
  'aran-jumper': [
    { name: 'Aran Crew Neck', brand: 'Inis Meáin', price: '£395', note: 'A statement knit with real provenance — wear it as the whole outfit and keep everything else plain.', imageQuery: 'cream aran cable knit fisherman sweater product' },
    { name: 'Traditional Aran Sweater', brand: 'Aran Sweater Market', price: '£110', note: 'Knitted in Ireland from merino — the honest way into the cable tradition.', imageQuery: 'ecru aran cable knit sweater product' },
    { name: 'Makers Stitch Jumper', brand: 'Peregrine', price: '£120', note: 'British wool, made in England — the everyday-weight cable.', imageQuery: 'cable knit wool jumper menswear product' },
  ],
  'fair-isle': [
    { name: 'Fair Isle Crew Neck', brand: "Jamieson's of Shetland", price: '£160', note: 'Knitted in Shetland from Shetland wool — the genuine article, not a print of it.', imageQuery: 'fair isle pattern wool sweater product' },
    { name: 'Fair Isle Slipover', brand: 'Harley of Scotland', price: '£95', note: 'The sleeveless version — pattern at the chest, none at the cuff; easy under a jacket.', imageQuery: 'fair isle sleeveless slipover knit product' },
    { name: 'Hand-Frame Fair Isle', brand: '& Daughter', price: '£245', note: 'The elevated take — quieter colourways that sit with tailoring.', imageQuery: 'muted fair isle wool jumper menswear' },
  ],
  'knitted-polo': [
    { name: 'Isis Sea Island Cotton Polo', brand: 'John Smedley', price: '£165', note: 'The knitted polo that reads a register above pique — the one that goes under a blazer.', imageQuery: 'knitted cotton polo shirt menswear product' },
    { name: 'Lambswool Polo Shirt', brand: "Colhay's", price: '£225', note: 'Scottish-spun with a proper collar — the winter version; a shirt and jumper in one.', imageQuery: 'lambswool knitted polo menswear product' },
    { name: 'Merino Knitted Polo', brand: 'Berg & Berg', price: '£170', note: 'Fine-gauge merino with a clean placket — the smart-casual workhorse.', imageQuery: 'navy merino knitted polo product' },
  ],
  slipover: [
    { name: 'Lambswool Slipover', brand: 'William Lockie', price: '£120', note: 'Warmth at the core, none at the arms — the layer that makes a shirt and trousers read finished.', imageQuery: 'green lambswool slipover sleeveless jumper product' },
    { name: 'Merino Sleeveless Pullover', brand: 'John Smedley', price: '£145', note: 'Fine-gauge enough to disappear under a jacket — the tailoring undershirt.', imageQuery: 'navy merino sleeveless pullover product' },
    { name: 'Shetland Slipover', brand: "Jamieson's of Shetland", price: '£98', note: 'The character version — texture and fleck over a plain oxford.', imageQuery: 'shetland wool slipover vest menswear product' },
  ],
  'dinner-suit': [
    { name: 'Lazio Tuxedo', brand: 'Suitsupply', price: '£599', note: 'Half-canvassed with a proper grosgrain lapel — black tie done correctly at the sane price.', imageQuery: 'black tuxedo dinner suit product' },
    { name: 'Dinner Suit', brand: 'Oliver Brown', price: '£595', note: 'The London formalwear house — a shawl collar that will not date.', imageQuery: 'black shawl collar dinner jacket product' },
    { name: 'Midnight Blue Dinner Suit', brand: 'Favourbrook', price: '£895', note: 'Midnight blue reads blacker than black under evening light — the connoisseur’s choice.', imageQuery: 'midnight blue tuxedo menswear product' },
  ],
  'morning-suit': [
    { name: 'Morning Suit', brand: 'Oliver Brown', price: '£795', note: 'The morning-dress specialist — correct for the strictest wedding dress code.', imageQuery: 'grey morning suit tailcoat product' },
    { name: 'Herringbone Morning Coat', brand: 'Favourbrook', price: '£1,100', note: 'The Jermyn Street grade — herringbone wool with a proper sweep to the tails.', imageQuery: 'black morning coat tails menswear product' },
    { name: 'Morning Dress Hire', brand: 'Ede & Ravenscroft', price: 'from £150', note: 'Worn twice a decade? Hire from the oldest tailor in London and spend the difference on shoes.', imageQuery: 'morning dress suit formal menswear' },
  ],
  'long-johns': [
    { name: 'Merino 250 Base Layer Bottoms', brand: 'Smartwool', price: '£95', note: 'The warmth that lets tailoring keep working in January — invisible under trousers.', imageQuery: 'merino wool base layer leggings product' },
    { name: '200 Oasis Leggings', brand: 'Icebreaker', price: '£85', note: 'The alpine standard — merino that works a full day without complaint.', imageQuery: 'black merino base layer bottoms product' },
    { name: 'Merino Long Johns', brand: 'Finisterre', price: '£70', note: 'B-Corp English merino — the value option.', imageQuery: 'navy merino long johns menswear product' },
  ],
  boxers: [
    { name: 'Superfine Cotton Boxers', brand: 'Sunspel', price: '£40', note: 'The quiet foundation — cotton that survives years of washing without losing its shape.', imageQuery: 'white cotton boxer shorts menswear product' },
    { name: 'Boxer Brief 3-Pack', brand: 'CDLP', price: '£85', note: 'Lyocell that breathes better than cotton — the modern standard.', imageQuery: 'black boxer briefs menswear product' },
    { name: 'Cotton Trunks', brand: 'Hamilton and Hare', price: '£32', note: 'English-designed with a flat, clean waistband — no branding shouting at the mirror.', imageQuery: 'grey cotton trunks underwear product' },
  ],
  socks: [
    { name: 'Merino Ribbed Socks', brand: 'Pantherella', price: '£16', note: 'Made in Leicester since 1937 — the sock that matches the shoe investment.', imageQuery: 'grey merino wool dress socks product' },
    { name: 'Recycled Cotton Crew Socks', brand: 'Anonymous Ism', price: '£22', note: 'The Japanese character sock — texture and colour where only you know it.', imageQuery: 'patterned crew socks menswear product' },
    { name: 'Airport Socks', brand: 'Falke', price: '£18', note: 'Wool-cotton, reinforced where socks actually die — the everyday workhorse.', imageQuery: 'navy wool cotton socks menswear product' },
  ],
  sunglasses: [
    { name: 'Lemtosh', brand: 'Moscot', price: '£270', note: 'The 1930s New York frame that suits almost every face — buy once, re-lens forever.', imageQuery: 'tortoise acetate round sunglasses product' },
    { name: 'Grafton Sunglasses', brand: 'Cubitts', price: '£125', note: 'London-made frames with real glazing service behind them — the honest-money option.', imageQuery: 'black acetate sunglasses menswear product' },
    { name: '649 Original', brand: 'Persol', price: '£185', note: 'The Italian classic with the folding hinge — quietly correct with everything.', imageQuery: 'havana persol style sunglasses product' },
  ],
  gloves: [
    { name: 'Hairsheep Leather Gloves', brand: 'Dents', price: '£85', note: 'Made in England since 1777 — cashmere-lined leather that moulds to your hands.', imageQuery: 'brown leather gloves cashmere lined product' },
    { name: 'Deerskin Primaloft Gloves', brand: 'Hestra', price: '£110', note: 'The Swedish glove house — warmth without the ski-slope look.', imageQuery: 'tan deerskin winter gloves product' },
    { name: 'Cashmere Gloves', brand: 'Johnstons of Elgin', price: '£70', note: 'Scottish cashmere — the pair that lives in the overcoat pocket.', imageQuery: 'grey cashmere knitted gloves product' },
  ],
  braces: [
    { name: 'Boxcloth Braces', brand: 'Albert Thurston', price: '£75', note: 'The braces maker since 1820 — trousers hang straighter from the shoulder than the waist.', imageQuery: 'navy boxcloth braces suspenders product' },
    { name: 'Barathea Braces', brand: 'Cordings', price: '£60', note: 'The country outfitter’s version — correct with flannel and cords.', imageQuery: 'burgundy braces suspenders menswear product' },
    { name: 'Moiré Braces', brand: 'Budd Shirtmakers', price: '£85', note: 'The Piccadilly Arcade grade — for the dinner suit above.', imageQuery: 'black moire silk braces product' },
  ],
  cufflinks: [
    { name: 'Sterling Silver Knot Cufflinks', brand: 'Codis Maya', price: '£65', note: 'The quiet answer — a silver knot never upstages the shirt.', imageQuery: 'silver knot cufflinks product' },
    { name: 'Enamel Cufflinks', brand: 'Deakin & Francis', price: '£150', note: 'England’s oldest family jeweller — the heirloom pair.', imageQuery: 'navy enamel silver cufflinks product' },
    { name: 'Silk Knot Cufflinks', brand: 'Budd Shirtmakers', price: '£15', note: 'The honest start — correct at any table, fifteen pounds.', imageQuery: 'colored silk knot cufflinks product' },
  ],
  wallet: [
    { name: 'Bridle Hide Billfold', brand: 'Ettinger', price: '£175', note: 'London-made bridle leather with a decade of patina in it — the last wallet you buy.', imageQuery: 'brown bridle leather billfold wallet product' },
    { name: 'Note Sleeve Wallet', brand: 'Bellroy', price: '£95', note: 'The slim modern layout — cards and notes without the pocket bulge.', imageQuery: 'tan slim leather wallet product' },
    { name: 'Cardholder', brand: 'Laperruque', price: '£120', note: 'French-made in Ecla vegetable-tanned leather — the minimal answer.', imageQuery: 'natural leather cardholder product' },
  ],
  rucksack: [
    { name: 'Rugged Twill Rucksack', brand: 'Filson', price: '£295', note: 'Oil-finish twill and bridle leather — the rucksack that shrugs off a decade.', imageQuery: 'tan twill leather rucksack backpack product' },
    { name: 'Hoy Travel Cycle Rucksack', brand: 'Ally Capellino', price: '£220', note: 'London-designed waxed cotton — clean enough for the office, honest enough for the weekend.', imageQuery: 'olive waxed cotton backpack product' },
    { name: 'Bernt Backpack', brand: 'Sandqvist', price: '£130', note: 'The Swedish everyday pack — quiet, square, and organised.', imageQuery: 'navy canvas backpack minimal product' },
  ],
  'messenger-bag': [
    { name: 'Avon Shoulder Bag', brand: 'Brady Bags', price: '£160', note: 'English game bags since 1877 — the original crossbody, made for actual carrying.', imageQuery: 'olive canvas fishing shoulder bag product' },
    { name: 'Hadley One', brand: 'Billingham', price: '£250', note: 'Built for cameras, perfect for everything — weatherproof English canvas.', imageQuery: 'khaki canvas messenger bag product' },
    { name: 'M/S Mate Messenger', brand: 'Mismo', price: '£395', note: 'The Danish refined take — structured enough for work, soft enough for the train.', imageQuery: 'navy canvas leather messenger bag product' },
  ],
  washbag: [
    { name: 'Canvas Washbag', brand: 'Bennett Winch', price: '£125', note: 'English canvas with leather ends — matches the weekender it travels inside.', imageQuery: 'black canvas leather wash bag product' },
    { name: 'Travel Kit', brand: 'Filson', price: '£85', note: 'Rugged twill that wipes clean — the kit bag that outlives the toiletries.', imageQuery: 'tan twill dopp kit travel bag product' },
    { name: 'Leather Washbag', brand: 'Ettinger', price: '£225', note: 'The dressed-up version — bridle leather for the man whose luggage matches.', imageQuery: 'brown leather wash bag product' },
  ],
  panama: [
    { name: 'Rollable Panama', brand: 'Lock & Co.', price: '£180', note: 'Hand-woven toquilla straw for real heat — buy it rollable and it survives the suitcase.', imageQuery: 'straw panama hat menswear product' },
    { name: 'Classic Panama', brand: "Christys' London", price: '£110', note: 'The English hatter since 1773 — the honest-money genuine article.', imageQuery: 'panama hat black band product' },
    { name: 'Fine Weave Panama', brand: 'Borsalino', price: '£320', note: 'The Italian benchmark — a finer weave that folds like cloth.', imageQuery: 'fine weave panama hat product' },
  ],
  fedora: [
    { name: 'Voyager Rollable Fedora', brand: 'Lock & Co.', price: '£195', note: 'Crushable felt from the world’s oldest hat shop — the travel fedora.', imageQuery: 'brown felt fedora hat menswear product' },
    { name: 'Bel Air Trilby', brand: "Christys' London", price: '£120', note: 'The narrower brim — easier to wear than a full fedora, still a proper hat.', imageQuery: 'grey felt trilby hat product' },
    { name: 'Classic Fedora', brand: 'Stetson', price: '£160', note: 'The American standard — fur felt that holds its shape in weather.', imageQuery: 'charcoal fedora hat menswear product' },
  ],
};

export function seedsForSubcategory(subId: string): SubSeedPick[] {
  return SUBCATEGORY_SEEDS[subId] || [];
}
