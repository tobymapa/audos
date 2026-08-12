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

/**
 * Dress registers. The ORIGINAL three (Casual / Smart-Casual / Formal) are
 * what every existing maker row and the coverage map's three columns use —
 * they remain valid unchanged. The Index data layer extends the union
 * ADDITIVELY with three more: Black-Tie (evening dress), Business (suited
 * office dress, sharper than Smart-Casual but not evening) and Outdoor-Work
 * (field, workshop and foul-weather dress). Nothing existing narrows.
 */
export type Register =
  | 'Casual'
  | 'Smart-Casual'
  | 'Formal'
  // NEW — additive extension for the Index data layer (do not remove):
  | 'Black-Tie'
  | 'Business'
  | 'Outdoor-Work';

/** Alias used by the garment-type data layer (`reach: RegisterId[]`). */
export type RegisterId = Register;

export interface BrandProfile {
  brand: string;
  /** One line: what they make, who they're for. */
  description: string;
  country: string;
  /** City the maker is based in or known for, e.g. 'Northampton', 'Milan'. */
  city?: string;
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
  /** The ONE garment type this maker is the reference for — seeded from
   * signaturePieces[0] where not set deliberately. */
  referenceFor?: string;
  /** Archetype ids from the nine (profile-data ARCHETYPES). */
  archetypes: string[];
  sizingNote: string;
  /** 1–10 construction/quality score — the Matrix's x axis. */
  qualityScore: number;
  naturalMaterials: boolean;
  /** The maker's official site (https…), when the dossier generation knows
   * it confidently — lets a typed NAME get the same logo/site read a pasted
   * URL does (Discover's dossier-parity fix). */
  websiteUrl?: string | null;
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
  'andersen-andersen': 'https://andersen-andersen.com',
  "howlin'": 'https://howlin-knitwear.com',
  cavour: 'https://cavour.co',
  husbands: 'https://www.husbands-paris.com',
  'fox umbrellas': 'https://www.foxumbrellas.com',
  'simonnot-godard': 'https://www.simonnot-godard.com',
  dents: 'https://www.dents.co.uk',
  pantherella: 'https://www.pantherella.com',
  tusting: 'https://www.tusting.co.uk',
  'globe-trotter': 'https://www.globe-trotter.com',
  ettinger: 'https://www.ettinger.co.uk',
  borsalino: 'https://www.borsalino.com',
  "christys' london": 'https://www.christys-hats.com',
  'laulhère': 'https://www.laulhere-france.com',
  kangol: 'https://www.kangol.com',
  'wigéns': 'https://wigens.se',
  loopwheeler: 'https://www.loopwheeler.co.jp',
  "the real mccoy's": 'https://www.realmccoys.co.jp',
  'camber usa': 'https://camberusa.com',
  'warehouse & co.': 'https://www.ware-house.co.jp',
  champion: 'https://www.champion.com',
  zimmerli: 'https://www.zimmerli.com',
  schiesser: 'https://www.schiesser.com',
  'derek rose': 'https://www.derek-rose.com',
  bresciani: 'https://www.bresciani.it',
  falke: 'https://www.falke.com',
};

/**
 * The official website for a maker — the verified URL when we hold one,
 * otherwise a DuckDuckGo first-result redirect (lands on the brand's own
 * site for any real maker), so a brand tap never dead-ends.
 */
export function brandWebsiteUrl(brandName: string): string {
  const key = (brandName || '').trim().toLowerCase();
  if (BRAND_WEBSITES[key]) return BRAND_WEBSITES[key];
  return searchRedirectFor(brandName);
}

/**
 * The VERIFIED official site for a maker — the catalog URL when we hold
 * one, null otherwise. Unlike brandWebsiteUrl this NEVER falls back to the
 * search redirect, so callers can safely derive a favicon / logo from it
 * (a favicon of the search engine would be worse than no logo at all).
 */
export function verifiedBrandWebsiteUrl(brandName: string): string | null {
  const key = (brandName || '').trim().toLowerCase();
  return BRAND_WEBSITES[key] || null;
}

/** First-result redirect — lands on the official site for any real maker. */
function searchRedirectFor(brandName: string): string {
  return `https://duckduckgo.com/?q=${encodeURIComponent(`\\${brandName} official site`)}`;
}

// ---------------------------------------------------------------------------
// The seed catalog — ~40 verified makers with structured intelligence.
// ---------------------------------------------------------------------------

