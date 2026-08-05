/**
 * Ethaion wardrobe milestones (v6 — the recommendation-engine overhaul:
 * per-archetype essential tracks + the decision-tree ordering).
 *
 * COMPLETION = DISTINCT ESSENTIAL SLOTS FILLED, defined PER STYLE ARCHETYPE.
 * Quantity never matters: five hoodies occupy ONE slot, not five. A slot is
 * filled when at least one owned piece maps to it — and where a colour gate
 * applies, only when its COLOUR is neutral/classic for that garment type
 * (pink chinos never fill the Chino slot; olive, stone, khaki or navy chinos
 * do). Colour is read from the structured colours Beau classified at log
 * time, with the piece NAME and MATERIAL as fallback signals; when no colour
 * evidence exists at all the piece gets the benefit of the doubt.
 *
 * ARCHETYPE ESSENTIAL TRACKS (Step 2 of Beau's decision tree) — each of the
 * nine selectable archetypes carries its OWN essential list:
 *  - Classic Ivy — OCBDs, classic-colour chinos, loafers or suede bucks,
 *    crew-neck knitwear, a sports jacket or blazer
 *  - British Country — flannel/check shirts, moleskin or corduroy trousers,
 *    heavy wool knitwear, brogues, a wax jacket or tweed, an overshirt/gilet
 *  - Continental — an unstructured blazer, well-fitted trousers, fine
 *    knitwear or a turtleneck, Chelsea boots or loafers
 *  - Smart Casual — quality chinos or slim trousers, neat shirts or polos,
 *    clean sneakers or loafers, a layering knit, an unlined jacket/cardigan
 *  - American Outdoors — heavy denim or canvas trousers, chambray or
 *    flannel shirts, workwear boots, an insulated or quilted layer
 *  - Workwear — dark denim or canvas trousers, a chambray shirt, sturdy
 *    leather boots, a chore coat or denim jacket
 *  - Military/Utility — cargo or utility trousers, an OCBD or military-cut
 *    shirt, an M-65 or field jacket, combat or service boots
 *  - Coastal/Nautical — a Breton stripe, navy chinos or white trousers,
 *    deck shoes or white canvas sneakers, a Guernsey or fisherman knit
 *  - Mediterranean/Riviera — open-collar linen shirts, linen trousers or
 *    shorts, leather sandals or espadrilles, a light unlined blazer
 *
 * MULTI-ARCHETYPE (Step 3): each selected archetype keeps its OWN track,
 * shown separately — never blended into one confusing number. A piece maps
 * to EVERY track it genuinely serves, so a BRIDGING piece advances all of
 * them at once; Beau prioritises those pieces in Curated, labels every
 * recommendation with the archetype(s) it serves, and flags the gaps open
 * in EVERY selected direction as the smartest place to start.
 *
 * The legacy five-stage journey (Essentials → Occasions → Seasons → Accents
 * → Anchors) is retained for Curated's section grouping. Rows collapse to a
 * flex-column layout below 640px so nothing clips at 375–430px viewports.
 */
