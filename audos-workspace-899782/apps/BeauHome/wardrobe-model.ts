/**
 * The WARDROBE MODEL — one shared source of truth for the first and fourth
 * steps of Beau's decision tree (the recommendation-engine overhaul):
 *
 *  1. THE UNIVERSAL FOUNDATION CHECK (Beau's Picks gating — Step 1, run
 *     before every recommendation, regardless of style archetype). Seven
 *     steps in strict priority order:
 *       1 bottoms → 2 tops → 3 shoes (one SMART pair AND one CASUAL pair)
 *       → 4 outerwear → 5 mid-layers (knitwear) → 6 formalwear
 *       → 7 accessories.
 *     While a foundation step is unmet, Beau's picks surface ONLY that
 *     category — a man with no trousers logged sees bottoms and nothing
 *     else, full stop. Shoes are special: the step is only satisfied by one
 *     smart pair AND one casual pair, and Beau recommends shoes while
 *     either is missing. Accessories are never recommended while any of
 *     steps 1–6 is open.
 *
 *  2. VARIETY-BASED MILESTONE TARGETS (Step 4 — the variety check).
 *     Progress counts DISTINCT FUNCTIONAL SUB-TYPES, inferred from the
 *     piece's slot, name, material and pattern: two wax jackets are the
 *     same sub-type, so they advance the outerwear milestone ONCE, not
 *     twice — and Beau says so, naming a sub-type that actually would
 *     advance it. Targets are JUSTIFIED BY THE SELECTED ARCHETYPES, never
 *     arbitrary: British Country calls for more knitwear than Continental,
 *     and the rationale printed under each milestone says why the target
 *     is what it is. A piece whose sub-type cannot be read still advances
 *     the count, but the milestone only reads COMPLETE when the variety
 *     criteria are genuinely met.
 */
import type { WardrobePiece } from './profile-data';

// ---------------------------------------------------------------------------
// Tier + sub-type definitions
// ---------------------------------------------------------------------------

export type TierId =
  | 'bottoms'
  | 'tops'
  | 'knitwear'
  | 'outerwear'
  | 'shoes'
  | 'formalwear'
  | 'accessories';

export interface SubtypeDef {
  id: string;
  /** Singular prose form: 'smart trouser', 'wax jacket'. */
  label: string;
  /** Plural form for the duplicates note; label + 's' when omitted. */
  plural?: string;
  test: RegExp;
}

export interface WardrobeTier {
  id: TierId;
  /** 1-based strict priority order (Step 1 of the decision tree). */
  rank: number;
  label: string;
  /** What zero-state gating copy calls the tier: 'foundation bottoms'. */
  gateNoun: string;
  /** Default variety target — distinct sub-types, never raw piece count.
   * Archetype selections adjust it (see TIER_TARGET_OVERRIDES). */
  target: number;
  /** The earned-number rationale shown in small text near the milestone. */
  rationale: string;
  /** Wardrobe categories that live in this tier. */
  categories: string[];
  /** Functional sub-types, tested in order — first match wins. */
  subtypes: SubtypeDef[];
}

/**
 * Step 1 order: bottoms → tops → shoes → outerwear → mid-layers →
 * formalwear → accessories. The array order IS the gate order and the
 * milestone display order.
 */