export const BRAND_DIRECTORY: BrandProfile[] = [
  // ——— Shoes ———
  {
    brand: 'Berwick',
    city: 'Almansa',
    referenceFor: 'Derby shoe',
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
    city: 'Kettering',
    referenceFor: 'Country brogue',
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
    city: 'Northampton',
    referenceFor: 'Oxford shoe',
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
    city: 'Inca',
    referenceFor: 'Penny loafer',
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
    city: 'Inca',
    referenceFor: 'Cap-toe Oxford',
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
    city: 'Rushden',
    referenceFor: 'Chukka boot',
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
    city: 'Wollaston',
    referenceFor: 'Derby boot',
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
    city: 'New York',
    referenceFor: 'Minimal leather sneaker',
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
    city: 'Paris',
    referenceFor: 'Low-profile sneaker',
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
    city: 'Castel d\u2019Ario',
    referenceFor: 'Desert boot',
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
    city: 'Lewiston',
    referenceFor: 'Camp moccasin',
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
    city: 'South Shields',
    referenceFor: 'Waxed field jacket',
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
    city: 'Manchester',
    referenceFor: 'Ventile mac',
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
    city: 'Nottingham',
    referenceFor: 'Chore coat',
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
    city: 'Digoin',
    referenceFor: 'Chore coat',
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
    city: 'Knoxville',
    referenceFor: 'MA-1 bomber',
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
    city: 'Cumbernauld',
    referenceFor: 'Bonded cotton raincoat',
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
    city: 'Milan',
    referenceFor: 'Suede blouson',
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
    city: 'London',
    referenceFor: 'Golfer jacket',
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
    city: 'Sandness',
    referenceFor: 'Shetland crew neck',
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
    city: 'Peebles',
    referenceFor: 'Shetland crew neck',
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
    city: 'Matlock',
    referenceFor: 'Fine-gauge knitted polo',
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
    city: 'Guernsey',
    referenceFor: 'Guernsey sweater',
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
    city: 'Inis Me\u00e1in',
    referenceFor: 'Aran sweater',
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
    city: 'London',
    referenceFor: 'Polo-collar knit',
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
    city: 'Kamakura',
    referenceFor: 'Oxford button-down shirt',
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
    city: 'Ashland',
    referenceFor: 'Oxford button-down shirt',
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
    city: 'London',
    referenceFor: 'Oxford button-down shirt',
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
    city: 'Long Eaton',
    referenceFor: 'Classic T-shirt',
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
    city: 'Saint-James',
    referenceFor: 'Breton shirt',
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
    city: 'Amsterdam',
    referenceFor: 'Dress shirt',
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
    city: 'Rome',
    referenceFor: 'High-rise flannel trouser',
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
    city: 'Stockholm',
    referenceFor: 'Tailored trouser',
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
    city: 'Edinburgh',
    referenceFor: 'Corduroy trouser',
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
    city: 'Los Angeles',
    referenceFor: 'Selvedge jeans',
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
    city: 'Osaka',
    referenceFor: 'Selvedge jeans',
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
    city: 'Tokyo',
    referenceFor: 'Chino',
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
    city: 'Gambara',
    referenceFor: 'Unstructured blazer',
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
    city: 'Amsterdam',
    referenceFor: 'Half-canvassed suit',
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
    city: 'Toronto',
    referenceFor: 'Sport coat',
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
    city: 'London',
    referenceFor: 'Covert coat',
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
    city: 'Bishop Auckland',
    referenceFor: 'Bridle leather belt',
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
    city: 'Ayr',
    referenceFor: 'Cashmere scarf',
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
    city: 'Bangkok',
    referenceFor: 'Grenadine tie',
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
    city: 'London',
    referenceFor: 'Holdall',
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

  // ─── THE MERGE (Data Layer task, Deliverable 5): the BRAND_WEBSITES /
  // brand-reference names promoted to full directory rows, so the maker
  // pool the Index reads is ONE dataset — every entry carries city and
  // referenceFor. ───
  {
    brand: 'Baracuta',
    city: 'Manchester',
    referenceFor: 'Harrington Jacket',
    description: 'The original G9 Harrington — the blouson every other one copies.',
    country: 'England',
    founded: 1937,
    priceBand: 'mid',
    priceRangeLabel: 'Mid (£250–400)',
    materials: ['Cotton-blend gabardine', 'Fraser tartan lining'],
    construction: 'Factory-made, bonded seams at the yoke',
    constructionQuality: 'Good',
    constructionNote: 'The umbrella-vent back and two-button collar are the original spec, still made properly.',
    registers: ['Casual', 'Smart-Casual'],
    longevity: { resoleable: false, mendable: true, expectedYears: 15, note: 'The gabardine wears in, not out; zips replaceable.' },
    costPerYearNote: '~£20–25 per year of wear over a 15-year life.',
    signaturePieces: ['G9 Harrington'],
    archetypes: ['relaxed', 'ivy'],
    sizingNote: 'Cut short and neat at the waist — size up for layering over knitwear.',
    qualityScore: 7,
    naturalMaterials: true,
  },
  {
    brand: 'Paraboot',
    city: 'Izeaux',
    referenceFor: 'Tyrolean shoe',
    description: 'French Norwegian-welted shoes on their own rubber soles since 1927.',
    country: 'France',
    founded: 1908,
    priceBand: 'upper-mid',
    priceRangeLabel: 'Upper-mid (£350–500)',
    materials: ['Full-grain calf', 'Lisse leather', 'Own-make rubber soles'],
    construction: 'Norwegian welt',
    constructionQuality: 'Excellent',
    constructionNote: 'The Norwegian welt is overbuilt for weather — the Michael and Chambord shrug off rain that ruins an Oxford.',
    registers: ['Casual', 'Smart-Casual', 'Outdoor-Work'],
    longevity: { resoleable: true, mendable: true, expectedYears: 20, note: 'Resoleable in-house; the welt outlasts several soles.' },
    costPerYearNote: '~£20–25 per year of wear over a 20-year life with resoles.',
    signaturePieces: ['Michael', 'Chambord', 'Avignon'],
    archetypes: ['country', 'continental', 'workwear'],
    sizingNote: 'Runs roomy — most take a half size down from their UK size.',
    qualityScore: 9,
    naturalMaterials: true,
  },
  {
    brand: 'G.H. Bass',
    city: 'Wilton',
    referenceFor: 'Penny Loafer',
    description: 'The original Weejun — the penny loafer as it was first cut in 1936.',
    country: 'USA',
    founded: 1876,
    priceBand: 'accessible',
    priceRangeLabel: 'Accessible (£100–180)',
    materials: ['Polished leather', 'Leather soles'],
    construction: 'Moccasin construction, machine-sewn',
    constructionQuality: 'Good',
    constructionNote: 'The Larson and Logan Weejuns remain honest shoes at the price; the Made-in-USA line is a clear step up.',
    registers: ['Casual', 'Smart-Casual', 'Business'],
    longevity: { resoleable: true, mendable: true, expectedYears: 8, note: 'Resoleable once or twice; the uppers soften quickly.' },
    costPerYearNote: '~£15–20 per year of wear over an 8-year life.',
    signaturePieces: ['Larson Weejun', 'Logan Weejun'],
    archetypes: ['ivy', 'relaxed'],
    sizingNote: 'Runs long — most take a half size down; the instep is snug at first.',
    qualityScore: 6,
    naturalMaterials: true,
  },
  {
    brand: 'Clarks Originals',
    city: 'Street',
    referenceFor: 'Desert Boot',
    description: 'The desert boot as Nathan Clark drew it in 1950 — crepe sole, two eyelets.',
    country: 'England',
    founded: 1825,
    priceBand: 'accessible',
    priceRangeLabel: 'Accessible (£100–160)',
    materials: ['Suede', 'Natural crepe soles'],
    construction: 'Stitchdown, crepe sole',
    constructionQuality: 'Adequate',
    constructionNote: 'Simple by design — the stitchdown and crepe are the point, not a corner cut.',
    registers: ['Casual'],
    longevity: { resoleable: false, mendable: true, expectedYears: 6, note: 'The crepe wears; cobblers can replace it once.' },
    costPerYearNote: '~£18–25 per year of wear over a 6-year life.',
    signaturePieces: ['Desert Boot', 'Wallabee'],
    archetypes: ['relaxed', 'ivy'],
    sizingNote: 'Runs large — take a half size down; the suede gives.',
    qualityScore: 6,
    naturalMaterials: true,
  },
  {
    brand: 'R.M. Williams',
    city: 'Adelaide',
    referenceFor: 'Chelsea Boot',
    description: 'One-piece-leather Chelsea boots made in Adelaide since 1932.',
    country: 'Australia',
    founded: 1932,
    priceBand: 'upper-mid',
    priceRangeLabel: 'Upper-mid (£400–550)',
    materials: ['Yearling leather', 'Suede', 'Leather and rubber soles'],
    construction: 'One-piece upper, Goodyear welt',
    constructionQuality: 'Excellent',
    constructionNote: 'The single-seam wholecut upper is the house signature — fewer seams, fewer failures.',
    registers: ['Casual', 'Smart-Casual', 'Business'],
    longevity: { resoleable: true, mendable: true, expectedYears: 20, note: 'Factory resole service; the yearling leather ages superbly.' },
    costPerYearNote: '~£22–28 per year of wear over a 20-year life with resoles.',
    signaturePieces: ['Craftsman', 'Comfort Craftsman'],
    archetypes: ['country', 'relaxed'],
    sizingNote: 'UK-based sizing with half sizes and multiple widths — use their width chart.',
    qualityScore: 9,
    naturalMaterials: true,
  },
  {
    brand: 'Morjas',
    city: 'Stockholm',
    referenceFor: 'Horsebit Loafer',
    description: 'Swedish-designed, Spanish-made dress shoes at a direct price.',
    country: 'Sweden',
    founded: 2018,
    priceBand: 'mid',
    priceRangeLabel: 'Mid (£250–350)',
    materials: ['French calf', 'Suede', 'Leather soles'],
    construction: 'Goodyear welt (Almansa)',
    constructionQuality: 'Excellent',
    constructionNote: 'Made in the same Almansa belt as the established Spanish welters, sold without the middleman.',
    registers: ['Smart-Casual', 'Business', 'Formal'],
    longevity: { resoleable: true, mendable: true, expectedYears: 15, note: 'Fully resoleable Goodyear construction.' },
    costPerYearNote: '~£18–22 per year of wear over a 15-year life.',
    signaturePieces: ['The Horsebit', 'The Penny Loafer', 'The Chelsea'],
    archetypes: ['continental', 'relaxed'],
    sizingNote: 'True to UK sizing; the loafer lasts favour a medium-to-narrow foot.',
    qualityScore: 8,
    naturalMaterials: true,
  },
  {
    brand: 'Filson',
    city: 'Seattle',
    referenceFor: 'Mackinaw Cruiser',
    description: 'Outfitters to the Klondike — wool and tin cloth built for decades of field use.',
    country: 'USA',
    founded: 1897,
    priceBand: 'upper-mid',
    priceRangeLabel: 'Upper-mid (£200–500)',
    materials: ['Mackinaw wool', 'Oil-finish tin cloth', 'Bridle leather'],
    construction: 'Overbuilt American factory make',
    constructionQuality: 'Excellent',
    constructionNote: 'The 24-oz Mackinaw wool and tin cloth are the reference cloths for hard outdoor wear.',
    registers: ['Casual', 'Outdoor-Work'],
    longevity: { resoleable: false, mendable: true, expectedYears: 30, note: 'Repairs offered for life; the cloth outlives its owner\u2019s use for it.' },
    costPerYearNote: '~£10–18 per year of wear over a 30-year life.',
    signaturePieces: ['Mackinaw Cruiser', 'Tin Cloth Packer Jacket', 'Original Briefcase'],
    archetypes: ['sportsman', 'workwear'],
    sizingNote: 'Cut generously for layering — many take a size down.',
    qualityScore: 9,
    naturalMaterials: true,
  },
  {
    brand: 'Gloverall',
    city: 'Northampton',
    referenceFor: 'Duffle Coat',
    description: 'The English duffle coat, from the firm that bought the Navy\u2019s surplus.',
    country: 'England',
    founded: 1951,
    priceBand: 'upper-mid',
    priceRangeLabel: 'Upper-mid (£300–450)',
    materials: ['Boiled wool', 'Wooden toggles', 'Jute rope loops'],
    construction: 'English factory make',
    constructionQuality: 'Good',
    constructionNote: 'The Monty and Morris are still cut from proper double-faced wool with real horn-and-rope closures.',
    registers: ['Casual', 'Smart-Casual'],
    longevity: { resoleable: false, mendable: true, expectedYears: 20, note: 'Toggles and loops replaceable; the cloth is nearly indestructible.' },
    costPerYearNote: '~£15–22 per year of wear over a 20-year life.',
    signaturePieces: ['Monty Duffle', 'Morris Duffle', 'Churchill Pea Coat'],
    archetypes: ['ivy', 'country', 'nautical'],
    sizingNote: 'Boxy by design — true to size over knitwear.',
    qualityScore: 8,
    naturalMaterials: true,
  },
  {
    brand: 'Buzz Rickson',
    city: 'Tokyo',
    referenceFor: 'A-2 Flight Jacket',
    description: 'Japanese mil-spec reproduction — flight jackets sewn to the original contracts.',
    country: 'Japan',
    founded: 1993,
    priceBand: 'luxury',
    priceRangeLabel: 'Luxury (£400–900)',
    materials: ['Horsehide', 'Flight nylon', 'Cotton sateen', 'Melton wool'],
    construction: 'Contract-spec reproduction sewing',
    constructionQuality: 'Excellent',
    constructionNote: 'Period looms, period thread counts, period hardware — obsessive fidelity to the military spec.',
    registers: ['Casual'],
    longevity: { resoleable: false, mendable: true, expectedYears: 30, note: 'Built to a wartime spec that assumed abuse.' },
    costPerYearNote: '~£15–30 per year of wear over a 30-year life.',
    signaturePieces: ['A-2 horsehide', 'MA-1 (Lion Uniform spec)', 'N-1 Deck Jacket'],
    archetypes: ['military', 'workwear'],
    sizingNote: 'True military blocks — short in the body, snug in the shoulder; size up once.',
    qualityScore: 9,
    naturalMaterials: true,
  },
  {
    brand: 'OrSlow',
    city: 'Nishinomiya',
    referenceFor: 'Fatigue Pants (OG-107)',
    description: 'Japanese cuts of American military and work classics, softened for now.',
    country: 'Japan',
    founded: 2005,
    priceBand: 'upper-mid',
    priceRangeLabel: 'Upper-mid (£150–350)',
    materials: ['Selvedge denim', 'Cotton sateen', 'Herringbone twill'],
    construction: 'Small-batch Japanese factory make',
    constructionQuality: 'Excellent',
    constructionNote: 'Vintage shuttle-loom cloth cut to patterns that fit a modern civilian — the point of repro without the costume.',
    registers: ['Casual', 'Outdoor-Work'],
    longevity: { resoleable: false, mendable: true, expectedYears: 12, note: 'The sateen and denim fade and mend beautifully.' },
    costPerYearNote: '~£15–25 per year of wear over a 12-year life.',
    signaturePieces: ['US Army Fatigue Pants', '105 Standard Jean', 'US Navy Utility Shirt'],
    archetypes: ['military', 'workwear', 'relaxed'],
    sizingNote: 'Sized 0–5 — check the garment measurements; cuts run relaxed.',
    qualityScore: 9,
    naturalMaterials: true,
  },
  {
    brand: 'Stan Ray',
    city: 'Crockett',
    referenceFor: 'Carpenter Pants',
    description: 'Texas-sewn painter and fatigue pants at honest work prices.',
    country: 'USA',
    founded: 1972,
    priceBand: 'accessible',
    priceRangeLabel: 'Accessible (£70–120)',
    materials: ['Duck canvas', 'Cotton sateen', 'Hickory stripe denim'],
    construction: 'American and Portuguese factory make, triple-stitched seams',
    constructionQuality: 'Good',
    constructionNote: 'Simple work sewing done right — bar tacks and triple stitching where it matters.',
    registers: ['Casual', 'Outdoor-Work'],
    longevity: { resoleable: false, mendable: true, expectedYears: 8, note: 'Duck canvas hardens then softens; easy to patch.' },
    costPerYearNote: '~£10–15 per year of wear over an 8-year life.',
    signaturePieces: ['80s Painter Pant', 'Fatigue Pant', 'Shop Jacket'],
    archetypes: ['workwear', 'military'],
    sizingNote: 'Waist sizes run true; the painter cut is wide through the leg.',
    qualityScore: 7,
    naturalMaterials: true,
  },
  {
    brand: 'Vetra',
    city: 'Paris',
    referenceFor: 'Chore Coat',
    description: 'French work jackets sewn by the same family firm since 1927.',
    country: 'France',
    founded: 1927,
    priceBand: 'accessible',
    priceRangeLabel: 'Accessible (£90–150)',
    materials: ['Cotton drill', 'Moleskin', 'Cotton-linen'],
    construction: 'French factory make',
    constructionQuality: 'Good',
    constructionNote: 'The bleu de travail as it always was — dense drill, workroom sewing, no fashion margin.',
    registers: ['Casual', 'Outdoor-Work'],
    longevity: { resoleable: false, mendable: true, expectedYears: 15, note: 'The drill fades to the blue every workwear brand imitates.' },
    costPerYearNote: '~£7–12 per year of wear over a 15-year life.',
    signaturePieces: ['No.4 Work Jacket', 'Shop Coat'],
    archetypes: ['workwear', 'relaxed'],
    sizingNote: 'French sizing — most take one size down from the conversion chart.',
    qualityScore: 7,
    naturalMaterials: true,
  },
  {
    brand: 'Merz b. Schwanen',
    city: 'Berlin',
    referenceFor: 'Heavyweight Loopwheel T-Shirt',
    description: 'Loopwheeled jersey knitted on 1920s machines in the Swabian Alps.',
    country: 'Germany',
    founded: 1911,
    priceBand: 'mid',
    priceRangeLabel: 'Mid (£60–140)',
    materials: ['Loopwheeled organic cotton', 'Wool-cotton blends'],
    construction: 'Loopwheel knitting, seamless body',
    constructionQuality: 'Excellent',
    constructionNote: 'The original circular looms knit a tube — no side seams, a denser, springier jersey than any modern machine.',
    registers: ['Casual'],
    longevity: { resoleable: false, mendable: true, expectedYears: 10, note: 'Loopwheel jersey holds its collar and shape for years of washing.' },
    costPerYearNote: '~£8–14 per year of wear over a 10-year life.',
    signaturePieces: ['215 Classic Crew Tee', 'Henley 206', 'Sweatpants 3S48'],
    archetypes: ['workwear', 'relaxed'],
    sizingNote: 'Sized by number (4–8); the classic fit is trim — size up for ease.',
    qualityScore: 9,
    naturalMaterials: true,
  },
  {
    brand: 'Lady White Co.',
    city: 'Los Angeles',
    referenceFor: 'Pocket T-Shirt',
    description: 'T-shirts and sweats cut and sewn entirely in Los Angeles.',
    country: 'USA',
    founded: 2014,
    priceBand: 'mid',
    priceRangeLabel: 'Mid (£70–150)',
    materials: ['US-spun cotton jersey', 'Heavyweight fleece'],
    construction: 'Los Angeles cut-and-sew',
    constructionQuality: 'Excellent',
    constructionNote: 'Custom-developed jersey and fleece, sewn locally — the modern reference for a plain white tee.',
    registers: ['Casual'],
    longevity: { resoleable: false, mendable: false, expectedYears: 6, note: 'Heavier jersey than the high street — it keeps its neck.' },
    costPerYearNote: '~£12–18 per year of wear over a 6-year life.',
    signaturePieces: ['Our T-Shirt (2-pack)', 'Balta Pocket Tee', 'Heavyweight Sweatshirt'],
    archetypes: ['relaxed', 'workwear'],
    sizingNote: 'Trim through the shoulder — size up for a relaxed drape.',
    qualityScore: 8,
    naturalMaterials: true,
  },
  {
    brand: 'Luca Faloni',
    city: 'Milan',
    referenceFor: 'Linen Shirt',
    description: 'Italian-made linen, cashmere and silk staples, sold direct.',
    country: 'Italy',
    founded: 2014,
    priceBand: 'upper-mid',
    priceRangeLabel: 'Upper-mid (£150–350)',
    materials: ['Portofino linen', 'Grade-A cashmere', 'Brushed cotton'],
    construction: 'Italian family-factory make',
    constructionQuality: 'Excellent',
    constructionNote: 'Cloth from Albini and Cariaggi sewn in small Italian factories — the quality is in the materials bill.',
    registers: ['Casual', 'Smart-Casual'],
    longevity: { resoleable: false, mendable: true, expectedYears: 8, note: 'The linen softens season on season; cashmere pills lightly then settles.' },
    costPerYearNote: '~£20–35 per year of wear over an 8-year life.',
    signaturePieces: ['Portofino Linen Shirt', 'Cashmere Polo', 'Brushed Cotton Shirt'],
    archetypes: ['riviera', 'continental'],
    sizingNote: 'Slim Italian block — size up if between sizes.',
    qualityScore: 8,
    naturalMaterials: true,
  },
  {
    brand: 'Fred Perry',
    city: 'London',
    referenceFor: 'Piqu\u00e9 Polo Shirt',
    description: 'The twin-tipped M12 piqu\u00e9 shirt — sixty years of British subculture.',
    country: 'England',
    founded: 1952,
    priceBand: 'accessible',
    priceRangeLabel: 'Accessible (£55–110)',
    materials: ['Cotton piqu\u00e9', 'Cotton jersey'],
    construction: 'Factory make; the M12 line still made in England',
    constructionQuality: 'Good',
    constructionNote: 'The Made-in-England M12 keeps the original collar, tipping and weight.',
    registers: ['Casual', 'Smart-Casual'],
    longevity: { resoleable: false, mendable: false, expectedYears: 6, note: 'A dense piqu\u00e9 that holds its collar if washed cold.' },
    costPerYearNote: '~£10–18 per year of wear over a 6-year life.',
    signaturePieces: ['M12 Polo', 'M3600 Polo', 'Harrington J2550'],
    archetypes: ['relaxed', 'ivy'],
    sizingNote: 'Trim through the chest — most size up once.',
    qualityScore: 7,
    naturalMaterials: true,
  },
  {
    brand: 'Orlebar Brown',
    city: 'London',
    referenceFor: 'Swim Shorts',
    description: 'Tailored swim shorts — the side-fastener Bulldog and Setter.',
    country: 'England',
    founded: 2007,
    priceBand: 'upper-mid',
    priceRangeLabel: 'Upper-mid (£150–250)',
    materials: ['Quick-dry polyamide', 'Terry towelling', 'Cotton piqu\u00e9'],
    construction: 'Tailored construction with side fasteners',
    constructionQuality: 'Good',
    constructionNote: 'A swim short built like a trouser — waistband, fasteners and rise taken from tailoring.',
    registers: ['Casual', 'Smart-Casual'],
    longevity: { resoleable: false, mendable: true, expectedYears: 8, note: 'Hardware and seams outlast the season-brand equivalents.' },
    costPerYearNote: '~£18–25 per year of wear over an 8-year life.',
    signaturePieces: ['Bulldog Swim Short', 'Setter Swim Short', 'Terry Polo'],
    archetypes: ['riviera', 'nautical'],
    sizingNote: 'Sized by waist — true to size; the Setter is the shorter cut.',
    qualityScore: 7,
    naturalMaterials: false,
  },
  {
    brand: 'William Lockie',
    city: 'Hawick',
    referenceFor: 'Lambswool Crew Neck',
    description: 'Hawick knitwear — lambswool, camelhair and cashmere since 1874.',
    country: 'Scotland',
    founded: 1874,
    priceBand: 'mid',
    priceRangeLabel: 'Mid (£90–250)',
    materials: ['Geelong lambswool', 'Scottish cashmere', 'Camelhair'],
    construction: 'Fully fashioned, knitted in Hawick',
    constructionQuality: 'Excellent',
    constructionNote: 'Fully fashioned panels linked by hand — the Borders trade at its most honest price.',
    registers: ['Casual', 'Smart-Casual', 'Business'],
    longevity: { resoleable: false, mendable: true, expectedYears: 15, note: 'Lambswool this dense can be de-pilled and darned for decades.' },
    costPerYearNote: '~£8–15 per year of wear over a 15-year life.',
    signaturePieces: ['Leven Lambswool Crew', 'Melrose Cashmere Crew', 'Cricket Sweater'],
    archetypes: ['country', 'ivy'],
    sizingNote: 'Classic Borders block — true to size, honest length in the body.',
    qualityScore: 9,
    naturalMaterials: true,
  },
  {
    brand: 'Johnstons of Elgin',
    city: 'Elgin',
    referenceFor: 'Cashmere Crew Neck',
    description: 'Scotland\u2019s oldest cashmere mill — fibre to finished garment since 1797.',
    country: 'Scotland',
    founded: 1797,
    priceBand: 'luxury',
    priceRangeLabel: 'Luxury (£200–500)',
    materials: ['Cashmere', 'Vicu\u00f1a', 'Merino', 'Camelhair'],
    construction: 'Vertical mill — spun, dyed and knitted in Scotland',
    constructionQuality: 'Excellent',
    constructionNote: 'One of the few true vertical mills left — they control the fibre from raw to finished.',
    registers: ['Smart-Casual', 'Business', 'Formal'],
    longevity: { resoleable: false, mendable: true, expectedYears: 15, note: 'Mill-grade cashmere pills once, settles, then lasts decades.' },
    costPerYearNote: '~£15–35 per year of wear over a 15-year life.',
    signaturePieces: ['Cashmere Crew Neck', 'Cashmere Scarf', 'Camelhair Sweater'],
    archetypes: ['country', 'continental'],
    sizingNote: 'Classic block, true to size.',
    qualityScore: 9,
    naturalMaterials: true,
  },
  {
    brand: 'Anglo-Italian',
    city: 'London',
    referenceFor: 'Flannel Trousers',
    description: 'Marylebone tailoring — English cloth, Neapolitan make, one clear house style.',
    country: 'England',
    founded: 2017,
    priceBand: 'luxury',
    priceRangeLabel: 'Luxury (£300–900)',
    materials: ['Fox Brothers flannel', 'Fresco', 'English tweed'],
    construction: 'Half-canvassed Neapolitan make',
    constructionQuality: 'Excellent',
    constructionNote: 'Ready-to-wear cut to one considered block — the point is the cloth and the line, not the label.',
    registers: ['Smart-Casual', 'Business', 'Formal'],
    longevity: { resoleable: false, mendable: true, expectedYears: 15, note: 'Cloth chosen to be recut and altered as the wearer changes.' },
    costPerYearNote: '~£25–50 per year of wear over a 15-year life.',
    signaturePieces: ['Grey Flannel Trousers', 'Navy Blazer', 'Polo Coat'],
    archetypes: ['continental', 'ivy'],
    sizingNote: 'High rise, gentle taper — the block flatters most frames; alterations expected.',
    qualityScore: 9,
    naturalMaterials: true,
  },
  {
    brand: 'Ring Jacket',
    city: 'Osaka',
    referenceFor: 'Hopsack Blazer',
    description: 'Japanese tailoring — soft-shouldered jackets with hand-finished details.',
    country: 'Japan',
    founded: 1954,
    priceBand: 'luxury',
    priceRangeLabel: 'Luxury (£800–1,400)',
    materials: ['Wool hopsack', 'Fresco', 'Linen-wool blends'],
    construction: 'Full-canvassed, hand-set sleeves',
    constructionQuality: 'Excellent',
    constructionNote: 'Factory tailoring with a bespoke maker\u2019s habits — hand-padded lapels, hand-set sleeves.',
    registers: ['Smart-Casual', 'Business', 'Formal'],
    longevity: { resoleable: false, mendable: true, expectedYears: 20, note: 'Full canvas moulds to the wearer and recovers between wears.' },
    costPerYearNote: '~£50–70 per year of wear over a 20-year life.',
    signaturePieces: ['Model 184 Hopsack Blazer', 'Balloon Wool Suit'],
    archetypes: ['continental', 'ivy'],
    sizingNote: 'Japanese blocks run short and trim — many take one size up from their usual.',
    qualityScore: 9,
    naturalMaterials: true,
  },
  {
    brand: 'Blackhorse Lane Ateliers',
    city: 'London',
    referenceFor: 'Selvedge Jeans',
    description: 'London\u2019s jeans factory — selvedge denim sewn in Walthamstow, repairs for life.',
    country: 'England',
    founded: 2016,
    priceBand: 'mid',
    priceRangeLabel: 'Mid (£160–280)',
    materials: ['Japanese and Turkish selvedge denim', 'Organic cotton'],
    construction: 'Single-unit London make, chainstitched, lifetime repairs',
    constructionQuality: 'Excellent',
    constructionNote: 'A working London atelier — free lifetime repairs are part of the price.',
    registers: ['Casual', 'Outdoor-Work'],
    longevity: { resoleable: false, mendable: true, expectedYears: 12, note: 'Lifetime repair covenant; the denim is chosen to age.' },
    costPerYearNote: '~£15–22 per year of wear over a 12-year life.',
    signaturePieces: ['NW1 Relaxed Jean', 'E5 Slim Jean'],
    archetypes: ['workwear', 'relaxed'],
    sizingNote: 'True to waist; raw pairs stretch half an inch at the waistband.',
    qualityScore: 9,
    naturalMaterials: true,
  },
  {
    brand: 'Lock & Co.',
    city: 'London',
    referenceFor: 'Fedora',
    description: 'The world\u2019s oldest hat shop — St James\u2019s Street since 1676.',
    country: 'England',
    founded: 1676,
    priceBand: 'upper-mid',
    priceRangeLabel: 'Upper-mid (£100–400)',
    materials: ['Fur felt', 'Wool felt', 'Panama straw', 'Tweed'],
    construction: 'Blocked and trimmed by hand',
    constructionQuality: 'Excellent',
    constructionNote: 'Three and a half centuries of blocking — the reference for every city hat shape.',
    registers: ['Smart-Casual', 'Business', 'Formal', 'Black-Tie'],
    longevity: { resoleable: false, mendable: true, expectedYears: 25, note: 'Re-blocking and re-trimming services keep a felt hat alive for decades.' },
    costPerYearNote: '~£8–20 per year of wear over a 25-year life.',
    signaturePieces: ['Chelsea Fedora', 'St James\u2019s Panama', 'Gill Flat Cap'],
    archetypes: ['continental', 'country'],
    sizingNote: 'Measured in cm around the head — use their sizing guide; felt gives slightly.',
    qualityScore: 9,
    naturalMaterials: true,
  },
  {
    brand: 'Frank Clegg',
    city: 'Fall River',
    referenceFor: 'Leather Briefcase',
    description: 'American leather bags benchmade in Massachusetts by one family.',
    country: 'USA',
    founded: 1970,
    priceBand: 'luxury',
    priceRangeLabel: 'Luxury (£600–1,200)',
    materials: ['Vegetable-tanned bridle leather', 'Tumbled grain leather', 'Solid brass'],
    construction: 'Benchmade, hand-edged and hand-stitched details',
    constructionQuality: 'Excellent',
    constructionNote: 'Every bag built by a small Fall River workshop — edges burnished, hardware solid.',
    registers: ['Business', 'Formal', 'Smart-Casual'],
    longevity: { resoleable: false, mendable: true, expectedYears: 30, note: 'Repairs offered indefinitely; the leather improves for decades.' },
    costPerYearNote: '~£25–40 per year of use over a 30-year life.',
    signaturePieces: ['English Briefcase', 'Signature Travel Duffle', 'Zip-Top Portfolio'],
    archetypes: ['ivy', 'continental'],
    sizingNote: 'n/a — bags; the English Briefcase takes a 15-inch laptop.',
    qualityScore: 9,
    naturalMaterials: true,
  },
  {
    brand: 'Finisterre',
    city: 'St Agnes',
    referenceFor: 'Fisherman Smock',
    description: 'Cornish cold-water outdoor wear — built for the sea, worn inland.',
    country: 'England',
    founded: 2003,
    priceBand: 'mid',
    priceRangeLabel: 'Mid (£80–220)',
    materials: ['Organic cotton', 'Recycled technical shells', 'Merino'],
    construction: 'Technical factory make, B Corp supply chain',
    constructionQuality: 'Good',
    constructionNote: 'Honest technical construction with a repairs programme — rare at the price.',
    registers: ['Casual', 'Outdoor-Work'],
    longevity: { resoleable: false, mendable: true, expectedYears: 10, note: 'In-house repairs service; fabrics chosen for salt and abrasion.' },
    costPerYearNote: '~£10–18 per year of wear over a 10-year life.',
    signaturePieces: ['Aion Smock', 'Rainbird Waterproof', 'Westray Jumper'],
    archetypes: ['nautical', 'sportsman'],
    sizingNote: 'Regular outdoor block — true to size over a mid-layer.',
    qualityScore: 7,
    naturalMaterials: false,
  },
  {
    brand: 'Stutterheim',
    city: 'Stockholm',
    referenceFor: 'Rubberised Raincoat',
    description: 'The Swedish fisherman\u2019s raincoat, remade as a city staple.',
    country: 'Sweden',
    founded: 2010,
    priceBand: 'mid',
    priceRangeLabel: 'Mid (£200–300)',
    materials: ['Rubberised cotton', 'Welded seams'],
    construction: 'Rubberised cotton, double-welded seams',
    constructionQuality: 'Good',
    constructionNote: 'Genuinely waterproof the old way — rubber on cloth, seams welded not sewn.',
    registers: ['Casual', 'Smart-Casual'],
    longevity: { resoleable: false, mendable: false, expectedYears: 10, note: 'Rubberised cloth needs no re-proofing — wipe it down and hang it.' },
    costPerYearNote: '~£20–30 per year of wear over a 10-year life.',
    signaturePieces: ['Stockholm Raincoat', 'Arholma Raincoat'],
    archetypes: ['nautical', 'relaxed'],
    sizingNote: 'Boxy A-line cut — most size down for a cleaner line.',
    qualityScore: 7,
    naturalMaterials: false,
  },

  // ——— Knitwear (Index coverage pass — every category carries ten
  //     verified makers minimum) ———
  {
    brand: 'Andersen-Andersen',
    city: 'Copenhagen',
    referenceFor: 'Sailor sweater',
    description: 'Danish sailor knits in dense five-gauge merino — made to outlast the weather.',
    country: 'Denmark',
    founded: 2009,
    priceBand: 'upper-mid',
    priceRangeLabel: 'Upper-mid (£220–420)',
    materials: ['Merino wool'],
    construction: 'Fully-fashioned five-gauge knit, made in Italy',
    constructionQuality: 'Excellent',
    constructionNote: 'Dense, symmetrical knitting — the sweater is identical front and back and wears for decades.',
    registers: ['Casual', 'Outdoor-Work'],
    longevity: { resoleable: false, mendable: true, expectedYears: 20, note: 'Dense merino resists pilling; holes darn invisibly.' },
    costPerYearNote: '~£15–20 per year of wear over a 20-year life.',
    signaturePieces: ['Sailor Sweater', 'Skipper Jacket', 'Sailor Turtleneck'],
    archetypes: ['nautical', 'workwear'],
    sizingNote: 'Dense and true to size — the symmetric cut needs no sizing games.',
    qualityScore: 9,
    naturalMaterials: true,
  },
  {
    brand: "Howlin'",
    city: 'Antwerp',
    referenceFor: 'Shetland crew neck',
    description: 'Belgian-designed, Scottish- and Irish-made knitwear with real colour sense.',
    country: 'Belgium',
    founded: 2010,
    priceBand: 'mid',
    priceRangeLabel: 'Mid (£150–280)',
    materials: ['Shetland wool', 'Lambswool', 'Cotton terry'],
    construction: 'Knitted in Scotland and Ireland',
    constructionQuality: 'Excellent',
    constructionNote: 'Traditional Scottish mills, livelier colours than the mills themselves offer.',
    registers: ['Casual', 'Smart-Casual'],
    longevity: { resoleable: false, mendable: true, expectedYears: 15, note: 'Proper Shetland wool — depill by hand and it keeps going.' },
    costPerYearNote: '~£12–18 per year of wear over a 15-year life.',
    signaturePieces: ['Birth of the Cool sweater', 'Terry shirt', 'Watch cap'],
    archetypes: ['ivy', 'relaxed'],
    sizingNote: 'Relaxed but not oversized — true to size for most.',
    qualityScore: 8,
    naturalMaterials: true,
  },

  // ——— Formalwear (Index coverage pass) ———
  {
    brand: 'De Petrillo',
    city: 'Naples',
    referenceFor: 'Neapolitan sport coat',
    description: 'Neapolitan tailoring house — soft-shouldered jackets with hand-finished detail.',
    country: 'Italy',
    founded: null,
    priceBand: 'luxury',
    priceRangeLabel: 'Luxury (£800–1,500)',
    materials: ['Wool', 'Wool-silk-linen', 'Cashmere'],
    construction: 'Full canvas, hand-padded lapels',
    constructionQuality: 'Excellent',
    constructionNote: 'Genuine Neapolitan make — spalla camicia shoulders, hand-sewn buttonholes.',
    registers: ['Smart-Casual', 'Business', 'Formal'],
    longevity: { resoleable: false, mendable: true, expectedYears: 25, note: 'Full-canvas tailoring recuts and repairs for decades.' },
    costPerYearNote: '~£40–60 per year of wear over a 25-year life.',
    signaturePieces: ['Posillipo jacket', 'Flannel suit', 'Wool-silk-linen sport coat'],
    archetypes: ['continental'],
    sizingNote: 'Neapolitan block — high armholes, soft shoulder; take your true jacket size.',
    qualityScore: 9,
    naturalMaterials: true,
  },
  {
    brand: 'Cavour',
    city: 'Oslo',
    referenceFor: 'Half-canvassed suit',
    description: 'Norwegian-run tailoring label, made in Italy — sharp cloth at honest prices.',
    country: 'Norway',
    founded: 2017,
    priceBand: 'upper-mid',
    priceRangeLabel: 'Upper-mid (£450–900)',
    materials: ['Wool', 'Flannel', 'High-twist wool'],
    construction: 'Half and full canvas, made in Italy',
    constructionQuality: 'Excellent',
    constructionNote: 'Italian factories, classic drape — the value pick in real tailoring.',
    registers: ['Smart-Casual', 'Business', 'Formal'],
    longevity: { resoleable: false, mendable: true, expectedYears: 20, note: 'Canvassed construction takes alteration well.' },
    costPerYearNote: '~£30–45 per year of wear over a 20-year life.',
    signaturePieces: ['Model 2 suit', 'Flannel trousers', 'Polo coat'],
    archetypes: ['continental', 'ivy'],
    sizingNote: 'Classic cut with room in the chest — true to size.',
    qualityScore: 8,
    naturalMaterials: true,
  },
  {
    brand: 'Husbands',
    city: 'Paris',
    referenceFor: 'Double-breasted suit',
    description: 'Paris tailoring with a rock-and-roll line — strong shoulders, long lapels.',
    country: 'France',
    founded: 2011,
    priceBand: 'luxury',
    priceRangeLabel: 'Luxury (£900–1,800)',
    materials: ['Wool', 'Mohair blends', 'Corduroy'],
    construction: 'Full canvas, made in Italy and Portugal',
    constructionQuality: 'Excellent',
    constructionNote: 'A precise, structured silhouette cut against the soft-tailoring tide.',
    registers: ['Business', 'Formal', 'Black-Tie'],
    longevity: { resoleable: false, mendable: true, expectedYears: 20, note: 'Structured canvas holds its line for decades.' },
    costPerYearNote: '~£50–90 per year of wear over a 20-year life.',
    signaturePieces: ['Double-breasted suit', 'Flared trouser', 'Evening jacket'],
    archetypes: ['continental'],
    sizingNote: 'Slim through the waist with a strong shoulder — size up if between.',
    qualityScore: 8,
    naturalMaterials: true,
  },
  {
    brand: 'The Anthology',
    city: 'Hong Kong',
    referenceFor: 'Soft-tailored suit',
    description: 'Hong Kong–London tailoring studio — relaxed drape cut with modern restraint.',
    country: 'Hong Kong',
    founded: 2018,
    priceBand: 'luxury',
    priceRangeLabel: 'Luxury (£800–1,600)',
    materials: ['Wool', 'Linen', 'High-twist wool'],
    construction: 'Full canvas, soft structure',
    constructionQuality: 'Excellent',
    constructionNote: 'Drape-cut chest with a natural shoulder — comfort without slouch.',
    registers: ['Smart-Casual', 'Business', 'Formal'],
    longevity: { resoleable: false, mendable: true, expectedYears: 20, note: 'Full canvas, generous inlays — built to alter.' },
    costPerYearNote: '~£45–80 per year of wear over a 20-year life.',
    signaturePieces: ['Lazyman jacket', 'Drape-cut suit', 'High-twist trousers'],
    archetypes: ['continental', 'relaxed'],
    sizingNote: 'Relaxed drape block — stay true to size; the chest is meant to be easy.',
    qualityScore: 9,
    naturalMaterials: true,
  },

  // ——— Accessories (Index coverage pass) ———
  {
    brand: "Anderson's",
    city: 'Parma',
    referenceFor: 'Woven leather belt',
    description: 'Parma belt-makers since 1966 — the reference for woven and bridle leather belts.',
    country: 'Italy',
    founded: 1966,
    priceBand: 'mid',
    priceRangeLabel: 'Mid (£60–150)',
    materials: ['Bridle leather', 'Woven elastic', 'Suede'],
    construction: 'Hand-finished, made in Parma',
    constructionQuality: 'Excellent',
    constructionNote: 'Full-grain hides, solid brass hardware — belts that outlast the trousers.',
    registers: ['Casual', 'Smart-Casual', 'Business'],
    longevity: { resoleable: false, mendable: true, expectedYears: 15, note: 'Re-stitchable; leather burnishes rather than cracks.' },
    costPerYearNote: '~£5–10 per year of wear over a 15-year life.',
    signaturePieces: ['Woven leather belt', 'Bridle leather belt', 'Suede belt'],
    archetypes: ['continental', 'ivy', 'relaxed'],
    sizingNote: 'Order to trouser waist size plus one — Italian sizing runs exact.',
    qualityScore: 8,
    naturalMaterials: true,
  },
  {
    brand: 'Shibumi Firenze',
    city: 'Florence',
    referenceFor: 'Grenadine tie',
    description: 'Florentine ties, squares and knitwear — quiet classics in first-rate silk.',
    country: 'Italy',
    founded: 2013,
    priceBand: 'mid',
    priceRangeLabel: 'Mid (£80–180)',
    materials: ['Silk', 'Grenadine silk', 'Wool challis'],
    construction: 'Hand-rolled and hand-sewn in Italy',
    constructionQuality: 'Excellent',
    constructionNote: 'Hand-rolled edges and untipped finishes at a price the big houses ignore.',
    registers: ['Smart-Casual', 'Business', 'Formal'],
    longevity: { resoleable: false, mendable: true, expectedYears: 20, note: 'Quality silk re-presses; keep it rolled, not hung.' },
    costPerYearNote: '~£5–9 per year of wear over a 20-year life.',
    signaturePieces: ['Grenadine tie', 'Wool challis tie', 'Linen pocket square'],
    archetypes: ['continental', 'ivy'],
    sizingNote: 'Standard 8cm blade; lengths run classic — ask for long if over 6\'2".',
    qualityScore: 9,
    naturalMaterials: true,
  },
  {
    brand: 'E.G. Cappelli',
    city: 'Naples',
    referenceFor: 'Seven-fold tie',
    description: 'Neapolitan tie-maker — hand-sewn seven-folds the trade itself buys.',
    country: 'Italy',
    founded: 1991,
    priceBand: 'upper-mid',
    priceRangeLabel: 'Upper-mid (£100–180)',
    materials: ['Silk', 'Cashmere', 'Wool'],
    construction: 'Hand-sewn in Naples',
    constructionQuality: 'Excellent',
    constructionNote: 'Every tie cut and sewn by hand — the seven-fold is the house signature.',
    registers: ['Business', 'Formal', 'Black-Tie'],
    longevity: { resoleable: false, mendable: true, expectedYears: 25, note: 'A hand-sewn tie can be re-slipped and pressed for decades.' },
    costPerYearNote: '~£4–8 per year of wear over a 25-year life.',
    signaturePieces: ['Seven-fold silk tie', 'Printed ancient-madder tie', 'Cashmere tie'],
    archetypes: ['continental'],
    sizingNote: 'Made to order in any length and blade width — say what you wear.',
    qualityScore: 9,
    naturalMaterials: true,
  },
  {
    brand: 'Fox Umbrellas',
    city: 'Croydon',
    referenceFor: 'Gentleman\u2019s umbrella',
    description: 'English umbrella-makers since 1868 — one-piece sticks and proper canopies.',
    country: 'England',
    founded: 1868,
    priceBand: 'upper-mid',
    priceRangeLabel: 'Upper-mid (£150–400)',
    materials: ['Nylon canopy', 'Malacca cane', 'Maple, chestnut'],
    construction: 'Hand-assembled frames, made in England',
    constructionQuality: 'Excellent',
    constructionNote: 'Frames re-covered and re-ribbed in-house — an umbrella for life, not a season.',
    registers: ['Business', 'Formal'],
    longevity: { resoleable: false, mendable: true, expectedYears: 30, note: 'Fully repairable in the Croydon workshop.' },
    costPerYearNote: '~£5–13 per year over a 30-year life.',
    signaturePieces: ['Solid-stick umbrella', 'Whangee-handle umbrella', 'Telescopic umbrella'],
    archetypes: ['ivy', 'continental'],
    sizingNote: 'Solid sticks are sized to height — state yours when ordering.',
    qualityScore: 9,
    naturalMaterials: true,
  },
  {
    brand: 'Simonnot-Godard',
    city: 'Paris',
    referenceFor: 'Pocket square',
    description: 'Parisian weavers since 1787 — the finest woven cotton squares there are.',
    country: 'France',
    founded: 1787,
    priceBand: 'mid',
    priceRangeLabel: 'Mid (£50–120)',
    materials: ['Woven cotton', 'Linen'],
    construction: 'Hand-rolled hems, woven in France',
    constructionQuality: 'Excellent',
    constructionNote: 'Woven (never printed) patterns with hand-rolled edges — the trade standard.',
    registers: ['Smart-Casual', 'Business', 'Formal'],
    longevity: { resoleable: false, mendable: false, expectedYears: 20, note: 'Woven cotton launders for decades without fading.' },
    costPerYearNote: '~£3–6 per year of wear over a 20-year life.',
    signaturePieces: ['White cotton square', 'Woven-check square', 'Handkerchief'],
    archetypes: ['continental', 'ivy'],
    sizingNote: 'One size — 42cm squares that sit properly in a breast pocket.',
    qualityScore: 9,
    naturalMaterials: true,
  },
  {
    brand: 'Dents',
    city: 'Warminster',
    referenceFor: 'Leather gloves',
    description: 'English glove-makers since 1777 — hairsheep leather cut by hand.',
    country: 'England',
    founded: 1777,
    priceBand: 'mid',
    priceRangeLabel: 'Mid (£70–180)',
    materials: ['Hairsheep leather', 'Peccary', 'Cashmere lining'],
    construction: 'Table-cut, hand-sewn on the top lines',
    constructionQuality: 'Excellent',
    constructionNote: 'The heritage lines are still table-cut by hand in Warminster.',
    registers: ['Smart-Casual', 'Business', 'Formal'],
    longevity: { resoleable: false, mendable: true, expectedYears: 15, note: 'Resewable seams; leather feeds and lasts.' },
    costPerYearNote: '~£5–12 per year over a 15-year life.',
    signaturePieces: ['Cashmere-lined hairsheep gloves', 'Peccary gloves', 'Driving gloves'],
    archetypes: ['country', 'continental'],
    sizingNote: 'Measure around the knuckles in inches — that number is your glove size.',
    qualityScore: 8,
    naturalMaterials: true,
  },
  {
    brand: 'Pantherella',
    city: 'Leicester',
    referenceFor: 'Fine-gauge socks',
    description: 'Leicester sock-makers since 1937 — fine-gauge English socks with hand-linked toes.',
    country: 'England',
    founded: 1937,
    priceBand: 'accessible',
    priceRangeLabel: 'Accessible (£15–40)',
    materials: ['Merino wool', 'Sea Island cotton', 'Cashmere'],
    construction: 'Fine-gauge knit, hand-linked toes',
    constructionQuality: 'Excellent',
    constructionNote: 'Hand-linked toe seams — no ridge, no rub; knitted in Leicester.',
    registers: ['Smart-Casual', 'Business', 'Formal'],
    longevity: { resoleable: false, mendable: false, expectedYears: 5, note: 'Fine gauge wears honestly; buy in pairs and rotate.' },
    costPerYearNote: '~£4–8 per year across a rotation.',
    signaturePieces: ['Merino ribbed socks', 'Sea Island cotton socks', 'Cashmere socks'],
    archetypes: ['ivy', 'continental'],
    sizingNote: 'Sized by shoe size bands — true to the stated range.',
    qualityScore: 8,
    naturalMaterials: true,
  },

  // ——— Bags (Index coverage pass) ———
  {
    brand: 'Chapman Bags',
    city: 'Carlisle',
    referenceFor: 'Canvas game bag',
    description: 'Cumbrian bag-makers — waxed canvas and bridle leather, sewn in Carlisle.',
    country: 'England',
    founded: 1990,
    priceBand: 'mid',
    priceRangeLabel: 'Mid (£150–400)',
    materials: ['Waxed cotton canvas', 'Bridle leather', 'Solid brass'],
    construction: 'Bench-made in Carlisle, England',
    constructionQuality: 'Excellent',
    constructionNote: 'Field-sports construction carried into everyday bags — nothing skimped.',
    registers: ['Casual', 'Outdoor-Work', 'Smart-Casual'],
    longevity: { resoleable: false, mendable: true, expectedYears: 20, note: 'Repairs done in the workshop that made it.' },
    costPerYearNote: '~£8–20 per year over a 20-year life.',
    signaturePieces: ['Game bag', 'Fishing bag', 'Canvas briefcase'],
    archetypes: ['country', 'sportsman'],
    sizingNote: 'One size per model — check litre capacity against your carry.',
    qualityScore: 8,
    naturalMaterials: true,
  },
  {
    brand: 'Mismo',
    city: 'Copenhagen',
    referenceFor: 'Canvas briefcase',
    description: 'Danish bags in tight-woven canvas and vegetable-tanned leather — quiet and exact.',
    country: 'Denmark',
    founded: 2003,
    priceBand: 'upper-mid',
    priceRangeLabel: 'Upper-mid (£300–600)',
    materials: ['Cotton canvas', 'Vegetable-tanned leather'],
    construction: 'European-made, bonded seams',
    constructionQuality: 'Excellent',
    constructionNote: 'Scandinavian restraint with real materials — no logos, no shortcuts.',
    registers: ['Smart-Casual', 'Business'],
    longevity: { resoleable: false, mendable: true, expectedYears: 15, note: 'Leather trim replaceable; canvas ages evenly.' },
    costPerYearNote: '~£20–40 per year over a 15-year life.',
    signaturePieces: ['M/S Backpack', 'M/S Briefcase', 'Weekender'],
    archetypes: ['continental', 'relaxed'],
    sizingNote: 'One size per model — the briefcase takes a 15-inch laptop.',
    qualityScore: 8,
    naturalMaterials: true,
  },
  {
    brand: 'Croots',
    city: 'Malton',
    referenceFor: 'Leather holdall',
    description: 'Yorkshire field-sports leatherwork — bridle hide and waxed canvas, made in-house.',
    country: 'England',
    founded: 1978,
    priceBand: 'upper-mid',
    priceRangeLabel: 'Upper-mid (£250–700)',
    materials: ['Bridle leather', 'Waxed canvas', 'Solid brass'],
    construction: 'Bench-made in Yorkshire',
    constructionQuality: 'Excellent',
    constructionNote: 'Gun-slip construction standards applied to travel bags.',
    registers: ['Casual', 'Smart-Casual', 'Outdoor-Work'],
    longevity: { resoleable: false, mendable: true, expectedYears: 25, note: 'Workshop repairs; bridle hide improves with decades.' },
    costPerYearNote: '~£10–28 per year over a 25-year life.',
    signaturePieces: ['Vintage leather holdall', 'Waxed canvas holdall', 'Cartridge bag'],
    archetypes: ['country', 'sportsman'],
    sizingNote: 'One size per model — the small holdall meets carry-on limits.',
    qualityScore: 9,
    naturalMaterials: true,
  },
  {
    brand: 'Brady Bags',
    city: 'Walsall',
    referenceFor: 'Fishing bag',
    description: 'West Midlands bag-makers since 1877 — the original English canvas fishing bag.',
    country: 'England',
    founded: 1877,
    priceBand: 'mid',
    priceRangeLabel: 'Mid (£120–300)',
    materials: ['Cotton canvas', 'Bridle leather', 'Brass'],
    construction: 'Made in Walsall, England',
    constructionQuality: 'Excellent',
    constructionNote: 'The Ariel Trout bag has been in continuous production for a century.',
    registers: ['Casual', 'Outdoor-Work'],
    longevity: { resoleable: false, mendable: true, expectedYears: 25, note: 'Straps and buckles replaceable; canvas re-proofs.' },
    costPerYearNote: '~£5–12 per year over a 25-year life.',
    signaturePieces: ['Ariel Trout bag', 'Gelderburn bag', 'Small game bag'],
    archetypes: ['country', 'sportsman'],
    sizingNote: 'One size per model — the Ariel Trout suits daily carry.',
    qualityScore: 8,
    naturalMaterials: true,
  },
  {
    brand: 'Tusting',
    city: 'Lavendon',
    referenceFor: 'Leather briefcase',
    description: 'Family leather-goods makers since 1875 — English briefcases and holdalls.',
    country: 'England',
    founded: 1875,
    priceBand: 'upper-mid',
    priceRangeLabel: 'Upper-mid (£300–700)',
    materials: ['Full-grain leather', 'Waxed canvas'],
    construction: 'Made in Buckinghamshire, England',
    constructionQuality: 'Excellent',
    constructionNote: 'Five generations of the same family cutting English hides.',
    registers: ['Smart-Casual', 'Business'],
    longevity: { resoleable: false, mendable: true, expectedYears: 25, note: 'In-house repair service; hardware replaceable.' },
    costPerYearNote: '~£12–28 per year over a 25-year life.',
    signaturePieces: ['Marston briefcase', 'Weekender holdall', 'Explorer backpack'],
    archetypes: ['country', 'continental'],
    sizingNote: 'One size per model — check laptop sleeve dimensions.',
    qualityScore: 8,
    naturalMaterials: true,
  },
  {
    brand: 'Globe-Trotter',
    city: 'London',
    referenceFor: 'Suitcase',
    description: 'English luggage since 1897 — vulcanised fibreboard cases built in Hertfordshire.',
    country: 'England',
    founded: 1897,
    priceBand: 'luxury',
    priceRangeLabel: 'Luxury (£1,000–2,500)',
    materials: ['Vulcanised fibreboard', 'Leather corners and straps'],
    construction: 'Handmade in Hertfordshire on Victorian machinery',
    constructionQuality: 'Excellent',
    constructionNote: 'The same vulcanised board and hand-riveting as a century ago.',
    registers: ['Business', 'Formal'],
    longevity: { resoleable: false, mendable: true, expectedYears: 40, note: 'Fully refurbishable — corners, handles and linings all replace.' },
    costPerYearNote: '~£25–60 per year over a 40-year life.',
    signaturePieces: ['Original suitcase', 'Centenary carry-on', 'Attaché case'],
    archetypes: ['continental', 'ivy'],
    sizingNote: 'Carry-on sizes meet airline limits — check the 20-inch for strict carriers.',
    qualityScore: 9,
    naturalMaterials: true,
  },
  {
    brand: 'Ettinger',
    city: 'London',
    referenceFor: 'Leather wallet',
    description: 'London leather goods since 1934 — bridle hide wallets and cases, Royal Warrant held.',
    country: 'England',
    founded: 1934,
    priceBand: 'upper-mid',
    priceRangeLabel: 'Upper-mid (£150–500)',
    materials: ['Bridle leather', 'Calf leather'],
    construction: 'Made in Walsall, England',
    constructionQuality: 'Excellent',
    constructionNote: 'Hand-finished edges and turned seams — small goods made properly.',
    registers: ['Smart-Casual', 'Business', 'Formal'],
    longevity: { resoleable: false, mendable: true, expectedYears: 20, note: 'Bridle hide hardens handsomely; stitching repairable.' },
    costPerYearNote: '~£8–25 per year over a 20-year life.',
    signaturePieces: ['Bridle hide billfold', 'Card case', 'Document case'],
    archetypes: ['continental', 'ivy'],
    sizingNote: 'One size per model — the billfold takes eight cards comfortably.',
    qualityScore: 9,
    naturalMaterials: true,
  },
  {
    brand: 'Swaine Adeney Brigg',
    city: 'London',
    referenceFor: 'Attaché case',
    description: 'London\u2019s oldest luxury leather house — attaché cases and umbrellas since 1750.',
    country: 'England',
    founded: 1750,
    priceBand: 'luxury',
    priceRangeLabel: 'Luxury (£800–3,000)',
    materials: ['Bridle leather', 'Oak-tanned hide', 'Malacca cane'],
    construction: 'Handmade in Cambridge, England',
    constructionQuality: 'Excellent',
    constructionNote: 'The attaché case is still built over a wooden frame by hand.',
    registers: ['Business', 'Formal'],
    longevity: { resoleable: false, mendable: true, expectedYears: 50, note: 'A generational object — the workshop restores its own work.' },
    costPerYearNote: '~£16–60 per year over a 50-year life.',
    signaturePieces: ['Attaché case', 'Brigg umbrella', 'Whisky flask'],
    archetypes: ['continental'],
    sizingNote: 'Made to order — specify case depth and fittings.',
    qualityScore: 10,
    naturalMaterials: true,
  },

  // ——— Hats & headwear (Index coverage pass) ———
  {
    brand: 'Borsalino',
    city: 'Alessandria',
    referenceFor: 'Fedora',
    description: 'The Italian felt-hat house since 1857 — the fedora other fedoras copy.',
    country: 'Italy',
    founded: 1857,
    priceBand: 'luxury',
    priceRangeLabel: 'Luxury (£200–500)',
    materials: ['Fur felt', 'Panama straw'],
    construction: 'Felted and blocked in Alessandria',
    constructionQuality: 'Excellent',
    constructionNote: 'Seven-week felting process unchanged since the nineteenth century.',
    registers: ['Smart-Casual', 'Business', 'Formal'],
    longevity: { resoleable: false, mendable: true, expectedYears: 25, note: 'A fur-felt hat re-blocks and re-bands for decades.' },
    costPerYearNote: '~£8–20 per year over a 25-year life.',
    signaturePieces: ['Classic fedora', 'Panama fine', 'Trilby'],
    archetypes: ['continental'],
    sizingNote: 'Measure the head circumference in cm — Italian sizing is exact.',
    qualityScore: 9,
    naturalMaterials: true,
  },
  {
    brand: "Christys' London",
    city: 'Witney',
    referenceFor: 'Felt trilby',
    description: 'English hatters since 1773 — fur felts, panamas and proper flat caps.',
    country: 'England',
    founded: 1773,
    priceBand: 'mid',
    priceRangeLabel: 'Mid (£80–250)',
    materials: ['Fur felt', 'Wool felt', 'Panama straw'],
    construction: 'Blocked in England',
    constructionQuality: 'Excellent',
    constructionNote: 'One of the last English factories still blocking felt by hand.',
    registers: ['Smart-Casual', 'Business', 'Formal'],
    longevity: { resoleable: false, mendable: true, expectedYears: 20, note: 'Re-blockable; sweatbands replaceable.' },
    costPerYearNote: '~£4–13 per year over a 20-year life.',
    signaturePieces: ['Fur felt trilby', 'Panama', 'Bakerboy cap'],
    archetypes: ['country', 'ivy'],
    sizingNote: 'English hat sizes — measure in inches or use the cm chart.',
    qualityScore: 8,
    naturalMaterials: true,
  },
  {
    brand: 'Stetson',
    city: 'Garland',
    referenceFor: 'Western hat',
    description: 'The American hat since 1865 — westerns, fedoras and newsboy caps.',
    country: 'USA',
    founded: 1865,
    priceBand: 'mid',
    priceRangeLabel: 'Mid (£70–300)',
    materials: ['Fur felt', 'Wool felt', 'Straw'],
    construction: 'Blocked in the USA and Europe under licence',
    constructionQuality: 'Good',
    constructionNote: 'The classic open-road and whippet blocks remain first-rate fur felt.',
    registers: ['Casual', 'Smart-Casual', 'Outdoor-Work'],
    longevity: { resoleable: false, mendable: true, expectedYears: 20, note: 'Fur-felt lines re-block; wool lines are honest wear.' },
    costPerYearNote: '~£4–15 per year over a 20-year life.',
    signaturePieces: ['Open Road', 'Whippet fedora', 'Hatteras newsboy'],
    archetypes: ['sportsman', 'workwear'],
    sizingNote: 'US sizing — between sizes, take the larger; felt settles in.',
    qualityScore: 7,
    naturalMaterials: true,
  },
  {
    brand: 'Laulhère',
    city: 'Oloron-Sainte-Marie',
    referenceFor: 'Basque beret',
    description: 'The last true French beret-maker — milled in Béarn since 1840.',
    country: 'France',
    founded: 1840,
    priceBand: 'mid',
    priceRangeLabel: 'Mid (£60–120)',
    materials: ['Merino wool', 'Cashmere blends'],
    construction: 'Knitted, felted and blocked in France',
    constructionQuality: 'Excellent',
    constructionNote: 'The genuine article — one continuous felted knit, no seams.',
    registers: ['Casual', 'Smart-Casual'],
    longevity: { resoleable: false, mendable: false, expectedYears: 15, note: 'Felted merino holds shape; brush, never wash hot.' },
    costPerYearNote: '~£4–8 per year over a 15-year life.',
    signaturePieces: ['Béret véritable', 'Campan beret', 'Cashmere beret'],
    archetypes: ['continental', 'military'],
    sizingNote: 'Sized by head circumference — the fit should be snug, worn broken-in.',
    qualityScore: 9,
    naturalMaterials: true,
  },
  {
    brand: 'Bates Gentlemen\u2019s Hatter',
    city: 'London',
    referenceFor: 'Flat cap',
    description: 'Jermyn Street hatters since 1898 — caps and felts fitted properly.',
    country: 'England',
    founded: 1898,
    priceBand: 'mid',
    priceRangeLabel: 'Mid (£70–200)',
    materials: ['Tweed', 'Fur felt', 'Panama straw'],
    construction: 'English and Italian workshops, fitted in London',
    constructionQuality: 'Excellent',
    constructionNote: 'A proper hatter\u2019s fitting — the cap arrives the right size, not roughly so.',
    registers: ['Smart-Casual', 'Business', 'Formal'],
    longevity: { resoleable: false, mendable: true, expectedYears: 15, note: 'Sweatbands and linings replaced in-house.' },
    costPerYearNote: '~£5–13 per year over a 15-year life.',
    signaturePieces: ['Tweed flat cap', 'Poet trilby', 'Panama'],
    archetypes: ['country', 'ivy'],
    sizingNote: 'Fitted to the measured head — give the circumference in cm.',
    qualityScore: 8,
    naturalMaterials: true,
  },
  {
    brand: 'Failsworth',
    city: 'Manchester',
    referenceFor: 'Harris Tweed cap',
    description: 'Manchester cap-makers since 1903 — honest English caps at fair money.',
    country: 'England',
    founded: 1903,
    priceBand: 'accessible',
    priceRangeLabel: 'Accessible (£30–90)',
    materials: ['Harris Tweed', 'Wool', 'Waxed cotton'],
    construction: 'Cut and sewn in England',
    constructionQuality: 'Good',
    constructionNote: 'Genuine Harris Tweed cloth on classic eight-piece and flat blocks.',
    registers: ['Casual', 'Outdoor-Work'],
    longevity: { resoleable: false, mendable: false, expectedYears: 10, note: 'Tweed wears hard; the cap fades with dignity.' },
    costPerYearNote: '~£3–9 per year over a 10-year life.',
    signaturePieces: ['Harris Tweed flat cap', 'Eight-piece bakerboy', 'Wax cap'],
    archetypes: ['country', 'workwear'],
    sizingNote: 'UK sizing in cm — true to the chart.',
    qualityScore: 7,
    naturalMaterials: true,
  },
  {
    brand: 'Wigéns',
    city: 'Tranås',
    referenceFor: 'Wool cap',
    description: 'Swedish hat-makers since 1906 — clean Scandinavian caps built for cold.',
    country: 'Sweden',
    founded: 1906,
    priceBand: 'mid',
    priceRangeLabel: 'Mid (£70–150)',
    materials: ['Wool', 'Loden', 'Gore-Tex linings'],
    construction: 'Made in Tranås, Sweden',
    constructionQuality: 'Excellent',
    constructionNote: 'Northern-winter engineering — ear flaps that vanish into the band.',
    registers: ['Casual', 'Smart-Casual', 'Outdoor-Work'],
    longevity: { resoleable: false, mendable: false, expectedYears: 12, note: 'Dense loden sheds weather for years.' },
    costPerYearNote: '~£6–13 per year over a 12-year life.',
    signaturePieces: ['Loden cap', 'Earflap cap', 'Watch cap'],
    archetypes: ['continental', 'sportsman'],
    sizingNote: 'European cm sizing — exact to the chart.',
    qualityScore: 8,
    naturalMaterials: true,
  },
  {
    brand: 'Kangol',
    city: 'Cleator',
    referenceFor: '504 cap',
    description: 'The Cumbrian cap since 1938 — the 504 shape is the modern classic.',
    country: 'England',
    founded: 1938,
    priceBand: 'accessible',
    priceRangeLabel: 'Accessible (£40–90)',
    materials: ['Wool', 'Tropic knit'],
    construction: 'Knitted and blocked caps',
    constructionQuality: 'Good',
    constructionNote: 'The seamless knitted 504 has been in production since 1954.',
    registers: ['Casual'],
    longevity: { resoleable: false, mendable: false, expectedYears: 8, note: 'Knitted wool keeps its block with basic care.' },
    costPerYearNote: '~£5–11 per year over an 8-year life.',
    signaturePieces: ['504 wool cap', 'Tropic 504', 'Wool beret'],
    archetypes: ['relaxed', 'workwear'],
    sizingNote: 'S–XL banding — between sizes, take the larger.',
    qualityScore: 7,
    naturalMaterials: true,
  },
  {
    brand: 'Cableami',
    city: 'Tokyo',
    referenceFor: 'Knitted watch cap',
    description: 'Japanese headwear studio — caps and hats in unusually good cloth.',
    country: 'Japan',
    founded: null,
    priceBand: 'mid',
    priceRangeLabel: 'Mid (£50–120)',
    materials: ['Wool', 'Linen', 'Paper braid'],
    construction: 'Made in Japan',
    constructionQuality: 'Excellent',
    constructionNote: 'Fabric-first design — the cloth would grace a jacket.',
    registers: ['Casual', 'Smart-Casual'],
    longevity: { resoleable: false, mendable: false, expectedYears: 10, note: 'Quality fibres age evenly.' },
    costPerYearNote: '~£5–12 per year over a 10-year life.',
    signaturePieces: ['Boiled-wool watch cap', 'Linen bucket hat', 'Paper braid hat'],
    archetypes: ['relaxed', 'workwear'],
    sizingNote: 'Mostly one-size with adjusters — generous on larger heads.',
    qualityScore: 8,
    naturalMaterials: true,
  },

  // ——— Sweatshirts (Index coverage pass) ———
  {
    brand: 'Loopwheeler',
    city: 'Tokyo',
    referenceFor: 'Loopwheeled sweatshirt',
    description: 'Tokyo\u2019s loopwheel specialists — sweats knitted metres a day on vintage machines.',
    country: 'Japan',
    founded: 1999,
    priceBand: 'mid',
    priceRangeLabel: 'Mid (£120–220)',
    materials: ['Loopwheeled cotton'],
    construction: 'Loopwheel-knitted, sewn in Japan',
    constructionQuality: 'Excellent',
    constructionNote: 'True loopwheel fabric — no side seams, a metre an hour, unmatched hand.',
    registers: ['Casual'],
    longevity: { resoleable: false, mendable: true, expectedYears: 15, note: 'Loopwheel cotton tightens and improves with washing.' },
    costPerYearNote: '~£8–15 per year over a 15-year life.',
    signaturePieces: ['LW light crewneck', 'LW heavy hoodie', 'Zip sweat'],
    archetypes: ['workwear', 'relaxed'],
    sizingNote: 'Japanese sizing — most size up one from their usual.',
    qualityScore: 9,
    naturalMaterials: true,
  },
  {
    brand: "The Real McCoy's",
    city: 'Kobe',
    referenceFor: 'Military sweatshirt',
    description: 'Kobe\u2019s obsessive reproduction house — sweats and military knits remade exactly.',
    country: 'Japan',
    founded: 1980,
    priceBand: 'luxury',
    priceRangeLabel: 'Luxury (£200–400)',
    materials: ['Loopwheeled cotton', 'Wool fleece'],
    construction: 'Loopwheel-knitted, made in Japan',
    constructionQuality: 'Excellent',
    constructionNote: 'Period-correct yarns, machines and patterns — reproduction as scholarship.',
    registers: ['Casual'],
    longevity: { resoleable: false, mendable: true, expectedYears: 20, note: 'Heavyweight loopwheel outlasts everything around it.' },
    costPerYearNote: '~£10–20 per year over a 20-year life.',
    signaturePieces: ['10oz loopwheel sweatshirt', 'Military crew', 'After-hooded sweat'],
    archetypes: ['military', 'workwear'],
    sizingNote: 'Vintage blocks run trim — size up for a modern fit.',
    qualityScore: 9,
    naturalMaterials: true,
  },
  {
    brand: 'Camber USA',
    city: 'Norristown',
    referenceFor: 'Heavyweight hoodie',
    description: 'Pennsylvania knitting mill — the heaviest honest sweats made in America.',
    country: 'USA',
    founded: 1948,
    priceBand: 'accessible',
    priceRangeLabel: 'Accessible (£60–130)',
    materials: ['12oz cross-knit cotton fleece'],
    construction: 'Knitted and sewn in Pennsylvania',
    constructionQuality: 'Excellent',
    constructionNote: 'The 12oz Cross-Knit is the benchmark heavyweight fleece.',
    registers: ['Casual', 'Outdoor-Work'],
    longevity: { resoleable: false, mendable: true, expectedYears: 15, note: 'Workwear-grade fleece — shrugs off a decade of winters.' },
    costPerYearNote: '~£4–9 per year over a 15-year life.',
    signaturePieces: ['Cross-Knit hoodie', 'Chill Buster pullover', 'Max-Weight crew'],
    archetypes: ['workwear', 'sportsman'],
    sizingNote: 'Boxy American blocks — most size down one.',
    qualityScore: 8,
    naturalMaterials: true,
  },
  {
    brand: 'Velva Sheen',
    city: 'Cincinnati',
    referenceFor: 'Tubular-knit sweatshirt',
    description: 'The 1932 Cincinnati athletic label, revived with Japanese tubular knitting.',
    country: 'USA',
    founded: 1932,
    priceBand: 'mid',
    priceRangeLabel: 'Mid (£70–150)',
    materials: ['Tubular-knit cotton'],
    construction: 'Tubular-knitted, made in Japan',
    constructionQuality: 'Excellent',
    constructionNote: 'Seamless tubular body — the vintage athletic hand, correctly done.',
    registers: ['Casual'],
    longevity: { resoleable: false, mendable: false, expectedYears: 10, note: 'Softens and fades the right way.' },
    costPerYearNote: '~£7–15 per year over a 10-year life.',
    signaturePieces: ['8oz crewneck sweat', 'Tubular tee 2-pack', 'Freedom sleeve sweat'],
    archetypes: ['sportsman', 'relaxed'],
    sizingNote: 'Athletic vintage fit — true to size for a trim cut.',
    qualityScore: 8,
    naturalMaterials: true,
  },
  {
    brand: 'Warehouse & Co.',
    city: 'Osaka',
    referenceFor: 'Loopwheel crew sweat',
    description: 'Osaka reproduction house — loopwheel sweats and denim to vintage spec.',
    country: 'Japan',
    founded: 1995,
    priceBand: 'upper-mid',
    priceRangeLabel: 'Upper-mid (£150–280)',
    materials: ['Loopwheeled cotton', 'Selvedge denim'],
    construction: 'Loopwheel-knitted, made in Japan',
    constructionQuality: 'Excellent',
    constructionNote: 'Yarn spun to period spec before knitting even starts.',
    registers: ['Casual'],
    longevity: { resoleable: false, mendable: true, expectedYears: 15, note: 'Dense loopwheel fleece wears in, not out.' },
    costPerYearNote: '~£10–19 per year over a 15-year life.',
    signaturePieces: ['Lot 403 crew sweat', 'Freedom-sleeve sweat', 'Hooded sweat'],
    archetypes: ['workwear', 'military'],
    sizingNote: 'Vintage blocks — check the measured chest against a sweat you own.',
    qualityScore: 9,
    naturalMaterials: true,
  },
  {
    brand: 'Champion',
    city: 'Rochester',
    referenceFor: 'Reverse Weave sweatshirt',
    description: 'The inventor of the sweatshirt — Reverse Weave is the 1938 original.',
    country: 'USA',
    founded: 1919,
    priceBand: 'accessible',
    priceRangeLabel: 'Accessible (£50–100)',
    materials: ['Reverse Weave cotton fleece'],
    construction: 'Cross-grain cut with side gussets',
    constructionQuality: 'Good',
    constructionNote: 'The cross-grain cut that stopped sweatshirts shrinking short — patented 1938.',
    registers: ['Casual'],
    longevity: { resoleable: false, mendable: false, expectedYears: 10, note: 'The heavyweight Reverse Weave line survives decades of washing.' },
    costPerYearNote: '~£5–10 per year over a 10-year life.',
    signaturePieces: ['Reverse Weave crew', 'Reverse Weave hoodie'],
    archetypes: ['sportsman', 'relaxed'],
    sizingNote: 'Boxy athletic cut — most size down one for a cleaner line.',
    qualityScore: 7,
    naturalMaterials: true,
  },
  {
    brand: 'National Athletic Goods',
    city: 'Toronto',
    referenceFor: 'Varsity sweatshirt',
    description: 'Canadian-made athletic wear — 11oz fleece cut to vintage gym patterns.',
    country: 'Canada',
    founded: null,
    priceBand: 'mid',
    priceRangeLabel: 'Mid (£90–160)',
    materials: ['11oz cotton fleece'],
    construction: 'Knitted and sewn in Canada',
    constructionQuality: 'Excellent',
    constructionNote: 'Old-stock knitting machines and correct vintage details throughout.',
    registers: ['Casual'],
    longevity: { resoleable: false, mendable: false, expectedYears: 12, note: 'Dense fleece with taped seams — honest wear.' },
    costPerYearNote: '~£8–13 per year over a 12-year life.',
    signaturePieces: ['Varsity crew sweat', 'Gym tee', 'Zip parka sweat'],
    archetypes: ['sportsman', 'workwear'],
    sizingNote: 'Vintage athletic fit — true to size, trim through the body.',
    qualityScore: 8,
    naturalMaterials: true,
  },

  // ——— Base layers (Index coverage pass) ———
  {
    brand: 'Zimmerli',
    city: 'Mendrisio',
    referenceFor: 'Luxury undershirt',
    description: 'Swiss underwear since 1871 — the finest cottons ever put against skin.',
    country: 'Switzerland',
    founded: 1871,
    priceBand: 'luxury',
    priceRangeLabel: 'Luxury (£60–150)',
    materials: ['Sea Island cotton', 'Swiss cotton', 'Merino-silk'],
    construction: 'Knitted and sewn in Switzerland',
    constructionQuality: 'Excellent',
    constructionNote: 'Royal Classic line knitted on antique machines for a cloud-weight hand.',
    registers: ['Business', 'Formal'],
    longevity: { resoleable: false, mendable: false, expectedYears: 8, note: 'Delicate luxury — wash cool, dry flat, rotate.' },
    costPerYearNote: '~£8–19 per year across a rotation.',
    signaturePieces: ['Royal Classic undershirt', 'Sea Island crew neck', 'Boxer'],
    archetypes: ['continental'],
    sizingNote: 'Slim European block — size up if broad through the chest.',
    qualityScore: 9,
    naturalMaterials: true,
  },
  {
    brand: 'Hanro',
    city: 'Liestal',
    referenceFor: 'Cotton undershirt',
    description: 'Swiss-founded underwear house since 1884 — mercerised cotton done properly.',
    country: 'Switzerland',
    founded: 1884,
    priceBand: 'upper-mid',
    priceRangeLabel: 'Upper-mid (£40–100)',
    materials: ['Mercerised cotton', 'Merino-silk'],
    construction: 'European knitting, flat seams',
    constructionQuality: 'Excellent',
    constructionNote: 'The Cotton Sporty line is the benchmark plain white undershirt.',
    registers: ['Business', 'Smart-Casual'],
    longevity: { resoleable: false, mendable: false, expectedYears: 6, note: 'Mercerised cotton keeps its white through years of washing.' },
    costPerYearNote: '~£7–17 per year across a rotation.',
    signaturePieces: ['Cotton Sporty undershirt', 'Merino-silk long sleeve', 'Woven boxer'],
    archetypes: ['continental'],
    sizingNote: 'True to European size — the trim cut is intentional.',
    qualityScore: 8,
    naturalMaterials: true,
  },
  {
    brand: 'Schiesser',
    city: 'Radolfzell',
    referenceFor: 'Cotton vest',
    description: 'German underwear works since 1875 — honest cotton basics, fairly priced.',
    country: 'Germany',
    founded: 1875,
    priceBand: 'accessible',
    priceRangeLabel: 'Accessible (£20–50)',
    materials: ['Fine-rib cotton', 'Organic cotton'],
    construction: 'European knitting, taped shoulders',
    constructionQuality: 'Good',
    constructionNote: 'The Feinripp line is unchanged in decades because it needs no change.',
    registers: ['Casual', 'Business'],
    longevity: { resoleable: false, mendable: false, expectedYears: 5, note: 'Workhorse cotton — boil-washable.' },
    costPerYearNote: '~£4–10 per year across a rotation.',
    signaturePieces: ['Feinripp vest', 'Long john', 'Boxer brief'],
    archetypes: ['workwear', 'relaxed'],
    sizingNote: 'German sizing runs true — match the cm chart.',
    qualityScore: 7,
    naturalMaterials: true,
  },
  {
    brand: 'Derek Rose',
    city: 'London',
    referenceFor: 'Loungewear',
    description: 'London loungewear and underwear house since 1926 — Savile Row roots.',
    country: 'England',
    founded: 1926,
    priceBand: 'upper-mid',
    priceRangeLabel: 'Upper-mid (£40–120)',
    materials: ['Sea Island cotton', 'Micro modal', 'Brushed cotton'],
    construction: 'European workshops, flat-locked seams',
    constructionQuality: 'Excellent',
    constructionNote: 'Underwear cut with a tailor\u2019s eye for how cloth sits under cloth.',
    registers: ['Business', 'Formal'],
    longevity: { resoleable: false, mendable: false, expectedYears: 6, note: 'Fine cottons rotated last for years.' },
    costPerYearNote: '~£7–20 per year across a rotation.',
    signaturePieces: ['Jack pyjama', 'Basel stretch-modal tee', 'Lewis boxer'],
    archetypes: ['continental', 'ivy'],
    sizingNote: 'Classic English cut — roomier than continental; true to size.',
    qualityScore: 8,
    naturalMaterials: true,
  },
  {
    brand: 'Icebreaker',
    city: 'Auckland',
    referenceFor: 'Merino base layer',
    description: 'New Zealand merino specialists — the base layer that made wool modern.',
    country: 'New Zealand',
    founded: 1995,
    priceBand: 'mid',
    priceRangeLabel: 'Mid (£60–120)',
    materials: ['Merino wool'],
    construction: 'Flat-lock seamed merino knits',
    constructionQuality: 'Good',
    constructionNote: 'Traceable New Zealand merino in honest weights — 175 to 260gsm.',
    registers: ['Casual', 'Outdoor-Work'],
    longevity: { resoleable: false, mendable: false, expectedYears: 6, note: 'Merino resists odour — fewer washes, longer life.' },
    costPerYearNote: '~£10–20 per year across a rotation.',
    signaturePieces: ['Oasis 200 crew', 'Anatomica boxer', 'Merino long john'],
    archetypes: ['sportsman'],
    sizingNote: 'Athletic fit — size up for layering ease.',
    qualityScore: 7,
    naturalMaterials: true,
  },
  {
    brand: 'Smartwool',
    city: 'Steamboat Springs',
    referenceFor: 'Merino socks',
    description: 'Colorado merino house — the mountain sock standard, base layers behind it.',
    country: 'USA',
    founded: 1994,
    priceBand: 'mid',
    priceRangeLabel: 'Mid (£50–110)',
    materials: ['Merino wool', 'Merino-nylon blends'],
    construction: 'Seamless knit, reinforced wear zones',
    constructionQuality: 'Good',
    constructionNote: 'Indestructible ski socks first; the base layers carry the same yarn.',
    registers: ['Casual', 'Outdoor-Work'],
    longevity: { resoleable: false, mendable: false, expectedYears: 6, note: 'Reinforced heels and toes double the life of the pair.' },
    costPerYearNote: '~£8–18 per year across a rotation.',
    signaturePieces: ['Hike Classic sock', 'Classic Thermal 250 crew', 'Merino boxer'],
    archetypes: ['sportsman'],
    sizingNote: 'US sizing — socks band by shoe size, true to chart.',
    qualityScore: 7,
    naturalMaterials: true,
  },
  {
    brand: 'Bresciani',
    city: 'Spirano',
    referenceFor: 'Fine cotton socks',
    description: 'Italy\u2019s finest sock mill since 1970 — the houses\u2019 houses buy here.',
    country: 'Italy',
    founded: 1970,
    priceBand: 'mid',
    priceRangeLabel: 'Mid (£20–45)',
    materials: ['Egyptian cotton', 'Cashmere', 'Silk'],
    construction: 'Fine-gauge knit, hand-linked toes',
    constructionQuality: 'Excellent',
    constructionNote: 'Hand-linked at gauges most mills gave up on decades ago.',
    registers: ['Business', 'Formal', 'Black-Tie'],
    longevity: { resoleable: false, mendable: false, expectedYears: 5, note: 'Fine gauge asks for gentle washing and rotation.' },
    costPerYearNote: '~£5–10 per year across a rotation.',
    signaturePieces: ['Over-the-calf cotton socks', 'Cashmere socks', 'Silk evening socks'],
    archetypes: ['continental'],
    sizingNote: 'Italian sizing — match your EU shoe size exactly.',
    qualityScore: 9,
    naturalMaterials: true,
  },
  {
    brand: 'Falke',
    city: 'Schmallenberg',
    referenceFor: 'Dress socks',
    description: 'German hosiery works since 1895 — engineered socks and base layers.',
    country: 'Germany',
    founded: 1895,
    priceBand: 'mid',
    priceRangeLabel: 'Mid (£15–50)',
    materials: ['Merino wool', 'Cotton', 'Technical blends'],
    construction: 'Anatomical left/right knitting on the sport lines',
    constructionQuality: 'Excellent',
    constructionNote: 'A century of knitting engineering — the Airport sock is a genre.',
    registers: ['Business', 'Formal', 'Casual'],
    longevity: { resoleable: false, mendable: false, expectedYears: 6, note: 'Reinforced soles carry years of office miles.' },
    costPerYearNote: '~£4–10 per year across a rotation.',
    signaturePieces: ['Airport sock', 'Lhasa wool-cashmere sock', 'Wool-Tech base layer'],
    archetypes: ['continental', 'relaxed'],
    sizingNote: 'EU size bands — exact to the chart.',
    qualityScore: 8,
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
  // The merge (Data Layer task, Deliverable 5):
  Paraboot: 'Shoes', 'G.H. Bass': 'Shoes', 'Clarks Originals': 'Shoes', 'R.M. Williams': 'Shoes',
  Morjas: 'Shoes',
  Baracuta: 'Outerwear', Filson: 'Outerwear', Gloverall: 'Outerwear', 'Buzz Rickson': 'Outerwear',
  Vetra: 'Outerwear', Finisterre: 'Outerwear', Stutterheim: 'Outerwear',
  'William Lockie': 'Knitwear', 'Johnstons of Elgin': 'Knitwear',
  'Merz b. Schwanen': 'Tops', 'Lady White Co.': 'Tops', 'Luca Faloni': 'Tops', 'Fred Perry': 'Tops',
  OrSlow: 'Bottoms', 'Stan Ray': 'Bottoms', 'Orlebar Brown': 'Bottoms', 'Blackhorse Lane Ateliers': 'Bottoms',
  'Anglo-Italian': 'Formalwear', 'Ring Jacket': 'Formalwear',
  'Lock & Co.': 'Hats',
  'Frank Clegg': 'Bags',
  // The Index coverage pass — every category carries ten verified makers
  // minimum, so a piece row's arrow always lands on a real list:
  'Andersen-Andersen': 'Knitwear', "Howlin'": 'Knitwear',
  'De Petrillo': 'Formalwear', Cavour: 'Formalwear', Husbands: 'Formalwear', 'The Anthology': 'Formalwear',
  "Anderson's": 'Accessories', 'Shibumi Firenze': 'Accessories', 'E.G. Cappelli': 'Accessories',
  'Fox Umbrellas': 'Accessories', 'Simonnot-Godard': 'Accessories', Dents: 'Accessories', Pantherella: 'Accessories',
  'Chapman Bags': 'Bags', Mismo: 'Bags', Croots: 'Bags', 'Brady Bags': 'Bags', Tusting: 'Bags',
  'Globe-Trotter': 'Bags', Ettinger: 'Bags', 'Swaine Adeney Brigg': 'Bags',
  Borsalino: 'Hats', "Christys' London": 'Hats', Stetson: 'Hats', 'Laulhère': 'Hats',
  'Bates Gentlemen\u2019s Hatter': 'Hats', Failsworth: 'Hats', 'Wigéns': 'Hats', Kangol: 'Hats', Cableami: 'Hats',
  Loopwheeler: 'Sweatshirts', "The Real McCoy's": 'Sweatshirts', 'Camber USA': 'Sweatshirts',
  'Velva Sheen': 'Sweatshirts', 'Warehouse & Co.': 'Sweatshirts', Champion: 'Sweatshirts',
  'National Athletic Goods': 'Sweatshirts',
  Zimmerli: 'Base Layers', Hanro: 'Base Layers', Schiesser: 'Base Layers', 'Derek Rose': 'Base Layers',
  Icebreaker: 'Base Layers', Smartwool: 'Base Layers', Bresciani: 'Base Layers', Falke: 'Base Layers',
};

/** SECONDARY categories for makers whose range genuinely spans more than
 * their headline one — read alongside BRAND_CATEGORIES wherever a surface
 * filters makers by what they make. */
export const BRAND_EXTRA_CATEGORIES: Record<string, string[]> = {
  'Merz b. Schwanen': ['Sweatshirts'],
  'Lady White Co.': ['Sweatshirts'],
  'Buzz Rickson': ['Sweatshirts'],
  Sunspel: ['Base Layers'],
  'John Smedley': ['Base Layers'],
  Uniqlo: ['Base Layers'],
  "Drake's": ['Accessories'],
  'Johnstons of Elgin': ['Accessories'],
  Filson: ['Bags'],
};

export function brandCategory(brand: string): string {
  return BRAND_CATEGORIES[brand] || 'Other';
}

/** Display category label → the app's canonical category id
 * (category-order.ts). */
const CATEGORY_LABEL_TO_ID: Record<string, string> = {
  tops: 'tops',
  knitwear: 'knitwear',
  sweatshirts: 'sweatshirts',
  outerwear: 'outerwear',
  bottoms: 'bottoms',
  formalwear: 'formalwear',
  'base layers': 'base-layers',
  shoes: 'shoes',
  accessories: 'accessories',
  bags: 'bags',
  hats: 'hats',
};

/** EVERY canonical category id a maker is on file for — the primary from
 * BRAND_CATEGORIES plus any secondaries. Case-insensitive on the name. */
export function brandCategoryIds(brand: string): string[] {
  const q = (brand || '').trim().toLowerCase();
  if (!q) return [];
  const ids = new Set<string>();
  for (const [name, label] of Object.entries(BRAND_CATEGORIES)) {
    if (name.toLowerCase() !== q) continue;
    const id = CATEGORY_LABEL_TO_ID[label.toLowerCase()];
    if (id) ids.add(id);
  }
  for (const [name, labels] of Object.entries(BRAND_EXTRA_CATEGORIES)) {
    if (name.toLowerCase() !== q) continue;
    for (const label of labels) {
      const id = CATEGORY_LABEL_TO_ID[label.toLowerCase()];
      if (id) ids.add(id);
    }
  }
  return [...ids];
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
  ['Tops', 'Knitwear', 'Sweatshirts', 'Bottoms', 'Shoes', 'Outerwear', 'Formalwear', 'Base Layers', 'Accessories', 'Bags', 'Hats'],
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

export type BeauRating = 'Excellent' | 'Reliable' | 'Inconsistent' | 'Avoid';

export const BEAU_RATINGS: BeauRating[] = ['Excellent', 'Reliable', 'Inconsistent', 'Avoid'];

/**
 * Map ANY stored or model-emitted rating label onto the current four tiers —
 * including the legacy ones still sitting in older hunt_directory_brands
 * rows ('Considered' → 'Reliable', 'Proceed with caution' → 'Inconsistent').
 * Returns null for unrecognisable input so the caller can fall back to
 * deriving the rating from the construction-quality read instead.
 */
export function normalizeBeauRating(value: unknown): BeauRating | null {
  const v = String(value ?? '').trim().toLowerCase();
  if (!v) return null;
  if (v.includes('excellent')) return 'Excellent';
  if (v.includes('reliable') || v.includes('consider')) return 'Reliable';
  if (v.includes('inconsistent') || v.includes('caution')) return 'Inconsistent';
  if (v.includes('avoid')) return 'Avoid';
  return null;
}

export function beauRatingFromQuality(quality: string | null | undefined, qualityScore?: number | null): BeauRating {
  if (quality === 'Excellent') return 'Excellent';
  if (quality === 'Good') return 'Reliable';
  // The bottom of the scale: a construction score of 3 or under reads as
  // Avoid — the quality signals actively argue against the money.
  if (typeof qualityScore === 'number' && qualityScore > 0 && qualityScore <= 3) return 'Avoid';
  return 'Inconsistent';
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
  const rating = beauRatingFromQuality(b.constructionQuality, b.qualityScore);
  if (rating === 'Excellent') return `${b.brand} earns this on the make rather than the name`;
  if (rating === 'Reliable') return `${b.brand} is honestly made for what it costs, without pretending to be more`;
  if (rating === 'Avoid') return `The quality signals here argue against the money — the construction doesn’t hold up`;
  return `Beau can’t see steady construction or material signals here — quality varies piece to piece`;
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
    return 'Excellent is Beau’s top mark: buy with confidence — the construction, the cloth or leather and the repairability all hold up, so he surfaces these makers actively.';
  }
  if (rating === 'Reliable') {
    return 'Reliable means solid quality, worth the money — honestly made and fairly priced. Beau includes these makers, without pushing them ahead of the Excellent tier.';
  }
  if (rating === 'Inconsistent') {
    return 'Inconsistent means hit or miss — some pieces hold up, others don’t, so Beau flags it: check the specific piece before you commit.';
  }
  return 'Avoid means the quality doesn’t hold up for the money — Beau filters these makers out of his recommendations.';
}

/** Beau's rating for a brand plus its brand-specific rationale. */
export function beauRating(b: BrandProfile): { rating: BeauRating; note: string } {
  return {
    rating: beauRatingFromQuality(b.constructionQuality, b.qualityScore),
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

/** The ORIGINAL three style registers — the Discover chip bar and the
 * coverage map's three columns keep using exactly these. */
export const REGISTERS: Register[] = ['Casual', 'Smart-Casual', 'Formal'];

/** ALL SIX registers, in formality order — the Index data layer's axis.
 * The coverage map's three rows stay the three above; this wider list is
 * for garment-type reach and the dossier's muted_registers. */
export const ALL_REGISTERS: Register[] = [
  'Casual',
  'Smart-Casual',
  'Business',
  'Formal',
  'Black-Tie',
  'Outdoor-Work',
];

export const REGISTER_LABELS: Record<Register, string> = {
  Casual: 'Casual',
  'Smart-Casual': 'Smart-Casual',
  Business: 'Business',
  Formal: 'Formal',
  'Black-Tie': 'Black Tie',
  'Outdoor-Work': 'Outdoor & Work',
};

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
  // normalizeBeauRating also migrates rows stored under the old labels
  // ('Considered', 'Proceed with caution') onto the current four tiers.
  const rating: BeauRating =
    normalizeBeauRating(row.rating) ?? beauRatingFromQuality(profile.constructionQuality, profile.qualityScore);
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
