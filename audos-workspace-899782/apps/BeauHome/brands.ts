/**
 * THE BRAND DIRECTORY — the structured catalog behind The Hunt's brand
 * intelligence sub-tabs (Discover, Compare, Matrix, and the shared Brand
 * Detail page).
 *
 * Seeded from the same verified makers as the reference layer
 * (brand-reference.ts) but with the STRUCTURED fields those surfaces need:
 * country + founding year, price band, primary materials, construction
 * method + quality rating, registers, longevity/value-over-time, signature
 * pieces, archetype fit (the nine archetype ids) and a sizing note.
 *
 * THIS IS NOT THE CEILING. Brands outside the catalog get an AI-generated
 * profile (hunt-ai.ts → generateBrandProfile) with the same shape, marked
 * `generated: true` — so Match results, Compare additions and free lookups
 * work for any maker in the world.
 *
 * The file also owns the small cross-surface session bits: the Compare
 * queue (max 3 brands), the profile-on/off toggle and the sub-tab handoff
 * used by The Rail's "Compare makers" button.
 */
import { sortByCategoryOrder } from './category-order';

export type PriceBand = 'accessible' | 'mid' | 'upper-mid' | 'luxury';
export type Register = 'Casual' | 'Smart-Casual' | 'Formal';

export interface BrandProfile {
  brand: string;
  /** One line: what they make, who they're for. */
  description: string;
  country: string;
  founded: number | null;
  priceBand: PriceBand;
  /** Display string, e.g. "Mid (£150–400)". */
  priceRangeLabel: string;
  /** Primary materials, most signature first. */
  materials: string[];
  /** Construction method as a spec-sheet phrase, e.g. "Goodyear welt". */
  construction: string;
  constructionQuality: 'Excellent' | 'Good' | 'Adequate';
  /** One-line rationale for the quality rating. */
  constructionNote: string;
  registers: Register[];
  longevity: {
    resoleable: boolean;
    mendable: boolean;
    expectedYears: number;
    note: string;
  };
  /** Value-over-time, expressed as approx cost per year of wear. */
  costPerYearNote: string;
  signaturePieces: string[];
  /** Archetype ids from the nine (profile-data ARCHETYPES). */
  archetypes: string[];
  sizingNote: string;
  /** 1–10 construction/quality score — the Matrix's x axis. */
  qualityScore: number;
  naturalMaterials: boolean;
  /** True when the profile came from the AI layer, not this catalog. */
  generated?: boolean;
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

export const PRICE_BAND_LABELS: Record<PriceBand, string> = {
  accessible: 'Accessible (under £150)',
  mid: 'Mid (£150–400)',
  'upper-mid': 'Upper-mid (£400–800)',
  luxury: 'Luxury (£800+)',
};

export const PRICE_BAND_SYMBOL: Record<PriceBand, string> = {
  accessible: '£',
  mid: '££',
  'upper-mid': '£££',
  luxury: '££££',
};

export const PRICE_BAND_ORDER: PriceBand[] = ['accessible', 'mid', 'upper-mid', 'luxury'];

/** Archetype id → display label (mirrors profile-data ARCHETYPES). */
export const ARCHETYPE_LABELS: Record<string, string> = {
  ivy: 'Classic Ivy',
  country: 'British Country',
  continental: 'Continental',
  sportsman: 'American Outdoors',
  workwear: 'Workwear',
  relaxed: 'Smart Casual',
  military: 'Military / Utility',
  nautical: 'Coastal / Nautical',
  riviera: 'Mediterranean / Riviera',
};

export function archetypeLabel(id: string): string {
  return ARCHETYPE_LABELS[id] || id;
}

export function longevitySignal(b: BrandProfile): string {
  const bits: string[] = [];
  if (b.longevity.resoleable) bits.push('Resoleable: Yes');
  if (b.longevity.mendable) bits.push('Made to mend: Yes');
  bits.push(`Expected lifespan: ${b.longevity.expectedYears}+ years`);
  return bits.join(' · ');
}

// ---------------------------------------------------------------------------
// Official brand websites — every maker name shown in Discover is tappable
// and opens the brand's own site in a new tab (Buy Links overhaul, Part
// 2.1). Catalog makers carry a verified URL; anything outside the map
// resolves through a first-result redirect so the tap still lands on the
// official site rather than a dead end.
// ---------------------------------------------------------------------------

const BRAND_WEBSITES: Record<string, string> = {
  berwick: 'https://www.berwickshoes.com',
  'loake 1880': 'https://www.loake.co.uk',
  'crockett & jones': 'https://www.crockettandjones.com',
  carmina: 'https://www.carminashoemaker.com',
  meermin: 'https://meermin.com',
  sanders: 'https://www.sanders-uk.com',
  solovair: 'https://www.nps-solovair.com',
  'common projects': 'https://www.commonprojects.com',
  veja: 'https://www.veja-store.com',
  astorflex: 'https://www.astorflex.com',
  'rancourt & co.': 'https://www.rancourtandcompany.com',
  barbour: 'https://www.barbour.com',
  'private white v.c.': 'https://www.privatewhitevc.com',
  'universal works': 'https://www.universalworks.co.uk',
  'alpha industries': 'https://www.alphaindustries.com',
  mackintosh: 'https://www.mackintosh.com',
  valstar: 'https://www.valstar.it',
  grenfell: 'https://www.grenfell.com',
  "jamieson's of shetland": 'https://www.jamiesonsofshetland.co.uk',
  'harley of scotland': 'https://www.harleyofscotland.com',
  'john smedley': 'https://www.johnsmedley.com',
  'inis meáin': 'https://www.inismeain.ie',
  "colhay's": 'https://colhays.com',
  'kamakura shirts': 'https://kamakurashirts.com',
  'gitman vermont': 'https://gitmanvintage.com',
  'gitman vintage': 'https://gitmanvintage.com',
  "drake's": 'https://drakes.com',
  sunspel: 'https://www.sunspel.com',
  'saint james': 'https://www.saint-james.com',
  '100hands': 'https://www.100hands.nl',
  'berg & berg': 'https://bergbergstore.com',
  'rogue territory': 'https://www.rogueterritory.com',
  uniqlo: 'https://www.uniqlo.com',
  boglioli: 'https://www.boglioli.it',
  suitsupply: 'https://suitsupply.com',
  'spier & mackay': 'https://www.spierandmackay.com',
  cordings: 'https://www.cordings.co.uk',
  'equus leather': 'https://www.equusleather.co.uk',
  'begg x co': 'https://www.beggxco.com',
  'sam hober': 'https://www.samhober.com',
  'bennett winch': 'https://www.bennettwinch.com',
  filson: 'https://www.filson.com',
  'luca faloni': 'https://lucafaloni.com',
  'merz b. schwanen': 'https://www.merz-schwanen.com',
  'blackhorse lane ateliers': 'https://blackhorselane.com',
  morjas: 'https://www.morjas.com',
  casatlantic: 'https://casatlantic.com',
  'lady white co.': 'https://www.ladywhiteco.com',
  'stan ray': 'https://www.stanrayusa.com',
  baracuta: 'https://www.baracuta.com',
  paraboot: 'https://www.paraboot.com',
  'r.m. williams': 'https://www.rmwilliams.com',
  'ring jacket': 'https://ringjacket.com',
  'anglo-italian': 'https://www.anglo-italian.com',
  'william lockie': 'https://www.williamlockie.com',
  'le tricoteur': 'https://letricoteur.com',
  gloverall: 'https://www.gloverall.com',
  'lock & co.': 'https://www.lockhatters.com',
  'fred perry': 'https://www.fredperry.com',
  'g.h. bass': 'https://www.ghbass.com',
  cqp: 'https://c-qp.com',
  novesta: 'https://www.novesta.com',
  'clarks originals': 'https://www.clarks.com',
  vetra: 'https://www.vetra.fr',
  'buzz rickson': 'https://www.buzzricksons.jp',
  stutterheim: 'https://stutterheim.com',
  'orlebar brown': 'https://www.orlebarbrown.com',
  orslow: 'https://www.orslow.com',
  'full count': 'https://www.fullcount-online.com',
  rota: 'https://www.rotasrl.it',
  'corridor nyc': 'https://corridornyc.com',
  hanro: 'https://www.hanro.com',
  smartwool: 'https://www.smartwool.com',
  icebreaker: 'https://www.icebreaker.com',
  finisterre: 'https://finisterre.com',
  "anderson's": 'https://andersonsbelts.it',
  'tanner goods': 'https://www.tannergoods.com',
  hamilton: 'https://www.hamiltonwatch.com',
  timex: 'https://timex.co.uk',
  seiko: 'https://www.seikowatches.com',
  rubinacci: 'https://www.marianorubinacci.net',
  'simonnot godard': 'https://www.simonnot-godard.com',
  'shibumi firenze': 'https://www.shibumi-firenze.com',
  'johnstons of elgin': 'https://www.johnstonsofelgin.com',
  'l.l.bean': 'https://www.llbean.com',
  'chapman bags': 'https://www.chapmanbags.com',
  'frank clegg': 'https://www.frankcleggleatherworks.com',
  mismo: 'https://mismo.dk',
  stetson: 'https://www.stetson.eu',
  cableami: 'https://cableami.com',
  heimat: 'https://www.heimat-textil.com',
  'highland 2000': 'https://www.highland2000.com',
  'le bonnet': 'https://lebonnet.nl',
};

/**
 * The official website for a maker — the verified URL when we hold one,
 * otherwise a DuckDuckGo first-result redirect (lands on the brand's own
 * site for any real maker), so a brand tap never dead-ends.
 */
export function brandWebsiteUrl(brandName: string): string {
  const key = (brandName || '').trim().toLowerCase();
  if (BRAND_WEBSITES[key]) return BRAND_WEBSITES[key];
  return `https://duckduckgo.com/?q=${encodeURIComponent(`\\${brandName} official site`)}`;
}

// ---------------------------------------------------------------------------
// The seed catalog — ~40 verified makers with structured intelligence.
// ---------------------------------------------------------------------------

export const BRAND_DIRECTORY: BrandProfile[] = [
  // ——— Shoes ———
  {
    brand: 'Berwick',
    description: 'Spanish Goodyear-welted shoes — bespoke-grade craft at mid-market prices.',
    country: 'Spain',
    founded: 1991,
    priceBand: 'mid',
    priceRangeLabel: 'Mid (£150–300)',
    materials: ['Full-grain calf leather', 'Leather soles', 'Dainite rubber'],
    construction: 'Goodyear welt',
    constructionQuality: 'Excellent',
    constructionNote: 'True Goodyear welting and quality calf at a price most welted makers cannot touch.',
    registers: ['Smart-Casual', 'Formal'],
    longevity: { resoleable: true, mendable: true, expectedYears: 15, note: 'Resoleable for decades with basic care.' },
    costPerYearNote: '~£15–20 per year of wear over a 15-year life with one resole.',
    signaturePieces: ['Plain-toe Derby', 'Suede chukka', 'Penny loafer'],
    archetypes: ['continental', 'ivy', 'country'],
    sizingNote: 'Runs close to UK sizing; the round lasts suit a medium-width foot.',
    qualityScore: 8,
    naturalMaterials: true,
  },
  {
    brand: 'Loake 1880',
    description: 'Northamptonshire benchmade shoes — the honest English classics.',
    country: 'England',
    founded: 1880,
    priceBand: 'mid',
    priceRangeLabel: 'Mid (£200–380)',
    materials: ['Calf leather', 'Oak-bark tanned soles'],
    construction: 'Goodyear welt (Kettering)',
    constructionQuality: 'Excellent',
    constructionNote: 'The 1880 line is fully Goodyear-welted in Kettering — proper English shoemaking.',
    registers: ['Smart-Casual', 'Formal'],
    longevity: { resoleable: true, mendable: true, expectedYears: 20, note: 'Resoleable for decades; uppers improve with cream and wear.' },
    costPerYearNote: '~£12–18 per year of wear over a 20-year life.',
    signaturePieces: ['Chatsworth brogue', 'Chester brogue', 'Kempton chukka'],
    archetypes: ['ivy', 'country', 'relaxed'],
    sizingNote: 'English lasts run roomy — many size down half from a sneaker size.',
    qualityScore: 8,
    naturalMaterials: true,
  },
  {
    brand: 'Crockett & Jones',
    description: 'Northampton shoemaking at its most refined — lasts that hold shape for years.',
    country: 'England',
    founded: 1879,
    priceBand: 'upper-mid',
    priceRangeLabel: 'Upper-mid (£450–700)',
    materials: ['Museum calf', 'Suede', 'Shell cordovan (Handgrade)'],
    construction: 'Goodyear welt, closed-channel soles on Handgrade',
    constructionQuality: 'Excellent',
    constructionNote: 'Benchmark Northampton construction; the Handgrade line rivals shoes twice the price.',
    registers: ['Smart-Casual', 'Formal'],
    longevity: { resoleable: true, mendable: true, expectedYears: 25, note: 'A lifetime shoe with periodic resoling.' },
    costPerYearNote: '~£20–28 per year of wear over a 25-year life.',
    signaturePieces: ['Audley Oxford', 'Coniston boot', 'Boston loafer'],
    archetypes: ['ivy', 'country', 'continental'],
    sizingNote: 'Lasts vary — the 341 runs long and slim; try half a size down from UK standard.',
    qualityScore: 9,
    naturalMaterials: true,
  },
  {
    brand: 'Carmina',
    description: 'Mallorcan Goodyear-welted shoes with elegant Spanish lasts.',
    country: 'Spain',
    founded: 1866,
    priceBand: 'upper-mid',
    priceRangeLabel: 'Upper-mid (£400–600)',
    materials: ['Museum calf', 'Shell cordovan', 'Suede'],
    construction: 'Goodyear welt',
    constructionQuality: 'Excellent',
    constructionNote: 'Refined Mallorcan welting; cordovan work matches the best of Northampton.',
    registers: ['Smart-Casual', 'Formal'],
    longevity: { resoleable: true, mendable: true, expectedYears: 20, note: 'Built to be resoled; cordovan versions outlast their owners.' },
    costPerYearNote: '~£20–30 per year of wear over a 20-year life.',
    signaturePieces: ['Simpson loafer', 'Jumper boot', 'Cordovan Derby'],
    archetypes: ['continental', 'ivy'],
    sizingNote: 'Spanish lasts run sleek and slightly narrow — wide feet should size carefully.',
    qualityScore: 9,
    naturalMaterials: true,
  },
  {
    brand: 'Meermin',
    description: 'The entry door to proper Goodyear-welted shoemaking.',
    country: 'Spain',
    founded: 2001,
    priceBand: 'accessible',
    priceRangeLabel: 'Accessible (£150–220)',
    materials: ['Calf leather', 'Suede'],
    construction: 'Goodyear welt',
    constructionQuality: 'Good',
    constructionNote: 'Honest welted construction at the entry price — finishing is simpler than the step-up makers.',
    registers: ['Smart-Casual', 'Formal'],
    longevity: { resoleable: true, mendable: true, expectedYears: 10, note: 'Resoleable; leathers are a grade below the upper-mid houses.' },
    costPerYearNote: '~£15–20 per year of wear over a 10-year life.',
    signaturePieces: ['Penny loafer', 'Cap-toe Oxford', 'Suede chukka'],
    archetypes: ['continental', 'ivy', 'relaxed'],
    sizingNote: 'Runs narrow and long — most take a half size down from UK standard.',
    qualityScore: 7,
    naturalMaterials: true,
  },
  {
    brand: 'Sanders',
    description: 'Northampton-made military-grade chukkas and derbies.',
    country: 'England',
    founded: 1873,
    priceBand: 'mid',
    priceRangeLabel: 'Mid (£180–280)',
    materials: ['Suede', 'Calf leather', 'Crepe and Dainite soles'],
    construction: 'Goodyear welt',
    constructionQuality: 'Good',
    constructionNote: 'MoD-contract heritage — overbuilt rather than over-finished.',
    registers: ['Casual', 'Smart-Casual'],
    longevity: { resoleable: true, mendable: true, expectedYears: 15, note: 'Military spec construction, resoleable.' },
    costPerYearNote: '~£12–18 per year of wear over a 15-year life.',
    signaturePieces: ['Hi-Top chukka', 'Worcester military Derby'],
    archetypes: ['military', 'country', 'workwear'],
    sizingNote: 'True to UK sizing with a roomy toe box.',
    qualityScore: 7,
    naturalMaterials: true,
  },
  {
    brand: 'Solovair',
    description: 'The original Northamptonshire work boot — Goodyear-welted, resoleable.',
    country: 'England',
    founded: 1881,
    priceBand: 'mid',
    priceRangeLabel: 'Mid (£160–240)',
    materials: ['Hi-shine leather', 'Greasy leather', 'Air-cushioned soles'],
    construction: 'Goodyear welt',
    constructionQuality: 'Good',
    constructionNote: 'The factory that originally made Dr. Martens — same silhouette, properly welted.',
    registers: ['Casual'],
    longevity: { resoleable: true, mendable: true, expectedYears: 15, note: 'Welted where the lookalikes are cemented — resoleable for decades.' },
    costPerYearNote: '~£10–16 per year of wear over a 15-year life.',
    signaturePieces: ['8-eye derby boot', '3-eye Gibson shoe'],
    archetypes: ['workwear', 'sportsman', 'military'],
    sizingNote: 'Runs large — most size down a full size from their sneaker size.',
    qualityScore: 7,
    naturalMaterials: true,
  },
  {
    brand: 'Common Projects',
    description: 'The Italian-made minimal leather sneaker that works with tailoring.',
    country: 'Italy',
    founded: 2004,
    priceBand: 'upper-mid',
    priceRangeLabel: 'Upper-mid (£300–420)',
    materials: ['Full-grain Nappa leather', 'Margom rubber soles'],
    construction: 'Blake stitch',
    constructionQuality: 'Good',
    constructionNote: 'Blake-stitched where most sneakers are glued — clean, durable, quietly luxurious.',
    registers: ['Casual', 'Smart-Casual'],
    longevity: { resoleable: false, mendable: false, expectedYears: 6, note: 'Long for a sneaker, but soles are not designed for replacement.' },
    costPerYearNote: '~£50–70 per year of wear — sneakers age faster than welted shoes.',
    signaturePieces: ['Original Achilles Low'],
    archetypes: ['relaxed', 'continental'],
    sizingNote: 'Runs long — size down one full EU size.',
    qualityScore: 7,
    naturalMaterials: true,
  },
  {
    brand: 'Veja',
    description: 'Clean low-profile sneakers with a traceable supply chain.',
    country: 'France / Brazil',
    founded: 2005,
    priceBand: 'accessible',
    priceRangeLabel: 'Accessible (£95–150)',
    materials: ['Chrome-free leather', 'Wild Amazonian rubber', 'Organic cotton'],
    construction: 'Cemented, vulcanised sole',
    constructionQuality: 'Adequate',
    constructionNote: 'Well-made for the price and ethics-led, but standard sneaker construction.',
    registers: ['Casual'],
    longevity: { resoleable: false, mendable: false, expectedYears: 4, note: 'A typical quality-sneaker lifespan.' },
    costPerYearNote: '~£25–35 per year of wear over a 4-year life.',
    signaturePieces: ['V-10', 'Campo'],
    archetypes: ['relaxed', 'nautical'],
    sizingNote: 'Runs slightly large and narrow at the toe.',
    qualityScore: 5,
    naturalMaterials: true,
  },
  {
    brand: 'Astorflex',
    description: 'Italian suede chukkas on natural crepe, made by one family since 1816.',
    country: 'Italy',
    founded: 1816,
    priceBand: 'accessible',
    priceRangeLabel: 'Accessible (£130–180)',
    materials: ['Vegetable-tanned suede', 'Natural crepe rubber'],
    construction: 'Stitchdown (Ideal welt)',
    constructionQuality: 'Good',
    constructionNote: 'Vegetable tanning and stitchdown construction — rare honesty at this price.',
    registers: ['Casual', 'Smart-Casual'],
    longevity: { resoleable: true, mendable: true, expectedYears: 8, note: 'Crepe soles wear soft but the construction allows repair.' },
    costPerYearNote: '~£18–25 per year of wear over an 8-year life.',
    signaturePieces: ['Greenflex desert boot', 'Driftflex chukka'],
    archetypes: ['relaxed', 'sportsman', 'riviera'],
    sizingNote: 'Runs generous — size down half; suede stretches to the foot.',
    qualityScore: 7,
    naturalMaterials: true,
  },
  {
    brand: 'Rancourt & Co.',
    description: 'Hand-sewn Maine moccasins and boat shoes built to be resoled.',
    country: 'USA',
    founded: 1964,
    priceBand: 'mid',
    priceRangeLabel: 'Mid (£200–350)',
    materials: ['Horween Chromexcel', 'Full-grain leathers'],
    construction: 'Hand-sewn moccasin',
    constructionQuality: 'Excellent',
    constructionNote: 'Genuine hand-sewn true-moccasin construction in Lewiston, Maine.',
    registers: ['Casual', 'Smart-Casual'],
    longevity: { resoleable: true, mendable: true, expectedYears: 15, note: 'The factory recrafts its own shoes — a genuinely long-life purchase.' },
    costPerYearNote: '~£15–22 per year of wear over a 15-year life.',
    signaturePieces: ['Ranger moc', 'Read boat shoe', 'Beefroll penny loafer'],
    archetypes: ['ivy', 'nautical', 'sportsman'],
    sizingNote: 'Moccasin fit runs roomy — size down half; leather moulds quickly.',
    qualityScore: 8,
    naturalMaterials: true,
  },

  // ——— Outerwear ———
  {
    brand: 'Barbour',
    description: 'The waxed-cotton country jacket — rewaxable and repairable for life.',
    country: 'England',
    founded: 1894,
    priceBand: 'mid',
    priceRangeLabel: 'Mid (£180–350)',
    materials: ['Sylkoil waxed cotton', 'Thornproof wax cotton', 'Cotton tartan linings'],
    construction: 'Waxed cotton, studded storm fly, corduroy collar',
    constructionQuality: 'Good',
    constructionNote: 'Simple, proven construction backed by a real rewax-and-repair service.',
    registers: ['Casual'],
    longevity: { resoleable: false, mendable: true, expectedYears: 25, note: 'Rewaxable and factory-repairable — Bedales outlive their owners.' },
    costPerYearNote: '~£10–15 per year of wear over a 25-year life with rewaxing.',
    signaturePieces: ['Bedale', 'Beaufort', 'Ashby'],
    archetypes: ['country', 'sportsman', 'military'],
    sizingNote: 'Classic fits are cut generous for layering — size down for a trim fit.',
    qualityScore: 7,
    naturalMaterials: true,
  },
  {
    brand: 'Private White V.C.',
    description: 'Outerwear made end-to-end in one Manchester factory.',
    country: 'England',
    founded: 2011,
    priceBand: 'luxury',
    priceRangeLabel: 'Luxury (£500–1,200)',
    materials: ['Ventile cotton', 'British Millerain waxed cotton', 'Copper hardware'],
    construction: 'Fully factory-made in Manchester, bar-tacked stress points',
    constructionQuality: 'Excellent',
    constructionNote: 'One of the last vertically integrated British outerwear factories — flawless make.',
    registers: ['Casual', 'Smart-Casual'],
    longevity: { resoleable: false, mendable: true, expectedYears: 20, note: 'Repair service for life; cloth chosen to age, not fail.' },
    costPerYearNote: '~£30–50 per year of wear over a 20-year life.',
    signaturePieces: ['Ventile Mac', 'Twin Track jacket', 'Flight bomber'],
    archetypes: ['country', 'military', 'relaxed'],
    sizingNote: 'True to size with military-straight shoulders; between sizes, go down.',
    qualityScore: 9,
    naturalMaterials: true,
  },
  {
    brand: 'Universal Works',
    description: 'Nottingham-designed chore coats and easy tailoring in honest cloth.',
    country: 'England',
    founded: 2009,
    priceBand: 'mid',
    priceRangeLabel: 'Mid (£150–280)',
    materials: ['Cotton twill', 'Wool blends', 'Corduroy'],
    construction: 'Machine-sewn, unstructured',
    constructionQuality: 'Good',
    constructionNote: 'Simple, well-executed casual construction — design-led rather than heritage-built.',
    registers: ['Casual', 'Smart-Casual'],
    longevity: { resoleable: false, mendable: true, expectedYears: 8, note: 'Honest cloth that mends well.' },
    costPerYearNote: '~£20–30 per year of wear over an 8-year life.',
    signaturePieces: ['Bakers jacket', 'Bakers overshirt'],
    archetypes: ['workwear', 'relaxed', 'military'],
    sizingNote: 'Cut short and boxy — good on a shorter frame; true to size.',
    qualityScore: 6,
    naturalMaterials: true,
  },
  {
    brand: 'Le Laboureur',
    description: 'French moleskin work jackets made in Digoin since 1956.',
    country: 'France',
    founded: 1956,
    priceBand: 'accessible',
    priceRangeLabel: 'Accessible (£80–130)',
    materials: ['Cotton moleskin', 'Cotton drill'],
    construction: 'Traditional French workwear make, felled seams',
    constructionQuality: 'Good',
    constructionNote: 'Unchanged factory patterns; the cloth is the point — it softens for years.',
    registers: ['Casual'],
    longevity: { resoleable: false, mendable: true, expectedYears: 12, note: 'Moleskin wears in, not out; easily patched in character.' },
    costPerYearNote: '~£8–12 per year of wear over a 12-year life.',
    signaturePieces: ['Veste de travail (chore coat)'],
    archetypes: ['workwear', 'sportsman'],
    sizingNote: 'French workwear sizing runs trim in the shoulder — size up for layering.',
    qualityScore: 6,
    naturalMaterials: true,
  },
  {
    brand: 'Alpha Industries',
    description: 'The original US military contractor — MA-1s and M-65s to spec.',
    country: 'USA',
    founded: 1959,
    priceBand: 'accessible',
    priceRangeLabel: 'Accessible (£120–200)',
    materials: ['Flight nylon', 'Cotton sateen'],
    construction: 'Military-spec patterns and cloth weights',
    constructionQuality: 'Good',
    constructionNote: 'Genuine contractor heritage — the patterns are the originals, not homages.',
    registers: ['Casual'],
    longevity: { resoleable: false, mendable: true, expectedYears: 10, note: 'Mil-spec nylon shrugs off a decade of wear.' },
    costPerYearNote: '~£12–20 per year of wear over a 10-year life.',
    signaturePieces: ['MA-1 bomber', 'M-65 field jacket'],
    archetypes: ['military', 'sportsman'],
    sizingNote: 'Military cuts run big — size down one from your usual.',
    qualityScore: 6,
    naturalMaterials: false,
  },
  {
    brand: 'Mackintosh',
    description: 'The bonded-cotton raincoat, hand-glued in Scotland since 1823.',
    country: 'Scotland',
    founded: 1823,
    priceBand: 'luxury',
    priceRangeLabel: 'Luxury (£800–1,500)',
    materials: ['Bonded cotton', 'Wool'],
    construction: 'Hand-glued bonded seams — no stitching to leak',
    constructionQuality: 'Excellent',
    constructionNote: 'A construction method nobody else still does at scale — genuinely waterproof cotton.',
    registers: ['Smart-Casual', 'Formal'],
    longevity: { resoleable: false, mendable: true, expectedYears: 20, note: 'Re-proofing and repair service; a generational coat.' },
    costPerYearNote: '~£50–75 per year of wear over a 20-year life.',
    signaturePieces: ['Dunoon', 'Cambridge raincoat'],
    archetypes: ['continental', 'country', 'relaxed'],
    sizingNote: 'Cut long and straight — the drape needs the length; true to size.',
    qualityScore: 9,
    naturalMaterials: true,
  },
  {
    brand: 'Valstar',
    description: 'The original Italian suede blouson — unlined, cut short.',
    country: 'Italy',
    founded: 1911,
    priceBand: 'luxury',
    priceRangeLabel: 'Luxury (£700–1,100)',
    materials: ['Goat suede', 'Lamb suede', 'Cotton'],
    construction: 'Unlined, unstructured Italian make',
    constructionQuality: 'Excellent',
    constructionNote: 'The Valstarino is the reference suede blouson — every rival copies it.',
    registers: ['Smart-Casual'],
    longevity: { resoleable: false, mendable: true, expectedYears: 15, note: 'Quality suede ages into character with basic care.' },
    costPerYearNote: '~£50–70 per year of wear over a 15-year life.',
    signaturePieces: ['Valstarino suede blouson'],
    archetypes: ['continental', 'relaxed'],
    sizingNote: 'Cut short and trim — flattering on a shorter frame; size up if broad.',
    qualityScore: 8,
    naturalMaterials: true,
  },
  {
    brand: 'Grenfell',
    description: 'Weatherproof English coats in densely woven Grenfell cloth.',
    country: 'England',
    founded: 1923,
    priceBand: 'upper-mid',
    priceRangeLabel: 'Upper-mid (£400–700)',
    materials: ['Grenfell cloth (fine cotton gabardine)'],
    construction: 'Made in England, traditional coat-making',
    constructionQuality: 'Excellent',
    constructionNote: 'The house cloth is woven so dense it turns weather without membranes.',
    registers: ['Smart-Casual', 'Casual'],
    longevity: { resoleable: false, mendable: true, expectedYears: 20, note: 'A dense natural cloth that outlasts laminated technical fabrics.' },
    costPerYearNote: '~£25–35 per year of wear over a 20-year life.',
    signaturePieces: ['Golfer jacket', 'Walker coat'],
    archetypes: ['country', 'ivy', 'relaxed'],
    sizingNote: 'Classic English cut, true to size with room for a knit.',
    qualityScore: 8,
    naturalMaterials: true,
  },

  // ——— Knitwear ———
  {
    brand: 'Jamieson\u2019s of Shetland',
    description: 'Pure Shetland wool, spun and knitted on the islands.',
    country: 'Scotland',
    founded: 1893,
    priceBand: 'accessible',
    priceRangeLabel: 'Accessible (£90–140)',
    materials: ['100% Shetland wool'],
    construction: 'Fully fashioned island knitting',
    constructionQuality: 'Excellent',
    constructionNote: 'The genuine article — island-spun wool with the true Shetland handle.',
    registers: ['Casual', 'Smart-Casual'],
    longevity: { resoleable: false, mendable: true, expectedYears: 15, note: 'Shetland wool darns invisibly and softens with every year.' },
    costPerYearNote: '~£7–10 per year of wear over a 15-year life.',
    signaturePieces: ['Shetland crew neck', 'Fair Isle vest'],
    archetypes: ['country', 'ivy', 'sportsman'],
    sizingNote: 'Traditional cut, true to size; the wool relaxes slightly with wear.',
    qualityScore: 8,
    naturalMaterials: true,
  },
  {
    brand: 'Harley of Scotland',
    description: 'Seamless Shetland and lambswool knitted in Peebles.',
    country: 'Scotland',
    founded: 1929,
    priceBand: 'accessible',
    priceRangeLabel: 'Accessible (£70–120)',
    materials: ['Shetland wool', 'Geelong lambswool'],
    construction: 'Seamless circular knitting, fully fashioned',
    constructionQuality: 'Good',
    constructionNote: 'Honest Scottish knitting at a price the quality shouldn\u2019t allow.',
    registers: ['Casual', 'Smart-Casual'],
    longevity: { resoleable: false, mendable: true, expectedYears: 12, note: 'Darnable, durable, improves with washing.' },
    costPerYearNote: '~£6–10 per year of wear over a 12-year life.',
    signaturePieces: ['Shetland crew neck'],
    archetypes: ['country', 'ivy'],
    sizingNote: 'Runs slim and slightly short in the body — size up for ease.',
    qualityScore: 7,
    naturalMaterials: true,
  },
  {
    brand: 'John Smedley',
    description: 'The fine-gauge reference — Sea Island cotton and merino since 1784.',
    country: 'England',
    founded: 1784,
    priceBand: 'upper-mid',
    priceRangeLabel: 'Upper-mid (£150–300)',
    materials: ['Sea Island cotton', 'Extra-fine merino'],
    construction: '30-gauge fully fashioned knitting, Derbyshire',
    constructionQuality: 'Excellent',
    constructionNote: 'Nobody knits finer at scale — the collars and cuffs still look new years in.',
    registers: ['Smart-Casual', 'Formal'],
    longevity: { resoleable: false, mendable: false, expectedYears: 10, note: 'Fine gauge demands care but holds shape beautifully.' },
    costPerYearNote: '~£18–28 per year of wear over a 10-year life.',
    signaturePieces: ['Belden polo', 'Lundy pullover'],
    archetypes: ['continental', 'relaxed', 'ivy'],
    sizingNote: 'Slim English block — size up if between; sleeves run long.',
    qualityScore: 9,
    naturalMaterials: true,
  },
  {
    brand: 'Le Tricoteur',
    description: 'The original Guernsey, knitted in oiled worsted wool on the island.',
    country: 'Guernsey',
    founded: 1964,
    priceBand: 'accessible',
    priceRangeLabel: 'Accessible (£90–130)',
    materials: ['Worsted oiled wool'],
    construction: 'Traditional seamless Guernsey knitting',
    constructionQuality: 'Excellent',
    constructionNote: 'The fisherman\u2019s original — dense, weatherproof, knitted to work in.',
    registers: ['Casual'],
    longevity: { resoleable: false, mendable: true, expectedYears: 20, note: 'A working garment — Guernseys are handed down.' },
    costPerYearNote: '~£5–8 per year of wear over a 20-year life.',
    signaturePieces: ['Traditional Guernsey'],
    archetypes: ['nautical', 'country'],
    sizingNote: 'Traditional square cut — boxy by design; take your usual size.',
    qualityScore: 8,
    naturalMaterials: true,
  },
  {
    brand: 'Inis Me\u00e1in',
    description: 'Aran knitting from the island itself, in modern proportions.',
    country: 'Ireland',
    founded: 1976,
    priceBand: 'luxury',
    priceRangeLabel: 'Luxury (£300–600)',
    materials: ['Merino', 'Linen', 'Alpaca', 'Cashmere blends'],
    construction: 'Fully fashioned island knitting',
    constructionQuality: 'Excellent',
    constructionNote: 'Traditional stitches executed in luxury yarns — heirloom knitwear.',
    registers: ['Casual', 'Smart-Casual'],
    longevity: { resoleable: false, mendable: true, expectedYears: 15, note: 'Heavy-gauge luxury yarn, made to be kept.' },
    costPerYearNote: '~£25–40 per year of wear over a 15-year life.',
    signaturePieces: ['Aran sweater', 'Linen pub jacket'],
    archetypes: ['country', 'nautical', 'continental'],
    sizingNote: 'Modern trim block — truer to size than traditional Arans.',
    qualityScore: 9,
    naturalMaterials: true,
  },
  {
    brand: 'Colhay\u2019s',
    description: 'Scottish-spun cashmere and lambswool in mid-century proportions.',
    country: 'Scotland',
    founded: 2020,
    priceBand: 'upper-mid',
    priceRangeLabel: 'Upper-mid (£200–450)',
    materials: ['Scottish cashmere', 'Lambswool'],
    construction: 'Fully fashioned, knitted in Hawick',
    constructionQuality: 'Excellent',
    constructionNote: 'Old-school Scottish spinning and high armholes cut for layering.',
    registers: ['Smart-Casual', 'Formal'],
    longevity: { resoleable: false, mendable: true, expectedYears: 12, note: 'Dense Scottish spinning resists pilling far better than fashion cashmere.' },
    costPerYearNote: '~£20–35 per year of wear over a 12-year life.',
    signaturePieces: ['Lambswool polo collar', 'Cashmere cardigan'],
    archetypes: ['continental', 'ivy', 'country'],
    sizingNote: 'High armholes and a tailored block — true to size, flattering on shorter frames.',
    qualityScore: 9,
    naturalMaterials: true,
  },

  // ——— Tops ———
  {
    brand: 'Kamakura Shirts',
    description: 'Japanese-made oxford button-downs with a proper collar roll.',
    country: 'Japan',
    founded: 1993,
    priceBand: 'mid',
    priceRangeLabel: 'Mid (£80–140)',
    materials: ['Oxford cotton', 'Broadcloth', 'Mother-of-pearl buttons'],
    construction: 'Single-needle stitching, unfused collars',
    constructionQuality: 'Excellent',
    constructionNote: 'Shirtmaking detail (stitch density, unfused collar) usually found at twice the price.',
    registers: ['Smart-Casual', 'Formal'],
    longevity: { resoleable: false, mendable: true, expectedYears: 8, note: 'Collars and cuffs can be turned by any tailor.' },
    costPerYearNote: '~£12–18 per year of wear over an 8-year life.',
    signaturePieces: ['Vintage Ivy OCBD'],
    archetypes: ['ivy', 'relaxed'],
    sizingNote: 'Japanese blocks run short in body and sleeve — helpful for a shorter build; check the size chart.',
    qualityScore: 8,
    naturalMaterials: true,
  },
  {
    brand: 'Gitman Vermont',
    description: 'The American OCBD, made in Ashland, Pennsylvania since 1978.',
    country: 'USA',
    founded: 1978,
    priceBand: 'mid',
    priceRangeLabel: 'Mid (£120–180)',
    materials: ['Oxford cotton', 'Chambray', 'Flannel'],
    construction: 'Single-needle seams, soft unlined collar',
    constructionQuality: 'Excellent',
    constructionNote: 'The genuine US-made article, sewn slowly on old machines.',
    registers: ['Casual', 'Smart-Casual'],
    longevity: { resoleable: false, mendable: true, expectedYears: 10, note: 'Heavy oxford that gets better with a decade of washing.' },
    costPerYearNote: '~£12–18 per year of wear over a 10-year life.',
    signaturePieces: ['Classic OCBD', 'Chambray work shirt'],
    archetypes: ['ivy', 'workwear'],
    sizingNote: 'American cut runs full — size down for a trimmer line.',
    qualityScore: 8,
    naturalMaterials: true,
  },
  {
    brand: 'Drake\u2019s',
    description: 'London\u2019s modern Ivy outfitter — heavy oxfords with a generous roll.',
    country: 'England',
    founded: 1977,
    priceBand: 'upper-mid',
    priceRangeLabel: 'Upper-mid (£150–260)',
    materials: ['Heavy oxford cotton', 'Chambray', 'Linen'],
    construction: 'Cut with the room the fabric wants, unfused collars',
    constructionQuality: 'Excellent',
    constructionNote: 'Cloth-first shirtmaking — the collar roll is the house signature.',
    registers: ['Casual', 'Smart-Casual'],
    longevity: { resoleable: false, mendable: true, expectedYears: 10, note: 'Heavyweight cloth built for years of laundering.' },
    costPerYearNote: '~£15–25 per year of wear over a 10-year life.',
    signaturePieces: ['Heavy oxford BD shirt', 'Grenadine tie'],
    archetypes: ['ivy', 'country', 'relaxed'],
    sizingNote: 'Generous, easy cut — consider sizing down for a closer fit.',
    qualityScore: 8,
    naturalMaterials: true,
  },
  {
    brand: 'Sunspel',
    description: 'The reference plain tee and riviera polo, knitted in Long Eaton.',
    country: 'England',
    founded: 1860,
    priceBand: 'mid',
    priceRangeLabel: 'Mid (£60–110)',
    materials: ['Long-staple Supima cotton', 'Sea Island cotton'],
    construction: 'Fine-gauge knitting, English factory make',
    constructionQuality: 'Excellent',
    constructionNote: 'The cotton quality shows in year three, when cheaper tees have sagged.',
    registers: ['Casual', 'Smart-Casual'],
    longevity: { resoleable: false, mendable: false, expectedYears: 5, note: 'Long for a tee — the collar holds its line.' },
    costPerYearNote: '~£12–20 per year of wear over a 5-year life.',
    signaturePieces: ['Classic T-shirt', 'Riviera polo'],
    archetypes: ['relaxed', 'riviera', 'nautical'],
    sizingNote: 'Slim English fit, runs slightly short — true to size for most.',
    qualityScore: 8,
    naturalMaterials: true,
  },
  {
    brand: 'Saint James',
    description: 'The Breton, knitted in Normandy since 1889.',
    country: 'France',
    founded: 1889,
    priceBand: 'accessible',
    priceRangeLabel: 'Accessible (£60–100)',
    materials: ['Dense combed cotton', 'Wool'],
    construction: 'Traditional Breton knitting, dense gauge',
    constructionQuality: 'Good',
    constructionNote: 'The genuine naval-supplier article — the cotton is twice the weight of copies.',
    registers: ['Casual'],
    longevity: { resoleable: false, mendable: true, expectedYears: 10, note: 'Dense knit holds shape for a decade of wear.' },
    costPerYearNote: '~£6–10 per year of wear over a 10-year life.',
    signaturePieces: ['Meridien Breton', 'Guildo stripe'],
    archetypes: ['nautical', 'continental'],
    sizingNote: 'Cut close in the traditional way — size up for ease.',
    qualityScore: 7,
    naturalMaterials: true,
  },
  {
    brand: '100Hands',
    description: 'Hand-finished shirting — collars attached and buttonholes sewn by hand.',
    country: 'Netherlands / India',
    founded: 2014,
    priceBand: 'luxury',
    priceRangeLabel: 'Luxury (£250–450)',
    materials: ['Italian and Swiss shirting cloth'],
    construction: 'Hand-attached collars, hand-sewn buttonholes',
    constructionQuality: 'Excellent',
    constructionNote: 'Handwork on every seam that matters — bespoke-level make, ready to wear.',
    registers: ['Smart-Casual', 'Formal'],
    longevity: { resoleable: false, mendable: true, expectedYears: 10, note: 'Handwork is repairable in a way fused shirts never are.' },
    costPerYearNote: '~£25–45 per year of wear over a 10-year life.',
    signaturePieces: ['Gold Line dress shirt'],
    archetypes: ['continental', 'ivy'],
    sizingNote: 'Tailored European block — precise sizing; consult the measurements chart.',
    qualityScore: 10,
    naturalMaterials: true,
  },

  // ——— Bottoms ———
  {
    brand: 'Rota',
    description: 'Roman-made high-rise trousers with proper waistband construction.',
    country: 'Italy',
    founded: 1962,
    priceBand: 'upper-mid',
    priceRangeLabel: 'Upper-mid (£200–350)',
    materials: ['Wool flannel', 'Cotton drill', 'Corduroy'],
    construction: 'Traditional Roman trouser-making, curtained waistband',
    constructionQuality: 'Excellent',
    constructionNote: 'The waistband and rise are built like bespoke — the cut lengthens the leg.',
    registers: ['Smart-Casual', 'Formal'],
    longevity: { resoleable: false, mendable: true, expectedYears: 12, note: 'Generous seam allowances allow years of alteration.' },
    costPerYearNote: '~£18–28 per year of wear over a 12-year life.',
    signaturePieces: ['High-rise flannel trouser'],
    archetypes: ['continental', 'ivy', 'relaxed'],
    sizingNote: 'High rise runs long in the leg — order unfinished and hem to your inseam; kind to shorter builds.',
    qualityScore: 9,
    naturalMaterials: true,
  },
  {
    brand: 'Berg & Berg',
    description: 'Clean, high-cut trousers sewn in small European workshops.',
    country: 'Sweden',
    founded: 2009,
    priceBand: 'mid',
    priceRangeLabel: 'Mid (£150–250)',
    materials: ['Italian-milled wool', 'Cotton'],
    construction: 'Small-workshop European make',
    constructionQuality: 'Good',
    constructionNote: 'Sharp Scandinavian blocks, honest make — the value pick in tailored trousers.',
    registers: ['Smart-Casual', 'Formal'],
    longevity: { resoleable: false, mendable: true, expectedYears: 8, note: 'Alterable seams and quality cloth.' },
    costPerYearNote: '~£18–28 per year of wear over an 8-year life.',
    signaturePieces: ['Alf trouser'],
    archetypes: ['continental', 'relaxed'],
    sizingNote: 'Trim Scandinavian cut with a shorter rise range — good for shorter frames.',
    qualityScore: 7,
    naturalMaterials: true,
  },
  {
    brand: 'Bhode',
    description: 'British-made corduroy and moleskin trousers, short inseams as standard.',
    country: 'Scotland',
    founded: 2019,
    priceBand: 'accessible',
    priceRangeLabel: 'Accessible (£90–140)',
    materials: ['Corduroy', 'Moleskin', 'Cotton twill'],
    construction: 'British factory make',
    constructionQuality: 'Good',
    constructionNote: 'Honest weights, sensible construction — and inseam options others skip.',
    registers: ['Casual', 'Smart-Casual'],
    longevity: { resoleable: false, mendable: true, expectedYears: 8, note: 'Hard-wearing winter cloths that patch gracefully.' },
    costPerYearNote: '~£12–18 per year of wear over an 8-year life.',
    signaturePieces: ['Corduroy trouser', 'Moleskin trouser'],
    archetypes: ['country', 'workwear', 'relaxed'],
    sizingNote: 'Offers genuinely short inseams as standard — rare, and ideal for shorter builds.',
    qualityScore: 6,
    naturalMaterials: true,
  },
  {
    brand: 'Rogue Territory',
    description: 'Los Angeles-sewn selvedge denim with chainstitched hems.',
    country: 'USA',
    founded: 2008,
    priceBand: 'mid',
    priceRangeLabel: 'Mid (£180–280)',
    materials: ['Selvedge denim', 'Duck canvas'],
    construction: 'Chainstitched hems, sewn in Los Angeles',
    constructionQuality: 'Excellent',
    constructionNote: 'Small-batch American denim making — the stitching is the tell.',
    registers: ['Casual'],
    longevity: { resoleable: false, mendable: true, expectedYears: 10, note: 'Selvedge denim is made to be repaired and worn for a decade.' },
    costPerYearNote: '~£18–28 per year of wear over a 10-year life.',
    signaturePieces: ['Stanton jean', 'Supply jacket'],
    archetypes: ['workwear', 'sportsman'],
    sizingNote: 'Raw denim stretches ~1 inch in the waist — size accordingly.',
    qualityScore: 8,
    naturalMaterials: true,
  },
  {
    brand: 'Full Count',
    description: 'Zimbabwe-cotton selvedge denim woven on Japanese shuttle looms.',
    country: 'Japan',
    founded: 1992,
    priceBand: 'upper-mid',
    priceRangeLabel: 'Upper-mid (£200–320)',
    materials: ['Zimbabwe cotton selvedge denim'],
    construction: 'Shuttle-loom weaving, vintage-spec sewing',
    constructionQuality: 'Excellent',
    constructionNote: 'Osaka-Five heritage — the softest-fading honest denim made.',
    registers: ['Casual'],
    longevity: { resoleable: false, mendable: true, expectedYears: 10, note: 'Fades honestly and repairs beautifully — no factory distressing.' },
    costPerYearNote: '~£20–32 per year of wear over a 10-year life.',
    signaturePieces: ['1108 slim straight jean'],
    archetypes: ['workwear', 'sportsman'],
    sizingNote: 'Japanese vintage blocks run small — size up one from US sizing.',
    qualityScore: 9,
    naturalMaterials: true,
  },
  {
    brand: 'Uniqlo',
    description: 'The reliable stopgap — clean-lined basics at high-street prices.',
    country: 'Japan',
    founded: 1949,
    priceBand: 'accessible',
    priceRangeLabel: 'Accessible (£15–50)',
    materials: ['Cotton', 'Cotton blends', 'Synthetics'],
    construction: 'Mass production, consistent quality control',
    constructionQuality: 'Adequate',
    constructionNote: 'Not heritage make — but the cleanest lines and QC on the high street.',
    registers: ['Casual', 'Smart-Casual'],
    longevity: { resoleable: false, mendable: false, expectedYears: 3, note: 'A stopgap by design — expect a few seasons, not a decade.' },
    costPerYearNote: '~£10–15 per year of wear over a 3-year life.',
    signaturePieces: ['Chino', 'Airism tee', 'Supima cotton tee'],
    archetypes: ['relaxed', 'ivy'],
    sizingNote: 'Asian sizing runs slim and short — often helpful for shorter builds; size up if broad.',
    qualityScore: 4,
    naturalMaterials: false,
  },

  // ——— Formalwear ———
  {
    brand: 'Boglioli',
    description: 'The K-Jacket — unlined, unstructured, garment-dyed tailoring.',
    country: 'Italy',
    founded: 1974,
    priceBand: 'luxury',
    priceRangeLabel: 'Luxury (£600–1,100)',
    materials: ['Wool', 'Cashmere blends', 'Cotton'],
    construction: 'Unstructured, unlined, garment-dyed',
    constructionQuality: 'Excellent',
    constructionNote: 'The soft-tailoring original — a jacket that never overwhelms a smaller frame.',
    registers: ['Smart-Casual', 'Formal'],
    longevity: { resoleable: false, mendable: true, expectedYears: 12, note: 'Fully alterable tailoring; the garment-dye finish hides wear gracefully.' },
    costPerYearNote: '~£50–80 per year of wear over a 12-year life.',
    signaturePieces: ['K-Jacket'],
    archetypes: ['continental', 'relaxed'],
    sizingNote: 'Italian drop-8 blocks run slim; short lengths available — kind to shorter builds.',
    qualityScore: 9,
    naturalMaterials: true,
  },
  {
    brand: 'Suitsupply',
    description: 'Half-canvassed tailoring with in-house alterations — the honest first jacket.',
    country: 'Netherlands',
    founded: 2000,
    priceBand: 'mid',
    priceRangeLabel: 'Mid (£300–500)',
    materials: ['Italian mill wool (Vitale Barberis Canonico, Reda)'],
    construction: 'Half-canvassed as standard',
    constructionQuality: 'Good',
    constructionNote: 'Real canvas construction and real Italian cloth at high-street-adjacent prices.',
    registers: ['Smart-Casual', 'Formal'],
    longevity: { resoleable: false, mendable: true, expectedYears: 8, note: 'Canvassed fronts age properly, unlike fused fast-fashion suits.' },
    costPerYearNote: '~£40–60 per year of wear over an 8-year life.',
    signaturePieces: ['Havana jacket', 'Lazio suit'],
    archetypes: ['relaxed', 'continental'],
    sizingNote: 'Multiple fits and short sizes in-store, with free alterations — very shorter-build-friendly.',
    qualityScore: 7,
    naturalMaterials: true,
  },
  {
    brand: 'Spier & Mackay',
    description: 'Canvassed jackets at mid prices, in several fits including short.',
    country: 'Canada',
    founded: 2012,
    priceBand: 'mid',
    priceRangeLabel: 'Mid (£250–450)',
    materials: ['Italian mill wool', 'Linen'],
    construction: 'Half- and full-canvassed',
    constructionQuality: 'Good',
    constructionNote: 'Full canvas at half the usual price — the menswear-forum favourite for a reason.',
    registers: ['Smart-Casual', 'Formal'],
    longevity: { resoleable: false, mendable: true, expectedYears: 8, note: 'Proper canvassing means proper alterability.' },
    costPerYearNote: '~£35–55 per year of wear over an 8-year life.',
    signaturePieces: ['Contemporary-fit sport coat'],
    archetypes: ['ivy', 'continental', 'relaxed'],
    sizingNote: 'Offers a dedicated short-cut range — one of the few at this price.',
    qualityScore: 7,
    naturalMaterials: true,
  },
  {
    brand: 'Cordings',
    description: 'Piccadilly country tailoring — house tweeds rewoven, not redesigned.',
    country: 'England',
    founded: 1839,
    priceBand: 'upper-mid',
    priceRangeLabel: 'Upper-mid (£350–650)',
    materials: ['House tweed', 'Covert cloth', 'Moleskin'],
    construction: 'Traditional English tailoring',
    constructionQuality: 'Good',
    constructionNote: 'Real provenance — the tweeds are the house\u2019s own, rewoven for decades.',
    registers: ['Smart-Casual', 'Formal'],
    longevity: { resoleable: false, mendable: true, expectedYears: 20, note: 'Country tweed is the most durable tailoring cloth there is.' },
    costPerYearNote: '~£20–35 per year of wear over a 20-year life.',
    signaturePieces: ['Covert coat', 'House tweed jacket'],
    archetypes: ['country'],
    sizingNote: 'Traditional generous English country cut — size down for a modern line.',
    qualityScore: 7,
    naturalMaterials: true,
  },

  // ——— Accessories & bags ———
  {
    brand: 'Equus Leather',
    description: 'Hand-stitched English bridle leather belts, made to measurement.',
    country: 'England',
    founded: 2009,
    priceBand: 'mid',
    priceRangeLabel: 'Mid (£90–180)',
    materials: ['English bridle leather', 'Solid brass'],
    construction: 'Hand-stitched, saddle-stitched',
    constructionQuality: 'Excellent',
    constructionNote: 'Saddle stitching by hand — the strongest construction a belt can have.',
    registers: ['Casual', 'Smart-Casual', 'Formal'],
    longevity: { resoleable: false, mendable: true, expectedYears: 30, note: 'Bridle leather belts are effectively permanent.' },
    costPerYearNote: '~£3–6 per year of wear over a 30-year life.',
    signaturePieces: ['West End bridle belt'],
    archetypes: ['country', 'ivy', 'workwear'],
    sizingNote: 'Made to your actual measurement — no compromise sizing.',
    qualityScore: 9,
    naturalMaterials: true,
  },
  {
    brand: 'Begg x Co',
    description: 'Ayrshire-woven cashmere scarves with a teasel-raised finish.',
    country: 'Scotland',
    founded: 1866,
    priceBand: 'luxury',
    priceRangeLabel: 'Luxury (£200–400)',
    materials: ['Cashmere', 'Lambswool'],
    construction: 'Woven in Ayr, teasel-raised finish',
    constructionQuality: 'Excellent',
    constructionNote: 'The teasel finish gives a softness machine-raising cannot reach.',
    registers: ['Smart-Casual', 'Formal'],
    longevity: { resoleable: false, mendable: false, expectedYears: 20, note: 'A quality scarf is a decades-long companion.' },
    costPerYearNote: '~£10–20 per year of wear over a 20-year life.',
    signaturePieces: ['Arran cashmere scarf'],
    archetypes: ['country', 'continental'],
    sizingNote: 'One size — the Arran is generously long for wrapping.',
    qualityScore: 9,
    naturalMaterials: true,
  },
  {
    brand: 'Sam Hober',
    description: 'Grenadine ties handmade to order, sewn to your length.',
    country: 'Thailand',
    founded: 1997,
    priceBand: 'mid',
    priceRangeLabel: 'Mid (£70–120)',
    materials: ['Grenadine silk', 'Wool challis'],
    construction: 'Handmade to order, hand-slipped',
    constructionQuality: 'Excellent',
    constructionNote: 'One workshop, made to your length and width — bespoke neckwear pricing miracle.',
    registers: ['Formal', 'Smart-Casual'],
    longevity: { resoleable: false, mendable: true, expectedYears: 15, note: 'Hand-slipped ties recover their shape between wears.' },
    costPerYearNote: '~£5–8 per year of wear over a 15-year life.',
    signaturePieces: ['Grenadine grossa tie'],
    archetypes: ['ivy', 'continental'],
    sizingNote: 'Made to your specified length — ideal for shorter or taller frames alike.',
    qualityScore: 9,
    naturalMaterials: true,
  },
  {
    brand: 'Bennett Winch',
    description: 'British-made canvas-and-bridle-leather bags, guaranteed for life.',
    country: 'England',
    founded: 2014,
    priceBand: 'luxury',
    priceRangeLabel: 'Luxury (£400–900)',
    materials: ['Bonded cotton canvas', 'Bridle leather', 'Solid brass'],
    construction: 'British factory make, guaranteed for life',
    constructionQuality: 'Excellent',
    constructionNote: 'Overbuilt in the best way — the lifetime guarantee is rarely needed.',
    registers: ['Casual', 'Smart-Casual'],
    longevity: { resoleable: false, mendable: true, expectedYears: 30, note: 'Lifetime guarantee; the canvas and bridle leather age into character.' },
    costPerYearNote: '~£15–30 per year of use over a 30-year life.',
    signaturePieces: ['S.C Holdall', 'Weekender'],
    archetypes: ['country', 'relaxed'],
    sizingNote: 'n/a — bags; the Weekender meets most airline carry-on limits.',
    qualityScore: 9,
    naturalMaterials: true,
  },
];

// ---------------------------------------------------------------------------
// Catalog lookups & filter option derivation
// ---------------------------------------------------------------------------

/** The primary category each brand is best known for (Discover's filter). */
export const BRAND_CATEGORIES: Record<string, string> = {
  Berwick: 'Shoes', 'Loake 1880': 'Shoes', 'Crockett & Jones': 'Shoes', Carmina: 'Shoes',
  Meermin: 'Shoes', Sanders: 'Shoes', Solovair: 'Shoes', 'Common Projects': 'Shoes',
  Veja: 'Shoes', Astorflex: 'Shoes', 'Rancourt & Co.': 'Shoes',
  Barbour: 'Outerwear', 'Private White V.C.': 'Outerwear', 'Universal Works': 'Outerwear',
  'Le Laboureur': 'Outerwear', 'Alpha Industries': 'Outerwear', Mackintosh: 'Outerwear',
  Valstar: 'Outerwear', Grenfell: 'Outerwear',
  'Jamieson\u2019s of Shetland': 'Knitwear', 'Harley of Scotland': 'Knitwear', 'John Smedley': 'Knitwear',
  'Le Tricoteur': 'Knitwear', 'Inis Me\u00e1in': 'Knitwear', 'Colhay\u2019s': 'Knitwear',
  'Kamakura Shirts': 'Tops', 'Gitman Vermont': 'Tops', 'Drake\u2019s': 'Tops', Sunspel: 'Tops',
  'Saint James': 'Tops', '100Hands': 'Tops',
  Rota: 'Bottoms', 'Berg & Berg': 'Bottoms', Bhode: 'Bottoms', 'Rogue Territory': 'Bottoms',
  'Full Count': 'Bottoms', Uniqlo: 'Bottoms',
  Boglioli: 'Formalwear', Suitsupply: 'Formalwear', 'Spier & Mackay': 'Formalwear', Cordings: 'Formalwear',
  'Equus Leather': 'Accessories', 'Begg x Co': 'Accessories', 'Sam Hober': 'Accessories',
  'Bennett Winch': 'Bags',
};

export function brandCategory(brand: string): string {
  return BRAND_CATEGORIES[brand] || 'Other';
}

/** Case-insensitive catalog lookup. */
export function findCatalogBrand(name: string): BrandProfile | null {
  const q = (name || '').trim().toLowerCase();
  if (!q) return null;
  return (
    BRAND_DIRECTORY.find((b) => b.brand.toLowerCase() === q) ||
    BRAND_DIRECTORY.find((b) => b.brand.toLowerCase().includes(q) || q.includes(b.brand.toLowerCase())) ||
    null
  );
}

/** The Discover filter's category chips, in the app's ONE canonical menswear
 * order (category-order.ts) — the same sequence The Ledger, The Rail and the
 * coverage map run in, rather than a hand-written list of its own. */
export const DISCOVER_CATEGORIES = sortByCategoryOrder(
  ['Tops', 'Bottoms', 'Shoes', 'Outerwear', 'Knitwear', 'Formalwear', 'Accessories', 'Bags'],
  (label) => label,
);

/** Distinct countries in the catalog, for the Discover filter. */
export function catalogCountries(): string[] {
  const seen = new Set<string>();
  for (const b of BRAND_DIRECTORY) seen.add(b.country);
  return [...seen].sort();
}

/** Distinct material keywords, most common first (Discover's material filter). */
export const MATERIAL_KEYWORDS = ['Wool', 'Cotton', 'Leather', 'Suede', 'Linen', 'Cashmere', 'Denim', 'Waxed cotton', 'Silk'];

export function brandMatchesMaterial(b: BrandProfile, keyword: string): boolean {
  const q = keyword.toLowerCase();
  return b.materials.some((m) => m.toLowerCase().includes(q));
}

// ---------------------------------------------------------------------------
// Compare session — the queued brands (max 3), shared across sub-tabs and
// pre-loadable from The Rail's spec sheet ("Compare makers").
// ---------------------------------------------------------------------------

export const MAX_COMPARE = 3;
const COMPARE_KEY = 'ethaion_hunt_compare_v1';

export function readCompareSession(): string[] {
  try {
    const raw = sessionStorage.getItem(COMPARE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((b) => typeof b === 'string' && b.trim()).slice(0, MAX_COMPARE) : [];
  } catch {
    return [];
  }
}

function writeCompareSession(list: string[]): void {
  try {
    sessionStorage.setItem(COMPARE_KEY, JSON.stringify(list.slice(0, MAX_COMPARE)));
  } catch { /* storage unavailable — the event still updates live UIs */ }
  window.dispatchEvent(new CustomEvent('ethaion:compare-changed', { detail: { brands: list } }));
}

/** Queue a brand for Compare. Returns the updated queue (no-op when full or duplicate). */
export function addToCompare(brand: string): string[] {
  const name = (brand || '').trim();
  const current = readCompareSession();
  if (!name || current.some((b) => b.toLowerCase() === name.toLowerCase())) return current;
  if (current.length >= MAX_COMPARE) return current;
  const next = [...current, name];
  writeCompareSession(next);
  return next;
}

export function removeFromCompare(brand: string): string[] {
  const next = readCompareSession().filter((b) => b.toLowerCase() !== (brand || '').trim().toLowerCase());
  writeCompareSession(next);
  return next;
}

export function clearCompare(): void {
  writeCompareSession([]);
}

// ---------------------------------------------------------------------------
// Profile toggle — "Profile on" (Beau reasons with full user context) vs
// "Profile off" (general knowledge only). Persists for the session and
// applies across every Hunt sub-tab.
// ---------------------------------------------------------------------------

const PROFILE_TOGGLE_KEY = 'ethaion_hunt_profile_on';

export function readProfileToggle(): boolean {
  try {
    return sessionStorage.getItem(PROFILE_TOGGLE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function writeProfileToggle(on: boolean): void {
  try {
    sessionStorage.setItem(PROFILE_TOGGLE_KEY, on ? 'on' : 'off');
  } catch { /* storage unavailable — state stays component-local */ }
}

// ---------------------------------------------------------------------------
// Sub-tab handoff — other surfaces (The Rail's "Compare makers") can land
// The Hunt on a specific sub-tab.
// ---------------------------------------------------------------------------

const HUNT_SUBTAB_KEY = 'ethaion_hunt_subtab';

export function setHuntSubTabHandoff(subTab: string): void {
  try {
    sessionStorage.setItem(HUNT_SUBTAB_KEY, subTab);
  } catch { /* storage unavailable */ }
  window.dispatchEvent(new CustomEvent('ethaion:hunt-subtab', { detail: { subTab } }));
}

export function consumeHuntSubTabHandoff(): string | null {
  try {
    const value = sessionStorage.getItem(HUNT_SUBTAB_KEY);
    if (value) sessionStorage.removeItem(HUNT_SUBTAB_KEY);
    return value;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Beau's rating — the one-word judgement every Discover row carries
// (Recommendation Engine overhaul). Derived from the construction-quality
// read every profile (catalog or generated) already carries, so catalog
// brands need no extra model call and user-added brands get theirs at
// generation time.
// ---------------------------------------------------------------------------

export type BeauRating = 'Excellent' | 'Considered' | 'Proceed with caution';

export const BEAU_RATINGS: BeauRating[] = ['Excellent', 'Considered', 'Proceed with caution'];

export function beauRatingFromQuality(quality: string | null | undefined): BeauRating {
  if (quality === 'Excellent') return 'Excellent';
  if (quality === 'Good') return 'Considered';
  return 'Proceed with caution';
}

// ---------------------------------------------------------------------------
// WHY THIS BRAND GOT THIS RATING (Recommendation Engine overhaul, Part 9).
// The label stays the one word it always was; the copy underneath it names
// the signals for THIS maker — how the thing is made, what it is made of,
// whether it can be kept alive — rather than restating what the tier means.
// ---------------------------------------------------------------------------

function endWithStop(text: string): string {
  const clean = (text || '').trim();
  if (!clean) return '';
  return /[.!?…]$/.test(clean) ? clean : `${clean}.`;
}

function upperFirst(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function lowerFirst(text: string): string {
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

/** The hard signals in one phrase: how it is made, what it is made of, and
 * whether it can be kept in service. */
function ratingSignalPhrase(b: BrandProfile): string {
  const parts: string[] = [];
  if (b.construction) parts.push(lowerFirst(b.construction.trim()));
  const material = (b.materials[0] || '').trim();
  if (material) parts.push(`in ${lowerFirst(material)}`);
  const life: string[] = [];
  if (b.longevity.resoleable) life.push('resoleable');
  if (b.longevity.mendable) life.push('repairable');
  if (b.longevity.expectedYears) life.push(`good for about ${b.longevity.expectedYears} years`);
  if (life.length > 0) parts.push(life.join(', '));
  return parts.join(', ');
}

/** The fallback lead when a profile carries no rationale of its own. */
function ratingFallbackLead(b: BrandProfile): string {
  const rating = beauRatingFromQuality(b.constructionQuality);
  if (rating === 'Excellent') return `${b.brand} earns this on the make rather than the name`;
  if (rating === 'Considered') return `${b.brand} is honestly made for what it costs, without pretending to be more`;
  return `Beau can’t see the construction or material signals here that would justify the money`;
}

/**
 * The one- or two-sentence rationale shown beside the rating in the Discover
 * table and on any rating tag: why THIS maker, specifically.
 */
export function beauRatingSummary(b: BrandProfile): string {
  const lead = (b.constructionNote || '').trim() || ratingFallbackLead(b);
  const signal = ratingSignalPhrase(b);
  return [endWithStop(lead), signal ? endWithStop(upperFirst(signal)) : ''].filter(Boolean).join(' ');
}

/** One evidence row on the brand card: the signal, and what it is here. */
export interface RatingEvidence {
  label: string;
  detail: string;
}

/**
 * The signals that earned the rating, itemised — the fuller explanation the
 * brand card opens with when the user taps through from the table.
 */
export function beauRatingEvidence(b: BrandProfile): RatingEvidence[] {
  const rows: RatingEvidence[] = [];
  if (b.construction) {
    rows.push({ label: 'How it’s made', detail: `${b.construction} — Beau reads that as ${b.constructionQuality.toLowerCase()}.` });
  }
  if (b.materials.length > 0) {
    rows.push({ label: 'What it’s made of', detail: b.materials.join(' · ') });
  }
  const life: string[] = [];
  if (b.longevity.resoleable) life.push('resoleable');
  if (b.longevity.mendable) life.push('repairable');
  if (b.longevity.expectedYears) life.push(`about ${b.longevity.expectedYears} years of wear`);
  if (life.length > 0 || b.longevity.note) {
    rows.push({
      label: 'Whether it lasts',
      detail: [upperFirst(life.join(', ')), (b.longevity.note || '').trim()].filter(Boolean).map(endWithStop).join(' '),
    });
  }
  if (b.costPerYearNote) {
    rows.push({ label: 'What that costs', detail: endWithStop(b.costPerYearNote.trim()) });
  }
  if (b.country) {
    rows.push({ label: 'Where it’s made', detail: b.founded ? `${b.country} · est. ${b.founded}` : b.country });
  }
  return rows;
}

/** What the tier itself means, said plainly — shown under the evidence so
 * the mark is never mistaken for a verdict on the whole brand. */
export function beauRatingTierMeaning(rating: BeauRating): string {
  if (rating === 'Excellent') {
    return 'Excellent is Beau’s top mark: the construction, the cloth or leather and the repairability all hold up, so the piece can be kept in service instead of replaced.';
  }
  if (rating === 'Considered') {
    return 'Considered means honestly made and fairly priced for what it is — worth buying with your eyes open, but not the last one you will ever own.';
  }
  return 'Proceed with caution is not a ban. It means the quality signals are thin for the money — buy it for a season, not for a decade, and expect to replace it.';
}

/** Beau's rating for a brand plus its brand-specific rationale. */
export function beauRating(b: BrandProfile): { rating: BeauRating; note: string } {
  return {
    rating: beauRatingFromQuality(b.constructionQuality),
    note: beauRatingSummary(b) || b.longevity.note || 'No rationale recorded.',
  };
}

/** Price tier display for the Discover table: Budget / Mid / Premium / Luxury. */
export const PRICE_TIER_LABELS: Record<PriceBand, string> = {
  accessible: 'Budget',
  mid: 'Mid',
  'upper-mid': 'Premium',
  luxury: 'Luxury',
};

/** Style registers, for the Discover chip bar (multi-select). */
export const REGISTERS: Register[] = ['Casual', 'Smart-Casual', 'Formal'];

/** Construction-method filter options (Discover chip bar). */
export const CONSTRUCTION_METHODS = ['Goodyear welt', 'Hand-sewn', 'Machine-sewn', 'Cemented', 'Woven'];

/** Classify a profile's construction spec phrase into one filter bucket. */
export function constructionMethod(b: BrandProfile): string {
  const c = (b.construction || '').toLowerCase();
  if (c.includes('goodyear')) return 'Goodyear welt';
  if (c.includes('hand')) return 'Hand-sewn';
  if (c.includes('cement') || c.includes('vulcanis')) return 'Cemented';
  if (c.includes('wov') || c.includes('knit')) return 'Woven';
  return 'Machine-sewn';
}

/**
 * The primary-material chips on the Discover filter bar (Recommendation
 * Engine overhaul, Part 8). INDIVIDUAL materials only — there is no
 * "Natural materials only" umbrella chip: it was a parent concept sitting
 * as a peer of its own children, and Ethaion's positioning already implies
 * natural fibres.
 */
export const DISCOVER_MATERIALS = ['Leather', 'Wool', 'Merino', 'Cashmere', 'Cotton', 'Linen', 'Silk'];

/** Material chip matcher — each family covers its named grains and cloths. */
export function brandMatchesDiscoverMaterial(b: BrandProfile, keyword: string): boolean {
  const q = keyword.toLowerCase();
  return b.materials.some((m) => {
    const mat = m.toLowerCase();
    if (mat.includes(q)) return true;
    if (q === 'leather') return /suede|cordovan|calf|nappa|bridle|horween|chromexcel/.test(mat);
    if (q === 'wool') return /merino|cashmere|lambswool|shetland|tweed|flannel|alpaca|worsted|guernsey|geelong|fleece/.test(mat);
    if (q === 'merino') return /extra-fine merino|fine merino|superfine/.test(mat);
    if (q === 'cashmere') return /pashmina/.test(mat);
    if (q === 'cotton') return /oxford|chambray|denim|canvas|moleskin|corduroy|drill|twill|gabardine|ventile|supima|sea island|pique|jersey/.test(mat);
    if (q === 'linen') return /flax/.test(mat);
    if (q === 'silk') return /grenadine|shantung|madder/.test(mat);
    return false;
  });
}

/** The single primary-material signal shown in a Discover table row. */
export function primaryMaterialSignal(b: BrandProfile): string {
  return b.materials[0] || '—';
}

// ---------------------------------------------------------------------------
// Matrix selection — "Add to Matrix" on a Discover row builds a custom
// Matrix view. Session-persistent, same mechanics as the Compare queue.
// ---------------------------------------------------------------------------

export const MAX_MATRIX = 20;
const MATRIX_KEY = 'ethaion_hunt_matrix_v1';

export function readMatrixSession(): string[] {
  try {
    const raw = sessionStorage.getItem(MATRIX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((b) => typeof b === 'string' && b.trim()).slice(0, MAX_MATRIX) : [];
  } catch {
    return [];
  }
}

function writeMatrixSession(list: string[]): void {
  try {
    sessionStorage.setItem(MATRIX_KEY, JSON.stringify(list.slice(0, MAX_MATRIX)));
  } catch { /* storage unavailable — the event still updates live UIs */ }
  window.dispatchEvent(new CustomEvent('ethaion:matrix-changed', { detail: { brands: list } }));
}

export function addToMatrix(brand: string): string[] {
  const name = (brand || '').trim();
  const current = readMatrixSession();
  if (!name || current.some((b) => b.toLowerCase() === name.toLowerCase())) return current;
  if (current.length >= MAX_MATRIX) return current;
  const next = [...current, name];
  writeMatrixSession(next);
  return next;
}

export function removeFromMatrix(brand: string): string[] {
  const next = readMatrixSession().filter((b) => b.toLowerCase() !== (brand || '').trim().toLowerCase());
  writeMatrixSession(next);
  return next;
}

export function clearMatrix(): void {
  writeMatrixSession([]);
}

// ---------------------------------------------------------------------------
// Directory additions — brands beyond the catalog seed, persisted in the
// WorkspaceDB `hunt_directory_brands` table. 'user' rows come from the
// "Don't see a maker?" input (Beau generates the dossier from just the
// name); 'beau' rows are makers Beau surfaced in a Find result. The
// Discover table merges them with BRAND_DIRECTORY and tags each row's
// source: Catalog · You added this · Beau recommended.
// ---------------------------------------------------------------------------

export type BrandSource = 'catalog' | 'user' | 'beau';

export const BRAND_SOURCE_LABELS: Record<BrandSource, string> = {
  catalog: 'Catalog',
  user: 'You added this',
  beau: 'Beau recommended',
};

export interface DirectoryBrandRow {
  id: number;
  brand: string;
  source: 'user' | 'beau';
  profile_json: string | null;
  rating: string | null;
  rating_note: string | null;
  context: string | null;
  created_at?: string;
}

export interface DirectoryEntry {
  profile: BrandProfile;
  source: BrandSource;
  rating: BeauRating;
  ratingNote: string;
}

export function catalogDirectoryEntries(): DirectoryEntry[] {
  return BRAND_DIRECTORY.map((b) => {
    const { rating, note } = beauRating(b);
    return { profile: b, source: 'catalog' as BrandSource, rating, ratingNote: note };
  });
}

export function parseDirectoryRow(row: DirectoryBrandRow): DirectoryEntry | null {
  if (!row?.brand) return null;
  let profile: BrandProfile | null = null;
  if (row.profile_json) {
    try {
      const parsed = JSON.parse(row.profile_json);
      if (parsed && typeof parsed.brand === 'string') profile = parsed as BrandProfile;
    } catch { /* fall through to the stub below */ }
  }
  if (!profile) {
    // A row whose dossier generation hasn't landed yet — a minimal stub
    // keeps the maker visible in the table until Beau's file arrives.
    profile = {
      brand: row.brand,
      description: 'Beau is still pulling the file on this maker.',
      country: '—',
      founded: null,
      priceBand: 'mid',
      priceRangeLabel: '—',
      materials: [],
      construction: '—',
      constructionQuality: 'Adequate',
      constructionNote: '',
      registers: [],
      longevity: { resoleable: false, mendable: false, expectedYears: 5, note: '' },
      costPerYearNote: '',
      signaturePieces: [],
      archetypes: [],
      sizingNote: '',
      qualityScore: 5,
      naturalMaterials: false,
      generated: true,
    };
  }
  const rating: BeauRating = BEAU_RATINGS.includes(row.rating as BeauRating)
    ? (row.rating as BeauRating)
    : beauRatingFromQuality(profile.constructionQuality);
  return {
    profile,
    source: row.source === 'beau' ? 'beau' : 'user',
    rating,
    // The composed rationale wins over the stored one-liner: it names this
    // maker's own construction, materials and lifespan rather than the tier.
    ratingNote: beauRatingSummary(profile) || row.rating_note || '',
  };
}

/** Merge catalog + persisted additions; the catalog wins name collisions. */
export function mergeDirectory(rows: DirectoryBrandRow[] | null | undefined): DirectoryEntry[] {
  const entries = catalogDirectoryEntries();
  const seen = new Set(entries.map((e) => e.profile.brand.toLowerCase()));
  for (const row of rows || []) {
    const entry = parseDirectoryRow(row);
    if (!entry) continue;
    const key = entry.profile.brand.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(entry);
  }
  return entries;
}