import { memo, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { tw, typography } from '../../lib/colors';
import {
  assessOccasionCoverage,
  defaultSeasons,
  extractColors,
  itemFillsOccasionGap,
  label as vocabLabel,
  outfitGapUrgency,
  type FeedCard,
  type MenswearGapKind,
  type WardrobePiece,
} from './profile-data';
import { computeTierMilestones, tierMilestonePercent } from './wardrobe-model';
import { sortByCategoryOrder } from './category-order';

// ---------------------------------------------------------------------------
// Legacy journey heuristics (Curated section grouping)
// ---------------------------------------------------------------------------

interface EssentialCheck {
  id: string;
  label: string;
  slots: string[];
  /** The wardrobe category this essential belongs to — it decides where the
   * row sits in the canonical menswear order. */
  category: string;
}

/** The ten core pieces, read out in the app's ONE canonical menswear order
 * (category-order.ts): worn garments first, then shoes, then accessories —
 * never shoes wedged between the trousers and the coat. */
const ESSENTIALS: EssentialCheck[] = sortByCategoryOrder(
  [
    { id: 'shirt', label: 'A proper shirt', slots: ['ocbd', 'dress-shirt', 'casual-shirt'], category: 'tops' },
    { id: 'tee', label: 'T-shirt or polo', slots: ['tee', 'polo'], category: 'tops' },
    { id: 'chinos', label: 'Chinos', slots: ['chinos'], category: 'bottoms' },
    { id: 'dark-trouser', label: 'Jeans or dark trousers', slots: ['jeans', 'high-rise-trousers', 'trousers'], category: 'bottoms' },
    { id: 'sneaker', label: 'Clean sneakers', slots: ['sneakers'], category: 'shoes' },
    { id: 'smart-shoe', label: 'A smart shoe', slots: ['loafers', 'derbies'], category: 'shoes' },
    { id: 'knit', label: 'A knit', slots: ['crewneck', 'cardigan'], category: 'knitwear' },
    { id: 'jacket', label: 'An everyday jacket', slots: ['harrington', 'field-jacket', 'waxed-jacket', 'blazer', 'leather-jacket'], category: 'outerwear' },
    { id: 'coat', label: 'A proper coat', slots: ['formal-overcoat', 'structured-trench', 'overcoat', 'raincoat'], category: 'outerwear' },
    { id: 'belt', label: 'A belt', slots: ['belt'], category: 'accessories' },
  ],
  (essential) => essential.category,
);

const ACCENT_COLORS = new Set([
  'rust', 'burgundy', 'wine', 'red', 'orange', 'mustard', 'yellow', 'pink', 'purple', 'green', 'forest green',
]);

const ANCHOR_SLOTS: Array<{ id: string; label: string }> = [
  { id: 'formal-overcoat', label: 'Formal wool overcoat' },
  { id: 'overcoat', label: 'Overcoat' },
  { id: 'blazer', label: 'Blazer / sport coat' },
  { id: 'suit', label: 'Suit' },
  { id: 'waxed-jacket', label: 'Waxed jacket' },
  { id: 'leather-jacket', label: 'Leather jacket' },
  { id: 'derbies', label: 'Welted shoes' },
  { id: 'boots', label: 'Quality boots' },
  { id: 'bag', label: 'Proper luggage' },
];

// ---------------------------------------------------------------------------
// Per-archetype essential tracks (Step 2 of the decision tree)
// ---------------------------------------------------------------------------

type PieceLike = WardrobePiece & { material?: string | null; pattern?: string | null };

/** Everything we can read about the garment TYPE, lowercased: canonical
 * slot id, name, material and pattern. */
function signalOf(piece: PieceLike): string {
  return `${piece.slot || ''} ${piece.name || ''} ${piece.material || ''} ${piece.pattern || ''}`.toLowerCase();
}

/** Colour evidence: the structured colours Beau classified at log time,
 * plus any colour words in the piece name (the name/material fallback the
 * spec calls for when the colour field is missing). */
function colorEvidence(piece: PieceLike): string[] {
  const structured = (piece.colors || []).map((c) => String(c).toLowerCase().trim());
  const fromName = extractColors(piece.name || '').map((c) => c.toLowerCase());
  return Array.from(new Set([...structured, ...fromName])).filter(Boolean);
}

interface EssentialSlot {
  id: string;
  /** Shared concept key — the same key in two tracks means one physical
   * piece covers both, and a gap missing under this key in EVERY selected
   * track reads as "open in every direction". */
  shared?: string;
  /** Row label in the expanded slot list. */
  label: string;
  /** Short prose form for Beau's advisor line, no article: 'flannel shirt'. */
  short: string;
  /** Garment-type test over the piece signal (slot + name + material + pattern). */
  type: (piece: PieceLike, signal: string) => boolean;
  /** Neutral/classic palette for the slot. Undefined = any colour qualifies.
   * A piece with colour evidence fills the slot only when at least one
   * evidenced colour is in this list; no evidence = benefit of the doubt. */
  colors?: string[];
  /** When this matches the signal, the colour gate is waived (a checked
   * flannel is essential whatever its check colours are). */
  anyColorWhen?: RegExp;
}

interface TrackCategory {
  id: string;
  label: string;
  slots: EssentialSlot[];
}

interface ArchetypeTrack {
  /** The archetype id this track belongs to. */
  id: string;
  /** Fallback display name when no selected archetype names it. */
  label: string;
  categories: TrackCategory[];
}

// Palette groups (ids from COLOR_OPTIONS; 'oatmeal' maps to cream/ecru/stone).
const WHITES = ['white', 'off-white'];
const OATMEALS = ['cream', 'ecru', 'stone', 'linen'];
const GREYS = ['grey', 'light grey', 'dark grey', 'charcoal'];
const EARTH = [
  'brown', 'dark brown', 'light brown', 'tan', 'camel', 'sand', 'khaki', 'stone', 'olive',
  'rust', 'terracotta', 'forest green', 'bottle green', 'sage', 'mustard', 'burgundy',
];

const isTop = (p: PieceLike) => p.category === 'tops';
const isKnit = (p: PieceLike) => p.category === 'knitwear';
const isKnitOrTop = (p: PieceLike) => p.category === 'tops' || p.category === 'knitwear';
const isBottom = (p: PieceLike) => p.category === 'bottoms';
const isShoe = (p: PieceLike) => p.category === 'shoes';
const isOuter = (p: PieceLike) => p.category === 'outerwear';

const DRESS_SHIRT = (p: PieceLike, s: string) => isTop(p) && /dress[- ]shirt|poplin|twill shirt|formal shirt|structured collar/.test(s);
const CASUAL_SHIRT = (p: PieceLike, s: string) => isTop(p) && /ocbd|oxford|button[- ]?down|chambray|linen shirt|casual[- ]shirt|camp collar/.test(s);
const OCBD = (p: PieceLike, s: string) => isTop(p) && /ocbd|oxford|button[- ]?down/.test(s);
const FINE_KNIT = (p: PieceLike, s: string) => isKnitOrTop(p) && /polo|rollneck|roll neck|turtleneck|merino|fine[- ]?knit|smedley|sea island/.test(s);
const HEAVY_KNIT = (p: PieceLike, s: string) => isKnitOrTop(p) && /aran|shetland|guernsey|lambswool|cable|chunky|heavy|fisherman/.test(s);
// Shorts never fill a trouser slot.
const notShorts = (s: string) => !/\bshorts?\b/.test(s);
const CHINO = (p: PieceLike, s: string) => isBottom(p) && notShorts(s) && /chino|khakis|casual trouser/.test(s);
const TAILORED_TROUSER = (p: PieceLike, s: string) => isBottom(p) && notShorts(s) && !/cord|moleskin/.test(s) && /tailored|high-rise|high rise|wool trouser|flannel|dress trouser|suit trouser|trousers|slacks|pleated/.test(s);
const DENIM = (p: PieceLike, s: string) => isBottom(p) && notShorts(s) && /jean|denim|selvedge/.test(s);
const SNEAKER = (p: PieceLike, s: string) => isShoe(p) && /sneaker|trainer|tennis|plimsoll|canvas shoe|gat\b/.test(s);
const BLAZER = (p: PieceLike, s: string) => (isOuter(p) || p.category === 'formalwear') && /blazer|sport coat|sports coat|sport jacket|tweed jacket|teba|unstructured jacket/.test(s);

const IVY_TRACK: ArchetypeTrack = {
  id: 'ivy',
  label: 'Classic Ivy',
  categories: [
    {
      id: 'tops', label: 'Tops', slots: [
        { id: 'ocbd', shared: 'ocbd', label: 'Oxford button-down shirt (white, blue or university stripe)', short: 'Oxford button-down', type: OCBD, colors: [...WHITES, 'light blue', 'blue', 'pink'] },
        { id: 'crew-knit', shared: 'heavy-knit', label: 'Crew-neck knitwear (Shetland, lambswool or merino)', short: 'crew-neck knit', type: (p, s) => isKnitOrTop(p) && /crew|shetland|lambswool|merino|jumper|sweater/.test(s), colors: [...OATMEALS, 'navy', ...GREYS, 'burgundy', 'forest green'] },
      ],
    },
    {
      id: 'bottoms', label: 'Bottoms', slots: [
        { id: 'chino', shared: 'chino', label: 'Chinos in khaki, navy or olive', short: 'chino in a classic colour', type: CHINO, colors: ['khaki', 'stone', 'tan', 'sand', 'camel', 'navy', 'olive'] },
      ],
    },
    {
      id: 'shoes', label: 'Shoes', slots: [
        { id: 'loafer-buck', shared: 'smart-casual-shoe', label: 'Loafers or suede bucks', short: 'loafer or suede buck', type: (p, s) => isShoe(p) && /loafer|buck|moccasin/.test(s) },
      ],
    },
    {
      id: 'outerwear', label: 'Tailoring & outerwear', slots: [
        { id: 'blazer', shared: 'blazer', label: 'Sports jacket or blazer (navy or tweed)', short: 'sports jacket or blazer', type: BLAZER, colors: ['navy', ...GREYS, ...EARTH] },
      ],
    },
  ],
};

const COUNTRY_TRACK: ArchetypeTrack = {
  id: 'country',
  label: 'British Country',
  categories: [
    {
      id: 'tops', label: 'Tops', slots: [
        { id: 'flannel-check', shared: 'work-shirt', label: 'Flannel or check shirt', short: 'flannel or check shirt', type: (p, s) => isTop(p) && /flannel|brushed cotton|check|plaid|tartan|gingham/.test(s) },
        { id: 'heavy-knit', shared: 'heavy-knit', label: 'Heavy wool knitwear (Shetland or Aran)', short: 'heavy wool knit', type: HEAVY_KNIT, colors: [...OATMEALS, 'navy', ...GREYS, ...EARTH] },
        { id: 'overshirt-gilet', label: 'Hardy overshirt or gilet', short: 'hardy overshirt or gilet', type: (p, s) => (isOuter(p) || isTop(p) || isKnit(p)) && /overshirt|shacket|shirt jacket|gilet|quilted vest|down vest/.test(s) },
      ],
    },
    {
      id: 'bottoms', label: 'Bottoms', slots: [
        { id: 'moleskin-cord', label: 'Moleskin or corduroy trousers', short: 'moleskin or corduroy trouser', type: (p, s) => isBottom(p) && notShorts(s) && /moleskin|cord|corduroy/.test(s), colors: EARTH },
      ],
    },
    {
      id: 'shoes', label: 'Shoes', slots: [
        { id: 'brogue', label: 'Brogues (dark tan or brown)', short: 'brogue', type: (p, s) => isShoe(p) && /brogue|wingtip/.test(s), colors: ['brown', 'dark brown', 'light brown', 'tan', 'black'] },
      ],
    },
    {
      id: 'outerwear', label: 'Outerwear', slots: [
        { id: 'wax-tweed', label: 'Wax jacket or tweed layer', short: 'wax jacket or tweed layer', type: (p, s) => (isOuter(p) || p.category === 'formalwear') && /wax|barbour|bedale|beaufort|tweed|field/.test(s), colors: ['olive', 'brown', 'dark brown', 'navy', 'tan', 'khaki', ...EARTH] },
      ],
    },
  ],
};

const CONTINENTAL_TRACK: ArchetypeTrack = {
  id: 'continental',
  label: 'Continental',
  categories: [
    {
      id: 'tops', label: 'Tops', slots: [
        { id: 'fine-knit', shared: 'fine-knit', label: 'Fine knitwear or turtleneck (merino or rollneck)', short: 'fine knit or turtleneck', type: FINE_KNIT, colors: ['navy', ...GREYS, 'camel', ...OATMEALS, 'black', 'brown', 'dark brown'] },
      ],
    },
    {
      id: 'bottoms', label: 'Bottoms', slots: [
        { id: 'fitted-trouser', shared: 'smart-trouser', label: 'Well-fitted trousers in mid-weight wool or cotton', short: 'well-fitted trouser', type: TAILORED_TROUSER, colors: ['navy', ...GREYS, ...OATMEALS, 'brown', 'dark brown', 'tan', 'camel'] },
      ],
    },
    {
      id: 'shoes', label: 'Shoes', slots: [
        { id: 'chelsea-loafer', shared: 'smart-casual-shoe', label: 'Chelsea boots or loafers', short: 'Chelsea boot or loafer', type: (p, s) => isShoe(p) && /chelsea|loafer|moccasin/.test(s) },
      ],
    },
    {
      id: 'outerwear', label: 'Tailoring & outerwear', slots: [
        { id: 'unstructured-blazer', shared: 'blazer', label: 'Unstructured blazer (dark or neutral palette)', short: 'unstructured blazer', type: BLAZER, colors: ['navy', ...GREYS, 'black', ...OATMEALS, 'brown', 'dark brown', 'camel'] },
      ],
    },
  ],
};

const RELAXED_TRACK: ArchetypeTrack = {
  id: 'relaxed',
  label: 'Smart Casual',
  categories: [
    {
      id: 'tops', label: 'Tops', slots: [
        { id: 'neat-shirt-polo', shared: 'smart-shirt', label: 'Neat shirt or polo', short: 'neat shirt or polo', type: (p, s) => DRESS_SHIRT(p, s) || CASUAL_SHIRT(p, s) || (isKnitOrTop(p) && /polo/.test(s)) },
        { id: 'layer-knit', shared: 'fine-knit', label: 'Layering knit', short: 'layering knit', type: (p, s) => isKnit(p) || FINE_KNIT(p, s) },
      ],
    },
    {
      id: 'bottoms', label: 'Bottoms', slots: [
        { id: 'chino-slim', shared: 'chino', label: 'Quality chinos or slim trousers', short: 'quality chino or slim trouser', type: (p, s) => CHINO(p, s) || TAILORED_TROUSER(p, s) },
      ],
    },
    {
      id: 'shoes', label: 'Shoes', slots: [
        { id: 'clean-shoe', shared: 'smart-casual-shoe', label: 'Clean white sneakers or loafers', short: 'clean sneaker or loafer', type: (p, s) => SNEAKER(p, s) || /loafer|moccasin/.test(s) && isShoe(p) },
      ],
    },
    {
      id: 'outerwear', label: 'Outerwear', slots: [
        { id: 'unlined-cardigan', label: 'Unlined jacket or cardigan', short: 'unlined jacket or cardigan', type: (p, s) => BLAZER(p, s) || ((isKnit(p) || isOuter(p)) && /cardigan|shawl|unlined|unstructured/.test(s)) },
      ],
    },
  ],
};

const SPORTSMAN_TRACK: ArchetypeTrack = {
  id: 'sportsman',
  label: 'American Outdoors',
  categories: [
    {
      id: 'tops', label: 'Tops', slots: [
        { id: 'chambray-flannel', shared: 'work-shirt', label: 'Chambray or flannel shirt', short: 'chambray or flannel shirt', type: (p, s) => isTop(p) && /chambray|flannel|brushed cotton/.test(s) },
      ],
    },
    {
      id: 'bottoms', label: 'Bottoms', slots: [
        { id: 'heavy-denim-canvas', shared: 'denim', label: 'Heavy denim or canvas trousers', short: 'pair of heavy denim or canvas trousers', type: (p, s) => DENIM(p, s) || (isBottom(p) && notShorts(s) && /canvas|duck cotton|dungaree/.test(s)) },
      ],
    },
    {
      id: 'shoes', label: 'Shoes', slots: [
        { id: 'work-boot', shared: 'rugged-boot', label: 'Workwear boots or duck boots', short: 'workwear or duck boot', type: (p, s) => isShoe(p) && /boot/.test(s) },
      ],
    },
    {
      id: 'outerwear', label: 'Outerwear', slots: [
        { id: 'insulated-layer', label: 'Insulated or quilted vest or jacket', short: 'insulated or quilted layer', type: (p, s) => (isOuter(p) || isKnit(p)) && /quilt|puffer|down|insulat|gilet|\bvest\b|fleece/.test(s) },
      ],
    },
  ],
};

const WORKWEAR_TRACK: ArchetypeTrack = {
  id: 'workwear',
  label: 'Workwear',
  categories: [
    {
      id: 'tops', label: 'Tops', slots: [
        { id: 'chambray', shared: 'work-shirt', label: 'Chambray shirt', short: 'chambray shirt', type: (p, s) => isTop(p) && /chambray|work shirt/.test(s) },
      ],
    },
    {
      id: 'bottoms', label: 'Bottoms', slots: [
        { id: 'dark-denim-canvas', shared: 'denim', label: 'Dark denim or canvas trousers', short: 'pair of dark denim or canvas trousers', type: (p, s) => DENIM(p, s) || (isBottom(p) && notShorts(s) && /canvas|duck cotton/.test(s)), colors: ['navy', 'blue', 'black', 'indigo', ...EARTH] },
      ],
    },
    {
      id: 'shoes', label: 'Shoes', slots: [
        { id: 'leather-boot', shared: 'rugged-boot', label: 'Sturdy leather boots', short: 'sturdy leather boot', type: (p, s) => isShoe(p) && /boot/.test(s) },
      ],
    },
    {
      id: 'outerwear', label: 'Outerwear', slots: [
        { id: 'chore-denim-jacket', label: 'Chore coat or denim jacket', short: 'chore coat or denim jacket', type: (p, s) => isOuter(p) && /chore|denim jacket|trucker|engineered/.test(s) },
      ],
    },
  ],
};

const MILITARY_TRACK: ArchetypeTrack = {
  id: 'military',
  label: 'Military / Utility',
  categories: [
    {
      id: 'tops', label: 'Tops', slots: [
        { id: 'ocbd-military', shared: 'ocbd', label: 'OCBD or military-cut shirt', short: 'OCBD or military-cut shirt', type: (p, s) => OCBD(p, s) || (isTop(p) && /military|fatigue shirt|utility shirt|field shirt/.test(s)) },
      ],
    },
    {
      id: 'bottoms', label: 'Bottoms', slots: [
        { id: 'cargo-utility', label: 'Cargo or utility trousers', short: 'cargo or utility trouser', type: (p, s) => isBottom(p) && notShorts(s) && /cargo|utility|fatigue|ripstop|field pant/.test(s) },
      ],
    },
    {
      id: 'shoes', label: 'Shoes', slots: [
        { id: 'combat-boot', shared: 'rugged-boot', label: 'Combat or service boots', short: 'combat or service boot', type: (p, s) => isShoe(p) && /combat|service|military|jump boot|\bboot/.test(s) },
      ],
    },
    {
      id: 'outerwear', label: 'Outerwear', slots: [
        { id: 'field-jacket', label: 'M-65 or field jacket', short: 'M-65 or field jacket', type: (p, s) => isOuter(p) && /m-?65|m-?43|m-?1943|field|fatigue jacket|deck jacket/.test(s) },
      ],
    },
  ],
};

const NAUTICAL_TRACK: ArchetypeTrack = {
  id: 'nautical',
  label: 'Coastal / Nautical',
  categories: [
    {
      id: 'tops', label: 'Tops', slots: [
        { id: 'breton', label: 'Breton stripe shirt', short: 'Breton stripe', type: (p, s) => isKnitOrTop(p) && /breton|stripe/.test(s), colors: ['navy', 'blue', ...WHITES, 'cream'] },
        { id: 'guernsey', shared: 'heavy-knit', label: 'Guernsey or fisherman knit', short: 'Guernsey or fisherman knit', type: (p, s) => isKnitOrTop(p) && /guernsey|fisherman|aran|cable/.test(s), colors: ['navy', ...OATMEALS, ...WHITES, ...GREYS] },
      ],
    },
    {
      id: 'bottoms', label: 'Bottoms', slots: [
        { id: 'navy-chino-white-trouser', shared: 'chino', label: 'Navy chinos or white trousers', short: 'navy chino or white trouser', type: (p, s) => isBottom(p) && notShorts(s) && /chino|khaki|trouser/.test(s), colors: ['navy', ...WHITES, 'cream', 'stone', 'sand', 'ecru'] },
      ],
    },
    {
      id: 'shoes', label: 'Shoes', slots: [
        { id: 'deck-sneaker', label: 'Deck shoes or white canvas sneakers', short: 'deck shoe or white canvas sneaker', type: (p, s) => (isShoe(p) && /deck|boat/.test(s)) || SNEAKER(p, s), colors: [...WHITES, 'cream', 'navy', 'tan', 'brown'] },
      ],
    },
  ],
};

const RIVIERA_TRACK: ArchetypeTrack = {
  id: 'riviera',
  label: 'Mediterranean / Riviera',
  categories: [
    {
      id: 'tops', label: 'Tops', slots: [
        { id: 'linen-shirt', label: 'Linen or lightweight cotton shirt (open collar)', short: 'open-collar linen shirt', type: (p, s) => isTop(p) && /linen|camp collar|cuban collar|open collar|seersucker/.test(s) },
      ],
    },
    {
      id: 'bottoms', label: 'Bottoms', slots: [
        { id: 'linen-bottom', label: 'Linen trousers or shorts', short: 'pair of linen trousers or shorts', type: (p, s) => isBottom(p) && /linen/.test(s), colors: [...WHITES, 'cream', 'navy', 'tan', 'sand', 'stone', 'linen', 'ecru'] },
      ],
    },
    {
      id: 'shoes', label: 'Shoes', slots: [
        { id: 'sandal-espadrille', label: 'Leather sandals or espadrilles', short: 'leather sandal or espadrille', type: (p, s) => isShoe(p) && /sandal|espadrille|alpargata|slide/.test(s) },
      ],
    },
    {
      id: 'outerwear', label: 'Tailoring & outerwear', slots: [
        { id: 'light-blazer', shared: 'blazer', label: 'Light unlined blazer', short: 'light unlined blazer', type: BLAZER, colors: [...WHITES, 'cream', 'navy', 'tan', 'sand', 'stone', 'light blue'] },
      ],
    },
  ],
};

/** Every track's category sections run in the app's ONE canonical menswear
 * order (category-order.ts) — Tops · Knitwear · Outerwear · Bottoms ·
 * Formalwear · Base Layers · Shoes · Accessories — whatever order the track
 * happens to be written in above. Change the order in category-order.ts. */
function inCanonicalOrder(track: ArchetypeTrack): ArchetypeTrack {
  return { ...track, categories: sortByCategoryOrder(track.categories, (cat) => cat.id) };
}

const TRACKS: Record<string, ArchetypeTrack> = {
  ivy: inCanonicalOrder(IVY_TRACK),
  country: inCanonicalOrder(COUNTRY_TRACK),
  continental: inCanonicalOrder(CONTINENTAL_TRACK),
  relaxed: inCanonicalOrder(RELAXED_TRACK),
  sportsman: inCanonicalOrder(SPORTSMAN_TRACK),
  workwear: inCanonicalOrder(WORKWEAR_TRACK),
  military: inCanonicalOrder(MILITARY_TRACK),
  nautical: inCanonicalOrder(NAUTICAL_TRACK),
  riviera: inCanonicalOrder(RIVIERA_TRACK),
};

/** Legacy / retired archetype ids → the nearest live track. */
const TRACK_ALIAS: Record<string, string> = {
  moto: 'workwear',
  formal: 'continental',
};

interface ResolvedTrack {
  track: ArchetypeTrack;
  /** The selected archetypes that route to this track, for display. */
  archetypeLabels: string[];
}

/** Resolve the selected archetypes into their essential tracks, in
 * selection order, de-duplicated. No selection defaults to Smart Casual —
 * the daily register. */
function tracksFor(archetypes: string[]): ResolvedTrack[] {
  const out: ResolvedTrack[] = [];
  for (const raw of archetypes) {
    const id = (raw || '').toLowerCase();
    const trackId = TRACKS[id] ? id : TRACK_ALIAS[id] || 'relaxed';
    const existing = out.find((f) => f.track.id === trackId);
    const archetypeLabel = vocabLabel.archetype(raw) || raw;
    if (existing) {
      if (!existing.archetypeLabels.includes(archetypeLabel)) existing.archetypeLabels.push(archetypeLabel);
    } else {
      out.push({ track: TRACKS[trackId], archetypeLabels: [archetypeLabel] });
    }
  }
  if (out.length === 0) out.push({ track: TRACKS.relaxed, archetypeLabels: [] });
  return out;
}

function trackDisplayName(resolved: ResolvedTrack): string {
  return resolved.archetypeLabels.length > 0 ? resolved.archetypeLabels.join(' + ') : resolved.track.label;
}

/** The colour gate: no evidence = benefit of the doubt; any evidenced
 * neutral = pass; only non-neutral evidence = the slot stays open. */
function slotColorOk(slot: EssentialSlot, piece: PieceLike, signal: string): boolean {
  if (!slot.colors) return true;
  if (slot.anyColorWhen && slot.anyColorWhen.test(signal)) return true;
  const evidence = colorEvidence(piece);
  if (evidence.length === 0) return true;
  return evidence.some((c) => (slot.colors as string[]).includes(c));
}

function pieceFillsSlot(slot: EssentialSlot, piece: PieceLike): boolean {
  const signal = signalOf(piece);
  return slot.type(piece, signal) && slotColorOk(slot, piece, signal);
}

/** Per-track, per-category fill map. A piece may fill SEVERAL slots across
 * tracks (that's the bridging union); repeats within one slot still count
 * once. */
interface SlotFill {
  slot: EssentialSlot;
  filledBy: PieceLike[];
}

function fillTrack(track: ArchetypeTrack, pieces: PieceLike[]): Map<string, SlotFill[]> {
  const byCategory = new Map<string, SlotFill[]>();
  for (const category of track.categories) {
    byCategory.set(
      category.id,
      category.slots.map((slot) => ({ slot, filledBy: pieces.filter((piece) => pieceFillsSlot(slot, piece)) })),
    );
  }
  return byCategory;
}

function listJoin(items: string[]): string {
  if (items.length <= 1) return items[0] || '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function withArticle(short: string): string {
  if (/^(pair|breton|guernsey|ocbd|m-65)/i.test(short)) {
    return short
      .replace(/^Breton/i, 'a Breton')
      .replace(/^Guernsey/i, 'a Guernsey')
      .replace(/^pair/i, 'a pair')
      .replace(/^OCBD/i, 'an OCBD')
      .replace(/^M-65/i, 'an M-65');
  }
  return /^[aeiou]/i.test(short) ? `an ${short}` : `a ${short}`;
}

/** Beau's advisor read for one category or track — warm, specific, never a
 * bare fraction: "your flannel shirt is covered — what's missing is a heavy
 * wool knit and a hardy overshirt or gilet." */
function advisorLine(covered: EssentialSlot[], missing: EssentialSlot[]): string {
  if (missing.length === 0) return 'Every essential here is covered — what follows is refinement, not need.';
  if (covered.length === 0) {
    return `Nothing here fills an essential role yet — what's needed: ${listJoin(missing.map((s) => withArticle(s.short)))}.`;
  }
  const coveredNames = covered.map((s) => `${s.short}`);
  const coveredPhrase = covered.length === 1 ? `your ${coveredNames[0]} is covered` : `your ${listJoin(coveredNames)} are covered`;
  return `${coveredPhrase[0].toUpperCase()}${coveredPhrase.slice(1)} — what's missing is ${listJoin(missing.map((s) => withArticle(s.short)))}.`;
}

export interface MilestoneDetail {
  label: string;
  met: boolean;
}

export interface Milestone {
  id: string;
  label: string;
  /** What this stage means — shown when the wardrobe is empty and in the expanded row. */
  meaning: string;
  done: number;
  total: number;
  details: MilestoneDetail[];
  /** Beau's advisor read shown without expanding the row. */
  summary?: string;
}

export interface FamilyCoverage {
  id: string;
  /** Display name derived from the SELECTED archetype ("British Country"),
   * falling back to the track's own name. */
  label: string;
  percent: number;
  categories: Milestone[];
  /** Open slots, for gap notes and recommendations. */
  missing: Array<{ slotId: string; shared?: string; short: string; category: string }>;
  /** Track-level roll-up for the milestone row display. */
  done: number;
  total: number;
  summary: string;
  details: MilestoneDetail[];
}

export interface MilestoneSummary {
  /** Legacy journey stages retained for Curated recommendation grouping. */
  milestones: Milestone[];
  /** Archetype essential coverage of the PRIMARY track (back-compat). */
  coverage?: Milestone[];
  /** Per-archetype coverage — ONE separate track per selected archetype. */
  families: FamilyCoverage[];
  /** Bridging pieces — they fill essential slots in two or more selected
   * archetype tracks, so one piece advances several tracks at once. */
  doubleDuty: Array<{ piece: PieceLike; familyLabels: string[] }>;
  /** Essential concepts missing in EVERY selected track — the bridging
   * zone, and the smartest gaps to fill first. */
  sharedGaps: string[];
  /** The archetypes this summary was computed for. */
  archetypes: string[];
  /** Overall slot coverage, 0–100 (mean across tracks when several). */
  percent: number;
}

function buildTrackCoverage(resolved: ResolvedTrack, pieces: PieceLike[]): FamilyCoverage {
  const fills = fillTrack(resolved.track, pieces);
  const categories: Milestone[] = [];
  const missing: FamilyCoverage['missing'] = [];
  const allCovered: EssentialSlot[] = [];
  const allOpen: EssentialSlot[] = [];
  const details: MilestoneDetail[] = [];
  let done = 0;
  let total = 0;
  for (const category of resolved.track.categories) {
    const slotFills = fills.get(category.id) || [];
    const covered = slotFills.filter((f) => f.filledBy.length > 0).map((f) => f.slot);
    const open = slotFills.filter((f) => f.filledBy.length === 0).map((f) => f.slot);
    for (const slot of open) missing.push({ slotId: slot.id, shared: slot.shared, short: slot.short, category: category.id });
    allCovered.push(...covered);
    allOpen.push(...open);
    done += covered.length;
    total += slotFills.length;
    for (const f of slotFills) details.push({ label: f.slot.label, met: f.filledBy.length > 0 });
    categories.push({
      id: `${resolved.track.id}-${category.id}`,
      label: category.label,
      meaning: `The distinct essential roles a ${trackDisplayName(resolved)} wardrobe calls for. Repeats of the same garment fill one slot only, and a piece only counts when its colour is classic for the role.`,
      done: covered.length,
      total: slotFills.length,
      details: slotFills.map((f) => ({ label: f.slot.label, met: f.filledBy.length > 0 })),
      summary: advisorLine(covered, open),
    });
  }
  return {
    id: resolved.track.id,
    label: trackDisplayName(resolved),
    percent: total > 0 ? Math.round((done / total) * 100) : 0,
    categories,
    missing,
    done,
    total,
    summary: advisorLine(allCovered, allOpen),
    details,
  };
}

export function computeMilestones(pieces: WardrobePiece[], archetypes: string[] = []): MilestoneSummary {
  const pieceList = pieces as PieceLike[];
  const ownedSlots = new Set(pieces.map((p) => p.slot).filter(Boolean) as string[]);
  const seasonCount = (tags: string[]) =>
    pieces.filter((p) => (p.seasons || []).some((s) => tags.includes(s))).length;

  // 1. Essentials — ten core pieces (legacy journey stage).
  const essentialDetails = ESSENTIALS.map((e) => ({
    label: e.label,
    met: e.slots.some((s) => ownedSlots.has(s)),
  }));

  // 2. Occasion coverage — can each occasion be dressed END-TO-END?
  const coverage = assessOccasionCoverage(pieces);
  const occasionDetails: MilestoneDetail[] = coverage.map((occasion) => ({
    label: occasion.served
      ? occasion.label
      : `${occasion.label} — still needs ${occasion.missing.map((g) => g.label).join('; ')}`,
    met: occasion.served,
  }));

  // 3. Seasonal coverage — summer, winter, transitional.
  const seasonDetails: MilestoneDetail[] = [
    { label: 'Summer (2+ SS or year-round pieces)', met: seasonCount(['ss', 'year-round']) >= 2 },
    { label: 'Winter (2+ AW or year-round pieces)', met: seasonCount(['aw', 'year-round']) >= 2 },
    { label: 'Transitional (2+ year-round pieces)', met: seasonCount(['year-round']) >= 2 },
  ];

  // 4. Accent pieces — colour or accessories with character.
  const accentPieces = pieces.filter(
    (p) => p.category === 'accessories' || p.category === 'hats' || (p.colors || []).some((c) => ACCENT_COLORS.has(c.toLowerCase())),
  );
  const accentDetails: MilestoneDetail[] = [
    { label: 'First accent — colour or an accessory with character', met: accentPieces.length >= 1 },
    { label: 'Second accent — outfits start reading as yours', met: accentPieces.length >= 2 },
  ];

  // 5. Investment anchors — distinct long-hold centrepiece slots owned.
  const anchorsOwned = ANCHOR_SLOTS.filter((a) => ownedSlots.has(a.id));
  const anchorDetails: MilestoneDetail[] = [1, 2, 3].map((n) => ({
    label: n <= anchorsOwned.length
      ? `Anchor ${n}: ${anchorsOwned[n - 1].label}`
      : `Anchor ${n}: a centrepiece worth spending properly on`,
    met: n <= anchorsOwned.length,
  }));

  const milestones: Milestone[] = [
    {
      id: 'essentials',
      label: 'Essentials',
      meaning: 'The ten core pieces every wardrobe needs — a proper shirt, dark trousers, a clean sneaker, and so on.',
      done: essentialDetails.filter((d) => d.met).length,
      total: ESSENTIALS.length,
      details: essentialDetails,
    },
    {
      id: 'occasions',
      label: 'Occasion coverage',
      meaning: 'The occasions your wardrobe can dress for end to end — formal, business, smart casual, real weather, real heat — a full outfit each, never just one piece with the right tag.',
      done: occasionDetails.filter((d) => d.met).length,
      total: occasionDetails.length,
      details: occasionDetails,
    },
    {
      id: 'seasons',
      label: 'Seasonal coverage',
      meaning: 'Covered for summer, winter, and the transitional months in between.',
      done: seasonDetails.filter((d) => d.met).length,
      total: seasonDetails.length,
      details: seasonDetails,
    },
    {
      id: 'accents',
      label: 'Accent pieces',
      meaning: 'Character-defining pieces — colour, texture, accessories — that make outfits yours.',
      done: accentDetails.filter((d) => d.met).length,
      total: accentDetails.length,
      details: accentDetails,
    },
    {
      id: 'anchors',
      label: 'Investment anchors',
      meaning: 'Long-hold, high-quality centrepieces worth spending properly on — an overcoat, welted shoes, a real blazer. These only appear once everything before them is covered.',
      done: anchorDetails.filter((d) => d.met).length,
      total: anchorDetails.length,
      details: anchorDetails,
    },
  ];

  // Per-archetype essential coverage — one SEPARATE track per selection.
  const resolvedTracks = tracksFor(archetypes);
  const families = resolvedTracks.map((resolved) => buildTrackCoverage(resolved, pieceList));

  // Bridging pieces: fill at least one essential slot in 2+ tracks — one
  // piece advancing several milestone tracks at once.
  const doubleDuty: MilestoneSummary['doubleDuty'] = [];
  if (resolvedTracks.length > 1) {
    for (const piece of pieceList) {
      const filledIn: string[] = [];
      for (const resolved of resolvedTracks) {
        const hits = resolved.track.categories.some((category) => category.slots.some((slot) => pieceFillsSlot(slot, piece)));
        if (hits) filledIn.push(trackDisplayName(resolved));
      }
      if (filledIn.length > 1) doubleDuty.push({ piece, familyLabels: filledIn });
    }
  }

  // The bridging zone: essential concepts (shared keys) open in EVERY
  // selected track — one well-chosen piece would advance all of them.
  let sharedGaps: string[] = [];
  if (families.length > 1) {
    const first = families[0].missing.filter((m) => m.shared);
    sharedGaps = first
      .filter((m) => families.every((f) => f.missing.some((other) => other.shared === m.shared)))
      .map((m) => m.short);
  }

  const percent = families.length > 0
    ? Math.round(families.reduce((acc, f) => acc + f.percent, 0) / families.length)
    : 0;

  return {
    milestones,
    coverage: families[0]?.categories || [],
    families,
    doubleDuty,
    sharedGaps,
    archetypes,
    percent,
  };
}

// ---------------------------------------------------------------------------
// Curated × milestones — map feed cards onto the journey's open gaps
// ---------------------------------------------------------------------------

/** Journey order — Essentials → Occasion coverage → Seasonal → Accents → Investment anchors. */
export const MILESTONE_ORDER = ['essentials', 'occasions', 'seasons', 'accents', 'anchors'] as const;

/** Plain stage names — used wherever a card explains which milestone it serves. */
export const MILESTONE_LABELS: Record<string, string> = {
  essentials: 'Essentials',
  occasions: 'Occasion coverage',
  seasons: 'Seasonal coverage',
  accents: 'Accent pieces',
  anchors: 'Investment anchors',
};

// Section headers are the ONE place milestone context appears (Pass Seven) —
// plain stage names, no "Next step" / "Next up" label language anywhere.
export const MILESTONE_SECTION_COPY: Record<string, { current: string; next: string }> = {
  essentials: { current: 'Complete your essentials', next: 'Your essentials' },
  occasions: { current: 'Occasions your wardrobe can\u2019t yet dress for', next: 'Occasion coverage' },
  seasons: { current: 'Round out your seasonal coverage', next: 'Seasonal coverage' },
  accents: { current: 'Add your accent pieces', next: 'Accent pieces' },
  anchors: { current: 'Place your investment anchors', next: 'Investment anchors' },
};

/** The first incomplete stage in journey order — where the user is now. */
export function currentMilestoneId(summary: MilestoneSummary): string {
  const open = summary.milestones.find((m) => m.done < m.total);
  return open ? open.id : 'anchors';
}

interface EssentialFillInfo {
  /** Order index of the FIRST open essential slot the candidate would newly
   * fill across the selected tracks. -1 = none. */
  index: number;
  /** Display names of every selected track where the candidate fills an
   * OPEN essential — two or more means it's a bridging piece. */
  servedLabels: string[];
}

function essentialFillInfo(pieces: PieceLike[], candidate: PieceLike, archetypes: string[]): EssentialFillInfo {
  const resolved = tracksFor(archetypes);
  let index = 0;
  let best = -1;
  const servedLabels: string[] = [];
  for (const resolvedTrack of resolved) {
    let servesThis = false;
    for (const category of resolvedTrack.track.categories) {
      for (const slot of category.slots) {
        const alreadyFilled = pieces.some((piece) => pieceFillsSlot(slot, piece));
        if (!alreadyFilled && pieceFillsSlot(slot, candidate)) {
          if (best < 0) best = index;
          servesThis = true;
        }
        index += 1;
      }
    }
    if (servesThis) servedLabels.push(trackDisplayName(resolvedTrack));
  }
  return { index: best, servedLabels };
}

/** The archetype line Beau attaches to a recommendation — which selected
 * style direction(s) the piece serves, bridging pieces called out first. */
function archetypeNoteFor(served: string[], allSelected: string[]): string | null {
  if (served.length === 0 || allSelected.length === 0) return null;
  if (served.length >= 2) {
    return `Bridges ${listJoin(served)} — one piece advances ${served.length === 2 ? 'both' : 'all'} of your tracks.`;
  }
  const others = allSelected.filter((l) => l !== served[0]);
  if (others.length > 0) {
    return `A ${served[0]} essential — it'll work alongside your ${listJoin(others)} pieces too.`;
  }
  return `A ${served[0]} essential.`;
}

/**
 * Assign each curated card to the EARLIEST journey stage with an open gap the
 * piece would genuinely fill, with a priority (lower = more foundational).
 * Cards that fill no open gap return null — the feed drops them so every
 * recommendation is a real step forward.
 *
 * DECISION-TREE ORDERING: the archetype essential tracks are the FIRST
 * signal after the foundation gate — an item that fills an open essential
 * slot for the user's selected style direction(s) leads the feed, and a
 * BRIDGING piece (it advances several selected archetypes at once) leads
 * pieces that serve only one. Every assignment carries the archetype note
 * so the card can say which direction(s) the piece serves.
 */
export function assignCardToMilestone(
  card: FeedCard,
  pieces: WardrobePiece[],
  summary: MilestoneSummary,
): { stage: string; priority: number; occasion?: { id: string; label: string }; archetypeNote?: string | null } | null {
  const item = card.item;
  const ownedSlots = new Set(pieces.map((p) => p.slot).filter(Boolean) as string[]);

  // Which selected tracks does this item's catalogue tagging serve? Used
  // for the card's archetype note on non-essential stages too. With NO
  // archetypes selected the default track still drives ordering, but no
  // archetype note is shown — the user never chose that direction.
  const hasArchetypes = (summary.archetypes || []).length > 0;
  const selectedIds = (summary.archetypes || []).map((a) => (a || '').toLowerCase());
  const selectedLabels = hasArchetypes ? tracksFor(summary.archetypes || []).map(trackDisplayName) : [];
  const taggedServed = Array.from(new Set(
    ((item as { archetypes?: string[] }).archetypes || [])
      .filter((a) => selectedIds.includes((a || '').toLowerCase()))
      .map((a) => vocabLabel.archetype(a) || a),
  ));

  const candidatePiece = {
    id: -1,
    name: item.name || '',
    brand: (item as { brand?: string | null }).brand || null,
    category: item.category,
    slot: item.slot || null,
    colors: item.colors || [],
    seasons: [],
    occasions: [],
    photo_url: null,
    created_at: '',
  } as PieceLike;

  // STEP 2 + 3 — archetype essentials first, bridging pieces before
  // single-archetype pieces (the multi-archetype priority rule).
  const fill = essentialFillInfo(pieces as PieceLike[], candidatePiece, summary.archetypes || []);
  if (fill.index >= 0) {
    const served = fill.servedLabels.length > 0 ? fill.servedLabels : taggedServed;
    const bridgeBonus = 2500 * Math.max(0, fill.servedLabels.length - 1);
    return {
      stage: 'essentials',
      priority: -20000 + fill.index - bridgeBonus,
      archetypeNote: archetypeNoteFor(served, selectedLabels),
    };
  }

  const archetypeNote = archetypeNoteFor(taggedServed, selectedLabels);

  // The expert completeness model assigns the functional gap before product
  // scoring. Respect that diagnosis directly so required pieces cannot be
  // dropped merely because a legacy slot checklist does not know the role.
  if (card.gap) {
    const stageForKind: Record<MenswearGapKind, string> = {
      foundational: 'essentials',
      occasion: 'occasions',
      seasonal: 'seasons',
      coherence: 'accents',
      investment: 'anchors',
    };
    return { stage: stageForKind[card.gap.kind], priority: -10000 + card.gap.priority, archetypeNote };
  }
  const byId = new Map(summary.milestones.map((m) => [m.id, m]));
  // High urgency pulls a card to the front of its stage (lower = earlier).
  const urgencyBoost = outfitGapUrgency(item, pieces) * 100;

  // 1. Essentials — the most consequential unmet gap first (dress shoes for
  //    the suit owner before a third pair of chinos), then checklist order.
  const essentials = byId.get('essentials');
  if (essentials && essentials.done < essentials.total) {
    const idx = ESSENTIALS.findIndex(
      (check) => !check.slots.some((s) => ownedSlots.has(s)) && check.slots.includes(item.slot),
    );
    if (idx >= 0) return { stage: 'essentials', priority: idx - urgencyBoost, archetypeNote };
  }

  // 2. Occasion coverage (Pass Nine): map the item onto the first UNSERVED
  //    occasion whose open requirement it genuinely fills — reasoned from
  //    the occasion-coverage engine, never from the item's occasion tags.
  const occasions = byId.get('occasions');
  if (occasions && occasions.done < occasions.total) {
    const coverage = assessOccasionCoverage(pieces);
    const gap = itemFillsOccasionGap(item, coverage);
    if (gap) {
      const occasionIndex = coverage.findIndex((o) => o.id === gap.occasion.id);
      return {
        stage: 'occasions',
        priority: occasionIndex * 10 - urgencyBoost,
        occasion: { id: gap.occasion.id, label: gap.occasion.label },
        archetypeNote,
      };
    }
  }

  // 3. Seasonal coverage — summer, winter, transitional (inferred per slot).
  const seasons = byId.get('seasons');
  if (seasons && seasons.done < seasons.total) {
    const seasonCount = (tags: string[]) =>
      pieces.filter((p) => (p.seasons || []).some((s) => tags.includes(s))).length;
    const itemSeasons = defaultSeasons(item.slot);
    const needSummer = seasonCount(['ss', 'year-round']) < 2;
    const needWinter = seasonCount(['aw', 'year-round']) < 2;
    const needTransitional = seasonCount(['year-round']) < 2;
    if (needSummer && itemSeasons.some((s) => s === 'ss' || s === 'year-round')) return { stage: 'seasons', priority: 0, archetypeNote };
    if (needWinter && itemSeasons.some((s) => s === 'aw' || s === 'year-round')) return { stage: 'seasons', priority: 1, archetypeNote };
    if (needTransitional && itemSeasons.includes('year-round')) return { stage: 'seasons', priority: 2, archetypeNote };
  }

  // 4. Accent pieces — colour or accessories with character.
  const accents = byId.get('accents');
  if (accents && accents.done < accents.total) {
    const isAccent =
      item.category === 'accessories' ||
      item.category === 'hats' ||
      item.colors.some((c) => ACCENT_COLORS.has(c.toLowerCase()));
    if (isAccent) return { stage: 'accents', priority: 0, archetypeNote };
  }

  // 5. Investment anchors — unowned centrepiece slots, in anchor order.
  const anchors = byId.get('anchors');
  if (anchors && anchors.done < anchors.total) {
    const idx = ANCHOR_SLOTS.findIndex((a) => a.id === item.slot && !ownedSlots.has(a.id));
    if (idx >= 0) return { stage: 'anchors', priority: idx, archetypeNote };
  }

  return null;
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

function MilestoneRow({ milestone }: { milestone: Milestone & { note?: string | null } }) {
  const [open, setOpen] = useState(false);
  const notStarted = milestone.done === 0;
  return (
    // Responsive row: BELOW 640px the row is a flex COLUMN in strict reading
    // order — title (+ chevron) → full-width progress bar → "X of Y" count →
    // rationale → Beau's variety note — every line wraps freely, nothing
    // clips at 375–430px. ≥640px keeps the reference grid 1.5fr 1fr 76px
    // 18px: name Cormorant 19px (rationale + note under it in the same
    // cell) · proportional bar · "3 / 6" Lora 13px tabular · › chevron.
    <div className={notStarted ? 'opacity-[.62]' : ''}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left flex flex-col gap-y-2.5 sm:grid sm:items-center sm:gap-x-[28px] sm:gap-y-0 sm:grid-cols-[1.5fr_1fr_76px_18px]"
        style={{ padding: '18px 4px' }}
        aria-expanded={open}
      >
        <span className="flex items-start gap-3 min-w-0 sm:block">
          <span className="flex-1 min-w-0">
            <span
              className={`block break-words ${typography.color.primary}`}
              style={{ fontFamily: 'var(--space-font-heading)', fontSize: '19px', fontWeight: 400, lineHeight: 1.2 }}
            >
              {milestone.label}
            </span>
            {/* ≥640px only — on mobile the rationale and note stack BELOW
                the bar and count instead (title → bar → count → rationale). */}
            {milestone.summary && (
              <span
                className="hidden sm:block mt-1 break-words text-[var(--color-neutral-600,#856c51)]"
                style={{ fontFamily: 'var(--space-font-family)', fontSize: '12px', lineHeight: 1.45 }}
              >
                {milestone.summary}
              </span>
            )}
            {milestone.note && (
              <span
                className="hidden sm:block mt-1.5 break-words text-[var(--color-neutral-800,#453325)]"
                style={{ fontFamily: 'var(--space-font-family)', fontSize: '12px', lineHeight: 1.5, paddingLeft: '10px', borderLeft: '2px solid var(--color-accent,#a8712c)' }}
              >
                {milestone.note}
              </span>
            )}
          </span>
          {/* Mobile-only chevron on the name line — the count gets its own
              stacked line under the bar so nothing truncates at 375px. */}
          <span
            className={`sm:hidden flex-shrink-0 pt-1 text-[var(--color-neutral-500,#a68e70)] transition-transform ${open ? 'rotate-90' : ''}`}
            style={{ fontFamily: 'var(--space-font-heading)', fontSize: '17px', lineHeight: 1 }}
            aria-hidden="true"
          >
            ›
          </span>
        </span>
        <span className="flex gap-[3px] w-full sm:w-auto" aria-hidden="true">
          {milestone.done > 0 && (
            <i className="block h-[2px]" style={{ flex: milestone.done, background: 'var(--color-accent,#a8712c)', borderRadius: 0 }} />
          )}
          {milestone.total - milestone.done > 0 && (
            <i className="block h-[2px]" style={{ flex: Math.max(1, milestone.total - milestone.done), background: 'var(--color-neutral-300,#dccdb2)', borderRadius: 0 }} />
          )}
        </span>
        {/* Count — its own stacked line on mobile (title → bar → count →
            rationale), the grid column ≥640px. */}
        <span
          className="sm:hidden tabular-nums text-[var(--color-neutral-700,#634e38)]"
          style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px' }}
        >
          {milestone.done} of {milestone.total}
        </span>
        {/* Mobile-only rationale + variety note — the LAST stacked lines,
            after the count, per the title → bar → count → rationale order. */}
        {milestone.summary && (
          <span
            className="sm:hidden break-words text-[var(--color-neutral-600,#856c51)]"
            style={{ fontFamily: 'var(--space-font-family)', fontSize: '12px', lineHeight: 1.45 }}
          >
            {milestone.summary}
          </span>
        )}
        {milestone.note && (
          <span
            className="sm:hidden break-words text-[var(--color-neutral-800,#453325)]"
            style={{ fontFamily: 'var(--space-font-family)', fontSize: '12px', lineHeight: 1.5, paddingLeft: '10px', borderLeft: '2px solid var(--color-accent,#a8712c)' }}
          >
            {milestone.note}
          </span>
        )}
        <span
          className="hidden sm:block text-right tabular-nums whitespace-nowrap text-[var(--color-neutral-700,#634e38)]"
          style={{ fontFamily: 'var(--space-font-family)', fontSize: '13px' }}
        >
          {milestone.done} / {milestone.total}
        </span>
        <span
          className={`hidden sm:block justify-self-end text-[var(--color-neutral-500,#a68e70)] transition-transform ${open ? 'rotate-90' : ''}`}
          style={{ fontFamily: 'var(--space-font-heading)', fontSize: '17px', lineHeight: 1 }}
          aria-hidden="true"
        >
          ›
        </span>
      </button>
      {open && (
        <div className="pb-[18px] -mt-1 space-y-1" style={{ paddingLeft: '4px', paddingRight: '8px' }}>
          <p className={`${typography.size.xs} ${typography.color.muted} leading-snug mb-1.5`}>{milestone.meaning}</p>
          {milestone.details.map((d) => (
            <p key={d.label} className={`${typography.size.xs} flex items-start gap-1.5 leading-snug break-words ${d.met ? typography.color.secondary : typography.color.muted}`}>
              {/* Solid dot markers — accent when met, neutral when open (no icon glyphs). */}
              <span
                className="w-1.5 h-1.5 mt-1 rounded-full flex-shrink-0"
                style={{ background: d.met ? 'var(--color-accent,#a8712c)' : 'var(--color-neutral-300,#dccdb2)' }}
                aria-hidden="true"
              />
              <span>{d.label}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// React.memo (Pass Forty-Seven re-render audit): the milestone maths walks
// every piece several times, and the Wardrobe screen re-renders on photo-
// sweep ticks and search keystrokes — the pieces array reference is stable
// between data changes, so memoising skips all of that recomputation.
export const MilestoneJourney = memo(function MilestoneJourney({
  pieces,
  archetypes = [],
  materials = {},
}: {
  pieces: WardrobePiece[];
  archetypes?: string[];
  materials?: Record<number, string>;
}) {
  // Variety-based tier milestones: every target comes from a working
  // wardrobe model — pieces across different FUNCTIONS, never raw counts —
  // and is JUSTIFIED by the selected archetypes (British Country calls for
  // more knitwear than Continental; the rationale under each row says why).
  const tiers = useMemo(() => computeTierMilestones(pieces, materials, archetypes), [pieces, materials, archetypes]);
  // Per-archetype essential tracks — separate milestone tracks per selected
  // style direction; a bridging piece advances several at once.
  const summary = useMemo(() => computeMilestones(pieces, archetypes), [pieces, archetypes]);
  const percent = tierMilestonePercent(tiers);
  const empty = pieces.length === 0;

  const completed = tiers.filter((t) => t.complete);
  const nextOpen = tiers.find((t) => !t.complete);
  const progressNote = !nextOpen
    ? 'Every target met — what follows is refinement.'
    : empty
      ? 'Log what you own above and the targets fill in.'
      : completed.length > 0
        ? `${completed.map((t) => t.label).join(' and ')} covered. ${nextOpen.label} next.`
        : `${nextOpen.label} first — the rest follows.`;
  const filledTicks = Math.max(0, Math.min(5, Math.round(percent / 20)));

  // Tier → row shape for MilestoneRow: the earned-target rationale rides as
  // the always-visible summary line; Beau's variety read (duplicates that
  // won't advance the milestone, the sub-type to add next) rides as the
  // accent-ruled note.
  //
  // The ROWS READ in the app's canonical menswear order (category-order.ts),
  // like every other category list in the app. The tiers themselves stay in
  // Beau's foundation-GATE order (bottoms before tops before shoes…) — that
  // is recommendation priority, not a display sequence, and the “X next”
  // note above still follows it.
  const rows = sortByCategoryOrder(tiers, (t) => t.id).map((t) => ({
    id: t.id as string,
    label: t.label,
    meaning: 'The target counts distinct functional roles, not pieces — repeats of the same sub-type fill one role only.',
    done: t.progress,
    total: t.target,
    summary: t.rationale,
    note: t.varietyNote,
    details: [
      ...t.details,
      ...(t.unclassified > 0
        ? [{
            label: `${t.unclassified} piece${t.unclassified === 1 ? '' : 's'} Beau couldn't type-read — counted toward the number, but only real variety completes the milestone.`,
            met: false,
          }]
        : []),
    ],
  }));

  // One row per selected style direction — SEPARATE tracks, never blended.
  const showTracks = (archetypes || []).length > 0;
  const trackRows = showTracks
    ? summary.families.map((f) => ({
        id: `track-${f.id}`,
        label: `${f.label} essentials`,
        meaning: 'The essential pieces this style direction is built on. A piece that genuinely serves two of your directions advances both tracks at once.',
        done: f.done,
        total: f.total,
        summary: f.summary,
        note: null as string | null,
        details: f.details,
      }))
    : [];
  const bridgingNote = showTracks && summary.sharedGaps.length > 0
    ? `Open in every direction you've chosen: ${listJoin(summary.sharedGaps.map(withArticle))} — a bridging piece there advances all your tracks at once, so start there.`
    : null;
  const doubleDutyNote = showTracks && summary.doubleDuty.length > 0
    ? `${summary.doubleDuty.length === 1 ? 'One piece pulls' : `${summary.doubleDuty.length} pieces pull`} double duty across your directions — ${listJoin(summary.doubleDuty.slice(0, 3).map((d) => d.piece.name))}${summary.doubleDuty.length > 3 ? ' among them' : ''}.`
    : null;

  return (
    <div>
      {/* Section heading (HTML reference) — two columns over the 1px ink
          rule: the heading + explainer left, the PROGRESS block right
          (kicker + 30px figure over its own ink rule, five ticks, a note). */}
      <div
        className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_300px] items-end pb-3 border-b border-[var(--color-text,#3b2b1d)] gap-y-7 sm:gap-x-[56px]"
      >
        <div>
          <h3 className={`hab-section-head ${typography.color.primary}`} style={{ marginBottom: '8px' }}>Wardrobe milestones</h3>
          <p
            className={typography.color.primary}
            style={{ fontFamily: 'var(--space-font-family)', fontSize: '15px', lineHeight: 1.6, maxWidth: '62ch' }}
          >
            Every target comes from a working wardrobe model and the style directions you chose — pieces across
            different functions, never a raw count. Two wax jackets fill one role, so a milestone only advances
            when a new piece genuinely adds variety: a different sub-type, formality or occasion.
          </p>
        </div>
        <div className="w-full">
          <div className="flex items-baseline justify-between gap-3 pb-2 border-b border-[var(--color-text,#3b2b1d)]">
            <span
              className="uppercase text-[var(--color-neutral-700,#634e38)]"
              style={{ fontFamily: 'var(--space-font-heading)', fontSize: '12px', letterSpacing: '0.14em' }}
            >
              Progress
            </span>
            <span
              className={`tabular-nums ${typography.color.primary}`}
              style={{ fontFamily: 'var(--space-font-heading)', fontWeight: 500, fontSize: '30px', lineHeight: 1 }}
            >
              {percent}
              <span style={{ fontSize: '17px', color: 'var(--color-neutral-600,#856c51)' }}>%</span>
            </span>
          </div>
          <span className="flex gap-[3px] mt-3.5" aria-hidden="true">
            {Array.from({ length: 5 }, (_, i) => (
              <i
                key={i}
                className="block flex-1 h-[3px]"
                style={{ background: i < filledTicks ? 'var(--color-accent,#a8712c)' : 'var(--color-neutral-300,#dccdb2)', borderRadius: 0 }}
              />
            ))}
          </span>
          <p className="mt-2.5 text-[var(--color-neutral-700,#634e38)]" style={{ fontFamily: 'var(--space-font-family)', fontSize: '12px' }}>
            {progressNote}
          </p>
        </div>
      </div>

      {empty && (
        <p className={`${typography.size.xs} ${typography.color.secondary} mt-2 leading-relaxed`}>
          Nothing logged yet, so everything reads 0 — that’s the starting line, not a problem. Tap a category to see
          exactly which slots it covers.
        </p>
      )}

      {/* The seven wardrobe tiers in strict foundation order — bottoms →
          tops → shoes → outerwear → knitwear → formalwear → accessories —
          each with its archetype-justified target and the rationale in
          small text beneath. */}
      <div className="divide-y divide-[var(--color-divider,rgba(59,43,29,0.18))] border-b border-[var(--color-divider,rgba(59,43,29,0.18))]">
        {rows.map((m) => (
          <MilestoneRow key={m.id} milestone={m} />
        ))}
      </div>

      {/* Per-archetype essential tracks — one SEPARATE row per selected
          style direction (Step 3 of the decision tree: tracks never blend,
          bridging pieces advance several at once). */}
      {trackRows.length > 0 && (
        <div className="mt-10">
          <div className="pb-3 border-b border-[var(--color-text,#3b2b1d)]">
            <h3 className={`hab-section-head ${typography.color.primary}`} style={{ marginBottom: '8px' }}>Your style directions</h3>
            <p
              className={typography.color.primary}
              style={{ fontFamily: 'var(--space-font-family)', fontSize: '15px', lineHeight: 1.6, maxWidth: '62ch' }}
            >
              Each direction you’ve chosen keeps its own essentials track — they are never blended into one number.
              A piece that genuinely serves two directions advances both tracks at once; those bridging pieces are
              the smartest buys.
            </p>
          </div>
          <div className="divide-y divide-[var(--color-divider,rgba(59,43,29,0.18))] border-b border-[var(--color-divider,rgba(59,43,29,0.18))]">
            {trackRows.map((m) => (
              <MilestoneRow key={m.id} milestone={m} />
            ))}
          </div>
          {(bridgingNote || doubleDutyNote) && (
            <p
              className="mt-3 break-words text-[var(--color-neutral-800,#453325)]"
              style={{ fontFamily: 'var(--space-font-family)', fontSize: '12px', lineHeight: 1.5, paddingLeft: '10px', borderLeft: '2px solid var(--color-accent,#a8712c)' }}
            >
              {[bridgingNote, doubleDutyNote].filter(Boolean).join(' ')}
            </p>
          )}
        </div>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Compact milestone strip — the same slot coverage model as the detailed
// panel. Thresholds are meaningful coverage points, never item counts.
// ---------------------------------------------------------------------------

const STRIP_STAGES = ['Starting', '25% covered', '50% covered', '75% covered', 'Rounded'];
const STRIP_THRESHOLDS = [0, 25, 50, 75, 100];

export function MilestoneStrip({ pieces, archetypes = [] }: { pieces: WardrobePiece[]; archetypes?: string[] }) {
  const { reachedIndex, hint } = useMemo(() => {
    const percent = computeMilestones(pieces, archetypes).percent;
    let idx = 0;
    for (let i = 1; i < STRIP_THRESHOLDS.length; i += 1) {
      if (percent >= STRIP_THRESHOLDS[i]) idx = i;
    }
    const next = STRIP_THRESHOLDS[Math.min(STRIP_THRESHOLDS.length - 1, idx + 1)];
    const nextHint = percent >= 100
      ? 'Rounded — every essential slot for your direction is filled.'
      : `Next: fill a distinct missing slot to reach ${next}% coverage.`;
    return { reachedIndex: idx, hint: nextHint };
  }, [pieces, archetypes]);

  return (
    <div className={`${tw.card.default} rounded-2xl px-4 py-3`}>
      <div className="flex items-start" role="list" aria-label="Wardrobe milestone progress">
        {STRIP_STAGES.map((stage, i) => {
          const done = i <= reachedIndex;
          const isCurrent = i === reachedIndex || (reachedIndex < 0 && i === 0);
          return (
            <div key={stage} className="flex-1 min-w-0 flex flex-col items-center relative" role="listitem">
              {/* Connector segments — drawn behind the dots */}
              {i > 0 && (
                <span
                  aria-hidden="true"
                  className={`absolute top-[9px] right-1/2 w-full h-0.5 ${i <= reachedIndex ? 'bg-[var(--space-brand-primary)]' : 'bg-[var(--space-border-default)]'}`}
                />
              )}
              <span
                className={`relative z-10 w-[18px] h-[18px] rounded-full flex items-center justify-center flex-shrink-0 ${
                  done
                    ? 'bg-[var(--space-brand-primary)]'
                    : 'bg-[var(--space-surface-card)] border-2 border-[var(--space-border-strong)]'
                } ${isCurrent ? 'ring-2 ring-[var(--space-brand-primary-200)]' : ''}`}
              >
                {done && <Check className="w-2.5 h-2.5 text-[var(--space-text-on-primary)]" />}
              </span>
              <span
                className={`mt-1 text-center leading-tight px-0.5 ${
                  isCurrent && done ? `${typography.weight.semibold} ${typography.color.brand}` : done ? typography.color.secondary : typography.color.muted
                }`}
                style={{ fontSize: '9px' }}
              >
                {stage}
              </span>
            </div>
          );
        })}
      </div>
      <p className={`${typography.size.xs} ${typography.color.secondary} mt-2 text-center`} style={{ fontSize: '10px' }}>
        {hint}
      </p>
    </div>
  );
}