export const WARDROBE_TIERS: WardrobeTier[] = [
  {
    id: 'bottoms',
    rank: 1,
    label: 'Bottoms',
    gateNoun: 'foundation bottoms',
    target: 4,
    rationale: '4 bottoms across different functions — a smart trouser, a chino, dark denim and a casual pair.',
    categories: ['bottoms'],
    subtypes: [
      { id: 'washed-denim', label: 'pair of casual washed denim', plural: 'pairs of washed denim', test: /(?:jean|denim)[^]*(?:wash|faded|distressed)|(?:wash|faded|distressed)[^]*(?:jean|denim)/ },
      { id: 'dark-denim', label: 'pair of dark or raw denim', plural: 'pairs of dark denim', test: /jean|denim|selvedge/ },
      { id: 'cargo-utility', label: 'cargo or utility trouser', test: /cargo|utility|fatigue|ripstop|carpenter|work pant/ },
      { id: 'cord-moleskin', label: 'corduroy or moleskin trouser', test: /cord|corduroy|moleskin/ },
      { id: 'chino', label: 'chino', test: /chino|khaki/ },
      { id: 'smart-trouser', label: 'formal or dress trouser', test: /tailored|high.?rise|wool trouser|flannel|dress trouser|suit trouser|slacks|pleated/ },
      { id: 'shorts', label: 'pair of shorts', plural: 'pairs of shorts', test: /\bshorts?\b/ },
      { id: 'casual-trouser', label: 'casual trouser', test: /canvas|linen|drawstring|track|work pant|casual trouser/ },
    ],
  },
  {
    id: 'tops',
    rank: 2,
    label: 'Tops',
    gateNoun: 'foundation tops',
    target: 5,
    rationale: '5 tops across different roles — a dress shirt, a casual shirt, a flannel or overshirt, tees and a polo.',
    categories: ['tops', 'base-layers'],
    subtypes: [
      { id: 'dress-shirt', label: 'dress shirt', test: /dress shirt|poplin|twill shirt|formal shirt|structured collar/ },
      { id: 'flannel', label: 'flannel or overshirt', plural: 'flannels or overshirts', test: /flannel|brushed cotton|overshirt|work shirt/ },
      { id: 'casual-shirt', label: 'casual shirt', test: /ocbd|oxford|button.?down|chambray|linen shirt|camp collar|casual shirt|breton|striped shirt/ },
      { id: 'polo', label: 'polo', test: /polo|piqu/ },
      { id: 'tee', label: 't-shirt', test: /\btee\b|t-?shirt|henley/ },
    ],
  },
  {
    id: 'shoes',
    rank: 3,
    label: 'Shoes',
    gateNoun: 'shoes',
    target: 3,
    rationale: '3 pairs across occasions — one smart, one casual, one boot or something rugged.',
    categories: ['shoes'],
    subtypes: [
      { id: 'brogue', label: 'brogue', test: /brogue|wingtip/ },
      { id: 'chelsea', label: 'Chelsea boot', test: /chelsea/ },
      { id: 'chukka', label: 'chukka or desert boot', test: /chukka|desert boot/ },
      { id: 'oxford', label: 'Oxford', test: /oxford/ },
      { id: 'derby', label: 'Derby', plural: 'Derbies', test: /derby|derbies|blucher|monk/ },
      { id: 'loafer', label: 'loafer', test: /loafer|moccasin|penny|tassel|suede buck/ },
      { id: 'deck', label: 'deck shoe or espadrille', plural: 'deck shoes or espadrilles', test: /deck|boat shoe|espadrille/ },
      { id: 'sandal', label: 'leather sandal', test: /sandal|slide/ },
      { id: 'sneaker', label: 'clean sneaker', test: /sneaker|trainer|tennis|plimsoll|canvas|\bgat\b/ },
      { id: 'boot', label: 'work or rugged boot', test: /boot|hiking|trail/ },
    ],
  },
  {
    id: 'outerwear',
    rank: 4,
    label: 'Outerwear',
    gateNoun: 'outerwear',
    target: 3,
    rationale: '3 outerwear pieces across different functions — smart, rugged and weatherproof, never three of the same.',
    categories: ['outerwear'],
    subtypes: [
      { id: 'wax-jacket', label: 'wax jacket', test: /wax|barbour|bedale|beaufort/ },
      { id: 'field-jacket', label: 'field jacket', test: /field|m-?43|m-?65|m-?1943|hunting|fatigue|military jacket|safari/ },
      { id: 'trench', label: 'trench coat', test: /trench/ },
      { id: 'peacoat', label: 'peacoat', test: /peacoat|pea coat/ },
      { id: 'wool-overcoat', label: 'wool overcoat', test: /overcoat|topcoat|polo coat|camel coat|wool coat|duffle|covert coat/ },
      { id: 'raincoat', label: 'raincoat or mac', plural: 'raincoats or macs', test: /rain|mackintosh|\bmac\b|anorak|parka|gore.?tex|weather jacket/ },
      { id: 'puffer-quilted', label: 'puffer, quilted jacket or gilet', plural: 'puffers, quilted jackets or gilets', test: /gilet|puffer|quilt|down|insulat|fleece|liner|\bvest\b/ },
      { id: 'leather-jacket', label: 'leather jacket', test: /leather|suede jacket|cafe racer|moto|biker/ },
      { id: 'casual-jacket', label: 'casual jacket', test: /harrington|bomber|blouson|chore|trucker|shirt jacket|shacket|ma-?1|denim jacket/ },
    ],
  },
  {
    id: 'knitwear',
    rank: 5,
    label: 'Knitwear',
    gateNoun: 'mid-layers',
    target: 3,
    rationale: '3 knits across weights and shapes — a fine knit, a heavy knit, and a cardigan or sweatshirt.',
    categories: ['knitwear', 'sweatshirts'],
    subtypes: [
      { id: 'fine-knit', label: 'fine knit', test: /merino|fine.?knit|rollneck|roll neck|turtleneck|sea island|smedley|lightweight/ },
      { id: 'heavy-knit', label: 'heavy knit', test: /aran|shetland|guernsey|cable|chunky|heavy|lambswool|fisherman/ },
      { id: 'cardigan', label: 'cardigan', test: /cardigan|shawl/ },
      { id: 'sweatshirt', label: 'sweatshirt', test: /sweatshirt|hoodie|loopwheel/ },
    ],
  },
  {
    id: 'formalwear',
    rank: 6,
    label: 'Formalwear',
    gateNoun: 'formalwear',
    target: 2,
    rationale: 'A suit and a blazer at minimum — the two anchors of formal cover.',
    categories: ['formalwear'],
    subtypes: [
      { id: 'suit', label: 'suit', test: /suit|tuxedo|dinner jacket|black tie|two.?piece|three.?piece/ },
      { id: 'blazer', label: 'blazer', test: /blazer|sport coat|sports coat|sport jacket|tweed jacket|teba/ },
    ],
  },
  {
    id: 'accessories',
    rank: 7,
    label: 'Accessories',
    gateNoun: 'accessories',
    target: 3,
    rationale: 'Only once the foundations are in place — one of each key type: a belt, a timepiece and a proper bag.',
    categories: ['accessories', 'bags', 'hats', 'other'],
    subtypes: [
      { id: 'belt', label: 'belt', test: /belt/ },
      { id: 'timepiece', label: 'timepiece', test: /watch|timepiece|chronograph/ },
      { id: 'bag', label: 'proper bag', test: /\bbag\b|holdall|weekender|duffle|duffel|briefcase|tote|satchel|messenger|backpack|rucksack|luggage|suitcase/ },
    ],
  },
];

const TIER_BY_ID = new Map(WARDROBE_TIERS.map((t) => [t.id, t]));
const TIER_OF_CATEGORY = new Map<string, TierId>();
for (const tier of WARDROBE_TIERS) for (const cat of tier.categories) TIER_OF_CATEGORY.set(cat, tier.id);

/** Slot-level overrides: some slots live functionally outside their
 * category (the blazer slot sits in the outerwear category but is
 * formalwear tier; the tie slot sits in formalwear but is an accessory). */
const TIER_OF_SLOT: Record<string, TierId> = {
  blazer: 'formalwear',
  suit: 'formalwear',
  'dinner-suit': 'formalwear',
  tie: 'accessories',
};

export function tierFor(category?: string | null, slot?: string | null): WardrobeTier | null {
  if (slot && TIER_OF_SLOT[slot]) return TIER_BY_ID.get(TIER_OF_SLOT[slot]) || null;
  const id = category ? TIER_OF_CATEGORY.get(category) : undefined;
  return id ? TIER_BY_ID.get(id) || null : null;
}

type PieceLike = WardrobePiece & { material?: string | null; pattern?: string | null };

/** Everything readable about the garment TYPE, lowercased. */
function signalOf(piece: PieceLike, material?: string | null): string {
  return `${piece.slot || ''} ${piece.name || ''} ${material ?? piece.material ?? ''} ${piece.pattern || ''}`.toLowerCase();
}

/** Classify a piece into its tier's functional sub-type. Null = the tier is
 * known but the sub-type couldn't be read (still advances the count). */
export function classifySubtype(tier: WardrobeTier, piece: PieceLike, material?: string | null): SubtypeDef | null {
  const signal = signalOf(piece, material);
  for (const subtype of tier.subtypes) {
    if (subtype.test.test(signal)) return subtype;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Archetype-justified milestone targets
// ---------------------------------------------------------------------------

const ARCHETYPE_LABELS: Record<string, string> = {
  ivy: 'Classic Ivy',
  country: 'British Country',
  continental: 'Continental',
  sportsman: 'American Outdoors',
  workwear: 'Workwear',
  relaxed: 'Smart Casual',
  military: 'Military / Utility',
  nautical: 'Coastal / Nautical',
  riviera: 'Mediterranean / Riviera',
  moto: 'Rider / Moto',
  formal: 'Formal',
};

interface TierTargetOverride {
  target: number;
  why: string;
}

/**
 * Where a selected archetype genuinely changes what a category owes the
 * wardrobe, the target moves — and the rationale says why, so the number
 * always reads earned. With several archetypes the HIGHEST justified
 * target wins (coverage across directions, never the lowest common
 * denominator).
 */
const TIER_TARGET_OVERRIDES: Partial<Record<TierId, Record<string, TierTargetOverride>>> = {
  knitwear: {
    country: { target: 4, why: 'British Country leans hard on knitwear — a heavy Shetland or Aran, a fine knit, a cardigan and a spare in rotation.' },
    continental: { target: 2, why: 'Continental wardrobes run lighter on knits — a fine merino or rollneck and one heavier knit cover it.' },
    riviera: { target: 2, why: 'A Riviera wardrobe needs little knitwear — a fine cotton or merino knit, and one heavier piece for cool evenings.' },
  },
  outerwear: {
    country: { target: 4, why: 'British Country dresses for real weather — a wax or field jacket, a smart overcoat, a rain layer and a gilet or quilted layer.' },
    sportsman: { target: 4, why: 'American Outdoors calls for working layers — a field or chore jacket, an insulated or quilted piece, a rain layer and one smarter coat.' },
    riviera: { target: 2, why: 'A Mediterranean wardrobe travels light — a light unlined jacket and one weatherproof layer are enough.' },
  },
  formalwear: {
    workwear: { target: 1, why: 'Workwear needs only one anchor at the formal end — a soft, unstructured blazer.' },
    military: { target: 1, why: 'A utility wardrobe needs only one formal anchor — a plain blazer covers it.' },
    sportsman: { target: 1, why: 'American Outdoors needs only one formal anchor — a blazer that can sit over a flannel shirt.' },
  },
  bottoms: {
    riviera: { target: 3, why: 'Riviera bottoms are a short list — linen trousers, a smart chino and quality shorts.' },
  },
};

/**
 * The effective target + rationale for a tier given the selected
 * archetypes. No selection (or no archetype-specific case) = the tier's
 * default. Several selections = the highest justified target, with the
 * driving archetype named in the rationale.
 */
export function tierTargetFor(tier: WardrobeTier, archetypes: string[] = []): { target: number; rationale: string } {
  const overrides = TIER_TARGET_OVERRIDES[tier.id];
  const ids = (archetypes || []).map((a) => (a || '').toLowerCase()).filter((a) => ARCHETYPE_LABELS[a]);
  if (!overrides || ids.length === 0) return { target: tier.target, rationale: tier.rationale };
  const hits = ids.filter((id) => overrides[id]);
  if (hits.length === 0) return { target: tier.target, rationale: tier.rationale };

  // Archetypes WITHOUT a specific case implicitly endorse the default.
  const hasDefaultEndorser = ids.some((id) => !overrides[id]);
  let target = hasDefaultEndorser ? tier.target : -1;
  let rationale = tier.rationale;
  let driver: string | null = null;
  for (const id of hits) {
    if (overrides[id].target > target) {
      target = overrides[id].target;
      rationale = overrides[id].why;
      driver = id;
    }
  }
  if (driver && ids.length > 1) {
    const others = ids.filter((id) => id !== driver).map((id) => ARCHETYPE_LABELS[id]);
    if (others.length > 0) {
      rationale = `${rationale} That covers your ${others.join(' and ')} side too.`;
    }
  }
  return { target, rationale };
}

// ---------------------------------------------------------------------------
// 1. The universal foundation check (Beau's Picks gate — Step 1)
// ---------------------------------------------------------------------------

export interface HierarchyGate {
  /** Tier ids Beau may recommend from right now. While a foundation step
   * is unmet this is ONLY the missing tier — nothing else surfaces. */
  allowed: Set<TierId>;
  /** The foundation step currently holding the gate. Null when open. */
  firstMissing: WardrobeTier | null;
  /** Concrete, user-facing read of what the gate needs. Null when open. */
  reason: string | null;
}

/** Shoe sub-types that read as the SMART pair for the foundation check. */
const SMART_SHOE_SUBTYPES = new Set(['brogue', 'chelsea', 'oxford', 'derby', 'loafer']);
/** Shoe sub-types that read as the CASUAL pair for the foundation check. */
const CASUAL_SHOE_SUBTYPES = new Set(['sneaker', 'boot', 'chukka', 'deck', 'sandal']);

/** Step 3 needs one smart pair AND one casual pair. A pair whose sub-type
 * can't be read gets the benefit of the doubt on both sides. */
function shoeCoverage(pieces: PieceLike[]): { smart: boolean; casual: boolean } {
  const tier = TIER_BY_ID.get('shoes') as WardrobeTier;
  let smart = false;
  let casual = false;
  for (const piece of pieces) {
    if (tierFor(piece.category, piece.slot)?.id !== 'shoes') continue;
    const subtype = classifySubtype(tier, piece);
    if (!subtype) {
      smart = true;
      casual = true;
      continue;
    }
    if (SMART_SHOE_SUBTYPES.has(subtype.id)) smart = true;
    if (CASUAL_SHOE_SUBTYPES.has(subtype.id)) casual = true;
  }
  return { smart, casual };
}

/**
 * The foundation check, in strict order — bottoms, tops, shoes (smart AND
 * casual), outerwear, mid-layers, formalwear. At the FIRST unmet step the
 * gate closes around ONLY that tier: Beau recommends that category and
 * nothing else, no exceptions. When every step is covered the gate is
 * open and all tiers (accessories included) are allowed.
 */
export function hierarchyGate(pieces: WardrobePiece[]): HierarchyGate {
  const list = pieces as PieceLike[];
  const ownedTiers = new Set<TierId>();
  for (const piece of list) {
    const tier = tierFor(piece.category, piece.slot);
    if (tier) ownedTiers.add(tier.id);
  }

  const gateAt = (tier: WardrobeTier, reason: string): HierarchyGate => ({
    allowed: new Set<TierId>([tier.id]),
    firstMissing: tier,
    reason,
  });

  for (const tier of WARDROBE_TIERS) {
    if (tier.id === 'accessories') break; // accessories gate nothing — they are what gets gated
    if (tier.id === 'shoes') {
      const { smart, casual } = shoeCoverage(list);
      if (!smart || !casual) {
        const reason = !smart && !casual
          ? 'no shoes are logged yet — one smart pair and one casual pair come before anything later'
          : !smart
            ? 'your shoes cover the casual end, but no smart pair is logged yet'
            : 'you have a smart pair, but no casual pair is logged yet';
        return gateAt(tier, reason);
      }
      continue;
    }
    if (!ownedTiers.has(tier.id)) {
      const reasonByTier: Partial<Record<TierId, string>> = {
        bottoms: 'nothing is logged in your foundation bottoms yet — trousers, chinos or jeans come before everything else',
        tops: 'your bottoms are covered, but nothing is logged in your foundation tops yet',
        outerwear: 'no weather-appropriate outer layer is logged yet',
        knitwear: 'no mid-layer is logged yet — knitwear carries a wardrobe between seasons',
        formalwear: 'no formal anchor is logged yet — a blazer or a suit at minimum',
      };
      return gateAt(tier, reasonByTier[tier.id] || `nothing is logged in your ${tier.gateNoun} yet`);
    }
  }
  return { allowed: new Set(WARDROBE_TIERS.map((t) => t.id)), firstMissing: null, reason: null };
}

/** Whether one recommendable item (category + slot) passes the gate. Items
 * whose tier can't be read follow the accessories tier (last). */
export function itemPassesGate(gate: HierarchyGate, category?: string | null, slot?: string | null): boolean {
  const tier = tierFor(category, slot) || TIER_BY_ID.get('accessories')!;
  return gate.allowed.has(tier.id);
}

// ---------------------------------------------------------------------------
// 2. Variety-based milestones (Step 4)
// ---------------------------------------------------------------------------

export interface TierMilestone {
  id: TierId;
  label: string;
  target: number;
  rationale: string;
  /** Raw pieces owned in the tier (context only — never the progress). */
  ownedPieces: number;
  /** Distinct functional sub-types covered. */
  distinct: SubtypeDef[];
  /** Pieces whose sub-type couldn't be read. */
  unclassified: number;
  /** Displayed progress: distinct + unclassified, capped at target. */
  progress: number;
  /** Complete ONLY when the variety criteria are genuinely met. */
  complete: boolean;
  /** Sub-types still open, in definition order. */
  missing: SubtypeDef[];
  /** Beau's variety read — duplicates that won't advance it, or the
   * count-full-but-variety-open case. Null when nothing to flag. */
  varietyNote: string | null;
  /** Sub-type checklist for the expanded row. */
  details: Array<{ label: string; met: boolean }>;
}

function withArticle(label: string): string {
  if (/^pair/i.test(label)) return `a ${label}`;
  return /^[aeiou]/i.test(label) ? `an ${label}` : `a ${label}`;
}

function listJoin(items: string[]): string {
  if (items.length <= 1) return items[0] || '';
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const numberWord = (n: number) => NUMBER_WORDS[n] || String(n);

export function computeTierMilestones(
  pieces: WardrobePiece[],
  materials: Record<number, string> = {},
  archetypes: string[] = [],
): TierMilestone[] {
  return WARDROBE_TIERS.map((tier) => {
    const { target, rationale } = tierTargetFor(tier, archetypes);
    const tierPieces = (pieces as PieceLike[]).filter((p) => tierFor(p.category, p.slot)?.id === tier.id);
    const bySubtype = new Map<string, PieceLike[]>();
    let unclassified = 0;
    for (const piece of tierPieces) {
      const subtype = classifySubtype(tier, piece, materials[piece.id]);
      if (subtype) {
        const list = bySubtype.get(subtype.id) || [];
        list.push(piece);
        bySubtype.set(subtype.id, list);
      } else {
        unclassified += 1;
      }
    }
    const distinct = tier.subtypes.filter((s) => bySubtype.has(s.id));
    const missing = tier.subtypes.filter((s) => !bySubtype.has(s.id));
    const complete = distinct.length >= target;
    const progress = Math.min(target, distinct.length + unclassified);

    // The variety read: duplicates never advance a milestone — say so, and
    // name what actually would.
    let varietyNote: string | null = null;
    const duplicated = tier.subtypes.find((s) => (bySubtype.get(s.id) || []).length >= 2);
    const suggestions = missing.slice(0, Math.max(1, target - distinct.length)).map((s) => withArticle(s.label));
    if (!complete && duplicated) {
      const n = (bySubtype.get(duplicated.id) || []).length;
      const plural = duplicated.plural || `${duplicated.label}s`;
      varietyNote = `You own ${numberWord(n)} ${plural} — another won't advance this. ${suggestions.length > 0 ? `${listJoin(suggestions)[0].toUpperCase()}${listJoin(suggestions).slice(1)} will.` : ''}`.trim();
    } else if (!complete && progress >= target) {
      varietyNote = `The count is there but the variety isn't yet — ${listJoin(suggestions)} completes it.`;
    } else if (!complete && distinct.length > 0 && suggestions.length > 0) {
      // Always show what sub-type is missing: "1/3 outerwear — add a wool
      // overcoat or a raincoat for variety."
      varietyNote = `${distinct.length}/${target} so far — add ${listJoin(suggestions)} for variety.`;
    }

    return {
      id: tier.id,
      label: tier.label,
      target,
      rationale,
      ownedPieces: tierPieces.length,
      distinct,
      unclassified,
      progress,
      complete,
      missing,
      varietyNote,
      details: tier.subtypes.map((s) => ({
        label: `${s.label[0].toUpperCase()}${s.label.slice(1)}`,
        met: bySubtype.has(s.id),
      })),
    };
  });
}

/** Overall variety coverage 0–100 — distinct sub-types over targets. */
export function tierMilestonePercent(milestones: TierMilestone[]): number {
  const total = milestones.reduce((acc, m) => acc + m.target, 0);
  const done = milestones.reduce((acc, m) => acc + Math.min(m.distinct.length, m.target), 0);
  return total > 0 ? Math.round((done / total) * 100) : 0;
}
